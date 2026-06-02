from datetime import date, timedelta
from functools import wraps
from django.shortcuts import redirect
from ..models import Area

INTERVALO = {
    'semanal':    1,
    'quincenal':  2,
    'mensual':    4,
    'trimestral': 13,
    'semestral':  26,
    'anual':      52,
}


def lunes_de_semana(anio, semana):
    return date.fromisocalendar(anio, semana, 1)


def _planes_que_tocan(planes, lunes):
    """Filtra los planes cuya frecuencia toca en la semana del lunes dado."""
    resultado = []
    for plan in planes:
        if not plan.semana_inicio or not plan.anio_inicio:
            continue
        try:
            intervalo = INTERVALO.get(plan.frecuencia, 1)
            ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
            delta     = (lunes - ref_lunes).days
            sem_delta = delta // 7
            if delta >= 0 and sem_delta % intervalo == 0:
                resultado.append(plan)
        except Exception:
            continue
    return resultado


def _frecuencia_desde_excel(valor):
    """Convierte frecuencia del Excel (16S, 4S, 2M...) al choice del modelo."""
    if not valor:
        return 'mensual'
    texto   = str(valor).strip().upper().replace(' ', '')
    numeros = ''.join(c for c in texto if c.isdigit())
    if not numeros:
        return 'mensual'
    n = int(numeros)
    if 'M' in texto:
        n = n * 4
    if n <= 1:
        return 'semanal'
    elif n <= 3:
        return 'quincenal'
    elif n <= 6:
        return 'mensual'
    elif n <= 18:
        return 'trimestral'
    elif n <= 39:
        return 'semestral'
    else:
        return 'anual'
    
def requiere_acceso_mto(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('login')
        if request.user.is_superuser:
            return view_func(request, *args, **kwargs)
        try:
            if not request.user.acceso_mto.activo:
                return redirect('sin_permiso')
        except Exception:
            return redirect('sin_permiso')
        return view_func(request, *args, **kwargs)
    return wrapper

def areas_permitidas_mto(request):
    if request.user.is_superuser:
        return Area.objects.filter(activa=True)
    try:
        if request.user.acceso_mto.activo:
            return request.user.acceso_mto.areas.filter(activa=True)
    except Exception:
        pass
    return Area.objects.none()