"""
Respaldo de la base de datos con pg_dump.

Uso:
    python manage.py respaldar_bd             # respaldo + borra los de más de 14 días
    python manage.py respaldar_bd --dias 30   # otra retención (0 = no borrar nada)

Genera respaldos/respaldo_AAAA_MM_DD_HHMM.dump en formato custom de PostgreSQL
(ya comprimido; se restaura con pg_restore). Se dispara desde una tarea
programada de Coolify, no desde el proceso web: con varios workers de gunicorn
un scheduler interno correría el respaldo una vez por worker.
"""
import os
import subprocess

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

DIR_RESPALDOS  = settings.BASE_DIR / 'respaldos'
TIEMPO_MAX_SEG = 30 * 60


class Command(BaseCommand):
    help = 'Respalda la base de datos con pg_dump y borra los respaldos viejos.'

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=14,
                            help='Borra los respaldos con más de N días (0 = no borrar). Default: 14.')

    def handle(self, *args, dias, **kwargs):
        if dias < 0:
            raise CommandError('--dias no puede ser negativo.')
        DIR_RESPALDOS.mkdir(exist_ok=True)

        destino = self._respaldar()
        mb = destino.stat().st_size / 1_048_576
        self.stdout.write(self.style.SUCCESS(f'Respaldo creado: {destino.name} ({mb:.1f} MB)'))

        # Solo se borra después de un respaldo exitoso: si pg_dump falla varios
        # días seguidos, los respaldos viejos se conservan.
        if dias:
            borrados = self._borrar_viejos(dias)
            self.stdout.write(f'Respaldos con más de {dias} días borrados: {borrados}')

    def _respaldar(self):
        db      = settings.DATABASES['default']
        destino = DIR_RESPALDOS / timezone.localtime().strftime('respaldo_%Y_%m_%d_%H%M.dump')
        # Se escribe con otro nombre y se renombra al terminar, para que nunca
        # se liste ni se descargue un respaldo a medias.
        parcial = destino.with_suffix('.parcial')
        cmd = [
            os.environ.get('PGDUMP_PATH', 'pg_dump'),
            '--format=custom', '--no-owner', '--no-privileges',
            '--host', str(db['HOST']), '--port', str(db['PORT']),
            '--username', db['USER'], '--file', str(parcial), db['NAME'],
        ]
        # La contraseña va por variable de entorno, no en la línea de comandos.
        entorno = {**os.environ, 'PGPASSWORD': db['PASSWORD']}
        try:
            subprocess.run(cmd, env=entorno, check=True, capture_output=True,
                           text=True, timeout=TIEMPO_MAX_SEG)
        except FileNotFoundError:
            error = f'No se encontró pg_dump en "{cmd[0]}". Revisa PGDUMP_PATH.'
        except subprocess.TimeoutExpired:
            error = f'pg_dump tardó más de {TIEMPO_MAX_SEG // 60} minutos y se canceló.'
        except subprocess.CalledProcessError as e:
            error = f'pg_dump falló (código {e.returncode}): {e.stderr.strip()}'
        else:
            parcial.replace(destino)
            return destino
        parcial.unlink(missing_ok=True)
        raise CommandError(error)

    def _borrar_viejos(self, dias):
        limite   = timezone.now().timestamp() - dias * 86400
        borrados = 0
        for patron in ('respaldo_*.dump', 'respaldo_*.parcial'):
            for archivo in DIR_RESPALDOS.glob(patron):
                if archivo.stat().st_mtime < limite:
                    archivo.unlink()
                    borrados += 1
        return borrados
