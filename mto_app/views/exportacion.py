import os
import io
import uuid
import threading
import tempfile
import re
import html
import zipfile
import logging
import json
import time

from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.db import connection
from django.shortcuts import redirect
from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.utils.translation import gettext as _
from openpyxl import load_workbook
from openpyxl.styles import Border, Side, Alignment, Font
from openpyxl.worksheet.properties import WorksheetProperties, PageSetupProperties
from openpyxl.drawing.image import Image
from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor
from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D

from ..models import PlanMantenimiento, RegistroEjecucion, PasoRutina, Responsable
from .utils import lunes_de_semana, _planes_que_tocan, numero_ot, puede_ver_plan, area_del_plan
from menu_app.avisos import aviso

logger = logging.getLogger(__name__)

# Estado de cada exportación de la semana en un archivo JSON de la carpeta temporal, junto a su Excel:
# con gunicorn --workers 3 el proceso que inicia el Excel no siempre es el que atiende "¿ya está?" ni la
# descarga, y la memoria no se comparte entre procesos; la carpeta temporal sí.
# Estado: {'status': 'pending'|'ready'|'error', 'path': str, 'filename': str, 'error': str, 'pid': int,
#          'usuario': id de quien exporta, 'inicio': time.time() al iniciar}
_DIR_TRABAJOS = os.path.join(tempfile.gettempdir(), 'exportar_semana')
_RE_TOKEN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
_PENDIENTE_MAX_SEG = 180   # "pending" por más de esto = su hilo murió (p. ej. se reinició el worker)

def _ruta_trabajo(token):
    """Archivo de estado del trabajo (None si el token no tiene forma de uuid: no se arma ninguna ruta con él)."""
    return os.path.join(_DIR_TRABAJOS, token + '.json') if _RE_TOKEN.match(token or '') else None


def _guardar_trabajo(token, datos):
    """Escribe el estado de forma atómica (los otros procesos nunca leen un archivo a medias). Conserva lo que ya
       tenía (usuario, inicio) y agrega o cambia lo de `datos`."""
    
    os.makedirs(_DIR_TRABAJOS, exist_ok=True)
    ruta  = _ruta_trabajo(token)
    datos = {**(_leer_trabajo(token) or {}), **datos}
    with open(ruta + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(datos, f)
    os.replace(ruta + '.tmp', ruta)


def _leer_trabajo(token):
    ruta = _ruta_trabajo(token)
    try:
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    except (TypeError, OSError, ValueError):
        return None


def _limpiar_trabajos(horas=6):
    """Borra estados y Excel de trabajos viejos que nadie descargó."""
    limite = time.time() - horas * 3600
    try:
        nombres = os.listdir(_DIR_TRABAJOS)
    except OSError:
        return
    for n in nombres:
        ruta = os.path.join(_DIR_TRABAJOS, n)
        try:
            if os.path.getmtime(ruta) < limite:
                os.unlink(ruta)
        except OSError:
            pass


MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
}


# Íconos de punto crítico (▼ ● ▲) de la hoja de órdenes: Excel los guarda como formato condicional x14,
# que openpyxl borra al abrir la plantilla. Se leen de la plantilla y se vuelven a poner al guardar.
_URI_FORMATO_X14 = '{78C0D931-6437-407d-A8EE-F0AAD7539E65}'


def _rutas_hojas(z):
    """{nombre de hoja: ruta de su XML dentro del .xlsm}."""
    wb   = z.read('xl/workbook.xml').decode('utf-8')
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    destinos = {}
    for rel in re.findall(r'<Relationship\b[^>]*>', rels):
        rid, tgt = re.search(r'Id="([^"]+)"', rel), re.search(r'Target="([^"]+)"', rel)
        if rid and tgt:
            destinos[rid.group(1)] = tgt.group(1)
    rutas = {}
    for hoja in re.findall(r'<sheet\b[^>]*>', wb):
        nombre = html.unescape(re.search(r'name="([^"]+)"', hoja).group(1))
        t      = destinos.get(re.search(r'r:id="([^"]+)"', hoja).group(1), '')
        rutas[nombre] = t.lstrip('/') if t.startswith('/') else 'xl/' + t
    return rutas


def _iconos_plantilla(plantilla_path, hoja='01'):
    """El bloque <ext> con el formato condicional x14 de la hoja de órdenes ('' si la plantilla no lo trae)."""
    with zipfile.ZipFile(plantilla_path) as z:
        ruta = _rutas_hojas(z).get(hoja)
        xml  = z.read(ruta).decode('utf-8') if ruta else ''
    m = re.search(r'<ext\b[^>]*uri="%s".*?</ext>' % re.escape(_URI_FORMATO_X14), xml, re.S)
    return m.group(0) if m else ''


def _poner_iconos(path, ext_xml, hojas):
    """Vuelve a poner el formato condicional x14 en las hojas indicadas del .xlsm ya guardado."""
    if not ext_xml or not hojas:
        return
    with zipfile.ZipFile(path) as z:
        rutas    = _rutas_hojas(z)
        objetivo = {rutas[h] for h in hojas if h in rutas}
        partes   = [(info, z.read(info.filename)) for info in z.infolist()]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for info, datos in partes:
            if info.filename in objetivo:
                # Cada hoja con sus propios id de regla
                ext = re.sub(r'id="\{[0-9A-Fa-f-]+\}"', lambda m: 'id="{%s}"' % str(uuid.uuid4()).upper(), ext_xml)
                xml = datos.decode('utf-8')
                xml = (xml.replace('<extLst>', '<extLst>' + ext, 1) if '<extLst>' in xml
                       else xml.replace('</worksheet>', '<extLst>%s</extLst></worksheet>' % ext))
                datos = xml.encode('utf-8')
            z.writestr(info, datos)


def _run_exportar(token, planes_semana, semana, anio, lunes, creador, static_dir):
    """Genera el Excel en background y deja el resultado en su archivo de estado (_guardar_trabajo)."""

    try:
        domingo    = lunes + timedelta(days=6)
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
                responsable_ejecutor = reg.nombre_responsable()
            filas.append({
                'plan':        plan,
                'codigo':      plan.codigo,
                'actividad':   plan.actividad or '',
                'responsable': responsable_ejecutor,
                'supervisor':  supervisores_map.get(plan.area_id, ''),
                'registro':    reg,
            })

        plantilla_path = os.path.join(static_dir, 'Week Format.xlsm')
        wb = load_workbook(plantilla_path, keep_vba=True)
        ext_iconos = _iconos_plantilla(plantilla_path)


        px = lambda n: n * 9525

        def _load_img(nombre):
            p = os.path.join(static_dir, nombre)
            return open(p, 'rb').read() if os.path.exists(p) else None

        logo_bytes    = _load_img('logo.png')
        version_bytes = _load_img('Portada_Version.png')
        titulo_bytes  = _load_img('Portada_Titulo_Plan_Mantenimiento.png')

        MAX_POR_PORTADA_P1 = 42
        MAX_POR_PORTADA_P2 = 84
        FILA_INICIO_P1     = 10
        FILA_INICIO_P2     = 94
        PASO_FILA_P        = 2

        for portada_idx, nombre_hoja in enumerate(['Portada 1', 'Portada 2']):
            if nombre_hoja not in wb.sheetnames:
                continue

            max_portada = MAX_POR_PORTADA_P1 if portada_idx == 0 else MAX_POR_PORTADA_P2
            ws     = wb[nombre_hoja]
            inicio = portada_idx * MAX_POR_PORTADA_P1
            bloque = filas[inicio: inicio + max_portada]

            if not bloque:
                ws.sheet_state = 'hidden'
                continue

            ws.sheet_state = 'visible'
            ws['J2'] = ultimo_dia
            ws['E8'] = texto_semana

            if logo_bytes:
                img        = Image(io.BytesIO(logo_bytes))
                img.anchor = AbsoluteAnchor(
                    pos=XDRPoint2D(x=px(1200), y=px(0)),
                    ext=XDRPositiveSize2D(cx=px(120), cy=px(77))
                )
                ws.add_image(img)
            if version_bytes:
                img        = Image(io.BytesIO(version_bytes))
                img.anchor = AbsoluteAnchor(
                    pos=XDRPoint2D(x=px(10), y=px(10)),
                    ext=XDRPositiveSize2D(cx=px(100), cy=px(55))
                )
                ws.add_image(img)
            if titulo_bytes:
                img        = Image(io.BytesIO(titulo_bytes))
                img.anchor = AbsoluteAnchor(
                    pos=XDRPoint2D(x=px(350), y=px(5)),
                    ext=XDRPositiveSize2D(cx=px(633), cy=px(65))
                )
                ws.add_image(img)

            fila_inicio_portada = FILA_INICIO_P1 if portada_idx == 0 else FILA_INICIO_P2

            for col in range(1, 9):
                celda = ws.cell(row=4, column=col)
                celda.border = Border(
                    bottom=Side(style='medium', color='000000'),
                    top=celda.border.top   if celda.border else Side(),
                    left=celda.border.left if celda.border else Side(),
                    right=celda.border.right if celda.border else Side(),
                )

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

            ws.print_area = 'A1:I93' if portada_idx == 0 else 'A1:I177'
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

        hoja_base_nombre = next(
            (ws.title for ws in wb.worksheets if ws.title not in ('Portada 1', 'Portada 2')),
            None
        )
        if not hoja_base_nombre:
            logger.error("Exportar semana %s/%s (trabajo %s): la plantilla no tiene hojas de órdenes", semana, anio, token)
            _guardar_trabajo(token, {'status': 'error', 'error': _("La plantilla no tiene hojas de órdenes.")})
            return

        hoja_base = wb[hoja_base_nombre]

        hojas_existentes = [ws for ws in wb.worksheets if ws.title not in ('Portada 1', 'Portada 2')]
        for ws in hojas_existentes:
            ws.sheet_state = 'hidden'

        hojas_ordenes = []
        for idx in range(1, len(filas) + 1):
            nueva_hoja = wb.copy_worksheet(hoja_base)
            nueva_hoja.title = f'OT {idx}'
            nueva_hoja.sheet_state = 'visible'
            hojas_ordenes.append(nueva_hoja)

        fila_inicio_o = 20
        max_pasos     = 19

        for idx, entrada in enumerate(filas, start=1):
            plan     = entrada['plan']
            registro = entrada['registro']
            ws       = hojas_ordenes[idx - 1]

            for row_dim in ws.row_dimensions.values():
                row_dim.hidden = False
            for col_dim in ws.column_dimensions.values():
                col_dim.hidden = False

            duracion_h = round(plan.duracion_minutos / 60, 1)
            no_orden   = numero_ot(lunes, idx, plan.area.prefijo_ot)   # igual que el Plan y el Backlog

            ws['D6']  = semana
            ws['D7']  = no_orden
            ws['I7']  = entrada['supervisor'] or creador   # supervisor del área; si no hay, quien exporta
            ws['D8']  = plan.area.nombre
            ws['I8']  = '________________'
            ws['D9']  = plan.estatus
            ws['I9']  = duracion_h
            ws['D10'] = plan.prioridad
            ws['I10'] = plan.locacion or plan.area.nombre
            ws['D11'] = plan.tipo_mto
            ws['D12'] = plan.rutina
            ws['D13'] = plan.actividad
            ws['H13'] = plan.codigo
            ws['I13'] = plan.nombre_equipo or plan.actividad

            if logo_bytes:
                img        = Image(io.BytesIO(logo_bytes))
                img.anchor = AbsoluteAnchor(
                    pos=XDRPoint2D(x=px(1096), y=px(0)),
                    ext=XDRPositiveSize2D(cx=px(120), cy=px(76))
                )
                ws.add_image(img)

            for col in range(3, 10):
                celda = ws.cell(row=4, column=col)
                celda.border = Border(
                    bottom=Side(style='medium', color='000000'),
                    top=celda.border.top   if celda.border else Side(),
                    left=celda.border.left if celda.border else Side(),
                    right=celda.border.right if celda.border else Side(),
                )

            if registro and registro.responsable:
                ws['C45'] = registro.responsable.nomina_visible()
                ws['D45'] = registro.nombre_responsable()
            else:
                ws['C45'] = '____________'
                ws['D45'] = '___________________________'

            pasos = pasos_map.get((plan.area_id, plan.plan_trabajo), [])

            for i in range(max_pasos):
                fila = fila_inicio_o + i
                ws[f'C{fila}'] = ''
                ws[f'D{fila}'] = ''
                ws[f'E{fila}'] = ''
                ws[f'F{fila}'] = '▭'
                ws[f'G{fila}'] = None
                ws[f'H{fila}'] = None
                ws[f'I{fila}'] = ''
                ws[f'C{fila}'].alignment = Alignment(vertical='center', horizontal='center')
                ws[f'D{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
                ws[f'F{fila}'].alignment = Alignment(horizontal='center', vertical='center')
                ws[f'F{fila}'].font      = Font(size=36)
                ws[f'I{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
                ws.row_dimensions[fila].height = 25
                ws.row_dimensions[fila].hidden = False

            for i, paso in enumerate(pasos[:max_pasos]):
                fila = fila_inicio_o + i
                pc   = sorted(set(paso.puntos_criticos or []))   # 0, 1 o 2: la plantilla los pinta con ▼ ● ▲
                ws[f'C{fila}'] = paso.secuencia
                ws[f'D{fila}'] = paso.descripcion
                ws[f'F{fila}'] = '▭'
                ws[f'G{fila}'] = pc[0] if len(pc) > 0 else None
                ws[f'H{fila}'] = pc[1] if len(pc) > 1 else None
                ws[f'I{fila}'] = paso.detalles
                ws[f'C{fila}'].alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
                ws[f'D{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
                ws[f'F{fila}'].alignment = Alignment(horizontal='center', vertical='center')
                ws[f'F{fila}'].font      = Font(size=36)
                ws[f'I{fila}'].alignment = Alignment(wrap_text=True, vertical='center')
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

            ws.print_area = 'A1:I56'
            ws.page_setup.paperSize   = ws.PAPERSIZE_LETTER
            ws.page_setup.orientation = 'portrait'
            ws.page_setup.fitToWidth  = 1
            ws.page_setup.fitToHeight = 0
            ws.page_setup.scale       = 100

        archivo = os.path.join(_DIR_TRABAJOS, token + '.xlsm')   # en la carpeta compartida por los procesos
        wb.save(archivo)
        _poner_iconos(archivo, ext_iconos, [h.title for h in hojas_ordenes])

        _guardar_trabajo(token, {
            'status':   'ready',
            'path':     archivo,
            'filename': f"OTs_Semana_{semana}_{anio}.xlsm",
        })


    except Exception as e:
        logger.exception("Exportar semana %s/%s (trabajo %s): falló la generación", semana, anio, token)   # con traceback
        _guardar_trabajo(token, {'status': 'error', 'error': '%s: %s' % (type(e).__name__, e)})
    finally:
        connection.close()   # el hilo abrió su propia conexión a la BD: se cierra al terminar




@login_required
def exportar_semana_excel(request):
    """Inicia en un hilo el Excel de la semana del área del Plan (area_del_plan: nunca otra área ni todas
       juntas, así el No. de OT es el mismo que en el Plan) y devuelve su token."""
   
    if not puede_ver_plan(request):
         return JsonResponse({'error': _("No tienes permiso para exportar planes de mantenimiento.")}, status=403)
    area_id = area_del_plan(request)
    if not area_id:
         return JsonResponse({'error': _("No tienes áreas asignadas.")}, status=403)

    hoy = date.today()
    try:
        semana = int(request.GET.get('semana') or hoy.isocalendar()[1])
        anio   = int(request.GET.get('anio')   or hoy.isocalendar()[0])
        lunes  = lunes_de_semana(anio, semana)   # ValueError si la semana no existe en ese año
    except ValueError:
        return JsonResponse({'error': _("Semana no válida.")}, status=400)

    planes_qs     = PlanMantenimiento.objects.select_related('area').filter(activo=True, area_id=area_id)
    planes_semana = _planes_que_tocan(list(planes_qs), lunes)

    if not planes_semana:
        return JsonResponse(
            {'error': _("No hay planes para la semana {semana}/{anio}.").format(semana=semana, anio=anio)},
            status=404
        )

    creador    = request.user.get_full_name() or request.user.username
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'mto_app')
    token      = str(uuid.uuid4())

    _limpiar_trabajos()
    _guardar_trabajo(token, {'status': 'pending', 'pid': os.getpid(), 'usuario': request.user.pk, 'inicio': time.time()})


    threading.Thread(
        target=_run_exportar,
        args=(token, planes_semana, semana, anio, lunes, creador, static_dir),
        daemon=True,
    ).start()

    return JsonResponse({'token': token})


def _trabajo_del_usuario(request, token):
    """Estado del trabajo solo si lo inició quien pregunta (None si no existe o es de otro usuario)."""
    
    job = _leer_trabajo(token)
    return job if job and job.get('usuario') == request.user.pk else None


@login_required
def exportar_semana_status(request, token):
    job = _trabajo_del_usuario(request, token)
    if job is None:   # no hay archivo de estado: token inválido, ya se descargó o se borró por viejo
        logger.error("Exportar semana: no existe el estado del trabajo %s (pid %s)", token, os.getpid())
        job = {'status': 'error', 'error': _("No se encontró la exportación; vuelve a intentarlo.")}
    elif job['status'] == 'pending' and time.time() - job.get('inicio', 0) > _PENDIENTE_MAX_SEG:
        logger.error("Exportar semana: el trabajo %s lleva más de %s s sin terminar (¿se reinició el worker?)",
                      token, _PENDIENTE_MAX_SEG)
        job = {'status': 'error', 'error': _("La exportación no terminó; vuelve a intentarlo.")}

    return JsonResponse({'status': job['status'], 'error': job.get('error', '')})


@login_required
def exportar_semana_download(request, token):
    job = _trabajo_del_usuario(request, token)
    
    if not job or job['status'] != 'ready':
        logger.error("Exportar semana: descarga del trabajo %s no disponible en este proceso (pid %s): %s",
                     token, os.getpid(), job and job.get('status'))
        messages.error(request, aviso(_('Archivo no disponible'), _('Todavía se está generando o ya se descargó')))
        return redirect('mto:lista_plan')

    path     = job['path']
    filename = job['filename']
    
    try:
        with open(path, 'rb') as f:
            content = f.read()
    except OSError:   # otro clic ya lo descargó y lo borró, o lo borró la limpieza
        logger.error("Exportar semana: el archivo del trabajo %s ya no existe", token)
        messages.error(request, aviso(_('Archivo no disponible'), _('Todavía se está generando o ya se descargó')))
        return redirect('mto:lista_plan')
    
    for r in (path, _ruta_trabajo(token)):   # ya se entregó: se borran el Excel y su estado
        try:
            os.unlink(r)
        except OSError:
            pass

    response = HttpResponse(
        content,
        content_type='application/vnd.ms-excel.sheet.macroEnabled.12'
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
