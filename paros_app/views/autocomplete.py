from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse

from ..models import CatalogoFalla, CatalogoEquipo, CatalogoResponsable

@login_required
def buscar_fallas(request):
    """GET /fallas/buscar/?q=texto&area_id=1"""
    q       = request.GET.get('q', '').strip()
    area_id = request.GET.get('area_id', '')

    qs = CatalogoFalla.objects.all()
    if area_id:
        qs = qs.filter(area_id=area_id)
    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(codigo__icontains=q))

    resultados = list(qs.values('codigo', 'nombre')[:20])
    return JsonResponse(resultados, safe=False)


@login_required
def buscar_equipos(request):
    """GET /equipos/buscar/?q=texto&area_id=1"""
    q       = request.GET.get('q', '').strip()
    area_id = request.GET.get('area_id', '')

    qs = CatalogoEquipo.objects.all()
    if area_id:
        qs = qs.filter(area_id=area_id)
    if q:
        qs = qs.filter(Q(equipo__icontains=q) | Q(codigo__icontains=q))

    resultados = list(qs.values('codigo', 'equipo')[:20])
    return JsonResponse(resultados, safe=False)


@login_required
def buscar_responsables(request):
    """GET /responsables/buscar/?q=texto&area_id=1"""
    q       = request.GET.get('q', '').strip()
    area_id = request.GET.get('area_id', '')

    qs = CatalogoResponsable.objects.all()
    if area_id:
        qs = qs.filter(area_id=area_id)
    if q:
        qs = qs.filter(Q(responsable__icontains=q) | Q(codigo__icontains=q))

    resultados = list(qs.values('codigo', 'responsable')[:20])
    return JsonResponse(resultados, safe=False)

import re
from ..models import Area

def _siguiente_codigo(qs, area_id):
    """
    Busca el último código del área y sugiere el siguiente.
    Soporta patrones como AWH-F001, R-016, EQ-003, etc.
    Si no hay códigos previos devuelve None.
    """
    codigos = list(qs.filter(area_id=area_id).values_list('codigo', flat=True))
    if not codigos:
        return None

    mejor = None
    mejor_num = -1

    for cod in codigos:
        m = re.search(r'(\d+)$', cod)
        if m:
            num = int(m.group(1))
            if num > mejor_num:
                mejor_num = num
                mejor = cod

    if mejor is None:
        return None

    m = re.search(r'(\d+)$', mejor)
    prefijo = mejor[:m.start()]
    digits  = len(m.group(1))
    siguiente = prefijo + str(mejor_num + 1).zfill(digits)
    return siguiente


@login_required
def siguiente_codigo_falla(request):
    area_id = request.GET.get('area_id', '')
    codigo  = _siguiente_codigo(CatalogoFalla.objects, area_id)
    return JsonResponse({'codigo': codigo})


@login_required
def siguiente_codigo_equipo(request):
    area_id = request.GET.get('area_id', '')
    codigo  = _siguiente_codigo(CatalogoEquipo.objects, area_id)
    return JsonResponse({'codigo': codigo})


@login_required
def siguiente_codigo_responsable(request):
    area_id = request.GET.get('area_id', '')
    codigo  = _siguiente_codigo(CatalogoResponsable.objects, area_id)
    return JsonResponse({'codigo': codigo})