from django.apps import AppConfig


class ParosAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'paros_app'

    def ready(self):
        import sys
        import os
        comandos_skip = ['migrate', 'makemigrations', 'collectstatic', 'compilemessages', 'crear_superusuario']
        if any(cmd in sys.argv for cmd in comandos_skip):
            return
        if os.environ.get('RUN_MAIN') != 'true':
            return
        import threading
        def _start():
            try:
                from .scheduler import iniciar_scheduler
                iniciar_scheduler()
            except Exception:
                pass
        threading.Timer(1.0, _start).start()