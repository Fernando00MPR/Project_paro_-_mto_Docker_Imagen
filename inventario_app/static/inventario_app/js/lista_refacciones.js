/* lista_refacciones.js */

// ── Columnas ──────────────────────────────────────────────────────────────────
const INV_COLS = [
    'inv-col-item', 'inv-col-nombre', 'inv-col-categoria', 'inv-col-unidad',
    'inv-col-stock', 'inv-col-minimo', 'inv-col-ubicacion', 'inv-col-proveedor', 
    'inv-col-costo', 'inv-col-creado', 'inv-col-modificado'
];

const INV_OCULTAS_DEFAULT = [
    'inv-col-proveedor', 'inv-col-costo',
    'inv-col-creado', 'inv-col-modificado'
];

function toggleInvCol(cls, visible) {
    document.querySelectorAll('.' + cls).forEach(el => {
        el.style.display = visible ? '' : 'none';
    });
    const prefs = JSON.parse(localStorage.getItem('inv_cols') || '{}');
    prefs[cls] = visible;
    localStorage.setItem('inv_cols', JSON.stringify(prefs));
}

function toggleInvColPicker() {
    const p = document.getElementById('inv-col-picker');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', function(e) {
    const wrap = document.getElementById('inv-col-picker-wrap');
    if (wrap && !wrap.contains(e.target)) {
        document.getElementById('inv-col-picker').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.inv-col-toggle').forEach(el => {
        el.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-2);';
        el.querySelector('input').style.accentColor = 'var(--indigo)';
    });

    const prefs = JSON.parse(localStorage.getItem('inv_cols') || '{}');
    INV_COLS.forEach(cls => {
        const guardado = prefs[cls];
        let visible;
        if (guardado === true)       visible = true;
        else if (guardado === false) visible = false;
        else                         visible = !INV_OCULTAS_DEFAULT.includes(cls);

        toggleInvCol(cls, visible);
        const input = document.querySelector('[data-col="' + cls + '"] input');
        if (input) input.checked = visible;
    });
});

// ── Modal eliminar ────────────────────────────────────────────────────────────
function confirmarEliminarRefaccion(url) {
    document.getElementById('form-eliminar-refaccion').action = url;
    document.getElementById('modal-eliminar-refaccion').style.display = 'flex';
}

function cerrarModalEliminarRefaccion() {
    document.getElementById('modal-eliminar-refaccion').style.display = 'none';
}

document.getElementById('modal-eliminar-refaccion').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminarRefaccion();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModalEliminarRefaccion();
        cerrarModalRefaccion();
    }
});

// ── Modal nuevo/editar refacción ──────────────────────────────────────────────
function abrirModalRefaccion() {
    document.getElementById('modal-refaccion-titulo').textContent = 'Nueva refacción';
    document.getElementById('form-refaccion').action = '/inventario/nueva/';
    document.getElementById('ref-no_item').value        = '';
    document.getElementById('ref-nombre').value         = '';
    document.getElementById('ref-area').value            = new URLSearchParams(window.location.search).get('area') || '';
    document.getElementById('ref-categoria').value       = '';
    document.getElementById('ref-unidad').value          = 'pza';
    document.getElementById('ref-stock_actual').value    = 0;
    document.getElementById('ref-stock_minimo').value    = 0;
    document.getElementById('ref-ubicacion').value       = '';
    document.getElementById('ref-proveedor').value       = '';
    document.getElementById('ref-costo_unitario').value  = '';
    document.getElementById('ref-descripcion').value     = '';
    document.getElementById('ref-activo').checked        = true;
    document.getElementById('modal-refaccion').style.display = 'flex';

    refArchivosSeleccionados = [];
    document.getElementById('ref-input-imagenes').value = '';
    document.getElementById('ref-preview-imagenes').innerHTML = '';
    document.getElementById('ref-imagenes-existentes').innerHTML = '';
}

function editarRefaccion(id, noItem, nombre, areaId, categoriaId, unidad, stockActual, stockMinimo, ubicacion, proveedor, costoUnitario, descripcion, activo) {
    document.getElementById('modal-refaccion-titulo').textContent = 'Editar refacción';
    document.getElementById('form-refaccion').action = `/inventario/editar/${id}/`;
    document.getElementById('ref-no_item').value         = noItem;
    document.getElementById('ref-nombre').value          = nombre;
    document.getElementById('ref-area').value            = areaId;
    document.getElementById('ref-categoria').value       = categoriaId || '';
    document.getElementById('ref-unidad').value          = unidad;
    document.getElementById('ref-stock_actual').value    = stockActual;
    document.getElementById('ref-stock_minimo').value    = stockMinimo;
    document.getElementById('ref-ubicacion').value       = ubicacion;
    document.getElementById('ref-proveedor').value       = proveedor;
    document.getElementById('ref-costo_unitario').value  = costoUnitario;
    document.getElementById('ref-descripcion').value     = descripcion;
    document.getElementById('ref-activo').checked        = activo;
    document.getElementById('modal-refaccion').style.display = 'flex';

    refArchivosSeleccionados = [];
    document.getElementById('ref-input-imagenes').value = '';
    document.getElementById('ref-preview-imagenes').innerHTML = '';
    refMostrarImagenesExistentes(id);
}

function cerrarModalRefaccion() {
    document.getElementById('modal-refaccion').style.display = 'none';
}

document.getElementById('modal-refaccion').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalRefaccion();
});

// ── Imágenes en modal crear/editar (solo preview local, se suben con el form) ─
let refArchivosSeleccionados = [];
let refImagenesExistentes    = [];

function refInicializarDropzone() {
    const zona  = document.getElementById('ref-dropzone');
    const input = document.getElementById('ref-input-imagenes');
    if (!zona) return;

    zona.onclick = () => input.click();
    input.onchange = () => {
        refArchivosSeleccionados = Array.from(input.files);
        refRenderPreview();
    };

    zona.ondragover  = (e) => { e.preventDefault(); zona.style.borderColor = 'var(--indigo)'; };
    zona.ondragleave = () => { zona.style.borderColor = 'var(--border)'; };
    zona.ondrop = (e) => {
        e.preventDefault();
        zona.style.borderColor = 'var(--border)';
        const archivos = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        // Sincroniza con el input real para que viaje en el submit del form
        const dt = new DataTransfer();
        archivos.forEach(f => dt.items.add(f));
        input.files = dt.files;
        refArchivosSeleccionados = archivos;
        refRenderPreview();
    };
}

function refRenderPreview() {
    const cont = document.getElementById('ref-preview-imagenes');
    cont.innerHTML = '';
    refArchivosSeleccionados.forEach(file => {
        const reader = new FileReader();
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:60px; height:60px;';
        cont.appendChild(wrap);
        reader.onload = (e) => {
            wrap.innerHTML = `<img src="${e.target.result}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">`;
        };
        reader.readAsDataURL(file);
    });
}

function refMostrarImagenesExistentes(refId) {
    const cont = document.getElementById('ref-imagenes-existentes');
    cont.innerHTML = '';
    if (!refId) return;

    fetch(`/inventario/${refId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            refImagenesExistentes = data.imagenes;
            data.imagenes.forEach(img => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative; width:60px; height:60px;';
                wrap.innerHTML = `
                    <img src="${img.url}" style="width:60px; height:60px; object-fit:cover; border-radius:6px; border:1px solid var(--border);">
                    <button type="button" onclick="refEliminarImagenExistente(${img.id}, this)"
                            style="position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%;
                                   background:#EF4444; color:#fff; border:none; cursor:pointer; font-size:11px; line-height:1;">✕</button>
                `;
                cont.appendChild(wrap);
            });
        });
}

function refEliminarImagenExistente(imagenId, btn) {
    const csrf = document.querySelector('#form-refaccion [name=csrfmiddlewaretoken]').value;
    fetch(`/inventario/imagen/eliminar/${imagenId}/`, {
        method: 'POST',
        headers: {'X-CSRFToken': csrf},
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) btn.closest('div').remove();
    });
}

document.addEventListener('DOMContentLoaded', refInicializarDropzone);

// ── Lightbox de imágenes de refacción ─────────────────────────────────────────
let lightboxRefImagenes = [];
let lightboxRefIndice   = 0;

function verImagenesRefaccion(refId) {
    fetch(`/inventario/${refId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            lightboxRefImagenes = data.imagenes;
            lightboxRefIndice   = 0;
            renderLightboxRef();
            document.getElementById('modal-imagenes-ref').style.display = 'flex';
        });
}

function renderLightboxRef() {
    if (!lightboxRefImagenes.length) return;
    document.getElementById('lightbox-ref-img-principal').src = lightboxRefImagenes[lightboxRefIndice].url;

    const cont = document.getElementById('lightbox-ref-miniaturas');
    cont.innerHTML = '';
    lightboxRefImagenes.forEach((img, i) => {
        const thumb = document.createElement('img');
        thumb.src = img.url;
        thumb.onclick = () => { lightboxRefIndice = i; renderLightboxRef(); };
        thumb.style.cssText = `
            width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer;
            border:2px solid ${i === lightboxRefIndice ? 'var(--indigo)' : 'transparent'};
        `;
        cont.appendChild(thumb);
    });
}

function lightboxRefAnterior() {
    lightboxRefIndice = (lightboxRefIndice - 1 + lightboxRefImagenes.length) % lightboxRefImagenes.length;
    renderLightboxRef();
}

function lightboxRefSiguiente() {
    lightboxRefIndice = (lightboxRefIndice + 1) % lightboxRefImagenes.length;
    renderLightboxRef();
}

function descargarImagenRefActual() {
    const img = lightboxRefImagenes[lightboxRefIndice];
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function cerrarModalImagenesRef() {
    document.getElementById('modal-imagenes-ref').style.display = 'none';
}

document.getElementById('modal-imagenes-ref')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarModalImagenesRef();
});