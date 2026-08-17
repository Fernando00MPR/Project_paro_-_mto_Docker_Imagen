/* registro_produccion.js */

const FECHA = document.getElementById('filtro-fecha');
const TURNO = document.getElementById('filtro-turno');

function aplicarFiltros() {
    window.location.href = `?fecha=${FECHA.value}&turno=${TURNO.value}`;
}

function toggleArea(id) {
    const body   = document.getElementById(id);
    const areaId = id.replace('area-', '');
    const chev   = document.querySelector('.chev-' + areaId);
    const collapsed = body.classList.contains('collapsed');
    body.classList.toggle('collapsed', !collapsed);
    if (chev) chev.style.transform = collapsed ? '' : 'rotate(-90deg)';
    guardarEstadoAreas();
}

function guardarEstadoAreas() {
    const estado = {};
    document.querySelectorAll('.area-content').forEach(el => {
        estado[el.id] = !el.classList.contains('collapsed');
    });
    localStorage.setItem('prod-areas', JSON.stringify(estado));
}

function restaurarEstadoAreas() {
    const guardado = localStorage.getItem('prod-areas');
    if (!guardado) {
        document.querySelectorAll('.area-content').forEach(el => {
            const areaId = el.id.replace('area-', '');
            const chev   = document.querySelector('.chev-' + areaId);
            el.classList.add('collapsed');
            if (chev) chev.style.transform = 'rotate(-90deg)';
        });
        return;
    }
    const estado = JSON.parse(guardado);
    document.querySelectorAll('.area-content').forEach(el => {
        const areaId = el.id.replace('area-', '');
        const chev   = document.querySelector('.chev-' + areaId);
        if (!estado[el.id]) {
            el.classList.add('collapsed');
            if (chev) chev.style.transform = 'rotate(-90deg)';
        }
    });
}

restaurarEstadoAreas();

function colorBar(pct) {
    if (pct >= 25) return '#EF4444';
    if (pct >= 10) return '#F59E0B';
    return '#10B981';
}

function renderDt(id, planeado, muerto, downtime) {
    document.getElementById('plan-'   + id).textContent = planeado + ' min';
    document.getElementById('muerto-' + id).textContent = muerto   + ' min';
    const color = colorBar(downtime);
    document.getElementById('dt-' + id).innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:60px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;border-radius:3px;width:${Math.min(downtime,100)}%;background:${color};"></div>
            </div>
            <span style="font-size:12px;font-weight:500;color:${color};">${downtime}%</span>
        </div>`;
}

// ── Editar equipo ─────────────────────────────────────────────────────────────
function editarEquipo(td) {
    const tr     = td.closest('tr');
    const regId  = tr.dataset.id;
    const turno  = tr.dataset.turno;
    const actual = td.textContent.trim();
    const areaId = tr.dataset.area;

    const equipos = [...document.querySelectorAll(`#eq-${areaId} option`)].map(o => o.value).filter(v => v);
    if (equipos.length === 0) return;

    const sel = document.createElement('select');
    sel.style.cssText = 'width:95%;height:28px;padding:0 6px;border:1.5px solid var(--indigo);border-radius:4px;font-size:12px;background:var(--white);color:var(--text);';
    sel.innerHTML = `<option value="">— Área completa —</option>` +
        equipos.map(e => `<option value="${e}" ${e === actual ? 'selected' : ''}>${e}</option>`).join('');
    td.innerHTML = '';
    td.appendChild(sel);
    sel.focus();

    const save = async () => {
        const nuevo = sel.value;
        td.textContent    = nuevo || 'Área completa';
        tr.dataset.equipo = nuevo || 'Área completa';
        const res = await fetch(URL_UPD + regId + '/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
            body: JSON.stringify({ equipo: nuevo })
        });
        const data = await res.json();
        if (data.ok) { 
            renderDt(regId, data.planeado, data.muerto, data.downtime); 
            showToast('Registro actualizado correctamente.', 'success'); 
        } else { 
            showToast(data.error || 'No se pudo actualizar el turno.', 'error');
            td.innerHTML = `<span class="badge ${actual===1?'badge-t1':'badge-t2'}">Turno ${actual}</span>`;
            tr.dataset.turno = actual;
        }
    };
    sel.addEventListener('blur', save);
    sel.addEventListener('change', () => sel.blur());
}

// ── Editar turno ──────────────────────────────────────────────────────────────
function editarTurno(td) {
    const tr     = td.closest('tr');
    const regId  = tr.dataset.id;
    const actual = parseInt(tr.dataset.turno);

    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;height:28px;padding:0 6px;border:1.5px solid var(--indigo);border-radius:4px;font-size:12px;background:var(--white);color:var(--text);';
    sel.innerHTML = `<option value="1" ${actual===1?'selected':''}>Turno 1</option>
                     <option value="2" ${actual===2?'selected':''}>Turno 2</option>`;
    td.innerHTML = '';
    td.appendChild(sel);
    sel.focus();

    const save = async () => {
        const nuevo = parseInt(sel.value);
        tr.dataset.turno = nuevo;
        td.innerHTML = `<span class="badge ${nuevo===1?'badge-t1':'badge-t2'}">Turno ${nuevo}</span>`;
        if (nuevo !== actual) {
            const res = await fetch(URL_UPD + regId + '/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
                body: JSON.stringify({ turno: nuevo })
            });
            const data = await res.json();
            if (data.ok) { 
                renderDt(regId, data.planeado, data.muerto, data.downtime); 
                showToast('Registro actualizado correctamente.', 'success'); 
            } else { 
                showToast(data.error || 'No se pudo actualizar el turno.', 'error');
                tr.dataset.turno = actual;
                td.innerHTML = `<span class="badge ${actual===1?'badge-t1':'badge-t2'}">Turno ${actual}</span>`;
            }
        }
    };
    sel.addEventListener('blur', save);
    sel.addEventListener('change', () => sel.blur());
}

// ── Editar hora ───────────────────────────────────────────────────────────────
function editarHora(td, tipo) {
    const tr     = td.closest('tr');
    const regId  = tr.dataset.id;
    const actual = td.textContent.trim().replace(/\s+/g, '');

    const input = document.createElement('input');
    input.type        = 'text';
    input.value       = actual;
    input.placeholder = 'HH:MM';
    input.maxLength   = 5;
    input.style.cssText = 'width:80px;height:28px;padding:0 6px;border:1.5px solid var(--indigo);border-radius:4px;font-size:12px;background:var(--white);color:var(--text);text-align:center;font-family:"DM Mono",monospace;';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    const save = async () => {
        const val    = input.value.trim();
        const valido = /^([01]\d|2[0-3]):([0-5]\d)$/.test(val);
        if (!valido) {
            showToast('Formato inválido. Usa HH:MM (ej. 14:30)', 'error');
            td.textContent = actual;
            return;
        }
        td.textContent = val;
        if (tipo === 'inicio') tr.dataset.inicio = val;
        else                   tr.dataset.fin    = val;

        const ini = tr.dataset.inicio;
        const fin = tr.dataset.fin;
        if (ini && fin && fin !== ini) {
            const res = await fetch(URL_UPD + regId + '/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
                body: JSON.stringify({ hora_inicio: ini, hora_fin: fin })
            });
            const data = await res.json();
            if (data.ok) { 
                renderDt(regId, data.planeado, data.muerto, data.downtime); 
                showToast('Registro actualizado correctamente.', 'success'); 
            } else { 
                showToast(data.error, 'error');
                td.innerHTML = `<span class="badge ${actual===1?'badge-t1':'badge-t2'}">Turno ${actual}</span>`;
                tr.dataset.turno = actual;
            }
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  input.blur();
        if (e.key === 'Escape') { td.textContent = actual; }
    });
}

// ── Editar molde (nombre buscable, número derivado) ────────────────────────────
function editarMolde(td) {
    const tr           = td.closest('tr');
    const regId        = tr.dataset.id;
    const numeroTd      = td.previousElementSibling;
    const actualNombre = td.textContent.trim() === '—' ? '' : td.textContent.trim();
    const actualNumero = numeroTd.textContent.trim() === '—' ? '' : numeroTd.textContent.trim();

    const input = document.createElement('input');
    input.type          = 'text';
    input.autocomplete  = 'off';
    input.value         = actualNombre;
    input.placeholder   = 'Buscar nombre de molde…';
    input.style.cssText = 'width:100%;height:28px;padding:0 6px;border:1.5px solid var(--indigo);border-radius:4px;font-size:12px;background:var(--white);color:var(--text);';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    let guardando = false;

    const mostrarLista = () => {
        const dropdown = getMoldeDropdown();
        const q = input.value.toLowerCase().trim();
        const matches = MOLDES_DATA.filter(m => !q || m.nombre_molde.toLowerCase().includes(q));
        dropdown.innerHTML = '';
        if (matches.length === 0) { dropdown.style.display = 'none'; return; }
        const rect = input.getBoundingClientRect();
        dropdown.style.left  = rect.left + 'px';
        dropdown.style.top   = rect.bottom + 'px';
        dropdown.style.width = Math.max(rect.width, 220) + 'px';
        matches.slice(0, 30).forEach(m => {
            const opt = document.createElement('div');
            opt.style.cssText = 'padding:6px 10px; font-size:12px; cursor:pointer; border-bottom:0.5px solid var(--border);';
            opt.innerHTML = `<strong style="color:var(--indigo);">${m.numero_molde}</strong> — ${m.nombre_molde}`;
            opt.addEventListener('mouseover', () => opt.style.background = 'var(--surface)');
            opt.addEventListener('mouseout',  () => opt.style.background = '');
            opt.addEventListener('mousedown', () => { input.value = m.nombre_molde; dropdown.style.display = 'none'; });
            dropdown.appendChild(opt);
        });
        dropdown.style.display = 'block';
    };

    const guardar = async () => {
        getMoldeDropdown().style.display = 'none';
        if (guardando) return;
        const nombre = input.value.trim();
        if (nombre === actualNombre) { td.textContent = actualNombre || '—'; return; }

        const molde = MOLDES_DATA.find(m => m.nombre_molde === nombre);
        if (!molde) {
            td.textContent = actualNombre || '—';
            if (nombre) showToast('Selecciona un molde válido del catálogo.', 'error');
            return;
        }

        guardando = true;
        td.textContent       = molde.nombre_molde;
        numeroTd.textContent = molde.numero_molde;

        const res = await fetch(URL_UPD + regId + '/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
            body: JSON.stringify({ numero_molde: molde.numero_molde, nombre_molde: molde.nombre_molde })
        });
        const data = await res.json();
        if (data.ok) {
            renderDt(regId, data.planeado, data.muerto, data.downtime);
            showToast('Registro actualizado correctamente.', 'success');
        } else {
            showToast(data.error || 'No se pudo actualizar el molde.', 'error');
            td.textContent       = actualNombre || '—';
            numeroTd.textContent = actualNumero || '—';
        }
    };

    input.addEventListener('input', mostrarLista);
    input.addEventListener('focus', mostrarLista);
    input.addEventListener('blur', () => setTimeout(guardar, 150));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  input.blur();
        if (e.key === 'Escape') { td.textContent = actualNombre || '—'; getMoldeDropdown().style.display = 'none'; }
    });
}

// ── Agregar registro ──────────────────────────────────────────────────────────
async function agregarRegistro(areaId) {
    const equipo  = document.getElementById('eq-'    + areaId).value;
    const turno   = document.getElementById('turno-' + areaId).value;
    const horaIni = document.getElementById('ini-'   + areaId).value;
    const horaFin = document.getElementById('fin-'   + areaId).value;
    const fecha   = FECHA.value;

    const moldeSel    = document.getElementById('molde-' + areaId);
    const moldeNombre = document.getElementById('molde-nombre-' + areaId);
    const numero_molde = moldeSel ? moldeSel.value : '';
    const nombre_molde = moldeNombre ? moldeNombre.value : '';

    if (!horaIni || !horaFin) { showToast('Ingresa la hora de inicio y fin.', 'error'); return; }
    if (moldeNombre && !numero_molde) { showToast('Selecciona un molde válido del catálogo.', 'error'); return; }
    
    const res = await fetch(URL_AGR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
        body: JSON.stringify({ area_id: areaId, equipo, turno, fecha, hora_inicio: horaIni, hora_fin: horaFin, numero_molde, nombre_molde })
    });
    const data = await res.json();
    if (data.ok) {
        showToast('Registro guardado correctamente.', 'success');
        setTimeout(() => window.location.reload(), 300);
    } else {
        showToast('Error: ' + data.error, 'error');
    }
}

// ── Eliminar registro ─────────────────────────────────────────────────────────
let regIdPendiente = null;

document.getElementById('btn-cancelar-modal').onclick = () => {
    document.getElementById('modal-eliminar').style.display = 'none';
    regIdPendiente = null;
};

document.getElementById('btn-confirmar-eliminar').onclick = async () => {
    if (!regIdPendiente) return;
    document.getElementById('modal-eliminar').style.display = 'none';
    const res = await fetch(URL_ELIM + regIdPendiente + '/', {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF }
    });
    const data = await res.json();
    if (data.ok) {
        showToast('Registro eliminado.', 'success');
        document.getElementById('row-' + regIdPendiente).remove();
    } else {
        showToast('Error al eliminar el registro.', 'error');
    }
    regIdPendiente = null;
};

function eliminarRegistro(regId) {
    regIdPendiente = regId;
    document.getElementById('modal-eliminar').style.display = 'flex';
}

// ── Mover filas ───────────────────────────────────────────────────────────────
function moverFila(btn, dir) {
    const tr    = btn.closest('tr');
    const tbody = tr.parentElement;
    const filas = [...tbody.querySelectorAll('tr[id^="row-"]')];
    const idx   = filas.indexOf(tr);
    if (dir === -1 && idx > 0) {
        tbody.insertBefore(tr, filas[idx - 1]);
    } else if (dir === 1 && idx < filas.length - 1) {
        tbody.insertBefore(filas[idx + 1], tr);
    }
    const nuevoOrden = [...tbody.querySelectorAll('tr[id^="row-"]')].map(r => r.id.replace('row-', ''));
    fetch(URL_ORD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
        body: JSON.stringify({ orden: nuevoOrden })
    });
}