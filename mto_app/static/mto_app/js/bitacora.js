/* bitacora.js */

const cfg = window.BITACORA_CFG || {};

// ── Modal crear / editar ──────────────────────────────────────────────────────

function abrirModalBitacora() {
    document.getElementById('modal-titulo-bitacora').textContent = 'Nuevo registro';
    document.getElementById('form-bitacora').action = cfg.urlNuevo;
    const areaSelect = document.getElementById('bit-area');
    if (cfg.filtroArea && areaSelect) areaSelect.value = cfg.filtroArea;
    document.getElementById('bit-fecha').value       = cfg.hoy || '';
    document.getElementById('bit-equipo').value      = '';
    document.getElementById('bit-responsable').value = '';
    document.getElementById('bit-actividad').value   = '';
    document.getElementById('bit-pendiente').value   = '';
    _actualizarContadores();
    document.getElementById('modal-bitacora').style.display = 'flex';
}

function abrirModalEditar(ds) {
    document.getElementById('modal-titulo-bitacora').textContent = 'Editar registro';
    document.getElementById('form-bitacora').action = ds.url;
    const areaSelect = document.getElementById('bit-area');
    if (areaSelect) areaSelect.value = ds.area;
    document.getElementById('bit-fecha').value       = ds.fecha;
    document.getElementById('bit-equipo').value      = ds.equipo;
    document.getElementById('bit-responsable').value = ds.responsable;
    document.getElementById('bit-actividad').value   = ds.actividad;
    document.getElementById('bit-pendiente').value   = ds.pendiente;
    _actualizarContadores();
    document.getElementById('modal-bitacora').style.display = 'flex';
}

function cerrarModalBitacora() {
    document.getElementById('modal-bitacora').style.display = 'none';
}

// ── Modal eliminar ────────────────────────────────────────────────────────────

function confirmarEliminarBitacora(url, texto) {
    document.getElementById('form-eliminar-bitacora').action = url;
    document.getElementById('texto-eliminar-bitacora').textContent = texto;
    document.getElementById('modal-eliminar-bitacora').style.display = 'flex';
}

function cerrarModalEliminarBitacora() {
    document.getElementById('modal-eliminar-bitacora').style.display = 'none';
}

// ── Contadores de caracteres ──────────────────────────────────────────────────

function _actualizarContadores() {
    const a = document.getElementById('bit-actividad');
    const p = document.getElementById('bit-pendiente');
    if (a) document.getElementById('cnt-actividad').textContent = a.value.length + '/300';
    if (p) document.getElementById('cnt-pendiente').textContent = p.value.length + '/200';
}

// ── Autocomplete genérico ─────────────────────────────────────────────────────

function _autocomplete(inputId, dropdownId, fetchUrl) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let timer;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 1) { dropdown.style.display = 'none'; return; }

        timer = setTimeout(() => {
            const areaId = document.getElementById('bit-area')
                ? document.getElementById('bit-area').value
                : (cfg.filtroArea || '');

            fetch(`${fetchUrl}?area_id=${encodeURIComponent(areaId)}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(items => {
                    if (!items.length) { dropdown.style.display = 'none'; return; }
                    dropdown.innerHTML = items.map(it => `
                        <div class="bit-ac-item" data-nombre="${it.nombre.replace(/"/g, '&quot;')}"
                             style="padding:8px 12px; cursor:pointer; font-size:13px;
                                    border-bottom:1px solid var(--border);">
                            <div style="font-weight:500;">${it.nombre}</div>
                            ${it.descripcion ? `<div style="font-size:11px; color:var(--text-3);">${it.descripcion}</div>` : ''}
                        </div>
                    `).join('');
                    dropdown.querySelectorAll('.bit-ac-item').forEach(item => {
                        item.addEventListener('mousedown', e => {
                            e.preventDefault();
                            input.value = item.dataset.nombre;
                            dropdown.style.display = 'none';
                        });
                    });
                    dropdown.style.display = 'block';
                })
                .catch(() => {});
        }, 200);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Contadores
    const actividad = document.getElementById('bit-actividad');
    const pendiente = document.getElementById('bit-pendiente');
    if (actividad) actividad.addEventListener('input', _actualizarContadores);
    if (pendiente) pendiente.addEventListener('input', _actualizarContadores);

    // Autocomplete
    _autocomplete('bit-equipo',      'equipo-dropdown-bit',      cfg.urlBuscarEquipos);
    _autocomplete('bit-responsable', 'responsable-dropdown-bit', cfg.urlBuscarResponsables);

    // Cerrar modales con backdrop y ESC
    document.getElementById('modal-bitacora').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-bitacora')) cerrarModalBitacora();
    });
    document.getElementById('modal-eliminar-bitacora').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-eliminar-bitacora')) cerrarModalEliminarBitacora();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarModalBitacora();
            cerrarModalEliminarBitacora();
        }
    });
});
