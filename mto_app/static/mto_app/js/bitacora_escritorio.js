/* bitacora_escritorio.js — Bitácora de mantenimiento, escritorio (≥768px).
   Depende de: BD_CFG, BD_I18N (template). El modal nuevo (#bdm-fondo) es solo de escritorio; el celular usa su formulario.
   Reutiliza de bitacora.js: verImagenesBitacora y confirmarEliminarBitacora. */
(function () {
    'use strict';
    const fondo = document.getElementById('bdm-fondo'), raiz = document.getElementById('bd-raiz');
    if (!fondo || !raiz) return;
    const $ = id => document.getElementById(id);
    const CFG = window.BD_CFG || {}, I = window.BD_I18N || {};
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && k in o ? o[k] : m));
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'success'); };
    const F = { act: $('bdm-act'), pend: $('bdm-pend'), area: $('bdm-area'), equipo: $('bdm-equipo'), resp: $('bdm-resp'), resp2: $('bdm-resp2') };
    const fechaIn = document.querySelector('#dp-bdm-fecha .dp-value');
    let modo = 'nuevo', idEdit = '', hayPend = true, respSel = '', resp2Sel = '', existentes = [], quitadas = [], nuevas = [];
    
    // Área automática: la del menú lateral (o la del registro al editar); el campo no se puede cambiar
    const areaActual = () => CFG.area || (document.getElementById('selector-area-mto') || {}).value || F.area.value;
    F.area.classList.add('bdm-bloq'); F.area.tabIndex = -1; F.area.setAttribute('aria-readonly', 'true');
    
    let inicial = '', guardando = false, abrio = null;

    // ── Fechas (ISO) ──
    const pad = n => String(n).padStart(2, '0');
    const aIso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const hoyIso = () => CFG.hoy || aIso(new Date());
    const diaIso = n => { const d = deIso(hoyIso()); d.setDate(d.getDate() + n); return aIso(d); };
    function semanaIso(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        const x = new Date(Date.UTC(y, m - 1, d));
        x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
        return Math.ceil(((x - Date.UTC(x.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
    }
    const getFecha = () => fechaIn.value;
    function setFecha(iso) { fechaIn.value = iso || ''; fechaIn.dispatchEvent(new Event('change', { bubbles: true })); }
    function pintarFecha() {
        const f = getFecha();
        $('bdm-sem').textContent = f ? 'S' + semanaIso(f) : '';
        $('bdm-quick').querySelectorAll('button').forEach(b =>
            b.setAttribute('aria-pressed', String(f === (b.dataset.q === 'hoy' ? diaIso(0) : diaIso(-1)))));
        error('fecha', '');
    }
    fechaIn.addEventListener('change', pintarFecha);
    $('bdm-quick').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) setFecha(b.dataset.q === 'hoy' ? diaIso(0) : diaIso(-1));
    });

    // ── Errores por campo ──
    const CAMPOS = { actividad: F.act, pendiente: F.pend, area: F.area, equipo: $('bdm-combo-equipo'),
                     responsable: $('bdm-combo-resp'), fecha: document.querySelector('#dp-bdm-fecha .dp-control') };
    CAMPOS.responsable2 = $('bdm-combo-resp2');

    function error(clave, msg) {
        const e = $('bdm-err-' + clave);
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
        const c = CAMPOS[clave];
        if (c) c.classList.toggle('err', !!msg);
    }
    const limpiarErrores = () => ['actividad', 'pendiente', 'area', 'fecha', 'equipo', 'responsable', 'responsable2', 'imagenes', 'general'].forEach(k => error(k, ''));

    // ── Contadores y "¿Quedó algo pendiente?" Sí / No ──
    function contadores() {
        $('bdm-cnt-act').textContent = F.act.value.length + ' / 300';
        $('bdm-cnt-pend').textContent = hayPend ? F.pend.value.length + ' / 200' : '';
    }
    F.act.addEventListener('input', () => { contadores(); error('actividad', ''); });
    F.pend.addEventListener('input', () => { contadores(); error('pendiente', ''); });
    function pintarSino() {
        $('bdm-sino').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.v === 'si') === hayPend)));
        $('bdm-pend-wrap').hidden = !hayPend;
        $('bdm-sinpend').hidden = hayPend;
        contadores();
    }
    $('bdm-sino').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        hayPend = b.dataset.v === 'si';
        pintarSino(); error('pendiente', '');
    });
    F.area.addEventListener('change', () => { error('area', ''); ayudaEquipo(); });

    // ── Cambios sin guardar ──
    const firma = () => JSON.stringify([F.act.value, hayPend ? F.pend.value : '', hayPend, F.area.value, getFecha(),
                                        F.equipo.value.trim(), respSel, resp2Sel, existentes.map(x => x.id), quitadas, nuevas.length]);

    // ── Abrir / cerrar ──
    function pintarTodo() {
        limpiarErrores(); pintarSino(); pintarCombos(); pintarImagenes(); pintarFecha();
        $('bdm-ayuda-equipo').innerHTML = '';
    }
    function mostrar(origen) {
        abrio = origen || document.activeElement;
        $('bdm-conf').hidden = true;
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        F.act.focus();
    }
    function abrirNuevo(origen) {
        modo = 'nuevo'; idEdit = '';
        F.act.value = ''; F.pend.value = ''; hayPend = true;
        F.area.value = areaActual();
        setFecha(hoyIso());
        F.equipo.value = ''; F.resp.value = ''; respSel = ''; F.resp2.value = ''; resp2Sel = '';
        existentes = []; quitadas = []; nuevas = [];
        $('bdm-titulo').textContent = I.tituloNuevo;
        $('bdm-sub').textContent = I.subNuevo;
        $('bdm-guardar').textContent = I.guardarRegistro;
        pintarTodo();
        inicial = firma();
        mostrar(origen);
    }
    async function abrirEditar(fila, origen) {
        const d = fila.dataset;
        modo = 'editar'; idEdit = d.id;
        F.act.value = d.actividad || ''; F.pend.value = d.pendiente || ''; hayPend = !!d.pendiente;
        F.area.value = d.area;
        setFecha(d.fechaIso);
        F.equipo.value = d.equipo || ''; respSel = d.responsable || ''; F.resp.value = respSel;
        F.equipo.value = d.equipo || ''; respSel = d.responsable || ''; F.resp.value = respSel;
        resp2Sel = d.responsable2 || ''; F.resp2.value = resp2Sel;
        existentes = []; quitadas = []; nuevas = [];
        $('bdm-titulo').textContent = I.tituloEditar;
        $('bdm-sub').textContent = fmt(I.subEditar, { fecha: d.creado });
        $('bdm-guardar').textContent = I.guardarCambios;
        pintarTodo();
        inicial = firma();
        mostrar(origen);
        ayudaEquipo();
        try {
            const r = await fetch(CFG.urlImagenesBase + d.id + '/imagenes/', { credentials: 'same-origin' });
            const j = await r.json();
            const sinCambios = firma() === inicial;
            existentes = j.imagenes || [];
            pintarImagenes();
            if (sinCambios) inicial = firma();
        } catch (e) { /* sin imágenes */ }
    }
    function cerrarYa() {
        fondo.hidden = true;
        $('bdm-conf').hidden = true;
        document.body.style.overflow = '';
        nuevas.forEach(n => URL.revokeObjectURL(n.url));
        if (abrio && abrio.focus && document.contains(abrio)) abrio.focus();
    }
    function intentarCerrar() {
        if (firma() !== inicial) { $('bdm-conf').hidden = false; $('bdm-conf-seguir').focus(); }
        else cerrarYa();
    }
    $('bdm-x').addEventListener('click', intentarCerrar);
    $('bdm-cancelar').addEventListener('click', intentarCerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) intentarCerrar(); });
    $('bdm-conf-seguir').addEventListener('click', () => { $('bdm-conf').hidden = true; F.act.focus(); });
    $('bdm-conf-descartar').addEventListener('click', cerrarYa);

    
    // ── Combobox de equipo y responsable ──
    const iniciales = n => { const p = n.trim().split(/\s+/); return ((p[0] || '').charAt(0) + (p[1] || '').charAt(0)).toUpperCase(); };
    const fechaCorta = iso => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(deIso(iso));
    const recorte = (t, n) => (t.length > n ? t.slice(0, n).trim() + '…' : t);

    function crearCombo(o) {
        let items = [], activo = -1, tq = null, pedido = 0;
        const ul = o.lista, inp = o.input;
        const cerrar = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); activo = -1; };
        function pintar() {
            const q = inp.value.trim();
            let h = items.map((it, i) => '<li role="option" data-i="' + i + '"' + (i === activo ? ' class="activa"' : '') + '>' + o.item(it) + '</li>').join('');
            if (o.libre && q && !items.some(it => it.nombre.toLowerCase() === q.toLowerCase())) {
                h += '<li role="option" data-libre="1">' + esc(fmt(I.usarTexto, { texto: q })) + '</li>';
            }
            ul.innerHTML = h || '<li class="vacio">' + esc(I.sinResultados) + '</li>';
            ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
        }
        async function buscar() {
            const mio = ++pedido;
            try {
                const r = await fetch(o.url + '?q=' + encodeURIComponent(inp.value.trim()) + '&area_id=' + encodeURIComponent(F.area.value), { credentials: 'same-origin' });
                const d = await r.json();
                if (mio !== pedido) return;
                items = d; activo = -1; pintar();
            } catch (e) { items = []; pintar(); }
        }
        const elegirActivo = () => {
            const q = inp.value.trim();
            if (activo >= 0 && items[activo]) o.elegir(items[activo]);
            else if (o.libre && q) o.elegirLibre(q);
            cerrar();
        };
        inp.addEventListener('input', () => { o.alEscribir(); clearTimeout(tq); tq = setTimeout(buscar, 200); });
        inp.addEventListener('focus', buscar);
        inp.addEventListener('blur', () => setTimeout(() => { cerrar(); if (o.alSalir) o.alSalir(); }, 150));
        inp.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (ul.hidden) { buscar(); return; }
                const n = items.length;
                if (n) { activo = (activo + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; pintar(); }
            } else if (e.key === 'Enter' && !ul.hidden) { e.preventDefault(); elegirActivo(); }
            else if (e.key === 'Escape' && !ul.hidden) { e.stopPropagation(); cerrar(); }
        });
        ul.addEventListener('mousedown', e => {
            e.preventDefault();
            const li = e.target.closest('li[role="option"]');
            if (!li) return;
            if (li.dataset.libre) o.elegirLibre(inp.value.trim()); else o.elegir(items[+li.dataset.i]);
            cerrar();
        });
    }
    function pintarCombos() {
        $('bdm-x-equipo').hidden = !F.equipo.value.trim();
        const av = $('bdm-av-resp');
        av.hidden = !respSel; av.textContent = respSel ? iniciales(respSel) : '';
        $('bdm-x-resp').hidden = !respSel && !F.resp.value.trim();
        const av2 = $('bdm-av-resp2');
        av2.hidden = !resp2Sel; av2.textContent = resp2Sel ? iniciales(resp2Sel) : '';
        $('bdm-x-resp2').hidden = !resp2Sel && !F.resp2.value.trim();
    }
    let ayudaPedido = 0;
    async function ayudaEquipo() {
        const caja = $('bdm-ayuda-equipo'), eq = F.equipo.value.trim(), mio = ++ayudaPedido;
        if (!eq) { caja.innerHTML = ''; return; }
        try {
            const u = CFG.urlUltimo + '?equipo=' + encodeURIComponent(eq) + '&area=' + encodeURIComponent(F.area.value) + (idEdit ? '&excluir=' + idEdit : '');
            const d = await (await fetch(u, { credentials: 'same-origin' })).json();
            if (mio !== ayudaPedido) return;
            if (!d.existe) { caja.innerHTML = ''; return; }
            const f = fechaCorta(d.fecha);
            caja.innerHTML = d.pendiente
                ? '<div class="bdm-aviso">' + esc(fmt(I.avisoPendiente, { fecha: f, texto: recorte(d.pendiente, 70) })) + '</div>'
                : esc(fmt(I.ayudaUltimo, { fecha: f, resp: d.responsable || '—' }));
        } catch (e) { caja.innerHTML = ''; }
    }
    crearCombo({
        input: F.equipo, lista: $('bdm-lista-equipo'), url: CFG.urlBuscarEquipos, libre: true,
        item: it => '<span>' + esc(it.nombre) + '</span><small>' + esc(it.descripcion || '') + '</small>',
        alEscribir: () => { error('equipo', ''); pintarCombos(); },
        elegir: it => { F.equipo.value = it.nombre; pintarCombos(); ayudaEquipo(); },
        elegirLibre: t => { F.equipo.value = t; pintarCombos(); ayudaEquipo(); },
        alSalir: ayudaEquipo
    });
    crearCombo({
        input: F.resp, lista: $('bdm-lista-resp'), url: CFG.urlBuscarResponsables, libre: false,
        item: it => '<span class="bdm-combo-av" style="width:24px;height:24px;font-size:10px">' + esc(iniciales(it.nombre)) + '</span><span>' + esc(it.nombre) + '</span><small>' + esc(it.descripcion || '') + '</small>',
        alEscribir: () => { respSel = ''; error('responsable', ''); pintarCombos(); },
        elegir: it => { respSel = it.nombre; F.resp.value = it.nombre; pintarCombos(); }
    });
        crearCombo({
        input: F.resp2, lista: $('bdm-lista-resp2'), url: CFG.urlBuscarResponsables, libre: false,
        item: it => '<span class="bdm-combo-av" style="width:24px;height:24px;font-size:10px">' + esc(iniciales(it.nombre)) + '</span><span>' + esc(it.nombre) + '</span><small>' + esc(it.descripcion || '') + '</small>',
        alEscribir: () => { resp2Sel = ''; error('responsable2', ''); pintarCombos(); },
        elegir: it => {
            if (respSel && it.nombre.toLowerCase() === respSel.toLowerCase()) { F.resp2.value = ''; error('responsable2', I.errResp2Igual); pintarCombos(); return; }
            resp2Sel = it.nombre; F.resp2.value = it.nombre; error('responsable2', ''); pintarCombos();
        }
    });
    $('bdm-x-resp2').addEventListener('click', () => { resp2Sel = ''; F.resp2.value = ''; pintarCombos(); F.resp2.focus(); });


    $('bdm-x-equipo').addEventListener('click', () => { F.equipo.value = ''; pintarCombos(); ayudaEquipo(); F.equipo.focus(); });
    $('bdm-x-resp').addEventListener('click', () => { respSel = ''; F.resp.value = ''; pintarCombos(); F.resp.focus(); });

    // ── Imágenes (máx. 2: las ya guardadas + las nuevas) ──
    const totalImgs = () => existentes.length + nuevas.length;
    function pintarImagenes() {
        const max = CFG.maxImagenes || 2;
        let h = existentes.map(x => '<div class="bdm-img"><img src="' + esc(x.url) + '" alt=""><button type="button" data-q-ex="' + x.id + '" aria-label="' + esc(I.quitarImagen) + '">✕</button></div>').join('')
              + nuevas.map((n, i) => '<div class="bdm-img"><img src="' + n.url + '" alt=""><button type="button" data-q-nu="' + i + '" aria-label="' + esc(I.quitarImagen) + '">✕</button></div>').join('');
        for (let i = totalImgs(); i < max; i++) {
            h += '<button type="button" class="bdm-add" data-add><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' + esc(I.agregar) + '</button>';
        }
        $('bdm-imgs').innerHTML = h;
        $('bdm-cnt-img').textContent = totalImgs() + ' / ' + max;
    }
    function agregarArchivos(lista) {
        error('imagenes', '');
        for (const f of Array.from(lista)) {
            if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > 5 * 1024 * 1024) { error('imagenes', I.soloImagenes); continue; }
            if (totalImgs() >= (CFG.maxImagenes || 2)) { error('imagenes', fmt(I.maxImagenes, { n: CFG.maxImagenes || 2 })); break; }
            nuevas.push({ file: f, url: URL.createObjectURL(f) });
        }
        pintarImagenes();
    }
    $('bdm-imgs').addEventListener('click', e => {
        const ex = e.target.closest('[data-q-ex]'), nu = e.target.closest('[data-q-nu]');
        if (ex) { const id = +ex.dataset.qEx; existentes = existentes.filter(x => x.id !== id); quitadas.push(id); pintarImagenes(); }
        else if (nu) { const [q] = nuevas.splice(+nu.dataset.qNu, 1); URL.revokeObjectURL(q.url); pintarImagenes(); }
        else if (e.target.closest('[data-add]')) $('bdm-file').click();
    });
    $('bdm-file').addEventListener('change', e => { agregarArchivos(e.target.files); e.target.value = ''; });
    $('bdm-imgs').addEventListener('dragover', e => { e.preventDefault(); $('bdm-imgs').classList.add('arrastrando'); });
    $('bdm-imgs').addEventListener('dragleave', () => $('bdm-imgs').classList.remove('arrastrando'));
    $('bdm-imgs').addEventListener('drop', e => { e.preventDefault(); $('bdm-imgs').classList.remove('arrastrando'); agregarArchivos(e.dataTransfer.files); });
    fondo.addEventListener('paste', e => {
        const fs = Array.from((e.clipboardData || {}).files || []).filter(f => f.type.indexOf('image/') === 0);
        if (fs.length) { e.preventDefault(); agregarArchivos(fs); }
    });

    // ── Validar y guardar ──
    function validar() {
        limpiarErrores();
        let primero = null;
        const falla = (k, m, el) => { error(k, m); if (!primero) primero = el; };
        if (!F.act.value.trim()) falla('actividad', I.errActividad, F.act);
        if (hayPend && !F.pend.value.trim()) falla('pendiente', I.errPendiente, F.pend);
        if (!F.area.value) falla('area', I.errArea, F.area);
        const f = getFecha();
        if (!f) falla('fecha', I.errFecha, CAMPOS.fecha); else if (f > hoyIso()) falla('fecha', I.errFutura, CAMPOS.fecha);
        if (!F.equipo.value.trim()) falla('equipo', I.errEquipo, F.equipo);
        if (!respSel) falla('responsable', I.errResp, F.resp);
        if (F.resp2.value.trim() && !resp2Sel) falla('responsable2', I.errResp2, F.resp2);
        else if (resp2Sel && respSel && resp2Sel.toLowerCase() === respSel.toLowerCase()) falla('responsable2', I.errResp2Igual, F.resp2);
        if (primero) { primero.focus(); return false; }
        return true;
    }
    async function guardar() {
        if (guardando || !validar()) return;
        guardando = true;
        const btn = $('bdm-guardar'), txt = btn.textContent;
        btn.disabled = true; btn.textContent = I.guardando;
        const cab = { 'X-CSRFToken': CFG.csrf };
        try {
            for (const id of quitadas) await fetch(CFG.urlEliminarImagenBase + id + '/eliminar/', { method: 'POST', credentials: 'same-origin', headers: cab });
            quitadas = [];
            const fd = new FormData();
            fd.append('area', F.area.value); fd.append('fecha', getFecha()); fd.append('equipo', F.equipo.value.trim());
            fd.append('actividad_realizada', F.act.value.trim()); fd.append('hay_pendiente', hayPend ? 'si' : 'no');
            fd.append('pendiente', hayPend ? F.pend.value.trim() : ''); fd.append('responsable', respSel); fd.append('responsable2', resp2Sel);
            nuevas.forEach(n => fd.append('imagenes', n.file, n.file.name));
            const r = await fetch(CFG.urlGuardar + (modo === 'editar' ? idEdit + '/' : ''), { method: 'POST', credentials: 'same-origin', headers: cab, body: fd });
            const d = await r.json();
            if (!r.ok || !d.ok) {
                const errs = d.errores || {};
                Object.keys(errs).forEach(k => error(k, errs[k]));
                if (!Object.keys(errs).length) error('general', d.error || I.errorGuardar);
                return;
            }
            inicial = firma();
            cerrarYa();
            toast(I.toastGuardado);
            refrescar(d.id);
        } catch (e) {
            error('general', I.errorGuardar);
        } finally {
            guardando = false; btn.disabled = false; btn.textContent = txt;
        }
    }
    $('bdm-guardar').addEventListener('click', guardar);

    // ── Refrescar la tabla sin recargar la página y resaltar el registro ──
    async function refrescar(id) {
        try {
            const doc = new DOMParser().parseFromString(await (await fetch(location.href, { credentials: 'same-origin' })).text(), 'text/html');
            ['.bd-kpis', '.bd-seg', '.bd-tabla tbody', '.bd-pie > span:first-child', '.bd-pag'].forEach(sel => {
                const n = doc.querySelector('#bd-raiz ' + sel), o = raiz.querySelector(sel);
                if (n && o) o.replaceWith(n);
            });
            const fila = $('bd-fila-' + id);
            if (fila) { fila.classList.add('bd-nueva'); fila.scrollIntoView({ block: 'nearest' }); setTimeout(() => fila.classList.remove('bd-nueva'), 2200); }
        } catch (e) { window.location.reload(); }
    }

    // ── Lista: filtros en la URL, orden, clic en fila, botones de la fila ──
    function ir(c) {
        const u = new URL(window.location.href);
        Object.keys(c).forEach(k => { if (c[k] === '' || c[k] == null) u.searchParams.delete(k); else u.searchParams.set(k, c[k]); });
        u.searchParams.delete('page');
        window.location.assign(u);
    }
    let tq2 = null, tr2 = null, rangoPend = false;
    raiz.addEventListener('input', e => {
        if (e.target.id !== 'bd-q') return;
        clearTimeout(tq2);
        tq2 = setTimeout(() => {
            try { sessionStorage.setItem('bd-foco-q', '1'); } catch (er) { /* sin storage */ }
            ir({ q: e.target.value.trim() });
        }, 250);
    });
    try {
        if (sessionStorage.getItem('bd-foco-q')) {
            sessionStorage.removeItem('bd-foco-q');
            const q = $('bd-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
        }
    } catch (e) { /* sin storage */ }
    raiz.addEventListener('click', e => {
        const s = e.target.closest('[data-pend]');
        if (s) { ir({ pendiente: s.dataset.pend }); return; }
        if (e.target.closest('#bd-orden')) { ir({ orden: new URL(window.location.href).searchParams.get('orden') === 'fecha' ? '' : 'fecha' }); return; }
        const nuevo = e.target.closest('#bd-nuevo');
        if (nuevo) { abrirNuevo(nuevo); return; }
        const tr = e.target.closest('tr.bd-fila');
        if (tr && CFG.puedeEditar && !e.target.closest('button, a')) abrirEditar(tr, tr);
    });
    const calAbierto = () => !!document.querySelector('.dpr-popover.dpr-abierto');
    function aplicarRango() {
        if (!rangoPend || calAbierto()) return;
        rangoPend = false;
        const d = raiz.querySelector('.dpr-desde-value'), h = raiz.querySelector('.dpr-hasta-value');
        if (d && h) ir({ rango: 'rango', desde: d.value, hasta: h.value });
    }
    raiz.addEventListener('change', e => {
        if (!e.target.matches('.dpr-desde-value, .dpr-hasta-value')) return;
        rangoPend = true; clearTimeout(tr2); tr2 = setTimeout(aplicarRango, 150);
    });
    ['click', 'keyup'].forEach(ev => document.addEventListener(ev, () => setTimeout(aplicarRango, 0)));
    window.bdEditar = (e, id) => { const fila = $('bd-fila-' + id); if (fila) abrirEditar(fila, e.currentTarget); };
    window.bdEliminar = (e, id) => {
        const fila = $('bd-fila-' + id);
        if (fila) confirmarEliminarBitacora(e, fila.dataset.eliminar, fmt(I.eliminarTxt, { fecha: fila.dataset.fecha, equipo: fila.dataset.equipo || '—' }));
    };

    // ── Teclado: Escape cierra lo de más arriba; Ctrl+Enter guarda; Tab queda dentro ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') {
            if (fondo.querySelector('.bdm-lista:not([hidden])') || document.querySelector('.dp-popover.dp-abierto')) return;
            e.stopPropagation();
            if (!$('bdm-conf').hidden) { $('bdm-conf').hidden = true; F.act.focus(); } else intentarCerrar();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(); return; }
        if (e.key !== 'Tab') return;
        const zona = !$('bdm-conf').hidden ? $('bdm-conf') : fondo;
        const f = Array.from(zona.querySelectorAll('button:not([disabled]), input:not([hidden]), textarea, select, [tabindex="0"]')).filter(x => x.offsetParent);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }, true);
})();
