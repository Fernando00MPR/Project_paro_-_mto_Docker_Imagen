import json
from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, render
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.clickjacking import xframe_options_exempt

from login_app.permisos import puede_mto
from .utils import lunes_de_semana, puede_asignar_responsable
from ..models import ImagenRegistro, PlanMantenimiento, RegistroEjecucion, Responsable

MAX_FOTOS = 4
MAX_BYTES_FOTO = 5 * 1024 * 1024
TIPOS_FOTO = ('image/jpeg', 'image/png')
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


def _semanas_atraso(fecha_ejecucion, lunes_programado):
    """Semanas completas entre la semana programada y la semana de la fecha de ejecución (0 si no hay atraso)."""
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
        if not reag_anio or not reag_semana or not 1 <= reag_semana <= 53:
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
        if f.content_type not in TIPOS_FOTO or f.size > MAX_BYTES_FOTO:
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
    
    # solo se valida lo completado
    rechazando_ahora = puede_validar and post.get('validacion') == 'rechazado'
    if val == 'rechazado' and not rechazando_ahora and estado == 'completada':
        val = 'por validar' # se volvió a completar tras un rechazo: queda por validar de nuevo

    validador = None
    motivo_rechazo = ''
    if val == 'validado':
        actual_val_id = registro.validado_por_id if registro else None
        validador = _responsable_valido(post.get('validado_por') or actual_val_id, plan, actual_val_id)
        if not validador:
            errores['validado_por'] = _('Elige quién valida')
    elif val == 'rechazado':
        motivo_rechazo = post.get('motivo_rechazo', '').strip() if puede_validar else (registro.motivo_rechazo if registro else '')
        if not motivo_rechazo:
            errores['motivo_rechazo'] = _('Indica el motivo del rechazo')

    if errores:
        return None, errores

    with transaction.atomic():
        if registro is None:
            registro = RegistroEjecucion(plan=plan, semana_num=semana, anio=anio, semana_inicio=lunes)
        cambio_a_validado = val == 'validado' and registro.validacion != 'validado'
        registro.estado             = 'pendiente' if val == 'rechazado' else estado     # un rechazo reabre el registro
        registro.responsable        = responsable
        registro.fecha_ejecucion    = fecha_ej
        registro.observaciones      = post.get('observaciones', '').strip()[:1000]
        registro.motivo_cancelacion = motivo_cancelacion
        registro.reagendada_anio    = reag_anio
        registro.reagendada_semana  = reag_semana
        registro.semanas_atraso     = _semanas_atraso(fecha_ej, lunes) if estado == 'completada' else 0
        registro.validacion         = val
        registro.validado_por       = validador
        registro.motivo_rechazo     = motivo_rechazo
        if val != 'validado':
            registro.validado_usuario = None
            registro.validado_en = None
        elif cambio_a_validado:
            registro.validado_usuario = request.user
            registro.validado_en = timezone.now()
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
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = RegistroEjecucion.objects.filter(plan=plan, semana_inicio=lunes).first()
    responsables = Responsable.objects.filter(area=plan.area, activo=True).order_by('apellidos', 'nombre')

    if request.method == 'POST':
        _registro, errores = _guardar_registro(request, plan, registro, semana, anio, lunes)
        if errores:
            return JsonResponse({'ok': False, 'errores': errores}, status=403 if 'general' in errores else 400)

        return HttpResponse(f'''
            <script>
                window.parent.postMessage('registro_guardado:{plan_pk}:{anio}', '*');
            </script>
        ''')

    hoy = date.today()

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
                    p['ini'] = (partes[0][:1] + partes[-1][:1]).upper() if len(partes) > 1 else congelado[:2].upper

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
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = get_object_or_404(RegistroEjecucion, plan=plan, semana_inicio=lunes)
    if not puede_mto(request.user, 'eliminar_plan_mantenimiento'):
        return HttpResponse(status=403)
    if request.method == 'POST':
        registro.delete()
        return HttpResponse(status=200)
    return HttpResponse(status=405)


@login_required
def asignar_responsable(request, plan_pk, semana, anio):
    plan  = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes = lunes_de_semana(anio, semana)

    if request.method == 'POST':
        # Asignar responsable: solo con permiso de Editar o de Validar el plan.
        if not puede_asignar_responsable(request.user):
            return HttpResponse(status=403)
        
        responsable_id = request.POST.get('responsable') or None
        registro, _creado = RegistroEjecucion.objects.get_or_create(
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
