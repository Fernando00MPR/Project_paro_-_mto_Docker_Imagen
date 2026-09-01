/* bitacora.js */

const cfg = window.BITACORA_CFG || {};

// ── Modal crear / editar ──────────────────────────────────────────────────────

function abrirModalBitacora() {
    document.getElementById('modal-titulo-bitacora').textContent = 'Nuevo registro';
    document.getElementById('form-bitacora').action = cfg.urlNuevo;
    const areaSelect = document.getElementById('bit-area');
    if (cfg.filtroArea && areaSelect) areaSelect.value = cfg.filtroArea;
    document.getElementById('bit-fecha').value       = cfg.hoy || '';
    document.getElementById('bit-equipo').value      = '';
    document.getElementById('bit-responsable').value = '';
    document.getElementById('bit-actividad').value   = '';
    document.getElementById('bit-pendiente').value   = '';
    _actualizarContadores();
    _bitResetImagenes();
    document.getElementById('modal-bitacora').style.display = 'flex';
}

function abrirModalEditar(id, url, area, fecha, equipo, actividad, pendiente, responsable) {
    document.getElementById('modal-titulo-bitacora').textContent = 'Editar registro';
    document.getElementById('form-bitacora').action = url;
    const areaSelect = document.getElementById('bit-area');
    if (areaSelect) areaSelect.value = area;
    document.getElementById('bit-fecha').value       = fecha;
    document.getElementById('bit-equipo').value      = equipo;
    document.getElementById('bit-responsable').value = responsable;
    document.getElementById('bit-actividad').value   = actividad;
    document.getElementById('bit-pendiente').value   = pendiente;
    _actualizarContadores();
    _bitResetImagenes();
    document.getElementById('modal-bitacora').style.display = 'flex';

    fetch(`${cfg.urlImagenesBase}${id}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            _bitImagenesExistentes = data.imagenes || [];
            _bitRenderExistentes();
            _bitRenderZonaTexto();
        })
        .catch(() => {});

}

function cerrarModalBitacora() {
    document.getElementById('modal-bitacora').style.display = 'none';
}

// ── Modal eliminar ────────────────────────────────────────────────────────────

function confirmarEliminarBitacora(url, texto) {
    document.getElementById('form-eliminar-bitacora').action = url;
    document.getElementById('texto-eliminar-bitacora').textContent = texto;
    document.getElementById('modal-eliminar-bitacora').style.display = 'flex';
}

function cerrarModalEliminarBitacora() {
    document.getElementById('modal-eliminar-bitacora').style.display = 'none';
}

// ── Contadores de caracteres ──────────────────────────────────────────────────

function _actualizarContadores() {
    const a = document.getElementById('bit-actividad');
    const p = document.getElementById('bit-pendiente');
    if (a) document.getElementById('cnt-actividad').textContent = a.value.length + '/300';
    if (p) document.getElementById('cnt-pendiente').textContent = p.value.length + '/200';
}

// ── Imágenes (crear/editar) ───────────────────────────────────────────────────
// Mismo patrón que crear_paro.js: un array propio de archivos nuevos (FileList
// es de solo lectura) + un array de imágenes ya guardadas (solo al editar).
let _bitArchivosSeleccionados = [];
let _bitImagenesExistentes    = [];

function _bitResetImagenes() {
    _bitArchivosSeleccionados = [];
    _bitImagenesExistentes    = [];
    document.getElementById('bit-input-imagenes').value = '';
    document.getElementById('bit-preview-imagenes').innerHTML = '';
    document.getElementById('bit-imagenes-existentes').innerHTML = '';
    _bitRenderZonaTexto();
}

function previsualizarImagenesBitacora(input) {
    const max          = cfg.maxImagenes || 2;
    const nuevos        = Array.from(input.files);
    const disponibles   = max - _bitImagenesExistentes.length - _bitArchivosSeleccionados.length;

    if (nuevos.length > disponibles) {
        alert(`Máximo ${max} imágenes. Solo puedes agregar ${disponibles} más.`);
        input.value = '';
        return;
    }

    _bitArchivosSeleccionados = _bitArchivosSeleccionados.concat(nuevos);
    input.value = '';
    _bitSincronizarInput();
    _bitRenderPreviews();
    _bitRenderZonaTexto();
}

function _bitQuitarImagen(index) {
    _bitArchivosSeleccionados.splice(index, 1);
    _bitSincronizarInput();
    _bitRenderPreviews();
    _bitRenderZonaTexto();
}

function _bitSincronizarInput() {
    const dt = new DataTransfer();
    _bitArchivosSeleccionados.forEach(f => dt.items.add(f));
    document.getElementById('bit-input-imagenes').files = dt.files;
}

function _bitRenderPreviews() {
    const preview = document.getElementById('bit-preview-imagenes');
    preview.innerHTML = '';
    _bitArchivosSeleccionados.forEach((file, i) => {
        const reader = new FileReader();
        reader.onload = e => {
            const div = document.createElement('div');
            div.style.cssText = 'position:relative;';
            div.innerHTML = `
                <img src="${e.target.result}"
                    style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">
                <button type="button" onclick="_bitQuitarImagen(${i})"
                    style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;
                           border-radius:50%;background:var(--red);border:none;cursor:pointer;
                           display:flex;align-items:center;justify-content:center;padding:0;
                           color:#fff;font-size:11px;font-weight:700;line-height:1;">✕</button>`;
            preview.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function _bitRenderExistentes() {
    const cont = document.getElementById('bit-imagenes-existentes');
    cont.innerHTML = '';
    _bitImagenesExistentes.forEach(img => {
        const div = document.createElement('div');
        div.style.cssText = 'position:relative;';
        div.innerHTML = `
            <img src="${img.url}"
                style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">
            <button type="button" onclick="_bitEliminarExistente(${img.id}, this)"
                style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;
                       border-radius:50%;background:var(--red);border:none;cursor:pointer;
                       display:flex;align-items:center;justify-content:center;padding:0;
                       color:#fff;font-size:11px;font-weight:700;line-height:1;">✕</button>`;
        cont.appendChild(div);
    });
}

function _bitEliminarExistente(imagenId, btn) {
    if (!confirm('¿Eliminar esta imagen?')) return;
    fetch(`${cfg.urlEliminarImagenBase}${imagenId}/eliminar/`, {
        method: 'POST',
        headers: { 'X-CSRFToken': document.querySelector('#form-bitacora [name=csrfmiddlewaretoken]').value },
    })
        .then(r => r.json())
        .then(data => {
            if (data.ok) {
                _bitImagenesExistentes = _bitImagenesExistentes.filter(i => i.id !== imagenId);
                btn.parentElement.remove();
                _bitRenderZonaTexto();
            }
        });
}

function _bitRenderZonaTexto() {
    const max   = cfg.maxImagenes || 2;
    const total = _bitImagenesExistentes.length + _bitArchivosSeleccionados.length;
    const zona  = document.getElementById('bit-zona-imagenes');
    const texto = document.getElementById('bit-zona-texto');
    if (!texto) return;
    if (total >= max) {
        texto.textContent = `Límite de ${max} imágenes alcanzado`;
        zona.style.pointerEvents = 'none';
        zona.style.opacity = '0.5';
    } else {
        texto.textContent = 'Haz clic para seleccionar imágenes';
        zona.style.pointerEvents = 'auto';
        zona.style.opacity = '1';
    }
}

// ── Lightbox de imágenes (tabla) ──────────────────────────────────────────────
let _lightboxBitImagenes = [];
let _lightboxBitIndice   = 0;

function verImagenesBitacora(bitacoraId) {
    fetch(`${cfg.urlImagenesBase}${bitacoraId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            _lightboxBitImagenes = data.imagenes || [];
            _lightboxBitIndice   = 0;
            _renderLightboxBit();
            document.getElementById('modal-imagenes-bitacora').style.display = 'flex';
        });
}

function _renderLightboxBit() {
    const img = _lightboxBitImagenes[_lightboxBitIndice];
    if (!img) return;
    document.getElementById('lightbox-bit-img-principal').src = img.url;

    const miniaturas = document.getElementById('lightbox-bit-miniaturas');
    miniaturas.innerHTML = _lightboxBitImagenes.map((im, i) => `
        <img src="${im.url}" onclick="_lightboxBitIndice=${i}; _renderLightboxBit();"
            style="width:56px; height:56px; object-fit:cover; border-radius:6px; cursor:pointer;
                   border:2px solid ${i === _lightboxBitIndice ? 'var(--indigo)' : 'transparent'};">
    `).join('');
}

function lightboxBitAnterior() {
    _lightboxBitIndice = (_lightboxBitIndice - 1 + _lightboxBitImagenes.length) % _lightboxBitImagenes.length;
    _renderLightboxBit();
}

function lightboxBitSiguiente() {
    _lightboxBitIndice = (_lightboxBitIndice + 1) % _lightboxBitImagenes.length;
    _renderLightboxBit();
}

function cerrarModalImagenesBitacora() {
    document.getElementById('modal-imagenes-bitacora').style.display = 'none';
}

function descargarImagenActualBit() {
    const img = _lightboxBitImagenes[_lightboxBitIndice];
    if (!img) return;
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ── Autocomplete genérico ─────────────────────────────────────────────────────

function _autocomplete(inputId, dropdownId, fetchUrl) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    let timer;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 1) { dropdown.style.display = 'none'; return; }

        timer = setTimeout(() => {
            const areaId = document.getElementById('bit-area')
                ? document.getElementById('bit-area').value
                : (cfg.filtroArea || '');

            fetch(`${fetchUrl}?area_id=${encodeURIComponent(areaId)}&q=${encodeURIComponent(q)}`)
                .then(r => r.json())
                .then(items => {
                    if (!items.length) { dropdown.style.display = 'none'; return; }
                    dropdown.innerHTML = items.map(it => `
                        <div class="bit-ac-item" data-nombre="${it.nombre.replace(/"/g, '&quot;')}"
                             style="padding:8px 12px; cursor:pointer; font-size:13px;
                                    border-bottom:1px solid var(--border);">
                            <div style="font-weight:500;">${it.nombre}</div>
                            ${it.descripcion ? `<div style="font-size:11px; color:var(--text-3);">${it.descripcion}</div>` : ''}
                        </div>
                    `).join('');
                    dropdown.querySelectorAll('.bit-ac-item').forEach(item => {
                        item.addEventListener('mousedown', e => {
                            e.preventDefault();
                            input.value = item.dataset.nombre;
                            dropdown.style.display = 'none';
                        });
                    });
                    dropdown.style.display = 'block';
                })
                .catch(() => {});
        }, 200);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Contadores
    const actividad = document.getElementById('bit-actividad');
    const pendiente = document.getElementById('bit-pendiente');
    if (actividad) actividad.addEventListener('input', _actualizarContadores);
    if (pendiente) pendiente.addEventListener('input', _actualizarContadores);

    // Autocomplete
    _autocomplete('bit-equipo',      'equipo-dropdown-bit',      cfg.urlBuscarEquipos);
    _autocomplete('bit-responsable', 'responsable-dropdown-bit', cfg.urlBuscarResponsables);

    // Cerrar modales con backdrop y ESC
    document.getElementById('modal-bitacora').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-bitacora')) cerrarModalBitacora();
    });
    document.getElementById('modal-eliminar-bitacora').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-eliminar-bitacora')) cerrarModalEliminarBitacora();
    });
    document.getElementById('modal-imagenes-bitacora').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-imagenes-bitacora')) cerrarModalImagenesBitacora();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarModalBitacora();
            cerrarModalEliminarBitacora();
            cerrarModalImagenesBitacora();
        }
        if (document.getElementById('modal-imagenes-bitacora').style.display === 'flex') {
            if (e.key === 'ArrowLeft')  lightboxBitAnterior();
            if (e.key === 'ArrowRight') lightboxBitSiguiente();
        }
    });
});
