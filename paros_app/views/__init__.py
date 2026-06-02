# Este paquete reemplaza el antiguo views.py de paros_app.
# Migración completa — _views_original.py puede eliminarse.

from .utils        import _aplicar_filtros, _parse_fecha
from .paros        import (
    _registrar_bitacora,
    _campos_paro_dict,
    lista_paros,
    lista_paros_por_area,
    crear_paro,
    editar_paro,
    eliminar_paro,
    cambiar_estatus_paro,
    actualizar_campo_paro,
)
from .exportacion  import (
    exportar_csv, 
    exportar_excel, 
    importar_paros
)
from .autocomplete import (
    buscar_fallas, 
    buscar_equipos, 
    buscar_responsables, 
    siguiente_codigo_falla, 
    siguiente_codigo_equipo, 
    siguiente_codigo_responsable
)
from .dashboard import dashboard, analisis_paros
from .catalogos import (
    catalogo_fallas_general,
    catalogo_fallas,
    eliminar_falla,
    limpiar_fallas_area,
    importar_fallas_v2,
    importar_fallas_por_area,
    descargar_plantilla_fallas_v2,
    exportar_fallas,
    catalogo_equipos_general,
    limpiar_equipos_area,
    importar_equipos,
    importar_equipos_por_area,
    descargar_plantilla_equipos,
    eliminar_equipo,
    exportar_equipos,
    catalogo_responsables_general,
    limpiar_responsables_area,
    importar_responsables,
    importar_responsables_por_area,
    descargar_plantilla_responsables,
    eliminar_responsable,
    exportar_responsables,
    agregar_falla,
    agregar_equipos,
    agregar_responsables,
    editar_falla,
    editar_equipo,
    editar_responsable,
)
from .produccion import (
    registro_produccion, 
    agregar_registro, 
    eliminar_registro, 
    actualizar_registro, 
    actualizar_orden, 
    indicadores_produccion, 
    guardar_target, 
    guardar_accion_dia, 
    get_accion_dia
)