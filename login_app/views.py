from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.models import User
from django.contrib import messages
from .models import PerfilUsuario
from .permisos import solo_admin, get_perfil
from paros_app.models import Area
from mto_app.models import AccesoMto
from mto_app.models import Area as AreaMto
from django.utils.translation import gettext as _
from django.core.paginator import Paginator

_CAMPOS_DASHBOARD = [
    ('ver_dashboard', 'Ver dashboard', 'Acceso al dashboard de indicadores'),
    ('ver_analisis',  'Ver análisis de paros', 'Acceso a la pestaña de análisis con gráficos'),
]
 
_CAMPOS_PAROS = [
    ('ver_todos_paros',      'Ver todos los paros',      'Ve paros de todas las áreas, ignorando restricción por área'),
    ('crear_paro',           'Crear paro',               'Puede registrar nuevos paros'),
    ('editar_comentarios',   'Editar solo comentarios',  'Solo puede editar el campo comentarios'),
    ('editar_paro',          'Editar paro',              'Puede editar todos los campos excepto eliminar'),
    ('editar_eliminar_paro', 'Editar y eliminar paro',   'Puede editar todos los campos y eliminar paros'),
    ('cambiar_estatus_paro', 'Cambiar estatus',          'Puede cambiar el estatus del paro'),
    ('exportar_paros',       'Exportar paros',           'Puede exportar paros en Excel y CSV'),
    ('importar_paros',       'Importar paros',           'Puede importar paros desde Excel o CSV'),
]
 
_CAMPOS_CATALOGOS = [
    ('ver_catalogos',            'Ver catálogos',                  'Puede consultar fallas, equipos y responsables'),
    ('gestionar_catalogos',      'Importar y limpiar catálogos',   'Puede importar y eliminar entradas de catálogos'),
    ('agregar_catalogo_falla',   'Agregar falla',                  'Puede agregar nuevas fallas al catálogo'),
    ('editar_catalogo_falla',    'Editar falla',                   'Puede editar fallas existentes en el catálogo'),
    ('eliminar_catalogo_falla',  'Eliminar falla',                 'Puede eliminar fallas del catálogo'),
    ('agregar_catalogo_equipo',  'Agregar equipo',                 'Puede agregar nuevos equipos al catálogo'),
    ('editar_catalogo_equipo',   'Editar equipo',                  'Puede editar equipos existentes en el catálogo'),
    ('eliminar_catalogo_equipo', 'Eliminar equipo',                'Puede eliminar equipos del catálogo'),
    ('agregar_catalogo_resp',    'Agregar responsable',            'Puede agregar nuevos responsables al catálogo'),
    ('editar_catalogo_resp',     'Editar responsable',             'Puede editar responsables existentes en el catálogo'),
    ('eliminar_catalogo_resp',   'Eliminar responsable',           'Puede eliminar responsables del catálogo'),
]
 
 
def _build_permisos(campos, perfil, post):
    result = []
    for campo, label, desc in campos:
        if post:
            marcado = campo in post
        elif perfil:
            marcado = getattr(perfil, campo, False)
        else:
            marcado = False
        result.append((campo, label, desc, marcado))
    return result
 
@login_required
@solo_admin
def lista_usuarios(request):
    usuarios = User.objects.select_related('perfil').all().order_by('username')
    q = request.GET.get('q', '').strip()
    if q:
        usuarios = usuarios.filter(
            username__icontains=q
        ) | usuarios.filter(
            first_name__icontains=q
        ) | usuarios.filter(
            last_name__icontains=q
        )
    paginator = Paginator(usuarios, 15)
    page_obj  = paginator.get_page(request.GET.get('page', 1))
    return render(request, 'login_app/lista_usuarios.html', {
        'usuarios': page_obj,
        'page_obj': page_obj,
        'busqueda': q,
    })
 

def _build_permisos_mto(usuario):
    """Retorna dict con los permisos MTO actuales del usuario."""
    if not usuario:
        return {}
    try:
        am = usuario.acceso_mto
        return {campo: getattr(am, campo, False) for campo in [
            'ver_plan_mantenimiento', 'ver_rutinas', 'ver_seguimiento', 'ver_responsables',
            'editar_plan_mantenimiento', 'editar_rutinas', 'editar_seguimiento', 'editar_responsables',
        ]}
    except AccesoMto.DoesNotExist:
        return {}

    
def _ctx_form(perfil, post, areas, usuario=None):
    acceso_mto    = False
    areas_mto_ids = []
    if usuario:
        try:
            acceso_mto    = usuario.acceso_mto.activo
            areas_mto_ids = list(usuario.acceso_mto.areas.values_list('id', flat=True))
        except AccesoMto.DoesNotExist:
            pass
    return {
        'areas': areas,
        'permisos_dashboard':   _build_permisos(_CAMPOS_DASHBOARD, perfil, post),
        'permisos_paros':       _build_permisos(_CAMPOS_PAROS, perfil, post),
        'permisos_catalogos':   _build_permisos(_CAMPOS_CATALOGOS, perfil, post),
        'areas_permitidas_ids': list(perfil.areas_permitidas.values_list('id', flat=True)) if perfil else [],
        'areas_produccion_ids': list(perfil.areas_produccion.values_list('id', flat=True)) if perfil else [],
        'areas_hora_hora_ids':  list(perfil.areas_hora_hora.values_list('id', flat=True)) if perfil else [],
        'perfil':               perfil,
        'acceso_mto':           acceso_mto,
        'areas_mto':            AreaMto.objects.filter(activa=True),
        'areas_mto_ids':        areas_mto_ids,
        'permisos_mto':         _build_permisos_mto(usuario),

    }
 
 
@login_required
@solo_admin
def crear_usuario(request):
    areas = Area.objects.all()
    if request.method == 'POST':
        username   = request.POST.get('username', '').strip()
        password   = request.POST.get('password', '').strip()
        password2  = request.POST.get('password2', '').strip()
        first_name = request.POST.get('first_name', '').strip()
        last_name  = request.POST.get('last_name', '').strip()
        email      = request.POST.get('email', '').strip()
 
        errores = []
        if not username:
            errores.append("El nombre de usuario es obligatorio.")
        if User.objects.filter(username=username).exists():
            errores.append(f"El usuario '{username}' ya existe.")
        if not first_name:
            errores.append("El nombre es obligatorio.")
        if not last_name:
            errores.append("El apellido es obligatorio.")
        if not password:
            errores.append("La contraseña es obligatoria.")
        if password != password2:
            errores.append("Las contraseñas no coinciden.")
 
        if errores:
            for e in errores:
                messages.error(request, e)
            ctx = _ctx_form(None, request.POST, areas)
            ctx.update({'accion': _('Crear'), 'post': request.POST})
            return render(request, 'login_app/form_usuario.html', ctx)
 
        user = User.objects.create_user(
            username=username, password=password,
            first_name=first_name, last_name=last_name, email=email
        )
        _guardar_perfil(request, user, areas)
        messages.success(request, f"Usuario '{username}' creado correctamente.")
        return redirect('lista_usuarios')
 
    ctx = _ctx_form(None, None, areas)
    ctx.update({'accion': _('Crear'), 'post': {}})
    return render(request, 'login_app/form_usuario.html', ctx)
 
 
@login_required
@solo_admin
def editar_usuario(request, user_id):
    usuario = get_object_or_404(User, id=user_id)
    areas   = Area.objects.all()
    perfil  = get_perfil(usuario)
 
    if request.method == 'POST':
        usuario.first_name = request.POST.get('first_name', '').strip()
        usuario.last_name  = request.POST.get('last_name', '').strip()
        usuario.email      = request.POST.get('email', '').strip()
        password  = request.POST.get('password', '').strip()
        password2 = request.POST.get('password2', '').strip()
        if password:
            if password != password2:
                messages.error(request, "Las contraseñas no coinciden.")
                ctx = _ctx_form(perfil, request.POST, areas, usuario)
                ctx.update({'accion': _('Editar'), 'usuario': usuario, 'perfil': perfil, 'post': request.POST})
                return render(request, 'login_app/form_usuario.html', ctx)
            usuario.set_password(password)
        usuario.save()
        _guardar_perfil(request, usuario, areas)
        messages.success(request, f"Usuario '{usuario.username}' actualizado.")
        return redirect('lista_usuarios')
 
    ctx = _ctx_form(perfil, None, areas, usuario)
    ctx.update({'accion': _('Editar'), 'usuario': usuario, 'perfil': perfil, 'post': {}})
    return render(request, 'login_app/form_usuario.html', ctx)
 
 
@login_required
@solo_admin
def eliminar_usuario(request, user_id):
    usuario = get_object_or_404(User, id=user_id)
    if usuario == request.user:
        messages.error(request, "No puedes eliminar tu propio usuario.")
        return redirect('lista_usuarios')
    if request.method == 'POST':
        nombre = usuario.username
        usuario.delete()
        messages.success(request, f"Usuario '{nombre}' eliminado.")
    return redirect('lista_usuarios')
 
 
def _guardar_perfil(request, user, areas):
    perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
    campos_bool = [
        'es_admin', 'ver_dashboard', 'ver_analisis',
        'ver_todos_paros', 'crear_paro', 'editar_comentarios',
        'editar_paro', 'editar_eliminar_paro', 'cambiar_estatus_paro', 'exportar_paros', 'importar_paros',
        'ver_catalogos', 'gestionar_catalogos',
        'agregar_catalogo_falla', 'editar_catalogo_falla', 'eliminar_catalogo_falla',
        'agregar_catalogo_equipo', 'editar_catalogo_equipo', 'eliminar_catalogo_equipo',
        'agregar_catalogo_resp', 'editar_catalogo_resp', 'eliminar_catalogo_resp',
        'ver_indicadores', 'ver_hora_hora',
    ]
    for campo in campos_bool:
        setattr(perfil, campo, campo in request.POST)
    perfil.save()
    areas_ids = request.POST.getlist('areas_permitidas')
    perfil.areas_permitidas.set(areas_ids)
    areas_prod_ids = request.POST.getlist('areas_produccion')
    perfil.areas_produccion.set(areas_prod_ids)
    areas_hora_hora_ids = request.POST.getlist('areas_hora_hora')
    perfil.areas_hora_hora.set(areas_hora_hora_ids)

    # Guardar acceso MTO

    acceso_mto, _ = AccesoMto.objects.get_or_create(usuario=user)
    acceso_mto.activo = 'acceso_mto' in request.POST
    campos_mto = [
        'ver_plan_mantenimiento', 'ver_rutinas', 'ver_seguimiento', 'ver_responsables',
        'editar_plan_mantenimiento', 'editar_rutinas', 'editar_seguimiento', 'editar_responsables',
    ]
    for campo in campos_mto:
        setattr(acceso_mto, campo, campo in request.POST)
    acceso_mto.save()
    areas_mto_ids = request.POST.getlist('areas_mto')
    acceso_mto.areas.set(areas_mto_ids)

    return perfil


