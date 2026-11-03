# Rutinas v2: datos del encabezado del Excel (Rutina) y puntos críticos por paso.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mto_app', '0028_bitacora_responsable2'),
    ]

    operations = [
        migrations.AddField(
            model_name='pasorutina',
            name='puntos_criticos',
            field=models.JSONField(blank=True, default=list, verbose_name='Puntos críticos'),
        ),
        migrations.CreateModel(
            name='Rutina',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan_trabajo', models.CharField(db_index=True, max_length=100, verbose_name='N° Plan de trabajo')),
                ('prioridad', models.CharField(blank=True, max_length=30, verbose_name='Prioridad')),
                ('area_documento', models.CharField(blank=True, max_length=150, verbose_name='Área del documento')),
                ('locacion', models.CharField(blank=True, max_length=200, verbose_name='Locación')),
                ('creador', models.CharField(blank=True, max_length=150, verbose_name='Creador')),
                ('codigo_documento', models.CharField(blank=True, max_length=50, verbose_name='Código del documento')),
                ('archivo_origen', models.CharField(blank=True, max_length=255, verbose_name='Archivo de origen')),
                ('filas_omitidas', models.PositiveIntegerField(default=0, verbose_name='Filas omitidas')),
                ('rango_omitidas', models.CharField(blank=True, max_length=30, verbose_name='Rango de filas omitidas')),
                ('leyenda_puntos', models.JSONField(blank=True, default=dict, verbose_name='Leyenda de puntos críticos')),
                ('area', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='mto_app.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Rutina',
                'verbose_name_plural': 'Rutinas',
                'unique_together': {('area', 'plan_trabajo')},
            },
        ),
    ]
