/* lista_paros_movil.js — Tarjetas y bottom sheets de Paros en celular (≤767px).
   Reutiliza CSRF, i18n, showToast, abrirModalConAnimacion, cerrarModalConAnimacion
   (globales de base_menu.html) y modal/formElim (declarados por lista_paros.js,
   visibles aquí porque los scripts clásicos comparten un único scope de documento). */

// ── Focus trap genérico para las 3 hojas ──────────────────────────────────────
let focusTrapHandler = null;
let focusTrapDisparador = null;

function focusTrap(box) {
    focusTrapDisparador = document.activeElement;
    const focosables = box.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focosables.length) focosables[0].focus();

    focusTrapHandler = function (e) {
        if (e.key === 'Escape') {
            const backdrop = box.closest('.modal-backdrop');
            if (backdrop) cerrarModalConAnimacion(backdrop);
            return;
        }
        if (e.key !== 'Tab') return;
        const items = Array.from(focosables).filter(el => el.offsetParent !== null);
        if (!items.length) return;
        const primero = items[0], ultimo = items[items.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
            e.preventDefault(); ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault(); primero.focus();
        }
    };
    document.addEventListener('keydown', focusTrapHandler);
}

function liberarFocusTrap() {
    if (focusTrapHandler) document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
    if (focusTrapDisparador && document.body.contains(focusTrapDisparador)) {
        focusTrapDisparador.focus();
    }
    focusTrapDisparador = null;
}

// Evita que el transform del último frame de la animación de apertura se quede
// pegado para siempre (rompería el position:fixed del .dp-popover embebido en
// el sheet de Filtros) — mismo arreglo que ya existe en base_menu.html para
// modal-box-in, aplicado aquí a sheet-movil-in sin tocar ese archivo.
document.addEventListener('animationend', function (e) {
    if (e.animationName === 'sheet-movil-in') {
        e.target.style.animation = 'none';
    }
});

function abrirSheet(id, event) {
    const modal = document.getElementById(id);
    abrirModalConAnimacion(modal, event);
    const box = modal.querySelector('.modal-box');
    if (box) focusTrap(box);
}

function cerrarSheet(id, cb) {
    cerrarModalConAnimacion(id, cb);
    liberarFocusTrap();
}

// ── Sheet "⋯" más acciones ─────────────────────────────────────────────────────
function abrirSheetMas(event) {
    abrirSheet('sheet-mas', event);
}

// ── Sheet Filtros ──────────────────────────────────────────────────────────────
function abrirSheetFiltros(event) {
    abrirSheet('sheet-filtros', event);
}

function elegirTurnoMovil(btn) {
    document.querySelectorAll('.sf-seg').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    document.getElementById('mf-turno').value = btn.dataset.valor;
}

function toggleEstatusMovil(btn) {
    const activo = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', activo ? 'false' : 'true');
}

function atajoFecha(tipo) {
    const hoy = new Date();
    let desde, hasta;
    if (tipo === 'semana') {
        const dow = (hoy.getDay() || 7); // lunes=1..domingo=7
        desde = new Date(hoy); desde.setDate(hoy.getDate() - (dow - 1));
        hasta = new Date(hoy); hasta.setDate(desde.getDate() + 6);
    } else {
        hasta = new Date(hoy);
        desde = new Date(hoy); desde.setDate(hoy.getDate() - 30);
    }
    fijarFechaPicker('dp-fecha-desde-movil', desde);
    fijarFechaPicker('dp-fecha-hasta-movil', hasta);
}

function fijarFechaPicker(dpId, fecha) {
    const hidden = document.querySelector('#' + dpId + ' .dp-value');
    if (!hidden) return;
    const iso = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
    hidden.value = iso;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

function limpiarFiltrosMovil() {
    const url = new URL(window.location.href);
    ['fecha_desde', 'fecha_hasta', 'semana', 'turno', 'estatus', 'q', 'buscar', 'resp', 'equipo', 'page']
        .forEach(k => url.searchParams.delete(k));
    window.location.href = url.toString();
}

function aplicarFiltrosMovil() {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');

    const area = document.getElementById('mf-area');
    if (area) {
        if (area.value) url.searchParams.set('area', area.value);
        else url.searchParams.delete('area');
    }

    const fDesde = document.querySelector('#dp-fecha-desde-movil .dp-value').value;
    const fHasta = document.querySelector('#dp-fecha-hasta-movil .dp-value').value;
    if (fDesde) url.searchParams.set('fecha_desde', fDesde); else url.searchParams.delete('fecha_desde');
    if (fHasta) url.searchParams.set('fecha_hasta', fHasta); else url.searchParams.delete('fecha_hasta');

    const semana = document.getElementById('mf-semana').value.trim();
    if (semana) url.searchParams.set('semana', semana); else url.searchParams.delete('semana');

    const turno = document.getElementById('mf-turno').value;
    if (turno) url.searchParams.set('turno', turno); else url.searchParams.delete('turno');

    url.searchParams.delete('estatus');
    document.querySelectorAll('.sf-chip-multi[aria-pressed="true"]').forEach(b => {
        url.searchParams.append('estatus', b.dataset.valor);
    });

    const falla = document.getElementById('mf-falla').value.trim();
    if (falla) url.searchParams.set('q', falla); else url.searchParams.delete('q');

    const resp = document.getElementById('mf-responsable').value.trim();
    if (resp) url.searchParams.set('resp', resp); else url.searchParams.delete('resp');

    const equipo = document.getElementById('mf-equipo').value.trim();
    if (equipo) url.searchParams.set('equipo', equipo); else url.searchParams.delete('equipo');

    window.location.href = url.toString();
}

// ── Buscador único (debounce 250ms) ───────────────────────────────────────────
let _buscarMovilTimer = null;
function buscarMovil() {
    clearTimeout(_buscarMovilTimer);
    _buscarMovilTimer = setTimeout(() => {
        const url = new URL(window.location.href);
        const valor = document.getElementById('movil-buscar').value.trim();
        if (valor) url.searchParams.set('buscar', valor); else url.searchParams.delete('buscar');
        url.searchParams.delete('page');
        window.location.href = url.toString();
    }, 250);
}

// ── Chips de filtros activos ──────────────────────────────────────────────────
function removerChip(clave) {
    const url = new URL(window.location.href);
    clave.split(',').forEach(k => url.searchParams.delete(k));
    url.searchParams.delete('page');
    window.location.href = url.toString();
}

// ── Estatus desde la tarjeta (rota, misma semántica que el botón de escritorio) ──
function cambiarEstatusChipMovil(paroId, btn) {
    fetch(`/paros/estatus/${paroId}/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF, 'Content-Type': 'application/json' },
    })
        .then(r => r.json())
        .then(data => {
            if (!data.estatus) return;
            pintarChipEstatus(btn, data.estatus);
            showToast(i18n.estatusActualizado);
        })
        .catch(() => showToast(i18n.errorEstatus, 'error'));
}

const ESTATUS_SOFT = {
    rojo:     { bg: '#FBE4E2', color: '#A8322A', texto: () => i18n.Rechazado },
    amarillo: { bg: '#FCEFD6', color: '#8A5A08', texto: () => i18n.Pendiente },
    verde:    { bg: '#E3F3E9', color: '#22663F', texto: () => i18n.Aceptado },
};

function pintarChipEstatus(btn, estatus) {
    const s = ESTATUS_SOFT[estatus];
    if (!s) return;
    btn.style.background = s.bg;
    btn.style.color = s.color;
    btn.dataset.estatus = estatus;
    btn.innerHTML = '<span class="pc-dot"></span>' + s.texto();
    const card = btn.closest('.paro-card');
    if (card) card.dataset.estatus = estatus;
}

// ── Sheet Detalle ──────────────────────────────────────────────────────────────
window.sdParoIdActual = null;

function abrirSheetDetalle(card, event) {
    const d = card.dataset;
    window.sdParoIdActual = d.id;

    document.getElementById('sd-fecha').textContent = d.fecha;
    document.getElementById('sd-hora').textContent = d.hora;
    document.getElementById('sd-semana').textContent = `${i18n.semanaCorta || 'Sem'} ${d.semana}`;

    const turnoEl = document.getElementById('sd-turno');
    turnoEl.textContent = d.turnoLabel;
    turnoEl.className = 'badge pc-turno ' + (d.turno === '1' ? 'badge-t1' : 'badge-t2');

    document.getElementById('sd-falla').textContent = d.falla;
    document.getElementById('sd-equipo').textContent = d.equipo;
    document.getElementById('sd-responsable').textContent = d.responsable;
    document.getElementById('sd-tiempo').textContent = d.tiempo + ' min';
    document.getElementById('sd-hora-2').textContent = d.hora;
    document.getElementById('sd-comentarios').textContent = d.comentarios || i18n.sinComentarios || '—';

    const btnImg = document.getElementById('sd-btn-imagenes');
    const nFotos = parseInt(d.nfotos, 10) || 0;
    btnImg.style.display = nFotos ? 'flex' : 'none';
    document.getElementById('sd-btn-imagenes-txt').textContent = nFotos === 1
        ? (i18n.verUnaFoto || 'Ver 1 foto')
        : (i18n.verNFotos || 'Ver {n} fotos').replace('{n}', nFotos);

    const btnEditar = document.getElementById('sd-btn-editar');
    if (d.puedeEditar === '1') { btnEditar.href = d.urlEditar; btnEditar.style.display = 'flex'; }
    else { btnEditar.style.display = 'none'; }

    const btnEliminar = document.getElementById('sd-btn-eliminar');
    btnEliminar.style.display = d.puedeEliminar === '1' ? 'flex' : 'none';

    const puedeEstatus = d.puedeEstatus === '1';
    ['sd-btn-pendiente', 'sd-btn-aceptar', 'sd-btn-rechazar'].forEach(id => {
        document.getElementById(id).disabled = !puedeEstatus;
    });
    marcarEstatusSheet(d.estatus);

    abrirSheet('sheet-detalle', event);
}

function marcarEstatusSheet(estatus) {
    document.getElementById('sd-btn-pendiente').setAttribute('aria-pressed', estatus === 'amarillo' ? 'true' : 'false');
    document.getElementById('sd-btn-aceptar').setAttribute('aria-pressed', estatus === 'verde' ? 'true' : 'false');
    document.getElementById('sd-btn-rechazar').setAttribute('aria-pressed', estatus === 'rojo' ? 'true' : 'false');
}

function fijarEstatusMovil(nuevoEstatus) {
    const paroId = window.sdParoIdActual;
    if (!paroId) return;
    fetch(`/paros/estatus/${paroId}/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF, 'Content-Type': 'application/json' },
        body: JSON.stringify({ estatus: nuevoEstatus }),
    })
        .then(r => r.json())
        .then(data => {
            if (!data.estatus) return;
            marcarEstatusSheet(data.estatus);
            const card = document.querySelector(`.paro-card[data-id="${paroId}"]`);
            if (card) {
                const chip = card.querySelector('.pc-chip-estatus');
                if (chip) pintarChipEstatus(chip, data.estatus);
            }
            showToast(i18n.estatusActualizado);
        })
        .catch(() => showToast(i18n.errorEstatus, 'error'));
}

function eliminarDesdeSheet() {
    const card = document.querySelector(`.paro-card[data-id="${window.sdParoIdActual}"]`);
    if (!card || !card.dataset.urlEliminar) return;
    formElim.action = card.dataset.urlEliminar;
    cerrarSheet('sheet-detalle', () => abrirModalConAnimacion(modal));
}

// ── Cargar más (AJAX-append sobre la misma vista paginada) ────────────────────
function cargarMasParos() {
    const btn = document.getElementById('btn-cargar-mas');
    if (!btn) return;
    const siguiente = btn.dataset.nextPage;
    const url = new URL(window.location.href);
    url.searchParams.set('page', siguiente);

    fetch(url.toString())
        .then(r => r.text())
        .then(html => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const nuevasTarjetas = doc.querySelectorAll('#lista-cards-movil .paro-card');
            const contenedor = document.getElementById('lista-cards-movil');
            nuevasTarjetas.forEach(card => contenedor.appendChild(card));

            const total = contenedor.querySelectorAll('.paro-card').length;
            const spanMostrando = document.getElementById('movil-mostrando');
            if (spanMostrando) spanMostrando.textContent = `${i18n.mostrando || 'mostrando'} ${total}`;

            const btnNuevo = doc.getElementById('btn-cargar-mas');
            if (btnNuevo) btn.dataset.nextPage = btnNuevo.dataset.nextPage;
            else btn.remove();
        })
        .catch(() => showToast(i18n.errorCargarMas, 'error'));
}

document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btn-cargar-mas');
    if (btn) btn.addEventListener('click', cargarMasParos);

    // Cerrar las 3 hojas al tocar el fondo oscuro (fuera de la hoja).
    ['sheet-filtros', 'sheet-detalle', 'sheet-mas'].forEach(id => {
        const backdrop = document.getElementById(id);
        if (!backdrop) return;
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) cerrarSheet(backdrop);
        });
    });

    // Visor de fotos: deslizar a la izquierda / derecha cambia de foto
    // (lightboxSiguiente/Anterior y zoomLevel vienen de lista_paros.js).
    const img = document.getElementById('lightbox-img-principal');
    const zona = img && img.parentElement;
    if (!zona) return;
    let x0 = null, y0 = 0;
    zona.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1 || zoomLevel > 1) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    zona.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (lightboxImagenes.length > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) lightboxSiguiente(); else lightboxAnterior();
        }
    });
});


