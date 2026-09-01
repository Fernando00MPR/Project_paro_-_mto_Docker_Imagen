/* bitacora_agv.js — Bitácora de AGVs (Inyección / Pintura) */

const cfgAgv = window.AGV_CFG || {};

// CSRF desde cookie
const CSRF_AGV = document.cookie.split(';').find(s => s.trim().startsWith('csrftoken='))?.trim().split('=')[1] || '';

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

// Estado global — DATOS_AGV es mutable (se actualiza al guardar celdas)
let DATOS_AGV     = cfgAgv.datos    || {};
const INTERNAS    = cfgAgv.internas || [];

let celdaAgvActual     = null;
let targetInternaId    = null;
let targetMensual      = {};
let chartCumplimiento  = null;
let vistaEfAgv         = 'dia';

// ── Cargar datos iniciales ─────────────────────────────────────────────────────
function cargarDatosAgv() {
    document.querySelectorAll('.celda-agv').forEach(td => {
        const interna = td.dataset.interna;
        const turno   = td.dataset.turno;
        const dia     = parseInt(td.dataset.dia);
        const reg     = DATOS_AGV[interna]?.[turno]?.[dia];
        const val     = reg?.cantidad;
        if (val !== undefined && val > 0) {
            td.querySelector('.valor-celda').textContent = val;
            td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
            td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
            td.style.fontWeight = '600';
        }
        mostrarFlagComentario(td, reg?.comentario);
    });
}

// ── Franja indicadora de comentario (esquina inferior derecha de la celda) ────
function mostrarFlagComentario(td, comentario) {
    const flag = td.querySelector('.flag-comentario');
    if (!flag) return;
    if (comentario) {
        flag.style.display = 'block';
        td.title = comentario;
    } else {
        flag.style.display = 'none';
        td.title = '';
    } 
}

// ── Colapsar / expandir área interna ───────────────────────────────────────────
function toggleAreaInterna(clave) {
    const el  = document.getElementById('interna-' + clave);
    const chv = document.getElementById('chevron-' + clave);
    const open = el.style.display === 'none';
    el.style.display    = open ? 'block' : 'none';
    chv.style.transform = open ? 'rotate(180deg)' : '';
}

// ── Modal edición de celda ─────────────────────────────────────────────────────
function editarCelda(td) {
    celdaAgvActual = td;
    const dia     = parseInt(td.dataset.dia);
    const anio    = parseInt(td.dataset.anio);
    const interna = td.dataset.interna;
    const turno   = td.dataset.turno;
    const valActual = td.querySelector('.valor-celda').textContent.trim();
    const comentarioActual = DATOS_AGV[interna]?.[turno]?.[dia]?.comentario || '';
    const i18n  = cfgAgv.i18n || {};

    document.getElementById('modal-agv-titulo').textContent    = `${i18n.dia || 'Día'} ${dia}`;
    document.getElementById('modal-agv-subtitulo').textContent = `${cfgAgv.mesNombre} ${anio} · ${i18n.turno || 'Turno'} ${turno === 'dia' ? (i18n.turnoDia || 'día') : (i18n.turnoNoche || 'noche')}`;
    document.getElementById('modal-agv-input').value = valActual || '';
    document.getElementById('modal-agv-comentario').value = comentarioActual;
    document.getElementById('modal-agv-comentario-count').textContent = comentarioActual.length;
    document.getElementById('modal-agv').style.display = 'flex';
    setTimeout(() => document.getElementById('modal-agv-input').focus(), 50);
}

function cerrarModalAgv() {
    document.getElementById('modal-agv').style.display = 'none';
    celdaAgvActual = null;
}

// ── Stepper +/− de la cantidad ─────────────────────────────────────────────────
function pasoCantidadAgv(delta) {
    const input = document.getElementById('modal-agv-input');
    const actual = parseInt(input.value) || 0;
    const nuevo  = Math.min(100, Math.max(0, actual + delta));
    input.value = nuevo;
}

function borrarModalAgv() {
    if (!celdaAgvActual) return;
    enviarValorAgv(celdaAgvActual, '');
    cerrarModalAgv();
}

function guardarModalAgv() {
    if (!celdaAgvActual) return;
    const val        = document.getElementById('modal-agv-input').value.trim();
    const comentario = document.getElementById('modal-agv-comentario').value.trim();
    enviarValorAgv(celdaAgvActual, val, comentario);
    cerrarModalAgv();
}

// ── Enviar valor al servidor ───────────────────────────────────────────────────
function enviarValorAgv(td, valor, comentario) {
    const interna = td.dataset.interna;
    const turno   = td.dataset.turno;
    const dia     = parseInt(td.dataset.dia);
    const mes     = parseInt(td.dataset.mes).toString().padStart(2, '0');
    const anio    = td.dataset.anio;
    const fecha   = `${anio}-${mes}-${dia.toString().padStart(2, '0')}`;

    fetch(cfgAgv.urlGuardar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_AGV },
        body: JSON.stringify({ area_interna: interna, fecha, turno, cantidad: valor === '' ? null : parseInt(valor), comentario: comentario || '' })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            const span = td.querySelector('.valor-celda');
            if (data.eliminado || !valor) {
                span.textContent    = '';
                td.style.background = '';
                td.style.color      = '';
                td.style.fontWeight = '';
                if (!DATOS_AGV[interna]) DATOS_AGV[interna] = {};
                if (!DATOS_AGV[interna][turno]) DATOS_AGV[interna][turno] = {};
                delete DATOS_AGV[interna][turno][dia];
                mostrarFlagComentario(td, '');
            } else {
                span.textContent = data.cantidad;
                const t = targetMensual[interna];
                const v = parseInt(data.cantidad);
                if (t !== null && t !== undefined) {
                    td.style.background = v >= t ? '#EAF3DE' : '#FCEBEB';
                    td.style.color      = v >= t ? '#3B6D11' : '#A32D2D';
                } else {
                    td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
                    td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
                }
                td.style.fontWeight = '600';
                if (!DATOS_AGV[interna]) DATOS_AGV[interna] = {};
                if (!DATOS_AGV[interna][turno]) DATOS_AGV[interna][turno] = {};
                DATOS_AGV[interna][turno][dia] = { cantidad: data.cantidad, comentario: data.comentario };
                mostrarFlagComentario(td, data.comentario);
            }
            if (document.getElementById('chartCumplimiento')) cargarCumplimiento();
        } else {
            alert('Error: ' + (data.error || 'No se pudo guardar'));
        }
    })
    .catch(() => alert('Error de conexión'));
}

// ── Gráfico de cumplimiento ─────────────────────────────────────────────────────
function setVistaEf(vista, btn) {
    vistaEfAgv = vista;
    ['dia', 'mes', 'anio'].forEach(v => {
        const b = document.getElementById('pill-' + v);
        b.style.background = v === vista ? 'var(--indigo)' : 'var(--white)';
        b.style.color      = v === vista ? '#fff'        : 'var(--text-2)';
    });
    document.getElementById('ef-rango-dia').style.display  = vista === 'dia'  ? 'flex' : 'none';
    document.getElementById('ef-rango-mes').style.display  = vista === 'mes'  ? 'flex' : 'none';
    document.getElementById('ef-rango-anio').style.display = vista === 'anio' ? 'flex' : 'none';
    cargarCumplimiento();
}

function cargarCumplimiento() {
    const interna = document.getElementById('ef-interna').value;
    if (!interna) return;
    let url = `${cfgAgv.urlCumplimiento}?area_interna=${interna}&vista=${vistaEfAgv}`;

    if (vistaEfAgv === 'dia') {
        url += `&desde=${document.getElementById('ef-desde').value}&hasta=${document.getElementById('ef-hasta').value}`;
    } else if (vistaEfAgv === 'mes') {
        url += `&anio=${document.getElementById('ef-mes-anio').value}&mes_desde=${document.getElementById('ef-mes-desde').value}&mes_hasta=${document.getElementById('ef-mes-hasta').value}`;
    } else if (vistaEfAgv === 'anio') {
        url += `&anio_desde=${document.getElementById('ef-anio-desde').value}&anio_hasta=${document.getElementById('ef-anio-hasta').value}`;
    }
    fetch(url).then(r => r.json()).then(data => { if (data.ok) renderizarCumplimiento(data.datos); }).catch(() => {});
}

// ── Descargar gráfico de cumplimiento como PNG ─────────────────
function descargarGraficaCumplimiento() {
    const canvas = document.getElementById('chartCumplimiento');
    if (!canvas) return;
    const tmp    = document.createElement('canvas');
    tmp.width    = canvas.width;
    tmp.height   = canvas.height;
    const ctx    = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    const link    = document.createElement('a');
    link.download = `Cumplimiento_AGV_${document.getElementById('ef-interna').value}.png`;
    link.href     = tmp.toDataURL('image/png');
    link.click();
}

function renderizarCumplimiento(datos) {
    const labels       = datos.map(d => d.label);
    const cantidades   = datos.map(d => d.cantidad);
    const targets      = datos.map(d => d.target);
    const cumplimiento = datos.map(d => d.cumplimiento);
    const indigoSolid  = colorIndigo();
    const indigoAlpha  = colorIndigoRgba(0.75);
    const colorValores = esModoOscuro() ? '#FFFFFF' : indigoSolid;
    const bgColors     = cumplimiento.map((v, i) => v === null ? 'rgba(136,135,128,0.3)' : v >= 100 ? indigoAlpha : 'rgba(226,75,74,0.75)');
    const bdColors     = cumplimiento.map((v, i) => v === null ? '#888780'               : v >= 100 ? indigoSolid : '#E24B4A');

    if (chartCumplimiento) chartCumplimiento.destroy();

    chartCumplimiento = new Chart(document.getElementById('chartCumplimiento'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'AGVs', data: cantidades, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 1, borderRadius: 4, order: 2 },
                { type: 'line', label: 'Target', data: targets, borderColor: '#F59E0B', borderWidth: 2, borderDash: [6, 4], pointRadius: 3, fill: false, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 26 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.dataset.type === 'line'
                            ? ` Target: ${ctx.parsed.y ?? '—'}`
                            : ` ${ctx.parsed.y} AGVs`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780', maxRotation: 45, autoSkip: true } },
                y: { min: 0, suggestedMax: Math.max(...cantidades, ...targets.filter(t => t !== null && t !== undefined), 1) * 1.15, grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 11 }, color: '#888780' } }
            },
            animation: {
                onComplete: function() {
                    const chart = this;
                    const meta  = chart.getDatasetMeta(0);
                    const ctx2  = chart.ctx;
                    ctx2.save();
                    ctx2.font      = 'bold 11px sans-serif';
                    ctx2.textAlign = 'center';
                    chart.data.datasets[0].data.forEach((val, i) => {
                        if (!val) return;
                        const bar = meta.data[i];
                        const cum = cumplimiento[i];
                        ctx2.fillStyle = cum !== null && cum >= 100 ? colorValores : '#E24B4A';
                        ctx2.fillText(String(val), bar.x, bar.y - 6);
                    });
                    ctx2.restore();
                }
            }
        }
    });

    const tabla = document.getElementById('ef-tabla');
    const thead = tabla.querySelector('thead tr');
    const filas = tabla.querySelectorAll('tbody tr');
    while (thead.children.length > 1) thead.removeChild(thead.lastChild);
    filas.forEach(tr => { while (tr.children.length > 1) tr.removeChild(tr.lastChild); });

    const thStyle = 'padding:6px 8px; text-align:center; border:0.5px solid var(--border); min-width:60px; font-weight:500; font-size:11px; color:var(--text-3);';
    const tdStyle = 'padding:6px 8px; border:0.5px solid var(--border); text-align:center; font-family:"DM Mono",monospace; font-size:11px;';

    datos.forEach(d => {
        const th = document.createElement('th');
        th.style.cssText = thStyle;
        th.textContent = d.label;
        thead.appendChild(th);

        const td0 = document.createElement('td');
        td0.style.cssText = tdStyle;
        td0.textContent = d.cantidad > 0 ? d.cantidad : '—';
        filas[0].appendChild(td0);

        const td1 = document.createElement('td');
        td1.style.cssText = tdStyle;
        td1.textContent = d.target ?? '—';
        filas[1].appendChild(td1);

        const td2 = document.createElement('td');
        td2.style.cssText = tdStyle;
        if (d.cumplimiento !== null) {
            const color = d.cumplimiento >= 100 ? '#3B6D11' : '#A32D2D';
            const bg    = d.cumplimiento >= 100 ? '#EAF3DE' : '#FCEBEB';
            td2.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${bg};color:${color};">${d.cumplimiento}%</span>`;
        } else {
            td2.textContent = '—';
        }
        filas[2].appendChild(td2);
    });
}

// ── Targets ────────────────────────────────────────────────────────────────────
function abrirModalTarget(claveInterna, nombreInterna) {
    targetInternaId = claveInterna;
    document.getElementById('modal-target-agv-subtitulo').textContent =
        `${nombreInterna} — ${cfgAgv.mesNombre} ${cfgAgv.anio}`;

    fetch(`${cfgAgv.urlTargetGet}?area_interna=${claveInterna}&anio=${cfgAgv.anio}&mes=${cfgAgv.mes}`)
        .then(r => r.json())
        .then(mensual => {
        document.getElementById('modal-target-agv-mensual').value = mensual.target_cantidad ?? '';
        document.getElementById('modal-target-agv').style.display = 'flex';
        document.getElementById('modal-target-agv-mensual').focus();
    });
}

function cerrarModalTarget() {
    document.getElementById('modal-target-agv').style.display = 'none';
    targetInternaId = null;
}

function guardarTargetAgv() {
    const mensual = document.getElementById('modal-target-agv-mensual').value.trim();

    fetch(cfgAgv.urlTargetGuardar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_AGV },
        body: JSON.stringify({
            area_interna:    targetInternaId,
            anio:            cfgAgv.anio,
            mes:             cfgAgv.mes,
            target_cantidad: mensual === '' ? null : parseInt(mensual),
            })
        }).then(r => r.json()).then(res => {
        if (res.ok) {
            targetMensual[targetInternaId] = res.target_cantidad;
            actualizarBadgeTarget(targetInternaId);
            cerrarModalTarget();
            aplicarColoresCeldas(targetInternaId);
            cargarCumplimiento();
        } else {
            alert('Error al guardar: ' + (res.error || 'desconocido'));
        }
    });
}

function aplicarColoresCeldas(interna) {
    const t = targetMensual[interna];
    document.querySelectorAll(`.celda-agv[data-interna="${interna}"]`).forEach(td => {
        const span = td.querySelector('.valor-celda');
        if (!span.textContent.trim()) {
            td.style.background = '';
            td.style.color      = '';
            td.style.fontWeight = '';
            return;
        }
        const val = parseInt(span.textContent.trim());
        if (t !== null && t !== undefined) {
            td.style.background = val >= t ? '#EAF3DE' : '#FCEBEB';
            td.style.color      = val >= t ? '#3B6D11' : '#A32D2D';
        } else {
            const turno = td.dataset.turno;
            td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
            td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
        }
        td.style.fontWeight = '600';
    });
    actualizarBadgeTarget(interna);
}

function cargarTargets() {
    const promesas = INTERNAS.map(interna =>
        fetch(`${cfgAgv.urlTargetGet}?area_interna=${interna}&anio=${cfgAgv.anio}&mes=${cfgAgv.mes}`)
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                targetMensual[interna] = data.target_cantidad;
                actualizarBadgeTarget(interna);
            }
        })
    );
    return Promise.all(promesas);
}

function cargarTargetsGrafico() {
    return cargarTargets();
}

function actualizarBadgeTarget(interna) {
    const t = targetMensual[interna];
    const badge = document.getElementById(`badge-target-${interna}`);
    if (!badge) return;
    if (t !== null && t !== undefined) {
        badge.textContent   = `Target: ${t}`;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// ── Eventos y arranque ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModalAgv(); cerrarModalTarget(); }
});

document.addEventListener('DOMContentLoaded', () => {
    const modalAgv = document.getElementById('modal-agv');
    if (modalAgv) modalAgv.addEventListener('click', function(e) { if (e.target === this) cerrarModalAgv(); });

    const modalTarget = document.getElementById('modal-target-agv');
    if (modalTarget) modalTarget.addEventListener('click', function(e) { if (e.target === this) cerrarModalTarget(); });

    cargarDatosAgv();
    cargarTargets().then(() => {
        INTERNAS.forEach(interna => aplicarColoresCeldas(interna));
        if (document.getElementById('chartCumplimiento')) cargarCumplimiento();
    });
});

// ── Redibujar la gráfica al cambiar el color de acento o el tema ──────────
// Chart.js pinta colores resueltos en píxeles al crear el chart; no reaccionan
// solos a un cambio de var(--indigo), así que hay que volver a cargarla.
document.addEventListener('accentchange', () => {
    if (document.getElementById('ef-interna')) cargarCumplimiento();
});

// ── Sincronizar scroll horizontal entre las 2 tablas de cada área interna ──────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[id^="interna-"]').forEach(internaDiv => {
        const containers = internaDiv.querySelectorAll('.tabla-agv-scroll');
        let syncing = false;
        containers.forEach(c => {
            c.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                containers.forEach(other => {
                    if (other !== c) other.scrollLeft = c.scrollLeft;
                });
                syncing = false;
            });
        });
    });
});
