from modeltranslation.translator import register, TranslationOptions
from .models import Area, CatalogoFalla, CatalogoEquipo, CatalogoResponsable
from .models import Paro

@register(Area)
class AreaTranslationOptions(TranslationOptions):
    fields = ('nombre',)

@register(Paro)
class ParoTranslationOptions(TranslationOptions):
    fields = ('falla', 'responsable', 'equipo')

@register(CatalogoFalla)
class CatalogoFallaTranslationOptions(TranslationOptions):
    fields = ('nombre', 'tipo_falla')

@register(CatalogoEquipo)
class CatalogoEquipoTranslationOptions(TranslationOptions):
    fields = ('equipo', 'sub_area')

@register(CatalogoResponsable)
class CatalogoResponsableTranslationOptions(TranslationOptions):
    fields = ('responsable',)