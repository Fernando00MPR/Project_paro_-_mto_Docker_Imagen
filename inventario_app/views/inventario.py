from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from mto_app.models import Area
from ..models import Refaccion, CategoriaRefaccion, ImagenRefaccion


@login_required
def lista_refacciones(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.ver_inventario)
    )
    if not puede_ver:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    area_id          = request.GET.get('area', '')
    categoria_id      = request.GET.get('categoria', '')
    busqueda          = request.GET.get('q', '').strip()
    solo_bajo_minimo  = request.GET.get('bajo_minimo', '')

    refacciones_qs = Refaccion.objects.select_related('area', 'categoria').filter(activo=True)

    if area_id:
        refacciones_qs = refacciones_qs.filter(area_id=area_id)
    if categoria_id:
        refacciones_qs = refacciones_qs.filter(categoria_id=categoria_id)
    if busqueda:
        refacciones_qs = (refacciones_qs.filter(nombre__icontains=busqueda) |
                          refacciones_qs.filter(no_item__icontains=busqueda))

    total_bajo_minimo = sum(1 for r in refacciones_qs if r.bajo_minimo)

    if solo_bajo_minimo:
        refacciones = [r for r in refacciones_qs if r.bajo_minimo]
    else:
        refacciones = list(refacciones_qs)

    per_page = request.GET.get('per_page', '20')
    paginator = Paginator(refacciones, int(per_page) if per_page.isdigit() else 20)
    page_num = request.GET.get('page', 1)
    refacciones_page = paginator.get_page(page_num)

    ctx = {
        'refacciones':       refacciones_page,
        'areas':             Area.objects.filter(activa=True),
        'categorias':        CategoriaRefaccion.objects.all(),
        'filtro_area':       area_id,
        'filtro_categoria':  categoria_id,
        'busqueda':          busqueda,
        'solo_bajo_minimo':  solo_bajo_minimo,
        'per_page':          per_page,
        'total_bajo_minimo': total_bajo_minimo,
        'unidades':          Refaccion.UNIDAD_CHOICES,
        'puede_editar_inventario':   (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.editar_inventario)),
        'puede_eliminar_inventario': (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.eliminar_inventario)),
    }
    return render(request, 'inventario_app/lista_refacciones.html', ctx)


@login_required
def form_refaccion(request, pk=None):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_inventario)
    )
    if not puede_editar:
        messages.error(request, "No tienes permiso para editar el inventario.")
        return redirect('inventario:lista_refacciones')

    refaccion = get_object_or_404(Refaccion, pk=pk) if pk else None

    if request.method == 'POST':
        try:
            datos = {
                'no_item':        request.POST.get('no_item', '').strip(),
                'nombre':         request.POST.get('nombre', '').strip(),
                'descripcion':    request.POST.get('descripcion', '').strip(),
                'area':           get_object_or_404(Area, pk=request.POST.get('area')),
                'categoria_id':   request.POST.get('categoria') or None,
                'unidad':         request.POST.get('unidad', 'pza'),
                'stock_actual':   int(request.POST.get('stock_actual', 0) or 0),
                'stock_minimo':   int(request.POST.get('stock_minimo', 0) or 0),
                'ubicacion':      request.POST.get('ubicacion', '').strip(),
                'proveedor':      request.POST.get('proveedor', '').strip(),
                'costo_unitario': request.POST.get('costo_unitario') or None,
                'activo':         'activo' in request.POST,
            }

            if not datos['no_item'] or not datos['nombre']:
                raise ValueError("No. Item y Nombre son obligatorios.")

            area_pk = datos['area'].pk

            if refaccion:
                for k, v in datos.items():
                    setattr(refaccion, k, v)
                refaccion.save()
                messages.success(request, f"Refacción '{refaccion.no_item}' actualizada.")
            else:
                refaccion = Refaccion.objects.create(**datos)
                messages.success(request, "Refacción creada.")

            imagenes_nuevas = request.FILES.getlist('imagenes')
            existentes      = refaccion.imagenes.count()
            disponibles     = 2 - existentes

            if imagenes_nuevas and disponibles <= 0:
                messages.warning(request, "Ya se alcanzó el máximo de 2 imágenes; no se agregaron las nuevas.")
            else:
                for imagen in imagenes_nuevas[:max(disponibles, 0)]:
                    ImagenRefaccion.objects.create(refaccion=refaccion, imagen=imagen)
                if len(imagenes_nuevas) > disponibles:
                    messages.warning(request, f"Solo se guardaron {max(disponibles,0)} imagen(es); límite de 2 alcanzado.")

            return redirect(f"{reverse('inventario:lista_refacciones')}?area={area_pk}")

        except ValueError as e:
            messages.error(request, str(e))
        except Exception as e:
            messages.error(request, f"Error al guardar: {e}")

        area_id = request.POST.get('area', '')
        return redirect(f"{reverse('inventario:lista_refacciones')}?area={area_id}")

    return redirect('inventario:lista_refacciones')


@login_required
def eliminar_refaccion(request, pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_eliminar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.eliminar_inventario)
    )
    if not puede_eliminar:
        messages.error(request, "No tienes permiso para eliminar refacciones.")
        return redirect('inventario:lista_refacciones')

    refaccion = get_object_or_404(Refaccion, pk=pk)
    if request.method == 'POST':
        try:
            refaccion.delete()
            messages.success(request, f"Refacción '{refaccion.no_item}' eliminada.")
        except Exception:
            messages.error(request, f"No se puede eliminar '{refaccion.no_item}' porque tiene movimientos asociados.")
    return redirect('inventario:lista_refacciones')


@login_required
@require_POST
def subir_imagenes_refaccion(request, refaccion_pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_inventario)
    )
    if not puede_editar:
        return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    refaccion = get_object_or_404(Refaccion, pk=refaccion_pk)
    imagenes  = request.FILES.getlist('imagenes')
    existentes  = refaccion.imagenes.count()
    disponibles = 2 - existentes

    creadas = []
    for imagen in imagenes[:max(disponibles, 0)]:
        img = ImagenRefaccion.objects.create(refaccion=refaccion, imagen=imagen)
        creadas.append({'id': img.id, 'url': img.imagen.url})

    return JsonResponse({'ok': True, 'imagenes': creadas, 'total': refaccion.imagenes.count()})


@login_required
def imagenes_refaccion(request, refaccion_pk):
    refaccion = get_object_or_404(Refaccion, pk=refaccion_pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in refaccion.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_POST
def eliminar_imagen_refaccion(request, imagen_id):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_inventario)
    )
    if not puede_editar:
        return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    imagen = get_object_or_404(ImagenRefaccion, id=imagen_id)
    imagen.imagen.delete()
    imagen.delete()
    return JsonResponse({'ok': True})


@login_required
def buscar_refacciones(request):
    q = request.GET.get('q', '').strip()
    area_id = request.GET.get('area', '')

    qs = Refaccion.objects.filter(activo=True)
    if area_id:
        qs = qs.filter(area_id=area_id)
    if q:
        qs = (qs.filter(no_item__icontains=q) | qs.filter(nombre__icontains=q))

    resultados = [
        {'id': r.id, 'no_item': r.no_item, 'nombre': r.nombre}
        for r in qs[:15]
    ]
    return JsonResponse(resultados, safe=False)