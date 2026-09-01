/* backlog_seguimientos.js */

// Color de acento resuelto — Chart.js/canvas no entienden var(--indigo), necesitan el valor real
function colorIndigo() {
    return getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim();
}

function togglePersona(id) {
    const content = document.getElementById(id);
    const chev    = document.getElementById('chev-' + id);
    const header  = document.querySelector('[aria-controls="' + id + '"]');
    const open    = content.style.display === 'none';
    content.style.display       = open ? 'flex' : 'none';
    content.style.flexDirection = 'column';
    if (chev)   chev.style.transform = open ? 'rotate(180deg)' : '';
    if (header) header.setAttribute('aria-expanded', open ? 'true' : 'false');

    // En celular, acordeón de uno a la vez — evita scrolls kilométricos.
    if (open && window.innerWidth <= 640) {
        document.querySelectorAll('[id^="p"]').forEach(otro => {
            if (otro.id === id || otro.style.display === 'none') return;
            if (!/^p\d+$/.test(otro.id)) return;
            togglePersona(otro.id);
        });
    }

    const num     = id.replace('p', '');
    const canvas  = document.getElementById('donut-' + num);
    const wrapper = document.getElementById('donut-wrapper-' + num);
    const grafico = document.getElementById('grafico-' + num);

    // La tarjeta de gráfico por persona se oculta en celular (Opción B) —
    // Chart.js falla si intenta dibujar en un canvas cuyo contenedor no está
    // visible, así que ni se intenta.
    if (!canvas || !grafico || grafico.offsetParent === null) return;

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

    const indigoSolid = colorIndigo();

    new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: ot > 0 && manual > 0 ? [ot, manual] : ot > 0 ? [ot] : [manual],
                backgroundColor: ot > 0 && manual > 0 ? [indigoSolid, '#E24B4A'] : ot > 0 ? [indigoSolid] : ['#E24B4A'],
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

function redibujarDonuts() {
    document.querySelectorAll('canvas[id^="donut-"]').forEach(canvas => {
        const grafico = canvas.closest('[data-grafico]');
        if (grafico && grafico.offsetParent === null) return; // oculto en celular — Chart.js fallaría

        const ot     = parseInt(canvas.dataset.ot)     || 0;
        const manual = parseInt(canvas.dataset.manual) || 0;

        const indigoSolid = colorIndigo();

        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();

        new Chart(canvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: ot > 0 && manual > 0 ? [ot, manual] : ot > 0 ? [ot] : [manual],
                    backgroundColor: ot > 0 && manual > 0 ? [indigoSolid, '#E24B4A'] : ot > 0 ? [indigoSolid] : ['#E24B4A'],
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
}

document.addEventListener('DOMContentLoaded', redibujarDonuts);

// Chart.js pinta colores resueltos en píxeles al crear el chart; no reacciona
// solo a un cambio de var(--indigo), así que hay que volver a crearlo.
document.addEventListener('accentchange', redibujarDonuts);

// Si el usuario rota el teléfono (o cambia de ancho de ventana) y cruza el
// breakpoint de 640px, las donas por persona pasan de ocultas a visibles
// (o viceversa) — se vuelven a dibujar para que no queden en blanco.
window.matchMedia('(max-width: 640px)').addEventListener('change', redibujarDonuts);