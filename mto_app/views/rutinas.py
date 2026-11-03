from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.shortcuts import render, redirect
from django.contrib import messages
from django.core.paginator import Paginator
import io
import json
import re
import unicodedata
from django.db import transaction
from django.db.models import Count, Max, Q, Sum
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.views.decorators.http import require_POST
from django.shortcuts import get_object_or_404
from datetime import date, timedelta
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font
from collections import Counter
from django.utils.translation import gettext as _, gettext_noop, ngettext
from login_app.permisos import puede_mto
from .utils import areas_permitidas_mto, areas_visibles_mto, _ve_todas_las_areas
from ..models import Area, PlanMantenimiento, PasoRutina, HistorialRutina, Rutina


HIST_PER_PAGE = ('10', '25', '50')


def _historial_detalle(qs):
    """{id: {'ver', 'delta'}} para cada registro, en una sola consulta.
    ver   = nº de importación de ese plan desde la última eliminación (0 si es una eliminación).
    delta = pasos de esta importación menos los de la anterior (None = primera, "nueva")."""
    info, estado = {}, {}
    filas = qs.order_by('fecha', 'id').values_list('id', 'area_id', 'codigo_plan', 'accion', 'pasos_afectados')
    for pk, area_id, codigo, accion, pasos in filas:
        clave = (area_id, codigo)
        if accion == 'eliminar':
            estado.pop(clave, None)
            info[pk] = {'ver': 0, 'delta': None}
            continue
        ver, previo = estado.get(clave, (0, None))
        ver += 1
        info[pk] = {'ver': ver, 'delta': None if previo is None else pasos - previo}
        estado[clave] = (ver, pasos)
    return info


@login_required
def historial_acciones(request):
    """Contenido HTML del modal "Historial de acciones" (Plan de mantenimiento)."""
    if not puede_mto(request.user, 'ver_rutinas'):
        return HttpResponseForbidden(_("No tienes permiso para ver esta sección."))

    areas = list(areas_visibles_mto(request))
    permitido = Q(area__in=areas)
    if _ve_todas_las_areas(request.user):
        permitido |= Q(area__isnull=True)
    base = HistorialRutina.objects.select_related('usuario', 'area').filter(permitido)
    detalle = _historial_detalle(base)

    q       = request.GET.get('q', '').strip()
    area_id = request.GET.get('area', '').strip()
    user_id = request.GET.get('usuario', '').strip()
    accion  = request.GET.get('accion', '').strip()
    if accion not in ('importar', 'eliminar'):
        accion = ''

    qs = base
    if q:
        qs = qs.filter(Q(codigo_plan__icontains=q) | Q(nombre_plan__icontains=q) |
                       Q(plan_trabajo__icontains=q) | Q(motivo__icontains=q))
    if area_id.isdigit():
        qs = qs.filter(area_id=int(area_id))
    if user_id.isdigit():
        qs = qs.filter(usuario_id=int(user_id))

    desde = hasta = None
    try:
        desde = date.fromisoformat(request.GET.get('desde', '').strip()) if request.GET.get('desde') else None
        hasta = date.fromisoformat(request.GET.get('hasta', '').strip()) if request.GET.get('hasta') else None
    except ValueError:
        desde = hasta = None
    if desde:
        qs = qs.filter(fecha__date__gte=desde)
    if hasta:
        qs = qs.filter(fecha__date__lte=hasta)

    # Indicadores y contadores de los chips: todo lo filtrado, menos el chip de acción
    conteo = {r['accion']: r['n'] for r in qs.order_by().values('accion').annotate(n=Count('id'))}
    n_imp, n_eli = conteo.get('importar', 0), conteo.get('eliminar', 0)
    reimportaciones = sum(1 for i in qs.values_list('id', flat=True) if detalle.get(i, {}).get('ver', 0) > 1)
    pasos_borrados = qs.filter(accion='eliminar').aggregate(t=Sum('pasos_afectados'))['t'] or 0
    ultima = qs.first()
    primera = qs.order_by('fecha').first()

    if accion:
        qs = qs.filter(accion=accion)
    per_page = request.GET.get('per_page', '10')
    if per_page not in HIST_PER_PAGE:
        per_page = '10'
    pagina = Paginator(qs, int(per_page)).get_page(request.GET.get('page', 1))
    filas = [{'h': h, 'ver': detalle.get(h.pk, {}).get('ver', 0), 'delta': detalle.get(h.pk, {}).get('delta')}
             for h in pagina]

    n_pag, act = pagina.paginator.num_pages, pagina.number
    paginas = []
    for n in sorted({1, n_pag, act - 1, act, act + 1} & set(range(1, n_pag + 1))):
        if paginas and n - paginas[-1] > 1:
            paginas.append(None)
        paginas.append(n)
    q_pag = request.GET.copy()
    q_pag.pop('page', None)

    base_area     = base.filter(area_id=int(area_id)) if area_id.isdigit() else base
    usuarios      = User.objects.filter(pk__in=base_area.values('usuario_id')).order_by('first_name', 'username')
    usuarios_op   = [
        {'value': str(u.pk), 
         'label': u.get_full_name() or u.username} for u in usuarios
    ]
    usuario_label = next((o['label'] for o in usuarios_op if str(o['value']) == user_id), '')

    ctx = {
        'filas':           filas, 
        'pagina':          pagina, 
        'paginas':         paginas, 
        'qs_pag':          q_pag.urlencode(),
        'per_page':        per_page, 
        'perpage_opts':    [10, 25, 50],
        'n_total':         n_imp + n_eli, 
        'n_imp':           n_imp, 
        'n_eli':           n_eli,
        'reimportaciones': reimportaciones, 
        'pasos_borrados':  pasos_borrados,
        'ultima':          ultima, 
        'primera':         primera,
        'q':               q, 
        'f_area':          area_id, 
        'f_usuario':       user_id, 
        'f_accion':        accion,
        'f_desde':         desde.isoformat() if desde else '', 
        'f_hasta':         hasta.isoformat() if hasta else '',
        'areas':           areas,
        'usuarios_op':     usuarios_op, 
        'usuario_label':   usuario_label,
        'todas_areas':     _ve_todas_las_areas(request.user),
    }
    return render(request, 'mto_app/rutinas/_historial_acciones.html', ctx)


# ── Modal "Rutinas de mantenimiento" (Plan de mantenimiento) ─────────────────
# Columna "Punto crítico" del Excel: nombre y descripción por defecto (si la rutina no trae leyenda)
_PUNTOS = {
    0: (gettext_noop("Obligatoria"),
        gettext_noop("Actividad que no se debe de omitir ya que se considera obligatoria para el mantenimiento.")),
    1: (gettext_noop("Secuencia obligatoria"),
        gettext_noop("Actividad mandatoria dentro de la tarea; no se debe omitir la secuencia de la actividad.")),
    2: (gettext_noop("Seguridad"), gettext_noop("Actividad con enfoque a seguridad.")),
}
SIGLAS = {'EPP', 'LOTO', 'HMI', 'VFD', 'CT', 'AGV', 'PLC', 'EHS'}


def _limpiar(valor):
    return str(valor).replace('_x000D_', '').replace('_x000d_', '').strip() if valor else ''


def _sin_acentos(t):
    return ''.join(c for c in unicodedata.normalize('NFD', t or '') if unicodedata.category(c) != 'Mn').lower()


def _enumerar(nums):
    nums = [str(n) for n in nums]
    return nums[0] if len(nums) == 1 else ', '.join(nums[:-1]) + ' ' + _('y') + ' ' + nums[-1]


def _clave_orden(r):
    p = str(r['plan'])
    return (0, int(p), r['codigo']) if p.isdigit() else (1, 0, p)


def _defs_puntos(leyenda):
    """{0: (nombre, descripción), …}. La descripción es la de la leyenda del Excel (tal cual) o la de por defecto traducida."""
    return {v: (_(n), (leyenda or {}).get(str(v)) or _(d)) for v, (n, d) in _PUNTOS.items()}


def _tipo_oracion(titulo):
    """'TENSIÓN DE CADENAS' → 'Tensión de cadenas'. Solo si el título está todo en mayúsculas; respeta las siglas y las
    palabras con números ('(CT)1222'). Es solo para mostrar: en la BD queda el original."""
    if not titulo or titulo != titulo.upper() or titulo == titulo.lower():
        return titulo
    palabras = [p if re.sub(r'\W', '', p) in SIGLAS or any(c.isdigit() for c in p) else p.lower() for p in titulo.split(' ')]
    t = ' '.join(palabras)
    return t[:1].upper() + t[1:]


def _clase_prioridad(prioridad):
    """'alta' | 'media' | 'baja' | 'otra' (color del chip); '' si no hay prioridad."""
    k = _sin_acentos(prioridad).strip()
    return (k if k in PRIORIDADES else 'otra') if k else ''


@login_required
def rutinas_modal(request):
    """Contenido HTML del modal de Rutinas: lista a la izquierda y la rutina seleccionada a la derecha (encabezado del
    Excel, leyenda de puntos críticos que también filtra, y tabla de pasos)."""
    if not puede_mto(request.user, 'ver_rutinas'):
        return HttpResponseForbidden(_("No tienes permiso para ver esta sección."))

    areas = list(areas_visibles_mto(request))
    nombres_area = {a.pk: a.nombre for a in areas}
    area_id = request.GET.get('area', '').strip()
    q = _sin_acentos(request.GET.get('q', '').strip())
    sel = request.GET.get('rutina', '').strip()

    pasos_qs = PasoRutina.objects.filter(area__in=areas)
    if area_id.isdigit():
        pasos_qs = pasos_qs.filter(area_id=int(area_id))
    grupos = (pasos_qs.order_by().values('area_id', 'plan_trabajo')
              .annotate(n=Count('id'), codigo=Max('codigo_plan'), nombre=Max('nombre_plan')))
    con_pc = Counter((a, p) for a, p, pc in pasos_qs.order_by().values_list('area_id', 'plan_trabajo', 'puntos_criticos') if pc)
    info = {(r.area_id, r.plan_trabajo): r for r in Rutina.objects.filter(area__in=areas)}

    ultima = {}
    for h in HistorialRutina.objects.filter(accion='importar', area__in=areas).select_related('usuario').order_by('-fecha'):
        ultima.setdefault((h.area_id, h.plan_trabajo), h)
    usada = {(x['area_id'], x['plan_trabajo']): x['n'] for x in
             PlanMantenimiento.objects.filter(activo=True, area__in=areas).order_by().values('area_id', 'plan_trabajo')
             .annotate(n=Count('id'))}

    todas = []
    for g in grupos:
        k = (g['area_id'], g['plan_trabajo'])
        h, r = ultima.get(k), info.get(k)
        todas.append({
            'clave': '%s:%s' % k, 'area_id': g['area_id'], 'area': nombres_area.get(g['area_id'], ''),
            'plan': g['plan_trabajo'], 'codigo': g['codigo'] or '', 'nombre': g['nombre'] or '', 'n': g['n'],
            'k_pc': con_pc.get(k, 0),
            'fecha': h.fecha if h else None,
            'usuario': (h.usuario.get_full_name() or h.usuario.username) if h and h.usuario else '',
            'usada': usada.get(k, 0),
            # Encabezado del Excel (vacío en las rutinas importadas antes de guardarlo)
            'prioridad': r.prioridad if r else '', 'prio': _clase_prioridad(r.prioridad if r else ''),
            'area_doc': r.area_documento if r else '', 'locacion': r.locacion if r else '',
            'creador': r.creador if r else '', 'codigo_doc': r.codigo_documento if r else '',
            'archivo': r.archivo_origen if r else '', 'omitidas': r.filas_omitidas if r else 0,
            'rango_omitidas': r.rango_omitidas if r else '', 'leyenda': r.leyenda_puntos if r else {},
        })
    todas.sort(key=_clave_orden)
    rutinas = [r for r in todas if not q or q in _sin_acentos(
        ' '.join(str(r[c]) for c in ('codigo', 'nombre', 'plan', 'area_doc', 'locacion')))]

    actual = next((r for r in rutinas if r['clave'] == sel), rutinas[0] if rutinas else None)
    pasos, leyenda, n_pc = [], [], 0
    if actual:
        defs = _defs_puntos(actual['leyenda'])
        for p in PasoRutina.objects.filter(area_id=actual['area_id'], plan_trabajo=actual['plan']).order_by('secuencia'):
            pc = sorted({v for v in (p.puntos_criticos or []) if v in defs})
            pasos.append({
                'seq': p.secuencia, 'titulo': _tipo_oracion(p.descripcion), 'detalle': p.detalles,
                'pc': [{'v': v, 'nombre': defs[v][0], 'desc': defs[v][1]} for v in pc],
                'pc_attr': ' '.join(str(v) for v in pc), 'seg': 2 in pc,
            })
        n_pc = sum(1 for p in pasos if p['pc'])
        if n_pc:      # sin ningún punto crítico (rutinas viejas) no se muestra la leyenda
            for v, (nombre, desc) in defs.items():
                seqs = [p['seq'] for p in pasos if v in [c['v'] for c in p['pc']]]
                leyenda.append({'v': v, 'nombre': nombre, 'desc': desc, 'n': len(seqs), 'seqs': ', '.join(map(str, seqs))})

    planes_disp = []
    if area_id.isdigit():
        planes_disp = sorted(set(PlanMantenimiento.objects.filter(area_id=int(area_id)).values_list('plan_trabajo', flat=True)),
                             key=lambda x: (0, int(x)) if str(x).isdigit() else (1, str(x)))
    ctx = {
        'rutinas': rutinas, 'total': len(todas), 'q': request.GET.get('q', '').strip(),
        'actual': actual, 'pasos': pasos, 'leyenda': leyenda, 'n_pc': n_pc,
        'planes_disp': planes_disp, 'area_id': area_id,
        'puede_editar': puede_mto(request.user, 'editar_rutinas'),
        'puede_eliminar': puede_mto(request.user, 'eliminar_rutinas'),
    }
    return render(request, 'mto_app/rutinas/_rutinas_modal.html', ctx)


EXT_RUTINA = ('.xlsx', '.xlsm')
MAX_RUTINA_BYTES = 5 * 1024 * 1024
_ALIAS_COLUMNAS = {   # encabezados de la tabla, ya normalizados con _norm ("Seq. #" → "seq")
    'seq':  {'seq', 'secuencia', 'sec'},
    'desc': {'description', 'descripcion'},
    'pc':   {'punto critico', 'puntos criticos', 'critical point'},
    'det':  {'details', 'detail', 'detalles', 'detalle'},
}
_NOMBRE_COLUMNA = {'seq': 'Seq', 'desc': 'Descripción', 'det': 'Detalles'}
# Datos del encabezado: la etiqueta en una celda y el valor en la siguiente celda no vacía a su derecha
_ETIQUETAS_CAB = {
    'nombre':    {'nombre del plan de trabajo', 'nombre'},
    'codigo':    {'codigo del plan de trabajo', 'codigo'},
    'prioridad': {'prioridad'},
    'area':      {'area'},
    'creador':   {'creador'},
    'locacion':  {'locacion'},
}
PRIORIDADES = ('alta', 'media', 'baja')
_RE_COD_DOC = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+){2}', re.I)   # MT4-MX-002


def _norm(valor):
    """Texto para comparar etiquetas: sin acentos ni mayúsculas, solo letras y números ("Área:" → "area")."""
    return re.sub(r'[^a-z0-9]+', ' ', _sin_acentos(_limpiar(valor))).strip()


def _texto(valor):
    """Descripción o detalle: recorta cada renglón, conserva los saltos internos y quita los vacíos del final."""
    if valor in (None, ''):
        return ''
    t = str(valor).replace('_x000D_', '').replace('_x000d_', '').replace('\r\n', '\n').replace('\r', '\n')
    return '\n'.join(r.strip() for r in t.split('\n')).strip('\n')


def _valor_pc(v):
    """0, 1 o 2 si la celda trae ese número (1, 2.0 o "1"); None si está vacía; ValueError si trae otra cosa."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, bool):
        raise ValueError
    f = float(str(v).strip())
    if not f.is_integer() or int(f) not in (0, 1, 2):
        raise ValueError
    return int(f)


def _codigo_documento(hoja, archivo):
    """Código del documento: el nombre de la hoja (MT4-MX-002) o, si es genérico, el inicio del nombre del archivo."""
    if _RE_COD_DOC.fullmatch(hoja.strip()):
        return hoja.strip()
    m = _RE_COD_DOC.match(archivo or '')
    return m.group(0) if m else ''


def _rango(nums):
    """'14–20' si son seguidos; si no, la lista ('3, 7 y 9')."""
    if not nums:
        return ''
    if nums[-1] - nums[0] + 1 == len(nums):
        return '%s–%s' % (nums[0], nums[-1]) if len(nums) > 1 else str(nums[0])
    return _enumerar(nums)[:30]


def _leer_rutina(archivo):
    """Lee y valida el Excel de una rutina: encabezado con los datos del plan, leyenda de puntos críticos y tabla de
    pasos. Todo se busca por texto, no por celda fija. Devuelve el encabezado, los pasos
    [(seq, titulo, detalle, puntos_criticos)], las filas omitidas (Seq sin descripción ni detalle), errores y avisos."""
    res = {'nombre': '', 'codigo': '', 'prioridad': '', 'area': '', 'creador': '', 'locacion': '',
           'codigo_documento': '', 'leyenda': {}, 'pasos': [], 'omitidas': [], 'rango_omitidas': '',
           'con_pc': False, 'errores': [], 'avisos': []}
    if not (getattr(archivo, 'name', '') or '').lower().endswith(EXT_RUTINA):
        res['errores'].append(_("Formato no válido: usa .xlsx"))
        return res
    if archivo.size > MAX_RUTINA_BYTES:
        res['errores'].append(_("El archivo pesa %(x).1f MB (máximo 5 MB)") % {'x': archivo.size / 1048576})
        return res
    try:
        libro = load_workbook(archivo, data_only=True)
    except Exception:
        res['errores'].append(_("No se pudo leer el archivo. Usa un Excel con el formato de rutinas."))
        return res

    def celda(fila, i):
        return fila[i] if i < len(fila) else None

    # Hoja de pasos: la primera con una columna "Seq". Su fila de encabezados es la de más columnas reconocidas.
    hoja, filas, cab, col = None, [], None, {}
    for ws in libro.worksheets:
        valores = list(ws.iter_rows(values_only=True))
        for n, fila in enumerate(valores[:40]):
            mapa = {}
            for i, v in enumerate(fila):
                t = _norm(v)
                for clave, alias in _ALIAS_COLUMNAS.items():
                    if t in alias:
                        mapa.setdefault(clave, i)
            if 'seq' in mapa and len(mapa) > len(col):
                hoja, filas, cab, col = ws, valores, n, mapa
        if hoja:
            break
    faltan_cols = [_NOMBRE_COLUMNA[k] for k in ('seq', 'desc', 'det') if k not in col]
    if faltan_cols:
        res['errores'].extend(_("Falta la columna %(c)s") % {'c': c} for c in faltan_cols)
        return res

    # Punto crítico: todas las columnas que abarca su encabezado combinado (E:F); si no está combinado,
    # la suya y la siguiente cuando esa no tiene encabezado
    cols_pc = []
    if 'pc' in col:
        i = col['pc']
        rango = next((r for r in hoja.merged_cells.ranges if r.min_row <= cab + 1 <= r.max_row and r.min_col <= i + 1 <= r.max_col), None)
        if rango:
            cols_pc = list(range(rango.min_col - 1, rango.max_col))
        else:
            cols_pc = [i]
            if celda(filas[cab], i + 1) in (None, '') and i + 1 not in col.values():
                cols_pc.append(i + 1)
        res['con_pc'] = True
    else:
        res['avisos'].append(_("El archivo no tiene columna de puntos críticos"))

    # Encabezado y leyenda (filas de arriba de la tabla)
    for fila in filas[:cab]:
        for i, v in enumerate(fila):
            t = _norm(v)
            for clave, alias in _ETIQUETAS_CAB.items():
                if t in alias and not res[clave]:
                    res[clave] = next((_limpiar(x) for x in fila[i + 1:] if _limpiar(x)), '')
            # Leyenda: una celda con 0, 1 o 2 y el texto a su derecha
            if _limpiar(celda(fila, i + 1)):
                try:
                    k = _valor_pc(v)
                except ValueError:
                    k = None
                if k is not None:
                    res['leyenda'].setdefault(str(k), _texto(fila[i + 1]))
    for clave, campo in (('prioridad', _("la prioridad")), ('area', _("el área")),
                         ('locacion', _("la locación")), ('creador', _("el creador"))):
        if not res[clave]:
            res['avisos'].append(_("No se encontró %(campo)s en el encabezado") % {'campo': campo})
    if res['prioridad'] and _sin_acentos(res['prioridad']) not in PRIORIDADES:
        res['avisos'].append(_("Prioridad '%(x)s' no reconocida; se guardará tal cual") % {'x': res['prioridad']})
    res['codigo_documento'] = _codigo_documento(hoja.title, archivo.name)

    # Pasos
    vistos, sin_detalle = set(), 0
    for n in range(cab + 1, len(filas)):
        fila, num = filas[n], n + 1
        vs, titulo, detalle = celda(fila, col['seq']), _texto(celda(fila, col['desc'])), _texto(celda(fila, col['det']))
        if vs in (None, '') and not titulo and not detalle:
            continue
        try:
            if isinstance(vs, bool):
                raise ValueError
            seq = int(float(str(vs).strip()))
            if seq != float(str(vs).strip()) or seq < 1:
                raise ValueError
        except (TypeError, ValueError):
            if not titulo and not detalle:      # texto suelto debajo de la tabla (notas, firmas): se ignora
                continue
            res['errores'].append(_("Fila %(n)s: la secuencia no es un número") % {'n': num})
            continue
        if seq in vistos:
            res['errores'].append(_("Fila %(n)s: la secuencia se repite (%(s)s)") % {'n': num, 's': seq})
            continue
        vistos.add(seq)
        if not titulo and not detalle:          # Seq sin contenido: no es un paso
            res['omitidas'].append(seq)
            continue
        if not titulo:
            res['errores'].append(_("Fila %(n)s: la descripción está vacía") % {'n': num})
            continue
        if len(titulo) > 200:
            res['errores'].append(_("Fila %(n)s: la descripción pasa de 200 caracteres") % {'n': num})
            continue
        puntos = []
        for v in (celda(fila, i) for i in cols_pc):
            try:
                p = _valor_pc(v)
            except ValueError:
                res['errores'].append(_("Fila %(n)s: punto crítico '%(x)s' no válido (usa 0, 1 o 2)") % {'n': num, 'x': str(v).strip()})
                continue
            if p is not None:
                puntos.append(p)
        if len(puntos) > 2:
            res['errores'].append(_("Fila %(n)s: máximo 2 puntos críticos por paso") % {'n': num})
        for p in sorted({p for p in puntos if puntos.count(p) > 1}):
            res['avisos'].append(_("Fila %(n)s: punto crítico %(v)s repetido, se guardará una vez") % {'n': num, 'v': p})
        if not detalle:
            sin_detalle += 1
        res['pasos'].append((seq, titulo, detalle, sorted(set(puntos))))

    if not res['pasos'] and not res['errores']:
        res['errores'].append(_("El archivo no tiene pasos"))
    if res['pasos']:
        res['pasos'].sort()
        faltan = sorted(set(range(res['pasos'][0][0], res['pasos'][-1][0] + 1)) - vistos)
        if faltan:
            res['avisos'].append(_("Faltan los pasos %(n)s") % {'n': _enumerar(faltan[:10]) + ('…' if len(faltan) > 10 else '')})
        if sin_detalle:
            res['avisos'].append(ngettext("%(n)s paso sin detalle", "%(n)s pasos sin detalle", sin_detalle) % {'n': sin_detalle})
    res['omitidas'].sort()
    res['rango_omitidas'] = _rango(res['omitidas'])
    return res


@login_required
@require_POST
def rutina_validar(request):
    """Revisa el Excel apenas se sube (sin guardar nada) y dice qué trae o qué está mal."""
    if not puede_mto(request.user, 'editar_rutinas'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para importar rutinas.")}, status=403)
    archivo = request.FILES.get('archivo')
    if not archivo:
        return JsonResponse({'ok': False, 'error': _("Elige el archivo de Excel")}, status=400)
    lectura = _leer_rutina(archivo)
    pasos = lectura['pasos']
    out = {
        'ok': not lectura['errores'], 'errores': lectura['errores'], 'avisos': lectura['avisos'],
        'nombre': lectura['nombre'], 'codigo': lectura['codigo'], 'tamano': archivo.size,
        'prioridad': lectura['prioridad'], 'area_doc': lectura['area'], 'locacion': lectura['locacion'],
        'creador': lectura['creador'], 'codigo_documento': lectura['codigo_documento'],
        'n': len(pasos), 'min': pasos[0][0] if pasos else 0, 'max': pasos[-1][0] if pasos else 0,
        'omitidas': len(lectura['omitidas']), 'rango_omitidas': lectura['rango_omitidas'],
        'con_pc': lectura['con_pc'], 'n_pc': sum(1 for p in pasos if p[3]),
        'conteo_pc': {v: sum(1 for p in pasos if v in p[3]) for v in (0, 1, 2)},
        'pasos': [{'seq': s, 'titulo': t, 'detalle': d, 'pc': pc} for s, t, d, pc in pasos],
        'existe': None,
    }
    plan = request.POST.get('plan_trabajo', '').strip()
    if plan and request.POST.get('area', '').isdigit():
        area = get_object_or_404(areas_visibles_mto(request), pk=request.POST['area'])
        previos = PasoRutina.objects.filter(area=area, plan_trabajo=plan)
        n = previos.count()
        if n:
            # Qué cambia al reemplazar: puntos críticos de los pasos que siguen y la prioridad
            antes = dict(previos.values_list('secuencia', 'puntos_criticos'))
            cambian = sum(1 for s, t, d, pc in pasos if s in antes and sorted(antes[s] or []) != pc)
            cambios = []
            if cambian:
                cambios.append(_("Cambian los puntos críticos de %(n)s pasos") % {'n': cambian})
            r = Rutina.objects.filter(area=area, plan_trabajo=plan).first()
            if r and r.prioridad and lectura['prioridad'] and r.prioridad != lectura['prioridad']:
                cambios.append(_("Cambia la prioridad de %(a)s a %(b)s") % {'a': r.prioridad, 'b': lectura['prioridad']})
            out['existe'] = {'n': n, 'codigo': previos.values_list('codigo_plan', flat=True).first() or plan, 'cambios': cambios}
    return JsonResponse(out)


@login_required
def rutina_plantilla(request):
    """Excel vacío con el formato que lee la importación: encabezado del plan, leyenda de puntos críticos y 20 pasos.
    Los textos fijos van siempre en español porque la importación los busca por texto."""
    if not puede_mto(request.user, 'editar_rutinas'):
        return HttpResponseForbidden(_("No tienes permiso para importar rutinas."))
    wb = Workbook()
    ws = wb.active
    ws.title = 'Rutina'
    negrita, ajuste = Font(bold=True), Alignment(wrap_text=True, vertical='top')
    for celda, texto in (('C5', 'Nombre del Plan de Trabajo:'), ('C6', 'Código del Plan de Trabajo:'), ('C7', 'Prioridad:'),
                         ('G5', 'Área:'), ('G6', 'Creador:'), ('G7', 'Locación:')):
        ws[celda] = texto
        ws[celda].font = negrita
    ws['B9'] = ('Nota: Para las referencias sobre la criticidad de cada tarea del plan de trabajo se considera '
                'la siguiente simbología')
    for v, (nombre, desc) in _PUNTOS.items():
        ws.cell(row=9 + v, column=7, value=v)
        ws.cell(row=9 + v, column=8, value=desc)
    for col, texto in ((2, 'Seq. #'), (3, 'Descripción'), (4, 'Status'), (5, 'Punto Critico'), (7, 'Detalles')):
        ws.cell(row=13, column=col, value=texto).font = negrita
    ws.merge_cells('E13:F13')
    for s in range(1, 21):
        ws.cell(row=13 + s, column=2, value=s)
        ws.cell(row=13 + s, column=7).alignment = ajuste
    for col, ancho in (('B', 8), ('C', 40), ('D', 9), ('E', 7), ('F', 7), ('G', 70), ('H', 45)):
        ws.column_dimensions[col].width = ancho
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    resp = HttpResponse(buffer, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename="plantilla_rutina.xlsx"'
    return resp


@login_required
@require_POST
@transaction.atomic
def rutina_importar(request):
    """Importa los pasos de una rutina desde Excel. Si ya existe y no se pidió reemplazar, responde 409."""
    if not puede_mto(request.user, 'editar_rutinas'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para importar rutinas.")}, status=403)
    archivo = request.FILES.get('archivo')
    plan = request.POST.get('plan_trabajo', '').strip()
    motivo = request.POST.get('motivo', '').strip()
    reemplazar = request.POST.get('reemplazar') == '1'
    errores = {}
    if not plan:
        errores['plan'] = _("Elige el número de plan")
    if not archivo:
        errores['archivo'] = _("Elige el archivo de Excel")
    if not motivo:
        errores['motivo'] = _("Escribe el motivo")
    if errores:
        return JsonResponse({'ok': False, 'error': next(iter(errores.values())), 'errores': errores}, status=400)
    area = get_object_or_404(areas_visibles_mto(request), pk=request.POST.get('area') or 0)
    lectura = _leer_rutina(archivo)
    if lectura['errores']:
        msg = lectura['errores'][0]
        return JsonResponse({'ok': False, 'error': msg, 'errores': {'archivo': msg}}, status=400)
    nombre, codigo, pasos = lectura['nombre'], lectura['codigo'], lectura['pasos']
    existentes = PasoRutina.objects.filter(area=area, plan_trabajo=plan)
    if existentes.exists() and not reemplazar:
        return JsonResponse({'ok': False, 'existe': True, 'n': existentes.count(), 'codigo': codigo}, status=409)
    existentes.delete()
    PasoRutina.objects.bulk_create([
        PasoRutina(area=area, plan_trabajo=plan, nombre_plan=nombre, codigo_plan=codigo, secuencia=s,
                   descripcion=t, detalles=d, puntos_criticos=pc) for s, t, d, pc in pasos])
    Rutina.objects.update_or_create(area=area, plan_trabajo=plan, defaults={
        'prioridad': lectura['prioridad'][:30], 'area_documento': lectura['area'][:150],
        'locacion': lectura['locacion'][:200], 'creador': lectura['creador'][:150],
        'codigo_documento': lectura['codigo_documento'][:50], 'archivo_origen': archivo.name[:255],
        'filas_omitidas': len(lectura['omitidas']), 'rango_omitidas': lectura['rango_omitidas'][:30],
        'leyenda_puntos': lectura['leyenda'],
    })
    HistorialRutina.objects.create(usuario=request.user, accion='importar', area=area, plan_trabajo=plan,
                                   codigo_plan=codigo, nombre_plan=nombre, pasos_afectados=len(pasos), motivo=motivo)
    return JsonResponse({'ok': True, 'clave': '%s:%s' % (area.pk, plan), 'codigo': codigo, 'n': len(pasos)})


@login_required
@require_POST
@transaction.atomic
def rutina_eliminar(request):
    """Elimina todos los pasos de una rutina. Exige motivo; si la usan planes, también su código."""
    if not puede_mto(request.user, 'eliminar_rutinas'):
        return JsonResponse({'ok': False, 'error': _("No tienes permiso para eliminar rutinas.")}, status=403)
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'ok': False, 'error': _("Datos no válidos.")}, status=400)
    plan = str(data.get('plan', '')).strip()
    motivo = str(data.get('motivo', '')).strip()
    if not motivo:
        msg = _("Escribe el motivo")
        return JsonResponse({'ok': False, 'error': msg, 'errores': {'motivo': msg}}, status=400)
    area = get_object_or_404(areas_visibles_mto(request), pk=data.get('area') or 0)
    pasos = PasoRutina.objects.filter(area=area, plan_trabajo=plan)
    primero = pasos.first()
    if not primero:
        return JsonResponse({'ok': False, 'error': _("La rutina ya no existe.")}, status=404)
    codigo = primero.codigo_plan or plan
    usadas = PlanMantenimiento.objects.filter(area=area, plan_trabajo=plan, activo=True).count()
    if usadas and str(data.get('confirmar', '')).strip().lower() != codigo.lower():
        msg = _("Escribe el código de la rutina para confirmar")
        return JsonResponse({'ok': False, 'error': msg, 'errores': {'confirmar': msg}}, status=400)
    n = pasos.count()
    pasos.delete()
    Rutina.objects.filter(area=area, plan_trabajo=plan).delete()
    HistorialRutina.objects.create(usuario=request.user, accion='eliminar', area=area, plan_trabajo=plan,
                                   codigo_plan=primero.codigo_plan, nombre_plan=primero.nombre_plan,
                                   pasos_afectados=n, motivo=motivo)
    return JsonResponse({'ok': True, 'codigo': codigo, 'n': n})
