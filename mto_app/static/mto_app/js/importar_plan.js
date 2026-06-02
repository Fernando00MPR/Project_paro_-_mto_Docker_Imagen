/**
 * importar_plan.js
 * Script para el template importar.html (importar plan de mantenimiento)
 * Maneja drag & drop y vista previa del archivo Excel.
 * Columnas mostradas en preview: Codigo · Rutina · Equipo · Frecuencia
 */


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
 * Lee el archivo Excel seleccionado y muestra nombre,
 * tamaño y una vista previa de las primeras filas.
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

    // Leer el archivo como ArrayBuffer para XLSX
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            const sheet    = workbook.Sheets[workbook.SheetNames[0]];
            const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            // Filtrar filas vacías (excluye encabezado en fila 0)
            const data = rows.slice(1).filter(r => r.some(c => c !== ''));

            // Actualizar metadatos con número de filas
            document.getElementById('file-meta').textContent =
                (file.size / 1024).toFixed(1) + ' KB · ' + data.length + ' filas';

            // Mostrar primeras 8 filas en la tabla
            llenarPreview(data.slice(0, 9), data.length);

        } catch (err) {
            console.error('Error al leer el archivo:', err);
        }
    };
    reader.readAsArrayBuffer(file);
}


// ── Tabla de preview ──────────────────────────────────────────────────────────

/**
 * Llena la tabla de vista previa con las filas del archivo.
 * Muestra columnas: A=Codigo, B=Rutina, C=Equipo, E=Frecuencia
 *
 * @param {Array}  rows  - Filas a mostrar (máx 10)
 * @param {number} total - Total de filas en el archivo
 */
function llenarPreview(rows, total) {
    const tbody = document.getElementById('preview-body');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
         tr.innerHTML = `
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); width:100px;">${row[0] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); width:130px;">${row[1] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); width:260px;">${row[2] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${row[3] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${row[4] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${row[5] || ''}</td>
        `;
        tbody.appendChild(tr);
    });

    // Indicador de filas adicionales no mostradas
    if (total > 10) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="4" style="padding:5px 10px; font-size:11px; color:var(--text-3);">
                + ${total - 10} filas más…
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