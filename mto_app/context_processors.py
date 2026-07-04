"""
from django.core.cache import cache
from .views.utils import areas_permitidas_mto

def areas_menu(request):
    if not request.user.is_authenticated:
        return {'areas_menu': []}
    cache_key = f'areas_menu_{request.user.id}'
    areas = cache.get(cache_key)
    if areas is None:
        areas = list(areas_permitidas_mto(request).order_by('nombre'))
        cache.set(cache_key, areas, 300)
    return {'areas_menu': areas}
"""

from .views.utils import areas_permitidas_mto
import time

def areas_menu(request):
    if request.user.is_authenticated:
        time.sleep(125)  # ← simula la lentitud
        return {'areas_menu': areas_permitidas_mto(request).order_by('nombre')}
    return {'areas_menu': []}