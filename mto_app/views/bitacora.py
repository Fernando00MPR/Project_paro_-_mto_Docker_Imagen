"""Bitácora de mantenimiento: lo que se hizo en un equipo, por área y fecha.
Lista con filtros y exportación; alta y edición desde el formulario de la tabla y del celular (form_bitacora,
redirige con avisos) y desde el modal de escritorio (bitacora_guardar, JSON). Las dos validan con _leer_registro.
Todo se limita a las áreas que el usuario puede ver (areas_visibles_mto: administrador y superusuario, todas)."""
import io
from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods, require_POST
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.db.models import Q
from django.core.paginator import Paginator
from django.utils.translation import gettext as _, ngettext
from django.utils.formats import date_format
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from login_app.permisos import puede_mto

from .utils import areas_visibles_mto
from menu_app.avisos import aviso
from ..models import Bitacora, Responsable, ImagenBitacora
from paros_app.models import imagen_subida_valida

MAX_IMAGENES_BITACORA = 2
MAX_BYTES_IMAGEN_BIT = 5 * 1024 * 1024


def _fecha_iso(valor):
    """date de un 'AAAA-MM-DD' (None si está vacío o no es una fecha válida)."""
    try:
        return date.fromisoformat((valor or '').strip())
    except ValueError:
        return None


def _rango_fechas(rango, desde, hasta, hoy):
    """(desde, hasta) del filtro de fecha: hoy | semana | mes | rango (personalizado) | '' (sin límite)."""
    if rango == 'hoy':
        return hoy, hoy
    if rango == 'semana':
        lunes = hoy - timedelta(days=hoy.weekday())
        return lunes, lunes + timedelta(days=6)
    if rango == 'mes':
        return hoy.replace(day=1), (hoy.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if rango == 'rango':
        return _fecha_iso(desde), _fecha_iso(hasta)
    return None, None


def _filtrar(regs, g, hoy):
    """Filtros de la lista y de la exportación (mismos parámetros de la URL): fecha exacta o rango, equipo y
    búsqueda. Una fecha inválida se ignora (antes daba error 500)."""
    fecha = _fecha_iso(g.get('fecha'))
    if fecha:
        regs = regs.filter(fecha=fecha)
    else:
        d1, d2 = _rango_fechas(g.get('rango', '').strip(), g.get('desde'), g.get('hasta'), hoy)
        if d1:
            regs = regs.filter(fecha__gte=d1)
        if d2:
            regs = regs.filter(fecha__lte=d2)
    if g.get('equipo', '').strip():
        regs = regs.filter(equipo=g['equipo'].strip())
    q = g.get('q', '').strip()
    if q:
        regs = regs.filter(Q(equipo__icontains=q) | Q(responsable__icontains=q) | Q(responsable2__icontains=q) |
                           Q(actividad_realizada__icontains=q) | Q(pendiente__icontains=q))
    return regs


def _area_filtro(request, areas):
    """El ?area= si es un área del usuario ('' si no viene o es de otra área: se ignora)."""
    area_id = request.GET.get('area', '').strip()
    return area_id if area_id.isdigit() and areas.filter(pk=area_id).exists() else ''


def _registro_o_404(request, pk):
    """El registro si es de un área del usuario; si no, 404 (como si no existiera)."""
    return get_object_or_404(Bitacora, pk=pk, area__in=areas_visibles_mto(request))


@login_required
def lista_bitacora(request):
    if not puede_mto(request.user, 'ver_bitacora'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para ver esta sección")))
        return redirect('mto:dashboard')

    areas            = areas_visibles_mto(request)
    area_id          = _area_filtro(request, areas)
    filtro_fecha     = request.GET.get('fecha', '').strip()          # fecha exacta (la sigue usando el celular)
    filtro_q         = request.GET.get('q', '').strip()
    filtro_pendiente = request.GET.get('pendiente', '').strip()
    filtro_rango     = request.GET.get('rango', '').strip()          # hoy | semana | mes | rango
    filtro_equipo    = request.GET.get('equipo', '').strip()
    filtro_orden     = request.GET.get('orden', '').strip()          # 'fecha' = de la más antigua a la más reciente
    hoy              = date.today()
    f_desde, f_hasta = _fecha_iso(request.GET.get('desde')), _fecha_iso(request.GET.get('hasta'))

    base = Bitacora.objects.select_related('area').prefetch_related('imagenes').filter(area__in=areas)
    if area_id:
        base = base.filter(area_id=area_id)
    equipos_lista = list(base.exclude(equipo='').order_by('equipo').values_list('equipo', flat=True).distinct())

    registros = _filtrar(base, request.GET, hoy)
    # Conteos de los segmentados (con los demás filtros aplicados)
    conteo_todos = registros.count()
    conteo_con_pendiente = registros.exclude(pendiente='').count()

    if filtro_pendiente == '1':
        registros = registros.exclude(pendiente='')
    elif filtro_pendiente == '0':
        registros = registros.filter(pendiente='')

    # Indicadores de arriba, sobre lo filtrado
    con_pend = registros.exclude(pendiente='')
    mas_antiguo = con_pend.order_by('fecha').values_list('fecha', flat=True).first()
    kpi = {
        'total':        registros.count(),
        'equipos':      registros.exclude(equipo='').values('equipo').distinct().count(),
        'con_pend':     con_pend.count(),
        'dias_antiguo': (hoy - mas_antiguo).days if mas_antiguo else 0,
        'ultimo':       registros.order_by('-fecha', '-creado_en').first(),
    }

    registros = registros.order_by('fecha', 'creado_en') if filtro_orden == 'fecha' else registros.order_by('-fecha', '-creado_en')

    per_page = request.GET.get('per_page', '25')
    if per_page not in ('10', '25', '50'):
        per_page = '25'
    paginator = Paginator(registros, int(per_page))
    registros_page = paginator.get_page(request.GET.get('page', 1))
    for r in registros_page:                      # datos calculados para la tabla
        r.semana = r.fecha.isocalendar()[1]
        r.dias = (hoy - r.fecha).days
        partes = r.responsable.split()
        partes2 = r.responsable2.split()
        r.iniciales2 = ((partes2[0][0] + (partes2[1][0] if len(partes2) > 1 else '')) if partes2 else '?').upper()
        r.iniciales = ((partes[0][0] + (partes[1][0] if len(partes) > 1 else '')) if partes else '?').upper()

    q_pag = request.GET.copy()
    q_pag.pop('page', None)
    n_pag, act = paginator.num_pages, registros_page.number
    paginas = []
    for n in sorted({1, n_pag, act - 1, act, act + 1} & set(range(1, n_pag + 1))):
        if paginas and n - paginas[-1] > 1:
            paginas.append(None)
        paginas.append(n)
    opciones_fecha = [{'value': 'hoy', 'label': _("Hoy")}, {'value': 'semana', 'label': _("Esta semana")},
                      {'value': 'mes', 'label': _("Este mes")}, {'value': 'rango', 'label': _("Rango personalizado")}]
    fecha_label = next((o['label'] for o in opciones_fecha if o['value'] == filtro_rango), '')

    ctx = {
        'registros':             registros_page,
        'areas':                 areas,
        'filtro_area':           area_id,
        'today':                 hoy,
        'puede_editar':          puede_mto(request.user, 'editar_bitacora'),
        'puede_eliminar':        puede_mto(request.user, 'eliminar_bitacora'),
        'filtro_fecha':          filtro_fecha,
        'filtro_q':              filtro_q,
        'filtro_pendiente':      filtro_pendiente,
        'per_page':              per_page,
        'total_registros':       paginator.count,
        'conteo_todos':          conteo_todos,
        'conteo_con_pendiente':  conteo_con_pendiente,
        'conteo_sin_pendiente':  conteo_todos - conteo_con_pendiente,
        'filtro_rango':          filtro_rango,
        'filtro_equipo':         filtro_equipo,
        'filtro_orden':          filtro_orden,
        'filtro_desde':          f_desde.isoformat() if f_desde else '',
        'filtro_hasta':          f_hasta.isoformat() if f_hasta else '',
        'equipos_opciones':      [{'value': e, 'label': e} for e in equipos_lista],
        'perpage_opts':          [10, 25, 50],
        'kpi':                   kpi,
        'hoy':                   hoy,
        'qs_pag':                q_pag.urlencode(),
        'paginas':               paginas,
        'opciones_fecha':        opciones_fecha,
        'fecha_label':           fecha_label,
    }
    return render(request, 'mto_app/bitacora/lista.html', ctx)


def _leer_registro(request, registro, completo):
    """Lee y valida el registro del POST. Reglas de los dos formularios: área del usuario, fecha válida y no futura,
    actividad, segundo responsable distinto del primero. `completo` (modal de escritorio) además pide equipo,
    responsable y, si hay pendiente, su texto, y rechaza fotos de más; el formulario de la tabla/celular guarda las
    que caben y avisa. Devuelve (datos, errores {campo: mensaje})."""
    area = areas_visibles_mto(request).filter(pk=request.POST.get('area') if str(request.POST.get('area', '')).isdigit() else 0).first()
    hay_pend = request.POST.get('hay_pendiente', 'si') == 'si'
    datos = {
        'area':                area,
        'fecha':               _fecha_iso(request.POST.get('fecha')),
        'equipo':              request.POST.get('equipo', '').strip()[:100],
        'actividad_realizada': request.POST.get('actividad_realizada', '').strip()[:300],
        'pendiente':           request.POST.get('pendiente', '').strip()[:200] if hay_pend else '',
        'responsable':         request.POST.get('responsable', '').strip()[:200],
        'responsable2':        request.POST.get('responsable2', '').strip()[:200],
    }
    errores = {}
    if not area:
        errores['area'] = _("Elige el área")
    if not datos['fecha']:
        errores['fecha'] = _("Elige la fecha")
    elif datos['fecha'] > date.today():
        errores['fecha'] = _("La fecha no puede ser futura")
    if completo and not datos['equipo']:
        errores['equipo'] = _("Elige el equipo")
    if not datos['actividad_realizada']:
        errores['actividad'] = _("Describe la actividad realizada")
    if completo and not datos['responsable']:
        errores['responsable'] = _("Elige el responsable")
    elif datos['responsable2'] and datos['responsable2'].lower() == datos['responsable'].lower():
        errores['responsable2'] = _("El segundo responsable debe ser distinto del primero")
    if completo and hay_pend and not datos['pendiente']:
        errores['pendiente'] = _("Describe lo que quedó pendiente")
    if completo:
        imagenes = request.FILES.getlist('imagenes')
        if (registro.imagenes.count() if registro else 0) + len(imagenes) > MAX_IMAGENES_BITACORA:
            errores['imagenes'] = _("Máximo {n} imágenes por registro").format(n=MAX_IMAGENES_BITACORA)
        elif any(f.size > MAX_BYTES_IMAGEN_BIT or not imagen_subida_valida(f) for f in imagenes):
            errores['imagenes'] = _("Solo imágenes JPG o PNG de hasta 5 MB")
    return datos, errores


def _guardar(registro, datos):
    if registro:
        for k, v in datos.items():
            setattr(registro, k, v)
        registro.save()
        return registro
    return Bitacora.objects.create(**datos)


@login_required
@transaction.atomic
def form_bitacora(request, pk=None):
    """Alta / edición desde el formulario de la tabla y del celular (POST normal; vuelve a la lista con avisos)."""
    if request.method != 'POST':
        return redirect('mto:lista_bitacora')
    if not puede_mto(request.user, 'editar_bitacora'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para editar la bitácora")))
        return redirect('mto:lista_bitacora')

    registro = _registro_o_404(request, pk) if pk else None
    datos, errores = _leer_registro(request, registro, completo=False)
    if errores:
        messages.error(request, aviso(_("No se pudo guardar el registro"), next(iter(errores.values()))))
        return redirect(f"/mto/bitacora/?area={request.POST.get('area', '').strip()}")

    nuevo = registro is None
    registro = _guardar(registro, datos)
    messages.success(request, aviso(_("Registro agregado") if nuevo else _("Registro actualizado")))

    # Fotos: solo JPG o PNG reales de hasta 5 MB; se guardan las que caben y se avisa de las demás
    subidas = request.FILES.getlist('imagenes')
    imagenes = [f for f in subidas if f.size <= MAX_BYTES_IMAGEN_BIT and imagen_subida_valida(f)]
    if len(imagenes) < len(subidas):
        n = len(subidas) - len(imagenes)
        messages.warning(request, aviso(_("Archivos ignorados"),
                                        ngettext("{n} archivo no es una foto JPG o PNG de hasta 5 MB",
                                                 "{n} archivos no son fotos JPG o PNG de hasta 5 MB", n).format(n=n)))
    if imagenes:
        disponibles = MAX_IMAGENES_BITACORA - registro.imagenes.count()
        if disponibles <= 0:
            messages.warning(request, aviso(_("No se agregaron fotos"), _("Este registro ya tiene {n}, el máximo").format(n=MAX_IMAGENES_BITACORA)))
        else:
            if len(imagenes) > disponibles:
                messages.warning(request, aviso(ngettext("Solo se guardó {n} foto", "Solo se guardaron {n} fotos", disponibles).format(n=disponibles),
                                                _("Se alcanzó el máximo de {n} por registro").format(n=MAX_IMAGENES_BITACORA)))
            for imagen in imagenes[:disponibles]:
                ImagenBitacora.objects.create(bitacora=registro, imagen=imagen)

    return redirect(f"/mto/bitacora/?area={registro.area_id}")


@login_required
def eliminar_bitacora(request, pk):
    if not puede_mto(request.user, 'eliminar_bitacora'):
        messages.error(request, aviso(_("Sin permiso"), _("No tienes permiso para eliminar registros")))
        return redirect('mto:lista_bitacora')

    registro = _registro_o_404(request, pk)
    area_pk  = registro.area_id
    if request.method == 'POST':
        registro.delete()      # sus fotos se borran con él (señal post_delete)
        messages.success(request, aviso(_("Registro eliminado")))
    return redirect(f"/mto/bitacora/?area={area_pk}")


@login_required
def imagenes_bitacora(request, pk):
    """Fotos de un registro de un área del usuario (requiere Ver bitácora)."""
    if not puede_mto(request.user, 'ver_bitacora'):
        return JsonResponse({'imagenes': []}, status=403)
    registro = _registro_o_404(request, pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in registro.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_http_methods(["POST"])
def eliminar_imagen_bitacora(request, imagen_id):
    if not puede_mto(request.user, 'editar_bitacora'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar la bitácora.")}, status=403)
    imagen = get_object_or_404(ImagenBitacora, id=imagen_id, bitacora__area__in=areas_visibles_mto(request))
    imagen.delete()            # el archivo lo borra la señal post_delete
    return JsonResponse({'ok': True})


@login_required
def buscar_equipos_bitacora(request):
    """Autocompletado de Equipo en la Bitácora: equipos del catálogo de Paros del área con el mismo nombre.
    Si el área de mantenimiento no tiene pareja en Paros, no ofrece equipos de otras áreas: devuelve la lista
    vacía y un aviso (el campo acepta texto libre). Respuesta: {'equipos': [...], 'aviso': ''}."""
    from paros_app.models import CatalogoEquipo

    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = CatalogoEquipo.objects.select_related('area')
    texto_aviso = ''
    if mto_area_id:
        area_mto = areas_visibles_mto(request).filter(pk=mto_area_id).first() if mto_area_id.isdigit() else None
        area_paros = area_mto.area_paros() if area_mto else None
        if area_paros:
            qs = qs.filter(area=area_paros)
        else:
            qs = qs.none()
            if area_mto:
                texto_aviso = _("El área «{area}» no tiene catálogo de equipos en Paros (los nombres no coinciden). "
                                "Escribe el equipo a mano.").format(area=area_mto.nombre)

    if q:
        qs = qs.filter(Q(equipo__icontains=q) | Q(codigo__icontains=q))

    data = [
        {
            'nombre':      e.equipo_es or e.equipo,
            'descripcion': f"[{e.codigo}]" + (f" — {e.sub_area_es}" if e.sub_area_es else ''),
        }
        for e in qs[:15]
    ]
    return JsonResponse({'equipos': data, 'aviso': texto_aviso})


@login_required
def buscar_responsables_bitacora(request):
    """Autocompletado de Responsable: personas activas de las áreas del usuario (o de la elegida, si es suya)."""
    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = Responsable.objects.filter(activo=True, area__in=areas_visibles_mto(request))
    if mto_area_id.isdigit():
        qs = qs.filter(area_id=mto_area_id)
    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(apellidos__icontains=q))

    data = [{'nombre': f"{r.nombre} {r.apellidos}", 'descripcion': r.posicion} for r in qs[:15]]
    return JsonResponse(data, safe=False)


# ── Escritorio: guardar por JSON, último registro del equipo y exportar ──────

@login_required
@require_POST
@transaction.atomic
def bitacora_guardar(request, pk=None):
    """Crea o edita un registro desde el modal de escritorio. Recibe multipart; devuelve JSON."""
    if not puede_mto(request.user, 'editar_bitacora'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar la bitácora.")}, status=403)
    registro = _registro_o_404(request, pk) if pk else None
    datos, errores = _leer_registro(request, registro, completo=True)
    if errores:
        return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=400)

    registro = _guardar(registro, datos)
    for f in request.FILES.getlist('imagenes'):
        ImagenBitacora.objects.create(bitacora=registro, imagen=f)
    return JsonResponse({'ok': True, 'id': registro.pk})


@login_required
def bitacora_ultimo_equipo(request):
    """Último registro de un equipo (para la ayuda del modal y el aviso de pendiente abierto)."""
    if not puede_mto(request.user, 'ver_bitacora'):
        return JsonResponse({'existe': False}, status=403)
    equipo = request.GET.get('equipo', '').strip()
    area_id = request.GET.get('area', '').strip()
    excluir = request.GET.get('excluir', '').strip()
    if not equipo:
        return JsonResponse({'existe': False})
    qs = Bitacora.objects.filter(area__in=areas_visibles_mto(request), equipo__iexact=equipo)
    if area_id.isdigit():
        qs = qs.filter(area_id=int(area_id))
    if excluir.isdigit():
        qs = qs.exclude(pk=int(excluir))
    ultimo = qs.order_by('-fecha', '-creado_en').first()
    if not ultimo:
        return JsonResponse({'existe': False})
    return JsonResponse({'existe': True, 'fecha': ultimo.fecha.isoformat(), 'responsable': ultimo.responsable,
                         'pendiente': ultimo.pendiente})


@login_required
def bitacora_exportar(request):
    """Descarga en .xlsx lo filtrado en la lista (mismos filtros de la URL, sin paginar)."""
    if not puede_mto(request.user, 'ver_bitacora'):
        return HttpResponse(status=403)
    hoy = date.today()
    g = request.GET
    areas = areas_visibles_mto(request)

    regs = Bitacora.objects.select_related('area').prefetch_related('imagenes').filter(area__in=areas)
    area_id = _area_filtro(request, areas)
    if area_id:
        regs = regs.filter(area_id=area_id)
    regs = _filtrar(regs, g, hoy)
    if g.get('pendiente') == '1':
        regs = regs.exclude(pendiente='')
    elif g.get('pendiente') == '0':
        regs = regs.filter(pendiente='')
    regs = regs.order_by('fecha', 'creado_en') if g.get('orden') == 'fecha' else regs.order_by('-fecha', '-creado_en')

    wb = Workbook()
    ws = wb.active
    ws.title = _("Bitácora")[:31]
    ws.append([_("Fecha"), _("Día"), _("Semana"), _("Área"), _("Equipo"), _("Actividad realizada"),
               _("Pendiente"), _("Responsable"), _("Segundo responsable"), _("Fotos")])
    for r in regs:
        ws.append([r.fecha, date_format(r.fecha, 'l'), 'S%s' % r.fecha.isocalendar()[1], r.area.nombre, r.equipo,
                   r.actividad_realizada, r.pendiente, r.responsable, r.responsable2, len(r.imagenes.all())])
        ws.cell(row=ws.max_row, column=1).number_format = 'DD/MM/YYYY'
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = PatternFill(fill_type='solid', fgColor='3D5BD9')
    for col, ancho in zip('ABCDEFGHIJ', (12, 12, 9, 22, 28, 60, 45, 28, 28, 7)):
        ws.column_dimensions[col].width = ancho
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    resp = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename="bitacora_%s.xlsx"' % hoy.isoformat()
    return resp
