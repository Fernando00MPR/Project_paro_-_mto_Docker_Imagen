/* hora_hora.js — Registro de producción hora x hora */

const cfg = window.HORA_HORA_CFG || {};

// CSRF desde cookie
const CSRF = document.cookie.split(';').find(s => s.trim().startsWith('csrftoken='))?.trim().split('=')[1] || '';

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

// Estado global — DATOS es mutable (se actualiza al guardar celdas)
let DATOS        = cfg.datos    || {};
const AREAS_IDS  = cfg.areasIds || [];

let celdaActual  = null;
let targetAreaId = null;
let targetSkid   = {};
let targetEf     = {};
let chartEf      = null;
let vistaEf      = 'dia';

// ── Cargar datos iniciales ─────────────────────────────────────────────────────
function cargarDatos() {
    document.querySelectorAll('.celda-hora').forEach(td => {
        const aid   = td.dataset.area;
        const turno = td.dataset.turno;
        const dia   = parseInt(td.dataset.dia);
        const hora  = parseInt(td.dataset.hora);
        const val   = DATOS[aid]?.[turno]?.[dia]?.[hora];
        if (val !== undefined && val > 0) {
            td.querySelector('.valor-celda').textContent = val;
            td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
            td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
            td.style.fontWeight = '600';
        }
    });
    recalcularTodos();
}

// ── Colapsar / expandir área ───────────────────────────────────────────────────
function toggleArea(id) {
    const el  = document.getElementById('area-' + id);
    const chv = document.getElementById('chevron-' + id);
    const open = el.style.display === 'none';
    el.style.display    = open ? 'block' : 'none';
    chv.style.transform = open ? 'rotate(180deg)' : '';
}

// ── Modal edición de celda ─────────────────────────────────────────────────────
function editarCelda(td) {
    celdaActual = td;
    const hora  = parseInt(td.dataset.hora);
    const dia   = parseInt(td.dataset.dia);
    const mes   = parseInt(td.dataset.mes);
    const anio  = parseInt(td.dataset.anio);
    const turno = td.dataset.turno;
    const valActual = td.querySelector('.valor-celda').textContent.trim();
    const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('modal-titulo').textContent    = `${hora.toString().padStart(2,'0')}:00 — Día ${dia}`;
    document.getElementById('modal-subtitulo').textContent = `${meses[mes]} ${anio} · Turno ${turno}`;
    document.getElementById('modal-input').value = valActual || '';
    document.getElementById('modal-hora').style.display = 'flex';
    setTimeout(() => document.getElementById('modal-input').focus(), 50);
}

function cerrarModal() {
    document.getElementById('modal-hora').style.display = 'none';
    celdaActual = null;
}

function borrarModal() {
    if (!celdaActual) return;
    enviarValor(celdaActual, '');
    cerrarModal();
}

function guardarModal() {
    if (!celdaActual) return;
    const val = document.getElementById('modal-input').value.trim();
    enviarValor(celdaActual, val);
    cerrarModal();
}

// ── Enviar valor al servidor ───────────────────────────────────────────────────
function enviarValor(td, valor) {
    const area  = td.dataset.area;
    const turno = td.dataset.turno;
    const hora  = parseInt(td.dataset.hora);
    const dia   = parseInt(td.dataset.dia);
    const mes   = parseInt(td.dataset.mes).toString().padStart(2,'0');
    const anio  = td.dataset.anio;
    const fecha = `${anio}-${mes}-${dia.toString().padStart(2,'0')}`;

    fetch(cfg.urlGuardar, {
        method: 'POST',
        headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
        body: JSON.stringify({area_id:area, fecha, turno, hora, valor: valor === '' ? null : parseInt(valor)})
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
                if (!DATOS[area]) DATOS[area] = {};
                if (!DATOS[area][turno]) DATOS[area][turno] = {};
                if (!DATOS[area][turno][dia]) DATOS[area][turno][dia] = {};
                delete DATOS[area][turno][dia][hora];
            } else {
                span.textContent = data.valor;
                const tS = targetSkid[area];
                const v  = parseInt(data.valor);
                if (tS !== null && tS !== undefined) {
                    td.style.background = v >= tS ? '#EAF3DE' : '#FCEBEB';
                    td.style.color      = v >= tS ? '#3B6D11' : '#A32D2D';
                } else {
                    td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
                    td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
                }
                td.style.fontWeight = '600';
                if (!DATOS[area]) DATOS[area] = {};
                if (!DATOS[area][turno]) DATOS[area][turno] = {};
                if (!DATOS[area][turno][dia]) DATOS[area][turno][dia] = {};
                DATOS[area][turno][dia][hora] = data.valor;
            }
            recalcularArea(area);
            if (document.getElementById('chartEficiencia')) cargarEficiencia();
        } else {
            alert('Error: ' + (data.error || 'No se pudo guardar'));
        }
    })
    .catch(() => alert('Error de conexión'));
}

// ── Recalcular totales ─────────────────────────────────────────────────────────
function recalcularArea(aid) {
    ['dia','noche'].forEach(turno => {
        for (let d = 1; d <= 31; d++) {
            const diasData  = DATOS[aid]?.[turno]?.[d] || {};
            const totalDia  = Object.values(diasData).reduce((s,v) => s+v, 0);
            const el        = document.getElementById(`total-${turno}-dia-${aid}-${d}`);
            if (el) el.textContent = totalDia > 0 ? totalDia : '—';
            const hrsConReg = Object.values(diasData).filter(v => v > 0).length;
            const elHrs     = document.getElementById(`hrs-${turno}-${aid}-${d}`);
            if (elHrs) elHrs.textContent = hrsConReg > 0 ? hrsConReg * 60 : '—';
        }
    });

    const tEf = targetEf[aid] ?? 91;

    for (let d = 1; d <= 31; d++) {
        const dataDia   = DATOS[aid]?.['dia']?.[d]   || {};
        const dataNoche = DATOS[aid]?.['noche']?.[d] || {};
        const corridos  = Object.values(dataDia).reduce((s,v) => s+v, 0) +
                          Object.values(dataNoche).reduce((s,v) => s+v, 0);
        const hrsDia    = Object.values(dataDia).filter(v => v > 0).length;
        const hrsNoche  = Object.values(dataNoche).filter(v => v > 0).length;
        const planeados = (hrsDia + hrsNoche) * 65;
        const eficiencia = planeados > 0 ? ((corridos / planeados) * 100).toFixed(1) : null;

        const elC = document.getElementById(`skid-corridos-${aid}-${d}`);
        const elP = document.getElementById(`skid-planeados-${aid}-${d}`);
        const elE = document.getElementById(`skid-eficiencia-${aid}-${d}`);

        if (elC) elC.textContent = corridos  > 0 ? corridos  : '—';
        if (elP) elP.textContent = planeados > 0 ? planeados : '—';
        if (elE) {
            if (eficiencia !== null && planeados > 0) {
                const pct = parseFloat(eficiencia);
                elE.textContent        = pct + '%';
                elE.style.color        = pct >= tEf ? '#3B6D11' : '#A32D2D';
                elE.style.background   = pct >= tEf ? '#EAF3DE' : '#FCEBEB';
                elE.style.padding      = '2px 8px';
                elE.style.borderRadius = '20px';
                elE.style.fontWeight   = '600';
                elE.style.fontSize     = '11px';
            } else {
                elE.textContent = '—';
                elE.style.color = '';
            }
        }
    }
}

function recalcularTodos() {
    const aids = new Set();
    document.querySelectorAll('[id^="total-dia-dia-"]').forEach(el => {
        aids.add(el.id.split('-')[3]);
    });
    aids.forEach(aid => recalcularArea(aid));
}

// ── Gráfico de eficiencia ──────────────────────────────────────────────────────
function setVistaEf(vista, btn) {
    vistaEf = vista;
    ['dia','mes','anio'].forEach(v => {
        const b = document.getElementById('pill-' + v);
        b.style.background = v === vista ? 'var(--indigo)' : 'var(--white)';
        b.style.color      = v === vista ? '#fff'        : 'var(--text-2)';
    });
    document.getElementById('ef-rango-dia').style.display  = vista === 'dia'  ? 'flex' : 'none';
    document.getElementById('ef-rango-mes').style.display  = vista === 'mes'  ? 'flex' : 'none';
    document.getElementById('ef-rango-anio').style.display = vista === 'anio' ? 'flex' : 'none';
    cargarEficiencia();
}

function cargarEficiencia() {
    const area_id = document.getElementById('ef-area').value;
    if (!area_id) return; 
    let url = `${cfg.urlEficiencia}?area_id=${area_id}&vista=${vistaEf}`;

    let tAnio = cfg.anio;
    let tMes  = cfg.mes;
    if (vistaEf === 'mes') {
        tAnio = parseInt(document.getElementById('ef-mes-anio').value);
        tMes  = parseInt(document.getElementById('ef-mes-desde').value);
    } else if (vistaEf === 'dia') {
        const desde = document.getElementById('ef-desde').value;
        if (desde) {
            const parts = desde.split('-');
            tAnio = parseInt(parts[0]);
            tMes  = parseInt(parts[1]);
        }
    }

    fetch(`${cfg.urlTargetGet}?area_id=${area_id}&anio=${tAnio}&mes=${tMes}`)
    .then(r => r.json())
    .then(tData => {
        if (tData.ok) targetEf[area_id] = tData.target_eficiencia;
    })
    .then(() => {
        if (vistaEf === 'dia') {
            url += `&desde=${document.getElementById('ef-desde').value}&hasta=${document.getElementById('ef-hasta').value}`;
        } else if (vistaEf === 'mes') {
            url += `&anio=${document.getElementById('ef-mes-anio').value}&mes_desde=${document.getElementById('ef-mes-desde').value}&mes_hasta=${document.getElementById('ef-mes-hasta').value}`;
        } else if (vistaEf === 'anio') {
            url += `&anio_desde=${document.getElementById('ef-anio-desde').value}&anio_hasta=${document.getElementById('ef-anio-hasta').value}`;
        }
        fetch(url).then(r => r.json()).then(data => { if (data.ok) renderizarEficiencia(data.datos); }).catch(() => {});
    })
    .catch(() => {});
}

function renderizarEficiencia(datos) {
    const areaId         = document.getElementById('ef-area').value;
    const targetEfActual = targetEf[areaId] ?? 91;
    const labels         = datos.map(d => d.label);
    const eficiencia     = datos.map(d => d.eficiencia);
    const targets        = datos.map(d => d.target_ef ?? targetEfActual);
    const indigoSolid    = colorIndigo();
    const indigoAlpha    = colorIndigoRgba(0.75);
    const colorValores   = esModoOscuro() ? '#FFFFFF' : indigoSolid;
    const bgColors       = eficiencia.map((v, i) => v === null ? 'rgba(136,135,128,0.3)' : v >= targets[i] ? indigoAlpha : 'rgba(226,75,74,0.75)');
    const bdColors       = eficiencia.map((v, i) => v === null ? '#888780'               : v >= targets[i] ? indigoSolid : '#E24B4A');
    
    if (chartEf) chartEf.destroy();

    chartEf = new Chart(document.getElementById('chartEficiencia'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Eficiencia %', data: eficiencia.map(v => v ?? 0), backgroundColor: bgColors, borderColor: bdColors, borderWidth: 1, borderRadius: 4, order: 2 },
                { type: 'line', label: 'Meta', data: targets, borderColor: '#F59E0B', borderWidth: 2, borderDash: [6,4], pointRadius: 3, fill: false, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.dataset.type === 'line'
                            ? ` Meta: ${targetEfActual}%`
                            : ` ${ctx.parsed.y.toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780', maxRotation: 45, autoSkip: true } },
                y: { min: 0, max: 100, grid: { color: 'rgba(136,135,128,0.15)' }, ticks: { font: { size: 11 }, color: '#888780', callback: v => v + '%' } }
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
                        const ef  = eficiencia[i];
                        if (ef === null) return;
                        ctx2.fillStyle = ef >= targets[i] ? colorValores : '#E24B4A';
                        ctx2.fillText(ef + '%', bar.x, bar.y - 6);
                    });
                    ctx2.restore();
                }
            }
        }
    });

    // Tabla horizontal de resultados
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
        td0.textContent = d.corridos > 0 ? d.corridos : '—';
        filas[0].appendChild(td0);

        const td1 = document.createElement('td');
        td1.style.cssText = tdStyle;
        td1.textContent = d.planeados > 0 ? d.planeados : '—';
        filas[1].appendChild(td1);

        const td2 = document.createElement('td');
        td2.style.cssText = tdStyle;
        if (d.eficiencia !== null && d.planeados > 0) {
            const pct   = d.eficiencia;
            const color = pct >= (d.target_ef ?? targetEfActual) ? '#3B6D11' : '#A32D2D';
            const bg    = pct >= (d.target_ef ?? targetEfActual) ? '#EAF3DE' : '#FCEBEB';
            td2.innerHTML = `<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${bg};color:${color};">${pct}%</span>`;
        } else {
            td2.textContent = '—';
        }
        filas[2].appendChild(td2);
    });
}

// ── Targets ────────────────────────────────────────────────────────────────────
function abrirModalTarget(areaId, areaNombre) {
    targetAreaId = areaId;
    document.getElementById('modal-target-subtitulo').textContent =
        `${areaNombre} — ${cfg.mesNombre} ${cfg.anio}`;

    const anioModal = document.getElementById('modal-target-anio').value || cfg.anio;

    Promise.all([
        fetch(`${cfg.urlTargetGet}?area_id=${areaId}&anio=${cfg.anio}&mes=${cfg.mes}`).then(r => r.json()),
        fetch(`${cfg.urlTargetAnualGet}?area_id=${areaId}&anio=${anioModal}`).then(r => r.json()),
    ]).then(([mensual, anual]) => {
        document.getElementById('modal-target-skid').value    = mensual.target_skid ?? '';
        document.getElementById('modal-target-ef').value      = mensual.target_eficiencia ?? '';
        document.getElementById('modal-target-ef-anio').value = anual.target_eficiencia ?? '';
        document.getElementById('modal-target-hxh').style.display = 'flex';
        document.getElementById('modal-target-skid').focus();
    });
}

function cerrarModalTarget() {
    document.getElementById('modal-target-hxh').style.display = 'none';
    targetAreaId = null;
}

function guardarTarget() {
    const skid   = document.getElementById('modal-target-skid').value.trim();
    const ef     = document.getElementById('modal-target-ef').value.trim();
    const anio   = document.getElementById('modal-target-anio').value.trim();
    const efAnio = document.getElementById('modal-target-ef-anio').value.trim();

    Promise.all([
        fetch(cfg.urlTargetGuardar, {
            method: 'POST',
            headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
            body: JSON.stringify({
                area_id:           targetAreaId,
                anio:              cfg.anio,
                mes:               cfg.mes,
                target_skid:       skid   === '' ? null : parseInt(skid),
                target_eficiencia: ef     === '' ? null : parseFloat(ef),
            })
        }).then(r => r.json()),
        fetch(cfg.urlTargetAnualGuardar, {
            method: 'POST',
            headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
            body: JSON.stringify({
                area_id:           targetAreaId,
                anio:              parseInt(anio),
                target_eficiencia: efAnio === '' ? null : parseFloat(efAnio),
            })
        }).then(r => r.json()),
    ]).then(([mensual, anual]) => {
        if (mensual.ok && anual.ok) {
            targetSkid[targetAreaId] = mensual.target_skid;
            targetEf[targetAreaId]   = mensual.target_eficiencia;
            actualizarBadgesTarget(targetAreaId);
            cerrarModalTarget();
            recalcularArea(String(targetAreaId));
            aplicarColoresSkid(String(targetAreaId));
            cargarEficiencia();
        } else {
            alert('Error al guardar: ' + (mensual.error || anual.error || 'desconocido'));
        }
    });
}

function aplicarColoresSkid(aid) {
    const tSkid = targetSkid[aid];
    document.querySelectorAll(`.celda-hora[data-area="${aid}"]`).forEach(td => {
        const span = td.querySelector('.valor-celda');
        if (!span.textContent.trim()) {
            td.style.background = '';
            td.style.color      = '';
            td.style.fontWeight = '';
            return;
        }
        const val = parseInt(span.textContent.trim());
        if (tSkid !== null && tSkid !== undefined) {
            td.style.background = val >= tSkid ? '#EAF3DE' : '#FCEBEB';
            td.style.color      = val >= tSkid ? '#3B6D11' : '#A32D2D';
        } else {
            const turno = td.dataset.turno;
            td.style.background = turno === 'dia' ? '#E6F1FB' : '#EEEDFE';
            td.style.color      = turno === 'dia' ? '#185FA5' : '#3C3489';
        }
        td.style.fontWeight = '600';
    });
    actualizarBadgesTarget(aid);
}

function cargarTargets() {
    const promesas = AREAS_IDS.map(aid =>
        fetch(`${cfg.urlTargetGet}?area_id=${aid}&anio=${cfg.anio}&mes=${cfg.mes}`)
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                targetSkid[aid] = data.target_skid;
                targetEf[aid]   = data.target_eficiencia;
                actualizarBadgesTarget(aid);
            }
        })
    );
    return Promise.all(promesas);
}

function actualizarBadgesTarget(aid) {
    const tS  = targetSkid[aid];
    const tEf = targetEf[aid];

    const badgeSkid = document.getElementById(`badge-skid-${aid}`);
    const badgeEf   = document.getElementById(`badge-ef-${aid}`);

    if (badgeSkid) {
        if (tS !== null && tS !== undefined) {
            badgeSkid.textContent   = `Skids: ${tS}`;
            badgeSkid.style.display = 'inline-block';
        } else {
            badgeSkid.style.display = 'none';
        }
    }
    if (badgeEf) {
        if (tEf !== null && tEf !== undefined) {
            badgeEf.textContent   = `Eficiencia: ${tEf}%`;
            badgeEf.style.display = 'inline-block';
        } else {
            badgeEf.style.display = 'none';
        }
    }
}

function cargarTargetAnual() {
    if (!targetAreaId) return;
    const anio = document.getElementById('modal-target-anio').value;
    fetch(`${cfg.urlTargetAnualGet}?area_id=${targetAreaId}&anio=${anio}`)
    .then(r => r.json())
    .then(data => {
        document.getElementById('modal-target-ef-anio').value = data.target_eficiencia ?? '';
    });
}

// ── Eventos y arranque ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrarModal(); cerrarModalTarget(); }
});
document.getElementById('modal-hora').addEventListener('click', function(e) {
    if (e.target === this) cerrarModal();
});
document.getElementById('modal-target-hxh').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalTarget();
});

document.addEventListener('DOMContentLoaded', () => {
    cargarDatos();
    cargarTargets().then(() => {
        AREAS_IDS.forEach(aid => aplicarColoresSkid(aid));
        if (document.getElementById('chartEficiencia')) cargarEficiencia();
    });
});

// ── Redibujar la gráfica al cambiar el color de acento o el tema ──────────
// Chart.js pinta colores resueltos en píxeles al crear el chart; no reaccionan
// solos a un cambio de var(--indigo), así que hay que volver a cargarla.
document.addEventListener('accentchange', () => {
    if (document.getElementById('chartEficiencia')) cargarEficiencia();
});


// ── Sincronizar scroll horizontal entre las 3 tablas de cada área ──────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[id^="area-"]').forEach(areaDiv => {
        const containers = areaDiv.querySelectorAll('.tabla-hxh-scroll');
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