/* lista_seguimientos_servicio.js (inventario_app) */

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminarServ(url) {
    document.getElementById('form-eliminar-serv').action = url;
    document.getElementById('modal-eliminar-serv').style.display = 'flex';
}

function cerrarModalEliminarServ() {
    document.getElementById('modal-eliminar-serv').style.display = 'none';
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
function abrirModalServ() {
    document.getElementById('modal-serv-titulo').textContent = 'Nuevo seguimiento';
    document.getElementById('form-serv').action = '/inventario/servicios/nuevo/';

    document.getElementById('serv-no-item').value     = '';
    document.getElementById('serv-nombre').value      = '';
    document.getElementById('serv-cantidad').value    = '';
    document.getElementById('serv-tipo').value        = '';
    document.getElementById('serv-motivo').value      = '';
    document.getElementById('serv-numero-pr').value   = '';
    document.getElementById('serv-fecha-pr').value    = '';
    document.getElementById('serv-numero-po').value   = '';
    document.getElementById('serv-fecha-po').value    = '';
    document.getElementById('serv-numero-sr').value   = '';
    document.getElementById('serv-fecha-sr').value    = '';
    document.getElementById('serv-comentarios').value = '';

    document.getElementById('modal-serv').style.display = 'flex';
    setTimeout(() => document.getElementById('serv-no-item').focus(), 50);
}

function editarServ(id, noItem, nombre, cantidad, motivo, tipoId, numeroPr, fechaPr, numeroPo, fechaPo, numeroSr, fechaSr, comentarios) {
    document.getElementById('modal-serv-titulo').textContent = 'Editar seguimiento';
    document.getElementById('form-serv').action = `/inventario/servicios/editar/${id}/`;

    document.getElementById('serv-no-item').value     = noItem;
    document.getElementById('serv-nombre').value      = nombre;
    document.getElementById('serv-cantidad').value    = cantidad;
    document.getElementById('serv-tipo').value        = tipoId;
    document.getElementById('serv-motivo').value      = motivo;
    document.getElementById('serv-numero-pr').value   = numeroPr;
    document.getElementById('serv-fecha-pr').value    = fechaPr;
    document.getElementById('serv-numero-po').value   = numeroPo;
    document.getElementById('serv-fecha-po').value    = fechaPo;
    document.getElementById('serv-numero-sr').value   = numeroSr;
    document.getElementById('serv-fecha-sr').value    = fechaSr;
    document.getElementById('serv-comentarios').value = comentarios;

    document.getElementById('modal-serv').style.display = 'flex';
}

function cerrarModalServ() {
    document.getElementById('modal-serv').style.display = 'none';
}

document.getElementById('modal-serv').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalServ();
});

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