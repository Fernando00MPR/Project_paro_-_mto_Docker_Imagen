/* lista_paros.js — Edición inline, estatus, exportar, eliminar */

const CSRF = (()=>{
    const c = document.cookie.split(';').find(s=>s.trim().startsWith('csrftoken='));
    return c ? c.trim().split('=')[1] : '';
})();

// ── Cambiar estatus via AJAX ──────────────────────────────────────────────────
function cambiarEstatus(paroId, btn) {
    fetch(`/paros/estatus/${paroId}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF, 'Content-Type': 'application/json'},
    })
    .then(r => r.json())
    .then(data => {
        if (data.estatus) {
            const textos  = {rojo: i18n.sinRevisar, amarillo: i18n.pendiente, verde: i18n.revisado};
            const colores = {rojo:'#EF4444', amarillo:'#F59E0B', verde:'#10B981'};
            const titulos = {rojo: i18n.sinRevisarTitulo, amarillo: i18n.pendienteTitulo, verde: i18n.revisadoTitulo};
            btn.style.background = colores[data.estatus];
            btn.textContent      = textos[data.estatus];
            btn.title            = titulos[data.estatus];
            btn.dataset.estatus  = data.estatus;
            const barra = btn.closest('tr').querySelector('td:first-child');
            if (barra) barra.style.background = colores[data.estatus];
            showToast(i18n.estatusActualizado);
        }
    })
    .catch(() => showToast(i18n.errorEstatus, 'error'));
}

// ── Dropdown exportar ─────────────────────────────────────────────────────────
function toggleExportMenu() {
    const menu = document.getElementById('export-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', function(e) {
    const wrap = document.getElementById('export-wrap');
    if (wrap && !wrap.contains(e.target)) {
        const menu = document.getElementById('export-menu');
        if (menu) menu.style.display = 'none';
    }
});

// ── Selector de por_pagina ────────────────────────────────────────────────────
function cambiarPorPagina(valor) {
    const url = new URL(window.location.href);
    url.searchParams.set('por_pagina', valor);
    url.searchParams.delete('page');
    window.location.href = url.toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoSemana(isoStr) {
    const d   = new Date(isoStr + 'T00:00:00');
    const thu = new Date(d);
    thu.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(thu.getFullYear(), 0, 1);
    return String(Math.ceil(((thu - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

function enviarCampo(paroId, campo, valor, cell, original, onSuccess) {
    fetch(`/paros/actualizar/${paroId}/`, {
        method: 'POST',
        headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
        body: JSON.stringify({campo, valor})
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            if (onSuccess) onSuccess(data.valor);
            else cell.innerHTML = data.valor;
            showToast('Campo actualizado');
        } else {
            cell.innerHTML = original;
            showToast(data.error || 'Error al guardar', 'error');
        }
    })
    .catch(() => { cell.innerHTML = original; showToast('Error de red','error'); });
}

// ── Edición inline — texto ────────────────────────────────────────────────────
document.querySelectorAll('.editable').forEach(cell => {
     cell.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        const original = this.innerText.trim();
        const campo    = this.dataset.campo;
        if (!['tiempo_minutos', 'comentarios'].includes(campo)) return;
        const paroId   = this.closest('tr').dataset.id;
        const input    = document.createElement('input');
        input.className = 'edit-input';
        input.value     = original;
        if (campo === 'tiempo_minutos') {
            input.type        = 'text';
            input.placeholder = 'minutos';
            input.maxLength   = 5;
            input.style.textAlign = 'center';
            const save2 = () => {
                const val = input.value.trim();
                const valido = /^\d+$/.test(val) && parseInt(val) >= 0;
                if (!valido) {
                    showToast('Ingresa un número válido de minutos.', 'error');
                    this.innerHTML = original;
                    return;
                }
                if (val === original) { this.innerHTML = original; return; }
                enviarCampo(paroId, campo, val, this, original);
            };
            input.addEventListener('blur', save2);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter')  input.blur();
                if (e.key === 'Escape') this.innerHTML = original;
            });
            this.innerHTML = '';
            this.appendChild(input);
            input.focus(); input.select();
            return;
        }
        else { input.type = 'text'; }
        this.innerHTML = '';
        this.appendChild(input);
        input.focus(); input.select();
        const save = () => {
            const val = input.value.trim();
            if (val === original) { this.innerHTML = original; return; }
            enviarCampo(paroId, campo, val, this, original);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  input.blur();
            if (e.key === 'Escape') this.innerHTML = original;
        });
    });
});

// ── Edición inline — fecha ────────────────────────────────────────────────────
document.querySelectorAll('.editable-fecha').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.title = 'Doble clic para editar';
    cell.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        const displayOriginal = this.innerText.trim();
        const isoOriginal     = this.dataset.iso;
        const paroId          = this.closest('tr').dataset.id;
        const input = document.createElement('input');
        input.className   = 'edit-input';
        input.type        = 'text';
        input.value       = displayOriginal;
        input.placeholder = 'dd/mm/yy';
        input.maxLength   = 8;
        input.style.minWidth = '50px';
        input.style.textAlign = 'center';
        this.innerHTML = '';
        this.appendChild(input);
        input.focus(); input.select();
        const save = () => {
            const val = input.value.trim();
            if (!val) { this.innerHTML = displayOriginal; return; }
            const match = val.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
            if (!match) {
                showToast('Formato inválido. Usa dd/mm/yy (ej. 18/04/26)', 'error');
                this.innerHTML = displayOriginal;
                return;
            }
            const [_, d, m, yy] = match;
            const yyyy      = '20' + yy;
            const isoVal    = `${yyyy}-${m}-${d}`;
            const ddmmyyyy  = `${d}/${m}/${yyyy}`;
            if (isoVal === isoOriginal) { this.innerHTML = displayOriginal; return; }
            const semCell = this.closest('tr').querySelector('td[data-semana]');
            enviarCampo(paroId, 'fecha', ddmmyyyy, this, displayOriginal, () => {
                this.dataset.iso  = isoVal;
                this.innerHTML    = val;
                if (semCell) semCell.textContent = isoSemana(isoVal);
            });
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  input.blur();
            if (e.key === 'Escape') this.innerHTML = displayOriginal;
        });
    });
});

// ── Edición inline — hora ─────────────────────────────────────────────────────
document.querySelectorAll('.editable-hora').forEach(cell => {
    cell.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        const original = this.innerText.trim();
        const paroId   = this.closest('tr').dataset.id;
        const input    = document.createElement('input');
        input.className   = 'edit-input';
        input.type        = 'text';
        input.value       = original;
        input.placeholder = 'HH:MM';
        input.style.minWidth = '58px';
        input.style.textAlign = 'center';
        input.maxLength = 5;
        this.innerHTML = '';
        this.appendChild(input);
        input.focus(); input.select();
        const save = () => {
            const val = input.value.trim();
            const valido = /^([01]\d|2[0-3]):([0-5]\d)$/.test(val);
            if (!valido) {
                showToast('Formato inválido. Usa HH:MM (ej. 14:30)', 'error');
                this.innerHTML = original;
                return;
            }
            if (val === original) { this.innerHTML = original; return; }
            enviarCampo(paroId, 'hora', val, this, original);
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  input.blur();
            if (e.key === 'Escape') this.innerHTML = original;
        });
    });
});

// ── Edición inline — turno ────────────────────────────────────────────────────
document.querySelectorAll('[data-campo="turno"]').forEach(cell => {
    cell.addEventListener('dblclick', function(e) {
        const badge = cell.querySelector('.turno-badge');
        if (!badge) return;
        e.stopPropagation();
        const paroId      = cell.closest('tr').dataset.id;
        const valorActual = cell.dataset.valor;
        const sel = document.createElement('select');
        sel.className = 'edit-select';
        sel.innerHTML = `<option value="1">${i18n.turno1}</option><option value="2">${i18n.turno2}</option>`;
        sel.value = valorActual;
        badge.replaceWith(sel); sel.focus();
        const save = () => {
            const val = sel.value;
            const nb = document.createElement('span');
            nb.className    = `badge ${val==='1'?'badge-t1':'badge-t2'} turno-badge`;
            nb.style.cursor = 'pointer';
            nb.title        = 'Doble clic para editar';
            nb.textContent = val === '1' ? i18n.turno1 : i18n.turno2;
            sel.replaceWith(nb);
            if (val === valorActual) return;
            cell.dataset.valor = val;
            fetch(`/paros/actualizar/${paroId}/`, {
                method: 'POST',
                headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
                body: JSON.stringify({campo:'turno', valor: val})
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) showToast('Turno actualizado');
                else showToast(data.error || 'Error', 'error');
            });
        };
        sel.addEventListener('blur', save);
        sel.addEventListener('keydown', e => { if (e.key==='Enter') sel.blur(); });
    });
});

// ── Modal eliminar ────────────────────────────────────────────────────────────
const modal    = document.getElementById('modal-eliminar');
const formElim = document.getElementById('form-eliminar');

document.querySelectorAll('.btn-eliminar-icono').forEach(btn => {
    btn.addEventListener('click', function() {
        formElim.action = this.dataset.url;
        modal.style.display = 'flex';
    });
});
document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
    modal.style.display = 'none';
});
modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
});

// ── Filtro Columnas ────────────────────────────────────────────────────────────
function toggleDropdownColumnas() {
    const d = document.getElementById('dropdown-columnas');
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const btn = document.getElementById('btn-columnas');
    const dd  = document.getElementById('dropdown-columnas');
    if (!btn.contains(e.target) && !dd.contains(e.target)) {
        dd.style.display = 'none';
    }
});

function toggleColumna(cb) {
    const col = parseInt(cb.dataset.col);
    const tabla = document.getElementById('tabla-paros');
    tabla.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('th, td');
        if (cells[col]) cells[col].style.display = cb.checked ? '' : 'none';
    });
    const cols = tabla.querySelectorAll('colgroup col');
    if (cols[col]) cols[col].style.display = cb.checked ? '' : 'none';
    guardarColumnas();
}

function guardarColumnas() {
    const estado = {};
    document.querySelectorAll('#dropdown-columnas input[data-col]').forEach(cb => {
        estado[cb.dataset.col] = cb.checked;
    });
    localStorage.setItem('paros-columnas', JSON.stringify(estado));
}

function restaurarColumnas() {
    const guardado = localStorage.getItem('paros-columnas');
    if (!guardado) return;
    const estado = JSON.parse(guardado);
    Object.entries(estado).forEach(([col, visible]) => {
        const cb = document.querySelector(`#dropdown-columnas input[data-col="${col}"]`);
        if (cb && !visible) {
            cb.checked = false;
            toggleColumna(cb);
        }
    });
}

restaurarColumnas();