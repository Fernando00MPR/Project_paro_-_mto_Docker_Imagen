/* wcs/tabla.js — Panel de Tareas WCS: tabla ordenable/paginada + modal de gráfico en pantalla completa */

WCS.pagina = 1;
WCS.porPagina = 20;
WCS.orden = { columna: null, asc: true };
WCS.modalChart = null;
WCS.columnasOcultas = new Set(); // índices de celda (0-based) ocultos

// ── Mostrar/ocultar columnas ─────────────────────────────────────────────────
// Mismo patrón que lista_paros.html (paros_app): índice de celda + <colgroup>,
// porque esta tabla usa table-layout:fixed con anchos fijos por columna.
// A diferencia de lista_paros.html, el <tbody> aquí se reconstruye por
// completo en cada render (filtro/orden/página) — por eso wcsRenderizarTabla()
// llama a wcsAplicarVisibilidadColumnas() al final, para que las filas nuevas
// respeten lo que ya estaba oculto.
function wcsToggleDropdownColumnas() {
    const d = document.getElementById('wcs-dropdown-columnas');
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

function wcsAplicarVisibilidadColumnas() {
    if (!WCS.columnasOcultas.size) return;
    document.querySelectorAll('#wcs-tabla tr').forEach(row => {
        const cells = row.querySelectorAll('th, td');
        WCS.columnasOcultas.forEach(col => {
            if (cells[col]) cells[col].style.display = 'none';
        });
    });
}

function wcsToggleColumna(cb) {
    const col = parseInt(cb.dataset.colidx, 10);
    if (cb.checked) WCS.columnasOcultas.delete(col);
    else WCS.columnasOcultas.add(col);

    document.querySelectorAll('#wcs-tabla tr').forEach(row => {
        const cells = row.querySelectorAll('th, td');
        if (cells[col]) cells[col].style.display = cb.checked ? '' : 'none';
    });
    const cols = document.querySelectorAll('#wcs-tabla colgroup col');
    if (cols[col]) cols[col].style.display = cb.checked ? '' : 'none';

    wcsGuardarColumnas();
}

function wcsGuardarColumnas() {
    const estado = {};
    document.querySelectorAll('#wcs-dropdown-columnas input[data-colidx]').forEach(cb => {
        estado[cb.dataset.colidx] = cb.checked;
    });
    localStorage.setItem('wcs-columnas', JSON.stringify(estado));
}

function wcsRestaurarColumnas() {
    const guardado = localStorage.getItem('wcs-columnas');
    const estado = guardado ? JSON.parse(guardado) : {};
    document.querySelectorAll('#wcs-dropdown-columnas input[data-colidx]').forEach(cb => {
        const col = cb.dataset.colidx;
        const visible = estado.hasOwnProperty(col) ? estado[col] : cb.checked;
        cb.checked = visible;
        if (!visible) wcsToggleColumna(cb);
    });
}

function wcsOrdenarFilas(filas) {
    if (!WCS.orden.columna) return filas;
    const col = WCS.orden.columna;
    const signo = WCS.orden.asc ? 1 : -1;
    return [...filas].sort((a, b) => {
        let va = a[col], vb = b[col];
        if (va === null || va === undefined) va = '';
        if (vb === null || vb === undefined) vb = '';
        if (va instanceof Date) va = va.getTime();
        if (vb instanceof Date) vb = vb.getTime();
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return -1 * signo;
        if (va > vb) return 1 * signo;
        return 0;
    });
}

function wcsFormatearFecha(d) {
    if (!d) return '—';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convierte un hex (#RRGGBB) a rgba(...) — para el fondo tenue del badge.
function wcsColorAlpha(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function wcsBadgeStacker(stacker) {
    const color = WCS_COLORES_STACKER[stacker] || '#6B7280';
    return `<span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:600;background:${wcsColorAlpha(color, .15)};color:${color};">${stacker}</span>`;
}

// Mismo patrón visual/de ventana (±2 alrededor de la actual) que el
// paginado del resto del proyecto (.pagination de menu_app/base_menu.html),
// pero con <button> en vez de <a href> porque aquí no se recarga la página.
function wcsRenderizarPaginacion(totalPaginas) {
    const actual = WCS.pagina;
    let html = '';

    html += actual <= 1
        ? `<span class="disabled">‹</span>`
        : `<button data-pag="${actual - 1}">‹</button>`;

    for (let num = 1; num <= totalPaginas; num++) {
        if (num === actual) {
            html += `<span class="current">${num}</span>`;
        } else if (num > actual - 3 && num < actual + 3) {
            html += `<button data-pag="${num}">${num}</button>`;
        }
    }

    html += actual >= totalPaginas
        ? `<span class="disabled">›</span>`
        : `<button data-pag="${actual + 1}">›</button>`;

    const cont = document.getElementById('wcs-paginacion');
    cont.innerHTML = html;
    cont.querySelectorAll('button[data-pag]').forEach(btn => {
        btn.addEventListener('click', () => {
            WCS.pagina = parseInt(btn.dataset.pag, 10);
            wcsRenderizarTabla();
        });
    });
}

function wcsRenderizarTabla() {
    const filas = wcsOrdenarFilas(WCS.filtradas);
    const totalPaginas = Math.max(1, Math.ceil(filas.length / WCS.porPagina));
    if (WCS.pagina > totalPaginas) WCS.pagina = totalPaginas;
    const inicio = (WCS.pagina - 1) * WCS.porPagina;
    const pagina = filas.slice(inicio, inicio + WCS.porPagina);

    document.getElementById('wcs-tabla-body').innerHTML = pagina.map(t => `
        <tr>
            <td>${t.serial ?? '—'}</td>
            <td>${t.codigo ?? '—'}</td>
            <td>${t.rack ?? '—'}</td>
            <td title="${t.material ?? ''}">${t.material ?? '—'}</td>
            <td>${t.status ?? '—'}</td>
            <td>${wcsFormatearFecha(t.creado)}</td>
            <td>${wcsFormatearFecha(t.finalizado)}</td>
            <td>${t.duracion_min !== null && t.duracion_min !== undefined ? t.duracion_min.toFixed(1) : '—'}</td>
            <td>${t.movimiento}</td>
            <td>${wcsBadgeStacker(t.stacker)}</td>
            <td title="${t.origen ?? ''}">${t.origen ?? '—'}</td>
            <td title="${t.destino ?? ''}">${t.destino ?? '—'}</td>
        </tr>
    `).join('');
    
    wcsAplicarVisibilidadColumnas();
    wcsRenderizarPaginacion(totalPaginas);
}

// ── Modal de gráfico en pantalla completa ──────────────────────────────────
// En modo pantalla completa, la tendencia horaria muestra TODAS las horas
// (sin auto-skip) — a diferencia de la vista chica, que limita las etiquetas.
function wcsAbrirModalGrafico(tipo) {
    const modal = document.getElementById('wcs-modal');
    const canvas = document.getElementById('wcs-modal-canvas');
    modal.classList.add('is-open');

    if (WCS.modalChart) { WCS.modalChart.destroy(); WCS.modalChart = null; }

    if (tipo === 'stacker') {
        const etiquetas = wcsEtiquetasChartStacker();
        const esCantidad = WCS.modoChartStacker === 'cantidad';
        const datos = esCantidad
            ? wcsCalcularCantidadPorStacker(WCS.filtradas, etiquetas)
            : wcsCalcularPromedioPorStacker(WCS.filtradas, etiquetas);
        WCS.modalChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: etiquetas,
                datasets: [{
                    label: esCantidad ? window.WCS_I18N.cantidad : window.WCS_I18N.duracionPromedio,
                    data: datos, backgroundColor: '#4F46E5', borderRadius: 4,
                }],
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                layout: { padding: { right: 50 } },
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: esCantidad ? { precision: 0 } : { callback: v => v + ' min' },
                    },
                },
            },
            plugins: [wcsPluginEtiquetaDerecha],
        });
    } else if (tipo === 'histograma') {
        const duraciones = WCS.filtradas.map(t => t.duracion_min).filter(d => d !== null && d !== undefined).sort((a, b) => a - b);
        const promedio = duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : null;
        const mediana = wcsPercentil(duraciones, 50);
        const { etiquetas, series, bucket, tope } = wcsConstruirHistogramaPorStacker(WCS.filtradas);
        const datasets = WCS_STACKERS.map(s => ({
            label: s, data: series[s], backgroundColor: WCS_COLORES_STACKER[s], stack: 'total',
        }));
        WCS.modalChart = new Chart(canvas, {
            type: 'bar',
            data: { labels: etiquetas, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 40 } },
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                },
            },
            plugins: [
                wcsPluginEtiquetaArriba,
                wcsCrearPluginLineaValor(promedio, window.WCS_I18N.duracionPromedio, bucket, tope, wcsColorTexto(), 0),
                wcsCrearPluginLineaValor(mediana, window.WCS_I18N.mediana, bucket, tope, wcsColorIndigo(), 12),
            ],
        });
    } else if (tipo === 'destinos') {
        const { etiquetas, porcentajes, colores } = wcsCalcularPorcentajeDestinos(WCS.filtradas);
        WCS.modalChart = new Chart(canvas, {
            type: 'bar',
            data: { labels: etiquetas, datasets: [{ data: porcentajes, backgroundColor: colores, borderRadius: 4 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                layout: { padding: { right: 50 } },
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
            },
            plugins: [wcsPluginEtiquetaPorcentaje],
        });
    } else if (tipo === 'tendencia') {
        const desde = document.querySelector('#dp-wcs-desde .dp-value').value;
        const hasta = document.querySelector('#dp-wcs-hasta .dp-value').value;
        const horaDesde = document.getElementById('wcs-hora-desde').value;
        const horaHasta = document.getElementById('wcs-hora-hasta').value;
        const fechasCreado = WCS.filtradas.map(t => t.creado).filter(Boolean);
        const { horas } = wcsConstruirBuckets(
            wcsFechaValida(desde) ? desde : null,
            wcsFechaValida(hasta) ? hasta : null,
            fechasCreado,
            horaDesde,
            horaHasta
        );
        if (!horas.length) return;
        const { series, total } = wcsAgruparPorHora(WCS.filtradas, horas);
        const etiquetas = wcsEtiquetasHoras(horas);
        const datasets = WCS_STACKERS.map(s => ({
            label: s, data: series[s],
            borderColor: WCS_COLORES_STACKER[s], backgroundColor: WCS_COLORES_STACKER[s],
            tension: 0.25, pointRadius: 3, pointHoverRadius: 5, borderWidth: 1.5,
        }));
        datasets.push({
            label: window.WCS_I18N.total, data: total,
            borderColor: wcsColorTexto(), backgroundColor: wcsColorTexto(), borderDash: [5, 4], borderWidth: 2,
            pointRadius: 3, pointHoverRadius: 5, tension: 0.25,
        });
        WCS.modalChart = new Chart(canvas, {
            type: 'line',
            data: { labels: etiquetas, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: {
                    x: { ticks: { autoSkip: false, maxRotation: 60, minRotation: 60, font: { size: 9 } } },
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                },
            },
        });
    }
}

function wcsCerrarModal() {
    document.getElementById('wcs-modal').classList.remove('is-open');
    if (WCS.modalChart) { WCS.modalChart.destroy(); WCS.modalChart = null; }
}

// ── Tarjeta colapsable "Ubicaciones de destino" ─────────────────────────────
// Colapsada por default (sin preferencia guardada) — el usuario la expande
// si la necesita. Chart.js no redimensiona solo al pasar de display:none a
// visible, por eso el resize() manual al expandir.
function wcsToggleGraficoDestinos() {
    const card = document.getElementById('wcs-card-destinos');
    if (!card) return;
    const colapsado = card.classList.toggle('wcs-colapsado');
    localStorage.setItem('wcs-destinos-colapsado', colapsado ? '1' : '0');
    if (!colapsado && WCS.charts.destinos) WCS.charts.destinos.resize();
}

document.addEventListener('DOMContentLoaded', () => {

    // Restaurar preferencia de "Ubicaciones de destino" — colapsado por
    // default si el usuario nunca la tocó (guardado === null).
    const cardDestinos = document.getElementById('wcs-card-destinos');
    if (cardDestinos) {
        const guardado = localStorage.getItem('wcs-destinos-colapsado');
        const colapsado = guardado === null ? true : guardado === '1';
        cardDestinos.classList.toggle('wcs-colapsado', colapsado);
    }

    document.querySelectorAll('#wcs-tabla th[data-col]').forEach(th => {
        // Origen/Destino no ordenan al clic — ese clic abre su popover de
        // filtro (ver más abajo), casi nunca hace falta ordenar ubicaciones.
        if (th.dataset.col === 'origen' || th.dataset.col === 'destino') return;
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (WCS.orden.columna === col) {
                WCS.orden.asc = !WCS.orden.asc;
            } else {
                WCS.orden.columna = col;
                WCS.orden.asc = true;
            }
            WCS.pagina = 1;
            wcsRenderizarTabla();
        });
    });

    // Popover de filtro directo en los encabezados de Origen/Destino.
    // position:fixed — hay que ubicarlo con getBoundingClientRect() en cada
    // apertura (mismo patrón que .menu-fila-popover en registro_produccion.js).
    ['origen', 'destino'].forEach(col => {
        const th = document.getElementById('wcs-th-' + col);
        const popover = document.getElementById('wcs-popover-' + col);
        th.addEventListener('click', e => {
            if (e.target.tagName === 'INPUT') return;
            const abrir = !popover.classList.contains('is-open');
            ['origen', 'destino'].forEach(c => {
                document.getElementById('wcs-popover-' + c).classList.remove('is-open');
            });
            if (abrir) {
                const rect = th.getBoundingClientRect();
                popover.style.left = rect.left + 'px';
                popover.style.top = (rect.bottom + 4) + 'px';
                popover.classList.add('is-open');
            }
        });
    });
    document.addEventListener('click', e => {
        ['origen', 'destino'].forEach(col => {
            const th = document.getElementById('wcs-th-' + col);
            const popover = document.getElementById('wcs-popover-' + col);
            if (th && popover && !th.contains(e.target)) popover.classList.remove('is-open');
        });
    });

    // Toggle Duración/Cantidad del gráfico "Duración promedio por stacker".
    document.querySelectorAll('#wcs-modo-stacker button[data-modo]').forEach(btn => {
        btn.addEventListener('click', () => {
            WCS.modoChartStacker = btn.dataset.modo;
            document.querySelectorAll('#wcs-modo-stacker button').forEach(b => b.classList.toggle('current', b === btn));
            if (typeof wcsRenderizarChartStacker === 'function') wcsRenderizarChartStacker();
        });
    });

    // Filtro Todos/Inyección/Pintura del gráfico "Duración promedio por
    // stacker" — local a ese gráfico, no toca tabla/KPIs/otros gráficos.
    document.querySelectorAll('#wcs-categoria-stacker button[data-categoria]').forEach(btn => {
        btn.addEventListener('click', () => {
            WCS.filtroCategoriaStacker = btn.dataset.categoria;
            document.querySelectorAll('#wcs-categoria-stacker button').forEach(b => b.classList.toggle('current', b === btn));
            if (typeof wcsRenderizarChartStacker === 'function') wcsRenderizarChartStacker();
        });
    });

    // Toggle Inyección/Pintura del gráfico "Ubicaciones de destino" — cambia
    // qué grupo de códigos se muestra como checkboxes (se reconstruyen
    // completos, todos marcados, al cambiar de categoría).
    document.querySelectorAll('#wcs-categoria-destino button[data-categoria]').forEach(btn => {
        btn.addEventListener('click', () => {
            WCS.categoriaDestino = btn.dataset.categoria;
            document.querySelectorAll('#wcs-categoria-destino button').forEach(b => b.classList.toggle('current', b === btn));
            if (typeof wcsInicializarChipsDestino === 'function') wcsInicializarChipsDestino();
            if (typeof wcsRenderizarChartDestinos === 'function') wcsRenderizarChartDestinos();
        });
    });

    document.querySelectorAll('.wcs-porpagina button[data-porpagina]').forEach(btn => {
        btn.addEventListener('click', () => {
            WCS.porPagina = parseInt(btn.dataset.porpagina, 10);
            WCS.pagina = 1;
            document.querySelectorAll('.wcs-porpagina button').forEach(b => b.classList.toggle('current', b === btn));
            wcsRenderizarTabla();
        });
    });

    document.querySelectorAll('.wcs-chart-expand').forEach(btn => {
        btn.addEventListener('click', () => wcsAbrirModalGrafico(btn.dataset.chart));
    });

    document.getElementById('wcs-modal-close').addEventListener('click', wcsCerrarModal);
    document.getElementById('wcs-modal').addEventListener('click', e => {
        if (e.target.id === 'wcs-modal') wcsCerrarModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') wcsCerrarModal();
    });

    document.addEventListener('click', e => {
        const wrap = document.getElementById('wcs-col-picker-wrap');
        const dd = document.getElementById('wcs-dropdown-columnas');
        if (wrap && dd && !wrap.contains(e.target)) {
            dd.style.display = 'none';
        }
    });
    wcsRestaurarColumnas();
});
