from datetime import datetime, date as _date
from django.db.models import Q
from django.utils.translation import get_language, gettext as _

ESTATUS_LABELS = {'rojo': 'Rechazado', 
                  'amarillo': 'Pendiente', 
                  'verde': 'Aceptado'}

def _nombre_bilingue(es, en):
    """Nombre a mostrar según el idioma activo (usa el otro como respaldo si falta)."""
    if get_language() == 'en':
        return en or es
    return es or en


def _aplicar_filtros(qs, get_params):
    area_id       = get_params.get('area')
    fecha_desde   = get_params.get('fecha_desde')
    fecha_hasta   = get_params.get('fecha_hasta')
    turno         = get_params.get('turno')
    busqueda      = get_params.get('q', '').strip()
    filtro_resp   = get_params.get('resp', '').strip()
    filtro_equipo = get_params.get('equipo', '').strip()

    estatus_vals = [v for v in get_params.getlist('estatus') if v in ESTATUS_LABELS]
    buscar = get_params.get('buscar', '').strip()

    if area_id:
        qs = qs.filter(area_id=area_id)
    semana_activa = get_params.get('semana', '').strip()

    if not semana_activa:
        if fecha_desde:
            try:
                qs = qs.filter(fecha__gte=datetime.strptime(fecha_desde, '%Y-%m-%d').date())
            except ValueError:
                pass
        if fecha_hasta:
            try:
                qs = qs.filter(fecha__lte=datetime.strptime(fecha_hasta, '%Y-%m-%d').date())
            except ValueError:
                pass
    if turno in ('1', '2'):
        qs = qs.filter(turno=int(turno))
    if busqueda:
        qs = qs.filter(falla__icontains=busqueda)
    if filtro_resp:
        qs = qs.filter(responsable__icontains=filtro_resp)
    if filtro_equipo:
        qs = qs.filter(equipo__icontains=filtro_equipo)
    if estatus_vals:
        qs = qs.filter(estatus__in=estatus_vals)
    if buscar:
        qs = qs.filter(Q(falla__icontains=buscar) | Q(equipo__icontains=buscar) | Q(responsable__icontains=buscar))

    semana = get_params.get('semana', '').strip()
    if semana:
        try:
            semana_int = int(semana)
            año_str = get_params.get('fecha_desde', '')
            try:
                año_int = int(año_str[:4]) if año_str else _date.today().year
            except Exception:
                año_int = _date.today().year
            lunes   = _date.fromisocalendar(año_int, semana_int, 1)
            domingo = _date.fromisocalendar(año_int, semana_int, 7)
            qs = qs.filter(fecha__gte=lunes, fecha__lte=domingo)
        except (ValueError, TypeError):
            pass
    return qs


def _resumen_filtros_activos(request_get):
    """Lista de filtros realmente activos (puestos por el usuario), para el
    badge y las etiquetas removibles de la vista móvil. Se lee de request.GET
    crudo, no del get_params ya mutado por la vista (que fuerza fecha_desde/
    fecha_hasta a hoy si el usuario no las puso — eso no debe contar como
    filtro activo)."""

    activos = []

    fecha_desde = request_get.get('fecha_desde', '').strip()
    fecha_hasta = request_get.get('fecha_hasta', '').strip()

    if fecha_desde or fecha_hasta:
        etiqueta = ' - '.join(v for v in (fecha_desde, fecha_hasta) if v)
        activos.append({'clave': 'fecha_desde,fecha_hasta', 
                        'etiqueta': etiqueta})

    semana = request_get.get('semana', '').strip()
    if semana:
        activos.append({'clave': 'semana',
                        'etiqueta': f"{_('semana')} {semana}"})

    turno = request_get.get('turno', '').strip()
    if turno in ('1', '2'):
        activos.append({'clave': 'turno', 
                        'etiqueta': _('Turno 1') if turno == '1' else _('Turno 2')})

    estatus_vals = [v for v in request_get.getlist('estatus') if v in ESTATUS_LABELS]
    if estatus_vals:
        etiqueta = ', '.join(_(ESTATUS_LABELS[v]) for v in estatus_vals)
        activos.append({'clave': 'estatus', 'etiqueta': etiqueta})

    buscar = request_get.get('buscar', '').strip()
    q      = request_get.get('q', '').strip()
    if buscar:
        activos.append({'clave': 'buscar', 'etiqueta': buscar})
    elif q:
        activos.append({'clave': 'q', 'etiqueta': q})

    resp = request_get.get('resp', '').strip()
    if resp:
        activos.append({'clave': 'resp', 'etiqueta': resp})

    equipo = request_get.get('equipo', '').strip()
    if equipo:
        activos.append({'clave': 'equipo', 'etiqueta': equipo})
        
    return activos

ORDEN_PERMITIDO = {
    'fecha': 'fecha', '-fecha': '-fecha',
    'hora': 'hora', '-hora': '-hora',
    'tiempo_minutos': 'tiempo_minutos', '-tiempo_minutos': '-tiempo_minutos',
}


def _aplicar_orden(qs, get_params, default=None):
    """Ordena por el campo pedido en ?orden=; si no es válido, usa `default`."""
    campo = ORDEN_PERMITIDO.get(get_params.get('orden', ''))
    if campo:
        return qs.order_by(campo)
    if default:
        return qs.order_by(*default)
    return qs


def _parse_fecha(s):
    """
    Parsea fecha desde string dd/mm/yyyy, dd/mm/yy, dd-mm-yy
    o desde objeto datetime/date de openpyxl (cuando Excel convierte la celda).
    """
    from datetime import date as _d, datetime as _dt
    if isinstance(s, (_dt, _d)):
        if isinstance(s, _dt):
            return s.date()
        return s
    s_original = str(s).strip()
    s = s_original.replace('-', '/').replace('.', '/')
    partes = s.split('/')
    if len(partes) != 3:
        raise ValueError(f"Fecha '{s_original}' no reconocida (usa el formato dd/mm/aaaa)")
    try:
        dia  = int(partes[0])
        mes  = int(partes[1])
        anio = int(partes[2])
    except ValueError:
        raise ValueError(f"Fecha '{s_original}' no reconocida (usa el formato dd/mm/aaaa)")
    if anio < 100:
        anio += 2000
    if mes > 12:
        raise ValueError(f"Fecha '{s_original}' inválida — el mes '{mes}' no existe (máximo 12). Usa el formato dd/mm/aaaa, no mm/dd/aaaa")
    try:
        return _d(anio, mes, dia)
    except ValueError:
        raise ValueError(f"Fecha '{s_original}' inválida — revisa que sea dd/mm/aaaa (día/mes/año)")


import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from django.http import HttpResponse


def _excel_response(filename):
    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _estilo_cabecera(ws, cabeceras, col_widths):
    header_fill = PatternFill('solid', fgColor='4F46E5')
    header_font = Font(bold=True, color='FFFFFF')
    ws.append(cabeceras)
    for col in range(1, len(cabeceras) + 1):
        cell = ws.cell(row=1, column=col)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')
    for i, w in enumerate(col_widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w