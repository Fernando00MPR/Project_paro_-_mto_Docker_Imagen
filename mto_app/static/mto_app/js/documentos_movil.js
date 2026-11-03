/* documentos_movil.js — Vista de celular (≤767px) de Documentos Generales:
   categorías (lista_documentos.html) y dentro de una carpeta
   (carpeta_detalle.html). Navega por niveles con las rutas reales de cada
   carpeta, así el "atrás" del teléfono sube un nivel. Reutiliza lo de
   documentacion.js: modales de categoría/subcarpeta/editar carpeta, la
   confirmación de eliminar y el visor de imágenes. */

(function () {
    const raiz = document.getElementById('dcm-movil');
    const fuente = document.getElementById('dcm-datos');
    if (!raiz || !fuente) return;

    const D = JSON.parse(fuente.textContent);
    const C = window.DCM_CFG || {};
    const T = C.i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const enCarpeta = !!C.carpetaId;
    const CSRF = (document.cookie.split(';').find(s => s.trim().startsWith('csrftoken=')) || '').trim().split('=')[1] || '';
    const normalizar = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const aviso = (msg, tipo) => { if (typeof showToast === 'function') showToast(msg, tipo || 'success'); };

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    // Mensaje que dejó una subida antes de recargar.
    try {
        const pendiente = sessionStorage.getItem('dcm-toast');
        if (pendiente) { sessionStorage.removeItem('dcm-toast'); aviso(pendiente); }
    } catch (e) { /* sin storage */ }

    // ── Dentro de una carpeta: "‹ atrás" en la barra, en lugar del menú ─────
    const volver = document.getElementById('dcm-volver');
    const barra = document.getElementById('topbar-movil');
    const slotTitulos = document.getElementById('tb-titulos');
    if (volver && barra && slotTitulos) barra.insertBefore(volver, slotTitulos);

    // ── Íconos y colores por tipo ───────────────────────────────────────────
    const P = {
        carpeta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        pdf:     'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4',
        word:    'M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 15h6M9 18h4',
        excel:   'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
        ppt:     'M3 4h18v12H3zM12 16v4M8 20h8',
        imagen:  'M4 5h16v14H4zM20 16l-5-5-8 8M9 10h.01',
        otro:    'M6 3h9l4 4v14H6zM14 3v5h5',
    };
    const COLORES = {
        carpeta: ['#EBEFFD', '#3D5BD9'], pdf: ['#FBE4E2', '#A8322A'], word: ['#EBEFFD', '#2C44A8'],
        excel: ['#E3F3E9', '#22663F'], ppt: ['#FDF0E1', '#A85200'], imagen: ['#F1E8FB', '#6B3FA0'], otro: ['#F0F1F7', '#5E6175'],
    };
    function tipoDe(ext) {
        const e = (ext || '').toLowerCase();
        if (e === 'pdf') return 'pdf';
        if (e === 'doc' || e === 'docx') return 'word';
        if (['xls', 'xlsx', 'csv'].includes(e)) return 'excel';
        if (e === 'ppt' || e === 'pptx') return 'ppt';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return 'imagen';
        return 'otro';
    }
    function icono(tipo, tamano) {
        const [bg, fg] = COLORES[tipo];
        const s = el('span', 'dcm-tipo' + (tamano ? ' ' + tamano : ''));
        s.style.background = bg;
        s.style.color = fg;
        s.setAttribute('aria-hidden', 'true');
        const px = tamano === 'grande' ? 26 : (tamano === 'cat' ? 24 : (tamano === 'chico' ? 18 : 20));
        s.innerHTML = `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[tipo]}"/></svg>`;
        return s;
    }
    const CHEV = '<svg class="dcm-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

    function conteo(nSub, nArch) {
        const partes = [];
        if (nSub) partes.push(nSub === 1 ? t('unaCarpeta') : t('nCarpetas', { n: nSub }));
        if (nArch) partes.push(nArch === 1 ? t('unArchivo') : t('nArchivos', { n: nArch }));
        return partes.length ? partes.join(' · ') : t('vacia');
    }

    // ── Orden (el mismo selector de escritorio; se recuerda en el teléfono) ──
    let orden = { key: 'updated', dir: 'desc' };
    try {
        const guardado = JSON.parse(localStorage.getItem('dcm-orden') || 'null');
        if (guardado && guardado.key) orden = guardado;
    } catch (e) { /* sin storage */ }
    function comparar(a, b) {
        let r;
        if (orden.key === 'name') r = a.nombre.localeCompare(b.nombre, undefined, { sensitivity: 'base' });
        else if (orden.key === 'size') r = (a.bytes || 0) - (b.bytes || 0);
        else r = (a.fecha || '').localeCompare(b.fecha || '');
        return orden.dir === 'desc' ? -r : r;
    }
    const ordenar = lista => lista.slice().sort(comparar);

    // ── Filas ───────────────────────────────────────────────────────────────
    function filaCarpeta(c, conRuta) {
        const a = el('a', 'dcm-fila');
        a.href = c.url;
        const txt = el('span', 'dcm-txt');
        txt.append(el('span', 'dcm-nombre', c.nombre),
                   el('span', 'dcm-meta', conteo(c.nSub, c.nArch) + (c.rel ? ' · ' + c.rel : '')));
        if (conRuta && c.ruta) txt.append(el('span', 'dcm-ruta-item', c.ruta));
        a.append(icono('carpeta'), txt);
        a.insertAdjacentHTML('beforeend', CHEV);
        return a;
    }
    function metaArchivo(f) {
        const meta = el('span', 'dcm-meta');
        const b = el('b', '', f.ext);
        b.style.color = COLORES[tipoDe(f.ext)][1];
        meta.append(b, ' · ' + f.tam + (f.rel ? ' · ' + f.rel : ''));
        return meta;
    }
    function filaArchivo(f, conRuta) {
        const caja = el('div', 'dcm-fila-arch');
        const principal = el('button', 'dcm-fila');
        principal.type = 'button';
        const txt = el('span', 'dcm-txt');
        txt.append(el('span', 'dcm-nombre', f.nombre), metaArchivo(f));
        if (f.desc) txt.append(el('span', 'dcm-desc', f.desc));
        if (conRuta && f.ruta) txt.append(el('span', 'dcm-ruta-item', f.ruta));
        principal.append(icono(tipoDe(f.ext)), txt);
        principal.addEventListener('click', e => abrirArchivo(f, e));
        const mas = el('button', 'dcm-mas');
        mas.type = 'button';
        mas.setAttribute('aria-label', t('acciones', { nombre: f.nombre }));
        mas.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
        mas.addEventListener('click', e => abrirHojaArchivo(f, e));
        caja.append(principal, mas);
        return caja;
    }
    function filaReciente(f) {
        const b = el('button', 'dcm-fila');
        b.type = 'button';
        const txt = el('span', 'dcm-txt');
        txt.append(el('span', 'dcm-nombre', f.nombre), el('span', 'dcm-meta', f.carpeta + (f.rel ? ' · ' + f.rel : '')));
        b.append(icono(tipoDe(f.ext), 'chico'), txt);
        b.addEventListener('click', e => abrirHojaArchivo(f, e));
        return b;
    }
    function tarjetaCategoria(c) {
        const a = el('a', 'dcm-cat');
        a.href = c.url;
        const txt = el('span', 'dcm-txt');
        const pie = el('small');
        if (c.codigo) pie.append(el('span', 'dcm-mono', c.codigo), c.rel ? ' · ' + c.rel : '');
        else pie.textContent = c.rel;
        txt.append(el('span', 'dcm-nombre', c.nombre), el('span', 'dcm-meta', conteo(c.nSub, c.nArch)), pie);
        a.append(icono('carpeta', 'cat'), txt);
        a.insertAdjacentHTML('beforeend', CHEV);
        return a;
    }
    function seccion(etiqueta, cuerpo, derecha) {
        const s = el('section', 'dcm-seccion');
        const h = el('div', 'dcm-etiqueta');
        h.append(el('span', '', etiqueta));
        if (derecha) h.append(el('small', '', derecha));
        s.append(h, cuerpo);
        return s;
    }
    function lista(items, hacer) {
        const l = el('div', 'dcm-lista');
        items.forEach(i => l.append(hacer(i)));
        return l;
    }

    // ── Contenido del nivel ─────────────────────────────────────────────────
    const contenido = document.getElementById('dcm-contenido');
    const resultados = document.getElementById('dcm-resultados');
    const seg = document.getElementById('dcm-seg');
    let ver = 'todo';

    function pintarContenido() {
        contenido.replaceChildren();
        if (!enCarpeta) {
            if (!D.carpetas.length) {
                contenido.append(el('div', 'dcm-vacio', t('sinCategorias')));
            } else {
                const cats = el('div', 'dcm-cats');
                ordenar(D.carpetas).forEach(c => cats.append(tarjetaCategoria(c)));
                contenido.append(seccion(t('categorias'), cats));
            }
            if (D.recientes.length) {
                const l = lista(D.recientes, filaReciente);
                l.classList.add('dcm-recientes');
                contenido.append(seccion(t('recientes'), l, t('enTodas')));
            }
            return;
        }
        const conCarpetas = ver !== 'archivos' && D.carpetas.length;
        const conArchivos = ver !== 'carpetas' && D.archivos.length;
        if (conCarpetas) contenido.append(seccion(t('carpetas'), lista(ordenar(D.carpetas), c => filaCarpeta(c))));
        if (conArchivos) contenido.append(seccion(t('archivos'), lista(ordenar(D.archivos), f => filaArchivo(f))));
        if (!conCarpetas && !conArchivos) {
            const v = el('div', 'dcm-vacio');
            v.append(el('b', '', t('vaciaTitulo')), t('vaciaTexto'));
            contenido.append(v);
        }
    }

    if (seg) {
        seg.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            ver = b.dataset.ver;
            seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
            pintarContenido();
        });
    }

    // ── Búsqueda (en todos los niveles debajo de aquí), lista plana con ruta ─
    const buscar = document.getElementById('dcm-buscar');
    let q = '', tBuscar = null;
    function pintarResultados() {
        const n = normalizar(q);
        const coincide = i => normalizar(i.nombre).includes(n) || normalizar(i.codigo).includes(n) || normalizar(i.desc).includes(n);
        const carpetas = ordenar(D.indice.filter(i => i.tipo === 'carpeta' && coincide(i)));
        const archivos = ordenar(D.indice.filter(i => i.tipo === 'archivo' && coincide(i)));
        resultados.replaceChildren();
        if (!carpetas.length && !archivos.length) {
            resultados.append(el('div', 'dcm-vacio', t('sinResultados', { q })));
            return;
        }
        if (carpetas.length) resultados.append(seccion(t('carpetas'), lista(carpetas, c => filaCarpeta(c, true))));
        if (archivos.length) resultados.append(seccion(t('archivos'), lista(archivos, f => filaArchivo(f, true))));
    }
    function aplicarBusqueda() {
        const buscando = !!q;
        contenido.hidden = buscando;
        if (seg) seg.hidden = buscando;
        resultados.hidden = !buscando;
        if (buscando) pintarResultados();
    }
    buscar.addEventListener('input', () => {
        clearTimeout(tBuscar);
        tBuscar = setTimeout(() => { q = buscar.value.trim(); aplicarBusqueda(); }, 250);
    });

    function repintar() {
        pintarContenido();
        if (q) pintarResultados();
    }

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
    document.querySelectorAll('.dcm-hoja').forEach(h => {
        h.addEventListener('click', e => { if (e.target === h) cerrarHoja(h.id); });
    });
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) e.target.style.animation = 'none';
    });

    // Ordenar
    const btnOrden = document.getElementById('dcm-orden-btn');
    const opcionesOrden = Array.from(document.querySelectorAll('#dcm-sheet-orden [data-key]'));
    function pintarOrden() {
        let etiqueta = '';
        opcionesOrden.forEach(o => {
            const si = o.dataset.key === orden.key && o.dataset.dir === orden.dir;
            o.setAttribute('aria-checked', si ? 'true' : 'false');
            if (si) etiqueta = o.textContent.trim();
        });
        btnOrden.setAttribute('aria-label', t('ordenar', { criterio: etiqueta }));
    }
    btnOrden.addEventListener('click', e => abrirHoja('dcm-sheet-orden', e));
    opcionesOrden.forEach(o => o.addEventListener('click', () => {
        orden = { key: o.dataset.key, dir: o.dataset.dir };
        try { localStorage.setItem('dcm-orden', JSON.stringify(orden)); } catch (e) { /* sin storage */ }
        pintarOrden();
        cerrarHoja('dcm-sheet-orden');
        repintar();
    }));

    // ── Abrir un archivo / hoja de acciones ─────────────────────────────────
    function abrirArchivo(f, event) {
        if (f.ver === 'imagen') verImagen(event, f.url, f.nombre, f.fechaLarga);
        else if (f.ver === 'pdf') window.open(f.url, '_blank', 'noopener');   // el visor de PDF del teléfono
        else abrirHojaArchivo(f, event);
    }

    let actual = null;
    const $ = id => document.getElementById(id);
    const puedeCompartir = !!navigator.share;
    const puedeCopiar = !!(navigator.clipboard && navigator.clipboard.writeText);
    if ($('dcm-arch-compartir')) {
        $('dcm-arch-compartir').hidden = !puedeCompartir && !puedeCopiar;
        $('dcm-arch-compartir-txt').textContent = puedeCompartir ? t('compartir') : t('copiarEnlace');
    }

    function abrirHojaArchivo(f, event) {
        actual = f;
        const tipo = tipoDe(f.ext);
        $('dcm-arch-icono').replaceWith(Object.assign(icono(tipo, 'grande'), { id: 'dcm-arch-icono' }));
        $('dcm-arch-nombre').textContent = f.nombre;
        $('dcm-arch-ext').textContent = f.ext;
        $('dcm-arch-ext').style.color = COLORES[tipo][1];
        $('dcm-arch-tam').textContent = f.tam;
        $('dcm-arch-desc').textContent = f.desc || '';
        $('dcm-arch-desc').hidden = !f.desc;
        $('dcm-arch-ubicacion').textContent = f.carpeta;
        $('dcm-arch-fecha').textContent = f.fechaLarga;
        $('dcm-arch-ver').hidden = !f.ver;
        $('dcm-arch-ver').parentElement.classList.toggle('solo', !f.ver);
        $('dcm-arch-descargar').href = f.url;
        abrirHoja('dcm-sheet-archivo', event);
    }
    $('dcm-arch-ver').addEventListener('click', e => { cerrarHoja('dcm-sheet-archivo', false); abrirArchivo(actual, e); });
    $('dcm-arch-compartir').addEventListener('click', () => {
        const url = new URL(actual.url, window.location.href).href;
        if (puedeCompartir) {
            navigator.share({ title: actual.nombre, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => aviso(t('enlaceCopiado'))).catch(() => {});
        }
    });
    if ($('dcm-arch-eliminar')) {
        $('dcm-arch-eliminar').addEventListener('click', e => {
            cerrarHoja('dcm-sheet-archivo', false);
            confirmarEliminarDocumento(e, actual.id, actual.nombre);
            $('texto-eliminar-doc').textContent = t('eliminarArchivoTexto', { nombre: actual.nombre });
        });
    }

    // Renombrar (mismo endpoint que el renombrado en línea de escritorio)
    if ($('dcm-arch-renombrar')) {
        const form = $('dcm-ren-form'), input = $('dcm-ren-nombre'), error = $('dcm-ren-error'), guardar = $('dcm-ren-guardar');
        $('dcm-arch-renombrar').addEventListener('click', e => {
            cerrarHoja('dcm-sheet-archivo', false);
            input.value = actual.nombre;
            error.hidden = true;
            guardar.disabled = false;
            abrirHoja('dcm-sheet-renombrar', e);
            setTimeout(() => { input.focus(); input.select(); }, 60);
        });
        $('dcm-ren-cancelar').addEventListener('click', () => cerrarHoja('dcm-sheet-renombrar'));
        form.addEventListener('submit', e => {
            e.preventDefault();
            const nombre = input.value.trim();
            if (!nombre) { input.focus(); return; }
            guardar.disabled = true;
            fetch(`${(window.DOC_CFG || {}).urlRenombrarDocBase || '/mto/documentos/'}${actual.id}/renombrar/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': CSRF, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'nombre=' + encodeURIComponent(nombre),
            })
                .then(r => r.json().then(data => ({ ok: r.ok && data.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok) throw new Error(data.error || '');
                    [D.archivos, D.recientes, D.indice].forEach(l => l.forEach(i => {
                        if (i.tipo === 'archivo' && i.id === actual.id) i.nombre = data.nombre;
                    }));
                    cerrarHoja('dcm-sheet-renombrar', false);
                    repintar();
                    aviso(t('renombrado'));
                })
                .catch(err => {
                    error.textContent = err.message || t('errorGuardar');
                    error.hidden = false;
                    guardar.disabled = false;
                });
        });
    }

    // ── ⋯ de la carpeta, "…" de la ruta y "+ Agregar" ───────────────────────
    if ($('dcm-mas-btn')) $('dcm-mas-btn').addEventListener('click', e => abrirHoja('dcm-sheet-mas', e));
    if ($('dcm-ruta-mas')) $('dcm-ruta-mas').addEventListener('click', e => abrirHoja('dcm-sheet-ruta', e));
    if ($('dcm-mas-editar')) {
        $('dcm-mas-editar').addEventListener('click', e => {
            const d = e.currentTarget.dataset;
            cerrarHoja('dcm-sheet-mas', false);
            abrirModalEditarCarpeta(e, d.id, d.codigo, d.nombre);
        });
    }
    if ($('dcm-mas-subir')) {
        $('dcm-mas-subir').addEventListener('click', () => { cerrarHoja('dcm-sheet-mas', false); $('dcm-input-archivos').click(); });
    }
    if ($('dcm-mas-eliminar')) {
        $('dcm-mas-eliminar').addEventListener('click', e => {
            const d = e.currentTarget.dataset;
            cerrarHoja('dcm-sheet-mas', false);
            confirmarEliminarCarpeta(e, d.id, d.nombre, D.archivosTotal);
            $('texto-eliminar-doc').textContent = t('eliminarCarpetaTexto', {
                nombre: d.nombre,
                carpetas: D.subcarpetasTotal === 1 ? t('unaCarpeta') : t('nCarpetas', { n: D.subcarpetasTotal }),
                archivos: D.archivosTotal === 1 ? t('unArchivo') : t('nArchivos', { n: D.archivosTotal }),
            });
        });
    }
    if ($('dcm-fab-agregar')) $('dcm-fab-agregar').addEventListener('click', e => abrirHoja('dcm-sheet-agregar', e));
    if ($('dcm-agr-carpeta')) {
        $('dcm-agr-carpeta').addEventListener('click', e => { cerrarHoja('dcm-sheet-agregar', false); abrirModalSubcarpeta(e); });
    }

    // ── Subir archivos: uno por uno, con barra de progreso ──────────────────
    const MAX_BYTES = 25 * 1024 * 1024;
    const subidas = document.getElementById('dcm-subidas');
    const pad = n => String(n).padStart(2, '0');

    function nombreDe(file, esFoto) {
        if (esFoto) {
            const d = new Date();
            return `${t('foto')} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
        return file.name.replace(/\.[^.]+$/, '').slice(0, 200) || file.name;
    }
    function filaSubida(nombre, ext) {
        const fila = el('div', 'dcm-subida');
        const txt = el('span', 'dcm-txt');
        const meta = el('span', 'dcm-meta', '0%');
        const barraP = el('span', 'dcm-subida-barra');
        const relleno = el('i');
        barraP.append(relleno);
        txt.append(el('span', 'dcm-nombre', nombre), meta, barraP);
        const estado = el('span', 'dcm-subida-estado');
        estado.setAttribute('aria-live', 'polite');
        fila.append(icono(tipoDe(ext)), txt, estado);
        return {
            fila,
            progreso: p => { relleno.style.width = p + '%'; meta.textContent = p + '%'; },
            ok: () => { fila.classList.add('ok'); relleno.style.width = '100%'; meta.textContent = '100%'; estado.textContent = '✓'; },
            error: msg => { fila.classList.add('error'); meta.textContent = msg; estado.textContent = '!'; },
        };
    }
    function enviar(file, nombre, ui) {
        return new Promise(resolve => {
            const fd = new FormData();
            fd.append('archivo', file);
            fd.append('nombre', nombre);
            fd.append('descripcion', '');
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${(window.DOC_CFG || {}).urlSubirBase || '/mto/documentos/carpeta/'}${C.carpetaId}/subir/`);
            xhr.setRequestHeader('X-CSRFToken', CSRF);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.upload.onprogress = e => { if (e.lengthComputable) ui.progreso(Math.min(99, Math.round(e.loaded * 100 / e.total))); };
            xhr.onload = () => {
                let data = {};
                try { data = JSON.parse(xhr.responseText); } catch (e) { /* respuesta no JSON */ }
                if (xhr.status === 200 && data.ok) { ui.ok(); resolve(true); }
                else { ui.error(data.error || t('errorSubir')); resolve(false); }
            };
            xhr.onerror = () => { ui.error(t('errorSubir')); resolve(false); };
            xhr.send(fd);
        });
    }
    async function subir(files, esFoto) {
        if (!files.length || !C.carpetaId) return;
        if (hojaAbierta) cerrarHoja(hojaAbierta, false);
        const cuerpo = el('div', 'dcm-lista');
        subidas.replaceChildren(seccion(t('subiendo'), cuerpo));
        subidas.hidden = false;
        subidas.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const permitidas = (D.extensiones || []).map(e => e.toLowerCase());
        const tareas = files.map(file => {
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            const ui = filaSubida(file.name, ext.toUpperCase());
            cuerpo.append(ui.fila);
            let problema = '';
            if (permitidas.length && !permitidas.includes(ext)) problema = t('tipoNoPermitido');
            else if (file.size > MAX_BYTES) problema = t('muyGrande');
            if (problema) ui.error(problema);
            return { file, ui, problema };
        });
        let subidos = 0;
        for (const tarea of tareas) {
            if (tarea.problema) continue;
            if (await enviar(tarea.file, nombreDe(tarea.file, esFoto), tarea.ui)) subidos++;
        }
        if (subidos) {
            try { sessionStorage.setItem('dcm-toast', subidos === 1 ? t('subidos1') : t('subidosN', { n: subidos })); } catch (e) { /* sin storage */ }
            setTimeout(() => window.location.reload(), 600);
        }
    }
    if ($('dcm-input-archivos')) {
        // Mismos tipos que valida el servidor (EXTENSIONES_DOCUMENTO_PERMITIDAS).
        if (D.extensiones) $('dcm-input-archivos').accept = D.extensiones.map(x => '.' + x).join(',');
        $('dcm-input-archivos').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; subir(f, false); });
    }
    if ($('dcm-input-foto')) {
        $('dcm-input-foto').addEventListener('change', e => { const f = Array.from(e.target.files || []); e.target.value = ''; subir(f, true); });
    }

    pintarOrden();
    pintarContenido();
})();
