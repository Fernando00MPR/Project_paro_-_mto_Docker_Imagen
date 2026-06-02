/**
 * importar_rutinas.js
 * Script para el template importar pasos de rutina (mto_app)
 * Maneja drag & drop y vista previa del archivo Excel.
 * Columnas mostradas en preview: Seq # · Descripción · Detalles
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

            // Los datos empiezan en fila 11 (índice 10), col B=índice 1
            const data = rows.slice(10).filter(r => r[1] !== '' && r[1] !== null && r[1] !== undefined);

            // Actualizar metadatos con número de filas
            document.getElementById('file-meta').textContent =
                (file.size / 1024).toFixed(1) + ' KB · ' + data.length + ' filas';

            // Mostrar primeras 14 filas en la tabla
            llenarPreview(data.slice(0, 14), data.length);

        } catch (err) {
            console.error('Error al leer el archivo:', err);
        }
    };
    reader.readAsArrayBuffer(file);
}


// ── Tabla de preview ──────────────────────────────────────────────────────────

/**
 * Llena la tabla de vista previa con las filas del archivo.
 * Muestra columnas: A=Seq #, B=Descripción, C=Detalles (truncado a 60 chars)
 *
 * @param {Array}  rows  - Filas a mostrar (máx 10)
 * @param {number} total - Total de filas en el archivo
 */
function llenarPreview(rows, total) {
    const tbody = document.getElementById('preview-body');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr      = document.createElement('tr');
        const detalle = (row[5] || '').toString(); // Col detalles = índice 5

        // Truncar detalles largos para que el preview no se desborde
        const detalleTruncado = detalle.length > 60
            ? detalle.substring(0, 60) + '…'
            : detalle;

        tr.innerHTML = `
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center; width:50px;"  >${row[0] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:left;   width:200px;" >${row[1] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:left; font-size:11px;">${detalleTruncado}</td>
        `;
        tbody.appendChild(tr);
    });

    // Indicador de filas adicionales no mostradas
    if (total > 10) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="3" style="padding:5px 10px; font-size:11px; color:var(--text-3);">
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