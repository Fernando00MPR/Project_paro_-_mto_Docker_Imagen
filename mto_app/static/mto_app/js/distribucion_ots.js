/* distribucion_ots.js — modal "Distribución de OTs por semana" del Plan de mantenimiento (escritorio, 36D).
   Depende de: PE_CFG {urlDistribucion, area} (plan/lista.html), #dot-i18n (plan/_distribucion_ots.html) y
   data-area-nombre de #pe-raiz. Se abre con [data-abrir-distribucion] (menú Opciones). Pide las OTs del año a
   mto:distribucion_ots y dibuja leyenda, 4 datos, gráfica semanal (barra Total de fondo con Completadas /
   Validadas / Pendientes desde la base) y el detalle de la semana elegida. ← → cambian de semana; Esc cierra. */
(function () {
    'use strict';
    const fondo = document.getElementById('dot-fondo');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const CFG = window.PE_CFG || {};
    const T = JSON.parse($('dot-i18n').textContent);
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    const num1 = new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fDia = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const fecha = (iso, dias) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + (dias || 0)); return fDia.format(d).replace('.', ''); };
    const ALTO = 196;   // px de la barra más alta (el resto de los 220 px es para el número de arriba)
    const nOts = n => (n === 1 ? T.ot1 : t('nOts', { n: n }));
    const areaNombre = ($('pe-raiz') || { dataset: {} }).dataset.areaNombre || '';

    function semanaIso(d) {
        const f = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        f.setUTCDate(f.getUTCDate() + 4 - (f.getUTCDay() || 7));
        const ini = new Date(Date.UTC(f.getUTCFullYear(), 0, 1));
        return { anio: f.getUTCFullYear(), semana: Math.ceil(((f - ini) / 86400000 + 1) / 7) };
    }
    const hoy = semanaIso(new Date());
    const cache = {};
    let anio = hoy.anio, datos = null, sel = 0, abrio = null, pedido = 0;

    const esActual = s => anio === hoy.anio && s === hoy.semana;
    const esFutura = s => anio > hoy.anio || (anio === hoy.anio && s > hoy.semana);
    function urlPlan(semana, q) {   // el Plan en esa semana (y filtrado por código si viene)
        const u = new URL(window.location.href);
        ['todo', 'page', 'resp', 'q'].forEach(k => u.searchParams.delete(k));
        u.searchParams.set('semana', semana);
        u.searchParams.set('anio', anio);
        if (q) u.searchParams.set('q', q);
        return u.pathname + u.search;
    }

    // ── Datos del año (se guardan por año) ──
    async function cargar(a, elegir) {
        const mio = ++pedido;
        anio = a;
        $('dot-anio-n').textContent = a;
        $('dot-anio-next').disabled = a >= hoy.anio;
        $('dot-cuerpo').classList.add('cargando');
        try {
            if (!cache[a]) {
                const u = new URL(CFG.urlDistribucion, window.location.href);
                u.searchParams.set('anio', a);
                if (CFG.area) u.searchParams.set('area', CFG.area);
                const r = await fetch(u, { credentials: 'same-origin' });
                if (!r.ok) throw new Error('http ' + r.status);
                cache[a] = await r.json();
            }
            if (mio !== pedido) return;
            datos = cache[a];
            const S = datos.semanas;
            // Año actual: la semana de hoy; otro año: la de mayor carga
            sel = elegir || (a === hoy.anio ? hoy.semana : S.reduce((m, s) => (s.t > m.t ? s : m), S[0]).s);
            pintarResumen(); pintarGraf(); pintarDetalle();
        } catch (e) {
            if (mio === pedido && typeof window.showToast === 'function') window.showToast(T.error, 'error');
        } finally {
            if (mio === pedido) $('dot-cuerpo').classList.remove('cargando');
        }
    }

    // ── Subtítulo, leyenda y 4 datos ──
    function pintarResumen() {
        const S = datos.semanas, N = S.length;
        const tot = S.reduce((a, s) => ({ t: a.t + s.t, c: a.c + s.c, v: a.v + s.v, p: a.p + s.p }), { t: 0, c: 0, v: 0, p: 0 });
        let mn = S[0], mx = S[0];
        S.forEach(s => { if (s.t < mn.t) mn = s; if (s.t > mx.t) mx = s; });   // en empate gana la primera
        datos.prom = N ? tot.t / N : 0;
        $('dot-sub').textContent = areaNombre ? t('sub', { area: areaNombre, n: tot.t, anio: anio }) : t('subSinArea', { n: tot.t, anio: anio });
        $('dot-leyenda').innerHTML = [['total', 'tot', tot.t], ['completadas', 'comp', tot.c], ['validadas', 'val', tot.v], ['pendientes', 'pend', tot.p]]
            .map(([k, c, n]) => '<span><i class="dot-c-' + c + '"></i>' + esc(T[k]) + ' <b>' + n + '</b></span>').join('');
        const kpi = (l, v, s) => '<div class="dot-kpi"><small>' + esc(l) + '</small><b>' + esc(v) + ' <span>' + esc(s) + '</span></b></div>';
        const sem = s => t('semCorta', { n: s.s }) + ' · ' + fecha(s.lunes);
        $('dot-kpis').innerHTML = kpi(T.kTotal, tot.t, T.enAnio) + kpi(T.kProm, num1.format(datos.prom), T.ots) +
            kpi(T.kMin, nOts(mn.t), sem(mn)) + kpi(T.kMax, nOts(mx.t), sem(mx));
    }

    // ── Gráfica semanal ──
    function pintarGraf() {
        const S = datos.semanas, N = S.length;
        const tope = Math.max(10, Math.ceil(Math.max.apply(null, S.map(s => s.t)) / 5) * 5);
        const px = v => (v / tope * ALTO).toFixed(1) + 'px';
        let h = [0, tope / 2, tope].map(v => '<div class="dot-lin" style="bottom:' + px(v) + '"><span>' +
            (Number.isInteger(v) ? v : num1.format(v)) + '</span></div>').join('');
        h += '<div class="dot-prom" style="bottom:' + px(datos.prom) + '"><span>' + esc(t('promedio', { x: num1.format(datos.prom) })) + '</span></div>';
        h += '<div class="dot-cols" role="group" aria-label="' + esc(T.semanas) + '">' + S.map(s => {
            const cls = 'dot-col' + (s.s === sel ? ' sel' : '') + (esActual(s.s) ? ' act' : '') + (esFutura(s.s) ? ' fut' : '');
            const barras = [['comp', s.c], ['val', s.v], ['pend', s.p]]
                .map(([c, v]) => '<i class="dot-c-' + c + '" style="height:' + px(v) + '"></i>').join('');
            return '<button type="button" class="' + cls + '" data-s="' + s.s + '" tabindex="' + (s.s === sel ? 0 : -1) + '" aria-pressed="' + (s.s === sel) +
                '" aria-label="' + esc(t('aria', { n: s.s, t: s.t, c: s.c, v: s.v, p: s.p })) + '">' +
                (s.t ? '<span class="dot-n">' + s.t + '</span>' : '') + '<span class="dot-grp" style="height:' + px(s.t) + '">' + barras + '</span></button>';
        }).join('') + '</div>';
        if (anio === hoy.anio && hoy.semana <= N) {   // centro de la columna de hoy (las columnas tienen 3 px de separación)
            h += '<div class="dot-hoy" style="left:calc((100% + 3px) * ' + ((hoy.semana - 0.5) / N).toFixed(5) + ' - 1.5px)"><span>' +
                esc(t('hoy', { n: hoy.semana })) + '</span></div>';
        }
        $('dot-graf').innerHTML = h;
        $('dot-ejex').innerHTML = S.map(s => '<span class="' + (s.s === sel ? 'sel' : esActual(s.s) ? 'act' : esFutura(s.s) ? 'fut' : '') + '">' +
            esc(t('semCorta', { n: s.s })) + '</span>').join('');
        ajustarEje();
    }
    function ajustarEje() {
        const col = $('dot-graf').querySelector('.dot-col');
        $('dot-ejex').classList.toggle('angosto', !!col && col.offsetWidth < 22);
    }

    // ── Detalle de la semana elegida ──
    function pintarDetalle() {
        const s = datos.semanas.find(x => x.s === sel) || datos.semanas[0];
        const extra = esActual(s.s) ? ' · ' + T.actual : esFutura(s.s) ? ' · ' + T.programada : '';
        const pct = v => (s.t ? Math.round(v * 100 / s.t) : 0);
        const fila = (c, nombre, n, p, fuerte) => '<div><div class="dot-fila-t"><i class="dot-c-' + c + '"></i><span' + (fuerte ? ' class="f"' : '') + '>' +
            esc(nombre) + '</span><b>' + n + '</b><em>' + p + '%</em></div><div class="dot-riel"><span class="dot-c-' + c + '" style="width:' + p + '%"></span></div></div>';
        $('dot-det-izq').innerHTML = '<small>' + esc(T.semSel) + '</small><h3>' + esc((s.t === 1 ? t('selTitulo1', { n: s.s }) : t('selTitulo', { n: s.s, t: s.t }))) + '</h3><p>' +
            esc(fecha(s.lunes) + ' – ' + fecha(s.lunes, 6) + ' ' + anio + extra) + '</p>' +
            (s.t ? '<div class="dot-filas">' + fila('tot', T.totalOts, s.t, 100, true) + fila('comp', T.completadas, s.c, pct(s.c)) +
                   fila('val', T.validadas, s.v, pct(s.v)) + fila('pend', T.pendientes, s.p, pct(s.p)) + '</div>'
                 : '<div class="dot-sin">' + esc(T.sinOts) + '</div>');
        const grupo = { p: 0, c: 1, v: 1 };   // primero las pendientes; dentro de cada grupo por No. de OT
        const EST = { p: ['pend', T.pendiente], c: ['comp', T.completada], v: ['val', T.validada] };
        const ots = s.ots.slice().sort((a, b) => grupo[a.est] - grupo[b.est] || a.no.localeCompare(b.no));
        $('dot-ots').innerHTML = ots.slice(0, 4).map(o => '<div class="dot-tab dot-ot">' +
            '<a class="dot-no" href="' + esc(urlPlan(s.s, o.codigo)) + '" title="' + esc(t('verOt', { no: o.no })) + '">' + esc(o.no) + '</a>' +
            '<span class="dot-cod">' + esc(o.codigo) + '</span>' +
            '<span>' + esc(o.tarea) + (o.equipo ? ' <em>· ' + esc(o.equipo) + '</em>' : '') + '</span>' +
            '<span class="dot-resp">' + esc(o.resp || '—') + '</span>' +
            '<span><span class="dot-chip dot-chip-' + EST[o.est][0] + '"><i></i>' + esc(EST[o.est][1]) + '</span></span></div>').join('');
        $('dot-mas').textContent = s.t > 4 ? t('mostrando', { a: 4, n: s.t }) : (s.t ? nOts(s.t) : '');
    }

    function elegir(s, enfocar) {
        sel = s;
        pintarGraf(); pintarDetalle();
        if (enfocar) { const b = $('dot-graf').querySelector('.dot-col[data-s="' + s + '"]'); if (b) b.focus(); }
    }

    // ── Abrir / cerrar ──
    function abrir(origen) {
        abrio = origen && origen.closest('.pe-opc') ? $('pe-opc-btn') : origen;   // el menú ya se cerró
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        $('dot-x').focus();
        cargar(hoy.anio, hoy.semana);
    }
    function cerrar() {
        if (fondo.hidden) return;
        fondo.hidden = true;
        document.body.style.overflow = '';
        pedido++;
        if (abrio && abrio.focus && document.contains(abrio)) abrio.focus();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-distribucion]');
        if (b) { e.preventDefault(); abrir(b); }
    });
    $('dot-x').addEventListener('click', cerrar);
    $('dot-cerrar').addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
    $('dot-anio-prev').addEventListener('click', () => cargar(anio - 1));
    $('dot-anio-next').addEventListener('click', () => { if (anio < hoy.anio) cargar(anio + 1); });
    $('dot-graf').addEventListener('click', e => { const b = e.target.closest('.dot-col'); if (b) elegir(+b.dataset.s, true); });
    $('dot-ir').addEventListener('click', () => { const u = urlPlan(sel); cerrar(); window.location.assign(u); });
    window.addEventListener('resize', () => { if (!fondo.hidden && datos) ajustarEje(); });

    // ── Teclado: Esc cierra, ← → cambian de semana, Tab queda dentro del modal ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && datos) {
            e.preventDefault(); e.stopPropagation();
            const s = Math.min(datos.semanas.length, Math.max(1, sel + (e.key === 'ArrowRight' ? 1 : -1)));
            if (s !== sel) elegir(s, !!(document.activeElement && document.activeElement.classList.contains('dot-col')));
            return;
        }
        if (e.key !== 'Tab') return;
        const f = Array.from(fondo.querySelectorAll('button:not([disabled]), a[href]')).filter(x => x.offsetParent && x.tabIndex >= 0);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }, true);
})();
