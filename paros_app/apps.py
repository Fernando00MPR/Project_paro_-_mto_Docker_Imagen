from django.apps import AppConfig

class ParosAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'paros_app'

    def ready(self):
        from .scheduler import iniciar_scheduler
        iniciar_scheduler()