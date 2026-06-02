from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect
from django.contrib import messages
from django.http import HttpResponse
from openpyxl import load_workbook
from openpyxl.styles import Border, Side, Alignment, Font
from openpyxl.worksheet.properties import WorksheetProperties, PageSetupProperties
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
import os
import io

from ..models import PlanMantenimiento, RegistroEjecucion, PasoRutina, Responsable
from .utils import lunes_de_semana, _planes_que_tocan


MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
}


@login_required
def exportar_semana_excel(request):
    semana  = int(request.GET.get('semana', date.today().isocalendar()[1]))
    anio    = int(request.GET.get('anio',   date.today().isocalendar()[0]))
    area_id = request.GET.get('area')

    lunes   = lunes_de_semana(anio, semana)
    domingo = lunes + timedelta(days=6)

    ultimo_dia = domingo.day

    if lunes.month == domingo.month:
        texto_semana = (
            f"Semana: {semana} del {lunes.day} al {domingo.day} "
            f"de {MESES_ES[domingo.month]}"
        )
    else:
        texto_semana = (
            f"S{semana} del {lunes.day} de {MESES_ES[lunes.month]} "
            f"al {domingo.day} de {MESES_ES[domingo.month]}"
        )

    planes_qs = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    if area_id:
        planes_qs = planes_qs.filter(area_id=area_id)

    planes_semana = _planes_que_tocan(list(planes_qs), lunes)

    if not planes_semana:
        messages.warning(request, f"No hay planes para la semana {semana}/{anio}.")
        return redirect(f"/mto/equipos/?semana={semana}")

    ids_planes = [p.id for p in planes_semana]
    areas_ids  = list(set(p.area_id for p in planes_semana))
    pts        = list(set(p.plan_trabajo for p in planes_semana))

    registros_map = {
        r.plan_id: r
        for r in RegistroEjecucion.objects.filter(
            plan_id__in=ids_planes, semana_inicio=lunes
        ).select_related('responsable')
    }

    pasos_map = {}
    for paso in PasoRutina.objects.filter(
        area_id__in=areas_ids, plan_trabajo__in=pts
    ).order_by('secuencia'):
        clave = (paso.area_id, paso.plan_trabajo)
        pasos_map.setdefault(clave, []).append(paso)

    supervisores_map = {}
    for sup in Responsable.objects.filter(
        area_id__in=list(set(p.area_id for p in planes_semana)),
        posicion__icontains='supervisor',
        activo=True
    ).order_by('area_id', 'apellidos'):
        if sup.area_id not in supervisores_map:
            supervisores_map[sup.area_id] = f"{sup.nombre} {sup.apellidos}"

    filas = []
    for plan in planes_semana:
        reg = registros_map.get(plan.id)
        responsable_ejecutor = ''
        if reg and reg.responsable:
            responsable_ejecutor = f"{reg.responsable.nombre} {reg.responsable.apellidos}"
        supervisor = supervisores_map.get(plan.area_id, '')
        filas.append({
            'plan':        plan,
            'codigo':      plan.codigo,
            'actividad':   plan.actividad or '',
            'responsable': responsable_ejecutor,
            'supervisor':  supervisor,
            'registro':    reg,
        })

    plantilla_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        '..', 'static', 'mto_app', 'Week Format.xlsm'
    )
    wb = load_workbook(plantilla_path, keep_vba=True)

    creador = request.user.get_full_name() or request.user.username

    MAX_POR_PORTADA_P1 = 42  # Portada 1: planes 1-42
    MAX_POR_PORTADA_P2 = 84  # Portada 2: planes 43-84
    FILA_INICIO_P1   = 10
    FILA_INICIO_P2   = 94
    PASO_FILA_P     = 2

    for portada_idx, nombre_hoja in enumerate(['Portada 1', 'Portada 2']):
        if nombre_hoja not in wb.sheetnames:
            continue
        
        max_portada = MAX_POR_PORTADA_P1 if portada_idx == 0 else MAX_POR_PORTADA_P2

        ws = wb[nombre_hoja]
        inicio = portada_idx * MAX_POR_PORTADA_P1
        bloque = filas[inicio: inicio + max_portada]

        if not bloque:
            ws.sheet_state = 'hidden'
            continue

        ws.sheet_state = 'visible'
        ws['J2'] = ultimo_dia
        ws['E8'] = texto_semana

        # ── Logo en portada ───────────────────────────────────────────────
        logo_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', 'static', 'mto_app', 'logo.png'
        )
        if os.path.exists(logo_path):
            px = lambda n: n * 9525
            img        = Image(logo_path)
            img.anchor = AbsoluteAnchor(
                pos=XDRPoint2D(x=px(1200), y=px(0)),
                ext=XDRPositiveSize2D(cx=px(122), cy=px(78))
            )
            ws.add_image(img)

        fila_inicio_portada = FILA_INICIO_P1 if portada_idx == 0 else FILA_INICIO_P2

        for col in range(1, 9):
            celda = ws.cell(row=4, column=col)
            celda.border = Border(
                bottom=Side(style='medium', color='000000'),
                top=celda.border.top if celda.border else Side(),
                left=celda.border.left if celda.border else Side(),
                right=celda.border.right if celda.border else Side(),
            )

        # Ocultar el rango de la portada 2 (filas 70 a 139)
        if portada_idx == 1:
            for fila in range(70, 140):
                ws.row_dimensions[fila].hidden = True

        for i in range(max_portada):
            fila_p = fila_inicio_portada + i * PASO_FILA_P
            fila_s = fila_p + 1

            if i < len(bloque):
                entrada = bloque[i]
                ws[f'B{fila_p}'] = entrada['codigo']
                ws[f'C{fila_p}'] = entrada['actividad']
                ws[f'E{fila_p}'] = entrada['responsable']
                ws[f'D{fila_p}'] = entrada['supervisor']
                ws.row_dimensions[fila_p].hidden = False
                ws.row_dimensions[fila_s].hidden = False
            else:
                ws[f'B{fila_p}'] = ''
                ws[f'C{fila_p}'] = ''
                ws[f'D{fila_p}'] = ''
                ws[f'E{fila_p}'] = ''
                ws.row_dimensions[fila_p].hidden = True
                ws.row_dimensions[fila_s].hidden = True

        ws.print_area = 'A1:J93' if portada_idx == 0 else 'A1:J177'
        ws.page_setup.paperSize   = ws.PAPERSIZE_LETTER
        ws.page_setup.orientation = 'portrait'
        ws.page_setup.fitToWidth  = 1
        ws.page_setup.fitToHeight = 1
        ws.page_setup.scale       = 100
        if ws.sheet_properties is None:
            ws.sheet_properties = WorksheetProperties()
        if ws.sheet_properties.pageSetUpPr is None:
            ws.sheet_properties.pageSetUpPr = PageSetupProperties()
        ws.sheet_properties.pageSetUpPr.fitToPage = True

    # ── Hojas de órdenes dinámicas ────────────────────────────────────────────
    # Toma la primera hoja que no sea portada como plantilla base
    # y crea copias dinámicamente según cuántos planes haya en la semana.
    # Esto elimina el límite fijo de 40 órdenes.

    hoja_base_nombre = next(
        (ws.title for ws in wb.worksheets if ws.title not in ('Portada 1', 'Portada 2')),
        None
    )

    if not hoja_base_nombre:
        messages.error(request, "La plantilla no tiene hojas de órdenes.")
        return redirect(f"/mto/equipos/?semana={semana}")

    hoja_base = wb[hoja_base_nombre]

    # Ocultar todas las hojas de orden existentes en la plantilla
    hojas_existentes = [
        ws for ws in wb.worksheets
        if ws.title not in ('Portada 1', 'Portada 2')
    ]
    for ws in hojas_existentes:
        ws.sheet_state = 'hidden'

    # Crear una copia por cada plan de la semana
    hojas_ordenes = []
    for idx in range(1, len(filas) + 1):
        nueva_hoja = wb.copy_worksheet(hoja_base)
        nueva_hoja.title = f'OT {idx}'
        nueva_hoja.sheet_state = 'visible'
        hojas_ordenes.append(nueva_hoja)

    fila_inicio_o = 16
    max_pasos     = 19

    for idx, entrada in enumerate(filas, start=1):
        plan     = entrada['plan']
        registro = entrada['registro']
        ws       = hojas_ordenes[idx - 1]

        for row_dim in ws.row_dimensions.values():
            row_dim.hidden = False
        for col_dim in ws.column_dimensions.values():
            col_dim.hidden = False

        responsable_nombre = entrada['responsable']
        duracion_h = round(plan.duracion_minutos / 60, 1)
        mes        = lunes.strftime('%m')
        aa         = lunes.strftime('%y')
        no_orden   = f"{semana:02d}{mes}{aa}{100 + idx}"

        ws['D6']  = semana
        ws['D7']  = no_orden
        ws['H7']  = creador
        ws['D8']  = plan.area.nombre
        ws['H8']  = '________________'
        ws['D9']  = plan.estatus
        ws['H9']  = duracion_h
        ws['D10'] = plan.prioridad
        ws['H10'] = plan.locacion or plan.area.nombre
        ws['D11'] = plan.tipo_mto
        ws['D12'] = plan.rutina
        ws['D13'] = plan.actividad
        ws['G13'] = plan.codigo
        ws['H13'] = plan.nombre_equipo or plan.actividad

        logo_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', 'static', 'mto_app', 'logo.png'
        )

        if os.path.exists(logo_path):
            px = lambda n: n * 9525
            img        = Image(logo_path)
            img.anchor = AbsoluteAnchor(
                pos=XDRPoint2D(x=px(940), y=px(0)),
                ext=XDRPositiveSize2D(cx=px(122), cy=px(78))
            )
            ws.add_image(img)

        for col in range(3, 9):
            celda = ws.cell(row=4, column=col)
            celda.border = Border(
                bottom=Side(style='medium', color='000000'),
                top=celda.border.top if celda.border else Side(),
                left=celda.border.left if celda.border else Side(),
                right=celda.border.right if celda.border else Side(),
            )

        if registro and registro.responsable:
            ws['C41'] = registro.responsable.numero_nomina
            ws['D41'] = f"{registro.responsable.nombre} {registro.responsable.apellidos}"
        else:
            ws['C41'] = '____________'
            ws['D41'] = '___________________________'

        pasos = pasos_map.get((plan.area_id, plan.plan_trabajo), [])

        for i in range(max_pasos):
            fila = fila_inicio_o + i
            ws[f'C{fila}'] = ''
            ws[f'D{fila}'] = ''
            ws[f'E{fila}'] = ''
            ws[f'F{fila}'] = '▭'
            ws[f'G{fila}'] = ''
            ws[f'H{fila}'] = ''
            ws[f'C{fila}'].alignment = Alignment(vertical='center', horizontal='center')
            ws[f'D{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
            ws[f'F{fila}'].alignment = Alignment(horizontal='center', vertical='center')
            ws[f'F{fila}'].font      = Font(size=36)
            ws[f'H{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
            ws.row_dimensions[fila].height = 25
            ws.row_dimensions[fila].hidden = False

        for i, paso in enumerate(pasos[:max_pasos]):
            fila = fila_inicio_o + i
            ws[f'C{fila}'] = paso.secuencia
            ws[f'D{fila}'] = paso.descripcion
            ws[f'F{fila}'] = '▭'
            ws[f'G{fila}'] = ''
            ws[f'H{fila}'] = paso.detalles
            ws[f'C{fila}'].alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
            ws[f'D{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
            ws[f'F{fila}'].alignment = Alignment(horizontal='center', vertical='center')
            ws[f'F{fila}'].font      = Font(size=36)
            ws[f'H{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
            desc    = paso.descripcion or ''
            detalle = paso.detalles or ''
            lineas  = max(
                max(1, -(-len(desc) // 35)),
                max(1, -(-len(detalle) // 85) + detalle.count('\n'))
            )
            ws.row_dimensions[fila].height = max(25, lineas * 14)

        pasos_count = min(len(pasos), max_pasos)
        for i in range(pasos_count, max_pasos):
            ws.row_dimensions[fila_inicio_o + i].hidden = True

        ws.print_area = 'A1:I52'
        ws.page_setup.paperSize   = ws.PAPERSIZE_LETTER
        ws.page_setup.orientation = 'portrait'
        ws.page_setup.fitToWidth  = 1
        ws.page_setup.fitToHeight = 0
        ws.page_setup.scale       = 100

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    nombre_archivo = f"OTs_Semana_{semana}_{anio}.xlsm"
    response = HttpResponse(
        buffer,
        content_type='application/vnd.ms-excel.sheet.macroEnabled.12'
    )
    response['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'

    token = request.GET.get('token', '')
    response.set_cookie('descarga_lista', token, max_age=60)

    return response