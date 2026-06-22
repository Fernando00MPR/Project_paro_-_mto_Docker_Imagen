/* lista_seguimientos.js */

// ── URLs y CSRF ───────────────────────────────────────────────────────────────
// Estas constantes se definen en el template con valores de Django:
// CSRF_SM, AREA_ID_SM, URL_SM_ADD, URL_SM_EDIT, URL_SM_DEL, URL_OT_EDIT, URL_OT_DEL

// ── Editar OT ─────────────────────────────────────────────────────────────────
function editarOT(id, problema, accion, responsable, fecha, estatus, notas) {
    document.getElementById('modal-manual-titulo').textContent = 'Editar seguimiento OT';
    document.getElementById('sm-problema').value    = problema;
    document.getElementById('sm-accion').value      = accion;
    document.getElementById('sm-responsable').value = responsable;
    document.getElementById('sm-fecha').value       = fecha;
    document.getElementById('sm-notas').value       = notas;
    document.getElementById('sm-id').value          = '';
    document.getElementById('sm-ot-id').value       = id;
    smEstatus(estatus);
    smArchivosNuevos = [];
    smCargarImagenesExistentes('ot', id);
    document.getElementById('modal-manual').style.display = 'flex';
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
let _delId   = null;
let _delTipo = null;

function confirmarEliminarOT(id) {
    _delId   = id;
    _delTipo = 'ot';
    document.getElementById('modal-confirm-del').style.display = 'flex';
}

function confirmarEliminarManual(id) {
    _delId   = id;
    _delTipo = 'manual';
    document.getElementById('modal-confirm-del').style.display = 'flex';
}

function cerrarModalDel() {
    document.getElementById('modal-confirm-del').style.display = 'none';
    _delId = null; _delTipo = null;
}

function ejecutarEliminar() {
    const id   = _delId;
    const tipo = _delTipo;
    const url  = tipo === 'ot'
        ? `${URL_OT_DEL}${id}/`
        : `${URL_SM_DEL}${id}/`;

    fetch(url, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SM},
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) return;
        cerrarModalDel();
        if (tipo === 'ot') {
            document.querySelector(`tr[data-ot-id="${id}"]`)?.remove();
        } else {
            document.querySelector(`tr[data-sm-id="${id}"]`)?.remove();
        }
    });
}

// ── Actualizar fila OT ────────────────────────────────────────────────────────
function actualizarFilaOT(data, otId) {
    const tr = document.querySelector(`tr[data-ot-id="${otId}"]`);
    if (!tr) return;
    const tds = tr.querySelectorAll('td');
    const colores = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11' },
    };
    const c = colores[data.estatus] || colores.pendiente;
    tds[3].textContent = data.problema;
    tds[4].textContent = data.accion || '—';
    tds[5].textContent = data.responsable || '—';
    tds[6].textContent = data.fecha_compromiso || '—';
    tds[7].querySelector('span').textContent      = data.estatus_display;
    tds[7].querySelector('span').style.background = c.bg;
    tds[7].querySelector('span').style.color      = c.color;
    tds[9].textContent = data.notas || '—';
}

// ── Modal nuevo/editar manual ─────────────────────────────────────────────────
function abrirModalManual() {
    document.getElementById('modal-manual-titulo').textContent  = 'Nuevo seguimiento';
    document.getElementById('sm-problema').value                = '';
    document.getElementById('sm-accion').value                  = '';
    document.getElementById('sm-responsable').value             = '';
    document.getElementById('sm-fecha').value                   = '';
    document.getElementById('sm-notas').value                   = '';
    document.getElementById('sm-id').value                      = '';
    document.getElementById('sm-ot-id').value                   = '';
    smEstatus('pendiente');
    smArchivosNuevos = [];
    smCargarImagenesExistentes(null, null);
    document.getElementById('modal-manual').style.display = 'flex';
    setTimeout(() => document.getElementById('sm-problema').focus(), 50);
}

function editarManual(id, problema, accion, responsable, fecha, estatus, notas) {
    document.getElementById('modal-manual-titulo').textContent  = 'Editar seguimiento';
    document.getElementById('sm-problema').value                = problema;
    document.getElementById('sm-accion').value                  = accion;
    document.getElementById('sm-responsable').value             = responsable;
    document.getElementById('sm-fecha').value                   = fecha;
    document.getElementById('sm-notas').value                   = notas;
    document.getElementById('sm-id').value                      = id;
    document.getElementById('sm-ot-id').value                   = '';
    smEstatus(estatus);
    smArchivosNuevos = [];
    smCargarImagenesExistentes('manual', id);
    document.getElementById('modal-manual').style.display = 'flex';
}

function cerrarModalManual() {
    document.getElementById('modal-manual').style.display = 'none';
}

// ── Pills de estatus ──────────────────────────────────────────────────────────
function smEstatus(val) {
    document.getElementById('sm-estatus').value = val;
    const estilos = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B', border:'1.5px solid #854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5', border:'1.5px solid #185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11', border:'1.5px solid #3B6D11' },
    };
    document.querySelectorAll('.sm-pill').forEach(btn => {
        const v = btn.dataset.val;
        btn.style.background = v === val ? estilos[v].bg    : 'var(--white)';
        btn.style.color      = v === val ? estilos[v].color : 'var(--text-2)';
        btn.style.border     = v === val ? estilos[v].border : '1px solid var(--border)';
    });
}

// ── Guardar (nuevo OT / editar OT / nuevo manual / editar manual) ─────────────
function guardarManual() {
    const problema = document.getElementById('sm-problema').value.trim();
    if (!problema) { showToast('El problema es obligatorio.', 'warning'); return; }

    const id   = document.getElementById('sm-id').value;
    const otId = document.getElementById('sm-ot-id').value;
    const url  = otId ? `${URL_OT_EDIT}${otId}/`
               : id   ? `${URL_SM_EDIT}${id}/`
               :         URL_SM_ADD;

    fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'X-CSRFToken': CSRF_SM},
        body: JSON.stringify({
            problema:         problema,
            accion:           document.getElementById('sm-accion').value.trim(),
            responsable:      document.getElementById('sm-responsable').value.trim(),
            fecha_compromiso: document.getElementById('sm-fecha').value,
            estatus:          document.getElementById('sm-estatus').value,
            notas:            document.getElementById('sm-notas').value.trim(),
            area_id:          AREA_ID_SM || null,
        }),
    })
    .then(r => r.json())
    .then(async data => {
        if (!data.ok) { showToast('Error: ' + data.error, 'error'); return; }

        const tipo   = otId ? 'ot' : 'manual';
        const segId  = otId || data.id;

        const resultadoSubida = await smSubirImagenesPendientes(tipo, segId);
        if (resultadoSubida && resultadoSubida.total !== undefined) {
            data.imagenes_count = resultadoSubida.total;
        } else {
            data.imagenes_count = smImagenesExistentes.length;
        }

        cerrarModalManual();
        if (otId)      actualizarFilaOT(data, otId);
        else if (id)   actualizarFilaManual(data);
        else           agregarFilaManual(data);
    })
    .catch(() => showToast('Error de conexión', 'error'));
}

// ── Agregar fila manual en tabla ──────────────────────────────────────────────
function agregarFilaManual(data) {
    const tbody = document.querySelector('table tbody');
    const empty = tbody.querySelector('td[colspan]');
    if (empty) empty.closest('tr').remove();

    const colores = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11' },
    };
    const c = colores[data.estatus] || colores.pendiente;

    const tr = document.createElement('tr');
    tr.dataset.smId = data.id;
    tr.innerHTML = `
        <td style="font-family:'DM Sans',sans-serif;font-size:12px;color:var(--indigo);font-weight:600;text-align:center;">${data.no_orden}</td>
        <td style="font-size:12px;color:var(--text-2);text-align:center;">—</td>
        <td style="text-align:center;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#FCEBEB;color:#A32D2D;">Correctiva</span></td>
        <td style="max-width:200px;white-space:normal;">${data.problema}</td>
        <td style="max-width:180px;white-space:normal;color:var(--text-2);">${data.accion || '—'}</td>
        <td>${data.responsable || '—'}</td>
        <td style="color:var(--text-2);text-align:center;">${data.fecha_compromiso || '—'}</td>
        <td style="text-align:center;"><span class="sm-badge-estatus" style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color};">${data.estatus_display}</span></td>
        <td style="color:var(--text-3);font-size:12px;text-align:center;">${data.fecha_creacion}</td>
        <td style="max-width:150px;white-space:normal;color:var(--text-2);font-size:12px;">${data.notas || '—'}</td>
        <td style="text-align:center;">
            <button onclick="toggleValidadoManual(${data.id}, this)"
                    style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;border:none;background:#F1EFE8;color:#5F5E5A;">
                Pendiente
            </button>
        </td>
        <td style="text-align:center;">
            <div style="display:flex; gap:8px; justify-content:center; align-items:center;">
                ${data.imagenes_count > 0 ? `
                <button onclick="verImagenesSeg('manual', ${data.id})"
                        title="Ver imágenes"
                        style="display:inline-flex; align-items:center; justify-content:center;
                            width:32px; height:32px; border-radius:6px; border:1px solid var(--border);
                            background:var(--surface); color:var(--text-2); cursor:pointer; padding:0; flex-shrink:0;">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                </button>` : `
                <div style="width:32px; height:32px; flex-shrink:0;"></div>`}
                <button onclick="editarManual(${data.id},'${data.problema.replace(/'/g,"\\'")}','${(data.accion||'').replace(/'/g,"\\'")}','${(data.responsable||'').replace(/'/g,"\\'")}','${data.fecha_compromiso||''}','${data.estatus}','${(data.notas||'').replace(/'/g,"\\'")}')"
                        style="display:inline-flex; align-items:center; gap:4px; padding:5px 12px;
                            font-size:12px; border-radius:6px; border:1px solid var(--border);
                            background:var(--surface); color:var(--text); cursor:pointer;
                            white-space:nowrap; font-family:inherit;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                    Editar
                </button>
                <button onclick="confirmarEliminarManual(${data.id})"
                        style="display:inline-flex; align-items:center; gap:4px; padding:5px 12px;
                            font-size:12px; border-radius:6px; border:1px solid #FCA5A5;
                            background:#FFF5F5; color:#DC2626; cursor:pointer;
                            white-space:nowrap; font-family:inherit;">
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    Eliminar
                </button>
            </div>
        </td>
    `;
    tbody.prepend(tr);
}

function actualizarFilaManual(data) {
    const tr = document.querySelector(`tr[data-sm-id="${data.id}"]`);
    if (!tr) return;
    tr.remove();
    agregarFilaManual(data);
}

// ── Validación ────────────────────────────────────────────────────────────────
function toggleValidadoOT(id, btn) {
    fetch(`/mto/seguimiento/validar-ot/${id}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SM},
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) return;
        btn.textContent      = data.validado ? 'Validado' : 'Pendiente';
        btn.style.background = data.validado ? '#EAF3DE' : '#F1EFE8';
        btn.style.color      = data.validado ? '#3B6D11' : '#5F5E5A';
    });
}

function toggleValidadoManual(id, btn) {
    fetch(`/mto/seguimiento/validar-manual/${id}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SM},
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) return;
        btn.textContent      = data.validado ? 'Validado' : 'Pendiente';
        btn.style.background = data.validado ? '#EAF3DE' : '#F1EFE8';
        btn.style.color      = data.validado ? '#3B6D11' : '#5F5E5A';
    });
}

// ── Autocomplete responsable ──────────────────────────────────────────────────
(function() {
    const input    = document.getElementById('sm-responsable');
    const dropdown = document.getElementById('sm-resp-dropdown');
    let debounce   = null;

    function search(q) {
        fetch(`/mto/responsables/buscar-mto/?q=${encodeURIComponent(q)}`)
            .then(r => r.json())
            .then(data => {
                dropdown.innerHTML = '';
                if (!data.length) { dropdown.style.display = 'none'; return; }
                data.forEach(r => {
                    const item = document.createElement('div');
                    item.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:13px; border-bottom:1px solid var(--border); color:var(--text);';
                    item.innerHTML = `<span style="font-size:11px;color:var(--indigo);margin-right:6px;">${r.codigo}</span>${r.nombre}`;
                    if (r.descripcion) item.innerHTML += `<div style="font-size:11px;color:var(--text-3);">${r.descripcion}</div>`;
                    item.addEventListener('mousedown', e => {
                        e.preventDefault();
                        input.value = r.nombre;
                        dropdown.style.display = 'none';
                    });
                    item.addEventListener('mouseover', () => item.style.background = 'var(--indigo-lt)');
                    item.addEventListener('mouseout',  () => item.style.background = '');
                    dropdown.appendChild(item);
                });
                dropdown.style.display = 'block';
            });
    }

    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            if (input.value.trim().length > 0) search(input.value.trim());
            else dropdown.style.display = 'none';
        }, 220);
    });

    input.addEventListener('blur',  () => setTimeout(() => dropdown.style.display = 'none', 150));
    input.addEventListener('focus', () => { if (input.value.trim().length > 0) search(input.value.trim()); });
})();

// ── Imágenes de seguimiento (drag & drop) ─────────────────────────────────────
let smArchivosNuevos   = [];   // File[] pendientes de subir (seguimiento nuevo)
let smImagenesExistentes = []; // [{id, url}] ya guardadas (al editar)

function smInicializarDropzone() {
    const zona  = document.getElementById('sm-dropzone');
    const input = document.getElementById('sm-input-imagenes');

    zona.onclick = () => input.click();

    input.onchange = () => smAgregarArchivos(Array.from(input.files));

    zona.ondragover = (e) => { e.preventDefault(); zona.style.borderColor = 'var(--indigo)'; };
    zona.ondragleave = () => { zona.style.borderColor = 'var(--border)'; };
    zona.ondrop = (e) => {
        e.preventDefault();
        zona.style.borderColor = 'var(--border)';
        smAgregarArchivos(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    };
}

function smAgregarArchivos(nuevos) {
    const totalActual = smArchivosNuevos.length + smImagenesExistentes.length;
    const disponibles  = 4 - totalActual;

    if (disponibles <= 0) {
        showToast('Máximo 4 imágenes por seguimiento', 'warning');
        return;
    }
    if (nuevos.length > disponibles) {
        showToast(`Solo se agregaron ${disponibles} imagen(es), límite de 4 alcanzado`, 'warning');
    }
    smArchivosNuevos = smArchivosNuevos.concat(nuevos.slice(0, disponibles));
    smRenderPreview();
}

function smRenderPreview() {
    const cont = document.getElementById('sm-preview-imagenes');
    cont.innerHTML = '';

    // Imágenes ya guardadas (modo edición)
    smImagenesExistentes.forEach(img => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative; width:60px; height:60px;';
        wrap.innerHTML = `
            <img src="${img.url}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">
            <button type="button" onclick="smEliminarImagenExistente(${img.id}, this)"
                    style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%;
                           background:#EF4444; color:#fff; border:none; cursor:pointer; font-size:11px; line-height:1;">✕</button>
        `;
        cont.appendChild(wrap);
    });

    // Imágenes nuevas (pendientes de subir)
    smArchivosNuevos.forEach((file, i) => {
        const reader = new FileReader();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative; width:60px; height:60px;';
        cont.appendChild(wrap);
        reader.onload = (e) => {
            wrap.innerHTML = `
                <img src="${e.target.result}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">
                <button type="button" onclick="smQuitarArchivoNuevo(${i})"
                        style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%;
                               background:#EF4444; color:#fff; border:none; cursor:pointer; font-size:11px; line-height:1;">✕</button>
            `;
        };
        reader.readAsDataURL(file);
    });
}

function smQuitarArchivoNuevo(index) {
    smArchivosNuevos.splice(index, 1);
    smRenderPreview();
}

function smEliminarImagenExistente(imagenId, btn) {
    fetch(`/mto/seguimiento/imagen/eliminar/${imagenId}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SM},
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) return;
        smImagenesExistentes = smImagenesExistentes.filter(img => img.id !== imagenId);
        smRenderPreview();
    });
}

function smCargarImagenesExistentes(tipo, id) {
    if (!id) { smImagenesExistentes = []; smRenderPreview(); return; }
    fetch(`/mto/seguimiento/${tipo}/${id}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            smImagenesExistentes = data.imagenes;
            smRenderPreview();
        });
}

function smSubirImagenesPendientes(tipo, id) {
    if (!smArchivosNuevos.length) return Promise.resolve();

    const formData = new FormData();
    smArchivosNuevos.forEach(file => formData.append('imagenes', file));

    return fetch(`/mto/seguimiento/${tipo}/${id}/imagenes/subir/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF_SM},
        body: formData,
    }).then(r => r.json());
}

smInicializarDropzone();


// ── Lightbox de imágenes de seguimiento ───────────────────────────────────────
let lightboxSegImagenes = [];
let lightboxSegIndice   = 0;

function verImagenesSeg(tipo, segId) {
    fetch(`/mto/seguimiento/${tipo}/${segId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            lightboxSegImagenes = data.imagenes;
            lightboxSegIndice   = 0;
            renderLightboxSeg();
            document.getElementById('modal-imagenes-seg').style.display = 'flex';
        });
}

function renderLightboxSeg() {
    if (!lightboxSegImagenes.length) return;

    document.getElementById('lightbox-seg-img-principal').src = lightboxSegImagenes[lightboxSegIndice].url;

    const cont = document.getElementById('lightbox-seg-miniaturas');
    cont.innerHTML = '';
    lightboxSegImagenes.forEach((img, i) => {
        const thumb = document.createElement('img');
        thumb.src = img.url;
        thumb.onclick = () => { lightboxSegIndice = i; renderLightboxSeg(); };
        thumb.style.cssText = `
            width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer;
            border:2px solid ${i === lightboxSegIndice ? 'var(--indigo)' : 'transparent'};
        `;
        cont.appendChild(thumb);
    });
}

function lightboxSegAnterior() {
    lightboxSegIndice = (lightboxSegIndice - 1 + lightboxSegImagenes.length) % lightboxSegImagenes.length;
    renderLightboxSeg();
}

function lightboxSegSiguiente() {
    lightboxSegIndice = (lightboxSegIndice + 1) % lightboxSegImagenes.length;
    renderLightboxSeg();
}

function descargarImagenSegActual() {
    const img = lightboxSegImagenes[lightboxSegIndice];
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function cerrarModalImagenesSeg() {
    document.getElementById('modal-imagenes-seg').style.display = 'none';
}

document.getElementById('modal-imagenes-seg')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarModalImagenesSeg();
});

document.addEventListener('keydown', function(e) {
    if (document.getElementById('modal-imagenes-seg')?.style.display === 'flex') {
        if (e.key === 'ArrowLeft')  lightboxSegAnterior();
        if (e.key === 'ArrowRight') lightboxSegSiguiente();
        if (e.key === 'Escape')     cerrarModalImagenesSeg();
    }
});

// ── Columnas de seguimientos ──────────────────────────────────────────────────
const SEG_COLS = [
    'seg-col-orden', 'seg-col-codigo', 'seg-col-tipo', 'seg-col-problema',
    'seg-col-accion', 'seg-col-responsable', 'seg-col-compromiso',
    'seg-col-estatus', 'seg-col-creado', 'seg-col-notas', 'seg-col-validacion'
];

function toggleSegCol(cls, visible) {
    document.querySelectorAll('.' + cls).forEach(el => {
        el.style.display = visible ? '' : 'none';
    });
    const prefs = JSON.parse(localStorage.getItem('mto_seg_cols') || '{}');
    prefs[cls] = visible;
    localStorage.setItem('mto_seg_cols', JSON.stringify(prefs));
}

function toggleSegColPicker() {
    const p = document.getElementById('seg-col-picker');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('seg-col-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('seg-col-picker').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.seg-col-toggle').forEach(el => {
        el.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-2);';
        el.querySelector('input').style.accentColor = 'var(--indigo)';
    });

    const prefs = JSON.parse(localStorage.getItem('mto_seg_cols') || '{}');
    SEG_COLS.forEach(cls => {
        const visible = prefs[cls] !== false;
        toggleSegCol(cls, visible);
        const input = document.querySelector('[data-col="' + cls + '"] input');
        if (input) input.checked = visible;
    });
});