/* analisis_paros.js — Gráficas de Pareto, barras y controles de filtros */

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

// Ajustar layout según cantidad de barras
// Responsive por tamaño de ventana
function ajustarLayout() {
    const maxBars = Math.max(LABELS_P.length, LABELS_B.length);
    if (maxBars > 20 || window.innerWidth < 1100) {
        document.getElementById('charts-grid').style.gridTemplateColumns = 'minmax(0,1fr)';
    } else {
        document.getElementById('charts-grid').style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1fr)';
    }
    const minW = Math.max(320, maxBars * 45);
    document.querySelectorAll('#chartPareto, #chartBarras').forEach(c => {
        c.style.minWidth = minW + 'px';
    });
}

ajustarLayout();
window.addEventListener('resize', ajustarLayout);

const red = '#EF4444';

// ── Pareto ────────────────────────────────────────────────────────────────────
function crearGraficaPareto(canvasId) {
    const indigoSolid  = colorIndigo();
    const colorValores = esModoOscuro() ? '#FFFFFF' : indigoSolid;
    return new Chart(document.getElementById(canvasId), {
        data: {
            labels: LABELS_P,
            datasets: [
                { type:'bar',  data:MINUTOS_P, backgroundColor:indigoSolid, borderRadius:4, yAxisID:'y',  label:'Minutos', order:2 },
                { type:'line', data:ACUM_P, borderColor:red, borderWidth:2.5, pointBackgroundColor:red, pointRadius:4, fill:false, tension:0.1, yAxisID:'y1', label:'%', order:1 }
            ]
        },
        options: {
            responsive:true, maintainAspectRatio:false, layout:{padding:{top:24}},
            plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ctx.datasetIndex===0 ? ` ${ctx.raw} min` : ` ${ctx.raw}%` }}},
            scales:{
                y:  { beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:11},color:'#9CA3AF'} },
                y1: { beginAtZero:true, max:100, position:'right', grid:{display:false}, ticks:{font:{size:11},color:red,callback:v=>v+'%'} },
                x:  { grid:{display:false}, ticks:{font:{size:10},color:'#9CA3AF',maxRotation:45} }
            }
        },
        plugins:[{ id:'paretoLabels', afterDatasetsDraw(chart) {
            const {ctx} = chart;
            chart.getDatasetMeta(0).data.forEach((bar,i) => {
                ctx.save(); 
                ctx.textAlign = 'center';           
                if(LABELS_P.length > 14){
                    ctx.font = 'bold 10px Segoe UI,sans-serif'; 
                    ctx.fillStyle = colorValores;
                    ctx.fillText(MINUTOS_P[i], bar.x, bar.y - 5);
                }else{
                    ctx.font = 'bold 10px Segoe UI,sans-serif'; 
                    ctx.fillStyle = colorValores;
                    ctx.fillText(''+MINUTOS_P[i]+' min', bar.x, bar.y - 5);
                }
                ctx.restore();
            });
        }}]
    });
}

let chartParetoOriginal = crearGraficaPareto('chartPareto');

// ── Barras ────────────────────────────────────────────────────────────────────
function crearGraficaBarrasAnalisis(canvasId) {
    const indigoSolid  = colorIndigo();
    const colorValores = esModoOscuro() ? '#FFFFFF' : indigoSolid;
    return new Chart(document.getElementById(canvasId), {
        type:'bar',
        data:{ labels:LABELS_B, datasets:[{data:MINUTOS_B, backgroundColor:indigoSolid, borderRadius:5, label:'Minutos'}] },
        options:{
            responsive:true, maintainAspectRatio:false, layout:{padding:{top:30}},
            plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: ctx => ` ${ctx.raw} min (${NPAROS_B[ctx.dataIndex]} paros)` }}},
            scales:{
                y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, ticks:{font:{size:11},color:'#9CA3AF'} },
                x:{ grid:{display:false}, ticks:{font:{size:10},color:'#9CA3AF',maxRotation:45} }
            }
        },
        plugins:[{ id:'topLabels', afterDatasetsDraw(chart) {
            const {ctx} = chart;
            chart.getDatasetMeta(0).data.forEach((bar,i) => {
                ctx.save(); 
                ctx.textAlign = 'center';           
                if(LABELS_B.length > 14){
                    ctx.font = 'bold 10px Segoe UI,sans-serif'; 
                    ctx.fillStyle = colorValores;
                    ctx.fillText(MINUTOS_B[i], bar.x, bar.y - 14);
                    ctx.font = '10px Segoe UI,sans-serif'; ctx.fillStyle = '#9CA3AF';
                    ctx.fillText('('+NPAROS_B[i]+')', bar.x, bar.y - 3);
                }else{
                    ctx.font = 'bold 10px Segoe UI,sans-serif'; 
                    ctx.fillStyle = colorValores;
                    ctx.fillText(''+MINUTOS_B[i]+' min', bar.x, bar.y - 14);
                    ctx.font = '10px Segoe UI,sans-serif'; ctx.fillStyle = '#9CA3AF';
                    ctx.fillText(''+NPAROS_B[i]+' Paros', bar.x, bar.y - 3);
                }
                ctx.restore();
            });
        }}]
    });
}

let chartBarrasOriginal = crearGraficaBarrasAnalisis('chartBarras');

// ── Tendecia ──────────────────────────────────────────────────────────────────
function crearGraficaTendencia(canvasId, labels, data, opciones) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaults = { labelTop: true, fontSize: 11, autoSkip: false, maxRotation: 0 };
    const cfg = Object.assign({}, defaults, opciones);
    const indigoSolid  = colorIndigo();
    const indigoAlpha  = colorIndigoRgba(0.75);
    const colorValores = esModoOscuro() ? '#FFFFFF' : indigoSolid;

    new Chart(ctx, {
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
                    ticks: { font: { size: cfg.fontSize }, color: '#888780', maxRotation: cfg.maxRotation, autoSkip: cfg.autoSkip }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(136,135,128,0.15)' },
                    ticks: { font: { size: 11 }, color: '#888780', precision: 0, callback: v => v + ' min' }
                }
            },
            animation: {
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
                        if(LABELS_T.length >= 25){
                            ctx2.fillText(val, bar.x, bar.y - 6);
                        } else {
                            ctx2.fillText(''+val+' min', bar.x, bar.y - 6);
                        }
                    });
                    ctx2.restore();
                }
            }
        }
    });
}

// ── Toggle período ────────────────────────────────────────────────────────────
function togglePeriodo(v) {
    document.getElementById('wrap-semana').style.display        = v==='semana'  ? 'flex' : 'none';
    document.getElementById('wrap-desde').style.display         = v==='custom'  ? 'flex' : 'none';
    document.getElementById('wrap-hasta').style.display         = v==='custom'  ? 'flex' : 'none';
    document.getElementById('wrap-mes').style.display           = v==='mes'     ? 'flex' : 'none';
    document.getElementById('wrap-meses').style.display         = v==='meses'   ? 'flex' : 'none';
    document.getElementById('wrap-anio-semanas').style.display  = v==='semanas' ? 'flex' : 'none';
}

// ── Selector de año (Por semana - año actual) ──────────────────────────────────
function cambiarAnioSemanas(delta) {
    const el = document.getElementById('input-anio-semanas');
    if (!el) return;
    const min = parseInt(el.min, 10);
    const max = parseInt(el.max, 10);
    let val = (parseInt(el.value, 10) || new Date().getFullYear()) + delta;
    if (!isNaN(min)) val = Math.max(min, val);
    if (!isNaN(max)) val = Math.min(max, val);
    el.value = val;
    prepararExclusiones();
}

// ── Selector de año (Por meses - año completo) ──────────────────────────────────
function cambiarAnioMeses(delta) {
    const el = document.getElementById('input-anio-meses');
    if (!el) return;
    const min = parseInt(el.min, 10);
    const max = parseInt(el.max, 10);
    let val = (parseInt(el.value, 10) || new Date().getFullYear()) + delta;
    if (!isNaN(min)) val = Math.max(min, val);
    if (!isNaN(max)) val = Math.min(max, val);
    el.value = val;
    prepararExclusiones();
}

togglePeriodo(document.getElementById('sel-periodo').value);

// ── Toggle modo Pareto ────────────────────────────────────────────────────────
function setModoPareto(modo) {
    document.getElementById('input-modo-pareto').value = modo;
    const idsPareto = { falla: 'bp-falla', equipo: 'bp-equipo', responsable: 'bp-resp', tipo_falla: 'bp-tipo', atendio: 'bp-atendio' };
    ['falla', 'equipo', 'responsable', 'tipo_falla', 'atendio'].forEach(m => {
        const el = document.getElementById(idsPareto[m]);
        if (!el) return;
        const activo = modo === m;
        el.style.background = activo ? 'var(--indigo)' : 'var(--white)';
        el.style.color      = activo ? '#fff' : 'var(--text-2)';
    });
}

// ── Toggle modo Barras ────────────────────────────────────────────────────────
function setModoBarras(modo) {
    document.getElementById('input-modo-barras').value = modo;
    const idsBarras = { falla: 'bb-falla', equipo: 'bb-equipo', responsable: 'bb-resp', tipo_falla: 'bb-tipo', atendio: 'bb-atendio' };
    ['falla', 'equipo', 'responsable', 'tipo_falla', 'atendio'].forEach(m => {
        const el = document.getElementById(idsBarras[m]);
        if (!el) return;
        const activo = modo === m;
        el.style.background = activo ? 'var(--indigo)' : 'var(--white)';
        el.style.color      = activo ? '#fff' : 'var(--text-2)';
    });
}

// ── Buscadores de exclusión ───────────────────────────────────────────────────
document.getElementById('buscador-fallas').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.falla-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-equipos').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.equipo-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-resp').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.resp-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-tipos').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.tipo-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-atendio').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.atendio-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});

// ── Seleccionar todo / ninguno ────────────────────────────────────────────────
function toggleTodos(listaId, estado) {
    document.querySelectorAll('#' + listaId + ' input[type="checkbox"]').forEach(c => c.checked = estado);
}

// ── Enviar con exclusiones ────────────────────────────────────────────────────
function prepararExclusiones() {
    const form = document.getElementById('form-principal');
    form.querySelectorAll('input[name="excluir_falla"],input[name="excluir_resp"],input[name="excluir_tipo"],input[name="excluir_atendio"],input[name="excluir_equipo"]').forEach(el => el.remove());

    document.querySelectorAll('.chk-falla').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_falla'; inp.value=chk.dataset.val;
            form.appendChild(inp);
        }
    });
    document.querySelectorAll('.chk-equipo').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_equipo'; inp.value=chk.dataset.val;
            form.appendChild(inp);
        }
    });
    document.querySelectorAll('.chk-resp').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_resp'; inp.value=chk.dataset.val;
            form.appendChild(inp);
        }
    });
    document.querySelectorAll('.chk-tipo').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_tipo'; inp.value=chk.dataset.val;
            form.appendChild(inp);
        }
    });
    document.querySelectorAll('.chk-atendio').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_atendio'; inp.value=chk.dataset.val;
            form.appendChild(inp);
        }
    });
    form.submit();
}

// ── Descargar gráfico como imagen ─────────────────────────────────────────────
function descargarGrafico(canvasId, nombre) {
    const canvas    = document.getElementById(canvasId);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = canvas.width;
    tmpCanvas.height = canvas.height;
    const ctx = tmpCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    const url = tmpCanvas.toDataURL('image/png');
    const a   = document.createElement('a');
    a.href     = url;
    a.download = nombre + '_' + new Date().toLocaleDateString('es-MX').replace(/[/]/g, '-') + '.png';
    a.click();
}

// ── Modal de gráfico expandido ────────────────────────────────────────────────
let chartModalInstancia = null;

const CONFIG_MODAL_GRAFICO = {
    pareto: {
        titulo: 'Diagrama de Pareto',
        subtitulo: () => document.querySelector('#bp-falla')?.parentElement.previousElementSibling?.querySelector('div:nth-child(2)')?.textContent || '',
        crear: crearGraficaPareto,
        nombreDescarga: 'Pareto'
    },
    barras: {
        titulo: 'Tendencia de paros',
        subtitulo: () => 'Ordenado por tiempo acumulado — mayor a menor',
        crear: crearGraficaBarrasAnalisis,
        nombreDescarga: 'Tendencia'
    }
};

function abrirModalGrafico(tipo) {
    const cfg = CONFIG_MODAL_GRAFICO[tipo];
    if (!cfg) return;

    document.getElementById('modal-grafico-titulo').textContent = cfg.titulo;
    document.getElementById('modal-grafico-subtitulo').textContent =
        tipo === 'pareto'
            ? document.querySelector('#chartPareto').closest('.card').querySelector('div > div:nth-child(2)').textContent
            : document.querySelector('#chartBarras').closest('.card').querySelector('div > div:nth-child(2)').textContent;

    document.getElementById('modal-grafico').style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (chartModalInstancia) {
        chartModalInstancia.destroy();
        chartModalInstancia = null;
    }
    chartModalInstancia = cfg.crear('chartGraficoModal');

    document.getElementById('modal-grafico-descargar').onclick = function () {
        descargarGrafico('chartGraficoModal', cfg.nombreDescarga);
    };
}

function cerrarModalGrafico() {
    document.getElementById('modal-grafico').style.display = 'none';
    document.body.style.overflow = '';
    if (chartModalInstancia) {
        chartModalInstancia.destroy();
        chartModalInstancia = null;
    }
}

document.getElementById('modal-grafico').addEventListener('click', function (e) {
    if (e.target === this) cerrarModalGrafico();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('modal-grafico').style.display === 'flex') {
        cerrarModalGrafico();
    }
});

// ── Redibujar gráficas al cambiar el color de acento o el tema ────────────
// Chart.js pinta colores resueltos en píxeles al crear el chart; no reaccionan
// solos a un cambio de var(--indigo), así que hay que volver a crearlos.
document.addEventListener('accentchange', function () {
    if (chartParetoOriginal) {
        chartParetoOriginal.destroy();
        chartParetoOriginal = crearGraficaPareto('chartPareto');
    }
    if (chartBarrasOriginal) {
        chartBarrasOriginal.destroy();
        chartBarrasOriginal = crearGraficaBarrasAnalisis('chartBarras');
    }
    const tendenciaExistente = Chart.getChart('chartTendenciaAnalisis');
    if (tendenciaExistente && typeof LABELS_T !== 'undefined') {
        tendenciaExistente.destroy();
        crearGraficaTendencia('chartTendenciaAnalisis', LABELS_T, MINUTOS_T, { fontSize: 11, maxRotation: 45, autoSkip: LABELS_T.length > 20 });
    }
});