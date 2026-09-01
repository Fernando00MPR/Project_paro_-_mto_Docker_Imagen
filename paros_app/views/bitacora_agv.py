import json
import calendar
from datetime import date, timedelta
from collections import defaultdict

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST
from django.db.models import Q
from django.utils.translation import gettext as _

from ..models import RegistroAgv, ConfiguracionAgv, TargetAgv
from login_app.permisos import get_perfil


AREAS_INTERNAS_VALIDAS = {'inyeccion', 'pintura'}


def _area_agv():
    config = ConfiguracionAgv.objects.select_related('area').first()
    return config.area if config else None


def _puede_editar(request):
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)
    return es_admin or (perfil and perfil.editar_bitacora_agv)


@login_required
def bitacora_agv(request):
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    if not es_admin and not (perfil and perfil.ver_bitacora_agv):
        return redirect('paros:lista_paros')

    area = _area_agv()

    hoy   = date.today()
    anio  = int(request.GET.get('anio', hoy.year))
    mes   = int(request.GET.get('mes', hoy.month))

    dias_mes = calendar.monthrange(anio, mes)[1]
    dias     = list(range(1, dias_mes + 1))

    datos = {}
    if area:
        registros_qs = RegistroAgv.objects.filter(area=area, fecha__year=anio, fecha__month=mes)
        for r in registros_qs:
            d = r.fecha.day
            datos.setdefault(r.area_interna, {'dia': {}, 'noche': {}})
            datos[r.area_interna][r.turno][d] = {'cantidad': r.cantidad, 'comentario': r.comentario}

    meses = [
        (1, _('Enero')), (2, _('Febrero')), (3, _('Marzo')), (4, _('Abril')),
        (5, _('Mayo')), (6, _('Junio')), (7, _('Julio')), (8, _('Agosto')),
        (9, _('Septiembre')), (10, _('Octubre')), (11, _('Noviembre')), (12, _('Diciembre')),
    ]

    return render(request, 'paros_app/bitacora_agv.html', {
        'area':           area,
        'dias':           dias,
        'dias_mes':       dias_mes,
        'anio':           anio,
        'mes':            mes,
        'meses':          meses,
        'datos_json':     json.dumps(datos),
        'areas_internas': RegistroAgv.AREA_INTERNA_CHOICES,
        'puede_editar':   _puede_editar(request),
    })


@login_required
@require_POST
def guardar_agv(request):
    try:
        if not _puede_editar(request):
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

        data         = json.loads(request.body)
        area_interna = data.get('area_interna')
        fecha_str    = data.get('fecha')
        turno        = data.get('turno')
        cantidad     = data.get('cantidad')
        comentario   = (data.get('comentario') or '').strip()[:200]

        if area_interna not in AREAS_INTERNAS_VALIDAS:
            return JsonResponse({'ok': False, 'error': 'Área interna inválida'}, status=400)

        area = _area_agv()
        if not area:
            return JsonResponse({'ok': False, 'error': 'Área no configurada'}, status=400)

        fecha = date.fromisoformat(fecha_str)

        if cantidad is None or cantidad == '':
            RegistroAgv.objects.filter(area=area, area_interna=area_interna, fecha=fecha, turno=turno).delete()
            return JsonResponse({'ok': True, 'eliminado': True})

        cantidad = int(cantidad)
        if cantidad < 0 or cantidad > 100:
            return JsonResponse({'ok': False, 'error': 'La cantidad debe estar entre 0 y 100'}, status=400)

        obj, created = RegistroAgv.objects.update_or_create(
            area=area, area_interna=area_interna, fecha=fecha, turno=turno,
            defaults={'cantidad': cantidad, 'comentario': comentario}
        )
        return JsonResponse({'ok': True, 'created': created, 'cantidad': obj.cantidad, 'comentario': obj.comentario})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
@require_POST
def guardar_target_agv(request):
    try:
        if not _puede_editar(request):
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

        data            = json.loads(request.body)
        area_interna    = data.get('area_interna')
        anio            = int(data.get('anio'))
        mes             = int(data.get('mes'))
        target_cantidad = data.get('target_cantidad')

        if area_interna not in AREAS_INTERNAS_VALIDAS:
            return JsonResponse({'ok': False, 'error': 'Área interna inválida'}, status=400)

        area = _area_agv()
        if not area:
            return JsonResponse({'ok': False, 'error': 'Área no configurada'}, status=400)

        obj, _ = TargetAgv.objects.update_or_create(
            area=area, area_interna=area_interna, anio=anio, mes=mes,
            defaults={'target_cantidad': int(target_cantidad) if target_cantidad not in (None, '') else None}
        )
        return JsonResponse({'ok': True, 'target_cantidad': obj.target_cantidad})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
def get_target_agv(request):
    try:
        area_interna = request.GET.get('area_interna')
        anio = int(request.GET.get('anio'))
        mes  = int(request.GET.get('mes'))
        area = _area_agv()
        obj  = TargetAgv.objects.filter(area=area, area_interna=area_interna, anio=anio, mes=mes).first() if area else None
        return JsonResponse({'ok': True, 'target_cantidad': obj.target_cantidad if obj else None})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
def cumplimiento_agv_data(request):
    area_interna = request.GET.get('area_interna')
    vista        = request.GET.get('vista', 'dia')
    desde        = request.GET.get('desde', '')
    hasta        = request.GET.get('hasta', '')

    if area_interna not in AREAS_INTERNAS_VALIDAS:
        return JsonResponse({'ok': False, 'error': 'Área interna inválida'}, status=400)

    area = _area_agv()
    if not area:
        return JsonResponse({'ok': False, 'error': 'Área no configurada'}, status=400)

    resultado = []

    if vista == 'dia':
        try:
            f_desde = date.fromisoformat(desde)
            f_hasta = date.fromisoformat(hasta)
        except ValueError:
            hoy     = date.today()
            f_desde = hoy.replace(day=1)
            f_hasta = hoy

        regs_vals = RegistroAgv.objects.filter(
            area=area, area_interna=area_interna, fecha__gte=f_desde, fecha__lte=f_hasta
        ).values('fecha', 'cantidad')

        cant_sum   = defaultdict(int)
        turnos_sum = defaultdict(int)
        for r in regs_vals:
            cant_sum[r['fecha']]   += r['cantidad'] or 0
            turnos_sum[r['fecha']] += 1

        anios_meses = set()
        d = f_desde
        while d <= f_hasta:
            anios_meses.add((d.year, d.month))
            d += timedelta(days=1)

        q_targets = Q()
        for (y, m) in anios_meses:
            q_targets |= Q(anio=y, mes=m)
        targets_map = {
            (t.anio, t.mes): t.target_cantidad
            for t in TargetAgv.objects.filter(area=area, area_interna=area_interna).filter(q_targets)
        } if anios_meses else {}

        d = f_desde
        while d <= f_hasta:
            cantidad     = cant_sum[d]
            target       = targets_map.get((d.year, d.month))
            planeado     = (target * turnos_sum[d]) if (target and turnos_sum[d]) else None
            cumplimiento = round(cantidad / planeado * 100, 1) if planeado else None
            resultado.append({
                'label':        d.strftime('%d/%m'),
                'cantidad':     cantidad,
                'target':       planeado,
                'cumplimiento': cumplimiento,
            })
            d += timedelta(days=1)

    elif vista == 'mes':
        anio      = int(request.GET.get('anio', date.today().year))
        mes_desde = int(request.GET.get('mes_desde', 1))
        mes_hasta = int(request.GET.get('mes_hasta', 12))

        regs_vals = RegistroAgv.objects.filter(
            area=area, area_interna=area_interna, fecha__year=anio,
            fecha__month__gte=mes_desde, fecha__month__lte=mes_hasta
        ).values('fecha', 'cantidad')

        mes_sum    = defaultdict(int)
        turnos_mes = defaultdict(int)
        for r in regs_vals:
            mes_sum[r['fecha'].month]    += r['cantidad'] or 0
            turnos_mes[r['fecha'].month] += 1

        targets_map = {
            t.mes: t.target_cantidad
            for t in TargetAgv.objects.filter(
                area=area, area_interna=area_interna, anio=anio,
                mes__gte=mes_desde, mes__lte=mes_hasta
            )
        }

        meses_nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
        for mes in range(mes_desde, mes_hasta + 1):
            cantidad     = mes_sum[mes]
            target       = targets_map.get(mes)
            planeado     = (target * turnos_mes[mes]) if (target and turnos_mes[mes]) else None
            cumplimiento = round(cantidad / planeado * 100, 1) if planeado else None
            resultado.append({
                'label':        meses_nombres[mes - 1],
                'cantidad':     cantidad,
                'target':       planeado,
                'cumplimiento': cumplimiento,
            })

    elif vista == 'anio':
        anio_desde = int(request.GET.get('anio_desde', date.today().year - 4))
        anio_hasta = int(request.GET.get('anio_hasta', date.today().year))

        regs_vals = RegistroAgv.objects.filter(
            area=area, area_interna=area_interna,
            fecha__year__gte=anio_desde, fecha__year__lte=anio_hasta
        ).values('fecha', 'cantidad')

        anio_sum         = defaultdict(int)
        turnos_anio_mes  = defaultdict(int)  # clave (anio, mes)
        for r in regs_vals:
            y, m = r['fecha'].year, r['fecha'].month
            anio_sum[y]              += r['cantidad'] or 0
            turnos_anio_mes[(y, m)]  += 1

        targets_map = {
            (t.anio, t.mes): t.target_cantidad
            for t in TargetAgv.objects.filter(
                area=area, area_interna=area_interna, anio__gte=anio_desde, anio__lte=anio_hasta
            )
        }

        for anio in range(anio_desde, anio_hasta + 1):
            cantidad = anio_sum[anio]
            planeado = 0
            for mes in range(1, 13):
                target_mes = targets_map.get((anio, mes))
                if target_mes:
                    planeado += target_mes * turnos_anio_mes.get((anio, mes), 0)
            planeado     = planeado or None
            cumplimiento = round(cantidad / planeado * 100, 1) if planeado else None
            resultado.append({
                'label':        str(anio),
                'cantidad':     cantidad,
                'target':       planeado,
                'cumplimiento': cumplimiento,
            })

    return JsonResponse({'ok': True, 'datos': resultado})
