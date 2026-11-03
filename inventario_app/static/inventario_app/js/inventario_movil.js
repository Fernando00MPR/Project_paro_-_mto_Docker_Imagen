/* inventario_movil.js — Vista de celular (≤767px) de Inventario de refacciones:
   lista (lista_refacciones.html) y detalle (detalle_refaccion.html).
   Reutiliza lista_refacciones.js: abrirModalRefaccion / editarRefaccion,
   confirmarEliminarRefaccion y el visor verImagenesRefaccion. */

(function () {
    const C = window.IV_CFG || {};
    const T = C.i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const $ = id => document.getElementById(id);
    const CSRF = (document.cookie.split(';').find(s => s.trim().startsWith('csrftoken=')) || '').trim().split('=')[1] || '';
    const aviso = (msg, tipo) => { if (typeof showToast === 'function') showToast(msg, tipo || 'success'); };
    const normalizar = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    const post = (url, datos) => fetch(url, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF, 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(datos).toString(),
    }).then(r => r.json().then(data => { if (!r.ok || !data.ok) throw new Error(data.error || ''); return data; }));

    function urlCon(cambios) {
        const url = new URL(window.location.href);
        Object.keys(cambios).forEach(k => { if (cambios[k]) url.searchParams.set(k, cambios[k]); else url.searchParams.delete(k); });
        url.searchParams.delete('page');
        return url;
    }
    const irCon = cambios => { window.location.href = urlCon(cambios).toString(); };

    // ── Hojas inferiores ────────────────────────────────────────────────────
    let trap = null, disparador = null, hojaAbierta = null;
    function abrirHoja(id, event) {
        if (hojaAbierta) cerrarHoja(hojaAbierta, false);
        const modal = $(id);
        disparador = (event && event.currentTarget) || document.activeElement;
        abrirModalConAnimacion(modal, event);
        hojaAbierta = id;
        const box = modal.querySelector('.modal-box');
        trap = function (e) {
            if (e.key === 'Escape') { cerrarHoja(id); return; }
            if (e.key !== 'Tab') return;
            const f = Array.from(box.querySelectorAll('button, a[href], input')).filter(x => !x.disabled && x.offsetParent !== null);
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
    document.querySelectorAll('.iv-hoja').forEach(h => h.addEventListener('click', e => { if (e.target === h) cerrarHoja(h.id); }));
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) e.target.style.animation = 'none';
    });

    // ═════════════════════════════ LISTA ═════════════════════════════
    function iniciarLista() {
        // Volver con "atrás" desde el detalle: la lista se recarga si venía de caché
        // (el stock pudo cambiar en el detalle).
        window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });

        // Buscar
        const buscar = $('iv-buscar');
        let tBuscar = null;
        buscar.addEventListener('input', () => {
            clearTimeout(tBuscar);
            tBuscar = setTimeout(() => {
                try { sessionStorage.setItem('iv-buscando', '1'); } catch (e) { /* sin storage */ }
                irCon({ q: buscar.value.trim() });
            }, 250);
        });
        try {
            if (sessionStorage.getItem('iv-buscando') === '1') {
                sessionStorage.removeItem('iv-buscando');
                buscar.focus();
                buscar.setSelectionRange(buscar.value.length, buscar.value.length);
            }
        } catch (e) { /* sin storage */ }

        // Chips de estado y alerta de reabasto
        document.querySelectorAll('.iv-chips button, .iv-alerta[data-estatus]').forEach(b => {
            b.addEventListener('click', () => irCon({ estatus_stock: b.dataset.estatus }));
        });
        const chipActivo = document.querySelector('.iv-chips [aria-pressed="true"]');
        if (chipActivo) chipActivo.scrollIntoView({ block: 'nearest', inline: 'nearest' });

        // Foto de la tarjeta → visor de escritorio (sin entrar al detalle)
        const lista = $('iv-lista');
        lista.addEventListener('click', e => {
            const foto = e.target.closest('.iv-foto');
            if (!foto) return;
            const card = foto.closest('.iv-card');
            verImagenesRefaccion(e, card.dataset.pk, card.dataset.area, card.dataset.desc);
        });

        // Cargar más
        const btnMas = $('iv-cargar-mas');
        if (btnMas) {
            const etiquetar = () => {
                btnMas.textContent = t('cargarN', { n: Math.min(+btnMas.dataset.perPage, +btnMas.dataset.total - +btnMas.dataset.fin) });
            };
            etiquetar();
            btnMas.addEventListener('click', () => {
                const url = new URL(window.location.href);
                url.searchParams.set('page', btnMas.dataset.next);
                btnMas.disabled = true;
                fetch(url.toString()).then(r => r.text()).then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    doc.querySelectorAll('#iv-lista .iv-card').forEach(c => lista.appendChild(document.importNode(c, true)));
                    const sig = doc.getElementById('iv-cargar-mas');
                    if (sig) { btnMas.dataset.next = sig.dataset.next; btnMas.dataset.fin = sig.dataset.fin; etiquetar(); btnMas.disabled = false; }
                    else btnMas.remove();
                }).catch(() => { btnMas.disabled = false; aviso(t('errorCargar'), 'error'); });
            });
        }

        // ⋯ del encabezado
        $('iv-mas-btn').addEventListener('click', e => abrirHoja('iv-sheet-mas', e));
        if ($('iv-mas-categorias')) $('iv-mas-categorias').addEventListener('click', e => { cerrarHoja('iv-sheet-mas', false); abrirCategorias(e); });

        // Eliminar todas: hay que escribir la palabra exacta
        if ($('iv-mas-eliminar-todas')) {
            const input = $('iv-elt-input'), ok = $('iv-elt-ok');
            $('iv-mas-eliminar-todas').addEventListener('click', e => {
                cerrarHoja('iv-sheet-mas', false);
                input.value = '';
                ok.disabled = true;
                abrirHoja('iv-sheet-eliminar-todas', e);
                setTimeout(() => input.focus(), 60);
            });
            input.addEventListener('input', () => { ok.disabled = input.value.trim().toUpperCase() !== input.dataset.palabra.toUpperCase(); });
            $('iv-elt-cancelar').addEventListener('click', () => cerrarHoja('iv-sheet-eliminar-todas'));
            ok.addEventListener('click', () => {
                $('input-area-eliminar-todas-refacciones').value = C.areaId;
                ok.disabled = true;
                $('form-eliminar-todas-refacciones').submit();
            });
        }

        iniciarFiltros();
        iniciarCategorias();
        iniciarEscaner();
    }

    // ── Filtros: criticidad y categoría, con conteo en vivo ────────────────
    function iniciarFiltros() {
        const crit = $('iv-fl-criticidad'), cat = $('iv-fl-categoria'), ver = $('iv-filtros-ver');
        const elegido = (cont, attr) => (cont.querySelector(`[${attr}="true"]`) || {}).dataset?.v || '';
        const fijar = (cont, attr, v) => cont.querySelectorAll('button').forEach(b => b.setAttribute(attr, b.dataset.v === v ? 'true' : 'false'));
        const valores = () => ({ criticidad: elegido(crit, 'aria-pressed'), categoria: elegido(cat, 'aria-checked') });
        let tConteo = null, pedido = 0;
        function contar() {
            clearTimeout(tConteo);
            tConteo = setTimeout(() => {
                const url = urlCon(valores());
                url.searchParams.set('conteo', '1');
                const mio = ++pedido;
                fetch(url.toString()).then(r => r.json()).then(data => {
                    if (mio !== pedido) return;
                    const n = +data.n || 0;
                    ver.textContent = n === 0 ? t('sinResultados') : n === 1 ? t('verUna') : t('verN', { n });
                }).catch(() => {});
            }, 250);
        }
        $('iv-filtros-btn').addEventListener('click', e => {
            const p = new URL(window.location.href).searchParams;
            fijar(crit, 'aria-pressed', p.get('criticidad') || '');
            fijar(cat, 'aria-checked', p.get('categoria') || '');
            contar();
            abrirHoja('iv-sheet-filtros', e);
        });
        crit.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fijar(crit, 'aria-pressed', b.dataset.v); contar(); } });
        cat.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fijar(cat, 'aria-checked', b.dataset.v); contar(); } });
        $('iv-filtros-limpiar').addEventListener('click', () => { fijar(crit, 'aria-pressed', ''); fijar(cat, 'aria-checked', ''); contar(); });
        ver.addEventListener('click', () => { cerrarHoja('iv-sheet-filtros', false); irCon(valores()); });
    }

    // ── Categorías: agregar y editar en la misma hoja ──────────────────────
    let cats = [], editando = null, abrirCategorias = () => {};
    function iniciarCategorias() {
        if (!$('iv-sheet-cats')) return;
        try { cats = JSON.parse($('iv-cats-datos').textContent) || []; } catch (e) { cats = []; }
        if (!Array.isArray(cats)) cats = [];
        const enIngles = (document.documentElement.lang || 'es').toLowerCase().startsWith('en');
        const lista = $('iv-cats-lista'), buscarCat = $('iv-cats-buscar');
        const inEs = $('iv-cat-es'), inEn = $('iv-cat-en'), btnAgregar = $('iv-cat-agregar'), error = $('iv-cat-error');
        const ICONO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.2"/></svg>';
        const LAPIZ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--text-3);flex:none"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';
        const nombres = c => enIngles ? [c.en || c.es, c.en ? c.es : t('sinEspanol')] : [c.es, c.en && c.en !== c.es ? c.en : (c.en || t('sinIngles'))];
        const existe = (es, en, excepto) => cats.some(c => c.id !== excepto &&
            [normalizar(c.es), normalizar(c.en)].some(x => x && (x === normalizar(es) || (en && x === normalizar(en)))));

        function fila(c) {
            const [principal, secundario] = nombres(c);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'iv-cat-fila' + (c.nueva ? ' nueva' : '');
            b.setAttribute('aria-label', t('editarCat', { nombre: principal }));
            b.innerHTML = `<span class="iv-cat-icono">${ICONO}</span><span class="iv-cat-txt"><b></b><small></small></span><span class="iv-cat-n"></span>${LAPIZ}`;
            b.querySelector('b').textContent = principal;
            b.querySelector('small').textContent = secundario;
            b.querySelector('.iv-cat-n').textContent = c.n ? (c.n === 1 ? t('unaRef') : t('nRef', { n: c.n })) : '';
            b.addEventListener('click', () => { editando = c.id; pintar(); });
            return b;
        }
        function edicion(c) {
            const d = document.createElement('div');
            d.className = 'iv-cat-edicion';
            d.innerHTML = `<input type="text" maxlength="100" class="es"><input type="text" maxlength="100" class="en">
                <span class="iv-error" hidden></span>
                <div class="iv-cat-botones"><button type="button" class="cancelar"></button><button type="button" class="guardar"></button></div>`;
            const es = d.querySelector('.es'), en = d.querySelector('.en'), err = d.querySelector('.iv-error');
            es.value = c.es; en.value = c.en;
            es.setAttribute('aria-label', t('nombreEs'));
            en.setAttribute('aria-label', t('nombreEn'));
            d.querySelector('.cancelar').textContent = t('cancelar');
            d.querySelector('.guardar').textContent = t('guardar');
            d.querySelector('.cancelar').addEventListener('click', () => { editando = null; pintar(); });
            d.querySelector('.guardar').addEventListener('click', () => {
                const vEs = es.value.trim(), vEn = en.value.trim();
                const fallo = msg => { err.textContent = msg; err.hidden = false; es.focus(); };
                if (!vEs) return fallo(t('nombreEs'));
                if (existe(vEs, vEn, c.id)) return fallo(t('catExiste'));
                post(`${C.urlEditarCat}${c.id}/`, { nombre_es: vEs, nombre_en: vEn, area: C.areaId })
                    .then(data => {
                        Object.assign(c, { es: data.es, en: data.en, nueva: false });
                        actualizarSelects(c);
                        editando = null; pintar();
                        aviso(t('catGuardada'));
                    })
                    .catch(e => fallo(e.message || t('errorGuardar')));
            });
            setTimeout(() => es.focus(), 30);
            return d;
        }
        function pintar() {
            $('iv-cats-existentes').textContent = t('existentes', { n: cats.length });
            $('iv-cats-buscar-wrap').hidden = cats.length <= 8;
            const q = normalizar(buscarCat.value);
            lista.replaceChildren();
            const visibles = cats.filter(c => !q || normalizar(c.es).includes(q) || normalizar(c.en).includes(q));
            if (!visibles.length) {
                const v = document.createElement('div');
                v.className = 'iv-vacio';
                v.textContent = cats.length ? t('sinResultados') : t('sinCategorias');
                lista.append(v);
            }
            visibles.forEach(c => lista.append(c.id === editando ? edicion(c) : fila(c)));
            cats.forEach(c => { c.nueva = false; });
        }
        // La categoría nueva/renombrada también aparece en el filtro y en el formulario de refacción.
        function actualizarSelects(c) {
            const etiqueta = enIngles ? (c.en || c.es) : c.es;
            const sel = $('ref-categoria');
            if (sel) {
                let op = sel.querySelector(`option[value="${c.id}"]`);
                if (!op) { op = document.createElement('option'); op.value = c.id; sel.append(op); }
                op.textContent = etiqueta;
            }
            const radios = $('iv-fl-categoria');
            if (radios) {
                let b = radios.querySelector(`[data-v="${c.id}"]`);
                if (!b) { b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = c.id; radios.append(b); }
                b.textContent = etiqueta;
            }
        }
        buscarCat.addEventListener('input', pintar);
        inEs.addEventListener('input', () => { btnAgregar.disabled = !inEs.value.trim(); error.hidden = true; });
        $('iv-cat-nueva').addEventListener('submit', e => {
            e.preventDefault();
            const es = inEs.value.trim(), en = inEn.value.trim();
            if (!es) return;
            if (existe(es, en)) { error.textContent = t('catExiste'); error.hidden = false; inEs.focus(); return; }
            btnAgregar.disabled = true;
            post(C.urlCrearCat, { nombre_es: es, nombre_en: en, area: C.areaId })
                .then(data => {
                    const c = { id: data.id, es: data.es, en: data.en, n: 0, nueva: true };
                    cats.unshift(c);
                    actualizarSelects(c);
                    inEs.value = ''; inEn.value = '';
                    buscarCat.value = '';
                    pintar();
                    aviso(t('catGuardada'));
                })
                .catch(err => { error.textContent = err.message || t('errorGuardar'); error.hidden = false; btnAgregar.disabled = false; });
        });
        $('iv-cats-cerrar').addEventListener('click', () => cerrarHoja('iv-sheet-cats'));
        abrirCategorias = e => { editando = null; buscarCat.value = ''; pintar(); abrirHoja('iv-sheet-cats', e); };
    }

    // ── Escanear código (solo si el navegador trae BarcodeDetector) ────────
    function iniciarEscaner() {
        const btn = $('iv-escanear');
        if (!btn || !('BarcodeDetector' in window) || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
        btn.hidden = false;
        const capa = $('iv-scan'), video = $('iv-scan-video');
        let flujo = null, timer = null, detector = null;
        function cerrar() {
            clearInterval(timer);
            if (flujo) flujo.getTracks().forEach(tr => tr.stop());
            flujo = null;
            capa.hidden = true;
            btn.focus();
        }
        btn.addEventListener('click', async e => {
            e.preventDefault();
            try {
                detector = detector || new BarcodeDetector();
                flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            } catch (err) { aviso(t('sinCamara'), 'error'); return; }
            video.srcObject = flujo;
            capa.hidden = false;
            await video.play().catch(() => {});
            timer = setInterval(async () => {
                try {
                    const codigos = await detector.detect(video);
                    if (codigos.length) {
                        const valor = codigos[0].rawValue.trim();
                        cerrar();
                        $('iv-buscar').value = valor;
                        irCon({ q: valor });
                    }
                } catch (err) { /* cuadro aún no listo */ }
            }, 300);
        });
        $('iv-scan-cerrar').addEventListener('click', cerrar);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !capa.hidden) cerrar(); });
    }

    // ═════════════════════════════ DETALLE ═════════════════════════════
    function iniciarDetalle() {
        const raiz = $('iv-detalle'), d = raiz.dataset;
        const minimo = +d.min, maximo = +d.max, unidad = d.unidadLabel;

        // "‹ atrás" en la barra, en lugar del menú
        const volver = $('iv-volver'), barra = $('topbar-movil'), slot = $('tb-titulos');
        if (volver && barra && slot) barra.insertBefore(volver, slot);

        const estadoDe = s => s === 0 ? 'sin' : (s <= minimo ? 'bajo' : (maximo > 0 && s >= maximo ? 'sobre' : 'ok'));
        function frase(estado, s) {
            if (estado === 'sin') return minimo > 0 ? t('faltan', { unidad, n: minimo }) : t('sinExist', { unidad });
            if (estado === 'bajo') return minimo - s > 0 ? t('faltan', { unidad, n: minimo - s }) : t('enMinimo', { unidad });
            if (estado === 'sobre') return t('sobreMax', { unidad, n: s - maximo });
            return t('enRango', { unidad });
        }
        function pintarStock(s) {
            const estado = estadoDe(s);
            d.stock = s;
            const caja = $('iv-det-stock');
            caja.className = 'iv-det-stock ' + estado;
            $('iv-det-num').textContent = s;
            const est = $('iv-det-estado');
            est.className = 'iv-estado ' + estado;
            est.querySelector('span').textContent = t(estado);
            $('iv-det-frase').textContent = frase(estado, s);
            const escala = Math.max(maximo, minimo, s, 1) * 1.1;
            const relleno = $('iv-det-barra').querySelector('i');
            relleno.className = estado;
            relleno.style.width = (s * 100 / escala).toFixed(1) + '%';
            const marca = $('iv-det-barra').querySelector('b');
            if (marca) marca.style.left = (minimo * 100 / escala).toFixed(1) + '%';
            $('iv-det-barra').setAttribute('aria-label', `${t(estado)} · ${s} · ${minimo} / ${maximo || '—'}`);
        }
        pintarStock(+d.stock);

        // Descripción larga: 6 líneas y "Ver más"
        const desc = $('iv-det-desc'), btnDesc = $('iv-det-desc-mas');
        if (desc && btnDesc) {
            desc.classList.add('cortada');
            if (desc.scrollHeight > desc.clientHeight + 2) {
                btnDesc.hidden = false;
                btnDesc.textContent = t('verMas');
                btnDesc.addEventListener('click', () => {
                    const corta = desc.classList.toggle('cortada');
                    btnDesc.textContent = corta ? t('verMas') : t('verMenos');
                });
            } else {
                desc.classList.remove('cortada');
            }
        }

        // Foto: visor; sin foto, "Agregar foto" (cámara o galería)
        if ($('iv-det-foto')) $('iv-det-foto').addEventListener('click', e => verImagenesRefaccion(e, d.pk, d.areaNombre, d.descripcion));
        if ($('iv-det-agregar-foto')) {
            $('iv-det-agregar-foto').addEventListener('click', e => abrirHoja('iv-sheet-foto', e));
            document.querySelectorAll('#iv-sheet-foto [data-foto]').forEach(input => input.addEventListener('change', () => {
                if (!input.files.length) return;
                const fd = new FormData();
                fd.append('imagenes', input.files[0]);
                cerrarHoja('iv-sheet-foto', false);
                fetch(`/inventario/${d.pk}/imagenes/subir/`, { method: 'POST', headers: { 'X-CSRFToken': CSRF }, body: fd })
                    .then(r => r.json()).then(data => { if (!data.ok) throw new Error(); window.location.reload(); })
                    .catch(() => aviso(t('errorGuardar'), 'error'));
            }));
        }

        // ⋯: Editar (formulario de escritorio a pantalla completa) / Eliminar
        if ($('iv-det-mas-btn')) $('iv-det-mas-btn').addEventListener('click', e => abrirHoja('iv-sheet-det-mas', e));
        document.querySelectorAll('[data-accion="editar"]').forEach(b => b.addEventListener('click', e => {
            if (hojaAbierta) cerrarHoja(hojaAbierta, false);
            editarRefaccion(e, d.pk, d.noItem, d.nombre, d.area, d.categoria || null, d.unidad, d.criticidad,
                            +d.stock, minimo, maximo, d.ubicacion, d.proveedor, d.costo, d.descripcion, d.activo === '1');
            $('ref-volver').value = window.location.pathname + window.location.search;   // vuelve a este detalle
        }));
        document.querySelectorAll('[data-accion="eliminar"]').forEach(b => b.addEventListener('click', e => {
            if (hojaAbierta) cerrarHoja(hojaAbierta, false);
            confirmarEliminarRefaccion(e, d.urlEliminar);
            $('elim-ref-volver').value = '?' + (d.lista || ('area=' + d.area));   // a la lista, con sus filtros
        }));

        // Ajustar stock (Conteo): fija la cantidad contada
        const input = $('iv-aj-cantidad');
        if (!input) return;
        const guardar = $('iv-aj-guardar'), preview = $('iv-aj-preview');
        const leer = () => { const v = parseInt(input.value.replace(/\D/g, ''), 10); return isNaN(v) ? null : v; };
        function pintarPreview() {
            const actual = +d.stock, nuevo = leer();
            if (nuevo === null || nuevo === actual) {
                preview.className = 'iv-aj-preview';
                preview.textContent = t('sinCambio');
                guardar.disabled = true;
                return;
            }
            const estado = estadoDe(nuevo);
            preview.className = 'iv-aj-preview ' + estado;
            preview.textContent = t('nuevoStock', { a: actual, b: nuevo, estado: t(estado).toLowerCase() });
            guardar.disabled = false;
        }
        input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); pintarPreview(); });
        $('iv-aj-menos').addEventListener('click', () => { input.value = Math.max(0, (leer() || 0) - 1); pintarPreview(); });
        $('iv-aj-mas').addEventListener('click', () => { input.value = (leer() || 0) + 1; pintarPreview(); });
        guardar.addEventListener('click', () => {
            const nuevo = leer();
            if (nuevo === null) return;
            guardar.disabled = true;
            post(d.urlStock, { stock: nuevo })
                .then(data => { pintarStock(data.stock); input.value = data.stock; pintarPreview(); aviso(t('stockActualizado')); })
                .catch(e => { aviso(e.message || t('errorGuardar'), 'error'); pintarPreview(); });
        });
        pintarPreview();
    }

    // Al final: las variables de categorías (let) ya existen cuando arrancan.
    if ($('iv-movil')) iniciarLista();
    if ($('iv-detalle')) iniciarDetalle();
    
})();
