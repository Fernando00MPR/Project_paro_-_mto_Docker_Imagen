from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from django.http import JsonResponse, HttpResponse
from django.db import transaction
from django.db.models import Count, Q
from django.utils.http import url_has_allowed_host_and_scheme
from django.utils.translation import gettext as _, ngettext
from menu_app.avisos import aviso
from collections import Counter
from decimal import Decimal, InvalidOperation
from django.utils.timesince import timesince
from django.utils import timezone
import openpyxl
from paros_app.views.utils import _excel_response, _estilo_cabecera
from django.views.decorators.http import require_POST

from openpyxl import Workbook
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
import io

from mto_app.models import Area
from login_app.permisos import puede_mto, get_perfil
from ..models import Refaccion, CategoriaRefaccion, ImagenRefaccion
from paros_app.models import imagen_subida_valida


def _redirect_lista_refacciones(request, area_fallback=''):
    """Vuelve a la lista de refacciones conservando filtros y página.
    Usa el querystring capturado en el input oculto 'volver' (se llena en JS
    con window.location.search al abrir el modal); si no viene, cae al
    comportamiento previo de solo filtrar por área."""
    base = reverse('inventario:lista_refacciones')
    volver = request.POST.get('volver', '').strip()
    if volver.startswith('?'):
        return redirect(f"{base}{volver}")
    # Celular: editar desde el detalle de la refacción vuelve a ese detalle.
    if volver.startswith(base) and url_has_allowed_host_and_scheme(volver, allowed_hosts={request.get_host()}):
        return redirect(volver)
    return redirect(f"{base}?area={area_fallback}")


def _estado_stock(r):
    """Estado de stock de celular con la MISMA regla que colorea escritorio
    (bajo_minimo = stock <= mínimo): sin stock, bajo mínimo, sobre máximo o
    en rango. "Requieren reabasto" (bajo_minimo) = sin stock + bajo mínimo."""
    if r.stock_actual == 0:
        return 'sin'
    if r.bajo_minimo:
        return 'bajo'
    if r.sobre_maximo:
        return 'sobre'
    return 'ok'


def _barra_stock(r):
    """Ancho de la barra y posición de la marca del mínimo (en %), con
    escala = máx(máximo, mínimo, stock) × 1.1."""
    escala = max(r.stock_maximo, r.stock_minimo, r.stock_actual, 1) * 1.1
    r.barra_pct = round(r.stock_actual * 100 / escala, 1)
    r.min_pct = round(r.stock_minimo * 100 / escala, 1)


@login_required
def lista_refacciones(request):
    if not puede_mto(request.user, 'ver_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        return redirect('mto:dashboard')

    area_id       = request.GET.get('area', '')
    categoria_id  = request.GET.get('categoria', '')
    busqueda      = request.GET.get('q', '').strip()
    estatus_stock = request.GET.get('estatus_stock', '')
    criticidad_id = request.GET.get('criticidad', '')

    refacciones_qs = Refaccion.objects.select_related('area', 'categoria').prefetch_related('imagenes').annotate(
        num_imagenes=Count('imagenes')
    ).filter(activo=True)

    if area_id:
        refacciones_qs = refacciones_qs.filter(area_id=area_id)
    if categoria_id:
        refacciones_qs = refacciones_qs.filter(categoria_id=categoria_id)
    if criticidad_id:
        refacciones_qs = refacciones_qs.filter(criticidad=criticidad_id)
    if busqueda:
        refacciones_qs = (refacciones_qs.filter(nombre__icontains=busqueda)  |
                          refacciones_qs.filter(no_item__icontains=busqueda) |
                          refacciones_qs.filter(descripcion__icontains=busqueda))
        
    refacciones_lista = list(refacciones_qs)
    total_bajo_minimo = sum(1 for r in refacciones_lista if r.bajo_minimo)

    for r in refacciones_lista:
        r.estado_movil = _estado_stock(r)
    conteo_estados = Counter(r.estado_movil for r in refacciones_lista)

    if estatus_stock in ('bajo', 'sobre'):
        # Chips de celular (excluyentes entre sí y con "Sin stock").
        refacciones = [r for r in refacciones_lista if r.estado_movil == estatus_stock]
    elif estatus_stock == 'bajo_minimo':
        refacciones = [r for r in refacciones_lista if r.bajo_minimo]
    elif estatus_stock == 'sobre_maximo':
        refacciones = [r for r in refacciones_lista if r.sobre_maximo]
    elif estatus_stock == 'en_rango':
        refacciones = [r for r in refacciones_lista if not r.bajo_minimo and not r.sobre_maximo and r.stock_actual > 0]
    elif estatus_stock == 'sin_stock':
        refacciones = [r for r in refacciones_lista if r.stock_actual == 0]
    else:
        refacciones = refacciones_lista

    # Escritorio: por defecto, urgencia de reabasto (sin stock → bajo mínimo, el más
    # lejos de su mínimo primero → sobre máximo → en rango). ?orden=criticidad pone
    # las críticas primero (con la misma urgencia dentro de cada grupo).
    prioridad = {'sin': 0, 'bajo': 1, 'sobre': 2, 'ok': 3}
    def _urgencia(r):
        return (prioridad[r.estado_movil],
                r.stock_actual / r.stock_minimo if r.stock_minimo else 0,
                r.no_item)
    orden = request.GET.get('orden', '')
    if orden == 'criticidad':
        refacciones = sorted(refacciones, key=lambda r: (r.criticidad != 'critico',) + _urgencia(r))
    else:
        refacciones = sorted(refacciones, key=_urgencia)

    # Sin ?per_page= se usa la última elección (cookie de page_size_toggle.js).
    per_page = request.GET.get('per_page') or request.COOKIES.get('pst_pageSize_inventario', '25')
    per_page = per_page if per_page in ('10', '25', '50') else '25'
    paginator = Paginator(refacciones, int(per_page))
    page_num = request.GET.get('page', 1)
    refacciones_page = paginator.get_page(page_num)

    # Hoja de filtros (celular): "Ver {n} refacciones" pide el conteo en vivo.
    if request.GET.get('conteo') == '1':
        return JsonResponse({'n': len(refacciones)})

    editor = {}   # Escritorio: datos de cada fila para el modal "Editar refacción" (json_script)
    for r in refacciones_page:
        _barra_stock(r)
        imagenes = list(r.imagenes.all())
        r.miniatura = imagenes[0].imagen.url if imagenes else ''
        editor[r.pk] = {
            'pk': r.pk, 'no_item': r.no_item, 'nombre': r.nombre, 'area': r.area_id,
            'categoria': r.categoria_id or '', 'unidad': r.unidad, 'criticidad': r.criticidad,
            'stock_actual': r.stock_actual, 'stock_minimo': r.stock_minimo, 'stock_maximo': r.stock_maximo,
            'ubicacion': r.ubicacion, 'proveedor': r.proveedor, 'descripcion': r.descripcion,
            'costo': f"{r.costo_unitario:.2f}" if r.costo_unitario is not None else '',
            'creado': timezone.localtime(r.creado_en).strftime('%d/%m/%Y'),
            # "modificada hace 3 días"; recién guardada: "hace un momento" (no "hace 0 minutos")
            'modificado_hace': (timesince(r.modificado_en, depth=1)
                                if (timezone.now() - r.modificado_en).total_seconds() >= 60 else _("un momento")),
            'fotos': [{'id': i.pk, 'url': i.imagen.url} for i in imagenes],
            'url_guardar': reverse('inventario:editar_refaccion', args=[r.pk]),
            'url_eliminar': reverse('inventario:eliminar_refaccion', args=[r.pk]),
        }

    area_nombre = ''
    if area_id:
        area_obj = Area.objects.filter(pk=area_id).first()
        area_nombre = area_obj.nombre if area_obj else ''

    # Escritorio (28D): indicadores del área (sin los demás filtros), con las reglas
    # actuales de mínimo y máximo (bajo_minimo / sobre_maximo del modelo).
    base = Refaccion.objects.filter(activo=True)
    if area_id:
        base = base.filter(area_id=area_id)
    base = list(base.only('stock_actual', 'stock_minimo', 'stock_maximo', 'criticidad', 'categoria_id'))
    estados_area = Counter(_estado_stock(r) for r in base)
    criticas = [r for r in base if r.criticidad == 'critico']
    indicadores = {
        'total':           len(base),
        'categorias':      len({r.categoria_id for r in base if r.categoria_id}),
        'bajo':            estados_area['bajo'],
        'sin':             estados_area['sin'],
        'reabasto':        estados_area['bajo'] + estados_area['sin'],
        'criticas':        len(criticas),
        'criticas_riesgo': sum(1 for r in criticas if r.bajo_minimo),
        'sobre':           estados_area['sobre'],
    }
    categorias_filtro = [{'value': str(c.pk), 'label': c.nombre} for c in CategoriaRefaccion.objects.all()]
    criticidad_filtro = [{'value': 'critico',    'label': _("Crítico"),    'color': '#D9534F'},
                         {'value': 'no_critico', 'label': _("No crítico"), 'color': '#9A9CAE'}]

    ctx = {
        'refacciones':                       refacciones_page,
        'areas':                             Area.objects.filter(activa=True),
        'categorias':                        CategoriaRefaccion.objects.all(),
        'filtro_area':                       area_id,
        'filtro_criticidad':                 criticidad_id,
        'filtro_categoria':                  categoria_id,
        'busqueda':                          busqueda,
        'estatus_stock':                     estatus_stock,
        'per_page':                          per_page,
        'total_bajo_minimo':                 total_bajo_minimo,
        'unidades':                          Refaccion.UNIDAD_CHOICES,
        'criticidades':                      Refaccion.CRITICIDAD_CHOICES,
        'puede_editar_inventario':           puede_mto(request.user, 'editar_inventario'),
        'puede_eliminar_inventario':         puede_mto(request.user, 'eliminar_inventario'),
        'puede_eliminar_todas_refacciones' : (
            request.user.is_superuser or (get_perfil(request.user) and get_perfil(request.user).es_admin)
        ),
        'total_refacciones_area':            Refaccion.objects.filter(area_id=area_id).count() if area_id else 0,
        # Vista de celular
        'area_nombre':                       area_nombre,
        'total_lista':                       len(refacciones_lista),
        'conteo_estados':                    conteo_estados,
        'filtros_activos':                   int(bool(categoria_id)) + int(bool(criticidad_id)),
        'categorias_movil':                  _categorias_movil(),
        # Vista de escritorio
        'indicadores':                       indicadores,
        'orden':                             orden,
        'perpage_opts':                      [10, 25, 50],
        'categorias_filtro':                 categorias_filtro,
        'criticidad_filtro':                 criticidad_filtro,
        'categoria_label':                   next((c['label'] for c in categorias_filtro if c['value'] == categoria_id), ''),
        'criticidad_label':                  next((c['label'] for c in criticidad_filtro if c['value'] == criticidad_id), ''),
        # Paginación "‹ 1 … 4 5 6 … 12 ›": los enlaces conservan todos los filtros menos la página.
        'paginas':                           list(paginator.get_elided_page_range(refacciones_page.number, on_each_side=1, on_ends=1)),
        'paginas_elipsis':                   paginator.ELLIPSIS,
        'qs_pag':                            _sin_pagina(request),
        'editor_refacciones':                editor,
    }
    return render(request, 'inventario_app/lista_refacciones.html', ctx)


def _sin_pagina(request):
    """Querystring actual sin ?page= (para los enlaces de la paginación)."""
    params = request.GET.copy()
    params.pop('page', None)
    return params.urlencode()


def _categorias_movil():
    return [
        {'id': c.pk, 'es': c.nombre_es or c.nombre, 'en': c.nombre_en or '', 'n': c.n}
        for c in CategoriaRefaccion.objects.annotate(n=Count('refaccion'))
    ]


@login_required
def detalle_refaccion(request, pk):
    """Celular: detalle de una refacción (ruta propia para que el "atrás" del
    teléfono regrese a la lista). ?lista= trae los filtros de la lista."""
    if not puede_mto(request.user, 'ver_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        return redirect('mto:dashboard')

    r = get_object_or_404(Refaccion.objects.select_related('area', 'categoria').prefetch_related('imagenes'), pk=pk)
    r.estado_movil = _estado_stock(r)
    _barra_stock(r)
    imagenes = list(r.imagenes.all())
    lista_qs = request.GET.get('lista', '')
    return render(request, 'inventario_app/detalle_refaccion.html', {
        'r':                         r,
        'miniatura':                 imagenes[0].imagen.url if imagenes else '',
        'num_imagenes':              len(imagenes),
        'lista_qs':                  lista_qs,
        'url_lista':                 reverse('inventario:lista_refacciones') + ('?' + lista_qs if lista_qs else f'?area={r.area_id}'),
        # Lo que piden los modales compartidos (_modales_refacciones.html)
        'areas':                     Area.objects.filter(activa=True),
        'categorias':                CategoriaRefaccion.objects.all(),
        'unidades':                  Refaccion.UNIDAD_CHOICES,
        'criticidades':              Refaccion.CRITICIDAD_CHOICES,
        'filtro_area':               str(r.area_id),
        'puede_editar_inventario':   puede_mto(request.user, 'editar_inventario'),
        'puede_eliminar_inventario': puede_mto(request.user, 'eliminar_inventario'),
    })


@login_required
@require_POST
def ajustar_stock_refaccion(request, pk):
    """Celular, "Ajustar stock" en modo Conteo: fija el stock contado. (No hay
    historial de movimientos, así que Entrada/Salida no se ofrecen.)"""
    if not puede_mto(request.user, 'editar_inventario'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar el inventario.")}, status=403)
    r = get_object_or_404(Refaccion, pk=pk)
    try:
        stock = int(request.POST.get('stock', ''))
        if stock < 0:
            raise ValueError
    except ValueError:
        return JsonResponse({'ok': False, 'error': _("Escribe una cantidad entera de 0 o más.")}, status=400)
    r.stock_actual = stock
    r.save(update_fields=['stock_actual', 'modificado_en'])
    return JsonResponse({'ok': True, 'stock': r.stock_actual, 'estado': _estado_stock(r)})


def _guardar_refaccion_ajax(request, refaccion):
    """Escritorio (modal "Editar / Nueva refacción"): valida y guarda; responde JSON
    con los errores por campo. Fotos: 'imagenes' (nuevas) e 'imagenes_quitar' (ids)."""
    P = request.POST
    errores = {}

    def entero(campo):
        v = P.get(campo, '').strip()
        if not v:
            return 0
        try:
            n = int(v)
            if n < 0:
                raise ValueError
            return n
        except ValueError:
            errores[campo] = _("Escribe un número entero de 0 o más.")
            return 0

    nombre  = P.get('nombre', '').strip()
    no_item = P.get('no_item', '').strip()
    if not nombre:
        errores['nombre'] = _("El nombre es obligatorio.")
    elif len(nombre) > 200:
        errores['nombre'] = _("Máximo {n} caracteres.").format(n=200)
    if not no_item:
        errores['no_item'] = _("El No. item es obligatorio.")
    elif len(no_item) > 10:
        errores['no_item'] = _("Máximo {n} caracteres.").format(n=10)

    area = Area.objects.filter(pk=P.get('area')).first() if P.get('area', '').isdigit() else None
    if not area:
        errores['area'] = _("Elige un área.")

    stock_actual = entero('stock_actual')
    stock_minimo = entero('stock_minimo')
    stock_maximo = entero('stock_maximo')   # 0 = sin máximo
    if stock_maximo and stock_maximo < stock_minimo:
        errores['stock_maximo'] = _("El máximo debe ser mayor o igual al mínimo.")

    ubicacion   = P.get('ubicacion', '').strip()
    proveedor   = P.get('proveedor', '').strip()
    descripcion = P.get('descripcion', '').strip()
    if len(ubicacion) > 4:
        errores['ubicacion'] = _("Máximo {n} caracteres.").format(n=4)
    if len(proveedor) > 50:
        errores['proveedor'] = _("Máximo {n} caracteres.").format(n=50)
    if len(descripcion) > 300:
        errores['descripcion'] = _("Máximo {n} caracteres.").format(n=300)

    costo_txt = P.get('costo_unitario', '').strip().replace('$', '').replace(',', '')
    costo = None
    if costo_txt:
        try:
            costo = Decimal(costo_txt).quantize(Decimal('0.01'))
            if costo < 0 or costo >= Decimal('100000000'):
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            errores['costo_unitario'] = _("Escribe un costo válido, p. ej. 120.50.")

    criticidad = P.get('criticidad', 'no_critico')
    if criticidad not in dict(Refaccion.CRITICIDAD_CHOICES):
        criticidad = 'no_critico'
    unidad = P.get('unidad', 'pza')
    if unidad not in dict(Refaccion.UNIDAD_CHOICES):
        unidad = 'pza'
    categoria_id = P.get('categoria', '')
    categoria_id = int(categoria_id) if categoria_id.isdigit() and CategoriaRefaccion.objects.filter(pk=categoria_id).exists() else None

    if area and no_item and 'no_item' not in errores:
        repetida = Refaccion.objects.filter(area=area, no_item=no_item)
        if refaccion:
            repetida = repetida.exclude(pk=refaccion.pk)
        if repetida.exists():
            errores['no_item'] = _("Ya existe una refacción con ese No. item.")

    quitar = {int(i) for i in P.getlist('imagenes_quitar') if i.isdigit()}
    nuevas = request.FILES.getlist('imagenes')
    
    if any(f.size > 5 * 1024 * 1024 or not imagen_subida_valida(f) for f in nuevas):
        errores['imagenes'] = _("Solo fotos JPG o PNG de hasta 5 MB.")
    actuales = refaccion.imagenes.exclude(pk__in=quitar).count() if refaccion else 0
    if actuales + len(nuevas) > 2:
        errores['imagenes'] = _("Máximo 2 fotos por refacción.")

    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)

    datos = {
        'no_item': no_item, 'nombre': nombre, 'descripcion': descripcion, 'area': area,
        'criticidad': criticidad, 'categoria_id': categoria_id, 'unidad': unidad,
        'stock_actual': stock_actual, 'stock_minimo': stock_minimo, 'stock_maximo': stock_maximo,
        'ubicacion': ubicacion, 'proveedor': proveedor, 'costo_unitario': costo,
    }
    with transaction.atomic():
        if refaccion:
            for k, v in datos.items():
                setattr(refaccion, k, v)
            refaccion.save()
        else:
            refaccion = Refaccion.objects.create(activo=True, **datos)
        if quitar:
            refaccion.imagenes.filter(pk__in=quitar).delete()   # el archivo lo borra la señal post_delete
        for f in nuevas:
            ImagenRefaccion.objects.create(refaccion=refaccion, imagen=f)
    return JsonResponse({'ok': True, 'pk': refaccion.pk})


@login_required
def form_refaccion(request, pk=None):
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not puede_mto(request.user, 'editar_inventario'):
        if es_ajax:
            return JsonResponse({'ok': False, 'errores': {'general': _("No tienes permiso para editar el inventario.")}}, status=403)
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para editar el inventario")))
        return redirect('inventario:lista_refacciones')

    refaccion = get_object_or_404(Refaccion, pk=pk) if pk else None

    # Escritorio: el modal nuevo guarda por AJAX. Celular sigue con el formulario normal de abajo.
    if request.method == 'POST' and es_ajax:
        return _guardar_refaccion_ajax(request, refaccion)

    if request.method == 'POST':
        try:
            datos = {
                'no_item':        request.POST.get('no_item', '').strip(),
                'nombre':         request.POST.get('nombre', '').strip(),
                'descripcion':    request.POST.get('descripcion', '').strip(),
                'area':           get_object_or_404(Area, pk=request.POST.get('area')),
                'criticidad':     request.POST.get('criticidad', 'no_critico'),
                'categoria_id':   request.POST.get('categoria') or None,
                'unidad':         request.POST.get('unidad', 'pza'),
                'stock_actual':   int(request.POST.get('stock_actual', 0) or 0),
                'stock_minimo':   int(request.POST.get('stock_minimo', 0) or 0),
                'stock_maximo':   int(request.POST.get('stock_maximo', 0) or 0),
                'ubicacion':      request.POST.get('ubicacion', '').strip(),
                'proveedor':      request.POST.get('proveedor', '').strip(),
                'costo_unitario': request.POST.get('costo_unitario') or None,
                'activo':         'activo' in request.POST,
            }

            if not datos['no_item'] or not datos['nombre']:
                raise ValueError(_("No. Item y Nombre son obligatorios."))

            area_pk = datos['area'].pk

            if refaccion:
                for k, v in datos.items():
                    setattr(refaccion, k, v)
                refaccion.save()
                messages.success(request, aviso(_("Refacción actualizada"), refaccion.no_item))
            else:
                refaccion = Refaccion.objects.create(**datos)
                messages.success(request, aviso(_("Refacción creada"), refaccion.no_item))

            subidas = request.FILES.getlist('imagenes')
            # solo JPG o PNG reales
            imagenes_nuevas = [f for f in subidas if imagen_subida_valida(f)]
            if len(imagenes_nuevas) < len(subidas):
                messages.warning(request, 
                                 aviso(_("Archivos ignorados"), ngettext("{n} archivo no es una foto JPG o PNG", "{n} archivos no son fotos JPG o PNG",
                                                                 len(subidas) - len(imagenes_nuevas)).format(n=len(subidas) - len(imagenes_nuevas))))
            existentes      = refaccion.imagenes.count()
            disponibles     = 2 - existentes

            if imagenes_nuevas and disponibles <= 0:
                messages.warning(request, aviso(_("No se agregaron fotos"), _("Ya tiene 2, el máximo")))
            else:
                for imagen in imagenes_nuevas[:max(disponibles, 0)]:
                    ImagenRefaccion.objects.create(refaccion=refaccion, imagen=imagen)
                if len(imagenes_nuevas) > disponibles:
                    messages.warning(request, aviso(ngettext("Solo se guardó {n} foto", "Solo se guardaron {n} fotos", max(disponibles, 0)).format(n=max(disponibles, 0)),
                                                    _("Se alcanzó el máximo de 2")))

            return _redirect_lista_refacciones(request, area_pk)

        except ValueError as e:
            messages.error(request, aviso(_("No se pudo guardar la refacción"), str(e).rstrip(".")))
        except Exception as e:
            messages.error(request, aviso(_("No se pudo guardar la refacción"), str(e)))

        area_id = request.POST.get('area', '')
        return _redirect_lista_refacciones(request, area_id)

    return redirect('inventario:lista_refacciones')


@login_required
def eliminar_refaccion(request, pk):
    if not puede_mto(request.user, 'eliminar_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar refacciones")))
        return redirect('inventario:lista_refacciones')

    refaccion = get_object_or_404(Refaccion, pk=pk)
    if request.method == 'POST':
        cantidad_seguimientos = refaccion.seguimientos.count()
        if cantidad_seguimientos > 0:
            messages.error(request, aviso(
                _("No se eliminó {item}").format(item=refaccion.no_item),
                ngettext("Tiene {n} seguimiento de compra; elimínalo primero",
                         "Tiene {n} seguimientos de compra; elimínalos primero", cantidad_seguimientos).format(n=cantidad_seguimientos)))
        else:
            area_id = refaccion.area_id
            refaccion.delete()
            messages.success(request, aviso(_("Refacción eliminada"), refaccion.no_item))
            return _redirect_lista_refacciones(request, area_id)
    return _redirect_lista_refacciones(request, refaccion.area_id)


@login_required
def eliminar_todas_refacciones_area(request):
    es_admin_total = (
        request.user.is_superuser or (get_perfil(request.user) and get_perfil(request.user).es_admin)
    )
    if not es_admin_total:
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar todas las refacciones del área")))
        return redirect('inventario:lista_refacciones')

    area_id = request.POST.get('area')
    if request.method == 'POST' and area_id:
        area = get_object_or_404(Area, pk=area_id)
        refacciones_area = Refaccion.objects.filter(area=area)
        total = refacciones_area.count()
        eliminables = refacciones_area.exclude(seguimientos__isnull=False)
        cantidad = eliminables.count()
        bloqueadas = total - cantidad
        eliminables.delete()

        if bloqueadas:
            messages.warning(request, aviso(
                ngettext("{n} refacción no se eliminó", "{n} refacciones no se eliminaron", bloqueadas).format(n=bloqueadas),
                _("Tienen seguimientos de compra")))
        messages.success(request, aviso(
            _("Refacciones eliminadas"),
            ngettext("{n} de {area}", "{n} de {area}", cantidad).format(n=cantidad, area=area.nombre)))
    return redirect(f"{reverse('inventario:lista_refacciones')}?area={area_id}")


@login_required
@require_POST
def crear_categoria_refaccion(request):
    # La hoja de Categorías de celular guarda en segundo plano: responde JSON.
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not puede_mto(request.user, 'editar_inventario'):
        if es_ajax:
            return JsonResponse({'ok': False, 'error': _("No tienes permiso para gestionar categorías.")}, status=403)
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para gestionar categorías")))
        return redirect('inventario:lista_refacciones')

    nombre_es = request.POST.get('nombre_es', '').strip()
    nombre_en = request.POST.get('nombre_en', '').strip()
    area_id = request.POST.get('area', '')

    if not nombre_es:
        error = _("El nombre en español es obligatorio.")
        if es_ajax:
            return JsonResponse({'ok': False, 'error': error}, status=400)
        messages.error(request, aviso(_("No se guardó la categoría"), error.rstrip(".")))
    else:
        nombre_en = nombre_en or nombre_es
        existe = CategoriaRefaccion.objects.filter(
            Q(nombre_es__iexact=nombre_es) | Q(nombre_en__iexact=nombre_es) |
            Q(nombre_es__iexact=nombre_en) | Q(nombre_en__iexact=nombre_en)
        ).exists()
        if existe:
            error = _("Ya existe una categoría llamada '{nombre}'.").format(nombre=nombre_es)
            if es_ajax:
                return JsonResponse({'ok': False, 'error': error}, status=400)
            messages.error(request, aviso(_("No se guardó la categoría"), error.rstrip(".")))
        else:
            cat = CategoriaRefaccion.objects.create(nombre_es=nombre_es, nombre_en=nombre_en)
            if es_ajax:
                return JsonResponse({'ok': True, 'id': cat.pk, 'es': cat.nombre_es, 'en': cat.nombre_en})
            messages.success(request, aviso(_("Categoría creada"), nombre_es))

    return _redirect_lista_refacciones(request, area_id)


@login_required
@require_POST
def editar_categoria_refaccion(request, pk):
    # La hoja de Categorías de celular guarda en segundo plano: responde JSON.
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not puede_mto(request.user, 'editar_inventario'):
        if es_ajax:
            return JsonResponse({'ok': False, 'error': _("No tienes permiso para gestionar categorías.")}, status=403)
    if not puede_mto(request.user, 'editar_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para gestionar categorías")))
        return redirect('inventario:lista_refacciones')

    categoria = get_object_or_404(CategoriaRefaccion, pk=pk)
    nombre_es = request.POST.get('nombre_es', '').strip()
    nombre_en = request.POST.get('nombre_en', '').strip()
    area_id = request.POST.get('area', '')

    if not nombre_es:
        error = _("El nombre en español es obligatorio.")
        if es_ajax:
            return JsonResponse({'ok': False, 'error': error}, status=400)
        messages.error(request, aviso(_("No se guardó la categoría"), error.rstrip(".")))
    else:
        nombre_en = nombre_en or nombre_es
        existe = CategoriaRefaccion.objects.exclude(pk=categoria.pk).filter(
            Q(nombre_es__iexact=nombre_es) | Q(nombre_en__iexact=nombre_es) |
            Q(nombre_es__iexact=nombre_en) | Q(nombre_en__iexact=nombre_en)
        ).exists()
        if existe:
            error = _("Ya existe otra categoría llamada '{nombre}'.").format(nombre=nombre_es)
            if es_ajax:
                return JsonResponse({'ok': False, 'error': error}, status=400)
            messages.error(request, aviso(_("No se guardó la categoría"), error.rstrip(".")))
        else:
            # Sin update_fields: modeltranslation sincroniza 'nombre' (idioma por
            # defecto) al guardar y con update_fields esa columna se quedaría fuera.
            categoria.nombre_es = nombre_es
            categoria.nombre_en = nombre_en
            categoria.save()
            if es_ajax:
                return JsonResponse({'ok': True, 'id': categoria.pk, 'es': categoria.nombre_es, 'en': categoria.nombre_en})
            messages.success(request, aviso(_("Categoría actualizada"), nombre_es))

    return _redirect_lista_refacciones(request, area_id)   


@login_required
@require_POST
def eliminar_categoria_refaccion(request, pk):
    # Modal de Categorías de escritorio: responde JSON. Solo se borra si nadie la usa.
    if not puede_mto(request.user, 'editar_inventario'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para gestionar categorías.")}, status=403)

    categoria = get_object_or_404(CategoriaRefaccion, pk=pk)
    if categoria.refaccion_set.exists():
        return JsonResponse({'ok': False, 'error': _("Tiene refacciones asignadas")}, status=400)
    categoria.delete()
    return JsonResponse({'ok': True})


@login_required
@require_POST
def subir_imagenes_refaccion(request, refaccion_pk):
    if not puede_mto(request.user, 'editar_inventario'):
        return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    refaccion = get_object_or_404(Refaccion, pk=refaccion_pk)
    imagenes  = request.FILES.getlist('imagenes')
    
    if not all(imagen_subida_valida(f) for f in imagenes):
        return JsonResponse({'ok': False, 'error': _("Solo fotos JPG o PNG de hasta 5 MB.")}, status=400)
    
    existentes  = refaccion.imagenes.count()
    disponibles = 2 - existentes

    creadas = []
    for imagen in imagenes[:max(disponibles, 0)]:
        img = ImagenRefaccion.objects.create(refaccion=refaccion, imagen=imagen)
        creadas.append({'id': img.id, 'url': img.imagen.url})

    return JsonResponse({'ok': True, 'imagenes': creadas, 'total': refaccion.imagenes.count()})


@login_required
def imagenes_refaccion(request, refaccion_pk):
    refaccion = get_object_or_404(Refaccion, pk=refaccion_pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in refaccion.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_POST
def eliminar_imagen_refaccion(request, imagen_id):
    if not puede_mto(request.user, 'editar_inventario'):
        return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    imagen = get_object_or_404(ImagenRefaccion, id=imagen_id)
    imagen.imagen.delete()
    imagen.delete()
    return JsonResponse({'ok': True})


@login_required
def buscar_refacciones(request):
    q = request.GET.get('q', '').strip()
    area_id = request.GET.get('area', '')

    qs = Refaccion.objects.filter(activo=True)
    if area_id:
        qs = qs.filter(area_id=area_id)
    if q:
        qs = (qs.filter(no_item__icontains=q) | qs.filter(nombre__icontains=q))

    # Stock, foto y PR abiertas: la tarjeta de la refacción del modal de Seguimiento
    qs = qs.annotate(abiertas=Count('seguimientos', filter=Q(seguimientos__numero_sr=''))).prefetch_related('imagenes')
    resultados = []
    for r in qs[:15]:
        img = next(iter(r.imagenes.all()), None)
        resultados.append({
            'id' :       r.id,
            'no_item':   r.no_item,
            'nombre':    r.nombre,
            'unidad':    r.unidad,
            'ubicacion': r.ubicacion,
            'stock':     r.stock_actual,
            'minimo':    r.stock_minimo,
            'foto':      img.imagen.url if img else '',
            'abiertas':  r.abiertas,
        })
    return JsonResponse(resultados, safe=False)


@login_required
def importar_stock(request):
    if not puede_mto(request.user, 'editar_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para importar inventario")))
        return redirect('inventario:lista_refacciones')

    area_id = request.GET.get('area', '') or request.POST.get('area', '')

    if request.method == 'POST':
        archivo = request.FILES.get('archivo')
        area_id = request.POST.get('area', '').strip()

        if not archivo or not area_id:
            messages.error(request, aviso(_("Faltan datos"), _("Elige un área y sube un archivo")))
            return redirect(f"{reverse('inventario:importar_stock')}?area={area_id}")

        try:
            area = get_object_or_404(Area, pk=area_id)
            wb = load_workbook(archivo, data_only=True)
            ws = wb.active

            actualizados = 0
            ignorados = 0

            refacciones_dict = {r.no_item: r for r in Refaccion.objects.filter(area=area)}
            a_actualizar = []
            
            for row in ws.iter_rows(min_row=2, values_only=True):
                no_item = row[0]
                stock_actual = row[2]

                if no_item is None or stock_actual is None:
                    continue

                no_item = str(no_item).strip()
                if not no_item:
                    continue

                try:
                    # Acepta int, float o string numérico; siempre lo convierte a entero
                    stock_actual = int(float(str(stock_actual).strip()))
                except (ValueError, TypeError):
                    ignorados += 1
                    continue

                # Ubicación es opcional: si viene vacía, se conserva la que ya tenía la refacción.
                ubicacion = row[3] if len(row) > 3 and row[3] not in (None, '') else None
                if ubicacion is not None:
                    ubicacion = str(ubicacion).strip()[:4]

                refaccion = refacciones_dict.get(no_item)
                if refaccion:
                    refaccion.stock_actual = stock_actual
                    if ubicacion is not None:
                        refaccion.ubicacion = ubicacion
                    a_actualizar.append(refaccion)
                    actualizados += 1
                else:
                    ignorados += 1
            if a_actualizar:
                Refaccion.objects.bulk_update(a_actualizar, ['stock_actual', 'ubicacion'])

            messages.success(request, aviso(_("Stock importado"), _("{actualizados} actualizadas · {ignorados} ignoradas").format(
                actualizados=actualizados, ignorados=ignorados,
            )))
            return redirect(f"{reverse('inventario:lista_refacciones')}?area={area.pk}")

        except Exception as e:
            messages.error(request, aviso(_("No se pudo leer el archivo"), str(e)))
            return redirect(f"{reverse('inventario:importar_stock')}?area={area_id}")

    ctx = {
        'areas': Area.objects.filter(activa=True),
        'area_id': area_id,
    }
    return render(request, 'inventario_app/importar_stock.html', ctx)


@login_required
def descargar_plantilla_stock(request):
    wb = Workbook()
    ws = wb.active
    ws.title = "Stock"

    headers = ['No. Item', 'Nombre', 'Stock actual', 'Ubicación']
    ws.append(headers)
    ws.append(['001', 'Rodamiento 6205', 12, 'A12'])

    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        cell.alignment = Alignment(horizontal='center', vertical='center')

    anchos = [16, 36, 16, 16]
    for i, ancho in enumerate(anchos, 1):
        ws.column_dimensions[get_column_letter(i)].width = ancho

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="Plantilla_Stock.xlsx"'
    return response


_UNIDAD_LABEL_A_CODIGO = {str(label).strip().lower(): codigo for codigo, label in Refaccion.UNIDAD_CHOICES}
_UNIDAD_CODIGOS = {codigo for codigo, label in Refaccion.UNIDAD_CHOICES}


@login_required
def importar_completo(request):
    if not puede_mto(request.user, 'editar_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para importar inventario")))
        return redirect('inventario:lista_refacciones')

    area_id = request.GET.get('area', '') or request.POST.get('area', '')

    if request.method == 'POST':
        archivo = request.FILES.get('archivo')
        area_id = request.POST.get('area', '').strip()

        if not archivo or not area_id:
            messages.error(request, aviso(_("Faltan datos"), _("Elige un área y sube un archivo")))
            return redirect(f"{reverse('inventario:importar_completo')}?area={area_id}")

        try:
            area = get_object_or_404(Area, pk=area_id)
            wb = load_workbook(archivo, data_only=True)
            ws = wb.active

            categorias_dict = {}
            for c in CategoriaRefaccion.objects.all():
                for nombre_variante in (getattr(c, 'nombre_es', None), getattr(c, 'nombre_en', None), c.nombre):
                    if nombre_variante:
                        categorias_dict.setdefault(str(nombre_variante).strip().lower(), c)

            # Una sola lectura de las refacciones existentes del área — evita 1 query por fila.
            refacciones_existentes = {r.no_item: r for r in Refaccion.objects.filter(area=area)}
            nuevos_dict = {}
            ids_actualizados = set()
            errores = []

            for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                if row is None or not any(c not in (None, '') for c in row):
                    continue

                no_item = str(row[0]).strip() if len(row) > 0 and row[0] not in (None, '') else ''
                if not no_item:
                    continue

                nombre = str(row[1]).strip() if len(row) > 1 and row[1] not in (None, '') else ''
                if not nombre:
                    errores.append(_("Fila {fila}: falta el nombre, se omitió.").format(fila=i))
                    continue

                descripcion = str(row[2]).strip() if len(row) > 2 and row[2] not in (None, '') else ''

                categoria = None
                cat_txt = str(row[3]).strip() if len(row) > 3 and row[3] not in (None, '') else ''
                if cat_txt:
                    categoria = categorias_dict.get(cat_txt.lower())
                    if categoria is None:
                        errores.append(_("Fila {fila}: categoría '{cat}' no encontrada, se dejó sin categoría.").format(fila=i, cat=cat_txt))

                unidad_txt = str(row[4]).strip() if len(row) > 4 and row[4] not in (None, '') else ''
                unidad = 'pza'
                if unidad_txt:
                    low = unidad_txt.lower()
                    if low in _UNIDAD_CODIGOS:
                        unidad = low
                    elif low in _UNIDAD_LABEL_A_CODIGO:
                        unidad = _UNIDAD_LABEL_A_CODIGO[low]
                    else:
                        errores.append(_("Fila {fila}: unidad '{unidad}' no reconocida, se usó 'Pieza'.").format(fila=i, unidad=unidad_txt))

                try:
                    stock_actual = int(float(row[5])) if len(row) > 5 and row[5] not in (None, '') else 0
                    stock_minimo = int(float(row[6])) if len(row) > 6 and row[6] not in (None, '') else 0
                    stock_maximo = int(float(row[7])) if len(row) > 7 and row[7] not in (None, '') else 0
                except (ValueError, TypeError):
                    errores.append(_("Fila {fila}: stock inválido, se omitió.").format(fila=i))
                    continue

                ubicacion = str(row[8]).strip() if len(row) > 8 and row[8] not in (None, '') else ''
                if len(ubicacion) > 4:
                    errores.append(_("Fila {fila}: la ubicación '{ubi}' supera 4 caracteres, se recortó.").format(fila=i,ubi=ubicacion))
                    ubicacion = ubicacion[:4]

                proveedor = str(row[9]).strip() if len(row) > 9 and row[9] not in (None, '') else ''
                if len(proveedor) > 50:
                    proveedor = proveedor[:50]

                costo_unitario = None
                if len(row) > 10 and row[10] not in (None, ''):
                    try:
                        costo_unitario = float(row[10])
                    except (ValueError, TypeError):
                        errores.append(_("Fila {fila}: costo unitario inválido, se dejó vacío.").format(fila=i))

                if no_item in refacciones_existentes:
                    obj = refacciones_existentes[no_item]
                    ids_actualizados.add(no_item)
                elif no_item in nuevos_dict:
                    obj = nuevos_dict[no_item]
                else:
                    obj = Refaccion(no_item=no_item, area=area)
                    nuevos_dict[no_item] = obj

                obj.nombre         = nombre
                obj.descripcion    = descripcion
                obj.categoria      = categoria
                obj.unidad         = unidad
                obj.stock_actual   = stock_actual
                obj.stock_minimo   = stock_minimo
                obj.stock_maximo   = stock_maximo
                obj.ubicacion      = ubicacion
                obj.proveedor      = proveedor
                obj.costo_unitario = costo_unitario

            with transaction.atomic():
                if ids_actualizados:
                    Refaccion.objects.bulk_update(
                        [refacciones_existentes[n] for n in ids_actualizados],
                        ['nombre', 'descripcion', 'categoria', 'unidad',
                         'stock_actual', 'stock_minimo', 'stock_maximo',
                         'ubicacion', 'proveedor', 'costo_unitario']
                    )
                if nuevos_dict:
                    Refaccion.objects.bulk_create(list(nuevos_dict.values()))

            creados      = len(nuevos_dict)
            actualizados = len(ids_actualizados)

            messages.success(request, aviso(_("Inventario importado"),
                                            _("{creados} creadas · {actualizados} actualizadas").format(creados=creados, actualizados=actualizados)))
            if errores:   # un solo aviso (antes salía uno por fila, hasta 15): el número y las primeras
                messages.warning(request, aviso(
                    ngettext("{n} fila con advertencia", "{n} filas con advertencias", len(errores)).format(n=len(errores)),
                    " · ".join(str(e) for e in errores[:2])))

            return redirect(f"{reverse('inventario:lista_refacciones')}?area={area.pk}")

        except Exception as e:
            messages.error(request, aviso(_("No se pudo leer el archivo"), str(e)))
            return redirect(f"{reverse('inventario:importar_completo')}?area={area_id}")

    ctx = {
        'areas': Area.objects.filter(activa=True),
        'area_id': area_id,
    }
    return render(request, 'inventario_app/importar_completo.html', ctx)


@login_required
def descargar_plantilla_completa(request):
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventario"

    headers = ['No. Item', 'Nombre', 'Descripción', 'Categoría', 'Unidad',
               'Stock actual', 'Stock mínimo', 'Stock máximo', 'Ubicación', 'Proveedor', 'Costo unitario']
    ws.append(headers)
    ws.append(['001', 'Rodamiento 6205', 'Rodamiento de bolas blindado', 'Rodamientos', 'Pieza', 12, 5, 50, 'A12', 'Proveedor S.A.', 45.50])

    for cell in ws[1]:
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = PatternFill(fill_type='solid', fgColor='4F46E5')
        cell.alignment = Alignment(horizontal='center', vertical='center')

    anchos = [12, 30, 36, 20, 12, 12, 12, 12, 12, 20, 14]
    for i, ancho in enumerate(anchos, 1):
        ws.column_dimensions[get_column_letter(i)].width = ancho

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    response = HttpResponse(
        buffer,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = 'attachment; filename="Plantilla_Inventario_Completo.xlsx"'
    return response


@login_required
def exportar_refacciones(request):
    if not puede_mto(request.user, 'ver_inventario'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para exportar")))
        return redirect('inventario:lista_refacciones')

    area_id       = request.GET.get('area', '')
    categoria_id  = request.GET.get('categoria', '')
    busqueda      = request.GET.get('q', '').strip()
    estatus_stock = request.GET.get('estatus_stock', '')

    refacciones_qs = Refaccion.objects.select_related('area', 'categoria').filter(activo=True)
    if area_id:
        refacciones_qs = refacciones_qs.filter(area_id=area_id)
    if categoria_id:
        refacciones_qs = refacciones_qs.filter(categoria_id=categoria_id)
    if busqueda:
        refacciones_qs = (refacciones_qs.filter(nombre__icontains=busqueda)  |
                          refacciones_qs.filter(no_item__icontains=busqueda) |
                          refacciones_qs.filter(descripcion__icontains=busqueda))

    refacciones_lista = list(refacciones_qs)
    if estatus_stock == 'bajo_minimo':
        refacciones_lista = [r for r in refacciones_lista if r.bajo_minimo]
    elif estatus_stock == 'sobre_maximo':
        refacciones_lista = [r for r in refacciones_lista if r.sobre_maximo]
    elif estatus_stock == 'en_rango':
        refacciones_lista = [r for r in refacciones_lista if not r.bajo_minimo and not r.sobre_maximo and r.stock_actual > 0]
    elif estatus_stock == 'sin_stock':
        refacciones_lista = [r for r in refacciones_lista if r.stock_actual == 0]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Inventario'
    cabeceras = ['No. Item', 'Nombre', 'Descripción', 'Categoría', 'Área', 'Unidad',
                 'Stock actual', 'Stock mínimo', 'Stock máximo', 'Ubicación', 'Proveedor', 'Costo unitario']
    _estilo_cabecera(ws, cabeceras, [12, 30, 40, 20, 18, 10, 12, 12, 12, 12, 20, 14])

    for r in refacciones_lista:
        ws.append([
            r.no_item,
            r.nombre,
            r.descripcion,
            r.categoria.nombre if r.categoria else '',
            r.area.nombre,
            r.get_unidad_display(),
            r.stock_actual,
            r.stock_minimo,
            r.stock_maximo,
            r.ubicacion,
            r.proveedor,
            float(r.costo_unitario) if r.costo_unitario is not None else '',
        ])

    response = _excel_response('Inventario.xlsx')
    wb.save(response)
    return response