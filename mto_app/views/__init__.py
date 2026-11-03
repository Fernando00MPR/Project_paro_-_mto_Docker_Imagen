from .utils import (
    lunes_de_semana, 
    _planes_que_tocan, 
    _frecuencia_desde_excel
)

from .planes import (
    lista_plan,
    form_plan,
    eliminar_plan,
    eliminar_todos_planes_area,
    modal_plan,
    historial_plan_exportar,
    plan_detalle_json,
    importar_plan,
    descargar_plantilla,
    exportar_plan,
    exportar_tiempo_personas,
    conteo_ots_semanas,
    distribucion_ots,
)

from .rutinas import (
    historial_acciones,
    rutinas_modal,
    rutina_importar,
    rutina_validar,
    rutina_plantilla,
    rutina_eliminar,
)

from .exportacion import (
    exportar_semana_excel, 
    exportar_semana_status, 
    exportar_semana_download
)

from .responsables import (
    buscar_responsables_mto,
    responsables_modal,
    responsable_guardar,
    responsable_alternar,
    responsable_eliminar_modal,
)

from .dashboard import dashboard

from .registro_ejecucion import (
    registro_ejecucion,
    eliminar_registro,
    asignar_responsable,
)


from .backlog import backlog_seguimientos, backlog_exportar

from .seguimiento_ot import (
    agregar_seguimiento, 
    editar_seguimiento, 
    eliminar_seguimiento, 
    toggle_validado_ot,
)

from .seguimiento_manual import (
    agregar_seguimiento_manual, 
    editar_seguimiento_manual, 
    eliminar_seguimiento_manual, 
    toggle_validado_manual,
)

from .lista_seguimientos import (
    lista_seguimientos, 
    subir_imagenes_seguimiento, 
    imagenes_seguimiento, 
    eliminar_imagen_seguimiento,
)

from .seguimientos_exportar import seguimientos_exportar

from .bitacora import (
    lista_bitacora,
    form_bitacora,
    eliminar_bitacora,
    imagenes_bitacora,
    eliminar_imagen_bitacora,
    buscar_equipos_bitacora,
    buscar_responsables_bitacora,
    bitacora_guardar,
    bitacora_ultimo_equipo,
    bitacora_exportar,

)

from .documentacion import (
    documentos_generales,
    carpeta_detalle,
    crear_carpeta,
    editar_carpeta,
    renombrar_carpeta,
    renombrar_documento,
    eliminar_carpeta,
    subir_documento,
    eliminar_documento,
    mover_carpeta,
    mover_documento,
)