from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('paros_app', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BitacoraParo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha_hora', models.DateTimeField(auto_now_add=True, verbose_name='Fecha y hora')),
                ('campo', models.CharField(max_length=50, verbose_name='Campo')),
                ('valor_anterior', models.TextField(blank=True, default='', verbose_name='Valor anterior')),
                ('valor_nuevo', models.TextField(blank=True, default='', verbose_name='Valor nuevo')),
                ('paro', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='bitacora', to='paros_app.paro', verbose_name='Paro')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL, verbose_name='Usuario')),
            ],
            options={
                'verbose_name': 'Bitácora de paro',
                'verbose_name_plural': 'Bitácora de paros',
                'ordering': ['-fecha_hora'],
            },
        ),
    ]