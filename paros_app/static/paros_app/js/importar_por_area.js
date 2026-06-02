/**
 * importar_por_area.js
 * Script compartido para los templates de importación por área:
 *   - importar_equipos_por_area.html
 *   - importar_responsables_por_area.html
 *   - importar_fallas_por_area.html
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

            const headers = rows[0] || [];
            const data    = rows.slice(1).filter(row => row.some(cell => cell !== ''));

            document.getElementById('file-meta').textContent =
                (file.size / 1024).toFixed(1) + ' KB · ' + data.length + ' filas';

            validarColumnas(headers);
            llenarPreview(data.slice(0, 10), data.length);

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

    const esFallas      = h.some(c => c.includes('falla'));
    const esEquipo      = h.some(c => c.includes('equipo'));
    const esResponsable = h.some(c => c.includes('responsable'));
    const errores       = [];

    if (esFallas) {
        const tieneArea = h.some(c => c === 'area');
        if (tieneArea) {
            errores.push('⚠️ El archivo contiene columna "Área" — usa el exportar general, no el de área específica.');
        } else {
            if (!h[0].includes('codigo')) errores.push(`Columna 1 debe ser "Código", se encontró: "${headers[0]}"`);
            if (!h[1].includes('falla'))  errores.push(`Columna 2 debe ser "Falla (ES)", se encontró: "${headers[1]}"`);
            if (!h[2].includes('falla') && !h[2].includes('fault')) errores.push(`Columna 3 debe ser "Falla (EN)", se encontró: "${headers[2]}"`);
            if (!h[3].includes('tipo'))   errores.push(`Columna 4 debe ser "Tipo de falla (ES)", se encontró: "${headers[3]}"`);
            if (!h[4].includes('tipo'))   errores.push(`Columna 5 debe ser "Tipo de falla (EN)", se encontró: "${headers[4]}"`);
            if (!h[5].includes('origen') && !h[5].includes('area')) errores.push(`Columna 6 debe ser "Área de origen", se encontró: "${headers[5] || ''}"`);
        }
    } else if (esEquipo) {
        const tieneArea = h.some(c => c === 'area');
        if (tieneArea) {
            errores.push('⚠️ El archivo contiene columna "Área" — usa el exportar general, no el de área específica.');
        } else {
            if (!h[0].includes('codigo'))  errores.push(`Columna 1 debe ser "Código", se encontró: "${headers[0]}"`);
            if (!h[1].includes('equipo'))  errores.push(`Columna 2 debe ser "Equipo (ES)", se encontró: "${headers[1]}"`);
            if (!h[2].includes('equipo') && !h[2].includes('equipment')) errores.push(`Columna 3 debe ser "Equipo (EN)", se encontró: "${headers[2]}"`);
            if (!h[3].includes('sub'))     errores.push(`Columna 4 debe ser "Sub área (ES)", se encontró: "${headers[3]}"`);
            if (!h[4].includes('sub'))     errores.push(`Columna 5 debe ser "Sub área (EN)", se encontró: "${headers[4]}"`);
        }
    } else if (esResponsable) {
        const tieneArea = h.some(c => c === 'area');
        if (tieneArea) {
            errores.push('⚠️ El archivo contiene columna "Área" — usa el exportar general, no el de área específica.');
        } else {
            if (!h[0].includes('codigo'))       errores.push(`Columna 1 debe ser "Código", se encontró: "${headers[0]}"`);
            if (!h[1].includes('responsable'))  errores.push(`Columna 2 debe ser "Responsable (ES)", se encontró: "${headers[1]}"`);
            if (!h[2].includes('responsable'))  errores.push(`Columna 3 debe ser "Responsable (EN)", se encontró: "${headers[2]}"`);
        }
    } else {
        if (!h[0].includes('codigo')) errores.push(`Columna 1 debe ser "Código", se encontró: "${headers[0]}"`);
        if (headers.length < 2) errores.push('Falta columna principal de valor');
    }

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
        const tr            = document.createElement('tr');
        const esFallas      = row.length >= 6;
        const esEquipo      = row.length === 5 && !row.some((c,i) => i===3 && String(c).toLowerCase().includes('tipo'));
        const esResponsable = row.length === 3;

        if (esFallas) {
            const codigo        = row[0] || '';
            const falla_es      = row[1] || '';
            const falla_en      = row[2] || '';
            const tipo_falla_es = row[3] || '';
            const tipo_falla_en = row[4] || '';
            const area_origen   = row[5] || '';

            tr.innerHTML = `
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${codigo}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${falla_es}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${falla_en}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${tipo_falla_es}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${tipo_falla_en}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${area_origen}</td>
            `;
        } else if (esEquipo) {
            const codigo      = row[0] || '';
            const equipo_es   = row[1] || '';
            const equipo_en   = row[2] || '';
            const sub_area_es = row[3] || '';
            const sub_area_en = row[4] || '';

            tr.innerHTML = `
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${codigo}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${equipo_es}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${equipo_en}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${sub_area_es}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${sub_area_en}</td>
            `;
        } else if (esResponsable) {
            const codigo   = row[0] || '';
            const resp_es  = row[1] || '';
            const resp_en  = row[2] || '';

            tr.innerHTML = `
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${codigo}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);   text-align:center;">${resp_es}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text-2); text-align:center;">${resp_en}</td>
            `;
        } else {
            const esTresColumnas = row.length >= 3 && row[2] !== '';
            const codigo = row[0] || '';
            const valor  = esTresColumnas ? (row[2] || '') : (row[1] || '');

            tr.innerHTML = `
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);">${codigo}</td>
                <td style="padding:5px 10px; border-bottom:0.5px solid var(--border); color:var(--text);">${valor}</td>
            `;
        }
        tbody.appendChild(tr);
    });

    if (total > 10) {
        const colspan = document.getElementById('preview-body').closest('table')
            .querySelectorAll('thead th').length || 2;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="${colspan}" style="padding:5px 10px; font-size:11px; color:var(--text-3);">
                + ${total - 10} filas más…
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