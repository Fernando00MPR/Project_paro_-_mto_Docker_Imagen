/* documentacion.js */

const docCfg = window.DOC_CFG || {};

// ── Modal nueva categoría ─────────────────────────────────────────────────────

function abrirModalCategoria() {
    document.getElementById('modal-categoria').style.display = 'flex';
}

function cerrarModalCategoria() {
    document.getElementById('modal-categoria').style.display = 'none';
}

// ── Modal subir documento ─────────────────────────────────────────────────────

function abrirModalSubir(categoriaId, categoriaNombre) {
    document.getElementById('form-subir').action = `${docCfg.urlSubirBase}${categoriaId}/subir/`;
    document.getElementById('modal-subir-categoria').textContent = categoriaNombre;
    document.getElementById('form-subir').reset();
    document.getElementById('doc-zona-texto').textContent = 'Haz clic para seleccionar un archivo';
    document.getElementById('modal-subir').style.display = 'flex';
}

function cerrarModalSubir() {
    document.getElementById('modal-subir').style.display = 'none';
}

// ── Modal confirmar eliminar (categoría o documento) ──────────────────────────

function confirmarEliminarCategoria(catId, nombre, totalDocs) {
    document.getElementById('titulo-eliminar-doc').textContent = 'Eliminar categoría';
    document.getElementById('texto-eliminar-doc').textContent = totalDocs > 0
        ? `¿Eliminar la categoría "${nombre}" y sus ${totalDocs} documento(s)? Esta acción no se puede deshacer.`
        : `¿Eliminar la categoría "${nombre}"?`;
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarCatBase}${catId}/eliminar/`;
    document.getElementById('modal-eliminar-doc').style.display = 'flex';
}

function confirmarEliminarDocumento(docId, nombre) {
    document.getElementById('titulo-eliminar-doc').textContent = 'Eliminar documento';
    document.getElementById('texto-eliminar-doc').textContent = `¿Eliminar el documento "${nombre}"?`;
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarDocBase}${docId}/eliminar/`;
    document.getElementById('modal-eliminar-doc').style.display = 'flex';
}

function cerrarModalEliminarDoc() {
    document.getElementById('modal-eliminar-doc').style.display = 'none';
}

// ── Modal ver PDF ──────────────────────────────────────────────────────────────

function verPdf(url, nombre) {
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
    
    document.getElementById('modal-pdf').style.display = 'flex';
}

function cerrarModalPdf() {
    document.getElementById('modal-pdf').style.display = 'none';
    document.getElementById('iframe-pdf').src = 'about:blank';
}

// ── Modal ver imagen ─────────────────────────────────────────────────────────

function verImagen(url, nombre, subidoEn) {
    document.getElementById('titulo-imagen').textContent = nombre;
    document.getElementById('fecha-imagen').textContent = subidoEn ? `Subido el ${subidoEn}` : '';
    document.getElementById('img-visor').src = url;
    document.getElementById('descargar-imagen').href = url;
    document.getElementById('modal-imagen').style.display = 'flex';
}

function cerrarModalImagen() {
    document.getElementById('modal-imagen').style.display = 'none';
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
    ['modal-categoria', 'modal-subir', 'modal-eliminar-doc', 'modal-pdf', 'modal-imagen'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) modal.style.display = 'none';
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
