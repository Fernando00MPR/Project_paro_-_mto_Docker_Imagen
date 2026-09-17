/* lista_seguimientos_servicio.js (inventario_app) */

// Fecha PR/PO/SR son el selector de fecha único; su valor real vive en el
// hidden .dp-value (name=... es el que de verdad envía el <form>). Fijarlo
// desde fuera exige disparar 'change' para que el widget se resincronice y
// repinte (ver date_picker.js).
function setServFecha(dpId, iso) {
    const hidden = document.querySelector('#' + dpId + ' .dp-value');
    hidden.value = iso || '';
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminarServ(event, url) {
    document.getElementById('form-eliminar-serv').action = url;
    document.getElementById('elim-serv-volver').value = window.location.search;
    abrirModalConAnimacion('modal-eliminar-serv', event);
}

function cerrarModalEliminarServ() {
    cerrarModalConAnimacion('modal-eliminar-serv');
}

document.getElementById('modal-eliminar-serv').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminarServ();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModalEliminarServ();
        cerrarModalServ();
    }
});

// ── Modal nuevo/editar seguimiento ────────────────────────────────────────────
function abrirModalServ(event) {
    document.getElementById('modal-serv-titulo').textContent = 'Nuevo seguimiento';
    document.getElementById('form-serv').action = '/inventario/servicios/nuevo/';
    document.getElementById('serv-volver').value = window.location.search;

    document.getElementById('serv-no-item').value     = '';
    document.getElementById('serv-nombre').value      = '';
    document.getElementById('serv-cantidad').value    = '';
    document.getElementById('serv-tipo').value        = '';
    document.getElementById('serv-motivo').value      = '';
    document.getElementById('serv-numero-pr').value   = '';
    setServFecha('dp-serv-fecha-pr', '');
    document.getElementById('serv-numero-po').value   = '';
    setServFecha('dp-serv-fecha-po', '');
    document.getElementById('serv-numero-sr').value   = '';
    setServFecha('dp-serv-fecha-sr', '');
    document.getElementById('serv-comentarios').value = '';

    abrirModalConAnimacion('modal-serv', event);
    setTimeout(() => document.getElementById('serv-no-item').focus(), 50);
}

function editarServ(event, id, noItem, nombre, cantidad, motivo, tipoId, numeroPr, fechaPr, numeroPo, fechaPo, numeroSr, fechaSr, comentarios) {
    document.getElementById('modal-serv-titulo').textContent = 'Editar seguimiento';
    document.getElementById('form-serv').action = `/inventario/servicios/editar/${id}/`;
    document.getElementById('serv-volver').value = window.location.search;

    document.getElementById('serv-no-item').value     = noItem;
    document.getElementById('serv-nombre').value      = nombre;
    document.getElementById('serv-cantidad').value    = cantidad;
    document.getElementById('serv-tipo').value        = tipoId;
    document.getElementById('serv-motivo').value      = motivo;
    document.getElementById('serv-numero-pr').value   = numeroPr;
    setServFecha('dp-serv-fecha-pr', fechaPr);
    document.getElementById('serv-numero-po').value   = numeroPo;
    setServFecha('dp-serv-fecha-po', fechaPo);
    document.getElementById('serv-numero-sr').value   = numeroSr;
    setServFecha('dp-serv-fecha-sr', fechaSr);
    document.getElementById('serv-comentarios').value = comentarios;

    abrirModalConAnimacion('modal-serv', event);
}

function cerrarModalServ() {
    cerrarModalConAnimacion('modal-serv');
}

const SERV_COLS = [
    'serv-col-item', 'serv-col-nombre', 'serv-col-cantidad', 'serv-col-motivo',
    'serv-col-tipo', 'serv-col-pr', 'serv-col-fecha-pr', 'serv-col-po',
    'serv-col-fecha-po', 'serv-col-sr', 'serv-col-fecha-sr', 'serv-col-comentarios'
];

const SERV_OCULTAS_DEFAULT = ['serv-col-tipo', 'serv-col-fecha-po', 'serv-col-fecha-sr'];

function toggleServCol(cls, visible) {
    document.querySelectorAll('.' + cls).forEach(el => {
        el.style.display = visible ? '' : 'none';
    });
    const prefs = JSON.parse(localStorage.getItem('serv_cols') || '{}');
    prefs[cls] = visible;
    localStorage.setItem('serv_cols', JSON.stringify(prefs));
}

function toggleServColPicker() {
    const p = document.getElementById('serv-col-picker');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('serv-col-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('serv-col-picker').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.serv-col-toggle').forEach(el => {
        el.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-2);';
        el.querySelector('input').style.accentColor = 'var(--indigo)';
    });

    const prefs = JSON.parse(localStorage.getItem('serv_cols') || '{}');
    SERV_COLS.forEach(cls => {
        const guardado = prefs[cls];
        let visible;
        if (guardado === true)       visible = true;
        else if (guardado === false) visible = false;
        else                         visible = !SERV_OCULTAS_DEFAULT.includes(cls);

        toggleServCol(cls, visible);
        const input = document.querySelector('[data-col="' + cls + '"] input');
        if (input) input.checked = visible;
    });
});