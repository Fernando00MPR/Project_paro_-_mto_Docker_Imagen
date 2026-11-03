/* plan_escritorio.js — Plan de mantenimiento, vista de escritorio (≥768px).
   Depende de: PE_I18N, PE_CFG (template), abrirModal/confirmarEliminar (plan_lista.js), #pe-carga (json_script).
   El celular lo atiende plan_movil.js; aquí no se toca #pm-movil. */
(function () {
    'use strict';
    const raiz = document.getElementById('pe-raiz');
    if (!raiz) return;
    const I = window.PE_I18N || {}, CFG = window.PE_CFG || {};
    const $ = id => document.getElementById(id);
    const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && k in o ? o[k] : m));
    const esMovil = () => window.matchMedia('(max-width: 767px)').matches;
    const hhmm = m => Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    const mes = d => new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');

    function avisar(msg) {
        if (typeof window.showToast === 'function') window.showToast(msg);
        else if (typeof window.mostrarToast === 'function') window.mostrarToast(msg);
    }
    try {   // avisos que sobreviven a una recarga (asignar responsable, eliminar todos)
        const pend = sessionStorage.getItem('pe-toast');
        if (pend) { sessionStorage.removeItem('pe-toast'); setTimeout(() => avisar(pend), 300); }
    } catch (e) { /* sin storage */ }

    // ── Semana ISO ──────────────────────────────────────────────────────────
    function semanaIso(d) {
        const f = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        f.setUTCDate(f.getUTCDate() + 4 - (f.getUTCDay() || 7));
        const ini = new Date(Date.UTC(f.getUTCFullYear(), 0, 1));
        return { anio: f.getUTCFullYear(), semana: Math.ceil(((f - ini) / 86400000 + 1) / 7) };
    }
    const semanasDelAnio = a => semanaIso(new Date(a, 11, 28)).semana;
    function lunesDe(anio, sem) {   // lunes UTC de la semana ISO
        const c4 = new Date(Date.UTC(anio, 0, 4));
        const l1 = new Date(c4); l1.setUTCDate(c4.getUTCDate() - ((c4.getUTCDay() || 7) - 1));
        const r = new Date(l1); r.setUTCDate(l1.getUTCDate() + (sem - 1) * 7);
        return r;
    }
    function rango(sem, anio) {
        const a = lunesDe(anio, sem), b = new Date(a); b.setUTCDate(a.getUTCDate() + 6);
        return a.getUTCDate() + ' – ' + b.getUTCDate() + ' ' + mes(b);
    }
    const hoy = semanaIso(new Date());

    const url0 = new URL(window.location.href);
    let semana = parseInt(raiz.dataset.semana, 10) || 0;
    let anio = parseInt(raiz.dataset.anio, 10) || hoy.anio;

    // En escritorio siempre se trabaja sobre una semana (la actual por defecto)
    if (!esMovil() && !url0.searchParams.get('semana') && url0.searchParams.get('todo') !== '1') {
        url0.searchParams.set('semana', hoy.semana);
        url0.searchParams.set('anio', hoy.anio);
        window.location.replace(url0);
        return;
    }

    function ir(cambios) {
        const u = new URL(window.location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k] === '' || cambios[k] == null) u.searchParams.delete(k);
            else u.searchParams.set(k, cambios[k]);
        });
        if (!('page' in cambios)) u.searchParams.delete('page');
        window.location.assign(u);
    }
    function irSemana(s, a) { ir({ semana: s, anio: a, todo: '' }); }
    function vecina(paso) {
        let s = semana + paso, a = anio;
        if (s < 1) { a -= 1; s = semanasDelAnio(a); }
        else if (s > semanasDelAnio(a)) { a += 1; s = 1; }
        return { s: s, a: a };
    }

    // ── Selector de semana (‹ centro ›) ─────────────────────────────────────
    const btnCentro = $('pe-sem-btn'), pop = $('pe-sem-pop');
    $('pe-sem-prev').addEventListener('click', () => { const v = vecina(-1); irSemana(v.s, v.a); });
    $('pe-sem-next').addEventListener('click', () => { const v = vecina(1); irSemana(v.s, v.a); });
    const btnHoy = $('pe-hoy');
    if (semana && (semana !== hoy.semana || anio !== hoy.anio)) {
        btnHoy.hidden = false;
        btnHoy.addEventListener('click', () => irSemana(hoy.semana, hoy.anio));
    }

    const btnTodo = $('pe-todo');
    btnTodo.addEventListener('click', () => {
        if (btnTodo.getAttribute('aria-pressed') === 'true') irSemana(hoy.semana, hoy.anio);
        else ir({ todo: '1', semana: '', anio: '', resp: ''});
    });

    let anioPop = anio;
    // Nº de OTs por semana (globo de cada semana): se piden por año y se guardan
    const conteos = {};
    function pedirConteos(a) {
        if (conteos[a] || !CFG.urlConteoSemanas) return;
        conteos[a] = 'pidiendo';
        const u = new URL(CFG.urlConteoSemanas, window.location.href);
        u.searchParams.set('anio', a);
        if (CFG.area) u.searchParams.set('area', CFG.area);
        fetch(u, { credentials: 'same-origin' }).then(r => r.json()).then(d => {
            conteos[a] = d;
            if (pop.hidden || anioPop !== a) return;
            const act = document.activeElement, s = act && act.dataset ? act.dataset.s || act.dataset.a : null;
            pintarPop();
            const b = s && (pop.querySelector('[data-s="' + s + '"]') || pop.querySelector('[data-a="' + s + '"]'));
            if (b && pop.contains(act)) b.focus();
        }).catch(() => { delete conteos[a]; });
    }
    function pintarPop() {
        const n = semanasDelAnio(anioPop);
        const c = typeof conteos[anioPop] === 'object' ? conteos[anioPop] : {};
        pedirConteos(anioPop);
        let h = '<div class="pe-sp-anio"><button type="button" data-a="-1" aria-label="' + I.anioAnt + '">‹</button><b aria-live="polite">' + anioPop +
            '</b><button type="button" data-a="1" aria-label="' + I.anioSig + '">›</button></div><div class="pe-sp-grid">';
        for (let i = 1; i <= n; i++) {
            const cls = (i === semana && anioPop === anio ? ' sel' : '') + (i === hoy.semana && anioPop === hoy.anio ? ' hoy' : '');
            const k = c[i] || 0, ots = k ? ' · ' + (k === 1 ? I.ots1 : fmt(I.otsN, { n: k })) : '';
            h += '<button type="button" class="pe-sp-s' + cls + '" data-s="' + i + '" title="' + rango(i, anioPop) + ots + '">' + i +
                (k ? '<span class="pe-sp-n" aria-hidden="true">' + k + '</span>' : '') + '</button>';
        }
        pop.innerHTML = h + '</div>';
        const sel = pop.querySelector('.sel') || pop.querySelector('.hoy') || pop.querySelector('.pe-sp-s');
        return sel;
    }
    pedirConteos(anio);   // listos antes de abrir el calendario
    
    function abrirPop() {
        anioPop = anio;
        const f = pintarPop();
        pop.hidden = false; btnCentro.setAttribute('aria-expanded', 'true');
        if (f) f.focus();
    }
    function cerrarPop(devolverFoco) {
        if (pop.hidden) return;
        pop.hidden = true; btnCentro.setAttribute('aria-expanded', 'false');
        if (devolverFoco) btnCentro.focus();
    }
    btnCentro.addEventListener('click', () => (pop.hidden ? abrirPop() : cerrarPop(true)));
    pop.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.a) { anioPop += parseInt(b.dataset.a, 10); const f = pintarPop(); pop.querySelector('[data-a="' + b.dataset.a + '"]').focus(); return; }
        if (b.dataset.s) irSemana(parseInt(b.dataset.s, 10), anioPop);
    });
    pop.addEventListener('keydown', e => {
        const g = Array.from(pop.querySelectorAll('.pe-sp-s')), i = g.indexOf(document.activeElement);
        if (i < 0) return;
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[e.key];
        if (d) { e.preventDefault(); const j = Math.min(g.length - 1, Math.max(0, i + d)); g[j].focus(); }
    });

    // ── Frecuencia (control segmentado) ─────────────────────────────────────
    const seg = $('pe-frec'), ops = Array.from(seg.querySelectorAll('[role="radio"]'));
    ops.forEach((op, i) => {
        op.tabIndex = op.getAttribute('aria-checked') === 'true' ? 0 : -1;
        op.addEventListener('click', () => { if (op.getAttribute('aria-checked') !== 'true') ir({ frecuencia: op.dataset.frec }); });
        op.addEventListener('keydown', e => {
            const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            ops[(i + d + ops.length) % ops.length].click();
        });
    });
    if (!ops.some(o => o.tabIndex === 0)) ops[0].tabIndex = 0;

    // ── Búsqueda (debounce 250 ms; vive en la URL) ──────────────────────────
    const q = $('pe-q'); let tq;
    q.addEventListener('input', () => {
        clearTimeout(tq);
        tq = setTimeout(() => {
            try { sessionStorage.setItem('pe-foco-q', '1'); } catch (e) { /* sin storage */ }
            ir({ q: q.value.trim() });
        }, 250);
    });
    try {
        if (sessionStorage.getItem('pe-foco-q')) {
            sessionStorage.removeItem('pe-foco-q');
            q.focus(); q.setSelectionRange(q.value.length, q.value.length);
        }
    } catch (e) { /* sin storage */ }

    // ── Descargas (Exportar plan / Exportar Excel de la semana) ─────────────
    function nombreDe(r, def) {
        const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(r.headers.get('Content-Disposition') || '');
        return m ? decodeURIComponent(m[1]) : def;
    }
    async function bajar(url, def) {
        const r = await fetch(url, { credentials: 'same-origin' });
        const ct = r.headers.get('Content-Type') || '';
        if (!r.ok || ct.indexOf('text/html') === 0 || ct.indexOf('json') !== -1) throw new Error('descarga');
        const nombre = nombreDe(r, def), blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        return nombre;
    }
    async function conBoton(btn, tarea) {
        if (btn.getAttribute('aria-busy') === 'true') return;
        const ico = btn.querySelector('svg'), html = ico ? ico.outerHTML : '';
        btn.setAttribute('aria-busy', 'true');
        if (ico) ico.outerHTML = '<span class="pe-giro" aria-hidden="true"></span>';
        try { avisar(fmt(I.descargado, { archivo: await tarea() })); }
        catch (e) { avisar(I.errorArchivo); }
        finally {
            btn.removeAttribute('aria-busy');
            const g = btn.querySelector('.pe-giro'); if (g && html) g.outerHTML = html;
        }
    }
    const expPlan = $('pe-exp-plan');
    const bajarPlan = () => bajar(expPlan.dataset.url, 'plan_' + anio + '.xlsx');
    expPlan.addEventListener('click', () => conBoton(expPlan, bajarPlan));

    const expSem = $('pe-exp-sem');
    if (expSem) expSem.addEventListener('click', () => conBoton(expSem, async () => {
        const inicio = expSem.dataset.url, base = inicio.split('?')[0].replace(/\/$/, '');
        const r = await fetch(inicio, { credentials: 'same-origin' });
        const d = await r.json();
        if (!d.token) throw new Error(d.error || 'token');
        for (let i = 0; i < 150; i++) {
            await new Promise(ok => setTimeout(ok, 800));
            const st = await (await fetch(base + '/status/' + d.token + '/', { credentials: 'same-origin' })).json();
            if (st.status === 'ready') return bajar(base + '/download/' + d.token + '/', 'semana_' + semana + '.xlsm');
            if (st.status === 'error') throw new Error(st.error);
        }
        throw new Error('tiempo');
    }));

    // ── Selector de columnas ────────────────────────────────────────────────
    const COLS = ['col-rutina', 'col-actividad', 'col-plan', 'col-duracion', 'col-frecuencia', 'col-sinicio', 'col-proximo',
                  'col-resp', 'col-area', 'col-nombre-equipo', 'col-locacion', 'col-tipo', 'col-prioridad', 'col-estatus'];
    const VISIBLES = ['col-rutina', 'col-actividad', 'col-plan', 'col-duracion', 'col-frecuencia', 'col-proximo', 'col-resp'];
    const tabla = raiz.querySelector('.pe-tabla'), picker = $('col-picker'), btnCols = $('pe-cols-btn');
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('pe_cols') || '{}') || {}; } catch (e) { prefs = {}; }
    const visible = c => (c in prefs ? !!prefs[c] : VISIBLES.indexOf(c) !== -1);
    function aplicarCols() {
        let n = 1, total = 1;
        COLS.forEach(c => {
            const input = picker.querySelector('[data-col="' + c + '"] input');
            if (!input) return;
            total++;
            const v = visible(c);
            if (v) n++;
            input.checked = v;
            tabla.querySelectorAll('.' + c).forEach(el => { el.style.display = v ? '' : 'none'; });
        });
        $('pe-cols-n').textContent = fmt(I.columnasDe, { n: n, t: total });
        tabla.classList.add('pe-listo');
    }
    picker.addEventListener('change', e => {
        const l = e.target.closest('[data-col]'); if (!l) return;
        prefs[l.dataset.col] = e.target.checked;
        try { localStorage.setItem('pe_cols', JSON.stringify(prefs)); } catch (er) { /* sin storage */ }
        aplicarCols();
    });
    $('pe-cols-reset').addEventListener('click', () => {
        prefs = {};
        try { localStorage.removeItem('pe_cols'); } catch (er) { /* sin storage */ }
        aplicarCols();
    });
    function cerrarCols(foco) { if (picker.hidden) return; picker.hidden = true; btnCols.setAttribute('aria-expanded', 'false'); if (foco) btnCols.focus(); }
    btnCols.addEventListener('click', () => {
        const abre = picker.hidden;
        picker.hidden = !abre; btnCols.setAttribute('aria-expanded', String(abre));
        if (abre) picker.querySelector('input:not([disabled])').focus();
    });
    $('pe-cols-listo').addEventListener('click', () => cerrarCols(true));
    aplicarCols();

    // ── Menús flotantes por fila (Responsable y ⋯) ──────────────────────────
    let lista = null, origen = null;
    function cerrarLista(foco) {
        if (!lista) return;
        lista.remove(); lista = null;
        if (origen) { origen.setAttribute('aria-expanded', 'false'); if (foco) origen.focus(); origen = null; }
    }
    function abrirLista(btn, items, rol) {
        cerrarLista(false);
        lista = document.createElement('div');
        lista.className = 'pe-lista'; lista.setAttribute('role', rol);
        items.forEach(it => {
            const b = document.createElement('button');
            b.type = 'button'; b.setAttribute('role', rol === 'listbox' ? 'option' : 'menuitem');
            if (it.sel) b.setAttribute('aria-selected', 'true');
            if (it.cls) b.className = it.cls;
            b.innerHTML = it.html; b.addEventListener('click', () => { cerrarLista(true); it.fn(); });
            lista.appendChild(b);
        });
        raiz.appendChild(lista);
        const r = btn.getBoundingClientRect(), p = raiz.getBoundingClientRect();
        let x = r.left - p.left, y = r.bottom - p.top + 4;
        if (x + lista.offsetWidth > p.width) x = p.width - lista.offsetWidth - 8;
        if (r.bottom + lista.offsetHeight > window.innerHeight - 8 && r.top > lista.offsetHeight) y = r.top - p.top - lista.offsetHeight - 4;
        lista.style.left = Math.max(0, x) + 'px'; lista.style.top = y + 'px';
        origen = btn; btn.setAttribute('aria-expanded', 'true');
        (lista.querySelector('[aria-selected="true"]') || lista.querySelector('button')).focus();
        lista.addEventListener('keydown', e => {
            const bs = Array.from(lista.querySelectorAll('button')), i = bs.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
        });
    }
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const inic = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const respPorArea = () => { 
        try { 
            return JSON.parse($('pm-responsables').textContent) || {}; 
        } 
        catch (e) { 
            return {}; 
        } 
    };

    function asignar(plan, id) {
        return fetch('/mto/equipos/' + plan + '/asignar/' + semana + '/' + anio + '/', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': CFG.csrf },
            body: 'responsable=' + encodeURIComponent(id)
        }).then(r => {
            if (!r.ok) throw new Error('resp');
            try { sessionStorage.setItem('pe-toast', I.responsableOk); } catch (e) { /* sin storage */ }
            window.location.reload();
        }).catch(() => avisar(I.errorResp));
    }
    raiz.addEventListener('click', e => {
        const br = e.target.closest('.pe-resp');
        if (br) {
            e.stopPropagation();
            if (br.disabled) return;   // sin permiso de Editar ni Validar: solo se ve
            if (lista && origen === br) { cerrarLista(true); return; }
            const rs = respPorArea()[br.dataset.area] || [];
            const items = [{ html: esc(I.sinAsignar), sel: !br.dataset.resp, fn: () => asignar(br.dataset.plan, '') }].concat(
                rs.map(r => {
                    const n = (r.nombre + ' ' + r.apellidos).trim();
                    return { html: '<span class="pe-av">' + esc(inic(n)) + '</span><span>' + esc(n) + '</span>',
                             sel: String(r.pk) === br.dataset.resp, fn: () => asignar(br.dataset.plan, r.pk) };
                }));
            if (!rs.length) items.push({ html: '<i>' + esc(I.sinResponsables) + '</i>', fn: () => {} });
            abrirLista(br, items, 'listbox');
            return;
        }
        const mas = e.target.closest('.pe-mas');
        if (mas) {
            e.stopPropagation();
            if (lista && origen === mas) { cerrarLista(true); return; }
            const items = [{ html: esc(I.verDetalle), fn: () => abrirModal(mas.dataset.plan, String(semana), String(anio)) }];
            if (mas.dataset.eliminar) items.push({ html: esc(I.eliminar), cls: 'pe-peligro', fn: () => confirmarEliminar(mas.dataset.eliminar) });
            abrirLista(mas, items, 'menu');
        }
    });
    document.addEventListener('click', e => {
        if (lista && !lista.contains(e.target)) cerrarLista(false);
        if (!pop.hidden && !pop.contains(e.target) && !btnCentro.contains(e.target)) cerrarPop(false);
        if (!picker.hidden && !picker.contains(e.target) && !btnCols.contains(e.target)) cerrarCols(false);
    });

    // ── Filtro "sin responsable" activo (viene del modal Tiempo por persona) ─
    const filtroResp = url0.searchParams.get('resp');
    if (filtroResp) {
        const barra = raiz.querySelector('.pe-tabla-t');
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'pe-btn pe-btn-chico'; chip.style.marginLeft = '10px';
        chip.innerHTML = esc(filtroResp === 'ninguno' ? I.sinAsignar : filtroResp) + ' ✕';
        chip.setAttribute('aria-label', I.quitarFiltro);
        chip.addEventListener('click', () => ir({ resp: '' }));
        barra.after(chip);
    }

    // ── Modal: Eliminar todos los planes ────────────────────────────────────
    const btnElim = $('pe-elim-todos'), fondoElim = $('pe-elim-fondo');
    if (btnElim) {
        const inp = $('pe-elim-in'), ok = $('pe-elim-ok');
        const abrirElim = () => { inp.value = ''; ok.disabled = true; fondoElim.hidden = false; inp.focus(); };
        const cerrarElim = () => { fondoElim.hidden = true; btnElim.focus(); };
        btnElim.addEventListener('click', abrirElim);
        $('pe-elim-cancel').addEventListener('click', cerrarElim);
        fondoElim.addEventListener('mousedown', e => { if (e.target === fondoElim) cerrarElim(); });
        inp.addEventListener('input', () => { ok.disabled = inp.value !== 'ELIMINAR'; });
        const exp = $('pe-elim-exp');
        exp.addEventListener('click', () => conBoton(expPlan, bajarPlan));
        exp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); exp.click(); } });
        $('pe-elim-form').addEventListener('submit', e => {
            if (inp.value !== 'ELIMINAR') { e.preventDefault(); return; }
            try { sessionStorage.setItem('pe-toast', fmt(I.eliminados, { n: btnElim.dataset.total })); } catch (er) { /* sin storage */ }
        });
        fondoElim._cerrar = cerrarElim;
    }

    // ── Indicador "Tiempo total" y modal "Tiempo por persona" ───────────────
    let datos = null;
    try { datos = JSON.parse($('pe-carga').textContent); } catch (e) { datos = null; }
    const COLORES = ['#3D5BD9', '#2E8B57', '#D9A23B', '#8E5BD9', '#1F9EB0', '#C75B8E', '#7A8B3D', '#5B6FA8'];
    const tareasTxt = n => (n === 1 ? I.tarea1 : fmt(I.tareas, { n: n }));
    const personasTxt = n => (n === 1 ? I.persona1 : fmt(I.personas, { n: n }));
    const pct = (a, b) => (b ? Math.round(a * 100 / b) : 0);
    const kpi = $('pe-kpi-tiempo');

    const colorDe = id => COLORES[Math.max(0, datos.personas.findIndex(p => p.id === id)) % COLORES.length];

    function segmentos() {
        const s = datos.personas.map((p, i) => ({ nombre: p.nombre, min: p.min, color: COLORES[i % COLORES.length] }));
        if (datos.sin.n) s.push({ nombre: I.sinAsignar, min: datos.sin.min, sin: true });
        return s.filter(x => x.min > 0);
    }
    if (kpi && datos) {
        $('pe-tiempo-v').textContent = hhmm(datos.total_min);
        $('pe-tiempo-s').textContent = tareasTxt(datos.total_n);
        $('pe-tiempo-dist').innerHTML = segmentos().map(s =>
            '<i' + (s.sin ? ' class="sin"' : ' style="background:' + s.color + '"') + ' style="width:' + (s.min * 100 / datos.total_min) + '%"></i>').join('');
        // Cada segmento lleva su propio style: se unifica color + ancho
        Array.from($('pe-tiempo-dist').children).forEach((el, i) => {
            const s = segmentos()[i];
            el.style.width = (s.min * 100 / datos.total_min) + '%';
            if (!s.sin) el.style.background = s.color;
        });
    }

    const fondoT = $('pe-t-fondo'), btnT = $('pe-abrir-tiempo');
    let ordenPor = 'tiempo', abiertos = null;
    function grupo(g, sin, idx, total) {
        const cap = datos.capacidad * 60;
        const p = sin ? pct(g.min, datos.total_min) : pct(g.min, cap);
        const clase = sin ? ' sin' : (p > 120 ? ' sobre2' : p > 100 ? ' sobre' : '');
        const clave = sin ? 'sin' : 'p' + g.id, abierto = abiertos.has(clave);
        const nombre = sin ? I.sinAsignar : g.nombre;
        let h = '<div class="pe-g' + clase + '" data-k="' + clave + '"><button type="button" class="pe-g-cab" aria-expanded="' + abierto + '">' +
            '<span class="pe-g-av"' + (sin ? '' : ' style="background:' + colorDe(g.id) + ';color:#fff"') + '>' + (sin ? '?' : esc(inic(g.nombre))) + '</span>' +
            '<span class="pe-g-n"><b>' + esc(nombre) + '</b><span>' + tareasTxt(g.n) + '</span></span>' +
            '<span class="pe-g-cap"><i style="width:' + Math.min(p, 100) + '%"></i></span>' +
            '<span class="pe-g-h"><b>' + hhmm(g.min) + '</b><span>' + (sin ? p + '% ' + I.delTotal : p + '% ' + fmt(I.deCap, { c: datos.capacidad })) + '</span>' +
            (!sin && p > 100 ? '<em>' + I.sobrecargado + '</em>' : '') + '</span>' +
            '<svg class="pe-g-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>';
        if (abierto) {
            const lim = sin ? 4 : g.tareas.length;
            h += '<div class="pe-g-tareas">' + g.tareas.slice(0, lim).map(t =>
                '<div class="pe-g-t"><a href="#" data-pk="' + t.pk + '">' + esc(t.codigo) + '</a><span class="act" title="' + esc(t.actividad) + '">' + esc(t.actividad) +
                '</span><span class="est ' + esc(t.estado) + '">' + esc(t.estado === 'completada' ? I.completada : t.estado === 'sin_registro' ? I.sinRegistro : t.estado === 'reagendada' ? I.reagendada : I.pendiente) +
                '</span><span class="dur">' + hhmm(t.min) + '</span></div>').join('');
            if (sin) {
                h += '<div class="pe-g-acc">' + (g.n > lim ? '<button type="button" class="pe-link" data-ver-sin>' + esc(fmt(I.verSin, { n: g.n })) + ' ›</button>' : '') +
                    '<button type="button" class="pe-btn-rojo-b" data-ver-sin>' + esc(fmt(I.asignarSem, { n: semana })) + ' ›</button></div>';
            }
            h += '</div>';
        }
        return h + '</div>';
    }
    function pintarTiempo() {
        const asig = datos.total_min - datos.sin.min, nAsig = datos.total_n - datos.sin.n;
        $('pe-t-semana').textContent = fmt(I.semana, { n: semana, a: anio });
        $('pe-t-res').innerHTML =
            '<div class="pe-t-r"><small>' + I.total.toUpperCase() + '</small><b>' + hhmm(datos.total_min) + '</b><span>' + tareasTxt(datos.total_n) + '</span></div>' +
            '<div class="pe-t-r"><small>' + I.asignado.toUpperCase() + '</small><b>' + hhmm(asig) + '</b><span>' + fmt(I.tareasDe, { n: nAsig, p: datos.personas.length }) + '</span></div>' +
            '<div class="pe-t-r' + (datos.sin.n ? ' mal' : '') + '"><small>' + I.sinAsignar.toUpperCase() + '</small><b>' + hhmm(datos.sin.min) + '</b><span>' +
            tareasTxt(datos.sin.n) + ' · ' + pct(datos.sin.min, datos.total_min) + '% ' + I.delTotal + '</span></div>';
        const segs = segmentos();
        $('pe-t-bar').innerHTML = segs.map(s => '<i title="' + esc(s.nombre) + ': ' + hhmm(s.min) + '" style="width:' + (s.min * 100 / datos.total_min) + '%;' + (s.sin ? '' : 'background:' + s.color) + '" class="' + (s.sin ? 'pe-d-sin' : '') + '"></i>').join('');
        $('pe-t-bar').setAttribute('aria-label', I.distribucion + ': ' + segs.map(s => s.nombre + ' ' + hhmm(s.min)).join(', '));
        $('pe-t-ley').innerHTML = '<span class="pe-t-cap">' + esc(fmt(I.capRef, { c: datos.capacidad })) + '</span>';

        const ps = datos.personas.slice().sort(ordenPor === 'nombre' ? (a, b) => a.nombre.localeCompare(b.nombre, lang) : (a, b) => b.min - a.min || a.nombre.localeCompare(b.nombre, lang));
        let h = '';
        if (datos.sin.n) h += grupo(datos.sin, true);
        ps.forEach(p => { h += grupo(p, false); });
        $('pe-t-lista').innerHTML = h || '<div class="pe-t-vacio">' + I.sinDatos + '</div>';
        $('pe-t-nota').textContent = fmt(I.grupos, { k: ps.length + (datos.sin.n ? 1 : 0) });
        $('pe-t-ord-t').setAttribute('aria-pressed', String(ordenPor === 'tiempo'));
        $('pe-t-ord-n').setAttribute('aria-pressed', String(ordenPor === 'nombre'));
    }
    function abrirTiempo() {
        if (!datos) return;
        const mayor = datos.personas.slice().sort((a, b) => b.min - a.min)[0];
        abiertos = new Set(mayor ? ['p' + mayor.id] : (datos.sin.n ? ['sin'] : []));
        pintarTiempo();
        fondoT.hidden = false; kpi.classList.add('abierto'); btnT.setAttribute('aria-expanded', 'true');
        $('pe-t-listo').focus();
    }
    function cerrarTiempo(foco) {
        if (fondoT.hidden) return;
        fondoT.hidden = true; kpi.classList.remove('abierto'); btnT.setAttribute('aria-expanded', 'false');
        if (foco !== false) btnT.focus();
    }
    if (btnT) {
        btnT.addEventListener('click', abrirTiempo);
        $('pe-t-x').addEventListener('click', () => cerrarTiempo());
        $('pe-t-listo').addEventListener('click', () => cerrarTiempo());
        fondoT.addEventListener('mousedown', e => { if (e.target === fondoT) cerrarTiempo(); });
        const navSem = paso => {
            const v = vecina(paso);
            try { sessionStorage.setItem('pe-abrir-tiempo', '1'); } catch (e) { /* sin storage */ }
            irSemana(v.s, v.a);
        };
        $('pe-t-prev').addEventListener('click', () => navSem(-1));
        $('pe-t-next').addEventListener('click', () => navSem(1));
        $('pe-t-ord-t').addEventListener('click', () => { ordenPor = 'tiempo'; pintarTiempo(); });
        $('pe-t-ord-n').addEventListener('click', () => { ordenPor = 'nombre'; pintarTiempo(); });
        $('pe-t-lista').addEventListener('click', e => {
            const cab = e.target.closest('.pe-g-cab');
            if (cab) {
                const k = cab.parentNode.dataset.k;
                if (abiertos.has(k)) abiertos.delete(k); else abiertos.add(k);
                pintarTiempo();
                const nuevo = $('pe-t-lista').querySelector('[data-k="' + k + '"] .pe-g-cab'); if (nuevo) nuevo.focus();
                return;
            }
            const a = e.target.closest('a[data-pk]');
            if (a) { e.preventDefault(); cerrarTiempo(false); abrirModal(a.dataset.pk, String(semana), String(anio)); return; }
            if (e.target.closest('[data-ver-sin]')) { cerrarTiempo(false); ir({ resp: 'ninguno' }); }
        });
        $('pe-t-exp').addEventListener('click', () => {
            const u = new URL(CFG.urlTiempoXlsx, window.location.origin);
            u.searchParams.set('semana', semana); u.searchParams.set('anio', anio);
            if (CFG.area) u.searchParams.set('area', CFG.area);
            const f = url0.searchParams.get('frecuencia'); if (f) u.searchParams.set('frecuencia', f);
            conBoton($('pe-t-exp'), () => bajar(u.toString(), 'tiempo_personas_S' + semana + '.xlsx'));
        });
        try {   // se cambió de semana desde el modal: se vuelve a abrir sobre la nueva
            if (sessionStorage.getItem('pe-abrir-tiempo')) { sessionStorage.removeItem('pe-abrir-tiempo'); abrirTiempo(); }
        } catch (e) { /* sin storage */ }
    }

        // ── Menú "Opciones" del encabezado ──────────────────────────────────────
    const btnOpc = $('pe-opc-btn'), menuOpc = $('pe-opc-menu');
    function cerrarOpc(foco) {
        if (menuOpc.hidden) return;
        menuOpc.hidden = true; btnOpc.setAttribute('aria-expanded', 'false');
        if (foco) btnOpc.focus();
    }
    btnOpc.addEventListener('click', () => {
        const abre = menuOpc.hidden;
        menuOpc.hidden = !abre; btnOpc.setAttribute('aria-expanded', String(abre));
        if (abre) menuOpc.querySelector('[role="menuitem"]').focus();
    });
    menuOpc.addEventListener('click', () => cerrarOpc(false));
    menuOpc.addEventListener('keydown', e => {
        const it = Array.from(menuOpc.querySelectorAll('[role="menuitem"]')), i = it.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
    });
    document.addEventListener('click', e => {
        if (!menuOpc.hidden && !menuOpc.contains(e.target) && !btnOpc.contains(e.target)) cerrarOpc(false);
    });

    // ── Teclado: Escape cierra lo que esté arriba; Tab queda dentro del modal ─
    function atrapar(fondo, e) {
        const f = Array.from(fondo.querySelectorAll('button:not([disabled]), a[href], a[role="button"], input:not([disabled])')).filter(x => x.offsetParent);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    document.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            if (!fondoT.hidden) atrapar(fondoT, e);
            else if (fondoElim && !fondoElim.hidden) atrapar(fondoElim, e);
            return;
        }
        if (e.key !== 'Escape') return;
        if (!fondoT.hidden) { e.stopPropagation(); cerrarTiempo(); }
        else if (fondoElim && !fondoElim.hidden) { e.stopPropagation(); fondoElim._cerrar(); }
        else if (!menuOpc.hidden) cerrarOpc(true);
        else if (lista) cerrarLista(true);
        else if (!pop.hidden) cerrarPop(true);
        else if (!picker.hidden) cerrarCols(true);
    }, true);
})();
