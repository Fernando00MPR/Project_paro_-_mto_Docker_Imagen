/**
 * importar_fallas.js
 * Script para el template importar_fallas_v2.html
 * Maneja drag & drop, vista previa de Excel/CSV y validación de áreas.
 *
 * Diferencias respecto a importar_equipos.js e importar_responsables.js:
 *   1. Soporta archivos CSV además de Excel (.xlsx/.xls)
 *   2. Muestra 4 columnas en la tabla de preview (codigo, area, falla, extra)
 *
 * Requiere window.IMPORTAR_CONFIG.areas desde el template.
 */

// Áreas válidas del sistema (pasadas desde Django)
const AREAS = window.IMPORTAR_CONFIG.areas;


// ── Drag & Drop ───────────────────────────────────────────────────────────────

/**
 * Maneja el evento drop sobre la zona de arrastre.
 * Asigna el archivo al input y dispara la vista previa.
 */
function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropzone').style.borderColor = 'var(--border)';

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const input    = document.getElementById('archivo');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;

    mostrarPreview(input);
}


// ── Vista previa ──────────────────────────────────────────────────────────────

/**
 * Lee el archivo seleccionado (Excel o CSV) y muestra nombre,
 * tamaño y una vista previa de las primeras filas.
 * Detecta automáticamente el tipo de archivo por extensión.
 */
function mostrarPreview(input) {
    const file = input.files[0];
    if (!file) return;

    // Mostrar nombre y tamaño inicial
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = (file.size / 1024).toFixed(1) + ' KB';

    // Ocultar dropzone y mostrar panel de preview
    document.getElementById('dropzone').style.display     = 'none';
    document.getElementById('file-preview').style.display = 'block';

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
        const reader = new FileReader();
        reader.onload = function(e) {
            const lines   = e.target.result.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const rows    = lines.slice(1, 6).map(l =>
                l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            );
            const total = lines.length - 1;

            document.getElementById('file-meta').textContent =
                (file.size / 1024).toFixed(1) + ' KB · ' + total + ' filas';

            validarColumnas(headers);
            llenarPreview(rows, total);
        };
        reader.readAsText(file, 'utf-8');

    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array' });
                const sheet    = workbook.Sheets[workbook.SheetNames[0]];
                const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

                const headers  = rows[0] || [];
                const data     = rows.slice(1).filter(r => r.some(c => c !== ''));

                document.getElementById('file-meta').textContent =
                    (file.size / 1024).toFixed(1) + ' KB · ' + data.length + ' filas';

                validarColumnas(headers);
                llenarPreview(data.slice(0, 20), data.length);

            } catch (err) {
                console.error('Error al leer el archivo:', err);
            }
        };
        reader.readAsArrayBuffer(file);
    }
}


// ── Tabla de preview ──────────────────────────────────────────────────────────

/**
 * Llena la tabla de vista previa con las filas del archivo.
 * Columnas esperadas: codigo · area · falla · (extra)
 * Si el área no existe en el sistema, muestra una advertencia visual.
 *
 * @param {Array}  rows  - Filas a mostrar (máx 20)
 * @param {number} total - Total de filas en el archivo
 */

function validarColumnas(headers) {
    if (!headers || headers.length === 0) return;

    const h = headers.map(h => (h || '').toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const errores = [];

    const tieneCodigo        = h.some(c => c === 'codigo'        || c === 'código');
    const tieneArea          = h.some(c => c === 'area'          || c === 'área');
    const tieneFallaEs       = h.some(c => c === 'falla_es'      || c === 'falla (es)'        || c === 'falla'           || c === 'falla es'           || c === 'falla (español)'         || c === 'falla (spanish)');
    const tieneFallaEn       = h.some(c => c === 'fault_en'      || c === 'fault (en)'        || c === 'fault'           || c === 'fault en'           || c === 'fault (ingles)'          || c === 'fault (english)');
    const tieneTipoEs        = h.some(c => c === 'tipo_falla'    || c === 'tipo_de_falla'     || c === 'tipo de falla'   || c === 'tipo de falla (es)' || c === 'tipo de falla (español)' || c === 'tipo de falla (spanish)' || c.includes('tipo') && c.includes('es'));
    const tieneTipoEn        = h.some(c => c === 'failure type'  || c === 'failure of type'   || c === 'fault type'      || c === 'failure type (en)'  || c === 'Failure type (ingles)'   || c === 'Failure type (english)'  || c.includes('tipo') && c.includes('en'));
    const tieneAreaOrigen    = h.some(c => c === 'area_origen'   || c === 'area de origen'    || c === 'area origen'     || c === 'origen');

    if (!tieneCodigo)      errores.push('No se encuentra columna: Codigo');
    if (!tieneArea)        errores.push('No se encuentra columna: Área');
    if (!tieneFallaEs)     errores.push('No se encuentra columna: Falla (Español)');
    if (!tieneFallaEn)     errores.push('No se encuentra columna: Fault (English)');
    if (!tieneTipoEs)      errores.push('No se encuentra columna: Tipo de falla (ES)');
    if (!tieneTipoEn)      errores.push('No se encuentra columna: Tipo de falla (EN)');
    if (!tieneAreaOrigen)  errores.push('No se encuentra columna: Area de origen');

    if (errores.length > 0) {
        mostrarAlerta(errores);
    } else {
        ocultarAlerta();
    }
}

function mostrarAlerta(errores) {
    let alerta = document.getElementById('alerta-columnas');
    if (!alerta) {
        alerta = document.createElement('div');
        alerta.id = 'alerta-columnas';
        alerta.style = 'background:#FEE2E2; color:#991B1B; border:1px solid #FECACA; border-radius:8px; padding:10px 14px; font-size:12px; margin-bottom:12px;';
        document.getElementById('file-preview').prepend(alerta);
    }
    alerta.innerHTML = '<strong>⚠️ Columnas requeridas faltantes:</strong><ul style="margin:4px 0 0 16px;">' +
        errores.map(e => `<li>${e}</li>`).join('') + '</ul>';
}

function ocultarAlerta() {
    const alerta = document.getElementById('alerta-columnas');
    if (alerta) alerta.remove();
}

function llenarPreview(rows, total) {
    const tbody = document.getElementById('preview-body');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const area = (row[1] || '').toString().trim().toLowerCase();
        const areaClean = area.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const warn = area && !AREAS.some(a => a.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === areaClean);
        const tr   = document.createElement('tr');

        if (warn) tr.style.background = '#FFFBEB';

        tr.innerHTML = `
            <td style="width:50px; padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); text-align:center;">${row[0] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); text-align:center;">
                ${row[1] || ''}
                ${warn ? '<span style="font-size:10px;color:#92400E;background:#FEF3C7;padding:1px 5px;border-radius:3px;margin-left:4px;">no existe</span>' : ''}
            </td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${row[2] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${row[3] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${row[4] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${row[5] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${row[6] || ''}</td>
        `;
        tbody.appendChild(tr);
    });

    if (total > 20) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="7" style="padding:5px 10px; font-size:11px; color:var(--text-3);">
                + ${total - 20} filas más…
            </td>
        `;
        tbody.appendChild(tr);
    }
}


// ── Limpiar formulario ────────────────────────────────────────────────────────

/**
 * Resetea el formulario: limpia el input de archivo,
 * oculta la vista previa y muestra de nuevo el dropzone.
 */
function limpiarArchivo() {
    document.getElementById('archivo').value               = '';
    document.getElementById('dropzone').style.display      = 'block';
    document.getElementById('file-preview').style.display  = 'none';
    document.getElementById('preview-body').innerHTML      = '';
}