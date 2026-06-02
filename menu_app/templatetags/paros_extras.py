from django import template
from paros_app.models import Area

register = template.Library()

@register.simple_tag(takes_context=True)
def get_areas(context):
    request = context.get('request')
    if not request:
        return Area.objects.all()
    user = request.user
    if user.is_superuser:
        return Area.objects.all()
    try:
        perfil = user.perfil
        if perfil.es_admin:
            return Area.objects.all()
        areas_permitidas = perfil.areas_permitidas.all()
        if areas_permitidas.exists():
            return areas_permitidas
        return Area.objects.none()  # sin áreas = ninguna en menú
    except Exception:
        return Area.objects.all()

@register.filter
def get_attr(obj, attr):
    return getattr(obj, attr, False)

@register.filter
def semana_iso(fecha):
    """Devuelve el número de semana ISO 8601 de una fecha."""
    try:
        return fecha.isocalendar()[1]
    except Exception:
        return 
