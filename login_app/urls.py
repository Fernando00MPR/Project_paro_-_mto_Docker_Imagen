from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

urlpatterns = [
    path('login/',   auth_views.LoginView.as_view(template_name='login_app/login.html'), name='login'),
    path('logout/',  auth_views.LogoutView.as_view(next_page='login'),                   name='logout'),

    # Gestión de usuarios
    path('usuarios/',                        views.lista_usuarios,   name='lista_usuarios'),
    path('usuarios/nuevo/',                  views.crear_usuario,    name='crear_usuario'),
    path('usuarios/editar/<int:user_id>/',   views.editar_usuario,   name='editar_usuario'),
    path('usuarios/eliminar/<int:user_id>/', views.eliminar_usuario, name='eliminar_usuario'),
]
