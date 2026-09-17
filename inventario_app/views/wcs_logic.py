"""
Lógica de negocio del Panel de Tareas WCS (Almacén Automático).
Funciones puras, sin dependencias de Django ni de pandas/openpyxl —
operan sobre tipos nativos de Python (str, datetime, listas).
"""
from datetime import datetime, timedelta

GRUPOS_STACKER = {
    "1Z01": "Stacker 1", "1Z02": "Stacker 1",
    "1Z03": "Stacker 2", "1Z04": "Stacker 2",
    "1Z05": "Stacker 3", "1Z06": "Stacker 3", "1Z07": "Stacker 3",
    "2Z08": "Stacker 4", "2Z09": "Stacker 4",
    "2Z10": "Stacker 5", "2Z11": "Stacker 5",
    "2Z12": "Stacker 6", "2Z13": "Stacker 6",
    "2Z14": "Stacker 7", "2Z15": "Stacker 7",
}

LISTA_STACKERS = [f"Stacker {i}" for i in range(1, 8)] + ["Traslado"]


def encontrar_columna(encabezados, nombre_objetivo):
    """
    encabezados: lista de strings (primera fila del Excel tal cual la
    devuelve openpyxl, con posibles espacios extra al final).
    Devuelve el ÍNDICE (0-based) de la columna que coincide, o None.
    """
    objetivo = nombre_objetivo.strip().lower()
    for i, col in enumerate(encabezados):
        if col and str(col).strip().lower() == objetivo:
            return i
    return None


def determinar_stacker(origen, destino):
    for ubicacion in (origen, destino):
        prefijo = str(ubicacion or '')[:4]
        if prefijo in GRUPOS_STACKER:
            return GRUPOS_STACKER[prefijo]
    return "Traslado"


def determinar_movimiento(origen, destino):
    o, d = str(origen or ''), str(destino or '')
    if o.startswith("1Z") or o.startswith("2Z"):
        return "Bajada"
    if d.startswith("1Z") or d.startswith("2Z"):
        return "Subida"
    return "Traslado"


def calcular_duracion_min(creado, finalizado):
    """
    creado/finalizado: datetime o None.
    Devuelve minutos (float, 1 decimal) o None si falta alguna fecha.
    """
    if not creado or not finalizado:
        return None
    return round((finalizado - creado).total_seconds() / 60, 1)


def construir_buckets(desde, hasta, fechas_creado):
    """
    desde/hasta: objetos date, o None (ya validados por quien llame).
    fechas_creado: lista de datetime de las tareas cargadas (columna 'creado').
    Devuelve (inicio, fin, horas) — 'horas' es una lista de datetime,
    cada uno el INICIO de un bucket de 1 hora, entre 'inicio' y 'fin'.
    """
    if desde:
        inicio = datetime.combine(desde, datetime.min.time()).replace(hour=6)
    elif fechas_creado:
        minimo = min(fechas_creado)
        inicio = minimo.replace(hour=6, minute=0, second=0, microsecond=0)
        if minimo < inicio:
            inicio -= timedelta(days=1)
    else:
        return None, None, []

    if hasta:
        fin = datetime.combine(hasta, datetime.min.time()).replace(hour=6)
    elif fechas_creado:
        maximo = max(fechas_creado)
        fin = maximo.replace(hour=6, minute=0, second=0, microsecond=0)
        if maximo >= fin:
            fin += timedelta(days=1)
    else:
        return None, None, []

    if fin <= inicio:
        fin = inicio + timedelta(days=1)

    LIMITE_HORAS = 24 * 90
    if (fin - inicio).total_seconds() / 3600 > LIMITE_HORAS:
        fin = inicio + timedelta(hours=LIMITE_HORAS)

    horas = []
    t = inicio
    while t < fin:
        horas.append(t)
        t += timedelta(hours=1)

    return inicio, fin, horas


def construir_histograma_duracion(duraciones):
    """
    duraciones: lista de floats (los None se ignoran) — duracion_min de las tareas.
    """
    BUCKET, TOPE = 5, 60
    etiquetas = [f"{i}-{i + BUCKET}" for i in range(0, TOPE, BUCKET)] + [f"{TOPE}+"]
    conteos = [0] * len(etiquetas)
    for d in duraciones:
        if d is None or d < 0:
            continue
        idx = len(etiquetas) - 1 if d >= TOPE else int(d // BUCKET)
        conteos[idx] += 1
    mejor_idx = max(range(len(conteos)), key=lambda i: conteos[i]) if conteos else None
    return {
        "etiquetas": etiquetas,
        "conteos": conteos,
        "rango_frecuente": etiquetas[mejor_idx] if mejor_idx is not None and conteos[mejor_idx] else None,
        "rango_frecuente_count": conteos[mejor_idx] if mejor_idx is not None else 0,
    }
