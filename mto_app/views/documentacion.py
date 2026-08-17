from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.exceptions import ValidationError
from django.db.models import Count, Max

from ..models import CategoriaDocumento, Documento


def _permisos_documentacion(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    es_admin = request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin)
    return {
        'puede_ver':      es_admin or (acceso and acceso.ver_documentacion),
        'puede_editar':   es_admin or (acceso and acceso.editar_documentacion),
        'puede_eliminar': es_admin or (acceso and acceso.eliminar_documentacion),
    }


@login_required
def documentos_generales(request):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_ver']:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    categorias = CategoriaDocumento.objects.annotate(
        total_documentos=Count('documentos'),
        ultima_actualizacion=Max('documentos__subido_en'),
    ).order_by('codigo')

    return render(request, 'mto_app/documentacion/lista_documentos.html', {
        'categorias':     categorias,
        'puede_editar':   permisos['puede_editar'],
        'puede_eliminar': permisos['puede_eliminar'],
    })


@login_required
def categoria_detalle(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_ver']:
        messages.error(request, "No tienes permiso para ver esta sección.")
        return redirect('mto:dashboard')

    categoria = get_object_or_404(CategoriaDocumento, pk=pk)
    documentos = categoria.documentos.select_related('subido_por').all()

    return render(request, 'mto_app/documentacion/categoria_detalle.html', {
        'categoria':      categoria,
        'documentos':     documentos,
        'puede_editar':   permisos['puede_editar'],
        'puede_eliminar': permisos['puede_eliminar'],
    })


@login_required
@require_POST
def crear_categoria_documento(request):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, "No tienes permiso para crear categorías.")
        return redirect('mto:documentos_generales')

    codigo = request.POST.get('codigo', '').strip()
    nombre = request.POST.get('nombre', '').strip()
    if not codigo or not nombre:
        messages.error(request, "El código y el nombre son obligatorios.")
        return redirect('mto:documentos_generales')

    if CategoriaDocumento.objects.filter(codigo__iexact=codigo).exists():
        messages.error(request, f"Ya existe una categoría con el código '{codigo}'.")
        return redirect('mto:documentos_generales')

    if CategoriaDocumento.objects.filter(nombre__iexact=nombre).exists():
        messages.error(request, f"Ya existe una categoría llamada '{nombre}'.")
        return redirect('mto:documentos_generales')

    CategoriaDocumento.objects.create(codigo=codigo, nombre=nombre, creado_por=request.user)
    messages.success(request, "Categoría creada.")
    return redirect('mto:documentos_generales')


@login_required
@require_POST
def eliminar_categoria_documento(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_eliminar']:
        messages.error(request, "No tienes permiso para eliminar categorías.")
        return redirect('mto:documentos_generales')

    categoria = get_object_or_404(CategoriaDocumento, pk=pk)
    nombre = categoria.nombre
    categoria.delete()
    messages.success(request, f"Categoría '{nombre}' y sus documentos eliminados.")
    return redirect('mto:documentos_generales')


@login_required
@require_POST
def subir_documento(request, categoria_id):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, "No tienes permiso para subir documentos.")
        return redirect('mto:documentos_generales')

    categoria = get_object_or_404(CategoriaDocumento, pk=categoria_id)
    archivo = request.FILES.get('archivo')
    nombre = request.POST.get('nombre', '').strip()
    descripcion = request.POST.get('descripcion', '').strip()

    if not archivo or not nombre:
        messages.error(request, "Debes indicar un nombre y seleccionar un archivo.")
        return redirect('mto:categoria_detalle', pk=categoria_id)

    documento = Documento(
        categoria=categoria,
        nombre=nombre,
        descripcion=descripcion,
        archivo=archivo,
        subido_por=request.user,
    )
    try:
        documento.full_clean()
        documento.save()
        messages.success(request, "Documento subido correctamente.")
    except ValidationError as e:
        messages.error(request, " ".join(sum(e.message_dict.values(), [])) if hasattr(e, 'message_dict') else str(e))

    return redirect('mto:categoria_detalle', pk=categoria_id)


@login_required
@require_POST
def eliminar_documento(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_eliminar']:
        messages.error(request, "No tienes permiso para eliminar documentos.")
        return redirect('mto:documentos_generales')

    documento = get_object_or_404(Documento, pk=pk)
    categoria_id = documento.categoria_id
    documento.delete()
    messages.success(request, "Documento eliminado.")
    return redirect('mto:categoria_detalle', pk=categoria_id)
