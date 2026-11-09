import logging
import re
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _
from openpyxl import load_workbook

from login_app.permisos import puede_mto
from ..models import PlanMantenimiento
from .utils import INTERVALO, _frecuencia_desde_excel, areas_permitidas_mto
from menu_app.avisos import aviso

logger = logging.getLogger(__name__)


_RE_FRECUENCIA = re.compile(r'^(\d+)([SM]?)$')
_MAX_BYTES_IMPORTAR = 10 * 1024 * 1024


def _frecuencia_importada(valor):
    """Columna F del Excel → (frecuencia, aviso, error). Los códigos exactos (1S, 2S, 4S, 9S, 13S, 17S, 26S, 52S)
    pasan sin aviso; otro número (16S, 5S, 2M…) se acomoda a la frecuencia más cercana con un aviso."""
    if isinstance(valor, (int, float)):
        valor = str(int(valor))
    texto = (str(valor) if valor is not None else '').strip().upper().replace(' ', '')
    nombres = dict(PlanMantenimiento.FRECUENCIA_CHOICES)
    if not texto:
        return 'mensual', _("Frecuencia vacía: se usará 4S · {nombre}.").format(nombre=nombres['mensual']), None
    m = _RE_FRECUENCIA.match(texto)
    if not m:
        return None, None, _("Frecuencia '{f}' no reconocida. Usa 1S, 2S, 4S, 9S, 13S, 17S, 26S o 52S.").format(f=valor)
    frecuencia = _frecuencia_desde_excel(texto)
    if m.group(2) != 'M' and int(m.group(1)) == INTERVALO[frecuencia]:
        return frecuencia, None, None
    return frecuencia, _("'{f}' se tomará como {n}S · {nombre}.").format(
        f=texto, n=INTERVALO[frecuencia], nombre=nombres[frecuencia]), None


def _leer_plan_excel(archivo, area):
    """Lee el Excel del plan (mismas columnas que descargar_plantilla, datos desde la fila 4) SIN guardar nada.
    Devuelve (filas, ignoradas). Cada fila trae su estado ('ok' | 'warn' | 'err'), sus mensajes, lo que se
    muestra en la revisión y, si se puede importar, los `datos` para el modelo."""
    wb = load_workbook(archivo, read_only=True, data_only=True)
    ws = wb.active
    existentes = {c: (activo, sem) for c, activo, sem in
                  PlanMantenimiento.objects.filter(area=area).values_list('codigo', 'activo', 'semana_inicio')}
    opciones = {
        'tipo_mto':  ({v.lower(): v for v, _l in PlanMantenimiento.TIPO_MTO_CHOICES}, 'Preventivo', 9, _("Tipo de mantenimiento")),
        'prioridad': ({v.lower(): v for v, _l in PlanMantenimiento.PRIORIDAD_CHOICES}, 'Baja', 10, _("Prioridad")),
        'estatus':   ({v.lower(): v for v, _l in PlanMantenimiento.STATUS_CHOICES}, 'Abierta', 11, _("Estatus")),
    }
    nombres_frec = dict(PlanMantenimiento.FRECUENCIA_CHOICES)
    anio_hoy = timezone.localdate().year
    filas, fila_de_codigo, ignoradas = [], {}, 0

    for n, row in enumerate(ws.iter_rows(min_row=4, max_col=14, values_only=True), start=4):
        celdas = list(row) + [None] * (14 - len(row))
        txt = ['' if c is None else str(c).strip() for c in celdas]
        codigo = txt[1]
        if not codigo:
            ignoradas += any(txt[2:])            # filas con datos pero sin código: no se importan
            continue
        if codigo.upper() in ('CODIGO', 'CÓDIGO', '#', 'NONE') or codigo.upper().startswith('NOTA'):
            continue                             # encabezado o la nota de la plantilla
        rutina, actividad, plan_trabajo, equipo, locacion = txt[2], txt[3], txt[6], txt[7], txt[8]
        errores, avisos, marcas = [], [], {}

        faltan = [nombre for nombre, valor in ((_("Actividad"), actividad), (_("Locación"), locacion)) if not valor]
        if faltan:
            errores.append(_("Falta {campos}.").format(campos=', '.join(faltan)))
        for nombre, valor, limite in ((_("Código"), codigo, 50), (_("Rutina"), rutina, 200), (_("Actividad"), actividad, 255),
                                      (_("Plan de trabajo"), plan_trabajo, 100), (_("Equipo"), equipo, 200),
                                      (_("Locación"), locacion, 200)):
            if len(valor) > limite:
                errores.append(_("{campo}: máximo {n} caracteres.").format(campo=nombre, n=limite))

        # Duración (horas, columna E)
        duracion = 60
        if not txt[4]:
            avisos.append(_("Duración vacía: se usará 1 h."))
            marcas['d'] = 'warn'
        else:
            try:
                horas = float(txt[4].replace(',', '.'))
                if not 0 < horas <= 24:
                    raise ValueError
                duracion = max(1, round(horas * 60))
            except ValueError:
                errores.append(_("Duración '{v}' no válida: escribe las horas, por ejemplo 1.5 (máximo 24).").format(v=txt[4]))
                marcas['d'] = 'err'
                duracion = None

        # Frecuencia (columna F)
        frecuencia, aviso_f, error_f = _frecuencia_importada(celdas[5])
        if error_f:
            errores.append(error_f)
            marcas['f'] = 'err'
        elif aviso_f:
            avisos.append(aviso_f)
            marcas['f'] = 'warn'

        # Semana y año de inicio (columnas M y N)
        semana = anio = None
        try:
            semana = int(float(txt[12].replace(',', '.'))) if txt[12] else None
            anio = int(float(txt[13].replace(',', '.'))) if txt[13] else None
        except ValueError:
            errores.append(_("Semana o año de inicio no válidos."))
            marcas['i'] = 'err'
            semana = anio = None
        else:
            if semana and not anio:
                anio = anio_hoy
                avisos.append(_("Sin año de inicio: se usará {a}.").format(a=anio))
                marcas['i'] = 'warn'
            if semana and not 2000 <= anio <= 2100:
                errores.append(_("Año de inicio {a} fuera de rango.").format(a=anio))
                marcas['i'] = 'err'
            elif semana:
                ultima = date(anio, 12, 28).isocalendar()[1]
                if not 1 <= semana <= ultima:
                    errores.append(_("La semana {s} no existe en {a} (usa 1–{u}).").format(s=semana, a=anio, u=ultima))
                    marcas['i'] = 'err'
            elif not (existentes.get(codigo) or (None, None))[1]:
                avisos.append(_("Sin semana de inicio: la tarea no generará OTs hasta que la elijas."))
                marcas['i'] = 'warn'

        # Tipo, prioridad y estatus (columnas J, K y L): vacíos toman su valor por omisión sin aviso
        valores = {}
        for campo, (validos, defecto, i, nombre) in opciones.items():
            valor = validos.get(txt[i].lower())
            if txt[i] and not valor:
                avisos.append(_("Valor '{v}' no válido en {campo}: se usará {d}.").format(campo=nombre, v=txt[i], d=defecto))
            valores[campo] = valor or defecto

        actualiza = codigo in existentes
        if actualiza and not existentes[codigo][0]:
            avisos.append(_("La tarea estaba inactiva: se volverá a activar."))

        # El mismo código repetido en el archivo: se importa la última fila
        if codigo in fila_de_codigo:
            anterior = filas[fila_de_codigo[codigo]]
            anterior['errores'].append(_("Código repetido: se usará la fila {n}.").format(n=n))
        fila_de_codigo[codigo] = len(filas)

        datos = None
        if not errores:
            datos = dict(area=area, actividad=actividad, rutina=rutina, duracion_minutos=duracion, frecuencia=frecuencia,
                         plan_trabajo=plan_trabajo, nombre_equipo=equipo, locacion=locacion, activo=True, **valores)
            if semana:
                datos.update(semana_inicio=semana, anio_inicio=anio)
        filas.append({
            'fila': n, 'codigo': codigo, 'actividad': actividad, 'rutina': rutina, 'plan': plan_trabajo,
            'locacion': locacion, 'equipo': equipo, 'frec': txt[5], 'frec_nombre': str(nombres_frec[frecuencia]) if frecuencia else '',
            'semana': semana, 'anio': anio, 'duracion': duracion, 'actualiza': actualiza,
            'errores': errores, 'avisos': avisos, 'marcas': marcas, 'datos': datos,
        })

    for f in filas:
        f['estado'] = 'err' if f['errores'] else ('warn' if f['avisos'] else 'ok')
    wb.close()
    return filas, ignoradas


def _guardar_plan_importado(filas, area):
    """Crea o actualiza (por código dentro del área) las filas sin errores. Devuelve (creadas, actualizadas)."""
    validas = [f for f in filas if f['estado'] != 'err']
    existentes = {p.codigo: p for p in PlanMantenimiento.objects.filter(area=area, codigo__in=[f['codigo'] for f in validas])}
    nuevas, cambiadas = [], []
    for f in validas:
        plan = existentes.get(f['codigo'])
        if plan:
            for campo, valor in f['datos'].items():
                setattr(plan, campo, valor)
            cambiadas.append(plan)
        else:
            nuevas.append(PlanMantenimiento(codigo=f['codigo'], **f['datos']))
    with transaction.atomic():
        PlanMantenimiento.objects.bulk_create(nuevas)
        if cambiadas:
            PlanMantenimiento.objects.bulk_update(cambiadas, [
                'area', 'actividad', 'rutina', 'duracion_minutos', 'frecuencia', 'plan_trabajo', 'nombre_equipo',
                'locacion', 'tipo_mto', 'prioridad', 'estatus', 'activo', 'semana_inicio', 'anio_inicio'])
    return len(nuevas), len(cambiadas)


@login_required
def importar_plan(request):
    """Importar plan desde Excel. Es un modal de la lista del Plan (plan/importar.html), en 3 pasos:
    1) elegir área y archivo; 2) revisar fila por fila (paso=verificar: no guarda nada);
    3) importar (paso=importar: vuelve a leer el mismo archivo y guarda las filas sin errores).
    La dirección normal lleva a la lista y el JS abre el modal con el fragmento #importar."""
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not puede_mto(request.user, 'editar_plan_mantenimiento'):
        msg = _("No tienes permiso para editar planes de mantenimiento.")
        if es_ajax:
            return JsonResponse({'ok': False, 'error': msg}, status=403)
        messages.error(request, aviso(_("Sin permiso"), msg.rstrip('.')))
        return redirect('mto:lista_plan')
    if not (es_ajax and request.method == 'POST'):
        return redirect(reverse('mto:lista_plan') + '#importar')

    area_id = request.POST.get('area', '')
    area = areas_permitidas_mto(request).filter(pk=area_id).first() if area_id.isdigit() else None
    if not area:
        return JsonResponse({'ok': False, 'error': _("Elige el área a la que se importarán las tareas.")}, status=400)
    archivo = request.FILES.get('archivo')
    if not archivo or not archivo.name.lower().endswith(('.xlsx', '.xlsm')):
        return JsonResponse({'ok': False, 'error': _("Sube un archivo de Excel (.xlsx).")}, status=400)
    if archivo.size > _MAX_BYTES_IMPORTAR:
        return JsonResponse({'ok': False, 'error': _("El archivo pesa más de 10 MB.")}, status=400)
    try:
        filas, ignoradas = _leer_plan_excel(archivo, area)
    except Exception:
        logger.exception('Importar plan: no se pudo leer %s', archivo.name)
        return JsonResponse({'ok': False, 'error': _("No se pudo leer el archivo. Revisa que sea la plantilla del plan en .xlsx.")}, status=400)

    if request.POST.get('paso') == 'importar':
        creadas, actualizadas = _guardar_plan_importado(filas, area)
        return JsonResponse({'ok': True, 'creadas': creadas, 'actualizadas': actualizadas,
                             'omitidas': [{'fila': f['fila'], 'codigo': f['codigo'], 'motivo': ' '.join(f['errores'])}
                                          for f in filas if f['estado'] == 'err']})
    return JsonResponse({'ok': True, 'area': area.nombre, 'ignoradas': ignoradas,
                         'filas': [{k: v for k, v in f.items() if k != 'datos'} for f in filas]})
