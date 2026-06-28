import json
from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum
from django.shortcuts import render
from django.http import JsonResponse

from ..models import Area, Paro, CatalogoResponsable
from ..models import CatalogoFalla as CF
from ..models import CatalogoFalla
from login_app.permisos import permiso_requerido, get_perfil


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
    total_paros   = qs.count()
    total_minutos = qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    total_horas   = round(total_minutos / 60, 1)
    promedio_min  = round(total_minutos / total_paros, 1) if total_paros else 0

    # ── Estatus counts ────────────────────────────────────────────────────────
    Rechazados  = qs.filter(estatus='rojo').count()
    Pendiente   = qs.filter(estatus='amarillo').count()
    Aceptados   = qs.filter(estatus='verde').count()

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
    turno1 = qs.filter(turno=1).count()
    turno2 = qs.filter(turno=2).count()

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

    # ── Por hora (solo si es "Hoy") ───────────────────────────────────────────
    es_hoy     = (rango == '1')
    es_semanas = (rango == 'semanas')
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
        'es_hoy':                   es_hoy,
        'es_semanas':               es_semanas,
        'paros_por_hora':           paros_por_hora,
        'paros_por_semana':         paros_por_semana,
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
@permiso_requerido('ver_analisis')
def analisis_paros(request):
    from datetime import date as _date, timedelta as _td

    perfil      = get_perfil(request.user)
    es_admin    = request.user.is_superuser or (perfil and perfil.es_admin)
    areas_todas = Area.objects.all()

    # ── Áreas según permisos ──────────────────────────────────────────────────
    if es_admin:
        areas_disp = areas_todas
    else:
        areas_disp = perfil.areas_permitidas.all() if perfil else Area.objects.none()

    # ── Parámetros ────────────────────────────────────────────────────────────
    area_id     = request.GET.get('area', '')
    periodo     = request.GET.get('periodo', '30')
    fecha_desde = request.GET.get('fecha_desde', '')
    fecha_hasta = request.GET.get('fecha_hasta', '')
    semana_num  = request.GET.get('semana_num', '')
    turno       = request.GET.get('turno', '')
    hoy         = _date.today()

    # ── Rango de fechas ───────────────────────────────────────────────────────
    if periodo == 'hoy':
        d_desde = hoy
        d_hasta = hoy
    elif periodo == 'semana' and semana_num:
        anio = hoy.year
        try:
            semana_n = int(semana_num)
            d_desde  = _date.fromisocalendar(anio, semana_n, 1)
            d_hasta  = _date.fromisocalendar(anio, semana_n, 7)
        except (ValueError, TypeError):
            d_desde = hoy - _td(days=7)
            d_hasta = hoy
    elif periodo == 'semanas':
        d_desde = _date(hoy.year, 1, 1)
        d_hasta = _date(hoy.year, 12, 31)
    elif periodo == 'custom' and fecha_desde and fecha_hasta:
        try:
            d_desde = _date.fromisoformat(fecha_desde)
            d_hasta = _date.fromisoformat(fecha_hasta)
        except ValueError:
            d_desde = hoy - _td(days=30)
            d_hasta = hoy
    else:
        dias    = int(periodo) if periodo.isdigit() else 30
        d_desde = hoy - _td(days=dias - 1)
        d_hasta = hoy

    semana_actual = hoy.isocalendar()[1]

    # ── Queryset base ─────────────────────────────────────────────────────────
    qs = Paro.objects.select_related('area').filter(fecha__gte=d_desde, fecha__lte=d_hasta)
    if area_id:
        qs = qs.filter(area_id=area_id)
    else:
        qs = qs.filter(area__in=areas_disp)
    if turno in ('1', '2'):
        qs = qs.filter(turno=int(turno))
    estatus_filtro = request.GET.get('estatus', 'verde')
    if estatus_filtro in ('rojo', 'amarillo', 'verde'):
        qs = qs.filter(estatus=estatus_filtro)

    # ── Exclusiones por checkbox ──────────────────────────────────────────────
    fallas_excluidas = request.GET.getlist('excluir_falla')
    resp_excluidas   = request.GET.getlist('excluir_resp')
    modo_pareto      = request.GET.get('modo_pareto', 'falla')
    modo_barras      = request.GET.get('modo_barras', 'falla')
    tipos_excluidos  = request.GET.getlist('excluir_tipo')
    atendio_excluidos = request.GET.getlist('excluir_atendio')

    # ── Listas para los paneles (antes de exclusión) ──────────────────────────
    lista_fallas = (
        qs.values('falla')
        .annotate(minutos=Sum('tiempo_minutos'))
        .order_by('-minutos')
    )
    lista_responsables = (
        qs.values('responsable')
        .annotate(minutos=Sum('tiempo_minutos'))
        .order_by('-minutos')
    )
    # Obtener tipos de falla del catálogo
    
    if area_id:
        lista_tipos = (
            CatalogoFalla.objects
            .filter(area_id=area_id)
            .exclude(tipo_falla='')
            .values_list('tipo_falla', flat=True)
            .distinct()
            .order_by('tipo_falla')
        )
    else:
        lista_tipos = (
            CatalogoFalla.objects
            .filter(area__in=areas_disp)
            .exclude(tipo_falla='')
            .values_list('tipo_falla', flat=True)
            .distinct()
            .order_by('tipo_falla')
        )
    lista_atendio = (
        qs.values('atendio')
        .annotate(minutos=Sum('tiempo_minutos'))
        .exclude(atendio='')
        .order_by('-minutos')
    )

    # ── Aplicar exclusiones ───────────────────────────────────────────────────
    qs_graf = qs
    if fallas_excluidas:
        qs_graf = qs_graf.exclude(falla__in=fallas_excluidas)
    if resp_excluidas:
        qs_graf = qs_graf.exclude(responsable__in=resp_excluidas)
    if tipos_excluidos:
        fallas_de_tipos = list(CF.objects.filter(
            tipo_falla__in=tipos_excluidos
        ).values_list('nombre_es', flat=True)) + list(CF.objects.filter(
            tipo_falla__in=tipos_excluidos
        ).values_list('nombre_en', flat=True))
        qs_graf = qs_graf.exclude(falla__in=fallas_de_tipos)
    if atendio_excluidos:
        qs_graf = qs_graf.exclude(atendio__in=atendio_excluidos)

    # ── KPIs ──────────────────────────────────────────────────────────────────
    total_paros   = qs_graf.count()
    total_minutos = qs_graf.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    promedio_min  = round(total_minutos / total_paros, 1) if total_paros else 0

    # ── Grafico de tendecia ───────────────────────────────────────────────────

    from collections import defaultdict
    from datetime import timedelta

    tendencia_dict = defaultdict(lambda: {'paros': 0, 'minutos': 0})
    for p in qs_graf.values('fecha', 'tiempo_minutos'):
        key = p['fecha'].strftime('%Y-%m-%d')
        tendencia_dict[key]['paros']   += 1
        tendencia_dict[key]['minutos'] += p['tiempo_minutos']

    fi = d_desde
    ff = d_hasta

    if periodo == 'hoy':
        # Agrupar por hora
        from collections import defaultdict
        horas_dict = defaultdict(int)
        for p in qs_graf.values('hora', 'tiempo_minutos'):
            hora = p['hora'].hour if p['hora'] else 0
            horas_dict[hora] += p['tiempo_minutos']
        labels_t  = [f"{h:02d}:00" for h in range(24)]
        minutos_t = [horas_dict[h] for h in range(24)]
        nparos_t  = [0] * 24
    elif periodo == 'semanas':
        from collections import defaultdict
        semanas_dict = defaultdict(lambda: {'paros': 0, 'minutos': 0})
        for p in qs_graf.values('fecha', 'tiempo_minutos'):
            sem = p['fecha'].isocalendar()[1]
            semanas_dict[sem]['minutos'] += p['tiempo_minutos']
            semanas_dict[sem]['paros']   += 1
        ultima_semana = _date(hoy.year, 12, 28).isocalendar()[1]
        labels_t  = [f"Sem {s}" for s in range(1, ultima_semana + 1)]
        minutos_t = [semanas_dict[s]['minutos'] for s in range(1, ultima_semana + 1)]
        nparos_t  = [semanas_dict[s]['paros']   for s in range(1, ultima_semana + 1)]   
    else:
        # Agrupar por día
        labels_t  = []
        minutos_t = []
        nparos_t  = []
        d = fi
        while d <= ff:
            key = d.strftime('%Y-%m-%d')
            labels_t.append(d.strftime('%d/%m'))
            minutos_t.append(tendencia_dict[key]['minutos'])
            nparos_t.append(tendencia_dict[key]['paros'])
            d += timedelta(days=1)

    # ── Pareto ────────────────────────────────────────────────────────────────
    if modo_pareto == 'tipo_falla':
        
        fallas_con_tipo = {}
        for f in CF.objects.filter(area__in=areas_disp).exclude(tipo_falla=''):
            if f.nombre_es:
                fallas_con_tipo[f.nombre_es] = f.tipo_falla
            if f.nombre_en:
                fallas_con_tipo[f.nombre_en] = f.tipo_falla

        tipo_dict = defaultdict(lambda: {'n_paros': 0, 'minutos': 0})
        for p in qs_graf.values('falla', 'tiempo_minutos'):
            tipo = fallas_con_tipo.get(p['falla'])
            if tipo:  # solo si tiene tipo asignado
                tipo_dict[tipo]['n_paros'] += 1
                tipo_dict[tipo]['minutos'] += p['tiempo_minutos'] or 0
        sorted_tipos = sorted(tipo_dict.items(), key=lambda x: x[1]['minutos'], reverse=True)
        labels_p  = [t[0] for t in sorted_tipos]
        minutos_p = [t[1]['minutos'] for t in sorted_tipos]
        nparos_p  = [t[1]['n_paros'] for t in sorted_tipos]
    elif modo_pareto == 'atendio':
        grupos_pareto = (
            qs_graf.exclude(atendio='')
            .values('atendio')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_p  = [g['atendio'] for g in grupos_pareto]
        minutos_p = [g['minutos'] or 0 for g in grupos_pareto]
        nparos_p  = [g['n_paros'] for g in grupos_pareto]
    else:
        campo_pareto  = 'falla' if modo_pareto == 'falla' else 'responsable'
        grupos_pareto = (
            qs_graf.values(campo_pareto)
                .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
                .order_by('-minutos')
        )
        labels_p  = [g[campo_pareto] for g in grupos_pareto]
        minutos_p = [g['minutos'] or 0 for g in grupos_pareto]
        nparos_p  = [g['n_paros'] for g in grupos_pareto]

    total_p   = sum(minutos_p) or 1
    acum_p, acumulado = [], 0
    for m in minutos_p:
        acumulado += m
        acum_p.append(round(acumulado / total_p * 100))

    # ── Barras ────────────────────────────────────────────────────────────────
    if modo_barras == 'tipo_falla':
        fallas_con_tipo = {}
        for f in CF.objects.filter(area__in=areas_disp).exclude(tipo_falla=''):
            if f.nombre_es:
                fallas_con_tipo[f.nombre_es] = f.tipo_falla
            if f.nombre_en:
                fallas_con_tipo[f.nombre_en] = f.tipo_falla

        tipo_dict_b = defaultdict(lambda: {'n_paros': 0, 'minutos': 0})
        for p in qs_graf.values('falla', 'tiempo_minutos'):
            tipo = fallas_con_tipo.get(p['falla'])
            if tipo:
                tipo_dict_b[tipo]['n_paros'] += 1
                tipo_dict_b[tipo]['minutos'] += p['tiempo_minutos'] or 0
        sorted_tipos_b = sorted(tipo_dict_b.items(), key=lambda x: x[1]['minutos'], reverse=True)
        labels_b  = [t[0] for t in sorted_tipos_b]
        minutos_b = [t[1]['minutos'] for t in sorted_tipos_b]
        nparos_b  = [t[1]['n_paros'] for t in sorted_tipos_b]
    elif modo_barras == 'atendio':
        grupos_barras = (
            qs_graf.exclude(atendio='')
            .values('atendio')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_b  = [g['atendio'] for g in grupos_barras]
        minutos_b = [g['minutos'] or 0 for g in grupos_barras]
        nparos_b  = [g['n_paros'] for g in grupos_barras]
    else:
        campo_barras  = 'falla' if modo_barras == 'falla' else 'responsable'
        grupos_barras = (
            qs_graf.values(campo_barras)
                .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
                .order_by('-minutos')
        )
        labels_b  = [g[campo_barras] for g in grupos_barras]
        minutos_b = [g['minutos'] or 0 for g in grupos_barras]
        nparos_b  = [g['n_paros'] for g in grupos_barras]

    return render(request, 'paros_app/analisis_paros.html', {
        'areas':              areas_disp,
        'area_id':            area_id,
        'periodo':            periodo,
        'fecha_desde':        fecha_desde,
        'fecha_hasta':        fecha_hasta,
        'semana_num':         semana_num,
        'turno':              turno,
        'semana_actual':      semana_actual,
        'modo_pareto':        modo_pareto,
        'modo_barras':        modo_barras,
        'total_paros':        total_paros,
        'total_minutos':      total_minutos,
        'promedio_min':       promedio_min,
        'labels_p':           json.dumps(labels_p),
        'minutos_p':          json.dumps(minutos_p),
        'nparos_p':           json.dumps(nparos_p),
        'acum_p':             json.dumps(acum_p),
        'labels_b':           json.dumps(labels_b),
        'minutos_b':          json.dumps(minutos_b),
        'nparos_b':           json.dumps(nparos_b),   
        'labels_t':           json.dumps(labels_t),
        'minutos_t':          json.dumps(minutos_t),
        'nparos_t':           json.dumps(nparos_t),
        'lista_fallas':       lista_fallas,
        'lista_responsables': lista_responsables,
        'fallas_excluidas':   fallas_excluidas,
        'resp_excluidas':     resp_excluidas,
        'lista_tipos':        list(lista_tipos),
        'tipos_excluidos':    tipos_excluidos,
        'estatus_filtro':     estatus_filtro,
        'lista_atendio':      lista_atendio,
        'atendio_excluidos':  atendio_excluidos,
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