/**
 * importar_equipos.js
 * Script para el template importar_equipos.html
 * Maneja drag & drop, vista previa de Excel y validación de áreas.
 *
 * Requiere window.IMPORTAR_CONFIG.areas desde el template.
 */

// Áreas válidas del sistema (pasadas desde Django)
const AREAS = window.IMPORTAR_CONFIG.areas;

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

function mostrarPreview(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-meta').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('dropzone').style.display     = 'none';
    document.getElementById('file-preview').style.display = 'block';

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

function validarColumnas(headers) {
    if (!headers || headers.length === 0) return;
    const h = headers.map(h => (h || '').toString().toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const errores = [];

    const tieneCodigo   = h.some(c => c === 'codigo');
    const tieneArea     = h.some(c => c === 'area');
    const tieneEquipoEs = h.some(c => c === 'equipo_es'   || c === 'equipo (es)'   || c === 'equipo'         || c === 'equipo (Español)');
    const tieneEquipoEn = h.some(c => c === 'equipo_en'   || c === 'equipo (en)'   || c === 'equipment (en)' || c === 'equipment' || c === 'equipment (English)' );
    const tieneSubEs    = h.some(c => c === 'sub_area_es' || c === 'sub area (es)' || c === 'sub_área'       || c === 'sub área (Español)');
    const tieneSubEn    = h.some(c => c === 'sub_area_en' || c === 'sub area (en)' || c === 'sub_área'       || c === 'sub área (English)');

    if (!tieneCodigo)   errores.push('No se encuentra columna: Codigo');
    if (!tieneArea)     errores.push('No se encuentra columna: Área');
    if (!tieneEquipoEs) errores.push('No se encuentra columna: Equipo (ES)');
    if (!tieneEquipoEn) errores.push('Se recomienda columna: Equipo (EN)');
    if (!tieneSubEs)    errores.push('Se recomienda columna: Sub área (ES)');
    if (!tieneSubEn)    errores.push('Se recomienda columna: Sub área (EN)');

    if (errores.length > 0) mostrarAlerta(errores);
    else ocultarAlerta();
}

function mostrarAlerta(errores) {
    let alerta = document.getElementById('alerta-columnas');
    if (!alerta) {
        alerta = document.createElement('div');
        alerta.id    = 'alerta-columnas';
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
        const area = (row[1] || '').toString().trim().toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const warn = area && !AREAS.some(a => a.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === area);
        const tr   = document.createElement('tr');
        if (warn) tr.style.background = '#FFFBEB';

        tr.innerHTML = `
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); text-align: center;">${row[0] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); text-align: center;">
                ${row[1] || ''}
                ${warn ? '<span style="font-size:10px;color:#92400E;background:#FEF3C7;padding:1px 5px;border-radius:3px;margin-left:4px;">no existe</span>' : ''}
            </td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align: center;">${row[2] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align: center;">${row[3] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align: center;">${row[4] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align: center;">${row[5] || ''}</td>
        `;
        tbody.appendChild(tr);
    });

    if (total > 20) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="padding:5px 10px; font-size:11px; color:var(--text-3);">+ ${total - 20} filas más…</td>`;
        tbody.appendChild(tr);
    }
}

function limpiarArchivo() {
    document.getElementById('archivo').value               = '';
    document.getElementById('dropzone').style.display      = 'block';
    document.getElementById('file-preview').style.display  = 'none';
    document.getElementById('preview-body').innerHTML      = '';
}