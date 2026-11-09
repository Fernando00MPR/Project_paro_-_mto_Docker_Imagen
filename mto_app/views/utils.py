from datetime import date
from functools import wraps
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from login_app.permisos import puede_mto
from ..models import Area, SeguimientoOT


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


def numero_ot(lunes, consecutivo, prefijo=''):
    """No. de OT: semana ISO + mes y año del lunes + 100 + consecutivo (101, 102…). Si el área tiene prefijo
    (Area.prefijo_ot, admin), va al inicio con guion: AWH-451126101. Lo usan el Plan, el Backlog, el formulario de
    registro, Distribución y el Excel de la semana, así todos muestran el mismo número."""
    numero = f"{lunes.isocalendar()[1]:02d}{lunes.strftime('%m')}{lunes.strftime('%y')}{100 + consecutivo}"
    return f"{prefijo}-{numero}" if prefijo else numero


def numeros_ot_semana(planes, lunes):
    """{plan_id: No. de OT} de los planes que tocan esa semana, numerados en el orden en que vienen (el del
    modelo: área, locación, actividad y código), igual que Exportar Excel. Cada número lleva el prefijo del área
    de su plan: los planes deben venir con select_related('area')."""
    return {p.id: numero_ot(lunes, i, p.area.prefijo_ot) for i, p in enumerate(_planes_que_tocan(planes, lunes), start=1)}


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


def area_visible(request, area_id):
    """¿El usuario ve esa área? Sin área (None) solo quien ve todas (superusuario y administrador)."""
    if area_id is None:
        return _ve_todas_las_areas(request.user)
    return areas_visibles_mto(request).filter(pk=area_id).exists()


def seguimiento_o_404(request, modelo, pk):
    """El correctivo (SeguimientoOT o SeguimientoManual) si es de un área del usuario; si no, 404 como si no
    existiera. El área es la de su tarea (de OT) o la suya (manual)."""
    
    es_ot = modelo is SeguimientoOT
    seg = get_object_or_404(modelo.objects.select_related('registro__plan') if es_ot else modelo.objects, pk=pk)
    if not area_visible(request, seg.registro.plan.area_id if es_ot else seg.area_id):
        raise Http404
    return seg


PERMISOS_VER_PLAN = ('ver_plan_mantenimiento', 
                     'llenar_plan_mantenimiento',
                     'editar_plan_mantenimiento', 
                     'validar_plan_mantenimiento')


def puede_ver_plan(request, plan=None):
    """Tiene algún permiso del Plan (Ver, Llenar, Editar o Validar) y, si se da `plan`, la tarea es de un área
    suya. Superusuario y administrador ven todas las áreas (areas_visibles_mto)."""
    if not any(puede_mto(request.user, p) for p in PERMISOS_VER_PLAN):
        return False
    return plan is None or areas_visibles_mto(request).filter(pk=plan.area_id).exists()


def area_del_plan(request):
    """Área con la que trabajan el Plan, sus exportaciones y sus modales: la de ?area= o la última guardada en la
    sesión, solo si es del usuario; si no, su primera área. Devuelve el pk como texto ('' si no tiene ninguna).
    Así nadie ve otra área cambiando la URL, ni todas las áreas mezcladas por no haber elegido una."""
    visibles = areas_visibles_mto(request)
    for candidato in (request.GET.get('area'), request.session.get('lista_plan_area_id')):
        if candidato and str(candidato).isdigit() and visibles.filter(pk=candidato).exists():
            return str(candidato)
    primera = visibles.values_list('pk', flat=True).first()
    return str(primera) if primera else ''


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