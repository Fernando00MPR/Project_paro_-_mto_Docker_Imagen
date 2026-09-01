import calendar
from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum, Q
from django.shortcuts import render
from django.http import JsonResponse
from django.utils.translation import gettext as _

from ..models import Area, Paro, CatalogoResponsable
from login_app.permisos import permiso_requerido



@login_required
@permiso_requerido('ver_dashboard')
def dashboard(request):
    # ── Filtros ───────────────────────────────────────────────────────────────
    areas        = Area.objects.all()
    primera_area = areas.first()
    area_id      = request.GET.get('area', str(primera_area.id) if primera_area else '')
    rango        = request.GET.get('rango', '7')
    fecha_fin    = date.today()
    año_actual   = fecha_fin.year
    semana_num   = request.GET.get('semana_num', '')
    semana_actual = date.today().isocalendar()[1]
    mes_num      = request.GET.get('mes_num', '')
    anio_mes     = request.GET.get('anio_mes', '')
    anio_meses   = request.GET.get('anio_meses', '')

    if rango == 'custom':
        try:
            fecha_ini = date.fromisoformat(request.GET.get('fecha_ini', ''))
            fecha_fin = date.fromisoformat(request.GET.get('fecha_fin', str(fecha_fin)))
        except ValueError:
            fecha_ini = fecha_fin - timedelta(days=7)
    elif rango == 'semana_num':
        try:
            sn = int(semana_num) if semana_num else semana_actual
            fecha_ini = date.fromisocalendar(año_actual, sn, 1)
            fecha_fin = date.fromisocalendar(año_actual, sn, 7)
        except (ValueError, TypeError):
            fecha_ini = fecha_fin - timedelta(days=7)
    elif rango == 'semanas':
        fecha_ini = date(año_actual, 1, 1)
        fecha_fin = date(año_actual, 12, 31)
    elif rango == 'mes':
        try:
            mn = int(mes_num) if mes_num else fecha_fin.month
            an = int(anio_mes) if anio_mes else año_actual
        except (ValueError, TypeError):
            mn, an = fecha_fin.month, año_actual
        ultimo_dia = calendar.monthrange(an, mn)[1]
        fecha_ini  = date(an, mn, 1)
        fecha_fin  = date(an, mn, ultimo_dia)
    elif rango == 'meses':
        try:
            an = int(anio_meses) if anio_meses else año_actual
        except (ValueError, TypeError):
            an = año_actual
        fecha_ini = date(an, 1, 1)
        fecha_fin = date(an, 12, 31)
    else:
        dias = int(rango) if rango.isdigit() else 7
        fecha_ini = fecha_fin - timedelta(days=dias - 1)

    responsable_filtro = request.GET.get('responsable', '')
    estatus_filtro = request.GET.get('estatus', 'verde')
    qs = Paro.objects.select_related('area').filter(
        fecha__gte=fecha_ini, fecha__lte=fecha_fin
    )
    if area_id:
        qs = qs.filter(area_id=area_id)
    if responsable_filtro:
        qs = qs.filter(responsable=responsable_filtro)
    if estatus_filtro in ('rojo', 'amarillo', 'verde'):
        qs = qs.filter(estatus=estatus_filtro)

    area_actual = None
    if area_id:
        try:
            area_actual = Area.objects.get(id=area_id)
        except Area.DoesNotExist:
            pass

    # ── KPIs ──────────────────────────────────────────────────────────────────
    _agg = qs.aggregate(
    total_paros   = Count('id'),
    total_minutos = Sum('tiempo_minutos'),
    rechazados    = Count('id', filter=Q(estatus='rojo')),
    pendiente     = Count('id', filter=Q(estatus='amarillo')),
    aceptados     = Count('id', filter=Q(estatus='verde')),
    turno1        = Count('id', filter=Q(turno=1)),
    turno2        = Count('id', filter=Q(turno=2)),
    )
    total_paros   = _agg['total_paros']
    total_minutos = _agg['total_minutos'] or 0
    total_horas   = round(total_minutos / 60, 1)
    promedio_min  = round(total_minutos / total_paros, 1) if total_paros else 0
    
    # ── Estatus counts ────────────────────────────────────────────────────────
    Rechazados    = _agg['rechazados']
    Pendiente     = _agg['pendiente']
    Aceptados     = _agg['aceptados']

    # ── Top responsables ──────────────────────────────────────────────────────
    top_responsables = (
        qs.values('responsable')
        .annotate(total=Count('id'), minutos=Sum('tiempo_minutos'))
        .order_by('-total')[:8]
    )

    # ── Top fallas ────────────────────────────────────────────────────────────
    top_fallas = (
        qs.values('falla')
        .annotate(total=Count('id'), minutos=Sum('tiempo_minutos'))
        .order_by('-total')[:8]
    )

    # ── Top equipos ───────────────────────────────────────────────────────────
    top_equipos = (
        qs.values('equipo')
        .annotate(total=Count('id'), minutos=Sum('tiempo_minutos'))
        .order_by('-total')[:8]
    )

    # ── Paros por turno ───────────────────────────────────────────────────────
    turno1 = _agg['turno1']
    turno2 = _agg['turno2']

    # ── Tendencia diaria ──────────────────────────────────────────────────────
    tendencia_dict = defaultdict(lambda: {'paros': 0, 'minutos': 0})
    for p in qs.values('fecha', 'tiempo_minutos'):
        key = str(p['fecha'])
        tendencia_dict[key]['paros']   += 1
        tendencia_dict[key]['minutos'] += p['tiempo_minutos']

    tendencia = []
    delta = (fecha_fin - fecha_ini).days + 1
    for i in range(delta):
        d = str(fecha_ini + timedelta(days=i))
        tendencia.append({
            'fecha':   d,
            'paros':   tendencia_dict[d]['paros'],
            'minutos': tendencia_dict[d]['minutos'],
        })

    meses = [
        (1, _('Enero')), (2, _('Febrero')), (3, _('Marzo')), (4, _('Abril')),
        (5, _('Mayo')), (6, _('Junio')), (7, _('Julio')), (8, _('Agosto')),
        (9, _('Septiembre')), (10, _('Octubre')), (11, _('Noviembre')), (12, _('Diciembre')),
    ]

    # ── Por hora (solo si es "Hoy") ───────────────────────────────────────────
    es_hoy     = (rango == '1')
    es_semanas = (rango == 'semanas')
    es_meses   = (rango == 'meses')
    horas_dict = {str(i).zfill(2): {'paros': 0, 'minutos': 0} for i in range(24)}
    if es_hoy:
        for p in qs:
            h = str(p.hora.hour).zfill(2)
            horas_dict[h]['paros']   += 1
            horas_dict[h]['minutos'] += p.tiempo_minutos or 0
    paros_por_hora = [
        {'hora': f'{k}:00', 'total': horas_dict[k]['paros'], 'minutos': horas_dict[k]['minutos']}
        for k in sorted(horas_dict)
    ]
    max_hora = max((x['minutos'] for x in paros_por_hora), default=1)

    # ── Por semana ISO ────────────────────────────────────────────────────────
    semanas_dict = {str(s).zfill(2): {'paros': 0, 'minutos': 0} for s in range(1, 54)}
    if es_semanas:
        for p in qs:
            s = str(p.fecha.isocalendar()[1]).zfill(2)
            semanas_dict[s]['paros']   += 1
            semanas_dict[s]['minutos'] += p.tiempo_minutos or 0
    ultima_semana = date(año_actual, 12, 28).isocalendar()[1]
    paros_por_semana = [
        {'semana': k, 'paros': semanas_dict[k]['paros'], 'minutos': semanas_dict[k]['minutos']}
        for k in sorted(semanas_dict)
        if int(k) <= ultima_semana
    ]

    # ── Por mes (año completo) ─────────────────────────────────────────────────
    meses_dict = {m: {'paros': 0, 'minutos': 0} for m in range(1, 13)}
    if es_meses:
        for p in qs.values('fecha', 'tiempo_minutos'):
            m = p['fecha'].month
            meses_dict[m]['paros']   += 1
            meses_dict[m]['minutos'] += p['tiempo_minutos'] or 0
    meses_map = dict(meses)
    paros_por_mes = [
        {'mes': m, 'mes_label': str(meses_map[m]), 'paros': meses_dict[m]['paros'], 'minutos': meses_dict[m]['minutos']}
        for m in range(1, 13)
    ]

    # ── Máximos para escalar barras ───────────────────────────────────────────
    max_resp   = max((r['total'] for r in top_responsables), default=1)
    max_falla  = max((f['total'] for f in top_fallas),       default=1)
    max_equipo = max((e['total'] for e in top_equipos),      default=1)
    max_tend   = max((d['paros'] for d in tendencia),        default=1)

    # ── Responsables disponibles para el filtro ───────────────────────────────
    if area_id:
        responsables_disponibles = list(
            CatalogoResponsable.objects.filter(area_id=area_id)
            .values_list('responsable', flat=True).order_by('responsable')
        )
    else:
        responsables_disponibles = list(
            CatalogoResponsable.objects.all()
            .values_list('responsable', flat=True).distinct().order_by('responsable')
        )

    return render(request, 'paros_app/dashboard.html', {
        'areas':                    areas,
        'area_actual':              area_actual,
        'area_id':                  area_id,
        'rango':                    rango,
        'semana_num':               semana_num,
        'semana_actual':            semana_actual,
        'mes_num':                  mes_num,
        'mes_actual':               date.today().month,
        'anio_mes':                 anio_mes,
        'anio_meses':               anio_meses,
        'meses':                    meses,
        'es_hoy':                   es_hoy,
        'es_semanas':               es_semanas,
        'es_meses':                 es_meses,
        'paros_por_hora':           paros_por_hora,
        'paros_por_semana':         paros_por_semana,
        'paros_por_mes':            paros_por_mes,
        'año_actual':               año_actual,
        'max_hora':                 max_hora,
        'fecha_ini':                fecha_ini,
        'fecha_fin':                fecha_fin,
        'total_paros':              total_paros,
        'total_minutos':            total_minutos,
        'total_horas':              total_horas,
        'promedio_min':             promedio_min,
        'Rechazados':               Rechazados,
        'Pendiente':                Pendiente,
        'Aceptados':                Aceptados,
        'responsable_filtro':       responsable_filtro,
        'responsables_disponibles': responsables_disponibles,
        'top_responsables':         top_responsables,
        'top_fallas':               top_fallas,
        'top_equipos':              top_equipos,
        'turno1':                   turno1,
        'turno2':                   turno2,
        'tendencia':                tendencia,
        'max_resp':                 max_resp,
        'max_falla':                max_falla,
        'max_equipo':               max_equipo,
        'max_tend':                 max_tend,
        'estatus_filtro':           estatus_filtro,
    })

@login_required
@permiso_requerido('ver_dashboard')
def dashboard_json(request):
    from collections import defaultdict

    areas        = Area.objects.all()
    primera_area = areas.first()
    area_id      = request.GET.get('area', str(primera_area.id) if primera_area else '')
    rango        = request.GET.get('rango', '7')
    fecha_fin    = date.today()
    año_actual   = fecha_fin.year
    semana_num   = request.GET.get('semana_num', '')
    semana_actual = date.today().isocalendar()[1]
    mes_num      = request.GET.get('mes_num', '')
    anio_mes     = request.GET.get('anio_mes', '')
    anio_meses   = request.GET.get('anio_meses', '')

    if rango == 'custom':
        try:
            fecha_ini = date.fromisoformat(request.GET.get('fecha_ini', ''))
            fecha_fin = date.fromisoformat(request.GET.get('fecha_fin', str(fecha_fin)))
        except ValueError:
            fecha_ini = fecha_fin - timedelta(days=7)
    elif rango == 'semana_num':
        try:
            sn = int(semana_num) if semana_num else semana_actual
            fecha_ini = date.fromisocalendar(año_actual, sn, 1)
            fecha_fin = date.fromisocalendar(año_actual, sn, 7)
        except (ValueError, TypeError):
            fecha_ini = fecha_fin - timedelta(days=7)
    elif rango == 'semanas':
        fecha_ini = date(año_actual, 1, 1)
        fecha_fin = date(año_actual, 12, 31)
    elif rango == 'mes':
        try:
            mn = int(mes_num) if mes_num else fecha_fin.month
            an = int(anio_mes) if anio_mes else año_actual
        except (ValueError, TypeError):
            mn, an = fecha_fin.month, año_actual
        ultimo_dia = calendar.monthrange(an, mn)[1]
        fecha_ini  = date(an, mn, 1)
        fecha_fin  = date(an, mn, ultimo_dia)
    elif rango == 'meses':
        try:
            an = int(anio_meses) if anio_meses else año_actual
        except (ValueError, TypeError):
            an = año_actual
        fecha_ini = date(an, 1, 1)
        fecha_fin = date(an, 12, 31)
    else:
        dias = int(rango) if rango.isdigit() else 7
        fecha_ini = fecha_fin - timedelta(days=dias - 1)

    responsable_filtro = request.GET.get('responsable', '')
    estatus_filtro     = request.GET.get('estatus', 'verde')

    qs = Paro.objects.select_related('area').filter(fecha__gte=fecha_ini, fecha__lte=fecha_fin)
    if area_id:
        qs = qs.filter(area_id=area_id)
    if responsable_filtro:
        qs = qs.filter(responsable=responsable_filtro)
    if estatus_filtro in ('rojo', 'amarillo', 'verde'):
        qs = qs.filter(estatus=estatus_filtro)

    total_paros   = qs.count()
    total_minutos = qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    promedio_min  = round(total_minutos / total_paros, 1) if total_paros else 0

    top_responsables = list(qs.values('responsable').annotate(total=Count('id'), minutos=Sum('tiempo_minutos')).order_by('-total')[:8])
    top_fallas       = list(qs.values('falla').annotate(total=Count('id'), minutos=Sum('tiempo_minutos')).order_by('-total')[:8])
    top_equipos      = list(qs.values('equipo').annotate(total=Count('id'), minutos=Sum('tiempo_minutos')).order_by('-total')[:8])

    turno1 = qs.filter(turno=1).count()
    turno2 = qs.filter(turno=2).count()

    es_hoy     = (rango == '1')
    es_semanas = (rango == 'semanas')
    es_meses   = (rango == 'meses')

    if es_hoy:
        horas_dict = {i: 0 for i in range(24)}
        for p in qs.values('hora', 'tiempo_minutos'):
            h = p['hora'].hour if p['hora'] else 0
            horas_dict[h] += p['tiempo_minutos'] or 0
        chart_labels = [f'{i:02d}:00' for i in range(24)]
        chart_data   = [horas_dict[i] for i in range(24)]
    elif es_semanas:
        semanas_dict = defaultdict(int)
        for p in qs.values('fecha', 'tiempo_minutos'):
            semanas_dict[p['fecha'].isocalendar()[1]] += p['tiempo_minutos'] or 0
        ultima_semana = date(año_actual, 12, 28).isocalendar()[1]
        chart_labels = [f'Sem {s:02d}' for s in range(1, ultima_semana + 1)]
        chart_data   = [semanas_dict[s] for s in range(1, ultima_semana + 1)]
    elif es_meses:
        meses_dict = defaultdict(int)
        for p in qs.values('fecha', 'tiempo_minutos'):
            meses_dict[p['fecha'].month] += p['tiempo_minutos'] or 0
        nombres_meses = [
            str(_('Enero')), str(_('Febrero')), str(_('Marzo')), str(_('Abril')),
            str(_('Mayo')), str(_('Junio')), str(_('Julio')), str(_('Agosto')),
            str(_('Septiembre')), str(_('Octubre')), str(_('Noviembre')), str(_('Diciembre')),
        ]
        chart_labels = nombres_meses
        chart_data   = [meses_dict[m] for m in range(1, 13)]
    else:
        tendencia_dict = defaultdict(int)
        for p in qs.values('fecha', 'tiempo_minutos'):
            tendencia_dict[str(p['fecha'])] += p['tiempo_minutos'] or 0
        delta = (fecha_fin - fecha_ini).days + 1
        chart_labels, chart_data = [], []
        for i in range(delta):
            d = fecha_ini + timedelta(days=i)
            chart_labels.append(str(d)[5:])
            chart_data.append(tendencia_dict[str(d)])

    return JsonResponse({
        'total_paros':      total_paros,
        'total_minutos':    total_minutos,
        'promedio_min':     promedio_min,
        'rechazados':       qs.filter(estatus='rojo').count(),
        'pendiente':        qs.filter(estatus='amarillo').count(),
        'aceptados':        qs.filter(estatus='verde').count(),
        'turno1':           turno1,
        'turno2':           turno2,
        'top_responsables': [{'nombre': r['responsable'] or '', 'total': r['total'], 'minutos': r['minutos'] or 0} for r in top_responsables],
        'top_fallas':       [{'nombre': f['falla'] or '',       'total': f['total'], 'minutos': f['minutos'] or 0} for f in top_fallas],
        'top_equipos':      [{'nombre': e['equipo'] or '',      'total': e['total'], 'minutos': e['minutos'] or 0} for e in top_equipos],
        'max_resp':         max((r['total'] for r in top_responsables), default=1),
        'max_falla':        max((f['total'] for f in top_fallas),       default=1),
        'max_equipo':       max((e['total'] for e in top_equipos),      default=1),
        'chart_labels':     chart_labels,
        'chart_data':       chart_data,
    })