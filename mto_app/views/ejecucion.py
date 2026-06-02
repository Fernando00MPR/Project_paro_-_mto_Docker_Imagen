from datetime import date, timedelta
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from django.shortcuts import render

from ..models import PlanMantenimiento, RegistroEjecucion, Responsable
from .utils import lunes_de_semana


@login_required
@xframe_options_exempt
def registro_ejecucion(request, plan_pk, semana, anio):
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = RegistroEjecucion.objects.filter(plan=plan, semana_inicio=lunes).first()
    responsables = Responsable.objects.filter(area=plan.area, activo=True).order_by('apellidos', 'nombre')

    if request.method == 'POST':
        estado         = request.POST.get('estado', 'pendiente')
        responsable_id = request.POST.get('responsable') or None
        fecha_str      = request.POST.get('fecha_ejecucion', '')
        observaciones  = request.POST.get('observaciones', '').strip()

        try:
            fecha_ej = date.fromisoformat(fecha_str) if fecha_str else None
        except Exception:
            fecha_ej = None

        if registro:
            registro.estado          = estado
            registro.responsable_id  = responsable_id
            registro.fecha_ejecucion = fecha_ej
            registro.observaciones   = observaciones
            registro.save()
        else:
            RegistroEjecucion.objects.create(
                plan=plan,
                semana_num=semana,
                anio=anio,
                semana_inicio=lunes,
                estado=estado,
                responsable_id=responsable_id,
                fecha_ejecucion=fecha_ej,
                observaciones=observaciones,
            )

        return HttpResponse(f'''
            <script>
                window.parent.postMessage('registro_guardado:{plan_pk}:{anio}', '*');
            </script>
        ''')

    ctx = {
        'plan':          plan,
        'semana':        semana,
        'anio':          anio,
        'lunes':         lunes,
        'domingo':       lunes + timedelta(days=6),
        'registro':      registro,
        'responsables':  responsables,
        'estados':       RegistroEjecucion.ESTADO_CHOICES,
    }
    return render(request, 'mto_app/plan/registro_form.html', ctx)


@login_required
@xframe_options_exempt
def eliminar_registro(request, plan_pk, semana, anio):
    plan     = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes    = lunes_de_semana(anio, semana)
    registro = get_object_or_404(RegistroEjecucion, plan=plan, semana_inicio=lunes)
    if request.method == 'POST':
        registro.delete()
        return HttpResponse(status=200)
    return HttpResponse(status=405)


@login_required
def asignar_responsable(request, plan_pk, semana, anio):
    plan  = get_object_or_404(PlanMantenimiento, pk=plan_pk)
    lunes = lunes_de_semana(anio, semana)

    if request.method == 'POST':
        responsable_id = request.POST.get('responsable') or None
        registro, _    = RegistroEjecucion.objects.get_or_create(
            plan=plan,
            semana_inicio=lunes,
            defaults={
                'semana_num': semana,
                'anio':       anio,
                'estado':     'pendiente',
            }
        )
        if responsable_id:
            try:
                responsable_obj        = Responsable.objects.get(pk=responsable_id)
                registro.responsable   = responsable_obj
            except Responsable.DoesNotExist:
                registro.responsable   = None
        else:
            registro.responsable = None

        registro.save()
        return HttpResponse(status=200)
    return HttpResponse(status=405)