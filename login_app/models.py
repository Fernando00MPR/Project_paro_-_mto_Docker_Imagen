from django.db import models
from django.contrib.auth.models import User


class PerfilUsuario(models.Model):
    user     = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil')
    es_admin = models.BooleanField(default=False, verbose_name="Es administrador")

    # Dashboard
    ver_dashboard = models.BooleanField(default=False, verbose_name="Ver dashboard")
    ver_analisis  = models.BooleanField(default=False, verbose_name="Ver análisis de paros")

    # Paros
    ver_todos_paros      = models.BooleanField(default=False, verbose_name="Ver todos los paros")
    crear_paro           = models.BooleanField(default=False, verbose_name="Crear paro")
    editar_comentarios   = models.BooleanField(default=False, verbose_name="Editar solo comentarios")
    editar_paro          = models.BooleanField(default=False, verbose_name="Editar paro")
    editar_eliminar_paro = models.BooleanField(default=False, verbose_name="Editar y eliminar paro")
    cambiar_estatus_paro = models.BooleanField(default=False, verbose_name="Cambiar estatus")
    exportar_paros       = models.BooleanField(default=False, verbose_name="Exportar paros")
    importar_paros       = models.BooleanField(default=False, verbose_name="Importar paros")

    # Catálogos
    ver_catalogos      = models.BooleanField(default=False, verbose_name="Ver catálogos")
    gestionar_catalogos = models.BooleanField(default=False, verbose_name="Importar y limpiar catálogos")

    # Áreas permitidas (vacío = todas)
    areas_permitidas = models.ManyToManyField(
        'paros_app.Area',
        blank=True,
        verbose_name="Áreas que puede ver",
    )
    areas_produccion = models.ManyToManyField(
        'paros_app.Area',
        blank=True,
        related_name='usuarios_produccion',
        verbose_name='Áreas de tiempo de producción'
    )

    def __str__(self):
        return f"Perfil de {self.user.username}"

    def puede_ver_area(self, area_id):
        if self.es_admin:
            return True
        areas = self.areas_permitidas.all()
        if not areas.exists():
            return False  # sin áreas asignadas = sin acceso
        return areas.filter(id=area_id).exists()

    class Meta:
        verbose_name = "Perfil de usuario"
        verbose_name_plural = "Perfiles de usuario"
