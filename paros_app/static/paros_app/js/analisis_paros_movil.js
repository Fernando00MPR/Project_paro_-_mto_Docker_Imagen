/* analisis_paros_movil.js — Vista móvil de Análisis de paros (≤767px).
   Reutiliza globals/funciones ya existentes en analisis_paros.js y en el
   <script> inline del template: colorIndigo, esModoOscuro, togglePeriodo,
   setModoBarras, setOrdenBarras, cambiarAnioSemanas, prepararExclusiones,
   abrirModalConAnimacion/cerrarModalConAnimacion
   (globales de base_menu.html), y los const LABELS_B/MINUTOS_B/NPAROS_B/
   ORDEN_BARRAS, LABELS_T/MINUTOS_T ya renderizados por el servidor. */

// ── Focus trap genérico (igual patrón que lista_paros_movil.js) ──────────────
let focusTrapHandler = null;
let focusTrapDisparador = null;

function focusTrap(box) {
    focusTrapDisparador = document.activeElement;
    const focosables = box.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focosables.length) focosables[0].focus();

    focusTrapHandler = function (e) {
        if (e.key === 'Escape') {
            const backdrop = box.closest('.modal-backdrop');
            if (backdrop) cerrarModalConAnimacion(backdrop);
            else cerrarSheetFiltros();
            liberarFocusTrap();
            return;
        }
        if (e.key !== 'Tab') return;
        const items = Array.from(focosables).filter(el => el.offsetParent !== null);
        if (!items.length) return;
        const primero = items[0], ultimo = items[items.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
            e.preventDefault(); ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault(); primero.focus();
        }
    };
    document.addEventListener('keydown', focusTrapHandler);
}

function liberarFocusTrap() {
    if (focusTrapHandler) document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
    if (focusTrapDisparador && document.body.contains(focusTrapDisparador)) {
        focusTrapDisparador.focus();
    }
    focusTrapDisparador = null;
}

// Evita que el transform del último frame de la animación de apertura se quede
// pegado para siempre (rompería el position:fixed del .dp-popover embebido en
// el sheet de Filtros) — mismo arreglo que ya existe en base_menu.html para
// modal-box-in, aplicado aquí a sheet-movil-in sin tocar ese archivo.
document.addEventListener('animationend', function (e) {
    if (e.animationName === 'sheet-movil-in') {
        e.target.style.animation = 'none';
    }
});

// Todos los controles del formulario de filtros (selects + casillas de los
// 5 paneles de exclusión) llaman a esta función en vez de prepararExclusiones()
// directo: en escritorio aplica de inmediato (igual que siempre); en móvil no
// hace nada porque el sheet de Filtros aplica todo junto al pulsar "Aplicar
// filtros" (ver aplicarFiltrosMovil).
function onCambioExclusion() {
    if (window.innerWidth <= 767) return;
    prepararExclusiones();
}

// ── Sheet de Filtros (#filtros-exclusiones-wrap no usa .modal-backdrop — ver
// plan: evita duplicar checkboxes) ────────────────────────────────────────────
function abrirSheetFiltros(event) {
    const wrap = document.getElementById('filtros-exclusiones-wrap');
    const backdrop = document.getElementById('filtros-backdrop');
    wrap.classList.remove('cerrando');
    backdrop.style.display = 'block';
    requestAnimationFrame(() => {
        wrap.classList.add('abierto');
        backdrop.classList.add('abierto');
    });
    actualizarContadoresExclusion();
    focusTrap(wrap);
}

function cerrarSheetFiltros() {
    const wrap = document.getElementById('filtros-exclusiones-wrap');
    const backdrop = document.getElementById('filtros-backdrop');
    wrap.classList.add('cerrando');
    backdrop.classList.remove('abierto');
    liberarFocusTrap();
    setTimeout(() => {
        wrap.classList.remove('abierto', 'cerrando');
        backdrop.style.display = 'none';
    }, 160);
}

function aplicarFiltrosMovil() {
    prepararExclusiones();
}

function restablecerFiltrosMovil() {
    const url = new URL(window.location.href);
    window.location.href = url.origin + url.pathname;
}

// ── Sheets genéricas ("⋯", Pareto completo) — reutilizan el motor de
// base_menu.html tal cual (mismo patrón que lista_paros_movil.js) ────────────
function abrirSheetMas(event) {
    const modal = document.getElementById('sheet-mas');
    abrirModalConAnimacion(modal, event);
    focusTrap(modal.querySelector('.modal-box'));
}

function abrirSheetParetoCompleto(event) {
    renderParetoMovilCompleto();
    const modal = document.getElementById('sheet-pareto-completo');
    abrirModalConAnimacion(modal, event);
    focusTrap(modal.querySelector('.modal-box'));
}

document.addEventListener('DOMContentLoaded', function () {
    ['sheet-mas', 'sheet-pareto-completo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function (e) {
            if (e.target === el) {
                cerrarModalConAnimacion(el);
                liberarFocusTrap();
            }
        });
    });
});

// ── Proxies de Turno/Estatus (botones segmentados que escriben sobre el
// <select> real — no se duplica el campo, solo se oculta por CSS) ───────────
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.ap-seg').forEach(btn => {
        btn.addEventListener('click', function () {
            const grupo = this.closest('.ap-segmentado');
            const campo = grupo.dataset.proxyDe;
            grupo.querySelectorAll('.ap-seg').forEach(b => b.setAttribute('aria-pressed', 'false'));
            this.setAttribute('aria-pressed', 'true');
            const real = document.querySelector(`[name="${campo}"]`);
            if (real) real.value = this.dataset.valor;
        });
    });

});

// ── Acordeón de los 5 paneles de exclusión ────────────────────────────────────
function toggleAcordeonPanel(header) {
    const expandido = header.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.panel-exclusion-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
    header.setAttribute('aria-expanded', expandido ? 'false' : 'true');
}

const MAPA_PANELES = {
    fallas: 'chk-falla', equipos: 'chk-equipo', responsables: 'chk-resp',
    tipos: 'chk-tipo', atendio: 'chk-atendio',
};

function actualizarContadoresExclusion() {
    let primerConExclusiones = null;
    Object.entries(MAPA_PANELES).forEach(([panel, clase]) => {
        const checks = document.querySelectorAll('.' + clase);
        const total = checks.length;
        const excluidos = Array.from(checks).filter(c => !c.checked).length;
        const header = document.querySelector(`.panel-exclusion-header[data-panel="${panel}"]`);
        if (!header) return;
        const contador = header.querySelector('.pe-contador');
        if (excluidos > 0) {
            contador.textContent = `${total - excluidos} ${i18n.de} ${total}`;
            header.dataset.tieneExclusiones = '1';
            if (!primerConExclusiones) primerConExclusiones = header;
        } else {
            contador.textContent = `${i18n.todos} (${total})`;
            header.dataset.tieneExclusiones = '0';
        }
    });
    document.querySelectorAll('.panel-exclusion-header').forEach(h => h.setAttribute('aria-expanded', 'false'));
    if (primerConExclusiones) primerConExclusiones.setAttribute('aria-expanded', 'true');
}

function hayExclusionesActivas() {
    return Object.values(MAPA_PANELES).some(clase =>
        Array.from(document.querySelectorAll('.' + clase)).some(el => !el.checked));
}

// ── Badge + chips de filtros activos ──────────────────────────────────────────
function actualizarFiltrosActivosMovil() {
    const area    = document.querySelector('[name="area"]');
    const subarea = document.querySelector('[name="sub_area"]');
    const turno   = document.querySelector('[name="turno"]');
    const estatus = document.querySelector('[name="estatus"]');

    const chips = [];
    let badge = 0;
    [area, subarea, turno, estatus].forEach(sel => {
        if (sel && sel.value) {
            chips.push(sel.options[sel.selectedIndex].text.trim());
            badge++;
        }
    });
    if (hayExclusionesActivas()) badge++;

    const badgeEl = document.getElementById('ap-badge-filtros');
    badgeEl.textContent = badge > 0 ? String(badge) : '';

    const cont = document.getElementById('ap-chips-activos');
    cont.innerHTML = chips.map(txt =>
        `<button type="button" class="mcb-chip" onclick="abrirSheetFiltros(event)">${txt}</button>`
    ).join('');
}

// ── Tarjeta "Pareto de paros" — lista de barras horizontales ──────────────────
function calcularFilasPareto() {
    const valores = ORDEN_BARRAS === 'cantidad' ? NPAROS_B : MINUTOS_B;
    const total = valores.reduce((a, b) => a + b, 0) || 1;
    const max = Math.max.apply(null, valores.concat([1]));
    let acumulado = 0;
    return LABELS_B.map((label, i) => {
        const antes = acumulado;
        acumulado += valores[i];
        return {
            rank: i + 1,
            nombre: label,
            valor: valores[i],
            paros: NPAROS_B[i],
            pct: Math.round(acumulado / total * 100),
            vital: antes / total < 0.8,
            ancho: Math.max(2, valores[i] / max * 100),
        };
    });
}

function filaParetoHtml(f, esUltimaVital) {
    const unidad = ORDEN_BARRAS === 'cantidad' ? '' : ' min';
    const color = f.vital ? 'var(--indigo)' : '#B9C6F3';
    const claseDivisor = esUltimaVital ? ' ap-divisor-80' : '';
    return `
        <li class="${claseDivisor.trim()}">
            <div class="ap-pr-fila1">
                <span class="ap-pr-rank">${f.rank}</span>
                <span class="ap-pr-nombre">${f.nombre}</span>
                <span class="ap-pr-valor">${f.valor}${unidad}</span>
            </div>
            <div class="ap-pr-fila2">
                <div class="ap-pr-pista"><div class="ap-pr-relleno" style="width:${f.ancho}%;background:${color};"></div></div>
                <span class="ap-pr-meta">${f.paros} · ${f.pct}%</span>
            </div>
        </li>`;
}

function textoDimensionActual() {
    const modo = (document.getElementById('input-modo-barras') || {}).value;
    return {
        falla: i18n.dimFalla, equipo: i18n.dimEquipo, responsable: i18n.dimResponsable,
        tipo_falla: i18n.dimTipoFalla, atendio: i18n.dimAtendio,
    }[modo] || i18n.dimFalla;
}

function renderParetoMovil() {
    const filas = calcularFilasPareto();
    const limitadas = filas.slice(0, 10);
    const contenedor = document.getElementById('pareto-movil-lista');
    contenedor.innerHTML = limitadas.map((f, i) => {
        const esUltimaVital = f.vital && (!limitadas[i + 1] || !limitadas[i + 1].vital);
        return filaParetoHtml(f, esUltimaVital);
    }).join('');

    const btn = document.getElementById('btn-pareto-ver-todos');
    if (filas.length > 10) {
        btn.style.display = 'block';
        btn.textContent = `${i18n.verTodos} (${filas.length})`;
    } else {
        btn.style.display = 'none';
    }

    const n80 = filas.filter(f => f.vital).length;
    document.getElementById('ap-pareto-subtitulo').textContent =
        `${n80} ${textoDimensionActual()} ${i18n.causanEl80}`;
}

function renderParetoMovilCompleto() {
    const filas = calcularFilasPareto();
    const contenedor = document.getElementById('pareto-movil-lista-completa');
    contenedor.innerHTML = filas.map((f, i) => {
        const esUltimaVital = f.vital && (!filas[i + 1] || !filas[i + 1].vital);
        return filaParetoHtml(f, esUltimaVital);
    }).join('');
}

// ── Tarjeta "Tendencia semanal" ────────────────────────────────────────────────
let verAnioCompletoMovil = false;

function isoSemanaDeHoy() {
    const hoy = new Date();
    const d = new Date(hoy);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const inicioAnio = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - inicioAnio) / 86400000 + 1) / 7);
}

function topeSemanasMovil() {
    const anioInput = document.getElementById('input-anio-semanas');
    const anioSel = parseInt(anioInput.value, 10);
    const tope = (anioSel === new Date().getFullYear()) ? isoSemanaDeHoy() : LABELS_T.length;
    return Math.min(Math.max(tope, 1), LABELS_T.length);
}

const lineasGuiaTendenciaPlugin = {
    id: 'lineasGuiaTendenciaMovil',
    afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const datos = chart.data.datasets[0].data;
        const max = Math.max.apply(null, datos.concat([1]));
        [max, max / 2].forEach(valor => {
            if (!valor) return;
            const y = scales.y.getPixelForValue(valor);
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(94,97,117,.35)';
            ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke();
            ctx.fillStyle = 'rgba(94,97,117,.7)';
            ctx.font = '10px inherit';
            ctx.fillText(Math.round(valor), chartArea.left, y - 2);
            ctx.restore();
        });
    },
};

function crearGraficaTendenciaSemanalMovil() {
    const tope = topeSemanasMovil();
    let etiquetas, datos;
    if (verAnioCompletoMovil) {
        etiquetas = LABELS_T;
        datos = MINUTOS_T;
    } else {
        const desde = Math.max(0, tope - 28);
        etiquetas = LABELS_T.slice(desde, tope);
        datos = MINUTOS_T.slice(desde, tope);
    }

    document.getElementById('ap-anio-actual-movil').textContent = document.getElementById('input-anio-semanas').value;

    const transcurridos = MINUTOS_T.slice(0, tope);
    let peorIdx = -1, peorVal = -1, conParos = 0;
    transcurridos.forEach((v, i) => {
        if (v > peorVal) { peorVal = v; peorIdx = i; }
        if (v > 0) conParos++;
    });
    document.getElementById('ts-peor-semana').textContent =
        peorVal > 0 ? `${LABELS_T[peorIdx]} · ${peorVal} min` : '—';
    document.getElementById('ts-semanas-con-paros').textContent = `${conParos} ${i18n.de} ${tope}`;

    const max = Math.max.apply(null, datos.concat([1]));
    const existente = Chart.getChart('chartTendenciaSemanalMovil');
    if (existente) existente.destroy();
    const ctx = document.getElementById('chartTendenciaSemanalMovil');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [{
                data: datos,
                backgroundColor: datos.map(v => v === max && v > 0 ? colorIndigo() : '#8FA3EC'),
                borderRadius: 3,
                maxBarThickness: 24,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (item) => `${item.label} · ${item.raw} min` } },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        autoSkip: false, maxRotation: 0, minRotation: 0,
                        callback: (val, idx) => (idx % 4 === 0 ? etiquetas[idx] : ''),
                    },
                },
                y: { display: false, beginAtZero: true },
            },
        },
        plugins: [lineasGuiaTendenciaPlugin],
    });
}

function toggleAnioCompletoMovil() {
    verAnioCompletoMovil = !verAnioCompletoMovil;
    const btn = document.getElementById('btn-ver-anio-completo');
    btn.textContent = verAnioCompletoMovil ? i18n.verRecientes : i18n.verAnioCompleto;
    document.getElementById('ts-chart-wrap').classList.toggle('ver-completo', verAnioCompletoMovil);
    crearGraficaTendenciaSemanalMovil();
}

// El Periodo en móvil ya no está fijo a "semanas" — puede ser cualquiera de
// las 8 opciones de escritorio. El selector de año, las mini-KPIs y "Ver año
// completo" solo tienen sentido cuando el periodo agrupa por semana; para
// cualquier otro periodo se ocultan y se dibuja el gráfico genérico con
// crearGraficaTendencia() (la misma función que ya usa la tarjeta de
// escritorio "Tendencia diaria" para cualquier forma de datos).
function actualizarTendenciaMovil() {
    const selPeriodo = document.getElementById('sel-periodo');
    const esSemanal = !selPeriodo || selPeriodo.value === 'semanas';

    document.querySelector('.ap-anio-selector').style.display = esSemanal ? 'flex' : 'none';
    document.querySelector('.ap-mini-kpis').style.display = esSemanal ? 'flex' : 'none';
    document.getElementById('btn-ver-anio-completo').style.display = esSemanal ? 'flex' : 'none';

    if (esSemanal) {
        crearGraficaTendenciaSemanalMovil();
        return;
    }

    verAnioCompletoMovil = false;
    document.getElementById('ts-chart-wrap').classList.remove('ver-completo');
    const existente = Chart.getChart('chartTendenciaSemanalMovil');
    if (existente) existente.destroy();
    if (document.getElementById('chartTendenciaSemanalMovil')) {
        crearGraficaTendencia('chartTendenciaSemanalMovil', LABELS_T, MINUTOS_T, {
            fontSize: 10, maxRotation: 45, autoSkip: LABELS_T.length > 20,
        });
    }
}

// ── Inicialización ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    actualizarFiltrosActivosMovil();
    actualizarContadoresExclusion();
    renderParetoMovil();
    actualizarTendenciaMovil();
});

// Al reaccionar a cambios de acento/tema, analisis_paros.js ya recrea los
// charts de escritorio — se hace lo mismo aquí para el de tendencia semanal.
document.addEventListener('accentchange', function () {
    actualizarTendenciaMovil();
});
