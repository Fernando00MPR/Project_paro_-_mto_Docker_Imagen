"""Correctivos manuales (folio M00000012, sin OT del Plan): alta, edición, borrado y validación desde la lista de
Seguimientos. Mismas reglas de captura que los correctivos de OT (seguimiento_ot._validar), salvo que el
responsable es opcional."""
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from ..models import SeguimientoManual
from .seguimiento_ot import _leer_json, _validar, _error, _datos_no_validos, ERROR_DATOS
from .utils import requiere_permiso_json, areas_visibles_mto, seguimiento_o_404


def _respuesta(seg):
    return {
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
        'fecha_creacion':   timezone.localtime(seg.fecha_creacion).strftime('%d/%m/%Y'),   # hora local, no UTC
        'notas':            seg.notas,
        'imagenes_count':   seg.imagenes.count(),
    }


def _area_nueva(request, area_id):
    """Área del correctivo nuevo: la elegida en el filtro de la lista, si es del usuario; con "Todas las áreas",
    su única área si solo tiene una. None si no se puede saber (no se guarda: sin área solo lo vería el
    administrador y desaparecería de la lista de quien lo creó)."""
    visibles = list(areas_visibles_mto(request).values_list('pk', flat=True))
    if str(area_id or '').isdigit() and int(area_id) in visibles:
        return int(area_id)
    return visibles[0] if len(visibles) == 1 else None


@login_required
@require_POST
@requiere_permiso_json('llenar_seguimiento', 'editar_seguimiento')
def agregar_seguimiento_manual(request):
    data = _leer_json(request)
    if data is None:
        return _datos_no_validos()
    area_id = _area_nueva(request, data.get('area_id'))
    if area_id is None:
        return _error({ERROR_DATOS: _('Elige un área en el filtro de arriba para crear el seguimiento.')})
    datos, errores = _validar(data, timezone.localdate(), responsable_obligatorio=False)
    if errores:
        return _error(errores)

    with transaction.atomic():   # el consecutivo se calcula y se usa sin que otro alta lo tome a la vez
        ultimo = SeguimientoManual.objects.select_for_update().order_by('-consecutivo').first()
        seg = SeguimientoManual.objects.create(
            consecutivo=(ultimo.consecutivo + 1) if ultimo else 1,
            area_id=area_id, tipo='correctiva', creado_por=request.user, **datos,
        )
    return JsonResponse(_respuesta(seg))


@login_required
@require_POST
@requiere_permiso_json('editar_seguimiento')
def editar_seguimiento_manual(request, seg_pk):
    seg = seguimiento_o_404(request, SeguimientoManual, seg_pk)
    data = _leer_json(request)
    if data is None:
        return _datos_no_validos()
    datos, errores = _validar(data, timezone.localtime(seg.fecha_creacion).date(), seg.fecha_compromiso,
                              responsable_obligatorio=False)
    if errores:
        return _error(errores)
    for campo, valor in datos.items():
        setattr(seg, campo, valor)
    if seg.estatus != 'completado':
        seg.validado = False      # solo se valida lo completado: si se reabre, la validación se reinicia
    seg.save()
    return JsonResponse(_respuesta(seg))


@login_required
@require_POST
@requiere_permiso_json('eliminar_seguimiento')
def eliminar_seguimiento_manual(request, seg_pk):
    seguimiento_o_404(request, SeguimientoManual, seg_pk).delete()   # sus fotos se borran con él (señal post_delete)
    return JsonResponse({'ok': True})


@login_required
@require_POST
@requiere_permiso_json('validar_seguimiento')
def toggle_validado_manual(request, seg_pk):
    seg = seguimiento_o_404(request, SeguimientoManual, seg_pk)
    if not seg.validado and seg.estatus != 'completado':
        return _error({ERROR_DATOS: _('No se puede validar: la actividad aún no está completada.')})
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})
