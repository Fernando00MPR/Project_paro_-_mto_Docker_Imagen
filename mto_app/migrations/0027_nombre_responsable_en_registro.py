from django.db import migrations, models


def copiar_nombres(apps, schema_editor):
    """Los registros existentes guardan el nombre que tienen hoy sus responsables (de aquí en adelante queda congelado)."""
    R = apps.get_model('mto_app', 'RegistroEjecucion')
    filtro = models.Q(responsable__isnull=False) | models.Q(validado_por__isnull=False)
    for reg in R.objects.filter(filtro).select_related('responsable', 'validado_por').iterator():
        def nombre(p):
            return ('%s %s' % (p.nombre, p.apellidos)) if p else ''
        R.objects.filter(pk=reg.pk).update(
            responsable_nombre=nombre(reg.responsable), validado_por_nombre=nombre(reg.validado_por))


class Migration(migrations.Migration):

    dependencies = [
        ('mto_app', '0026_responsable_eliminado'),
    ]

    operations = [
        migrations.AddField(
            model_name='registroejecucion',
            name='responsable_nombre',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Nombre del responsable al asignarlo'),
        ),
        migrations.AddField(
            model_name='registroejecucion',
            name='validado_por_nombre',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Nombre de quien validó al asignarlo'),
        ),
        migrations.RunPython(copiar_nombres, migrations.RunPython.noop),
    ]
