from django import forms
from .models import Paro
from datetime import datetime

class ParoForm(forms.ModelForm):
    fecha = forms.CharField(
        label="Fecha (dd/mm/yyyy)",
        widget=forms.TextInput(attrs={'placeholder': 'ej. 31/12/2025'})
    )
    hora = forms.CharField(
        label="Hora (HH:MM formato 24h)",
        widget=forms.TextInput(attrs={'placeholder': 'ej. 14:30'})
    )

    class Meta:
        model  = Paro
        fields = ['area', 'fecha', 'turno', 'falla', 'responsable',
                  'equipo', 'hora', 'tiempo_minutos', 'comentarios']

    def clean_fecha(self):
        fecha_str = self.cleaned_data['fecha']
        try:
            return datetime.strptime(fecha_str, '%d/%m/%Y').date()
        except ValueError:
            raise forms.ValidationError("Formato de fecha inválido. Use dd/mm/yyyy")

    def clean_hora(self):
        hora_str = self.cleaned_data['hora']
        try:
            return datetime.strptime(hora_str, '%H:%M').time()
        except ValueError:
            raise forms.ValidationError("Formato de hora inválido. Use HH:MM (24h)")

    def clean_tiempo_minutos(self):
        minutos = self.cleaned_data['tiempo_minutos']
        if minutos < 0:
            raise forms.ValidationError("El tiempo no puede ser negativo.")
        return minutos

    def clean_falla(self):
        falla = self.cleaned_data['falla']
        if len(falla) > 100:
            raise forms.ValidationError("La falla no puede exceder 100 caracteres.")
        return falla

    def clean_comentarios(self):
        coment = self.cleaned_data.get('comentarios', '')
        if len(coment) > 100:
            raise forms.ValidationError("Comentarios máximo 100 caracteres.")
        return coment
