from django.db import models
from mto_app.models import Area
from django.utils.translation import gettext_lazy as _ 
from django.db.models.signals import post_delete
from django.dispatch import receiver


class CategoriaRefaccion(models.Model):
    nombre = models.CharField(max_length=100, unique=True, verbose_name=_("Categoría"))

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = _("Categoría de refacción")
        verbose_name_plural = _("Categorías de refacciones")
        ordering = ['nombre']


class Refaccion(models.Model):
    UNIDAD_CHOICES = [
        ('pza',    _('Pieza')),
        ('kg',     _('Kilogramo')),
        ('lt',     _('Litro')),
        ('mt',     _('Metro')),
        ('caja',   _('Caja')),
        ('par',    _('Par')),
        ('docena', _('Docena')),
    ]

    no_item         = models.CharField(max_length=10, verbose_name=_("No. Item"))
    nombre          = models.CharField(max_length=200, verbose_name=_("Nombre"))
    descripcion     = models.TextField(blank=True, verbose_name=_("Descripción"))
    categoria       = models.ForeignKey(CategoriaRefaccion, on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_("Categoría"))
    area            = models.ForeignKey(Area, on_delete=models.PROTECT, verbose_name=_("Área"))
    unidad          = models.CharField(max_length=10, choices=UNIDAD_CHOICES, default='pza', verbose_name=_("Unidad"))
    stock_actual    = models.PositiveIntegerField(default=0, verbose_name=_("Stock actual"))
    stock_minimo    = models.PositiveIntegerField(default=0, verbose_name=_("Stock mínimo"))
    ubicacion       = models.CharField(max_length=4, blank=True, verbose_name=_("Ubicación en almacén"))
    proveedor       = models.CharField(max_length=50, blank=True, verbose_name=_("Proveedor"))
    costo_unitario  = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name=_("Costo unitario"))
    activo          = models.BooleanField(default=True, verbose_name=_("Activo"))
    creado_en       = models.DateTimeField(auto_now_add=True, verbose_name=_("Creado en"))
    modificado_en   = models.DateTimeField(auto_now=True, verbose_name=_("Modificado en"))

    @property
    def bajo_minimo(self):
        return self.stock_actual <= self.stock_minimo

    def __str__(self):
        return f"{self.no_item} — {self.nombre}"

    class Meta:
        verbose_name = _("Refacción")
        verbose_name_plural = _("Refacciones")
        ordering = ['area', 'no_item']
        unique_together = [['area', 'no_item']]

def imagen_refaccion_upload_path(instance, filename):
    return f'inventario/{instance.refaccion_id}/{filename}'


class ImagenRefaccion(models.Model):
    refaccion = models.ForeignKey(Refaccion, on_delete=models.CASCADE, related_name='imagenes', verbose_name=_("Refacción"))
    imagen    = models.ImageField(upload_to=imagen_refaccion_upload_path, verbose_name=_("Imagen"))
    subida_en = models.DateTimeField(auto_now_add=True, verbose_name=_("Fecha de subida"))

    class Meta:
        verbose_name = _("Imagen de refacción")
        verbose_name_plural = _("Imágenes de refacción")
        ordering = ['subida_en']

    def __str__(self):
        return f"Imagen — {self.refaccion.no_item}"

@receiver(post_delete, sender=ImagenRefaccion)
def borrar_archivo_imagen_refaccion(sender, instance, **kwargs):
    if instance.imagen:
        instance.imagen.delete(save=False)


class SeguimientoRefaccion(models.Model):
    refaccion       = models.ForeignKey(Refaccion, on_delete=models.PROTECT, related_name='seguimientos', verbose_name=_("Refacción"))
    cantidad        = models.PositiveIntegerField(verbose_name=_("Cantidad pedida"))

    numero_pr       = models.CharField(max_length=50, verbose_name=_("No. PR"))
    fecha_pr        = models.DateField(null=True, blank=True, verbose_name=_("Fecha PR"))

    numero_po       = models.CharField(max_length=50, blank=True, verbose_name=_("No. PO"))
    fecha_po        = models.DateField(null=True, blank=True, verbose_name=_("Fecha PO"))

    numero_sr       = models.CharField(max_length=50, blank=True, verbose_name=_("No. SR"))
    fecha_sr        = models.DateField(null=True, blank=True, verbose_name=_("Fecha SR"))

    comentarios     = models.TextField(blank=True, verbose_name=_("Comentarios"))

    creado_en       = models.DateTimeField(auto_now_add=True, verbose_name=_("Creado en"))
    modificado_en   = models.DateTimeField(auto_now=True, verbose_name=_("Modificado en"))

    @property
    def estatus(self):
        if self.numero_sr:
            return 'verde'
        elif self.numero_po:
            return 'amarillo'
        return 'rojo'

    @property
    def area(self):
        return self.refaccion.area

    def __str__(self):
        return f"PR {self.numero_pr} — {self.refaccion.no_item}"

    class Meta:
        verbose_name = _("Seguimiento de refacción")
        verbose_name_plural = _("Seguimientos de refacciones")
        ordering = ['-creado_en']


class TipoServicio(models.Model):
    nombre = models.CharField(max_length=60, unique=True, verbose_name=_("Tipo de servicio"))

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = _("Tipo de servicio")
        verbose_name_plural = _("Tipos de servicio")
        ordering = ['nombre']


class SeguimientoServicio(models.Model):
    area             = models.ForeignKey(Area, on_delete=models.PROTECT, verbose_name=_("Área"))
    no_item          = models.CharField(max_length=10, verbose_name=_("No. Item"))
    nombre           = models.CharField(max_length=100, verbose_name=_("Nombre"))
    cantidad         = models.PositiveIntegerField(verbose_name=_("Cantidad"))
    motivo_servicio  = models.CharField(max_length=200, verbose_name=_("Motivo del servicio"))
    tipo_servicio    = models.ForeignKey(TipoServicio, on_delete=models.PROTECT, verbose_name=_("Tipo de servicio"))

    numero_pr        = models.CharField(max_length=50, verbose_name=_("No. PR"))
    fecha_pr         = models.DateField(null=True, blank=True, verbose_name=_("Fecha PR"))

    numero_po        = models.CharField(max_length=50, blank=True, verbose_name=_("No. PO"))
    fecha_po         = models.DateField(null=True, blank=True, verbose_name=_("Fecha PO"))

    numero_sr        = models.CharField(max_length=50, blank=True, verbose_name=_("No. SR"))
    fecha_sr         = models.DateField(null=True, blank=True, verbose_name=_("Fecha SR"))

    comentarios      = models.TextField(blank=True, verbose_name=_("Comentarios"))

    creado_en        = models.DateTimeField(auto_now_add=True, verbose_name=_("Creado en"))
    modificado_en    = models.DateTimeField(auto_now=True, verbose_name=_("Modificado en"))

    @property
    def estatus(self):
        if self.numero_sr:
            return 'verde'
        elif self.numero_po:
            return 'amarillo'
        return 'rojo'

    def __str__(self):
        return f"PR {self.numero_pr} — {self.motivo_servicio[:30]}"

    class Meta:
        verbose_name = _("Seguimiento de servicio")
        verbose_name_plural = _("Seguimientos de servicios")
        ordering = ['-creado_en']