const semanas_labels  = window.DASHBOARD_CONFIG.semanas;
const semanas_valores = window.DASHBOARD_CONFIG.valores;
const colores = semanas_valores.map(v => v >= 90 ? '#1D9E75' : '#E24B4A');

const chartEl = document.getElementById('chartCumplimiento');
const chart = new Chart(chartEl, {
    type: 'bar',
    data: {
        labels: semanas_labels,
        datasets: [{
            label: 'Cumplimiento %',
            data: semanas_valores,
            backgroundColor: colores,
            borderRadius: 4,
            borderSkipped: false,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 30, left: 10, right: 10 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                padding: 10,
                callbacks: {
                    title: ctx => 'Semana ' + ctx[0].label.replace('S', ''),
                    label: ctx => ' Cumplimiento: ' + ctx.parsed.y + '%',
                    afterLabel: ctx => {
                        const i = ctx.dataIndex;
                        const total = window.DASHBOARD_CONFIG.totales[i];
                        const completadas = window.DASHBOARD_CONFIG.completadas[i];
                        return [
                            ' Completadas: ' + completadas,
                            ' Pendientes: ' + (total - completadas),
                        ];
                    }
                }
            },
        },
        scales: {
            y: {
                min: 0, max: 100,
                ticks: { stepSize: 20, callback: v => v + '%', color: '#888780', font: { size: 10 } },
                grid: { color: 'rgba(136,135,128,0.15)' },
                border: { display: false }
            },
            x: {
                ticks: { color: '#888780', font: { size: 11 }, autoSkip: false, maxRotation: 45, minRotation: 45 },
                grid: { display: false },
                border: { display: false }
            }
        }
    },
    plugins: [{
        id: 'topLabels',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            chart.getDatasetMeta(0).data.forEach((bar, i) => {
                const val = data.datasets[0].data[i];
                if (val === 0) return;
                ctx.fillStyle = colores[i];
                ctx.font = '500 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.save();
                ctx.translate(bar.x, bar.y - 6);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(val + '%', 10, 0);
                ctx.restore();
            });
            ctx.restore();
        }
    }]
});

function descargarGrafico() {
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = chartEl.width;
    tmpCanvas.height = chartEl.height;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.fillStyle = '#ffffff';
    tmpCtx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    tmpCtx.drawImage(chartEl, 0, 0);
    const link = document.createElement('a');
    link.download = 'Cumplimiento_Semanas_' + window.DASHBOARD_CONFIG.anio + '.png';
    link.href = tmpCanvas.toDataURL('image/png');
    link.click();
}