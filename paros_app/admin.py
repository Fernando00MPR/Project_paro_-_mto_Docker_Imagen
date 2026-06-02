from django.contrib import admin
from .models import Area, Paro, CatalogoFalla, CatalogoEquipo, CatalogoResponsable, TargetIndicador, AccionDia

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display   = ('id', 'nombre')
    search_fields  = ('nombre',)


@admin.register(Paro)
class ParoAdmin(admin.ModelAdmin):
    list_display   = ('area', 'fecha', 'turno', 'falla', 'responsable', 'equipo', 'hora', 'tiempo_minutos')
    list_filter    = ('area', 'turno', 'fecha')
    search_fields  = ('falla', 'responsable', 'equipo')
    date_hierarchy = 'fecha'

@admin.register(CatalogoFalla)
class CatalogoFallaAdmin(admin.ModelAdmin):
    list_display  = ('codigo', 'area', 'nombre', 'tipo_falla')
    list_filter   = ('area', 'tipo_falla')
    search_fields = ('codigo', 'nombre')
    
@admin.register(CatalogoEquipo)
class CatalogoEquipoAdmin(admin.ModelAdmin):
    list_display  = ('codigo', 'area', 'equipo')
    list_filter   = ('area',)
    search_fields = ('codigo', 'equipo')


@admin.register(CatalogoResponsable)
class CatalogoResponsableAdmin(admin.ModelAdmin):
    list_display  = ('codigo', 'area', 'responsable')
    list_filter   = ('area',)
    search_fields = ('codigo', 'responsable')


@admin.register(TargetIndicador)
class TargetIndicadorAdmin(admin.ModelAdmin):
    list_display  = ('area', 'indicador', 'valor')
    list_filter   = ('area', 'indicador')
    list_editable = ('valor',)


@admin.register(AccionDia)
class AccionDiaAdmin(admin.ModelAdmin):
    list_display = ('area', 'fecha', 'indicador', 'cont_estatus', 'corr_estatus', 'prev_estatus')
    list_filter  = ('area', 'cont_estatus', 'corr_estatus', 'prev_estatus')
    date_hierarchy = 'fecha'