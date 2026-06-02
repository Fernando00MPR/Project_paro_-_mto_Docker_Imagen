/* dashboard.js — Controles de filtros y gráfica de tendencia */

// ── Toggle rangos de fecha ────────────────────────────────────────────────────
function toggleCustom(val) {
    const wrapSemana = document.getElementById('wrap-semana');
    const wrapDesde  = document.getElementById('wrap-desde');
    const wrapHasta  = document.getElementById('wrap-hasta');
    const btnSemana  = document.getElementById('btn-aplicar-semana');
    const btnCustom  = document.getElementById('btn-aplicar-custom');
    if (wrapSemana) wrapSemana.style.display = val === 'semana_num' ? 'flex' : 'none';
    if (wrapDesde)  wrapDesde.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (wrapHasta)  wrapHasta.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (btnSemana)  btnSemana.style.display  = val === 'semana_num' ? 'flex' : 'none';
    if (btnCustom)  btnCustom.style.display  = val === 'custom'     ? 'flex' : 'none';
    if (val !== 'semana_num' && val !== 'custom') {
        document.getElementById('rango-select').closest('form').submit();
    }
}

// ── Fábrica de gráfica de tendencia ──────────────────────────────────────────
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
                        
                        if(labels.length >= 25){
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