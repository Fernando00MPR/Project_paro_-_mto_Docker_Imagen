import io
import json
import logging

from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.http import HttpResponseForbidden, JsonResponse
from django.utils import timezone
from login_app.permisos import puede_mto
from .utils import puede_llenar_mto
from django.views.decorators.clickjacking import xframe_options_exempt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from django.utils.translation import gettext as _

from collections import Counter, defaultdict
from django.db.models import Count
from django.http import HttpResponse
from ..models import Area, PlanMantenimiento, RegistroEjecucion, Responsable, SeguimientoOT, ImagenRegistro, ImagenSeguimiento
from django.urls import reverse
from .utils import areas_visibles_mto, area_del_plan, puede_ver_plan, puede_asignar_responsable
from .utils import _planes_que_tocan, lunes_de_semana, INTERVALO, _aplicar_orden_plan, _orden_por_plan_trabajo, numeros_ot_semana, numero_ot
from menu_app.avisos import aviso

logger = logging.getLogger(__name__)


# referencia semanal por persona (el modal "Tiempo por persona")
CAPACIDAD_HORAS_PERSONA = 24   

# Columnas del Excel del plan: las comparten Exportar plan y la plantilla, en el orden que lee planes_importar.py
ENCABEZADOS_EXCEL_PLAN = [
    '', 'CODIGO', 'RUTINA', 'EQUIPO (descripcion tarea)', 'Duracion (horas)',
    'Frecuencia', 'Plan de Trabajo', 'Equipo (nombre corto)', 'Locacion',
    'Tipo de mantenimiento', 'Prioridad', 'Status', 'Semana inicio', 'Anio inicio'
    ]
ANCHOS_EXCEL_PLAN = [5, 14, 18, 40, 16, 12, 14, 30, 25, 22, 12, 12, 14, 12]

def carga_por_persona(items):
    """items: [(plan, registro_o_None)] de UNA semana → horas programadas por responsable.
    Las Canceladas no cuentan; las Completadas sí. Persona + sin asignar = total."""
    sin = {'min': 0, 'n': 0, 'tareas': []}
    personas = {}
    total = 0
    for plan, reg in items:
        if reg and reg.estado == 'cancelada':
            continue
        m = plan.duracion_minutos or 0
        total += m
        t = {'pk': plan.pk, 'codigo': plan.codigo, 'actividad': plan.actividad,
             'estado': reg.estado if reg else 'sin_registro', 'min': m}
        if reg and reg.responsable_id:
            d = personas.setdefault(reg.responsable_id, {
                'id': reg.responsable_id, 'nombre': reg.responsable.nombre_completo(),
                'min': 0, 'n': 0, 'tareas': []})
        else:
            d = sin
        d['min'] += m
        d['n'] += 1
        d['tareas'].append(t)
    lista = sorted(personas.values(), key=lambda x: (-x['min'], x['nombre']))
    return {
        'total_min': total, 
        'total_n':   sum(x['n'] for x in lista) + sin['n'],
        'sin':       sin, 
        'personas':  lista, 
        'capacidad': CAPACIDAD_HORAS_PERSONA
    }


@login_required
def lista_plan(request):
    """Plan de mantenimiento: tareas del área que tocan en la semana elegida (o todas con ?todo=1), con buscador,
    filtro de frecuencia, orden, KPIs, carga por persona y la vista de celular. Siempre en un área del usuario
    (area_del_plan). Diagrama: docs/flujos/01-plan-mantenimiento.md"""

    acceso = getattr(request.user, 'acceso_mto', None)
    if not puede_ver_plan(request):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        return redirect('mto:dashboard')
    
    frecuencia     = request.GET.get('frecuencia')
    busqueda       = request.GET.get('q', '').strip()
    filtro_semana  = request.GET.get('semana', '').strip()
    filtro_anio    = request.GET.get('anio', '').strip()
    ver_todo       = request.GET.get('todo') == '1'
    filtro_semana  = '' if ver_todo else request.GET.get('semana', '').strip()
    filtro_anio    = '' if ver_todo else request.GET.get('anio', '').strip()
    orden          = request.GET.get('orden', '').strip()

    
    # Sin semana en la URL (p. ej. al entrar desde el menú lateral): se redirige de una
    # vez a la semana actual, antes de armar la página. Antes lo hacía el JS después de
    # pintarla, y la página se cargaba dos veces.
    if not ver_todo and not filtro_semana:
        params = request.GET.copy()
        anio_iso, semana_iso, _dia = timezone.localdate().isocalendar()
        params['semana'], params['anio'] = str(semana_iso), str(anio_iso)
        return redirect(f"{request.path}?{params.urlencode()}")

    # Solo los manda la vista de celular (escritorio no los usa):
    filtro_resp   = request.GET.get('resp', '').strip()     # id de responsable o 'ninguno'
    filtro_estado = request.GET.get('estado', '').strip()   # 'pend' | 'hechas' | '' (todas)

    planes = PlanMantenimiento.objects.select_related('area').filter(activo=True)

    # Siempre un área del usuario (nunca otra por URL, ni todas mezcladas): ver area_del_plan
    area_id = area_del_plan(request)
    request.session['lista_plan_area_id'] = area_id
    planes = planes.filter(area_id=area_id) if area_id else planes.none()
    planes = _aplicar_orden_plan(planes, request.GET)

    hoy         = date.today()
    anio_filtro = int(filtro_anio) if filtro_anio.isdigit() else hoy.year

    planes_list = list(planes)
    areas_mto   = list(areas_visibles_mto(request))

    responsables_por_area_dict = defaultdict(list)
    for r in Responsable.objects.filter(activo=True).order_by('apellidos', 'nombre'):
        responsables_por_area_dict[r.area_id].append({
            'pk':            r.pk, 
            'nombre':        r.nombre, 
            'apellidos':     r.apellidos,
            'numero_nomina': r.nomina_visible(),
        })

    lunes_busq_pre       = None
    registros_semana_pre = {}
    if filtro_semana:
        try:
            lunes_busq_pre = lunes_de_semana(anio_filtro, int(filtro_semana))
            registros_semana_pre = {
                r.plan_id: r
                for r in RegistroEjecucion.objects.select_related('responsable').filter(
                    plan_id__in=[p.id for p in planes_list],
                    semana_inicio=lunes_busq_pre,
                )
            }
        except Exception:
            lunes_busq_pre = None

    # Buscador: el responsable es de la semana, por eso se filtra ya con sus registros cargados
    if busqueda:
        buscado = busqueda.lower()
        def _coincide(p):
            reg = registros_semana_pre.get(p.id)
            textos = (p.actividad, p.codigo, p.rutina, reg.nombre_responsable() if reg else '')
            return any(buscado in (t or '').lower() for t in textos)
        planes_list = [p for p in planes_list if _coincide(p)]

    # No. de OT igual que Exportar Excel: se numera con TODOS los planes activos del área esa semana
    # (sin buscador ni frecuencia), así el número de cada OT no cambia al filtrar u ordenar la lista
    numeros_ot = {}
    if lunes_busq_pre:
        base_ot = PlanMantenimiento.objects.select_related('area').filter(activo=True)
        if area_id:
            base_ot = base_ot.filter(area_id=area_id)
        numeros_ot = numeros_ot_semana(list(base_ot), lunes_busq_pre)


    planes_con_datos = []

    for plan in planes_list:
        plan.no_ot                 = numeros_ot.get(plan.id, '')   # '' = fuera de frecuencia (no sale en el Excel)
        plan.proximo               = None
        plan.semana_inicio_lunes   = None
        plan.semana_inicio_domingo = None
        plan.registro_semana       = None
        plan.semana_actual         = None
        plan.fuera_de_frecuencia   = False

        if plan.semana_inicio and plan.anio_inicio:
            try:
                intervalo = INTERVALO.get(plan.frecuencia, 1)
                ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)

                plan.semana_inicio_lunes   = ref_lunes
                plan.semana_inicio_domingo = ref_lunes + timedelta(days=6)

                cursor = ref_lunes
                while cursor < hoy:
                    cursor += timedelta(weeks=intervalo)
                iso          = cursor.isocalendar()
                plan.proximo = {
                    'semana':  iso[1],
                    'lunes':   cursor,
                    'domingo': cursor + timedelta(days=6),
                }

                if filtro_semana:
                    if lunes_busq_pre is None:
                        continue

                    lunes_busq  = lunes_busq_pre
                    delta       = (lunes_busq - ref_lunes).days
                    semanas     = delta // 7
                    en_cadencia = delta >= 0 and semanas % intervalo == 0
                    registro    = registros_semana_pre.get(plan.id)

                    # Si la semana ya no calza con la frecuencia actual pero
                    # tiene un registro guardado (se completó/registró bajo
                    # una frecuencia anterior), se sigue mostrando — solo se
                    # salta cuando ni calza ni hay nada que mostrar.
                    if not en_cadencia and not registro:
                        continue

                    plan.fuera_de_frecuencia = not en_cadencia
                    plan.semana_actual = {
                        'semana':  int(filtro_semana),
                        'lunes':   lunes_busq,
                        'domingo': lunes_busq + timedelta(days=6),
                    }

                    plan.registro_semana = registro

            except Exception:
                if filtro_semana:
                    continue

        elif filtro_semana:
            continue

        planes_con_datos.append(plan)

    # Conteos del control segmentado de frecuencia (sobre la semana, sin filtrar por frecuencia)
    conteo_frec = defaultdict(int)
    for p in planes_con_datos:
        conteo_frec[p.frecuencia] += 1

    frecuencias_conteo = [
        {'valor': v, 'label': l, 'n': conteo_frec.get(v, 0)}
        for v, l in PlanMantenimiento.FRECUENCIA_CHOICES if conteo_frec.get(v, 0) or v == frecuencia
    ]
    total_sin_frec = len(planes_con_datos)
    frec_elegida = next((f for f in frecuencias_conteo if f['valor'] == frecuencia), None)
    if frecuencia:
        planes_con_datos = [p for p in planes_con_datos if p.frecuencia == frecuencia]

    # ── Celular: carga por persona en la semana y filtro de persona ──
    def _estado_semana(p):
        reg = registros_semana_pre.get(p.pk)
        return reg.estado if reg else 'pendiente'

    carga_semana = {}
    carga_persona = None
    indicadores = None
    carga_total_min = carga_total_tareas = 0   # toda la semana (para "Sin asignar" en Horas por persona)
    if filtro_semana and lunes_busq_pre:
        carga_total_min    = sum(p.duracion_minutos or 0 for p in planes_con_datos)
        carga_total_tareas = len(planes_con_datos)
        for p in planes_con_datos:
            reg = registros_semana_pre.get(p.pk)
            if reg and reg.responsable_id:
                c = carga_semana.setdefault(str(reg.responsable_id), {'tareas': 0, 'minutos': 0})
                c['tareas']  += 1
                c['minutos'] += p.duracion_minutos or 0
        carga_persona = carga_por_persona([(p, registros_semana_pre.get(p.pk)) for p in planes_con_datos])
        activos_sem = [p for p in planes_con_datos
                       if _estado_semana(p) != 'cancelada']
        indicadores = {
            'programados':   len(planes_con_datos),
            'min_trabajo':   carga_persona['total_min'],
            'completados':   sum(1 for p in planes_con_datos if _estado_semana(p) == 'completada'),
            'sin_resp':      carga_persona['sin']['n'],
            'activos_sem':   len(activos_sem),
        }
        indicadores['pct_completados'] = (
            round(indicadores['completados'] * 100 / indicadores['programados'])
            if indicadores['programados'] else 0)
        if filtro_resp:
            def _resp_de(p):
                reg = registros_semana_pre.get(p.pk)
                return str(reg.responsable_id) if reg and reg.responsable_id else 'ninguno'
            planes_con_datos = [p for p in planes_con_datos if _resp_de(p) == filtro_resp]

    planes_con_datos = _orden_por_plan_trabajo(planes_con_datos, orden)

    # ── Celular: avance de la semana y filtro de estado ──
    # Pendiente = sin completar, reagendar ni cancelar (mismo criterio que el
    # dashboard). El avance no depende del filtro de estado; sí de los demás.
    avance_movil = None
    conteo_pend = conteo_hechas = 0
    if filtro_semana and lunes_busq_pre:
        conteo_hechas = sum(1 for p in planes_con_datos if _estado_semana(p) == 'completada')
        conteo_pend   = sum(1 for p in planes_con_datos
                            if _estado_semana(p) not in ('completada', 'reagendada', 'cancelada'))
        minutos_mov   = sum(p.duracion_minutos or 0 for p in planes_con_datos)
        total_mov     = len(planes_con_datos)
        avance_movil  = {
            'total':         total_mov,
            'completadas':   conteo_hechas,
            'pendientes':    conteo_pend,
            'horas':         minutos_mov // 60,
            'minutos_resto': minutos_mov % 60,
            'pct':           max(1, round(conteo_hechas * 100 / total_mov)) if total_mov else 1,
        }
        if filtro_estado == 'pend':
            planes_con_datos = [p for p in planes_con_datos
                                if _estado_semana(p) not in ('completada', 'reagendada', 'cancelada')]
        elif filtro_estado == 'hechas':
            planes_con_datos = [p for p in planes_con_datos if _estado_semana(p) == 'completada']

    # Sin ?per_page= se usa la última elección del usuario (cookie de page_size_toggle.js), para
    # pintar la tabla con su tamaño desde el principio, sin que el JS recargue la página.
    per_page_raw = request.GET.get('per_page') or request.COOKIES.get('pst_pageSize_plan', '10')     
    per_page     = per_page_raw if per_page_raw in ('10', '25', '50') else '10'
    paginator    = Paginator(planes_con_datos, int(per_page))
    page_num     = request.GET.get('page', 1)
    planes_page  = paginator.get_page(page_num)

    # Paginación de escritorio: 1 2 3 … última (None = puntos suspensivos)
    n_pag, act = paginator.num_pages, planes_page.number
    visibles = sorted({1, n_pag, act - 1, act, act + 1} & set(range(1, n_pag + 1)))
    paginas = []
    for n in visibles:
        if paginas and n - paginas[-1] > 1:
            paginas.append(None)
        paginas.append(n)
    q_pag = request.GET.copy()
    q_pag.pop('page', None)

    ctx = {
        'planes':                    planes_page,
        'paginas':                   paginas,
        'qs_pag':                    q_pag.urlencode(),
        'anio_actual':               hoy.year,
        'areas':                     areas_mto,
        'areas_menu':                areas_mto,
        'frecuencias':               PlanMantenimiento.FRECUENCIA_CHOICES,
        # Modal "Nueva / Editar tarea" (plan/form.html)
        'tarea_frecuencias':         [{'valor': v, 'label': l, 'semanas': INTERVALO.get(v, 1)} for v, l in PlanMantenimiento.FRECUENCIA_CHOICES],
        'tipos_mto':                 PlanMantenimiento.TIPO_MTO_CHOICES,
        'prioridades':               PlanMantenimiento.PRIORIDAD_CHOICES,
        'status_opts':               PlanMantenimiento.STATUS_CHOICES,
        'filtro_area':               area_id,
        'filtro_frec':               frecuencia,
        'filtro_semana':             filtro_semana,
        'ver_todo':                  ver_todo,
        'puede_ver_historial':       puede_mto(request.user, 'ver_rutinas'),
        'puede_ver_responsables':    puede_mto(request.user, 'ver_responsables'),
        'puede_editar_responsables': puede_mto(request.user, 'editar_responsables'),
        'filtro_orden':              orden,
        'busqueda':                  busqueda,
        'filtro_anio':               anio_filtro,
        'per_page':                  per_page,
        'perpage_opts':              [10, 25, 50],
        'responsables_por_area': {
            str(a.pk): responsables_por_area_dict[a.id]
            for a in areas_mto
        },
        'puede_asignar_responsable': puede_asignar_responsable(request.user),
        'puede_editar_plan': (
            request.user.is_superuser or
            (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
            (acceso and acceso.editar_plan_mantenimiento)
        ),
        'puede_eliminar_plan': (
            request.user.is_superuser or
            (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
            (acceso and acceso.eliminar_plan_mantenimiento)
        ),
        'puede_eliminar_todos_planes': (
            request.user.is_superuser or
            (hasattr(request.user, 'perfil') and request.user.perfil.es_admin)
        ),
        'frecuencias_conteo':     frecuencias_conteo,
        'total_sin_frec':         total_sin_frec,
        'frec_elegida':           frec_elegida,
        'indicadores':            indicadores,
        'carga_persona':          carga_persona,
        'area_nombre':            next((a.nombre for a in areas_mto if str(a.pk) == str(area_id)), ''),
        'total_activos_area':     PlanMantenimiento.objects.filter(activo=True, area_id=area_id).count() if area_id else 0,
        'total_planes_area':      PlanMantenimiento.objects.filter(area_id=area_id).count() if area_id else 0,
        # Vista de celular
        'filtro_resp':            filtro_resp,
        'filtro_estado':          filtro_estado,
        'avance_movil':           avance_movil,
        'conteo_pend':            conteo_pend,
        'conteo_hechas':          conteo_hechas,
        'carga_semana':           carga_semana,
        'carga_total_min':        carga_total_min,
        'carga_total_tareas':     carga_total_tareas,
        'semana_lunes':           lunes_busq_pre,
        'semana_domingo':         lunes_busq_pre + timedelta(days=6) if lunes_busq_pre else None,
    }
    return render(request, 'mto_app/plan/lista.html', ctx)


_LIMITES_TAREA = {'codigo': 50, 'rutina': 200, 'plan_trabajo': 100, 'actividad': 255, 'nombre_equipo': 200, 'locacion': 200}


def _tarea_json(plan):
    """Datos de una tarea para llenar el modal "Editar tarea"."""
    return {
        'pk': plan.pk, 'codigo': plan.codigo, 'rutina': plan.rutina, 'plan_trabajo': plan.plan_trabajo,
        'actividad': plan.actividad or '', 'area': plan.area_id, 'nombre_equipo': plan.nombre_equipo,
        'locacion': plan.locacion, 'tipo_mto': plan.tipo_mto, 'prioridad': plan.prioridad, 'estatus': plan.estatus,
        'frecuencia': plan.frecuencia, 'semana_inicio': plan.semana_inicio, 'anio_inicio': plan.anio_inicio,
        'duracion_minutos': plan.duracion_minutos, 'activo': plan.activo,
    }


def _guardar_tarea_ajax(request, plan):
    """Modal "Nueva / Editar tarea": valida y guarda; responde JSON con los errores por campo."""
    P = request.POST
    errores = {}
    datos = {c: P.get(c, '').strip() for c in _LIMITES_TAREA}
    for campo, limite in _LIMITES_TAREA.items():
        if campo != 'nombre_equipo' and not datos[campo]:
            errores[campo] = _("Campo obligatorio")
        elif len(datos[campo]) > limite:
            errores[campo] = _("Máximo {n} caracteres").format(n=limite)

    area = areas_visibles_mto(request).filter(pk=P['area']).first() if P.get('area', '').isdigit() else None
    if not area:
        errores['area'] = _("Campo obligatorio")

    frecuencia = P.get('frecuencia', '')
    if frecuencia not in dict(PlanMantenimiento.FRECUENCIA_CHOICES):
        errores['frecuencia'] = _("Elige una frecuencia")

    semana = anio = None
    try:
        semana, anio = int(P.get('semana_inicio', '')), int(P.get('anio_inicio', ''))
        if not 2000 <= anio <= 2100:
            raise ValueError
        lunes_de_semana(anio, semana)   # solo acepta S53 en los años que la tienen
    except ValueError:
        errores['semana_inicio'] = (_("Semana no válida para {anio}").format(anio=anio) if anio
                                    else _("Elige la primera semana"))

    try:
        duracion = int(P.get('duracion_minutos', ''))
        if not 0 < duracion <= 1440:
            raise ValueError
    except ValueError:
        duracion = None
        errores['duracion_minutos'] = _("Escribe los minutos (ej. 60)")

    # El código se puede repetir en otras áreas, pero no dentro de la misma (igual que Importar Excel)
    if area and datos['codigo'] and 'codigo' not in errores:
        repetido = PlanMantenimiento.objects.filter(area=area, codigo=datos['codigo'])
        if plan:
            repetido = repetido.exclude(pk=plan.pk)
        if repetido.exists():
            errores['codigo'] = _("Ya existe una tarea con el código {x}").format(x=datos['codigo'])

    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)

    tipo, prioridad, estatus = P.get('tipo_mto'), P.get('prioridad'), P.get('estatus')
    objeto = plan or PlanMantenimiento()
    for campo, valor in datos.items():
        setattr(objeto, campo, valor)
    objeto.area, objeto.frecuencia, objeto.duracion_minutos = area, frecuencia, duracion
    objeto.semana_inicio, objeto.anio_inicio = semana, anio
    objeto.tipo_mto = tipo if tipo in dict(PlanMantenimiento.TIPO_MTO_CHOICES) else 'Preventivo'
    objeto.prioridad = prioridad if prioridad in dict(PlanMantenimiento.PRIORIDAD_CHOICES) else 'Baja'
    objeto.activo = P.get('activo') == '1'
    if plan and estatus in dict(PlanMantenimiento.STATUS_CHOICES):   # al crear siempre nace Abierta (default)
        objeto.estatus = estatus
    objeto.save()
    return JsonResponse({'ok': True, 'pk': objeto.pk, 'codigo': objeto.codigo})


@login_required
def form_plan(request, pk=None):
    """Nueva / Editar tarea. El formulario es un modal de la lista del Plan (plan/form.html): por AJAX, GET da los
    datos y POST guarda. La dirección normal lleva a la lista y el JS abre el modal con el fragmento (#nueva)."""
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not puede_mto(request.user, 'editar_plan_mantenimiento'):
        msg = _("No tienes permiso para editar planes de mantenimiento.")
        if es_ajax:
            return JsonResponse({'ok': False, 'errores': {'general': msg}}, status=403)
        messages.error(request, aviso(_("Sin permiso"), msg.rstrip('.')))
        return redirect('mto:lista_plan')

    plan = get_object_or_404(PlanMantenimiento, pk=pk) if pk else None
    if plan and not puede_ver_plan(request, plan):
        msg = _("No tienes acceso a las tareas de esta área.")
        if es_ajax:
            return JsonResponse({'ok': False, 'errores': {'general': msg}}, status=403)
        messages.error(request, aviso(_("Sin acceso a esta área"), msg.rstrip('.')))
        return redirect('mto:lista_plan')
    if es_ajax and request.method == 'POST':
        return _guardar_tarea_ajax(request, plan)
    if es_ajax and plan:
        return JsonResponse(_tarea_json(plan))
    return redirect(reverse('mto:lista_plan') + (f'#editar-{plan.pk}' if plan else '#nueva'))


@login_required
def eliminar_plan(request, pk):
    """Elimina una tarea del Plan (POST; permiso Eliminar plan y área del usuario). Borra en cascada todo su
    historial: registros de ejecución, sus fotos y sus seguimientos de OT. Por AJAX (GET) responde cuánto historial
    tiene, para que la confirmación lo advierta antes de borrar."""
    if not puede_mto(request.user, 'eliminar_plan_mantenimiento'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar planes de mantenimiento")))
        return redirect('mto:lista_plan')

    plan = get_object_or_404(PlanMantenimiento, pk=pk)
    if not puede_ver_plan(request, plan):
        messages.error(request, aviso(_("Sin acceso a esta área"), _("No tienes acceso a sus tareas")))
        return redirect('mto:lista_plan')

    if request.method == 'GET' and request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({
            'registros':      RegistroEjecucion.objects.filter(plan=plan).count(),
            'fotos':          ImagenRegistro.objects.filter(registro__plan=plan).count(),
            'seguimientos':   SeguimientoOT.objects.filter(registro__plan=plan).count(),
            'fotos_seg':      ImagenSeguimiento.objects.filter(seguimiento_ot__registro__plan=plan).count(),
        })

    if request.method == 'POST':
        codigo = plan.codigo
        plan.delete()
        messages.success(request, aviso(_("Tarea eliminada"), codigo))
    return redirect('mto:lista_plan')


@login_required
def eliminar_todos_planes_area(request):
    """Borra todas las tareas del área y su historial (POST; solo superusuario o administrador; hay que escribir
    ELIMINAR para confirmar)."""

    es_admin_total = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin)
    )
    if not es_admin_total:
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar todos los planes del área")))
        return redirect('mto:lista_plan')

    area_id = request.POST.get('area')
    if request.method == 'POST' and area_id:
        if request.POST.get('confirmacion', '').strip() != 'ELIMINAR':
            messages.error(request, aviso(_("No se eliminó nada"), _("Escribe ELIMINAR para confirmar")))
            return redirect(f"{reverse('mto:lista_plan')}?area={area_id}")
        area = get_object_or_404(Area, pk=area_id)
        cantidad = PlanMantenimiento.objects.filter(area=area).count()
        PlanMantenimiento.objects.filter(area=area).delete()
        messages.success(request, aviso(_("Tareas eliminadas"),
                                        _("{cantidad} de {area}, con su historial").format(cantidad=cantidad, area=area.nombre)))
    return redirect(f"{reverse('mto:lista_plan')}?area={area_id}")


@login_required
def exportar_plan(request):
    """Excel con las tareas activas del área, con las mismas columnas que la plantilla para poder reimportarlo."""
    if not puede_ver_plan(request):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para exportar planes de mantenimiento")))
        return redirect('mto:lista_plan')

    area_id = area_del_plan(request)
    planes  = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    planes  = planes.filter(area_id=area_id) if area_id else planes.none()

    wb = Workbook()
    ws = wb.active
    ws.title = "Plan de mantenimiento"

    ws.append([])  # Fila 1
    ws.append([])  # Fila 2
    ws.append(ENCABEZADOS_EXCEL_PLAN)  # Fila 3

    # orden del modelo: área, actividad y código
    for plan in planes: 
        codigo_frecuencia = f"{INTERVALO.get(plan.frecuencia, 4)}S"
        ws.append([
            '',
            plan.codigo,
            plan.rutina,
            plan.actividad,
            round(plan.duracion_minutos / 60, 2),
            codigo_frecuencia,
            plan.plan_trabajo,
            plan.nombre_equipo,
            plan.locacion,
            plan.tipo_mto,
            plan.prioridad,
            plan.estatus,
            plan.semana_inicio or '',
            plan.anio_inicio or '',
        ])

    for cell in ws[3][1:]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[3].height = 30

    # Centrar todas las filas de datos (una por plan)
    for row in ws.iter_rows(min_row=4, max_row=ws.max_row):
        for cell in row:
            cell.alignment = Alignment(horizontal='center', vertical='center')

    for i, ancho in enumerate(ANCHOS_EXCEL_PLAN, 1):
        ws.column_dimensions[get_column_letter(i)].width = ancho

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    nombre_area = Area.objects.filter(id=area_id).first() if area_id else None
    slug = (nombre_area.nombre.replace(' ', '_') if nombre_area else 'todas')
    filename = f"plan_{slug}_{date.today().isoformat()}.xlsx"

    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _fechas_del_plan(plan, anio, hoy):
    """Ocurrencias del plan en el año ISO `anio`, con su registro si existe.
    La usan el modal de escritorio (modal_plan) y el detalle del celular
    (plan_detalle_json), así ambos muestran exactamente las mismas semanas."""

    fechas = []
    if plan.semana_inicio and plan.anio_inicio:
        intervalo = INTERVALO.get(plan.frecuencia, 1)
        try:
            ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
            fin_anio  = date(anio, 12, 31)

            # Semanas de frontera (p. ej. la S1 de un año puede empezar en
            # diciembre del año calendario anterior) pertenecen a `anio` por
            # año ISO aunque su lunes no caiga dentro de Jan 1–Dec 31 de ese
            # año. Por eso primero se arma la lista exacta de lunes a mostrar
            # (sin tocar la BD) y luego se buscan los registros por esa lista
            # exacta — en vez de un rango de fechas de calendario, que las
            # excluía y hacía que su tarjeta nunca reflejara el registro ya
            # guardado (quedaba en "Sin registro" aunque estuviera completada).
            cursores = []
            cursor   = ref_lunes
            while cursor <= fin_anio:
                if cursor.isocalendar()[0] == anio:
                    cursores.append(cursor)
                cursor += timedelta(weeks=intervalo)

            # Todos los registros de este año, calcen o no con la frecuencia
            # actual — así uno guardado bajo una frecuencia anterior (que ya
            # no cae en `cursores`) nunca desaparece del calendario, solo se
            # marca aparte (`fuera_de_frecuencia`).
            registros_anio = list(
                RegistroEjecucion.objects.filter(plan=plan, anio=anio)
                .select_related('responsable', 'validado_por')
                .annotate(n_fotos=Count('imagenes'))
                .prefetch_related('imagenes')
            )
            registros_map  = {r.semana_inicio: r for r in registros_anio}
            cursores_set   = set(cursores)

            for cursor in cursores:
                    fechas.append({
                        'fecha':               cursor,
                        'domingo':             cursor + timedelta(days=6),
                        'semana':              cursor.isocalendar()[1],
                        'registro':            registros_map.get(cursor),
                        'pasada':              cursor < hoy,
                        'actual':              (cursor.isocalendar()[1] == hoy.isocalendar()[1]
                                                 and cursor.year == hoy.year),
                        'fuera_de_frecuencia': False,
                    })

            for r in registros_anio:
                if r.semana_inicio not in cursores_set:
                    fechas.append({
                        'fecha':               r.semana_inicio,
                        'domingo':             r.semana_inicio + timedelta(days=6),
                        'semana':              r.semana_num,
                        'registro':            r,
                        'pasada':              r.semana_inicio < hoy,
                        'actual':              (r.semana_inicio.isocalendar()[1] == hoy.isocalendar()[1]
                                                 and r.semana_inicio.year == hoy.year),
                        'fuera_de_frecuencia': True,
                    })

            fechas.sort(key=lambda f: f['fecha'])
        except Exception:
            # El calendario sale vacío, pero queda en el log para encontrar la causa
            logger.exception('Calendario del plan %s (%s): no se pudo armar', plan.pk, anio)
    return fechas


_CATEGORIA_ESTADO = {'completada': 'completada', 'pendiente': 'pendiente', 'reagendada': 'pendiente', 'cancelada': 'cancelada'}


def _enriquecer_fechas(fechas, hoy):
    """Agrega a cada ocurrencia lo que usan el calendario y el historial del modal de escritorio:
    `cls` (color), `categoria` (chips del historial), `vencida` (semana pasada sin registro)
    y `exigible` (semana ya transcurrida o en curso, para el cumplimiento)."""
    lunes_hoy = hoy - timedelta(days=hoy.weekday())
    for f in fechas:
        r = f['registro']
        f['exigible'] = f['fecha'] <= lunes_hoy
        f['vencida'] = False
        # Fotos del registro para el visor del Historial (url + etiqueta Antes/Después).
        f['fotos_json'] = json.dumps([{'url': i.imagen.url, 'etiqueta': i.etiqueta} for i in r.imagenes.all()]) if (r := f['registro']) else '[]'
        if r:
            f['cls'] = r.estado
            f['categoria'] = _CATEGORIA_ESTADO.get(r.estado, 'pendiente')
        elif f['fecha'] < lunes_hoy:
            f['cls'], f['categoria'], f['vencida'] = 'vencida', 'sinreg', True
        elif f['fecha'] == lunes_hoy:
            f['cls'], f['categoria'] = 'sinreg', 'sinreg'
        else:
            f['cls'], f['categoria'] = 'proxima', 'proxima'
    return fechas


def numerar_seguimientos(seguimientos):
    """Asigna `no_orden` a cada SeguimientoOT: folio fijo OT + id con 8 dígitos (OT00000012), igual que los manuales (M00000012)."""
    for s in seguimientos:
        s.no_orden = f"OT{s.pk:07d}"
    return seguimientos


def _columnas_calendario(n, maximo=18):
    """Columnas del calendario: hasta `maximo` por fila y filas parejas (16 → 1 fila de 16; 27 → 2 de 14; 53 → 3 de 18)."""
    if n <= 0:
        return 1
    filas = -(-n // maximo)
    return -(-n // filas)


def _cumplimiento(fechas):
    """Completadas de las ocurrencias exigibles (semanas ya transcurridas, sin contar las canceladas)."""
    from .dashboard import META_CUMPLIMIENTO
    exigibles = [f for f in fechas if f['exigible'] and not (f['registro'] and f['registro'].estado == 'cancelada')]
    hechas = sum(1 for f in exigibles if f['registro'] and f['registro'].estado == 'completada')
    pct = round(100 * hechas / len(exigibles)) if exigibles else 0
    if not exigibles:
        nivel = 'neutro'
    elif pct >= META_CUMPLIMIENTO:
        nivel = 'ok'
    else:
        nivel = 'mal' if pct < 50 else 'bajo'
    return {'hechas': hechas, 'exigibles': len(exigibles), 'pct': pct, 'nivel': nivel}


@login_required
@xframe_options_exempt
def modal_plan(request, pk):
    """Detalle de una tarea (página dentro de un <iframe>): calendario del año, cumplimiento, historial y
    seguimientos; abre "Registrar ejecución" en la semana de la lista (?semana=) o en la actual."""
    
    plan = get_object_or_404(PlanMantenimiento, pk=pk)
    if not puede_ver_plan(request, plan):
        return HttpResponseForbidden(_("No tienes acceso a las tareas de esta área."))
    hoy  = date.today()
    try:
        anio = int(request.GET.get('anio', hoy.year))
    except ValueError:
        anio = hoy.year

    fechas  = _enriquecer_fechas(_fechas_del_plan(plan, anio, hoy), hoy)
    proxima = next((f for f in fechas if not f['pasada']), None)
    cumplimiento = _cumplimiento(fechas)
    conteos = {c: sum(1 for f in fechas if f['categoria'] == c) for c in ('completada', 'pendiente', 'cancelada', 'sinreg', 'proxima')}

    # Todos los seguimientos ligados a este plan (cualquier semana); la fila muestra de qué semana es.
    seguimientos = list(SeguimientoOT.objects.filter(registro__plan=plan).select_related('registro')
                        .annotate(n_imgs=Count('imagenes')).order_by('-fecha_creacion'))
    numerar_seguimientos(seguimientos)
    for s in seguimientos:
        s.dias_vencido = (hoy - s.fecha_compromiso).days if s.fecha_compromiso and s.fecha_compromiso < hoy and s.estatus != 'completado' else 0
    seg_abiertos = [s for s in seguimientos if s.estatus != 'completado']

    # Si se abrió el modal desde una lista filtrada por semana (?semana=),
    # se abre automáticamente el formulario de "Registrar ejecución" de esa
    # semana — solo si de verdad es una ocurrencia real del plan en `fechas`.
    auto_semana = None
    semana_get = request.GET.get('semana', '').strip()
    if semana_get:
        try:
            semana_get = int(semana_get)
            if any(f['semana'] == semana_get for f in fechas):
                auto_semana = semana_get
        except ValueError:
            pass

    # Semana cargada en "Registrar ejecución": la de la lista de la que se abrió (?semana=); si no hay,
    # la semana en curso o la siguiente ocurrencia (o la última si el año ya pasó).
    sel_semana = auto_semana
    if sel_semana is None and fechas:
        lunes_hoy = hoy - timedelta(days=hoy.weekday())
        sel_semana = next((f for f in fechas if f['fecha'] >= lunes_hoy), fechas[-1])['semana']

    ctx = {
        'plan':           plan,
        'fechas':         fechas,
        'columnas':       _columnas_calendario(len(fechas)),
        'proxima':        proxima,
        'cumplimiento':   cumplimiento,
        'conteos':        conteos,
        'anio':           anio,
        'anio_anterior':  anio - 1,
        'anio_siguiente': anio + 1,
        'auto_semana':    auto_semana,
        'sel_semana':     sel_semana,
        'seguimientos':   seguimientos,
        'seg_abiertos':   len(seg_abiertos),
        'seg_total':      len(seguimientos),
        'seg_orden':      seg_abiertos[0].no_orden if seg_abiertos else '',
        'cfg_modal':      {'planPk': plan.pk, 'anio': anio, 'selSemana': sel_semana, 'rutina': plan.rutina,
                           'codigo': plan.codigo, 'nombre': plan.actividad or plan.rutina,
                           'resaltar': request.GET.get('resaltar', ''),
                           'permSeg': {'llenar':   puede_llenar_mto(request.user, 'seguimiento'),
                                       'editar':   puede_mto(request.user, 'editar_seguimiento'),
                                       'eliminar': puede_mto(request.user, 'eliminar_seguimiento')}},
    }
    return render(request, 'mto_app/plan/modal_calendario.html', ctx)


@login_required
def historial_plan_exportar(request, pk):
    """Excel con el historial del año del plan (la tabla "Historial del año" del modal)."""
    plan = get_object_or_404(PlanMantenimiento, pk=pk)
    if not puede_ver_plan(request, plan):
        return HttpResponseForbidden(_("No tienes acceso a las tareas de esta área."))
    hoy  = date.today()
    try:
        anio = int(request.GET.get('anio', hoy.year))
    except ValueError:
        anio = hoy.year
    fechas = _enriquecer_fechas(_fechas_del_plan(plan, anio, hoy), hoy)

    wb = Workbook()
    ws = wb.active
    ws.title = f'{plan.codigo} {anio}'[:31]
    encabezados = [_('Semana'), _('Fechas'), _('Estado'), _('Responsable'), _('Ejecutada'), _('Semanas de atraso'),
                   _('Validación'), _('Observaciones'), _('Fotos')]
    ws.append(encabezados)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill('solid', fgColor='EBEFFD')
    for f in fechas:
        r = f['registro']
        if r:
            estado = r.get_estado_display()
        else:
            estado = {'vencida': _('Sin registro · vencida'), 'sinreg': _('Sin registro'), 'proxima': _('Próxima')}[f['cls']]
        obs = (r.motivo_cancelacion if r and r.estado == 'cancelada' and r.motivo_cancelacion else
               (_('Rechazado: %(m)s') % {'m': r.motivo_rechazo} if r and r.validacion == 'rechazado' else (r.observaciones if r else '')))
        ws.append([
            f"S{f['semana']}",
            f"{f['fecha']:%d/%m/%Y} – {f['domingo']:%d/%m/%Y}",
            estado,
            r.nombre_responsable() if r and r.responsable else '',
            r.fecha_ejecucion if r and r.fecha_ejecucion else '',
            r.semanas_atraso if r and r.semanas_atraso else '',
            r.get_validacion_display() if r and r.estado == 'completada' else '',
            obs,
            getattr(r, 'n_fotos', 0) if r else 0,
        ])
    for fila in ws.iter_rows(min_row=2, min_col=5, max_col=5):
        fila[0].number_format = 'DD/MM/YYYY'
    for letra, ancho in zip('ABCDEFGHI', (9, 26, 22, 28, 13, 18, 14, 50, 8)):
        ws.column_dimensions[letra].width = ancho
    ws.freeze_panes = 'A2'

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    respuesta = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    respuesta['Content-Disposition'] = f'attachment; filename="Historial_{plan.codigo}_{anio}.xlsx"'
    return respuesta


@login_required
def plan_detalle_json(request, pk):
    """Detalle de una tarea para la vista de celular: mismas semanas que el
    modal de escritorio (_fechas_del_plan) + responsables del área. El guardado
    sigue usando registro_ejecucion / asignar_responsable."""
    plan = get_object_or_404(PlanMantenimiento.objects.select_related('area'), pk=pk)
    if not puede_ver_plan(request, plan):
        return JsonResponse({'error': _("No tienes acceso a las tareas de esta área.")}, status=403)
    hoy  = date.today()
    try:
        anio = int(request.GET.get('anio', hoy.year))
    except ValueError:
        anio = hoy.year

    fechas  = _enriquecer_fechas(_fechas_del_plan(plan, anio, hoy), hoy)
    proxima = next((f for f in fechas if not f['pasada']), None)
    responsables = Responsable.objects.filter(area=plan.area, activo=True).order_by('apellidos', 'nombre')

    def _corto(u):
        """"Felipe H." a partir del usuario que editó."""
        if not u:
            return ''
        n = (u.first_name or u.username).strip()
        return f"{n} {u.last_name.strip()[:1]}." if u.last_name.strip() else n

    semanas = []
    for f in fechas:
        r = f['registro']
        semanas.append({
            'semana':             f['semana'],
            'lunes':              f['fecha'].isoformat(),
            'domingo':            f['domingo'].isoformat(),
            'fuera':              f['fuera_de_frecuencia'],
            'estado':             r.estado if r else '',
            'cls':                f['cls'],
            'vencida':            f['vencida'],
            'registro_pk':        r.pk if r else None,
            'responsable_id':     r.responsable_id if r else None,
            'fecha_ejecucion':    r.fecha_ejecucion.isoformat() if r and r.fecha_ejecucion else '',
            'observaciones':      r.observaciones if r else '',
            'motivo_cancelacion': r.motivo_cancelacion if r else '',
            'reagendada_anio':    r.reagendada_anio if r else None,
            'reagendada_semana':  r.reagendada_semana if r else None,
            'semanas_atraso':     r.semanas_atraso if r else 0,
            'validacion':         r.validacion if r else 'por_validar',
            'validado_por_id':    r.validado_por_id if r else None,
            'validado_en':        timezone.localtime(r.validado_en).strftime('%d/%m/%Y') if r and r.validado_en else '',
            'motivo_rechazo':     r.motivo_rechazo if r else '',
            'editor':             _corto(r.modificado_por) if r else '',
            'fotos':              [{'id': i.pk, 'url': i.imagen.url, 'etiqueta': i.etiqueta} for i in r.imagenes.all()] if r else [],
        })

    seguimientos = list(SeguimientoOT.objects.filter(registro__plan=plan).select_related('registro', 'creado_por')
                        .annotate(n_imgs=Count('imagenes')).order_by('-fecha_creacion'))
    numerar_seguimientos(seguimientos)
    segs = [{
        'n_imgs':      s.n_imgs,
        'id':          s.pk,
        'orden':       s.no_orden,
        'registro_pk': s.registro_id,
        'semana':      s.registro.semana_num,
        'anio':        s.registro.anio,
        'problema':    s.problema,
        'accion':      s.accion,
        'responsable': s.responsable,
        'fecha':       s.fecha_compromiso.isoformat() if s.fecha_compromiso else '',
        'estatus':     s.estatus,
        'estatus_txt': str(s.get_estatus_display()),
        'notas':       s.notas,
        'vencido':     (hoy - s.fecha_compromiso).days if s.fecha_compromiso and s.fecha_compromiso < hoy and s.estatus != 'completado' else 0,
        'creado':      s.fecha_creacion.strftime('%d/%m/%Y'),
        'creado_iso':  timezone.localtime(s.fecha_creacion).date().isoformat(),
        'creado_por':  (s.creado_por.get_full_name() or s.creado_por.username) if s.creado_por else '',
    } for s in seguimientos]

    return JsonResponse({
        'plan': {
            'pk':               plan.pk,
            'codigo':           plan.codigo,
            'actividad':        plan.actividad or plan.rutina,
            'area':             plan.area.nombre,
            'frecuencia':       str(plan.get_frecuencia_display()),
            'duracion_minutos': plan.duracion_minutos or 0,
        },
        'anio':         anio,
        'hoy':          hoy.isoformat(),
        'proxima':      {'semana': proxima['semana'], 'lunes': proxima['fecha'].isoformat()} if proxima else None,
        'cumplimiento': _cumplimiento(fechas),
        'vencidas':     sum(1 for f in fechas if f['vencida']),
        'semanas':      semanas,
        'seguimientos': segs,
        'puede_validar': puede_mto(request.user, 'validar_plan_mantenimiento'),
        'permisos': {
            'llenar_plan':    puede_llenar_mto(request.user, 'plan_mantenimiento'),
            'editar_plan':    puede_mto(request.user, 'editar_plan_mantenimiento'),
            'eliminar_plan':  puede_mto(request.user, 'eliminar_plan_mantenimiento'),
            'validar':        puede_mto(request.user, 'validar_plan_mantenimiento'),
            'llenar_seg':     puede_llenar_mto(request.user, 'seguimiento'),
            'editar_seg':     puede_mto(request.user, 'editar_seguimiento'),
            'eliminar_seg':   puede_mto(request.user, 'eliminar_seguimiento'),
        },
        'max_fotos':    4,
        'responsables': [{'id': r.pk, 'nombre': r.nombre_completo(), 'nomina': r.nomina_visible()} for r in responsables],
    })



@login_required
def descargar_plantilla(request):
    """Excel de ejemplo para Importar plan (mismas columnas que Exportar plan)."""
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Plan de mantenimiento"

    ws.append([])  # Fila 1
    ws.append([])  # Fila 2
    ws.append(ENCABEZADOS_EXCEL_PLAN)
    ws.append([
        '', 'SWC-001', 'RMAS001-00P', 'Mantenimiento Mecanico a Transportador # 1',
        1.0, '17S', '1', 'Mesa Fija Conveyor # 01', 'Automatic Warehouse',
        'Preventivo', 'Baja', 'Abierta', 1, 2025
    ])

    ws.append([])
    ws.append(['','NOTA: Frecuencia: 1S=semanal, 2S=quincenal, 4S=mensual, 9S=bimestral, 13S=trimestral, 17S=cuatrimestral, 26S=semestral, 52S=anual'])

    for cell in ws[3][1:]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

    # Centrar la fila de ejemplo también
    for cell in ws[4]:
        cell.alignment = Alignment(horizontal='center', vertical='center')

    ws.row_dimensions[3].height = 30

    for i, ancho in enumerate(ANCHOS_EXCEL_PLAN, 1):
        ws.column_dimensions[get_column_letter(i)].width = ancho

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="Plantilla_Mantenimiento.xlsx"'
    return response


@login_required
def conteo_ots_semanas(request):
    """{semana: nº de OTs} de un año, para los globos del calendario de semanas del Plan. Mismo criterio que
    Exportar Excel: planes activos del área cuya frecuencia toca esa semana."""
    if not puede_ver_plan(request):
        return JsonResponse({}, status=403)
    try:
        anio = int(request.GET.get('anio'))
        ini, fin = lunes_de_semana(anio, 1), lunes_de_semana(anio + 1, 1)
    except (TypeError, ValueError):
        return JsonResponse({'error': 'anio'}, status=400)
    area_id = area_del_plan(request)
    planes = PlanMantenimiento.objects.filter(activo=True)
    planes = planes.filter(area_id=area_id) if area_id else planes.none()
    conteo = Counter()
    for p in planes.only('frecuencia', 'semana_inicio', 'anio_inicio'):
        if not p.semana_inicio or not p.anio_inicio:
            continue
        try:
            cursor = lunes_de_semana(p.anio_inicio, p.semana_inicio)
        except ValueError:
            continue
        paso = timedelta(weeks=INTERVALO.get(p.frecuencia, 1))
        if cursor < ini:   # salta directo al primer lunes del año que calza con la frecuencia
            cursor += paso * -(-(ini - cursor).days // paso.days)
        while cursor < fin:
            conteo[cursor.isocalendar()[1]] += 1
            cursor += paso
    return JsonResponse({str(s): n for s, n in conteo.items()})


@login_required
def distribucion_ots(request):
    """Datos del modal "Distribución de OTs por semana" (escritorio): por cada semana ISO del año, las OTs que
    programa el plan, con el mismo criterio y el mismo No. de orden que Exportar Excel. Completada = estado
    completada (validada si además la validó el supervisor); pendiente, reagendada y cancelada cuentan como
    pendientes."""
    if not puede_ver_plan(request):
        return JsonResponse({}, status=403)
    try:
        anio = int(request.GET.get('anio'))
        ini, fin = lunes_de_semana(anio, 1), lunes_de_semana(anio + 1, 1)
    except (TypeError, ValueError):
        return JsonResponse({'error': 'anio'}, status=400)
    area_id = area_del_plan(request)
    planes = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    planes = planes.filter(area_id=area_id) if area_id else planes.none()

    # Lunes en que toca cada plan dentro del año (se recorren en el orden del Excel: área y código)
    por_semana = defaultdict(list)
    for p in planes:
        if not p.semana_inicio or not p.anio_inicio:
            continue
        try:
            cursor = lunes_de_semana(p.anio_inicio, p.semana_inicio)
        except ValueError:
            continue
        paso = timedelta(weeks=INTERVALO.get(p.frecuencia, 1))
        if cursor < ini:
            cursor += paso * -(-(ini - cursor).days // paso.days)
        while cursor < fin:
            por_semana[cursor].append(p)
            cursor += paso
    regs = {(r.plan_id, r.semana_inicio): r for r in RegistroEjecucion.objects.select_related('responsable')
            .filter(plan__in=planes, semana_inicio__gte=ini, semana_inicio__lt=fin)}

    semanas, lunes = [], ini
    while lunes < fin:
        s = lunes.isocalendar()[1]
        ots = []
        for idx, p in enumerate(por_semana.get(lunes, []), start=1):
            r = regs.get((p.id, lunes))
            hecha = bool(r and r.estado == 'completada')
            ots.append({
                'no':     numero_ot(lunes, idx, p.area.prefijo_ot),   # igual que el Plan, el Backlog y Exportar Excel
                'codigo': p.codigo,
                'tarea':  p.actividad or p.rutina,
                'equipo': p.nombre_equipo,
                'resp':   r.nombre_responsable() if r else '',
                'est':    ('v' if r.validacion == 'validado' else 'c') if hecha else 'p',
            })
        c = sum(1 for o in ots if o['est'] != 'p')
        semanas.append({'s': s, 'lunes': lunes.isoformat(), 't': len(ots), 'c': c,
                        'v': sum(1 for o in ots if o['est'] == 'v'), 'p': len(ots) - c, 'ots': ots})
        lunes += timedelta(weeks=1)
    return JsonResponse({'anio': anio, 'semanas': semanas})


@login_required
def exportar_tiempo_personas(request):
    """Excel del modal "Tiempo por persona": una hoja resumen (persona, tareas, horas) y una de detalle."""
    if not puede_ver_plan(request):
        return JsonResponse({'error': _("No tienes permiso para exportar planes de mantenimiento.")}, status=403)
    try:
        semana = int(request.GET.get('semana'))
        anio   = int(request.GET.get('anio'))
        lunes  = lunes_de_semana(anio, semana)
    except (TypeError, ValueError):
        return JsonResponse({'error': 'semana'}, status=400)
    area_id = area_del_plan(request)
    planes = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    planes = planes.filter(area_id=area_id) if area_id else planes.none()
    frecuencia = request.GET.get('frecuencia')
    toca = _planes_que_tocan(list(planes), lunes)
    if frecuencia:
        toca = [p for p in toca if p.frecuencia == frecuencia]
    regs = {r.plan_id: r for r in RegistroEjecucion.objects.select_related('responsable')
            .filter(plan_id__in=[p.id for p in toca], semana_inicio=lunes)}
    datos = carga_por_persona([(p, regs.get(p.id)) for p in toca])

    def hhmm(m):
        return f"{m // 60}h {m % 60:02d}m"

    wb = Workbook()
    ws = wb.active
    ws.title = _("Resumen")[:31]
    ws.append([_("Persona"), _("Tareas"), _("Horas"), _("Minutos")])
    filas = ([(_("Sin asignar"), datos['sin'])] if datos['sin']['n'] else []) +             [(x['nombre'], x) for x in datos['personas']]
    for nombre, d in filas:
        ws.append([nombre, d['n'], round(d['min'] / 60, 2), d['min']])
    ws.append([_("Total"), datos['total_n'], round(datos['total_min'] / 60, 2), datos['total_min']])
    det = wb.create_sheet(_("Detalle")[:31])
    det.append([_("Persona"), _("Código"), _("Actividad"), _("Estado"), _("Duración")])
    for nombre, d in filas:
        for t in d['tareas']:
            det.append([nombre, t['codigo'], t['actividad'], t['estado'], hhmm(t['min'])])
    for hoja in (ws, det):
        for c in hoja[1]:
            c.font = Font(bold=True, color='FFFFFF')
            c.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        for col in hoja.columns:
            hoja.column_dimensions[col[0].column_letter].width = 22
    det.column_dimensions['C'].width = 50

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    area = Area.objects.filter(id=area_id).first() if area_id else None
    slug = area.nombre.replace(' ', '_') if area else 'todas'
    response = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = f'attachment; filename="tiempo_personas_{slug}_S{semana}-{anio}.xlsx"'
    return response
