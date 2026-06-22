/* lista_seguimientos.js (inventario_app) */

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminarSeg(url) {
    document.getElementById('form-eliminar-seg').action = url;
    document.getElementById('modal-eliminar-seg').style.display = 'flex';
}

function cerrarModalEliminarSeg() {
    document.getElementById('modal-eliminar-seg').style.display = 'none';
}

document.getElementById('modal-eliminar-seg').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminarSeg();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModalEliminarSeg();
        cerrarModalSeg();
    }
});

// ── Modal nuevo/editar seguimiento ────────────────────────────────────────────
function abrirModalSeg() {
    document.getElementById('modal-seg-titulo').textContent = 'Nuevo seguimiento';
    document.getElementById('form-seg').action = '/inventario/seguimientos/nuevo/';

    document.getElementById('seg-buscar').value           = '';
    document.getElementById('seg-buscar').disabled         = false;
    document.getElementById('seg-refaccion-id').value      = '';
    document.getElementById('seg-no-item-display').value   = '';
    document.getElementById('seg-nombre-display').value    = '';
    document.getElementById('seg-cantidad').value          = '';
    document.getElementById('seg-numero-pr').value         = '';
    document.getElementById('seg-fecha-pr').value          = '';
    document.getElementById('seg-numero-po').value         = '';
    document.getElementById('seg-fecha-po').value           = '';
    document.getElementById('seg-numero-sr').value          = '';
    document.getElementById('seg-fecha-sr').value           = '';
    document.getElementById('seg-comentarios').value        = '';

    document.getElementById('modal-seg').style.display = 'flex';
    setTimeout(() => document.getElementById('seg-buscar').focus(), 50);
}

function editarSeg(id, refaccionId, noItem, nombre, cantidad, numeroPr, fechaPr, numeroPo, fechaPo, numeroSr, fechaSr, comentarios) {
    document.getElementById('modal-seg-titulo').textContent = 'Editar seguimiento';
    document.getElementById('form-seg').action = `/inventario/seguimientos/editar/${id}/`;

    document.getElementById('seg-buscar').value           = `${noItem} — ${nombre}`;
    document.getElementById('seg-buscar').disabled         = true;
    document.getElementById('seg-refaccion-id').value      = refaccionId;
    document.getElementById('seg-no-item-display').value   = noItem;
    document.getElementById('seg-nombre-display').value    = nombre;
    document.getElementById('seg-cantidad').value          = cantidad;
    document.getElementById('seg-numero-pr').value         = numeroPr;
    document.getElementById('seg-fecha-pr').value          = fechaPr;
    document.getElementById('seg-numero-po').value         = numeroPo;
    document.getElementById('seg-fecha-po').value           = fechaPo;
    document.getElementById('seg-numero-sr').value          = numeroSr;
    document.getElementById('seg-fecha-sr').value           = fechaSr;
    document.getElementById('seg-comentarios').value        = comentarios;

    document.getElementById('modal-seg').style.display = 'flex';
}

function cerrarModalSeg() {
    document.getElementById('modal-seg').style.display = 'none';
}

document.getElementById('modal-seg').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalSeg();
});

// ── Autocompletado de refacciones ─────────────────────────────────────────────
(function() {
    const input    = document.getElementById('seg-buscar');
    const dropdown = document.getElementById('seg-dropdown');
    const areaId   = document.getElementById('seg-area-id');
    let debounce   = null;

    function search(q) {
        const area = areaId.value ? `&area=${areaId.value}` : '';
        fetch(`/inventario/buscar/?q=${encodeURIComponent(q)}${area}`)
            .then(r => r.json())
            .then(data => {
                dropdown.innerHTML = '';
                if (!data.length) { dropdown.style.display = 'none'; return; }
                data.forEach(r => {
                    const item = document.createElement('div');
                    item.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border); color:var(--text);';
                    item.innerHTML = `<span style="font-size:11px;color:var(--indigo);margin-right:6px;font-weight:600;">${r.no_item}</span>${r.nombre}`;
                    item.addEventListener('mousedown', e => {
                        e.preventDefault();
                        input.value = `${r.no_item} — ${r.nombre}`;
                        document.getElementById('seg-refaccion-id').value    = r.id;
                        document.getElementById('seg-no-item-display').value = r.no_item;
                        document.getElementById('seg-nombre-display').value  = r.nombre;
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
        document.getElementById('seg-refaccion-id').value = '';
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            if (input.value.trim().length > 0) search(input.value.trim());
            else dropdown.style.display = 'none';
        }, 250);
    });

    input.addEventListener('blur',  () => setTimeout(() => dropdown.style.display = 'none', 150));
    input.addEventListener('focus', () => { if (input.value.trim().length > 0 && !input.disabled) search(input.value.trim()); });
})();

// ── Validar que se haya seleccionado una refacción antes de enviar ───────────
document.getElementById('form-seg').addEventListener('submit', function(e) {
    const refaccionId = document.getElementById('seg-refaccion-id').value;
    if (!refaccionId) {
        e.preventDefault();
        if (typeof showToast === 'function') {
            showToast('Selecciona una refacción de la lista', 'warning');
        } else {
            alert('Selecciona una refacción de la lista');
        }
    }
});