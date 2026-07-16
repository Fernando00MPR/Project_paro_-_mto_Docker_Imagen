from datetime import date

from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.http import JsonResponse
from django.db.models import Q

from .utils import areas_permitidas_mto
from ..models import Area, Bitacora, Responsable


@login_required
def lista_bitacora(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.ver_bitacora)
    )
    if not puede_ver:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    area_id   = request.GET.get('area', '').strip()
    filtro_fecha = request.GET.get('fecha', '').strip()
    filtro_q     = request.GET.get('q', '').strip()
    filtro_pendiente = request.GET.get('pendiente', '').strip()

    registros = Bitacora.objects.select_related('area')
    if area_id:
        registros = registros.filter(area_id=area_id)
    if filtro_fecha:
        registros = registros.filter(fecha=filtro_fecha)
    if filtro_q:
        registros = registros.filter(
            Q(equipo__icontains=filtro_q) | Q(responsable__icontains=filtro_q)
        )
    if filtro_pendiente == '1':
        registros = registros.exclude(pendiente='').exclude(pendiente__isnull=True)
    elif filtro_pendiente == '0':
        registros = registros.filter(Q(pendiente='') | Q(pendiente__isnull=True))

    ctx = {
        'registros':         registros,
        'areas':             areas_permitidas_mto(request),
        'filtro_area':       area_id,
        'today':             date.today(),
        'puede_editar':      (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.editar_bitacora)),
        'puede_eliminar':    (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.eliminar_bitacora)),
        'filtro_fecha':      filtro_fecha,
        'filtro_q':          filtro_q,
        'filtro_pendiente':  filtro_pendiente,
    }
    return render(request, 'mto_app/bitacora/lista.html', ctx)


@login_required
def form_bitacora(request, pk=None):
    if request.method != 'POST':
        return redirect('mto:lista_bitacora')

    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_bitacora)
    )
    if not puede_editar:
        messages.error(request, "No tienes permiso para editar la bitácora.")
        return redirect('mto:lista_bitacora')

    registro = get_object_or_404(Bitacora, pk=pk) if pk else None
    area_id  = request.POST.get('area', '').strip()

    try:
        area = get_object_or_404(Area, pk=area_id)
        datos = {
            'area':                area,
            'fecha':               request.POST.get('fecha', '').strip(),
            'equipo':              request.POST.get('equipo', '').strip()[:100],
            'actividad_realizada': request.POST.get('actividad_realizada', '').strip()[:300],
            'pendiente':           request.POST.get('pendiente', '').strip()[:200],
            'responsable':         request.POST.get('responsable', '').strip()[:200],
        }
        if not datos['fecha']:
            raise ValueError("La fecha es obligatoria.")
        if not datos['actividad_realizada']:
            raise ValueError("La actividad realizada es obligatoria.")

        if registro:
            for k, v in datos.items():
                setattr(registro, k, v)
            registro.save()
            messages.success(request, "Registro actualizado.")
        else:
            Bitacora.objects.create(**datos)
            messages.success(request, "Registro agregado.")

        return redirect(f"/mto/bitacora/?area={area.pk}")

    except ValueError as e:
        messages.error(request, str(e))
    except Exception as e:
        messages.error(request, f"Error al guardar: {e}")

    return redirect(f"/mto/bitacora/?area={area_id}")


@login_required
def eliminar_bitacora(request, pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_eliminar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.eliminar_bitacora)
    )
    if not puede_eliminar:
        messages.error(request, "No tienes permiso para eliminar registros.")
        return redirect('mto:lista_bitacora')

    registro = get_object_or_404(Bitacora, pk=pk)
    area_pk  = registro.area_id
    if request.method == 'POST':
        registro.delete()
        messages.success(request, "Registro eliminado.")
    return redirect(f"/mto/bitacora/?area={area_pk}")


@login_required
def buscar_equipos_bitacora(request):
    from paros_app.models import CatalogoEquipo, Area as AreaParos

    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = CatalogoEquipo.objects.select_related('area')

    if mto_area_id:
        area_mto = Area.objects.filter(pk=mto_area_id).first()
        if area_mto:
            area_paros = AreaParos.objects.filter(nombre__iexact=area_mto.nombre).first()
            if area_paros:
                qs = qs.filter(area=area_paros)

    if q:
        qs = qs.filter(Q(equipo__icontains=q) | Q(codigo__icontains=q))

    data = [
        {
            'nombre':      e.equipo_es or e.equipo,
            'descripcion': f"[{e.codigo}]" + (f" — {e.sub_area_es}" if e.sub_area_es else ''),
        }
        for e in qs[:15]
    ]
    return JsonResponse(data, safe=False)


@login_required
def buscar_responsables_bitacora(request):
    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = Responsable.objects.filter(activo=True)

    if mto_area_id:
        qs = qs.filter(area_id=mto_area_id)

    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(apellidos__icontains=q))

    data = [
        {
            'nombre':      f"{r.nombre} {r.apellidos}",
            'descripcion': r.posicion,
        }
        for r in qs[:15]
    ]
    return JsonResponse(data, safe=False)
