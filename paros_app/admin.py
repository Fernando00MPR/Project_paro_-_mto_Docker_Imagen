from django.contrib import admin
from django.db.models import Exists, OuterRef, Q
from django.utils.translation import gettext_lazy
from mto_app.models import Area as AreaMto
from .models import Area, Paro, CatalogoFalla, CatalogoEquipo, CatalogoResponsable, TargetIndicador, AccionDia, ConfiguracionMoldes, ConfiguracionHoraHora, ConfiguracionAgv

@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display   = ('id', 'nombre', 'en_mto')
    search_fields  = ('nombre',)

    def get_queryset(self, request):
        # "¿Existe en Mantenimiento?": la Bitácora de mantenimiento empata las áreas por nombre (es o en)
        pareja = AreaMto.objects.filter(Q(nombre__iexact=OuterRef('nombre_es')) | Q(nombre__iexact=OuterRef('nombre_en')))
        return super().get_queryset(request).annotate(tiene_pareja=Exists(pareja))

    @admin.display(boolean=True, description=gettext_lazy("¿Existe en Mantenimiento?"), ordering='tiene_pareja')
    def en_mto(self, obj):
        return obj.tiene_pareja


@admin.register(ConfiguracionMoldes)
class ConfiguracionMoldesAdmin(admin.ModelAdmin):
    list_display = ('area',)

    def has_add_permission(self, request):
        return not ConfiguracionMoldes.objects.exists()

@admin.register(ConfiguracionHoraHora)
class ConfiguracionHoraHoraAdmin(admin.ModelAdmin):
    list_display = ('area',)

    def has_add_permission(self, request):
        return not ConfiguracionHoraHora.objects.exists()


@admin.register(ConfiguracionAgv)
class ConfiguracionAgvAdmin(admin.ModelAdmin):
    list_display = ('area',)

    def has_add_permission(self, request):
        return not ConfiguracionAgv.objects.exists()

    
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