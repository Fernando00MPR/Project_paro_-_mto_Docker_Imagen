import os
import subprocess
import shutil
from datetime import datetime
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Genera un respaldo semanal de la base de datos'

    def handle(self, *args, **kwargs):
        carpeta = os.path.join(settings.BASE_DIR, 'respaldos')
        os.makedirs(carpeta, exist_ok=True)

        ahora   = datetime.now().strftime('%Y_%m_%d_%H%M')
        archivo = os.path.join(carpeta, f'respaldo_{ahora}.dump')

        db  = settings.DATABASES['default']
        env = os.environ.copy()
        env['PGPASSWORD'] = db['PASSWORD']

        pg_dump_path = os.environ.get('PGDUMP_PATH', 'pg_dump')

        cmd = [
            pg_dump_path,
            '-h', db['HOST'],
            '-p', str(db.get('PORT', 5432)),
            '-U', db['USER'],
            '-d', db['NAME'],
            '-F', 'c',
            '-f', archivo,
        ]

        try:
            subprocess.run(cmd, env=env, check=True)
            self.stdout.write(f'✅ Respaldo creado: {archivo}')
        except subprocess.CalledProcessError as e:
            self.stdout.write(f'❌ Error al crear respaldo: {e}')
            return
        except FileNotFoundError:
            self.stdout.write('❌ pg_dump no encontrado. Verifica la variable PGDUMP_PATH.')
            return

        # Conservar solo el más reciente
        dumps = sorted([f for f in os.listdir(carpeta) if f.endswith('.dump')])
        for f in dumps[:-2]:
            os.remove(os.path.join(carpeta, f))
            self.stdout.write(f'🗑 Eliminado: {f}')

        # Al final del handle(), después de eliminar dumps antiguos
        
        carpeta_media = os.path.join(settings.BASE_DIR, 'media')
        carpeta_media_backup = os.path.join(carpeta, 'media_backup')

        if os.path.exists(carpeta_media):
            if os.path.exists(carpeta_media_backup):
                shutil.rmtree(carpeta_media_backup)
            shutil.copytree(carpeta_media, carpeta_media_backup)
            self.stdout.write('✅ Respaldo de media creado')