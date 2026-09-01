// ──────────────────────────────────────────────────────────────
//  indicadores_produccion.js
// ──────────────────────────────────────────────────────────────

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

// ── Colapsar gráfico de Tendencia ───────────────────────────────
function toggleTendencia() {
    const el   = document.getElementById('tendencia-content');
    const chev = document.getElementById('chev-tendencia');
    const collapsed = el.classList.toggle('collapsed');
    chev.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    localStorage.setItem('tendencia-collapsed', collapsed ? '1' : '0');
    if (!collapsed) cargarTendencia();
}

if (localStorage.getItem('tendencia-collapsed') === '1') {
    document.addEventListener('DOMContentLoaded', () => {
        const el   = document.getElementById('tendencia-content');
        const chev = document.getElementById('chev-tendencia');
        if (el)   el.classList.add('collapsed');
        if (chev) chev.style.transform = 'rotate(-90deg)';
    });
}

// ── Filtros de período ────────────────────────────────────────
function togglePeriodo(v, autoSubmit) {
    document.getElementById('wrap-semana-num').style.display       = v === 'semana_num'  ? 'flex' : 'none';
    document.getElementById('wrap-mes-elegido').style.display      = v === 'mes_elegido' ? 'flex' : 'none';
    document.getElementById('wrap-anio-mes-elegido').style.display = v === 'mes_elegido' ? 'flex' : 'none';
    document.getElementById('wrap-desde').style.display            = v === 'custom'      ? 'flex' : 'none';
    document.getElementById('wrap-hasta').style.display            = v === 'custom'      ? 'flex' : 'none';

    if (autoSubmit && (v === 'semana' || v === 'mes')) {
        document.getElementById('form-filtros').submit();
    }
}

// ── Conversión de fechas ──────────────────────────────────────
function fmtFecha(val) {
    if (!val) return '';
    const [y, m, d] = val.split('-');
    if (!y || !m || !d) return '';
    return `${d}/${m}/${y.slice(2)}`;
}

function parseFecha(val) {
    if (!val) return '';
    const [d, m, y] = val.split('/');
    if (!d || !m || !y) return '';
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

// ── Columna de indicador activo en tabla ──────────────────────
function mostrarColumnaIndicador(ind) {
    const MAP = {
        'downtime':       'col-dt',
        'disponibilidad': 'col-dt',
        'mttr':           'col-mttr',
        'mtbf':           'col-mtbf',
        't_muerto_mant':  'col-mttr',
    };
    ['col-dt', 'col-mttr', 'col-mtbf'].forEach(cls => {
        document.querySelectorAll('.' + cls).forEach(el => el.style.display = 'none');
    });
    const activa = MAP[ind] || 'col-dt';
    document.querySelectorAll('.' + activa).forEach(el => el.style.display = '');
}

// ── Poblar valores KPI en la columna activa ───────────────────
function poblarValoresTabla() {
    const ind = window.INDICADOR_ACTUAL;
    const UNIDADES = { downtime:'%', disponibilidad:'%', mttr:' min', mtbf:' h', t_muerto_mant:' min', planeado:' min' };
    const unidad = UNIDADES[ind] || '';

    const CLAVE = {
        downtime: 'dt', disponibilidad: 'disp',
        mttr: 'mttr', mtbf: 'mtbf', t_muerto_mant: 'tmuerto'
    };
    const ID_MAP = {
        downtime: 'tdt', disponibilidad: 'tdt',
        mttr: 'tmttr', mtbf: 'tmtbf', t_muerto_mant: 'tmttr'
    };

    const clave  = CLAVE[ind]  || 'dt';
    const idPref = ID_MAP[ind] || 'tdt';

    DATOS_DIAS.forEach((d, i) => {
        const idx = i + 1;
        const td = document.getElementById(idPref + '-' + idx);
        if (!td) return;
        const tr = td.closest('tr');

        // Quitar clases previas
        tr.classList.remove('ind-sobre-target', 'ind-ok-target', 'ind-sin-datos');

        if (!d.tiene) {
            td.innerHTML = '<span class="val-na">—</span>';
            return;
        }
        if (d[clave] === null || d[clave] === undefined) {
            td.innerHTML = '<span class="val-na">—</span>';
            tr.classList.add('ind-sin-datos');
            return;
        }

        let esRed = false;
        if (window.TARGET_VALOR !== null) {
            if ((ind === 'downtime' || ind === 'mttr' || ind === 't_muerto_mant') && d[clave] >= window.TARGET_VALOR) esRed = true;
            if ((ind === 'disponibilidad' || ind === 'mtbf') && d[clave] < window.TARGET_VALOR) esRed = true;
        }

        const valorMostrar = d[clave] === 0.01 ? 0 : d[clave];

        // Tooltip — solo si hay target configurado
        let tooltipHtml = '';
        if (window.TARGET_VALOR !== null) {
            const diff = Math.abs(valorMostrar - window.TARGET_VALOR).toFixed(1);
            if (esRed) {
                const esBajo = ind === 'disponibilidad' || ind === 'mtbf';
                tooltipHtml = `<div class="badge-tooltip">
                    <div style="color:#A32D2D;font-weight:500">${esBajo ? 'Bajo' : 'Supera'} target de ${window.TARGET_VALOR}${unidad}</div>
                    <div style="color:var(--text-3);margin-top:2px">${esBajo ? '−' : '+'}${diff}${unidad} ${esBajo ? 'bajo' : 'sobre'} el límite</div>
                </div>`;
            } else {
                tooltipHtml = `<div class="badge-tooltip">
                    <div style="color:#3B6D11;font-weight:500">Dentro del target de ${window.TARGET_VALOR}${unidad}</div>
                    <div style="color:var(--text-3);margin-top:2px">−${diff}${unidad} bajo el límite</div>
                </div>`;
            }
        }

        // Badge + tooltip dentro del wrapper
        if (esRed) {
            td.innerHTML = `<div class="badge-tooltip-wrap">
                <span class="badge-ind badge-ind-red">↑ ${valorMostrar}${unidad}</span>
                ${tooltipHtml}
            </div>`;
            tr.classList.add('ind-sobre-target');
        } else if (window.TARGET_VALOR !== null) {
            td.innerHTML = `<div class="badge-tooltip-wrap">
                <span class="badge-ind badge-ind-green">✓ ${valorMostrar}${unidad}</span>
                ${tooltipHtml}
            </div>`;
            tr.classList.add('ind-ok-target');
        } else {
            td.innerHTML = `<div class="badge-tooltip-wrap">
                <span class="badge-ind badge-ind-gray">${valorMostrar}${unidad}</span>
            </div>`;
            tr.classList.add('ind-sin-datos');
        }
    });
}

// ── Seleccionar indicador (pill) ──────────────────────────────
function seleccionarIndicador(val) {
    document.getElementById('input-indicador').value = val;
    document.getElementById('form-filtros').submit();
}

// ── Outlier detection ─────────────────────────────────────────
function detectarOutlier() {
    const valoresPos = VALORES.filter(v => v !== null && v > 0);
    const maxReal = valoresPos.length > 0 ? Math.max(...valoresPos) : 0;

    let axisMax = undefined;
    if (maxReal > 0) {
        const base = TARGET !== null ? Math.max(maxReal, TARGET) : maxReal;
        axisMax = Math.ceil(base * 1.1);
    } else if (TARGET !== null) {
        axisMax = Math.ceil(TARGET * 1.1);
    }

    return { axisMax, hayOutlier: false };
}

function esRojo(v, hayOutlier, axisMax) {
    if (v === null) return false;
    const ind = window.INDICADOR_ACTUAL;
    const ejesFijos = ind === 'downtime' || ind === 'disponibilidad';
    if (!ejesFijos && hayOutlier && axisMax !== undefined && v > axisMax) return true;
    if (TARGET !== null) {
        if ((ind === 'downtime' || ind === 'mttr') && v >= TARGET) return true;
        if ((ind === 'disponibilidad' || ind === 'mtbf') && v < TARGET) return true;
    }
    return false;
}

// ── Gráfica ───────────────────────────────────────────────────
function crearGrafica() {
    const { axisMax, hayOutlier } = detectarOutlier();
    const indigoAlpha = colorIndigoRgba(0.75);
    const indigoSolid = colorIndigo();
    const bgColors = VALORES.map(v => esRojo(v, hayOutlier, axisMax) ? 'rgba(239,68,68,0.80)' : indigoAlpha);
    const bdColors = VALORES.map(v => esRojo(v, hayOutlier, axisMax) ? '#DC2626'              : indigoSolid);

    const UNIDADES = { downtime:'%', disponibilidad:'%', mttr:' min', mtbf:' h', t_muerto_mant:' min', planeado:' min' };
    const unidad = UNIDADES[window.INDICADOR_ACTUAL] || '';

    const ctx   = document.getElementById('chartIndicador').getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: LABELS,
            datasets: [
                {
                    label: IND_LBL,
                    data: VALORES,
                    backgroundColor: bgColors,
                    borderColor: bdColors,
                    borderWidth: 1,
                    borderRadius: 4,
                    order: 2,
                },
                ...(TARGET !== null ? [{
                    type: 'line',
                    label: 'Target',
                    data: LABELS.map(() => TARGET),
                    borderColor: '#F59E0B',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    tension: 0,
                    fill: false,
                    order: 1,
                }] : [])
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: TARGET !== null, position: 'bottom', labels: { boxWidth: 24, padding: 16, font: { size: 12 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.dataset.label === 'Target') return ' Target: ' + ctx.parsed.y + unidad;
                            const v = ctx.parsed.y;
                            return ' ' + (v === 0.01 ? '0' : v) + unidad;
                        }
                    }
                }
            },
            layout: { padding: { top: 36, bottom: 4 } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780', maxRotation: 60, autoSkip: true, autoSkipPadding: 8 } },
                y: {
                    beginAtZero: true,
                    max: window.INDICADOR_ACTUAL === 'disponibilidad' ? 120 
                    : window.INDICADOR_ACTUAL === 'mtbf' ? 24 
                    : axisMax,
                    suggestedMax: Math.max(...VALORES.filter(v => v > 0)) > 0 ? undefined : 1,
                    grid: { color: 'rgba(136,135,128,0.15)' },
                    ticks: {
                        font: { size: 11 },
                        color: '#888780',
                        precision: 1,
                        callback: function(value) {
                            if (window.INDICADOR_ACTUAL === 'downtime' || window.INDICADOR_ACTUAL === 'disponibilidad') {
                                return value + '%';
                            }
                            return value;
                        }
                    }
                }
            },
            animation: {
                onComplete: function () {
                    const chart = this;
                    const meta  = chart.getDatasetMeta(0);
                    const barWidth = meta.data.length > 0 ? meta.data[0].width : 0;
                    if (barWidth < 18) return;
                    const ctx2 = chart.ctx;
                    ctx2.save();
                    ctx2.font = 'bold 11px sans-serif';
                    ctx2.textAlign = 'center';
                    chart.data.datasets[0].data.forEach((val, i) => {
                        if (!val) return;
                        const bar = meta.data[i];
                        const ind = window.INDICADOR_ACTUAL;
                        const ejesFijos = ind === 'downtime' || ind === 'disponibilidad' || ind === 'mtbf';
                        const esRecortada = !ejesFijos && hayOutlier && axisMax !== undefined && val > axisMax;
                        const label = val === 0.01 ? '0' + unidad : val + unidad;
                        const rojo = esRojo(val, hayOutlier, axisMax);

                        if (esRecortada) {
                            const yArea = chart.chartArea.top + 16;
                            const bw = bar.width || 30;
                            ctx2.fillStyle = rojo ? '#DC2626' : indigoSolid;
                            ctx2.fillRect(bar.x - bw / 2, chart.chartArea.top, bw, 20);
                            ctx2.fillStyle = '#ffffff';
                            ctx2.fillText(label, bar.x, yArea);
                        } else if (rojo) {
                            // Siempre arriba de la barra en rojo, sin importar qué tan cerca esté del techo
                            const yPos = Math.max(bar.y - 6, chart.chartArea.top + 12);
                            ctx2.fillStyle = '#DC2626';
                            ctx2.fillText(label, bar.x, yPos);
                        } else {
                            const yPos = bar.y - 6;
                            const dentroDeBar = yPos < 14;
                            if (dentroDeBar) {
                                ctx2.fillStyle = '#ffffff';
                                ctx2.fillText(label, bar.x, bar.y + 16);
                            } else {
                                const esDark = document.documentElement.getAttribute('data-theme') === 'dark';
                                ctx2.fillStyle = esDark ? '#FFFFFF' : indigoSolid;
                                ctx2.fillText(label, bar.x, yPos);
                            }
                        }
                    });
                    ctx2.restore();
                }
            }
        }
    });
    window._chart = chart;
    window._chart._bgColors = bgColors;
    window._chart._bdColors = bdColors;
}

function cambiarTipo(tipo) {
    const chart = window._chart;
    if (!chart) return;
    ['bar', 'line', 'area'].forEach(t => {
        const btn = document.getElementById('btn-tipo-' + t);
        if (btn) {
            btn.style.background = t === tipo ? 'var(--indigo)' : 'var(--white)';
            btn.style.color      = t === tipo ? '#fff'        : 'var(--text)';
        }
    });
    const ds = chart.data.datasets[0];
    if (tipo === 'bar') {
        ds.type = 'bar'; ds.fill = false; ds.tension = undefined;
        ds.pointRadius = undefined; ds.borderWidth = 1; ds.borderRadius = 4;
        ds.backgroundColor = chart._bgColors; ds.borderColor = chart._bdColors;
    } else if (tipo === 'line') {
        ds.type = 'line'; ds.fill = false; ds.tension = 0.3; ds.pointRadius = 4;
        ds.pointBackgroundColor = chart._bgColors; ds.borderWidth = 2;
        ds.borderRadius = 0; ds.backgroundColor = 'transparent'; ds.borderColor = colorIndigo();
    } else if (tipo === 'area') {
        ds.type = 'line'; ds.fill = true; ds.tension = 0.3; ds.pointRadius = 4;
        ds.pointBackgroundColor = chart._bgColors; ds.borderWidth = 2;
        ds.borderRadius = 0; ds.backgroundColor = colorIndigoRgba(0.12); ds.borderColor = colorIndigo();
    }
    chart.config.type = tipo === 'bar' ? 'bar' : 'line';
    chart.update();
}

function descargarGrafica() {
    const canvas = document.getElementById('chartIndicador');
    const tmp    = document.createElement('canvas');
    tmp.width    = canvas.width;
    tmp.height   = canvas.height;
    const ctx    = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    const link    = document.createElement('a');
    link.download = `Indicador_${window.INDICADOR_ACTUAL}_${window.AREA_NOMBRE}.png`;
    link.href     = tmp.toDataURL('image/png');
    link.click();
}

function descargarGraficaTendencia() {
    const canvas = document.getElementById('chartTendencia');
    if (!canvas) return;
    const tmp    = document.createElement('canvas');
    tmp.width    = canvas.width;
    tmp.height   = canvas.height;
    const ctx    = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    const link    = document.createElement('a');
    link.download = `Tendencia_${window.INDICADOR_ACTUAL}_${tendenciaGranularidad}_${window.AREA_NOMBRE}.png`;
    link.href     = tmp.toDataURL('image/png');
    link.click();
}

// ── Tabla: ocultar filas sin registro ─────────────────────────
let ocultando = localStorage.getItem('ind-ocultar-sin-registro') === 'true';

function toggleSinRegistros() {
    ocultando = !ocultando;
    localStorage.setItem('ind-ocultar-sin-registro', ocultando);
    aplicarFiltroTabla();
}

function aplicarFiltroTabla() {
    document.querySelectorAll('tbody tr[data-fecha]').forEach(tr => {
        const ocultoPorSinRegistro = ocultando && tr.classList.contains('sin-registro');
        const ocultoPorTarget = tr.dataset.ocultoPorTarget === 'true';
        tr.style.display = (ocultoPorSinRegistro || ocultoPorTarget) ? 'none' : '';
    });
    const btn = document.getElementById('btn-filtrar');
    if (btn) btn.textContent = ocultando ? window.TXT_MOSTRAR_SIN_REGISTRO : window.TXT_OCULTAR_SIN_REGISTRO;
}

let filtroTarget = localStorage.getItem('ind-filtro-target') || 'fuera';

function aplicarFiltroTarget(valorForzado) {
    const sel = document.getElementById('sel-filtro-target');
    filtroTarget = valorForzado !== undefined ? valorForzado : (sel ? sel.value : 'todos');
    localStorage.setItem('ind-filtro-target', filtroTarget);

    document.querySelectorAll('tbody tr[data-fecha]').forEach(tr => {
        if (filtroTarget === 'todos') {
            tr.dataset.ocultoPorTarget = 'false';
        } else if (filtroTarget === 'dentro') {
            tr.dataset.ocultoPorTarget = tr.classList.contains('ind-ok-target') ? 'false' : 'true';
        } else if (filtroTarget === 'fuera') {
            tr.dataset.ocultoPorTarget = tr.classList.contains('ind-sobre-target') ? 'false' : 'true';
        }
    });
    aplicarFiltroTabla();
}

// ── Panel de columnas ─────────────────────────────────────────
function toggleColPanel() {
    document.getElementById('col-panel').classList.toggle('open');
}

document.addEventListener('click', function (e) {
    const wrap = document.querySelector('.col-panel-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const panel = document.getElementById('col-panel');
        if (panel) panel.classList.remove('open');
    }
});

function toggleCol(cls) {
    const els = document.querySelectorAll('.' + cls);
    if (!els.length) return;
    const hide = els[0].style.display !== 'none';
    els.forEach(el => { el.style.display = hide ? 'none' : ''; });
}

// ── Estatus (semáforo) — derivado de fechas, con override manual ──────
const ESTATUS_LABELS = { p: 'Pendiente', e: 'En proceso', c: 'Cerrada', n: 'No aplica' };

function deriveStatus(isoInicio, isoCierre) {
    if (!isoInicio) return 'p';
    if (!isoCierre) return 'e';
    return 'c';
}

// ── Responsable — autocompletado restringido a usuarios existentes ────
let RESPONSABLES_VALIDOS = null;

function nombresResponsablesValidos() {
    if (RESPONSABLES_VALIDOS) return RESPONSABLES_VALIDOS;
    const datalist = document.getElementById('datalist-responsables');
    RESPONSABLES_VALIDOS = new Set(datalist ? Array.from(datalist.options).map(o => o.value) : []);
    return RESPONSABLES_VALIDOS;
}

function validarResponsable(el) {
    const val = el.value.trim();
    if (val && !nombresResponsablesValidos().has(val)) {
        el.value = '';
    }
}

function filtrarResponsables(query) {
    const q = query.trim().toLowerCase();
    const nombres = Array.from(nombresResponsablesValidos());
    if (!q) return nombres.slice(0, 8);
    return nombres.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
}

let respAutocompleteState = null; // { tr, input, nombres, indice }

function mostrarAutocompleteResponsable(el) {
    const tr = el.closest('tr');
    if (!tr) return;
    const nombres = filtrarResponsables(el.value);
    respAutocompleteState = { tr, input: el, nombres, indice: -1 };
    renderAutocompleteResponsable();
}

function renderAutocompleteResponsable() {
    const box = document.getElementById('resp-autocomplete');
    if (!box || !respAutocompleteState) return;
    const { input, nombres, indice } = respAutocompleteState;

    if (!nombres.length) {
        box.innerHTML = `<div class="resp-autocomplete-empty">Sin coincidencias</div>`;
    } else {
        box.innerHTML = nombres.map((n, i) =>
            `<button type="button" class="resp-autocomplete-item${i === indice ? ' highlighted' : ''}" ` +
            `onmousedown="event.preventDefault(); seleccionarResponsableAutocomplete(${i});">${n}</button>`
        ).join('');
    }

    box.style.display = 'block';
    const rect = input.getBoundingClientRect();
    const boxWidth = Math.max(box.offsetWidth || 0, rect.width);
    let left = rect.left;
    if (left + boxWidth > window.innerWidth - 8) left = window.innerWidth - boxWidth - 8;
    let top = rect.bottom + 4;
    const boxHeight = box.offsetHeight || 0;
    if (top + boxHeight > window.innerHeight - 8) top = rect.top - boxHeight - 4;
    box.style.minWidth = rect.width + 'px';
    box.style.left = Math.max(8, left) + 'px';
    box.style.top  = Math.max(8, top) + 'px';
}

function ocultarAutocompleteResponsable() {
    const box = document.getElementById('resp-autocomplete');
    if (box) box.style.display = 'none';
    respAutocompleteState = null;
}

function moverResaltadoResponsable(delta) {
    if (!respAutocompleteState || !respAutocompleteState.nombres.length) return;
    const n = respAutocompleteState.nombres.length;
    respAutocompleteState.indice = (respAutocompleteState.indice + delta + n) % n;
    renderAutocompleteResponsable();
}

// El atributo size ajusta el ancho por caracteres — funciona en todos los
// navegadores, a diferencia de field-sizing:content (sin soporte en Firefox).
function ajustarAnchoResponsable(el) {
    el.setAttribute('size', Math.max(el.value.length, 12));
}

function seleccionarResponsableAutocomplete(i) {
    if (!respAutocompleteState) return;
    const { tr, input, nombres } = respAutocompleteState;
    const nombre = nombres[i];
    if (nombre === undefined) return;
    input.value = nombre;
    ajustarAnchoResponsable(input);
    ocultarAutocompleteResponsable();
    guardarFila(tr);
    input.focus();
}

// ── Obtener datos de una fila ─────────────────────────────────
function datosDeFila(tr) {
    const get  = cls => { const el = tr.querySelector(cls); return el ? el.value.trim() : ''; };
    
    return {
        area_id:           window.AREA_ID,
        fecha:             tr.dataset.fecha,
        equipo:            window.EQUIPO_SEL,
        indicador:         window.INDICADOR_ACTUAL,
        problema:          get('.problema-input'),
        cont_accion:       get('.cont-accion'),
        cont_fecha_inicio: fmtFecha(get('.cont-fi')),
        cont_fecha_fin:    fmtFecha(get('.cont-ff')),
        cont_estatus:      get('.cont-status') || 'p',
        corr_accion:       get('.corr-accion'),
        corr_fecha_inicio: fmtFecha(get('.corr-fi')),
        corr_fecha_fin:    fmtFecha(get('.corr-ff')),
        corr_estatus:      get('.corr-status') || 'p',
        prev_accion:       get('.prev-accion'),
        prev_fecha_inicio: fmtFecha(get('.prev-fi')),
        prev_fecha_fin:    fmtFecha(get('.prev-ff')),
        prev_estatus:      get('.prev-status') || 'p',
        responsable:       get('.resp-input'),
    };
}

// ── Toast ─────────────────────────────────────────────────────
function mostrarToast(msg, ok) {
    let t = document.getElementById('acc-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'acc-toast';
        t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;z-index:9999;transition:opacity .3s;';
        document.body.appendChild(t);
    }
    t.textContent      = msg;
    t.style.background = ok ? '#DCFCE7' : '#FEE2E2';
    t.style.color      = ok ? '#15803D' : '#991B1B';
    t.style.opacity    = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ── Guardar fila vía AJAX ─────────────────────────────────────
function guardarFila(tr) {
    const datos = datosDeFila(tr);
    if (!datos.fecha) return;
    fetch(window.URLS.guardarAccion, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': window.CSRF_TOKEN },
        body: JSON.stringify(datos),
    })
    .then(r => r.json())
    .then(d => {
        if (d.ok) mostrarToast(d.msg, true);
        else      mostrarToast('Error: ' + d.error, false);
    })
    .catch(() => mostrarToast('Error de conexión', false));
}

// ── Cargar datos guardados en una fila ────────────────────────
function cargarFila(tr) {
    const fecha = tr.dataset.fecha;
    if (!fecha) return;
    if (!DATOS_DIAS[parseInt(tr.dataset.idx) - 1]?.tiene) return;
    const url = `${window.URLS.obtenerAccion}?area_id=${window.AREA_ID}&fecha=${fecha}&equipo=${encodeURIComponent(window.EQUIPO_SEL)}&indicador=${window.INDICADOR_ACTUAL}`;
    fetch(url)
    .then(r => r.json())
    .then(d => {
        if (!d.ok) return;
        const data = d.data;
        const set  = (cls, val) => { const el = tr.querySelector(cls); if (el) el.value = val || ''; };
        
        set('.problema-input', data.problema);
        set('.cont-accion',    data.cont_accion);
        set('.cont-fi',        parseFecha(data.cont_fecha_inicio));
        set('.cont-ff',        parseFecha(data.cont_fecha_fin));
        set('.cont-status',    data.cont_estatus || 'p');
        set('.corr-accion',    data.corr_accion);
        set('.corr-fi',        parseFecha(data.corr_fecha_inicio));
        set('.corr-ff',        parseFecha(data.corr_fecha_fin));
        set('.corr-status',    data.corr_estatus || 'p');
        set('.prev-accion',    data.prev_accion);
        set('.prev-fi',        parseFecha(data.prev_fecha_inicio));
        set('.prev-ff',        parseFecha(data.prev_fecha_fin));
        set('.prev-status',    data.prev_estatus || 'p');
        set('.resp-input',     data.responsable);

        const respEl = tr.querySelector('.resp-input');
        if (respEl) ajustarAnchoResponsable(respEl);

        // Inicializar contadores tras cargar datos
        tr.querySelectorAll('.problema-input, .cont-accion, .corr-accion, .prev-accion').forEach(el => {
            el.dispatchEvent(new Event('input'));
            autoGrowTextarea(el);
        });

        // Repintar las celdas de rango de fechas con los datos cargados
        ['cont', 'corr', 'prev'].forEach(fase => renderCeldaRango(tr, fase));

    })
    .catch(() => {
        console.warn(`cargarFila: fallo al cargar fila ${fecha}`);
    });
}

// ── Celda de rango de fechas (Contención / Correctiva / Preventiva) ───
function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasEntre(isoInicio, isoFin) {
    const d1 = new Date(isoInicio + 'T00:00:00');
    const d2 = new Date(isoFin + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
}

function anioDeFila(tr) {
    const partes = (tr.dataset.fecha || '').split('/');
    if (partes.length !== 3) return null;
    const y = partes[2];
    return parseInt(y.length === 2 ? '20' + y : y, 10);
}

function fmtCorto(iso, anioFila) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return (anioFila && parseInt(y, 10) !== anioFila) ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}`;
}

const FASE_INFO = {
    cont: { label: 'contención',            clase: 'fase-cont' },
    corr: { label: 'la acción correctiva',  clase: 'fase-corr' },
    prev: { label: 'la acción preventiva',  clase: 'fase-prev' },
};

function renderCeldaRango(tr, fase) {
    const wrap = tr.querySelector('.rango-' + fase);
    if (!wrap) return;
    const fi     = tr.querySelector('.' + fase + '-fi');
    const ff     = tr.querySelector('.' + fase + '-ff');
    const stEl   = tr.querySelector('.' + fase + '-status');
    const inicio = fi ? fi.value : '';
    const cierre = ff ? ff.value : '';
    const anioFila = anioDeFila(tr);

    const derivado = deriveStatus(inicio, cierre);
    const estatus  = (stEl && stEl.value) || derivado;
    const fijado   = estatus !== derivado;

    // Mientras no hay fecha de inicio ("Fijar fechas"), el punto se ve gris —
    // salvo que el estatus haya sido fijado manualmente a otra cosa.
    const dotColor = (!inicio && !fijado) ? 'n' : estatus;

    const dotHtml =
        `<button type="button" class="rango-dot-btn" aria-haspopup="menu" ` +
        `title="${ESTATUS_LABELS[estatus]}${fijado ? ' · fijado manualmente' : ''}" ` +
        `aria-label="Estatus: ${ESTATUS_LABELS[estatus]}" ` +
        `onclick="event.stopPropagation(); abrirMenuEstatus(event, this, '${fase}');">` +
        `<span class="rango-dot rango-dot-${dotColor}${fijado ? ' rango-dot-fijado' : ''}"></span>` +
        `</button>`;

    wrap.classList.remove('rango-vacia', 'rango-abierta', 'rango-cerrada');

    if (!inicio) {
        wrap.classList.add('rango-vacia');
        wrap.innerHTML = dotHtml + `<span class="rango-placeholder">Fijar fechas</span>`;
        wrap.setAttribute('aria-label', `Editar fechas de ${FASE_INFO[fase].label}`);
        return;
    }

    const dur     = diasEntre(inicio, cierre || hoyISO()) + 1;
    const abierta = !cierre;
    wrap.classList.add(abierta ? 'rango-abierta' : 'rango-cerrada');

    const finTxt     = abierta ? 'abierta' : fmtCorto(cierre, anioFila);
    const chipClase  = estatus === 'e' ? ' rango-chip-e' : estatus === 'c' ? ' rango-chip-c' : '';
    const chipHtml   = (estatus === 'p' || estatus === 'n') ? '' : `<span class="rango-chip${chipClase}">${dur} d</span>`;

    wrap.innerHTML =
        dotHtml +
        `<span class="rango-fecha">${fmtCorto(inicio, anioFila)}</span>` +
        `<span class="rango-flecha">→</span>` +
        `<span class="rango-fecha">${finTxt}</span>` +
        chipHtml;
    wrap.setAttribute('aria-label', `Editar fechas de ${FASE_INFO[fase].label}, inicio ${fmtCorto(inicio, anioFila)}`);
}

// ── Menú de estatus manual ──────────────────────────────────────
let menuEstatusState = null;

function abrirMenuEstatus(event, btnEl, fase) {
    const tr = btnEl.closest('tr');
    if (!tr) return;
    const stEl   = tr.querySelector('.' + fase + '-status');
    const actual = (stEl && stEl.value) || 'p';

    menuEstatusState = { tr, fase, btn: btnEl };

    const menu = document.getElementById('menu-estatus');
    menu.querySelectorAll('.menu-estatus-item').forEach(item => {
        const esActual = item.dataset.val === actual;
        item.classList.toggle('actual', esActual);
        item.setAttribute('aria-checked', esActual ? 'true' : 'false');
    });

    menu.style.display = 'block';
    const rect = btnEl.getBoundingClientRect();
    const menuWidth  = menu.offsetWidth  || 246;
    const menuHeight = menu.offsetHeight || 220;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 4;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top  = Math.max(8, top) + 'px';

    const primerItem = menu.querySelector('.menu-estatus-item');
    if (primerItem) primerItem.focus();
}

function cerrarMenuEstatus() {
    const menu = document.getElementById('menu-estatus');
    menu.style.display = 'none';
    const btn = menuEstatusState ? menuEstatusState.btn : null;
    menuEstatusState = null;
    if (btn) btn.focus();
}

function seleccionarEstatusMenu(val) {
    if (!menuEstatusState) return;
    const { tr, fase } = menuEstatusState;
    const stEl = tr.querySelector('.' + fase + '-status');
    const fi   = tr.querySelector('.' + fase + '-fi');
    const ff   = tr.querySelector('.' + fase + '-ff');
    if (stEl) stEl.value = val === null ? deriveStatus(fi.value, ff.value) : val;
    renderCeldaRango(tr, fase);
    guardarFila(tr);
    cerrarMenuEstatus();
}

// ── Leyenda de estatus (colapsable, recuerda preferencia) ────────
function toggleLeyendaEstatus() {
    const el = document.getElementById('leyenda-estatus');
    if (!el) return;
    const colapsada = el.classList.toggle('colapsada');
    localStorage.setItem('indicadores_leyenda_colapsada', colapsada ? '1' : '0');
}

// ── Modal de edición de fechas ─────────────────────────────────
let modalFechasState = null;

function abrirModalFechas(celdaEl, fase) {
    const tr = celdaEl.closest('tr');
    if (!tr) return;
    const fi = tr.querySelector('.' + fase + '-fi');
    const ff = tr.querySelector('.' + fase + '-ff');
    if (!fi || !ff) return;

    modalFechasState = {
        tr, fase, celda: celdaEl,
        inicioInicial: fi.value,
        cierreInicial: ff.value,
    };

    const info  = FASE_INFO[fase];
    const panel = document.querySelector('#modal-fechas .modal-fechas-panel');
    panel.classList.remove('fase-cont', 'fase-corr', 'fase-prev');
    panel.classList.add(info.clase);

    document.getElementById('modal-fechas-fase-label').textContent = info.label;
    const problema = tr.querySelector('.problema-input');
    const subt = tr.dataset.fecha + (problema && problema.value ? ' · ' + problema.value : '');
    document.getElementById('modal-fechas-subtitulo').textContent = subt;

    document.getElementById('modal-fecha-inicio').value = fi.value;
    document.getElementById('modal-fecha-cierre').value = ff.value;

    actualizarResumenModalFechas();

    const overlay = document.getElementById('modal-fechas');
    overlay.style.display = 'flex';
    const inputInicio = document.getElementById('modal-fecha-inicio');
    inputInicio.focus();
    if (inputInicio.select) inputInicio.select();
}

function validarModalFechas() {
    const inicio = document.getElementById('modal-fecha-inicio').value;
    const cierre = document.getElementById('modal-fecha-cierre').value;
    const errInicio = document.getElementById('modal-fechas-error-inicio');
    const errCierre = document.getElementById('modal-fechas-error-cierre');
    errInicio.textContent = '';
    errCierre.textContent = '';
    let ok = true;

    if (cierre && !inicio) {
        errInicio.textContent = 'Captura primero la fecha de inicio';
        ok = false;
    }
    if (inicio && cierre && cierre < inicio) {
        errCierre.textContent = 'El cierre no puede ser anterior al inicio';
        ok = false;
    }
    if (inicio && modalFechasState && modalFechasState.fase !== 'prev' && inicio > hoyISO()) {
        errInicio.textContent = 'El inicio no puede ser futuro';
        ok = false;
    }

    const btnGuardar = document.getElementById('modal-fechas-guardar');
    btnGuardar.disabled = !ok;
    btnGuardar.style.opacity = ok ? '1' : '.45';
    return ok;
}

function actualizarResumenModalFechas() {
    const inicio = document.getElementById('modal-fecha-inicio').value;
    const cierre = document.getElementById('modal-fecha-cierre').value;
    const el = document.getElementById('modal-fechas-duracion');
    const ok = validarModalFechas();
    if (!ok || !inicio) { el.textContent = '—'; return; }
    const dur = diasEntre(inicio, cierre || hoyISO()) + 1;
    el.textContent = cierre ? `${dur} día${dur === 1 ? '' : 's'}` : `${dur} día${dur === 1 ? '' : 's'} (abierta)`;
}

function modalAtajoInicioHoy() {
    document.getElementById('modal-fecha-inicio').value = hoyISO();
    actualizarResumenModalFechas();
}

function modalAtajoCierreHoy() {
    document.getElementById('modal-fecha-cierre').value = hoyISO();
    actualizarResumenModalFechas();
}

function modalAtajoMismoDia() {
    const inicio = document.getElementById('modal-fecha-inicio').value;
    if (!inicio) return;
    document.getElementById('modal-fecha-cierre').value = inicio;
    actualizarResumenModalFechas();
}

function modalAtajoSinCierre() {
    document.getElementById('modal-fecha-cierre').value = '';
    actualizarResumenModalFechas();
}

function guardarModalFechas() {
    if (!modalFechasState || !validarModalFechas()) return;
    const { tr, fase } = modalFechasState;
    const fi   = tr.querySelector('.' + fase + '-fi');
    const ff   = tr.querySelector('.' + fase + '-ff');
    const stEl = tr.querySelector('.' + fase + '-status');

    // Un estatus fijado a mano no se sobrescribe al guardar fechas
    const fijadoAntes = stEl && stEl.value && stEl.value !== deriveStatus(fi.value, ff.value);

    fi.value = document.getElementById('modal-fecha-inicio').value;
    ff.value = document.getElementById('modal-fecha-cierre').value;

    if (stEl && !fijadoAntes) {
        stEl.value = deriveStatus(fi.value, ff.value);
    }

    renderCeldaRango(tr, fase);
    guardarFila(tr);
    cerrarModalFechas(true);
}

function cerrarModalFechas(skipConfirm) {
    if (!skipConfirm && modalFechasState) {
        const inicio = document.getElementById('modal-fecha-inicio').value;
        const cierre = document.getElementById('modal-fecha-cierre').value;
        const cambio = inicio !== modalFechasState.inicioInicial || cierre !== modalFechasState.cierreInicial;
        if (cambio && !confirm('¿Descartar cambios?')) return;
    }
    document.getElementById('modal-fechas').style.display = 'none';
    const celda = modalFechasState ? modalFechasState.celda : null;
    modalFechasState = null;
    if (celda) celda.focus();
}

// ── Modal Target ──────────────────────────────────────────────
function abrirModalTarget() {
    const modal = document.getElementById('modal-target');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('input-target');
        if (input) input.focus();
        const err = document.getElementById('target-error');
        if (err) err.style.display = 'none';
    }
}

function cerrarModalTarget() {
    const modal = document.getElementById('modal-target');
    if (modal) modal.style.display = 'none';
}

function guardarTarget() {
    const valor = document.getElementById('input-target').value.trim();
    const errEl = document.getElementById('target-error');
    if (errEl) errEl.style.display = 'none';
    fetch(window.URLS.guardarTarget, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': window.CSRF_TOKEN },
        body: JSON.stringify({
            area_id:   window.AREA_ID,
            indicador: window.INDICADOR_ACTUAL,
            valor:     valor === '' ? '' : parseFloat(valor),
            anio:      window.TARGET_ANIO,    
            mes:       window.TARGET_MES,   
        })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) {
            if (errEl) { errEl.textContent = data.error || 'Error al guardar'; errEl.style.display = 'block'; }
            return;
        }
        cerrarModalTarget();
        window.location.reload();
    })
    .catch(() => {
        if (errEl) { errEl.textContent = 'Error de conexión'; errEl.style.display = 'block'; }
    });
}

//
function exportarExcel() {
    const ind = window.INDICADOR_LABEL;
    const area = window.AREA_NOMBRE;
    const filas = [];

    // Encabezado — solo strings, sin variables del forEach
    filas.push([
        'Fecha', 'Día', 'Equipo', ind, 'Problema',
        'Cont. Acción', 'Cont. F. Inicio', 'Cont. F. Cierre', 'Cont. Estatus',
        'Corr. Acción', 'Corr. F. Inicio', 'Corr. F. Cierre', 'Corr. Estatus',
        'Prev. Acción', 'Prev. F. Inicio', 'Prev. F. Cierre', 'Prev. Estatus',
        'Responsable'
    ]);

    // Filas de datos
    document.querySelectorAll('tbody tr[data-fecha]').forEach((tr, i) => {
        const d = DATOS_DIAS[i];
        if (!d) return;

        const get = cls => { const el = tr.querySelector(cls); return el ? el.value.trim() : ''; };
        const getB = cls => {
            const el = tr.querySelector(cls);
            return el ? (ESTATUS_LABELS[el.value] || '') : '';
        };

        const CLAVE = { downtime:'dt', disponibilidad:'disp', mttr:'mttr', mtbf:'mtbf', t_muerto_mant:'tmuerto' };
        const clave = CLAVE[window.INDICADOR_ACTUAL] || 'dt';
        const valor = d[clave] !== null && d[clave] !== undefined ? (d[clave] === 0.01 ? 0 : d[clave]) : '—';

        const diaNombre = tr.querySelector('.fecha-dia-nombre');
        const dia = diaNombre ? diaNombre.textContent.trim() : '';

        filas.push([
            tr.dataset.fecha,
            dia,
            tr.querySelector('.col-equipo') ? tr.querySelector('.col-equipo').textContent.trim() : '',
            valor,
            get('.problema-input'),
            get('.cont-accion'),  fmtFecha(get('.cont-fi')),  fmtFecha(get('.cont-ff')),  getB('.cont-status'),
            get('.corr-accion'),  fmtFecha(get('.corr-fi')),  fmtFecha(get('.corr-ff')),  getB('.corr-status'),
            get('.prev-accion'),  fmtFecha(get('.prev-fi')),  fmtFecha(get('.prev-ff')),  getB('.prev-status'),
            get('.resp-input'),
        ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = [
        {wch:10},{wch:12},{wch:18},{wch:12},{wch:30},
        {wch:30},{wch:12},{wch:12},{wch:12},
        {wch:30},{wch:12},{wch:12},{wch:12},
        {wch:30},{wch:12},{wch:12},{wch:12},
        {wch:20}
    ];

    XLSX.utils.book_append_sheet(wb, ws, ind);
    XLSX.writeFile(wb, `Indicadores_${area}_${window.INDICADOR_ACTUAL.toUpperCase()}.xlsx`);
}

function descargarTablaImagen() {
    const tabla = document.querySelector('.table-wrapper table');
    if (!tabla) {
        console.error('descargarTablaImagen: no se encontró la tabla (.table-wrapper table)');
        return;
    }
    if (typeof html2canvas === 'undefined') {
        console.error('descargarTablaImagen: html2canvas no está cargado (revisa la pestaña Network — ¿se cargó el <script> del CDN?)');
        return;
    }

    const btn = document.getElementById('btn-imagen');
    const textoOriginal = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = window.TXT_GENERANDO_IMAGEN || '…';
    }

    // La primera columna usa position:sticky para quedar fija al hacer scroll
    // horizontal — html2canvas no la respeta bien, se neutraliza para la
    // captura y se restaura después, pase lo que pase.
    const stickyEls = tabla.querySelectorAll('.cell-sticky');
    const prevPosiciones = Array.from(stickyEls).map(el => el.style.position);
    stickyEls.forEach(el => { el.style.position = 'static'; });

    const bgColor = getComputedStyle(document.body).backgroundColor || '#ffffff';

    html2canvas(tabla, { backgroundColor: bgColor, scale: 2 })
        .then(canvas => {
            canvas.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Indicadores_${window.AREA_NOMBRE}_${window.INDICADOR_ACTUAL.toUpperCase()}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            });
        })
        .catch(err => {
            console.error('descargarTablaImagen: fallo al generar la imagen', err);
        })
        .finally(() => {
            stickyEls.forEach((el, i) => { el.style.position = prevPosiciones[i]; });
            if (btn) {
                btn.disabled = false;
                btn.textContent = textoOriginal;
            }
        });
}

// Ajustar alto del textarea al contenido (la celda/fila crece con el texto)
function autoGrowTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}


// ── Gráfica de tendencia (semana / mes / año) ───────────────────
// Usa el mismo indicador seleccionado en las pills de "Indicador en gráfica"
// (window.INDICADOR_ACTUAL) — no tiene selector propio, para no duplicar UI.
let tendenciaGranularidad = 'semana';
let tendenciaTipo         = 'bar';
let chartTendencia        = null;

function cambiarAnio(inputId, delta) {
    const el = document.getElementById(inputId);
    if (!el) return;
    const min = parseInt(el.min, 10);
    const max = parseInt(el.max, 10);
    let val = (parseInt(el.value, 10) || new Date().getFullYear()) + delta;
    if (!isNaN(min)) val = Math.max(min, val);
    if (!isNaN(max)) val = Math.min(max, val);
    el.value = val;
    cargarTendencia();
}

function cambiarTipoTendencia(tipo) {
    tendenciaTipo = tipo;
    const chart = chartTendencia;
    if (!chart) return;
    ['bar', 'line', 'area'].forEach(t => {
        const btn = document.getElementById('btn-tipo-tend-' + t);
        if (btn) {
            btn.style.background = t === tipo ? 'var(--indigo)' : 'var(--white)';
            btn.style.color      = t === tipo ? '#fff'        : 'var(--text)';
        }
    });
    const ds = chart.data.datasets[0];
    if (tipo === 'bar') {
        ds.type = 'bar'; ds.fill = false; ds.tension = undefined;
        ds.pointRadius = undefined; ds.borderWidth = 1; ds.borderRadius = 4;
        ds.backgroundColor = colorIndigoRgba(0.75); ds.borderColor = colorIndigo();
    } else if (tipo === 'line') {
        ds.type = 'line'; ds.fill = false; ds.tension = 0.3; ds.pointRadius = 4;
        ds.pointBackgroundColor = colorIndigo(); ds.borderWidth = 2;
        ds.borderRadius = 0; ds.backgroundColor = 'transparent'; ds.borderColor = colorIndigo();
    } else if (tipo === 'area') {
        ds.type = 'line'; ds.fill = true; ds.tension = 0.3; ds.pointRadius = 4;
        ds.pointBackgroundColor = colorIndigo(); ds.borderWidth = 2;
        ds.borderRadius = 0; ds.backgroundColor = colorIndigoRgba(0.12); ds.borderColor = colorIndigo();
    }
    chart.config.type = tipo === 'bar' ? 'bar' : 'line';
    chart.update();
}

function cambiarGranularidadTendencia(g) {
    tendenciaGranularidad = g;
    ['semana', 'mes', 'anio'].forEach(k => {
        const btn = document.getElementById('btn-gran-' + k);
        if (btn) btn.className = 'btn-icon ' + (k === g ? 'active' : 'inactive');
    });
    const wrapAnioInicio = document.getElementById('wrap-anio-inicio');
    if (wrapAnioInicio) wrapAnioInicio.style.display = g === 'anio' ? 'flex' : 'none';
    const wrapAnioSemana = document.getElementById('wrap-anio-semana');
    if (wrapAnioSemana) wrapAnioSemana.style.display = g === 'semana' ? 'flex' : 'none';
    const wrapAnioMes = document.getElementById('wrap-anio-mes');
    if (wrapAnioMes) wrapAnioMes.style.display = g === 'mes' ? 'flex' : 'none';
    cargarTendencia();
}

function cargarTendencia() {
    if (!window.AREA_ID) return;
    const equipoEl   = document.querySelector('select[name="equipo"]');
    const equipo     = equipoEl ? equipoEl.value : '';
    const subAreaEl  = document.querySelector('select[name="sub_area"]');
    const subArea    = subAreaEl ? subAreaEl.value : '';
    const params     = new URLSearchParams({
        area:         window.AREA_ID,
        equipo:       equipo,
        sub_area:     subArea,
        indicador:    window.INDICADOR_ACTUAL,
        granularidad: tendenciaGranularidad,
    });
    if (tendenciaGranularidad === 'anio') {
        const anioEl = document.getElementById('tendencia-anio-inicio');
        if (anioEl && anioEl.value) params.set('anio_inicio', anioEl.value);
    }
    if (tendenciaGranularidad === 'semana') {
        const anioSemEl = document.getElementById('tendencia-anio-semana');
        if (anioSemEl && anioSemEl.value) params.set('anio_semana', anioSemEl.value);
    }
    if (tendenciaGranularidad === 'mes') {
        const anioMesEl = document.getElementById('tendencia-anio-mes');
        if (anioMesEl && anioMesEl.value) params.set('anio_mes', anioMesEl.value);
    }
    fetch(`${window.URLS.tendencia}?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
            const lbl = document.getElementById('tendencia-ind-label');
            if (lbl) lbl.textContent = data.indicador_label || '';

            const periodo = document.getElementById('tendencia-periodo-label');
            if (periodo) periodo.textContent = data.periodo_label || '';

            renderChartTendencia(data.labels || [], data.valores || []);
        })
        .catch(() => {});
}

function renderChartTendencia(labels, valores) {
    const canvas = document.getElementById('chartTendencia');
    if (!canvas) return;
    const UNIDADES = { downtime: '%', disponibilidad: '%', mttr: ' min', mtbf: ' h', t_muerto_mant: ' min', planeado: ' min' }
    const unidad = UNIDADES[window.INDICADOR_ACTUAL] || '';

    if (chartTendencia) chartTendencia.destroy();
    const indigoSolid = colorIndigo();
    const indigoAlpha = colorIndigoRgba(0.75);
    chartTendencia = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: valores,
                backgroundColor: indigoAlpha,
                borderColor: indigoSolid,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ' ' + (ctx.parsed.y ?? '—') + unidad } }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780' } },
                y: { beginAtZero: true, ticks: { font: { size: 11 }, color: '#888780' } }
            },
            animation: {
                onComplete: function () {
                    const chart = this;
                    const meta  = chart.getDatasetMeta(0);
                    const barWidth = meta.data.length > 0 ? meta.data[0].width : 0;
                    if (barWidth < 14) return;
                    const ctx2 = chart.ctx;
                    const esDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    ctx2.save();
                    ctx2.font = 'bold 11px sans-serif';
                    ctx2.textAlign = 'center';
                    ctx2.fillStyle = esDark ? '#FFFFFF' : indigoSolid;
                    chart.data.datasets[0].data.forEach((val, i) => {
                        if (val === null || val === undefined) return;
                        const bar = meta.data[i];
                        const yPos = bar.y - 6;
                        const label = val + unidad;
                        if (yPos < 12) {
                            ctx2.fillStyle = '#ffffff';
                            ctx2.fillText(label, bar.x, bar.y + 16);
                            ctx2.fillStyle = esDark ? '#FFFFFF' : indigoSolid;
                        } else {
                            ctx2.fillText(label, bar.x, yPos);
                        }
                    });
                    ctx2.restore();
                }
            }
        }
    });
    cambiarTipoTendencia(tendenciaTipo);
}


// ── Inicialización ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const selPeriodo = document.getElementById('sel-periodo');
    if (selPeriodo) togglePeriodo(selPeriodo.value);

    if (typeof LABELS !== 'undefined' && LABELS.length && document.getElementById('chartIndicador')) {
        crearGrafica();
    }

    if (document.getElementById('chartTendencia')) {
        cargarTendencia();
    }

    mostrarColumnaIndicador(window.INDICADOR_ACTUAL);
    poblarValoresTabla();
    const selFiltro = document.getElementById('sel-filtro-target');
    if (selFiltro) selFiltro.value = filtroTarget;
    aplicarFiltroTarget(filtroTarget);

    document.querySelectorAll('tbody tr[data-fecha]').forEach(tr => {

        // Responsable — autocompletado; solo nombres existentes, texto libre se limpia al guardar
        tr.querySelectorAll('.resp-input').forEach(el => {
            ajustarAnchoResponsable(el);
            el.addEventListener('input', () => {
                ajustarAnchoResponsable(el);
                mostrarAutocompleteResponsable(el);
            });
            el.addEventListener('focus', () => mostrarAutocompleteResponsable(el));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!respAutocompleteState) mostrarAutocompleteResponsable(el);
                    else moverResaltadoResponsable(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (respAutocompleteState) moverResaltadoResponsable(-1);
                } else if (e.key === 'Enter') {
                    if (respAutocompleteState && respAutocompleteState.indice >= 0) {
                        e.preventDefault();
                        seleccionarResponsableAutocomplete(respAutocompleteState.indice);
                    } else {
                        ocultarAutocompleteResponsable();
                    }
                } else if (e.key === 'Escape') {
                    ocultarAutocompleteResponsable();
                }
            });
            el.addEventListener('blur', () => {
                setTimeout(() => {
                    ocultarAutocompleteResponsable();
                    validarResponsable(el);
                    guardarFila(tr);
                }, 150);
            });
        });

        // Campos de texto — guardar + contador visible solo en focus
        tr.querySelectorAll('.problema-input, .cont-accion, .corr-accion, .prev-accion').forEach(el => {
            el.addEventListener('focus', () => {
                const counter = el.parentElement.querySelector('.char-counter');
                if (counter) counter.classList.add('visible');
            });
            el.addEventListener('blur', () => {
                guardarFila(tr);
                // Pequeño delay para evitar que desaparezca al hacer clic dentro
                setTimeout(() => {
                    if (document.activeElement !== el) {
                        const counter = el.parentElement.querySelector('.char-counter');
                        if (counter) counter.classList.remove('visible');
                    }
                }, 150);
            });
            el.addEventListener('input', function () {
                const max = parseInt(this.getAttribute('maxlength') || '100');
                if (this.value.length > max) this.value = this.value.slice(0, max);
                const counter = this.parentElement.querySelector('.char-counter');
                if (counter) {
                    const n = this.value.length;
                    counter.textContent = n + '/' + max;
                    counter.className = 'char-counter visible' + (n >= max ? ' full' : n >= max * 0.8 ? ' warn' : '');
                }
                autoGrowTextarea(this);
            });
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.blur();
                }
            });
            el.dispatchEvent(new Event('input'));
            autoGrowTextarea(el);
        });

        // Cargar datos guardados para este indicador
        cargarFila(tr);
    });

    const modalTarget = document.getElementById('modal-target');
    if (modalTarget) {
        modalTarget.addEventListener('click', function (e) {
            if (e.target === this) cerrarModalTarget();
        });
    }

    // Modal de fechas (contención / correctiva / preventiva)
    const overlayFechas = document.getElementById('modal-fechas');
    if (overlayFechas) {
        overlayFechas.addEventListener('click', function (e) {
            if (e.target === this) cerrarModalFechas();
        });
        overlayFechas.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cerrarModalFechas();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                guardarModalFechas();
            } else if (e.key === 'Tab') {
                const focusables = overlayFechas.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
                if (!focusables.length) return;
                const first = focusables[0];
                const last  = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }
    const inputFechaInicio = document.getElementById('modal-fecha-inicio');
    const inputFechaCierre = document.getElementById('modal-fecha-cierre');
    if (inputFechaInicio) inputFechaInicio.addEventListener('input', actualizarResumenModalFechas);
    if (inputFechaCierre) inputFechaCierre.addEventListener('input', actualizarResumenModalFechas);
    if (inputFechaInicio) inputFechaInicio.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); guardarModalFechas(); }
    });
    if (inputFechaCierre) inputFechaCierre.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); guardarModalFechas(); }
    });

});

// ── Redibujar gráficas al cambiar el color de acento o el tema ────────────
// Chart.js pinta colores resueltos en píxeles al crear el chart; no reaccionan
// solos a un cambio de var(--indigo), así que hay que volver a crearlos.
document.addEventListener('accentchange', function () {
    if (typeof LABELS !== 'undefined' && LABELS.length && document.getElementById('chartIndicador')) {
        crearGrafica();
    }
    if (document.getElementById('chartTendencia')) {
        cargarTendencia();
    }
});