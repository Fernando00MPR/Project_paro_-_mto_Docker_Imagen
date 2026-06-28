from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from mto_app.models import Area
from ..models import Refaccion, SeguimientoRefaccion
from datetime import date


@login_required
def lista_seguimientos_refaccion(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.ver_seguimiento_refaccion)
    )
    if not puede_ver:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    area_id        = request.GET.get('area', '')
    filtro_no_item = request.GET.get('no_item', '').strip()
    filtro_nombre  = request.GET.get('nombre', '').strip()
    filtro_pr      = request.GET.get('pr', '').strip()
    filtro_po      = request.GET.get('po', '').strip()
    filtro_sr      = request.GET.get('sr', '').strip()
    filtro_estatus = request.GET.get('estatus', '')
    fecha_pr_desde = request.GET.get('fecha_pr_desde', '') or date(date.today().year, 1, 1).isoformat()
    fecha_pr_hasta = request.GET.get('fecha_pr_hasta', '') or date.today().isoformat()

    seguimientos = SeguimientoRefaccion.objects.select_related('refaccion', 'refaccion__area')

    if area_id:
        seguimientos = seguimientos.filter(refaccion__area_id=area_id)
    if filtro_no_item:
        seguimientos = seguimientos.filter(refaccion__no_item__icontains=filtro_no_item)
    if filtro_nombre:
        seguimientos = seguimientos.filter(refaccion__nombre__icontains=filtro_nombre)
    if filtro_pr:
        seguimientos = seguimientos.filter(numero_pr__icontains=filtro_pr)
    if filtro_po:
        seguimientos = seguimientos.filter(numero_po__icontains=filtro_po)
    if filtro_sr:
        seguimientos = seguimientos.filter(numero_sr__icontains=filtro_sr)
    if fecha_pr_desde:
        seguimientos = seguimientos.filter(fecha_pr__gte=fecha_pr_desde)
    if fecha_pr_hasta:
        seguimientos = seguimientos.filter(fecha_pr__lte=fecha_pr_hasta)
    if filtro_estatus:
        seguimientos = [s for s in seguimientos if s.estatus == filtro_estatus]


    seguimientos_sin_filtro_estatus = seguimientos if not filtro_estatus else list(
        SeguimientoRefaccion.objects.select_related('refaccion', 'refaccion__area').filter(
            **({'refaccion__area_id': area_id} if area_id else {}),
            **({'refaccion__no_item__icontains': filtro_no_item} if filtro_no_item else {}),
            **({'refaccion__nombre__icontains': filtro_nombre} if filtro_nombre else {}),
            **({'numero_pr__icontains': filtro_pr} if filtro_pr else {}),
            **({'numero_po__icontains': filtro_po} if filtro_po else {}),
            **({'numero_sr__icontains': filtro_sr} if filtro_sr else {}),
        )
    )

    total_seguimientos    = len(seguimientos_sin_filtro_estatus)
    total_rojo            = sum(1 for s in seguimientos_sin_filtro_estatus if s.estatus == 'rojo')
    total_amarillo        = sum(1 for s in seguimientos_sin_filtro_estatus if s.estatus == 'amarillo')
    total_verde           = sum(1 for s in seguimientos_sin_filtro_estatus if s.estatus == 'verde')

    per_page = request.GET.get('per_page', '10')
    paginator = Paginator(seguimientos, int(per_page) if per_page.isdigit() else 10)
    page_num = request.GET.get('page', 1)
    seguimientos_page = paginator.get_page(page_num)

    ctx = {
        'seguimientos':        seguimientos_page,
        'areas':               Area.objects.filter(activa=True),
        'filtro_area':         area_id,
        'filtro_no_item':      filtro_no_item,
        'filtro_nombre':       filtro_nombre,
        'filtro_pr':           filtro_pr,
        'filtro_po':           filtro_po,
        'filtro_sr':           filtro_sr,
        'filtro_estatus':      filtro_estatus,
        'per_page':            per_page,
        'total_seguimientos':  total_seguimientos,
        'total_rojo':          total_rojo,
        'total_amarillo':      total_amarillo,
        'total_verde':         total_verde,
        'fecha_pr_desde':      fecha_pr_desde,
        'fecha_pr_hasta':      fecha_pr_hasta,
        'puede_editar_seg_refaccion':   (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.editar_seguimiento_refaccion)),
        'puede_eliminar_seg_refaccion': (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.eliminar_seguimiento_refaccion)),
    }
    return render(request, 'inventario_app/lista_seguimientos.html', ctx)


@login_required
def guardar_seguimiento_refaccion(request, pk=None):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_seguimiento_refaccion)
    )
    if not puede_editar:
        messages.error(request, "No tienes permiso para editar seguimientos de refacciones.")
        return redirect('inventario:lista_seguimientos_refaccion')

    seguimiento = get_object_or_404(SeguimientoRefaccion, pk=pk) if pk else None

    if request.method == 'POST':
        try:
            refaccion = get_object_or_404(Refaccion, pk=request.POST.get('refaccion'))
            numero_pr = request.POST.get('numero_pr', '').strip()
            cantidad  = request.POST.get('cantidad', '').strip()

            if not numero_pr or not cantidad:
                raise ValueError("No. PR y cantidad son obligatorios.")

            datos = {
                'refaccion':   refaccion,
                'cantidad':    int(cantidad),
                'numero_pr':   numero_pr,
                'fecha_pr':    request.POST.get('fecha_pr') or None,
                'numero_po':   request.POST.get('numero_po', '').strip(),
                'fecha_po':    request.POST.get('fecha_po') or None,
                'numero_sr':   request.POST.get('numero_sr', '').strip(),
                'fecha_sr':    request.POST.get('fecha_sr') or None,
                'comentarios': request.POST.get('comentarios', '').strip(),
            }

            if seguimiento:
                for k, v in datos.items():
                    setattr(seguimiento, k, v)
                seguimiento.save()
                messages.success(request, "Seguimiento actualizado.")
            else:
                SeguimientoRefaccion.objects.create(**datos)
                messages.success(request, "Seguimiento creado.")

            return redirect(f"{reverse('inventario:lista_seguimientos_refaccion')}?area={refaccion.area_id}")

        except ValueError as e:
            messages.error(request, str(e))
        except Exception as e:
            messages.error(request, f"Error al guardar: {e}")

    area_id = request.POST.get('area', '') or request.GET.get('area', '')
    return redirect(f"{reverse('inventario:lista_seguimientos_refaccion')}?area={area_id}")


@login_required
def eliminar_seguimiento_refaccion(request, pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_eliminar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.eliminar_seguimiento_refaccion)
    )
    if not puede_eliminar:
        messages.error(request, "No tienes permiso para eliminar seguimientos de refacciones.")
        return redirect('inventario:lista_seguimientos_refaccion')

    seguimiento = get_object_or_404(SeguimientoRefaccion, pk=pk)
    area_id = seguimiento.refaccion.area_id
    if request.method == 'POST':
        seguimiento.delete()
        messages.success(request, "Seguimiento eliminado.")
    return redirect(f"{reverse('inventario:lista_seguimientos_refaccion')}?area={area_id}")