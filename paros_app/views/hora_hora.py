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


HORAS_DIA   = list(range(6, 18))   # 6 a 17
HORAS_NOCHE = list(range(18, 24)) + list(range(0, 6))  # 18 a 23 + 0 a 5


@login_required
def hora_hora(request):
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    if not es_admin and not (perfil and perfil.ver_hora_hora):
        return redirect('paros:lista_paros')

    if es_admin:
        areas            = Area.objects.all()
        areas_con_tablas = set(Area.objects.values_list('id', flat=True))
        areas_grafico    = Area.objects.all()
    else:
        areas_con_tablas = set(perfil.areas_hora_hora.values_list('id', flat=True)) if perfil else set()
        areas_con_tablas_qs = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
        # Mostrar todas las áreas en el listado pero solo permitir tablas en las asignadas
        areas = perfil.areas_hora_hora.all() if perfil else Area.objects.none()
        areas_grafico = areas_con_tablas_qs if areas_con_tablas else Area.objects.all()

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
    import calendar
    from ..models import TargetHoraHora

    area_id = request.GET.get('area_id')
    vista   = request.GET.get('vista', 'dia')  # dia | mes | anio
    desde   = request.GET.get('desde', '')
    hasta   = request.GET.get('hasta', '')

    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    try:
        area = Area.objects.get(id=area_id)
    except Area.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Área no encontrada'}, status=404)

    if not es_admin:
        if not perfil or not perfil.areas_permitidas.filter(id=area_id).exists():
            return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)

    resultado = []

    if vista == 'dia':
        try:
            f_desde = date.fromisoformat(desde)
            f_hasta = date.fromisoformat(hasta)
        except ValueError:
            hoy     = date.today()
            f_desde = hoy.replace(day=1)
            f_hasta = hoy

        registros = RegistroHoraHora.objects.filter(
            area=area, fecha__gte=f_desde, fecha__lte=f_hasta
        )

        fechas = []
        d = f_desde
        while d <= f_hasta:
            fechas.append(d)
            d = date(d.year, d.month, d.day + 1) if d.day < calendar.monthrange(d.year, d.month)[1] else \
                date(d.year, d.month + 1, 1) if d.month < 12 else date(d.year + 1, 1, 1)

        for f in fechas:
            regs_dia   = registros.filter(fecha=f, turno='dia')
            regs_noche = registros.filter(fecha=f, turno='noche')
            corridos   = (regs_dia.aggregate(t=Sum('valor'))['t'] or 0) + \
                         (regs_noche.aggregate(t=Sum('valor'))['t'] or 0)
            hrs_dia    = regs_dia.filter(valor__gt=0).count()
            hrs_noche  = regs_noche.filter(valor__gt=0).count()
            planeados  = (hrs_dia + hrs_noche) * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            from ..models import TargetHoraHora
            target_obj = TargetHoraHora.objects.filter(area=area, anio=f.year, mes=f.month).first()
            resultado.append({
                'label':      f.strftime('%d/%m'),
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  target_obj.target_eficiencia if target_obj else None,
            })

    elif vista == 'mes':
        anio      = int(request.GET.get('anio', date.today().year))
        mes_desde = int(request.GET.get('mes_desde', 1))
        mes_hasta = int(request.GET.get('mes_hasta', 12))
        meses_nombres = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
        for mes in range(mes_desde, mes_hasta + 1):
            regs = RegistroHoraHora.objects.filter(
                area=area, fecha__year=anio, fecha__month=mes
            )
            corridos   = regs.aggregate(t=Sum('valor'))['t'] or 0
            planeados  = regs.filter(valor__gt=0).count() * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            target_obj = TargetHoraHora.objects.filter(area=area, anio=anio, mes=mes).first()
            resultado.append({
                'label':      meses_nombres[mes - 1],
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  target_obj.target_eficiencia if target_obj else None,
            })

    elif vista == 'anio':
        from ..models import TargetAnualHoraHora
        anio_desde = int(request.GET.get('anio_desde', date.today().year - 4))
        anio_hasta = int(request.GET.get('anio_hasta', date.today().year))
        for anio in range(anio_desde, anio_hasta + 1):
            regs = RegistroHoraHora.objects.filter(area=area, fecha__year=anio)
            corridos   = regs.aggregate(t=Sum('valor'))['t'] or 0
            planeados  = regs.filter(valor__gt=0).count() * 65
            eficiencia = round(corridos / planeados * 100, 1) if planeados > 0 else None
            target_obj = TargetAnualHoraHora.objects.filter(area=area, anio=anio).first()
            resultado.append({
                'label':      str(anio),
                'corridos':   corridos,
                'planeados':  planeados,
                'eficiencia': eficiencia,
                'target_ef':  target_obj.target_eficiencia if target_obj else None,
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