/* crear_paro.js — Fecha/hora y gestión de imágenes en el formulario de crear paro */

// ── Imágenes ──────────────────────────────────────────────────────────────────
// FileList (input.files) es de solo lectura; se usa un array propio (_archivosSeleccionados)
// y se reconstruye el FileList mediante DataTransfer cada vez que cambia la selección.
const MAX_IMGS = 4;               // Límite de imágenes por paro
let _archivosSeleccionados = [];  // Array interno que refleja los archivos activos

// Llamado desde onchange del <input type="file">.
// Acumula los archivos nuevos respetando el máximo; limpia el input para
// permitir seleccionar los mismos archivos otra vez si el usuario lo necesita.
function previsualizarImagenes(input) {
    const nuevos = Array.from(input.files);
    const disponibles = MAX_IMGS - _archivosSeleccionados.length;

    if (nuevos.length > disponibles) {
        showToast(`Máximo ${MAX_IMGS} imágenes. Solo puedes agregar ${disponibles} más.`, 'warning');
        input.value = '';
        return;
    }

    _archivosSeleccionados = _archivosSeleccionados.concat(nuevos);
    input.value = '';     // Resetear para que el mismo archivo pueda re-seleccionarse
    _sincronizarInput();
    _renderPreviews();
}

// Llamado desde el botón ✕ de cada miniatura.
// Elimina el archivo en la posición `index` y actualiza el input y las miniaturas.
function _quitarImagen(index) {
    _archivosSeleccionados.splice(index, 1);
    _sincronizarInput();
    _renderPreviews();
}

// Reconstruye el FileList del <input> a partir del array interno.
// DataTransfer es el único mecanismo estándar para asignar un FileList programáticamente.
function _sincronizarInput() {
    const dt = new DataTransfer();
    _archivosSeleccionados.forEach(f => dt.items.add(f));
    document.getElementById('input-imagenes').files = dt.files;
}

// Dibuja las miniaturas en #preview-imagenes y actualiza el texto de la zona de drop.
// Se usa FileReader para generar un data-URL (base64) de cada archivo local sin subirlo.
function _renderPreviews() {
    const preview = document.getElementById('preview-imagenes');
    preview.innerHTML = '';

    _archivosSeleccionados.forEach((file, i) => {
        const reader = new FileReader();
        reader.onload = e => {
            const div = document.createElement('div');
            div.style.cssText = 'position:relative;';
            div.innerHTML = `
                <img src="${e.target.result}"
                    style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">
                <button type="button" onclick="_quitarImagen(${i})"
                    style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;
                           border-radius:50%;background:var(--red);border:none;cursor:pointer;
                           display:flex;align-items:center;justify-content:center;padding:0;
                           color:#fff;font-size:11px;font-weight:700;line-height:1;">✕</button>
                <div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;
                            font-size:9px;color:#fff;background:rgba(0,0,0,.4);
                            border-radius:0 0 8px 8px;padding:2px 4px;
                            overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
                    ${file.name}
                </div>`;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });

    // Actualizar texto de la zona de clic con strings traducidos desde el template
    const count = _archivosSeleccionados.length;
    const i18n  = window.CREAR_PARO_I18N || {};
    document.getElementById('zona-texto').textContent = count === 0
        ? (i18n.seleccionarImagenes || 'Haz clic para seleccionar imágenes')
        : count === 1
            ? `1 ${i18n.imagenSeleccionada    || 'imagen seleccionada'}`
            : `${count} ${i18n.imagenesSeleccionadas || 'imágenes seleccionadas'}`;
}

// ── Fecha / Hora ───────────────────────────────────────────────────────────────
// El backend espera fecha en formato dd/mm/yyyy y hora HH:MM.
// El <input type="date"> nativo devuelve yyyy-mm-dd, así que se convierte
// antes de enviarlo al campo hidden que lee Django.
// Se usa IIFE para no contaminar el scope global con las variables de los pickers.
(function () {
    const pickerFecha = document.getElementById('id_fecha_picker');
    const hiddenFecha = document.getElementById('id_fecha');
    const pickerHora  = document.getElementById('id_hora_picker');
    const hiddenHora  = document.getElementById('id_hora');

    // Si Django devuelve el formulario con error, el hidden ya tiene el valor previo;
    // se inicializa el picker visual para que no aparezca vacío.
    if (hiddenFecha.value) {
        const partes = hiddenFecha.value.split('/');
        if (partes.length === 3) {
            pickerFecha.value = partes[2] + '-' + partes[1] + '-' + partes[0];
        }
    }
    if (hiddenHora.value) {
        pickerHora.value = hiddenHora.value;
    }

    // Convertir yyyy-mm-dd → dd/mm/yyyy cada vez que el usuario cambia la fecha
    pickerFecha.addEventListener('change', function () {
        const iso = this.value;
        if (iso) {
            const [y, m, d] = iso.split('-');
            hiddenFecha.value = d + '/' + m + '/' + y;
        }
    });

    // La hora ya viene en HH:MM del picker, misma cadena que espera el backend
    pickerHora.addEventListener('change', function () {
        hiddenHora.value = this.value;
    });

    // Bloquear el submit si alguno de los pickers está vacío
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