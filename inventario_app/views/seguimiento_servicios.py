from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from mto_app.models import Area
from ..models import TipoServicio, SeguimientoServicio


@login_required
def lista_seguimientos_servicio(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.ver_seguimiento_servicio)
    )
    if not puede_ver:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    area_id        = request.GET.get('area', '')
    filtro_no_item = request.GET.get('no_item', '').strip()
    filtro_nombre  = request.GET.get('nombre', '').strip()
    filtro_tipo    = request.GET.get('tipo', '')
    filtro_pr      = request.GET.get('pr', '').strip()
    filtro_po      = request.GET.get('po', '').strip()
    filtro_sr      = request.GET.get('sr', '').strip()
    filtro_estatus = request.GET.get('estatus', '')

    qs = SeguimientoServicio.objects.select_related('area', 'tipo_servicio')

    if area_id:
        qs = qs.filter(area_id=area_id)
    if filtro_no_item:
        qs = qs.filter(no_item__icontains=filtro_no_item)
    if filtro_nombre:
        qs = qs.filter(nombre__icontains=filtro_nombre)
    if filtro_tipo:
        qs = qs.filter(tipo_servicio_id=filtro_tipo)
    if filtro_pr:
        qs = qs.filter(numero_pr__icontains=filtro_pr)
    if filtro_po:
        qs = qs.filter(numero_po__icontains=filtro_po)
    if filtro_sr:
        qs = qs.filter(numero_sr__icontains=filtro_sr)

    seguimientos = list(qs)
    if filtro_estatus:
        seguimientos = [s for s in seguimientos if s.estatus == filtro_estatus]

    seguimientos_base  = list(qs)
    total_rojo          = sum(1 for s in seguimientos_base if s.estatus == 'rojo')
    total_amarillo      = sum(1 for s in seguimientos_base if s.estatus == 'amarillo')
    total_verde         = sum(1 for s in seguimientos_base if s.estatus == 'verde')
    total_seguimientos  = len(seguimientos_base)

    per_page = request.GET.get('per_page', '20')
    paginator = Paginator(seguimientos, int(per_page) if per_page.isdigit() else 20)
    page_num = request.GET.get('page', 1)
    seguimientos_page = paginator.get_page(page_num)

    ctx = {
        'seguimientos':      seguimientos_page,
        'areas':             Area.objects.filter(activa=True),
        'tipos_servicio':    TipoServicio.objects.all(),
        'filtro_area':       area_id,
        'filtro_no_item':    filtro_no_item,
        'filtro_nombre':     filtro_nombre,
        'filtro_tipo':       filtro_tipo,
        'filtro_pr':         filtro_pr,
        'filtro_po':         filtro_po,
        'filtro_sr':         filtro_sr,
        'filtro_estatus':    filtro_estatus,
        'per_page':          per_page,
        'total_seguimientos': total_seguimientos,
        'total_rojo':         total_rojo,
        'total_amarillo':     total_amarillo,
        'total_verde':        total_verde,
        'puede_editar_seg_servicio':   (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.editar_seguimiento_servicio)),
        'puede_eliminar_seg_servicio': (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.eliminar_seguimiento_servicio)),
    }
    return render(request, 'inventario_app/lista_seguimientos_servicio.html', ctx)


@login_required
def guardar_seguimiento_servicio(request, pk=None):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_seguimiento_servicio)
    )
    if not puede_editar:
        messages.error(request, "No tienes permiso para editar seguimientos de servicios.")
        return redirect('inventario:lista_seguimientos_servicio')

    seguimiento = get_object_or_404(SeguimientoServicio, pk=pk) if pk else None

    if request.method == 'POST':
        try:
            area_obj = get_object_or_404(Area, pk=request.POST.get('area'))
            tipo_obj = get_object_or_404(TipoServicio, pk=request.POST.get('tipo_servicio'))

            no_item         = request.POST.get('no_item', '').strip()
            nombre          = request.POST.get('nombre', '').strip()
            cantidad        = request.POST.get('cantidad', '').strip()
            motivo_servicio = request.POST.get('motivo_servicio', '').strip()
            numero_pr       = request.POST.get('numero_pr', '').strip()

            if not all([no_item, nombre, cantidad, motivo_servicio, numero_pr]):
                raise ValueError("No. Item, Nombre, Cantidad, Motivo y No. PR son obligatorios.")

            datos = {
                'area':            area_obj,
                'no_item':         no_item,
                'nombre':          nombre,
                'cantidad':        int(cantidad),
                'motivo_servicio': motivo_servicio,
                'tipo_servicio':   tipo_obj,
                'numero_pr':       numero_pr,
                'fecha_pr':        request.POST.get('fecha_pr') or None,
                'numero_po':       request.POST.get('numero_po', '').strip(),
                'fecha_po':        request.POST.get('fecha_po') or None,
                'numero_sr':       request.POST.get('numero_sr', '').strip(),
                'fecha_sr':        request.POST.get('fecha_sr') or None,
                'comentarios':     request.POST.get('comentarios', '').strip(),
            }

            if seguimiento:
                for k, v in datos.items():
                    setattr(seguimiento, k, v)
                seguimiento.save()
                messages.success(request, "Seguimiento de servicio actualizado.")
            else:
                SeguimientoServicio.objects.create(**datos)
                messages.success(request, "Seguimiento de servicio creado.")

            return redirect(f"{reverse('inventario:lista_seguimientos_servicio')}?area={area_obj.pk}")

        except ValueError as e:
            messages.error(request, str(e))
        except Exception as e:
            messages.error(request, f"Error al guardar: {e}")

    area_id = request.POST.get('area', '') or request.GET.get('area', '')
    return redirect(f"{reverse('inventario:lista_seguimientos_servicio')}?area={area_id}")


@login_required
def eliminar_seguimiento_servicio(request, pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_eliminar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.eliminar_seguimiento_servicio)
    )
    if not puede_eliminar:
        messages.error(request, "No tienes permiso para eliminar seguimientos de servicios.")
        return redirect('inventario:lista_seguimientos_servicio')

    seguimiento = get_object_or_404(SeguimientoServicio, pk=pk)
    area_id = seguimiento.area_id
    if request.method == 'POST':
        seguimiento.delete()
        messages.success(request, "Seguimiento de servicio eliminado.")
    return redirect(f"{reverse('inventario:lista_seguimientos_servicio')}?area={area_id}")