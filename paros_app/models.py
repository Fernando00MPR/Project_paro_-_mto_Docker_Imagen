from django.db import models
from django.core.validators import MinValueValidator
from django.utils.translation import gettext_lazy as _ 

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
        ('rojo',     _('Sin revisar')),
        ('amarillo', _('Pendiente')),
        ('verde',    _('Revisado')),
    ]

    area           = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='paros', verbose_name="Área")
    fecha          = models.DateField(verbose_name="Fecha (dd/mm/yyyy)", db_index=True)
    turno          = models.IntegerField(choices=TURNO_CHOICES, verbose_name="Turno", db_index=True)
    falla          = models.CharField(max_length=100, verbose_name="Falla")
    responsable    = models.CharField(max_length=100, verbose_name="Responsable")
    equipo         = models.CharField(max_length=100, verbose_name="Equipo")
    hora           = models.TimeField(verbose_name="Hora (HH:MM)")
    tiempo_minutos = models.PositiveIntegerField(validators=[MinValueValidator(0)], verbose_name="Tiempo (minutos)")
    estatus        = models.CharField(max_length=10, choices=ESTATUS_CHOICES, default='rojo', verbose_name="Estatus")
    comentarios    = models.CharField(max_length=100, blank=True, verbose_name="Comentarios")

    def __str__(self):
        return f"{self.falla} - {self.fecha}"

    class Meta:
        verbose_name = "Paro"
        verbose_name_plural = "Paros"
        ordering = ['-fecha', '-hora']

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
        'rojo':     'Sin revisar',
        'amarillo': 'Pendiente',
        'verde':    'Revisado',
    }

    paro           = models.ForeignKey(Paro, on_delete=models.CASCADE,
                                       related_name='bitacora', verbose_name='Paro')
    usuario        = models.ForeignKey('auth.User', on_delete=models.SET_NULL,
                                       null=True, blank=True, verbose_name='Usuario')
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