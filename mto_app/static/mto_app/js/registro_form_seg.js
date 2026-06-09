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

// ── Actualizar badge ──────────────────────────────────────────────────────────
function actualizarBadge() {
    const items = document.querySelectorAll('.seg-item');
    const badge = document.getElementById('badge-seguimientos');
    const empty = document.getElementById('empty-seg');
    const count = items.length;
    badge.textContent   = count + (count === 1 ? ' seguimiento' : ' seguimientos');
    badge.style.display = count > 0 ? 'inline-block' : 'none';
    if (empty) empty.style.display = count > 0 ? 'none' : 'block';
}

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

    const colores = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11' },
    };
    const c = colores[data.estatus] || colores.pendiente;

    const div = document.createElement('div');
    div.className     = 'seg-item';
    div.dataset.id    = data.id;
    div.style.cssText = 'border:0.5px solid #E5E4F0; border-radius:8px; padding:10px 12px;';
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:5px;">
            <div style="display:flex; gap:6px; align-items:center;">
                <span style="padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; background:#FCEBEB; color:#A32D2D;">Correctiva</span>
                <span style="font-size:11px; color:#9CA3AF;">${data.fecha_creacion}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge-estatus" style="padding:2px 8px; border-radius:20px; font-size:10px; font-weight:600; background:${c.bg}; color:${c.color};">${data.estatus_display}</span>
                <button type="button"
                    onclick="editarSeguimiento(${data.id},'${data.problema.replace(/'/g,"\\'")}','${(data.accion||'').replace(/'/g,"\\'")}','${(data.responsable||'').replace(/'/g,"\\'")}','${data.fecha_compromiso||''}','${data.estatus}','${(data.notas||'').replace(/'/g,"\\'")}')"
                    style="font-size:11px; color:#6B7280; background:none; border:none; cursor:pointer; padding:2px 6px;">✏️</button>
                <button type="button" onclick="confirmarEliminarSeg(${data.id})"
                    style="font-size:11px; color:#EF4444; background:none; border:none; cursor:pointer; padding:2px 6px;">🗑</button>
            </div>
        </div>
        <div style="font-size:12px; font-weight:600; color:#1E1B4B; margin-bottom:6px;">${data.problema}</div>
        ${data.accion ? `<div style="font-size:11px; color:#4B5563; margin-bottom:4px;"><span style="font-weight:600; color:#1E1B4B;">Acción:</span> ${data.accion}</div>` : ''}
        ${data.notas  ? `<div style="font-size:11px; color:#4B5563; margin-bottom:4px;"><span style="font-weight:600; color:#1E1B4B;">Notas:</span> ${data.notas}</div>` : ''}
        <div style="font-size:11px; color:#9CA3AF; margin-top:2px;">
            ${data.responsable ? `<span style="font-weight:600; color:#6B7280;">Responsable:</span> ${data.responsable}` : ''}
            ${data.responsable && data.fecha_compromiso ? ' · ' : ''}
            ${data.fecha_compromiso ? `<span style="font-weight:600; color:#6B7280;">Compromiso:</span> ${data.fecha_compromiso}` : ''}
        </div>
    `;
    lista.prepend(div);
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
    actualizarBadge();
    setTimeout(notificarAltura, 100);
});