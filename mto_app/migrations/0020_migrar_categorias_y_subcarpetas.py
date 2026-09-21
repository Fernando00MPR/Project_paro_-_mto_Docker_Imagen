from django.db import migrations


def migrar_a_carpetas(apps, schema_editor):
    CategoriaDocumento = apps.get_model('mto_app', 'CategoriaDocumento')
    SubcarpetaDocumento = apps.get_model('mto_app', 'SubcarpetaDocumento')
    Documento = apps.get_model('mto_app', 'Documento')
    Carpeta = apps.get_model('mto_app', 'Carpeta')

    mapeo_categoria = {}
    for categoria in CategoriaDocumento.objects.all():
        carpeta = Carpeta.objects.create(
            parent=None,
            codigo=categoria.codigo,
            nombre=categoria.nombre,
            creado_por=categoria.creado_por,
            creado_en=categoria.creado_en,
        )
        mapeo_categoria[categoria.pk] = carpeta.pk

    mapeo_subcarpeta = {}
    for subcarpeta in SubcarpetaDocumento.objects.all():
        carpeta_padre_id = mapeo_categoria[subcarpeta.categoria_id]
        carpeta = Carpeta.objects.create(
            parent_id=carpeta_padre_id,
            codigo=subcarpeta.codigo,
            nombre=subcarpeta.nombre,
            creado_por=subcarpeta.creado_por,
            creado_en=subcarpeta.creado_en,
        )
        mapeo_subcarpeta[subcarpeta.pk] = carpeta.pk

    for documento in Documento.objects.all():
        if documento.subcarpeta_id:
            documento.carpeta_id = mapeo_subcarpeta[documento.subcarpeta_id]
        else:
            documento.carpeta_id = mapeo_categoria[documento.categoria_id]
        documento.save(update_fields=['carpeta'])


def revertir_migracion(apps, schema_editor):
    Carpeta = apps.get_model('mto_app', 'Carpeta')
    Documento = apps.get_model('mto_app', 'Documento')
    Documento.objects.update(carpeta=None)
    Carpeta.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('mto_app', '0019_carpeta_documento_carpeta'),
    ]

    operations = [
        migrations.RunPython(migrar_a_carpetas, revertir_migracion),
    ]
