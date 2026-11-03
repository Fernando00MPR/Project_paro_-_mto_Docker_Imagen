/* dashboard_escritorio.js — Vista de escritorio (≥768px) del Dashboard del
   plan de mantenimiento. No toca nada de dashboard_movil.js (celular, ≤767px).
   Selector de semana propio (no WeekSelect: ese bloquea semanas/años sin
   datos, aquí hace falta poder saltar a cualquiera). Selector de Área con
   FilterSelect (mto_app/_filter_select.html + filter_select.js), que ya
   recarga la página solo. La gráfica es DOM a mano (igual que dashboard_movil.js
   pintarGrafica, altura = %×alto → proporcional de verdad), Chart.js solo para
   exportar el PNG (igual que dsmDescargar). */
(function () {
    const root = document.querySelector('.dshd');
    const fuente = document.getElementById('dshd-datos');
    if (!root || !fuente) return;

    const D    = JSON.parse(fuente.textContent);
    const T    = window.DSHD_I18N || {};
    const DIA  = 864e5;
    const lang = document.documentElement.lang || 'es';
    const num  = new Intl.NumberFormat(lang);

    // Abreviatura/palabra de "semana" según el idioma activo (no depende del
    // catálogo de traducción: así funciona aunque esas cadenas no estén en el .po).
    const esIngles   = lang.toLowerCase().indexOf('en') === 0;
    const ABREV_SEM  = esIngles ? 'W' : 'S';
    const PREFIJO_SEM = esIngles ? 'Week' : 'Semana';

    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // ── Semanas ISO (igual que week_select.js, en UTC) ──
    function semanaIso(d) {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
        const anio = x.getUTCFullYear();
        return [anio, Math.ceil(((x - Date.UTC(anio, 0, 1)) / DIA + 1) / 7)];
    }
    function lunesIso(anio, semana) {
        const ene4 = new Date(Date.UTC(anio, 0, 4));
        return new Date(ene4.getTime() - ((ene4.getUTCDay() || 7) - 1) * DIA + (semana - 1) * 7 * DIA);
    }
    const semanasDelAnio = anio => semanaIso(new Date(Date.UTC(anio, 11, 28)))[1];
    const fmtCorto = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const corto = d => fmtCorto.format(d).replace('.', '');
    function rango(anio, s) {
        const l = lunesIso(anio, s);
        return corto(l) + ' – ' + corto(new Date(l.getTime() + 6 * DIA));
    }
    function mesDeSemana(w) {
        const jueves = new Date(lunesIso(w.a, w.s).getTime() + 3 * DIA);
        return jueves.getUTCMonth();
    }
    function urlSemana(s, a) {
        const url = new URL(location.href);
        url.searchParams.set('semana', s);
        url.searchParams.set('anio', a);
        return url.pathname + '?' + url.searchParams.toString();
    }
    function futura(w) {
        return (w.a > D.actualAnio) || (w.a === D.actualAnio && w.s > D.actualSemana);
    }
    function pctTexto(pct) {
        if (pct == null) return null;
        return (pct > 0 && pct < 1) ? '<1' : String(Math.round(pct));
    }

    const MESES_CORTOS = Array.from({ length: 12 }, (_, m) =>
        new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m, 1))).replace('.', ''));
    const MESES_LARGOS = Array.from({ length: 12 }, (_, m) =>
        new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m, 1))));

    // ── Selector de semana (popover propio) ──
    const semBtn   = document.getElementById('dshd-sem-btn');
    const semPop   = document.getElementById('dshd-sem-pop');
    const wkGrid   = document.getElementById('dshd-wk-grid');
    const anioN    = document.getElementById('dshd-pop-anio-n');
    const anioPrev = document.getElementById('dshd-anio-prev');
    const anioNext = document.getElementById('dshd-anio-next');
    const popHoy   = document.getElementById('dshd-pop-hoy');
    let popAnio = D.anio;

    function pintarPopover() {
        anioN.textContent = popAnio;
        wkGrid.replaceChildren();
        wkGrid.setAttribute('aria-label', t('semanasDe', { anio: popAnio }));
        const total = semanasDelAnio(popAnio);
        for (let s = 1; s <= total; s++) {
            const b = el('button', 'dshd-wk-sem', String(s));
            b.type = 'button';
            const fut = (popAnio > D.actualAnio) || (popAnio === D.actualAnio && s > D.actualSemana);
            if (fut) b.classList.add('fut');
            if (s === D.semana && popAnio === D.anio) b.classList.add('sel');
            if (s === D.actualSemana && popAnio === D.actualAnio) b.classList.add('act');
            b.setAttribute('aria-label', t('celda', { n: s, rango: rango(popAnio, s) }));
            b.addEventListener('click', () => location.assign(urlSemana(s, popAnio)));
            wkGrid.appendChild(b);
        }
    }
    function fueraPop(e) { if (!semPop.contains(e.target) && e.target !== semBtn) cerrarPop(); }
    function escPop(e) { if (e.key === 'Escape') { cerrarPop(); semBtn.focus(); } }
    function abrirPop() {
        popAnio = D.anio;
        pintarPopover();
        semPop.hidden = false;
        semBtn.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', fueraPop);
        document.addEventListener('keydown', escPop);
    }
    function cerrarPop() {
        semPop.hidden = true;
        semBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', fueraPop);
        document.removeEventListener('keydown', escPop);
    }
    if (semBtn) {
        semBtn.addEventListener('click', () => (semPop.hidden ? abrirPop() : cerrarPop()));
        anioPrev.addEventListener('click', () => { popAnio--; pintarPopover(); });
        anioNext.addEventListener('click', () => { popAnio++; pintarPopover(); });
        popHoy.addEventListener('click', () => location.assign(urlSemana(D.actualSemana, D.actualAnio)));
    }

    // ── Gráfica (DOM a mano: 12 sem. / Meses / Año) ──
    const ALTO    = 220;
    const grafEl  = document.getElementById('dshd-graf');
    const ejeFila = el('div', 'dshd-eje-fila');
    grafEl.insertAdjacentElement('afterend', ejeFila);

    // Modo año: etiqueta en todas las semanas si cada columna tiene espacio para la
    // más ancha ("S53" en negritas); si no, como siempre (S1, cada 4 y la elegida).
    let todasLasEtiquetas = false;
    function cabenTodas(n) {
        const muestra = el('span', 'sel', ABREV_SEM + '53');
        muestra.style.flex = 'none';
        ejeFila.appendChild(muestra);
        const ancho = muestra.offsetWidth;
        muestra.remove();
        const columna = (ejeFila.clientWidth - 4 * (n - 1)) / n;   // gap de 4px entre columnas
        return columna >= ancho + 2;
    }

    const tituloEl  = document.getElementById('dshd-graf-titulo');
    const subEl     = document.getElementById('dshd-graf-sub');
    const tipEl     = document.getElementById('dshd-tip');
    const rangoBtns = document.querySelectorAll('.dshd-graf-rango button');

    const iSel = D.serie.findIndex(w => w.s === D.semana && w.a === D.anio);
    let modo = localStorage.getItem('dshd.graf.rango') || 'anio';
    if (['12', 'meses', 'anio'].indexOf(modo) === -1) modo = 'anio';
    let fin = iSel >= 0 ? iSel : D.serie.length - 1;

    function construirMeses() {
        const buckets = Array.from({ length: 12 }, () => ({ c: 0, t: 0, idxs: [], todasFuturas: true }));
        for (let i = D.nAnterior; i < D.serie.length; i++) {
            const w = D.serie[i];
            const b = buckets[mesDeSemana(w)];
            b.idxs.push(i);
            if (!futura(w)) {
                b.todasFuturas = false;
                b.c += w.c; b.t += w.t;
            }
        }
        return buckets.map((b, m) => ({
            mes: m, c: b.c, t: b.t,
            pct: b.t ? b.c / b.t * 100 : null,
            fut: b.todasFuturas,
            sel: b.idxs.indexOf(iSel) !== -1,
            ultimoIdx: b.idxs.length ? b.idxs[b.idxs.length - 1] : null,
        }));
    }

    function datosVista() {
        if (modo === 'anio') return { tipo: 'semana', items: D.serie.slice(D.nAnterior) };
        if (modo === '12') {
            const desde = Math.max(fin - 11, 0);
            return { tipo: 'semana', items: D.serie.slice(desde, fin + 1) };
        }
        return { tipo: 'mes', items: construirMeses() };
    }

    function ocultarTip() { tipEl.hidden = true; }
    function mostrarTip(e, lineas) {
        const b = e.target.closest('.dshd-col');
        if (!b) return;
        tipEl.replaceChildren(...lineas.map(l => el('div', null, l)));
        tipEl.hidden = false;
        const r = b.getBoundingClientRect();
        tipEl.style.left = (r.left + r.width / 2) + 'px';
        tipEl.style.top = (r.top - 8) + 'px';
        tipEl.style.transform = 'translate(-50%, -100%)';
    }

    function navegarTeclado(e, idx, total) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const siguiente = Math.min(Math.max(idx + (e.key === 'ArrowRight' ? 1 : -1), 0), total - 1);
            const botones = grafEl.querySelectorAll('.dshd-col');
            botones.forEach(b => (b.tabIndex = -1));
            botones[siguiente].tabIndex = 0;
            botones[siguiente].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.target.closest('.dshd-col').click();
        }
    }

    function marcarModoBtns() {
        rangoBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.rango === modo ? 'true' : 'false'));
    }
    function guardarModo() {
        try { localStorage.setItem('dshd.graf.rango', modo); } catch (e) { /* localStorage no disponible */ }
    }

    function dibujarGraf() {
        const { tipo, items } = datosVista();
        grafEl.replaceChildren();
        ejeFila.replaceChildren();

        todasLasEtiquetas = tipo === 'semana' && modo === 'anio' && cabenTodas(items.length);

        [0, 50].forEach(pct => {
            const l = el('div', 'dshd-guialinea');
            l.style.top = ((100 - pct) / 100 * ALTO) + 'px';
            grafEl.appendChild(l);
        });
        const metaLinea = el('div', 'dshd-metalinea');
        metaLinea.style.top = ((100 - D.meta) / 100 * ALTO) + 'px';
        grafEl.appendChild(metaLinea);
        [['100%', 0, false], [D.meta + '%', D.meta, true], ['50%', 50, false], ['0%', 100, false]].forEach(function (f) {
            const e = el('div', 'dshd-eje' + (f[2] ? ' meta' : ''), f[0]);
            e.style.top = ((100 - f[1]) / 100 * ALTO - 6) + 'px';
            grafEl.appendChild(e);
        });

        let selIdx = items.findIndex(it => it.sel);
        if (selIdx === -1) selIdx = 0;

        items.forEach((it, idx) => {
            const btn = el('button', 'dshd-col');
            btn.type = 'button';
            btn.tabIndex = idx === selIdx ? 0 : -1;
            const fut = it.fut;
            const cero = !fut && !it.pct;
            btn.classList.add(fut ? 'fut' : (cero ? 'cero' : (it.pct >= D.meta ? 'ok' : 'bajo')));
            if (it.sel) btn.classList.add('sel');

            const txt = pctTexto(it.pct);
            if (!fut && it.pct > 0) btn.appendChild(el('small', null, txt + '%'));
            const i = el('i');
            i.style.height = (fut ? 6 : (it.pct > 0 ? Math.max(it.pct / 100 * ALTO, 3) : 3)) + 'px';
            btn.appendChild(i);

            let etiquetaEje, aria;
            if (tipo === 'semana') {
                etiquetaEje = (todasLasEtiquetas || it.s === 1 || it.s % 4 === 0 || it.sel || modo === '12') ? ABREV_SEM + it.s : '';
                const pctAria = it.pct == null ? t('sinDatos') : txt + '%';
                aria = t('barraAria', { etiqueta: ABREV_SEM + it.s, pct: pctAria });
                const rangoTxt = rango(it.a, it.s);
                if (!fut) btn.addEventListener('click', () => location.assign(urlSemana(it.s, it.a)));
                const tip = () => [PREFIJO_SEM + ' ' + it.s, rangoTxt, pctAria + ' · ' + t('tipDetalle', { c: it.c, t: it.t })];

                btn.addEventListener('pointerenter', e => mostrarTip(e, tip()));
                btn.addEventListener('focus', e => mostrarTip(e, tip()));
            } else {
                etiquetaEje = MESES_CORTOS[it.mes];
                const pctAria = it.pct == null ? t('sinDatos') : txt + '%';
                aria = t('barraAria', { etiqueta: MESES_LARGOS[it.mes], pct: pctAria });
                btn.addEventListener('click', () => {
                    if (it.ultimoIdx == null) return;
                    fin = it.ultimoIdx; modo = '12';
                    guardarModo(); marcarModoBtns(); dibujarGraf();
                });
                const tip = () => [MESES_LARGOS[it.mes], pctAria + ' · ' + t('tipDetalle', { c: it.c, t: it.t })];
                btn.addEventListener('pointerenter', e => mostrarTip(e, tip()));
                btn.addEventListener('focus', e => mostrarTip(e, tip()));
            }
            btn.setAttribute('aria-label', aria);
            btn.addEventListener('pointerleave', ocultarTip);
            btn.addEventListener('blur', ocultarTip);
            btn.addEventListener('keydown', e => navegarTeclado(e, idx, items.length));
            grafEl.appendChild(btn);
            ejeFila.appendChild(el('span', it.sel ? 'sel' : '', etiquetaEje));
        });

        const primero = items[0], ultimo = items[items.length - 1];
        grafEl.setAttribute('aria-label', t('grafAria', {
            desde: tipo === 'semana' ? ABREV_SEM + primero.s : MESES_LARGOS[primero.mes],
            hasta: tipo === 'semana' ? ABREV_SEM + ultimo.s : MESES_LARGOS[ultimo.mes],
            meta: D.meta,
        }));
        tituloEl.textContent = modo === 'meses' ? t('tituloMes', { anio: D.anio }) : t('tituloSem', { anio: D.anio });
        subEl.textContent = modo === 'meses' ? t('subMes', { area: D.area }) : t('sub', { area: D.area });
    }

    rangoBtns.forEach(b => b.addEventListener('click', () => {
        modo = b.dataset.rango;
        if (modo === '12') fin = iSel >= 0 ? iSel : D.serie.length - 1;
        guardarModo(); marcarModoBtns(); dibujarGraf();
    }));
    marcarModoBtns();
    dibujarGraf();

    // Si cambia el ancho de la ventana, se vuelve a decidir si caben todas las etiquetas.
    let esperaResize;
    window.addEventListener('resize', () => {
        clearTimeout(esperaResize);
        esperaResize = setTimeout(() => {
            if (modo === 'anio' && cabenTodas(datosVista().items.length) !== todasLasEtiquetas) dibujarGraf();
        }, 150);
    });

    // ── Tablas con scroll infinito (centinela + IntersectionObserver) ──
    function contarFilas(cuerpo) {
        return cuerpo.querySelectorAll('tr:not(.dshd-centinela)').length;
    }

    function tablaInfinita(opts) {
        let total    = opts.total;
        let cargadas = opts.cargadas;
        let filtro   = '';
        let gen      = 0;
        let cargando = false;
        let centinela = opts.cuerpo.querySelector('.dshd-centinela');

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => { if (entry.isIntersecting) cargarMas(); });
        }, { root: opts.scrollEl, rootMargin: '0px 0px 120px 0px' });
        if (centinela) observer.observe(centinela);

        function quitarCentinela() {
            if (centinela) { observer.unobserve(centinela); centinela.remove(); centinela = null; }
        }
        function agregarCentinela() {
            centinela = el('tr', 'dshd-centinela');
            const td = el('td', null, t('cargando'));
            td.colSpan = opts.colSpan;
            centinela.appendChild(td);
            opts.cuerpo.appendChild(centinela);
            observer.observe(centinela);
        }

        function cargarMas() {
            if (cargando || cargadas >= total) return Promise.resolve();
            cargando = true;
            if (centinela) centinela.querySelector('td').textContent = t('cargando');
            const miGen = gen;
            return fetch(opts.construirUrl(cargadas, filtro), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(data => {
                    if (miGen !== gen) return;
                    total = data.total;
                    data.items.forEach(item => opts.cuerpo.insertBefore(opts.fila(item), centinela));
                    cargadas += data.items.length;
                    cargando = false;
                    if (cargadas >= total || !data.items.length) quitarCentinela();
                })
                .catch(() => {
                    cargando = false;
                    if (centinela) centinela.querySelector('td').textContent = t('errorCargar');
                    if (typeof showToast === 'function') showToast(t('errorCargar'), 'error');
                });
        }

        return {
            reiniciar(nuevoFiltro, nuevoTotal) {
                gen++;
                cargando = false;
                filtro = nuevoFiltro;
                total = nuevoTotal;
                cargadas = 0;
                opts.scrollEl.scrollTop = 0;
                opts.cuerpo.querySelectorAll('tr:not(.dshd-centinela)').forEach(tr => tr.remove());
                quitarCentinela();
                if (total > 0) { agregarCentinela(); cargarMas(); }
                else opts.cuerpo.appendChild(opts.vacio());
            },
            expandir() {
                opts.scrollEl.style.maxHeight = 'none';
                (function paso() {
                    if (cargadas >= total) return;
                    cargarMas().then(paso);
                })();
            },
        };
    }

    const ESTADO_LABEL = { pendiente: 'pendiente', completada: 'completada', reagendada: 'reagendada', cancelada: 'cancelada', sin_registro: 'sinRegistro' };
    const labelEstado = estado => t(ESTADO_LABEL[estado] || estado);

    const semanaTablaEl = document.getElementById('dshd-semana-tabla');
    const semanaScroll  = semanaTablaEl.querySelector('.dshd-scroll');
    const semanaCuerpo  = document.getElementById('dshd-semana-body');
    const semanaChips   = document.getElementById('dshd-chips-semana');

    const tablaSemana = tablaInfinita({
        cuerpo: semanaCuerpo,
        scrollEl: semanaScroll,
        total: D.totalSemana,
        cargadas: contarFilas(semanaCuerpo),
        colSpan: 4,
        construirUrl: (desde, filtro) => {
            const u = new URL(location.href);
            u.searchParams.set('detalle', '1');
            u.searchParams.set('desde', desde);
            if (filtro) u.searchParams.set('filtro', filtro); else u.searchParams.delete('filtro');
            return u.toString();
        },
        fila: item => {
            const tr = el('tr');
            const tdCod = el('td');
            const a = el('a', 'dshd-mono', item.codigo);
            a.href = item.url;
            tdCod.appendChild(a);
            const tdResp = el('td');
            if (item.responsable) tdResp.textContent = item.responsable;
            else tdResp.appendChild(el('span', 'dshd-sinresp', t('sinResp')));
            const tdEst = el('td', 'dshd-der');
            tdEst.appendChild(el('span', 'dshd-estado ' + item.estado, labelEstado(item.estado)));
            tr.append(tdCod, el('td', null, item.actividad), tdResp, tdEst);
            return tr;
        },
        vacio: () => {
            const tr = el('tr', 'dshd-vacio');
            tr.appendChild(el('td', null, t('sinResultadosSemana')));
            tr.firstChild.colSpan = 4;
            return tr;
        },
    });
    if (semanaChips) {
        semanaChips.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                semanaChips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
                tablaSemana.reiniciar(b.dataset.filtro, D.conteos[b.dataset.filtro] || 0);
            });
        });
    }

    const vencidasSection = document.getElementById('dshd-vencidas');
    const vencidasScroll  = vencidasSection.querySelector('.dshd-scroll');
    const vencidasCuerpo  = document.getElementById('dshd-vencidas-body');

    const tablaVencidas = tablaInfinita({
        cuerpo: vencidasCuerpo,
        scrollEl: vencidasScroll,
        total: D.totalVencidas,
        cargadas: contarFilas(vencidasCuerpo),
        colSpan: 4,
        construirUrl: desde => {
            const u = new URL(location.href);
            u.searchParams.set('vencidas', '1');
            u.searchParams.set('vista', 'escritorio');
            u.searchParams.set('desde', desde);
            return u.toString();
        },
        fila: item => {
            const tr = el('tr');
            const tdCod = el('td');
            const a = el('a', 'dshd-mono', item.codigo);
            a.href = item.url;
            tdCod.appendChild(a);
            const tdAtr = el('td', 'dshd-der');
            tdAtr.appendChild(el('span', 'dshd-atraso ' + item.nivel, t('semanas', { n: item.atraso })));
            tr.append(tdCod, el('td', null, item.actividad), el('td', 'dshd-mono', ABREV_SEM + item.semana + '/' + item.anio), tdAtr);
            return tr;
        },
        vacio: () => el('tr', 'dshd-vacio'),
    });
    const expandirBtn = document.getElementById('dshd-vencidas-expandir');
    if (expandirBtn) {
        expandirBtn.addEventListener('click', () => {
            tablaVencidas.expandir();
            expandirBtn.hidden = true;
        });
    }

    // ── "Ver ›" de los KPI: scroll a la sección ──
    document.querySelectorAll('[data-ir]').forEach(b => {
        b.addEventListener('click', () => {
            const destino = document.getElementById(b.dataset.ir);
            if (!destino) return;
            destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const scrollEl = destino.querySelector('.dshd-scroll');
            if (scrollEl) scrollEl.focus({ preventScroll: true });
        });
    });

    // ── Exportar PNG (offscreen, igual técnica que dsmDescargar) ──
    const descargarBtn = document.getElementById('dshd-descargar');
    if (descargarBtn && window.Chart) {
        descargarBtn.addEventListener('click', () => {
            const { tipo, items } = datosVista();
            const labels   = items.map(it => (tipo === 'semana' ? ABREV_SEM + it.s : MESES_CORTOS[it.mes]));
            const valores  = items.map(it => (it.pct == null ? 0 : Math.round(it.pct)));
            const colores  = items.map(it => (it.fut ? '#E2E3EE' : (it.pct >= D.meta ? '#2E8B57' : '#D9534F')));
            const tmp = document.createElement('canvas');
            tmp.width = 1200; tmp.height = 500;
            const chart = new Chart(tmp, {
                type: 'bar',
                data: { labels, datasets: [{ data: valores, backgroundColor: colores, borderRadius: 4, borderSkipped: false }] },
                options: {
                    responsive: false, animation: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } },
                },
                plugins: [{
                    id: 'fondoBlanco',
                    beforeDraw(c) {
                        c.ctx.save();
                        c.ctx.fillStyle = '#ffffff';
                        c.ctx.fillRect(0, 0, c.width, c.height);
                        c.ctx.restore();
                    },
                }],
            });
            requestAnimationFrame(() => {
                const link = document.createElement('a');
                link.download = t('archivo');
                link.href = tmp.toDataURL('image/png');
                link.click();
                chart.destroy();
            });
        });
    }
})();
