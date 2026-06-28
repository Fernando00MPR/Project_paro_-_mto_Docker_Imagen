from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, render
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from ..models import SeguimientoOT, SeguimientoManual, Area, ImagenSeguimiento


@login_required
def lista_seguimientos(request):

    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = es_admin or (acceso and acceso.ver_seguimiento)
    if not puede_ver:
        messages.error(request, "No tienes permiso para ver esta sección.")
        from django.shortcuts import redirect
        return redirect('mto:dashboard')

    estatus         = request.GET.get('estatus', '')
    area_id         = request.GET.get('area', '')
    tipo_filtro     = request.GET.get('tipo', '')
    filtro_orden    = request.GET.get('orden', '').strip()
    filtro_problema = request.GET.get('problema', '').strip()
    filtro_accion   = request.GET.get('accion', '').strip()
    filtro_validado = request.GET.get('validado', '')
    orden_por  = request.GET.get('orden_por', 'no_orden')
    direccion  = request.GET.get('direccion', 'desc')

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

    seguimientos_manuales = list(seguimientos_manuales)
    reverso = (direccion == 'desc')

    if orden_por == 'fecha_creacion':
        seguimientos.sort(key=lambda s: s.fecha_creacion, reverse=reverso)
        seguimientos_manuales.sort(key=lambda s: s.fecha_creacion, reverse=reverso)
    else:
        seguimientos.sort(key=lambda s: s.no_orden, reverse=reverso)
        seguimientos_manuales.sort(key=lambda s: s.consecutivo, reverse=reverso)

    for s in seguimientos:
        s.es_ot = True
    for s in seguimientos_manuales:
        s.es_ot = False

    todos_combinados = seguimientos + seguimientos_manuales

    per_page = request.GET.get('per_page', '12')
    paginator = Paginator(todos_combinados, int(per_page) if per_page.isdigit() else 12)
    page_num = request.GET.get('page', 1)
    combinados_page = paginator.get_page(page_num)

    seguimientos_pagina          = [s for s in combinados_page if s.es_ot]
    seguimientos_manuales_pagina = [s for s in combinados_page if not s.es_ot]

    areas = Area.objects.filter(activa=True)

    area_nombre = None
    if area_id:
        try:
            area_nombre = Area.objects.get(id=area_id).nombre
        except Area.DoesNotExist:
            pass

    return render(request, 'mto_app/seguimientos/lista_seguimientos.html', {
        'seguimientos':          seguimientos_pagina,
        'seguimientos_manuales': seguimientos_manuales_pagina,
        'combinados_page':       combinados_page,
        'per_page':              per_page,
        'estatus_filtro':        estatus,
        'area_filtro':           area_id,
        'tipo_filtro':           tipo_filtro,
        'filtro_orden':          filtro_orden,
        'filtro_problema':       filtro_problema,
        'filtro_accion':         filtro_accion,
        'filtro_validado':       filtro_validado,
        'orden_por':             orden_por,
        'direccion':             direccion,
        'areas':                 areas,
        'estatus_choices':       SeguimientoOT.ESTATUS_CHOICES,
        'area_nombre':           area_nombre,
        'puede_editar_seguimiento':   (es_admin or (acceso and acceso.editar_seguimiento)),
        'puede_eliminar_seguimiento': (es_admin or (acceso and acceso.eliminar_seguimiento)),
    })


@login_required
@require_POST
def subir_imagenes_seguimiento(request, tipo, seg_pk):
    """tipo: 'ot' o 'manual'"""
    if tipo == 'ot':
        seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
        campo = {'seguimiento_ot': seg}
    else:
        seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
        campo = {'seguimiento_manual': seg}

    imagenes = request.FILES.getlist('imagenes')
    existentes = seg.imagenes.count()
    disponibles = 4 - existentes

    creadas = []
    for imagen in imagenes[:max(disponibles, 0)]:
        img = ImagenSeguimiento.objects.create(imagen=imagen, **campo)
        creadas.append({'id': img.id, 'url': img.imagen.url})

    return JsonResponse({'ok': True, 'imagenes': creadas, 'total': seg.imagenes.count()})


@login_required
def imagenes_seguimiento(request, tipo, seg_pk):
    if tipo == 'ot':
        seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
    else:
        seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in seg.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_POST
def eliminar_imagen_seguimiento(request, imagen_id):
    imagen = get_object_or_404(ImagenSeguimiento, id=imagen_id)
    imagen.imagen.delete()
    imagen.delete()
    return JsonResponse({'ok': True})