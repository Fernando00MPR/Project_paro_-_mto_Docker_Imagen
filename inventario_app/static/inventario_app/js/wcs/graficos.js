/* wcs/graficos.js — Panel de Tareas WCS: los 3 gráficos (Chart.js) */

WCS.charts = { stacker: null, histograma: null, tendencia: null, destinos: null };

WCS.modoChartStacker = 'duracion'; // 'duracion' | 'cantidad' — ver wcsRenderizarChartStacker()
WCS.filtroCategoriaStacker = 'inyeccion'; // 'inyeccion' | 'pintura'

// Formato de la etiqueta a la derecha de cada barra, según el modo activo
// del gráfico de stacker (duración promedio en min, o cantidad de tareas).
function wcsFormatoEtiquetaStacker(val) {
    return WCS.modoChartStacker === 'cantidad' ? String(val) : val.toFixed(1) + ' min';
}

// Categoría de los stackers "planos" (no sub-rutas de Traslado, esas ya
// traen su propia 'categoria' en WCS_SUBRUTAS_TRASLADO) — Stacker 1-3 operan
// en zona "1" (inyección), Stacker 4-7 en zona "2" (pintura).
const WCS_CATEGORIA_STACKER = {
    'Stacker 1': 'inyeccion', 'Stacker 2': 'inyeccion', 'Stacker 3': 'inyeccion',
    'Stacker 4': 'pintura', 'Stacker 5': 'pintura', 'Stacker 6': 'pintura', 'Stacker 7': 'pintura',
};

// Sub-rutas de Traslado que coinciden con el filtro de categoría activo —
// se usa tanto para armar las etiquetas del gráfico de stacker como para
// iterarlas al sumar/contar, así ambos quedan siempre en sincronía (evita
// sumar a una etiqueta que no existe si la sub-ruta quedó filtrada afuera).
function wcsSubrutasFiltradasPorCategoria() {
    return Object.values(WCS_SUBRUTAS_TRASLADO).filter(sub => sub.categoria === WCS.filtroCategoriaStacker);
}

// Paleta con separación de matiz amplia (no tonos vecinos como índigo/violeta
// o naranja/ámbar) para que las 8 categorías se distingan de un vistazo en
// los gráficos apilados/leyenda.
const WCS_COLORES_STACKER = {
    'Stacker 1': '#E6194B', 'Stacker 2': '#3CB44B', 'Stacker 3': '#4363D8',
    'Stacker 4': '#F58231', 'Stacker 5': '#911EB4', 'Stacker 6': '#008080',
    'Stacker 7': '#9A6324', 'Traslado': '#808080',
};

// Grupos de ubicación de destino para el gráfico "Ubicaciones de destino",
// separados por categoría (Inyección = prefijo "1", Pintura = prefijo "2").
// 'tipo: prefijo' compara los primeros 2 caracteres; 'tipo: exacto' compara
// el código completo (necesario para 2B10/2B11, que si se trataran como
// prefijo "2B" incluirían cualquier otro código que empiece igual).
const WCS_GRUPOS_DESTINO = {
    inyeccion: [
        { clave: '1D', tipo: 'prefijo' },
        { clave: '1F', tipo: 'prefijo' },
        { clave: '1H', tipo: 'prefijo' },
        { clave: '1K', tipo: 'prefijo' },
        { clave: '1T', tipo: 'prefijo' },
        { clave: '1W', tipo: 'prefijo' },
        // Se solapan a propósito con '1T' (ambos son códigos que empiezan
        // con "1T") — conviven igual que las sub-rutas de Traslado que ya
        // se solapan entre sí en el gráfico de stacker.
        { clave: '1T1001-1009', tipo: 'rango', codigos: wcsRangoCodigos('1T', 1001, 1009) },
        { clave: '1T1010-1035', tipo: 'rango', codigos: wcsRangoCodigos('1T', 1010, 1035) },
    ],
    pintura: [
        { clave: '2T', tipo: 'prefijo' },
        { clave: '2W', tipo: 'prefijo' },
        { clave: '2H', tipo: 'prefijo' },
        { clave: '2F', tipo: 'prefijo' },
        { clave: '2B10', tipo: 'prefijo4' },
        { clave: '2B11', tipo: 'prefijo4' },
        { clave: '2B20', tipo: 'prefijo4' },
    ],
};

const WCS_COLORES_GRUPO_DESTINO = {
    '1D': '#4363D8', 
    '1F': '#3CB44B', 
    '1H': '#E6194B', 
    '1K': '#F58231', 
    '1T': '#911EB4', 
    '1W': '#008080',
    '1T1001-1009': '#9A6324', 
    '1T1010-1035': '#E6BEFF',
    '2T': '#F58231', 
    '2W': '#911EB4', 
    '2H': '#E6194B', 
    '2F': '#3CB44B', 
    '2B10': '#4363D8', 
    '2B11': '#9A6324',
    '2B20': '#008080',
};

// Categoría activa del gráfico "Ubicaciones de destino" — decide qué grupo
// de WCS_GRUPOS_DESTINO se muestra como checkboxes y se calcula.
WCS.categoriaDestino = 'inyeccion'; // 'inyeccion' | 'pintura'

function wcsGruposDestinoActivos() {
    return WCS_GRUPOS_DESTINO[WCS.categoriaDestino];
}

function wcsCoincideGrupoDestino(destino, grupo) {
    if (grupo.tipo === 'exacto') return destino === grupo.clave;
    if (grupo.tipo === 'prefijo4') return destino.slice(0, 4) === grupo.clave;
    if (grupo.tipo === 'rango') return grupo.codigos.includes(destino);
    return destino.slice(0, 2) === grupo.clave;
}

// Checkboxes activos en el gráfico de Ubicaciones de destino — filtro LOCAL
// a ese gráfico (no toca la tabla/KPIs/otros gráficos). Se reconstruyen
// completos (todos marcados) cada vez que cambia la categoría.
WCS.prefijosDestinoActivos = new Set(wcsGruposDestinoActivos().map(g => g.clave));

function wcsInicializarChipsDestino() {
    const grupos = wcsGruposDestinoActivos();
    WCS.prefijosDestinoActivos = new Set(grupos.map(g => g.clave));
    const contenedor = document.getElementById('wcs-chips-destino');
    if (!contenedor) return;
    contenedor.innerHTML = grupos.map(g => `
        <label class="wcs-stacker-chip">
            <input type="checkbox" checked data-prefijo-destino="${g.clave}"> ${g.clave}
        </label>
    `).join('');
    contenedor.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const p = cb.dataset.prefijoDestino;
            if (cb.checked) WCS.prefijosDestinoActivos.add(p);
            else WCS.prefijosDestinoActivos.delete(p);
            wcsRenderizarChartDestinos();
        });
    });
}

// % de tareas por cada código EXACTO de destino (ej. "1H01", "1K03"), solo
// para los que coinciden con un grupo activo de la categoría actual y están
// marcados en WCS.prefijosDestinoActivos. El % es relativo al total de
// tareas que sí caen en esos grupos (no al total general filtrado), así las
// barras siempre suman 100%.
function wcsCalcularPorcentajeDestinos(filas) {
    const grupos = wcsGruposDestinoActivos().filter(g => WCS.prefijosDestinoActivos.has(g.clave));
    const conteos = {};
    let total = 0;
    filas.forEach(t => {
        const destino = String(t.destino || '');
        if (!grupos.some(g => wcsCoincideGrupoDestino(destino, g))) return;
        conteos[destino] = (conteos[destino] || 0) + 1;
        total += 1;
    });

    const claveDe = codigo => {
        const g = grupos.find(g => wcsCoincideGrupoDestino(codigo, g));
        return g ? g.clave : '';
    };
    const orden = wcsGruposDestinoActivos().map(g => g.clave);
    const etiquetas = Object.keys(conteos).sort((a, b) => {
        const ca = claveDe(a), cb = claveDe(b);
        if (ca !== cb) return orden.indexOf(ca) - orden.indexOf(cb);
        return a.localeCompare(b);
    });
    const porcentajes = etiquetas.map(e => total ? (conteos[e] / total) * 100 : 0);
    const colores = etiquetas.map(e => WCS_COLORES_GRUPO_DESTINO[claveDe(e)]);

    return { etiquetas, porcentajes, colores, total };
}

// Fecha "sana" — evita que un año a medio escribir en el input dispare
// cálculos absurdos (ver wcsConstruirBuckets).
function wcsFechaValida(str) {
    if (!str) return false;
    const anio = parseInt(str.slice(0, 4), 10);
    return anio >= 2000 && anio <= 2100;
}

// Chart.js pinta en <canvas> con colores ya resueltos a píxeles — no entiende
// var(--text), así que hay que leer el valor real calculado por el navegador
// (mismo patrón que colorIndigo() en bitacora_agv.js).
function wcsColorTexto() {
    return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#374151';
}

// Etiqueta con el total arriba de cada barra — si hay varios datasets
// apilados (histograma por stacker), suma todos y usa la posición del
// dataset de más arriba (el último) como referencia en Y.
const wcsPluginEtiquetaArriba = {
    id: 'wcsEtiquetaArriba',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = wcsColorTexto();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const nDatasets = chart.data.datasets.length;
        const metaTop = chart.getDatasetMeta(nDatasets - 1).data;
        chart.data.labels.forEach((_, i) => {
            const total = chart.data.datasets.reduce((sum, ds) => sum + (ds.data[i] || 0), 0);
            if (!total) return;
            const bar = metaTop[i];
            ctx.fillText(String(total), bar.x, bar.y - 4);
        });
        ctx.restore();
    },
};

// Mismo patrón que wcsColorTexto() pero para --indigo — se usa para
// distinguir la línea de mediana de la de promedio en el histograma.
function wcsColorIndigo() {
    return getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim() || '#4F46E5';
}

// Percentil exacto sobre un array YA ORDENADO (interpolación lineal entre
// posiciones, igual método que PERCENTIL.INC de Excel / numpy 'linear').
// A diferencia del método de interpolar por bucket, aquí usamos la duración
// real de cada tarea — más preciso que asumir distribución uniforme dentro
// de cada rango de 5 min.
function wcsPercentil(valoresOrdenados, p) {
    if (!valoresOrdenados.length) return null;
    const idx = (p / 100) * (valoresOrdenados.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return valoresOrdenados[lo];
    const frac = idx - lo;
    return valoresOrdenados[lo] + (valoresOrdenados[hi] - valoresOrdenados[lo]) * frac;
}

// Línea vertical punteada superpuesta al histograma (promedio, mediana...).
// El eje X es de categorías (buckets de 5 min), así que hay que ubicar el
// pixel a mano: bucket que le toca + fracción dentro de él. 'offsetY' separa
// las etiquetas verticalmente cuando hay más de una línea (evita que se
// encimen si dos valores caen en buckets cercanos).
function wcsCrearPluginLineaValor(valor, etiqueta, bucket, tope, color, offsetY) {
    return {
        id: 'wcsLineaValor_' + etiqueta,
        afterDatasetsDraw(chart) {
            if (valor === null || valor === undefined) return;
            const { ctx, chartArea } = chart;
            const meta = chart.getDatasetMeta(0).data;
            if (!meta.length) return;
            const esUltimo = valor >= tope;
            let idx = esUltimo ? meta.length - 1 : Math.floor(valor / bucket);
            idx = Math.min(Math.max(idx, 0), meta.length - 1);
            const bar = meta[idx];
            const inicioBucket = idx * bucket;
            const frac = esUltimo ? 0.5 : Math.min(1, Math.max(0, (valor - inicioBucket) / bucket));
            const x = bar.x - bar.width / 2 + frac * bar.width;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = '600 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${etiqueta}: ${valor.toFixed(1)} min`, x, chartArea.top - 4 - offsetY);
            ctx.restore();
        },
    };
}

const wcsPluginEtiquetaDerecha = {
    id: 'wcsEtiquetaDerecha',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = wcsColorTexto();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const val = chart.data.datasets[0].data[i];
            if (!val) return;
            ctx.fillText(wcsFormatoEtiquetaStacker(val), bar.x + 6, bar.y);
        });
        ctx.restore();
    },
};

// Etiqueta a la derecha con el valor en % — para el gráfico de Ubicaciones
// de destino, cuyas barras son porcentajes en vez de minutos/cantidad.
const wcsPluginEtiquetaPorcentaje = {
    id: 'wcsEtiquetaPorcentaje',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px sans-serif';
        ctx.fillStyle = wcsColorTexto();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
            const val = chart.data.datasets[0].data[i];
            if (!val) return;
            ctx.fillText(val.toFixed(1) + '%', bar.x + 6, bar.y);
        });
        ctx.restore();
    },
};

// Etiquetas del gráfico de duración promedio: los stackers normales tal cual
// (filtrados por categoría si aplica), y "Traslado" desglosado en sus
// sub-rutas activas (WCS_SUBRUTAS_TRASLADO) en vez de una sola barra genérica.
function wcsEtiquetasChartStacker() {
    const cat = WCS.filtroCategoriaStacker;
    const base = WCS_STACKERS.filter(s => s !== 'Traslado' && WCS_CATEGORIA_STACKER[s] === cat);
    const subrutas = wcsSubrutasFiltradasPorCategoria().map(sub => sub.etiqueta);
    return [...base, ...subrutas];
}

function wcsCalcularPromedioPorStacker(filas, etiquetas) {
    etiquetas = etiquetas || wcsEtiquetasChartStacker();
    const sumas = {}, conteos = {};
    etiquetas.forEach(e => { sumas[e] = 0; conteos[e] = 0; });

    // 'normales' solo cuentan tareas ya clasificadas como Traslado; 'siempre'
    // (siempreCuenta) se evalúan para TODAS las tareas sin importar su
    // stacker — están separadas para no evaluar dos veces la misma sub-ruta
    // sobre una misma tarea Traslado (evita duplicar la suma).
    const activas = wcsSubrutasFiltradasPorCategoria();
    const normales = activas.filter(s => !s.siempreCuenta);
    const siempre = activas.filter(s => s.siempreCuenta);

    filas.forEach(t => {
        if (t.duracion_min === null || t.duracion_min === undefined) return;

        if (t.stacker === 'Traslado') {
            // Las sub-rutas se solapan a propósito (ej. 1D→1K/1H incluye lo
            // mismo que 1D→1K y 1D→1H por separado), así que una tarea puede
            // sumar a más de una barra.
            normales.forEach(sub => {
                if (wcsCoincideSubruta(t, sub)) {
                    sumas[sub.etiqueta] += t.duracion_min;
                    conteos[sub.etiqueta] += 1;
                }
            });
        } else if (sumas.hasOwnProperty(t.stacker)) {
            sumas[t.stacker] += t.duracion_min;
            conteos[t.stacker] += 1;
        }

        siempre.forEach(sub => {
            if (wcsCoincideSubruta(t, sub)) {
                sumas[sub.etiqueta] += t.duracion_min;
                conteos[sub.etiqueta] += 1;
            }
        });
    });

    return etiquetas.map(e => conteos[e] ? sumas[e] / conteos[e] : 0);
}

// Cantidad de tareas por stacker/sub-ruta — cuenta TODAS las tareas que
// coinciden (a diferencia del promedio, no exige que tengan duracion_min).
function wcsCalcularCantidadPorStacker(filas, etiquetas) {
    etiquetas = etiquetas || wcsEtiquetasChartStacker();
    const conteos = {};
    etiquetas.forEach(e => { conteos[e] = 0; });

    const activas = wcsSubrutasFiltradasPorCategoria();
    const normales = activas.filter(s => !s.siempreCuenta);
    const siempre = activas.filter(s => s.siempreCuenta);

    filas.forEach(t => {
        if (t.stacker === 'Traslado') {
            normales.forEach(sub => {
                if (wcsCoincideSubruta(t, sub)) conteos[sub.etiqueta] += 1;
            });
        } else if (conteos.hasOwnProperty(t.stacker)) {
            conteos[t.stacker] += 1;
        }

        siempre.forEach(sub => {
            if (wcsCoincideSubruta(t, sub)) conteos[sub.etiqueta] += 1;
        });
    });

    return etiquetas.map(e => conteos[e]);
}

function wcsRenderizarChartStacker() {
    const etiquetas = wcsEtiquetasChartStacker();
    const esCantidad = WCS.modoChartStacker === 'cantidad';
    const datos = esCantidad
        ? wcsCalcularCantidadPorStacker(WCS.filtradas, etiquetas)
        : wcsCalcularPromedioPorStacker(WCS.filtradas, etiquetas);

    // Inyección/Pintura pueden traer bastantes barras (stackers + sub-rutas
    // de esa categoría) — la altura se ajusta según cuántas etiquetas queden.
    const box = document.getElementById('wcs-chart-stacker-box');
    if (box) box.style.height = Math.max(420, etiquetas.length * 24 + 40) + 'px';

    const el = document.getElementById('wcs-chart-stacker');
    if (WCS.charts.stacker) WCS.charts.stacker.destroy();
    WCS.charts.stacker = new Chart(el, {
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [{
                label: esCantidad ? window.WCS_I18N.cantidad : window.WCS_I18N.duracionPromedio,
                data: datos,
                backgroundColor: '#4F46E5',
                borderRadius: 4,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
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
}

// Histograma desglosado por stacker (buckets de 5 min, tope 60+) — a
// diferencia de wcsConstruirHistograma (filtros.js, usado por el KPI), aquí
// se necesita una serie por stacker para las barras apiladas del gráfico.
// Usa los stackers "planos" (sin desglosar Traslado en sub-rutas), porque
// las sub-rutas se solapan a propósito y eso rompería la suma de la pila.
function wcsConstruirHistogramaPorStacker(filas) {
    const BUCKET = 5, TOPE = 60;
    const etiquetas = [];
    for (let i = 0; i < TOPE; i += BUCKET) etiquetas.push(`${i}-${i + BUCKET}`);
    etiquetas.push(`${TOPE}+`);

    const series = {};
    WCS_STACKERS.forEach(s => { series[s] = new Array(etiquetas.length).fill(0); });

    filas.forEach(t => {
        const d = t.duracion_min;
        if (d === null || d === undefined || d < 0) return;
        const idx = d >= TOPE ? etiquetas.length - 1 : Math.floor(d / BUCKET);
        series[t.stacker][idx]++;
    });

    return { etiquetas, series, bucket: BUCKET, tope: TOPE };
}

// Fila de percentiles (p75/p90/p95) dentro de la tarjeta "Distribución de
// duración" — 'duracionesOrdenadas' ya viene ordenada ascendente (se
// reutiliza el mismo array que arma wcsRenderizarChartHistograma).
function wcsRenderizarStatsDistribucion(duracionesOrdenadas) {
    const el = document.getElementById('wcs-dist-stats');
    if (!el) return;
    if (!duracionesOrdenadas.length) { el.innerHTML = ''; return; }

    const p75 = wcsPercentil(duracionesOrdenadas, 75);
    const p90 = wcsPercentil(duracionesOrdenadas, 90);
    const p95 = wcsPercentil(duracionesOrdenadas, 95);

    el.innerHTML = [
        { etiqueta: 'p75', valor: p75 },
        { etiqueta: 'p90', valor: p90 },
        { etiqueta: 'p95', valor: p95 },
    ].map(s => `
        <div class="wcs-dist-stat-box">
            <span class="wcs-dist-stat-label">${s.etiqueta}</span>
            <span class="wcs-dist-stat-value">${s.valor.toFixed(1)} min</span>
        </div>
    `).join('');
}

function wcsRenderizarChartHistograma() {
    const duraciones = WCS.filtradas.map(t => t.duracion_min).filter(d => d !== null && d !== undefined).sort((a, b) => a - b);
    const promedio = duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : null;
    const mediana = wcsPercentil(duraciones, 50);
    wcsRenderizarStatsDistribucion(duraciones);
    const { etiquetas, series, bucket, tope } = wcsConstruirHistogramaPorStacker(WCS.filtradas);

    const datasets = WCS_STACKERS.map(s => ({
        label: s,
        data: series[s],
        backgroundColor: WCS_COLORES_STACKER[s],
        stack: 'total',
    }));

    const el = document.getElementById('wcs-chart-histograma');
    if (WCS.charts.histograma) WCS.charts.histograma.destroy();
    WCS.charts.histograma = new Chart(el, {
        type: 'bar',
        data: { labels: etiquetas, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
}

// Ubicaciones de destino (1D/1F/1H/1K/1T) — % de tareas por cada código
// exacto. La cantidad de códigos distintos depende de los datos, así que la
// altura del contenedor se ajusta dinámicamente (mín. 260px, ~22px por barra).
function wcsRenderizarChartDestinos() {
    const { etiquetas, porcentajes, colores } = wcsCalcularPorcentajeDestinos(WCS.filtradas);
    const box = document.getElementById('wcs-chart-destinos-box');
    box.style.height = Math.max(260, etiquetas.length * 22 + 40) + 'px';

    const el = document.getElementById('wcs-chart-destinos');
    if (WCS.charts.destinos) WCS.charts.destinos.destroy();
    WCS.charts.destinos = new Chart(el, {
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [{
                data: porcentajes,
                backgroundColor: colores,
                borderRadius: 4,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 50 } },
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
        },
        plugins: [wcsPluginEtiquetaPorcentaje],
    });
}

// Ventana cronológica 06:00→06:00 (sección 5.2 del documento) — puerto de
// construir_buckets() de wcs_logic.py, pero recibiendo/devolviendo Date de JS.
// 'horaDesde'/'horaHasta' (de los filtros Hora desde/hasta) reemplazan el
// ancla fija de 06:00 cuando el usuario los especifica — si no, el
// comportamiento por defecto (06:00→06:00) queda igual que antes.
function wcsConstruirBuckets(desde, hasta, fechasCreado, horaDesde, horaHasta) {
    let inicio, fin;
    const horaIni = horaDesde || '06:00';
    const horaFin = horaHasta || '06:00';

    if (desde) {
        inicio = new Date(`${desde}T${horaIni}:00`);
    } else if (fechasCreado.length) {
        const minimo = new Date(Math.min(...fechasCreado.map(d => d.getTime())));
        inicio = new Date(minimo);
        inicio.setHours(6, 0, 0, 0);
        if (minimo < inicio) inicio.setDate(inicio.getDate() - 1);
    } else {
        return { inicio: null, fin: null, horas: [] };
    }

    if (hasta) {
        fin = new Date(`${hasta}T${horaFin}:00`);
    } else if (fechasCreado.length) {
        const maximo = new Date(Math.max(...fechasCreado.map(d => d.getTime())));
        fin = new Date(maximo);
        fin.setHours(6, 0, 0, 0);
        if (maximo >= fin) fin.setDate(fin.getDate() + 1);
    } else {
        return { inicio: null, fin: null, horas: [] };
    }

    if (fin <= inicio) fin = new Date(inicio.getTime() + 24 * 3600 * 1000);

    const LIMITE_HORAS = 24 * 90;
    if ((fin - inicio) / 3600000 > LIMITE_HORAS) {
        fin = new Date(inicio.getTime() + LIMITE_HORAS * 3600 * 1000);
    }

    const horas = [];
    let t = new Date(inicio);
    while (t < fin) {
        horas.push(new Date(t));
        t = new Date(t.getTime() + 3600 * 1000);
    }
    return { inicio, fin, horas };
}

function wcsAgruparPorHora(filas, horas) {
    const series = {};
    WCS_STACKERS.forEach(s => { series[s] = new Array(horas.length).fill(0); });
    const total = new Array(horas.length).fill(0);
    if (!horas.length) return { series, total };

    filas.forEach(t => {
        if (!t.creado) return;
        const idx = Math.floor((t.creado.getTime() - horas[0].getTime()) / 3600000);
        if (idx < 0 || idx >= horas.length) return;
        series[t.stacker][idx]++;
        total[idx]++;
    });
    return { series, total };
}

function wcsEtiquetasHoras(horas) {
    if (!horas.length) return [];
    const rangoHoras = (horas[horas.length - 1] - horas[0]) / 3600000;
    const soloHora = rangoHoras <= 23;
    return horas.map(h => {
        const hh = String(h.getHours()).padStart(2, '0') + ':00';
        if (soloHora) return hh;
        const dd = String(h.getDate()).padStart(2, '0');
        const mm = String(h.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm} ${hh}`;
    });
}

function wcsRenderizarChartTendencia() {
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

    const el = document.getElementById('wcs-chart-tendencia');
    if (WCS.charts.tendencia) WCS.charts.tendencia.destroy();

    if (!horas.length) {
        WCS.charts.tendencia = null;
        return;
    }

    const { series, total } = wcsAgruparPorHora(WCS.filtradas, horas);
    const etiquetas = wcsEtiquetasHoras(horas);

    const datasets = WCS_STACKERS.map(s => ({
        label: s,
        data: series[s],
        borderColor: WCS_COLORES_STACKER[s],
        backgroundColor: WCS_COLORES_STACKER[s],
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 1.5,
    }));
    datasets.push({
        label: window.WCS_I18N.total,
        data: total,
        borderColor: wcsColorTexto(),
        backgroundColor: wcsColorTexto(),
        borderDash: [5, 4],
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.25,
    });

    WCS.charts.tendencia = new Chart(el, {
        type: 'line',
        data: { labels: etiquetas, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 24, font: { size: 10 } } },
                y: { beginAtZero: true, ticks: { precision: 0 } },
            },
        },
    });
}

function wcsRenderizarGraficos() {
    wcsRenderizarChartStacker();
    wcsRenderizarChartHistograma();
    wcsRenderizarChartDestinos();
    wcsRenderizarChartTendencia();
}

// Redibuja al cambiar tema (claro/oscuro) o color de acento — Chart.js ya
// pintó los colores anteriores en píxeles y no reacciona solo al CSS nuevo.
document.addEventListener('accentchange', () => {
    if (WCS.filtradas) wcsRenderizarGraficos();
});