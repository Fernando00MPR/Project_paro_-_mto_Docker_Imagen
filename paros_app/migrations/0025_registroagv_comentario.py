from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('paros_app', '0024_alter_acciondia_cont_accion_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='registroagv',
            name='comentario',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Comentario'),
        ),
    ]
