"""
Backlog: órdenes vencidas por responsable (OTs del plan, correctivos ligados a una OT y correctivos manuales),
con filtros de Área y Semana, la página de escritorio y celular, y su exportación a Excel.
Diagrama: docs/flujos/02-seguimientos-bitacora.md
"""
from io import BytesIO
from datetime import date, timedelta
from collections import defaultdict, Counter
from urllib.parse import urlencode
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.shortcuts import render, redirect
from django.db.models import Q
from django.urls import reverse
from django.utils.translation import gettext as _, ngettext
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from login_app.permisos import puede_mto
from ..models import SeguimientoOT, SeguimientoManual, RegistroEjecucion, PlanMantenimiento
from .utils import numeros_ot_semana, lunes_de_semana, INTERVALO, areas_visibles_mto, areas_ids_restringidas
from menu_app.avisos import aviso

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


def _url_plan(plan, semana_num, anio):
    """Lleva a la OT en el Plan de mantenimiento: su área, semana y código, y
    abre directo su detalle (celular) o su modal (escritorio) con ?abrir=."""
    return reverse('mto:lista_plan') + '?' + urlencode({
        'area':   plan.area_id,
        'semana': semana_num,
        'anio':   anio,
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


def _ordenes_backlog(areas_ids, ve_todas):
    """Todas las órdenes vencidas de esas áreas, sin los filtros de Área ni Semana (los aplica _datos_backlog en
    memoria, así se calcula una sola vez). Vencida = de una semana que ya terminó o con compromiso ya pasado:
    - OTs del plan (solo tareas activas): con registro sin completar ni cancelar, y también las semanas del año
      actual que nunca tuvieron registro (mismo criterio que las "vencidas" del Dashboard);
    - correctivos ligados a una OT (Pendiente / En proceso): compromiso pasado, o sin compromiso y de una semana
      ya terminada;
    - correctivos manuales (Pendiente / En proceso) con compromiso pasado. Los que no tienen área solo los ve
      quien ve todas las áreas (`ve_todas`)."""
    hoy          = date.today()
    lunes_actual = hoy - timedelta(days=hoy.weekday())        # funciona cualquier día, también en el cambio de año
    inicio_anio  = lunes_de_semana(hoy.isocalendar()[0], 1)   # lunes de la S1 del año (puede caer en diciembre)
    sin_asignar  = _('Sin asignar')
    ordenes = []

    # ── Correctivos ligados a una OT ──
    for seg in (SeguimientoOT.objects.select_related('registro__plan__area')
                .filter(estatus__in=['pendiente', 'en_proceso'], registro__plan__area_id__in=areas_ids)
                .filter(Q(fecha_compromiso__lt=hoy) | # vencido = la fecha compromiso ya pasó (igual que Seguimientos)
                        Q(fecha_compromiso__isnull=True, registro__semana_inicio__lt=lunes_actual))):
        r = seg.registro
        vence = seg.fecha_compromiso or r.semana_inicio
        ordenes.append({
            'no_orden':         f"OT{seg.pk:07d}",
            'problema':         seg.problema,
            'fecha_compromiso': vence,
            'dias_atraso':      (hoy - vence).days,
            'tipo':             'ot',
            'codigo_plan':      r.plan.codigo,
            'url_plan':         _url_plan(r.plan, r.semana_num, r.anio),
            'area_id':          r.plan.area_id,
            'responsable':      seg.responsable or sin_asignar,
            # Semana de la fecha de compromiso; sin compromiso, la de su registro.
            **(_semana_de_fecha(seg.fecha_compromiso) if seg.fecha_compromiso else _semana(r.semana_num, r.anio)),
        })

    # ── Correctivos manuales ──
    del_area = Q(area_id__in=areas_ids) | Q(area__isnull=True) if ve_todas else Q(area_id__in=areas_ids)
    for seg in SeguimientoManual.objects.filter(del_area, fecha_compromiso__lt=hoy, estatus__in=['pendiente', 'en_proceso']):
        ordenes.append({
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'fecha_compromiso': seg.fecha_compromiso,
            'dias_atraso':      (hoy - seg.fecha_compromiso).days,
            'tipo':             'manual',
            'url_plan':         _url_seguimiento(seg),   # los correctivos abren su formulario en Seguimientos
            'area_id':          seg.area_id,
            'responsable':      seg.responsable or sin_asignar,
            **_semana_de_fecha(seg.fecha_compromiso),
        })

    # ── OTs del plan ──
    # No. de OT igual que el Plan y el Excel de la semana: posición del plan entre todos los planes activos de su
    # área que tocan esa semana. Los planes se traen en una sola consulta y se numeran en memoria por área y semana.
    planes = list(PlanMantenimiento.objects.select_related('area').filter(activo=True, area_id__in=areas_ids))
    planes_por_area = defaultdict(list)
    for p in planes:
        planes_por_area[p.area_id].append(p)
    numeros = {}   # (área, lunes) → {plan_id: No. de OT}

    def no_ot(plan, lunes):
        clave = (plan.area_id, lunes)
        if clave not in numeros:
            numeros[clave] = numeros_ot_semana(planes_por_area[plan.area_id], lunes)
        return numeros[clave].get(plan.id, '—')   # '—' = la semana ya no calza con la frecuencia

    def ot_del_plan(plan, lunes, semana_num, anio, responsable):
        return {
            'no_orden':         no_ot(plan, lunes),
            'problema':         plan.actividad,
            'fecha_compromiso': lunes,
            'dias_atraso':      (hoy - lunes).days,
            'tipo':             'ot',
            'codigo_plan':      plan.codigo,
            'url_plan':         _url_plan(plan, semana_num, anio),
            'area_id':          plan.area_id,
            'responsable':      responsable or sin_asignar,
            **_semana(semana_num, anio),
        }

    # Con registro sin completar ni cancelar (una semana cancelada no queda pendiente, igual que en el Dashboard)
    for reg in (RegistroEjecucion.objects.select_related('plan__area', 'responsable')
                .filter(plan__in=planes, semana_inicio__lt=lunes_actual)
                .exclude(estado__in=['completada', 'cancelada'])):
        nombre = reg.nombre_responsable().strip() if reg.responsable_id else ''
        ordenes.append(ot_del_plan(reg.plan, reg.semana_inicio, reg.semana_num, reg.anio, nombre))

    # Semanas del año que tocaban y nunca tuvieron registro (nadie las asignó ni las llenó)
    con_registro = set(RegistroEjecucion.objects.filter(
        plan__in=planes, semana_inicio__gte=inicio_anio, semana_inicio__lt=lunes_actual,
    ).values_list('plan_id', 'semana_inicio'))
    for plan in planes:
        if not plan.semana_inicio or not plan.anio_inicio:
            continue
        try:
            cursor = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
        except ValueError:
            continue
        paso = timedelta(weeks=INTERVALO.get(plan.frecuencia, 1))
        if cursor < inicio_anio:   # salta directo a la primera semana del año que calza con la frecuencia
            cursor += paso * -(-(inicio_anio - cursor).days // paso.days)
        while cursor < lunes_actual:
            if (plan.id, cursor) not in con_registro:
                anio_iso, semana_iso, _dia = cursor.isocalendar()
                ordenes.append(ot_del_plan(plan, cursor, semana_iso, anio_iso, ''))
            cursor += paso
    return ordenes


def _agrupar(ordenes):
    """Agrupa las órdenes por responsable: más vencidas primero; en empate, el mayor atraso."""
    por_persona = defaultdict(list)
    for o in ordenes:
        por_persona[o['responsable']].append(o)
    personas = []
    for nombre, suyas in por_persona.items():
        ot     = [o for o in suyas if o['tipo'] == 'ot']
        manual = [o for o in suyas if o['tipo'] == 'manual']
        total  = len(suyas)
        pct_ot = round(len(ot) / total * 100)
        # Celular: todas las órdenes juntas, de la más atrasada a la menos.
        ordenadas = sorted(suyas, key=lambda o: o['dias_atraso'] or 0, reverse=True)
        personas.append({
            'nombre':   nombre,
            'ot':       ot,
            'manual':   manual,
            'total':    total,
            'pct_ot':   pct_ot,
            'pct_m':    100 - pct_ot,
            'ordenes':  ordenadas,
            'max_dias': ordenadas[0]['dias_atraso'] or 0,
        })
    personas.sort(key=lambda x: (x['total'], x['max_dias']), reverse=True)
    return personas


def _datos_backlog(request):
    """Órdenes vencidas por responsable con los filtros de Área y Semana del GET. Las órdenes se calculan una sola
    vez y se filtran en memoria; también se devuelven las listas que usan los conteos de los selectores (cada
    selector cuenta con el otro filtro aplicado y sin el suyo). La usan la página y la exportación."""
    hoy        = date.today()
    areas_list = list(areas_visibles_mto(request))
    area_id    = request.GET.get('area', '').strip()
    if area_id not in {str(a.id) for a in areas_list}:
        area_id = ''   # un ?area= de otra área se ignora
    ordenes_todas = _ordenes_backlog([a.id for a in areas_list], ve_todas=areas_ids_restringidas(request) is None)

    # Semana: 'AAAA-SS' (semana ISO de la fecha de compromiso) o 'mas6' (atajo "Más de 6 meses": atraso mayor
    # a ATRASO_ALTO, sin importar la semana).
    filtro_semana = request.GET.get('semana', '').strip()

    def en_semana(o):
        if filtro_semana == 'mas6':
            return (o['dias_atraso'] or 0) > ATRASO_ALTO
        return not filtro_semana or o['semana_key'] == filtro_semana

    def en_area(o):
        return not area_id or str(o['area_id']) == area_id

    sin_filtro_semana = [o for o in ordenes_todas if en_area(o)]
    sin_filtro_area   = [o for o in ordenes_todas if en_semana(o)]

    # Opciones del filtro Semana: de la más reciente a la más antigua, con cuántas órdenes tiene cada una.
    semanas_disponibles = [
        {'key': k, 'label': _semana(int(k[5:]), int(k[:4]))['semana'], 'n': n}
        for k, n in sorted(Counter(o['semana_key'] for o in sin_filtro_semana).items(), reverse=True)
    ]
    if filtro_semana == 'mas6':
        filtro_semana_label = _('Más de 6 meses')
    else:
        filtro_semana_label = next((s['label'] for s in semanas_disponibles if s['key'] == filtro_semana), '')

    return {
        'hoy':                 hoy,
        'areas':               areas_list,
        'area_id':             area_id,
        'area_nombre':         next((a.nombre for a in areas_list if str(a.id) == area_id), None) if area_id else None,
        'personas':            _agrupar([o for o in sin_filtro_semana if en_semana(o)]),
        'semanas_disponibles': semanas_disponibles,
        'filtro_semana':       filtro_semana,
        'filtro_semana_label': filtro_semana_label,
        'sin_filtro_area':     sin_filtro_area,
        'sin_filtro_semana':   sin_filtro_semana,
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


def _areas_filtro(datos):
    """Opciones del selector de área: color fijo y cuántas vencidas tiene cada
    área con los demás filtros (Semana) aplicados, sin contar el de área."""
    por_area = Counter(o['area_id'] for o in datos['sin_filtro_area'])
    return {
        'opciones': [{
            'value': str(a.id),
            'label': a.nombre,
            'color': COLORES_AREA[i % len(COLORES_AREA)],
            'meta':  _vencidas(por_area.get(a.id, 0)),
        } for i, a in enumerate(datos['areas'])],
        'todas_meta': _vencidas(sum(por_area.values())),
    }


def _semanas_filtro(datos):
    """Datos del selector de semana: vencidas por semana de compromiso (y por
    tipo, para que el selector siga al filtro Tipo), con el filtro de Área y
    sin el de Semana. Semanas ISO, como el Plan de mantenimiento."""
    conteos = defaultdict(lambda: {'ot': 0, 'manual': 0})
    mas6    = {'ot': 0, 'manual': 0}
    total   = {'ot': 0, 'manual': 0}
    for o in datos['sin_filtro_semana']:
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
    """Página del Backlog (escritorio y celular). Permiso: Ver backlog; solo las áreas del usuario."""
    if not puede_mto(request.user, 'ver_backlog'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver el backlog")))
        return redirect('mto:dashboard')
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
        'areas_filtro':        _areas_filtro(datos),
        'semanas_filtro':      _semanas_filtro(datos),
    })


@login_required
def backlog_exportar(request):
    """Excel con las órdenes que muestra la tabla de escritorio: Área y Semana
    (como la página) más Tipo, Responsable y búsqueda. Permiso: Ver backlog."""
    if not puede_mto(request.user, 'ver_backlog'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver el backlog")))
        return redirect('mto:dashboard')
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
