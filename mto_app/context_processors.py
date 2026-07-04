from .views.utils import areas_permitidas_mto
import time

def areas_menu(request):
    if request.user.is_authenticated:
        time.sleep(35)  # ← simula la lentitud
        return {'areas_menu': areas_permitidas_mto(request).order_by('nombre')}
    return {'areas_menu': []}