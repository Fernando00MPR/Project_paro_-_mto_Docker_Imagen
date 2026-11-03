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
from django.utils.translation import gettext as _
from django.utils.formats import date_format
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from login_app.permisos import puede_mto

from .utils import areas_permitidas_mto
from ..models import Area, Bitacora, Responsable, ImagenBitacora

MAX_IMAGENES_BITACORA = 2

@login_required
def lista_bitacora(request):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.ver_bitacora)
    )
    if not puede_ver:
        messages.error(request, _("No tienes permiso para ver esta sección."))
        return redirect('mto:dashboard')

    area_id          = request.GET.get('area', '').strip()
    filtro_fecha     = request.GET.get('fecha', '').strip()          # fecha exacta (la sigue usando el celular)
    filtro_q         = request.GET.get('q', '').strip()
    filtro_pendiente = request.GET.get('pendiente', '').strip()
    filtro_rango     = request.GET.get('rango', '').strip()          # hoy | semana | mes | rango
    filtro_equipo    = request.GET.get('equipo', '').strip()
    filtro_orden     = request.GET.get('orden', '').strip()          # 'fecha' = de la más antigua a la más reciente
    hoy              = date.today()

    def _iso(valor):
        try:
            return date.fromisoformat(valor)
        except ValueError:
            return None
    f_desde, f_hasta = _iso(request.GET.get('desde', '').strip()), _iso(request.GET.get('hasta', '').strip())

    base = Bitacora.objects.select_related('area').prefetch_related('imagenes')
    if area_id:
        base = base.filter(area_id=area_id)
    equipos_lista = list(base.exclude(equipo='').order_by('equipo').values_list('equipo', flat=True).distinct())

    registros = base
    if filtro_fecha:
        registros = registros.filter(fecha=filtro_fecha)
    else:
        if filtro_rango == 'hoy':
            d_desde = d_hasta = hoy
        elif filtro_rango == 'semana':
            d_desde = hoy - timedelta(days=hoy.weekday())
            d_hasta = d_desde + timedelta(days=6)
        elif filtro_rango == 'mes':
            d_desde = hoy.replace(day=1)
            d_hasta = (hoy.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        elif filtro_rango == 'rango':
            d_desde, d_hasta = f_desde, f_hasta
        else:
            d_desde = d_hasta = None
        if d_desde:
            registros = registros.filter(fecha__gte=d_desde)
        if d_hasta:
            registros = registros.filter(fecha__lte=d_hasta)
    if filtro_equipo:
        registros = registros.filter(equipo=filtro_equipo)
    if filtro_q:
        registros = registros.filter(
            Q(equipo__icontains=filtro_q) | Q(responsable__icontains=filtro_q) | Q(responsable2__icontains=filtro_q) |
            Q(actividad_realizada__icontains=filtro_q) | Q(pendiente__icontains=filtro_q)
        )
    # Conteos de los segmentados (con los demás filtros aplicados)
    conteo_todos = registros.count()
    conteo_con_pendiente = registros.exclude(pendiente='').exclude(pendiente__isnull=True).count()

    if filtro_pendiente == '1':
        registros = registros.exclude(pendiente='').exclude(pendiente__isnull=True)
    elif filtro_pendiente == '0':
        registros = registros.filter(Q(pendiente='') | Q(pendiente__isnull=True))

    # Indicadores de arriba, sobre lo filtrado
    con_pend = registros.exclude(pendiente='').exclude(pendiente__isnull=True)
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
    page_nume = request.GET.get('page', 1)
    registros_page = paginator.get_page(page_nume)
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
        'areas':                 areas_permitidas_mto(request),
        'filtro_area':           area_id,
        'today':                 date.today(),
        'puede_editar':          (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.editar_bitacora)),
        'puede_eliminar':        (request.user.is_superuser or (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or (acceso and acceso.eliminar_bitacora)),
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


@login_required
def form_bitacora(request, pk=None):
    if request.method != 'POST':
        return redirect('mto:lista_bitacora')

    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_bitacora)
    )
    if not puede_editar:
        messages.error(request, _("No tienes permiso para editar la bitácora."))
        return redirect('mto:lista_bitacora')

    registro = get_object_or_404(Bitacora, pk=pk) if pk else None
    area_id  = request.POST.get('area', '').strip()

    try:
        area = get_object_or_404(Area, pk=area_id)
        datos = {
            'area':                area,
            'fecha':               request.POST.get('fecha', '').strip(),
            'equipo':              request.POST.get('equipo', '').strip()[:100],
            'actividad_realizada': request.POST.get('actividad_realizada', '').strip()[:300],
            'pendiente':           request.POST.get('pendiente', '').strip()[:200],
            'responsable':         request.POST.get('responsable', '').strip()[:200],
            'responsable2':        request.POST.get('responsable2', '').strip()[:200],
        }
        if not datos['fecha']:
            raise ValueError(_("La fecha es obligatoria."))
        if not datos['actividad_realizada']:
            raise ValueError(_("La actividad realizada es obligatoria."))
        if datos['responsable2'] and datos['responsable2'].lower() == datos['responsable'].lower():
            raise ValueError(_("El segundo responsable debe ser distinto del primero"))

        if registro:
            for k, v in datos.items():
                setattr(registro, k, v)
            registro.save()
            messages.success(request, _("Registro actualizado."))
        else:
            registro = Bitacora.objects.create(**datos)
            messages.success(request, _("Registro agregado."))

        imagenes = request.FILES.getlist('imagenes')
        if imagenes:
            disponibles = MAX_IMAGENES_BITACORA - registro.imagenes.count()
            if disponibles <= 0:
                messages.warning(request, _("Este registro ya tiene {n} imágenes — no se pueden agregar más.").format(n=MAX_IMAGENES_BITACORA))
            else:
                if len(imagenes) > disponibles:
                    messages.warning(request, _("Solo se guardaron {disponibles} imagen(es) — se alcanzó el límite de {n}.").format(disponibles=disponibles, n=MAX_IMAGENES_BITACORA))
                for imagen in imagenes[:disponibles]:
                    ImagenBitacora.objects.create(bitacora=registro, imagen=imagen)

        return redirect(f"/mto/bitacora/?area={area.pk}")

    except ValueError as e:
        messages.error(request, str(e))
    except Exception as e:
        messages.error(request, _("Error al guardar: {error}").format(error=e))

    return redirect(f"/mto/bitacora/?area={area_id}")


@login_required
def eliminar_bitacora(request, pk):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_eliminar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.eliminar_bitacora)
    )
    if not puede_eliminar:
        messages.error(request, _("No tienes permiso para eliminar registros."))
        return redirect('mto:lista_bitacora')

    registro = get_object_or_404(Bitacora, pk=pk)
    area_pk  = registro.area_id
    if request.method == 'POST':
        registro.delete()
        messages.success(request, _("Registro eliminado."))
    return redirect(f"/mto/bitacora/?area={area_pk}")


@login_required
def imagenes_bitacora(request, pk):
    registro = get_object_or_404(Bitacora, pk=pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in registro.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_http_methods(["POST"])
def eliminar_imagen_bitacora(request, imagen_id):
    acceso = getattr(request.user, 'acceso_mto', None)
    puede_editar = (
        request.user.is_superuser or
        (hasattr(request.user, 'perfil') and request.user.perfil.es_admin) or
        (acceso and acceso.editar_bitacora)
    )
    if not puede_editar:
        return JsonResponse({'error': 'Sin permiso'}, status=403)

    imagen = get_object_or_404(ImagenBitacora, id=imagen_id)
    imagen.imagen.delete()
    imagen.delete()
    return JsonResponse({'ok': True})


@login_required
def buscar_equipos_bitacora(request):
    from paros_app.models import CatalogoEquipo, Area as AreaParos

    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = CatalogoEquipo.objects.select_related('area')

    if mto_area_id:
        area_mto = Area.objects.filter(pk=mto_area_id).first()
        if area_mto:
            area_paros = AreaParos.objects.filter(nombre__iexact=area_mto.nombre).first()
            if area_paros:
                qs = qs.filter(area=area_paros)

    if q:
        qs = qs.filter(Q(equipo__icontains=q) | Q(codigo__icontains=q))

    data = [
        {
            'nombre':      e.equipo_es or e.equipo,
            'descripcion': f"[{e.codigo}]" + (f" — {e.sub_area_es}" if e.sub_area_es else ''),
        }
        for e in qs[:15]
    ]
    return JsonResponse(data, safe=False)


@login_required
def buscar_responsables_bitacora(request):
    q           = request.GET.get('q', '').strip()
    mto_area_id = request.GET.get('area_id', '').strip()

    qs = Responsable.objects.filter(activo=True)

    if mto_area_id:
        qs = qs.filter(area_id=mto_area_id)

    if q:
        qs = qs.filter(Q(nombre__icontains=q) | Q(apellidos__icontains=q))

    data = [
        {
            'nombre':      f"{r.nombre} {r.apellidos}",
            'descripcion': r.posicion,
        }
        for r in qs[:15]
    ]
    return JsonResponse(data, safe=False)


# ── Escritorio: guardar por JSON, último registro del equipo y exportar ──────
MAX_BYTES_IMAGEN_BIT = 5 * 1024 * 1024


@login_required
@require_POST
@transaction.atomic
def bitacora_guardar(request, pk=None):
    """Crea o edita un registro desde el modal de escritorio. Recibe multipart; devuelve JSON."""
    if not puede_mto(request.user, 'editar_bitacora'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar la bitácora.")}, status=403)
    areas = areas_permitidas_mto(request)
    registro = get_object_or_404(Bitacora, pk=pk, area__in=areas) if pk else None
    area = areas.filter(pk=request.POST.get('area') or 0).first()
    equipo = request.POST.get('equipo', '').strip()[:100]
    actividad = request.POST.get('actividad_realizada', '').strip()[:300]
    responsable = request.POST.get('responsable', '').strip()[:200]
    responsable2 = request.POST.get('responsable2', '').strip()[:200]
    hay_pend = request.POST.get('hay_pendiente', 'si') == 'si'
    pendiente = request.POST.get('pendiente', '').strip()[:200] if hay_pend else ''
    try:
        fecha = date.fromisoformat(request.POST.get('fecha', '').strip())
    except ValueError:
        fecha = None

    errores = {}
    if not area:
        errores['area'] = _("Elige el área")
    if not fecha:
        errores['fecha'] = _("Elige la fecha")
    elif fecha > date.today():
        errores['fecha'] = _("La fecha no puede ser futura")
    if not equipo:
        errores['equipo'] = _("Elige el equipo")
    if not actividad:
        errores['actividad'] = _("Describe la actividad realizada")
    if not responsable:
        errores['responsable'] = _("Elige el responsable")
    elif responsable2 and responsable2.lower() == responsable.lower():
        errores['responsable2'] = _("El segundo responsable debe ser distinto del primero")
    if hay_pend and not pendiente:
        errores['pendiente'] = _("Describe lo que quedó pendiente")
    imagenes = request.FILES.getlist('imagenes')
    if (registro.imagenes.count() if registro else 0) + len(imagenes) > MAX_IMAGENES_BITACORA:
        errores['imagenes'] = _("Máximo {n} imágenes por registro").format(n=MAX_IMAGENES_BITACORA)
    elif any(not (f.content_type or '').startswith('image/') or f.size > MAX_BYTES_IMAGEN_BIT for f in imagenes):
        errores['imagenes'] = _("Solo imágenes JPG o PNG de hasta 5 MB")
    if errores:
        return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=400)

    datos = {'area': area, 'fecha': fecha, 'equipo': equipo, 'actividad_realizada': actividad,
             'pendiente': pendiente, 'responsable': responsable, 'responsable2': responsable2}
    if registro:
        for k, v in datos.items():
            setattr(registro, k, v)
        registro.save()
    else:
        registro = Bitacora.objects.create(**datos)
    for f in imagenes:
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
    qs = Bitacora.objects.filter(area__in=areas_permitidas_mto(request), equipo__iexact=equipo)
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

    def _iso(v):
        try:
            return date.fromisoformat(v)
        except ValueError:
            return None

    regs = Bitacora.objects.select_related('area').prefetch_related('imagenes').filter(area__in=areas_permitidas_mto(request))
    if g.get('area', '').isdigit():
        regs = regs.filter(area_id=int(g['area']))
    rango = g.get('rango', '')
    if g.get('fecha'):
        regs = regs.filter(fecha=g['fecha'])
    else:
        if rango == 'hoy':
            d1 = d2 = hoy
        elif rango == 'semana':
            d1 = hoy - timedelta(days=hoy.weekday()); d2 = d1 + timedelta(days=6)
        elif rango == 'mes':
            d1 = hoy.replace(day=1); d2 = (hoy.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        elif rango == 'rango':
            d1, d2 = _iso(g.get('desde', '')), _iso(g.get('hasta', ''))
        else:
            d1 = d2 = None
        if d1:
            regs = regs.filter(fecha__gte=d1)
        if d2:
            regs = regs.filter(fecha__lte=d2)
    if g.get('equipo'):
        regs = regs.filter(equipo=g['equipo'])
    if g.get('q'):
        q = g['q'].strip()
        regs = regs.filter(Q(equipo__icontains=q) | Q(responsable__icontains=q) | Q(responsable2__icontains=q) |
                           Q(actividad_realizada__icontains=q) | Q(pendiente__icontains=q))
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
                   r.actividad_realizada, r.pendiente, r.responsable, r.responsable2, r.imagenes.count()])
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
