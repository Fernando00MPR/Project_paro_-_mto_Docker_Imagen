from django.apps import AppConfig

class ParosAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'paros_app'

    def ready(self):
        import sys
        if 'migrate' in sys.argv or 'makemigrations' in sys.argv:
            return
        try:
            from .scheduler import iniciar_scheduler
            iniciar_scheduler()
        except Exception:
            pass