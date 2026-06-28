from django.urls import path
from . import views

urlpatterns = [
    # ── Dashboard ─────────────────────────────────────────────────────────────
    path('dashboard/',      views.dashboard,      name='dashboard'),
    path('analisis/',       views.analisis_paros, name='analisis_paros'),
    path('dashboard/json/', views.dashboard_json, name='dashboard_json'),

    # ── Paros ──────────────────────────────────────────────────────────────
    path('paros/',                              views.lista_paros,             name='lista_paros'),
    path('paros/area/<int:area_id>/',           views.lista_paros_por_area,    name='lista_paros_por_area'),
    path('paros/nuevo/',                        views.crear_paro,              name='crear_paro'),
    path('paros/editar/<int:paro_id>/',         views.editar_paro,             name='editar_paro'),
    path('paros/eliminar/<int:paro_id>/',       views.eliminar_paro,           name='eliminar_paro'),
    path('paros/actualizar/<int:paro_id>/',     views.actualizar_campo_paro,   name='actualizar_campo_paro'),
    path('paros/estatus/<int:paro_id>/',        views.cambiar_estatus_paro,    name='cambiar_estatus_paro'),

    # ── Exportación ────────────────────────────────────────────────────────
    path('paros/importar/',                     views.importar_paros,          name='importar_paros'),
    path('paros/exportar/csv/',                 views.exportar_csv,            name='exportar_csv'),
    path('paros/exportar/excel/',               views.exportar_excel,          name='exportar_excel'),

    # ── API autocomplete ──────────────────────────────────────────────────────
    path('fallas/buscar/',                 views.buscar_fallas,                name='buscar_fallas'),
    path('equipos/buscar/',                views.buscar_equipos,               name='buscar_equipos'),
    path('responsables/buscar/',           views.buscar_responsables,          name='buscar_responsables'),
    path('fallas/siguiente-codigo/',       views.siguiente_codigo_falla,       name='siguiente_codigo_falla'),
    path('equipos/siguiente-codigo/',      views.siguiente_codigo_equipo,      name='siguiente_codigo_equipo'),
    path('responsables/siguiente-codigo/', views.siguiente_codigo_responsable, name='siguiente_codigo_responsable'),

    # ── Catálogo de FALLAS ─────────────────────────────────────────────────
    path('catalogos/fallas/',                              views.catalogo_fallas_general,       name='catalogo_fallas_general'),
    path('catalogos/fallas/area/<int:area_id>/',           views.catalogo_fallas,               name='catalogo_fallas'),
    path('catalogos/fallas/importar/',                     views.importar_fallas_v2,            name='importar_fallas'),
    path('catalogos/fallas/importar/area/<int:area_id>/',  views.importar_fallas_por_area,      name='importar_fallas_por_area'),
    path('catalogos/fallas/exportar/',                     views.exportar_fallas,               name='exportar_fallas'),
    path('catalogos/fallas/exportar/area/<int:area_id>/',  views.exportar_fallas,               name='exportar_fallas_area'),
    path('catalogos/fallas/plantilla/',                    views.descargar_plantilla_fallas_v2, name='descargar_plantilla_fallas'),
    path('catalogos/fallas/eliminar/<int:falla_id>/',      views.eliminar_falla,                name='eliminar_falla'), 
    path('catalogos/fallas/limpiar/<int:area_id>/',        views.limpiar_fallas_area,           name='limpiar_fallas_area'),
    path('catalogos/fallas/agregar/<int:area_id>/',        views.agregar_falla,                 name='agregar_falla'),
    path('catalogos/fallas/editar/<int:falla_id>/',        views.editar_falla,                  name='editar_falla'),

    # ── Catálogo de EQUIPOS ────────────────────────────────────────────────
    path('catalogos/equipos/',                             views.catalogo_equipos_general,       name='catalogo_equipos'),
    path('catalogos/equipos/importar/',                    views.importar_equipos,               name='importar_equipos'),
    path('catalogos/equipos/importar/area/<int:area_id>/', views.importar_equipos_por_area,      name='importar_equipos_por_area'),
    path('catalogos/equipos/exportar/',                    views.exportar_equipos,               name='exportar_equipos'),
    path('catalogos/equipos/exportar/area/<int:area_id>/', views.exportar_equipos,               name='exportar_equipos_area'),
    path('catalogos/equipos/plantilla/',                   views.descargar_plantilla_equipos,    name='descargar_plantilla_equipos'),
    path('catalogos/equipos/eliminar/<int:equipo_id>/',    views.eliminar_equipo,                name='eliminar_equipo'),
    path('catalogos/equipos/limpiar/<int:area_id>/',       views.limpiar_equipos_area,           name='limpiar_equipos_area'),
    path('catalogos/equipos/agregar/<int:area_id>/',       views.agregar_equipos,                name='agregar_equipo'),
    path('catalogos/equipos/editar/<int:equipo_id>/',      views.editar_equipo,                  name='editar_equipo'),

    # ── Catálogo de RESPONSABLES ───────────────────────────────────────────
    path('catalogos/responsables/',                              views.catalogo_responsables_general,    name='catalogo_responsables'),
    path('catalogos/responsables/importar/',                     views.importar_responsables,            name='importar_responsables'),
    path('catalogos/responsables/importar/area/<int:area_id>/',  views.importar_responsables_por_area,   name='importar_responsables_por_area'),
    path('catalogos/responsables/exportar/',                     views.exportar_responsables,            name='exportar_responsables'),
    path('catalogos/responsables/exportar/area/<int:area_id>/',  views.exportar_responsables,            name='exportar_responsables_area'),
    path('catalogos/responsables/plantilla/',                    views.descargar_plantilla_responsables, name='descargar_plantilla_responsables'),
    path('catalogos/responsables/eliminar/<int:responsable_id>/',views.eliminar_responsable,             name='eliminar_responsable'),
    path('catalogos/responsables/limpiar/<int:area_id>/',        views.limpiar_responsables_area,        name='limpiar_responsables_area'),
    path('catalogos/responsables/agregar/<int:area_id>/',        views.agregar_responsables,             name='agregar_responsable'),
    path('catalogos/responsables/editar/<int:responsable_id>/',  views.editar_responsable,               name='editar_responsable'),

    # ── Regristo Timepo de Producción ───────────────────────────────────────────
    path('produccion/',                              views.registro_produccion,    name='registro_produccion'),
    path('produccion/agregar/',                      views.agregar_registro,       name='agregar_registro'),
    path('produccion/eliminar/<int:registro_id>/',   views.eliminar_registro,      name='eliminar_registro'),
    path('produccion/actualizar/<int:registro_id>/', views.actualizar_registro,    name='actualizar_registro'),
    path('produccion/orden/',                        views.actualizar_orden,       name='actualizar_orden'),
    path('produccion/indicadores/',                  views.indicadores_produccion, name='indicadores_produccion'),
    path('produccion/target/',                       views.guardar_target,         name='guardar_target'),
    path('produccion/accion-dia/',                   views.guardar_accion_dia,     name='guardar_accion_dia'),
    path('produccion/accion-dia/get/',               views.get_accion_dia,         name='get_accion_dia'),

    # ── Hora x Hora ───────────────────────────────────────────
    path('hora-hora/',                               views.hora_hora,                      name='hora_hora'),
    path('hora-hora/guardar/',                       views.guardar_hora_hora,              name='guardar_hora_hora'),
    path('hora-hora/eficiencia/',                    views.eficiencia_data,                name='eficiencia_data'),
    path('hora-hora/target/guardar/',                views.guardar_target_hora_hora,       name='guardar_target_hora_hora'),
    path('hora-hora/target/get/',                    views.get_target_hora_hora,           name='get_target_hora_hora'),
    path('hora-hora/target/anual/guardar/',          views.guardar_target_anual_hora_hora, name='guardar_target_anual_hora_hora'),
    path('hora-hora/target/anual/get/',              views.get_target_anual_hora_hora,     name='get_target_anual_hora_hora'),

    path('paros/<int:paro_id>/imagenes/',          views.imagenes_paro,         name='imagenes_paro'),
    path('paros/imagen/eliminar/<int:imagen_id>/', views.eliminar_imagen_paro,  name='eliminar_imagen_paro'),
]


