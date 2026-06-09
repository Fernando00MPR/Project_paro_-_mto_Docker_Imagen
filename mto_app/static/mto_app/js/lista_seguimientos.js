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
    if (!problema) { alert('El problema es obligatorio.'); return; }

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
    .then(data => {
        if (!data.ok) { alert('Error: ' + data.error); return; }
        cerrarModalManual();
        if (otId)      actualizarFilaOT(data, otId);
        else if (id)   actualizarFilaManual(data);
        else           agregarFilaManual(data);
    })
    .catch(() => alert('Error de conexión'));
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
            <button onclick="editarManual(${data.id},'${data.problema.replace(/'/g,"\\'")}','${(data.accion||'').replace(/'/g,"\\'")}','${(data.responsable||'').replace(/'/g,"\\'")}','${data.fecha_compromiso||''}','${data.estatus}','${(data.notas||'').replace(/'/g,"\\'")}')"
                    style="font-size:11px;color:var(--text-2);background:none;border:none;cursor:pointer;padding:2px 6px;">✏️</button>
            <button onclick="confirmarEliminarManual(${data.id})"
                    style="font-size:11px;color:var(--red);background:none;border:none;cursor:pointer;padding:2px 6px;">🗑</button>
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