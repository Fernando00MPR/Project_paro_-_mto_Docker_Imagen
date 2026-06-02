// ── Columnas ──────────────────────────────────────────────────────────────────
const COLS = [
    'col-area', 'col-codigo', 'col-rutina', 'col-actividad', 
    'col-duracion', 'col-frecuencia', 'col-plan', 'col-sinicio', 'col-proximo',
    'col-nombre-equipo', 'col-locacion', 'col-tipo', 'col-prioridad', 'col-estatus'
];

const OCULTAS_DEFAULT = [
    'col-plan', 'col-sinicio', 'col-nombre-equipo', 'col-locacion', 'col-tipo', 'col-prioridad', 'col-estatus'
];

function toggleCol(cls, visible) {
    document.querySelectorAll('.' + cls).forEach(el => {
        el.style.display = visible ? '' : 'none';
    });
    const prefs = JSON.parse(localStorage.getItem('mto_cols') || '{}');
    prefs[cls] = visible;
    localStorage.setItem('mto_cols', JSON.stringify(prefs));
}

function toggleColPicker() {
    const p = document.getElementById('col-picker');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('col-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('col-picker').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Estilos de los toggles
    document.querySelectorAll('.col-toggle').forEach(el => {
        el.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-2);';
        el.querySelector('input').style.accentColor = 'var(--indigo)';
    });

    // Aplicar preferencias guardadas
    const prefs = JSON.parse(localStorage.getItem('mto_cols') || '{}');
    COLS.forEach(cls => {
        const guardado = prefs[cls];
        let visible;
        if (guardado === true)       visible = true;
        else if (guardado === false) visible = false;
        else                         visible = !OCULTAS_DEFAULT.includes(cls);

        toggleCol(cls, visible);
        const input = document.querySelector('[data-col="' + cls + '"] input');
        if (input) input.checked = visible;
    });
});

// ── Modal calendario ──────────────────────────────────────────────────────────
function abrirModal(pk) {
    document.getElementById('modal-iframe').src = '/mto/equipos/' + pk + '/modal/';
    document.getElementById('modal-backdrop').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    document.getElementById('modal-backdrop').style.display = 'none';
    document.getElementById('modal-iframe').src = '';
    document.body.style.overflow = '';
}

document.getElementById('modal-backdrop').addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
});

window.addEventListener('message', function(e) {
    if (e.data === 'cerrar_modal') {
        cerrarModal();
        window.location.reload();
    } else if (typeof e.data === 'string' && e.data.startsWith('cambiar_anio:')) {
        const parts = e.data.split(':');
        document.getElementById('modal-iframe').src = '/mto/equipos/' + parts[2] + '/modal/?anio=' + parts[1];
    }
});

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminar(url) {
    document.getElementById('form-eliminar').action = url;
    document.getElementById('modal-eliminar').style.display = 'flex';
}

function cerrarModalEliminar() {
    document.getElementById('modal-eliminar').style.display = 'none';
}

document.getElementById('modal-eliminar').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminar();
});

// ── Asignar responsable ───────────────────────────────────────────────────────
function asignarResponsable(planPk, semana, selectEl) {
    const anio          = window.MTO_CONFIG.anio_actual;
    const responsableId = selectEl.value;
    const valorPrevio   = selectEl.dataset.valorPrevio ?? responsableId;

    selectEl.style.borderColor = '#4F46E5';
    selectEl.disabled = true;

    fetch(`/mto/equipos/${planPk}/asignar/${semana}/${anio}/`, {
        method:  'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken':  window.MTO_CONFIG.csrf_token,
        },
        body: `responsable=${responsableId}`,
    })
    .then(function(response) {
        if (response.ok) {
            selectEl.style.borderColor = '#6EE7B7';
            selectEl.dataset.valorPrevio = responsableId;
            setTimeout(() => { selectEl.style.borderColor = ''; }, 1200);
            mostrarToast('✓ Responsable guardado');
        } else {
            selectEl.value = valorPrevio;
            selectEl.style.borderColor = '#FCA5A5';
            setTimeout(() => { selectEl.style.borderColor = ''; }, 1500);
        }
    })
    .catch(function() {
        selectEl.value = valorPrevio;
        selectEl.style.borderColor = '#FCA5A5';
        setTimeout(() => { selectEl.style.borderColor = ''; }, 1500);
    })
    .finally(function() {
        selectEl.disabled = false;
    });
}

function mostrarToast(msg) {
    const toast = document.getElementById('toast-global');
    toast.textContent = msg;
    toast.style.display = 'flex';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2000);
}

// ── Escape cierra modales ─────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModal();
        cerrarModalEliminar();
    }
});