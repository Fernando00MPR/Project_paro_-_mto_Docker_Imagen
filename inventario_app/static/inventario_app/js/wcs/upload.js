/* wcs/upload.js — Panel de Tareas WCS: subida y parseo del archivo */

window.WCS = window.WCS || {};
WCS.datos = [];   // todas las tareas ya procesadas por el backend (sin filtrar)

function wcsMostrarError(msg) {
    const el = document.getElementById('wcs-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function wcsFormatoMiles(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function wcsFormatearRangoFechas(fechas) {
    const validas = fechas.filter(Boolean);
    if (!validas.length) return '';
    const min = new Date(Math.min(...validas.map(d => d.getTime())));
    const max = new Date(Math.max(...validas.map(d => d.getTime())));
    const pad = n => String(n).padStart(2, '0');
    const corta = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    const larga = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    return `${corta(min)} – ${larga(max)}`;
}

function wcsMostrarArchivoCargado(nombreArchivo) {
    document.getElementById('wcs-dropzone').style.display = 'none';
    document.getElementById('wcs-archivo-cargado').style.display = 'flex';
    document.getElementById('wcs-archivo-nombre').textContent = nombreArchivo;
    const rango = wcsFormatearRangoFechas(WCS.datos.map(t => t.creado));
    document.getElementById('wcs-archivo-info').textContent =
        `${wcsFormatoMiles(WCS.datos.length)} ${window.WCS_I18N.registros} · ${rango}`;
}

function wcsMostrarCargando(mostrar) {
    // Los 3 estados (dropzone / cargando / archivo-cargado) son mutuamente
    // excluyentes — si no se oculta "archivo-cargado" aquí, al usar
    // "Reemplazar" con un archivo ya cargado, la barra verde anterior queda
    // visible al mismo tiempo que el spinner.
    document.getElementById('wcs-dropzone').style.display = mostrar ? 'none' : '';
    document.getElementById('wcs-cargando').style.display = mostrar ? 'flex' : 'none';
    if (mostrar) document.getElementById('wcs-archivo-cargado').style.display = 'none';
}

function wcsSubirArchivo(file) {
    if (!file) return;
    wcsMostrarError('');
    wcsMostrarCargando(true);

    const formData = new FormData();
    formData.append('archivo', file);

    fetch(window.WCS_CFG.urlProcesar, {
        method: 'POST',
        headers: { 'X-CSRFToken': window.WCS_CFG.csrfToken },
        body: formData,
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) {
            wcsMostrarCargando(false);
            wcsMostrarError(data.error || 'No se pudo procesar el archivo.');
            return;
        }
        WCS.datos = data.tareas.map(t => ({
            ...t,
            creado: t.creado ? new Date(t.creado) : null,
            finalizado: t.finalizado ? new Date(t.finalizado) : null,
        }));
        wcsMostrarCargando(false);
        wcsMostrarArchivoCargado(file.name);
        document.getElementById('wcs-dashboard').style.display = 'block';
        if (typeof wcsInicializarFiltros === 'function') wcsInicializarFiltros();
        if (typeof wcsAplicarFiltros === 'function') wcsAplicarFiltros();
    })
    .catch(() => {
        wcsMostrarCargando(false);
        wcsMostrarError(window.WCS_I18N.errorConexion);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('wcs-dropzone');
    const input = document.getElementById('wcs-archivo');

    input.addEventListener('change', () => wcsSubirArchivo(input.files[0]));

    document.getElementById('wcs-reemplazar').addEventListener('click', e => {
        e.preventDefault();
        input.click();
    });

    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            wcsSubirArchivo(file);
        }
    });
});
