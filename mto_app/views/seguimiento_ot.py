import json
from datetime import date
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.http import JsonResponse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from ..models import RegistroEjecucion, SeguimientoOT
from .planes import numerar_seguimientos
from .utils import requiere_permiso_json


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
        'fecha_creacion':       seg.fecha_creacion.strftime('%d/%m/%Y'),
        'creado_por':           (editor.get_full_name() or editor.username) if editor else '',
        'modificado_iso':       seg.modificado.isoformat() if seg.modificado else '',
    }


def _leer_y_validar(request, fecha_minima, fecha_actual=None):
    """Lee el JSON del formulario y valida: Problema, Acción y Responsable son obligatorios y la fecha
    compromiso no puede ser anterior a la fecha de creación (salvo que sea la que ya tenía guardada).
    Devuelve (datos, errores)."""
    data = json.loads(request.body)
    datos = {
        'problema':    data.get('problema', '').strip(),
        'accion':      data.get('accion', '').strip(),
        'responsable': data.get('responsable', '').strip(),
        'estatus':     data.get('estatus', 'pendiente'),
        'notas':       data.get('notas', '').strip(),
    }
    errores = {}
    if not datos['problema']:
        errores['problema'] = _('Describe el problema')
    if not datos['responsable']:
        errores['responsable'] = _('Elige un responsable de la lista')
    if datos['estatus'] not in dict(SeguimientoOT.ESTATUS_CHOICES):
        datos['estatus'] = 'pendiente'
    fecha_str = data.get('fecha_compromiso', '')
    try:
        datos['fecha_compromiso'] = date.fromisoformat(fecha_str) if fecha_str else None
    except ValueError:
        datos['fecha_compromiso'] = None
        errores['fecha'] = _('La fecha no es válida')
    if datos['fecha_compromiso'] and datos['fecha_compromiso'] < fecha_minima and datos['fecha_compromiso'] != fecha_actual:
        errores['fecha'] = _('La fecha compromiso no puede ser anterior a la creación (%(f)s)') % {'f': fecha_minima.strftime('%d/%m/%Y')}
    return datos, errores


def _error(errores):
    return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=400)


@login_required
@require_POST
@requiere_permiso_json('llenar_seguimiento', 'editar_seguimiento')
def agregar_seguimiento(request, registro_pk):
    registro = get_object_or_404(RegistroEjecucion, pk=registro_pk)
    try:
        datos, errores = _leer_y_validar(request, timezone.localdate())
        if errores:
            return _error(errores)
        seg = SeguimientoOT.objects.create(registro=registro, tipo='correctiva', creado_por=request.user, **datos)
        return JsonResponse(_respuesta(seg))
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
@requiere_permiso_json('editar_seguimiento')
def editar_seguimiento(request, seguimiento_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seguimiento_pk)
    try:
        datos, errores = _leer_y_validar(request, timezone.localtime(seg.fecha_creacion).date(), seg.fecha_compromiso)
        if errores:
            return _error(errores)
        for campo, valor in datos.items():
            setattr(seg, campo, valor)
        if seg.estatus != 'completado':
            seg.validado = False          # solo se valida lo completado: si se reabre, la validación se reinicia
        seg.save()
        return JsonResponse(_respuesta(seg))
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
@requiere_permiso_json('eliminar_seguimiento')
def eliminar_seguimiento(request, seguimiento_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seguimiento_pk)
    seg.delete()
    return JsonResponse({'ok': True})


@login_required
@require_POST
@requiere_permiso_json('validar_seguimiento')
def toggle_validado_ot(request, seg_pk):
    seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
    seg.validado = not seg.validado
    seg.save()
    return JsonResponse({'ok': True, 'validado': seg.validado})
