from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('paros_app', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PerfilUsuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('es_admin', models.BooleanField(default=False, verbose_name='Es administrador')),
                ('ver_dashboard', models.BooleanField(default=False, verbose_name='Ver dashboard')),
                ('ver_analisis', models.BooleanField(default=False, verbose_name='Ver análisis de paros')),
                ('ver_todos_paros', models.BooleanField(default=False, verbose_name='Ver todos los paros')),
                ('crear_paro', models.BooleanField(default=False, verbose_name='Crear paro')),
                ('editar_comentarios', models.BooleanField(default=False, verbose_name='Editar solo comentarios')),
                ('editar_paro', models.BooleanField(default=False, verbose_name='Editar paro')),
                ('editar_eliminar_paro', models.BooleanField(default=False, verbose_name='Editar y eliminar paro')),
                ('cambiar_estatus_paro', models.BooleanField(default=False, verbose_name='Cambiar estatus')),
                ('exportar_paros', models.BooleanField(default=False, verbose_name='Exportar paros')),
                ('importar_paros', models.BooleanField(default=False, verbose_name='Importar paros')),
                ('ver_catalogos', models.BooleanField(default=False, verbose_name='Ver catálogos')),
                ('gestionar_catalogos', models.BooleanField(default=False, verbose_name='Importar y limpiar catálogos')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='perfil', to='auth.user')),
                ('areas_permitidas', models.ManyToManyField(blank=True, to='paros_app.area', verbose_name='Áreas que puede ver')),
            ],
            options={
                'verbose_name': 'Perfil de usuario',
                'verbose_name_plural': 'Perfiles de usuario',
            },
        ),
    ]