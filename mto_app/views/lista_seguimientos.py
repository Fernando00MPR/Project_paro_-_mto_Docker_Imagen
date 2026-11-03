import unicodedata
from types import SimpleNamespace
from datetime import timedelta
from urllib.parse import urlencode

from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404, render
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone
from django.utils.translation import gettext as _

from ..models import SeguimientoOT, SeguimientoManual, Area, ImagenSeguimiento, Responsable
from login_app.permisos import puede_mto
from .utils import areas_visibles_mto, areas_ids_restringidas, requiere_permiso_json


def _en_alcance(qs, area_id, areas_ids, campo='area_id'):
    """Limita un queryset al área elegida o, sin elegir, a las áreas que el usuario puede ver
    (areas_ids=None: sin restricción)."""
    if area_id:
        return qs.filter(**{campo: area_id})
    if areas_ids is not None:
        return qs.filter(**{campo + '__in': areas_ids})
    return qs


# ── Escritorio: constantes y helpers de filtros ──────────────────────────────
PRESETS_CREADO  = ('semana', 'mes', '30dias')
SIN_RESPONSABLE = '__sin__'

# Chips de "Atención" (uno a la vez). Cada uno recibe (seguimiento, hoy).
ATENCION_FN = {
    'vencidos':    lambda s, hoy: bool(s.fecha_compromiso and s.fecha_compromiso < hoy and s.estatus != 'completado'),
    'sin_resp':    lambda s, hoy: not (s.responsable or '').strip(),
    'sin_fecha':   lambda s, hoy: not s.fecha_compromiso and s.estatus != 'completado',
    'por_validar': lambda s, hoy: not s.validado,
}


def _norm(texto):
    """Minúsculas y sin acentos, para que "accion" encuentre "acción"."""
    t = unicodedata.normalize('NFKD', texto or '')
    return ''.join(c for c in t if not unicodedata.combining(c)).lower()


def _iniciales(nombre):
    partes = (nombre or '').split()
    if not partes:
        return '?'
    segunda = partes[1][0] if len(partes) > 1 else (partes[0][1] if len(partes[0]) > 1 else '')
    return (partes[0][0] + segunda).upper()


def dias_vencido(s, hoy):
    """Días desde la fecha compromiso hasta hoy; 0 si no está vencido (sin fecha o Completado).
    Misma regla del chip "Vencido n días" de la tabla y del chip de Atención "Vencidos"."""
    if s.fecha_compromiso and s.fecha_compromiso < hoy and s.estatus != 'completado':
        return (hoy - s.fecha_compromiso).days
    return 0


def _qs(params, *excluir):
    """Querystring de los filtros actuales sin los parámetros indicados."""
    p = params.copy()
    for k in excluir:
        p.pop(k, None)
    return p.urlencode()


def _consulta(request):
    """Filtros, conteos y orden de Seguimientos correctivos a partir del GET.
    La usan la lista (que luego pagina) y la exportación (que toma todas las filas)."""
    estatus         = request.GET.get('estatus', '')
    area_id         = request.GET.get('area', '')
    areas_ids       = areas_ids_restringidas(request)

    if area_id and areas_ids is not None and area_id not in {str(i) for i in areas_ids}:
        area_id = ''        # un ?area= de otra área se ignora

    filtro_orden    = request.GET.get('orden', '').strip()
    filtro_problema = request.GET.get('problema', '').strip()
    filtro_accion   = request.GET.get('accion', '').strip()
    filtro_validado = request.GET.get('validado', '')
    filtro_fecha_desde = request.GET.get('fecha_desde', '').strip()
    filtro_fecha_hasta = request.GET.get('fecha_hasta', '').strip()
    orden_por  = request.GET.get('orden_por', 'fecha_creacion')
    direccion  = request.GET.get('direccion', 'desc')
    # Buscador único (orden OR problema OR acción OR notas) y "Solo vencidos" (celular).
    filtro_q        = request.GET.get('q', '').strip()
    filtro_vencidos = request.GET.get('vencidos', '') == '1'
    # Escritorio: select de Responsable, "Creado" con rangos rápidos y chips de Atención.
    filtro_responsable = request.GET.get('responsable', '').strip()
    filtro_creado      = request.GET.get('creado', '').strip()
    if filtro_creado not in PRESETS_CREADO:
        filtro_creado = ''
    filtro_atencion = request.GET.get('atencion', '').strip()
    if filtro_atencion not in ATENCION_FN:
        filtro_atencion = ''
    hoy = timezone.localdate()

    # "Creado": los rangos rápidos se traducen al mismo filtro de fechas que ya existía.
    fecha_desde_ef, fecha_hasta_ef = filtro_fecha_desde, filtro_fecha_hasta
    if filtro_creado == 'semana':
        lunes = hoy - timedelta(days=hoy.weekday())
        fecha_desde_ef, fecha_hasta_ef = lunes.isoformat(), (lunes + timedelta(days=6)).isoformat()
    elif filtro_creado == 'mes':
        primero = hoy.replace(day=1)
        siguiente = (primero + timedelta(days=32)).replace(day=1)
        fecha_desde_ef, fecha_hasta_ef = primero.isoformat(), (siguiente - timedelta(days=1)).isoformat()
    elif filtro_creado == '30dias':
        fecha_desde_ef, fecha_hasta_ef = (hoy - timedelta(days=30)).isoformat(), hoy.isoformat()

    def _base():
        """Correctivos con todos los filtros EXCEPTO estatus y chip de Atención
        (así se pueden contar los chips de ambos grupos por separado)."""
        qs = _en_alcance(SeguimientoManual.objects.select_related('area', 'creado_por'), area_id, areas_ids)

        if filtro_problema:
            qs = qs.filter(problema__icontains=filtro_problema)
        if filtro_accion:
            qs = qs.filter(accion__icontains=filtro_accion)
        if filtro_validado != '':
            qs = qs.filter(validado=filtro_validado == '1')
        if fecha_desde_ef:
            qs = qs.filter(fecha_creacion__date__gte=fecha_desde_ef)
        if fecha_hasta_ef:
            qs = qs.filter(fecha_creacion__date__lte=fecha_hasta_ef)
        if filtro_vencidos:
            qs = qs.filter(fecha_compromiso__lt=hoy).exclude(estatus='completado')
        if filtro_responsable == SIN_RESPONSABLE:
            qs = qs.filter(responsable='')
        elif filtro_responsable:
            qs = qs.filter(responsable=filtro_responsable)
        if filtro_orden:
            orden_limpio = filtro_orden.upper().lstrip('M').lstrip('0') or '0'
            try:
                qs = qs.filter(consecutivo=int(orden_limpio))
            except ValueError:
                qs = qs.none()

        lista = list(qs)
        if filtro_q:
            q = _norm(filtro_q)
            lista = [s for s in lista
                     if q in _norm(s.no_orden) or q in _norm(s.problema)
                     or q in _norm(s.accion) or q in _norm(s.notas)]
        return lista


    base = _base()

    # Chips de Atención: respetan buscador y selects, no el estatus.
    conteo_atencion = {k: sum(1 for s in base if fn(s, hoy)) for k, fn in ATENCION_FN.items()}
    base_atencion = [s for s in base if ATENCION_FN[filtro_atencion](s, hoy)] if filtro_atencion else base

    # Chips de Estatus (y celular): respetan además el chip de Atención activo, no el estatus.
    conteo_estatus = {'pendiente': 0, 'en_proceso': 0, 'completado': 0}
    for s in base_atencion:
        conteo_estatus[s.estatus] = conteo_estatus.get(s.estatus, 0) + 1
    conteo_todos = len(base_atencion)

    seguimientos_manuales = [s for s in base_atencion if not estatus or s.estatus == estatus]

    reverso = (direccion == 'desc')
    if orden_por == 'fecha_compromiso':
        con_fecha = [s for s in seguimientos_manuales if s.fecha_compromiso]
        sin_fecha = [s for s in seguimientos_manuales if not s.fecha_compromiso]
        con_fecha.sort(key=lambda s: (s.fecha_compromiso, s.consecutivo), reverse=reverso)
        seguimientos_manuales = con_fecha + sin_fecha      # "Sin fecha" siempre al final
    elif orden_por == 'no_orden':
        seguimientos_manuales.sort(key=lambda s: s.consecutivo, reverse=reverso)
    else:
        orden_por = 'fecha_creacion'
        seguimientos_manuales.sort(key=lambda s: s.fecha_creacion, reverse=reverso)

    for s in seguimientos_manuales:
        s.es_ot = False

    hay_filtros = any([filtro_q, filtro_responsable, filtro_validado != '', filtro_creado,
                       filtro_fecha_desde, filtro_fecha_hasta, filtro_atencion, estatus])

    return SimpleNamespace(
        estatus=estatus,
        area_id=area_id,
        areas_ids=areas_ids,
        filtro_orden=filtro_orden,
        filtro_problema=filtro_problema,
        filtro_accion=filtro_accion,
        filtro_validado=filtro_validado,
        filtro_fecha_desde=filtro_fecha_desde,
        filtro_fecha_hasta=filtro_fecha_hasta,
        orden_por=orden_por,
        direccion=direccion,
        filtro_q=filtro_q,
        filtro_vencidos=filtro_vencidos,
        filtro_responsable=filtro_responsable,
        filtro_creado=filtro_creado,
        filtro_atencion=filtro_atencion,
        hoy=hoy,
        fecha_desde_ef=fecha_desde_ef,
        fecha_hasta_ef=fecha_hasta_ef,
        seguimientos_manuales=seguimientos_manuales,
        conteo_estatus=conteo_estatus,
        conteo_todos=conteo_todos,
        conteo_atencion=conteo_atencion,
        hay_filtros=hay_filtros,
    )


@login_required
def lista_seguimientos(request):

    perfil   = request.user.perfil if hasattr(request.user, 'perfil') else None
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    acceso = getattr(request.user, 'acceso_mto', None)
    puede_ver = es_admin or (acceso and acceso.ver_seguimiento)
    if not puede_ver:
        messages.error(request, _("No tienes permiso para ver esta sección."))
        from django.shortcuts import redirect
        return redirect('mto:dashboard')

    c = _consulta(request)
    estatus = c.estatus
    area_id = c.area_id
    filtro_orden = c.filtro_orden
    filtro_problema = c.filtro_problema
    filtro_accion = c.filtro_accion
    filtro_validado = c.filtro_validado
    filtro_fecha_desde = c.filtro_fecha_desde
    filtro_fecha_hasta = c.filtro_fecha_hasta
    orden_por = c.orden_por
    direccion = c.direccion
    filtro_q = c.filtro_q
    filtro_vencidos = c.filtro_vencidos
    filtro_responsable = c.filtro_responsable
    filtro_creado = c.filtro_creado
    filtro_atencion = c.filtro_atencion
    hoy = c.hoy
    seguimientos_manuales = c.seguimientos_manuales
    conteo_estatus = c.conteo_estatus
    conteo_todos = c.conteo_todos
    conteo_atencion = c.conteo_atencion

    per_page = request.GET.get('per_page', '25')
    paginator = Paginator(seguimientos_manuales, int(per_page) if per_page.isdigit() and int(per_page) > 0 else 25)
    page_num = request.GET.get('page', 1)
    combinados_page = paginator.get_page(page_num)

    # Hoja de filtros (celular): "Ver {n} seguimientos" pide el conteo en vivo.
    if request.GET.get('conteo') == '1':
        return JsonResponse({'n': paginator.count})

    for s in combinados_page:
        # Celular (los días de vencido los calcula seguimientos_movil.js).
        s.codigo_plan = ''
        anio, sem, _dia = (s.fecha_compromiso or timezone.localtime(s.fecha_creacion).date()).isocalendar()
        s.semana = f"S{sem}/{anio}"
        # Escritorio.
        s.dias_vencido = dias_vencido(s, hoy)
        s.vencido_fuerte = s.dias_vencido > 30
        s.iniciales = _iniciales(s.responsable)
        s.fotos = s.imagenes.count()

    seguimientos_pagina          = []
    seguimientos_manuales_pagina = list(combinados_page)

    areas = areas_visibles_mto(request)

    area_nombre = None
    if area_id:
        try:
            area_nombre = next((a.nombre for a in areas if a.id == int(area_id)), None)
        except (ValueError, TypeError):
            area_nombre = None

    # Hoja "Responsable" del formulario de celular: personas activas del área.
    responsables_qs = _en_alcance(Responsable.objects.filter(activo=True).order_by('nombre', 'apellidos'), area_id, c.areas_ids)

    # ── Escritorio: opciones de los selects de la barra de filtros ──
    usados = _en_alcance(SeguimientoManual.objects.all(), area_id, c.areas_ids)
    nombres = sorted({(r or '').strip() for r in usados.values_list('responsable', flat=True)} - {''}, key=_norm)
    responsables_filtro = [{'value': SIN_RESPONSABLE, 'label': _('Sin responsable'), 'color': '#D9534F', 'meta': ''}] + [
        {'value': n, 'label': n, 'color': '#9CA3AF', 'meta': ''} for n in nombres
    ]
    responsable_label = _('Sin responsable') if filtro_responsable == SIN_RESPONSABLE else filtro_responsable
    validacion_filtro = [
        {'value': '1', 'label': _('Validado'),   'color': '#2E8B57', 'meta': ''},
        {'value': '0', 'label': _('Por validar'), 'color': '#9CA3AF', 'meta': ''},
    ]
    validacion_label = {'1': _('Validado'), '0': _('Por validar')}.get(filtro_validado, '')

    if filtro_creado:
        creado_label = {'semana': _('Esta semana'), 'mes': _('Este mes'), '30dias': _('Últimos 30 días')}[filtro_creado]
    elif filtro_fecha_desde or filtro_fecha_hasta:
        creado_label = _('Rango personalizado')
    else:
        creado_label = ''

    # Querystrings para paginación / orden / "Limpiar filtros" (conservan los demás filtros).
    params = request.GET.copy()
    params.pop('conteo', None)
    qs_sin_page = _qs(params, 'page')
    qs_sin_orden = _qs(params, 'page', 'orden_por', 'direccion')
    limpiar = urlencode({'area': area_id}) if area_id else ''

    filtros_escritorio_activos = c.hay_filtros
    total_seguimientos = _en_alcance(SeguimientoManual.objects.all(), area_id, c.areas_ids).count()

    return render(request, 'mto_app/seguimientos/lista_seguimientos.html', {
        'seguimientos':               seguimientos_pagina,
        'seguimientos_manuales':      seguimientos_manuales_pagina,
        'combinados_page':            combinados_page,
        'per_page':                   per_page,
        'per_page_options':           [10, 25, 50],
        'estatus_filtro':             estatus,
        'area_filtro':                area_id,
        'filtro_orden':               filtro_orden,
        'filtro_problema':            filtro_problema,
        'filtro_accion':              filtro_accion,
        'filtro_validado':            filtro_validado,
        'filtro_fecha_desde':         filtro_fecha_desde,
        'filtro_fecha_hasta':         filtro_fecha_hasta,
        'orden_por':                  orden_por,
        'direccion':                  direccion,
        'areas':                      areas,
        'estatus_choices':            SeguimientoOT.ESTATUS_CHOICES,
        'area_nombre':                area_nombre,
        'puede_editar_seguimiento':   (es_admin or (acceso and acceso.editar_seguimiento)),
        'puede_eliminar_seguimiento': (es_admin or (acceso and acceso.eliminar_seguimiento)),
        'puede_validar_seguimiento':  (es_admin or (acceso and acceso.validar_seguimiento)),
        'puede_llenar_seguimiento':   (es_admin or (acceso and (acceso.llenar_seguimiento or acceso.editar_seguimiento))),
        # Vista de celular
        'filtro_q':                   filtro_q,
        'filtro_vencidos':            filtro_vencidos,
        'conteo_estatus':             conteo_estatus,
        'conteo_todos':               conteo_todos,
        'filtros_activos':            sum([filtro_validado != '',
                                      bool(filtro_fecha_desde or filtro_fecha_hasta), filtro_vencidos,
                                      bool(filtro_problema), bool(filtro_accion)]),
        'responsables_movil':         [{'id': r.pk, 'nombre': r.nombre_completo()} for r in responsables_qs],
        'hoy':                        hoy,
        # Vista de escritorio
        'filtro_responsable':         filtro_responsable,
        'filtro_creado':              filtro_creado,
        'filtro_atencion':            filtro_atencion,
        'conteo_atencion':            conteo_atencion,
        'responsables_filtro':        responsables_filtro,
        'responsable_label':          responsable_label,
        'validacion_filtro':          validacion_filtro,
        'validacion_label':           validacion_label,
        'creado_label':               creado_label,
        'qs_sin_page':                qs_sin_page,
        'qs_sin_orden':               qs_sin_orden,
        'url_limpiar':                limpiar,
        'filtros_escritorio_activos': filtros_escritorio_activos,
        'total_seguimientos':         total_seguimientos,
    })


@login_required
@require_POST
def subir_imagenes_seguimiento(request, tipo, seg_pk):
    """tipo: 'ot' o 'manual'"""
    if tipo == 'ot':
        seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
        campo = {'seguimiento_ot': seg}
    else:
        seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
        campo = {'seguimiento_manual': seg}

    # Llenar solo permite agregar imágenes a un seguimiento que la misma persona creó; cualquier otro caso pide Editar.
    if not (puede_mto(request.user, 'editar_seguimiento')
            or (puede_mto(request.user, 'llenar_seguimiento') and seg.creado_por_id == request.user.id)):
        return JsonResponse({'ok': False, 'error': _('No tienes permiso para realizar esta acción.')}, status=403)

    imagenes = request.FILES.getlist('imagenes')
    existentes = seg.imagenes.count()
    disponibles = 4 - existentes

    creadas = []
    for imagen in imagenes[:max(disponibles, 0)]:
        img = ImagenSeguimiento.objects.create(imagen=imagen, **campo)
        creadas.append({'id': img.id, 'url': img.imagen.url})

    return JsonResponse({'ok': True, 'imagenes': creadas, 'total': seg.imagenes.count()})


@login_required
def imagenes_seguimiento(request, tipo, seg_pk):
    if tipo == 'ot':
        seg = get_object_or_404(SeguimientoOT, pk=seg_pk)
    else:
        seg = get_object_or_404(SeguimientoManual, pk=seg_pk)
    imagenes = [{'id': img.id, 'url': img.imagen.url} for img in seg.imagenes.all()]
    return JsonResponse({'imagenes': imagenes})


@login_required
@require_POST
@requiere_permiso_json('editar_seguimiento')
def eliminar_imagen_seguimiento(request, imagen_id):
    imagen = get_object_or_404(ImagenSeguimiento, id=imagen_id)
    imagen.imagen.delete()
    imagen.delete()
    return JsonResponse({'ok': True})