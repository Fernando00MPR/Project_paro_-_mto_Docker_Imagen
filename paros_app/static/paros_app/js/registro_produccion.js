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
    const actual = td.textContent.trim();
    const areaId = tr.dataset.area;

    const equipos = equiposValidos(areaId);
    if (equipos.length === 0) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.id   = 'editar-equipo-' + regId;
    input.value = actual === 'Área completa' ? '' : actual;
    input.autocomplete = 'off';
    input.style.cssText = 'width:95%;height:28px;padding:0 6px;border:1.5px solid var(--indigo);border-radius:4px;font-size:12px;background:var(--white);color:var(--text);';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    filtrarEquipoDropdown(input, areaId);
    input.addEventListener('input', () => filtrarEquipoDropdown(input, areaId));

    const save = async () => {
        validarEquipoTexto(input, areaId);
        const nuevo = input.value.trim();
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
            td.textContent    = actual;
            tr.dataset.equipo = actual;
        }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  input.blur();
        if (e.key === 'Escape') { td.textContent = actual; getEquipoDropdown().style.display = 'none'; }
    });
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
let modalEliminarTrigger = null;

function cerrarModalEliminar() {
    document.getElementById('modal-eliminar').style.display = 'none';
    regIdPendiente = null;
    if (modalEliminarTrigger) { modalEliminarTrigger.focus(); modalEliminarTrigger = null; }
}

document.getElementById('btn-cancelar-modal').onclick = cerrarModalEliminar;

document.getElementById('modal-eliminar').addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModalEliminar();
});

document.getElementById('btn-confirmar-eliminar').onclick = async () => {
    if (!regIdPendiente) return;
    const idBorrado = regIdPendiente;
    const trigger    = modalEliminarTrigger;
    document.getElementById('modal-eliminar').style.display = 'none';
    regIdPendiente = null;
    modalEliminarTrigger = null;
    const res = await fetch(URL_ELIM + idBorrado + '/', {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF }
    });
    const data = await res.json();
    if (data.ok) {
        showToast('Registro eliminado.', 'success');
        document.getElementById('row-' + idBorrado).remove();
    } else {
        showToast('Error al eliminar el registro.', 'error');
        if (trigger) trigger.focus();
    }
};

function eliminarRegistro(regId, trigger) {
    regIdPendiente = regId;
    modalEliminarTrigger = trigger || document.activeElement;
    const tr      = document.getElementById('row-' + regId);
    const detalle = document.getElementById('modal-eliminar-detalle');
    if (tr && detalle) {
        detalle.textContent = `${tr.dataset.equipo} · ${TXT_TURNO} ${tr.dataset.turno} · ${tr.dataset.inicio}–${tr.dataset.fin}`;
    }
    document.getElementById('modal-eliminar').style.display = 'flex';
    document.getElementById('btn-cancelar-modal').focus();
}

// ── Exportar registros ────────────────────────────────────────────────────────
let modalExportarTrigger = null;

function abrirModalExportar() {
    modalExportarTrigger = document.activeElement;
    const modal = document.getElementById('modal-exportar');
    modal.style.display = 'flex';
    const control = document.getElementById('exp-rango-control');
    if (control) control.focus();
    if (typeof solicitarConteoExport === 'function') solicitarConteoExport();
}

function cerrarModalExportar() {
    if (typeof cerrarCalendarioExport === 'function') cerrarCalendarioExport();
    document.getElementById('modal-exportar').style.display = 'none';
    if (modalExportarTrigger) { modalExportarTrigger.focus(); modalExportarTrigger = null; }
}


document.getElementById('modal-exportar').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (typeof expCal !== 'undefined' && expCal.abierto) {
            cerrarCalendarioExport();
        } else {
            cerrarModalExportar();
        }
        return;
    }
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('modal-exportar');
    const focusables = [...modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([type=hidden]), select, [tabindex]:not([tabindex="-1"])'
    )].filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
    }
});

// ── Menú ⋯ de fila ───────────────────────────────────────────────────────────────
let menuFilaState = null; // { trigger }

function getMenuFilaPopover() {
    let popover = document.getElementById('menu-fila-popover');
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'menu-fila-popover';
        popover.className = 'menu-fila-popover';
        popover.setAttribute('role', 'menu');
        document.body.appendChild(popover);
    }
    return popover;
}

function cerrarMenuFila() {
    const popover = getMenuFilaPopover();
    popover.style.display = 'none';
    if (menuFilaState) {
        menuFilaState.trigger.setAttribute('aria-expanded', 'false');
        menuFilaState.trigger.classList.remove('open');
        menuFilaState.trigger.focus();
    }
    menuFilaState = null;
}

function toggleMenuFila(btn) {
    if (menuFilaState && menuFilaState.trigger === btn) {
        cerrarMenuFila();
        return;
    }
    cerrarMenuFila();
    const regId   = btn.dataset.registro;
    const popover = getMenuFilaPopover();
    popover.innerHTML = `
        <button type="button" class="menu-fila-item delete" role="menuitem"
                onmousedown="event.preventDefault();"
                onclick="onMenuFilaEliminar('${regId}')">${TXT_ELIMINAR}</button>
    `;
    const rect = btn.getBoundingClientRect();
    popover.style.display = 'block';
    let left = rect.right - popover.offsetWidth;
    if (left < 8) left = 8;
    popover.style.left = left + 'px';
    popover.style.top  = (rect.bottom + 4) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    menuFilaState = { trigger: btn };
    const first = popover.querySelector('.menu-fila-item');
    if (first) first.focus();
}

function onMenuFilaEliminar(regId) {
    const trigger = menuFilaState ? menuFilaState.trigger : null;
    cerrarMenuFila();
    eliminarRegistro(regId, trigger);
}

document.addEventListener('click', e => {
    if (!menuFilaState) return;
    const popover = getMenuFilaPopover();
    if (popover.contains(e.target) || e.target === menuFilaState.trigger) return;
    cerrarMenuFila();
});

document.addEventListener('keydown', e => {
    if (!menuFilaState) return;
    const popover = getMenuFilaPopover();
    const items = [...popover.querySelectorAll('.menu-fila-item:not(:disabled)')];
    const idx   = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
        e.preventDefault();
        cerrarMenuFila();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) items[(idx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) items[(idx - 1 + items.length) % items.length].focus();
    }
});

// ── Reordenar filas (arrastrar handle + teclado) ──────────────────────────────
let dragState = null; // { tr, tbody, ordenAntes }

function ordenActual(tbody) {
    return [...tbody.querySelectorAll('tr[id^="row-"]')].map(r => r.id.replace('row-', ''));
}

function aplicarOrden(tbody, ordenIds) {
    ordenIds.forEach(id => {
        const tr = document.getElementById('row-' + id);
        if (tr) tbody.appendChild(tr);
    });
}

function limpiarIndicadoresDrop() {
    document.querySelectorAll('tr.drop-above, tr.drop-below').forEach(r => r.classList.remove('drop-above', 'drop-below'));
}

async function persistirOrden(tbody, ordenPrevio) {
    const nuevoOrden = ordenActual(tbody);
    let data = { ok: false };
    try {
        const res = await fetch(URL_ORD, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
            body: JSON.stringify({ orden: nuevoOrden })
        });
        data = await res.json();
    } catch (err) { /* data.ok se queda en false */ }
    if (!data.ok) {
        aplicarOrden(tbody, ordenPrevio);
        showToast('No se pudo guardar el nuevo orden.', 'error');
    }
}

function anunciarOrden(tr, tbody) {
    const filas = ordenActual(tbody);
    const pos   = filas.indexOf(tr.id.replace('row-', '')) + 1;
    const anuncio = document.getElementById('orden-anuncio');
    if (anuncio) anuncio.textContent = `Fila movida a la posición ${pos} de ${filas.length}`;
}

function moverFilaPos(tr, dir) {
    const tbody      = tr.parentElement;
    const ordenAntes = ordenActual(tbody);
    const filas      = [...tbody.querySelectorAll('tr[id^="row-"]')];
    const idx        = filas.indexOf(tr);
    if (dir === -1 && idx > 0) {
        tbody.insertBefore(tr, filas[idx - 1]);
    } else if (dir === 1 && idx < filas.length - 1) {
        tbody.insertBefore(filas[idx + 1], tr);
    } else {
        return;
    }
    anunciarOrden(tr, tbody);
    persistirOrden(tbody, ordenAntes);
}

let handleSnapshot = null; // { tbody, orden }

function initDragHandle(handle) {
    handle.addEventListener('dragstart', e => {
        const tr = handle.closest('tr');
        dragState = { tr, tbody: tr.parentElement, ordenAntes: ordenActual(tr.parentElement) };
        tr.classList.add('dragging-row');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tr.dataset.id);
    });
    handle.addEventListener('dragend', () => {
        if (dragState) dragState.tr.classList.remove('dragging-row');
        limpiarIndicadoresDrop();
        dragState = null;
    });
    handle.addEventListener('focus', () => {
        const tr = handle.closest('tr');
        handleSnapshot = { tbody: tr.parentElement, orden: ordenActual(tr.parentElement) };
    });
    handle.addEventListener('blur', () => { handleSnapshot = null; });
    handle.addEventListener('keydown', e => {
        const tr = handle.closest('tr');
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            moverFilaPos(tr, -1);
            handle.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            moverFilaPos(tr, 1);
            handle.focus();
        } else if (e.key === 'Escape' && handleSnapshot) {
            e.preventDefault();
            const tbody = handleSnapshot.tbody;
            const ordenAntesDeRevertir = ordenActual(tbody);
            aplicarOrden(tbody, handleSnapshot.orden);
            anunciarOrden(tr, tbody);
            persistirOrden(tbody, ordenAntesDeRevertir);
            handle.focus();
        }
    });
}

function initTbodyDragTarget(tbody) {
    tbody.addEventListener('dragover', e => {
        if (!dragState) return;
        const tr = e.target.closest('tr[id^="row-"]');
        if (!tr || tr.dataset.area !== dragState.tr.dataset.area) return;
        e.preventDefault();
        limpiarIndicadoresDrop();
        const rect   = tr.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        tr.classList.add(before ? 'drop-above' : 'drop-below');
    });
    tbody.addEventListener('drop', e => {
        if (!dragState) return;
        const tr = e.target.closest('tr[id^="row-"]');
        if (!tr || tr === dragState.tr || tr.dataset.area !== dragState.tr.dataset.area) return;
        e.preventDefault();
        const rect   = tr.getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        tbody.insertBefore(dragState.tr, before ? tr : tr.nextSibling);
        limpiarIndicadoresDrop();
        anunciarOrden(dragState.tr, tbody);
        persistirOrden(tbody, dragState.ordenAntes);
    });
}

document.querySelectorAll('.drag-handle').forEach(initDragHandle);
document.querySelectorAll('tbody[id^="tbody-"]').forEach(initTbodyDragTarget);