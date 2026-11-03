/* lista_refacciones.js */

// ── Columnas ──────────────────────────────────────────────────────────────────
const INV_COLS = [
    'inv-col-item', 'inv-col-nombre', 'inv-col-categoria', 'inv-col-unidad',
    'inv-col-stock', 'inv-col-minimo', 'inv-col-maximo', 'inv-col-ubicacion', 
    'inv-col-proveedor', 'inv-col-costo', 'inv-col-descripcion',
    'inv-col-creado', 'inv-col-modificado'
];

const INV_OCULTAS_DEFAULT = ['inv-col-ubicacion', 'inv-col-proveedor', 'inv-col-costo', 'inv-col-creado', 'inv-col-modificado'];

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
function confirmarEliminarRefaccion(event, url) {
    document.getElementById('form-eliminar-refaccion').action = url;
    document.getElementById('elim-ref-volver').value = window.location.search;
    abrirModalConAnimacion('modal-eliminar-refaccion', event);
}

function cerrarModalEliminarRefaccion() {
    cerrarModalConAnimacion('modal-eliminar-refaccion');
}

document.getElementById('modal-eliminar-refaccion').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminarRefaccion();
});


// ── Modal eliminar TODAS las refacciones del área ─────────────────────────────
function confirmarEliminarTodasRefacciones(event, areaId, total){
    document.getElementById('input-area-eliminar-todas-refacciones').value = areaId;
    document.getElementById('texto-eliminar-todas-refacciones').textContent = `Esta acción no se puede deshacer. Se eliminarán las ${total} refacciones de esta área (las que tengan seguimientos de compra asociados no se podrán borrar). ¿Confirmas?`;
    abrirModalConAnimacion('modal-eliminar-todas-refacciones', event);
}


function cerrarModalEliminarTodasRefacciones(){
    cerrarModalConAnimacion('modal-eliminar-todas-refacciones');
}


document.getElementById('modal-eliminar-todas-refacciones').addEventListener('click', function(e) {
    if (e.target === this) cerrarModalEliminarTodasRefacciones();
})


document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        cerrarModalEliminarRefaccion();
        cerrarModalEliminarTodasRefacciones();
        cerrarModalRefaccion();
    }
});

// ── Modal nuevo/editar refacción ──────────────────────────────────────────────
function abrirModalRefaccion(event) {
    document.getElementById('modal-refaccion-titulo').textContent = 'Nueva refacción';
    document.getElementById('form-refaccion').action = '/inventario/nueva/';
    document.getElementById('ref-volver').value = window.location.search;
    document.getElementById('ref-no_item').value        = '';
    document.getElementById('ref-nombre').value         = '';
    document.getElementById('ref-area').value            = new URLSearchParams(window.location.search).get('area') || '';
    document.getElementById('ref-categoria').value       = '';
    document.getElementById('ref-unidad').value          = 'pza';
    document.getElementById('ref-criticidad').value      = 'no_critico';
    document.getElementById('ref-stock_actual').value    = 0;
    document.getElementById('ref-stock_minimo').value    = 0;
    document.getElementById('ref-stock_maximo').value    = 0;
    document.getElementById('ref-ubicacion').value       = '';
    document.getElementById('ref-proveedor').value       = '';
    document.getElementById('ref-costo_unitario').value  = '';
    document.getElementById('ref-descripcion').value     = '';
    document.getElementById('ref-descripcion-contador').textContent = '0/300';
    document.getElementById('ref-activo').checked        = true;
    abrirModalConAnimacion('modal-refaccion', event);

    refArchivosSeleccionados = [];
    document.getElementById('ref-input-imagenes').value = '';
    document.getElementById('ref-preview-imagenes').innerHTML = '';
    document.getElementById('ref-imagenes-existentes').innerHTML = '';
}

function editarRefaccion(event, id, noItem, nombre, areaId, categoriaId, unidad, criticidad, stockActual, stockMinimo, stockMaximo, ubicacion, proveedor, costoUnitario, descripcion, activo) {
    document.getElementById('modal-refaccion-titulo').textContent = 'Editar refacción';
    document.getElementById('form-refaccion').action = `/inventario/editar/${id}/`;
    document.getElementById('ref-volver').value = window.location.search;
    document.getElementById('ref-no_item').value         = noItem;
    document.getElementById('ref-nombre').value          = nombre;
    document.getElementById('ref-area').value            = areaId;
    document.getElementById('ref-categoria').value       = categoriaId || '';
    document.getElementById('ref-unidad').value          = unidad;
    document.getElementById('ref-criticidad').value      = criticidad;
    document.getElementById('ref-stock_actual').value    = stockActual;
    document.getElementById('ref-stock_minimo').value    = stockMinimo;
    document.getElementById('ref-stock_maximo').value    = stockMaximo;
    document.getElementById('ref-ubicacion').value       = ubicacion;
    document.getElementById('ref-proveedor').value       = proveedor;
    document.getElementById('ref-costo_unitario').value  = costoUnitario;
    document.getElementById('ref-descripcion').value     = descripcion;
    document.getElementById('ref-descripcion-contador').textContent = (descripcion || '').length + '/300';
    document.getElementById('ref-activo').checked        = activo;
    abrirModalConAnimacion('modal-refaccion', event);

    refArchivosSeleccionados = [];
    document.getElementById('ref-input-imagenes').value = '';
    document.getElementById('ref-preview-imagenes').innerHTML = '';
    refMostrarImagenesExistentes(id);
}

function cerrarModalRefaccion() {
    cerrarModalConAnimacion('modal-refaccion');
}

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
    zona.ondragleave = () => { zona.style.borderColor = '#d8d8e0'; };
    zona.ondrop = (e) => {
        e.preventDefault();
        zona.style.borderColor = '#d8d8e0';
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
let lightboxRefMeta = {};

function verImagenesRefaccion(event, refId, area, descripcion) {
    lightboxRefMeta = { area: area || '', nombre: descripcion || '' };
    const trigger = event ? { currentTarget: event.currentTarget } : null;
    fetch(`/inventario/${refId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            lightboxRefImagenes = data.imagenes;
            lightboxRefIndice   = 0;
            renderLightboxRef();
            abrirModalConAnimacion('modal-imagenes-ref', trigger);
        });
}

function renderLightboxRef() {
    if (!lightboxRefImagenes.length) return;

    // Imagen principal: skeleton + spinner mientras carga, fade-in al terminar
    // (mismo tratamiento que el lightbox de paros_app/lista_paros.js).
    const imgPrincipal = document.getElementById('lightbox-ref-img-principal');
    const skeleton      = document.getElementById('lightbox-ref-skeleton');
    imgPrincipal.style.opacity = '0';
    skeleton.style.display = 'block';
    imgPrincipal.onload = () => {
        imgPrincipal.style.transition = 'opacity .2s ease';
        imgPrincipal.style.opacity = '1';
        skeleton.style.display = 'none';
    };
    imgPrincipal.src = lightboxRefImagenes[lightboxRefIndice].url;

    document.getElementById('lightbox-ref-contador').textContent =
        CONTADOR_REF_TPL.replace('{n}', lightboxRefIndice + 1).replace('{total}', lightboxRefImagenes.length);

    document.getElementById('lightbox-ref-meta').innerHTML =
        [lightboxRefMeta.area, lightboxRefMeta.nombre].filter(Boolean).join('  -  ');

    const cont = document.getElementById('lightbox-ref-miniaturas');
    cont.innerHTML = '';
    lightboxRefImagenes.forEach((img, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'img-loading-wrap';
        wrap.style.cssText = 'width:52px; height:52px;';

        const thumbSkeleton = document.createElement('div');
        thumbSkeleton.className = 'img-skeleton';
        const thumbSpinner = document.createElement('div');
        thumbSpinner.className = 'img-spinner img-spinner-sm';
        thumbSkeleton.appendChild(thumbSpinner);
        wrap.appendChild(thumbSkeleton);

        const thumb = document.createElement('img');
        thumb.loading = 'lazy';
        thumb.src = img.url;
        thumb.onclick = () => { lightboxRefIndice = i; renderLightboxRef(); };
        thumb.onload = () => { thumb.style.opacity = '1'; thumbSkeleton.style.display = 'none'; };
        thumb.style.cssText = `
            width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer;
            border:2px solid ${i === lightboxRefIndice ? 'var(--indigo)' : 'transparent'};
            position:relative; opacity:0; transition:opacity .2s ease;
        `;
        wrap.appendChild(thumb);
        cont.appendChild(wrap);
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
    cerrarModalConAnimacion('modal-imagenes-ref');
}

document.getElementById('modal-imagenes-ref')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarModalImagenesRef();
});