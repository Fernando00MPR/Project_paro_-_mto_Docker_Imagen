from django.db import models
from django.contrib.auth.models import User


class Area(models.Model):
    nombre = models.CharField(max_length=100, unique=True, verbose_name="Area")
    activa = models.BooleanField(default=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name = "Area"
        verbose_name_plural = "Areas"
        ordering = ['nombre']

class PlanMantenimiento(models.Model):

    FRECUENCIA_CHOICES = [
        ('semanal',    'Semanal'),
        ('quincenal',  'Quincenal'),
        ('mensual',    'Mensual'),
        ('trimestral', 'Trimestral'),
        ('semestral',  'Semestral'),
        ('anual',      'Anual'),
    ]

    STATUS_CHOICES = [
        ('Abierta',   'Abierta'),
        ('Cerrada',   'Cerrada'),
        ('Cancelada', 'Cancelada'),
    ]

    PRIORIDAD_CHOICES = [
        ('Baja',  'Baja'),
        ('Media', 'Media'),
        ('Alta',  'Alta'),
    ]

    TIPO_MTO_CHOICES = [
        ('Preventivo', 'Preventivo'),
        ('Correctivo', 'Correctivo'),
        ('Predictivo', 'Predictivo'),
    ]

    area             = models.ForeignKey(Area, on_delete=models.PROTECT, verbose_name="Area")
    codigo           = models.CharField(max_length=50, verbose_name="Codigo")
    actividad        = models.CharField(max_length=255, null=True, blank=True)
    rutina           = models.CharField(max_length=200, verbose_name="Rutina")
    plan_trabajo     = models.CharField(max_length=100, verbose_name="Plan de trabajo")
    frecuencia       = models.CharField(max_length=20, choices=FRECUENCIA_CHOICES, verbose_name="Frecuencia")
    duracion_minutos = models.PositiveIntegerField(default=60, verbose_name="Duracion en minutos")
    semana_inicio    = models.PositiveIntegerField(null=True, blank=True, verbose_name="Semana de inicio")
    anio_inicio      = models.PositiveIntegerField(null=True, blank=True, verbose_name="Anio de inicio")

    # Campos nuevos
    nombre_equipo    = models.CharField(max_length=200, blank=True, verbose_name="Equipo")
    locacion         = models.CharField(max_length=200, blank=True, verbose_name="Locacion")
    tipo_mto         = models.CharField(max_length=20, choices=TIPO_MTO_CHOICES,
                                        default='Preventivo', verbose_name="Tipo de mantenimiento")
    prioridad        = models.CharField(max_length=10, choices=PRIORIDAD_CHOICES,
                                        default='Baja', verbose_name="Prioridad")
    estatus          = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                        default='Abierta', verbose_name="Estatus")

    activo           = models.BooleanField(default=True, verbose_name="Activo")
    creado_en        = models.DateTimeField(auto_now_add=True)
    modificado       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.codigo} - {self.nombre_equipo} ({self.get_frecuencia_display()})"

    class Meta:
        verbose_name = "Plan de mantenimiento"
        verbose_name_plural = "Planes de mantenimiento"
        ordering = ['area', 'codigo']

class RegistroEjecucion(models.Model):

    ESTADO_CHOICES = [
        ('completada',  'Completada'),
        ('pendiente',   'Pendiente'),
        ('reagendada',  'Reagendada'),
        ('cancelada',   'Cancelada'),
    ]

    plan            = models.ForeignKey(PlanMantenimiento, on_delete=models.CASCADE,
                                        related_name='registros', verbose_name="Plan")
    semana_num      = models.PositiveIntegerField(verbose_name="Numero de semana")
    anio            = models.PositiveIntegerField(verbose_name="Anio")
    semana_inicio   = models.DateField(verbose_name="Lunes de la semana")
    estado          = models.CharField(max_length=20, choices=ESTADO_CHOICES,
                                       default='pendiente', verbose_name="Estado")
    responsable = models.ForeignKey(
                        'Responsable',
                        on_delete=models.SET_NULL,
                        null=True, blank=True,
                        verbose_name="Responsable")
    fecha_ejecucion = models.DateField(null=True, blank=True,
                                       verbose_name="Fecha de ejecucion")
    observaciones   = models.TextField(blank=True, verbose_name="Observaciones")
    creado_en       = models.DateTimeField(auto_now_add=True)
    modificado      = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.plan.codigo} S{self.semana_num}/{self.anio} — {self.get_estado_display()}"

    class Meta:
        verbose_name = "Registro de ejecucion"
        verbose_name_plural = "Registros de ejecucion"
        ordering = ['-anio', '-semana_num']
        unique_together = [['plan', 'semana_inicio']]

class PasoRutina(models.Model):
    area         = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name="Area", null=True, blank=True)
    plan_trabajo = models.CharField(max_length=100, verbose_name="N° Plan de trabajo", db_index=True)
    nombre_plan  = models.CharField(max_length=255, blank=True, verbose_name="Nombre del plan") 
    codigo_plan  = models.CharField(max_length=50, blank=True, verbose_name="Codigo del plan")  
    secuencia    = models.PositiveIntegerField(verbose_name="Seq #")
    descripcion  = models.CharField(max_length=200, verbose_name="Descripcion")
    detalles     = models.TextField(blank=True, verbose_name="Detalles")

    def __str__(self):
        return f"PT-{self.plan_trabajo} Paso {self.secuencia}: {self.descripcion}"

    class Meta:
        verbose_name = "Paso de rutina"
        verbose_name_plural = "Pasos de rutina"
        ordering = ['plan_trabajo', 'secuencia']
        unique_together = [['area', 'plan_trabajo', 'secuencia']]



class Responsable(models.Model):
    area          = models.ForeignKey(Area, on_delete=models.CASCADE, verbose_name="Area")
    numero_nomina = models.CharField(max_length=20, verbose_name="Numero de nomina")
    nombre        = models.CharField(max_length=100, verbose_name="Nombre")
    apellidos     = models.CharField(max_length=100, verbose_name="Apellidos")
    posicion      = models.CharField(max_length=100, blank=True, verbose_name="Posicion")
    activo        = models.BooleanField(default=True, verbose_name="Activo")
    creado_en     = models.DateTimeField(auto_now_add=True, verbose_name="Fecha de registro")
    modificado_en = models.DateTimeField(auto_now=True, verbose_name="Ultima edicion")

    def nombre_completo(self):
        return f"{self.nombre} {self.apellidos}"

    def __str__(self):
        return f"{self.numero_nomina} - {self.nombre} {self.apellidos}"

    class Meta:
        verbose_name        = "Responsable"
        verbose_name_plural = "Responsables"
        ordering            = ['area', 'apellidos', 'nombre']
        unique_together     = [['area', 'numero_nomina']]


class AccesoMto(models.Model):
    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name='acceso_mto')
    activo  = models.BooleanField(default=True, verbose_name="Acceso a Gestión de Mantenimiento")
    areas   = models.ManyToManyField(Area, blank=True, verbose_name="Áreas permitidas")

     # Permisos por pestaña
    ver_plan_mantenimiento  = models.BooleanField(default=False, verbose_name="Ver plan de mantenimiento")
    ver_rutinas             = models.BooleanField(default=False, verbose_name="Ver rutinas")
    ver_seguimiento         = models.BooleanField(default=False, verbose_name="Ver seguimiento")
    ver_responsables        = models.BooleanField(default=False, verbose_name="Ver responsables")

    # Permisos de acción por pestaña
    editar_plan_mantenimiento  = models.BooleanField(default=False, verbose_name="Editar plan de mantenimiento")
    editar_rutinas             = models.BooleanField(default=False, verbose_name="Editar rutinas")
    editar_seguimiento         = models.BooleanField(default=False, verbose_name="Editar seguimiento")
    editar_responsables        = models.BooleanField(default=False, verbose_name="Editar responsables")

    def __str__(self):
        return f"{self.usuario.username} — MTO"

    class Meta:
        verbose_name = "Acceso MTO"


class HistorialRutina(models.Model):
    ACCION_CHOICES = [
        ('importar',  'Importar'),
        ('eliminar',  'Eliminar'),
    ]

    usuario      = models.ForeignKey(User, on_delete=models.SET_NULL, null=True,
                                     verbose_name="Usuario")
    accion       = models.CharField(max_length=20, choices=ACCION_CHOICES,
                                    verbose_name="Acción")
    area         = models.ForeignKey(Area, on_delete=models.SET_NULL, null=True, blank=True,
                                     verbose_name="Área")
    plan_trabajo = models.CharField(max_length=100, blank=True, verbose_name="N° Plan de trabajo")
    codigo_plan  = models.CharField(max_length=50, blank=True, verbose_name="Código del plan")
    nombre_plan  = models.CharField(max_length=255, blank=True, verbose_name="Nombre del plan")
    pasos_afectados = models.PositiveIntegerField(default=0, verbose_name="Pasos afectados")
    motivo       = models.TextField(blank=True, verbose_name="Motivo")
    fecha        = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y hora")

    def __str__(self):
        return f"{self.get_accion_display()} — Plan {self.plan_trabajo} por {self.usuario} ({self.fecha:%d/%m/%Y %H:%M})"

    class Meta:
        verbose_name = "Historial de rutina"
        verbose_name_plural = "Historial de rutinas"
        ordering = ['-fecha']

class SeguimientoOT(models.Model):
    TIPO_CHOICES = [
        ('correctiva', 'Correctiva'),
    ]
    ESTATUS_CHOICES = [
        ('pendiente',   'Pendiente'),
        ('en_proceso',  'En proceso'),
        ('completado',  'Completado'),
    ]

    registro       = models.ForeignKey(
        'RegistroEjecucion', on_delete=models.CASCADE,
        related_name='seguimientos', verbose_name='Registro de ejecución'
    )
    tipo           = models.CharField(max_length=20, choices=TIPO_CHOICES, default='correctiva', verbose_name='Tipo')
    problema       = models.TextField(verbose_name='Problema encontrado')
    accion         = models.TextField(blank=True, default='', verbose_name='Acción realizada')
    responsable    = models.CharField(max_length=100, blank=True, default='', verbose_name='Responsable')
    fecha_compromiso = models.DateField(null=True, blank=True, verbose_name='Fecha compromiso')
    estatus        = models.CharField(max_length=20, choices=ESTATUS_CHOICES, default='pendiente', verbose_name='Estatus')
    notas          = models.TextField(blank=True, default='', verbose_name='Notas adicionales')
    creado_por     = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, verbose_name='Creado por'
    )
    fecha_creacion = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de creación')
    validado = models.BooleanField(default=False, verbose_name='Validado')

    class Meta:
        ordering = ['-fecha_creacion']
        verbose_name = 'Seguimiento de OT'
        verbose_name_plural = 'Seguimientos de OT'

    def __str__(self):
        return f"Seguimiento {self.registro} — {self.get_tipo_display()} — {self.get_estatus_display()}"
    
class SeguimientoManual(models.Model):
    TIPO_CHOICES = [
        ('correctiva', 'Correctiva'),
    ]
    ESTATUS_CHOICES = [
        ('pendiente',  'Pendiente'),
        ('en_proceso', 'En proceso'),
        ('completado', 'Completado'),
    ]

    consecutivo      = models.PositiveIntegerField(unique=True, verbose_name='Consecutivo')
    area             = models.ForeignKey('Area', on_delete=models.PROTECT, null=True, blank=True, verbose_name='Área')
    tipo             = models.CharField(max_length=20, choices=TIPO_CHOICES, default='correctiva')
    problema         = models.TextField(verbose_name='Problema encontrado')
    accion           = models.TextField(blank=True, default='', verbose_name='Acción realizada')
    responsable      = models.CharField(max_length=100, blank=True, default='', verbose_name='Responsable')
    fecha_compromiso = models.DateField(null=True, blank=True, verbose_name='Fecha compromiso')
    estatus          = models.CharField(max_length=20, choices=ESTATUS_CHOICES, default='pendiente')
    notas            = models.TextField(blank=True, default='', verbose_name='Notas adicionales')
    creado_por       = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    fecha_creacion   = models.DateTimeField(auto_now_add=True)
    validado = models.BooleanField(default=False, verbose_name='Validado')

    class Meta:
        ordering = ['-consecutivo']
        verbose_name = 'Seguimiento manual'
        verbose_name_plural = 'Seguimientos manuales'

    @property
    def no_orden(self):
        return f"M{self.consecutivo:08d}"

    def __str__(self):
        return f"{self.no_orden} — {self.get_estatus_display()}"