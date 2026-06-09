from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from django.shortcuts import render

from ..models import PlanMantenimiento, RegistroEjecucion, Responsable
from .utils import lunes_de_semana

import json
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from ..models import SeguimientoOT
from ..models import SeguimientoManual

@login_required
@xframe_options_exempt
def registro_ejecucion(request, plan_pk, semana, anio):
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = RegistroEjecucion.objects.filter(plan=plan, semana_inicio=lunes).first()
    responsables = Responsable.objects.filter(area=plan.area, activo=True).order_by('apellidos', 'nombre')

    if request.method == 'POST':
        estado         = request.POST.get('estado', 'pendiente')
        responsable_id = request.POST.get('responsable') or None
        fecha_str      = request.POST.get('fecha_ejecucion', '')
        observaciones  = request.POST.get('observaciones', '').strip()

        try:
            fecha_ej = date.fromisoformat(fecha_str) if fecha_str else None
        except Exception:
            fecha_ej = None

        if registro:
            registro.estado          = estado
            registro.responsable_id  = responsable_id
            registro.fecha_ejecucion = fecha_ej
            registro.observaciones   = observaciones
            registro.save()
        else:
            RegistroEjecucion.objects.create(
                plan=plan,
                semana_num=semana,
                anio=anio,
                semana_inicio=lunes,
                estado=estado,
                responsable_id=responsable_id,
                fecha_ejecucion=fecha_ej,
                observaciones=observaciones,
            )

        return HttpResponse(f'''
            <script>
                window.parent.postMessage('registro_guardado:{plan_pk}:{anio}', '*');
            </script>
        ''')

    ctx = {
        'plan':          plan,
        'semana':        semana,
        'anio':          anio,
        'lunes':         lunes,
        'domingo':       lunes + timedelta(days=6),
        'registro':      registro,
        'responsables':  responsables,
        'estados':       RegistroEjecucion.ESTADO_CHOICES,
    }
    return render(request, 'mto_app/plan/registro_form.html', ctx)


@login_required
@xframe_options_exempt
def eliminar_registro(request, plan_pk, semana, anio):
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = get_object_or_404(RegistroEjecucion, plan=plan, semana_inicio=lunes)
    if request.method == 'POST':
        registro.delete()
        return HttpResponse(status=200)
    return HttpResponse(status=405)


@login_required
def asignar_responsable(request, plan_pk, semana, anio):
    plan  = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes = lunes_de_semana(anio, semana)

    if request.method == 'POST':
        responsable_id = request.POST.get('responsable') or None
        registro, _    = RegistroEjecucion.objects.get_or_create(
            plan=plan,
            semana_inicio=lunes,
            defaults={
                'semana_num': semana,
                'anio':       anio,
                'estado':     'pendiente',
            }
        )
        if responsable_id:
            try:
                responsable_obj        = Responsable.objects.get(pk=responsable_id)
                registro.responsable   = responsable_obj
            except Responsable.DoesNotExist:
                registro.responsable   = None
        else:
            registro.responsable = None

        registro.save()
        return HttpResponse(status=200)
    return HttpResponse(status=405)

@login_required
@require_POST
def agregar_seguimiento(request, registro_pk):
    from django.views.decorators.csrf import csrf_exempt
    registro = get_object_or_404(RegistroEjecucion, pk=registro_pk)
    try:
        data             = json.loads(request.body)
        problema         = data.get('problema', '').strip()
        accion           = data.get('accion', '').strip()
        responsable      = data.get('responsable', '').strip()
        fecha_str        = data.get('fecha_compromiso', '')
        estatus          = data.get('estatus', 'pendiente')
        notas            = data.get('notas', '').strip()

        if not problema:
            return JsonResponse({'ok': False, 'error': 'El problema es obligatorio.'}, status=400)

        try:
            fecha_compromiso = date.fromisoformat(fecha_str) if fecha_str else None
        except ValueError:
            fecha_compromiso = None

        seg = SeguimientoOT.objects.create(
            registro=registro,
            tipo='correctiva',
            problema=problema,
            accion=accion,
            responsable=responsable,
            fecha_compromiso=fecha_compromiso,
            estatus=estatus,
            notas=notas,
            creado_por=request.user,
        )
        return JsonResponse({
            'ok':               True,
            'id':               seg.id,
            'tipo':             seg.get_tipo_display(),
            'problema':         seg.problema,
            'accion':           seg.accion,
            'responsable':      seg.responsable,
            'fecha_compromiso': seg.fecha_compromiso.strftime('%d/%m/%Y') if seg.fecha_compromiso else '',
            'estatus':          seg.estatus,
            'estatus_display':  seg.get_estatus_display(),
            'fecha_creacion':   seg.fecha_creacion.strftime('%d/%m/%Y'),
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
def editar_seguimiento(request, seguimiento_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seguimiento_pk)
    try:
        data             = json.loads(request.body)
        problema         = data.get('problema', '').strip()
        accion           = data.get('accion', '').strip()
        responsable      = data.get('responsable', '').strip()
        fecha_str        = data.get('fecha_compromiso', '')
        estatus          = data.get('estatus', 'pendiente')
        notas            = data.get('notas', '').strip()

        if not problema:
            return JsonResponse({'ok': False, 'error': 'El problema es obligatorio.'}, status=400)

        try:
            fecha_compromiso = date.fromisoformat(fecha_str) if fecha_str else None
        except ValueError:
            fecha_compromiso = None

        seg.problema         = problema
        seg.accion           = accion
        seg.responsable      = responsable
        seg.fecha_compromiso = fecha_compromiso
        seg.estatus          = estatus
        seg.notas            = notas
        seg.save()

        return JsonResponse({
            'ok':               True,
            'id':               seg.id,
            'problema':         seg.problema,
            'accion':           seg.accion,
            'responsable':      seg.responsable,
            'fecha_compromiso': seg.fecha_compromiso.strftime('%d/%m/%Y') if seg.fecha_compromiso else '',
            'estatus':          seg.estatus,
            'estatus_display':  seg.get_estatus_display(),
            'notas':            seg.notas,
            'fecha_creacion':   seg.fecha_creacion.strftime('%d/%m/%Y'),
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
def eliminar_seguimiento(request, seguimiento_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seguimiento_pk)
    seg.delete()
    return JsonResponse({'ok': True})


@login_required
def lista_seguimientos(request):
    from django.db.models import Q
    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    estatus         = request.GET.get('estatus', '')
    area_id         = request.GET.get('area', '')
    tipo_filtro     = request.GET.get('tipo', '')
    filtro_orden    = request.GET.get('orden', '').strip()
    filtro_problema = request.GET.get('problema', '').strip()
    filtro_accion   = request.GET.get('accion', '').strip()
    filtro_validado = request.GET.get('validado', '')

    qs = SeguimientoOT.objects.select_related(
        'registro__plan__area', 'registro__responsable'
    ).all()

    if not es_admin:
        try:
            areas_ids = request.user.acceso_mto.areas.values_list('id', flat=True)
            qs = qs.filter(registro__plan__area__id__in=areas_ids)
        except Exception:
            qs = qs.none()

    if estatus:
        qs = qs.filter(estatus=estatus)
    if area_id:
        qs = qs.filter(registro__plan__area__id=area_id)
    if filtro_problema:
        qs = qs.filter(problema__icontains=filtro_problema)
    if filtro_accion:
        qs = qs.filter(accion__icontains=filtro_accion)
    if filtro_validado != '':
        qs = qs.filter(validado=filtro_validado == '1')

    # Calcular número de orden
    seguimientos = []
    contadores = {}
    for seg in qs.order_by('registro__semana_inicio', 'registro__id'):
        r      = seg.registro
        semana = r.semana_num
        mes    = f"{r.semana_inicio.month:02d}"
        aa     = str(r.semana_inicio.year)[2:]
        key    = f"{semana:02d}{mes}{aa}"
        contadores[key] = contadores.get(key, 100) + 1
        no_orden = f"{semana:02d}{mes}{aa}{contadores[key]}"
        seg.no_orden = no_orden
        seguimientos.append(seg)

    # Filtrar por No. Orden después de calcularlo
    if filtro_orden:
        seguimientos = [s for s in seguimientos if filtro_orden.lower() in s.no_orden.lower()]

    if tipo_filtro == 'ot':
        seguimientos_manuales = SeguimientoManual.objects.none()
    else:
        seguimientos_manuales = SeguimientoManual.objects.all()
        if area_id:
            seguimientos_manuales = seguimientos_manuales.filter(area_id=area_id)
        if estatus:
            seguimientos_manuales = seguimientos_manuales.filter(estatus=estatus)
        if filtro_problema:
            seguimientos_manuales = seguimientos_manuales.filter(problema__icontains=filtro_problema)
        if filtro_accion:
            seguimientos_manuales = seguimientos_manuales.filter(accion__icontains=filtro_accion)
        if filtro_validado != '':
            seguimientos_manuales = seguimientos_manuales.filter(validado=filtro_validado == '1')
        if filtro_orden:
            orden_limpio = filtro_orden.upper().lstrip('M').lstrip('0') or '0'
            try:
                consecutivo_num = int(orden_limpio)
                seguimientos_manuales = seguimientos_manuales.filter(consecutivo=consecutivo_num)
            except ValueError:
                seguimientos_manuales = seguimientos_manuales.none()

    if tipo_filtro == 'manual':
        seguimientos = []

    from mto_app.models import Area
    areas = Area.objects.filter(activa=True)

    area_nombre = None
    if area_id:
        try:
            area_nombre = Area.objects.get(id=area_id).nombre
        except Area.DoesNotExist:
            pass

    return render(request, 'mto_app/seguimientos/lista_seguimientos.html', {
        'seguimientos':          seguimientos,
        'seguimientos_manuales': seguimientos_manuales,
        'estatus_filtro':        estatus,
        'area_filtro':           area_id,
        'tipo_filtro':           tipo_filtro,
        'filtro_orden':          filtro_orden,
        'filtro_problema':       filtro_problema,
        'filtro_accion':         filtro_accion,
        'filtro_validado':       filtro_validado,
        'areas':                 areas,
        'estatus_choices':       SeguimientoOT.ESTATUS_CHOICES,
        'area_nombre':           area_nombre,
    })

@login_required
@require_POST
def agregar_seguimiento_manual(request):
    from django.db import transaction
    try:
        data             = json.loads(request.body)
        problema         = data.get('problema', '').strip()
        if not problema:
            return JsonResponse({'ok': False, 'error': 'El problema es obligatorio.'}, status=400)

        accion           = data.get('accion', '').strip()
        responsable      = data.get('responsable', '').strip()
        fecha_str        = data.get('fecha_compromiso', '')
        estatus          = data.get('estatus', 'pendiente')
        notas            = data.get('notas', '').strip()
        area_id          = data.get('area_id') or None

        try:
            fecha_compromiso = date.fromisoformat(fecha_str) if fecha_str else None
        except ValueError:
            fecha_compromiso = None

        with transaction.atomic():
            ultimo = SeguimientoManual.objects.select_for_update().order_by('-consecutivo').first()
            consecutivo = (ultimo.consecutivo + 1) if ultimo else 1

            seg = SeguimientoManual.objects.create(
                consecutivo=consecutivo,
                area_id=area_id,
                tipo='correctiva',
                problema=problema,
                accion=accion,
                responsable=responsable,
                fecha_compromiso=fecha_compromiso,
                estatus=estatus,
                notas=notas,
                creado_por=request.user,
            )

        return JsonResponse({
            'ok':               True,
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'tipo':             seg.get_tipo_display(),
            'problema':         seg.problema,
            'accion':           seg.accion,
            'responsable':      seg.responsable,
            'fecha_compromiso': seg.fecha_compromiso.strftime('%d/%m/%Y') if seg.fecha_compromiso else '',
            'estatus':          seg.estatus,
            'estatus_display':  seg.get_estatus_display(),
            'fecha_creacion':   seg.fecha_creacion.strftime('%d/%m/%Y'),
            'notas':            seg.notas,
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
def editar_seguimiento_manual(request, seg_pk):
    seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    try:
        data             = json.loads(request.body)
        problema         = data.get('problema', '').strip()
        if not problema:
            return JsonResponse({'ok': False, 'error': 'El problema es obligatorio.'}, status=400)

        seg.problema         = problema
        seg.accion           = data.get('accion', '').strip()
        seg.responsable      = data.get('responsable', '').strip()
        seg.notas            = data.get('notas', '').strip()
        seg.estatus          = data.get('estatus', 'pendiente')
        fecha_str            = data.get('fecha_compromiso', '')
        try:
            seg.fecha_compromiso = date.fromisoformat(fecha_str) if fecha_str else None
        except ValueError:
            seg.fecha_compromiso = None
        seg.save()

        return JsonResponse({
            'ok':               True,
            'id':               seg.id,
            'no_orden':         seg.no_orden,
            'problema':         seg.problema,
            'accion':           seg.accion,
            'responsable':      seg.responsable,
            'fecha_compromiso': seg.fecha_compromiso.strftime('%d/%m/%Y') if seg.fecha_compromiso else '',
            'estatus':          seg.estatus,
            'estatus_display':  seg.get_estatus_display(),
            'notas':            seg.notas,
            'fecha_creacion':   seg.fecha_creacion.strftime('%d/%m/%Y'),
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
def eliminar_seguimiento_manual(request, seg_pk):
    seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    seg.delete()
    return JsonResponse({'ok': True})


@login_required
@require_POST
def toggle_validado_ot(request, seg_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})


@login_required
@require_POST
def toggle_validado_manual(request, seg_pk):
    seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})

@login_required
def backlog_seguimientos(request):
    from datetime import date
    hoy     = date.today()
    area_id = request.GET.get('area', '')

    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    from mto_app.models import Area
    areas = Area.objects.filter(activa=True)

    # OTs atrasadas
    from datetime import date
    import datetime

    semana_actual = hoy.isocalendar()[1]
    anio_actual   = hoy.year
    lunes_semana  = date.fromisocalendar(anio_actual, semana_actual, 1)

    from django.db.models import Q

    qs_ot = SeguimientoOT.objects.select_related(
        'registro__plan__area'
    ).filter(
        estatus__in=['pendiente', 'en_proceso']
    ).filter(
        Q(fecha_compromiso__lte=hoy) |
        Q(registro__semana_inicio__lte=lunes_semana)
    )

    from ..models import RegistroEjecucion

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

    # Manuales atrasados
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

    # Agrupar por responsable
    from collections import defaultdict
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
        dias   = (hoy - seg.fecha_compromiso).days
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

    # Ordenar por total de atrasados desc
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
    
    total_ots     = sum(len(p['ot'])     for p in personas.values())
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