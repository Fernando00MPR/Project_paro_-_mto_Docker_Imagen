from django.urls import path
from . import views

urlpatterns = [
    # Plan de mantenimiento
    path('equipos/',                                                         views.lista_plan,                  name='lista_plan'),
    path('equipos/nuevo/',                                                   views.form_plan,                   name='nuevo_plan'),
    path('equipos/editar/<int:pk>/',                                         views.form_plan,                   name='editar_plan'),
    path('equipos/eliminar/<int:pk>/',                                       views.eliminar_plan,               name='eliminar_plan'),
    path('equipos/eliminar-todos/',                                          views.eliminar_todos_planes_area,  name='eliminar_todos_planes_area'),
    path('equipos/<int:pk>/modal/',                                          views.modal_plan,                  name='modal_plan'),
    path('equipos/<int:pk>/historial-exportar/',                             views.historial_plan_exportar,     name='historial_plan_exportar'),
    path('equipos/<int:pk>/detalle-json/',                                   views.plan_detalle_json,           name='plan_detalle_json'),
    path('equipos/importar/',                                                views.importar_plan,               name='importar_plan'),
    path('equipos/exportar/',                                                views.exportar_plan,               name='exportar_plan'),
    path('equipos/plantilla/',                                               views.descargar_plantilla,         name='descargar_plantilla'),
    path('equipos/<int:plan_pk>/registro/<int:semana>/<int:anio>/',          views.registro_ejecucion,          name='registro_ejecucion'),
    path('equipos/<int:plan_pk>/registro/<int:semana>/<int:anio>/eliminar/', views.eliminar_registro,           name='eliminar_registro'),
    path('equipos/<int:plan_pk>/asignar/<int:semana>/<int:anio>/',           views.asignar_responsable,         name='asignar_responsable'),
    path('equipos/semanas/conteo/',                                          views.conteo_ots_semanas,          name='conteo_ots_semanas'),
    path('equipos/semanas/distribucion/',                                    views.distribucion_ots,            name='distribucion_ots'),


    path('rutinas/historial/acciones/',                               views.historial_acciones,            name='historial_acciones'),
    path('rutinas/modal/',                                            views.rutinas_modal,                 name='rutinas_modal'),
    path('rutinas/importar-modal/',                                   views.rutina_importar,               name='rutina_importar'),
    path('rutinas/validar-modal/',                                    views.rutina_validar,                name='rutina_validar'),
    path('rutinas/plantilla/',                                        views.rutina_plantilla,              name='rutina_plantilla'),
    path('rutinas/eliminar-modal/',                                   views.rutina_eliminar,               name='rutina_eliminar'),

    path('exportar/semana/',                                          views.exportar_semana_excel,         name='exportar_semana_excel'),
    path('exportar/tiempo-personas/',                                 views.exportar_tiempo_personas,      name='exportar_tiempo_personas'),
    path('exportar/semana/status/<str:token>/',                       views.exportar_semana_status,        name='exportar_semana_status'),
    path('exportar/semana/download/<str:token>/',                     views.exportar_semana_download,      name='exportar_semana_download'),
    
    path('responsables/buscar-mto/',                                  views.buscar_responsables_mto,       name='buscar_responsables_mto'),
    path('responsables/modal/',                                       views.responsables_modal,            name='responsables_modal'),
    path('responsables/guardar/',                                     views.responsable_guardar,           name='guardar_responsable'),
    path('responsables/guardar/<int:pk>/',                            views.responsable_guardar,           name='guardar_responsable'),
    path('responsables/alternar/<int:pk>/',                           views.responsable_alternar,          name='alternar_responsable'),
    path('responsables/eliminar-modal/<int:pk>/',                     views.responsable_eliminar_modal,    name='eliminar_responsable_modal'),
    
    path('dashboard/',                                                views.dashboard,                     name='dashboard'),

    path('seguimientos/',                                             views.lista_seguimientos,            name='lista_seguimientos'),
    path('seguimientos/exportar/',                                    views.seguimientos_exportar,         name='seguimientos_exportar'),
    path('seguimiento/agregar/<int:registro_pk>/',                    views.agregar_seguimiento,           name='agregar_seguimiento'),
    path('seguimiento/editar/<int:seguimiento_pk>/',                  views.editar_seguimiento,            name='editar_seguimiento'),
    path('seguimiento/eliminar/<int:seguimiento_pk>/',                views.eliminar_seguimiento,          name='eliminar_seguimiento'),
    path('seguimiento/validar-ot/<int:seg_pk>/',                      views.toggle_validado_ot,            name='toggle_validado_ot'),
    path('seguimiento/validar-manual/<int:seg_pk>/',                  views.toggle_validado_manual,        name='toggle_validado_manual'),

    path('seguimiento-manual/agregar/',                               views.agregar_seguimiento_manual,    name='agregar_seguimiento_manual'),
    path('seguimiento-manual/editar/<int:seg_pk>/',                   views.editar_seguimiento_manual,     name='editar_seguimiento_manual'),
    path('seguimiento-manual/eliminar/<int:seg_pk>/',                 views.eliminar_seguimiento_manual,   name='eliminar_seguimiento_manual'),

    path('seguimiento/<str:tipo>/<int:seg_pk>/imagenes/subir/',       views.subir_imagenes_seguimiento,    name='subir_imagenes_seguimiento'),
    path('seguimiento/<str:tipo>/<int:seg_pk>/imagenes/',             views.imagenes_seguimiento,          name='imagenes_seguimiento'),
    path('seguimiento/imagen/eliminar/<int:imagen_id>/',              views.eliminar_imagen_seguimiento,   name='eliminar_imagen_seguimiento'),

    path('backlog/',                                                  views.backlog_seguimientos,          name='backlog_seguimientos'),
    path('backlog/exportar/',                                         views.backlog_exportar,              name='backlog_exportar'),

    path('bitacora/',                                                 views.lista_bitacora,                name='lista_bitacora'),
    path('bitacora/nuevo/',                                           views.form_bitacora,                 name='nuevo_bitacora'),
    path('bitacora/editar/<int:pk>/',                                 views.form_bitacora,                 name='editar_bitacora'),
    path('bitacora/eliminar/<int:pk>/',                               views.eliminar_bitacora,             name='eliminar_bitacora'),
    path('bitacora/buscar-equipos/',                                  views.buscar_equipos_bitacora,       name='buscar_equipos_bitacora'),
    path('bitacora/buscar-responsables/',                             views.buscar_responsables_bitacora,  name='buscar_responsables_bitacora'),
    path('bitacora/guardar/',                                         views.bitacora_guardar,              name='guardar_bitacora'),
    path('bitacora/guardar/<int:pk>/',                                views.bitacora_guardar,              name='guardar_bitacora'),
    path('bitacora/ultimo-equipo/',                                   views.bitacora_ultimo_equipo,        name='ultimo_equipo_bitacora'),
    path('bitacora/exportar/',                                        views.bitacora_exportar,             name='exportar_bitacora'),
    path('bitacora/<int:pk>/imagenes/',                               views.imagenes_bitacora,             name='imagenes_bitacora'),
    path('bitacora/imagen/<int:imagen_id>/eliminar/',                 views.eliminar_imagen_bitacora,      name='eliminar_imagen_bitacora'),

    path('documentos/',                                 views.documentos_generales,  name='documentos_generales'),
    path('documentos/carpeta/nueva/',                   views.crear_carpeta,         name='crear_carpeta_raiz'),
    path('documentos/carpeta/<int:parent_id>/nueva/',   views.crear_carpeta,         name='crear_carpeta'),
    path('documentos/carpeta/<int:pk>/',                views.carpeta_detalle,       name='carpeta_detalle'),
    path('documentos/carpeta/<int:pk>/editar/',         views.editar_carpeta,        name='editar_carpeta'),
    path('documentos/carpeta/<int:pk>/renombrar/',      views.renombrar_carpeta,     name='renombrar_carpeta'),
    path('documentos/carpeta/<int:pk>/eliminar/',       views.eliminar_carpeta,      name='eliminar_carpeta'),
    path('documentos/carpeta/<int:carpeta_id>/subir/',  views.subir_documento,       name='subir_documento'),
    path('documentos/carpeta/<int:pk>/mover/',          views.mover_carpeta,         name='mover_carpeta'),
    path('documentos/<int:pk>/renombrar/',              views.renombrar_documento,   name='renombrar_documento'),
    path('documentos/<int:pk>/eliminar/',               views.eliminar_documento,    name='eliminar_documento'),
    path('documentos/<int:pk>/mover/',                  views.mover_documento,       name='mover_documento'),
]