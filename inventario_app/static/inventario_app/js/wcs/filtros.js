/* wcs/filtros.js — Panel de Tareas WCS: filtros en vivo + cálculo de KPIs */

const WCS_STACKERS = [
    'Stacker 1', 'Stacker 2', 'Stacker 3', 'Stacker 4',
    'Stacker 5', 'Stacker 6', 'Stacker 7', 'Traslado',
];

// Retrasa la ejecución de fn hasta que pasen 'ms' sin nuevas llamadas — para
// no recalcular filtros/gráficos en cada tecla de un campo de texto.
function wcsDebounce(fn, ms) {
    let temporizador = null;
    return (...args) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fn(...args), ms);
    };
}

// Genera códigos exactos 'prefijoNNNN' desde..hasta (ambos inclusive) — evita
// escribir a mano listas largas como 1T1010..1T1035 en WCS_SUBRUTAS_TRASLADO.
function wcsRangoCodigos(prefijo, desde, hasta) {
    const codigos = [];
    for (let n = desde; n <= hasta; n++) codigos.push(prefijo + n);
    return codigos;
}

// 'categoria': 'inyeccion' (todo lo que empieza con "1") o 'pintura' (todo lo
// que empieza con "2") — usada por el botón de filtro Inyección/Pintura del
// gráfico "Duración promedio por stacker" (ver WCS_CATEGORIA_STACKER en
// graficos.js para la categoría de los stackers "planos").
const WCS_SUBRUTAS_TRASLADO = {
    'traslado_1d_1k_1h': { origen: '1D', destinos: ['1K', '1H'], etiqueta: '1D → 1K/1H', categoria: 'inyeccion' },
    'traslado_1d_1k':    { origen: '1D', destinos: ['1K'], etiqueta: '1D → 1K', categoria: 'inyeccion' },
    'traslado_1d_1h':    { origen: '1D', destinos: ['1H'], etiqueta: '1D → 1H', categoria: 'inyeccion' },
    'traslado_1c_1d':    { origen: '1C', destinos: ['1D'], etiqueta: '1C → 1D', categoria: 'inyeccion' },
    'traslado_1c_1z':    { origen: '1C', destinos: ['1Z'], etiqueta: '1C → 1Z', categoria: 'inyeccion', siempreCuenta: true },
    'traslado_1t_1c':    { origen: '1T', destinos: ['1C'], etiqueta: '1T → 1C', categoria: 'inyeccion' },
    'traslado_1b_1t':    { origen: '1B', destinos: ['1T'], etiqueta: '1B → 1T', categoria: 'inyeccion' },
    // 'origenes' = lista de códigos exactos (no prefijo) — para rangos como
    // este, donde solo cuentan 1T1001..1T1009, no todo lo que empiece "1T".
    'traslado_1t1001_1009_1c': {
        origenes: ['1T1001', '1T1002', '1T1003', '1T1004', '1T1005', '1T1006', '1T1007', '1T1008', '1T1009'],
        destinos: ['1C'],
        etiqueta: '1T1001-1009 → 1C',
        categoria: 'inyeccion',
    },
    'traslado_1t1010_1035_1c': {
        origenes: wcsRangoCodigos('1T', 1010, 1035),
        destinos: ['1C'],
        etiqueta: '1T1010-1035 → 1C',
        categoria: 'inyeccion',
    },
    'traslado_1b_1t1010_1035': {
        origen: '1B',
        destinosExactos: wcsRangoCodigos('1T', 1010, 1035),
        etiqueta: '1B → 1T1010-1035',
        categoria: 'inyeccion',
    },
    'traslado_1b_1t1001_1009': {
        origen: '1B',
        destinosExactos: wcsRangoCodigos('1T', 1001, 1009),
        etiqueta: '1B → 1T1001-1009',
        categoria: 'inyeccion',
    },
     // 'siempreCuenta' = se evalúa contra TODAS las tareas, no solo las
    // clasificadas como Traslado — necesario porque estas 10 tocan un
    // extremo "1Z"/"2Z" (la misma zona que ya define a Stacker 1-7 en
    // determinar_stacker de wcs_logic.py), así que una tarea puede sumar
    // tanto a su Stacker normal como a esta sub-ruta (mismo criterio de
    // solape ya usado entre sub-rutas de Traslado).
    'traslado_1z_1d': { origen: '1Z', destinos: ['1D'], etiqueta: '1Z → 1D', categoria: 'inyeccion', siempreCuenta: true },
    'traslado_1z_1t': { origen: '1Z', destinos: ['1T'], etiqueta: '1Z → 1T', categoria: 'inyeccion', siempreCuenta: true },
    'traslado_1z_1f': { origen: '1Z', destinos: ['1F'], etiqueta: '1Z → 1F', categoria: 'inyeccion', siempreCuenta: true },
    'traslado_1z_1c': { origen: '1Z', destinos: ['1C'], etiqueta: '1Z → 1C', categoria: 'inyeccion', siempreCuenta: true },
    'traslado_2z_2t': { origen: '2Z', destinos: ['2T'], etiqueta: '2Z → 2T', categoria: 'pintura', siempreCuenta: true },
    'traslado_2z_2b': { origen: '2Z', destinos: ['2B'], etiqueta: '2Z → 2B', categoria: 'pintura', siempreCuenta: true },
    
    'traslado_2z_2b10': { origen: '2Z', destinosPrefijo4: ['2B10'], etiqueta: '2Z → 2B10', categoria: 'pintura', siempreCuenta: true },
    'traslado_2z_2b11': { origen: '2Z', destinosPrefijo4: ['2B11'], etiqueta: '2Z → 2B11', categoria: 'pintura', siempreCuenta: true },
    'traslado_2z_2b20': { origen: '2Z', destinosPrefijo4: ['2B20'], etiqueta: '2Z → 2B20', categoria: 'pintura', siempreCuenta: true },
    
    'traslado_2z_2f': { origen: '2Z', destinos: ['2F'], etiqueta: '2Z → 2F', categoria: 'pintura', siempreCuenta: true },
    'traslado_2t_2z': { origen: '2T', destinos: ['2Z'], etiqueta: '2T → 2Z', categoria: 'pintura', siempreCuenta: true },
    'traslado_2b_2z': { origen: '2B', destinos: ['2Z'], etiqueta: '2B → 2Z', categoria: 'pintura', siempreCuenta: true },
    'traslado_2b20_2z': { origenPrefijo4: '2B20', destinos: ['2Z'], etiqueta: '2B20 → 2Z', categoria: 'pintura', siempreCuenta: true },
    // Estas no tocan zona 1Z/2Z, así que nunca chocan con la clasificación
    // de Stacker — se quedan con el comportamiento normal (solo cuentan
    // tareas ya clasificadas como Traslado).

    'traslado_2b10_2t': { origenPrefijo4: '2B10', destinos: ['2T'], etiqueta: '2B10 → 2T', categoria: 'pintura' },
    'traslado_2b11_2t': { origenPrefijo4: '2B11', destinos: ['2T'], etiqueta: '2B11 → 2T', categoria: 'pintura' },
    'traslado_2b20_2t': { origenPrefijo4: '2B20', destinos: ['2T'], etiqueta: '2B20 → 2T', categoria: 'pintura' },
};

// 'origenPrefijo4'/'destinosPrefijo4' = prefijo de 4 caracteres (no 2, no
// exacto) — para códigos como "2B10XX"/"2B11XX" donde los últimos 2
// caracteres varían, así que ni el prefijo de 2 ("2B", demasiado amplio) ni
// el exacto ("2B10", demasiado estricto) sirven.
function wcsCoincideSubruta(t, sub) {
    const origen = String(t.origen || '');
    const destino = String(t.destino || '');
    const coincideOrigen = sub.origenes
        ? sub.origenes.includes(origen)
        : sub.origenPrefijo4
            ? origen.slice(0, 4) === sub.origenPrefijo4
            : origen.slice(0, 2) === sub.origen;
    const coincideDestino = sub.destinosExactos
        ? sub.destinosExactos.includes(destino)
        : sub.destinosPrefijo4
            ? sub.destinosPrefijo4.includes(destino.slice(0, 4))
            : sub.destinos.includes(destino.slice(0, 2));
    return coincideOrigen && coincideDestino;
}

WCS.filtradas = [];
WCS.stackersActivos = new Set(WCS_STACKERS);

// Restaura los filtros GLOBALES (los que afectan tabla/KPIs/gráficos en
// conjunto) a su estado por defecto — no toca los filtros LOCALES de cada
// gráfico (Inyección/Pintura, Duración/Cantidad, checkboxes de destino).
function wcsLimpiarFiltros() {
    ['wcs-buscar', 'wcs-movimiento', 'wcs-status',
     'wcs-hora-desde', 'wcs-hora-hasta', 'wcs-filtro-col-origen', 'wcs-filtro-col-destino']
        .forEach(id => { document.getElementById(id).value = ''; });

    // Desde/Hasta son el selector de fecha único; su valor real vive en el
    // hidden .dp-value, y hay que disparar 'change' para que el widget se
    // resincronice visualmente (ver date_picker.js).
    ['dp-wcs-desde', 'dp-wcs-hasta'].forEach(dpId => {
        const hidden = document.querySelector('#' + dpId + ' .dp-value');
        hidden.value = '';
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });

    WCS.stackersActivos = new Set(WCS_STACKERS);
    document.querySelectorAll('#wcs-stackers input[type=checkbox]').forEach(cb => { cb.checked = true; });

    wcsAplicarFiltros();
}

function wcsInicializarFiltros() {
    // Chips de Stacker — todos marcados por defecto
    WCS.stackersActivos = new Set(WCS_STACKERS);
    const contenedor = document.getElementById('wcs-stackers');
    contenedor.innerHTML = WCS_STACKERS.map(nombre => `
        <label class="wcs-stacker-chip">
            <input type="checkbox" checked data-stacker="${nombre}"> ${nombre}
        </label>
    `).join('');
    contenedor.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
            const nombre = cb.dataset.stacker;
            if (cb.checked) WCS.stackersActivos.add(nombre);
            else WCS.stackersActivos.delete(nombre);
            wcsAplicarFiltros();
        });
    });

    // Chips de prefijo de destino (1D/1F/1H/1K/1T/1W) — filtro local del
    // gráfico "Ubicaciones de destino" (definida en graficos.js).
    if (typeof wcsInicializarChipsDestino === 'function') wcsInicializarChipsDestino();

    // Status — se puebla dinámicamente con los valores presentes en los datos
    const statusSelect = document.getElementById('wcs-status');
    const valoresStatus = [...new Set(WCS.datos.map(t => t.status))].sort((a, b) => a - b);
    statusSelect.innerHTML = `<option value="">${window.WCS_I18N.todos}</option>` +
        valoresStatus.map(v => `<option value="${v}">${v}</option>`).join('');

    // Listeners del resto de filtros (una sola vez)
    if (!WCS._filtrosListo) {
        // Campos de texto libre: cada tecla dispara un filtrado completo +
        // 4 gráficos Chart.js + tabla — con archivos grandes se siente
        // lento al escribir, por eso van con debounce. Los demás (selects,
        // fecha, hora) cambian con un solo clic, no hace falta.
        const CAMPOS_TEXTO = ['wcs-buscar', 'wcs-filtro-col-origen', 'wcs-filtro-col-destino'];
        const CAMPOS_INSTANTANEOS = [
            'wcs-movimiento', 'wcs-status',
            'wcs-hora-desde', 'wcs-hora-hasta',
        ];
        const aplicarConDebounce = wcsDebounce(wcsAplicarFiltros, 250);

        CAMPOS_TEXTO.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', aplicarConDebounce);
            el.addEventListener('change', aplicarConDebounce);
        });
        CAMPOS_INSTANTANEOS.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', wcsAplicarFiltros);
            el.addEventListener('change', wcsAplicarFiltros);
        });
        // Desde/Hasta son el selector de fecha único; su hidden solo dispara
        // 'change' (no 'input').
        document.querySelector('#dp-wcs-desde .dp-value').addEventListener('change', wcsAplicarFiltros);
        document.querySelector('#dp-wcs-hasta .dp-value').addEventListener('change', wcsAplicarFiltros);
        document.getElementById('wcs-limpiar-filtros').addEventListener('click', wcsLimpiarFiltros);
        WCS._filtrosListo = true;
    }
}

function wcsAplicarFiltros() {

    WCS.pagina = 1;

    const busqueda   = document.getElementById('wcs-buscar').value.trim().toLowerCase();
    const movimiento = document.getElementById('wcs-movimiento').value;
    const status     = document.getElementById('wcs-status').value;
    const desde      = document.querySelector('#dp-wcs-desde .dp-value').value;
    const hasta      = document.querySelector('#dp-wcs-hasta .dp-value').value

    const colOrigen  = document.getElementById('wcs-filtro-col-origen').value.trim().toLowerCase();
    const colDestino = document.getElementById('wcs-filtro-col-destino').value.trim().toLowerCase();

    const horaDesde  = document.getElementById('wcs-hora-desde').value;
    const horaHasta  = document.getElementById('wcs-hora-hasta').value;

    // "Hora desde" se combina con "Fecha desde" (por defecto 00:00:00 si no
    // se especifica hora), y "Hora hasta" con "Fecha hasta" (por defecto
    // 23:59:59) — un solo rango de fecha+hora continuo, ya no un filtro de
    // hora del día independiente de la fecha.
    const desdeDate = desde ? new Date(`${desde}T${horaDesde ? horaDesde + ':00' : '00:00:00'}`) : null;
    const hastaDate = hasta ? new Date(`${hasta}T${horaHasta ? horaHasta + ':00' : '23:59:59'}`) : null;

    WCS.filtradas = WCS.datos.filter(t => {
        if (!WCS.stackersActivos.has(t.stacker)) return false;
        if (movimiento) {
            const sub = WCS_SUBRUTAS_TRASLADO[movimiento];
            if (sub) {
                if (!wcsCoincideSubruta(t, sub)) return false;
            } else if (t.movimiento !== movimiento) {
                return false;
            }
        }
        if (status && String(t.status) !== status) return false;
        if (desdeDate && (!t.creado || t.creado < desdeDate)) return false;
        if (hastaDate && (!t.creado || t.creado > hastaDate)) return false;
        if (colOrigen && !String(t.origen || '').toLowerCase().includes(colOrigen)) return false;
        if (colDestino && !String(t.destino || '').toLowerCase().includes(colDestino)) return false;
        if (busqueda) {
            // "-&-" separa varios términos — coincide si el texto contiene
            // CUALQUIERA de ellos (ej. "1D01-&-1K05" busca ambos a la vez).
            const terminos = busqueda.split('-&-').map(s => s.trim()).filter(Boolean);
            const texto = `${t.serial} ${t.codigo} ${t.rack} ${t.material} ${t.origen} ${t.destino}`.toLowerCase();
            if (!terminos.some(term => texto.includes(term))) return false;
        }
        return true;
    });

    wcsRenderizarKPIs();
    if (typeof wcsRenderizarGraficos === 'function') wcsRenderizarGraficos();
    if (typeof wcsRenderizarTabla === 'function') wcsRenderizarTabla();
}

// Histograma de duración (bucket de 5 min, tope 60+) — la usan tanto el KPI
// de "duración más frecuente" como el gráfico de distribución (Parte 5c).
function wcsConstruirHistograma(duraciones) {
    const BUCKET = 5, TOPE = 60;
    const etiquetas = [];
    for (let i = 0; i < TOPE; i += BUCKET) etiquetas.push(`${i}-${i + BUCKET}`);
    etiquetas.push(`${TOPE}+`);

    const conteos = new Array(etiquetas.length).fill(0);
    duraciones.forEach(d => {
        if (d === null || d === undefined || d < 0) return;
        const idx = d >= TOPE ? etiquetas.length - 1 : Math.floor(d / BUCKET);
        conteos[idx]++;
    });

    let mejorIdx = 0;
    conteos.forEach((c, i) => { if (c > conteos[mejorIdx]) mejorIdx = i; });

    return {
        etiquetas,
        conteos,
        rangoFrecuente: conteos[mejorIdx] ? etiquetas[mejorIdx] : null,
        rangoFrecuenteCount: conteos[mejorIdx] || 0,
    };
}

function wcsRenderizarKPIs() {
    const filas = WCS.filtradas;
    const total = WCS.datos.length;

    const duraciones = filas.map(t => t.duracion_min).filter(d => d !== null && d !== undefined);
    const promedio = duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : null;
    const histograma = wcsConstruirHistograma(duraciones);
    const sinFinalizar = filas.filter(t => !t.finalizado).length;

    const conteoStacker = {};
    filas.forEach(t => { conteoStacker[t.stacker] = (conteoStacker[t.stacker] || 0) + 1; });
    let stackerMasUsado = '—', maxCount = 0;
    Object.entries(conteoStacker).forEach(([k, v]) => {
        if (v > maxCount) { maxCount = v; stackerMasUsado = k; }
    });

    const racksDistintos = new Set(filas.map(t => t.rack)).size;

    const I = window.WCS_I18N;
    const kpis = [
        { label: I.tareas,             value: `${filas.length} / ${total}` },
        { label: I.duracionPromedio,   value: promedio !== null ? `${promedio.toFixed(1)} min` : '—' },
        { label: I.duracionFrecuente,  value: histograma.rangoFrecuente ? `${histograma.rangoFrecuente} min` : '—' },
        { label: I.sinFinalizar,       value: sinFinalizar },
        { label: I.stackerMasUsado,    value: stackerMasUsado },
        { label: I.racksDistintos,     value: racksDistintos },
    ];

    document.getElementById('wcs-kpis').innerHTML = kpis.map(k => `
        <div class="card wcs-kpi">
            <div class="wcs-kpi-label">${k.label}</div>
            <div class="wcs-kpi-value">${k.value}</div>
        </div>
    `).join('');
}
