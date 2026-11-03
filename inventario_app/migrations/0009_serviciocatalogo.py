# Catálogo de servicios: modelo, liga desde el seguimiento y carga inicial con
# los servicios que ya existen en los seguimientos.

import django.db.models.deletion
from django.db import migrations, models


def crear_catalogo(apps, schema_editor):
    """Un servicio por No. item (nombre y tipo del seguimiento más reciente)
    y cada seguimiento queda ligado al suyo."""
    Seguimiento = apps.get_model('inventario_app', 'SeguimientoServicio')
    Servicio = apps.get_model('inventario_app', 'ServicioCatalogo')
    catalogo = {}
    for s in Seguimiento.objects.order_by('-creado_en'):
        no_item = s.no_item.strip()
        if not no_item:
            continue
        if no_item not in catalogo:
            catalogo[no_item] = Servicio.objects.create(
                no_item=no_item, nombre=s.nombre.strip(), tipo_servicio_id=s.tipo_servicio_id)
        s.servicio = catalogo[no_item]
        s.save(update_fields=['servicio'])


class Migration(migrations.Migration):

    dependencies = [
        ('inventario_app', '0008_categoriarefaccion_nombre_en_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ServicioCatalogo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('no_item', models.CharField(max_length=10, unique=True, verbose_name='No. Item')),
                ('nombre', models.CharField(max_length=100, verbose_name='Nombre')),
                ('creado_en', models.DateTimeField(auto_now_add=True, verbose_name='Creado en')),
                ('tipo_servicio', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='servicios', to='inventario_app.tiposervicio', verbose_name='Tipo de servicio')),
            ],
            options={
                'verbose_name': 'Servicio del catálogo',
                'verbose_name_plural': 'Catálogo de servicios',
                'ordering': ['nombre'],
            },
        ),
        migrations.AddField(
            model_name='seguimientoservicio',
            name='servicio',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='seguimientos', to='inventario_app.serviciocatalogo', verbose_name='Servicio'),
        ),
        migrations.RunPython(crear_catalogo, migrations.RunPython.noop),
    ]
