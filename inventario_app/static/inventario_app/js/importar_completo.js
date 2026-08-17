/**
 * importar_completo.js
 * Script para el template importar_completo.html (importar inventario completo)
 * Maneja drag & drop y vista previa del archivo Excel.
 * Columnas mostradas en preview:
 *   No. Item · Nombre · Categoría · Unidad · Stock · Mínimo · Máximo · Ubicación · Proveedor · Costo
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

            const data = rows.slice(1).filter(r => r.some(c => c !== ''));

            document.getElementById('file-meta').textContent =
                (file.size / 1024).toFixed(1) + ' KB · ' + data.length + ' filas';

            llenarPreview(data.slice(0, 9), data.length);

        } catch (err) {
            console.error('Error al leer el archivo:', err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function formatearNumeroPreview(valor) {
    if (valor === '' || valor === null || valor === undefined) return '—';
    const num = parseFloat(valor);
    if (isNaN(num)) return valor;
    return num;
}

function formatearTextoPreview(valor, vacio) {
    const texto = (valor === null || valor === undefined) ? '' : String(valor).trim();
    if (!texto) {
        return `<span style="color:var(--text-3); font-style:italic;">${vacio}</span>`;
    }
    return texto;
}

function llenarPreview(rows, total) {
    const tbody = document.getElementById('preview-body');
    tbody.innerHTML = '';

    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);">${row[0] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);">${row[1] || ''}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2);">${formatearTextoPreview(row[3], 'Sin categoría')}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${formatearTextoPreview(row[4], '—')}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text); text-align:center;">${formatearNumeroPreview(row[5])}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${formatearNumeroPreview(row[6])}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${formatearNumeroPreview(row[7])}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${formatearTextoPreview(row[8], '—')}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2);">${formatearTextoPreview(row[9], '—')}</td>
            <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${formatearNumeroPreview(row[10])}</td>
        `;
        tbody.appendChild(tr);
    });

    if (total > 9) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="10" style="padding:5px 10px; font-size:11px; color:var(--text-3);">
                + ${total - 9} filas más…
            </td>
        `;
        tbody.appendChild(tr);
    }
}

function limpiarArchivo() {
    document.getElementById('archivo').value               = '';
    document.getElementById('dropzone').style.display      = 'block';
    document.getElementById('file-preview').style.display  = 'none';
    document.getElementById('preview-body').innerHTML      = '';
}
