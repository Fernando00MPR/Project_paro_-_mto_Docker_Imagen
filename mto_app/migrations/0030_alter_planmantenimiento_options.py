# Plan de mantenimiento ordenado por área, actividad y código (solo cambia el orden por defecto; no toca la BD).

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('mto_app', '0029_rutina_pasorutina_puntos_criticos'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='planmantenimiento',
            options={'ordering': ['area', 'locacion', 'actividad', 'codigo'], 'verbose_name': 'Plan de mantenimiento',
                     'verbose_name_plural': 'Planes de mantenimiento'},
        ),
    ]
