/* lista_plan_extra.js
   Depende de: CSRF_MTO (definido en el template)
*/

// ── Pills de estatus ──────────────────────────────────────────────────────────
function msegEstatus(val) {
    document.getElementById('mseg-estatus').value = val;
    const estilos = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B', border:'1.5px solid #854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5', border:'1.5px solid #185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11', border:'1.5px solid #3B6D11' },
    };
    document.querySelectorAll('.mseg-pill').forEach(btn => {
        const v = btn.dataset.val;
        btn.style.background = v === val ? estilos[v].bg    : '#fff';
        btn.style.color      = v === val ? estilos[v].color : '#6B7280';
        btn.style.border     = v === val ? estilos[v].border : '1px solid #E5E4F0';
    });
}

// ── Cerrar modal seguimiento ──────────────────────────────────────────────────
function cerrarMseg() {
    document.getElementById('modal-seg-padre').style.display = 'none';
    try {
        const modalIframe    = document.getElementById('modal-iframe');
        const registroIframe = modalIframe.contentDocument.getElementById('iframe-registro');
        if (registroIframe) {
            registroIframe.contentWindow.postMessage('mseg_cerrado', '*');
        }
    } catch(err) {}
}

// ── Guardar seguimiento ───────────────────────────────────────────────────────
function guardarMseg() {
    const problema = document.getElementById('mseg-problema').value.trim();
    if (!problema) { alert('El problema es obligatorio.'); return; }

    const id         = document.getElementById('mseg-id').value;
    const registroPk = document.getElementById('mseg-registro-pk').value;
    const url        = id
        ? `/mto/seguimiento/editar/${id}/`
        : `/mto/seguimiento/agregar/${registroPk}/`;

    fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-CSRFToken': CSRF_MTO},
        body: JSON.stringify({
            problema:         problema,
            accion:           document.getElementById('mseg-accion').value.trim(),
            responsable:      document.getElementById('mseg-responsable').value.trim(),
            fecha_compromiso: document.getElementById('mseg-fecha').value,
            estatus:          document.getElementById('mseg-estatus').value,
            notas:            document.getElementById('mseg-notas').value.trim(),
        }),
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) { alert('Error: ' + data.error); return; }
        document.getElementById('modal-seg-padre').style.display = 'none';

        const modalIframe = document.getElementById('modal-iframe');
        try {
            const registroIframe = modalIframe.contentDocument.getElementById('iframe-registro');
            if (registroIframe) {
                registroIframe.contentWindow.postMessage(
                    JSON.stringify({tipo: 'mseg_guardado', data}), '*'
                );
                return;
            }
        } catch(err) {}
        modalIframe.contentWindow.postMessage(
            JSON.stringify({tipo: 'mseg_guardado', data}), '*'
        );
    });
}

// ── Escuchar mensajes del iframe ──────────────────────────────────────────────
window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'string') return;
    if (!e.data.startsWith('{')) return;
    try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'abrir_mseg') {
            document.getElementById('mseg-titulo').textContent    = msg.id ? 'Editar seguimiento' : 'Nuevo seguimiento';
            document.getElementById('mseg-subtitulo').textContent = msg.subtitulo || '';
            document.getElementById('mseg-problema').value        = msg.problema  || '';
            document.getElementById('mseg-accion').value          = msg.accion    || '';
            document.getElementById('mseg-responsable').value     = msg.responsable || '';
            document.getElementById('mseg-fecha').value           = msg.fecha     || '';
            document.getElementById('mseg-notas').value           = msg.notas     || '';
            document.getElementById('mseg-id').value              = msg.id        || '';
            document.getElementById('mseg-registro-pk').value     = msg.registro_pk || '';
            msegEstatus(msg.estatus || 'pendiente');
            document.getElementById('modal-seg-padre').style.display = 'flex';
            setTimeout(() => document.getElementById('mseg-problema').focus(), 50);
        }
    } catch(err) {}
});

// ── Autocomplete responsable ──────────────────────────────────────────────────
(function() {
    const input    = document.getElementById('mseg-responsable');
    const dropdown = document.getElementById('mseg-resp-dropdown');
    if (!input || !dropdown) return;
    let debounce = null;

    function search(q) {
        fetch(`/mto/responsables/buscar-mto/?q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(data => {
                dropdown.innerHTML = '';
                if (!data.length) { dropdown.style.display = 'none'; return; }
                data.forEach(r => {
                    const item = document.createElement('div');
                    item.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border); color:var(--text);';
                    item.innerHTML = `<span style="font-size:11px;color:var(--indigo);margin-right:6px;">${r.codigo}</span>${r.nombre}`;
                    if (r.descripcion) item.innerHTML += `<div style="font-size:11px;color:var(--text-3);">${r.descripcion}</div>`;
                    item.addEventListener('mousedown', e => {
                        e.preventDefault();
                        input.value = r.nombre;
                        dropdown.style.display = 'none';
                    });
                    item.addEventListener('mouseover', () => item.style.background = 'var(--indigo-lt)');
                    item.addEventListener('mouseout',  () => item.style.background = '');
                    dropdown.appendChild(item);
                });
                dropdown.style.display = 'block';
            });
    }

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            if (input.value.trim().length > 0) search(input.value.trim());
            else dropdown.style.display = 'none';
        }, 220);
    });
    input.addEventListener('blur',  () => setTimeout(() => dropdown.style.display = 'none', 150));
    input.addEventListener('focus', () => { if (input.value.trim().length > 0) search(input.value.trim()); });
})();

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
