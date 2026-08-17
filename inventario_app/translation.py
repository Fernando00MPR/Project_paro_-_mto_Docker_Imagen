from modeltranslation.translator import register, TranslationOptions
from .models import CategoriaRefaccion


@register(CategoriaRefaccion)
class CategoriaRefaccionTranslationOptions(TranslationOptions):
    fields = ('nombre',)
