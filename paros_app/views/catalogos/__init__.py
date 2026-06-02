# Paquete catalogos — migración completa
# catalogos_original.py puede eliminarse

from .fallas import (
    catalogo_fallas_general,
    catalogo_fallas,
    eliminar_falla,
    limpiar_fallas_area,
    importar_fallas_v2,
    importar_fallas_por_area,
    descargar_plantilla_fallas_v2,
    exportar_fallas,
    agregar_falla,
    editar_falla,
)
from .equipos import (
    catalogo_equipos_general,
    limpiar_equipos_area,
    importar_equipos,
    importar_equipos_por_area,
    descargar_plantilla_equipos,
    eliminar_equipo,
    exportar_equipos,
    agregar_equipos,
    editar_equipo
)
from .responsables import (
    catalogo_responsables_general,
    limpiar_responsables_area,
    importar_responsables,
    importar_responsables_por_area,
    descargar_plantilla_responsables,
    eliminar_responsable,
    exportar_responsables,
    agregar_responsables,
    editar_responsable,
)