/* editar_paro.js — Color dinámico del select de estatus */

function actualizarColorEstatus(sel) {
    sel.className = sel.className.replace(/estatus-\w+/g, '');
    sel.classList.add('estatus-' + sel.value);
}

document.addEventListener('DOMContentLoaded', function () {
    const sel = document.getElementById('id_estatus');
    if (sel) actualizarColorEstatus(sel);
});