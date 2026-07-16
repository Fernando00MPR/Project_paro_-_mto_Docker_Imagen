/* lista_paros.js — Edición inline, estatus, exportar, eliminar y lightbox de imágenes */

// Token CSRF leído desde la cookie; se adjunta a todos los fetch POST para que
// Django no rechace las peticiones con error 403 Forbidden.
const CSRF = (()=>{
    const c = document.cookie.split(';').find(s=>s.trim().startsWith('csrftoken='));
    return c ? c.trim().split('=')[1] : '';
})();

// ── Cambiar estatus via AJAX ──────────────────────────────────────────────────
// El backend rota el estatus: rojo → amarillo → verde → rojo.
// Actualiza el botón, la barra lateral de color de la fila y muestra un toast.
function cambiarEstatus(paroId, btn) {
    fetch(`/paros/estatus/${paroId}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': CSRF, 'Content-Type': 'application/json'},
    })
    .then(r => r.json())
    .then(data => {
        if (data.estatus) {
            const textos  = {rojo: i18n.Rechazado, amarillo: i18n.Pendiente, verde: i18n.Aceptado};
            const colores = {rojo:'#EF4444', amarillo:'#F59E0B', verde:'#10B981'};
            const titulos = {rojo: i18n.RechazadoTitulo, amarillo: i18n.PendienteTitulo, verde: i18n.AceptadoTitulo};
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
// Muestra u oculta el menú de exportar (Excel / CSV).
// El listener de documento cierra el menú al hacer clic fuera de él.
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
// Cambia cuántos registros se muestran por página sin perder los demás filtros
// activos en la URL; resetea siempre a la página 1 para no caer en página vacía.
function cambiarPorPagina(valor) {
    const url = new URL(window.location.href);
    url.searchParams.set('por_pagina', valor);
    url.searchParams.delete('page');
    window.location.href = url.toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Calcula el número de semana ISO 8601 a partir de una cadena 'YYYY-MM-DD'.
// Se usa para actualizar la celda de semana al editar la fecha inline.
function isoSemana(isoStr) {
    const d   = new Date(isoStr + 'T00:00:00');
    const thu = new Date(d);
    thu.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(thu.getFullYear(), 0, 1);
    return String(Math.ceil(((thu - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

// Envía un campo editado al backend via AJAX.
// Si la respuesta es exitosa llama onSuccess (si se proporcionó) o actualiza la celda.
// En error restaura el contenido original para no dejar la celda vacía.
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

// ── Edición inline — texto (tiempo_minutos y comentarios) ─────────────────────
// Doble clic reemplaza la celda con un <input>; al salir (blur/Enter) guarda via AJAX.
// tiempo_minutos valida que sea un entero >= 0 antes de enviar.
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
// Acepta formato dd/mm/yy (ej. 18/04/26); convierte a dd/mm/yyyy para el backend
// y actualiza la celda de semana ISO de la misma fila si el guardado es exitoso.
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
// Valida formato HH:MM (00:00 – 23:59) antes de enviar al backend.
document.querySelectorAll('.editable-hora').forEach(cell => {
    cell.title = 'Doble clic para editar';
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
// Reemplaza el badge de turno con un <select>; al confirmar lo devuelve a badge
// con el estilo correcto (badge-t1 / badge-t2) y guarda via fetch directa.
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
// Al hacer clic en el icono de basura, se asigna la URL de eliminación al form
// del modal y se muestra. El submit del form hace DELETE via POST con CSRF.
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
// Cerrar el modal haciendo clic en el fondo oscuro
modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
});

// ── Filtro Columnas ────────────────────────────────────────────────────────────
// El dropdown permite mostrar u ocultar columnas de la tabla.
// El estado se persiste en localStorage para mantenerlo entre recargas.
function toggleDropdownColumnas() {
    const d = document.getElementById('dropdown-columnas');
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

// Cierra el dropdown al hacer clic fuera de él
document.addEventListener('click', function(e) {
    const btn = document.getElementById('btn-columnas');
    const dd  = document.getElementById('dropdown-columnas');
    if (!btn.contains(e.target) && !dd.contains(e.target)) {
        dd.style.display = 'none';
    }
});

// Oculta o muestra la columna indicada en la tabla y en el <colgroup>
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

// Serializa el estado de todos los checkboxes en localStorage
function guardarColumnas() {
    const estado = {};
    document.querySelectorAll('#dropdown-columnas input[data-col]').forEach(cb => {
        estado[cb.dataset.col] = cb.checked;
    });
    localStorage.setItem('paros-columnas', JSON.stringify(estado));
}

// Al cargar la página aplica el estado guardado para respetar la preferencia del usuario
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

// ── Lightbox de imágenes ───────────────────────────────────────────────────────
// Estado global: array de imágenes del paro activo e índice de la imagen visible.
let lightboxImagenes = [];
let lightboxIndice   = 0;

// Estado del zoom y pan (arrastre) sobre la imagen principal
let zoomLevel        = 1;
let panX = 0, panY = 0;
let isDragging = false, dragStartX = 0, dragStartY = 0, dragMoved = false;

// Colores y etiquetas para el badge de estatus dentro del lightbox
const ESTATUS_BADGE = {
    verde:    {label:'Aceptado',  bg:'#D1FAE5', color:'#065F46'},
    amarillo: {label:'Pendiente', bg:'#FEF3C7', color:'#92400E'},
    rojo:     {label:'Rechazado', bg:'#FEE2E2', color:'#991B1B'},
};

// Abre el modal; carga imágenes, área, fecha y estatus del paro via fetch JSON.
function verImagenes(paroId) {
    fetch(`/paros/${paroId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            lightboxImagenes = data.imagenes;
            lightboxIndice   = 0;

            const est   = ESTATUS_BADGE[data.estatus] || {};
            const badge = est.label
                ? ` &nbsp;<span style="display:inline-flex;align-items:center;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${est.bg};color:${est.color};">&#11044; ${est.label}</span>`
                : '';
            document.getElementById('lightbox-meta').innerHTML =
                [data.area, data.fecha].filter(Boolean).join('  -  ') + badge;

            renderLightbox();
            document.getElementById('modal-imagenes').style.display = 'flex';
        });
}

// Restablece zoom y pan al valor inicial (1x, sin desplazamiento)
function resetZoom() {
    zoomLevel = 1; panX = 0; panY = 0;
    const img = document.getElementById('lightbox-img-principal');
    img.style.transform = 'translate(0,0) scale(1)';
    img.style.cursor    = 'zoom-in';
}

// Actualiza imagen principal, contador y miniaturas según lightboxIndice actual
function renderLightbox() {
    if (!lightboxImagenes.length) return;

    resetZoom();
    const imgPrincipal = document.getElementById('lightbox-img-principal');
    const skeleton     = document.getElementById('lightbox-skeleton');
    imgPrincipal.style.opacity = '0';
    skeleton.style.display = 'block';
    imgPrincipal.onload = () => {
        imgPrincipal.style.transition = 'opacity .2s ease';
        imgPrincipal.style.opacity = '1';
        skeleton.style.display = 'none';
    };
    imgPrincipal.src = lightboxImagenes[lightboxIndice].url;
    document.getElementById('lightbox-contador').textContent =
        (i18n.imagenDe || 'Imagen {n} de {total}')
            .replace('{n}', lightboxIndice + 1)
            .replace('{total}', lightboxImagenes.length);
            
    const cont = document.getElementById('lightbox-miniaturas');
    cont.innerHTML = '';
    lightboxImagenes.forEach((img, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'img-loading-wrap';
        wrap.style.cssText = 'width:70px; height:70px;';

        const thumbSkeleton = document.createElement('div');
        thumbSkeleton.className = 'img-skeleton';
        wrap.appendChild(thumbSkeleton);

        const thumb = document.createElement('img');
        thumb.loading = 'lazy';
        thumb.src = img.url;
        thumb.onclick = () => { lightboxIndice = i; renderLightbox(); };
        thumb.onload = () => { thumb.style.opacity = '1'; thumbSkeleton.style.display = 'none'; };
        thumb.style.cssText = `
            width:70px; height:70px; object-fit:cover; border-radius:8px; cursor:pointer;
            border:2px solid ${i === lightboxIndice ? 'var(--indigo)' : 'transparent'};
            position:relative; opacity:0; transition:opacity .2s ease;
        `;
        wrap.appendChild(thumb);
        cont.appendChild(wrap);
    });
}

// Navega a la imagen anterior con wrap-around circular
function lightboxAnterior() {
    lightboxIndice = (lightboxIndice - 1 + lightboxImagenes.length) % lightboxImagenes.length;
    renderLightbox();
}

// Navega a la imagen siguiente con wrap-around circular
function lightboxSiguiente() {
    lightboxIndice = (lightboxIndice + 1) % lightboxImagenes.length;
    renderLightbox();
}

function cerrarModalImagenes() {
    document.getElementById('modal-imagenes').style.display = 'none';
}

// Descarga la imagen actual usando un <a> temporal con el atributo download
function descargarImagenActual() {
    const img = lightboxImagenes[lightboxIndice];
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Cerrar con clic en el fondo del modal
document.getElementById('modal-imagenes').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalImagenes();
});

// Navegación con teclado: ← → cambian imagen, Escape cierra el modal
document.addEventListener('keydown', function(e) {
    if (document.getElementById('modal-imagenes').style.display === 'flex') {
        if (e.key === 'ArrowLeft') lightboxAnterior();
        if (e.key === 'ArrowRight') lightboxSiguiente();
        if (e.key === 'Escape') cerrarModalImagenes();
    }
});

// ── Zoom y drag sobre la imagen principal ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    const img = document.getElementById('lightbox-img-principal');

    img.addEventListener('wheel', function(e) {
        if (document.getElementById('modal-imagenes').style.display !== 'flex') return;
        e.preventDefault();
        zoomLevel = Math.min(3, Math.max(1, zoomLevel + (e.deltaY < 0 ? 0.15 : -0.15)));
        if (zoomLevel === 1) { panX = 0; panY = 0; }
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
        img.style.cursor    = zoomLevel > 1 ? 'grab' : 'zoom-in';
    }, { passive: false });

    img.addEventListener('mousedown', function(e) {
        if (zoomLevel <= 1) return;
        isDragging = true; dragMoved = false;
        dragStartX = e.clientX - panX; dragStartY = e.clientY - panY;
        img.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        panX = e.clientX - dragStartX; panY = e.clientY - dragStartY;
        dragMoved = true;
        img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    });

    document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        img.style.cursor = zoomLevel > 1 ? 'grab' : 'zoom-in';
    });

    img.addEventListener('click', function() {
        if (!dragMoved) window.open(img.src, '_blank');
        dragMoved = false;
    });
});
