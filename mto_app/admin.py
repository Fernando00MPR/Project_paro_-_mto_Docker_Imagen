from django.contrib import admin, messages
from django.db.models import Exists, OuterRef, Q
from django.utils.translation import gettext as _, gettext_lazy
from paros_app.models import Area as AreaParos
from .models import Area, PlanMantenimiento, HistorialRutina, Rutina

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'prefijo_ot', 'activa', 'en_paros']
    list_filter   = ['activa']
    search_fields = ['nombre']

    def get_queryset(self, request):
        # "¿Existe en Paros?" se calcula en la misma consulta de la lista (sin una consulta por fila)
        pareja = AreaParos.objects.filter(
            Q(nombre_es__iexact=OuterRef('nombre')) | Q(nombre_en__iexact=OuterRef('nombre')))
        return super().get_queryset(request).annotate(tiene_pareja=Exists(pareja))

    @admin.display(boolean=True, description=gettext_lazy("¿Existe en Paros?"), ordering='tiene_pareja')
    def en_paros(self, obj):
        return obj.tiene_pareja

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not obj.area_paros():
            messages.warning(request, _("No hay un área llamada «{area}» en Paros de Producción. La Bitácora no podrá "
                                        "ofrecer sus equipos del catálogo. Créala allá con el mismo nombre.").format(area=obj.nombre))

@admin.register(PlanMantenimiento)
class PlanMantenimientoAdmin(admin.ModelAdmin):
    list_display  = ['codigo', 'actividad', 'area', 'frecuencia', 'duracion_minutos', 'activo']
    list_filter   = ['area', 'frecuencia', 'activo']
    search_fields = ['codigo', 'nombre_equipo', 'rutina', 'plan_trabajo']


@admin.register(HistorialRutina)
class HistorialRutinaAdmin(admin.ModelAdmin):
    list_display  = ['fecha', 'accion', 'usuario', 'area', 'plan_trabajo', 'codigo_plan', 'pasos_afectados']
    list_filter   = ['accion', 'area']
    search_fields = ['usuario__username', 'plan_trabajo', 'codigo_plan', 'nombre_plan']
    readonly_fields = ['fecha', 'usuario', 'accion', 'area', 'plan_trabajo',
                       'codigo_plan', 'nombre_plan', 'pasos_afectados', 'motivo']

@admin.register(Rutina)
class RutinaAdmin(admin.ModelAdmin):
    list_display  = ['plan_trabajo', 'area', 'codigo_documento', 'prioridad', 'creador']
    list_filter   = ['area', 'prioridad']
    search_fields = ['plan_trabajo', 'codigo_documento', 'creador', 'locacion']