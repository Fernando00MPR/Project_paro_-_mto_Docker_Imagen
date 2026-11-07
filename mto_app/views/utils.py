from datetime import date, timedelta
from functools import wraps
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils.translation import gettext as _
from login_app.permisos import puede_mto
from ..models import Area

INTERVALO = {
    'semanal':       1,
    'quincenal':     2,
    'mensual':       4,
    'bimestral':     9,
    'trimestral':    13,
    'cuatrimestral': 17,
    'semestral':     26,
    'anual':         52,
}


def lunes_de_semana(anio, semana):
    return date.fromisocalendar(anio, semana, 1)

ORDEN_PLAN_PERMITIDO = {
    'codigo': 'codigo', '-codigo': '-codigo',
    'actividad': 'actividad', '-actividad': '-actividad',
}


def _aplicar_orden_plan(qs, get_params):
    """Ordena el queryset de PlanMantenimiento por codigo/actividad vía ?orden=.
    plan_trabajo no se puede ordenar en SQL de forma fiable (es texto tipo '1','2','10'),
    así que ese caso se resuelve aparte con un sort en Python (ver _orden_por_plan_trabajo)."""
    campo = ORDEN_PLAN_PERMITIDO.get(get_params.get('orden', ''))
    if campo:
        return qs.order_by(campo)
    return qs


def _orden_por_plan_trabajo(planes, orden):
    """Reordena en Python una lista de PlanMantenimiento por N° de plan (plan_trabajo),
    tratando los valores numéricos como números para no ordenar '10' antes que '2'."""
    if orden not in ('plan_trabajo', '-plan_trabajo'):
        return planes
    planes.sort(
        key=lambda p: (0, int(p.plan_trabajo)) if str(p.plan_trabajo).isdigit() else (1, str(p.plan_trabajo)),
        reverse=orden.startswith('-')
    )
    return planes


def _planes_que_tocan(planes, lunes):
    """Filtra los planes cuya frecuencia toca en la semana del lunes dado."""
    resultado = []
    for plan in planes:
        if not plan.semana_inicio or not plan.anio_inicio:
            continue
        try:
            intervalo = INTERVALO.get(plan.frecuencia, 1)
            ref_lunes = lunes_de_semana(plan.anio_inicio, plan.semana_inicio)
            delta     = (lunes - ref_lunes).days
            sem_delta = delta // 7
            if delta >= 0 and sem_delta % intervalo == 0:
                resultado.append(plan)
        except Exception:
            continue
    return resultado


def numero_ot(lunes, consecutivo):
    """No. de OT como en el Excel de la semana: semana ISO + mes y año del lunes + 100 + consecutivo (101, 102…)."""
    return f"{lunes.isocalendar()[1]:02d}{lunes.strftime('%m')}{lunes.strftime('%y')}{100 + consecutivo}"


def numeros_ot_semana(planes, lunes):
    """{plan_id: No. de OT} de los planes que tocan esa semana, numerados en el orden en que vienen (el del
    modelo: área, locación, actividad y código), igual que Exportar Excel."""
    return {p.id: numero_ot(lunes, i) for i, p in enumerate(_planes_que_tocan(planes, lunes), start=1)}


def _frecuencia_desde_excel(valor):
    """Convierte frecuencia del Excel (16S, 4S, 2M...) al choice del modelo."""
    if not valor:
        return 'mensual'
    texto   = str(valor).strip().upper().replace(' ', '')
    numeros = ''.join(c for c in texto if c.isdigit())
    if not numeros:
        return 'mensual'
    n = int(numeros)
    if 'M' in texto:
        n = n * 4
    if n <= 1:
        return 'semanal'
    elif n <= 3:
        return 'quincenal'
    elif n <= 6:
        return 'mensual'
    elif n <= 11:
        return 'bimestral'
    elif n <= 15:
        return 'trimestral'
    elif n <= 21:
        return 'cuatrimestral'
    elif n <= 39:
        return 'semestral'
    else:
        return 'anual'
    
def requiere_acceso_mto(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect('login')
        if request.user.is_superuser:
            return view_func(request, *args, **kwargs)
        try:
            if not request.user.acceso_mto.activo:
                return redirect('sin_permiso')
        except Exception:
            return redirect('sin_permiso')
        return view_func(request, *args, **kwargs)
    return wrapper

def areas_permitidas_mto(request):
    if request.user.is_superuser:
        return Area.objects.filter(activa=True)
    try:
        if request.user.acceso_mto.activo:
            return request.user.acceso_mto.areas.filter(activa=True)
    except Exception:
        pass
    return Area.objects.none()

def _ve_todas_las_areas(user):
    perfil = getattr(user, 'perfil', None)
    return user.is_superuser or bool(perfil and perfil.es_admin)


def areas_visibles_mto(request):
    """Áreas activas que el usuario puede ver: todas si es superusuario/administrador;
    si no, solo las asignadas en su acceso MTO."""
    if _ve_todas_las_areas(request.user):
        return Area.objects.filter(activa=True)
    return areas_permitidas_mto(request)


def areas_ids_restringidas(request):
    """None si el usuario ve todas las áreas; si no, la lista de ids que puede ver."""
    if _ve_todas_las_areas(request.user):
        return None
    return list(areas_permitidas_mto(request).values_list('id', flat=True))


def puede_llenar_mto(user, base):
    """Llenar (capturar algo nuevo) lo puede quien tenga "Llenar" o "Editar"; `base` = 'plan_mantenimiento' | 'seguimiento'."""
    return puede_mto(user, f'llenar_{base}') or puede_mto(user, f'editar_{base}')


def puede_asignar_responsable(user):
    """Asignar responsable a una actividad semanal del Plan: permiso de Editar o de Validar el plan."""
    return puede_mto(user, 'editar_plan_mantenimiento') or puede_mto(user, 'validar_plan_mantenimiento')


def requiere_permiso_json(*campos):
    """Vista JSON/POST que exige al menos uno de los permisos indicados de AccesoMto (403 si no tiene ninguno).
    Administradores y superusuarios pasan siempre (lo resuelve puede_mto)."""
    def decorador(vista):
        @wraps(vista)
        def envoltura(request, *args, **kwargs):
            if not any(puede_mto(request.user, c) for c in campos):
                return JsonResponse({'ok': False, 'error': _('No tienes permiso para realizar esta acción.')}, status=403)
            return vista(request, *args, **kwargs)
        return envoltura
    return decorador