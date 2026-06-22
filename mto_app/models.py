from django.db import models
from django.utils.translation import gettext_lazy as _ 
from django.contrib.auth.models import User
from django.db.models.signals import post_delete
from django.dispatch import receiver


class Area(models.Model):
    nombre = models.CharField(max_length=100, unique=True, verbose_name=_("Area"))
    activa = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = _("Area")
        verbose_name_plural = _("Areas")
        ordering = ['nombre']

class PlanMantenimiento(models.Model):

    FRECUENCIA_CHOICES = [
        ('semanal',    _('Semanal')),
        ('quincenal',  _('Quincenal')),
        ('mensual',    _('Mensual')),
        ('trimestral', _('Trimestral')),
        ('semestral',  _('Semestral')),
        ('anual',      _('Anual')),
    ]

    STATUS_CHOICES = [
        ('Abierta',   _('Abierta')),
        ('Cerrada',   _('Cerrada')),
        ('Cancelada', _('Cancelada')),
    ]

    PRIORIDAD_CHOICES = [
        ('Baja',  _('Baja')),
        ('Media', _('Media')),
        ('Alta',  _('Alta')),
    ]

    TIPO_MTO_CHOICES = [
        ('Preventivo', _('Preventivo')),
        ('Correctivo', _('Correctivo')),
        ('Predictivo', _('Predictivo')),
    ]

    area             = models.ForeignKey(Area, on_delete=models.PROTECT, verbose_name=_("Area"))
    codigo           = models.CharField(max_length=50, verbose_name=_("Codigo"))
    actividad        = models.CharField(max_length=255, null=True, blank=True)
    rutina           = models.CharField(max_length=200, verbose_name=_("Rutina"))
    plan_trabajo     = models.CharField(max_length=100, verbose_name=_("Plan de trabajo"))
    frecuencia       = models.CharField(max_length=20, choices=FRECUENCIA_CHOICES, verbose_name=_("Frecuencia"))
    duracion_minutos = models.PositiveIntegerField(default=60, verbose_name=_("Duracion en minutos"))
    semana_inicio    = models.PositiveIntegerField(null=True, blank=True, verbose_name=_("Semana de inicio"))
    anio_inicio      = models.PositiveIntegerField(null=True, blank=True, verbose_name=_("Anio de inicio"))

    # Campos nuevos
    nombre_equipo    = models.CharField(max_length=200, blank=True, verbose_name=_("Equipo"))
    locacion         = models.CharField(max_length=200, blank=True, verbose_name=_("Locacion"))
    tipo_mto         = models.CharField(max_length=20, choices=TIPO_MTO_CHOICES,
                                        default='Preventivo', verbose_name=_("Tipo de mantenimiento"))
    prioridad        = models.CharField(max_length=10, choices=PRIORIDAD_CHOICES,
                                        default='Baja', verbose_name=_("Prioridad"))
    estatus          = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                        default='Abierta', verbose_name=_("Estatus"))

    activo           = models.BooleanField(default=True, verbose_name=_("Activo"))
    creado_en        = models.DateTimeField(auto_now_add=True)
    modificado       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.codigo} - {self.nombre_equipo} ({self.get_frecuencia_display()})"

    class Meta:
        verbose_name = _("Plan de mantenimiento")
        verbose_name_plural = _("Planes de mantenimiento")
        ordering = ['area', 'codigo']

class RegistroEjecucion(models.Model):

    ESTADO_CHOICES = [
        ('completada',  _('Completada')),
        ('pendiente',   _('Pendiente')),
        ('reagendada',  _('Reagendada')),
        ('cancelada',   _('Cancelada')),
    ]

    plan            = models.ForeignKey(PlanMantenimiento, on_delete=models.CASCADE, related_name='registros', verbose_name=_("Plan"))
    semana_num      = models.PositiveIntegerField(verbose_name=_("Numero de semana"))
    anio            = models.PositiveIntegerField(verbose_name=_("Anio"))
    semana_inicio   = models.DateField(verbose_name=_("Lunes de la semana"))
    estado          = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='pendiente', verbose_name=_("Estado"))
    responsable     = models.ForeignKey(
                        'Responsable',
                        on_delete=models.SET_NULL,
                        null=True, blank=True, verbose_name=_("Responsable"))
    fecha_ejecucion = models.DateField(null=True, blank=True, verbose_name=_("Fecha de ejecucion"))
    observaciones   = models.TextField(blank=True, verbose_name=_("Observaciones"))
    creado_en       = models.DateTimeField(auto_now_add=True)
    modificado      = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.plan.codigo} S{self.semana_num}/{self.anio} — {self.get_estado_display()}"

    class Meta:
        verbose_name = _("Registro de ejecucion")
        verbose_name_plural = _("Registros de ejecucion")
        ordering = ['-anio', '-semana_num']
        unique_together = [['plan', 'semana_inicio']]

class PasoRutina(models.Model):
    area         = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name=_("Area"), null=True, blank=True)
    plan_trabajo = models.CharField(max_length=100, verbose_name=_("N° Plan de trabajo"), db_index=True)
    nombre_plan  = models.CharField(max_length=255, blank=True, verbose_name=_("Nombre del plan"))
    codigo_plan  = models.CharField(max_length=50, blank=True, verbose_name=_("Codigo del plan"))  
    secuencia    = models.PositiveIntegerField(verbose_name=_("Seq #"))
    descripcion  = models.CharField(max_length=200, verbose_name=_("Descripcion"))
    detalles     = models.TextField(blank=True, verbose_name=_("Detalles"))

    def __str__(self):
        return f"PT-{self.plan_trabajo} Paso {self.secuencia}: {self.descripcion}"

    class Meta:
        verbose_name = _("Paso de rutina")
        verbose_name_plural = _("Pasos de rutina")
        ordering = ['plan_trabajo', 'secuencia']
        unique_together = [['area', 'plan_trabajo', 'secuencia']]

class Responsable(models.Model):
    area          = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name=_("Area"))
    numero_nomina = models.CharField(max_length=20, verbose_name=_("Numero de nomina"))
    nombre        = models.CharField(max_length=100, verbose_name=_("Nombre"))
    apellidos     = models.CharField(max_length=100, verbose_name=_("Apellidos"))
    posicion      = models.CharField(max_length=100, blank=True, verbose_name=_("Posicion"))
    activo        = models.BooleanField(default=True, verbose_name=_("Activo"))
    creado_en     = models.DateTimeField(auto_now_add=True, verbose_name=_("Fecha de registro"))
    modificado_en = models.DateTimeField(auto_now=True, verbose_name=_("Ultima edicion"))

    def nombre_completo(self):
        return f"{self.nombre} {self.apellidos}"

    def __str__(self):
        return f"{self.numero_nomina} - {self.nombre} {self.apellidos}"

    class Meta:
        verbose_name        = _("Responsable")
        verbose_name_plural = _("Responsables")
        ordering            = ['area', 'apellidos', 'nombre']
        unique_together     = [['area', 'numero_nomina']]


class AccesoMto(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name='acceso_mto')
    activo  = models.BooleanField(default=True, verbose_name=_("Acceso a Gestión de Mantenimiento"))
    areas   = models.ManyToManyField(Area, blank=True, verbose_name=_("Áreas permitidas"))

    # ── General ──
    ver_dashboard = models.BooleanField(default=False, verbose_name=_("Ver dashboard"))
    ver_backlog   = models.BooleanField(default=False, verbose_name=_("Ver backlog"))

    # ── Plan de mantenimiento ──
    ver_plan_mantenimiento      = models.BooleanField(default=False, verbose_name=_("Ver plan de mantenimiento"))
    editar_plan_mantenimiento   = models.BooleanField(default=False, verbose_name=_("Editar plan de mantenimiento"))
    eliminar_plan_mantenimiento = models.BooleanField(default=False, verbose_name=_("Eliminar plan de mantenimiento"))

    # ── Rutinas ──
    ver_rutinas      = models.BooleanField(default=False, verbose_name=_("Ver rutinas"))
    editar_rutinas   = models.BooleanField(default=False, verbose_name=_("Editar rutinas"))
    eliminar_rutinas = models.BooleanField(default=False, verbose_name=_("Eliminar rutinas"))

    # ── Seguimiento ──
    ver_seguimiento      = models.BooleanField(default=False, verbose_name=_("Ver seguimiento"))
    editar_seguimiento   = models.BooleanField(default=False, verbose_name=_("Editar seguimiento"))
    eliminar_seguimiento = models.BooleanField(default=False, verbose_name=_("Eliminar seguimiento"))

    # ── Responsables ──
    ver_responsables      = models.BooleanField(default=False, verbose_name=_("Ver responsables"))
    editar_responsables   = models.BooleanField(default=False, verbose_name=_("Editar responsables"))
    eliminar_responsables = models.BooleanField(default=False, verbose_name=_("Eliminar responsables"))

    # ── Inventario ──
    ver_inventario      = models.BooleanField(default=False, verbose_name=_("Ver inventario"))
    editar_inventario   = models.BooleanField(default=False, verbose_name=_("Editar inventario"))
    eliminar_inventario = models.BooleanField(default=False, verbose_name=_("Eliminar inventario"))

    # ── Seguimiento de refacciones ──
    ver_seguimiento_refaccion      = models.BooleanField(default=False, verbose_name=_("Ver seguimiento de refacciones"))
    editar_seguimiento_refaccion   = models.BooleanField(default=False, verbose_name=_("Editar seguimiento de refacciones"))
    eliminar_seguimiento_refaccion = models.BooleanField(default=False, verbose_name=_("Eliminar seguimiento de refacciones"))

    # ── Seguimiento de servicios ──
    ver_seguimiento_servicio      = models.BooleanField(default=False, verbose_name=_("Ver seguimiento de servicios"))
    editar_seguimiento_servicio   = models.BooleanField(default=False, verbose_name=_("Editar seguimiento de servicios"))
    eliminar_seguimiento_servicio = models.BooleanField(default=False, verbose_name=_("Eliminar seguimiento de servicios"))

    def __str__(self):
        return f"{self.usuario.username} — MTO"

    class Meta:
        verbose_name = _("Acceso MTO")


class HistorialRutina(models.Model):
    ACCION_CHOICES = [
        ('importar',  _('Importar')),
        ('eliminar',  _('Eliminar')),
    ]

    usuario         = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name=_("Usuario"))
    accion          = models.CharField(max_length=20, choices=ACCION_CHOICES, verbose_name=_("Acción"))
    area            = models.ForeignKey(Area, on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_("Área"))
    plan_trabajo    = models.CharField(max_length=100, blank=True, verbose_name=_("N° Plan de trabajo"))
    codigo_plan     = models.CharField(max_length=50, blank=True, verbose_name=_("Código del plan"))
    nombre_plan     = models.CharField(max_length=255, blank=True, verbose_name=_("Nombre del plan"))
    pasos_afectados = models.PositiveIntegerField(default=0, verbose_name=_("Pasos afectados"))
    motivo          = models.TextField(blank=True, verbose_name=_("Motivo"))
    fecha           = models.DateTimeField(auto_now_add=True, verbose_name=_("Fecha y hora"))

    def __str__(self):
        return f"{self.get_accion_display()} — Plan {self.plan_trabajo} por {self.usuario} ({self.fecha:%d/%m/%Y %H:%M})"

    class Meta:
        verbose_name = _("Historial de rutina")
        verbose_name_plural = _("Historial de rutinas")
        ordering = ['-fecha']

class SeguimientoOT(models.Model):
    TIPO_CHOICES = [
        ('correctiva', _('Correctiva')),
    ]
    ESTATUS_CHOICES = [
        ('pendiente',   _('Pendiente')),
        ('en_proceso',  _('En proceso')),
        ('completado',  _('Completado')),
    ]

    registro       = models.ForeignKey(
        'RegistroEjecucion', on_delete=models.CASCADE,
        related_name='seguimientos', verbose_name=_('Registro de ejecución')
    )
    tipo             = models.CharField(max_length=20, choices=TIPO_CHOICES, default='correctiva', verbose_name=_('Tipo'))
    problema         = models.TextField(verbose_name=_('Problema encontrado'))
    accion           = models.TextField(blank=True, default='', verbose_name=_('Acción realizada'))
    responsable      = models.CharField(max_length=100, blank=True, default='', verbose_name=_('Responsable'))
    fecha_compromiso = models.DateField(null=True, blank=True, verbose_name=_('Fecha compromiso'))
    estatus          = models.CharField(max_length=20, choices=ESTATUS_CHOICES, default='pendiente', verbose_name=_('Estatus'))
    notas            = models.TextField(blank=True, default='', verbose_name=_('Notas adicionales'))
    creado_por       = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, verbose_name=_('Creado por'))
    fecha_creacion   = models.DateTimeField(auto_now_add=True, verbose_name=_('Fecha de creación'))
    validado         = models.BooleanField(default=False, verbose_name=_('Validado'))

    class Meta:
        ordering = ['-fecha_creacion']
        verbose_name = _('Seguimiento de OT')
        verbose_name_plural = _('Seguimientos de OT')

    def __str__(self):
        return f"Seguimiento {self.registro} — {self.get_tipo_display()} — {self.get_estatus_display()}"
    
class SeguimientoManual(models.Model):
    TIPO_CHOICES = [
        ('correctiva', _('Correctiva')),
    ]
    ESTATUS_CHOICES = [
        ('pendiente',  _('Pendiente')),
        ('en_proceso', _('En proceso')),
        ('completado', _('Completado')),
    ]

    consecutivo      = models.PositiveIntegerField(unique=True, verbose_name=_('Consecutivo'))
    area             = models.ForeignKey('Area', on_delete=models.PROTECT, null=True, blank=True, verbose_name=_('Área'))
    tipo             = models.CharField(max_length=20, choices=TIPO_CHOICES, default='correctiva')
    problema         = models.TextField(verbose_name=_('Problema encontrado'))
    accion           = models.TextField(blank=True, default='', verbose_name=_('Acción realizada'))
    responsable      = models.CharField(max_length=100, blank=True, default='', verbose_name=_('Responsable'))
    fecha_compromiso = models.DateField(null=True, blank=True, verbose_name=_('Fecha compromiso'))
    estatus          = models.CharField(max_length=20, choices=ESTATUS_CHOICES, default='pendiente')
    notas            = models.TextField(blank=True, default='', verbose_name=_('Notas adicionales'))
    creado_por       = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    fecha_creacion   = models.DateTimeField(auto_now_add=True)
    validado         = models.BooleanField(default=False, verbose_name=_('Validado'))

    class Meta:
        ordering = ['-consecutivo']
        verbose_name = _('Seguimiento manual')
        verbose_name_plural = _('Seguimientos manuales')

    @property
    def no_orden(self):
        return f"M{self.consecutivo:08d}"

    def __str__(self):
        return f"{self.no_orden} — {self.get_estatus_display()}"
    

def imagen_seguimiento_upload_path(instance, filename):
    tipo = 'ot' if instance.seguimiento_ot_id else 'manual'
    obj_id = instance.seguimiento_ot_id or instance.seguimiento_manual_id
    return f'seguimientos/{tipo}/{obj_id}/{filename}'


class ImagenSeguimiento(models.Model):
    seguimiento_ot      = models.ForeignKey(SeguimientoOT, on_delete=models.CASCADE,
                                            related_name='imagenes', null=True, blank=True)
    seguimiento_manual  = models.ForeignKey(SeguimientoManual, on_delete=models.CASCADE,
                                             related_name='imagenes', null=True, blank=True)
    imagen      = models.ImageField(upload_to=imagen_seguimiento_upload_path, verbose_name='Imagen')
    subida_en   = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de subida')

    class Meta:
        verbose_name = 'Imagen de seguimiento'
        verbose_name_plural = 'Imágenes de seguimiento'
        ordering = ['subida_en']

    def __str__(self):
        return f'Imagen seguimiento — {self.subida_en:%d/%m/%Y}'


@receiver(post_delete, sender=ImagenSeguimiento)
def borrar_archivo_imagen_seguimiento(sender, instance, **kwargs):
    if instance.imagen:
        instance.imagen.delete(save=False)