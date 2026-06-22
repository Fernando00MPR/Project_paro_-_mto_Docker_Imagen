import json
from datetime import date
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from ..models import RegistroEjecucion, SeguimientoOT


@login_required
@require_POST
def agregar_seguimiento(request, registro_pk):
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
@require_POST
def toggle_validado_ot(request, seg_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})