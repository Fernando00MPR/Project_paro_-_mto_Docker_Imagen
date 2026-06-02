from .models import Area
from .views.utils import areas_permitidas_mto

def areas_menu(request):
    if request.user.is_authenticated:
        return {'areas_menu': areas_permitidas_mto(request).order_by('nombre')}
    return {'areas_menu': []}