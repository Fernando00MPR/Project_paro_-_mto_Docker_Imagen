import json
from datetime import datetime, date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Sum, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods

from ..models import Area, Paro, BitacoraParo, CatalogoFalla, CatalogoEquipo, CatalogoResponsable
from ..forms import ParoForm
from login_app.permisos import permiso_requerido, get_perfil
from .utils import _aplicar_filtros


# ── Helpers internos ──────────────────────────────────────────────────────────

def _registrar_bitacora(paro, usuario, campo, anterior, nuevo):
    """Guarda un registro en la bitácora solo si el valor cambió."""
    ant = str(anterior) if anterior is not None else ''
    nue = str(nuevo)    if nuevo    is not None else ''
    if ant != nue:
        BitacoraParo.objects.create(
            paro=paro, usuario=usuario,
            campo=campo, valor_anterior=ant, valor_nuevo=nue
        )


def _campos_paro_dict(paro):
    """Snapshot de campos auditables de un paro."""
    ESTATUS_L = {'rojo': 'Rechazado', 'amarillo': 'Pendiente', 'verde': 'Aceptado'}
    return {
        'area':           paro.area.nombre,
        'fecha':          paro.fecha.strftime('%d/%m/%Y'),
        'turno':          str(paro.turno),
        'hora':           paro.hora.strftime('%H:%M'),
        'falla':          paro.falla,
        'responsable':    paro.responsable,
        'equipo':         paro.equipo,
        'tiempo_minutos': str(paro.tiempo_minutos),
        'comentarios':    paro.comentarios or '',
        'estatus':        ESTATUS_L.get(paro.estatus, paro.estatus),
    }


# ── Vistas ────────────────────────────────────────────────────────────────────

@login_required
def lista_paros(request):
    perfil         = get_perfil(request.user)
    es_admin_total = request.user.is_superuser or (perfil and perfil.es_admin)

    if not es_admin_total and not (perfil and perfil.ver_todos_paros):
        if perfil and perfil.areas_permitidas.exists():
            primera = perfil.areas_permitidas.first()
            return redirect('paros:lista_paros_por_area', area_id=primera.id)

    paros_qs  = Paro.objects.select_related('area').all()
    ver_todos = es_admin_total or (perfil and perfil.ver_todos_paros)
    if not ver_todos and perfil:
        if perfil.areas_permitidas.exists():
            paros_qs = paros_qs.filter(area__in=perfil.areas_permitidas.all())
        else:
            paros_qs = paros_qs.none()

    hoy        = date.today().strftime('%Y-%m-%d')
    get_params = request.GET.copy()
    if not get_params.get('fecha_desde'):
        get_params['fecha_desde'] = hoy
    if not get_params.get('fecha_hasta'):
        get_params['fecha_hasta'] = hoy

    paros_qs               = _aplicar_filtros(paros_qs, get_params)
    total_minutos          = paros_qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    paros_aceptados_qs     = paros_qs.filter(estatus='verde')
    paros_aceptados        = paros_aceptados_qs.count()
    minutos_aceptados      = paros_aceptados_qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    promedio_min_aceptados = round(minutos_aceptados / paros_aceptados, 1) if paros_aceptados else 0
    paro_mayor_aceptados   = paros_aceptados_qs.order_by('-tiempo_minutos').values('falla', 'tiempo_minutos').first()
    paros_sin_aceptar      = paros_qs.filter(estatus='rojo').count()
    minutos_sin_aceptar    = paros_qs.filter(estatus='rojo').aggregate(t=Sum('tiempo_minutos'))['t'] or 0

    por_pagina = get_params.get('por_pagina', '8')
    try:
        pp = int(por_pagina)
        if pp not in (8, 10, 20):
            pp = 8
    except (ValueError, TypeError):
        pp = 8
    por_pagina = str(pp)
    paginator  = Paginator(paros_qs, pp)
    page_obj   = paginator.get_page(get_params.get('page', 1))

    return render(request, 'paros_app/paros/lista_paros.html', {
        'paros':          page_obj,
        'page_obj':       page_obj,
        'areas':          Area.objects.all(),
        'filtros':        get_params,
        'total_minutos':  total_minutos,
        'por_pagina':     por_pagina,
        'puede_crear':    es_admin_total or (perfil and perfil.crear_paro),
        'puede_editar':   es_admin_total or (perfil and (perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_editar_comentarios': es_admin_total or (perfil and (perfil.editar_comentarios or perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_eliminar': es_admin_total or (perfil and perfil.editar_eliminar_paro),
        'puede_estatus':  es_admin_total or (perfil and (perfil.cambiar_estatus_paro or perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_exportar': es_admin_total or (perfil and perfil.exportar_paros),
        'puede_importar': es_admin_total or (perfil and perfil.importar_paros),
        'total_minutos':           total_minutos,
        'promedio_min_aceptados':  promedio_min_aceptados,
        'paro_mayor_aceptados':    paro_mayor_aceptados,
        'paros_aceptados':         paros_aceptados,
        'minutos_aceptados':       minutos_aceptados,
        'paros_sin_aceptar':       paros_sin_aceptar,
        'minutos_sin_aceptar':     minutos_sin_aceptar,
    })


@login_required
def lista_paros_por_area(request, area_id):
    perfil = get_perfil(request.user)
    if not (request.user.is_superuser or (perfil and perfil.es_admin)):
        if perfil and not perfil.puede_ver_area(area_id):
            messages.error(request, "No tienes acceso a los paros de esta área.")
            return redirect('paros:lista_paros')

    area     = get_object_or_404(Area, id=area_id)
    paros_qs = Paro.objects.select_related('area').filter(area=area).order_by('fecha', 'turno', 'hora')

    hoy        = date.today().strftime('%Y-%m-%d')
    get_params = request.GET.copy()
    if not get_params.get('fecha_desde'):
        get_params['fecha_desde'] = hoy
    if not get_params.get('fecha_hasta'):
        get_params['fecha_hasta'] = hoy

    paros_qs               = _aplicar_filtros(paros_qs, get_params)
    total_minutos          = paros_qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    paros_aceptados_qs     = paros_qs.filter(estatus='verde')
    paros_aceptados        = paros_aceptados_qs.count()
    minutos_aceptados      = paros_aceptados_qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    promedio_min_aceptados = round(minutos_aceptados / paros_aceptados, 1) if paros_aceptados else 0
    paro_mayor_aceptados   = paros_aceptados_qs.order_by('-tiempo_minutos').values('falla', 'tiempo_minutos').first()
    paros_sin_aceptar      = paros_qs.filter(estatus='rojo').count()
    minutos_sin_aceptar    = paros_qs.filter(estatus='rojo').aggregate(t=Sum('tiempo_minutos'))['t'] or 0

    por_pagina = get_params.get('por_pagina', '8')
    try:
        pp = int(por_pagina)
        if pp not in (8, 10, 20):
            pp = 8
    except (ValueError, TypeError):
        pp = 8
    por_pagina = str(pp)
    paginator  = Paginator(paros_qs, pp)
    page_obj   = paginator.get_page(get_params.get('page', 1))

    return render(request, 'paros_app/paros/lista_paros.html', {
        'paros':          page_obj,
        'page_obj':       page_obj,
        'area_actual':    area,
        'areas':          Area.objects.all(),
        'filtros':        get_params,
        'total_minutos':  total_minutos,
        'promedio_min_aceptados':   promedio_min_aceptados,
        'paro_mayor_aceptados':     paro_mayor_aceptados,
        'por_pagina':     por_pagina,
        'puede_crear':    request.user.is_superuser or (perfil and (perfil.es_admin or perfil.crear_paro)),
        'puede_editar':   request.user.is_superuser or (perfil and (perfil.es_admin or perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_editar_comentarios': request.user.is_superuser or (perfil and (perfil.es_admin or perfil.editar_comentarios or perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_eliminar': request.user.is_superuser or (perfil and (perfil.es_admin or perfil.editar_eliminar_paro)),
        'puede_estatus':  request.user.is_superuser or (perfil and (perfil.es_admin or perfil.cambiar_estatus_paro or perfil.editar_paro or perfil.editar_eliminar_paro)),
        'puede_exportar': request.user.is_superuser or (perfil and (perfil.es_admin or perfil.exportar_paros)),
        'puede_importar': request.user.is_superuser or (perfil and (perfil.es_admin or perfil.importar_paros)),
        'paros_aceptados':     paros_aceptados,
        'minutos_aceptados':   minutos_aceptados,
        'paros_sin_aceptar':   paros_sin_aceptar,
        'minutos_sin_aceptar': minutos_sin_aceptar,
    })


@login_required
@permiso_requerido('crear_paro')
def crear_paro(request):
    if request.method == 'POST':
        form = ParoForm(request.POST)
        if form.is_valid():
            paro = form.save(commit=False)

            # Resolver catálogos por pk (enviado por el autocomplete como campo oculto).
            # Esto es independiente del idioma activo al momento de crear el paro.
            texto_falla       = request.POST.get('falla', '').strip()
            texto_equipo      = request.POST.get('equipo', '').strip()
            texto_responsable = request.POST.get('responsable', '').strip()

            falla_pk       = request.POST.get('falla_pk', '').strip()
            equipo_pk      = request.POST.get('equipo_pk', '').strip()
            responsable_pk = request.POST.get('responsable_pk', '').strip()

            falla_obj = (
                CatalogoFalla.objects.filter(pk=falla_pk, area=paro.area).first()
                if falla_pk.isdigit() else
                CatalogoFalla.objects.filter(area=paro.area).filter(
                    Q(nombre_es=texto_falla) | Q(nombre_en=texto_falla)
                ).first()
            )
            equipo_obj = (
                CatalogoEquipo.objects.filter(pk=equipo_pk, area=paro.area).first()
                if equipo_pk.isdigit() else
                CatalogoEquipo.objects.filter(area=paro.area).filter(
                    Q(equipo_es=texto_equipo) | Q(equipo_en=texto_equipo)
                ).first()
            )
            responsable_obj = (
                CatalogoResponsable.objects.filter(pk=responsable_pk, area=paro.area).first()
                if responsable_pk.isdigit() else
                CatalogoResponsable.objects.filter(area=paro.area).filter(
                    Q(responsable_es=texto_responsable) | Q(responsable_en=texto_responsable)
                ).first()
            )

            # Llenar _es y _en directamente desde el catálogo.
            # Si el catálogo no tiene traducción en un idioma, usar el otro.
            # Si no hay match de catálogo (texto libre), ambas columnas guardan el texto enviado.
            if falla_obj:
                paro.falla_es = falla_obj.nombre_es or falla_obj.nombre_en or texto_falla
                paro.falla_en = falla_obj.nombre_en or falla_obj.nombre_es or texto_falla
            else:
                paro.falla_es = texto_falla
                paro.falla_en = texto_falla

            if equipo_obj:
                paro.equipo_es = equipo_obj.equipo_es or equipo_obj.equipo_en or texto_equipo
                paro.equipo_en = equipo_obj.equipo_en or equipo_obj.equipo_es or texto_equipo
            else:
                paro.equipo_es = texto_equipo
                paro.equipo_en = texto_equipo

            if responsable_obj:
                paro.responsable_es = responsable_obj.responsable_es or responsable_obj.responsable_en or texto_responsable
                paro.responsable_en = responsable_obj.responsable_en or responsable_obj.responsable_es or texto_responsable
            else:
                paro.responsable_es = texto_responsable
                paro.responsable_en = texto_responsable

            paro.save()

            BitacoraParo.objects.create(
                paro=paro, usuario=request.user,
                campo='creado', valor_anterior='', valor_nuevo=''
            )
            messages.success(request, f"Paro registrado correctamente en {paro.area.nombre}.")
            return redirect('paros:lista_paros_por_area', area_id=paro.area.id)
    else:
        form = ParoForm()
    return render(request, 'paros_app/paros/crear_paro.html', {
        'form': form, 'areas': Area.objects.all()
    })


@login_required
@permiso_requerido('editar_paro')
def editar_paro(request, paro_id):
    paro = get_object_or_404(Paro, id=paro_id)
    if request.method == 'POST':
        snapshot_antes = _campos_paro_dict(paro)
        form = ParoForm(request.POST, instance=paro)
        if form.is_valid():
            paro = form.save(commit=False)

            # Resolver catálogos por pk (enviado por el autocomplete como campo oculto).
            texto_falla       = request.POST.get('falla', '').strip()
            texto_equipo      = request.POST.get('equipo', '').strip()
            texto_responsable = request.POST.get('responsable', '').strip()

            falla_pk       = request.POST.get('falla_pk', '').strip()
            equipo_pk      = request.POST.get('equipo_pk', '').strip()
            responsable_pk = request.POST.get('responsable_pk', '').strip()

            falla_obj = (
                CatalogoFalla.objects.filter(pk=falla_pk, area=paro.area).first()
                if falla_pk.isdigit() else
                CatalogoFalla.objects.filter(area=paro.area).filter(
                    Q(nombre_es=texto_falla) | Q(nombre_en=texto_falla)
                ).first()
            )
            equipo_obj = (
                CatalogoEquipo.objects.filter(pk=equipo_pk, area=paro.area).first()
                if equipo_pk.isdigit() else
                CatalogoEquipo.objects.filter(area=paro.area).filter(
                    Q(equipo_es=texto_equipo) | Q(equipo_en=texto_equipo)
                ).first()
            )
            responsable_obj = (
                CatalogoResponsable.objects.filter(pk=responsable_pk, area=paro.area).first()
                if responsable_pk.isdigit() else
                CatalogoResponsable.objects.filter(area=paro.area).filter(
                    Q(responsable_es=texto_responsable) | Q(responsable_en=texto_responsable)
                ).first()
            )

            # Actualizar _es y _en directamente desde el catálogo.
            if falla_obj:
                paro.falla_es = falla_obj.nombre_es or falla_obj.nombre_en or texto_falla
                paro.falla_en = falla_obj.nombre_en or falla_obj.nombre_es or texto_falla
            else:
                paro.falla_es = texto_falla
                paro.falla_en = texto_falla

            if equipo_obj:
                paro.equipo_es = equipo_obj.equipo_es or equipo_obj.equipo_en or texto_equipo
                paro.equipo_en = equipo_obj.equipo_en or equipo_obj.equipo_es or texto_equipo
            else:
                paro.equipo_es = texto_equipo
                paro.equipo_en = texto_equipo

            if responsable_obj:
                paro.responsable_es = responsable_obj.responsable_es or responsable_obj.responsable_en or texto_responsable
                paro.responsable_en = responsable_obj.responsable_en or responsable_obj.responsable_es or texto_responsable
            else:
                paro.responsable_es = texto_responsable
                paro.responsable_en = texto_responsable

            estatus_anterior = paro.estatus
            paro.save()

            nuevo_estatus = request.POST.get('estatus', paro.estatus)
            if nuevo_estatus in ('rojo', 'amarillo', 'verde'):
                if nuevo_estatus != estatus_anterior:
                    _registrar_bitacora(paro, request.user, 'estatus', estatus_anterior, nuevo_estatus)
                paro.estatus = nuevo_estatus
                paro.save(update_fields=['estatus'])

            snapshot_despues = _campos_paro_dict(paro)
            for campo, ant in snapshot_antes.items():
                if campo == 'estatus':
                    continue
                nue = snapshot_despues.get(campo, '')
                _registrar_bitacora(paro, request.user, campo, ant, nue)

            messages.success(request, "Paro actualizado correctamente.")
            return redirect('paros:lista_paros_por_area', area_id=paro.area.id)
    else:
        form = ParoForm(instance=paro, initial={
            'fecha': paro.fecha.strftime('%d/%m/%Y'),
            'hora':  paro.hora.strftime('%H:%M'),
        })
    bitacora = paro.bitacora.select_related('usuario').all()
    return render(request, 'paros_app/paros/editar_paro.html', {
        'form': form, 'paro': paro, 'bitacora': bitacora
    })


@login_required
@require_http_methods(["POST"])
@permiso_requerido('editar_eliminar_paro')
def eliminar_paro(request, paro_id):
    paro    = get_object_or_404(Paro, id=paro_id)
    area_id = paro.area.id
    BitacoraParo.objects.create(
        paro=paro, usuario=request.user,
        campo='eliminado', valor_anterior='', valor_nuevo=''
    )
    paro.delete()
    return redirect('paros:lista_paros_por_area', area_id=area_id)


@login_required
@require_http_methods(["POST"])
def cambiar_estatus_paro(request, paro_id):
    perfil = get_perfil(request.user)
    puede  = (request.user.is_superuser or
              (perfil and (perfil.es_admin or perfil.cambiar_estatus_paro
                           or perfil.editar_paro or perfil.editar_eliminar_paro)))
    if not puede:
        return JsonResponse({'error': 'Sin permiso'}, status=403)
    CICLO = {'rojo': 'amarillo', 'amarillo': 'verde', 'verde': 'rojo'}
    paro             = get_object_or_404(Paro, id=paro_id)
    estatus_anterior = paro.estatus
    paro.estatus     = CICLO.get(paro.estatus, 'rojo')
    paro.save(update_fields=['estatus'])
    _registrar_bitacora(paro, request.user, 'estatus', estatus_anterior, paro.estatus)
    return JsonResponse({'estatus': paro.estatus})


@login_required
@require_http_methods(["POST"])
def actualizar_campo_paro(request, paro_id):
    perfil = get_perfil(request.user)
    es_admin             = request.user.is_superuser or (perfil and perfil.es_admin)
    puede_editar_todo    = es_admin or (perfil and (perfil.editar_paro or perfil.editar_eliminar_paro))
    puede_editar_coment  = es_admin or (perfil and perfil.editar_comentarios)

    if not puede_editar_todo and not puede_editar_coment:
        return JsonResponse({'error': 'No tienes permiso para editar paros.'}, status=403)

    try:
        paro  = get_object_or_404(Paro, id=paro_id)
        data  = json.loads(request.body)
        campo = data.get('campo')
        valor = data.get('valor')

        if not puede_editar_todo and puede_editar_coment:
            if campo != 'comentarios':
                return JsonResponse({'error': 'Solo tienes permiso para editar comentarios.'}, status=403)

        campos_permitidos = ['falla', 'responsable', 'equipo', 'comentarios',
                             'tiempo_minutos', 'fecha', 'hora', 'turno']
        if campo not in campos_permitidos:
            return JsonResponse({'error': 'Campo no permitido'}, status=400)

        if campo == 'fecha':
            try:
                valor = datetime.strptime(valor, '%d/%m/%Y').date()
            except ValueError:
                return JsonResponse({'error': 'Formato de fecha inválido. Use dd/mm/yyyy'}, status=400)
        elif campo == 'hora':
            try:
                valor = datetime.strptime(valor, '%H:%M').time()
            except ValueError:
                return JsonResponse({'error': 'Formato de hora inválido. Use HH:MM'}, status=400)
        elif campo == 'turno':
            try:
                valor = int(valor)
                if valor not in [1, 2]:
                    return JsonResponse({'error': 'Turno debe ser 1 o 2'}, status=400)
            except ValueError:
                return JsonResponse({'error': 'Turno debe ser 1 o 2'}, status=400)
        elif campo == 'tiempo_minutos':
            try:
                valor = int(valor)
                if valor < 0:
                    return JsonResponse({'error': 'El tiempo no puede ser negativo'}, status=400)
            except ValueError:
                return JsonResponse({'error': 'Debe ser un número entero'}, status=400)
        elif campo in ('falla', 'comentarios') and len(valor) > 100:
            return JsonResponse({'error': 'Máximo 100 caracteres'}, status=400)

        valor_anterior = getattr(paro, campo)
        if hasattr(valor_anterior, 'strftime'):
            valor_anterior = valor_anterior.strftime('%d/%m/%Y') if campo == 'fecha' else valor_anterior.strftime('%H:%M')

        setattr(paro, campo, valor)
        paro.save()
        _registrar_bitacora(paro, request.user, campo, str(valor_anterior), str(valor))

        if campo == 'fecha':
            valor_mostrar = valor.strftime('%d/%m/%Y')
        elif campo == 'hora':
            valor_mostrar = valor.strftime('%H:%M')
        elif campo == 'turno':
            valor_mostrar = 'Turno 1' if valor == 1 else 'Turno 2'
        else:
            valor_mostrar = valor

        return JsonResponse({'success': True, 'valor': valor_mostrar})

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)