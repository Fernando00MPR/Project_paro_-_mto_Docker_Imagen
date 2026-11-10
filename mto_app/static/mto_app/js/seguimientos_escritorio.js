/* seguimientos_escritorio.js — Lista y modal Nuevo/Editar de "Seguimientos correctivos"
   (escritorio). El celular usa seguimientos_movil.js y no depende de este archivo.
   Requiere (definidos en el template): CSRF_SM, AREA_ID_SM, URL_SM_ADD, URL_SM_EDIT,
   URL_SM_DEL, SM_LIMITE_FOTOS, SM_MAX_IMAGENES, SM_LIMITE_IMAGENES_TPL, SM_ERROR_GUARDAR, SM_ERROR_ELIMINAR,
   window.SGE_I18N, y el visor de lista_seguimientos.js (lightbox). */
(function () {
    const $ = id => document.getElementById(id);
    const I = window.SGE_I18N || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), I[k] || k);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const DIA = 864e5;

    // ── Fechas (ISO, en UTC para no depender de la zona horaria) ──
    const hoyIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    const sumarDias = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10);
    const finDeMes = iso => { const [a, m] = iso.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
    const dmy = iso => iso ? iso.split('-').reverse().join('/') : '';
    function semanaIso(iso) {
        const d = new Date(Date.parse(iso + 'T00:00:00Z'));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const ini = Date.UTC(d.getUTCFullYear(), 0, 1);
        return Math.ceil(((d - ini) / DIA + 1) / 7);
    }
    const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const iniciales = n => {
        const p = String(n || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        return (p[0][0] + (p[1] ? p[1][0] : (p[0][1] || ''))).toUpperCase();
    };

    // ── URL de la lista con filtros (igual que irCon/urlCon de seguimientos_movil.js) ──
    function urlCon(cambios) {
        const url = new URL(window.location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k]) url.searchParams.set(k, cambios[k]); else url.searchParams.delete(k);
        });
        url.searchParams.delete('page');
        return url;
    }
    const irCon = cambios => { window.location.href = urlCon(cambios).toString(); };

    // ═════════════════════════ Filtros ═════════════════════════
    const buscar = $('sge-q');
    if (buscar) {
        let tBuscar = null;
        buscar.addEventListener('input', () => {
            clearTimeout(tBuscar);
            tBuscar = setTimeout(() => {
                try { sessionStorage.setItem('sge-buscando', '1'); } catch (e) { /* sin storage */ }
                irCon({ q: buscar.value.trim() });
            }, 250);
        });
        // Tras recargar por la búsqueda, el cursor vuelve al campo para seguir escribiendo.
        try {
            if (sessionStorage.getItem('sge-buscando') === '1') {
                sessionStorage.removeItem('sge-buscando');
                buscar.focus();
                const n = buscar.value.length;
                buscar.setSelectionRange(n, n);
            }
        } catch (e) { /* sin storage */ }
    }

    // Chips de Estatus (selección única) y de Atención (uno a la vez, se pueden apagar).
    document.querySelectorAll('.sge-chip[data-set]').forEach(chip => {
        chip.addEventListener('click', () => {
            const param = chip.dataset.set;
            const activo = chip.getAttribute('aria-pressed') === 'true';
            irCon({ [param]: param === 'atencion' && activo ? '' : chip.dataset.val });
        });
    });

    // "Creado": rangos rápidos + rango personalizado.
    const creado = $('sge-creado');
    if (creado) {
        const btn = creado.querySelector('.sge-creado-btn');
        const pop = $('sge-creado-pop');
        const rango = $('sge-rango');
        const abrir = () => { pop.hidden = false; creado.classList.add('sge-abierto'); btn.setAttribute('aria-expanded', 'true'); };
        const cerrar = () => { pop.hidden = true; creado.classList.remove('sge-abierto'); btn.setAttribute('aria-expanded', 'false'); };
        btn.addEventListener('click', () => (pop.hidden ? abrir() : cerrar()));
        document.addEventListener('pointerdown', e => { if (!pop.hidden && !creado.contains(e.target)) cerrar(); });
        creado.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); cerrar(); btn.focus(); } });
        pop.querySelectorAll('.sge-op').forEach(op => op.addEventListener('click', () => {
            const v = op.dataset.creado;
            if (v === 'rango') {
                rango.hidden = false;
                pop.querySelectorAll('.sge-op').forEach(o => o.setAttribute('aria-selected', o === op ? 'true' : 'false'));
                document.querySelector('#dp-sge-desde .dp-control').focus();
                return;
            }
            irCon({ creado: v, fecha_desde: '', fecha_hasta: '' });
        }));
        // Desde/Hasta usan el selector de fecha de la app (valor real en el hidden .dp-value).
        $('sge-rango-aplicar').addEventListener('click', () => {
            const d = document.querySelector('#dp-sge-desde .dp-value').value;
            const h = document.querySelector('#dp-sge-hasta .dp-value').value;
            if (!d && !h) { document.querySelector('#dp-sge-desde .dp-control').focus(); return; }
            irCon({ creado: '', fecha_desde: d, fecha_hasta: h });
        });
    }

    // ═════════════════════════ Columnas ═════════════════════════
    const SEG_COLS = ['sge-c-notas', 'sge-c-val', 'sge-c-creado'];
    const CLAVE_COLS = 'mto_seg_cols_v3';

    window.toggleSegCol = function (cls, visible) {
        document.querySelectorAll('.' + cls).forEach(el => { el.style.display = visible ? '' : 'none'; });
        let prefs = {};
        try { prefs = JSON.parse(localStorage.getItem(CLAVE_COLS) || '{}'); } catch (e) { /* sin storage */ }
        prefs[cls] = visible;
        try { localStorage.setItem(CLAVE_COLS, JSON.stringify(prefs)); } catch (e) { /* sin storage */ }
    };
    window.toggleSegColPicker = function () {
        const p = $('seg-col-picker');
        p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
    };
    document.addEventListener('click', e => {
        const wrap = $('seg-col-picker-wrap'), p = $('seg-col-picker');
        if (wrap && p && !wrap.contains(e.target)) p.style.display = 'none';
    });
    (function iniciarColumnas() {
        if (!$('seg-col-picker')) return;
        document.querySelectorAll('.seg-col-toggle').forEach(el => {
            el.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-2);';
            el.querySelector('input').style.accentColor = 'var(--indigo)';
        });
        let prefs = {};
        try { prefs = JSON.parse(localStorage.getItem(CLAVE_COLS) || '{}'); } catch (e) { /* sin storage */ }
        SEG_COLS.forEach(cls => {
            // ocultas por defecto
            const visible = prefs[cls] !== undefined ? prefs[cls] : false;
            
            document.querySelectorAll('.' + cls).forEach(el => { el.style.display = visible ? '' : 'none'; });
            const input = document.querySelector('[data-col="' + cls + '"] input');
            if (input) input.checked = visible;
        });
    })();

    // ═════════════════════════ Tabla ═════════════════════════
    const tabla = $('tabla-seguimientos');
    const filaDe = id => document.querySelector(`tr[data-sm-id="${id}"]`);
    const puedeEditar = () => !!(tabla && tabla.dataset.puedeEditar === '1');

    // Clic en la fila (fuera de enlaces/botones) abre el modal en modo editar.
    if (tabla) {
        tabla.querySelector('tbody').addEventListener('click', e => {
            if (e.target.closest('a, button, input, label, select')) return;
            const tr = e.target.closest('tr[data-sm-id]');
            if (tr && puedeEditar()) window.editarManual(e, tr.dataset.smId);
        });
    }

    // Barra de desplazamiento horizontal fija al fondo de la ventana (solo si la tabla no cabe).
    (function barraHorizontal() {
        const caja = document.querySelector('.sge-scroll'), barra = $('sge-hbar');
        if (!caja || !barra) return;
        const relleno = barra.firstElementChild;
        function medir() {
            relleno.style.width = caja.scrollWidth + 'px';
            barra.hidden = caja.scrollWidth <= caja.clientWidth + 1;
            if (!barra.hidden) barra.scrollLeft = caja.scrollLeft;
        }
        caja.addEventListener('scroll', () => { if (barra.scrollLeft !== caja.scrollLeft) barra.scrollLeft = caja.scrollLeft; });
        barra.addEventListener('scroll', () => { if (caja.scrollLeft !== barra.scrollLeft) caja.scrollLeft = barra.scrollLeft; });
        if (window.ResizeObserver) { const ro = new ResizeObserver(medir); ro.observe(caja); if (tabla) ro.observe(tabla); }
        window.addEventListener('resize', medir);
        medir();
    })();

    // ═════════════════════════ Descargar (Excel / CSV) ═════════════════════════
    (function descargar() {
        const raiz = $('sge-dl');
        if (!raiz) return;
        const btn = $('sge-dl-btn'), menu = $('sge-dl-menu'), vacio = $('sge-dl-vacio'), txt = btn.querySelector('.txt');
        const radios = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
        const ops = Array.from(menu.querySelectorAll('.sge-dl-op'));
        const textoBoton = txt.textContent;
        let alcance = (radios.find(r => r.getAttribute('aria-checked') === 'true') || radios[0]).dataset.alcance;
        const items = () => radios.concat(ops).filter(e => !e.disabled);

        function pintar() {
            radios.forEach(r => r.setAttribute('aria-checked', r.dataset.alcance === alcance ? 'true' : 'false'));
            const n = +radios.find(r => r.dataset.alcance === alcance).dataset.n;
            ops.forEach(o => { o.disabled = n === 0; });
            vacio.hidden = n !== 0;
        }
        function abrir(enfocar) {
            pintar();
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            if (enfocar && items()[0]) items()[0].focus();
        }
        function cerrar(volver) {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (volver) btn.focus();
        }
        btn.addEventListener('click', e => {
            if (!menu.hidden) { cerrar(false); return; }
            abrir(e.detail === 0);                       // con teclado (Enter/Espacio) el foco entra al menú
        });
        btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); abrir(true); } });
        document.addEventListener('pointerdown', e => { if (!menu.hidden && !raiz.contains(e.target)) cerrar(false); });
        menu.addEventListener('keydown', e => {
            const lista = items(), i = lista.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); lista[(i + 1) % lista.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); lista[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); lista[lista.length - 1].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); }
            else if (e.key === 'Tab') cerrar(false);
        });
        radios.forEach(r => r.addEventListener('click', () => { alcance = r.dataset.alcance; pintar(); }));
        ops.forEach(o => o.addEventListener('click', () => generar(o.dataset.formato)));

        async function generar(formato) {
            cerrar(false);
            const url = new URL(btn.dataset.url, window.location.origin);
            new URL(window.location.href).searchParams.forEach((v, k) => {
                if (['page', 'per_page', 'abrir', 'formato', 'alcance', 'conteo'].indexOf(k) === -1) url.searchParams.set(k, v);
            });
            url.searchParams.set('formato', formato);
            url.searchParams.set('alcance', alcance);
            btn.disabled = true; btn.setAttribute('aria-busy', 'true'); txt.textContent = t('descargando');
            const aviso = setTimeout(() => showToast(t('preparando'), 'info'), 400);
            try {
                const r = await fetch(url, { credentials: 'same-origin' });
                if (!r.ok) throw new Error('http ' + r.status);
                const n = r.headers.get('X-Filas') || '0';
                const m = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '');
                const blob = await r.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = m ? m[1] : 'seguimientos.' + formato;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                showToast({ title: t('descargados'), description: t('descargadosDet', { n }) }, 'success');
            } catch (e) {
                showToast({ title: t('errorDescarga'), description: window.TXT_REVISA_CONEXION }, 'error');
            } finally {
                clearTimeout(aviso);
                btn.disabled = false; btn.removeAttribute('aria-busy'); txt.textContent = textoBoton;
            }
        }
    })();

    window.toggleValidadoManual = function (id, btn) {
        if (btn.getAttribute('aria-disabled') === 'true') { showToast({ title: t('noValidableTit'), description: t('noValidable') }, 'warning'); return; }
        fetch(`/mto/seguimiento/validar-manual/${id}/`, { method: 'POST', headers: { 'X-CSRFToken': CSRF_SM } })
            .then(r => r.json())
            .then(data => {
                if (!data.ok) { showToast({ title: t('errorValidar'), description: data.error || window.TXT_REVISA_CONEXION }, 'error'); return; }
                btn.classList.toggle('ok', !!data.validado);
                btn.querySelector('span').textContent = data.validado ? t('validado') : t('porValidar');
                btn.querySelector('path').setAttribute('d', data.validado ? 'm5 12 5 5 9-10' : 'M12 7v5l3 2');
            })
            .catch(() => showToast({ title: t('errorValidar'), description: window.TXT_REVISA_CONEXION }, 'error'));
    };

    window.verFotosFila = function (event, id) {
        const tr = filaDe(id);
        if (!tr) return;
        window.verImagenesSeg(event, 'manual', id, tr.dataset.creadoTxt, tr.dataset.area, tr.dataset.estatus, tr.dataset.estatusLabel);
    };

    // Aviso y resaltado tras guardar/eliminar (la página se recarga para refrescar conteos y orden).
    function guardarAviso(msg, id) {
        try { sessionStorage.setItem('sge-flash', JSON.stringify({ msg, id: id || '' })); } catch (e) { /* sin storage */ }
    }
    (function mostrarAviso() {
        let f = null;
        try { f = JSON.parse(sessionStorage.getItem('sge-flash') || 'null'); sessionStorage.removeItem('sge-flash'); } catch (e) { /* sin storage */ }
        if (!f) return;
        if (f.msg && typeof showToast === 'function') showToast(f.msg, 'success');
        const tr = f.id ? filaDe(f.id) : null;
        if (tr) {
            tr.classList.add('sge-resaltada');
            tr.scrollIntoView({ block: 'center' });
            setTimeout(() => tr.classList.remove('sge-resaltada'), 2000);
        }
    })();

    // ═════════════════════════ Modal Nuevo / Editar ═════════════════════════
    const modal = $('modal-manual');
    if (!modal) return;
    const fProblema = $('sm-problema'), fAccion = $('sm-accion'), fNotas = $('sm-notas');
    const fFecha = () => document.querySelector('#dp-sm-fecha .dp-value');
    const getFecha = () => fFecha().value;
    const setFecha = iso => { const h = fFecha(); h.value = iso || ''; h.dispatchEvent(new Event('change', { bubbles: true })); };

    let st = null;   // estado del formulario abierto
    const modalAbierto = id => { const m = $(id); return !!m && m.style.display === 'flex'; };
    const valores = () => JSON.stringify([fProblema.value.trim(), fAccion.value.trim(), st.resp, getFecha(),
        $('sm-estatus').value, fNotas.value.trim(), st.borrar.slice().sort(), st.nuevas.length]);
    const haySinGuardar = () => !!st && valores() !== st.inicial;

    // — Errores de validación —
    function marcar(el, errId, msg) {
        el.classList.add('err');
        const e = $(errId);
        if (msg) e.textContent = msg;
        e.hidden = false;
    }
    function limpiarError(el, errId) { el.classList.remove('err'); $(errId).hidden = true; }
    function limpiarErrores() {
        limpiarError(fProblema, 'sge-err-problema'); limpiarError(fAccion, 'sge-err-accion');
        limpiarError($('sge-combo'), 'sge-err-resp'); limpiarError($('sge-fechaw'), 'sge-err-fecha');
    }

    // — Contadores —
    function contadores() {
        $('sge-cnt-problema').textContent = fProblema.value.length + ' / 500';
        $('sge-cnt-accion').textContent = fAccion.value.length + ' / 500';
    }
    fProblema.addEventListener('input', () => { contadores(); if (fProblema.value.trim()) limpiarError(fProblema, 'sge-err-problema'); });
    fAccion.addEventListener('input', () => { contadores(); if (fAccion.value.trim()) limpiarError(fAccion, 'sge-err-accion'); });

    // — Estatus —
    window.smEstatus = function (val) {
        $('sm-estatus').value = val;
        document.querySelectorAll('.sge-eb').forEach(b => b.setAttribute('aria-checked', b.dataset.val === val ? 'true' : 'false'));
    };

    // — Fecha compromiso: semana ISO, atajos y validación —
    function pintarFecha() {
        const f = getFecha();
        $('sge-semana').textContent = f ? t('semana', { n: semanaIso(f) }) : '';
        const hoy = hoyIso();
        const metas = { hoy: hoy, '7': sumarDias(hoy, 7), '14': sumarDias(hoy, 14), fin: finDeMes(hoy) };
        document.querySelectorAll('.sge-atajo').forEach(b =>
            b.setAttribute('aria-pressed', f && metas[b.dataset.atajo] === f ? 'true' : 'false'));
        limpiarError($('sge-fechaw'), 'sge-err-fecha');
    }
    fFecha().addEventListener('change', pintarFecha);
    document.querySelectorAll('.sge-atajo').forEach(b => b.addEventListener('click', () => {
        const hoy = hoyIso();
        setFecha({ hoy: hoy, '7': sumarDias(hoy, 7), '14': sumarDias(hoy, 14), fin: finDeMes(hoy) }[b.dataset.atajo]);
    }));

    // — Responsable: combobox que solo acepta personas existentes —
    const combo = $('sge-combo'), rInput = $('sm-resp-input'), rLista = $('sm-resp-lista');
    const rElegido = $('sge-resp-elegido');
    let rItems = [], rActivo = -1, rTimer = null, rPedido = 0;

    function setResp(nombre) {
        st.resp = nombre || '';
        combo.classList.toggle('elegido', !!st.resp);
        rElegido.innerHTML = st.resp ? `<span class="sge-av">${esc(iniciales(st.resp))}</span><span>${esc(st.resp)}</span>` : '';
        rInput.value = '';
        cerrarLista();
        if (st.resp) limpiarError(combo, 'sge-err-resp');
    }
    function listaAbierta() { return !rLista.hidden; }
    function cerrarLista() {
        rLista.hidden = true; rActivo = -1;
        rInput.setAttribute('aria-expanded', 'false'); rInput.removeAttribute('aria-activedescendant');
    }
    function resaltar(nombre, q) {
        const n = [...nombre].map(c => (c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] || c)).join('');
        const qn = [...q].map(c => (c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] || c)).join('');
        const i = qn ? n.indexOf(qn) : -1;
        if (i < 0) return esc(nombre);
        return esc(nombre.slice(0, i)) + '<b>' + esc(nombre.slice(i, i + qn.length)) + '</b>' + esc(nombre.slice(i + qn.length));
    }
    function pintarLista(q) {
        rLista.innerHTML = '';
        if (!rItems.length) {
            rLista.innerHTML = `<li class="vacio" role="presentation">${esc(t('sinCoincidencias'))}</li>`;
        } else {
            rItems.forEach((it, i) => {
                const li = document.createElement('li');
                li.id = 'sm-resp-op-' + i; li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', 'false');
                li.innerHTML = `<span class="av">${esc(iniciales(it.nombre))}</span><span>${resaltar(it.nombre, q)}</span>`;
                li.addEventListener('mousedown', e => { e.preventDefault(); setResp(it.nombre); });
                li.addEventListener('mousemove', () => marcarActivo(i));
                rLista.appendChild(li);
            });
        }
        rLista.hidden = false;
        rInput.setAttribute('aria-expanded', 'true');
        rActivo = -1;
    }
    function marcarActivo(i) {
        rActivo = i;
        rLista.querySelectorAll('[role="option"]').forEach((li, k) => {
            li.classList.toggle('activa', k === i);
            li.setAttribute('aria-selected', k === i ? 'true' : 'false');
        });
        if (i >= 0) {
            rInput.setAttribute('aria-activedescendant', 'sm-resp-op-' + i);
            const li = $('sm-resp-op-' + i);
            if (li) li.scrollIntoView({ block: 'nearest' });
        } else rInput.removeAttribute('aria-activedescendant');
    }
    function buscarResp(q) {
        const mio = ++rPedido;
        fetch(`/mto/bitacora/buscar-responsables/?q=${encodeURIComponent(q)}&area_id=${encodeURIComponent(AREA_ID_SM || '')}`)
            .then(r => r.json())
            .then(items => { if (mio === rPedido) { rItems = items; pintarLista(q); } })
            .catch(() => { if (mio === rPedido && typeof showToast === 'function') showToast({ title: t('errorBuscar'), description: window.TXT_REVISA_CONEXION }, 'error'); });
    }
    rInput.addEventListener('input', () => {
        clearTimeout(rTimer);
        rTimer = setTimeout(() => buscarResp(rInput.value.trim()), 200);
    });
    rInput.addEventListener('focus', () => { if (!st || st.resp) return; buscarResp(rInput.value.trim()); });
    rInput.addEventListener('blur', () => setTimeout(cerrarLista, 150));
    rInput.addEventListener('keydown', e => {
        const opciones = rLista.querySelectorAll('[role="option"]').length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!listaAbierta()) { buscarResp(rInput.value.trim()); return; }
            if (opciones) marcarActivo(Math.min(rActivo + 1, opciones - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (opciones) marcarActivo(Math.max(rActivo - 1, 0));
        } else if (e.key === 'Enter') {
            if (listaAbierta() && rActivo >= 0 && rItems[rActivo]) { e.preventDefault(); e.stopPropagation(); setResp(rItems[rActivo].nombre); }
        }
    });
    $('sge-resp-quitar').addEventListener('click', () => { setResp(''); rInput.focus(); });

    // — Imágenes (4 casillas): arrastrar, pegar o hacer clic —
    const inputImgs = $('sm-input-imagenes'), grid = $('sm-grid');
    const visibles = () => st.existentes.filter(i => st.borrar.indexOf(i.id) === -1);
    function pintarImagenes() {
        grid.innerHTML = '';
        const fotos = visibles().map(i => ({ url: i.url, existente: i })).concat(st.nuevas.map(n => ({ url: n.url, nueva: n })));
        fotos.forEach((f, idx) => {
            const d = document.createElement('div');
            d.className = 'sge-slot foto'; d.title = t('verImg');
            d.innerHTML = `<img src="${esc(f.url)}" alt=""><button type="button" class="rm" aria-label="${esc(t('quitarImg'))}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
            d.addEventListener('click', e => {
                if (e.target.closest('.rm')) {
                    if (f.existente) st.borrar.push(f.existente.id);
                    else { URL.revokeObjectURL(f.nueva.url); st.nuevas.splice(st.nuevas.indexOf(f.nueva), 1); }
                    pintarImagenes();
                    return;
                }
                lightboxSegImagenes = fotos.map(x => ({ url: x.url }));
                lightboxSegIndice = idx;
                lightboxSegMeta = {};
                renderLightboxSeg();
                abrirModalConAnimacion('modal-imagenes-seg', { currentTarget: d });
            });
            grid.appendChild(d);
        });
        for (let i = fotos.length; i < 4; i++) {
            const d = document.createElement('div');
            if (i === fotos.length) {
                d.className = 'sge-slot agregar'; d.tabIndex = 0; d.setAttribute('role', 'button');
                d.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>${esc(t('agregar'))}`;
                d.addEventListener('click', () => inputImgs.click());
                d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputImgs.click(); } });
            } else {
                d.className = 'sge-slot';
                d.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18v14H3zM21 16l-5-5-8 8"/></svg>';
            }
            grid.appendChild(d);
        }
        $('sge-cnt-imgs').textContent = fotos.length + ' / 4';
    }
    function agregarArchivos(archivos) {
        if (!st) return;
        const validos = [];
        archivos.forEach(f => {
            if (f.type !== 'image/jpeg' && f.type !== 'image/png') { showToast({ title: t('fotoNoValida'), description: t('tipoImg') }, 'warning'); return; }
            if (f.size > 5 * 1024 * 1024) { showToast({ title: t('fotoPesada'), description: t('tamImg') }, 'warning'); return; }
            validos.push(f);
        });
        const disponibles = 4 - (visibles().length + st.nuevas.length);
        if (disponibles <= 0) { if (validos.length) showToast({ title: SM_LIMITE_FOTOS, description: SM_MAX_IMAGENES }, 'warning'); return; }
        if (validos.length > disponibles) showToast({ title: SM_LIMITE_FOTOS, description: SM_LIMITE_IMAGENES_TPL.replace('{n}', disponibles) }, 'warning');
        validos.slice(0, disponibles).forEach(f => st.nuevas.push({ file: f, url: URL.createObjectURL(f) }));
        pintarImagenes();
    }
    inputImgs.addEventListener('change', () => { agregarArchivos(Array.from(inputImgs.files)); inputImgs.value = ''; });
    grid.addEventListener('dragover', e => { e.preventDefault(); const a = grid.querySelector('.agregar'); if (a) a.classList.add('arrastrando'); });
    grid.addEventListener('dragleave', () => { const a = grid.querySelector('.agregar'); if (a) a.classList.remove('arrastrando'); });
    grid.addEventListener('drop', e => {
        e.preventDefault();
        const a = grid.querySelector('.agregar'); if (a) a.classList.remove('arrastrando');
        agregarArchivos(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
    });
    // Ctrl + V: pegar capturas del portapapeles (solo con el modal abierto).
    document.addEventListener('paste', e => {
        if (!st || !modalAbierto('modal-manual')) return;
        const imgs = Array.from((e.clipboardData && e.clipboardData.items) || [])
            .filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
        if (!imgs.length) return;
        e.preventDefault();
        agregarArchivos(imgs);
    });

    // — Abrir / cerrar —
    function abrir(modo, tr, event) {
        const editar = modo === 'editar';
        const d = tr ? tr.dataset : {};
        st = { modo, id: editar ? d.smId : '', resp: '', existentes: [], borrar: [], nuevas: [],
               min: editar ? d.creado : hoyIso(), fechaInicial: editar ? d.fecha : '',
               disparador: (event && event.currentTarget) || document.activeElement };
        fProblema.value = editar ? d.problema : '';
        fAccion.value   = editar ? d.accion : '';
        fNotas.value    = editar ? d.notas : '';
        $('sm-id').value = st.id;
        limpiarErrores(); contadores();
        smEstatus(editar ? d.estatus : 'pendiente');
        setFecha(st.fechaInicial);
        setResp(editar ? d.responsable : '');
        pintarImagenes();
        if (editar) {
            fetch(`/mto/seguimiento/manual/${st.id}/imagenes/`).then(r => r.json())
                .then(data => { if (st && st.id === d.smId) { st.existentes = data.imagenes; pintarImagenes(); } });
        }
        $('sge-m-titulo-txt').textContent = t(editar ? 'editarTitulo' : 'nuevoTitulo');
        $('sge-m-orden').hidden = $('sge-m-tipo').hidden = !editar;
        $('sge-m-orden').textContent = editar ? d.orden : '';
        $('sge-m-sub').textContent = editar ? t('editarSub', { fecha: d.creadoTxt }) : t('nuevoSub');
        $('sge-m-ico-path').setAttribute('d', editar ? 'M4 20h4L19 9l-4-4L4 16z' : 'M12 5v14M5 12h14');
        const guardar = $('sge-m-guardar');
        guardar.textContent = t(editar ? 'guardar' : 'crear'); guardar.disabled = false;
        const del = $('sge-m-eliminar'); if (del) del.hidden = !editar;
        st.inicial = valores();            // foto del formulario ya poblado (para detectar cambios)
        abrirModalConAnimacion('modal-manual', event);
        setTimeout(() => fProblema.focus(), 50);
    }
    window.abrirModalManual = event => abrir('nuevo', null, event);
    window.editarManual = function (event, id) {
        if (event && event.preventDefault) event.preventDefault();
        const tr = filaDe(id);
        if (!tr || !puedeEditar()) return;
        abrir('editar', tr, event);
    };

    function cerrarModal() {
        const disparador = st && st.disparador;
        if (st) st.nuevas.forEach(n => URL.revokeObjectURL(n.url));
        st = null;
        cerrarModalConAnimacion('modal-manual', () => {
            if (disparador && document.body.contains(disparador)) disparador.focus();
        });
    }
    function intentarCerrar() {
        if (!st) return;
        if (haySinGuardar()) abrirDescartar(); else cerrarModal();
    }
    $('sge-m-cerrar').addEventListener('click', intentarCerrar);
    $('sge-m-cancelar').addEventListener('click', intentarCerrar);
    modal.addEventListener('mousedown', e => { if (e.target === modal) intentarCerrar(); });

    // — ¿Descartar cambios? —
    function abrirDescartar() {
        $('sge-d-tx').textContent = t(st.modo === 'editar' ? 'descartarEditar' : 'descartarNuevo');
        abrirModalConAnimacion('modal-descartar');
        setTimeout(() => $('sge-d-seguir').focus(), 50);        // la opción segura primero
    }
    function cerrarDescartar() { cerrarModalConAnimacion('modal-descartar'); }
    $('sge-d-seguir').addEventListener('click', () => { cerrarDescartar(); setTimeout(() => fProblema.focus(), 140); });
    $('sge-d-descartar').addEventListener('click', () => { cerrarDescartar(); cerrarModal(); });
    $('modal-descartar').addEventListener('mousedown', e => { if (e.target === $('modal-descartar')) $('sge-d-seguir').click(); });

    // — Guardar —
    function validar() {
        limpiarErrores();
        let primero = null;
        if (!fProblema.value.trim()) { marcar(fProblema, 'sge-err-problema'); primero = primero || fProblema; }
        if (!st.resp || rInput.value.trim()) { marcar(combo, 'sge-err-resp'); primero = primero || rInput; }
        const f = getFecha();
        if (f && f !== st.fechaInicial && f < st.min) {
            marcar($('sge-fechaw'), 'sge-err-fecha', t('fechaMin', { fecha: dmy(st.min) }));
            primero = primero || document.querySelector('#dp-sm-fecha .dp-control');
        }
        if (primero) { primero.focus(); return false; }
        return true;
    }
    async function guardar() {
        if (!st || !validar()) return;
        const btn = $('sge-m-guardar');
        btn.disabled = true; btn.textContent = t('guardando');
        const editar = st.modo === 'editar';
        const url = editar ? `${URL_SM_EDIT}${st.id}/` : URL_SM_ADD;
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_SM },
                body: JSON.stringify({
                    problema: fProblema.value.trim(), accion: fAccion.value.trim(), responsable: st.resp,
                    fecha_compromiso: getFecha(), estatus: $('sm-estatus').value, notas: fNotas.value.trim(),
                    area_id: AREA_ID_SM || null,
                }),
            });
            const data = await r.json();
            if (!data.ok) { showToast({ title: SM_ERROR_GUARDAR, description: data.error || window.TXT_REVISA_CONEXION }, 'error'); btn.disabled = false; btn.textContent = t(editar ? 'guardar' : 'crear'); return; }
            const segId = data.id;
            if (st.nuevas.length) {
                const fd = new FormData();
                st.nuevas.forEach(n => fd.append('imagenes', n.file));
                await fetch(`/mto/seguimiento/manual/${segId}/imagenes/subir/`, { method: 'POST', headers: { 'X-CSRFToken': CSRF_SM }, body: fd });
            }
            for (const imgId of st.borrar) {
                await fetch(`/mto/seguimiento/imagen/eliminar/${imgId}/`, { method: 'POST', headers: { 'X-CSRFToken': CSRF_SM } });
            }
            guardarAviso(editar ? t('guardadoToast') : t('creadoToast', { orden: data.no_orden }), segId);
            st.inicial = valores();       // ya se guardó: no pedir confirmación al cerrar
            window.location.reload();
        } catch (e) {
            showToast({ title: SM_ERROR_GUARDAR, description: window.TXT_REVISA_CONEXION }, 'error');
            btn.disabled = false; btn.textContent = t(editar ? 'guardar' : 'crear');
        }
    }
    $('sge-m-guardar').addEventListener('click', guardar);
    const btnEliminarModal = $('sge-m-eliminar');
    if (btnEliminarModal) btnEliminarModal.addEventListener('click', e => { if (st) window.confirmarEliminarManual(e, st.id); });

    // ═════════════════════════ Eliminar ═════════════════════════
    let delId = null;
    window.confirmarEliminarManual = function (event, id) {
        delId = id;
        const tr = filaDe(id);
        $('sge-del-tx').textContent = t('eliminarMsg', { orden: tr ? tr.dataset.orden : '' });
        abrirModalConAnimacion('modal-confirm-del', event);
        setTimeout(() => { const b = document.querySelector('#modal-confirm-del .sge-dlg-btns button'); if (b) b.focus(); }, 50);
    };
    window.cerrarModalDel = function () { cerrarModalConAnimacion('modal-confirm-del'); delId = null; };
    window.ejecutarEliminar = function () {
        const id = delId;
        if (!id) return;
        const tr = filaDe(id);
        const orden = tr ? tr.dataset.orden : '';
        fetch(`${URL_SM_DEL}${id}/`, { method: 'POST', headers: { 'X-CSRFToken': CSRF_SM } })
            .then(r => r.json())
            .then(data => {
                if (!data.ok) { showToast({ title: SM_ERROR_ELIMINAR, description: data.error || window.TXT_REVISA_CONEXION }, 'error'); return; }
                guardarAviso(t('eliminadoToast', { orden }), '');
                if (st) st.inicial = valores();
                window.location.reload();
            })
            .catch(() => showToast({ title: SM_ERROR_ELIMINAR, description: window.TXT_REVISA_CONEXION }, 'error'));
    };
    $('modal-confirm-del').addEventListener('mousedown', e => { if (e.target === $('modal-confirm-del')) window.cerrarModalDel(); });

    // ═════════════════════════ Teclado y foco del modal ═════════════════════════
    function atrapar(e, contenedor) {
        const foco = Array.from(contenedor.querySelectorAll(
            'button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.closest('[hidden]') && el.offsetParent !== null);
        if (!foco.length) return;
        const primero = foco[0], ultimo = foco[foco.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }
    document.addEventListener('keydown', e => {
        if (modalAbierto('modal-imagenes-seg')) return;                   // el visor maneja sus teclas
        if (modalAbierto('modal-confirm-del')) {
            if (e.key === 'Escape') { e.preventDefault(); window.cerrarModalDel(); }
            else if (e.key === 'Tab') atrapar(e, document.querySelector('#modal-confirm-del .sge-dlg'));
            return;
        }
        if (modalAbierto('modal-descartar')) {
            if (e.key === 'Escape') { e.preventDefault(); $('sge-d-seguir').click(); }
            else if (e.key === 'Tab') atrapar(e, document.querySelector('#modal-descartar .sge-dlg'));
            return;
        }
        if (!modalAbierto('modal-manual') || !st) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            if (listaAbierta()) cerrarLista(); else intentarCerrar();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); guardar();
        } else if (e.key === 'Tab') {
            atrapar(e, modal.querySelector('.sge-modal'));
        }
    });

    // Llegada desde Backlog (?abrir=<id>): abre el formulario de ese correctivo.
    (function abrirDesdeUrl() {
        if (window.matchMedia('(max-width: 1023px)').matches) return;     // en celular lo atiende seguimientos_movil.js
        const url = new URL(window.location.href);
        const id = url.searchParams.get('abrir');
        if (!id) return;
        url.searchParams.delete('abrir');                 // para que recargar no lo reabra
        history.replaceState(null, '', url);
        // Se espera a DOMContentLoaded: abrirModalConAnimacion (base_menu.html) se define después de los scripts de la página.
        document.addEventListener('DOMContentLoaded', () => {
            if (filaDe(id) && puedeEditar()) window.editarManual(null, id);
        });
    })();

})();
