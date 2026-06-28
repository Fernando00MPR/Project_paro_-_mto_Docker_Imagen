// ──────────────────────────────────────────────────────────────
//  indicadores_produccion.js
// ──────────────────────────────────────────────────────────────

// ── Filtros de período ────────────────────────────────────────
function togglePeriodo(v, autoSubmit) {
    document.getElementById('wrap-semana-num').style.display = v === 'semana_num' ? 'flex' : 'none';
    document.getElementById('wrap-desde').style.display      = v === 'custom'     ? 'flex' : 'none';
    document.getElementById('wrap-hasta').style.display      = v === 'custom'     ? 'flex' : 'none';

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
    const UNIDADES = { downtime:'%', disponibilidad:'%', mttr:' min', mtbf:' h', t_muerto_mant:' min' };
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
    const bgColors = VALORES.map(v => esRojo(v, hayOutlier, axisMax) ? 'rgba(239,68,68,0.80)' : 'rgba(79,70,229,0.75)');
    const bdColors = VALORES.map(v => esRojo(v, hayOutlier, axisMax) ? '#DC2626' : '#4F46E5');

    const UNIDADES = { downtime:'%', disponibilidad:'%', mttr:' min', mtbf:' h', t_muerto_mant:' min' };
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
                            ctx2.fillStyle = rojo ? '#DC2626' : '#4F46E5';
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
                            const dentroDeBar = yPos < chart.chartArea.top + 14;
                            if (dentroDeBar) {
                                ctx2.fillStyle = '#ffffff';
                                ctx2.fillText(label, bar.x, bar.y + 16);
                            } else {
                                const esDark = document.documentElement.getAttribute('data-theme') === 'dark';
                                ctx2.fillStyle = esDark ? '#FFFFFF' : '#4F46E5';
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
            btn.style.background = t === tipo ? '#4F46E5' : 'var(--white)';
            btn.style.color      = t === tipo ? '#fff'    : 'var(--text)';
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
        ds.borderRadius = 0; ds.backgroundColor = 'transparent'; ds.borderColor = '#4F46E5';
    } else if (tipo === 'area') {
        ds.type = 'line'; ds.fill = true; ds.tension = 0.3; ds.pointRadius = 4;
        ds.pointBackgroundColor = chart._bgColors; ds.borderWidth = 2;
        ds.borderRadius = 0; ds.backgroundColor = 'rgba(79,70,229,0.12)'; ds.borderColor = '#4F46E5';
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
    if (btn) btn.textContent = ocultando ? 'Mostrar sin registro' : 'Ocultar sin registro';
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

// ── Ciclo de estatus ──────────────────────────────────────────
const CICLO_EST = [
    { cls: 'est-p', label: 'Pendiente',  val: 'p' },
    { cls: 'est-e', label: 'En proceso', val: 'e' },
    { cls: 'est-c', label: 'Cerrada',    val: 'c' },
];

function ciclarEst(btn) {
    const i = CICLO_EST.findIndex(e => btn.classList.contains(e.cls));
    const s = (i + 1) % CICLO_EST.length;
    CICLO_EST.forEach(e => btn.classList.remove(e.cls));
    btn.classList.add(CICLO_EST[s].cls);
    btn.textContent = CICLO_EST[s].label;
    const tr = btn.closest('tr');
    if (tr) guardarFila(tr);
}

// ── Obtener datos de una fila ─────────────────────────────────
function datosDeFila(tr) {
    const get  = cls => { const el = tr.querySelector(cls); return el ? el.value.trim() : ''; };
    const getB = cls => {
        const el = tr.querySelector(cls);
        if (!el) return 'p';
        const f = CICLO_EST.find(e => el.classList.contains(e.cls));
        return f ? f.val : 'p';
    };
    return {
        area_id:           window.AREA_ID,
        fecha:             tr.dataset.fecha,
        equipo:            window.EQUIPO_SEL,
        indicador:         window.INDICADOR_ACTUAL,
        problema:          get('.problema-input'),
        cont_accion:       get('.cont-accion'),
        cont_fecha_inicio: fmtFecha(get('.cont-fi')),
        cont_fecha_fin:    fmtFecha(get('.cont-ff')),
        cont_estatus:      getB('.cont-est'),
        corr_accion:       get('.corr-accion'),
        corr_fecha_inicio: fmtFecha(get('.corr-fi')),
        corr_fecha_fin:    fmtFecha(get('.corr-ff')),
        corr_estatus:      getB('.corr-est'),
        prev_accion:       get('.prev-accion'),
        prev_fecha_inicio: fmtFecha(get('.prev-fi')),
        prev_fecha_fin:    fmtFecha(get('.prev-ff')),
        prev_estatus:      getB('.prev-est'),
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
        const setB = (cls, val) => {
            const el = tr.querySelector(cls);
            if (!el) return;
            const f = CICLO_EST.find(e => e.val === val) || CICLO_EST[0];
            CICLO_EST.forEach(e => el.classList.remove(e.cls));
            el.classList.add(f.cls);
            el.textContent = f.label;
        };
        set('.problema-input', data.problema);
        set('.cont-accion',    data.cont_accion);
        set('.cont-fi',        parseFecha(data.cont_fecha_inicio));
        set('.cont-ff',        parseFecha(data.cont_fecha_fin));
        setB('.cont-est',      data.cont_estatus);
        set('.corr-accion',    data.corr_accion);
        set('.corr-fi',        parseFecha(data.corr_fecha_inicio));
        set('.corr-ff',        parseFecha(data.corr_fecha_fin));
        setB('.corr-est',      data.corr_estatus);
        set('.prev-accion',    data.prev_accion);
        set('.prev-fi',        parseFecha(data.prev_fecha_inicio));
        set('.prev-ff',        parseFecha(data.prev_fecha_fin));
        setB('.prev-est',      data.prev_estatus);
        set('.resp-input',     data.responsable);

        // Inicializar contadores tras cargar datos
        tr.querySelectorAll('.problema-input, .cont-accion, .corr-accion, .prev-accion').forEach(el => {
            el.dispatchEvent(new Event('input'));
            centrarTextoTextarea(el);
        });
    })
    .catch(() => {});
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
            if (!el) return '';
            if (el.classList.contains('est-p')) return 'Pendiente';
            if (el.classList.contains('est-e')) return 'En proceso';
            if (el.classList.contains('est-c')) return 'Cerrada';
            return '';
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
            get('.cont-accion'),  fmtFecha(get('.cont-fi')),  fmtFecha(get('.cont-ff')),  getB('.cont-est'),
            get('.corr-accion'),  fmtFecha(get('.corr-fi')),  fmtFecha(get('.corr-ff')),  getB('.corr-est'),
            get('.prev-accion'),  fmtFecha(get('.prev-fi')),  fmtFecha(get('.prev-ff')),  getB('.prev-est'),
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

//Centrar Texto Textarea
function centrarTextoTextarea(el) {
    const clone = document.createElement('textarea');
    clone.style.cssText = `
        position: absolute;
        visibility: hidden;
        height: auto;
        width: ${el.clientWidth}px;
        font-size: 12px;
        font-family: ${getComputedStyle(el).fontFamily};
        line-height: 1.5;
        padding: 0 10px;
        white-space: pre-wrap;
        word-wrap: break-word;
        border: none;
        resize: none;
        box-sizing: border-box;
    `;
    clone.value = el.value || '';
    document.body.appendChild(clone);
    const contentHeight = clone.scrollHeight;
    document.body.removeChild(clone);

    const containerHeight = el.clientHeight;
    const paddingTop = Math.max(0, (containerHeight - contentHeight) / 2 + 18);
    el.style.paddingTop = paddingTop + 'px';
}


// ── Inicialización ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const selPeriodo = document.getElementById('sel-periodo');
    if (selPeriodo) togglePeriodo(selPeriodo.value);

    if (typeof LABELS !== 'undefined' && LABELS.length && document.getElementById('chartIndicador')) {
        crearGrafica();
    }

    mostrarColumnaIndicador(window.INDICADOR_ACTUAL);
    poblarValoresTabla();
    const selFiltro = document.getElementById('sel-filtro-target');
    if (selFiltro) selFiltro.value = filtroTarget;
    aplicarFiltroTarget(filtroTarget);

    document.querySelectorAll('tbody tr[data-fecha]').forEach(tr => {

        // Responsable — guardar al cambiar selección
        tr.querySelectorAll('.resp-input').forEach(el => {
            el.addEventListener('change', () => guardarFila(tr));
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
                centrarTextoTextarea(this);
            });
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.blur();
                }
            });
            el.dispatchEvent(new Event('input'));
            centrarTextoTextarea(el);
        });

        // Fechas — guardar al cambiar
        tr.querySelectorAll('.cont-fi, .cont-ff, .corr-fi, .corr-ff, .prev-fi, .prev-ff').forEach(el => {
            el.addEventListener('change', () => guardarFila(tr));
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
});