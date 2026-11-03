from io import BytesIO
from datetime import date
from collections import defaultdict, Counter
from urllib.parse import urlencode
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import render
from django.db.models import Q
from django.urls import reverse
from django.utils.translation import gettext as _, ngettext
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from ..models import SeguimientoOT, SeguimientoManual, RegistroEjecucion, Area

# Atraso (días) del atajo "Más de 6 meses" y del chip de celular "con más de 6 meses".
ATRASO_ALTO  = 180

# Rangos de antigüedad: límite superior (días de atraso) de cada rango; después
# del último va "Más de 1 mes". Los usan la tarjeta y la gráfica Antigüedad y el
# color del atraso en la tabla de escritorio y en las tarjetas de celular.
RANGOS_ANTIGUEDAD = [7, 14, 21, 31]


# Color fijo de cada área (en el orden de Area: alfabético), para que se reconozca
# igual en toda la app. Si hay más áreas que colores, se repiten.
COLORES_AREA = ['#3D5BD9', '#2E8B57', '#D9822B', '#6B3FA0', '#0E8A8A', '#B8336A']


def _semana(num, anio):
    """Semana de una orden: etiqueta 'S1/2026' ('W1/2026' en inglés) y clave ordenable '2026-01'."""
    return {'semana': _('S%(num)s/%(anio)s') % {'num': num, 'anio': anio}, 'semana_key': f"{anio}-{num:02d}"}


def _semana_de_fecha(fecha):
    """Semana ISO de una fecha — la misma numeración que el Plan de mantenimiento."""
    iso = fecha.isocalendar()
    return _semana(iso[1], iso[0])


def _url_plan(registro):
    """Lleva a la OT en el Plan de mantenimiento: su área, semana y código, y
    abre directo su detalle (celular) o su modal (escritorio) con ?abrir=."""
    plan = registro.plan
    return reverse('mto:lista_plan') + '?' + urlencode({
        'area':   plan.area_id,
        'semana': registro.semana_num,
        'anio':   registro.anio,
        'q':      plan.codigo,
        'estado': 'todas',
        'abrir':  plan.pk,
    })


def _url_seguimiento(seg):
    """Lleva al correctivo en Seguimientos correctivos: filtra por su folio
    y abre su formulario de edición con ?abrir=."""
    params = {'q': seg.no_orden, 'abrir': seg.id}
    if seg.area_id:
        params['area'] = seg.area_id
    return reverse('mto:lista_seguimientos') + '?' + urlencode(params)


def _datos_backlog(request, area_id=None, semana_filtro=None):
    """Órdenes vencidas por responsable, con los filtros de Área y Semana del
    GET ya aplicados (o los que se pasen). La usan la página y la exportación."""
    hoy     = date.today()
    if area_id is None:
        area_id = request.GET.get('area', '')

    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    areas_list = list(Area.objects.filter(activa=True))

    semana_actual = hoy.isocalendar()[1]
    anio_actual   = hoy.year
    lunes_semana  = date.fromisocalendar(anio_actual, semana_actual, 1)

    areas_ids = None
    if not es_admin:
        try:
            areas_ids = list(request.user.acceso_mto.areas.values_list('id', flat=True))
        except Exception:
            areas_ids = []

    # El filtro Área solo ofrece las áreas que el usuario puede ver (las mismas
    # que limitan las órdenes), y un ?area= de otra área se ignora.
    if not es_admin:
        areas_list = [a for a in areas_list if a.id in areas_ids]
        if area_id and area_id not in {str(a.id) for a in areas_list}:
            area_id = ''

    qs_ot = SeguimientoOT.objects.select_related(
        'registro__plan__area'
    ).filter(
        estatus__in=['pendiente', 'en_proceso']
    ).filter(
        Q(fecha_compromiso__lte=hoy) |
        Q(registro__semana_inicio__lte=lunes_semana)
    )

    qs_registros = RegistroEjecucion.objects.select_related(
        'plan__area', 'responsable'
    ).filter(
        semana_inicio__lte=lunes_semana,
    ).exclude(
        # Una semana cancelada no queda pendiente (igual que en el dashboard).
        estado__in=['completada', 'cancelada']
    )

    if not es_admin:
        if areas_ids:
            qs_registros = qs_registros.filter(plan__area__id__in=areas_ids)
            qs_ot        = qs_ot.filter(registro__plan__area__id__in=areas_ids)
        else:
            qs_registros = qs_registros.none()
            qs_ot        = qs_ot.none()

    if area_id:
        qs_registros = qs_registros.filter(plan__area__id=area_id)
        qs_ot        = qs_ot.filter(registro__plan__area__id=area_id)

    qs_manual = SeguimientoManual.objects.filter(
        fecha_compromiso__lte=hoy,
        estatus__in=['pendiente', 'en_proceso']
    )
    if area_id:
        qs_manual = qs_manual.filter(area_id=area_id)
    if not es_admin:
        if areas_ids:
            qs_manual = qs_manual.filter(area__id__in=areas_ids)
        else:
            qs_manual = qs_manual.none()

    personas = defaultdict(lambda: {'ot': [], 'manual': []})

    for seg in qs_ot:
        r      = seg.registro
        semana = r.semana_num
        mes    = f"{r.semana_inicio.month:02d}"
        aa     = str(r.semana_inicio.year)[2:]
        seg.no_orden = f"OT{seg.pk:07d}"

        nombre = seg.responsable or 'Sin asignar'
        dias = (hoy - seg.fecha_compromiso).days if seg.fecha_compromiso else (hoy - seg.registro.semana_inicio).days
        personas[nombre]['ot'].append({
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'fecha_compromiso': seg.fecha_compromiso or r.semana_inicio,
            'dias_atraso':      dias,
            'estatus':          seg.estatus,
            'tipo':             'ot',
            'codigo_plan':      r.plan.codigo,
            'url_plan':         _url_plan(seg.registro),
            'area_id':          r.plan.area_id,
            # Semana de la fecha de compromiso; sin compromiso, la de su registro.
            **(_semana_de_fecha(seg.fecha_compromiso) if seg.fecha_compromiso
               else _semana(r.semana_num, r.anio)),
        })

    for seg in qs_manual:
        nombre = seg.responsable or 'Sin asignar'
        dias   = (hoy - seg.fecha_compromiso).days
        personas[nombre]['manual'].append({
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'fecha_compromiso': seg.fecha_compromiso,
            'dias_atraso':      dias,
            'estatus':          seg.estatus,
            'tipo':             'manual',
            'url_plan':         _url_seguimiento(seg),   # los correctivos abren su formulario en Seguimientos
            'area_id':          seg.area_id,
            **_semana_de_fecha(seg.fecha_compromiso),
        })

    contadores_reg = {}
    for reg in qs_registros:
        semana = reg.semana_num
        mes    = f"{reg.semana_inicio.month:02d}"
        aa     = str(reg.semana_inicio.year)[2:]
        key    = f"{semana:02d}{mes}{aa}"
        contadores_reg[key] = contadores_reg.get(key, 100) + 1
        no_orden = f"{semana:02d}{mes}{aa}{contadores_reg[key]}"

        nombre = ''
        if reg.responsable:
            nombre = reg.nombre_responsable().strip()
        nombre = nombre or 'Sin asignar'

        dias = (hoy - reg.semana_inicio).days

        personas[nombre]['ot'].append({
            'id':               reg.id,
            'no_orden':         no_orden,
            'problema':         reg.plan.actividad,
            'fecha_compromiso': reg.semana_inicio,
            'dias_atraso':      dias,
            'estatus':          reg.estado,
            'tipo':             'ot',
            'codigo_plan':      reg.plan.codigo,
            'url_plan':         _url_plan(reg),
            'area_id':          reg.plan.area_id,
            **_semana(reg.semana_num, reg.anio),
        })

    # ── Filtro por semana ──
    # Las opciones salen de todas las órdenes (antes de filtrar), de la más
    # reciente a la más antigua, con cuántas órdenes tiene cada una.
    conteo_semanas = defaultdict(int)
    for data in personas.values():
        for o in data['ot'] + data['manual']:
            conteo_semanas[o['semana_key']] += 1
    semanas_disponibles = [
        {'key': k, 'label': _semana(int(k[5:]), int(k[:4]))['semana'], 'n': n}
        for k, n in sorted(conteo_semanas.items(), reverse=True)
    ]
    # Valor: 'AAAA-SS' (semana ISO de la fecha de compromiso) o 'mas6' (atajo
    # "Más de 6 meses": atraso mayor a ATRASO_ALTO, sin importar la semana).
    filtro_semana = (request.GET.get('semana', '') if semana_filtro is None else semana_filtro).strip()
    if filtro_semana == 'mas6':
        entra = lambda o: (o['dias_atraso'] or 0) > ATRASO_ALTO
    else:
        entra = lambda o: o['semana_key'] == filtro_semana
    if filtro_semana:
        for data in personas.values():
            data['ot']     = [o for o in data['ot']     if entra(o)]
            data['manual'] = [o for o in data['manual'] if entra(o)]
    if filtro_semana == 'mas6':
        filtro_semana_label = _('Más de 6 meses')
    else:
        filtro_semana_label = next((s['label'] for s in semanas_disponibles if s['key'] == filtro_semana), '')

    personas_lista = []
    for nombre, data in personas.items():
        total  = len(data['ot']) + len(data['manual'])
        if total == 0:
            continue   # se quedó sin órdenes con el filtro de semana
        pct_ot = round(len(data['ot']) / total * 100) if total > 0 else 0
        pct_m  = 100 - pct_ot
        # Celular: todas las órdenes juntas, de la más atrasada a la menos.
        ordenes = sorted(data['ot'] + data['manual'], key=lambda o: o['dias_atraso'] or 0, reverse=True)
        for o in ordenes:
            o['responsable'] = nombre
        personas_lista.append({
            'nombre':   nombre,
            'ot':       data['ot'],
            'manual':   data['manual'],
            'total':    total,
            'pct_ot':   pct_ot,
            'pct_m':    pct_m,
            'ordenes':  ordenes,
            'max_dias': ordenes[0]['dias_atraso'] if ordenes else 0,
        })

    # Más vencidas primero; en empate, el mayor atraso.
    personas_lista.sort(key=lambda x: (x['total'], x['max_dias'] or 0), reverse=True)

    area_nombre = next((a.nombre for a in areas_list if str(a.id) == str(area_id)), None) if area_id else None

    return {
        'hoy':                 hoy,
        'areas':               areas_list,
        'area_id':             area_id,
        'area_nombre':         area_nombre,
        'personas':            personas_lista,
        'semanas_disponibles': semanas_disponibles,
        'filtro_semana':       filtro_semana,
        'filtro_semana_label': filtro_semana_label,
    }


def _rango(dias):
    """Índice (0–4) del rango de antigüedad de un atraso en días."""
    return next((i for i, tope in enumerate(RANGOS_ANTIGUEDAD) if dias <= tope), len(RANGOS_ANTIGUEDAD))


def _antiguedad(dias):
    """Cuántas órdenes hay en cada rango: 1 semana, 2 semanas, 3 semanas, 1 mes, más de 1 mes."""
    nombres = [_('1 semana'), _('2 semanas'), _('3 semanas'), _('1 mes'), _('Más de 1 mes')]
    cortos  = [_('1 sem'), _('2 sem'), _('3 sem'), _('1 mes'), _('>1 mes')]
    conteo  = [0] * len(nombres)
    for d in dias:
        conteo[_rango(d)] += 1
    return [{'clave': f'r{i + 1}', 'label': nombres[i], 'corto': cortos[i], 'n': conteo[i]}
            for i in range(len(nombres))]


def _vencidas(n):
    return ngettext('%(n)s vencida', '%(n)s vencidas', n) % {'n': n} if n else _('Sin vencidas')


def _areas_filtro(request, datos):
    """Opciones del selector de área: color fijo y cuántas vencidas tiene cada
    área con los demás filtros (Semana) aplicados, sin contar el de área."""
    todas = datos if not datos['area_id'] else _datos_backlog(request, area_id='')
    por_area = Counter(o['area_id'] for p in todas['personas'] for o in p['ordenes'])
    return {
        'opciones': [{
            'value': str(a.id),
            'label': a.nombre,
            'color': COLORES_AREA[i % len(COLORES_AREA)],
            'meta':  _vencidas(por_area.get(a.id, 0)),
        } for i, a in enumerate(datos['areas'])],
        'todas_meta': _vencidas(sum(por_area.values())),
    }


def _semanas_filtro(request, datos):
    """Datos del selector de semana: vencidas por semana de compromiso (y por
    tipo, para que el selector siga al filtro Tipo), con el filtro de Área y
    sin el de Semana. Semanas ISO, como el Plan de mantenimiento."""
    todas = datos if not datos['filtro_semana'] else _datos_backlog(request, semana_filtro='')
    conteos = defaultdict(lambda: {'ot': 0, 'manual': 0})
    mas6    = {'ot': 0, 'manual': 0}
    total   = {'ot': 0, 'manual': 0}
    for p in todas['personas']:
        for o in p['ordenes']:
            conteos[o['semana_key']][o['tipo']] += 1
            total[o['tipo']] += 1
            if (o['dias_atraso'] or 0) > ATRASO_ALTO:
                mas6[o['tipo']] += 1
    anio, num, _dia = datos['hoy'].isocalendar()
    return {
        'valor':   datos['filtro_semana'],
        'actual':  f"{anio}-{num:02d}",
        'conteos': dict(conteos),
        'mas6':    mas6,
        'total':   total,
    }


@login_required
def backlog_seguimientos(request):
    datos          = _datos_backlog(request)
    personas_lista = datos['personas']

    todas_ordenes = [o for p in personas_lista for o in p['ordenes']]
    dias          = [o['dias_atraso'] or 0 for o in todas_ordenes]
    mas_6_meses   = sum(1 for d in dias if d > ATRASO_ALTO)
    mas_antigua   = max(dias, default=0)

    total_ots      = sum(len(p['ot'])     for p in personas_lista)
    total_manuales = sum(len(p['manual']) for p in personas_lista)
    total_general  = total_ots + total_manuales

    pct_ot_general = round(total_ots / total_general * 100) if total_general > 0 else 0
    pct_m_general  = 100 - pct_ot_general

    # Escritorio: antigüedad en 5 rangos y las órdenes en JSON para la gráfica,
    # "Carga por responsable" y la tabla (las arma backlog_escritorio.js).
    antiguedad = _antiguedad(dias)

    ordenes_json = [{
        'folio':  o['no_orden'] or '',
        'resp':   o['responsable'],
        'tipo':   o['tipo'],
        'desc':   o['problema'] or '',
        'plan':   o.get('codigo_plan', ''),
        'semana': o['semana'],
        'skey':   o['semana_key'],
        'vencia': o['fecha_compromiso'].isoformat() if o['fecha_compromiso'] else '',
        'dias':   o['dias_atraso'] or 0,
        'url':    o['url_plan'],
    } for o in todas_ordenes]

    return render(request, 'mto_app/seguimientos/backlog_seguimientos.html', {
        **datos,
        'total_ots':           total_ots,
        'total_manuales':      total_manuales,
        'total_general':       total_general,
        'pct_ot_general':      pct_ot_general,
        'pct_m_general':       pct_m_general,
        'rangos_antiguedad':   RANGOS_ANTIGUEDAD,
        # Vista de celular
        'mas_6_meses':         mas_6_meses,
        'mas_antigua':         mas_antigua,
        # Vista de escritorio
        'antiguedad':          antiguedad,
        'ordenes_json':        ordenes_json,
        'areas_filtro':        _areas_filtro(request, datos),
        'semanas_filtro':      _semanas_filtro(request, datos),

    })


@login_required
def backlog_exportar(request):
    """Excel con las órdenes que muestra la tabla de escritorio: Área y Semana
    (como la página) más Tipo, Responsable y búsqueda."""
    datos = _datos_backlog(request)
    tipo  = request.GET.get('tipo', '')
    resp  = request.GET.get('resp', '')
    q     = request.GET.get('q', '').strip().lower()

    ordenes = [o for p in datos['personas'] for o in p['ordenes']]
    if tipo in ('ot', 'manual'):
        ordenes = [o for o in ordenes if o['tipo'] == tipo]
    if resp:
        ordenes = [o for o in ordenes if o['responsable'] == resp]
    if q:
        ordenes = [o for o in ordenes
                   if q in (o['no_orden'] or '').lower() or q in (o['problema'] or '').lower()
                   or q in (o.get('codigo_plan') or '').lower()]
    ordenes.sort(key=lambda o: o['dias_atraso'] or 0, reverse=True)

    wb = Workbook()
    ws = wb.active
    ws.title = "Backlog"
    ws.append([_("Folio"), _("Responsable"), _("Tipo"), _("Descripción"),
               _("Semana"), _("Vencía"), _("Atraso (días)")])
    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        cell.alignment = Alignment(horizontal='center', vertical='center')
    for o in ordenes:
        ws.append([
            o['no_orden'] or '',
            o['responsable'],
            _("OT") if o['tipo'] == 'ot' else _("Correctivo"),
            o['problema'] or '',
            o['semana'],
            o['fecha_compromiso'],
            o['dias_atraso'] or 0,
        ])
        ws.cell(row=ws.max_row, column=6).number_format = 'DD/MM/YYYY'
    for i, ancho in enumerate([14, 30, 12, 60, 11, 12, 14], start=1):
        ws.column_dimensions[get_column_letter(i)].width = ancho

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    nombre = (f"Backlog_{datos['area_nombre'].replace(' ', '_')}.xlsx" if datos['area_nombre']
              else "Backlog_seguimientos.xlsx")
    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = f'attachment; filename="{nombre}"'
    return response
