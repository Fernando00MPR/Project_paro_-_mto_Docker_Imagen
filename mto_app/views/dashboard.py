from collections import Counter
from datetime import date, timedelta
from urllib.parse import urlencode
import json
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils.translation import gettext as _, ngettext

from login_app.permisos import puede_mto
from ..models import PlanMantenimiento, RegistroEjecucion
from .utils import lunes_de_semana, INTERVALO, _planes_que_tocan, areas_visibles_mto, areas_ids_restringidas, puede_ver_plan
from .backlog import COLORES_AREA
from menu_app.avisos import aviso
from django.urls import reverse
from django.utils.formats import date_format


# Meta de cumplimiento semanal (la misma que separa "≥ 90%" / "< 90%" en escritorio).
META_CUMPLIMIENTO = 90
# Celular: órdenes vencidas que se cargan por bloque.
VENCIDAS_POR_BLOQUE = 20
# Escritorio: filas que se cargan por bloque en las tablas con scroll infinito
# (primeras 50 ya vienen en el HTML; de ahí en adelante se piden por AJAX).
FILAS_POR_BLOQUE_ESC = 50
# Celular: orden de los estados en "Detalles de la semana" (None = sin registro).
# También usado por escritorio para la tabla "Semana {n}" (mismo orden).
ORDEN_ESTADO = {None: 0, 'pendiente': 1, 'reagendada': 2, 'cancelada': 3, 'completada': 4}


def _url_plan(plan, lunes):
    """Abre el plan en el Plan de mantenimiento, en la semana dada (?abrir=)."""
    anio, semana, _dia = lunes.isocalendar()
    return reverse('mto:lista_plan') + '?' + urlencode({
        'area': plan.area_id, 'semana': semana, 'anio': anio,
        'q': plan.codigo, 'estado': 'todas', 'abrir': plan.pk,
    })


def _url_plan_semana(area_id, semana, anio, extra=None):
    """Abre el Plan de mantenimiento en la semana/área filtradas del dashboard.
    `extra` agrega parámetros adicionales (p. ej. resp=ninguno para "Asignar")."""
    params = {'semana': semana, 'anio': anio}
    if area_id:
        params['area'] = area_id
    if extra:
        params.update(extra)
    return reverse('mto:lista_plan') + '?' + urlencode(params)


def _nivel_atraso(semanas):
    """3 niveles de atraso (mismos umbrales/colores que dashboard_movil.js/css)."""
    if semanas <= 8:
        return 'ambar'
    if semanas <= 26:
        return 'rojo'
    return 'oscuro'


def _vencida_json(v, escritorio=False):
    plan = v['plan']
    data = {
        'codigo':     plan.codigo,
        'actividad':  plan.actividad,
        'area':       plan.area.nombre,
        'frecuencia': str(plan.get_frecuencia_display()),
        'semana':     v['semana'],
        'fecha':      date_format(v['lunes'], 'd M'),
        'atraso':     v['atraso'],
        'url':        _url_plan(plan, v['lunes']),
    }
    if escritorio:
        data['anio']  = v['lunes'].isocalendar()[0]
        data['nivel'] = _nivel_atraso(v['atraso'])
    return data


def _detalle_semana(planes_semana, registros_semana, lunes_filtro):
    """Lista de {plan, registro, estado, responsable, url} de la semana filtrada,
    ordenada: sin registro, pendiente, reagendada, cancelada, completada; luego
    código. La usan tanto el celular (detalle_movil) como la tabla de escritorio."""
    detalle = []
    for p in planes_semana:
        reg = registros_semana.get(p.id)
        detalle.append({
            'plan':               p,
            'registro':           reg,
            'estado':             reg.estado if reg else None,
            'responsable':        reg.responsable if reg else None,
            'responsable_nombre': reg.nombre_responsable() if reg else '',
            'url':                _url_plan(p, lunes_filtro),
        })
    detalle.sort(key=lambda x: (ORDEN_ESTADO.get(x['estado'], 5), x['plan'].locacion, x['plan'].actividad or '',  x['plan'].codigo))

    return detalle


def _pasa_filtro(item, f):
    """Espejo de pasaFiltro() en dashboard_movil.js: filtra "Detalles de la
    semana" por chip de estado. 'pendiente' agrupa pendiente + sin registro,
    igual que el KPI "Pendientes"."""
    if not f:
        return True
    if f == 'pendiente':
        return item['estado'] in (None, 'pendiente')
    if f == 'sin_resp':
        return not item['responsable']
    return item['estado'] == f


def _detalle_json(item):
    r = item['responsable']
    return {
        'codigo':      item['plan'].codigo,
        'actividad':   item['plan'].actividad,
        'responsable': item['responsable_nombre'] if r else None,
        'estado':      item['estado'] or 'sin_registro',
        'url':         item['url'],
    }


def _meta_area(n):
    return ngettext('%(n)s plan', '%(n)s planes', n) % {'n': n} if n else _('Sin planes')


@login_required
def dashboard(request):
    # Sin "Ver dashboard": a la primera sección que sí tenga. Plan, Backlog y las demás mandan aquí a quien no
    # tiene SU permiso, así que no hay ciclo.
    if not puede_mto(request.user, 'ver_dashboard'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        if puede_ver_plan(request):
            return redirect('mto:lista_plan')
        if puede_mto(request.user, 'ver_backlog'):
            return redirect('mto:backlog_seguimientos')
        return redirect('paros:lista_paros')

    hoy          = date.today()
    anio, semana_actual, _dia = hoy.isocalendar()   # año ISO: del 29 al 31 dic puede ser el siguiente, del 1 al 3 ene el anterior
    lunes_actual = hoy - timedelta(days=hoy.weekday())

    area_id = request.GET.get('area', '').strip()
    try:
        filtro_semana = int(request.GET.get('semana') or semana_actual)
        filtro_anio   = int(request.GET.get('anio')   or anio)
        if not 2000 <= filtro_anio <= 2100:
            raise ValueError
        lunes_filtro = lunes_de_semana(filtro_anio, filtro_semana)
    except ValueError:   # texto, año fuera de rango o semana que ese año no tiene: la semana actual (semana y año juntos)
        filtro_semana, filtro_anio, lunes_filtro = semana_actual, anio, lunes_actual

    areas = areas_visibles_mto(request)
    areas_ids = areas_ids_restringidas(request)
    if area_id and areas_ids is not None and area_id not in {str(i) for i in areas_ids}:
        area_id = ''        # un ?area= de otra área se ignora

    todos_planes = list(PlanMantenimiento.objects.select_related('area').filter(activo=True))
    if areas_ids is not None:
        todos_planes = [p for p in todos_planes if p.area_id in areas_ids]
    planes_list  = [p for p in todos_planes if not area_id or str(p.area_id) == area_id]

    planes_semana = _planes_que_tocan(planes_list, lunes_filtro)

    pks_semana = [p.id for p in planes_semana]
    registros_semana = {
        r.plan_id: r
        for r in RegistroEjecucion.objects
            .filter(plan_id__in=pks_semana, semana_inicio=lunes_filtro)
            .select_related('responsable')
    }

    total_planes   = len(planes_list)
    total_semana   = len(planes_semana)

    completadas    = sum(1 for p in planes_semana
                        if registros_semana.get(p.id) and
                           registros_semana[p.id].estado == 'completada')
    pendientes = sum(1 for p in planes_semana
                if not registros_semana.get(p.id) or
                   registros_semana[p.id].estado not in ('completada', 'reagendada', 'cancelada'))
    sin_registro   = sum(1 for p in planes_semana
                        if not registros_semana.get(p.id))
    sin_responsable = sum(1 for p in planes_semana
                         if not (registros_semana.get(p.id) and
                                 registros_semana[p.id].responsable))

    area_nombre = None
    if area_id:
        area_nombre = next((a.nombre for a in areas if str(a.pk) == area_id), None)

    # Detalle de la semana (celular y escritorio comparten el mismo cálculo/orden).
    semana_detalle = _detalle_semana(planes_semana, registros_semana, lunes_filtro)
    detalle_movil  = semana_detalle
    conteo_estados = Counter(item['estado'] or 'sin_registro' for item in detalle_movil)

    # Escritorio: "Semana {n}" pide más filas (?detalle=1&desde=&filtro=) antes
    # de que se calculen las vencidas, que son más caras.
    if request.GET.get('detalle') == '1':
        filtro_chip = request.GET.get('filtro', '').strip()
        try:
            desde = max(int(request.GET.get('desde', 0)), 0)
        except ValueError:
            desde = 0
        lista = [x for x in semana_detalle if _pasa_filtro(x, filtro_chip)]
        return JsonResponse({
            'total': len(lista),
            'items': [_detalle_json(x) for x in lista[desde:desde + FILAS_POR_BLOQUE_ESC]],
        })

    pks_planes = [p.id for p in planes_list]
    inicio_anio = lunes_de_semana(filtro_anio, 1)   # la S1 puede empezar en diciembre
    tope        = min(lunes_filtro, lunes_actual)   # una semana futura no tiene vencidas por adelantado
    registros_existentes = set(
        RegistroEjecucion.objects.filter(
            plan_id__in=pks_planes,
            semana_inicio__gte=inicio_anio,
            semana_inicio__lt=tope,
        ).values_list('plan_id', 'semana_inicio')
    )

    vencidos = []
    for plan in planes_list:
        if not plan.semana_inicio or not plan.anio_inicio:
            continue
        try:
            intervalo = INTERVALO.get(plan.frecuencia, 1)
            ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
            cursor    = ref_lunes
            while cursor < tope:
                # Desde la S1 del año que se está viendo (antes: el año actual, así una semana de otro año
                # mostraba vencidas en 0).
                if cursor >= inicio_anio:
                    if (plan.id, cursor) not in registros_existentes:
                        sem_num = cursor.isocalendar()[1]
                        sem_atraso = (tope - cursor).days // 7
                        vencidos.append({
                            'plan':   plan,
                            'semana': sem_num,
                            'lunes':  cursor,
                            'atraso': sem_atraso,
                        })
                cursor += timedelta(weeks=intervalo)
        except Exception:
            continue

    vencidos.sort(key=lambda x: -x['atraso'])
    total_vencidos = len(vencidos)
    # Escritorio: mismo contenido, pero con desempate por código (spec 6.2).
    vencidos_esc = sorted(vencidos, key=lambda v: (-v['atraso'], v['plan'].locacion, v['plan'].actividad or '', v['plan'].codigo))

    # "Ver las N vencidas" pide el siguiente bloque (celular: de un área; escritorio: todo).
    if request.GET.get('vencidas') == '1':
        es_escritorio = request.GET.get('vista') == 'escritorio'
        try:
            desde = max(int(request.GET.get('desde', 0)), 0)
        except ValueError:
            desde = 0
        if es_escritorio:
            lista, bloque = vencidos_esc, FILAS_POR_BLOQUE_ESC
        else:
            varea = request.GET.get('varea', '').strip()
            lista = [v for v in vencidos if not varea or str(v['plan'].area_id) == varea]
            bloque = VENCIDAS_POR_BLOQUE
        return JsonResponse({
            'total': len(lista),
            'items': [_vencida_json(v, es_escritorio) for v in lista[desde:desde + bloque]],
        })

    # ── Datos para gráfico de cumplimiento por semana ──

    planes_grafico_list = planes_list

    lunes_semanas = {}
    for s in range(1, 54):   # incluye la S53 en los años que la tienen (2026, 2032…)
        try:
            lunes_semanas[s] = lunes_de_semana(filtro_anio, s)
        except Exception:
            continue

    completados_grafico_qs = set(
        RegistroEjecucion.objects.filter(
            plan_id__in=[p.id for p in planes_grafico_list],
            semana_inicio__in=lunes_semanas.values(),
            estado='completada'
        ).values_list('plan_id', 'semana_inicio')
    )

    semanas_grafico     = []
    valores_grafico     = []
    totales_grafico     = []
    completadas_grafico = []

    for s, lunes_s in lunes_semanas.items():
        planes_s = _planes_que_tocan(planes_grafico_list, lunes_s)
        if not planes_s:
            continue
        pks_s = {p.id for p in planes_s}
        completadas_s = sum(1 for pid in pks_s if (pid, lunes_s) in completados_grafico_qs)
        pct_s = round(completadas_s * 100 / len(planes_s))
        semanas_grafico.append(f'S{s}')
        valores_grafico.append(pct_s)
        totales_grafico.append(len(planes_s))
        completadas_grafico.append(completadas_s)

    # ── Vista de celular ──
    def cumplimiento(lunes, completados):
        """{s, a, pct (exacto o None sin planes), c, t} de una semana."""
        planes_s = _planes_que_tocan(planes_list, lunes)
        comp = sum(1 for p in planes_s if (p.id, lunes) in completados)
        anio_s, sem_s, _dia = lunes.isocalendar()
        return {'s': sem_s, 'a': anio_s, 'c': comp, 't': len(planes_s),
                'pct': round(comp * 100 / len(planes_s), 2) if planes_s else None}

    # Gráfica: las 12 semanas que terminan en la seleccionada (puede cruzar de año).
    lunes_12 = [lunes_filtro - timedelta(weeks=k) for k in range(11, -1, -1)]
    completados_12 = set(
        RegistroEjecucion.objects.filter(
            plan_id__in=pks_planes, semana_inicio__in=lunes_12, estado='completada'
        ).values_list('plan_id', 'semana_inicio')
    )
    serie_12   = [cumplimiento(l, completados_12) for l in lunes_12]
    serie_anio = [cumplimiento(l, completados_grafico_qs) for l in lunes_semanas.values()]

    # Escritorio: 11 semanas antes de la S1 del año filtrado, para que la vista
    # "12 sem." pueda terminar en cualquier semana de enero/febrero sin salirse
    # del año calculado por el gráfico anual.
    lunes_s1    = lunes_semanas[1]
    lunes_prev  = [lunes_s1 - timedelta(weeks=k) for k in range(11, 0, -1)]
    completados_prev = set(
        RegistroEjecucion.objects.filter(
            plan_id__in=pks_planes, semana_inicio__in=lunes_prev, estado='completada'
        ).values_list('plan_id', 'semana_inicio')
    )
    serie_prev = [cumplimiento(l, completados_prev) for l in lunes_prev]

    pct_exacto = completadas * 100 / total_semana if total_semana else 0
    anio_ant, sem_ant, _d = (lunes_filtro - timedelta(weeks=1)).isocalendar()
    anio_sig, sem_sig, _d = (lunes_filtro + timedelta(weeks=1)).isocalendar()

    # Vencidas: primer bloque + conteo por área (chips, solo con "Todas las áreas").
    vencidas_areas = []
    if not area_id:
        por_area_venc = Counter(v['plan'].area_id for v in vencidos)
        nombres = {v['plan'].area_id: v['plan'].area.nombre for v in vencidos}
        vencidas_areas = [{'id': a, 'nombre': nombres[a], 'n': n} for a, n in por_area_venc.most_common()]

    # ── Escritorio ──

    # Selector de Área: cuántos planes toca cada área esta semana (con los
    # demás filtros aplicados), igual que _areas_filtro() en backlog.py.
    planes_semana_todas_areas = _planes_que_tocan(todos_planes, lunes_filtro)
    por_area_planes = Counter(p.area_id for p in planes_semana_todas_areas)
    areas_filtro = {
        'opciones': [{
            'value': str(a.pk),
            'label': a.nombre,
            'color': COLORES_AREA[i % len(COLORES_AREA)],
            'meta':  _meta_area(por_area_planes.get(a.pk, 0)),
        } for i, a in enumerate(areas)],
        'todas_meta': _meta_area(len(planes_semana_todas_areas)),
    }

    # "faltan N para la meta" = techo(meta% de programadas) − completadas.
    if total_semana:
        objetivo    = -(-META_CUMPLIMIENTO * total_semana // 100)  # redondeo hacia arriba
        faltan_meta = max(objetivo - completadas, 0)
    else:
        faltan_meta = 0

    desglose = [
        {'clave': 'completada', 'n': completadas},
        {'clave': 'pendiente',  'n': pendientes},
        {'clave': 'reagendada', 'n': conteo_estados.get('reagendada', 0)},
        {'clave': 'cancelada',  'n': conteo_estados.get('cancelada', 0)},
    ]
    desglose = [d for d in desglose if d['n'] > 0]

    url_asignar     = _url_plan_semana(area_id, filtro_semana, filtro_anio, {'resp': 'ninguno'})

    filas_semana   = semana_detalle[:FILAS_POR_BLOQUE_ESC]
    filas_vencidas = [_vencida_json(v, escritorio=True) for v in vencidos_esc[:FILAS_POR_BLOQUE_ESC]]

    datos_escritorio = {
        'meta':         META_CUMPLIMIENTO,
        'semana':       filtro_semana,
        'anio':         filtro_anio,
        'actualSemana': semana_actual,
        'actualAnio':   anio,
        'area':         area_nombre or str(_('Todas las áreas')),
        'serie':        serie_prev + serie_anio,
        'nAnterior':    len(serie_prev),
        'totalSemana':  total_semana,
        'conteos': {
            '':           total_semana,
            'pendiente':  pendientes,
            'sin_resp':   sin_responsable,
            'completada': completadas,
            'reagendada': conteo_estados.get('reagendada', 0),
            'cancelada':  conteo_estados.get('cancelada', 0),
        },
        'totalVencidas': total_vencidos,
        'porBloque':     FILAS_POR_BLOQUE_ESC,
    }

    ctx_movil = {
        'meta':              META_CUMPLIMIENTO,
        'pct_exacto':        pct_exacto,
        'pct_texto':         '<1' if 0 < pct_exacto < 1 else str(round(pct_exacto)),
        'alcanza_meta':      pct_exacto >= META_CUMPLIMIENTO,
        'semana_anterior':   {'semana': sem_ant, 'anio': anio_ant},
        'semana_siguiente':  {'semana': sem_sig, 'anio': anio_sig},
        'detalle_movil':     detalle_movil,
        'conteo_estados':    conteo_estados,
        'vencidas_areas':    vencidas_areas,
        'datos_movil': {
            'meta':      META_CUMPLIMIENTO,
            'semana':    filtro_semana,
            'anio':      filtro_anio,
            'serie12':   serie_12,
            'serieAnio': serie_anio,
            'vencidas':  [_vencida_json(v) for v in vencidos[:VENCIDAS_POR_BLOQUE]],
            'totalVencidas': total_vencidos,
            'porBloque': VENCIDAS_POR_BLOQUE,
        },
    }

    ctx = {
        **ctx_movil,
        'areas':                    areas,
        'filtro_area':              area_id,
        'area_nombre':              area_nombre,
        'filtro_semana':            filtro_semana,
        'lunes_filtro':             lunes_filtro,
        'domingo_filtro':           lunes_filtro + timedelta(days=6),
        'anio':                     filtro_anio,
        'total_planes':             total_planes,
        'total_semana':             total_semana,
        'completadas':              completadas,
        'pendientes':               pendientes,
        'sin_registro':             sin_registro,
        'sin_responsable':          sin_responsable,
        'total_vencidos':           total_vencidos,
        'cumplimiento_semanas':     json.dumps(semanas_grafico),
        'cumplimiento_valores':     json.dumps(valores_grafico),
        'cumplimiento_totales':     json.dumps(totales_grafico),
        'cumplimiento_completadas': json.dumps(completadas_grafico),
        # Escritorio
        'areas_filtro':             areas_filtro,
        'faltan_meta':              faltan_meta,
        'desglose':                 desglose,
        'url_asignar':              url_asignar,
        'filas_semana':             filas_semana,
        'filas_vencidas':           filas_vencidas,
        'datos_escritorio':         datos_escritorio,
    }
    return render(request, 'mto_app/dashboard.html', ctx)
