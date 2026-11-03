/* catalogos_movil.js — Vista de celular (≤767px) de los catálogos.
   Lo comparten fallas, equipos, responsables y moldes. Cada template define
   window.CM_CFG (tipo y textos traducidos). Las acciones reutilizan las
   funciones de escritorio (abrirModalAgregar/Editar, confirmarEliminar,
   confirmarLimpiar) a través de botones ocultos con el mismo onclick. */

(function () {
    const cfg = window.CM_CFG || {};
    const raiz = document.getElementById('cm-areas');
    if (!raiz) return;

    const CLAVE = 'cm-' + (cfg.tipo || 'catalogo') + '-abiertas';
    const normalizar = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

    const areas  = Array.from(raiz.querySelectorAll('.cm-area[data-total]:not(.cm-area-vacia)'));
    const vacias = Array.from(raiz.querySelectorAll('.cm-area-vacia'));

    raiz.querySelectorAll('.cm-item').forEach(li => { li.dataset.busqueda = normalizar(li.dataset.busqueda); });

    // ── Subtítulo "{total} fallas · {n} áreas" ──────────────────────────────
    const sub = document.getElementById('cm-subtitulo');
    if (sub) {
        const total = areas.reduce((s, a) => s + (+a.dataset.total || 0), 0);
        const nAreas = areas.length + vacias.length;
        let txt = plural(total, cfg.singular, cfg.plural);
        if (nAreas > 1) txt += ' · ' + plural(nAreas, cfg.area, cfg.areas);
        sub.textContent = txt;
    }

    // ── Abrir/cerrar tarjetas (estado recordado por página) ─────────────────
    let abiertas = null;
    try { abiertas = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { abiertas = null; }
    if (!Array.isArray(abiertas)) abiertas = areas.length ? [areas[0].dataset.areaId] : [];

    function guardar() {
        try { localStorage.setItem(CLAVE, JSON.stringify(abiertas)); } catch (e) { /* sin storage */ }
    }

    function fijarAbierta(area, abierta) {
        const btn = area.querySelector('.cm-area-toggle');
        const body = area.querySelector('.cm-area-body');
        if (btn) btn.setAttribute('aria-expanded', abierta ? 'true' : 'false');
        if (body) body.hidden = !abierta;
    }

    function aplicarEstado() {
        areas.forEach(a => fijarAbierta(a, abiertas.includes(a.dataset.areaId)));
    }
    aplicarEstado();

    window.cmToggleArea = function (btn) {
        const area = btn.closest('.cm-area');
        const id = area.dataset.areaId;
        const abrir = btn.getAttribute('aria-expanded') !== 'true';
        fijarAbierta(area, abrir);
        abiertas = abiertas.filter(x => x !== id);
        if (abrir) abiertas.push(id);
        guardar();
    };

    // ── Buscador global ─────────────────────────────────────────────────────
    const input = document.getElementById('cm-buscar');
    const sinRes = document.getElementById('cm-sin-resultados');
    let temporizador = null;

    function buscar() {
        const q = normalizar(input.value.trim());
        let hayAlguno = false;
        areas.forEach(area => {
            const items = area.querySelectorAll('.cm-item');
            let k = 0;
            items.forEach(li => {
                const ok = !q || li.dataset.busqueda.includes(q);
                li.hidden = !ok;
                if (ok) k++;
            });
            const badge = area.querySelector('.cm-badge');
            const n = +area.dataset.total || items.length;
            if (badge) badge.textContent = q ? (k + ' ' + cfg.de + ' ' + n) : n;
            area.hidden = !!q && k === 0;
            if (k) hayAlguno = true;
        });
        vacias.forEach(v => { v.hidden = !!q; });
        if (q) {
            areas.forEach(a => { if (!a.hidden) fijarAbierta(a, true); });
        } else {
            aplicarEstado();
        }
        if (sinRes) {
            sinRes.hidden = !q || hayAlguno;
            sinRes.textContent = cfg.sinResultados + ' “' + input.value.trim() + '”';
        }
    }
    if (input) {
        input.addEventListener('input', () => {
            clearTimeout(temporizador);
            temporizador = setTimeout(buscar, 250);
        });
    }

    // ── Hojas inferiores (focus trap, Escape, toque en el fondo) ────────────
    let trapHandler = null, disparador = null;

    function abrirHoja(id, event) {
        const modal = document.getElementById(id);
        disparador = (event && event.currentTarget) || document.activeElement;
        abrirModalConAnimacion(modal, event);
        const box = modal.querySelector('.modal-box');
        const focos = () => Array.from(box.querySelectorAll('button, a[href], input, select'))
            .filter(el => !el.hidden && el.offsetParent !== null);
        const primero = focos()[0];
        if (primero) primero.focus();
        trapHandler = function (e) {
            if (e.key === 'Escape') { cerrarHoja(id); return; }
            if (e.key !== 'Tab') return;
            const f = focos();
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        };
        document.addEventListener('keydown', trapHandler);
    }

    function cerrarHoja(id, devolverFoco = true) {
        cerrarModalConAnimacion(id);
        if (trapHandler) document.removeEventListener('keydown', trapHandler);
        trapHandler = null;
        if (devolverFoco && disparador && document.body.contains(disparador)) disparador.focus();
        disparador = null;
    }
    window.cmCerrarHoja = cerrarHoja;

    document.querySelectorAll('.cm-hoja').forEach(hoja => {
        hoja.addEventListener('click', e => { if (e.target === hoja) cerrarHoja(hoja.id); });
    });

    // Igual que en lista_paros_movil.js: no dejar pegado el transform final.
    document.addEventListener('animationend', function (e) {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) {
            e.target.style.animation = 'none';
        }
    });

    window.cmAbrirMas = function (event) { abrirHoja('cm-sheet-mas', event); };

    // ── Hoja de acciones del área ───────────────────────────────────────────
    let areaActual = null;

    window.cmAbrirAccionesArea = function (btn, event) {
        areaActual = btn.closest('.cm-area');
        const n = +areaActual.dataset.total || 0;
        const nombre = areaActual.dataset.areaNombre;
        document.getElementById('cm-area-titulo').textContent = nombre;
        document.getElementById('cm-area-sub').textContent = plural(n, cfg.singular, cfg.plural);

        const agregar = document.getElementById('cm-area-agregar');
        if (agregar) agregar.hidden = !areaActual.querySelector('.cm-agregar');

        const exportar = document.getElementById('cm-area-exportar');
        if (exportar) exportar.href = areaActual.dataset.urlExportar;

        const limpiar = document.getElementById('cm-area-limpiar');
        if (limpiar) {
            limpiar.hidden = !(areaActual.dataset.puedeLimpiar === '1' && n > 0);
            document.getElementById('cm-area-limpiar-desc').textContent =
                cfg.limpiarDesc.replace('{n}', n);
        }
        const sep = document.getElementById('cm-area-sep');
        if (sep && limpiar) sep.hidden = limpiar.hidden;
        abrirHoja('cm-sheet-area', event);
    };

    window.cmAreaAgregar = function () {
        const btn = areaActual && areaActual.querySelector('.cm-agregar');
        cerrarHoja('cm-sheet-area', false);
        if (btn) btn.click();
    };

    window.cmAreaLimpiar = function (event) {
        const a = areaActual;
        cerrarHoja('cm-sheet-area', false);
        if (!a) return;
        confirmarLimpiar(event, a.dataset.areaId, a.dataset.areaNombre, cfg.tipo);
        document.getElementById('modal-limpiar-msg').textContent = cfg.limpiarConfirm
            .replace('{n}', a.dataset.total).replace('{area}', a.dataset.areaNombre);
    };

    // ── Hoja "⋮" de la fila: Editar / Eliminar ──────────────────────────────
    let itemActual = null;

    window.cmAbrirAccionesItem = function (btn, event) {
        itemActual = btn.closest('.cm-item');
        document.getElementById('cm-item-titulo').textContent = itemActual.querySelector('.cm-nombre').textContent;
        document.getElementById('cm-item-sub').textContent = itemActual.querySelector('.cm-codigo').textContent;
        document.getElementById('cm-item-editar').hidden = !itemActual.querySelector('.cm-accion-editar');
        document.getElementById('cm-item-eliminar').hidden = !itemActual.querySelector('.cm-accion-eliminar');
        abrirHoja('cm-sheet-item', event);
    };

    function disparar(selector) {
        const btn = itemActual && itemActual.querySelector(selector);
        cerrarHoja('cm-sheet-item', false);
        if (btn) btn.click();
    }
    window.cmItemEditar = () => disparar('.cm-accion-editar');
    window.cmItemEliminar = () => disparar('.cm-accion-eliminar');

    // Tocar la fila abre Editar directamente.
    window.cmEditarFila = function (main) {
        const btn = main.closest('.cm-item').querySelector('.cm-accion-editar');
        if (btn) btn.click();
    };
})();
