from datetime import date, timedelta
import json
from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from ..models import Area, PlanMantenimiento, RegistroEjecucion
from .utils import lunes_de_semana, INTERVALO, _planes_que_tocan

@login_required
def dashboard(request):
    hoy       = date.today()
    iso       = hoy.isocalendar()
    semana_actual = iso[1]
    anio      = hoy.year

    area_id       = request.GET.get('area', '').strip()
    filtro_semana = int(request.GET.get('semana', semana_actual) or semana_actual)
    filtro_anio   = int(request.GET.get('anio', anio) or anio)

    try:
        lunes_filtro = lunes_de_semana(filtro_anio, filtro_semana)
    except Exception:
        lunes_filtro  = lunes_de_semana(anio, semana_actual)
        filtro_semana = semana_actual

    areas = Area.objects.filter(activa=True)

    planes_qs = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    if area_id:
        planes_qs = planes_qs.filter(area_id=area_id)
    planes_list = list(planes_qs)

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

    cumplimiento_pct = round(completadas * 100 / total_semana) if total_semana else 0

    areas_stats = {}
    for p in planes_semana:
        a = str(p.area_id)
        if a not in areas_stats:
            areas_stats[a] = {'nombre': p.area.nombre, 'total': 0, 'completadas': 0}
        areas_stats[a]['total'] += 1
        reg = registros_semana.get(p.id)
        if reg and reg.estado == 'completada':
            areas_stats[a]['completadas'] += 1

    for v in areas_stats.values():
        v['pct'] = round(v['completadas'] * 100 / v['total']) if v['total'] else 0

    areas_stats_list = sorted(areas_stats.values(), key=lambda x: -x['pct'])

    vencidos = []
    for plan in planes_list:
        if not plan.semana_inicio or not plan.anio_inicio:
            continue
        try:
            intervalo = INTERVALO.get(plan.frecuencia, 1)
            ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
            cursor    = ref_lunes
            while cursor < lunes_filtro:
                if cursor >= date(anio, 1, 1):
                    tiene = RegistroEjecucion.objects.filter(
                        plan=plan, semana_inicio=cursor
                    ).exists()
                    if not tiene:
                        sem_num = cursor.isocalendar()[1]
                        sem_atraso = (lunes_filtro - cursor).days // 7
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
    vencidos       = vencidos[:6]

    semana_detalle = []
    for p in planes_semana:
        reg = registros_semana.get(p.id)
        semana_detalle.append({
            'plan':        p,
            'registro':    reg,
            'estado':      reg.estado if reg else None,
            'responsable': reg.responsable if reg else None,
        })
    semana_detalle.sort(key=lambda x: (x['estado'] or 'z'))

    tipos = {}
    for p in planes_list:
        tipos[p.tipo_mto] = tipos.get(p.tipo_mto, 0) + 1

    frecuencias_dist = {}
    for p in planes_list:
        label = p.get_frecuencia_display()
        frecuencias_dist[label] = frecuencias_dist.get(label, 0) + 1

    orden_frec = ['Semanal', 'Quincenal', 'Mensual', 'Trimestral', 'Semestral', 'Anual']
    frecuencias_dist_list = [
        {'label': k, 'count': frecuencias_dist[k]}
        for k in orden_frec if k in frecuencias_dist
    ]

    # ── Datos para gráfico de cumplimiento por semana ──
    semanas_grafico  = []
    valores_grafico  = []

    planes_grafico = PlanMantenimiento.objects.select_related('area').filter(activo=True)
    if area_id:
        planes_grafico = planes_grafico.filter(area_id=area_id)
    planes_grafico_list = list(planes_grafico)

    totales_grafico    = []
    completadas_grafico = []

    for s in range(1, 53):
        try:
            lunes_s = lunes_de_semana(filtro_anio, s)
        except Exception:
            continue
        planes_s = _planes_que_tocan(planes_grafico_list, lunes_s)
        if not planes_s:
            continue
        pks_s = [p.id for p in planes_s]
        completadas_s = RegistroEjecucion.objects.filter(
            plan_id__in=pks_s, semana_inicio=lunes_s, estado='completada'
        ).count()
        pct_s = round(completadas_s * 100 / len(planes_s)) if planes_s else 0
        semanas_grafico.append(f'S{s}')
        valores_grafico.append(pct_s)
        totales_grafico.append(len(planes_s))
        completadas_grafico.append(completadas_s)

    ctx = {
        'areas':             areas,
        'filtro_area':       area_id,
        'filtro_semana':     filtro_semana,
        'semana_actual':     semana_actual,
        'lunes_filtro':      lunes_filtro,
        'domingo_filtro':    lunes_filtro + timedelta(days=6),
        'anio':              filtro_anio,
        'total_planes':      total_planes,
        'total_semana':      total_semana,
        'completadas':       completadas,
        'pendientes':        pendientes,
        'sin_registro':      sin_registro,
        'sin_responsable':   sin_responsable,
        'cumplimiento_pct':  cumplimiento_pct,
        'areas_stats':       areas_stats_list,
        'vencidos':          vencidos,
        'total_vencidos':    total_vencidos,
        'semana_detalle':    semana_detalle,
        'tipos':             tipos,
        'frecuencias_dist':  frecuencias_dist_list,
        'cumplimiento_semanas': json.dumps(semanas_grafico),
        'cumplimiento_valores': json.dumps(valores_grafico),
        'cumplimiento_totales':    json.dumps(totales_grafico),
        'cumplimiento_completadas': json.dumps(completadas_grafico),
    }
    return render(request, 'mto_app/dashboard.html', ctx)