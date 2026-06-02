from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Area',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=50, unique=True, verbose_name='Nombre del área')),
            ],
            options={
                'verbose_name': 'Área',
                'verbose_name_plural': 'Áreas',
            },
        ),
        migrations.CreateModel(
            name='Paro',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateField(db_index=True, verbose_name='Fecha (dd/mm/yyyy)')),
                ('turno', models.IntegerField(choices=[(1, 'Turno 1'), (2, 'Turno 2')], db_index=True, verbose_name='Turno')),
                ('falla', models.CharField(max_length=100, verbose_name='Falla')),
                ('responsable', models.CharField(max_length=100, verbose_name='Responsable')),
                ('equipo', models.CharField(max_length=100, verbose_name='Equipo')),
                ('hora', models.TimeField(verbose_name='Hora (HH:MM)')),
                ('tiempo_minutos', models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(0)], verbose_name='Tiempo (minutos)')),
                ('estatus', models.CharField(choices=[('rojo', 'Sin revisar'), ('amarillo', 'Pendiente'), ('verde', 'Revisado')], default='rojo', max_length=10, verbose_name='Estatus')),
                ('comentarios', models.CharField(blank=True, max_length=100, verbose_name='Comentarios')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='paros', to='paros_app.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Paro',
                'verbose_name_plural': 'Paros',
                'ordering': ['-fecha', '-hora'],
            },
        ),
        migrations.CreateModel(
            name='CatalogoFalla',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.CharField(max_length=30, verbose_name='Código')),
                ('nombre', models.CharField(max_length=100, verbose_name='Nombre')),
                ('descripcion', models.CharField(blank=True, max_length=255, verbose_name='Descripción')),
                ('area_origen', models.CharField(blank=True, max_length=100, verbose_name='Área de origen')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='catalogo_fallas', to='paros_app.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Falla de catálogo',
                'verbose_name_plural': 'Catálogo de fallas',
                'ordering': ['area', 'codigo'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='catalogofalla',
            unique_together={('area', 'codigo')},
        ),
        migrations.CreateModel(
            name='CatalogoEquipo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.CharField(max_length=30, verbose_name='Código')),
                ('equipo', models.CharField(max_length=100, verbose_name='Equipo')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='catalogo_equipos', to='paros_app.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Equipo de catálogo',
                'verbose_name_plural': 'Catálogo de equipos',
                'ordering': ['area', 'codigo'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='catalogoequipo',
            unique_together={('area', 'codigo')},
        ),
        migrations.CreateModel(
            name='CatalogoResponsable',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.CharField(max_length=30, verbose_name='Código')),
                ('responsable', models.CharField(max_length=100, verbose_name='Responsable')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='catalogo_responsables', to='paros_app.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Responsable de catálogo',
                'verbose_name_plural': 'Catálogo de responsables',
                'ordering': ['area', 'codigo'],
            },
        ),
        migrations.AlterUniqueTogether(
            name='catalogoresponsable',
            unique_together={('area', 'codigo')},
        ),
    ]