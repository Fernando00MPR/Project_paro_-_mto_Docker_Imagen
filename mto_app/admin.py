from django.contrib import admin
from .models import Area, PlanMantenimiento, HistorialRutina

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'activa']
    list_filter   = ['activa']
    search_fields = ['nombre']


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
