from datetime import date
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST
from django.db.models import Sum, Q
from django.contrib.auth.models import User
from django.utils.formats import date_format
import json
 
from ..models import Area, Paro, RegistroProduccion, CatalogoEquipo, TargetIndicador
from login_app.permisos import get_perfil
 
 
def _calcular_muerto(paros_qs, equipo_nombre, hora_inicio, hora_fin):
    qs = paros_qs.filter(estatus='verde')
    qs = qs.filter(Q(equipo_es__iexact=equipo_nombre) | Q(equipo_en__iexact=equipo_nombre)) if equipo_nombre else qs
    if hora_fin > hora_inicio:
        qs = qs.filter(hora__gte=hora_inicio, hora__lt=hora_fin)
    else:
        qs = qs.filter(Q(hora__gte=hora_inicio) | Q(hora__lt=hora_fin))
    return qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0

def _calcular_kpis_mantenimiento(paros_qs, equipo_nombre, hora_inicio, hora_fin, tiempo_planeado):
    responsables_mant = ['Mantenimiento', 
                         'Maintenance', 
                         'Robótica', 
                         'Robotic', 
                         'Robotics']
    qs = paros_qs.filter(estatus='verde').filter(responsable__in=responsables_mant)
    if equipo_nombre:
        qs = qs.filter(Q(equipo_es__iexact=equipo_nombre) | Q(equipo_en__iexact=equipo_nombre))
    if hora_fin > hora_inicio:
        qs = qs.filter(hora__gte=hora_inicio, hora__lt=hora_fin)
    else:
        qs = qs.filter(Q(hora__gte=hora_inicio) | Q(hora__lt=hora_fin))
    
    n_paros  = qs.count()
    t_muerto = qs.aggregate(t=Sum('tiempo_minutos'))['t'] or 0
    
    if n_paros == 0:
        return {'mttr': None, 'mtbf': round(tiempo_planeado / 60, 1), 'disponibilidad': None, 'n_paros': 0, 't_muerto': 0}
    
    mttr = round(t_muerto / n_paros, 1)
    mtbf = round((tiempo_planeado - t_muerto) / n_paros / 60, 1)
    disp = round(100 - (t_muerto / tiempo_planeado * 100), 1) if tiempo_planeado else None
    
    return {'mttr': mttr, 'mtbf': mtbf, 'disponibilidad': disp, 'n_paros': n_paros, 't_muerto': t_muerto}
 
@login_required
def registro_produccion(request):
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)
 
    if es_admin:
        areas = Area.objects.all()
    else:
        areas = perfil.areas_produccion.all() if perfil else Area.objects.none()
 
    fecha_str = request.GET.get('fecha', date.today().strftime('%Y-%m-%d'))
    turno     = request.GET.get('turno', '')
 
    try:
        fecha = date.fromisoformat(fecha_str)
    except ValueError:
        fecha = date.today()
 
    registros_qs = RegistroProduccion.objects.filter(fecha=fecha, area__in=areas)
    if turno in ('1', '2'):
        registros_qs = registros_qs.filter(turno=int(turno))
 
    datos_areas = []
    for area in areas:
        regs             = registros_qs.filter(area=area)
        equipos_catalogo = list(CatalogoEquipo.objects.filter(area=area).values_list('equipo', flat=True))

        paros_del_area = Paro.objects.filter(area=area, fecha=fecha) 

        registros_data = []      
        total_planeado = 0       
        total_muerto   = 0      

        for reg in regs:
            equipo_nombre = reg.equipo or ''
            muerto    = _calcular_muerto(paros_del_area, equipo_nombre, reg.hora_inicio, reg.hora_fin)
            planeado  = reg.tiempo_planeado
            downtime  = round(muerto / planeado * 100, 1) if planeado else 0
            total_planeado += planeado
            total_muerto   += muerto

            kpis_mant = _calcular_kpis_mantenimiento(
                paros_del_area,           
                equipo_nombre, reg.hora_inicio, reg.hora_fin, planeado
            )
 
            registros_data.append({
                'id':              reg.id,
                'equipo':          equipo_nombre or 'Área completa',
                'turno':           reg.turno,
                'hora_inicio':     reg.hora_inicio.strftime('%H:%M'),
                'hora_fin':        reg.hora_fin.strftime('%H:%M'),
                'hora_inicio_raw': reg.hora_inicio.strftime('%H:%M'),
                'hora_fin_raw':    reg.hora_fin.strftime('%H:%M'),
                'planeado':        planeado,
                'muerto':          muerto,
                'downtime':        downtime,
                't_muerto_mant':   kpis_mant['t_muerto'],
                'mttr':            kpis_mant['mttr'],
                'mtbf':            kpis_mant['mtbf'],
                'disponibilidad':  round(100 - downtime, 1) if planeado else None,
                'n_paros_mant':    kpis_mant['n_paros'],
            })
 
        
        equipo_unicos      = len(set(r['equipo'] for r in registros_data))
        t_muerto_mant_area = sum(r['t_muerto_mant'] for r in registros_data)
        n_paros_mant_area  = sum(r['n_paros_mant']  for r in registros_data)
        downtime_area      = round(total_muerto / total_planeado * 100, 2) if total_planeado else None
        mttr_area          = round(t_muerto_mant_area / n_paros_mant_area, 1) if n_paros_mant_area else None
        mtbf_area          = round(((total_planeado - t_muerto_mant_area) / n_paros_mant_area / 60) / equipo_unicos, 2) if n_paros_mant_area else round(total_planeado / 60 / max(equipo_unicos, 1), 2)
        disp_area          = round(100 - downtime_area, 1) if downtime_area is not None else None
 
        datos_areas.append({
            'area':           area,
            'registros':      registros_data,
            'equipos':        equipos_catalogo,
            'tiene_equipos':  len(equipos_catalogo) > 0,
            'n_registros':    len(registros_data),
            'total_planeado': total_planeado,
            'total_muerto':   total_muerto, 
            'downtime_area':  downtime_area,
            'disp_area':      disp_area,
            'mttr_area':      mttr_area,
            'mtbf_area':      mtbf_area,
            't_muerto_mant_area': t_muerto_mant_area,
            'n_paros_mant_area': n_paros_mant_area,
        })
 
    return render(request, 'paros_app/registro_produccion.html', {
        'datos_areas': datos_areas,
        'fecha':       fecha.strftime('%Y-%m-%d'),
        'turno':       turno,
    })
  
@login_required
@require_POST
def agregar_registro(request):
    try:
        data      = json.loads(request.body)
        area_id   = data.get('area_id')
        equipo    = data.get('equipo', '').strip()
        fecha_str = data.get('fecha')
        turno     = int(data.get('turno', 1))
        hora_ini  = data.get('hora_inicio')
        hora_fin  = data.get('hora_fin')
 
        area  = Area.objects.get(id=area_id)
        fecha = date.fromisoformat(fecha_str)
 
        from datetime import time as _time
        hi = _time.fromisoformat(hora_ini)
        hf = _time.fromisoformat(hora_fin)
 
        if RegistroProduccion.objects.filter(area=area, equipo=equipo, fecha=fecha, turno=turno).exists():
            return JsonResponse({'ok': False, 'error': 'Ya existe un registro para este equipo y turno en esta fecha.'}, status=400)
 
        reg      = RegistroProduccion.objects.create(area=area, equipo=equipo, fecha=fecha, turno=turno, hora_inicio=hi, hora_fin=hf)
        paros_qs = Paro.objects.filter(area=area, fecha=fecha, turno=turno)
        muerto   = _calcular_muerto(paros_qs, equipo, hi, hf)
        planeado = reg.tiempo_planeado
        downtime = round(muerto / planeado * 100, 1) if planeado else 0
 
        return JsonResponse({'ok': True, 'id': reg.id, 'planeado': planeado, 'muerto': muerto, 'downtime': downtime})
    except Exception as e:
        error = str(e)
        if 'unique' in error.lower() or 'duplicate' in error.lower():
            error = 'Ya existe un registro para este equipo y turno en esta fecha.'
        return JsonResponse({'ok': False, 'error': error}, status=400)
 
@login_required
@require_POST
def eliminar_registro(request, registro_id):
    try:
        RegistroProduccion.objects.filter(id=registro_id).delete()
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
  
@login_required
@require_POST
def actualizar_registro(request, registro_id):
    try:
        data     = json.loads(request.body)
        hora_ini = data.get('hora_inicio')
        hora_fin = data.get('hora_fin')
        turno    = data.get('turno')
        equipo   = data.get('equipo')
 
        from datetime import time as _time
        reg = RegistroProduccion.objects.get(id=registro_id)
        if hora_ini: reg.hora_inicio = _time.fromisoformat(hora_ini)
        if hora_fin: reg.hora_fin    = _time.fromisoformat(hora_fin)
        if turno:    reg.turno       = int(turno)
        if equipo is not None: reg.equipo = equipo
        reg.save()
 
        paros_qs = Paro.objects.filter(area=reg.area, fecha=reg.fecha, turno=reg.turno)
        muerto   = _calcular_muerto(paros_qs, reg.equipo, reg.hora_inicio, reg.hora_fin)
        planeado = reg.tiempo_planeado
        downtime = round(muerto / planeado * 100, 1) if planeado else 0
 
        return JsonResponse({'ok': True, 'planeado': planeado, 'muerto': muerto, 'downtime': downtime})
    except Exception as e:
        error = str(e)
        if 'unique' in error.lower() or 'UniqueViolation' in error or 'duplicada' in error:
            error = 'Ya existe un registro para ese equipo y turno en esta fecha.'
        return JsonResponse({'ok': False, 'error': error}, status=400)
 
@login_required
@require_POST
def actualizar_orden(request):
    try:
        data  = json.loads(request.body)
        orden = data.get('orden', [])
        for i, reg_id in enumerate(orden):
            RegistroProduccion.objects.filter(id=reg_id).update(orden=i)
        return JsonResponse({'ok': True})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
       
@login_required
def indicadores_produccion(request):
    from datetime import timedelta
    
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)

    if not es_admin and not (perfil and perfil.ver_indicadores):
        from django.shortcuts import redirect
        return redirect('paros:lista_paros')
 
    if es_admin:
        areas = Area.objects.all()
    else:
        areas = perfil.areas_produccion.all() if perfil else Area.objects.none()
 
    area_id  = request.GET.get('area', '')
    periodo  = request.GET.get('periodo', 'semana')
    semana_num = request.GET.get('semana_num', '')
    fecha_desde = request.GET.get('fecha_desde', '')
    fecha_hasta = request.GET.get('fecha_hasta', '')
    indicador   = request.GET.get('indicador', 'downtime')
    equipo_sel = request.GET.get('equipo', '')
 
    hoy = date.today()
 
    if periodo == 'semana':
        d_desde = hoy - timedelta(days=hoy.weekday())
        d_hasta = d_desde + timedelta(days=6)
    elif periodo == 'mes':
        d_desde = hoy.replace(day=1)
        d_hasta = hoy
    elif periodo == 'semana_num' and semana_num:
        try:
            sn = int(semana_num)
            d_desde = date.fromisocalendar(hoy.year, sn, 1)
            d_hasta = date.fromisocalendar(hoy.year, sn, 7)
        except:
            d_desde = hoy - timedelta(days=7)
            d_hasta = hoy
    elif periodo == 'semanas':
        d_desde = date(hoy.year, 1, 1)
        d_hasta = hoy
    elif periodo == 'custom' and fecha_desde and fecha_hasta:
        try:
            d_desde = date.fromisoformat(fecha_desde)
            d_hasta = date.fromisoformat(fecha_hasta)
        except:
            d_desde = hoy - timedelta(days=7)
            d_hasta = hoy
    else:
        d_desde = hoy - timedelta(days=hoy.weekday())
        d_hasta = d_desde + timedelta(days=6)
 
    area_sel = None
    if area_id:
        try:
            area_sel = areas.get(id=area_id)
        except:
            pass
    if not area_sel and areas.exists():
        area_sel = areas.first()
 
    datos_dias = []
 
    equipos_catalogo = list(
    CatalogoEquipo.objects.filter(area=area_sel)
    .values_list('equipo', flat=True)
    )
    equipos_periodo = list(
        RegistroProduccion.objects
        .exclude(equipo='')
        .filter(equipo__in=equipos_catalogo)
        .values_list('equipo', flat=True)
        .distinct()
        .order_by('equipo')
    )
 
    if area_sel:
        registros = RegistroProduccion.objects.filter(
            area=area_sel, fecha__gte=d_desde, fecha__lte=d_hasta
        ).order_by('fecha')
 
        from datetime import timedelta
        fechas_rango = []
        d = d_desde
        while d <= d_hasta:
            fechas_rango.append(d)
            d += timedelta(days=1)
 
        for fecha in fechas_rango:
            regs_dia  = registros.filter(fecha=fecha)
            if equipo_sel:
                regs_dia = regs_dia.filter(equipo=equipo_sel)
            paros_dia = Paro.objects.filter(area=area_sel, fecha=fecha)
 
            total_planeado = 0
            total_muerto   = 0
            t_muerto_mant  = 0
            n_paros_mant   = 0
 
            for reg in regs_dia:
                equipo_nombre = reg.equipo or ''
                paros_reg     = paros_dia
                muerto        = _calcular_muerto(paros_reg, equipo_nombre, reg.hora_inicio, reg.hora_fin)
                planeado      = reg.tiempo_planeado
                total_planeado += planeado
                total_muerto   += muerto
 
                kpis = _calcular_kpis_mantenimiento(
                    paros_dia, equipo_nombre, reg.hora_inicio, reg.hora_fin, planeado
                )
                t_muerto_mant += kpis['t_muerto']
                n_paros_mant  += kpis['n_paros']
 
            equipos_unicos = len(set(reg.equipo for reg in regs_dia))
            downtime = round(total_muerto / total_planeado * 100, 1) if total_planeado else (0 if regs_dia else None)
            disp     = round(100 - downtime, 1) if downtime is not None else None
            mttr     = round(t_muerto_mant / n_paros_mant, 1) if n_paros_mant else (0 if total_planeado else None)
            mtbf     = round((total_planeado - t_muerto_mant) / n_paros_mant / 60 / max(equipos_unicos, 1), 1) if n_paros_mant else round(total_planeado / 60 / max(equipos_unicos, 1), 1) if total_planeado else None
 
            datos_dias.append({
                'fecha':           fecha.strftime('%d/%m/%y'),
                'fecha_lbl':       fecha.strftime('%d/%m'),
                'dia_semana':      date_format(fecha, 'l'),
                'planeado':        total_planeado,
                'muerto':          total_muerto,
                'downtime':        downtime,
                'disponibilidad':  disp,
                't_muerto_mant':   t_muerto_mant,
                'mttr':            mttr,
                'mtbf':            mtbf,
                'n_paros_mant':    n_paros_mant,
                'tiene_registros': total_planeado > 0,
                'semana':          fecha.isocalendar()[1],
                'equipos_unicos':  equipos_unicos,
            })
 
    INDICADORES = [
        ('downtime',      'Downtime %'),
        ('disponibilidad','Disponibilidad %'),
        ('mttr',          'MTTR (min)'),
        ('mtbf',          'MTBF (h)'),
        ('t_muerto_mant', 'Tiempo perdido mantenimiento (min)'),
    ]
 
    PERIODO_LABELS = {
        'semana':     'Esta semana',
        'mes':        'Este mes',
        'semana_num': f'Semana {semana_num}',
        'custom':     f'{fecha_desde} al {fecha_hasta}',
    }
 
    ind_lbl   = dict(INDICADORES).get(indicador, 'Downtime %')
    labels    = [d['fecha_lbl'] for d in datos_dias]
    valores = [d.get(indicador) if d.get('tiene_registros') else None for d in datos_dias]
    valores = [0.01 if v == 0 and d.get('tiene_registros') else v for v, d in zip(valores, datos_dias)] 
    min_width = max(600, len(datos_dias) * 50)
 
    target_valor = None
    targets_all  = {}
    target_valor_input = ''

    if area_sel:
        # Usar el mes/año de d_desde (inicio del período seleccionado)
        for t in TargetIndicador.objects.filter(area=area_sel, anio=d_desde.year, mes=d_desde.month):
            targets_all[t.indicador] = t.valor
        target_valor = targets_all.get(indicador)
        
        if target_valor is not None:
            target_valor = float(target_valor)

        target_valor_input = str(target_valor) if target_valor is not None else ''
 
    # Cargar AccionDia existentes y pre-inyectarlos en datos_dias
    from ..models import AccionDia
    from datetime import datetime as _dt
    acciones_map = {}
    if area_sel:
        fechas_date = []
        for d in datos_dias:
            try:
                fechas_date.append(_dt.strptime(d['fecha'], '%d/%m/%y').date())
            except ValueError:
                pass
        for acc in AccionDia.objects.filter(area=area_sel, fecha__in=fechas_date, equipo=equipo_sel or '', indicador=indicador):
            key = acc.fecha.strftime('%d/%m/%y')
            acciones_map[key] = {
                'indicador':         acc.indicador,
                'problema':          acc.problema,
                'cont_accion':       acc.cont_accion,
                'cont_fecha_inicio': acc.cont_fecha_inicio.strftime('%d/%m/%y') if acc.cont_fecha_inicio else '',
                'cont_fecha_fin':    acc.cont_fecha_fin.strftime('%d/%m/%y')    if acc.cont_fecha_fin    else '',
                'cont_estatus':      acc.cont_estatus,
                'corr_accion':       acc.corr_accion,
                'corr_fecha_inicio': acc.corr_fecha_inicio.strftime('%d/%m/%y') if acc.corr_fecha_inicio else '',
                'corr_fecha_fin':    acc.corr_fecha_fin.strftime('%d/%m/%y')    if acc.corr_fecha_fin    else '',
                'corr_estatus':      acc.corr_estatus,
                'prev_accion':       acc.prev_accion,
                'prev_fecha_inicio': acc.prev_fecha_inicio.strftime('%d/%m/%y') if acc.prev_fecha_inicio else '',
                'prev_fecha_fin':    acc.prev_fecha_fin.strftime('%d/%m/%y')    if acc.prev_fecha_fin    else '',
                'prev_estatus':      acc.prev_estatus,
                'responsable':       acc.responsable,
            }
    for d in datos_dias:
        d['accion'] = acciones_map.get(d['fecha'])

    usuarios = User.objects.filter(
        is_active=True
    ).exclude(
        first_name='', last_name=''
    ).order_by('first_name', 'last_name')
 
    return render(request, 'paros_app/indicadores_produccion.html', {
        'usuarios':       usuarios,
        'areas':          areas,
        'area_sel':       area_sel,
        'area_id':        area_id,
        'periodo':        periodo,
        'semana_num':     semana_num,
        'fecha_desde':    fecha_desde,
        'fecha_hasta':    fecha_hasta,
        'indicador':      indicador,
        'indicadores':    INDICADORES,
        'indicador_label':ind_lbl,
        'periodo_label':  PERIODO_LABELS.get(periodo, ''),
        'datos_dias':     datos_dias,
        'labels':         json.dumps(labels),
        'valores':        json.dumps(valores),
        'min_width':      min_width,
        'semana_actual':  hoy.isocalendar()[1],
        'equipo_sel':         equipo_sel,
        'equipos_periodo':    equipos_periodo,
        'target_valor':       target_valor,
        'target_valor_input': target_valor_input,
        'targets_json':       json.dumps(targets_all),
        'd_desde':            d_desde,
    })
 
@login_required
@require_POST
def guardar_target(request):
    from ..models import TargetIndicador
    perfil   = get_perfil(request.user)
    es_admin = request.user.is_superuser or (perfil and perfil.es_admin)
    if not es_admin:
        return JsonResponse({'ok': False, 'error': 'Sin permiso'}, status=403)
    try:
        data      = json.loads(request.body)
        area_id   = data.get('area_id')
        indicador = data.get('indicador')
        valor     = data.get('valor')
        anio      = int(data.get('anio'))    
        mes       = int(data.get('mes'))   
 
        INDICADORES_VALIDOS = ['downtime', 'disponibilidad', 'mttr', 'mtbf']
        if indicador not in INDICADORES_VALIDOS:
            return JsonResponse({'ok': False, 'error': 'Indicador no válido'}, status=400)
 
        area = Area.objects.get(id=area_id)
 
        if valor is None or valor == '':
            TargetIndicador.objects.filter(area=area, indicador=indicador, anio=anio, mes=mes).delete()
            return JsonResponse({'ok': True, 'eliminado': True})

        valor = float(valor)
        obj, _ = TargetIndicador.objects.update_or_create(
            area=area, indicador=indicador, anio=anio, mes=mes,
            defaults={'valor': valor}
        )
        return JsonResponse({'ok': True, 'valor': obj.valor})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
    
@login_required
@require_POST
def guardar_accion_dia(request):
    """Crea o actualiza el registro AccionDia para un área+fecha."""
    from ..models import AccionDia, Paro
    from datetime import datetime
 
    def parse_fecha(s):
        """Acepta dd/mm/aa o dd/mm/yyyy, devuelve date o None."""
        if not s or not s.strip():
            return None
        s = s.strip()
        for fmt in ('%d/%m/%y', '%d/%m/%Y'):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        return None
 
    try:
        data      = json.loads(request.body)
        area_id   = data.get('area_id')
        fecha_str = data.get('fecha')          # formato YYYY-MM-DD (viene del contexto Django)
        area      = Area.objects.get(id=area_id)
        fecha     = datetime.strptime(fecha_str, '%d/%m/%y').date()
 
        # Campos de texto con límite 100 caracteres
        def limitar(val):
            return (val or '').strip()[:100]
 
        # Estatus válidos
        ESTATUS_VALIDOS = {'p', 'e', 'c'}
        def validar_estatus(val):
            return val if val in ESTATUS_VALIDOS else 'p'
 
        campos = {
            'problema':          limitar(data.get('problema')),
            'cont_accion':       limitar(data.get('cont_accion')),
            'cont_fecha_inicio': parse_fecha(data.get('cont_fecha_inicio')),
            'cont_fecha_fin':    parse_fecha(data.get('cont_fecha_fin')),
            'cont_estatus':      validar_estatus(data.get('cont_estatus')),
            'corr_accion':       limitar(data.get('corr_accion')),
            'corr_fecha_inicio': parse_fecha(data.get('corr_fecha_inicio')),
            'corr_fecha_fin':    parse_fecha(data.get('corr_fecha_fin')),
            'corr_estatus':      validar_estatus(data.get('corr_estatus')),
            'prev_accion':       limitar(data.get('prev_accion')),
            'prev_fecha_inicio': parse_fecha(data.get('prev_fecha_inicio')),
            'prev_fecha_fin':    parse_fecha(data.get('prev_fecha_fin')),
            'prev_estatus':      validar_estatus(data.get('prev_estatus')),
            'responsable':       limitar(data.get('responsable')),
        }
 
        equipo    = data.get('equipo', '').strip()
        equipo_key    = (data.get('equipo') or '').strip()[:100]
        indicador_key = (data.get('indicador') or '').strip()[:20]
 
        obj, created = AccionDia.objects.update_or_create(
            area=area, fecha=fecha, equipo=equipo_key, indicador=indicador_key,
            defaults=campos
        )
 
        return JsonResponse({
            'ok':      True,
            'created': created,
            'msg':     'Guardado correctamente' if created else 'Actualizado correctamente',
        })
 
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
 
@login_required
def get_accion_dia(request):
    """Devuelve el AccionDia existente para área+fecha (GET)."""
    from ..models import AccionDia
    from datetime import datetime
 
    area_id   = request.GET.get('area_id')
    fecha_str = request.GET.get('fecha')
    try:
        area  = Area.objects.get(id=area_id)
        fecha = datetime.strptime(fecha_str, '%d/%m/%y').date()
        equipo    = request.GET.get('equipo', '')
        indicador = request.GET.get('indicador', '')
        obj = AccionDia.objects.get(area=area, fecha=fecha, equipo=equipo, indicador=indicador)
 
        def fmt(d):
            return d.strftime('%d/%m/%y') if d else ''
 
        return JsonResponse({'ok': True, 'data': {
            'indicador':         obj.indicador,
            'problema':          obj.problema,
            'cont_accion':       obj.cont_accion,
            'cont_fecha_inicio': fmt(obj.cont_fecha_inicio),
            'cont_fecha_fin':    fmt(obj.cont_fecha_fin),
            'cont_estatus':      obj.cont_estatus,
            'corr_accion':       obj.corr_accion,
            'corr_fecha_inicio': fmt(obj.corr_fecha_inicio),
            'corr_fecha_fin':    fmt(obj.corr_fecha_fin),
            'corr_estatus':      obj.corr_estatus,
            'prev_accion':       obj.prev_accion,
            'prev_fecha_inicio': fmt(obj.prev_fecha_inicio),
            'prev_fecha_fin':    fmt(obj.prev_fecha_fin),
            'prev_estatus':      obj.prev_estatus,
            'responsable':       obj.responsable,
        }})
    except AccionDia.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'No existe'})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=400)
 