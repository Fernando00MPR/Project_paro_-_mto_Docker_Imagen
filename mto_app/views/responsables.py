from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.utils.translation import gettext as _
from django.utils.translation import gettext_lazy
from django.db.models import Count, Q
from django.http import HttpResponseForbidden
from django.views.decorators.http import require_POST
import json
from collections import Counter
from login_app.permisos import puede_mto
from .utils import requiere_acceso_mto
from ..models import Area, Responsable, RegistroEjecucion
from .utils import areas_permitidas_mto, areas_visibles_mto
from django.http import JsonResponse
from django.db import transaction


@login_required
def buscar_responsables_mto(request):
    from django.db import models
    q       = request.GET.get('q', '').strip()
    area_id = request.GET.get('area_id', '').strip()

    qs = Responsable.objects.select_related('area').filter(activo=True)

    if area_id:
        try:
            from paros_app.models import Area as AreaParos
            area_paros = AreaParos.objects.get(pk=area_id)
            nombres_posibles = set(filter(None, [
                getattr(area_paros, 'nombre_es', None),
                getattr(area_paros, 'nombre_en', None),
                area_paros.nombre,
            ]))
        except Exception:
            nombres_posibles = set()

        if nombres_posibles:
            from mto_app.models import Area as AreaMto
            q_nombres = models.Q()
            for nombre in nombres_posibles:
                q_nombres |= models.Q(nombre__iexact=nombre)
            area_mto = AreaMto.objects.filter(q_nombres).first()
            qs = qs.filter(area=area_mto) if area_mto else qs.none()
        else:
            qs = qs.none()

    if q:
        qs = (qs.filter(nombre__icontains=q) | qs.filter(apellidos__icontains=q))

    data = [
        {
            'codigo':      r.nomina_visible(),
            'nombre':      f"{r.nombre} {r.apellidos}",
            'descripcion': r.posicion,
        }
        for r in qs[:15]
    ]
    return JsonResponse(data, safe=False)


# ── Modal "Responsables" (Plan de mantenimiento) ─────────────────────────────
# Orden y nombres de los puestos que se ofrecen; se guardan en Responsable.posicion (texto libre).
PUESTOS_RESP = [
    ('Gerente',      gettext_lazy('Gerente')),
    ('Coordinador',  gettext_lazy('Coordinador')),
    ('Supervisor',   gettext_lazy('Supervisor')),
    ('Líder',        gettext_lazy('Líder')),
    ('Técnico',      gettext_lazy('Técnico')),
    ('Auxiliar',     gettext_lazy('Auxiliar')),
]


def _uso_responsables(ids):
    """{id: nº de registros semanales donde esa persona es el responsable o quien validó}."""
    uso = Counter()
    for campo in ('responsable', 'validado_por'):
        filas = (RegistroEjecucion.objects.filter(**{campo + '__in': ids})
                 .order_by().values(campo).annotate(n=Count('id')))
        for x in filas:
            uso[x[campo]] += x['n']
    return uso

@login_required
def responsables_modal(request):
    """Contenido HTML del modal de Responsables: KPIs, búsqueda, estado, puestos y tabla."""
    if not puede_mto(request.user, 'ver_responsables'):
        return HttpResponseForbidden(_("No tienes permiso para ver esta sección."))

    areas = list(areas_visibles_mto(request))
    area_id = request.GET.get('area', '').strip()
    q = request.GET.get('q', '').strip()
    estado = request.GET.get('estado', 'activos')
    if estado not in ('activos', 'inactivos', 'todos'):
        estado = 'activos'
    puesto = request.GET.get('puesto', '').strip()

    base = Responsable.objects.select_related('area').filter(area__in=areas, eliminado=False)
    area_nombre = ''
    if area_id.isdigit():
        base = base.filter(area_id=int(area_id))
        area_nombre = next((a.nombre for a in areas if a.pk == int(area_id)), '')
    if q:
        base = base.filter(Q(nombre__icontains=q) | Q(apellidos__icontains=q) |
                           Q(numero_nomina__icontains=q) | Q(posicion__icontains=q))

    n_act = base.filter(activo=True).count()
    n_ina = base.filter(activo=False).count()

    qs = base
    if estado == 'activos':
        qs = qs.filter(activo=True)
    elif estado == 'inactivos':
        qs = qs.filter(activo=False)

    conteo = Counter(qs.values_list('posicion', flat=True))
    etiquetas = dict(PUESTOS_RESP)
    chips = [{'valor': v, 'label': etiquetas[v], 'n': conteo[v]} for v, _l in PUESTOS_RESP if conteo.get(v)]
    chips += [{'valor': v, 'label': v, 'n': n} for v, n in sorted(conteo.items()) if v and v not in etiquetas]
    if puesto:
        qs = qs.filter(posicion=puesto)

    lista = list(qs.order_by('apellidos', 'nombre'))
    uso = _uso_responsables([r.pk for r in lista])
    filas = [{'r': r, 'puesto_label': etiquetas.get(r.posicion, r.posicion), 'n_reg': uso.get(r.pk, 0)}
             for r in lista]
    ctx = {
        'filas':          filas, 
        'chips':          chips, 
        'q':              q, 
        'f_estado':       estado, 
        'f_puesto':       puesto,
        'n_act':          n_act, 
        'n_ina':          n_ina, 
        'n_total':        n_act + n_ina,
        'area_nombre':    area_nombre,
        'puede_editar':   puede_mto(request.user, 'editar_responsables'),
        'puede_eliminar': puede_mto(request.user, 'eliminar_responsables'),
    }
    return render(request, 'mto_app/responsables/_modal.html', ctx)


@login_required
@require_POST
@transaction.atomic
def responsable_guardar(request, pk=None):
    """Crea o edita un responsable desde el modal. Recibe JSON; devuelve {'ok': True, 'id': …}."""
    if not puede_mto(request.user, 'editar_responsables'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar responsables.")}, status=403)
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'ok': False, 'error': _("Datos no válidos.")}, status=400)

    nomina    = str(data.get('nomina', '')).strip()
    nombre    = str(data.get('nombre', '')).strip()
    apellidos = str(data.get('apellidos', '')).strip()
    posicion  = str(data.get('posicion', '')).strip()[:100]
    activo    = bool(data.get('activo', True))

    errores = {}
    if not nomina:
        errores['nomina'] = _("Escribe el número de nómina")
    if not nombre:
        errores['nombre'] = _("Escribe el nombre")
    if not apellidos:
        errores['apellidos'] = _("Escribe los apellidos")
    if errores:
        return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=400)

    areas = areas_visibles_mto(request)
    if pk:
        r = get_object_or_404(Responsable, pk=pk, area__in=areas, eliminado=False)
        area = r.area
    else:
        r = None
        area = get_object_or_404(areas, pk=data.get('area') or 0)

    # La base no permite repetir (área, nómina): se avisa en el campo en vez de dar error 500
    dup = Responsable.objects.filter(area=area, numero_nomina=nomina).exclude(pk=pk or 0).first()
    if dup and dup.eliminado:
        mismo = (dup.nombre.strip().lower() == nombre.lower() and dup.apellidos.strip().lower() == apellidos.lower())
        if mismo and not r:
            # Es la misma persona: se recupera su ficha y su historial vuelve a estar unido a ella
            dup.posicion, dup.activo, dup.eliminado = posicion, activo, False
            dup.save()
            return JsonResponse({'ok': True, 'id': dup.pk, 'nombre': dup.nombre_completo(), 'recuperado': True})
        # Otra persona con esa nómina: la ficha eliminada conserva su nombre e historial y deja libre la nómina
        dup.numero_nomina = (dup.numero_nomina[:14] + '~E' + str(dup.pk))[:20]
        dup.save(update_fields=['numero_nomina', 'modificado_en'])
        dup = None
    if dup:
        msg = _("Ya existe un responsable con esa nómina en esta área: %(nombre)s.") % {'nombre': dup.nombre_completo()}
        return JsonResponse({'ok': False, 'error': msg, 'errores': {'nomina': msg}}, status=400)

    if r:
        r.numero_nomina, r.nombre, r.apellidos, r.posicion, r.activo = nomina, nombre, apellidos, posicion, activo
        r.save()
    else:
        r = Responsable.objects.create(area=area, numero_nomina=nomina, nombre=nombre,
                                       apellidos=apellidos, posicion=posicion, activo=activo)
    return JsonResponse({'ok': True, 'id': r.pk, 'nombre': r.nombre_completo()})


@login_required
@require_POST
def responsable_alternar(request, pk):
    """Desactiva o reactiva un responsable (no se elimina: conserva su historial)."""
    if not puede_mto(request.user, 'editar_responsables'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para editar responsables.")}, status=403)
    r = get_object_or_404(Responsable, pk=pk, area__in=areas_visibles_mto(request), eliminado=False)
    r.activo = not r.activo
    r.save(update_fields=['activo', 'modificado_en'])
    return JsonResponse({'ok': True, 'activo': r.activo, 'nombre': r.nombre_completo()})


@login_required
@require_POST
def responsable_eliminar_modal(request, pk):
    """Elimina un responsable. Si nunca se usó se borra; si tiene registros NO se borra la fila: se marca como
    eliminado y desactivado, así sus registros conservan su nombre y no cambian."""
    if not puede_mto(request.user, 'eliminar_responsables'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para eliminar responsables.")}, status=403)
    r = get_object_or_404(Responsable, pk=pk, area__in=areas_visibles_mto(request), eliminado=False)
    registros = _uso_responsables([r.pk]).get(r.pk, 0)
    nombre = r.nombre_completo()
    if registros:
        r.eliminado = True
        r.activo = False
        r.save(update_fields=['eliminado', 'activo', 'modificado_en'])
    else:
        r.delete()
    return JsonResponse({'ok': True, 'nombre': nombre, 'registros': registros})
