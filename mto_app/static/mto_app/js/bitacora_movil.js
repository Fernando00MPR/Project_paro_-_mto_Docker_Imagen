/* bitacora_movil.js — Vista de celular (≤767px) de la Bitácora de mantenimiento.
   Reutiliza lo de bitacora.js: el modal/formulario de alta y edición
   (abrirModalBitacora, abrirModalEditar, previsualizarImagenesBitacora),
   la confirmación de eliminar y el visor de imágenes (_lightboxBit*). Las
   tarjetas llevan botones ocultos con el mismo onclick que la tabla de
   escritorio para Editar/Eliminar. */

(function () {
    const raiz = document.getElementById('bm-movil');
    if (!raiz) return;

    const BC = window.BITACORA_CFG || {};
    const T = (window.BITACORA_MOVIL || {}).i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const esMovil = () => window.matchMedia('(max-width: 767px)').matches;

    // ── Navegación con filtros (misma lógica de servidor que escritorio) ────
    function irCon(cambios) {
        const url = new URL(window.location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k]) url.searchParams.set(k, cambios[k]); else url.searchParams.delete(k);
        });
        url.searchParams.delete('page');
        window.location.href = url.toString();
    }

    const buscar = document.getElementById('bm-buscar');
    let tBuscar = null;
    buscar.addEventListener('input', () => {
        clearTimeout(tBuscar);
        tBuscar = setTimeout(() => {
            try { sessionStorage.setItem('bm-buscando', '1'); } catch (e) { /* sin storage */ }
            irCon({ q: buscar.value.trim() });
        }, 250);
    });
    // Tras recargar por la búsqueda, el cursor vuelve al campo para seguir escribiendo.
    try {
        if (sessionStorage.getItem('bm-buscando') === '1' && esMovil()) {
            sessionStorage.removeItem('bm-buscando');
            buscar.focus();
            const n = buscar.value.length;
            buscar.setSelectionRange(n, n);
        }
    } catch (e) { /* sin storage */ }

    window.bmQuitarFecha = () => irCon({ fecha: '' });

    // ── Hojas inferiores ────────────────────────────────────────────────────
    let trap = null, disparador = null, hojaAbierta = null;

    function abrirHoja(id, event) {
        if (hojaAbierta) cerrarHoja(hojaAbierta, false);
        const modal = document.getElementById(id);
        disparador = (event && event.currentTarget) || document.activeElement;
        abrirModalConAnimacion(modal, event);
        hojaAbierta = id;
        const box = modal.querySelector('.modal-box');
        trap = function (e) {
            if (e.key === 'Escape') { cerrarHoja(id); return; }
            if (e.key !== 'Tab') return;
            const f = Array.from(box.querySelectorAll('button, a[href], input, select'))
                .filter(el => !el.hidden && !el.disabled && el.offsetParent !== null);
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        };
        document.addEventListener('keydown', trap);
    }

    function cerrarHoja(id, devolverFoco = true) {
        if (hojaAbierta !== id) return;
        cerrarModalConAnimacion(id);
        hojaAbierta = null;
        if (trap) document.removeEventListener('keydown', trap);
        trap = null;
        if (devolverFoco && disparador && document.body.contains(disparador)) disparador.focus();
        disparador = null;
    }
    window.bmCerrarHoja = cerrarHoja;

    document.querySelectorAll('.bm-hoja').forEach(hoja => {
        hoja.addEventListener('click', e => { if (e.target === hoja) cerrarHoja(hoja.id); });
    });
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) {
            e.target.style.animation = 'none';
        }
    });

    window.bmAbrirFecha = e => abrirHoja('bm-sheet-fecha', e);
    window.bmAplicarFecha = function () {
        const v = document.querySelector('#dp-bm-fecha .dp-value').value;
        cerrarHoja('bm-sheet-fecha', false);
        irCon({ fecha: v });
    };

    // ── Tarjetas: ⋮, detalle, fotos ─────────────────────────────────────────
    let cardActual = null;
    const lista = document.getElementById('bm-lista');

    lista.addEventListener('click', e => {
        const card = e.target.closest('.bm-card');
        if (!card) return;
        if (e.target.closest('.bm-mas')) { abrirAcciones(card, e); return; }
        if (e.target.closest('.bm-fotos')) { verImagenesBitacora(e, parseInt(card.dataset.id, 10)); return; }
        if (e.target.closest('.bm-ver, .bm-cuerpo')) abrirDetalle(card, e);
    });
    lista.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bm-cuerpo')) {
            e.preventDefault();
            abrirDetalle(e.target.closest('.bm-card'), e);
        }
    });

    function abrirAcciones(card, event) {
        cardActual = card;
        document.getElementById('bm-acc-titulo').textContent =
            card.querySelector('.bm-equipo').textContent + ' · ' + card.dataset.fecha;
        document.getElementById('bm-acc-editar').hidden = !card.querySelector('.bm-accion-editar');
        document.getElementById('bm-acc-eliminar').hidden = !card.querySelector('.bm-accion-eliminar');
        abrirHoja('bm-sheet-acciones', { currentTarget: event.target.closest('.bm-mas') });
    }

    function disparar(selector, hoja) {
        const btn = cardActual && cardActual.querySelector(selector);
        cerrarHoja(hoja, false);
        if (btn) btn.click();
    }
    window.bmEditar = hoja => disparar('.bm-accion-editar', hoja);
    window.bmEliminar = hoja => disparar('.bm-accion-eliminar', hoja);

    function abrirDetalle(card, event) {
        cardActual = card;
        const pend = card.querySelector('.bm-pend p');
        document.getElementById('bm-det-fecha').textContent = card.dataset.fecha + ' · ' + t('sem', { n: card.dataset.sem });
        const est = document.getElementById('bm-det-estado');
        est.className = 'bm-estado ' + (pend ? 'pend' : 'cerr');
        est.textContent = pend ? t('conPendiente') : t('cerrado');
        document.getElementById('bm-det-equipo').textContent = card.querySelector('.bm-equipo').textContent;
        document.getElementById('bm-det-resp').textContent = card.querySelector('.bm-resp').textContent;
        document.getElementById('bm-det-act').textContent = card.querySelector('.bm-act').textContent;
        const cajaPend = document.getElementById('bm-det-pend');
        cajaPend.hidden = !pend;
        document.getElementById('bm-det-pend-txt').textContent = pend ? pend.textContent : '';
        document.getElementById('bm-det-editar').hidden = !card.querySelector('.bm-accion-editar');
        document.getElementById('bm-det-eliminar').hidden = !card.querySelector('.bm-accion-eliminar');

        const gal = document.getElementById('bm-det-galeria');
        gal.replaceChildren();
        gal.style.display = +card.dataset.nfotos ? '' : 'none';
        if (+card.dataset.nfotos) {
            const id = card.dataset.id;
            fetch(`${BC.urlImagenesBase}${id}/imagenes/`)
                .then(r => r.json())
                .then(data => {
                    if (cardActual !== card) return;
                    const imgs = data.imagenes || [];
                    imgs.forEach((im, i) => {
                        const b = document.createElement('button');
                        b.type = 'button';
                        b.setAttribute('aria-label', t('verFoto', { n: i + 1 }));
                        const img = document.createElement('img');
                        img.src = im.url; img.alt = ''; img.loading = 'lazy';
                        b.appendChild(img);
                        b.addEventListener('click', ev => {
                            // Mismo visor de escritorio, abierto en la foto tocada.
                            _lightboxBitImagenes = imgs;
                            _lightboxBitIndice = i;
                            _renderLightboxBit();
                            abrirModalConAnimacion('modal-imagenes-bitacora', ev);
                        });
                        gal.appendChild(b);
                    });
                })
                .catch(() => {});
        }
        abrirHoja('bm-sheet-detalle', { currentTarget: event.target.closest('button, .bm-cuerpo') });
    }

    // ── Cargar más ──────────────────────────────────────────────────────────
    const btnMas = document.getElementById('bm-cargar-mas');
    if (btnMas) {
        // "Cargar {n} más": n = lo que trae la siguiente página (o lo que queda).
        const etiquetar = () => {
            const n = Math.min(+btnMas.dataset.perPage, +btnMas.dataset.total - +btnMas.dataset.fin);
            btnMas.textContent = t('cargarN', { n });
        };
        etiquetar();
        btnMas.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('page', btnMas.dataset.next);
            btnMas.disabled = true;
            fetch(url.toString())
                .then(r => r.text())
                .then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    doc.querySelectorAll('#bm-lista .bm-card').forEach(c => lista.appendChild(c));
                    const nuevo = doc.getElementById('bm-cargar-mas');
                    if (nuevo) {
                        btnMas.dataset.next = nuevo.dataset.next;
                        btnMas.dataset.fin = nuevo.dataset.fin;
                        etiquetar();
                        btnMas.disabled = false;
                    } else {
                        btnMas.remove();
                    }
                })
                .catch(() => { btnMas.disabled = false; showToast({ title: t('errorCargar'), description: window.TXT_REVISA_CONEXION }, 'error'); });
        });
    }

    // ── Formulario (#modal-bitacora) en celular ─────────────────────────────
    const form = document.getElementById('form-bitacora');
    if (!form) return;
    const sw = document.getElementById('bm-switch-pend');
    const campoPend = document.querySelector('.bm-pend-field');
    const txtPend = document.getElementById('bit-pendiente');
    const selArea = document.getElementById('bit-area');
    let sucio = false;

    function fijarSwitch(on) {
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        campoPend.dataset.pend = on ? 'on' : 'off';
    }
    sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-checked') !== 'true';
        fijarSwitch(on);
        sucio = true;
        if (on) txtPend.focus();
    });

    function semanaIso(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.split('-').map(Number);
        const f = new Date(Date.UTC(y, m - 1, d));
        const dia = f.getUTCDay() || 7;
        f.setUTCDate(f.getUTCDate() + 4 - dia);
        const ini = new Date(Date.UTC(f.getUTCFullYear(), 0, 1));
        return Math.ceil(((f - ini) / 86400000 + 1) / 7);
    }
    const fechaHidden = document.querySelector('#dp-bit-fecha .dp-value');
    const pintarSemana = () => { document.getElementById('bm-semana').textContent = semanaIso(fechaHidden.value); };
    fechaHidden.addEventListener('change', pintarSemana);

    const pintarArea = () => {
        const op = selArea && selArea.options[selArea.selectedIndex];
        document.getElementById('bm-form-area').textContent = op ? op.text.trim() : '';
    };
    if (selArea) selArea.addEventListener('change', pintarArea);

    function alAbrirForm() {
        fijarSwitch(!!txtPend.value.trim());
        pintarSemana();
        pintarArea();
        estadoFotos();
        const btn = form.querySelector('.form-actions .btn-primary');
        btn.disabled = false;
        btn.innerHTML = btn.dataset.textoOriginal || btn.innerHTML;
        setTimeout(() => { sucio = false; }, 0);   // ignora los 'change' que dispara la carga de datos
    }
    let modoForm = 'nuevo';   // 'nuevo' | 'editar' — cambia los textos de la hoja de salida
    const origNuevo = window.abrirModalBitacora;
    window.abrirModalBitacora = function () { modoForm = 'nuevo'; origNuevo.apply(this, arguments); alAbrirForm(); };
    const origEditar = window.abrirModalEditar;
    window.abrirModalEditar = function () { modoForm = 'editar'; origEditar.apply(this, arguments); alAbrirForm(); };

    form.addEventListener('input', () => { sucio = true; });
    form.addEventListener('change', () => { sucio = true; });

    // ✕ / Escape con cambios sin guardar → hoja "¿Salir sin guardar?" (solo en celular).
    const origCerrar = window.cerrarModalBitacora;
    window.cerrarModalBitacora = function (e) {
        const abierto = document.getElementById('modal-bitacora').style.display === 'flex';
        if (hojaAbierta === 'bm-sheet-salir') return;   // el Escape de bitacora.js mientras la hoja está abierta
        if (abierto && sucio && esMovil()) { abrirSalir(e); return; }
        origCerrar.apply(this, arguments);
    };

    function abrirSalir(event) {
        const p = modoForm === 'editar' ? 'salirEditar' : 'salirNuevo';
        document.getElementById('bm-salir-titulo').textContent = t(p + 'Titulo');
        document.getElementById('bm-salir-texto').textContent = t(p + 'Texto');
        document.getElementById('bm-salir-seguir').textContent = t(p + 'Seguir');
        document.getElementById('bm-salir-descartar').textContent = t(p + 'Descartar');
        abrirHoja('bm-sheet-salir', event && event.currentTarget ? event : { currentTarget: document.querySelector('.bm-form-head > button') });
        setTimeout(() => document.getElementById('bm-salir-seguir').focus(), 50);   // la opción segura primero
    }
    window.bmSalirSeguir = () => cerrarHoja('bm-sheet-salir');
    window.bmSalirDescartar = function () {
        cerrarHoja('bm-sheet-salir', false);
        sucio = false;
        origCerrar();
    };

    form.addEventListener('submit', e => {
        if (e.defaultPrevented || !esMovil()) return;   // bitacora.js ya lo detuvo (sin fecha) o es escritorio
        if (sw.getAttribute('aria-checked') !== 'true') txtPend.value = '';   // apagado = registro cerrado
        const btn = form.querySelector('.form-actions .btn-primary');
        btn.dataset.textoOriginal = btn.dataset.textoOriginal || btn.innerHTML;
        btn.innerHTML = '<span class="bm-spinner"></span>' + t('guardando');
        setTimeout(() => { btn.disabled = true; }, 0);   // después de que el navegador tome el submit
        sucio = false;
    });

    // ── Fotos: cámara / galería con compresión ──────────────────────────────
    function comprimir(file) {
        return new Promise(resolve => {
            if (!file.type.startsWith('image/')) { resolve(file); return; }
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const lado = Math.max(img.naturalWidth, img.naturalHeight);
                const k = lado > 1600 ? 1600 / lado : 1;
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * k);
                c.height = Math.round(img.naturalHeight * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                c.toBlob(blob => {
                    if (!blob || blob.size >= file.size) { resolve(file); return; }
                    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                    resolve(new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.8);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };   // p. ej. HEIC: se sube tal cual
            img.src = url;
        });
    }

    window.bmAgregarFotos = async function (input) {
        const archivos = Array.from(input.files || []);
        input.value = '';
        if (!archivos.length) return;
        const listos = await Promise.all(archivos.map(comprimir));
        // Misma función de escritorio: valida el máximo, guarda y pinta miniaturas.
        previsualizarImagenesBitacora({ files: listos, value: '' });
        sucio = true;
    };

    function estadoFotos() {
        const total = _bitImagenesExistentes.length + _bitArchivosSeleccionados.length;
        document.querySelectorAll('.bm-foto-btn').forEach(b => b.classList.toggle('lleno', total >= (BC.maxImagenes || 2)));
    }
    ['bit-preview-imagenes', 'bit-imagenes-existentes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) new MutationObserver(estadoFotos).observe(el, { childList: true });
    });
})();

// Visor de fotos: deslizar a la izquierda / derecha cambia de foto
// (lightboxBitSiguiente/Anterior y _lightboxBitImagenes vienen de bitacora.js).
(function () {
    const img = document.getElementById('lightbox-bit-img-principal');
    const zona = img && img.parentElement;
    if (!zona) return;
    let x0 = null, y0 = 0;
    zona.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    zona.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (_lightboxBitImagenes.length > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) lightboxBitSiguiente(); else lightboxBitAnterior();
        }
    });
})();
