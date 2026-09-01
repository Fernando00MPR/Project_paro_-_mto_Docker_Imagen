/* registro_form_seg.js
   Depende de: CSRF_SEG, REGISTRO_PK, URL_AGREGAR, URL_EDITAR, URL_ELIMINAR
   definidos en el template como variables globales.
   Solo se carga cuando registro.estado == 'completada'
*/

// ── Toggle sección seguimiento ────────────────────────────────────────────────
function toggleSeguimiento() {
    const content = document.getElementById('seg-content');
    const chevron = document.getElementById('chevron-seg');
    const open    = content.style.display === 'none';
    content.style.display       = open ? 'flex' : 'none';
    content.style.flexDirection = 'column';
    chevron.style.transform     = open ? 'rotate(180deg)' : '';
    setTimeout(notificarAltura, 50);
}

// ── Actualizar badge (cuenta solo los seguimientos abiertos, no cerrados) ──────
function actualizarBadge() {
    const items  = document.querySelectorAll('.seg-item');
    const badge  = document.getElementById('badge-seguimientos');
    const empty  = document.getElementById('empty-seg');
    const abiertos = Array.from(items).filter(el => {
        const estado = el.querySelector('.badge-estatus');
        return !estado || !estado.dataset.estatus || estado.dataset.estatus !== 'completado';
    }).length;
    badge.textContent   = abiertos + (abiertos === 1 ? ' abierto' : ' abiertos');
    badge.style.display = abiertos > 0 ? 'inline-block' : 'none';
    if (empty) empty.style.display = items.length > 0 ? 'none' : 'block';
}

// ── Nota relativa de "Compromiso" (en N días / vence hoy / vencido hace N días) ─
function parseFechaDMY(str) {
    if (!str) return null;
    const partes = str.split('/');
    if (partes.length !== 3) return null;
    const [d, m, y] = partes.map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
}

function calcularNotaCompromiso(fechaDMY) {
    const fecha = parseFechaDMY(fechaDMY);
    if (!fecha) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);
    const dias = Math.round((fecha - hoy) / 86400000);

    if (dias < 0) {
        const n = Math.abs(dias);
        return { texto: `vencido hace ${n} d\u00eda${n === 1 ? '' : 's'}`, color: 'var(--rf-danger)' };
    }
    if (dias === 0) {
        return { texto: 'vence hoy', color: 'var(--rf-warn)' };
    }
    if (dias <= 7) {
        return { texto: `en ${dias} d\u00eda${dias === 1 ? '' : 's'}`, color: 'var(--rf-warn)' };
    }
    return { texto: `en ${dias} d\u00edas`, color: 'var(--rf-text-soft)' };
}

function pintarNotasCompromiso(raiz) {
    (raiz || document).querySelectorAll('[data-compromiso]').forEach(el => {
        const nota = calcularNotaCompromiso(el.dataset.compromiso);
        const span = el.querySelector('.rf-seg-nota');
        if (!nota || !span) return;
        span.textContent = ' \u00b7 ' + nota.texto;
        span.style.color = nota.color;
    });
}

// ── Colores por tipo / estatus (mismos tokens que el template) ─────────────────
const RF_COLORES_TIPO = {
    preventiva: { bg: 'var(--rf-info-bg)',    border: 'var(--rf-info-border)',    color: 'var(--rf-info)' },
    mejora:     { bg: 'var(--rf-success-bg)', border: 'var(--rf-success-border)', color: 'var(--rf-success)' },
    correctiva: { bg: 'var(--rf-danger-bg)',  border: 'var(--rf-danger-border)',  color: 'var(--rf-danger)' },
};
const RF_COLORES_ESTATUS = {
    pendiente:  { bg: 'var(--rf-warn-bg)',    border: 'var(--rf-warn-border)',    color: 'var(--rf-warn)' },
    en_proceso: { bg: 'var(--rf-info-bg)',    border: 'var(--rf-info-border)',    color: 'var(--rf-info)' },
    completado: { bg: 'var(--rf-success-bg)', border: 'var(--rf-success-border)', color: 'var(--rf-success)' },
};

// ── Abrir modal seguimiento (en padre via postMessage) ────────────────────────
function abrirModalSeguimiento() {
    window.top.postMessage(JSON.stringify({
        tipo:        'abrir_mseg',
        registro_pk: REGISTRO_PK,
        subtitulo:   SEG_SUBTITULO,
        problema: '', accion: '', responsable: '',
        fecha: '', estatus: 'pendiente', notas: '', id: '',
    }), '*');
}

function editarSeguimiento(id, problema, accion, responsable, fecha, estatus, notas) {
    window.top.postMessage(JSON.stringify({
        tipo:        'abrir_mseg',
        registro_pk: REGISTRO_PK,
        subtitulo:   SEG_SUBTITULO,
        id, problema, accion, responsable, fecha, estatus, notas,
    }), '*');
}

// ── Agregar item de seguimiento en la lista ───────────────────────────────────
function agregarItemSeg(data) {
    const lista = document.getElementById('lista-seguimientos');
    const empty = document.getElementById('empty-seg');
    if (empty) empty.style.display = 'none';

    const tipoKey = data.tipo || 'correctiva';
    const ct = RF_COLORES_TIPO[tipoKey] || RF_COLORES_TIPO.correctiva;
    const ce = RF_COLORES_ESTATUS[data.estatus] || RF_COLORES_ESTATUS.pendiente;

    const div = document.createElement('div');
    div.className  = 'seg-item rf-seg-item';
    div.dataset.id = data.id;
    div.innerHTML = `
        <div class="rf-seg-top">
            <span class="rf-seg-badge-tipo" style="background:${ct.bg}; border-color:${ct.border}; color:${ct.color};">${data.tipo_display || 'Correctiva'}</span>
            <span class="rf-seg-fecha">${data.fecha_creacion}</span>
            <span class="rf-seg-spacer"></span>
            <span class="badge-estatus rf-seg-estado" data-estatus="${data.estatus}" style="background:${ce.bg}; border-color:${ce.border}; color:${ce.color};">
                <span class="rf-seg-estado-dot" style="background:currentColor;"></span>${data.estatus_display}
            </span>
            <span class="rf-seg-actions">
                <button type="button" class="rf-seg-action-btn rf-seg-action-editar"
                    onclick="editarSeguimiento(${data.id},'${data.problema.replace(/'/g,"\\'")}','${(data.accion||'').replace(/'/g,"\\'")}','${(data.responsable||'').replace(/'/g,"\\'")}','${data.fecha_compromiso_iso||''}','${data.estatus}','${(data.notas||'').replace(/'/g,"\\'")}')">Editar</button>
                <button type="button" class="rf-seg-action-btn rf-seg-action-eliminar" onclick="confirmarEliminarSeg(${data.id})">Eliminar</button>
            </span>
        </div>
        <div class="rf-seg-title">${data.problema}</div>
        ${data.accion ? `<div class="rf-seg-desc">${data.accion}</div>` : ''}
        ${data.notas ? `<div><div class="rf-seg-notas-label">NOTAS</div><div class="rf-seg-notas">${data.notas}</div></div>` : ''}
        <div class="rf-seg-foot">
            ${data.fecha_compromiso ? `<div data-compromiso="${data.fecha_compromiso}"><div class="rf-seg-foot-label">COMPROMISO</div><div class="rf-seg-foot-value">${data.fecha_compromiso}<span class="rf-seg-nota"></span></div></div>` : ''}
            ${data.responsable ? `<div><div class="rf-seg-foot-label">RESPONSABLE</div><div class="rf-seg-foot-value">${data.responsable}</div></div>` : ''}
        </div>
    `;
    lista.prepend(div);
    pintarNotasCompromiso(div);
    notificarAltura();
}

function actualizarItemSeg(data) {
    const div = document.querySelector(`.seg-item[data-id="${data.id}"]`);
    if (!div) return;
    div.remove();
    agregarItemSeg(data);
}

// ── Eliminar seguimiento ──────────────────────────────────────────────────────
let segEliminarId = null;

function confirmarEliminarSeg(id) {
    segEliminarId = id;
    document.getElementById('modal-confirm-seg').style.display = 'flex';
}

function eliminarSeguimientoConfirmado() {
    document.getElementById('modal-confirm-seg').style.display = 'none';
    fetch(`${URL_ELIMINAR}${segEliminarId}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SEG},
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            document.querySelector(`.seg-item[data-id="${segEliminarId}"]`)?.remove();
            actualizarBadge();
            notificarAltura();
        }
    });
}

// ── Notificar altura al padre (resize iframe) ─────────────────────────────────
function notificarAltura() {
    const h = document.body.scrollHeight;
    window.parent.postMessage('resize_iframe:' + h, '*');
}

// ── Escuchar mensajes del padre ───────────────────────────────────────────────
window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'string') return;
    if (e.data === 'mseg_cerrado') return;
    try {
        const msg = JSON.parse(e.data);
        if (msg.tipo === 'mseg_guardado') {
            if (msg.data.id && document.querySelector(`.seg-item[data-id="${msg.data.id}"]`)) {
                actualizarItemSeg(msg.data);
            } else {
                agregarItemSeg(msg.data);
            }
            actualizarBadge();
            const content = document.getElementById('seg-content');
            if (content.style.display === 'none') toggleSeguimiento();
        }
    } catch(err) {}
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.badge-estatus[data-estatus]').forEach(() => {}); // no-op, mantiene compat
    actualizarBadge();
    pintarNotasCompromiso(document);
    setTimeout(notificarAltura, 100);
});
