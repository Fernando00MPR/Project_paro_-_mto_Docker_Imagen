import os
import io
import logging
from django.db import models
from django.core.validators import MinValueValidator
from django.utils.translation import gettext_lazy as _ 
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from PIL import UnidentifiedImageError

logger = logging.getLogger(__name__)

# Areas
class Area(models.Model):
    nombre = models.CharField(max_length=50, unique=True, verbose_name=_("Nombre del área"))

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = _("Área")
        verbose_name_plural = _("Áreas")

# Paros
class Paro(models.Model):
    TURNO_CHOICES = [
        (1, _('Turno 1')),
        (2, _('Turno 2')),
    ]
    ESTATUS_CHOICES = [
        ('rojo',     _('Rechazado')),
        ('amarillo', _('Pendiente')),
        ('verde',    _('Aceptado')),
    ]

    area           = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='paros', verbose_name="Área")
    fecha          = models.DateField(verbose_name="Fecha (dd/mm/yyyy)", db_index=True)
    turno          = models.IntegerField(choices=TURNO_CHOICES, verbose_name="Turno", db_index=True)
    falla          = models.CharField(max_length=100, verbose_name="Falla")
    responsable    = models.CharField(max_length=100, verbose_name="Responsable")
    equipo         = models.CharField(max_length=100, verbose_name="Equipo")
    hora           = models.TimeField(verbose_name="Hora (HH:MM)")
    tiempo_minutos = models.PositiveIntegerField(validators=[MinValueValidator(0)], verbose_name="Tiempo (minutos)")
    estatus        = models.CharField(max_length=10, choices=ESTATUS_CHOICES, default='rojo', verbose_name="Estatus", db_index=True)
    atendio        = models.CharField(max_length=100, blank=True, default='', verbose_name="Atendió la falla")
    comentarios    = models.CharField(max_length=100, blank=True, verbose_name="Comentarios")

    def __str__(self):
        return f"{self.falla} - {self.fecha}"

    class Meta:
        verbose_name = "Paro"
        verbose_name_plural = "Paros"
        ordering = ['-fecha', '-hora']
        indexes = [
            models.Index(fields=['area', 'fecha'], name='paro_area_fecha_idx'),
        ]

# Catalogos
class CatalogoFalla(models.Model):
    area        = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='catalogo_fallas', verbose_name=_("Área"))
    codigo      = models.CharField(max_length=30, verbose_name=_("Código"))
    nombre      = models.CharField(max_length=100, verbose_name=_("Nombre"))
    tipo_falla  = models.CharField(max_length=50, blank=True, verbose_name=_("Tipo de falla"))
    area_origen = models.CharField(max_length=100, blank=True, verbose_name=_("Área de origen"))

    def __str__(self):
        return f"[{self.codigo}] {self.nombre}"

    class Meta:
        verbose_name = _("Falla de catálogo")
        verbose_name_plural = _("Catálogo de fallas")
        ordering = ['area', 'codigo']
        unique_together = [('area', 'codigo')]

class CatalogoEquipo(models.Model):
    area   = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='catalogo_equipos', verbose_name=_("Área"))
    codigo = models.CharField(max_length=30, verbose_name=_("Código"))
    equipo = models.CharField(max_length=100, verbose_name=_("Equipo"))
    sub_area = models.CharField(max_length=50, blank=True, verbose_name=_("Sub área")) 
    
    def __str__(self):
        return f"[{self.codigo}] {self.equipo}"

    class Meta:
        verbose_name = _("Equipo de catálogo")
        verbose_name_plural = _("Catálogo de equipos")
        ordering = ['area', 'codigo']
        unique_together = [('area', 'codigo')]

class CatalogoResponsable(models.Model):
    area        = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='catalogo_responsables', verbose_name=_("Área"))
    codigo      = models.CharField(max_length=30, verbose_name=_("Código"))
    responsable = models.CharField(max_length=100, verbose_name=_("Responsable"))

    def __str__(self):
        return f"[{self.codigo}] {self.responsable}"

    class Meta:
        verbose_name = _("Responsable de catálogo")
        verbose_name_plural = _("Catálogo de responsables")
        ordering = ['area', 'codigo']
        unique_together = [('area', 'codigo')]

# Bitacora
class BitacoraParo(models.Model):
    CAMPOS_LABELS = {
        'area':           'Área',
        'fecha':          'Fecha',
        'turno':          'Turno',
        'hora':           'Hora',
        'falla':          'Falla',
        'responsable':    'Responsable',
        'equipo':         'Equipo',
        'tiempo_minutos': 'Tiempo (min)',
        'comentarios':    'Comentarios',
        'estatus':        'Estatus',
        'creado':         'Paro creado',
    }
    ESTATUS_LABELS = {
        'rojo':     'Rechazado',
        'amarillo': 'Pendiente',
        'verde':    'Aceptado',
    }
    
    paro           = models.ForeignKey(Paro, on_delete=models.CASCADE, related_name='bitacora', verbose_name='Paro')
    usuario        = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Usuario')
    fecha_hora     = models.DateTimeField(auto_now_add=True, verbose_name='Fecha y hora')
    campo          = models.CharField(max_length=50, verbose_name='Campo')
    valor_anterior = models.TextField(blank=True, default='', verbose_name='Valor anterior')
    valor_nuevo    = models.TextField(blank=True, default='', verbose_name='Valor nuevo')

    class Meta:
        ordering = ['-fecha_hora']
        verbose_name = 'Bitácora de paro'
        verbose_name_plural = 'Bitácora de paros'

    def campo_label(self):
        return self.CAMPOS_LABELS.get(self.campo, self.campo)

    def valor_anterior_display(self):
        if self.campo == 'estatus':
            return self.ESTATUS_LABELS.get(self.valor_anterior, self.valor_anterior)
        if self.campo == 'turno' and self.valor_anterior in ('1', '2'):
            return f'Turno {self.valor_anterior}'
        return self.valor_anterior

    def valor_nuevo_display(self):
        if self.campo == 'estatus':
            return self.ESTATUS_LABELS.get(self.valor_nuevo, self.valor_nuevo)
        if self.campo == 'turno' and self.valor_nuevo in ('1', '2'):
            return f'Turno {self.valor_nuevo}'
        return self.valor_nuevo

    def estatus_color(self):
        """Color del dot según el tipo de cambio."""
        if self.campo == 'creado':    return 'gray'
        if self.campo == 'estatus':
            colores = {'rojo':'red', 'amarillo':'amber', 'verde':'green'}
            return colores.get(self.valor_nuevo, 'indigo')
        return 'indigo'
    
class AccionDia(models.Model):
    INDICADOR_CHOICES = [
        ('dt',           'Downtime'),
        ('mttr',         'MTTR'),
        ('mtbf',         'MTBF'),
        ('dt-mttr',      'Downtime - MTTR'),
        ('dt-mtbf',      'Downtime - MTBF'),
        ('mttr-mtbf',    'MTTR - MTBF'),
        ('dt-mttr-mtbf', 'Downtime - MTTR - MTBF'),
    ]
    ESTATUS_CHOICES = [
        ('p', 'Pendiente'),
        ('e', 'En proceso'),
        ('c', 'Cerrada'),
    ]

    area              = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='acciones_dia')
    fecha             = models.DateField()
    indicador         = models.CharField(max_length=20, choices=INDICADOR_CHOICES, blank=True)
    problema             = models.CharField(max_length=200, blank=True)
    equipo            = models.CharField(max_length=200, blank=True, verbose_name='Equipo')  

    # Contención
    cont_accion       = models.CharField(max_length=100, blank=True)
    cont_fecha_inicio = models.DateField(null=True, blank=True)
    cont_fecha_fin    = models.DateField(null=True, blank=True)
    cont_estatus      = models.CharField(max_length=1, choices=ESTATUS_CHOICES, default='p')

    # Correctiva
    corr_accion       = models.CharField(max_length=100, blank=True)
    corr_fecha_inicio = models.DateField(null=True, blank=True)
    corr_fecha_fin    = models.DateField(null=True, blank=True)
    corr_estatus      = models.CharField(max_length=1, choices=ESTATUS_CHOICES, default='p')

    # Preventiva
    prev_accion       = models.CharField(max_length=100, blank=True)
    prev_fecha_inicio = models.DateField(null=True, blank=True)
    prev_fecha_fin    = models.DateField(null=True, blank=True)
    prev_estatus      = models.CharField(max_length=1, choices=ESTATUS_CHOICES, default='p')

    responsable       = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = [('area', 'equipo', 'fecha', 'indicador')]    
        verbose_name = 'Acción por día'
        verbose_name_plural = 'Acciones por día'
        ordering = ['-fecha']

    def __str__(self):
        return f"{self.area} — {self.fecha}"
    
class RegistroProduccion(models.Model):
    TURNO_CHOICES = [(1, 'Turno 1'), (2, 'Turno 2')]

    area        = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='registros_produccion', verbose_name='Área')
    equipo      = models.CharField(max_length=100, blank=True, verbose_name='Equipo')
    fecha       = models.DateField(verbose_name='Fecha', db_index=True)
    turno       = models.IntegerField(choices=TURNO_CHOICES, verbose_name='Turno')
    hora_inicio = models.TimeField(verbose_name='Hora inicio')
    hora_fin    = models.TimeField(verbose_name='Hora fin')
    orden = models.PositiveIntegerField(default=0, verbose_name='Orden')

    @property
    def tiempo_planeado(self):
        from datetime import datetime, date, time as _time
        hi = self.hora_inicio if isinstance(self.hora_inicio, _time) else _time.fromisoformat(str(self.hora_inicio))
        hf = self.hora_fin    if isinstance(self.hora_fin,    _time) else _time.fromisoformat(str(self.hora_fin))
        inicio = datetime.combine(date.today(), hi)
        fin    = datetime.combine(date.today(), hf)
        diff = fin - inicio
        if diff.total_seconds() < 0:
            from datetime import timedelta
            diff = diff + timedelta(days=1)
        return max(int(diff.total_seconds() / 60), 0)

    def __str__(self):
        return f"{self.area} — {self.equipo or 'Área completa'} — {self.fecha} T{self.turno}"

    class Meta:
        verbose_name = 'Registro de producción'
        verbose_name_plural = 'Registros de producción'
        ordering = ['-fecha', 'area', 'orden', 'turno', 'equipo']
        unique_together = [('area', 'equipo', 'fecha', 'turno')]

class TargetIndicador(models.Model):
    INDICADOR_CHOICES = [
        ('downtime',       'Downtime %'),
        ('disponibilidad', 'Disponibilidad %'),
        ('mttr',           'MTTR (min)'),
        ('mtbf',           'MTBF (h)'),
    ]

    area      = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='targets', verbose_name='Área')
    indicador = models.CharField(max_length=20, choices=INDICADOR_CHOICES, verbose_name='Indicador')
    valor     = models.FloatField(verbose_name='Valor objetivo')
    anio      = models.PositiveIntegerField(verbose_name='Año', default=2025) 
    mes  = models.PositiveIntegerField(verbose_name='Mes', default=1)  

    class Meta:
        unique_together = [('area', 'indicador', 'anio', 'mes')]
        verbose_name = 'Target de indicador'
        verbose_name_plural = 'Targets de indicadores'
        ordering = ['area', 'indicador']

    def __str__(self):
        return f"{self.area.nombre} — {self.get_indicador_display()}: {self.valor}"

# Hora x Hora 
class RegistroHoraHora(models.Model):
    TURNO_CHOICES = [
        ('dia',   'Día'),
        ('noche', 'Noche'),
    ]

    area   = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name='Área')
    fecha  = models.DateField(verbose_name='Fecha')
    turno  = models.CharField(max_length=10, choices=TURNO_CHOICES, verbose_name='Turno')
    hora   = models.PositiveSmallIntegerField(verbose_name='Hora (0-23)')
    valor  = models.PositiveSmallIntegerField(default=0, verbose_name='Cantidad producida')

    class Meta:
        verbose_name        = 'Registro hora x hora'
        verbose_name_plural = 'Registros hora x hora'
        unique_together     = ('area', 'fecha', 'turno', 'hora')
        ordering            = ['area', 'fecha', 'turno', 'hora']

    def __str__(self):
        return f"{self.area.nombre} — {self.fecha} — {self.turno} — {self.hora:02d}:00 — {self.valor}"

# Eficiencia   
class TargetHoraHora(models.Model):
    area              = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name='Área')
    anio              = models.PositiveSmallIntegerField(verbose_name='Año')
    mes               = models.PositiveSmallIntegerField(verbose_name='Mes')
    target_skid       = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Target skid por hora')
    target_eficiencia = models.FloatField(null=True, blank=True, verbose_name='Target eficiencia %')

    class Meta:
        verbose_name        = 'Target hora x hora'
        verbose_name_plural = 'Targets hora x hora'
        unique_together     = ('area', 'anio', 'mes')

    def __str__(self):
        return f"{self.area.nombre} — {self.mes}/{self.anio} — Skid:{self.target_skid} Ef:{self.target_eficiencia}%"
    
class TargetAnualHoraHora(models.Model):
    area              = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name='Área')
    anio              = models.PositiveSmallIntegerField(verbose_name='Año')
    target_eficiencia = models.FloatField(null=True, blank=True, verbose_name='Target eficiencia anual %')

    class Meta:
        verbose_name        = 'Target anual hora x hora'
        verbose_name_plural = 'Targets anuales hora x hora'
        unique_together     = ('area', 'anio')

    def __str__(self):
        return f"{self.area.nombre} — {self.anio} — {self.target_eficiencia}%"

def imagen_paro_upload_path(instance, filename):
    return f'paros/{instance.paro_id}/{filename}'

# Límites de compresión — compartidos por ImagenParo.save() y por un futuro
# comando de gestión retroactivo (si se llega a correr sobre imágenes ya existentes).
IMG_MAX_LADO      = 1600             # px, lado más largo permitido
IMG_CALIDAD_JPEG  = 82               # 80-85%
IMG_LIMITE_LIGERO = 500 * 1024       # 500 KB — bajo esto y bajo IMG_MAX_LADO, no se toca

def comprimir_imagen_pil(archivo):
    """
    Redimensiona (máx. IMG_MAX_LADO por lado, manteniendo proporción) y recomprime
    a JPEG ~IMG_CALIDAD_JPEG% un archivo de imagen. Corrige orientación EXIF.

    `archivo` debe ser un objeto file-like abierto en modo binario, posicionado
    en 0 (o se reposiciona internamente).

    Devuelve una tupla (bytes_jpeg, nuevo_nombre_con_extension_jpg) si se
    reprocesó, o (None, None) si la imagen ya era ligera y no hizo falta tocarla,
    O si el archivo no se pudo procesar (no es una imagen válida, está corrupto,
    tiene dimensiones absurdas, o cualquier otro error de Pillow) — en ese caso
    se guarda el archivo original tal cual, en vez de romper la vista que está
    creando el Paro.
    """
    tamano_original = archivo.size if hasattr(archivo, 'size') else None

    try:
        archivo.seek(0)
        img = Image.open(archivo)
        img.load()                          # fuerza la decodificación completa aquí,
                                             # no perezosa — así cualquier corrupción
                                             # se detecta ya, dentro del try.
        img = ImageOps.exif_transpose(img)  # corrige rotación de fotos de celular
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        logger.warning(
            "No se pudo procesar la imagen '%s' (%s) — se guarda sin comprimir.",
            getattr(archivo, 'name', '?'), e,
        )
        archivo.seek(0)
        return None, None

    ya_es_ligera = (
        tamano_original is not None
        and tamano_original < IMG_LIMITE_LIGERO
        and img.width  <= IMG_MAX_LADO
        and img.height <= IMG_MAX_LADO
    )
    if ya_es_ligera:
        archivo.seek(0)
        return None, None

    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')

    if img.width > IMG_MAX_LADO or img.height > IMG_MAX_LADO:
        img.thumbnail((IMG_MAX_LADO, IMG_MAX_LADO), Image.LANCZOS)

    try:
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=IMG_CALIDAD_JPEG, optimize=True)
        return buffer.getvalue(), None
    except OSError as e:
        logger.warning(
            "Fallo al re-codificar la imagen '%s' (%s) — se guarda sin comprimir.",
            getattr(archivo, 'name', '?'), e,
        )
        archivo.seek(0)
        return None, None


class ImagenParo(models.Model):
    paro        = models.ForeignKey('Paro', on_delete=models.CASCADE, related_name='imagenes', verbose_name='Paro')
    imagen      = models.ImageField(upload_to=imagen_paro_upload_path, verbose_name='Imagen')
    descripcion = models.CharField(max_length=100, blank=True, verbose_name='Descripción')
    subida_en   = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de subida')

    class Meta:
        verbose_name = 'Imagen de paro'
        verbose_name_plural = 'Imágenes de paro'
        ordering = ['subida_en']

    def __str__(self):
        return f'Imagen paro #{self.paro_id} — {self.subida_en:%d/%m/%Y}'

    def save(self, *args, **kwargs):
        # Solo reprocesar cuando hay un archivo NUEVO sin guardar todavía en el
        # storage (no en cada re-save de un registro existente con la misma imagen).
        if self.imagen and not self.imagen._committed:
            contenido_jpeg, _ = comprimir_imagen_pil(self.imagen)
            if contenido_jpeg is not None:
                nombre_base  = os.path.splitext(self.imagen.name)[0]
                nuevo_nombre = f'{nombre_base}.jpg'
                self.imagen.save(nuevo_nombre, ContentFile(contenido_jpeg), save=False)
        super().save(*args, **kwargs)

@receiver(post_delete, sender=ImagenParo)
def borrar_archivo_imagen(sender, instance, **kwargs):
    """Borra el archivo físico cuando se elimina el registro ImagenParo."""
    if instance.imagen:
        instance.imagen.delete(save=False)

@receiver(post_delete, sender=Paro)
def borrar_imagenes_paro(sender, instance, **kwargs):
    """Borra todas las imágenes físicas cuando se elimina un paro."""
    for imagen in instance.imagenes.all():
        if imagen.imagen:
            imagen.imagen.delete(save=False)