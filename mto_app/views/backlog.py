from datetime import date
from collections import defaultdict
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.db.models import Q

from ..models import SeguimientoOT, SeguimientoManual, RegistroEjecucion, Area


@login_required
def backlog_seguimientos(request):
    hoy     = date.today()
    area_id = request.GET.get('area', '')

    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    areas = Area.objects.filter(activa=True)

    semana_actual = hoy.isocalendar()[1]
    anio_actual   = hoy.year
    lunes_semana  = date.fromisocalendar(anio_actual, semana_actual, 1)

    qs_ot = SeguimientoOT.objects.select_related(
        'registro__plan__area'
    ).filter(
        estatus__in=['pendiente', 'en_proceso']
    ).filter(
        Q(fecha_compromiso__lte=hoy) |
        Q(registro__semana_inicio__lte=lunes_semana)
    )

    qs_registros = RegistroEjecucion.objects.select_related(
        'plan__area', 'responsable'
    ).filter(
        semana_inicio__lte=lunes_semana,
    ).exclude(
        estado='completada'
    )

    if not es_admin:
        try:
            areas_ids = request.user.acceso_mto.areas.values_list('id', flat=True)
            qs_registros = qs_registros.filter(plan__area__id__in=areas_ids)
        except Exception:
            qs_registros = qs_registros.none()

    if area_id:
        qs_registros = qs_registros.filter(plan__area__id=area_id)

    if not es_admin:
        try:
            areas_ids = request.user.acceso_mto.areas.values_list('id', flat=True)
            qs_ot = qs_ot.filter(registro__plan__area__id__in=areas_ids)
        except Exception:
            qs_ot = qs_ot.none()

    if area_id:
        qs_ot = qs_ot.filter(registro__plan__area__id=area_id)

    qs_manual = SeguimientoManual.objects.filter(
        fecha_compromiso__lte=hoy,
        estatus__in=['pendiente', 'en_proceso']
    )
    if area_id:
        qs_manual = qs_manual.filter(area_id=area_id)
    if not es_admin:
        try:
            areas_ids = request.user.acceso_mto.areas.values_list('id', flat=True)
            qs_manual = qs_manual.filter(area__id__in=areas_ids)
        except Exception:
            qs_manual = qs_manual.none()

    personas = defaultdict(lambda: {'ot': [], 'manual': []})

    contadores = {}
    for seg in qs_ot:
        r      = seg.registro
        semana = r.semana_num
        mes    = f"{r.semana_inicio.month:02d}"
        aa     = str(r.semana_inicio.year)[2:]
        key    = f"{semana:02d}{mes}{aa}"
        contadores[key] = contadores.get(key, 100) + 1
        seg.no_orden = f"{semana:02d}{mes}{aa}{contadores[key]}"

        nombre = seg.responsable or 'Sin asignar'
        dias = (hoy - seg.fecha_compromiso).days if seg.fecha_compromiso else (hoy - seg.registro.semana_inicio).days
        personas[nombre]['ot'].append({
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'fecha_compromiso': seg.fecha_compromiso,
            'dias_atraso':      dias,
            'estatus':          seg.estatus,
        })

    for seg in qs_manual:
        nombre = seg.responsable or 'Sin asignar'
        dias   = (hoy - seg.fecha_compromiso).days
        personas[nombre]['manual'].append({
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'fecha_compromiso': seg.fecha_compromiso,
            'dias_atraso':      dias,
            'estatus':          seg.estatus,
        })

    contadores_reg = {}
    for reg in qs_registros:
        semana = reg.semana_num
        mes    = f"{reg.semana_inicio.month:02d}"
        aa     = str(reg.semana_inicio.year)[2:]
        key    = f"{semana:02d}{mes}{aa}"
        contadores_reg[key] = contadores_reg.get(key, 100) + 1
        no_orden = f"{semana:02d}{mes}{aa}{contadores_reg[key]}"

        nombre = ''
        if reg.responsable:
            nombre = f"{reg.responsable.nombre} {reg.responsable.apellidos}".strip()
        nombre = nombre or 'Sin asignar'

        dias = (hoy - reg.semana_inicio).days

        personas[nombre]['ot'].append({
            'id':               reg.id,
            'no_orden':         no_orden,
            'problema':         reg.plan.actividad,
            'fecha_compromiso': reg.semana_inicio,
            'dias_atraso':      dias,
            'estatus':          reg.estado,
        })

    personas_lista = []
    for nombre, data in personas.items():
        total  = len(data['ot']) + len(data['manual'])
        pct_ot = round(len(data['ot']) / total * 100) if total > 0 else 0
        pct_m  = 100 - pct_ot
        personas_lista.append({
            'nombre':  nombre,
            'ot':      data['ot'],
            'manual':  data['manual'],
            'total':   total,
            'pct_ot':  pct_ot,
            'pct_m':   pct_m,
        })

    personas_lista.sort(key=lambda x: x['total'], reverse=True)

    total_ots      = sum(len(p['ot'])     for p in personas.values())
    total_manuales = sum(len(p['manual']) for p in personas.values())
    total_general  = total_ots + total_manuales

    pct_ot_general = round(total_ots / total_general * 100) if total_general > 0 else 0
    pct_m_general  = 100 - pct_ot_general

    area_nombre = None
    if area_id:
        try:
            area_nombre = Area.objects.get(id=area_id).nombre
        except Area.DoesNotExist:
            pass

    return render(request, 'mto_app/seguimientos/backlog_seguimientos.html', {
        'personas':       personas_lista,
        'areas':          areas,
        'area_id':        area_id,
        'area_nombre':    area_nombre,
        'hoy':            hoy,
        'total_ots':      total_ots,
        'total_manuales': total_manuales,
        'total_general':  total_general,
        'pct_ot_general': pct_ot_general,
        'pct_m_general':  pct_m_general,
    })