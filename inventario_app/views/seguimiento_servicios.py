from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext as _
from menu_app.avisos import aviso
from django.views.decorators.http import require_POST

from mto_app.models import Area
from ..models import TipoServicio, ServicioCatalogo, SeguimientoServicio
from .seguimiento_refacciones import ORDEN_ESTATUS, _sin_acentos, _rango_creado, _preparar, _sin_pagina
import openpyxl
from paros_app.views.utils import _excel_response, _estilo_cabecera


# Columnas que el usuario puede ocultar (Servicio y Acciones son fijas). Mismo orden que la tabla.
COLUMNAS = ('cantidad', 'motivo', 'avance', 'estatus', 'comentarios')


def _redirect_lista_seguimientos_servicio(request, area_fallback=''):
    """Vuelve a la lista de seguimientos de servicios conservando filtros y página.
    Usa el querystring capturado en el input oculto 'volver' (se llena en JS
    con window.location.search al abrir el modal); si no viene, cae al
    comportamiento previo de solo filtrar por área."""
    base = reverse('inventario:lista_seguimientos_servicio')
    volver = request.POST.get('volver', '').strip()
    if volver.startswith('?'):
        return redirect(f"{base}{volver}")
    return redirect(f"{base}?area={area_fallback}")


def _puede(request, permiso):
    acceso = getattr(request.user, 'acceso_mto', None)
    return bool(
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and getattr(acceso, permiso))
    )


def _color_tipo(tipo_id):
    """Color del chip de tipo: misma paleta que el botón de área (.as-c0 … .as-c5)."""
    return (tipo_id or 0) % 6


# Color de texto de .as-c0 … .as-c5 (base_menu.html), para el punto del FilterSelect
COLORES_TIPO = ('#0E7A4C', '#2C44A8', '#8A5A08', '#6B3FA0', '#A8322A', '#5E6175')


def _servicio_json(servicio, abiertas=0):
    return {
        'id': servicio.pk, 'no_item': servicio.no_item, 'nombre': servicio.nombre,
        'tipo': servicio.tipo_servicio.nombre, 'tipo_id': servicio.tipo_servicio_id,
        'color': _color_tipo(servicio.tipo_servicio_id), 'abiertas': abiertas,
    }


def _filtrar_seguimientos(request):
    """Área + buscador + tipo + fecha de registro (sin el filtro de estatus: las tarjetas
    cuentan sobre este resultado). Lo usan la lista y el Excel."""
    area_id = request.GET.get('area', '')
    q = request.GET.get('q', '').strip()
    tipo = request.GET.get('tipo', '')
    tipo = tipo if tipo.isdigit() else ''
    clave, desde, hasta, etiqueta = _rango_creado(request)

    qs = SeguimientoServicio.objects.select_related('area', 'tipo_servicio')
    if area_id:
        qs = qs.filter(area_id=area_id)
    if tipo:
        qs = qs.filter(tipo_servicio_id=tipo)
    if desde:
        qs = qs.filter(creado_en__date__gte=desde)
    if hasta:
        qs = qs.filter(creado_en__date__lte=hasta)
    lista = list(qs)

    # Buscador: No. item, servicio, motivo, PR, PO y SR, sin mayúsculas ni acentos
    if q:
        nq = _sin_acentos(q)
        lista = [s for s in lista if nq in _sin_acentos(' '.join((
            s.no_item, s.nombre, s.motivo_servicio, s.numero_pr, s.numero_po, s.numero_sr)))]
    return lista, {'area': area_id, 'q': q, 'tipo': tipo, 'creado': clave,
                   'desde': desde, 'hasta': hasta, 'creado_label': etiqueta}


def _preparar_servicio(s, hoy):
    _preparar(s, hoy)
    # Pendiente de recibir: días desde la PO (si no tiene fecha, desde la PR o el registro)
    s.dias_po = (hoy - (s.fecha_po or s.fecha_pr or timezone.localdate(s.creado_en))).days
    s.color_tipo = _color_tipo(s.tipo_servicio_id)


@login_required
def lista_seguimientos_servicio(request):
    if not _puede(request, 'ver_seguimiento_servicio'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        return redirect('mto:dashboard')

    lista, filtros = _filtrar_seguimientos(request)
    hoy = timezone.localdate()
    for s in lista:
        _preparar_servicio(s, hoy)

    totales = {e: sum(1 for s in lista if s.estatus == e) for e in ORDEN_ESTATUS}
    total = len(lista)

    filtro_estatus = request.GET.get('estatus', '')
    if filtro_estatus in ORDEN_ESTATUS:
        lista = [s for s in lista if s.estatus == filtro_estatus]
    else:
        filtro_estatus = ''
    # Sin orden de compra → pendiente de recibir → recibido; en cada grupo, la PR más vieja primero
    lista.sort(key=lambda s: (ORDEN_ESTATUS[s.estatus], -s.dias))

    # Sin ?per_page= se usa la última elección (cookie de page_size_toggle.js).
    per_page = request.GET.get('per_page') or request.COOKIES.get('pst_pageSize_segServicios', '25')
    per_page = per_page if per_page in ('10', '25', '50') else '25'
    paginator = Paginator(lista, int(per_page))
    pagina = paginator.get_page(request.GET.get('page', 1))

    # Datos del modal "Editar seguimiento" (json_script), solo de la página visible
    ids = {s.servicio_id for s in pagina if s.servicio_id}
    abiertas = dict(SeguimientoServicio.objects.filter(servicio_id__in=ids, numero_sr='')
                    .values_list('servicio_id').annotate(n=Count('id')))
    servicios = {c.pk: c for c in ServicioCatalogo.objects.filter(pk__in=ids).select_related('tipo_servicio')}
    editor = {}
    for s in pagina:
        cat = servicios.get(s.servicio_id)
        editor[s.pk] = {
            'pk': s.pk, 'cantidad': s.cantidad, 'motivo': s.motivo_servicio, 'comentarios': s.comentarios,
            'area': s.area_id,
            'numero_pr': s.numero_pr, 'fecha_pr': s.fecha_pr.isoformat() if s.fecha_pr else '',
            'numero_po': s.numero_po, 'fecha_po': s.fecha_po.isoformat() if s.fecha_po else '',
            'numero_sr': s.numero_sr, 'fecha_sr': s.fecha_sr.isoformat() if s.fecha_sr else '',
            'url_guardar': reverse('inventario:editar_seguimiento_servicio', args=[s.pk]),
            'url_eliminar': reverse('inventario:eliminar_seguimiento_servicio', args=[s.pk]),
            # PR abiertas del servicio sin contar este seguimiento
            'servicio': _servicio_json(cat, abiertas.get(cat.pk, 0) - (0 if s.numero_sr else 1)) if cat else None,
        }

    # Catálogo completo para el modal "Catálogo de servicios" (n = seguimientos que lo usan)
    catalogo = [
        {**_servicio_json(c), 'n': c.n}
        for c in ServicioCatalogo.objects.select_related('tipo_servicio').annotate(n=Count('seguimientos'))
    ]
    tipos = [{'id': t.pk, 'nombre': t.nombre, 'color': _color_tipo(t.pk)} for t in TipoServicio.objects.all()]

    area_nombre = ''
    if filtros['area']:
        area_nombre = Area.objects.filter(pk=filtros['area']).values_list('nombre', flat=True).first() or ''

    ctx = {
        'seguimientos':        pagina,
        'filtro_area':         filtros['area'],
        'area_nombre':         area_nombre,
        'areas':               Area.objects.filter(activa=True),
        'filtro_q':            filtros['q'],
        'filtro_tipo':         filtros['tipo'],
        'tipo_label':          next((t['nombre'] for t in tipos if str(t['id']) == filtros['tipo']), ''),
        'tipos':               tipos,
        'tipos_filtro':        [{'value': str(t['id']), 'label': t['nombre'], 'color': COLORES_TIPO[t['color']]} for t in tipos],
        'filtro_estatus':      filtro_estatus,
        'filtro_creado':       filtros['creado'],
        'filtro_desde':        filtros['desde'].isoformat() if filtros['desde'] else '',
        'filtro_hasta':        filtros['hasta'].isoformat() if filtros['hasta'] else '',
        'creado_label':        filtros['creado_label'],
        'total_seguimientos':  total,
        'total_rojo':          totales['rojo'],
        'total_amarillo':      totales['amarillo'],
        'total_verde':         totales['verde'],
        'per_page':            per_page,
        'perpage_opts':        [10, 25, 50],
        'paginas':             list(paginator.get_elided_page_range(pagina.number, on_each_side=1, on_ends=1)),
        'paginas_elipsis':     paginator.ELLIPSIS,
        'qs_pag':              _sin_pagina(request),
        'editor_seguimientos': editor,
        'catalogo_servicios':  catalogo,
        'puede_editar_seg_servicio':   _puede(request, 'editar_seguimiento_servicio'),
        'puede_eliminar_seg_servicio': _puede(request, 'eliminar_seguimiento_servicio'),
    }
    return render(request, 'inventario_app/lista_seguimientos_servicio.html', ctx)


def _guardar_seguimiento_ajax(request, seguimiento):
    """Escritorio (modal "Nuevo / Editar seguimiento de servicio"): valida y guarda; responde
    JSON con los errores por campo. No. item, nombre y tipo se copian del catálogo. Un
    duplicado (mismo servicio y PR) se avisa con 409 y se guarda solo con confirmar=1."""
    P = request.POST
    errores = {}
    hoy = timezone.localdate()

    sid = P.get('servicio', '')
    servicio = ServicioCatalogo.objects.select_related('tipo_servicio').filter(pk=sid).first() if sid.isdigit() else None
    if not servicio:
        errores['servicio'] = _("Elige un servicio del catálogo.")

    if seguimiento:
        area = seguimiento.area
    else:
        aid = P.get('area', '')
        area = Area.objects.filter(pk=aid).first() if aid.isdigit() else None
        if not area:
            errores['area'] = _("Elige un área.")

    try:
        cantidad = int(P.get('cantidad', '').strip())
        if cantidad <= 0:
            raise ValueError
    except ValueError:
        cantidad = None
        errores['cantidad'] = _("Escribe una cantidad entera mayor que 0.")

    motivo = P.get('motivo_servicio', '').strip()
    if not motivo:
        errores['motivo_servicio'] = _("El motivo es obligatorio.")
    elif len(motivo) > 200:
        errores['motivo_servicio'] = _("Máximo {n} caracteres.").format(n=200)
    comentarios = P.get('comentarios', '').strip()
    if len(comentarios) > 300:
        errores['comentarios'] = _("Máximo {n} caracteres.").format(n=300)

    numeros, fechas = {}, {}
    for k in ('pr', 'po', 'sr'):
        numeros[k] = P.get('numero_' + k, '').strip()
        if len(numeros[k]) > 50:
            errores['numero_' + k] = _("Máximo {n} caracteres.").format(n=50)
        texto = P.get('fecha_' + k, '').strip()
        fechas[k] = parse_date(texto) if texto else None
        if texto and not fechas[k]:
            errores['fecha_' + k] = _("Fecha no válida.")
        elif fechas[k] and fechas[k] > hoy:
            errores['fecha_' + k] = _("La fecha no puede ser futura.")

    if not numeros['pr']:
        errores['numero_pr'] = _("El No. de PR es obligatorio.")
    if not fechas['pr'] and 'fecha_pr' not in errores:
        errores['fecha_pr'] = _("La fecha de la PR es obligatoria.")
    if numeros['sr'] and not numeros['po']:
        errores['numero_sr'] = _("Primero registra la PO.")
    if fechas['po'] and not numeros['po']:
        errores.setdefault('numero_po', _("Escribe el No. de PO."))
    if fechas['sr'] and not numeros['sr']:
        errores.setdefault('numero_sr', _("Escribe el No. de SR."))
    if fechas['pr'] and fechas['po'] and fechas['po'] < fechas['pr']:
        errores.setdefault('fecha_po', _("La fecha de la PO no puede ser anterior a la de la PR."))
    if fechas['po'] and fechas['sr'] and fechas['sr'] < fechas['po']:
        errores.setdefault('fecha_sr', _("La fecha del SR no puede ser anterior a la de la PO."))

    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)

    # Al editar solo se avisa si cambió el servicio o la PR (si no, ya se confirmó antes)
    misma = seguimiento and seguimiento.servicio_id == servicio.pk and seguimiento.numero_pr.lower() == numeros['pr'].lower()
    if P.get('confirmar') != '1' and not misma:
        repetido = SeguimientoServicio.objects.filter(servicio=servicio, numero_pr__iexact=numeros['pr'])
        if seguimiento:
            repetido = repetido.exclude(pk=seguimiento.pk)
        if repetido.exists():
            return JsonResponse({'ok': False, 'aviso': _("Ya existe un seguimiento de este servicio con la PR {pr}.").format(pr=numeros['pr'])}, status=409)

    datos = {
        'area': area, 'servicio': servicio,
        'no_item': servicio.no_item, 'nombre': servicio.nombre, 'tipo_servicio': servicio.tipo_servicio,
        'cantidad': cantidad, 'motivo_servicio': motivo, 'comentarios': comentarios,
        'numero_pr': numeros['pr'], 'fecha_pr': fechas['pr'],
        'numero_po': numeros['po'], 'fecha_po': fechas['po'] if numeros['po'] else None,
        'numero_sr': numeros['sr'], 'fecha_sr': fechas['sr'] if numeros['sr'] else None,
    }
    if seguimiento:
        for k, v in datos.items():
            setattr(seguimiento, k, v)
        seguimiento.save()
    else:
        seguimiento = SeguimientoServicio.objects.create(**datos)
    return JsonResponse({'ok': True, 'pk': seguimiento.pk})


@login_required
def guardar_seguimiento_servicio(request, pk=None):
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not _puede(request, 'editar_seguimiento_servicio'):
        if es_ajax:
            return JsonResponse({'ok': False, 'errores': {'general': _("No tienes permiso para editar seguimientos de servicios.")}}, status=403)
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para editar seguimientos de servicios")))
        return redirect('inventario:lista_seguimientos_servicio')

    seguimiento = get_object_or_404(SeguimientoServicio, pk=pk) if pk else None

    # Escritorio: el modal nuevo guarda por AJAX.
    if request.method == 'POST' and es_ajax:
        return _guardar_seguimiento_ajax(request, seguimiento)

    if request.method == 'POST':
        try:
            area_obj = get_object_or_404(Area, pk=request.POST.get('area'))
            tipo_obj = get_object_or_404(TipoServicio, pk=request.POST.get('tipo_servicio'))

            no_item         = request.POST.get('no_item', '').strip()
            nombre          = request.POST.get('nombre', '').strip()
            cantidad        = request.POST.get('cantidad', '').strip()
            motivo_servicio = request.POST.get('motivo_servicio', '').strip()
            numero_pr       = request.POST.get('numero_pr', '').strip()

            if not all([no_item, nombre, cantidad, motivo_servicio, numero_pr]):
                raise ValueError(_("No. Item, Nombre, Cantidad, Motivo y No. PR son obligatorios."))

            datos = {
                'area':            area_obj,
                'no_item':         no_item,
                'nombre':          nombre,
                'cantidad':        int(cantidad),
                'motivo_servicio': motivo_servicio,
                'tipo_servicio':   tipo_obj,
                'numero_pr':       numero_pr,
                'fecha_pr':        request.POST.get('fecha_pr') or None,
                'numero_po':       request.POST.get('numero_po', '').strip(),
                'fecha_po':        request.POST.get('fecha_po') or None,
                'numero_sr':       request.POST.get('numero_sr', '').strip(),
                'fecha_sr':        request.POST.get('fecha_sr') or None,
                'comentarios':     request.POST.get('comentarios', '').strip(),
            }

            if seguimiento:
                for k, v in datos.items():
                    setattr(seguimiento, k, v)
                seguimiento.save()
                messages.success(request, aviso(_("Seguimiento actualizado")))
            else:
                SeguimientoServicio.objects.create(**datos)
                messages.success(request, aviso(_("Seguimiento creado")))

            return _redirect_lista_seguimientos_servicio(request, area_obj.pk)

        except ValueError as e:
            messages.error(request, aviso(_("No se pudo guardar el seguimiento"), str(e).rstrip(".")))
        except Exception as e:
            messages.error(request, aviso(_("No se pudo guardar el seguimiento"), str(e)))

    area_id = request.POST.get('area', '') or request.GET.get('area', '')
    return _redirect_lista_seguimientos_servicio(request, area_id)


@login_required
def eliminar_seguimiento_servicio(request, pk):
    if not _puede(request, 'eliminar_seguimiento_servicio'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar seguimientos de servicios")))
        return redirect('inventario:lista_seguimientos_servicio')

    seguimiento = get_object_or_404(SeguimientoServicio, pk=pk)
    area_id = seguimiento.area_id
    if request.method == 'POST':
        seguimiento.delete()
        messages.success(request, aviso(_("Seguimiento eliminado")))
    return _redirect_lista_seguimientos_servicio(request, area_id)


@login_required
def exportar_seguimientos_servicio(request):
    if not _puede(request, 'ver_seguimiento_servicio'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para exportar")))
        return redirect('inventario:lista_seguimientos_servicio')

    # Mismos filtros que la lista (buscador, tipo, fecha de registro y tarjeta de estatus)
    lista, _filtros = _filtrar_seguimientos(request)
    filtro_estatus = request.GET.get('estatus', '')
    if filtro_estatus in ORDEN_ESTATUS:
        lista = [s for s in lista if s.estatus == filtro_estatus]
    hoy = timezone.localdate()
    for s in lista:
        _preparar_servicio(s, hoy)
    lista.sort(key=lambda s: (ORDEN_ESTATUS[s.estatus], -s.dias))

    # Solo las columnas visibles (?ocultas=motivo,comentarios… lo arma el JS con el menú Columnas)
    ocultas = set(request.GET.get('ocultas', '').split(',')) & set(COLUMNAS)
    fecha = lambda f: f.strftime('%d/%m/%Y') if f else ''
    ESTATUS_L = {'rojo': _("Sin orden de compra"), 'amarillo': _("Pendiente de recibir"), 'verde': _("Recibido")}
    partes = [   # (columna o None si siempre va, [(cabecera, ancho, valor)])
        (None, [('No. Item', 12, lambda s: s.no_item), ('Servicio', 34, lambda s: s.nombre),
                ('Tipo de servicio', 20, lambda s: s.tipo_servicio.nombre), ('Área', 18, lambda s: s.area.nombre)]),
        ('cantidad', [('Cantidad', 10, lambda s: s.cantidad)]),
        ('motivo', [('Motivo', 40, lambda s: s.motivo_servicio)]),
        ('avance', [('No. PR', 16, lambda s: s.numero_pr), ('Fecha PR', 12, lambda s: fecha(s.fecha_pr)),
                    ('No. PO', 16, lambda s: s.numero_po), ('Fecha PO', 12, lambda s: fecha(s.fecha_po)),
                    ('No. SR', 16, lambda s: s.numero_sr), ('Fecha SR', 12, lambda s: fecha(s.fecha_sr))]),
        ('estatus', [('Estatus', 20, lambda s: ESTATUS_L.get(s.estatus, s.estatus))]),
        ('comentarios', [('Comentarios', 40, lambda s: s.comentarios)]),
    ]
    cols = [c for col, grupo in partes if col not in ocultas for c in grupo]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Seguimiento Servicios'
    _estilo_cabecera(ws, [c[0] for c in cols], [c[1] for c in cols])
    for s in lista:
        ws.append([c[2](s) for c in cols])

    response = _excel_response('Seguimiento_Servicios.xlsx')
    wb.save(response)
    return response


# ═══ Catálogo de servicios (modal "Catálogo" y búsqueda del modal de seguimiento) ═══

@login_required
def buscar_servicios_catalogo(request):
    """Búsqueda del modal de seguimiento: por No. item o nombre, sin acentos. Devuelve hasta 15."""
    if not _puede(request, 'ver_seguimiento_servicio'):
        return JsonResponse([], safe=False, status=403)
    q = _sin_acentos(request.GET.get('q', '').strip())
    servicios = ServicioCatalogo.objects.select_related('tipo_servicio').annotate(
        abiertas=Count('seguimientos', filter=Q(seguimientos__numero_sr='')))
    resultados = [_servicio_json(s, s.abiertas) for s in servicios
                  if not q or q in _sin_acentos(s.no_item + ' ' + s.nombre)][:15]
    return JsonResponse(resultados, safe=False)


def _validar_servicio(request, servicio=None):
    """Datos del formulario del catálogo → (no_item, nombre, tipo, errores)."""
    P = request.POST
    errores = {}
    no_item = P.get('no_item', '').strip()
    nombre = P.get('nombre', '').strip()
    tid = P.get('tipo', '')
    tipo = TipoServicio.objects.filter(pk=tid).first() if tid.isdigit() else None
    if not no_item:
        errores['no_item'] = _("El No. item es obligatorio.")
    elif len(no_item) > 10:
        errores['no_item'] = _("Máximo {n} caracteres.").format(n=10)
    if not nombre:
        errores['nombre'] = _("El nombre es obligatorio.")
    elif len(nombre) > 100:
        errores['nombre'] = _("Máximo {n} caracteres.").format(n=100)
    if not tipo:
        errores['tipo'] = _("Elige el tipo de servicio.")
    return no_item, nombre, tipo, errores


@login_required
@require_POST
def crear_servicio_catalogo(request):
    if not _puede(request, 'editar_seguimiento_servicio'):
        return JsonResponse({'ok': False, 'errores': {'general': _("No tienes permiso para editar el catálogo de servicios.")}}, status=403)
    no_item, nombre, tipo, errores = _validar_servicio(request)
    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)
    s = ServicioCatalogo.objects.create(no_item=no_item, nombre=nombre, tipo_servicio=tipo)
    return JsonResponse({'ok': True, 'servicio': {**_servicio_json(s), 'n': 0}})


@login_required
@require_POST
def editar_servicio_catalogo(request, pk):
    """Edita el servicio y actualiza la copia (No. item, nombre, tipo) de sus seguimientos."""
    if not _puede(request, 'editar_seguimiento_servicio'):
        return JsonResponse({'ok': False, 'errores': {'general': _("No tienes permiso para editar el catálogo de servicios.")}}, status=403)
    s = get_object_or_404(ServicioCatalogo, pk=pk)
    no_item, nombre, tipo, errores = _validar_servicio(request, s)
    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)
    with transaction.atomic():
        s.no_item, s.nombre, s.tipo_servicio = no_item, nombre, tipo
        s.save()
        s.seguimientos.update(no_item=no_item, nombre=nombre, tipo_servicio=tipo)
    return JsonResponse({'ok': True, 'servicio': {**_servicio_json(s), 'n': s.seguimientos.count()}})


@login_required
@require_POST
def eliminar_servicio_catalogo(request, pk):
    """Solo se borra si ningún seguimiento lo usa."""
    if not _puede(request, 'editar_seguimiento_servicio'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar el catálogo de servicios.")}, status=403)
    s = get_object_or_404(ServicioCatalogo, pk=pk)
    if s.seguimientos.exists():
        return JsonResponse({'ok': False, 'error': _("Tiene seguimientos registrados")}, status=400)
    s.delete()
    return JsonResponse({'ok': True})
