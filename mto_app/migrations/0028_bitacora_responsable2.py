from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mto_app', '0027_nombre_responsable_en_registro'),
    ]

    operations = [
        migrations.AddField(
            model_name='bitacora',
            name='responsable2',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Segundo responsable'),
        ),
    ]
