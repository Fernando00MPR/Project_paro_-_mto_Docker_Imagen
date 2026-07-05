import json
from datetime import date
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST
from django.db.models import Sum

from ..models import Area, RegistroHoraHora
from login_app.permisos import get_perfil
from django.shortcuts import redirect

from datetime import timedelta


HORAS_DIA   = list(range(6, 18))   # 6 a 17
HORAS_NOCHE = list(range(18, 24)) + list(range(0, 6))  # 18 a 23 + 0 a 5


@login_required
def hora_hora(request):
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    if not es_admin and not (perfil and perfil.ver_hora_hora):
        return redirect('paros:lista_paros')
    """
    if es_admin:
        areas            = Area.objects.all()
        areas_con_tablas = set(Area.objects.values_list('id', flat=True))
        areas_grafico    = Area.objects.all()
    else:
        areas_con_tablas = set(perfil.areas_hora_hora.values_list('id', flat=True)) if perfil else set()
        areas_con_tablas_qs = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
        
        areas = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
        areas_grafico = areas_con_tablas_qs if areas_con_tablas else Area.objects.all()
        
    """
    areas_con_tablas = set(perfil.areas_hora_hora.values_list('id', flat=True)) if perfil else set()
    areas_con_tablas_qs = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
    
    areas = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
    areas_grafico = areas_con_tablas_qs
    
    hoy   = date.today()
    anio  = int(request.GET.get('anio', hoy.year))
    mes   = int(request.GET.get('mes',  hoy.month))

    import calendar
    dias_mes = calendar.monthrange(anio, mes)[1]
    dias     = list(range(1, dias_mes + 1))

    registros_qs = RegistroHoraHora.objects.filter(
        area__in=areas,
        fecha__year=anio,
        fecha__month=mes,
    )

    # Organizar registros en dict {area_id: {turno: {dia: {hora: valor}}}}
    datos = {}
    for r in registros_qs:
        aid = r.area_id
        d   = r.fecha.day
        if aid not in datos:
            datos[aid] = {'dia': {}, 'noche': {}}
        if d not in datos[aid][r.turno]:
            datos[aid][r.turno][d] = {}
        datos[aid][r.turno][d][r.hora] = r.valor

    # Calcular totales por turno por día
    totales = {}
    for aid in datos:
        totales[aid] = {'dia': {}, 'noche': {}}
        for turno in ('dia', 'noche'):
            for d in dias:
                totales[aid][turno][d] = sum(
                    datos[aid][turno].get(d, {}).values()
                )

    meses = [
        (1,'Enero'),(2,'Febrero'),(3,'Marzo'),(4,'Abril'),
        (5,'Mayo'),(6,'Junio'),(7,'Julio'),(8,'Agosto'),
        (9,'Septiembre'),(10,'Octubre'),(11,'Noviembre'),(12,'Diciembre'),
    ]

    return render(request, 'paros_app/hora_hora.html', {
        'areas':              areas,
        'dias':               dias,
        'dias_mes':           dias_mes,
        'anio':               anio,
        'mes':                mes,
        'meses':              meses,
        'horas_dia':          HORAS_DIA,
        'horas_noche':        HORAS_NOCHE,
        'datos_json':         json.dumps(datos),
        'totales_json':       json.dumps(totales),
        'areas_con_tablas':   areas_con_tablas,
        'areas_grafico':      areas_grafico,
    })


@login_required
@require_POST
def guardar_hora_hora(request):
    try:
        data   = json.loads(request.body)
        area_id = data.get('area_id')
        fecha_str = data.get('fecha')   # YYYY-MM-DD
        turno  = data.get('turno')
        hora   = int(data.get('hora'))
        valor  = data.get('valor')

        perfil   = get_perfil(request.user)
        es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

        area = Area.objects.get(id=area_id)

        if not es_admin:
            if not perfil or not perfil.areas_permitidas.filter(id=area_id).exists():
                return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

        fecha = date.fromisoformat(fecha_str)

        if valor is None or valor == '':
            RegistroHoraHora.objects.filter(
                area=area, fecha=fecha, turno=turno, hora=hora
            ).delete()
            return JsonResponse({'ok': True, 'eliminado': True})

        valor = int(valor)
        if valor < 0 or valor > 99:
            return JsonResponse({'ok': False, 'error': 'El valor debe estar entre 0 y 99'}, status=400)
        obj, created = RegistroHoraHora.objects.update_or_create(
            area=area, fecha=fecha, turno=turno, hora=hora,
            defaults={'valor': valor}
        )
        return JsonResponse({'ok': True, 'created': created, 'valor': obj.valor})

    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
    

@login_required
def eficiencia_data(request):
    from collections import defaultdict
    from django.db.models import Q

    area_id = request.GET.get('area_id')
    vista   = request.GET.get('vista', 'dia')  # dia | mes | anio
    desde   = request.GET.get('desde', '')
    hasta   = request.GET.get('hasta', '')

    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    if not area_id or not area_id.isdigit():
        return JsonResponse({'ok': False, 'error': 'Área requerida'}, status=400)

    try:
        area = Area.objects.get(id=area_id)
    except Area.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Área no encontrada'}, status=404)
    if not es_admin:
        if not perfil or not perfil.areas_permitidas.filter(id=area_id).exists():
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    resultado = []
    from ..models import TargetHoraHora

    if vista == 'dia':
        try:
            f_desde = date.fromisoformat(desde)
            f_hasta = date.fromisoformat(hasta)
        except ValueError:
            hoy     = date.today()
            f_desde = hoy.replace(day=1)
            f_hasta = hoy

        # 1 query: todos los registros del rango
        regs_vals = RegistroHoraHora.objects.filter(
            area=area, fecha__gte=f_desde, fecha__lte=f_hasta
        ).values('fecha', 'turno', 'valor')

        dia_sum   = defaultdict(int)
        dia_hrs   = defaultdict(int)
        noche_sum = defaultdict(int)
        noche_hrs = defaultdict(int)
        for r in regs_vals:
            v = r['valor'] or 0
            if r['turno'] == 'dia':
                dia_sum[r['fecha']]   += v
                if v > 0: dia_hrs[r['fecha']] += 1
            else:
                noche_sum[r['fecha']] += v
                if v > 0: noche_hrs[r['fecha']] += 1

        # 1 query: todos los targets de los meses en el rango
        anios_meses = set()

        d = f_desde
        while d <= f_hasta:
            anios_meses.add((d.year, d.month))
            d += timedelta(days=1)

        q_targets = Q()
        for (y, m) in anios_meses:
            q_targets |= Q(anio=y, mes=m)
        targets_map = {
            (t.anio, t.mes): t.target_eficiencia
            for t in TargetHoraHora.objects.filter(area=area).filter(q_targets)
        } if anios_meses else {}

        d = f_desde
        while d <= f_hasta:
            corridos  = dia_sum[d] + noche_sum[d]
            planeados = (dia_hrs[d] + noche_hrs[d]) * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            
            resultado.append({
                'label':      d.strftime('%d/%m'),
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  targets_map.get((d.year, d.month)),
            })
            d += timedelta(days=1)

    elif vista == 'mes':
        anio      = int(request.GET.get('anio', date.today().year))
        mes_desde = int(request.GET.get('mes_desde', 1))
        mes_hasta = int(request.GET.get('mes_hasta', 12))

        # 1 query: todos los registros del año/meses
        regs_vals = RegistroHoraHora.objects.filter(
            area=area, fecha__year=anio,
            fecha__month__gte=mes_desde, fecha__month__lte=mes_hasta
        ).values('fecha', 'turno', 'valor')

        mes_sum = defaultdict(int)
        mes_hrs = defaultdict(int)
        for r in regs_vals:
            v = r['valor'] or 0
            mes_sum[r['fecha'].month] += v
            if v > 0:
                mes_hrs[r['fecha'].month] += 1

        # 1 query: todos los targets del año/meses
        targets_map = {
            t.mes: t.target_eficiencia
            for t in TargetHoraHora.objects.filter(
                area=area, anio=anio,
                mes__gte=mes_desde, mes__lte=mes_hasta
            )
        }

        meses_nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
        for mes in range(mes_desde, mes_hasta + 1):
            corridos  = mes_sum[mes]
            planeados = mes_hrs[mes] * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            resultado.append({
                'label':      meses_nombres[mes - 1],
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  targets_map.get(mes),
            })

    elif vista == 'anio':
        from ..models import TargetAnualHoraHora
        anio_desde = int(request.GET.get('anio_desde', date.today().year - 4))
        anio_hasta = int(request.GET.get('anio_hasta', date.today().year))

        # 1 query: todos los registros del rango de años
        regs_vals = RegistroHoraHora.objects.filter(
            area=area,
            fecha__year__gte=anio_desde,
            fecha__year__lte=anio_hasta
        ).values('fecha', 'turno', 'valor')

        anio_sum = defaultdict(int)
        anio_hrs = defaultdict(int)
        for r in regs_vals:
            v = r['valor'] or 0
            anio_sum[r['fecha'].year] += v
            if v > 0:
                anio_hrs[r['fecha'].year] += 1

        # 1 query: todos los targets del rango de años
        targets_map = {
            t.anio: t.target_eficiencia
            for t in TargetAnualHoraHora.objects.filter(
                area=area, anio__gte=anio_desde, anio__lte=anio_hasta
            )
        }

        for anio in range(anio_desde, anio_hasta + 1):
            
            corridos  = anio_sum[anio]
            planeados = anio_hrs[anio] * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            
            resultado.append({
                'label':      str(anio),
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  targets_map.get(anio),
            })

    return JsonResponse({'ok': True, 'datos': resultado})

@login_required
@require_POST
def guardar_target_hora_hora(request):
    try:
        from ..models import TargetHoraHora
        data              = json.loads(request.body)
        area_id           = data.get('area_id')
        anio              = int(data.get('anio'))
        mes               = int(data.get('mes'))
        target_skid       = data.get('target_skid')
        target_eficiencia = data.get('target_eficiencia')

        perfil   = get_perfil(request.user)
        es_admin = request.user.is_superuser or (perfil and perfil.es_admin)
        if not es_admin:
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

        area = Area.objects.get(id=area_id)

        obj, _ = TargetHoraHora.objects.update_or_create(
            area=area, anio=anio, mes=mes,
            defaults={
                'target_skid':       int(target_skid)       if target_skid       not in (None, '') else None,
                'target_eficiencia': float(target_eficiencia) if target_eficiencia not in (None, '') else None,
            }
        )
        return JsonResponse({
            'ok':                True,
            'target_skid':       obj.target_skid,
            'target_eficiencia': obj.target_eficiencia,
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
def get_target_hora_hora(request):
    try:
        from ..models import TargetHoraHora
        area_id = request.GET.get('area_id')
        anio    = int(request.GET.get('anio'))
        mes     = int(request.GET.get('mes'))
        area    = Area.objects.get(id=area_id)
        obj     = TargetHoraHora.objects.filter(area=area, anio=anio, mes=mes).first()
        return JsonResponse({
            'ok':                True,
            'target_skid':       obj.target_skid       if obj else None,
            'target_eficiencia': obj.target_eficiencia if obj else None,
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
    

@login_required
@require_POST
def guardar_target_anual_hora_hora(request):
    try:
        from ..models import TargetAnualHoraHora
        data              = json.loads(request.body)
        area_id           = data.get('area_id')
        anio              = int(data.get('anio'))
        target_eficiencia = data.get('target_eficiencia')

        perfil   = get_perfil(request.user)
        es_admin = request.user.is_superuser or (perfil and perfil.es_admin)
        if not es_admin:
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

        area = Area.objects.get(id=area_id)

        obj, _ = TargetAnualHoraHora.objects.update_or_create(
            area=area, anio=anio,
            defaults={
                'target_eficiencia': float(target_eficiencia) if target_eficiencia not in (None, '') else None,
            }
        )
        return JsonResponse({
            'ok':                True,
            'target_eficiencia': obj.target_eficiencia,
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)


@login_required
def get_target_anual_hora_hora(request):
    try:
        from ..models import TargetAnualHoraHora
        area_id = request.GET.get('area_id')
        anio    = int(request.GET.get('anio'))
        area    = Area.objects.get(id=area_id)
        obj     = TargetAnualHoraHora.objects.filter(area=area, anio=anio).first()
        return JsonResponse({
            'ok':                True,
            'target_eficiencia': obj.target_eficiencia if obj else None,
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)