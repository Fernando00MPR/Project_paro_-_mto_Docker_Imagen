/* analisis_paros.js — Gráficas de Pareto, barras y controles de filtros */

// Ajustar layout según cantidad de barras
const maxBars = Math.max(LABELS_P.length, LABELS_B.length);
if (maxBars > 20) {
    document.getElementById('charts-grid').style.gridTemplateColumns = '1fr';
} else {
    document.getElementById('charts-grid').style.gridTemplateColumns = '1fr 1fr';
}

const minW = Math.max(600, maxBars * 20);
document.querySelectorAll('#chartPareto, #chartBarras').forEach(c => {
    c.style.minWidth = minW + 'px';
});

const red = '#EF4444';

// ── Pareto ────────────────────────────────────────────────────────────────────
new Chart(document.getElementById('chartPareto'), {
    data: {
        labels: LABELS_P,
        datasets: [
            { type:'bar',  data:MINUTOS_P, backgroundColor:'#4F46E5', borderRadius:4, yAxisID:'y',  label:'Minutos' },
            { type:'line', data:ACUM_P, borderColor:red, borderWidth:2.5, pointBackgroundColor:red, pointRadius:4, fill:false, tension:0.1, yAxisID:'y1', label:'%' }
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
            ctx.textAlign='center';           
            if(LABELS_P.length > 14){
                ctx.font='bold 10px Segoe UI,sans-serif'; 
                ctx.fillStyle='#4F46E5';
                ctx.fillText(MINUTOS_P[i], bar.x, bar.y - 5);
            }else{
                ctx.font='bold 10px Segoe UI,sans-serif'; 
                ctx.fillStyle='#4F46E5';
                ctx.fillText(''+MINUTOS_P[i]+' min', bar.x, bar.y - 5);
            }
            ctx.restore();
        });
    }}]
});

// ── Barras ────────────────────────────────────────────────────────────────────
new Chart(document.getElementById('chartBarras'), {
    type:'bar',
    data:{ labels:LABELS_B, datasets:[{data:MINUTOS_B, backgroundColor:'#4F46E5', borderRadius:5, label:'Minutos'}] },
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
            ctx.textAlign='center';           
            if(LABELS_B.length > 14){
                ctx.font='bold 10px Segoe UI,sans-serif'; 
                ctx.fillStyle='#4F46E5';
                ctx.fillText(MINUTOS_B[i], bar.x, bar.y - 14);
                ctx.font='10px Segoe UI,sans-serif'; ctx.fillStyle='#9CA3AF';
                ctx.fillText('('+NPAROS_B[i]+')', bar.x, bar.y - 3);
            }else{
                ctx.font='bold 10px Segoe UI,sans-serif'; 
                ctx.fillStyle='#4F46E5';
                ctx.fillText(''+MINUTOS_B[i]+' min', bar.x, bar.y - 14);
                ctx.font='10px Segoe UI,sans-serif'; ctx.fillStyle='#9CA3AF';
                ctx.fillText(''+NPAROS_B[i]+' Paros', bar.x, bar.y - 3);
            }
            ctx.restore();
        });
    }}]
});

// ── Tendecia ──────────────────────────────────────────────────────────────────
function crearGraficaTendencia(canvasId, labels, data, opciones) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const defaults = { labelTop: true, fontSize: 11, autoSkip: false, maxRotation: 0 };
    const cfg = Object.assign({}, defaults, opciones);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Minutos',
                data: data,
                backgroundColor: 'rgba(79,70,229,0.75)',
                borderColor: '#4F46E5',
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
                    ctx2.fillStyle = '#4F46E5';
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
    document.getElementById('wrap-semana').style.display = v==='semana' ? 'flex' : 'none';
    document.getElementById('wrap-desde').style.display  = v==='custom' ? 'flex' : 'none';
    document.getElementById('wrap-hasta').style.display  = v==='custom' ? 'flex' : 'none';
}
togglePeriodo(document.getElementById('sel-periodo').value);

// ── Toggle modo Pareto ────────────────────────────────────────────────────────
function setModoPareto(modo) {
    document.getElementById('input-modo-pareto').value = modo;
    ['falla', 'responsable', 'tipo_falla'].forEach(m => {
        const id = m === 'tipo_falla' ? 'bp-tipo' : m === 'falla' ? 'bp-falla' : 'bp-resp';
        const activo = modo === m;
        document.getElementById(id).style.background = activo ? 'var(--indigo)' : 'var(--white)';
        document.getElementById(id).style.color      = activo ? '#fff' : 'var(--text-2)';
    });
}

// ── Toggle modo Barras ────────────────────────────────────────────────────────
function setModoBarras(modo) {
    document.getElementById('input-modo-barras').value = modo;
    ['falla', 'responsable', 'tipo_falla'].forEach(m => {
        const id = m === 'tipo_falla' ? 'bb-tipo' : m === 'falla' ? 'bb-falla' : 'bb-resp';
        const activo = modo === m;
        document.getElementById(id).style.background = activo ? 'var(--indigo)' : 'var(--white)';
        document.getElementById(id).style.color      = activo ? '#fff' : 'var(--text-2)';
    });
}

// ── Buscadores de exclusión ───────────────────────────────────────────────────
document.getElementById('buscador-fallas').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.falla-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-resp').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.resp-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});
document.getElementById('buscador-tipos').addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.tipo-item').forEach(l => l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none');
});

// ── Seleccionar todo / ninguno ────────────────────────────────────────────────
function toggleTodos(listaId, estado) {
    document.querySelectorAll('#' + listaId + ' input[type="checkbox"]').forEach(c => c.checked = estado);
}

// ── Enviar con exclusiones ────────────────────────────────────────────────────
function prepararExclusiones() {
    const form = document.getElementById('form-principal');
    form.querySelectorAll('input[name="excluir_falla"],input[name="excluir_resp"],input[name="excluir_tipo"]').forEach(el => el.remove());
    document.querySelectorAll('.chk-falla').forEach(chk => {
        if (!chk.checked) {
            const inp = document.createElement('input');
            inp.type='hidden'; inp.name='excluir_falla'; inp.value=chk.dataset.val;
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
