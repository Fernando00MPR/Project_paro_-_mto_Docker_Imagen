from django.contrib import admin
from django.urls import path, include, re_path
from django.shortcuts import redirect
from django.conf.urls.i18n import i18n_patterns
import django.conf.urls.i18n
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    path('i18n/', include('django.conf.urls.i18n')),
    path('', lambda request: redirect('login')),
    path('admin/', admin.site.urls),
    path('', include('login_app.urls')),
    path('', include(('paros_app.urls', 'paros'))),
    path('mto/', include(('mto_app.urls', 'mto'))),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]