from django.urls import path
from . import views

urlpatterns = [
    # Plan de mantenimiento
    path('equipos/',                         views.lista_plan,           name='lista_plan'),
    path('equipos/nuevo/',                   views.form_plan,            name='nuevo_plan'),
    path('equipos/editar/<int:pk>/',         views.form_plan,            name='editar_plan'),
    path('equipos/eliminar/<int:pk>/',       views.eliminar_plan,        name='eliminar_plan'),
    path('equipos/<int:pk>/modal/',          views.modal_plan,           name='modal_plan'),
    path('equipos/importar/',                views.importar_plan,        name='importar_plan'),
    path('equipos/plantilla/',               views.descargar_plantilla,  name='descargar_plantilla'),
    path('equipos/<int:plan_pk>/registro/<int:semana>/<int:anio>/', views.registro_ejecucion, name='registro_ejecucion'),
    path('equipos/<int:plan_pk>/registro/<int:semana>/<int:anio>/eliminar/', views.eliminar_registro, name='eliminar_registro'),
    path('equipos/<int:plan_pk>/asignar/<int:semana>/<int:anio>/', views.asignar_responsable, name='asignar_responsable'),

    path('pasos/',                           views.lista_pasos,          name='lista_pasos'),
    path('pasos/importar/',                  views.importar_pasos,       name='importar_pasos'),
    path('pasos/eliminar/',                  views.eliminar_pasos_plan,  name='eliminar_pasos_plan'),
    
    path('exportar/semana/',                 views.exportar_semana_excel, name='exportar_semana_excel'),
   
    path('responsables/',                    views.lista_responsables,   name='lista_responsables'),
    path('responsables/nuevo/',              views.form_responsable,     name='nuevo_responsable'),
    path('responsables/editar/<int:pk>/',    views.form_responsable,     name='editar_responsable'),
    path('responsables/eliminar/<int:pk>/',  views.eliminar_responsable, name='eliminar_responsable'),

    path('dashboard/', views.dashboard, name='dashboard'),

]