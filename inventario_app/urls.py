from django.urls import path
from . import views

urlpatterns = [
    # Refacciones
    path('',                                    views.lista_refacciones,               name='lista_refacciones'),
    path('nueva/',                              views.form_refaccion,                  name='nueva_refaccion'),
    path('editar/<int:pk>/',                    views.form_refaccion,                  name='editar_refaccion'),
    path('eliminar/<int:pk>/',                  views.eliminar_refaccion,              name='eliminar_refaccion'),

    # Refacciones imagenes
    path('<int:refaccion_pk>/imagenes/subir/',  views.subir_imagenes_refaccion,        name='subir_imagenes_refaccion'),
    path('<int:refaccion_pk>/imagenes/',        views.imagenes_refaccion,              name='imagenes_refaccion'),
    path('imagen/eliminar/<int:imagen_id>/',    views.eliminar_imagen_refaccion,       name='eliminar_imagen_refaccion'),
    path('importar-stock/',                     views.importar_stock,                  name='importar_stock'),
    path('importar-stock/plantilla/',           views.descargar_plantilla_stock,       name='descargar_plantilla_stock'),

    # Seguimiento de refacciones
    path('seguimientos/',                       views.lista_seguimientos_refaccion,    name='lista_seguimientos_refaccion'),
    path('seguimientos/nuevo/',                 views.guardar_seguimiento_refaccion,   name='nuevo_seguimiento_refaccion'),
    path('seguimientos/editar/<int:pk>/',       views.guardar_seguimiento_refaccion,   name='editar_seguimiento_refaccion'),
    path('seguimientos/eliminar/<int:pk>/',     views.eliminar_seguimiento_refaccion,  name='eliminar_seguimiento_refaccion'),
    path('buscar/',                             views.buscar_refacciones,              name='buscar_refacciones'),

    # Seguimiento de servicios
    path('servicios/',                          views.lista_seguimientos_servicio,     name='lista_seguimientos_servicio'),
    path('servicios/nuevo/',                    views.guardar_seguimiento_servicio,    name='nuevo_seguimiento_servicio'),
    path('servicios/editar/<int:pk>/',          views.guardar_seguimiento_servicio,    name='editar_seguimiento_servicio'),
    path('servicios/eliminar/<int:pk>/',        views.eliminar_seguimiento_servicio,   name='eliminar_seguimiento_servicio'),
]