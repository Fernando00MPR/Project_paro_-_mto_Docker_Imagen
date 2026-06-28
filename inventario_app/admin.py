from django.contrib import admin
from .models import CategoriaRefaccion, Refaccion, ImagenRefaccion
from .models import TipoServicio, SeguimientoServicio


class ImagenRefaccionInline(admin.TabularInline):
    model = ImagenRefaccion
    extra = 0
    readonly_fields = ['subida_en']


@admin.register(CategoriaRefaccion)
class CategoriaRefaccionAdmin(admin.ModelAdmin):
    list_display = ['nombre']
    search_fields = ['nombre']
    ordering = ['nombre']


@admin.register(Refaccion)
class RefaccionAdmin(admin.ModelAdmin):
    list_display = [
        'no_item', 
        'nombre', 
        'area', 
        'categoria', 
        'unidad',
        'stock_actual', 
        'stock_minimo',
        'stock_maximo',
        'bajo_minimo_display', 
        'activo',
    ]
    list_filter = ['area', 'categoria', 'unidad', 'activo']
    search_fields = ['no_item', 'nombre', 'proveedor']
    ordering = ['area', 'no_item']
    inlines = [ImagenRefaccionInline]
    readonly_fields = ['creado_en', 'modificado_en']

    def bajo_minimo_display(self, obj):
        return obj.bajo_minimo
    bajo_minimo_display.boolean = True
    bajo_minimo_display.short_description = 'Bajo mínimo'


@admin.register(TipoServicio)
class TipoServicioAdmin(admin.ModelAdmin):
    list_display = ['nombre']
    search_fields = ['nombre']
    ordering = ['nombre']


@admin.register(SeguimientoServicio)
class SeguimientoServicioAdmin(admin.ModelAdmin):
    list_display = ['numero_pr', 'no_item', 'nombre', 'area', 'tipo_servicio', 'estatus_display']
    list_filter = ['area', 'tipo_servicio']
    search_fields = ['numero_pr', 'numero_po', 'numero_sr', 'no_item', 'nombre']
    readonly_fields = ['creado_en', 'modificado_en']

    def estatus_display(self, obj):
        return obj.estatus
    estatus_display.short_description = 'Estatus'