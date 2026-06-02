from functools import wraps
from django.shortcuts import redirect
from django.contrib import messages


def get_perfil(user):
    try:
        return user.perfil
    except Exception:
        return None


def permiso_requerido(campo):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)
            perfil = get_perfil(request.user)
            if perfil is None:
                messages.error(request, "Tu usuario no tiene perfil. Contacta al administrador.")
                return redirect('lista_paros')
            if perfil.es_admin or getattr(perfil, campo, False):
                return view_func(request, *args, **kwargs)
            messages.error(request, "No tienes permiso para realizar esta acción.")
            return redirect('lista_paros')
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
        messages.error(request, "Solo los administradores pueden acceder aquí.")
        return redirect('lista_paros')
    return wrapper
