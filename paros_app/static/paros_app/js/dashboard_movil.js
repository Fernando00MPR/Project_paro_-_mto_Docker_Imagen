/* dashboard_movil.js — Vista móvil del Dashboard de paros (≤767px).
   Reutiliza window.DASHBOARD_CFG (dashboard.html), crearGraficaTendencia,
   colorIndigo, actualizarDashboard y cambiarOrdenTop (dashboard.js), y
   abrirModalConAnimacion/cerrarModalConAnimacion (base_menu.html).
   Se re-renderiza con el evento 'dashboard:datos' que emite actualizarDashboard(). */

(function () {
    const cfg  = window.DASHBOARD_CFG || {};
    const mov  = cfg.movil || {};
    const t    = window.DM_I18N || {};
    const $    = id => document.getElementById(id);

    const estado = {
        tab: 'fallas',
        orden: mov.ordenTop === 'cantidad' ? 'cantidad' : 'minutos',
        tops: mov.tops || { responsables: [], fallas: [], equipos: [] },
        turno1: mov.turno1 || 0,
        turno2: mov.turno2 || 0,
        labels: (cfg.chartLabels || []).slice(),
        data: (cfg.chartData || []).slice(),
        paros: (cfg.chartParos || []).slice(),
        anioCompleto: false,
    };

    // ── Hojas inferiores (mismo patrón que lista_paros_movil.js) ─────────────
    let trapHandler = null, trapOrigen = null;
    function focusTrap(box) {
        trapOrigen = document.activeElement;
        const focos = box.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focos.length) focos[0].focus();
        trapHandler = function (e) {
            if (e.key === 'Escape') { cerrarSheetDM(box.closest('.modal-backdrop')); return; }
            if (e.key !== 'Tab') return;
            const items = Array.from(focos).filter(el => el.offsetParent !== null);
            if (!items.length) return;
            const primero = items[0], ultimo = items[items.length - 1];
            if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
        };
        document.addEventListener('keydown', trapHandler);
    }
    function liberarTrap() {
        if (trapHandler) document.removeEventListener('keydown', trapHandler);
        trapHandler = null;
        if (trapOrigen && document.body.contains(trapOrigen)) trapOrigen.focus();
        trapOrigen = null;
    }
    // Sin esto el transform del último frame queda fijo y rompe el
    // position:fixed del calendario (.dp-popover) dentro de la hoja.
    document.addEventListener('animationend', function (e) {
        if (e.animationName === 'sheet-movil-in') e.target.style.animation = 'none';
    });

    function abrirSheetDM(id, event) {
        const modal = $(id);
        if (!modal) return;
        if (id === 'dm-sheet-filtros') mostrarExtrasPeriodoDM();
        abrirModalConAnimacion(modal, event);
        const box = modal.querySelector('.modal-box');
        if (box) focusTrap(box);
    }
    function cerrarSheetDM(modal) {
        if (!modal) return;
        cerrarModalConAnimacion(modal);
        liberarTrap();
    }

    // ── Hoja de filtros ──────────────────────────────────────────────────────
    function mostrarExtrasPeriodoDM() {
        const rango = $('mf-rango') ? $('mf-rango').value : '';
        document.querySelectorAll('#dm-sheet-filtros .dm-extra').forEach(el => {
            el.classList.toggle('dm-visible', el.dataset.rango === rango);
        });
    }

    function estatusElegido() {
        const b = document.querySelector('#mf-estatus-grupo .dm-seg[aria-pressed="true"]');
        return b ? b.dataset.valor : '';
    }

    function aplicarFiltrosDM() {
        const url = new URL(window.location.href);
        ['semana_num', 'mes_num', 'anio_mes', 'anio_meses', 'fecha_ini', 'fecha_fin'].forEach(k => url.searchParams.delete(k));

        // area y estatus se mandan aunque vayan vacíos: la vista usa otro
        // valor por defecto (primera área / "Aceptados") si el parámetro falta.
        url.searchParams.set('area', $('mf-area') ? $('mf-area').value : '');
        const rango = $('mf-rango') ? $('mf-rango').value : '7';
        url.searchParams.set('rango', rango);
        if (rango === 'semana_num') url.searchParams.set('semana_num', $('mf-semana').value);
        if (rango === 'mes') {
            url.searchParams.set('mes_num', $('mf-mes').value);
            url.searchParams.set('anio_mes', $('mf-anio-mes').value);
        }
        if (rango === 'meses') url.searchParams.set('anio_meses', $('mf-anio-meses').value);
        if (rango === 'custom') {
            const ini = document.querySelector('#dm-dp-ini .dp-value');
            const fin = document.querySelector('#dm-dp-fin .dp-value');
            if (ini && ini.value) url.searchParams.set('fecha_ini', ini.value);
            if (fin && fin.value) url.searchParams.set('fecha_fin', fin.value);
        }
        const resp = $('mf-responsable') ? $('mf-responsable').value : '';
        if (resp) url.searchParams.set('responsable', resp); else url.searchParams.delete('responsable');
        url.searchParams.set('estatus', estatusElegido());

        window.location.href = url.toString();
    }

    function restablecerFiltrosDM() {
        window.location.href = window.location.pathname;
    }

    function textoSel(sel) {
        return sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.trim() : '';
    }

    function renderChips() {
        const chips = [];
        const area = $('mf-area');
        chips.push(area && area.value ? textoSel(area) : (t.todasAreas || ''));
        const extra = [];
        if ($('mf-rango')) extra.push(textoSel($('mf-rango')));
        if ($('mf-responsable') && $('mf-responsable').value) extra.push(textoSel($('mf-responsable')));
        const est = document.querySelector('#mf-estatus-grupo .dm-seg[aria-pressed="true"]');
        if (est && est.dataset.valor) extra.push(est.textContent.trim());
        const cont = $('dm-chips');
        if (cont) {
            cont.innerHTML = '';
            chips.concat(extra).forEach(txt => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'dm-chip';
                b.textContent = txt;
                b.addEventListener('click', e => abrirSheetDM('dm-sheet-filtros', e));
                cont.appendChild(b);
            });
        }
        const badge = $('dm-badge');
        if (badge) badge.textContent = extra.length ? String(extra.length) : '';
    }

    // ── KPIs y turnos ────────────────────────────────────────────────────────
    function renderTurnos() {
        const t1 = estado.turno1, t2 = estado.turno2, tt = t1 + t2;
        const p1 = tt ? Math.round(t1 / tt * 100) : 0;
        const p2 = tt ? 100 - p1 : 0;
        if (!$('dm-turno-barra')) return;
        $('dm-turno1-seg').style.width = p1 + '%';
        $('dm-turno2-seg').style.width = p2 + '%';
        $('dm-turno1-seg').style.display = t1 ? '' : 'none';
        $('dm-turno2-seg').style.display = t2 ? '' : 'none';
        $('dm-turno1-num').textContent = t1;
        $('dm-turno2-num').textContent = t2;
        $('dm-turno1-pct').textContent = '· ' + p1 + '%';
        $('dm-turno2-pct').textContent = '· ' + p2 + '%';
        $('dm-turno-total').textContent = tt + ' ' + (tt === 1 ? t.paro : t.paros);
        $('dm-turno-barra').setAttribute('aria-label',
            `${t.turno1}: ${t1} ${t1 === 1 ? t.paro : t.paros}, ${p1}%. ${t.turno2}: ${t2} ${t2 === 1 ? t.paro : t.paros}, ${p2}%.`);
    }

    // ── Top con pestañas ─────────────────────────────────────────────────────
    const FALLBACK = () => ({ responsables: t.sinAsignar, fallas: t.sinFalla, equipos: t.sinEquipo });

    function renderTop() {
        const lista = $('dm-top-lista');
        if (!lista) return;
        document.querySelectorAll('.dm-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === estado.tab ? 'true' : 'false'));
        document.querySelectorAll('.dm-top-head .dm-seg').forEach(b => b.setAttribute('aria-pressed', b.dataset.orden === estado.orden ? 'true' : 'false'));

        const porMin = estado.orden === 'minutos';
        const items = (estado.tops[estado.tab] || []).slice()
            .sort((a, b) => porMin ? (b.minutos - a.minutos) : (b.total - a.total));
        if (!items.length) {
            lista.innerHTML = '';
            const li = document.createElement('li');
            li.className = 'dm-top-vacio';
            li.textContent = t.sinDatos || '';
            lista.appendChild(li);
            return;
        }
        const max = Math.max.apply(null, items.map(i => porMin ? i.minutos : i.total).concat([1]));
        const fb = FALLBACK()[estado.tab];
        const parosTxt = n => n + ' ' + (n === 1 ? t.paro : t.paros);
        lista.innerHTML = '';
        items.forEach(i => {
            const valor = porMin ? i.minutos : i.total;
            const li = document.createElement('li');
            li.innerHTML =
                '<div class="dm-top-f1"><span class="dm-top-nombre"></span><span class="dm-top-valor"></span></div>' +
                '<div class="dm-top-f2"><div class="dm-top-pista"><div class="dm-top-relleno"></div></div><span class="dm-top-sec"></span></div>';
            li.querySelector('.dm-top-nombre').textContent = i.nombre || fb;
            li.querySelector('.dm-top-valor').textContent = porMin ? i.minutos + ' min' : parosTxt(i.total);
            li.querySelector('.dm-top-sec').textContent = porMin ? parosTxt(i.total) : i.minutos + ' min';
            li.querySelector('.dm-top-relleno').style.width = Math.max(2, valor / max * 100) + '%';
            lista.appendChild(li);
        });
    }

    function elegirTabDM(tab) { estado.tab = tab; renderTop(); }

    function cambiarOrdenTopDM(modo) {
        estado.orden = modo;
        renderTop();  // respuesta inmediata; el JSON de cambiarOrdenTop la reconfirma
        if (typeof window.cambiarOrdenTop === 'function') window.cambiarOrdenTop(modo);
    }

    // ── Tendencia ────────────────────────────────────────────────────────────
    function isoSemanaHoy() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 4 - (d.getDay() || 7));
        const ini = new Date(d.getFullYear(), 0, 1);
        return Math.ceil(((d - ini) / 86400000 + 1) / 7);
    }
    const numSemana = lbl => parseInt(String(lbl).replace(/\D/g, ''), 10);
    function maxRedondeado(v) {
        if (v <= 0) return 1;
        const paso = Math.pow(10, Math.floor(Math.log10(v)));
        return Math.ceil(v / paso) * paso;
    }

    const pluginSemanal = {
        id: 'dmSemanal',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea, scales } = chart;
            const datos = chart.data.datasets[0].data;
            const tope = scales.y.max;
            ctx.save();
            ctx.font = '10px sans-serif';
            ctx.fillStyle = 'rgba(94,97,117,.9)';
            ctx.strokeStyle = 'rgba(94,97,117,.35)';
            ctx.setLineDash([4, 4]);
            [tope, tope / 2].forEach(v => {
                const y = scales.y.getPixelForValue(v);
                ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
                ctx.fillText(String(Math.round(v)), chartArea.left + 2, y - 3);
            });
            ctx.setLineDash([]);
            const max = Math.max.apply(null, datos.concat([1]));
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#2C44A8';
            ctx.textAlign = 'center';
            chart.getDatasetMeta(0).data.forEach((bar, i) => {
                const v = datos[i];
                if (v > 0 && v >= max * 0.2) ctx.fillText(String(v), bar.x, bar.y - 3);
            });
            ctx.restore();
        },
    };

    function crearSemanal() {
        const tope = Math.min(isoSemanaHoy(), estado.labels.length) || estado.labels.length;
        const desde = estado.anioCompleto ? 0 : Math.max(0, tope - 28);
        const hasta = estado.anioCompleto ? estado.labels.length : tope;
        const labels = estado.labels.slice(desde, hasta).map(l => 'S' + numSemana(l));
        const datos  = estado.data.slice(desde, hasta);
        const paros  = estado.paros.slice(desde, hasta);

        // Mini KPIs sobre las semanas transcurridas del año
        let peor = -1, iPeor = -1, con = 0;
        estado.data.slice(0, tope).forEach((v, i) => { if (v > peor) { peor = v; iPeor = i; } if (v > 0) con++; });
        if ($('dm-peor-semana')) $('dm-peor-semana').textContent = peor > 0 ? `S${numSemana(estado.labels[iPeor])} · ${peor} min` : '—';
        if ($('dm-semanas-con-paros')) $('dm-semanas-con-paros').textContent = `${con} ${t.de} ${tope}`;

        const inner = $('dm-chart-inner');
        const wrap = $('dm-chart-wrap');
        wrap.classList.toggle('dm-completo', estado.anioCompleto);
        inner.style.width = estado.anioCompleto ? Math.max(labels.length * 16, wrap.clientWidth) + 'px' : '';

        const max = Math.max.apply(null, datos.concat([0]));
        const pico = Math.max(1, max);
        const primerIdx = labels.indexOf(labels.find(l => numSemana(l) % 4 === 0));
        const ini = numSemana(labels[0] || 'S1'), fin = numSemana(labels[labels.length - 1] || 'S1');
        const semPico = max > 0 ? labels[datos.indexOf(max)] : '';
        inner.setAttribute('role', 'img');
        inner.setAttribute('aria-label', `S${ini}–S${fin}` + (semPico ? ` · ${semPico}: ${max} min` : ''));

        return new Chart($('chartTendenciaMovil'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: datos,
                    backgroundColor: datos.map(v => (v === max && v > 0) ? '#3D5BD9' : '#8FA3EC'),
                    borderRadius: 3,
                    maxBarThickness: 22,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 14 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: () => '',
                            label: item => {
                                const p = paros[item.dataIndex];
                                return `${item.label} · ${item.raw} min` + (p !== undefined ? ` · ${p} ${p === 1 ? t.paro : t.paros}` : '');
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            autoSkip: false, maxRotation: 0, minRotation: 0, font: { size: 9 }, color: '#5E6175',
                            callback: (v, i) => (numSemana(labels[i]) % 4 === 0 ? labels[i] : ''),
                        },
                    },
                    y: { display: false, beginAtZero: true, max: maxRedondeado(pico) },
                },
            },
            plugins: [pluginSemanal],
        });
    }

    function renderTendencia() {
        const canvas = $('chartTendenciaMovil');
        if (!canvas || !estado.labels.length) return;
        const previo = Chart.getChart(canvas);
        if (previo) previo.destroy();
        if (cfg.esSemanas) {
            crearSemanal();
        } else {
            $('dm-chart-inner').style.height = '200px';
            crearGraficaTendencia('chartTendenciaMovil', estado.labels, estado.data,
                { fontSize: 10, maxRotation: 0, autoSkip: true });
        }
    }

    function toggleAnioCompletoDM() {
        estado.anioCompleto = !estado.anioCompleto;
        const b = $('dm-btn-anio');
        if (b) b.textContent = estado.anioCompleto ? t.verRecientes : t.verAnio;
        renderTendencia();
    }

    // ── Datos nuevos del auto-refresco / botón ↻ ──────────────────────────────
    document.addEventListener('dashboard:datos', function (e) {
        const d = e.detail || {};
        const set = (id, v) => { if ($(id) && v !== undefined) $(id).textContent = v; };
        set('dm-kpi-total', d.total_paros);
        set('dm-kpi-minutos', d.total_minutos);
        set('dm-kpi-promedio', d.promedio_min);
        set('dm-kpi-aceptados', d.aceptados);
        if (!d.total_paros) return;
        estado.turno1 = d.turno1 || 0;
        estado.turno2 = d.turno2 || 0;
        estado.tops = {
            responsables: d.top_responsables || [],
            fallas: d.top_fallas || [],
            equipos: d.top_equipos || [],
        };
        estado.orden = (new URLSearchParams(window.location.search).get('orden_top') === 'cantidad') ? 'cantidad' : 'minutos';
        if (Array.isArray(d.chart_labels)) {
            if (d.chart_labels.length !== estado.labels.length) estado.paros = [];
            estado.labels = d.chart_labels;
            estado.data = d.chart_data || [];
        }
        renderTurnos();
        renderTop();
        renderTendencia();
    });

    document.addEventListener('accentchange', renderTendencia);

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('#mf-estatus-grupo .dm-seg').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('#mf-estatus-grupo .dm-seg').forEach(b => b.setAttribute('aria-pressed', 'false'));
                this.setAttribute('aria-pressed', 'true');
            });
        });
        ['dm-sheet-filtros', 'dm-sheet-mas'].forEach(id => {
            const fondo = $(id);
            if (fondo) fondo.addEventListener('click', e => { if (e.target === fondo) cerrarSheetDM(fondo); });
        });
        renderChips();
        renderTurnos();
        renderTop();
        if (window.matchMedia('(max-width: 1023px)').matches) renderTendencia();
    });

    // Si se gira el celular o se agranda la ventana hasta el modo móvil,
    // la gráfica no existe todavía (canvas oculto al cargar): se crea ahora.
    window.matchMedia('(max-width: 1023px)').addEventListener('change', function (e) {
        if (e.matches) renderTendencia();
    });

    window.abrirSheetDM = abrirSheetDM;
    window.aplicarFiltrosDM = aplicarFiltrosDM;
    window.restablecerFiltrosDM = restablecerFiltrosDM;
    window.mostrarExtrasPeriodoDM = mostrarExtrasPeriodoDM;
    window.elegirTabDM = elegirTabDM;
    window.cambiarOrdenTopDM = cambiarOrdenTopDM;
    window.toggleAnioCompletoDM = toggleAnioCompletoDM;
})();
