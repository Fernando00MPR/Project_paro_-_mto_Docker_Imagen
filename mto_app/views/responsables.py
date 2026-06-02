from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from .utils import requiere_acceso_mto
from ..models import Area, Responsable
from .utils import areas_permitidas_mto

@login_required
def lista_responsables(request):
    area_id      = request.GET.get('area', '').strip()
    responsables = Responsable.objects.select_related('area').filter(activo=True)
    if area_id:
        responsables = responsables.filter(area_id=area_id)
    ctx = {
        'responsables': responsables,
        'areas':        areas_permitidas_mto(request),
        'filtro_area':  area_id,
    }
    return render(request, 'mto_app/responsables/lista.html', ctx)


@login_required
def form_responsable(request, pk=None):
    responsable = get_object_or_404(Responsable, pk=pk) if pk else None
    areas       = areas_permitidas_mto(request)
    area_id     = request.GET.get('area', '')

    if request.method == 'POST':
        try:
            datos = {
                'area':          get_object_or_404(Area, pk=request.POST.get('area')),
                'numero_nomina': request.POST.get('numero_nomina', '').strip(),
                'nombre':        request.POST.get('nombre', '').strip(),
                'apellidos':     request.POST.get('apellidos', '').strip(),
                'posicion':      request.POST.get('posicion', '').strip(),
                'activo':        'activo' in request.POST,
            }
            if not all([datos['numero_nomina'], datos['nombre'], datos['apellidos']]):
                raise ValueError("Numero de nomina, nombre y apellidos son obligatorios.")

            if responsable:
                for k, v in datos.items():
                    setattr(responsable, k, v)
                responsable.save()
                messages.success(request, f"Responsable '{responsable.nombre_completo()}' actualizado.")
            else:
                Responsable.objects.create(**datos)
                messages.success(request, "Responsable creado.")

            return redirect(f"/mto/responsables/?area={datos['area'].pk}")

        except ValueError as e:
            messages.error(request, str(e))
        except Exception as e:
            messages.error(request, f"Error al guardar: {e}")

    ctx = {
        'responsable': responsable,
        'areas':       areas,
        'area_id':     area_id,
    }
    return render(request, 'mto_app/responsables/form.html', ctx)


@login_required
def eliminar_responsable(request, pk):
    responsable = get_object_or_404(Responsable, pk=pk)
    area_pk     = responsable.area_id
    if request.method == 'POST':
        responsable.delete()
        messages.success(request, f"Responsable '{responsable.nombre_completo()}' eliminado.")
    return redirect(f"/mto/responsables/?area={area_pk}")