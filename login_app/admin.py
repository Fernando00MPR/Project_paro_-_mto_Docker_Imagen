from django.contrib import admin
from .models import PerfilUsuario

@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('user', 'es_admin', 'ver_todos_paros', 'crear_paro', 'editar_paro', 'editar_eliminar_paro', 'ver_catalogos', 'gestionar_catalogos')
    list_filter = ('es_admin',)
