/* backlog_seguimientos.js */

function togglePersona(id) {
    const content = document.getElementById(id);
    const chev    = document.getElementById('chev-' + id);
    const open    = content.style.display === 'none';
    content.style.display       = open ? 'flex' : 'none';
    content.style.flexDirection = 'column';
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';

    const num     = id.replace('p', '');
    const canvas  = document.getElementById('donut-' + num);
    const wrapper = document.getElementById('donut-wrapper-' + num);
    const grafico = document.getElementById('grafico-' + num);

    if (!canvas) return;

    const ot     = parseInt(canvas.dataset.ot)     || 0;
    const manual = parseInt(canvas.dataset.manual) || 0;
    const size   = open ? 200 : 56;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    canvas.width  = size;
    canvas.height = size;
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    if (wrapper) {
        wrapper.style.width  = size + 'px';
        wrapper.style.height = size + 'px';
    }
    //if (grafico) grafico.style.width = open ? '500px' : '500px';

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: ot > 0 && manual > 0 ? [ot, manual] : ot > 0 ? [ot] : [manual],
                backgroundColor: ot > 0 && manual > 0 ? ['#4F46E5', '#E24B4A'] : ot > 0 ? ['#4F46E5'] : ['#E24B4A'],
                borderWidth: 2,
                borderColor: '#ffffff',
            }]
        },
        options: {
            responsive: false,
            cutout: '60%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 300 },
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Donuts
    document.querySelectorAll('canvas[id^="donut-"]').forEach(canvas => {
        const ot     = parseInt(canvas.dataset.ot)     || 0;
        const manual = parseInt(canvas.dataset.manual) || 0;
        new Chart(canvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: ot > 0 && manual > 0 ? [ot, manual] : ot > 0 ? [ot] : [manual],
                    backgroundColor: ot > 0 && manual > 0 ? ['#4F46E5', '#E24B4A'] : ot > 0 ? ['#4F46E5'] : ['#E24B4A'],
                    borderWidth: 2,
                    borderColor: '#ffffff',
                }]
            },
            options: {
                responsive: false,
                cutout: '60%',
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                animation: { duration: 300 },
            }
        });
    });
});
