/* documentacion.js */

const docCfg = window.DOC_CFG || {};

// ── Modal nueva categoría ─────────────────────────────────────────────────────

function abrirModalCategoria(event) {
    abrirModalConAnimacion('modal-categoria', event);
}

function cerrarModalCategoria() {
    cerrarModalConAnimacion('modal-categoria');
}

// ── Modal subir documento ─────────────────────────────────────────────────────

function abrirModalSubir(event, categoriaId, categoriaNombre) {
    document.getElementById('form-subir').action = `${docCfg.urlSubirBase}${categoriaId}/subir/`;
    document.getElementById('modal-subir-categoria').textContent = categoriaNombre;
    document.getElementById('form-subir').reset();
    document.getElementById('doc-zona-texto').textContent = 'Haz clic para seleccionar un archivo';
    abrirModalConAnimacion('modal-subir', event);
}

function cerrarModalSubir() {
    cerrarModalConAnimacion('modal-subir');
}

// ── Modal confirmar eliminar (categoría o documento) ──────────────────────────

function confirmarEliminarCategoria(event, catId, nombre, totalDocs) {
    document.getElementById('titulo-eliminar-doc').textContent = 'Eliminar categoría';
    document.getElementById('texto-eliminar-doc').textContent = totalDocs > 0
        ? `¿Eliminar la categoría "${nombre}" y sus ${totalDocs} documento(s)? Esta acción no se puede deshacer.`
        : `¿Eliminar la categoría "${nombre}"?`;
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarCatBase}${catId}/eliminar/`;
    abrirModalConAnimacion('modal-eliminar-doc', event);
}

function confirmarEliminarDocumento(event, docId, nombre) {
    document.getElementById('titulo-eliminar-doc').textContent = 'Eliminar documento';
    document.getElementById('texto-eliminar-doc').textContent = `¿Eliminar el documento "${nombre}"?`;
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarDocBase}${docId}/eliminar/`;
    abrirModalConAnimacion('modal-eliminar-doc', event);
}

function cerrarModalEliminarDoc() {
    cerrarModalConAnimacion('modal-eliminar-doc');
}

// ── Modal ver PDF ──────────────────────────────────────────────────────────────

function verPdf(event, url, nombre) {
    document.getElementById('titulo-pdf').textContent = nombre;

    const iframe   = document.getElementById('iframe-pdf');
    const skeleton = document.getElementById('pdf-skeleton');
    iframe.style.opacity   = '0';
    skeleton.style.display = 'block';
    iframe.onload = () => {
        iframe.style.transition = 'opacity .2s ease';
        iframe.style.opacity    = '1';
        skeleton.style.display  = 'none';
    };
    iframe.src = url;

    abrirModalConAnimacion('modal-pdf', event);
}

function cerrarModalPdf() {
    cerrarModalConAnimacion('modal-pdf');
    document.getElementById('iframe-pdf').src = 'about:blank';
}

// ── Modal ver imagen ─────────────────────────────────────────────────────────

function verImagen(event, url, nombre, subidoEn) {
    document.getElementById('titulo-imagen').textContent = nombre;
    document.getElementById('fecha-imagen').textContent = subidoEn ? `Subido el ${subidoEn}` : '';


    document.getElementById('descargar-imagen').href = url;

    const img      = document.getElementById('img-visor');
    const skeleton = document.getElementById('imagen-skeleton');
    img.style.opacity      = '0';
    skeleton.style.display = 'block';
    img.onload = () => {
        img.style.transition = 'opacity .2s ease';
        img.style.opacity    = '1';
        skeleton.style.display = 'none';
    };
    img.src = url;

    abrirModalConAnimacion('modal-imagen', event);
}

function cerrarModalImagen() {
    cerrarModalConAnimacion('modal-imagen');
    document.getElementById('img-visor').src = '';
}

function previsualizarArchivoDoc(input) {
    const zonaTexto = document.getElementById('doc-zona-texto');
    if (input.files && input.files[0]) {
        zonaTexto.textContent = input.files[0].name;
    } else {
        zonaTexto.textContent = 'Haz clic para seleccionar un archivo';
    }
}

// ── Cerrar con backdrop y ESC ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const cerrarPorId = {
        'modal-eliminar-doc': cerrarModalEliminarDoc,
        'modal-pdf':          cerrarModalPdf,
        'modal-imagen':       cerrarModalImagen,
    };
    Object.entries(cerrarPorId).forEach(([id, cerrar]) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) cerrar();
            });
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarModalCategoria();
            cerrarModalSubir();
            cerrarModalEliminarDoc();
            cerrarModalPdf();
            cerrarModalImagen();
        }
    });
});
