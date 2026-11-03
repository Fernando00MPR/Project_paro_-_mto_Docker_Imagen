# El No. item del catálogo de servicios se puede repetir (se distinguen por nombre y tipo).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventario_app', '0009_serviciocatalogo'),
    ]

    operations = [
        migrations.AlterField(
            model_name='serviciocatalogo',
            name='no_item',
            field=models.CharField(max_length=10, verbose_name='No. Item'),
        ),
    ]
