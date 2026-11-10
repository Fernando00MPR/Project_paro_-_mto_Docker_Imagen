/* lista_plan_extra.js
   Depende de: CSRF_MTO (definido en el template)
*/

// ── Modal calendario ──────────────────────────────────────────────────────────
let modalHuboCambio = false;

function abrirModal(pk, semana, anio) {
    modalHuboCambio = false;
    let url = '/mto/equipos/' + pk + '/modal/';
    const params = new URLSearchParams();
    if (anio) params.set('anio', anio);
    if (semana) params.set('semana', semana);
    const qs = params.toString();
    if (qs) url += '?' + qs;

    document.getElementById('modal-iframe').src = url;
    document.getElementById('modal-backdrop').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Clic en cualquier parte de la fila abre el modal — salvo si el clic fue
// sobre un botón, enlace, select o input (Ver/Editar/Eliminar, el selector
// de Responsable, etc.), que deben conservar su propio comportamiento.
function filaClickVer(e, pk, semana, anio) {
    if (e.target.closest('button, a, select, input, textarea')) return;
    abrirModal(pk, semana, anio);
}

function cerrarModal() {
    document.getElementById('modal-backdrop').style.display = 'none';
    document.getElementById('modal-iframe').src = '';
    document.body.style.overflow = '';
}

window.addEventListener('message', function(e) {
    
    if (e.data === 'hubo_cambio') {
        modalHuboCambio = true;
    } else if (e.data === 'cerrar_modal') {
        cerrarModal();
        // Solo recarga la tabla si de verdad se guardó/eliminó algo dentro
        // del modal — si solo se abrió a consultar el calendario, cerrar es
        // instantáneo en vez de forzar una recarga completa de la página.
        if (modalHuboCambio) {
            window.location.reload();
        }
    } else if (typeof e.data === 'string' && e.data.startsWith('cambiar_anio:')) {
        const parts = e.data.split(':');
        document.getElementById('modal-iframe').src = '/mto/equipos/' + parts[2] + '/modal/?anio=' + parts[1];
    }
});

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminar(url) {
    const modal = document.getElementById('modal-eliminar'), det = document.getElementById('modal-eliminar-detalle');
    
    document.getElementById('form-eliminar').action = url;
    det.hidden = true; det.textContent = '';
    modal.style.display = 'flex';
    // Cuánto historial se borra junto con la tarea (planes.eliminar_plan por AJAX): se avisa antes de confirmar
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
            if (!d || !d.registros) return;
            det.textContent = modal.dataset.txtHistorial.replace('{r}', d.registros).replace('{f}', d.fotos)
                .replace('{s}', d.seguimientos).replace('{fs}', d.fotos_seg);
            det.hidden = false;
        })
        .catch(() => {});
}

function cerrarModalEliminar() {
    document.getElementById('modal-eliminar').style.display = 'none';
}

document.getElementById('modal-eliminar').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminar();
});

// Avisos del Plan (los usa plan_movil.js): el componente común de base_menu.html.
function mostrarToast(msg, tipo) {
    if (typeof window.showToast === 'function') window.showToast(msg, tipo || 'success');
}

// ── Abrir directo una tarea (?abrir=<pk>), p. ej. desde el Backlog ─────────────
// En celular lo atiende plan_movil.js (abre el detalle móvil).
document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const pk = params.get('abrir');
    if (!pk || window.matchMedia('(max-width: 1023px)').matches) return;
    params.delete('abrir');
    history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    abrirModal(pk, params.get('semana') || '', params.get('anio') || '');
});

// ── Escape cierra modales ─────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Si el detalle del plan está abierto, él decide: pide confirmar si hay cambios sin guardar.
        const abierto = document.getElementById('modal-backdrop').style.display === 'flex';
        if (abierto) {
            try {
                const ventana = document.getElementById('modal-iframe').contentWindow;
                if (ventana && ventana.mcCerrarConConfirmacion) { ventana.mcCerrarConConfirmacion(); return; }
            } catch (err) { /* sin acceso: se cierra normal */ }
        }
        cerrarModal();
        cerrarModalEliminar();
    }
});
