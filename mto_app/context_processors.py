import re
import time
from django.core.cache import cache
from .views.utils import areas_permitidas_mto

# Igual que el AreaSwitcher de base_menu.html: sin el prefijo "Mantenimiento", siglas de 3
# letras y color según el id del área (6 colores: as-c0 … as-c5), así sirve para cualquier área nueva.
_PREF = re.compile(r'^mantenimiento\s+', re.I)


def _area_actual(request, areas):
    """Área que muestra el botón del menú: la de ?area=, si no la de la cookie, si no la primera."""
    if not areas:
        return None
    ids = [str(a.pk) for a in areas]
    elegida = request.GET.get('area') or request.COOKIES.get('mto_area_actual')
    a = areas[ids.index(elegida)] if elegida in ids else areas[0]
    nombre = a.nombre.strip()
    corto  = _PREF.sub('', nombre)
    return {'id': str(a.pk), 'nombre': nombre, 'corto': corto, 'con_pref': bool(_PREF.match(nombre)),
            'sigla': re.sub(r'\s+', '', corto)[:3].upper(), 'color': a.pk % 6}


def areas_menu(request):
    if not request.user.is_authenticated:
        return {'areas_menu': []}
    cache_key = f'areas_menu_{request.user.id}'
    areas = cache.get(cache_key)
    if areas is None:
        #t0    = time.perf_counter()
        areas = list(areas_permitidas_mto(request).order_by('nombre'))
        #ms    = (time.perf_counter() - t0) * 1000
        if areas:
            # No cachear listas vacías: si el usuario todavía no tiene áreas
            # asignadas (o se le quitó el acceso momentáneamente), queremos
            # volver a consultar la BD en el próximo request en vez de quedar
            # con el select vacío hasta que expire el TTL de 5 minutos.
            cache.set(cache_key, areas, 300)
        #print(f"[CTX] cache miss user {request.user.id}  →  {ms:.1f} ms")
    return {'areas_menu': areas, 'area_menu_actual': _area_actual(request, areas)}
