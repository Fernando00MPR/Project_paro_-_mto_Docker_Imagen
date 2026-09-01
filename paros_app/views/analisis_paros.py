import calendar
import json

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum
from django.shortcuts import render
from django.utils.translation import gettext as _

from ..models import Area, Paro, CatalogoEquipo
from ..models import CatalogoFalla as CF
from ..models import CatalogoFalla
from login_app.permisos import permiso_requerido, get_perfil


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
    area_id       = request.GET.get('area', '')
    periodo       = request.GET.get('periodo', '30')
    fecha_desde   = request.GET.get('fecha_desde', '')
    fecha_hasta   = request.GET.get('fecha_hasta', '')
    semana_num    = request.GET.get('semana_num', '')
    mes_num       = request.GET.get('mes_num', '')
    anio_mes      = request.GET.get('anio_mes', '')
    anio_meses    = request.GET.get('anio_meses', '')
    anio_semanas  = request.GET.get('anio_semanas', '')
    turno         = request.GET.get('turno', '')
    sub_area_sel  = request.GET.get('sub_area', '')
    hoy           = _date.today()

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
        try:
            an = int(anio_semanas) if anio_semanas else hoy.year
        except (ValueError, TypeError):
            an = hoy.year
        d_desde = _date(an, 1, 1)
        d_hasta = _date(an, 12, 31)
    elif periodo == 'custom' and fecha_desde and fecha_hasta:
        try:
            d_desde = _date.fromisoformat(fecha_desde)
            d_hasta = _date.fromisoformat(fecha_hasta)
        except ValueError:
            d_desde = hoy - _td(days=30)
            d_hasta = hoy
    elif periodo == 'mes':
        try:
            mn = int(mes_num) if mes_num else hoy.month
            an = int(anio_mes) if anio_mes else hoy.year
        except (ValueError, TypeError):
            mn, an = hoy.month, hoy.year
        ultimo_dia = calendar.monthrange(an, mn)[1]
        d_desde    = _date(an, mn, 1)
        d_hasta    = _date(an, mn, ultimo_dia)
    elif periodo == 'meses':
        try:
            an = int(anio_meses) if anio_meses else hoy.year
        except (ValueError, TypeError):
            an = hoy.year
        d_desde = _date(an, 1, 1)
        d_hasta = _date(an, 12, 31)
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

     # ── Sub área (Catálogo de Equipos) ────────────────────────────────────────
    area_scope = Area.objects.filter(id=area_id) if area_id else areas_disp
    subareas_disponibles = list(
        CatalogoEquipo.objects.filter(area__in=area_scope).exclude(sub_area='')
        .values_list('sub_area', flat=True).distinct().order_by('sub_area')
    )
    if sub_area_sel:
        equipos_en_subarea = set(
            CatalogoEquipo.objects.filter(area__in=area_scope, sub_area=sub_area_sel)
            .values_list('equipo', flat=True)
        )
        qs = qs.filter(equipo__in=equipos_en_subarea)

    # ── Exclusiones por checkbox ──────────────────────────────────────────────
    fallas_excluidas  = request.GET.getlist('excluir_falla')
    resp_excluidas    = request.GET.getlist('excluir_resp')
    modo_pareto       = request.GET.get('modo_pareto', 'falla')
    modo_barras       = request.GET.get('modo_barras', 'falla')
    tipos_excluidos   = request.GET.getlist('excluir_tipo')
    atendio_excluidos = request.GET.getlist('excluir_atendio')
    equipos_excluidos = request.GET.getlist('excluir_equipo')

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
        .order_by('-minutos')
    )
    lista_atendio = [
        {**r, 'atendio': r['atendio'] or _('Sin quien atendio')}
        for r in lista_atendio
    ]
    lista_equipos = (
        qs.values('equipo')
        .annotate(minutos=Sum('tiempo_minutos'))
        .order_by('-minutos')
    )

    # ── Aplicar exclusiones ───────────────────────────────────────────────────
    qs_graf = qs
    if fallas_excluidas:
        qs_graf = qs_graf.exclude(falla__in=fallas_excluidas)
    if resp_excluidas:
        qs_graf = qs_graf.exclude(responsable__in=resp_excluidas)
    if tipos_excluidos:
        nombres = CF.objects.filter(tipo_falla__in=tipos_excluidos).values_list('nombre_es', 'nombre_en')
        fallas_de_tipos = [n for par in nombres for n in par if n]
        qs_graf = qs_graf.exclude(falla__in=fallas_de_tipos)
    if atendio_excluidos:
        excluir_vacios = _('Sin quien atendio') in atendio_excluidos
        atendio_excluidos_db = [v for v in atendio_excluidos if v != _('Sin quien atendio')]
        if atendio_excluidos_db:
            qs_graf = qs_graf.exclude(atendio__in=atendio_excluidos_db)
        if excluir_vacios:
            qs_graf = qs_graf.exclude(atendio='')
    if equipos_excluidos:
        qs_graf = qs_graf.exclude(equipo__in=equipos_excluidos)

    # ── KPIs ──────────────────────────────────────────────────────────────────
    _totales      = qs_graf.aggregate(n=Count('id'), t=Sum('tiempo_minutos'))
    total_paros   = _totales['n']
    total_minutos = _totales['t'] or 0
    promedio_min  = round(total_minutos / total_paros, 1) if total_paros else 0

    # ── Grafico de tendecia ───────────────────────────────────────────────────

    from collections import defaultdict
    from datetime import timedelta

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
        ultima_semana = _date(d_desde.year, 12, 28).isocalendar()[1]

        sem_prefix = str(_('S'))
        labels_t  = [f"{sem_prefix}{s}" for s in range(1, ultima_semana + 1)]

        minutos_t = [semanas_dict[s]['minutos'] for s in range(1, ultima_semana + 1)]
        nparos_t  = [semanas_dict[s]['paros']   for s in range(1, ultima_semana + 1)]
    elif periodo == 'meses':
        from collections import defaultdict
        meses_dict_t = defaultdict(lambda: {'paros': 0, 'minutos': 0})
        for p in qs_graf.values('fecha', 'tiempo_minutos'):
            meses_dict_t[p['fecha'].month]['minutos'] += p['tiempo_minutos']
            meses_dict_t[p['fecha'].month]['paros']   += 1
        nombres_meses_t = [
            str(_('Enero')), str(_('Febrero')), str(_('Marzo')), str(_('Abril')),
            str(_('Mayo')), str(_('Junio')), str(_('Julio')), str(_('Agosto')),
            str(_('Septiembre')), str(_('Octubre')), str(_('Noviembre')), str(_('Diciembre')),
        ]
        labels_t  = nombres_meses_t
        minutos_t = [meses_dict_t[m]['minutos'] for m in range(1, 13)]
        nparos_t  = [meses_dict_t[m]['paros']   for m in range(1, 13)]
    else:
        # Agrupar por día
        tendencia_dict = defaultdict(lambda: {'paros': 0, 'minutos': 0})
        for p in qs_graf.values('fecha', 'tiempo_minutos'):
            key = p['fecha'].strftime('%Y-%m-%d')
            tendencia_dict[key]['paros']   += 1
            tendencia_dict[key]['minutos'] += p['tiempo_minutos']

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

    # ── Catálogo falla→tipo, calculado una sola vez si Pareto y/o Barras lo usan ──
    fallas_con_tipo = None
    if modo_pareto == 'tipo_falla' or modo_barras == 'tipo_falla':

        fallas_con_tipo = {}
        for f in CF.objects.filter(area__in=areas_disp).exclude(tipo_falla=''):
            if f.nombre_es:
                fallas_con_tipo[f.nombre_es] = f.tipo_falla
            if f.nombre_en:
                fallas_con_tipo[f.nombre_en] = f.tipo_falla

    # ── Pareto ────────────────────────────────────────────────────────────────
    if modo_pareto == 'tipo_falla':
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
            qs_graf
            .values('atendio')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_p  = [g['atendio'] or _('Sin quien atendio') for g in grupos_pareto]
        minutos_p = [g['minutos'] or 0 for g in grupos_pareto]
        nparos_p  = [g['n_paros'] for g in grupos_pareto]
    elif modo_pareto == 'equipo':
        grupos_pareto = (
            qs_graf
            .values('equipo')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_p  = [g['equipo'] for g in grupos_pareto]
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
            qs_graf
            .values('atendio')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_b  = [g['atendio'] or _('Sin quien atendio') for g in grupos_barras]
        minutos_b = [g['minutos'] or 0 for g in grupos_barras]
        nparos_b  = [g['n_paros'] for g in grupos_barras]
    elif modo_barras == 'equipo':
        grupos_barras = (
            qs_graf
            .values('equipo')
            .annotate(n_paros=Count('id'), minutos=Sum('tiempo_minutos'))
            .order_by('-minutos')
        )
        labels_b  = [g['equipo'] for g in grupos_barras]
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

    meses = [
        (1, _('Enero')), (2, _('Febrero')), (3, _('Marzo')), (4, _('Abril')),
        (5, _('Mayo')), (6, _('Junio')), (7, _('Julio')), (8, _('Agosto')),
        (9, _('Septiembre')), (10, _('Octubre')), (11, _('Noviembre')), (12, _('Diciembre')),
    ]

    return render(request, 'paros_app/analisis_paros.html', {
        'areas':                areas_disp,
        'area_id':              area_id,
        'periodo':              periodo,
        'fecha_desde':          fecha_desde,
        'fecha_hasta':          fecha_hasta,
        'semana_num':           semana_num,
        'mes_num':              mes_num,
        'mes_actual':           hoy.month,
        'anio_mes':             anio_mes,
        'anio_meses':           anio_meses,
        'anio_semanas':         anio_semanas,
        'meses':                meses,
        'anio_actual':          hoy.year,
        'turno':                turno,
        'sub_area_sel':         sub_area_sel,
        'subareas_disponibles': subareas_disponibles,
        'semana_actual':        semana_actual,
        'modo_pareto':          modo_pareto,
        'modo_barras':          modo_barras,
        'total_paros':          total_paros,
        'total_minutos':        total_minutos,
        'promedio_min':         promedio_min,
        'labels_p':             json.dumps(labels_p),
        'minutos_p':            json.dumps(minutos_p),
        'nparos_p':             json.dumps(nparos_p),
        'acum_p':               json.dumps(acum_p),
        'labels_b':             json.dumps(labels_b),
        'minutos_b':            json.dumps(minutos_b),
        'nparos_b':             json.dumps(nparos_b),
        'labels_t':             json.dumps(labels_t),
        'minutos_t':            json.dumps(minutos_t),
        'nparos_t':             json.dumps(nparos_t),
        'lista_fallas':         lista_fallas,
        'lista_responsables':   lista_responsables,
        'fallas_excluidas':     fallas_excluidas,
        'resp_excluidas':       resp_excluidas,
        'lista_tipos':          list(lista_tipos),
        'tipos_excluidos':      tipos_excluidos,
        'estatus_filtro':       estatus_filtro,
        'lista_atendio':        lista_atendio,
        'atendio_excluidos':    atendio_excluidos,
        'lista_equipos':        lista_equipos,
        'equipos_excluidos':    equipos_excluidos,
    })
