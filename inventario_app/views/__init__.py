from .inventario import (
    lista_refacciones,
    detalle_refaccion,
    ajustar_stock_refaccion,
    form_refaccion,
    eliminar_refaccion,
    eliminar_todas_refacciones_area,
    crear_categoria_refaccion,
    editar_categoria_refaccion,
    eliminar_categoria_refaccion,
    subir_imagenes_refaccion,
    imagenes_refaccion,
    eliminar_imagen_refaccion,
    buscar_refacciones,
    importar_stock,
    descargar_plantilla_stock,
    importar_completo,
    descargar_plantilla_completa,
    exportar_refacciones,
)

from .seguimiento_refacciones import (
    lista_seguimientos_refaccion,
    guardar_seguimiento_refaccion,
    eliminar_seguimiento_refaccion,
    exportar_seguimientos_refaccion,
)

from .seguimiento_servicios import (
    lista_seguimientos_servicio,
    guardar_seguimiento_servicio,
    eliminar_seguimiento_servicio,
    exportar_seguimientos_servicio,
    buscar_servicios_catalogo,
    crear_servicio_catalogo,
    editar_servicio_catalogo,
    eliminar_servicio_catalogo,
)

from .wcs_panel import (
    panel_wcs,
    procesar_wcs,
)
