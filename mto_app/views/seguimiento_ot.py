"""Correctivos ligados a una OT del Plan (SeguimientoOT): alta, edición, borrado y validación.
Los usa el detalle de la tarea en el Plan (plan_seguimiento_form.js). Las reglas de captura (_leer_json y _validar)
también las usan los correctivos manuales (seguimiento_manual.py)."""
import json
from datetime import date
from django.contrib.auth.decorators import login_required
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from ..models import RegistroEjecucion, SeguimientoOT
from .planes import numerar_seguimientos
from .utils import requiere_permiso_json, area_visible, seguimiento_o_404


def _orden(seg):
    """No. de orden del seguimiento (mismo formato y numeración que muestra el detalle del plan)."""
    del_plan = list(SeguimientoOT.objects.filter(registro__plan=seg.registro.plan).select_related('registro'))
    numerar_seguimientos(del_plan)
    return next((s.no_orden for s in del_plan if s.pk == seg.pk), '')


def _respuesta(seg):
    editor = seg.creado_por
    return {
        'ok':                   True,
        'id':                   seg.id,
        'orden':                _orden(seg),
        'tipo':                 seg.tipo,
        'tipo_display':         seg.get_tipo_display(),
        'problema':             seg.problema,
        'accion':               seg.accion,
        'responsable':          seg.responsable,
        'fecha_compromiso':     seg.fecha_compromiso.strftime('%d/%m/%Y') if seg.fecha_compromiso else '',
        'fecha_compromiso_iso': seg.fecha_compromiso.isoformat() if seg.fecha_compromiso else '',
        'estatus':              seg.estatus,
        'estatus_display':      seg.get_estatus_display(),
        'notas':                seg.notas,
        'fecha_creacion':       timezone.localtime(seg.fecha_creacion).strftime('%d/%m/%Y'),   # hora local, no UTC
        'creado_por':           (editor.get_full_name() or editor.username) if editor else '',
        'modificado_iso':       seg.modificado.isoformat() if seg.modificado else '',
    }


def _leer_json(request):
    """El cuerpo JSON del formulario como dict (None si no es un JSON de objeto)."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _validar(data, fecha_minima, fecha_actual=None, responsable_obligatorio=True):
    """Valida lo capturado: Problema obligatorio; Responsable obligatorio en los de OT (en los manuales es
    opcional); estatus de la lista; la fecha compromiso no puede ser anterior a la fecha de creación (salvo que sea
    la que ya tenía guardada). Devuelve (datos, errores)."""
    datos = {
        'problema':    str(data.get('problema') or '').strip(),
        'accion':      str(data.get('accion') or '').strip(),
        'responsable': str(data.get('responsable') or '').strip(),
        'estatus':     str(data.get('estatus') or 'pendiente'),
        'notas':       str(data.get('notas') or '').strip(),
    }
    errores = {}
    if not datos['problema']:
        errores['problema'] = _('Describe el problema')
    if responsable_obligatorio and not datos['responsable']:
        errores['responsable'] = _('Elige un responsable de la lista')
    if datos['estatus'] not in dict(SeguimientoOT.ESTATUS_CHOICES):
        datos['estatus'] = 'pendiente'
    fecha_str = data.get('fecha_compromiso') or ''
    try:
        datos['fecha_compromiso'] = date.fromisoformat(fecha_str) if fecha_str else None
    except (TypeError, ValueError):
        datos['fecha_compromiso'] = None
        errores['fecha'] = _('La fecha no es válida')
    if datos['fecha_compromiso'] and datos['fecha_compromiso'] < fecha_minima and datos['fecha_compromiso'] != fecha_actual:
        errores['fecha'] = _('La fecha compromiso no puede ser anterior a la creación (%(f)s)') % {'f': fecha_minima.strftime('%d/%m/%Y')}
    return datos, errores


def _error(errores, status=400):
    """Respuesta de error: `error` (primer mensaje, lo usa la lista) y `errores` por campo (los usa el Plan)."""
    return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=status)


ERROR_DATOS = 'general'


def _datos_no_validos():
    return _error({ERROR_DATOS: _('Los datos enviados no son válidos.')})


@login_required
@require_POST
@requiere_permiso_json('llenar_seguimiento', 'editar_seguimiento')
def agregar_seguimiento(request, registro_pk):
    registro = get_object_or_404(RegistroEjecucion.objects.select_related('plan'), pk=registro_pk)
    if not area_visible(request, registro.plan.area_id):
        raise Http404   # una OT de otra área: como si no existiera
    data = _leer_json(request)
    if data is None:
        return _datos_no_validos()
    datos, errores = _validar(data, timezone.localdate())
    if errores:
        return _error(errores)
    seg = SeguimientoOT.objects.create(registro=registro, tipo='correctiva', creado_por=request.user, **datos)
    return JsonResponse(_respuesta(seg))


@login_required
@require_POST
@requiere_permiso_json('editar_seguimiento')
def editar_seguimiento(request, seguimiento_pk):
    seg = seguimiento_o_404(request, SeguimientoOT, seguimiento_pk)
    data = _leer_json(request)
    if data is None:
        return _datos_no_validos()
    datos, errores = _validar(data, timezone.localtime(seg.fecha_creacion).date(), seg.fecha_compromiso)
    if errores:
        return _error(errores)
    for campo, valor in datos.items():
        setattr(seg, campo, valor)
    if seg.estatus != 'completado':
        seg.validado = False          # solo se valida lo completado: si se reabre, la validación se reinicia
    seg.save()
    return JsonResponse(_respuesta(seg))


@login_required
@require_POST
@requiere_permiso_json('eliminar_seguimiento')
def eliminar_seguimiento(request, seguimiento_pk):
    seguimiento_o_404(request, SeguimientoOT, seguimiento_pk).delete()   # sus fotos se borran con él (señal post_delete)
    return JsonResponse({'ok': True})


@login_required
@require_POST
@requiere_permiso_json('validar_seguimiento')
def toggle_validado_ot(request, seg_pk):
    seg = seguimiento_o_404(request, SeguimientoOT, seg_pk)
    if not seg.validado and seg.estatus != 'completado':
        return _error({ERROR_DATOS: _('No se puede validar: la actividad aún no está completada.')})
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})
