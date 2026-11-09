"""Exportación de Seguimientos correctivos (botón "Descargar" de la lista de escritorio).

Reutiliza `_consulta()` de la lista, así "Lo que ves" exporta TODAS las filas filtradas
(no solo la página visible) con el mismo orden. Excel con openpyxl, igual que Backlog."""
import csv
import io

from django.contrib.auth.decorators import login_required
from django.db.models import Count
from django.http import HttpResponse, HttpResponseForbidden
from django.utils import timezone
from django.utils.translation import gettext as _
from login_app.permisos import puede_mto

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

from ..models import Area, ImagenSeguimiento, SeguimientoManual
from .lista_seguimientos import ATENCION_FN, PRESETS_CREADO, SIN_RESPONSABLE, _consulta, _en_alcance, dias_vencido


COLOR_ESTATUS = {'pendiente': 'FCEFD6', 'en_proceso': 'EBEFFD', 'completado': 'E3F3E9'}
COLOR_ENCABEZADO = 'EBEFFD'
COLOR_VENCIDO = 'FBE4E2'


def _columnas(con_creado_por):
    """(clave, encabezado, ancho en Excel), en el orden del spec."""
    cols = [
        ('orden',       _('No. orden'),         14),
        ('tipo',        _('Tipo'),              12),
        ('plan',        _('Código plan'),       12),
        ('problema',    _('Problema'),          45),
        ('accion',      _('Acción'),            45),
        ('notas',       _('Notas'),             35),
        ('responsable', _('Responsable'),       28),
        ('f_comp',      _('Fecha compromiso'),  14),
        ('semana',      _('Semana compromiso'), 12),
        ('dias',        _('Días vencido'),      10),
        ('estatus',     _('Estatus'),           13),
        ('validacion',  _('Validación'),        13),
        ('fotos',       _('Fotos'),              8),
        ('creado',      _('Creado'),            12),
    ]
    if con_creado_por:
        cols.append(('creado_por', _('Creado por'), 22))
    return cols


def _filas(lista, hoy):
    """Una fila (dict) por seguimiento. Fechas como `date` reales; fotos con una sola consulta."""
    ids = [s.id for s in lista]
    fotos = dict(
        ImagenSeguimiento.objects.filter(seguimiento_manual_id__in=ids)
        .order_by().values_list('seguimiento_manual_id').annotate(n=Count('id'))
    ) if ids else {}
    filas = []
    for s in lista:
        semana = ''
        if s.fecha_compromiso:
            anio, sem, _dia = s.fecha_compromiso.isocalendar()
            semana = f'S{sem}/{anio}'
        dias = dias_vencido(s, hoy)
        creador = ''
        if s.creado_por:
            creador = s.creado_por.get_full_name() or s.creado_por.get_username()
        filas.append({
            'orden':       s.no_orden,
            'tipo':        _('Correctivo'),
            'plan':        '',
            'problema':    s.problema or '',
            'accion':      s.accion or '',
            'notas':       s.notas or '',
            'responsable': (s.responsable or '').strip() or _('Sin responsable'),
            'f_comp':      s.fecha_compromiso,
            'semana':      semana,
            'dias':        dias if dias > 0 else None,
            'estatus_clave': s.estatus,
            'estatus':     s.get_estatus_display(),
            'validacion':  _('Validado') if s.validado else _('Por validar'),
            'fotos':       fotos.get(s.id, 0),
            'creado':      timezone.localtime(s.fecha_creacion).date(),
            'creado_por':  creador,
        })
    return filas


def _texto_filtros(c):
    """Texto de la fila 2 del Excel: filtros aplicados (o "Sin filtros")."""
    partes = []
    if c.area_id:
        area = Area.objects.filter(pk=c.area_id).first()
        if area:
            partes.append(_('Área: %(v)s') % {'v': area.nombre})
    if c.estatus:
        etiquetas = dict(SeguimientoManual.ESTATUS_CHOICES)
        partes.append(_('Estatus: %(v)s') % {'v': etiquetas.get(c.estatus, c.estatus)})
    if c.filtro_atencion:
        nombres = {'vencidos': _('Vencidos'), 'sin_resp': _('Sin responsable'),
                   'sin_fecha': _('Sin fecha'), 'por_validar': _('Por validar')}
        partes.append(_('Atención: %(v)s') % {'v': nombres[c.filtro_atencion]})
    if c.filtro_responsable:
        nombre = _('Sin responsable') if c.filtro_responsable == SIN_RESPONSABLE else c.filtro_responsable
        partes.append(_('Responsable: %(v)s') % {'v': nombre})
    if c.filtro_validado != '':
        partes.append(_('Validación: %(v)s') % {'v': _('Validado') if c.filtro_validado == '1' else _('Por validar')})
    if c.filtro_creado in PRESETS_CREADO or c.fecha_desde_ef or c.fecha_hasta_ef:
        def dmy(iso):
            return '/'.join(reversed(iso.split('-'))) if iso else '…'
        partes.append(_('Creado: %(d)s – %(h)s') % {'d': dmy(c.fecha_desde_ef), 'h': dmy(c.fecha_hasta_ef)})
    if c.filtro_q:
        partes.append(_('Búsqueda: "%(v)s"') % {'v': c.filtro_q})
    return ' · '.join(partes) if partes else _('Sin filtros')


def _xlsx(filas, cols, titulo, filtros_txt, hoy):
    wb = Workbook()
    ws = wb.active
    ws.title = _('Seguimientos')

    ws['A1'] = titulo
    ws['A1'].font = Font(bold=True, size=14)
    ahora = timezone.localtime().strftime('%d/%m/%Y %H:%M')
    ws['A2'] = _('Generado el %(f)s · %(filtros)s') % {'f': ahora, 'filtros': filtros_txt}
    ws['A2'].font = Font(color='5E6175')

    borde = Border(bottom=Side(style='thin', color='C5C7D4'))
    relleno_enc = PatternFill('solid', fgColor=COLOR_ENCABEZADO)
    for i, (_clave, encabezado, ancho) in enumerate(cols, start=1):
        celda = ws.cell(row=4, column=i, value=encabezado)
        celda.font = Font(bold=True)
        celda.fill = relleno_enc
        celda.border = borde
        celda.alignment = Alignment(vertical='center', wrap_text=True)
        ws.column_dimensions[celda.column_letter].width = ancho

    texto_largo = {'problema', 'accion', 'notas'}
    fechas = {'f_comp', 'creado'}
    for r, fila in enumerate(filas, start=5):
        for i, (clave, _enc, _w) in enumerate(cols, start=1):
            celda = ws.cell(row=r, column=i, value=fila[clave])
            celda.alignment = Alignment(vertical='top', wrap_text=clave in texto_largo)
            if clave in fechas and fila[clave]:
                celda.number_format = 'DD/MM/YYYY'
            if clave == 'estatus':
                celda.fill = PatternFill('solid', fgColor=COLOR_ESTATUS.get(fila['estatus_clave'], 'FFFFFF'))
            if clave == 'dias' and fila['dias']:
                celda.fill = PatternFill('solid', fgColor=COLOR_VENCIDO)

    ws.freeze_panes = 'B5'
    ultima_col = ws.cell(row=4, column=len(cols)).column_letter
    ws.auto_filter.ref = f'A4:{ultima_col}{max(4 + len(filas), 4)}'

    # Hoja "Resumen": conteos de lo exportado.
    rs = wb.create_sheet(_('Resumen'))
    rs.column_dimensions['A'].width = 26
    rs.column_dimensions['B'].width = 12
    rs['A1'] = _('Resumen'); rs['A1'].font = Font(bold=True, size=14)
    rs['A2'] = _('Total'); rs['B2'] = len(filas)
    rs['A2'].font = Font(bold=True)
    rs['A4'] = _('Por estatus'); rs['A4'].font = Font(bold=True)
    fila_r = 5
    for clave, etiqueta in SeguimientoManual.ESTATUS_CHOICES:
        rs.cell(row=fila_r, column=1, value=str(etiqueta))
        rs.cell(row=fila_r, column=2, value=sum(1 for f in filas if f['estatus_clave'] == clave))
        fila_r += 1
    fila_r += 1
    rs.cell(row=fila_r, column=1, value=_('Por atención')).font = Font(bold=True)
    fila_r += 1
    nombres = [('vencidos', _('Vencidos')), ('sin_resp', _('Sin responsable')),
               ('sin_fecha', _('Sin fecha')), ('por_validar', _('Por validar'))]
    return wb, rs, fila_r, nombres


def _guardar_xlsx(filas_obj, wb, rs, fila_r, nombres, hoy):
    for clave, etiqueta in nombres:
        rs.cell(row=fila_r, column=1, value=etiqueta)
        rs.cell(row=fila_r, column=2, value=sum(1 for s in filas_obj if ATENCION_FN[clave](s, hoy)))
        fila_r += 1
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _csv(filas, cols):
    """UTF-8 con BOM (Excel en español muestra bien los acentos); textos entre comillas."""
    salida = io.StringIO()
    escritor = csv.writer(salida, quoting=csv.QUOTE_NONNUMERIC, lineterminator='\r\n')
    escritor.writerow([enc for _c, enc, _w in cols])
    for fila in filas:
        linea = []
        for clave, _e, _w in cols:
            v = fila[clave]
            if clave in ('f_comp', 'creado'):
                v = v.strftime('%d/%m/%Y') if v else ''
            elif v is None:
                v = ''
            linea.append(v)
        escritor.writerow(linea)
    return ('﻿' + salida.getvalue()).encode('utf-8')


@login_required
def seguimientos_exportar(request):
    if not puede_mto(request.user, 'ver_seguimiento'):
        return HttpResponseForbidden()

    formato = 'csv' if request.GET.get('formato') == 'csv' else 'xlsx'
    alcance = 'todos' if request.GET.get('alcance') == 'todos' else 'filtrado'

    c = _consulta(request)
    hoy = c.hoy
    if alcance == 'todos':
        qs = _en_alcance(SeguimientoManual.objects.select_related('area', 'creado_por'), c.area_id, c.areas_ids)
        lista = list(qs.order_by('-fecha_creacion'))
        filtros_txt = _('Sin filtros')
        if c.area_id:
            area = Area.objects.filter(pk=c.area_id).first()
            if area:
                filtros_txt = _('Área: %(v)s') % {'v': area.nombre}
    else:
        lista = c.seguimientos_manuales
        filtros_txt = _texto_filtros(c)

    filas = _filas(lista, hoy)
    cols = _columnas(any(f['creado_por'] for f in filas))

    if formato == 'csv':
        contenido, tipo = _csv(filas, cols), 'text/csv; charset=utf-8'
    else:
        titulo = _('Seguimientos correctivos')
        if c.area_id:
            area = Area.objects.filter(pk=c.area_id).first()
            if area:
                titulo = f'{titulo} — {area.nombre}'
        wb, rs, fila_r, nombres = _xlsx(filas, cols, titulo, filtros_txt, hoy)
        contenido = _guardar_xlsx(lista, wb, rs, fila_r, nombres, hoy)
        tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    sufijo = '_filtrado' if (alcance == 'filtrado' and c.hay_filtros) else ''
    nombre = f'seguimientos_{hoy:%Y-%m-%d}{sufijo}.{formato}'
    respuesta = HttpResponse(contenido, content_type=tipo)
    respuesta['Content-Disposition'] = f'attachment; filename="{nombre}"'
    respuesta['X-Filas'] = str(len(filas))
    return respuesta
