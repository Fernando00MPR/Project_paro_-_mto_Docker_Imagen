from datetime import datetime

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST
from python_calamine import CalamineWorkbook

from .wcs_logic import encontrar_columna, determinar_stacker, determinar_movimiento, calcular_duracion_min


COLUMNAS_REQUERIDAS = {
    'serial':     'Número de serie',
    'codigo':     'GoodsID',
    'material':   'Nombre del material',
    'creado':     'CreateTime',
    'finalizado': 'Tiempo de finalización',
    'rack':       'Código del aparato',
    'status':     'Estado de la tarea',
    'origen':     'ubicación de origen',
    'destino':    'ubicación del objetivo',
}


@login_required
def panel_wcs(request):
    return render(request, 'inventario_app/wcs_panel.html')


@login_required
@require_POST
def procesar_wcs(request):
    archivo = request.FILES.get('archivo')
    if not archivo:
        return JsonResponse({'ok': False, 'error': 'Selecciona un archivo Excel.'}, status=400)

    nombre = archivo.name.lower()
    if not nombre.endswith(('.xlsx', '.xls')):
        return JsonResponse({'ok': False, 'error': 'Formato no soportado. Usa un archivo Excel (.xlsx).'}, status=400)

    try:
        wb = CalamineWorkbook.from_filelike(archivo)
        filas = iter(wb.get_sheet_by_index(0).to_python())
        encabezados = next(filas, None)
        if not encabezados:
            return JsonResponse({'ok': False, 'error': 'El archivo está vacío.'}, status=400)

        indices = {}
        faltantes = []
        for clave, nombre_columna in COLUMNAS_REQUERIDAS.items():
            idx = encontrar_columna(encabezados, nombre_columna)
            if idx is None:
                faltantes.append(nombre_columna)
            indices[clave] = idx

        if faltantes:
            return JsonResponse({
                'ok': False,
                'error': f"Columnas faltantes en el archivo: {', '.join(faltantes)}",
            }, status=400)

        tareas = []
        for fila in filas:
            if not any(fila):
                continue

            serial     = fila[indices['serial']]
            codigo     = fila[indices['codigo']]
            material   = fila[indices['material']]
            rack       = fila[indices['rack']]
            status     = fila[indices['status']]
            origen     = fila[indices['origen']]
            destino    = fila[indices['destino']]
            creado     = fila[indices['creado']]
            finalizado = fila[indices['finalizado']]

            if not isinstance(creado, datetime):
                creado = None
            if not isinstance(finalizado, datetime):
                finalizado = None

            tareas.append({
                'serial':       serial,
                'codigo':       codigo,
                'rack':         rack,
                'material':     material,
                'status':       status,
                'creado':       creado.isoformat() if creado else None,
                'finalizado':   finalizado.isoformat() if finalizado else None,
                'duracion_min': calcular_duracion_min(creado, finalizado),
                'origen':       origen,
                'destino':      destino,
                'movimiento':   determinar_movimiento(origen, destino),
                'stacker':      determinar_stacker(origen, destino),
            })

        return JsonResponse({'ok': True, 'tareas': tareas, 'total': len(tareas)})

    except Exception as e:
        return JsonResponse({'ok': False, 'error': f'Error al leer el archivo: {e}'}, status=400)
