from collections import defaultdict

from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.exceptions import ValidationError
from django.http import Http404
from django.utils.translation import gettext as _

from ..models import Carpeta, Documento, MAX_PROFUNDIDAD_CARPETAS


def _carpetas_para_mover():
    """Lista plana {id, nombre, codigo, parentId} de TODAS las carpetas, para
    poblar el selector de destino de "Mover a…" en el cliente (necesita ver
    todo el árbol, no solo lo que está renderizado en la página actual)."""
    return [
        {'id': c.pk, 'nombre': c.nombre, 'codigo': c.codigo, 'parentId': c.parent_id}
        for c in Carpeta.objects.order_by('nombre')
    ]


def _altura_subarbol(carpeta_id, hijos_de):
    """Niveles por debajo de carpeta_id en su propio subárbol (0 si no tiene
    hijos) — usado para validar que mover una carpeta no exceda el tope de
    profundidad en su nueva ubicación."""
    hijos = hijos_de.get(carpeta_id, [])
    if not hijos:
        return 0
    return 1 + max(_altura_subarbol(hijo.pk, hijos_de) for hijo in hijos)


def _permisos_documentacion(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    es_admin = request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin)
    return {
        'puede_ver':      es_admin or (acceso and acceso.ver_documentacion),
        'puede_editar':   es_admin or (acceso and acceso.editar_documentacion),
        'puede_eliminar': es_admin or (acceso and acceso.eliminar_documentacion),
    }


def _construir_arbol_carpetas():
    """Carga TODA la jerarquía de carpetas + documentos en memoria (son pocas
    filas, esto evita necesitar SQL recursivo para conteos/anidamiento hasta
    MAX_PROFUNDIDAD_CARPETAS niveles). Devuelve (por_id, hijos_de) — hijos_de
    está indexado por parent_id (None = raíces)."""
    carpetas = list(Carpeta.objects.select_related('creado_por').all())
    documentos = list(Documento.objects.select_related('subido_por').order_by('nombre'))

    hijos_de = defaultdict(list)
    docs_de = defaultdict(list)
    for c in carpetas:
        hijos_de[c.parent_id].append(c)
    for d in documentos:
        docs_de[d.carpeta_id].append(d)
    for lista in hijos_de.values():
        lista.sort(key=lambda c: c.nombre)

    cache_total = {}

    def total_recursivo(carpeta_id):
        if carpeta_id not in cache_total:
            cache_total[carpeta_id] = len(docs_de.get(carpeta_id, [])) + sum(
                total_recursivo(hijo.pk) for hijo in hijos_de.get(carpeta_id, [])
            )
        return cache_total[carpeta_id]

    cache_ultima = {}

    def ultima_actualizacion_recursiva(carpeta_id):
        if carpeta_id not in cache_ultima:
            fechas = [d.subido_en for d in docs_de.get(carpeta_id, [])]
            fechas += [
                ultima_actualizacion_recursiva(hijo.pk) for hijo in hijos_de.get(carpeta_id, [])
            ]
            fechas = [f for f in fechas if f is not None]
            cache_ultima[carpeta_id] = max(fechas) if fechas else None
        return cache_ultima[carpeta_id]

    por_id = {}
    for c in carpetas:
        c.hijos_precargados = hijos_de.get(c.pk, [])
        c.documentos_directos = docs_de.get(c.pk, [])
        c.total_documentos_recursivo = total_recursivo(c.pk)
        c.total_subcarpetas = len(c.hijos_precargados)
        c.ultima_actualizacion = ultima_actualizacion_recursiva(c.pk)
        por_id[c.pk] = c

    return por_id, hijos_de


@login_required
def documentos_generales(request):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_ver']:
        messages.error(request, _("No tienes permiso para ver esta sección."))
        return redirect('mto:dashboard')

    por_id, hijos_de = _construir_arbol_carpetas()
    categorias = hijos_de.get(None, [])
    total_archivos_general = sum(c.total_documentos_recursivo for c in categorias)

    return render(request, 'mto_app/documentacion/lista_documentos.html', {
        'categorias':             categorias,
        'total_archivos_general': total_archivos_general,
        'carpetas_json':          _carpetas_para_mover(),
        'puede_editar':           permisos['puede_editar'],
        'puede_eliminar':         permisos['puede_eliminar'],
    })


@login_required
def carpeta_detalle(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_ver']:
        messages.error(request, _("No tienes permiso para ver esta sección."))
        return redirect('mto:dashboard')

    por_id, hijos_de = _construir_arbol_carpetas()
    carpeta = por_id.get(int(pk))
    if carpeta is None:
        raise Http404

    return render(request, 'mto_app/documentacion/carpeta_detalle.html', {
        'carpeta':                    carpeta,
        'ancestros':                  carpeta.ruta_ancestros(),
        'subcarpetas':                carpeta.hijos_precargados,
        'documentos':                 carpeta.documentos_directos,
        'total_documentos_carpeta':   carpeta.total_documentos_recursivo,
        'total_subcarpetas':          carpeta.total_subcarpetas,
        'puede_crear_subcarpeta':     carpeta.nivel + 1 < MAX_PROFUNDIDAD_CARPETAS,
        'carpetas_json':              _carpetas_para_mover(),
        'puede_editar':               permisos['puede_editar'],
        'puede_eliminar':             permisos['puede_eliminar'],
    })


@login_required
@require_POST
def crear_carpeta(request, parent_id=None):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, _("No tienes permiso para crear carpetas."))
        return redirect('mto:documentos_generales')

    parent = None
    if parent_id is not None:
        parent = get_object_or_404(Carpeta, pk=parent_id)
        if parent.nivel + 1 >= MAX_PROFUNDIDAD_CARPETAS:
            messages.error(request, _("Se alcanzó el máximo de {n} niveles de carpetas.").format(n=MAX_PROFUNDIDAD_CARPETAS))
            return redirect('mto:carpeta_detalle', pk=parent_id)

    def _volver():
        if parent_id is not None:
            return redirect('mto:carpeta_detalle', pk=parent_id)
        return redirect('mto:documentos_generales')

    codigo = request.POST.get('codigo', '').strip()
    nombre = request.POST.get('nombre', '').strip()

    if parent is None and (not codigo or not nombre):
        messages.error(request, _("El código y el nombre son obligatorios."))
        return _volver()
    if not nombre:
        messages.error(request, _("El nombre es obligatorio."))
        return _volver()

    if Carpeta.objects.filter(parent=parent, nombre__iexact=nombre).exists():
        messages.error(request, _("Ya existe una carpeta llamada '{nombre}' en este nivel.").format(nombre=nombre))
        return _volver()

    if codigo and Carpeta.objects.filter(parent=parent, codigo__iexact=codigo).exists():
        messages.error(request, _("Ya existe una carpeta con el código '{codigo}' en este nivel.").format(codigo=codigo))
        return _volver()

    Carpeta.objects.create(parent=parent, codigo=codigo, nombre=nombre, creado_por=request.user)
    messages.success(request, _("Carpeta creada."))
    return _volver()


@login_required
@require_POST
def editar_carpeta(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, _("No tienes permiso para editar carpetas."))
        return redirect('mto:documentos_generales')

    carpeta = get_object_or_404(Carpeta, pk=pk)

    def _volver():
        return redirect('mto:carpeta_detalle', pk=pk) if carpeta.parent_id else redirect('mto:documentos_generales')

    codigo = request.POST.get('codigo', '').strip()
    nombre = request.POST.get('nombre', '').strip()

    if carpeta.parent_id is None and (not codigo or not nombre):
        messages.error(request, _("El código y el nombre son obligatorios."))
        return _volver()
    if not nombre:
        messages.error(request, _("El nombre es obligatorio."))
        return _volver()

    if Carpeta.objects.filter(parent=carpeta.parent, nombre__iexact=nombre).exclude(pk=pk).exists():
        messages.error(request, _("Ya existe una carpeta llamada '{nombre}' en este nivel.").format(nombre=nombre))
        return _volver()

    if codigo and Carpeta.objects.filter(parent=carpeta.parent, codigo__iexact=codigo).exclude(pk=pk).exists():
        messages.error(request, _("Ya existe una carpeta con el código '{codigo}' en este nivel.").format(codigo=codigo))
        return _volver()

    carpeta.codigo = codigo
    carpeta.nombre = nombre
    carpeta.save()
    messages.success(request, _("Carpeta actualizada."))
    return _volver()


@login_required
@require_POST
def eliminar_carpeta(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_eliminar']:
        messages.error(request, _("No tienes permiso para eliminar carpetas."))
        return redirect('mto:documentos_generales')

    carpeta = get_object_or_404(Carpeta, pk=pk)
    parent_id = carpeta.parent_id
    nombre = carpeta.nombre
    carpeta.delete()
    messages.success(request, _("Carpeta '{nombre}' y su contenido eliminados.").format(nombre=nombre))
    if parent_id:
        return redirect('mto:carpeta_detalle', pk=parent_id)
    return redirect('mto:documentos_generales')


@login_required
@require_POST
def subir_documento(request, carpeta_id):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, _("No tienes permiso para subir documentos."))
        return redirect('mto:documentos_generales')

    carpeta = get_object_or_404(Carpeta, pk=carpeta_id)

    def _volver():
        return redirect('mto:carpeta_detalle', pk=carpeta_id)

    archivo = request.FILES.get('archivo')
    nombre = request.POST.get('nombre', '').strip()
    descripcion = request.POST.get('descripcion', '').strip()

    if not archivo or not nombre:
        messages.error(request, _("Debes indicar un nombre y seleccionar un archivo."))
        return _volver()

    documento = Documento(
        carpeta=carpeta,
        nombre=nombre,
        descripcion=descripcion,
        archivo=archivo,
        subido_por=request.user,
    )
    try:
        documento.full_clean()
        documento.save()
        messages.success(request, _("Documento subido correctamente."))
    except ValidationError as e:
        messages.error(request, " ".join(sum(e.message_dict.values(), [])) if hasattr(e, 'message_dict') else str(e))

    return _volver()


@login_required
@require_POST
def eliminar_documento(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_eliminar']:
        messages.error(request, _("No tienes permiso para eliminar documentos."))
        return redirect('mto:documentos_generales')

    documento = get_object_or_404(Documento, pk=pk)
    carpeta_id = documento.carpeta_id
    documento.delete()
    messages.success(request, _("Documento eliminado."))
    return redirect('mto:carpeta_detalle', pk=carpeta_id)


def _redirect_volver(request, alternativa):
    volver = request.POST.get('volver', '').strip()
    return redirect(volver) if volver else alternativa


@login_required
@require_POST
def mover_carpeta(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, _("No tienes permiso para mover carpetas."))
        return redirect('mto:documentos_generales')

    carpeta = get_object_or_404(Carpeta, pk=pk)
    destino_id = request.POST.get('destino_id', '').strip()
    destino = get_object_or_404(Carpeta, pk=destino_id) if destino_id else None

    def _volver():
        return _redirect_volver(
            request,
            redirect('mto:carpeta_detalle', pk=carpeta.parent_id) if carpeta.parent_id else redirect('mto:documentos_generales'),
        )

    if destino is not None and destino.pk == carpeta.pk:
        messages.error(request, _("No puedes mover una carpeta dentro de sí misma."))
        return _volver()

    if destino is not None and carpeta in destino.ruta_ancestros():
        messages.error(request, _("No puedes mover una carpeta dentro de una de sus propias subcarpetas."))
        return _volver()

    por_id, hijos_de = _construir_arbol_carpetas()
    nueva_profundidad_raiz = (destino.nivel + 1) if destino else 0
    altura = _altura_subarbol(carpeta.pk, hijos_de)
    if nueva_profundidad_raiz + altura >= MAX_PROFUNDIDAD_CARPETAS:
        messages.error(request, _("Mover la carpeta ahí superaría el máximo de {n} niveles.").format(n=MAX_PROFUNDIDAD_CARPETAS))
        return _volver()

    if Carpeta.objects.filter(parent=destino, nombre__iexact=carpeta.nombre).exclude(pk=carpeta.pk).exists():
        messages.error(request, _("Ya existe una carpeta llamada '{nombre}' en el destino.").format(nombre=carpeta.nombre))
        return _volver()

    nombre = carpeta.nombre
    destino_nombre = destino.nombre if destino else _("Documentos Generales")
    carpeta.parent = destino
    carpeta.save()
    messages.success(request, _("Carpeta '{nombre}' movida a '{destino}'.").format(nombre=nombre, destino=destino_nombre))
    return _redirect_volver(
        request,
        redirect('mto:carpeta_detalle', pk=destino.pk) if destino else redirect('mto:documentos_generales'),
    )


@login_required
@require_POST
def mover_documento(request, pk):
    permisos = _permisos_documentacion(request)
    if not permisos['puede_editar']:
        messages.error(request, _("No tienes permiso para mover documentos."))
        return redirect('mto:documentos_generales')

    documento = get_object_or_404(Documento, pk=pk)
    carpeta_actual_id = documento.carpeta_id
    destino_id = request.POST.get('destino_id', '').strip()

    def _volver():
        return _redirect_volver(request, redirect('mto:carpeta_detalle', pk=carpeta_actual_id))

    if not destino_id:
        messages.error(request, _("Debes elegir una carpeta de destino."))
        return _volver()

    destino = get_object_or_404(Carpeta, pk=destino_id)
    nombre = documento.nombre
    documento.carpeta = destino
    documento.save()
    messages.success(request, _("Documento '{nombre}' movido a '{destino}'.").format(nombre=nombre, destino=destino.nombre))
    return _redirect_volver(request, redirect('mto:carpeta_detalle', pk=destino.pk))

