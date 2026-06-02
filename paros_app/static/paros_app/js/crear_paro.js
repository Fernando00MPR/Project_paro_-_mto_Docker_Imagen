/* crear_paro.js — Conversión de fecha/hora entre picker nativo y formato Django */

(function () {
    const pickerFecha = document.getElementById('id_fecha_picker');
    const hiddenFecha = document.getElementById('id_fecha');
    const pickerHora  = document.getElementById('id_hora_picker');
    const hiddenHora  = document.getElementById('id_hora');

    // Si hay valor previo (error de validación), inicializar los pickers
    if (hiddenFecha.value) {
        const partes = hiddenFecha.value.split('/');
        if (partes.length === 3) {
            pickerFecha.value = partes[2] + '-' + partes[1] + '-' + partes[0];
        }
    }
    if (hiddenHora.value) {
        pickerHora.value = hiddenHora.value;
    }

    // Convertir fecha de yyyy-mm-dd a dd/mm/yyyy antes de enviar
    pickerFecha.addEventListener('change', function () {
        const iso = this.value;
        if (iso) {
            const [y, m, d] = iso.split('-');
            hiddenFecha.value = d + '/' + m + '/' + y;
        }
    });

    // Hora va directo HH:MM — mismo formato que espera el backend
    pickerHora.addEventListener('change', function () {
        hiddenHora.value = this.value;
    });

    // Validar que los pickers tengan valor antes de submit
    pickerFecha.closest('form').addEventListener('submit', function (e) {
        if (!pickerFecha.value) {
            pickerFecha.setCustomValidity('Selecciona una fecha.');
            pickerFecha.reportValidity();
            e.preventDefault();
            return;
        }
        pickerFecha.setCustomValidity('');
        if (!pickerHora.value) {
            pickerHora.setCustomValidity('Selecciona una hora.');
            pickerHora.reportValidity();
            e.preventDefault();
            return;
        }
        pickerHora.setCustomValidity('');
    });
})();