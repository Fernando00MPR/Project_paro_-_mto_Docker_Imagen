import time
from django.core.cache import cache
from .views.utils import areas_permitidas_mto

def areas_menu(request):
    if not request.user.is_authenticated:
        return {'areas_menu': []}
    cache_key = f'areas_menu_{request.user.id}'
    areas = cache.get(cache_key)
    if areas is None:
        t0    = time.perf_counter()
        areas = list(areas_permitidas_mto(request).order_by('nombre'))
        ms    = (time.perf_counter() - t0) * 1000
        cache.set(cache_key, areas, 300)
        print(f"[CTX] cache miss user {request.user.id}  →  {ms:.1f} ms")
    return {'areas_menu': areas}
