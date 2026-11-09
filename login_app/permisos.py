from functools import wraps
from django.shortcuts import redirect
from django.contrib import messages
from django.utils.translation import gettext as _
from menu_app.avisos import aviso


def get_perfil(user):
    try:
        return user.perfil
    except Exception:
        return None


def puede_mto(user, campo):
    """True si el usuario tiene acceso a `campo` de AccesoMto (mto_app),
    o si es superusuario / administrador (ambos con acceso total implícito).
    `campo` es el nombre del BooleanField en AccesoMto (p.ej. 'ver_inventario')."""
    if user.is_superuser:
        return True
    perfil = get_perfil(user)
    if perfil and perfil.es_admin:
        return True
    acceso = getattr(user, 'acceso_mto', None)
    return bool(acceso and acceso.activo and getattr(acceso, campo, False))   # acceso desactivado = sin permisos


def permiso_requerido(campo):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)
            perfil = get_perfil(request.user)
            if perfil is None:
                messages.error(request, aviso(_("Usuario sin perfil"), _("Contacta al administrador")))
                return redirect('paros:lista_paros')
            if perfil.es_admin or getattr(perfil, campo, False):
                return view_func(request, *args, **kwargs)
            messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para realizar esta acción")))
            return redirect('paros:lista_paros')
        return wrapper
    return decorator


def solo_admin(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.user.is_superuser:
            return view_func(request, *args, **kwargs)
        perfil = get_perfil(request.user)
        if perfil and perfil.es_admin:
            return view_func(request, *args, **kwargs)
        messages.error(request, aviso(_("Sin permiso"), _("Solo los administradores pueden entrar aquí")))
        return redirect('paros:lista_paros')
    return wrapper
