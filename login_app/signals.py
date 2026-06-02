from django.db.models.signals import post_save
from django.contrib.auth.models import User
from django.dispatch import receiver
from .models import PerfilUsuario


@receiver(post_save, sender=User)
def crear_perfil_usuario(sender, instance, created, **kwargs):
    if created:
        perfil = PerfilUsuario.objects.get_or_create(user=instance)[0]
        # Superusuarios obtienen acceso admin automáticamente
        if instance.is_superuser:
            perfil.es_admin = True
            perfil.ver_paros = True
            perfil.crear_paro = True
            perfil.editar_paro = True
            perfil.eliminar_paro = True
            perfil.ver_catalogo_fallas = True
            perfil.ver_catalogo_equipos = True
            perfil.ver_catalogo_responsables = True
            perfil.importar_fallas = True
            perfil.importar_equipos = True
            perfil.importar_responsables = True
            perfil.save()
