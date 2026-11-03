/* lista_seguimientos.js — solo el visor (lightbox) de imágenes de seguimientos.
   Lo usan la tabla de escritorio (seguimientos_escritorio.js) y la vista de celular
   (seguimientos_movil.js llama a verImagenesSeg). Define CONTADOR_SEG_TPL en el template. */

// ── Lightbox de imágenes de seguimiento ───────────────────────────────────────
let lightboxSegImagenes = [];
let lightboxSegIndice   = 0;
let lightboxSegMeta     = {};

function verImagenesSeg(event, tipo, segId, fecha, area, estatus, estatusLabel) {
    lightboxSegMeta = { fecha: fecha || '', area: area || '', estatus: estatus || '', label: estatusLabel || '' };
    const trigger = event ? { currentTarget: event.currentTarget } : null;
    fetch(`/mto/seguimiento/${tipo}/${segId}/imagenes/`)
        .then(r => r.json())
        .then(data => {
            lightboxSegImagenes = data.imagenes;
            lightboxSegIndice   = 0;
            renderLightboxSeg();
            abrirModalConAnimacion('modal-imagenes-seg', trigger);
        });
}

function renderLightboxSeg() {
    if (!lightboxSegImagenes.length) return;

    // Imagen principal: skeleton + spinner mientras carga, fade-in al terminar
    // (mismo tratamiento que el lightbox de paros_app/lista_paros.js).
    const imgPrincipal = document.getElementById('lightbox-seg-img-principal');
    const skeleton      = document.getElementById('lightbox-seg-skeleton');
    imgPrincipal.style.opacity = '0';
    skeleton.style.display = 'block';
    imgPrincipal.onload = () => {
        imgPrincipal.style.transition = 'opacity .2s ease';
        imgPrincipal.style.opacity = '1';
        skeleton.style.display = 'none';
    };
    imgPrincipal.src = lightboxSegImagenes[lightboxSegIndice].url;

    // Contador
    document.getElementById('lightbox-seg-contador').textContent =
        CONTADOR_SEG_TPL.replace('{n}', lightboxSegIndice + 1).replace('{total}', lightboxSegImagenes.length);

    // Meta: fecha, área, estatus
    const estilosBadge = {
        pendiente:  { bg:'#FAEEDA', color:'#854F0B' },
        en_proceso: { bg:'#E6F1FB', color:'#185FA5' },
        completado: { bg:'#EAF3DE', color:'#3B6D11' },
    };
    const est = estilosBadge[lightboxSegMeta.estatus] || { bg:'', color:'' };
    const badge = lightboxSegMeta.label
        ? ` &nbsp;<span style="display:inline-flex;align-items:center;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${est.bg};color:${est.color};">&#11044; ${lightboxSegMeta.label}</span>`
        : '';
    document.getElementById('lightbox-seg-meta').innerHTML =
        [lightboxSegMeta.area, lightboxSegMeta.fecha].filter(Boolean).join('  -  ') + badge;

    const cont = document.getElementById('lightbox-seg-miniaturas');
    cont.innerHTML = '';
    lightboxSegImagenes.forEach((img, i) => {
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
        thumb.onclick = () => { lightboxSegIndice = i; renderLightboxSeg(); };
        thumb.onload = () => { thumb.style.opacity = '1'; thumbSkeleton.style.display = 'none'; };
        thumb.style.cssText = `
            width:52px; height:52px; object-fit:cover; border-radius:8px; cursor:pointer;
            border:2px solid ${i === lightboxSegIndice ? 'var(--indigo)' : 'transparent'};
            position:relative; opacity:0; transition:opacity .2s ease;
        `;
        wrap.appendChild(thumb);
        cont.appendChild(wrap);
    });
}

function lightboxSegAnterior() {
    lightboxSegIndice = (lightboxSegIndice - 1 + lightboxSegImagenes.length) % lightboxSegImagenes.length;
    renderLightboxSeg();
}

function lightboxSegSiguiente() {
    lightboxSegIndice = (lightboxSegIndice + 1) % lightboxSegImagenes.length;
    renderLightboxSeg();
}

function descargarImagenSegActual() {
    const img = lightboxSegImagenes[lightboxSegIndice];
    const a = document.createElement('a');
    a.href = img.url;
    a.download = img.url.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function cerrarModalImagenesSeg() {
    cerrarModalConAnimacion('modal-imagenes-seg');
}

document.getElementById('modal-imagenes-seg')?.addEventListener('click', function(e) {
    if (e.target === this) cerrarModalImagenesSeg();
});

document.addEventListener('keydown', function(e) {
    if (document.getElementById('modal-imagenes-seg')?.style.display === 'flex') {
        if (e.key === 'ArrowLeft')  lightboxSegAnterior();
        if (e.key === 'ArrowRight') lightboxSegSiguiente();
        if (e.key === 'Escape')     cerrarModalImagenesSeg();
    }
});
