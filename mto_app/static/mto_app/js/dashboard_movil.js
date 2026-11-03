/* dashboard_movil.js — Vista de celular (≤767px) del Dashboard del plan de
   mantenimiento. Los datos vienen del servidor (#dsm-datos, la misma lógica que
   escritorio); las vencidas se piden por bloques a la misma vista (?vencidas=1). */

(function () {
    const raiz = document.getElementById('dsm-movil');
    const fuente = document.getElementById('dsm-datos');
    if (!raiz || !fuente) return;

    const D = JSON.parse(fuente.textContent);
    const T = window.DSM_I18N || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const num = new Intl.NumberFormat(document.documentElement.lang || 'es');
    const pctTexto = p => (p > 0 && p < 1 ? '<1%' : Math.round(p) + '%');
    const areaNombre = raiz.dataset.areaNombre || '';

    function urlSemana(semana, anio) {
        const url = new URL(window.location.href);
        url.searchParams.set('semana', semana);
        url.searchParams.set('anio', anio);
        return url.pathname + url.search;
    }
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    // ── Gráfica de cumplimiento (columnas HTML, alto proporcional 0–100 %) ──
    const ALTO = 170;
    const graf = document.getElementById('dsm-graf');
    const btnModo = document.getElementById('dsm-graf-modo');
    let modo = '12';

    function pintarGrafica() {
        const serie = modo === 'anio' ? D.serieAnio : D.serie12;
        graf.classList.toggle('anio', modo === 'anio');
        graf.replaceChildren();
        if (!serie.length) return;

        const yMeta = el('span', 'dsm-graf-y meta', D.meta + '%');
        yMeta.style.top = ((100 - D.meta) / 100 * ALTO) + 'px';
        const y0 = el('span', 'dsm-graf-y cero', '0%');
        const scroll = el('div', 'dsm-graf-scroll');
        const plot = el('div', 'dsm-graf-plot');
        const meta = el('div', 'dsm-graf-meta');
        meta.style.top = ((100 - D.meta) / 100 * ALTO - 1) + 'px';
        const cols = el('div', 'dsm-graf-cols');
        const eje = el('div', 'dsm-graf-eje');
        cols.setAttribute('role', 'group');
        cols.setAttribute('aria-label', t('grafAria', { desde: serie[0].s, hasta: serie[serie.length - 1].s, meta: D.meta }));

        let iActual = serie.findIndex(w => w.s === D.semana && w.a === D.anio);
        const ref = iActual >= 0 ? iActual : serie.length - 1;
        serie.forEach((w, i) => {
            const hay = w.pct !== null && w.pct > 0;
            const clase = !hay ? 'nada' : (w.pct >= D.meta ? 'ok' : 'bajo');
            const col = el('a', 'dsm-graf-col' + (i === iActual ? ' actual' : ''));
            col.href = urlSemana(w.s, w.a);
            col.setAttribute('aria-label', t('semanaAria', { s: w.s, a: w.a, pct: w.pct === null ? t('sinDatos') : pctTexto(w.pct) }));
            if (i === iActual) col.setAttribute('aria-current', 'true');
            if (hay) col.append(el('small', clase, pctTexto(w.pct)));
            const barra = el('i', clase);
            barra.style.height = (hay ? Math.max(w.pct / 100 * ALTO, 3) : 3) + 'px';
            col.append(barra);
            cols.append(col);
            const etiqueta = el('span', i === iActual ? 'actual' : '', (ref - i) % 2 === 0 ? 'S' + w.s : '');
            etiqueta.setAttribute('aria-hidden', 'true');
            eje.append(etiqueta);
        });
        plot.append(meta, cols);
        if (modo === 'anio') {
            // Columnas de 18px + 4px de separación: el área (y la línea de meta) mide todo el año.
            plot.style.width = eje.style.width = (serie.length * 22 - 4) + 'px';
        }
        scroll.append(plot, eje);
        graf.append(yMeta, y0, scroll);

        document.getElementById('dsm-graf-sub').textContent = modo === 'anio'
            ? t('subAnio', { anio: D.anio, area: areaNombre })
            : t('sub12', { area: areaNombre });
        btnModo.textContent = modo === 'anio' ? t('ver12') : t('verAnio');
        btnModo.setAttribute('aria-pressed', modo === 'anio' ? 'true' : 'false');
        if (modo === 'anio' && iActual >= 0) {
            const c = cols.children[iActual];
            scroll.scrollLeft = Math.max(0, c.offsetLeft - scroll.clientWidth / 2);
        }
    }
    btnModo.addEventListener('click', () => { modo = modo === 'anio' ? '12' : 'anio'; pintarGrafica(); });
    pintarGrafica();

    // Descargar: la misma gráfica anual que escritorio, dibujada fuera de pantalla.
    window.dsmDescargar = function () {
        const C = window.DASHBOARD_CONFIG || {};
        if (typeof Chart === 'undefined' || !C.semanas) return;
        const caja = el('div');
        caja.style.cssText = 'position:fixed; left:-10000px; top:0; width:1200px; height:420px;';
        const lienzo = el('canvas');
        lienzo.width = 1200; lienzo.height = 420;
        caja.append(lienzo);
        document.body.append(caja);
        const colores = C.valores.map(v => (v >= D.meta ? '#1D9E75' : '#E24B4A'));
        const grafica = new Chart(lienzo, {
            type: 'bar',
            data: { labels: C.semanas, datasets: [{ data: C.valores, backgroundColor: colores, borderRadius: 4 }] },
            options: {
                responsive: false, animation: false, devicePixelRatio: 1,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100, ticks: { stepSize: 20, callback: v => v + '%' } } },
            },
        });
        const final = el('canvas');
        final.width = lienzo.width; final.height = lienzo.height;
        const ctx = final.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, final.width, final.height);
        ctx.drawImage(lienzo, 0, 0);
        const a = el('a');
        a.download = T.archivo || 'Cumplimiento_Semanas.png';
        a.href = final.toDataURL('image/png');
        a.click();
        grafica.destroy();
        caja.remove();
    };

    // ── Pestañas ────────────────────────────────────────────────────────────
    const tabs = [document.getElementById('dsm-tab-semana'), document.getElementById('dsm-tab-vencidas')];
    function activar(tab, foco) {
        tabs.forEach(b => {
            const si = b === tab;
            b.setAttribute('aria-selected', si ? 'true' : 'false');
            b.tabIndex = si ? 0 : -1;
            document.getElementById(b.getAttribute('aria-controls')).hidden = !si;
        });
        if (foco) tab.focus();
        if (tab.id === 'dsm-tab-vencidas') iniciarVencidas();
    }
    tabs.forEach((b, i) => {
        b.addEventListener('click', () => activar(b));
        b.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); activar(tabs[1 - i], true); }
        });
    });
    const irATabs = () => document.getElementById('dsm-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dsmIrVencidas = () => { activar(tabs[1]); irATabs(); };
    window.dsmVerSinResponsable = () => { activar(tabs[0]); filtrarSemana('sin_resp'); irATabs(); };

    // ── Lista de la semana: chips + 5 filas y "Ver las N" de 20 en 20 ──────
    const INICIO = 5, BLOQUE = 20;
    const filasSemana = Array.from(document.querySelectorAll('#dsm-semana-lista > li'));
    const btnSemana = document.getElementById('dsm-semana-mas');
    let filtroSemana = '', visiblesSemana = INICIO;
    const pasaFiltro = (li, f) =>
        !f ? true
        : f === 'pendiente' ? (li.dataset.estado === 'pendiente' || li.dataset.estado === 'sin_registro')
        : f === 'sin_resp' ? li.dataset.sinresp === '1'
        : li.dataset.estado === f;

    function pintarSemana() {
        const ok = filasSemana.filter(li => pasaFiltro(li, filtroSemana));
        filasSemana.forEach(li => { li.hidden = true; });
        ok.slice(0, visiblesSemana).forEach(li => { li.hidden = false; });
        if (btnSemana) {
            btnSemana.hidden = ok.length <= visiblesSemana;
            btnSemana.textContent = t('verSemana', { n: num.format(ok.length) });
        }
    }
    function filtrarSemana(f) {
        filtroSemana = f;
        visiblesSemana = INICIO;
        document.querySelectorAll('#dsm-panel-semana .dsm-chips button').forEach(b => {
            b.setAttribute('aria-pressed', b.dataset.filtro === f ? 'true' : 'false');
        });
        pintarSemana();
    }
    document.querySelectorAll('#dsm-panel-semana .dsm-chips button').forEach(b => {
        b.addEventListener('click', () => filtrarSemana(b.dataset.filtro));
    });
    if (btnSemana) btnSemana.addEventListener('click', () => { visiblesSemana += BLOQUE; pintarSemana(); });
    if (filasSemana.length) pintarSemana();

    // ── Vencidas: primer bloque en la página, el resto se pide de 20 en 20 ─
    const listaV = document.getElementById('dsm-vencidas-lista');
    const btnV = document.getElementById('dsm-vencidas-mas');
    let vArea = '', vItems = D.vencidas.slice(), vTotal = D.totalVencidas, vVisibles = INICIO, vIniciada = false;

    function filaVencida(v) {
        const li = el('li');
        const a = el('a', 'dsm-fila');
        a.href = v.url;
        const txt = el('span', 'dsm-fila-txt');
        txt.append(el('span', 'dsm-codigo', v.codigo), el('span', 'dsm-act', v.actividad),
                   el('span', 'dsm-sub', [v.area, v.frecuencia, 'S' + v.semana, v.fecha].join(' · ')));
        const nivel = v.atraso <= 8 ? 'ambar' : (v.atraso <= 26 ? 'rojo' : 'oscuro');
        a.append(txt, el('span', 'dsm-atraso ' + nivel, t('semCorto', { n: v.atraso })));
        li.append(a);
        return li;
    }
    function pintarVencidas() {
        listaV.replaceChildren(...vItems.slice(0, vVisibles).map(filaVencida));
        btnV.hidden = vVisibles >= vTotal;
        btnV.textContent = t('verVencidas', { n: num.format(vTotal) });
    }
    function pedirVencidas() {
        const url = new URL(window.location.href);
        url.searchParams.set('vencidas', '1');
        url.searchParams.set('desde', vItems.length);
        if (vArea) url.searchParams.set('varea', vArea); else url.searchParams.delete('varea');
        const area = vArea;
        return fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => {
                if (area !== vArea) return;   // cambió de chip mientras cargaba
                vTotal = data.total;
                vItems = vItems.concat(data.items);
            });
    }
    function iniciarVencidas() {
        if (vIniciada || !listaV) return;
        vIniciada = true;
        pintarVencidas();
    }
    if (btnV) {
        btnV.addEventListener('click', () => {
            const meta = vVisibles + BLOQUE;
            const listo = () => { vVisibles = meta; pintarVencidas(); };
            if (vItems.length >= Math.min(meta, vTotal)) { listo(); return; }
            btnV.disabled = true;
            pedirVencidas().then(listo)
                .catch(() => { if (typeof showToast === 'function') showToast(t('errorCargar'), 'error'); })
                .finally(() => { btnV.disabled = false; });
        });
    }
    document.querySelectorAll('#dsm-vencidas-chips button').forEach(b => {
        b.addEventListener('click', () => {
            vArea = b.dataset.area;
            document.querySelectorAll('#dsm-vencidas-chips button').forEach(x => {
                x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            });
            vItems = []; vVisibles = INICIO;
            if (!vArea) { vItems = D.vencidas.slice(); vTotal = D.totalVencidas; pintarVencidas(); return; }
            listaV.replaceChildren();
            btnV.hidden = true;
            pedirVencidas().then(pintarVencidas)
                .catch(() => { if (typeof showToast === 'function') showToast(t('errorCargar'), 'error'); });
        });
    });

    // ── Hoja de áreas ───────────────────────────────────────────────────────
    const hoja = document.getElementById('dsm-sheet-areas');
    let disparador = null;
    window.dsmAbrirAreas = function (e) {
        disparador = e && e.currentTarget;
        abrirModalConAnimacion(hoja, e);
        const actual = hoja.querySelector('[aria-current="true"]') || hoja.querySelector('a');
        if (actual) actual.focus();
    };
    function cerrarAreas() {
        if (hoja.style.display === 'none') return;
        cerrarModalConAnimacion(hoja);
        if (disparador) disparador.focus();
    }
    hoja.addEventListener('click', e => { if (e.target === hoja) cerrarAreas(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarAreas(); });
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) e.target.style.animation = 'none';
    });
})();
