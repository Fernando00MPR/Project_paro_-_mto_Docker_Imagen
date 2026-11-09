"""
Registrar ejecución de una tarea del Plan en una semana (RegistroEjecucion), validarla, eliminarla y asignarle
responsable. El formulario es una página aparte que se carga en un <iframe> del detalle del plan (registro_form.html +
registro_form.js); el celular (plan_movil.js) manda el mismo POST. Las reglas de negocio se aplican aquí, en el
servidor, aunque el navegador también las revise. Diagrama: docs/flujos/procesos/registrar-validar-ot.md
"""
import json
from datetime import date, datetime, timedelta
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, render
from django.http import Http404, HttpResponse, HttpResponseForbidden, JsonResponse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.clickjacking import xframe_options_exempt

from login_app.permisos import puede_mto, get_perfil
from paros_app.models import imagen_subida_valida
from .utils import lunes_de_semana, puede_asignar_responsable, numeros_ot_semana, puede_ver_plan
from ..models import ImagenRegistro, PlanMantenimiento, RegistroEjecucion, Responsable

MAX_FOTOS = 4
MAX_BYTES_FOTO = 5 * 1024 * 1024
ESTADOS = {v for v, _l in RegistroEjecucion.ESTADO_CHOICES}
VALIDACIONES = {v for v, _l in RegistroEjecucion.VALIDACION_CHOICES}
ETIQUETAS_FOTO = {'', 'antes', 'despues'}
ESTADOS_CERRADOS = {'completada', 'cancelada', 'reagendada'}     # ya llenado: modificarlo pide Editar


def permisos_registro(user, registro):
    """Qué puede hacer `user` con este registro (o con la semana, si aún no existe):
    - editable:     Editar, o Llenar mientras el registro no exista o siga Pendiente.
    - solo_validar: tiene Validar pero no puede modificar: solo cambia la validación.
    - solo_lectura: puede verlo, nada más."""
    editar = puede_mto(user, 'editar_plan_mantenimiento')
    llenar = editar or puede_mto(user, 'llenar_plan_mantenimiento')
    validar = puede_mto(user, 'validar_plan_mantenimiento')
    cerrado = bool(registro and registro.estado in ESTADOS_CERRADOS)
    if editar or (llenar and not cerrado):
        modo = 'editable'
    elif validar and registro:
        modo = 'solo_validar'
    else:
        modo = 'solo_lectura'
    return {
        'modo':     modo, 
        'editar':   editar, 
        'llenar':   llenar, 
        'validar':  validar, 
        'cerrado':  cerrado,
        'eliminar': puede_mto(user, 'eliminar_plan_mantenimiento'),
        'asignar':  puede_asignar_responsable(user)
    }


def es_admin(user):
    """Superusuario o administrador (perfil.es_admin): los únicos que pueden corregir la fecha de validación."""
    perfil = get_perfil(user)
    return user.is_superuser or bool(perfil and perfil.es_admin)


def _lunes_o_404(anio, semana):
    try:
        return lunes_de_semana(anio, semana)
    except ValueError:
        raise Http404


def _semanas_atraso(fecha_ejecucion, lunes_programado):
    """Lunes de la semana ISO; una semana imposible en la URL (S0, S54, S53 en un año sin ella) da 404 y no error 500."""
    if not fecha_ejecucion:
        return 0
    lunes_ejecucion = fecha_ejecucion - timedelta(days=fecha_ejecucion.weekday())
    return max((lunes_ejecucion - lunes_programado).days // 7, 0)


def _entero(valor):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _responsable_valido(pk, plan, actual_id=None):
    """Solo personas existentes del área del plan (o la que ya tenía el registro, aunque hoy esté inactiva)."""
    if not pk:
        return None
    qs = Responsable.objects.filter(pk=pk, area=plan.area)
    if actual_id and str(pk) == str(actual_id):
        return qs.first()
    return qs.filter(activo=True).first()


def _guardar_registro(request, plan, registro, semana, anio, lunes):
    """Valida y guarda el POST de "Registrar ejecución". Devuelve (registro, errores)."""
    post = request.POST
    errores = {}
    perm = permisos_registro(request.user, registro)
    if perm['modo'] == 'solo_lectura':
        msg = (_('Este registro ya fue llenado. Para modificarlo necesitas permiso de edición.') if perm['llenar']
               else _('No tienes permiso para registrar ejecuciones.'))
        return None, {'general': msg}
    if perm['modo'] == 'solo_validar':
        # Solo puede cambiar la validación: todo lo demás se toma tal como está guardado.
        post = request.POST.copy()
        post['estado'] = registro.estado
        post['responsable'] = registro.responsable_id or ''
        post['fecha_ejecucion'] = registro.fecha_ejecucion.isoformat() if registro.fecha_ejecucion else ''
        post['observaciones'] = registro.observaciones
        post['motivo_cancelacion'] = registro.motivo_cancelacion
        post['reagendada_anio'] = registro.reagendada_anio or ''
        post['reagendada_semana'] = registro.reagendada_semana or ''
        post.setlist('fotos_quitar', [])

    if not perm['asignar']:
        # Sin permiso de Editar ni Validar no se asigna responsable: se queda el
        # que ya tiene la semana, y sin uno no se puede registrar la ejecución.
        post = post.copy()
        post['responsable'] = (registro.responsable_id if registro else None) or ''
        if not post['responsable']:
            errores['responsable'] = _('Esta semana aún no tiene responsable. Pide a un supervisor que lo asigne.')
    
    hoy = timezone.localdate()

    estado = post.get('estado', 'pendiente')
    if estado not in ESTADOS:
        estado = 'pendiente'

    try:
        fecha_ej = date.fromisoformat(post.get('fecha_ejecucion', '')) if post.get('fecha_ejecucion') else None
    except ValueError:
        fecha_ej = None
        errores['fecha_ejecucion'] = _('La fecha no es válida')
    if fecha_ej and fecha_ej > hoy:
        errores['fecha_ejecucion'] = _('La fecha de ejecución no puede ser futura')
    if estado == 'completada' and not fecha_ej and 'fecha_ejecucion' not in errores:
        errores['fecha_ejecucion'] = _('La fecha de ejecución es obligatoria')

    actual_resp_id = registro.responsable_id if registro else None
    responsable = _responsable_valido(post.get('responsable'), plan, actual_resp_id)
    if post.get('responsable') and not responsable:
        errores['responsable'] = _('Elige un responsable de la lista')

    motivo_cancelacion = post.get('motivo_cancelacion', '').strip() if estado == 'cancelada' else ''
    if estado == 'cancelada' and not motivo_cancelacion:
        errores['motivo_cancelacion'] = _('Indica el motivo de la cancelación')

    reag_anio = reag_semana = None
    if estado == 'reagendada':
        reag_anio, reag_semana = _entero(post.get('reagendada_anio')), _entero(post.get('reagendada_semana'))
    
        if (not reag_anio or not reag_semana or not 2000 <= reag_anio <= 2100 
            or not 1 <= reag_semana <= date(reag_anio, 12, 28).isocalendar()[1]):
            errores['reagendada_semana'] = _('Elige la semana a la que se reagenda')

    # ── Fotos: quitar / etiquetar las existentes y sumar nuevas (máx. 4 en total) ──
    existentes = list(registro.imagenes.all()) if registro else []
    quitar = {_entero(x) for x in post.getlist('fotos_quitar')}
    
    try:
        etiquetas = {int(k): v for k, v in json.loads(post.get('fotos_etiquetas') or '{}').items()}
    except (ValueError, TypeError, AttributeError):
        etiquetas = {}
    
    nuevas = [] if perm['modo'] == 'solo_validar' else request.FILES.getlist('fotos')
    
    if not perm['editar']:                    # Llenar solo suma fotos: quitar o re-etiquetar las que ya hay pide Editar
        quitar, etiquetas = set(), {}

    etiquetas_nuevas = post.getlist('fotos_etiquetas_nuevas')
    quedan = [f for f in existentes if f.pk not in quitar]
    
    if len(quedan) + len(nuevas) > MAX_FOTOS:
        errores['fotos'] = _('Máximo %(n)s fotos por registro') % {'n': MAX_FOTOS}
    
    for f in nuevas:
        if f.size > MAX_BYTES_FOTO or not imagen_subida_valida(f):
            errores['fotos'] = _('Solo JPG o PNG de hasta 5 MB')

    fotos_cambian = bool(quitar & {f.pk for f in existentes}) or bool(nuevas)

    # ── Validación ──
    puede_validar = puede_mto(request.user, 'validar_plan_mantenimiento')
    val_previa = registro.validacion if registro else 'por_validar'
    val = post.get('validacion') if puede_validar and post.get('validacion') in VALIDACIONES else val_previa

    # Un registro ya validado vuelve a "Por validar" si cambia el estado, la fecha o las fotos.
    if registro and val_previa == 'validado' and val == 'validado':
        if registro.estado != estado or registro.fecha_ejecucion != fecha_ej or fotos_cambian:
            val = 'por_validar'
    if val == 'validado' and estado != 'completada':
        val = 'por_validar'                      # solo se valida lo completado

    
    # Rechazado: el registro se reabrió (queda Pendiente). Si se vuelve a marcar Completada sin que un validador
    # lo rechace de nuevo en este mismo guardado, pasa otra vez a "Por validar".

    rechazando_ahora = puede_validar and post.get('validacion') == 'rechazado'
    if val == 'rechazado' and not rechazando_ahora and estado == 'completada':
        val = 'por_validar' # se volvió a completar tras un rechazo: queda por validar de nuevo

    validador = None
    motivo_rechazo = ''
    if val == 'validado':
        actual_val_id = registro.validado_por_id if registro else None
        
        if puede_validar:
            validador = _responsable_valido(post.get('validado_por') or actual_val_id, plan, actual_val_id)
        else:   
            # quien edita sin permiso de Validar no puede cambiar "Validado por"
            validador = registro.validado_por if registro else None
        if not validador:
            errores['validado_por'] = _('Elige quién valida')
    elif val == 'rechazado':
        motivo_rechazo = post.get('motivo_rechazo', '').strip() if puede_validar else (registro.motivo_rechazo if registro else '')
        if not motivo_rechazo:
            errores['motivo_rechazo'] = _('Indica el motivo del rechazo')

    # ── Fecha de validación: solo administrador / superusuario la puede corregir ──
    fecha_val = None
    if val == 'validado' and es_admin(request.user) and post.get('fecha_validacion'):
        try:
            fecha_val = date.fromisoformat(post['fecha_validacion'])
        except ValueError:
            errores['fecha_validacion'] = _('La fecha no es válida')
        else:
            if fecha_val > hoy:
                errores['fecha_validacion'] = _('La fecha de validación no puede ser futura')
            elif fecha_ej and fecha_val < fecha_ej:
                errores['fecha_validacion'] = _('La fecha de validación no puede ser anterior a la de ejecución')

    if errores:
        return None, errores

    with transaction.atomic():
        if registro is None:
            registro = RegistroEjecucion(plan=plan, semana_num=semana, anio=anio, semana_inicio=lunes)
        cambio_a_validado = val == 'validado' and registro.validacion != 'validado'
        estado_final                = 'pendiente' if val == 'rechazado' else estado # un rechazo reabre el registro
        registro.estado             = estado_final
        registro.responsable        = responsable
        registro.fecha_ejecucion    = fecha_ej
        registro.observaciones      = post.get('observaciones', '').strip()[:1000]
        registro.motivo_cancelacion = motivo_cancelacion
        registro.reagendada_anio    = reag_anio
        registro.reagendada_semana  = reag_semana
        registro.semanas_atraso     = _semanas_atraso(fecha_ej, lunes) if estado_final == 'completada' else 0
        registro.validacion         = val
        registro.validado_por       = validador
        registro.motivo_rechazo     = motivo_rechazo
        if val != 'validado':
            registro.validado_usuario = None
            registro.validado_en = None
        elif cambio_a_validado:
            registro.validado_usuario = request.user
            registro.validado_en = timezone.now()
        if fecha_val:
            # Se corrige solo el día; se conserva la hora en que se validó
            base = timezone.localtime(registro.validado_en or timezone.now())
            if base.date() != fecha_val:
                registro.validado_en = timezone.make_aware(datetime.combine(fecha_val, base.time()))
        registro.modificado_por = request.user
        registro.save()

        for f in existentes:
            if f.pk in quitar:
                f.delete()
            elif f.pk in etiquetas and etiquetas[f.pk] in ETIQUETAS_FOTO and f.etiqueta != etiquetas[f.pk]:
                f.etiqueta = etiquetas[f.pk]
                f.save(update_fields=['etiqueta'])
        orden = len(quedan)
        for i, archivo in enumerate(nuevas):
            etiqueta = etiquetas_nuevas[i] if i < len(etiquetas_nuevas) and etiquetas_nuevas[i] in ETIQUETAS_FOTO else ''
            ImagenRegistro.objects.create(registro=registro, imagen=archivo, etiqueta=etiqueta, orden=orden + i)
    return registro, None


@login_required
@xframe_options_exempt
def registro_ejecucion(request, plan_pk, semana, anio):
    """
    Formulario "Registrar ejecución" de la tarea `plan_pk` en la semana ISO `semana`/`anio`.
    GET: página del formulario (se abre en un <iframe>; por eso xframe_options_exempt). POST: guarda con
    _guardar_registro y responde 200, o JSON con los errores por campo (400; 403 si no tiene permiso).
    """

    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)

    if not puede_ver_plan(request, plan):
        msg = _("No tienes acceso a las tareas de esta área.")
        if request.method == 'POST':
            return JsonResponse({'ok': False, 'errores': {'general': msg}}, status=403)
        return HttpResponseForbidden(msg)

    lunes        = _lunes_o_404(anio, semana)
    registro     = RegistroEjecucion.objects.filter(plan=plan, semana_inicio=lunes).first()
    responsables = Responsable.objects.filter(area=plan.area, activo=True).order_by('apellidos', 'nombre')

    if request.method == 'POST':
        _registro, errores = _guardar_registro(request, plan, registro, semana, anio, lunes)
        if errores:
            return JsonResponse({'ok': False, 'errores': errores}, status=403 if 'general' in errores else 400)
        # Este <script> no se ejecuta: registro_form.js y plan_movil.js guardan con fetch, y el aviso a la página
        # padre (postMessage) lo manda registro_form.js. Solo importa el 200.

        return HttpResponse(f'''
            <script>
                window.parent.postMessage('registro_guardado:{plan_pk}:{anio}', '*');
            </script>
        ''')

    hoy = date.today()
    # No. de OT de esta semana: el mismo que la columna "No. OT" del Plan, el Backlog y el Excel
    # ('' si la semana no calza con la frecuencia o el plan está inactivo: no sale en el Excel)
    planes_area = list(PlanMantenimiento.objects.select_related('area').filter(activo=True, area=plan.area))
    no_ot = numeros_ot_semana(planes_area, lunes).get(plan.pk, '')

    def _persona(r):
        return {'id': r.pk, 'nombre': f'{r.nombre} {r.apellidos}'.strip(), 'nomina': r.nomina_visible(),
                'ini': ((r.nombre[:1] + r.apellidos[:1]).upper() or '?')}

    personas = [_persona(r) for r in responsables]
    # El registro puede conservar una persona hoy inactiva: que siga apareciendo elegida.
    for r in (registro.responsable, registro.validado_por) if registro else ():
        if r and all(p['id'] != r.pk for p in personas):
            personas.append(_persona(r))

    # El registro conserva el nombre con el que se asignó a la persona, aunque luego se haya editado su ficha
    if registro:
        for fk, congelado in (('responsable', registro.nombre_responsable()), ('validado_por', registro.nombre_validador())):
            pid = getattr(registro, fk + '_id')
            partes = congelado.split()
            for p in personas:
                if pid and p['id'] == pid and congelado:
                    p['nombre'] = congelado
                    p['ini'] = (partes[0][:1] + partes[-1][:1]).upper() if len(partes) > 1 else congelado[:2].upper()

    editor = registro.modificado_por if registro else None
    rf_cfg = {
        'planPk':           plan.pk,
        'anio':             anio,
        'semana':           semana,
        'lunesIso':         lunes.isoformat(),
        'hoyIso':           hoy.isoformat(),
        'maxFotos':         MAX_FOTOS,
        'puedeValidar':     puede_mto(request.user, 'validar_plan_mantenimiento'),
        'modo':             permisos_registro(request.user, registro)['modo'],
        'puedeEditar':      puede_mto(request.user, 'editar_plan_mantenimiento'),
        'puedeAsignar':     puede_asignar_responsable(request.user),
        'puedeEliminar':    puede_mto(request.user, 'eliminar_plan_mantenimiento'),
        'yaLlenado':        bool(registro and registro.estado in ESTADOS_CERRADOS),
        'tieneRegistro':    bool(registro),
        'estadoInicial':    registro.estado if registro else '',
        'validacionInicial': registro.validacion if registro else 'por_validar',
        'fechaInicial':     registro.fecha_ejecucion.isoformat() if registro and registro.fecha_ejecucion else '',
        'validadoEn':       timezone.localtime(registro.validado_en).strftime('%d/%m/%Y') if registro and registro.validado_en else '',
        'puedeFechaVal':    es_admin(request.user),
        'fechaValIso':      (timezone.localtime(registro.validado_en).date() if registro and registro.validado_en else hoy).isoformat(),
        'hoyTxt':           hoy.strftime('%d/%m/%Y'),
        'fotos': [{'id': f.pk, 'url': f.imagen.url, 'etiqueta': f.etiqueta} for f in registro.imagenes.all()] if registro else [],
    }

    ctx = {
        'rf_cfg':        rf_cfg,
        'personas':      personas,
        'editor_nombre': (editor.get_full_name() or editor.username) if editor else '',
        'plan':          plan,
        'semana':        semana,
        'anio':          anio,
        'lunes':         lunes,
        'domingo':       lunes + timedelta(days=6),
        'no_ot':         no_ot,
        'registro':      registro,
        'responsables':  responsables,
        'estados':       RegistroEjecucion.ESTADO_CHOICES,
        'validaciones':  RegistroEjecucion.VALIDACION_CHOICES,
        'puede_validar': puede_mto(request.user, 'validar_plan_mantenimiento'),
        'max_fotos':     MAX_FOTOS,
        # Mismo criterio que usa modal_plan() para marcar la semana actual:
        # número de semana ISO + año calendario del lunes.
        'hoy_semana':    hoy.isocalendar()[1],
        'hoy_anio':      hoy.year,
    }
    return render(request, 'mto_app/plan/registro_form.html', ctx)


@login_required
@xframe_options_exempt
def eliminar_registro(request, plan_pk, semana, anio):
    """Elimina el registro de esa semana con sus fotos (POST; permiso Eliminar plan). Responde 200, 403 o 405."""

    plan = get_object_or_404(PlanMantenimiento, pk=plan_pk)

    if not (puede_mto(request.user, 'eliminar_plan_mantenimiento') and puede_ver_plan(request, plan)):
        return HttpResponse(status=403)

    lunes = _lunes_o_404(anio, semana)
    registro = get_object_or_404(RegistroEjecucion, plan=plan, semana_inicio=lunes)

    if request.method == 'POST':
        registro.delete()
        return HttpResponse(status=200)
    return HttpResponse(status=405)


@login_required
def asignar_responsable(request, plan_pk, semana, anio):
    """
    Asigna (o quita, si llega vacío) el responsable de la tarea en esa semana desde la lista del Plan. Crea el
    registro Pendiente si aún no existe. POST; permiso Editar o Validar plan y el área del usuario.
    Responde 200; 400 si la persona no es del área o está inactiva; 403 o 405.
    """
    plan  = get_object_or_404(PlanMantenimiento, pk=plan_pk)

    if not (puede_asignar_responsable(request.user) and puede_ver_plan(request, plan)):
        return HttpResponse(status=403)
    lunes = _lunes_o_404(anio, semana)

    if request.method == 'POST':
        registro = RegistroEjecucion.objects.filter(plan=plan, semana_inicio=lunes).first()
        responsable_id = request.POST.get('responsable') or None
        responsable = None
        
        if responsable_id:
            # Igual que al guardar el registro: solo personas activas del área (o la que ya tenía, aunque esté inactiva)
            responsable = _responsable_valido(responsable_id, plan, registro.responsable_id if registro else None)
            if not responsable:
                return HttpResponse(status=400)
        if registro is None:
            registro = RegistroEjecucion(plan=plan, semana_num=semana, anio=anio, semana_inicio=lunes, estado='pendiente')
        
        registro.responsable    = responsable
        registro.modificado_por = request.user
        registro.save()
        return HttpResponse(status=200)
    
    return HttpResponse(status=405)
