/* inventario_editor.js — Modal "Editar / Nueva refacción" de escritorio (≥768px).
   Datos de cada fila en #ive-ed-datos (json_script de la vista). Guarda por AJAX en
   form_refaccion (errores por campo); al terminar recarga la lista, muestra el aviso y
   resalta la fila 2 s. Fotos: hasta 2 (JPG/PNG ≤ 5 MB): clic, arrastrar o pegar.
   Expone window.iveEditor.{nueva, editar(pk), duplicar(pk)}. */

(function () {
    const fondo = document.getElementById('ive-ed');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const form = $('ive-ed-form');
    const T = (window.IVE_CFG || {}).i18n || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const DATOS = JSON.parse($('ive-ed-datos').textContent);
    const CAMPOS = ['nombre', 'no_item', 'unidad', 'categoria', 'descripcion', 'stock_actual', 'stock_minimo', 'stock_maximo', 'ubicacion', 'costo', 'proveedor'];
    const MAX_FOTOS = 2, MAX_BYTES = 5 * 1024 * 1024;

    let actual = null;        // datos de la refacción en edición (null = nueva)
    let fotos = [];           // [{id?, url, file?}]
    let quitar = [];          // ids de fotos guardadas que se quitan
    let sel = 0;              // foto que se ve grande
    let inicial = '';         // "firma" para saber si hay cambios sin guardar
    let disparador = null;

    // ── Abrir / cerrar ──
    function abrir(datos, modo, ev) {
        disparador = ev && ev.currentTarget || document.activeElement;
        actual = modo === 'editar' ? datos : null;
        form.classList.toggle('nueva', modo !== 'editar');
        $('ive-ed-t').textContent = modo === 'editar' ? T.editar : T.nueva;
        $('ive-ed-titem').textContent = modo === 'editar' ? datos.no_item : '';
        $('ive-ed-sub').textContent = modo === 'editar' ? t('creada', { fecha: datos.creado, hace: datos.modificado_hace }) : '';
        $('ive-ed-sub').hidden = modo !== 'editar';
        $('ive-ed-guardar').textContent = modo === 'editar' ? T.guardar : T.crear;
        const elim = $('ive-ed-elim');
        if (elim) elim.hidden = modo !== 'editar';

        const d = datos || {};
        $('ive-ed-nombre').value = d.nombre || '';
        $('ive-ed-no_item').value = modo === 'duplicar' ? '' : (d.no_item || '');
        $('ive-ed-unidad').value = d.unidad || 'pza';
        $('ive-ed-categoria').value = d.categoria || '';
        $('ive-ed-descripcion').value = d.descripcion || '';
        $('ive-ed-stock_actual').value = d.stock_actual != null ? d.stock_actual : 0;
        $('ive-ed-stock_minimo').value = d.stock_minimo != null ? d.stock_minimo : 0;
        $('ive-ed-stock_maximo').value = d.stock_maximo ? d.stock_maximo : '';
        $('ive-ed-ubicacion').value = d.ubicacion || '';
        $('ive-ed-costo').value = d.costo || '';
        $('ive-ed-proveedor').value = d.proveedor || '';
        ponerCrit(d.criticidad || 'no_critico');

        // Área: la de la refacción; si es nueva, la del filtro; si no hay filtro, se elige.
        const area = d.area || form.dataset.area || '';
        $('ive-ed-area').value = area;
        $('ive-ed-area-fila').hidden = !!area;

        fotos = modo === 'editar' ? (d.fotos || []).map(f => ({ id: f.id, url: f.url })) : [];
        quitar = []; sel = 0;
        limpiarErrores();
        pintarFotos(); pintarStock(); contar();
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        inicial = firma();
        $('ive-ed-nombre').focus();
    }
    function cerrar(forzar) {
        if (fondo.hidden) return;
        if (!forzar && firma() !== inicial) {
            confirmar(T.descartarT, T.descartarD, T.seguir, T.descartar, () => cerrar(true));
            return;
        }
        fondo.hidden = true;
        $('ive-ed-conf').hidden = true;
        document.body.style.overflow = '';
        fotos.forEach(f => { if (f.file) URL.revokeObjectURL(f.url); });
        if (disparador && disparador.focus) disparador.focus();
    }
    const firma = () => JSON.stringify([CAMPOS.map(c => ($('ive-ed-' + c) || {}).value), $('ive-ed-crit').value,
        $('ive-ed-area').value, fotos.map(f => f.id || f.url), quitar]);

    form.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrar(false)));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(false); });

    // ── Criticidad (segmentado) ──
    const segs = [...form.querySelectorAll('.ive-ed-seg [data-crit]')];
    function ponerCrit(v) {
        $('ive-ed-crit').value = v;
        segs.forEach(b => { const si = b.dataset.crit === v; b.setAttribute('aria-checked', String(si)); b.tabIndex = si ? 0 : -1; });
    }
    segs.forEach(b => {
        b.addEventListener('click', () => ponerCrit(b.dataset.crit));
        b.addEventListener('keydown', e => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
            e.preventDefault();
            const otro = segs.find(x => x !== b);
            ponerCrit(otro.dataset.crit); otro.focus();
        });
    });

    // ── Descripción ──
    const contar = () => { $('ive-ed-cont').textContent = $('ive-ed-descripcion').value.length + ' / 300'; };
    $('ive-ed-descripcion').addEventListener('input', contar);

    // ── Stock en vivo (mismas reglas que la lista: bajo = stock ≤ mínimo, sobre = stock ≥ máximo) ──
    const num = id => { const v = parseInt($(id).value, 10); return isNaN(v) || v < 0 ? 0 : v; };
    function pintarStock() {
        const st = num('ive-ed-stock_actual'), mn = num('ive-ed-stock_minimo'), mx = num('ive-ed-stock_maximo');
        const estado = st === 0 ? 'sin' : st <= mn ? 'bajo' : (mx > 0 && st >= mx) ? 'sobre' : 'ok';
        const chip = $('ive-ed-estado');
        chip.className = 'ive-estado ' + estado;
        chip.querySelector('b').textContent = T['estado_' + estado];
        $('ive-ed-stock_actual').classList.toggle('mal', estado === 'sin' || estado === 'bajo');
        const escala = Math.max(mx, mn, st, 1) * 1.1;
        const barra = $('ive-ed-barra-i');
        barra.className = estado;
        barra.style.width = Math.min(100, st / escala * 100) + '%';
        const marca = $('ive-ed-barra-min'), etq = $('ive-ed-esc-min');
        const pctMin = mn / escala * 100, escMax = $('ive-ed-esc-max');
        marca.hidden = etq.hidden = !mn;
        marca.style.left = etq.style.left = pctMin + '%';
        etq.style.transform = pctMin > 85 ? 'translateX(-100%)' : '';   // pegado a la derecha: no se sale de la tarjeta
        etq.textContent = t('min', { n: mn });
        escMax.textContent = t('max', { n: mx });
        escMax.hidden = !mx;                                             // sin máximo ya lo dice el aviso de abajo
        if (!etq.hidden && !escMax.hidden) {                             // mínimo muy cerca del máximo: se oculta su etiqueta
            const a = etq.getBoundingClientRect(), b = escMax.getBoundingClientRect();
            if (b.width && a.right + 6 > b.left) etq.hidden = true;
        }
        $('ive-ed-aviso-max').hidden = mx > 0;
        const malMax = mx > 0 && mx < mn;
        $('ive-ed-stock_maximo').classList.toggle('mal', malMax);
        error('stock_maximo', malMax ? T.maxMin : '');
        return !malMax;
    }
    ['ive-ed-stock_actual', 'ive-ed-stock_minimo', 'ive-ed-stock_maximo'].forEach(id => $(id).addEventListener('input', pintarStock));

    // Costo: al salir del campo se deja con 2 decimales
    $('ive-ed-costo').addEventListener('blur', e => {
        const v = parseFloat(e.target.value.replace(/[$,\s]/g, ''));
        if (!isNaN(v) && v >= 0) e.target.value = v.toFixed(2);
    });

    // ── Fotos (máximo 2) ──
    const archivo = $('ive-ed-archivo');
    let reemplazar = false;
    function pintarFotos() {
        const f = fotos[sel], img = $('ive-ed-foto-img');
        img.hidden = !f;
        if (f) img.src = f.url;
        $('ive-ed-foto-vacia').hidden = !!f;
        $('ive-ed-foto').classList.toggle('vacia', !f);
        $('ive-ed-foto-acc').hidden = !f;
        const tiras = $('ive-ed-tiras');
        tiras.replaceChildren();
        fotos.forEach((x, i) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ive-ed-tira' + (i === sel ? ' sel' : '');
            b.setAttribute('aria-label', t('verFoto', { n: i + 1 }));
            b.setAttribute('aria-pressed', String(i === sel));
            b.innerHTML = '<img alt="">'; b.firstChild.src = x.url;
            b.addEventListener('click', () => { sel = i; pintarFotos(); });
            tiras.appendChild(b);
        });
        if (fotos.length && fotos.length < MAX_FOTOS) {
            const mas = document.createElement('button');
            mas.type = 'button'; mas.className = 'ive-ed-tira mas'; mas.textContent = '+';
            mas.setAttribute('aria-label', T.agregarOtra);
            mas.addEventListener('click', () => { reemplazar = false; archivo.click(); });
            tiras.appendChild(mas);
        }
        tiras.hidden = !fotos.length;
    }
    function agregar(file) {
        error('imagenes', '');
        if (!file) return;
        if (['image/jpeg', 'image/png'].indexOf(file.type) === -1 || file.size > MAX_BYTES) { error('imagenes', T.fotoInvalida); return; }
        const nueva = { url: URL.createObjectURL(file), file };
        if (reemplazar && fotos[sel]) {
            const vieja = fotos[sel];
            if (vieja.id) quitar.push(vieja.id); else URL.revokeObjectURL(vieja.url);
            fotos[sel] = nueva;
        } else if (fotos.length < MAX_FOTOS) {
            fotos.push(nueva); sel = fotos.length - 1;
        } else {
            error('imagenes', T.maxFotos); return;
        }
        pintarFotos();
    }
    $('ive-ed-foto').addEventListener('click', () => { reemplazar = !!fotos[sel]; archivo.click(); });
    $('ive-ed-foto').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('ive-ed-foto').click(); } });
    $('ive-ed-cambiar').addEventListener('click', () => { reemplazar = true; archivo.click(); });
    $('ive-ed-quitar').addEventListener('click', () => {
        const f = fotos[sel]; if (!f) return;
        if (f.id) quitar.push(f.id); else URL.revokeObjectURL(f.url);
        fotos.splice(sel, 1); sel = Math.max(0, sel - 1);
        pintarFotos();
    });
    archivo.addEventListener('change', () => { agregar(archivo.files[0]); archivo.value = ''; });
    const zona = $('ive-ed-foto');
    ['dragenter', 'dragover'].forEach(n => zona.addEventListener(n, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(n => zona.addEventListener(n, () => zona.classList.remove('arrastrando')));
    zona.addEventListener('drop', e => { e.preventDefault(); reemplazar = false; agregar(e.dataTransfer.files[0]); });
    form.addEventListener('paste', e => {
        const item = [...(e.clipboardData || {}).items || []].find(i => i.type.indexOf('image/') === 0);
        if (item) { e.preventDefault(); reemplazar = false; agregar(item.getAsFile()); }
    });

    // ── Errores por campo ──
    function error(campo, msg) {
        const el = form.querySelector('[data-err="' + campo + '"]');
        if (el) { el.textContent = msg || ''; el.hidden = !msg; }
        const inp = $('ive-ed-' + (campo === 'costo_unitario' ? 'costo' : campo));
        if (inp) { inp.classList.toggle('mal', !!msg); if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    }
    function limpiarErrores() { form.querySelectorAll('[data-err]').forEach(el => { el.hidden = true; el.textContent = ''; }); form.querySelectorAll('.mal').forEach(el => el.classList.remove('mal')); }

    // ── Guardar ──
    let guardando = false;
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (guardando) return;
        limpiarErrores();
        let ok = pintarStock();
        if (!$('ive-ed-nombre').value.trim()) { error('nombre', T.obligatorio); ok = false; }
        if (!$('ive-ed-no_item').value.trim()) { error('no_item', T.obligatorio); ok = false; }
        const area = $('ive-ed-area').value;
        if (!area) { error('area', T.elegirArea); ok = false; }
        if (!ok) { const m = form.querySelector('.mal, [data-err]:not([hidden])'); if (m && m.focus) m.focus(); return; }

        $('ive-ed-area-h').value = area;
        const fd = new FormData(form);
        fotos.filter(f => f.file).forEach(f => fd.append('imagenes', f.file));
        quitar.forEach(id => fd.append('imagenes_quitar', id));
        guardando = true;
        $('ive-ed-guardar').disabled = true;
        fetch(actual ? actual.url_guardar : form.dataset.urlNueva, {
            method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin',
        }).then(r => r.json().then(j => ({ ok: r.ok, j }))).then(({ ok: bien, j }) => {
            if (bien && j.ok) {
                try {
                    sessionStorage.setItem('ive-toast', T.guardada);
                    sessionStorage.setItem('ive-resaltar', String(j.pk));
                } catch (er) { /* sin almacenamiento */ }
                inicial = firma();
                location.reload();
                return;
            }
            const errores = j.errores || {};
            Object.keys(errores).forEach(c => (c === 'general' ? window.showToast && showToast({ title: T.errorGuardarTit, description: errores[c] }, 'error') : error(c, errores[c])));
            const m = form.querySelector('.mal'); if (m) m.focus();
            guardando = false; $('ive-ed-guardar').disabled = false;
        }).catch(() => {
            if (window.showToast) showToast({ title: T.errorGuardarTit, description: window.TXT_REVISA_CONEXION }, 'error');
            guardando = false; $('ive-ed-guardar').disabled = false;
        });
    });

    // ── Eliminar (pide confirmación) ──
    const elim = $('ive-ed-elim');
    if (elim) elim.addEventListener('click', () => {
        if (!actual) return;
        confirmar(t('eliminarT', { nombre: actual.nombre, item: actual.no_item }), T.eliminarD, T.cancelar, T.eliminar, () => {
            const f = $('ive-ed-elim-form');
            f.action = actual.url_eliminar;
            $('ive-ed-elim-volver').value = location.search;
            f.submit();
        });
    });

    // ── Confirmación dentro del modal ──
    const conf = $('ive-ed-conf');
    let alConfirmar = null;
    function confirmar(titulo, desc, no, si, fn) {
        $('ive-ed-conf-t').textContent = titulo;
        $('ive-ed-conf-d').textContent = desc;
        $('ive-ed-conf-no').textContent = no;
        $('ive-ed-conf-si').textContent = si;
        alConfirmar = fn;
        conf.hidden = false;
        $('ive-ed-conf-no').focus();
    }
    const cerrarConf = () => { conf.hidden = true; alConfirmar = null; };
    $('ive-ed-conf-no').addEventListener('click', cerrarConf);
    $('ive-ed-conf-si').addEventListener('click', () => { const fn = alConfirmar; cerrarConf(); if (fn) fn(); });

    // ── Teclado: Escape, Ctrl + Enter y foco atrapado ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); if (!conf.hidden) cerrarConf(); else cerrar(false); return; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (conf.hidden) form.requestSubmit(); return; }
        if (e.key !== 'Tab') return;
        const caja = conf.hidden ? form : conf;
        const f = [...caja.querySelectorAll('button, input:not([type=hidden]), select, textarea, [tabindex="0"]')]
            .filter(el => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0 && (conf.hidden ? !conf.contains(el) : true));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });

    // ── Después de guardar: aviso y fila resaltada 2 s ──
    try {
        const aviso = sessionStorage.getItem('ive-toast'), pk = sessionStorage.getItem('ive-resaltar');
        sessionStorage.removeItem('ive-toast'); sessionStorage.removeItem('ive-resaltar');
        if (aviso && window.showToast) showToast(aviso, 'success');
        const fila = pk && document.querySelector('#ive-tabla tr[data-pk="' + pk + '"]');
        if (fila) {
            fila.classList.add('ive-resaltada');
            fila.scrollIntoView({ block: 'center' });
            setTimeout(() => fila.classList.remove('ive-resaltada'), 2000);
        }
    } catch (e) { /* sin almacenamiento */ }

    window.iveEditor = {
        nueva: ev => abrir(null, 'nueva', ev),
        editar: (pk, ev) => DATOS[pk] && abrir(DATOS[pk], 'editar', ev),
        duplicar: (pk, ev) => DATOS[pk] && abrir(DATOS[pk], 'duplicar', ev),
    };
})();
