/* inventario_escritorio.js — Inventario de refacciones, vista de escritorio (≥768px).
   Buscador, chips de estado, orden, menús (Importar/Exportar, ⋯ y acciones de fila),
   selector de columnas y confirmación de "Eliminar todas". Los modales de editar,
   categorías, fotos y eliminar siguen en lista_refacciones.js / _modales_refacciones.html. */

(function () {
    const raiz = document.getElementById('ive');
    if (!raiz) return;
    const $ = id => document.getElementById(id);
    const T = (window.IVE_CFG || {}).i18n || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);

    // ── Navegar con un filtro cambiado (siempre vuelve a la página 1) ──
    function ir(cambios) {
        const url = new URL(location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k] === '' || cambios[k] == null) url.searchParams.delete(k);
            else url.searchParams.set(k, cambios[k]);
        });
        url.searchParams.delete('page');
        location.assign(url);
    }

    // Buscador con espera de 250 ms
    const q = $('ive-q');
    let esperaQ;
    q.addEventListener('input', () => {
        clearTimeout(esperaQ);
        esperaQ = setTimeout(() => ir({ q: q.value.trim() }), 250);
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(esperaQ); ir({ q: q.value.trim() }); } });

    // Chips de estado y tarjeta "Requieren reabasto" (un clic en la activa la quita)
    raiz.querySelectorAll('[data-estatus]').forEach(b => b.addEventListener('click', () => {
        const activo = b.getAttribute('aria-pressed') === 'true';
        ir({ estatus_stock: activo && b.classList.contains('ive-kpi-reabasto') ? '' : b.dataset.estatus });
    }));

    // Orden por columna (Stock = urgencia de reabasto, Criticidad = críticas primero)
    raiz.querySelectorAll('.ive-th[data-orden]').forEach(b => b.addEventListener('click', () => ir({ orden: b.dataset.orden })));

    // Clic en el nombre = Editar
    raiz.addEventListener('click', e => {
        const a = e.target.closest('[data-editar]');
        if (!a) return;
        e.preventDefault();
        const editar = a.closest('tr').querySelector('.ive-editar');
        if (editar) editar.click();
    });

    // ── Menús desplegables (position: fixed para que la tabla no los recorte) ──
    let menuAbierto = null;
    function cerrarMenu(foco) {
        if (!menuAbierto) return;
        const { btn, menu } = menuAbierto;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        menuAbierto = null;
        if (foco) btn.focus();
    }
    function abrirMenu(btn, menu) {
        cerrarMenu(false);
        menu.hidden = false;
        const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
        let left = menu.classList.contains('ive-menu-der') ? r.right - w : r.left;
        left = Math.max(8, Math.min(left, innerWidth - w - 8));
        let top = r.bottom + 6;
        if (top + h > innerHeight - 8 && r.top - 6 - h > 8) top = r.top - 6 - h;   // sin espacio abajo: hacia arriba
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        btn.setAttribute('aria-expanded', 'true');
        menuAbierto = { btn, menu };
        const primero = menu.querySelector('[role="menuitem"]');
        if (primero) primero.focus();
    }
    raiz.querySelectorAll('.ive-menu-wrap').forEach(w => {
        const btn = w.querySelector('[aria-haspopup="menu"]'), menu = w.querySelector('.ive-menu');
        if (!btn || !menu) return;
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (menuAbierto && menuAbierto.menu === menu) cerrarMenu(false); else abrirMenu(btn, menu);
        });
        menu.addEventListener('click', e => { if (e.target.closest('[role="menuitem"]')) cerrarMenu(false); });
        menu.addEventListener('keydown', e => {
            const items = [...menu.querySelectorAll('[role="menuitem"]')], i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
            else if (e.key === 'Tab') cerrarMenu(false);
        });
    });
    document.addEventListener('click', e => { if (menuAbierto && !menuAbierto.menu.contains(e.target)) cerrarMenu(false); });
    window.addEventListener('resize', () => cerrarMenu(false));
    document.addEventListener('scroll', () => cerrarMenu(false), true);

    // ── Columnas visibles (localStorage columnas:inventario = lista de columnas ocultas) ──
    const CLAVE = 'columnas:inventario';
    const POR_DEFECTO = ['proveedor', 'costo', 'creado', 'modificado'];
    const panel = $('ive-cols'), btnCols = $('ive-cols-btn');
    const ops = [...panel.querySelectorAll('.ive-col-op')];
    const html = document.documentElement;
    let ocultas;
    try { const p = JSON.parse(localStorage.getItem(CLAVE)); ocultas = Array.isArray(p) ? p : POR_DEFECTO.slice(); }
    catch (e) { ocultas = POR_DEFECTO.slice(); }

    function pintarCols() {
        ops.forEach(o => {
            const c = o.dataset.col, fija = o.getAttribute('aria-disabled') === 'true';
            const visible = fija || ocultas.indexOf(c) === -1;
            o.setAttribute('aria-checked', String(visible));
            if (!fija) html.classList.toggle('ive-sin-' + c, !visible);
        });
        const txt = t('colsDe', { v: ops.length - ocultas.length, t: ops.length });
        $('ive-cols-n').textContent = txt;
        $('ive-cols-n2').textContent = txt;
    }
    function guardarCols() {
        try { localStorage.setItem(CLAVE, JSON.stringify(ocultas)); } catch (e) { /* sin almacenamiento */ }
        pintarCols();
    }
    ops.forEach(o => o.addEventListener('click', () => {
        if (o.getAttribute('aria-disabled') === 'true') return;
        const c = o.dataset.col, i = ocultas.indexOf(c);
        if (i === -1) ocultas.push(c); else ocultas.splice(i, 1);
        guardarCols();
    }));
    $('ive-cols-reset').addEventListener('click', () => { ocultas = POR_DEFECTO.slice(); guardarCols(); });
    function cerrarCols(foco) {
        if (panel.hidden) return;
        panel.hidden = true;
        btnCols.setAttribute('aria-expanded', 'false');
        if (foco) btnCols.focus();
    }
    btnCols.addEventListener('click', e => {
        e.stopPropagation();
        if (!panel.hidden) { cerrarCols(false); return; }
        cerrarMenu(false);
        panel.hidden = false;
        btnCols.setAttribute('aria-expanded', 'true');
        const primero = ops.find(o => o.getAttribute('aria-disabled') !== 'true');
        if (primero) primero.focus();
    });
    $('ive-cols-listo').addEventListener('click', () => cerrarCols(true));
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target)) cerrarCols(false); });
    pintarCols();

    // ── Confirmación "Eliminar todas" (hay que escribir la palabra) ──
    const fondoElim = $('ive-elim');
    if (fondoElim) {
        const inp = $('ive-elim-in'), ok = $('ive-elim-ok'), palabra = inp.dataset.palabra || 'ELIMINAR';
        const abrir = () => { inp.value = ''; ok.disabled = true; fondoElim.hidden = false; inp.focus(); };
        const cerrar = () => { fondoElim.hidden = true; $('ive-mas-btn').focus(); };
        $('ive-elim-todas-btn').addEventListener('click', abrir);
        $('ive-elim-no').addEventListener('click', cerrar);
        fondoElim.addEventListener('click', e => { if (e.target === fondoElim) cerrar(); });
        inp.addEventListener('input', () => { ok.disabled = inp.value.trim().toUpperCase() !== palabra.toUpperCase(); });
        fondoElim.querySelector('form').addEventListener('submit', e => { if (ok.disabled) e.preventDefault(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !fondoElim.hidden) cerrar(); });
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (menuAbierto) cerrarMenu(true);
        else if (!panel.hidden) cerrarCols(true);
    });
})();
