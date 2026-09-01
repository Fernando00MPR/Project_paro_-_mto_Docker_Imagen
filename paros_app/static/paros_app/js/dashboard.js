/* dashboard.js — Controles de filtros, gráfica de tendencia y auto-refresh de KPIs */

// Color de acento resuelto — Chart.js/canvas no entienden var(--indigo), necesitan el valor real
function colorIndigo() {
    return getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim();
}
function colorIndigoRgba(alpha) {
    const hex = colorIndigo().replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function esModoOscuro() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

// ── Toggle rangos de fecha ────────────────────────────────────────────────────
// Llamado desde onchange del <select> de rango. Muestra u oculta los campos
// extra (semana específica o rango custom) según la opción elegida.
// Si el valor no requiere campos extra se hace submit automático del formulario.
function toggleCustom(val) {
    const wrapSemana = document.getElementById('wrap-semana');
    const wrapDesde  = document.getElementById('wrap-desde');
    const wrapHasta  = document.getElementById('wrap-hasta');
    const wrapMes    = document.getElementById('wrap-mes');
    const wrapMeses  = document.getElementById('wrap-meses');
    const btnSemana  = document.getElementById('btn-aplicar-semana');
    const btnCustom  = document.getElementById('btn-aplicar-custom');
    const btnMes     = document.getElementById('btn-aplicar-mes');
    const btnMeses   = document.getElementById('btn-aplicar-meses');
    if (wrapSemana) wrapSemana.style.display = val === 'semana_num' ? 'flex' : 'none';
    if (wrapDesde)  wrapDesde.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (wrapHasta)  wrapHasta.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (wrapMes)    wrapMes.style.display    = val === 'mes'        ? 'flex' : 'none';
    if (wrapMeses)  wrapMeses.style.display  = val === 'meses'      ? 'flex' : 'none';
    if (btnSemana)  btnSemana.style.display  = val === 'semana_num' ? 'flex' : 'none';
    if (btnCustom)  btnCustom.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (btnMes)     btnMes.style.display     = val === 'mes'        ? 'flex' : 'none';
    if (btnMeses)   btnMeses.style.display   = val === 'meses'      ? 'flex' : 'none';
    // Opciones simples (hoy, semana, mes…) no necesitan botón "Aplicar": submit inmediato
    if (val !== 'semana_num' && val !== 'custom' && val !== 'mes' && val !== 'meses') {
        document.getElementById('rango-select').closest('form').submit();
    }
}

// ── Fábrica de gráfica de tendencia ──────────────────────────────────────────
// Crea y retorna una instancia de Chart.js (barras) en el canvas indicado.
// `opciones` sobreescribe los defaults: fontSize, autoSkip, maxRotation.
function crearGraficaTendencia(canvasId, labels, data, opciones) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaults = {
        labelTop: true,
        fontSize: 11,
        autoSkip: false,
        maxRotation: 0,
    };
    const cfg = Object.assign({}, defaults, opciones);
    const indigoSolid  = colorIndigo();
    const indigoAlpha  = colorIndigoRgba(0.75);
    const colorValores = esModoOscuro() ? '#FFFFFF' : indigoSolid;

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutos',
                data: data,
                backgroundColor: indigoAlpha,
                borderColor: indigoSolid,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            layout: { padding: { top: 20 } },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: cfg.fontSize },
                        color: '#888780',
                        maxRotation: cfg.maxRotation,
                        autoSkip: cfg.autoSkip,
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(136,135,128,0.15)' },
                    ticks: {
                        font: { size: 11 },
                        color: '#888780',
                        precision: 0,
                        callback: v => v + ' min'
                    }
                }
            },
            animation: {
                // Dibuja el valor encima de cada barra usando el canvas 2D directamente,
                // ya que Chart.js no tiene una opción nativa para etiquetas sobre barras.
                // Con ≥ 25 etiquetas se omite "min" para evitar solapamiento.
                onComplete: function () {
                    const chart = this;
                    const ctx2  = chart.ctx;
                    ctx2.save();
                    ctx2.font      = `bold ${cfg.fontSize}px sans-serif`;
                    ctx2.fillStyle = colorValores;
                    ctx2.textAlign = 'center';
                    chart.data.datasets[0].data.forEach((val, i) => {
                        if (val === 0) return;
                        const bar = chart.getDatasetMeta(0).data[i];
                        if (labels.length >= 25) {
                            ctx2.fillText(val, bar.x, bar.y - 6);
                        } else {
                            ctx2.fillText('' + val + ' min', bar.x, bar.y - 6);
                        }
                    });
                    ctx2.restore();
                }
            }
        }
    });
}

// ── Auto-refresh y KPIs ───────────────────────────────────────────────────────
// IIFE para encapsular el estado (graficaTendencia) sin contaminar el scope global.
// Lee la configuración inyectada por Django en window.DASHBOARD_CFG (dashboard.html).
(function () {
    const cfg = window.DASHBOARD_CFG || {};
    let graficaTendencia = null;

    // Crear la gráfica con los datos iniciales del servidor (render SSR).
    // El auto-refresh la actualizará sin recargar la página.
    if (cfg.chartLabels && cfg.chartLabels.length) {
        graficaTendencia = crearGraficaTendencia('chartTendencia', cfg.chartLabels, cfg.chartData, cfg.chartOpts);
    }

    // Actualiza el texto de un KPI en el DOM buscando su atributo data-kpi-id.
    function _setKpi(id, val) {
        const el = document.querySelector('[data-kpi-id="' + id + '"]');
        if (el) el.textContent = val;
    }

    // Genera el HTML de una lista de ranking con barras de progreso proporcionales.
    // `maxVal` es el valor del ítem con más minutos (base del 100 %).
    // `nombreFallback` se usa cuando r.nombre es nulo (sin asignar, sin falla, etc.).
    function _buildRanking(items, maxVal, nombreFallback, color) {
        if (!items.length) return '<p style="color:var(--text-3);font-size:13px;">' + (cfg.sinDatos || 'Sin datos') + '</p>';
        return items.map(function(r) {
            const pct = Math.round(r.total / maxVal * 100);
            return '<div style="margin-bottom:10px;">'
                + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
                + '<span style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%;">' + (r.nombre || nombreFallback) + '</span>'
                + '<span style="font-size:12px;color:var(--text-2);flex-shrink:0;">' + r.total + ' · ' + r.minutos + 'min</span>'
                + '</div>'
                + '<div style="height:7px;background:var(--border);border-radius:4px;overflow:hidden;">'
                + '<div style="height:100%;background:' + color + ';border-radius:4px;width:' + pct + '%;"></div>'
                + '</div></div>';
        }).join('');
    }

    // Consulta el endpoint JSON con los mismos filtros activos en la URL.
    // Si el estado "hay datos / no hay datos" cambia respecto al render inicial,
    // recarga la página completa para mostrar u ocultar la sección de gráficas.
    function actualizarDashboard() {
        const params = new URLSearchParams(window.location.search);
        fetch((cfg.jsonUrl || '') + '?' + params)
            .then(function(r) { return r.json(); })
            .then(function(d) {
                // Recarga si aparecieron o desaparecieron paros (cambia la estructura del HTML)
                if ((d.total_paros > 0) !== cfg.initiallyHasData) {
                    location.reload();
                    return;
                }

                // KPIs superiores
                _setKpi('total_paros',   d.total_paros);
                _setKpi('total_minutos', d.total_minutos);
                _setKpi('promedio_min',  d.promedio_min);
                _setKpi('rechazados',    d.rechazados);
                _setKpi('pendiente',     d.pendiente);
                _setKpi('aceptados',     d.aceptados);

                // Sin paros: solo actualizar timestamp y salir
                if (!d.total_paros) { _marcarActualizado(); return; }

                // Actualizar gráfica de tendencia con los nuevos datos
                if (graficaTendencia) {
                    graficaTendencia.data.labels = d.chart_labels;
                    graficaTendencia.data.datasets[0].data = d.chart_data;
                    graficaTendencia.update();
                }

                // Barras de turnos — los data-attributes singular/plural vienen del HTML
                const t1 = d.turno1, t2 = d.turno2, tt = t1 + t2;
                const n1 = document.getElementById('turno1-num');
                const n2 = document.getElementById('turno2-num');
                const b1 = document.getElementById('turno1-bar');
                const b2 = document.getElementById('turno2-bar');
                const x1 = document.getElementById('turno1-texto');
                const x2 = document.getElementById('turno2-texto');
                if (n1) n1.textContent = t1;
                if (n2) n2.textContent = t2;
                if (b1) b1.style.width = (tt > 0 ? Math.round(t1/tt*100) : 0) + '%';
                if (b2) b2.style.width = (tt > 0 ? Math.round(t2/tt*100) : 0) + '%';
                if (x1) x1.textContent = t1 + ' ' + (t1 === 1 ? x1.dataset.singular : x1.dataset.plural);
                if (x2) x2.textContent = t2 + ' ' + (t2 === 1 ? x2.dataset.singular : x2.dataset.plural);

                // Rankings de responsables, fallas y equipos
                const rR = document.getElementById('ranking-responsables');
                const rF = document.getElementById('ranking-fallas');
                const rE = document.getElementById('ranking-equipos');
                if (rR) rR.innerHTML = _buildRanking(d.top_responsables, d.max_resp,   cfg.sinAsignar || 'Sin asignar', 'var(--indigo)');
                if (rF) rF.innerHTML = _buildRanking(d.top_fallas,       d.max_falla,  cfg.sinFalla   || 'Sin falla',   '#EF4444');
                if (rE) rE.innerHTML = _buildRanking(d.top_equipos,      d.max_equipo, cfg.sinEquipo  || 'Sin equipo',  '#10B981');

                _marcarActualizado();
            })
            .catch(function() {});  // Errores de red se ignoran silenciosamente
    }

    // Muestra la hora de la última actualización en formato HH:MM:SS.
    function _marcarActualizado() {
        const el = document.getElementById('ultima-actualizacion');
        if (!el) return;
        const n = new Date();
        el.textContent = n.getHours().toString().padStart(2,'0') + ':'
                       + n.getMinutes().toString().padStart(2,'0') + ':'
                       + n.getSeconds().toString().padStart(2,'0');
    }

    // Exponer para el botón "Actualizar ahora" del HTML y programar refresh cada 60 s
    window.actualizarDashboard = actualizarDashboard;
    setInterval(actualizarDashboard, 60000);

    // Redibujar la gráfica al cambiar el color de acento o el tema. Se destruye y
    // recrea (no basta con .update()) porque el texto sobre las barras se pinta
    // en un callback que capturó el color viejo al crear el chart.
    document.addEventListener('accentchange', function () {
        if (!graficaTendencia) return;
        const labels = graficaTendencia.data.labels;
        const data   = graficaTendencia.data.datasets[0].data;
        graficaTendencia.destroy();
        graficaTendencia = crearGraficaTendencia('chartTendencia', labels, data, cfg.chartOpts);
    });

})();
