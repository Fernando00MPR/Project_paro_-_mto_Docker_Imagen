function cerrarModal() {
    window.parent.postMessage('cerrar_modal', '*');
}

function cambiarAnio(anio) {
    window.parent.postMessage('cambiar_anio:' + anio + ':' + window.MODAL_CONFIG.plan_pk, '*');
}

function irOrden(url) {
    window.parent.location.href = url;
}

function abrirFormRegistro(planPk, semana, anio) {
    const url    = '/mto/equipos/' + planPk + '/registro/' + semana + '/' + anio + '/';
    const iframe = document.getElementById('iframe-registro');
    const panel  = document.getElementById('panel-registro');

    iframe.src = url;
    panel.style.display = 'block';

    // Colapsar semanas
    const grid    = document.getElementById('grid-semanas');
    const chevron = document.getElementById('chevron-semanas');
    if (grid) {
        grid.style.display      = 'none';
        grid.dataset.cerrado    = '1';
    }
    if (chevron) chevron.style.transform = '';

    iframe.onload = function() {
        try {
            const h = iframe.contentDocument.body.scrollHeight;
            iframe.style.height = h + 'px';
        } catch(e) {
            iframe.style.height = '420px';
        }
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
}

window.addEventListener('message', function(e) {
    if (e.data === 'cerrar_form_registro') {
        const panel  = document.getElementById('panel-registro');
        const iframe = document.getElementById('iframe-registro');
        panel.style.display = 'none';
        iframe.src = '';
        iframe.style.height = '0';
    } else if (typeof e.data === 'string' && e.data.startsWith('registro_guardado:')) {
        const parts      = e.data.split(':');
        const pk         = parts[1];
        const anio       = parts[2];
        const anioActual = new URLSearchParams(window.location.search).get('anio') || anio;
        location.href    = '/mto/equipos/' + pk + '/modal/?anio=' + anioActual;
    } else if (typeof e.data === 'string' && e.data.startsWith('resize_iframe:')) {
        const h = parseInt(e.data.split(':')[1]);
        const iframe = document.getElementById('iframe-registro');
        if (iframe) iframe.style.height = h + 'px';
    }
});

function toggleSemanas() {
    const grid    = document.getElementById('grid-semanas');
    const chevron = document.getElementById('chevron-semanas');
    const cerrado = grid.dataset.cerrado === '1';
    if (cerrado) {
        grid.style.display      = '';
        chevron.style.transform = 'rotate(180deg)';
        grid.dataset.cerrado    = '0';
    } else {
        grid.style.display      = 'none';
        chevron.style.transform = '';
        grid.dataset.cerrado    = '1';
    }
}