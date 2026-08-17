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
    imagenes_paro,
    eliminar_imagen_paro,
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

from .dashboard import (
    dashboard, 
    analisis_paros,
    dashboard_json
)

from .catalogos import (
    catalogo_fallas_general,
    catalogo_fallas,
    catalogo_equipos_general,
    catalogo_responsables_general,
    catalogo_moldes_general,
    
    importar_fallas_v2,
    importar_responsables,
    importar_moldes,
    importar_equipos,

    importar_fallas_por_area,
    importar_equipos_por_area,
    importar_responsables_por_area,

    exportar_fallas,
    exportar_equipos,
    exportar_responsables,
    exportar_moldes,

    agregar_falla,
    agregar_equipos,
    agregar_responsables,
    agregar_moldes,

    editar_falla,
    editar_equipo,
    editar_responsable,
    editar_molde,

    eliminar_falla,
    eliminar_equipo,
    eliminar_responsable,
    eliminar_molde,

    limpiar_fallas_area,
    limpiar_equipos_area,
    limpiar_responsables_area,
    limpiar_moldes_area,

    descargar_plantilla_fallas_v2,
    descargar_plantilla_equipos,
    descargar_plantilla_responsables,
    descargar_plantilla_moldes,
)

from .registro_produccion import (
    registro_produccion,
    agregar_registro,
    eliminar_registro,
    actualizar_registro,
    actualizar_orden,
)

from .indicadores_produccion import (
    indicadores_produccion,
    tendencia_indicadores,
    guardar_target,
    guardar_accion_dia,
    get_accion_dia,
)

from .hora_hora import (
    hora_hora,
    guardar_hora_hora,
    eficiencia_data,
    guardar_target_hora_hora,
    get_target_hora_hora,
    guardar_target_anual_hora_hora,
    get_target_anual_hora_hora,
)

from .bitacora_agv import (
    bitacora_agv,
    guardar_agv,
    cumplimiento_agv_data,
    guardar_target_agv,
    get_target_agv,
)