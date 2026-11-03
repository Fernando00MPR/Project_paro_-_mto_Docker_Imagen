import json
from datetime import date
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db import transaction

from login_app.permisos import puede_mto
from .utils import requiere_permiso_json
from ..models import SeguimientoManual


@login_required
@require_POST
@requiere_permiso_json('llenar_seguimiento', 'editar_seguimiento')
def agregar_seguimiento_manual(request):
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
            'imagenes_count':   seg.imagenes.count(),
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
@requiere_permiso_json('editar_seguimiento')
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
        if seg.estatus != 'completado':
            seg.validado     = False      # solo se valida lo completado: si se reabre, la validación se reinicia
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
            'imagenes_count':   seg.imagenes.count(),
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
@requiere_permiso_json('eliminar_seguimiento')
def eliminar_seguimiento_manual(request, seg_pk):
    seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    seg.delete()
    return JsonResponse({'ok': True})


@login_required
@require_POST
def toggle_validado_manual(request, seg_pk):
    if not puede_mto(request.user, 'validar_seguimiento'):
        return JsonResponse({'ok': False, 'error': 'No tienes permiso para validar seguimientos.'}, status=403)
    
    seg = get_object_or_404(SeguimientoManual, pk=seg_pk)

    if not seg.validado and seg.estatus != 'completado':
        return JsonResponse({'ok': False, 'error': 'No se puede validar: la actividad aún no está completada.'}, status=400)
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})