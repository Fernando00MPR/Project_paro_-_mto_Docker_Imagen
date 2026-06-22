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