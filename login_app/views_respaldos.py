"""Pantalla de respaldos de la base de datos (solo superusuario).

Solo lista y descarga: los respaldos los genera `manage.py respaldar_bd`
desde la tarea programada de Coolify.
"""
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from functools import wraps

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.translation import gettext as _

from menu_app.avisos import aviso
from paros_app.management.commands.respaldar_bd import DIR_RESPALDOS

# Solo nombres que genera el comando: evita descargar cualquier otro archivo
# del servidor con un nombre manipulado (../, rutas absolutas, etc.).
_NOMBRE_VALIDO = re.compile(r'respaldo_\d{4}_\d{2}_\d{2}_\d{4}\.dump')
_HORAS_RECIENTE = 26   # diario + margen; más que esto = la tarea no está corriendo


def _solo_superusuario(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.user.is_superuser:
            return view_func(request, *args, **kwargs)
        messages.error(request, aviso(_("Sin permiso"), _("Solo el superusuario puede ver los respaldos")))
        return redirect('paros:lista_paros')
    return wrapper


def _respaldos():
    if not DIR_RESPALDOS.is_dir():
        return []
    lista = []
    for archivo in DIR_RESPALDOS.glob('respaldo_*.dump'):
        st = archivo.stat()
        lista.append({
            'nombre': archivo.name,
            'fecha':  datetime.fromtimestamp(st.st_mtime, tz=dt_timezone.utc),
            'tamano': st.st_size,
        })
    lista.sort(key=lambda r: r['fecha'], reverse=True)
    return lista


@login_required
@_solo_superusuario
def lista_respaldos(request):
    respaldos = _respaldos()
    reciente = bool(respaldos) and timezone.now() - respaldos[0]['fecha'] < timedelta(hours=_HORAS_RECIENTE)
    return render(request, 'login_app/respaldos.html', {
        'respaldos': respaldos,
        'total':     sum(r['tamano'] for r in respaldos),
        'reciente':  reciente,
    })


@login_required
@_solo_superusuario
def descargar_respaldo(request, nombre):
    if not _NOMBRE_VALIDO.fullmatch(nombre):
        raise Http404
    ruta = DIR_RESPALDOS / nombre
    if not ruta.is_file():
        raise Http404
    return FileResponse(ruta.open('rb'), as_attachment=True, filename=nombre,
                        content_type='application/octet-stream')
