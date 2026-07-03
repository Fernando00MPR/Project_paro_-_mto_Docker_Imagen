from django.apps import AppConfig


class ParosAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'paros_app'

    def ready(self):
        import sys

        comandos_skip = ['migrate', 'makemigrations', 'collectstatic', 'compilemessages', 'crear_superusuario']
        if any(cmd in sys.argv for cmd in comandos_skip):
            return

        import os
        import threading

        LOCK = '/tmp/paros_scheduler.lock'

        def _start():
            try:
                fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
            except FileExistsError:
                return
            try:
                from .scheduler import iniciar_scheduler
                iniciar_scheduler()
            except Exception:
                os.remove(LOCK)

        threading.Timer(5.0, _start).start()