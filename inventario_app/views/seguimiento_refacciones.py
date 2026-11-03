from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.core.paginator import Paginator
from django.urls import reverse
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.formats import date_format
from django.utils.translation import gettext as _
from mto_app.models import Area
from ..models import Refaccion, SeguimientoRefaccion
from datetime import timedelta
import unicodedata
import openpyxl
from paros_app.views.utils import _excel_response, _estilo_cabecera


# Estatus calculado (SeguimientoRefaccion.estatus) → orden en la lista: primero lo más atrasado.
ORDEN_ESTATUS = {'rojo': 0, 'amarillo': 1, 'verde': 2}
# Columnas que se pueden ocultar con el menú "Columnas" (Refacción y Acciones siempre se ven).
COLUMNAS = ('cantidad', 'avance', 'estatus', 'comentarios')

def _redirect_lista_seguimientos_refaccion(request, area_fallback=''):
    """Vuelve a la lista de seguimientos de refacciones conservando filtros y página.
    Usa el querystring capturado en el input oculto 'volver' (se llena en JS
    con window.location.search al abrir el modal); si no viene, cae al
    comportamiento previo de solo filtrar por área."""
    base = reverse('inventario:lista_seguimientos_refaccion')
    volver = request.POST.get('volver', '').strip()
    if volver.startswith('?'):
        return redirect(f"{base}{volver}")
    return redirect(f"{base}?area={area_fallback}")


def _sin_acentos(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto or '') if unicodedata.category(c) != 'Mn').lower()


def _rango_creado(request):
    """Rango de "Fecha de registro": ?creado=mes|90|anio (por defecto este año) o ?desde=&hasta=.
    Devuelve (clave, desde, hasta, etiqueta)."""
    hoy = timezone.localdate()
    desde, hasta = parse_date(request.GET.get('desde', '').strip() or ''), parse_date(request.GET.get('hasta', '').strip() or '')
    if desde or hasta:
        clave = ''
    else:
        clave = request.GET.get('creado', '')
        if clave == 'mes':
            desde = hoy.replace(day=1)
        elif clave == '90':
            desde = hoy - timedelta(days=89)
        else:
            clave, desde = 'anio', hoy.replace(month=1, day=1)
        hasta = hoy
    # "1 ene – 29 oct 2026"; si cruza de año, el año va en las dos fechas
    if desde and hasta:
        ini = date_format(desde, 'j b Y' if desde.year != hasta.year else 'j b')
        etiqueta = f"{ini} – {date_format(hasta, 'j b Y')}"
    elif desde:
        etiqueta = _("Desde el {fecha}").format(fecha=date_format(desde, 'j b Y'))
    else:
        etiqueta = _("Hasta el {fecha}").format(fecha=date_format(hasta, 'j b Y'))
    return clave, desde, hasta, etiqueta


def _filtrar_seguimientos(request):
    """Área + buscador + fecha de registro (sin el filtro de estatus: las tarjetas
    cuentan sobre este resultado). Lo usan la lista y el Excel."""
    area_id = request.GET.get('area', '')
    q = request.GET.get('q', '').strip()
    clave, desde, hasta, etiqueta = _rango_creado(request)

    qs = SeguimientoRefaccion.objects.select_related('refaccion', 'refaccion__area')
    if area_id:
        qs = qs.filter(refaccion__area_id=area_id)
    if desde:
        qs = qs.filter(creado_en__date__gte=desde)
    if hasta:
        qs = qs.filter(creado_en__date__lte=hasta)
    lista = list(qs)

    # Buscador: No. item, nombre, PR, PO y SR, sin mayúsculas ni acentos
    if q:
        nq = _sin_acentos(q)
        lista = [s for s in lista if nq in _sin_acentos(' '.join((
            s.refaccion.no_item, s.refaccion.nombre, s.numero_pr, s.numero_po, s.numero_sr)))]
    return lista, {'area': area_id, 'q': q, 'creado': clave, 'desde': desde, 'hasta': hasta, 'creado_label': etiqueta}


def _preparar(s, hoy):
    """Datos de la fila: antigüedad desde la PR y estado de cada paso (hecho / sig / fut)."""
    s.sin_fecha_pr = not s.fecha_pr
    s.dias = (hoy - (s.fecha_pr or timezone.localdate(s.creado_en))).days
    s.pasos, siguiente = [], True
    for k, num, fecha in (('PR', s.numero_pr, s.fecha_pr), ('PO', s.numero_po, s.fecha_po), ('SR', s.numero_sr, s.fecha_sr)):
        if num:
            estado = 'hecho'
        elif siguiente:
            estado, siguiente = 'sig', False
        else:
            estado = 'fut'
        s.pasos.append({'k': k, 'num': num, 'fecha': fecha, 'estado': estado})


def _sin_pagina(request):
    """Querystring actual sin ?page= (para los enlaces de la paginación)."""
    params = request.GET.copy()
    params.pop('page', None)
    return params.urlencode()


def _puede(request, permiso):
    acceso = getattr(request.user, 'acceso_mto', None)
    return bool(
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and getattr(acceso, permiso))
    )


@login_required
def lista_seguimientos_refaccion(request):
    if not _puede(request, 'ver_seguimiento_refaccion'):
        messages.error(request, _("No tienes permiso para ver esta sección."))
        return redirect('mto:dashboard')

    lista, filtros = _filtrar_seguimientos(request)
    hoy = timezone.localdate()
    for s in lista:
        _preparar(s, hoy)

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
    per_page = request.GET.get('per_page') or request.COOKIES.get('pst_pageSize_segRefacciones', '25')
    per_page = per_page if per_page in ('10', '25', '50') else '25'
    paginator = Paginator(lista, int(per_page))
    pagina = paginator.get_page(request.GET.get('page', 1))

    # Datos del modal "Editar seguimiento" (json_script), solo de la página visible
    ids = {s.refaccion_id for s in pagina}
    abiertas = dict(SeguimientoRefaccion.objects.filter(refaccion_id__in=ids, numero_sr='')
                    .values_list('refaccion_id').annotate(n=Count('id')))
    fotos = {}
    for r in Refaccion.objects.filter(pk__in=ids).prefetch_related('imagenes'):
        img = next(iter(r.imagenes.all()), None)
        fotos[r.pk] = img.imagen.url if img else ''
    editor = {}
    for s in pagina:
        r = s.refaccion
        editor[s.pk] = {
            'pk': s.pk, 'cantidad': s.cantidad, 'comentarios': s.comentarios,
            'numero_pr': s.numero_pr, 'fecha_pr': s.fecha_pr.isoformat() if s.fecha_pr else '',
            'numero_po': s.numero_po, 'fecha_po': s.fecha_po.isoformat() if s.fecha_po else '',
            'numero_sr': s.numero_sr, 'fecha_sr': s.fecha_sr.isoformat() if s.fecha_sr else '',
            'url_guardar': reverse('inventario:editar_seguimiento_refaccion', args=[s.pk]),
            'url_eliminar': reverse('inventario:eliminar_seguimiento_refaccion', args=[s.pk]),
            'refaccion': {
                'id': r.pk, 'no_item': r.no_item, 'nombre': r.nombre, 'unidad': r.unidad, 'ubicacion': r.ubicacion,
                'stock': r.stock_actual, 'minimo': r.stock_minimo, 'foto': fotos.get(r.pk, ''),
                # PR abiertas de la refacción sin contar este seguimiento
                'abiertas': abiertas.get(r.pk, 0) - (0 if s.numero_sr else 1),
            },
        }

    area_nombre = ''
    if filtros['area']:
        area_nombre = Area.objects.filter(pk=filtros['area']).values_list('nombre', flat=True).first() or ''

    ctx = {
        'seguimientos':        pagina,
        'filtro_area':         filtros['area'],
        'area_nombre':         area_nombre,
        'filtro_q':            filtros['q'],
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
        'qs_export':           request.GET.urlencode(),
        'editor_seguimientos': editor,
        'puede_editar_seg_refaccion':   _puede(request, 'editar_seguimiento_refaccion'),
        'puede_eliminar_seg_refaccion': _puede(request, 'eliminar_seguimiento_refaccion'),
    }
    return render(request, 'inventario_app/lista_seguimientos.html', ctx)


def _guardar_seguimiento_ajax(request, seguimiento):
    """Escritorio (modal "Nuevo / Editar seguimiento"): valida y guarda; responde JSON con
    los errores por campo. Un duplicado (misma refacción y PR) se avisa con 409 y se
    guarda solo si vuelve con confirmar=1."""
    P = request.POST
    errores = {}
    hoy = timezone.localdate()

    rid = P.get('refaccion', '')
    refaccion = Refaccion.objects.filter(pk=rid).first() if rid.isdigit() else None
    # Solo refacciones activas del inventario (la de un seguimiento existente se respeta)
    if refaccion and not refaccion.activo and not (seguimiento and seguimiento.refaccion_id == refaccion.pk):
        refaccion = None
    if not refaccion:
        errores['refaccion'] = _("Elige una refacción del inventario.")

    try:
        cantidad = int(P.get('cantidad', '').strip())
        if cantidad <= 0:
            raise ValueError
    except ValueError:
        cantidad = None
        errores['cantidad'] = _("Escribe una cantidad entera mayor que 0.")

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

    comentarios = P.get('comentarios', '').strip()
    if len(comentarios) > 300:
        errores['comentarios'] = _("Máximo {n} caracteres.").format(n=300)

    if errores:
        return JsonResponse({'ok': False, 'errores': errores}, status=400)

    # Al editar solo se avisa si cambió la refacción o la PR (si no, ya se confirmó antes)
    misma = seguimiento and seguimiento.refaccion_id == refaccion.pk and seguimiento.numero_pr.lower() == numeros['pr'].lower()
    if P.get('confirmar') != '1' and not misma:
        repetido = SeguimientoRefaccion.objects.filter(refaccion=refaccion, numero_pr__iexact=numeros['pr'])
        if seguimiento:
            repetido = repetido.exclude(pk=seguimiento.pk)
        if repetido.exists():
            return JsonResponse({'ok': False, 'aviso': _("Ya existe un seguimiento de esta refacción con la PR {pr}.").format(pr=numeros['pr'])}, status=409)

    datos = {
        'refaccion': refaccion, 'cantidad': cantidad, 'comentarios': comentarios,
        'numero_pr': numeros['pr'], 'fecha_pr': fechas['pr'],
        'numero_po': numeros['po'], 'fecha_po': fechas['po'] if numeros['po'] else None,
        'numero_sr': numeros['sr'], 'fecha_sr': fechas['sr'] if numeros['sr'] else None,
    }
    if seguimiento:
        for k, v in datos.items():
            setattr(seguimiento, k, v)
        seguimiento.save()
    else:
        seguimiento = SeguimientoRefaccion.objects.create(**datos)
    return JsonResponse({'ok': True, 'pk': seguimiento.pk})


@login_required
def guardar_seguimiento_refaccion(request, pk=None):
    es_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    if not _puede(request, 'editar_seguimiento_refaccion'):
        if es_ajax:
            return JsonResponse({'ok': False, 'errores': {'general': _("No tienes permiso para editar seguimientos de refacciones.")}}, status=403)
        messages.error(request, _("No tienes permiso para editar seguimientos de refacciones."))
        return redirect('inventario:lista_seguimientos_refaccion')

    seguimiento = get_object_or_404(SeguimientoRefaccion, pk=pk) if pk else None

    # Escritorio: el modal nuevo guarda por AJAX.
    if request.method == 'POST' and es_ajax:
        return _guardar_seguimiento_ajax(request, seguimiento)

    if request.method == 'POST':
        try:
            refaccion = get_object_or_404(Refaccion, pk=request.POST.get('refaccion'))
            numero_pr = request.POST.get('numero_pr', '').strip()
            cantidad  = request.POST.get('cantidad', '').strip()

            if not numero_pr or not cantidad:
                raise ValueError(_("No. PR y cantidad son obligatorios."))

            datos = {
                'refaccion':   refaccion,
                'cantidad':    int(cantidad),
                'numero_pr':   numero_pr,
                'fecha_pr':    request.POST.get('fecha_pr') or None,
                'numero_po':   request.POST.get('numero_po', '').strip(),
                'fecha_po':    request.POST.get('fecha_po') or None,
                'numero_sr':   request.POST.get('numero_sr', '').strip(),
                'fecha_sr':    request.POST.get('fecha_sr') or None,
                'comentarios': request.POST.get('comentarios', '').strip(),
            }

            if seguimiento:
                for k, v in datos.items():
                    setattr(seguimiento, k, v)
                seguimiento.save()
                messages.success(request, _("Seguimiento actualizado."))
            else:
                SeguimientoRefaccion.objects.create(**datos)
                messages.success(request, _("Seguimiento creado."))

            return _redirect_lista_seguimientos_refaccion(request, refaccion.area_id)

        except ValueError as e:
            messages.error(request, str(e))
        except Exception as e:
            messages.error(request, _("Error al guardar: {error}").format(error=e))

    area_id = request.POST.get('area', '') or request.GET.get('area', '')
    return _redirect_lista_seguimientos_refaccion(request, area_id)


@login_required
def eliminar_seguimiento_refaccion(request, pk):
    if not _puede(request, 'eliminar_seguimiento_refaccion'):
        messages.error(request, _("No tienes permiso para eliminar seguimientos de refacciones."))
        return redirect('inventario:lista_seguimientos_refaccion')

    seguimiento = get_object_or_404(SeguimientoRefaccion, pk=pk)
    area_id = seguimiento.refaccion.area_id
    if request.method == 'POST':
        seguimiento.delete()
        messages.success(request, _("Seguimiento eliminado."))
    return _redirect_lista_seguimientos_refaccion(request, area_id)


@login_required
def exportar_seguimientos_refaccion(request):
    if not _puede(request, 'ver_seguimiento_refaccion'):
        messages.error(request, _("No tienes permiso para exportar."))
        return redirect('inventario:lista_seguimientos_refaccion')

    # Mismos filtros que la lista (buscador, fecha de registro y tarjeta de estatus)
    lista, _filtros = _filtrar_seguimientos(request)
    filtro_estatus = request.GET.get('estatus', '')
    if filtro_estatus in ORDEN_ESTATUS:
        lista = [s for s in lista if s.estatus == filtro_estatus]
    hoy = timezone.localdate()
    for s in lista:
        _preparar(s, hoy)
    lista.sort(key=lambda s: (ORDEN_ESTATUS[s.estatus], -s.dias))

    # Solo las columnas visibles (?ocultas=avance,comentarios… lo arma el JS con el menú Columnas)
    ocultas = set(request.GET.get('ocultas', '').split(',')) & set(COLUMNAS)
    fecha = lambda f: f.strftime('%d/%m/%Y') if f else ''
    ESTATUS_L = {'rojo': _("Sin orden de compra"), 'amarillo': _("Pendiente de recibir"), 'verde': _("Recibido")}
    partes = [   # (columna o None si siempre va, [(cabecera, ancho, valor)])
        (None, [('No. Item', 12, lambda s: s.refaccion.no_item), ('Nombre', 30, lambda s: s.refaccion.nombre),
                ('Área', 18, lambda s: s.refaccion.area.nombre)]),
        ('cantidad', [('Cantidad', 10, lambda s: s.cantidad)]),
        ('avance', [('No. PR', 14, lambda s: s.numero_pr), ('Fecha PR', 12, lambda s: fecha(s.fecha_pr)),
                    ('No. PO', 14, lambda s: s.numero_po), ('Fecha PO', 12, lambda s: fecha(s.fecha_po)),
                    ('No. SR', 14, lambda s: s.numero_sr), ('Fecha SR', 12, lambda s: fecha(s.fecha_sr))]),
        ('estatus', [('Estatus', 20, lambda s: ESTATUS_L.get(s.estatus, s.estatus))]),
        ('comentarios', [('Comentarios', 40, lambda s: s.comentarios)]),
    ]
    cols = [c for col, grupo in partes if col not in ocultas for c in grupo]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Seguimiento Refacciones'
    _estilo_cabecera(ws, [c[0] for c in cols], [c[1] for c in cols])
    for s in lista:
        ws.append([c[2](s) for c in cols])

    response = _excel_response('Seguimiento_Refacciones.xlsx')
    wb.save(response)
    return response
