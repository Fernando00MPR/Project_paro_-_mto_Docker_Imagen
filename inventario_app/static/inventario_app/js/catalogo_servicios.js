/* catalogo_servicios.js — Modal "Catálogo de servicios" de Seguimiento de servicios (escritorio).
   Datos en #ssv-catalogo (id, no_item, nombre, tipo, tipo_id, color, n) y #ssv-tipos. Agrega,
   edita en línea y elimina (solo si no tiene seguimientos) con crear/editar/eliminar_servicio_catalogo.
   Si se editó o eliminó algo, al cerrar recarga la lista (los seguimientos copian nombre y tipo).
   Expone window.ssvCatalogo.abrir(ev, {prefill, alCrear}): desde el modal de seguimiento se abre
   con el texto buscado y, al crear, le pasa el servicio nuevo (sin recargar). */

(function () {
    const fondo = document.getElementById('ssv-cat');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const caja = fondo.querySelector('.ive-cats');
    const T = (window.SRD_CFG || {}).i18n || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const url = (clave, id) => fondo.dataset[clave].replace('/0/', '/' + id + '/');
    const leer = id => { try { return JSON.parse($(id).textContent) || []; } catch (e) { return []; } };
    const SVG_LAPIZ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';
    const SVG_BASURA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

    let servicios = null;     // se leen al abrir: #ssv-catalogo va al final de la página
    const tipos = leer('ssv-tipos');
    let editando = null, nuevo = null, cambios = false, disparador = null, alCrear = null;

    function enviar(dest, datos) {
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', caja.querySelector('[name=csrfmiddlewaretoken]').value);
        Object.keys(datos).forEach(k => fd.append(k, datos[k]));
        return fetch(dest, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then(r => r.json())
            .catch(() => ({ ok: false, errores: { general: T.errorRed } }));
    }
    const primerError = d => { const e = d.errores || {}; return e.no_item || e.nombre || e.tipo || e.general || d.error || T.errorRed; };
    const campoError = d => { const e = d.errores || {}; return e.no_item ? 'item' : e.nombre ? 'nombre' : e.tipo ? 'tipo' : 'item'; };

    function chipTipo(s) {
        const c = document.createElement('span');
        c.className = 'ssv-tipo as-c' + s.color;
        c.textContent = s.tipo;
        return c;
    }
    function celda(clase, contenido) {
        const td = document.createElement('td');
        if (clase) td.className = clase;
        if (typeof contenido === 'string') td.textContent = contenido; else td.appendChild(contenido);
        return td;
    }
    function boton(clase, svg, etiqueta) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = clase; b.innerHTML = svg;
        b.setAttribute('aria-label', etiqueta); b.title = etiqueta;
        return b;
    }
    function selectTipos(valor) {
        const s = document.createElement('select');
        s.className = 'ive-cats-in ive-ed-sel';
        tipos.forEach(tp => { const o = new Option(tp.nombre, tp.id); o.selected = tp.id === valor; s.appendChild(o); });
        return s;
    }

    function fila(s) {
        const tr = document.createElement('tr');
        tr.dataset.id = s.id;
        if (s.id === nuevo) tr.className = 'ive-cats-recien';
        tr.appendChild(celda('srd-cod ssv-cat-item', s.no_item));
        tr.appendChild(celda('es', s.nombre));
        tr.appendChild(celda('', chipTipo(s)));
        tr.appendChild(celda('num', String(s.n)));
        const acc = document.createElement('td');
        acc.className = 'acc';
        const ed = boton('ive-ico-btn', SVG_LAPIZ, t('catEditar', { nombre: s.nombre }));
        ed.addEventListener('click', () => { editando = s.id; nuevo = null; pintar(); });
        // Con seguimientos no se elimina: aria-disabled (no disabled) para que el tooltip se vea
        const el = boton('ive-ico-btn ive-cats-elim', SVG_BASURA, s.n ? T.catEnUso : t('catEliminar', { nombre: s.nombre }));
        if (s.n) el.setAttribute('aria-disabled', 'true');
        else el.addEventListener('click', () => confirmarEliminar(s, el));
        acc.append(ed, el);
        tr.appendChild(acc);
        return tr;
    }
    function filaEdicion(s) {
        const tr = document.createElement('tr');
        tr.className = 'ive-cats-editando';
        tr.dataset.id = s.id;
        const entrada = (valor, etiqueta, clase, max) => {
            const i = document.createElement('input');
            i.className = 'ive-cats-in ' + clase; i.maxLength = max; i.autocomplete = 'off';
            i.value = valor; i.setAttribute('aria-label', etiqueta);
            return i;
        };
        const inItem = entrada(s.no_item, T.catNoItem, 'srd-cod es-in', 10), inNom = entrada(s.nombre, T.catNombre, '', 100);
        const selTipo = selectTipos(s.tipo_id);
        selTipo.setAttribute('aria-label', T.catTipo);
        const err = document.createElement('div');
        err.className = 'ive-ed-err'; err.hidden = true; err.setAttribute('role', 'alert');
        const tdItem = document.createElement('td'); tdItem.append(inItem, err);
        const tdNom = document.createElement('td'); tdNom.append(inNom);
        const tdTipo = document.createElement('td'); tdTipo.append(selTipo);
        const tdB = document.createElement('td'); tdB.colSpan = 2;
        const botones = document.createElement('div'); botones.className = 'botones';
        const no = document.createElement('button'); no.type = 'button'; no.className = 'ive-btn'; no.textContent = T.cancelar;
        const si = document.createElement('button'); si.type = 'button'; si.className = 'ive-btn ive-btn-pri'; si.textContent = T.guardar;
        botones.append(no, si); tdB.appendChild(botones);
        tr.append(tdItem, tdNom, tdTipo, tdB);

        const fallo = (msg, inp) => { err.textContent = msg; err.hidden = false; (inp || inItem).classList.add('mal'); (inp || inItem).focus(); };
        const cancelar = () => { editando = null; pintar(); enfocarFila(s.id, 0); };
        const guardar = () => {
            const vItem = inItem.value.trim(), vNom = inNom.value.trim(), vTipo = Number(selTipo.value);
            if (!vItem) return fallo(T.obligatorio, inItem);
            if (!vNom) return fallo(T.obligatorio, inNom);
            if (vItem === s.no_item && vNom === s.nombre && vTipo === s.tipo_id) return cancelar();
            si.disabled = true;
            enviar(url('urlEditar', s.id), { no_item: vItem, nombre: vNom, tipo: vTipo }).then(d => {
                si.disabled = false;
                if (!d.ok) return fallo(primerError(d), { item: inItem, nombre: inNom, tipo: selTipo }[campoError(d)]);
                Object.assign(s, d.servicio);
                cambios = true;
                cancelar();
                if (window.showToast) showToast(T.catGuardado, 'success');
            });
        };
        no.addEventListener('click', cancelar);
        si.addEventListener('click', guardar);
        tr.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelar(); }
        });
        [inItem, inNom, selTipo].forEach(i => i.addEventListener('input', () => { err.hidden = true; [inItem, inNom, selTipo].forEach(x => x.classList.remove('mal')); }));
        setTimeout(() => { inNom.focus(); inNom.select(); });
        return tr;
    }
    function enfocarFila(id, i) {
        const b = $('ssv-cat-filas').querySelectorAll('tr[data-id="' + id + '"] .ive-ico-btn')[i];
        if (b) b.focus();
    }
    function pintar() {
        const qTxt = $('ssv-cat-q').value.trim(), q = norm(qTxt);
        const visibles = servicios
            .filter(s => !q || norm(s.no_item + ' ' + s.nombre + ' ' + s.tipo).includes(q))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: 'base' }));
        $('ssv-cat-n').textContent = t('catExistentes', { n: servicios.length });
        $('ssv-cat-filas').replaceChildren(...visibles.map(s => (s.id === editando ? filaEdicion(s) : fila(s))));
        const vacio = $('ssv-cat-vacio');
        vacio.hidden = visibles.length > 0;
        vacio.textContent = servicios.length ? t('catSinRes', { q: qTxt }) : T.catVacio;
    }
    $('ssv-cat-q').addEventListener('input', () => { editando = null; pintar(); });

    // ── Agregar ──
    const inItem = $('ssv-cat-item'), inNom = $('ssv-cat-nombre'), selTipo = $('ssv-cat-tipo'), errNuevo = $('ssv-cat-err');
    const falloNuevo = (msg, inp) => { errNuevo.textContent = msg; errNuevo.hidden = false; inp.classList.add('mal'); inp.focus(); };
    [inItem, inNom, selTipo].forEach(i => i.addEventListener('input', () => { errNuevo.hidden = true; [inItem, inNom, selTipo].forEach(x => x.classList.remove('mal')); }));
    $('ssv-cat-nueva').addEventListener('submit', e => {
        e.preventDefault();
        const vItem = inItem.value.trim(), vNom = inNom.value.trim(), vTipo = selTipo.value;
        if (!vItem) return falloNuevo(T.obligatorio, inItem);
        if (!vNom) return falloNuevo(T.obligatorio, inNom);
        if (!vTipo) return falloNuevo(T.obligatorio, selTipo);
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        enviar(fondo.dataset.urlCrear, { no_item: vItem, nombre: vNom, tipo: vTipo }).then(d => {
            btn.disabled = false;
            if (!d.ok) return falloNuevo(primerError(d), { item: inItem, nombre: inNom, tipo: selTipo }[campoError(d)]);
            servicios.push(d.servicio);
            if (alCrear) { const fn = alCrear; cerrar(true); fn(d.servicio); return; }   // vuelve al modal de seguimiento
            nuevo = d.servicio.id; editando = null;
            inItem.value = inNom.value = ''; selTipo.value = ''; $('ssv-cat-q').value = '';
            pintar();
            const tr = $('ssv-cat-filas').querySelector('tr[data-id="' + d.servicio.id + '"]');
            if (tr) tr.scrollIntoView({ block: 'nearest' });
            inItem.focus();
        });
    });

    // ── Eliminar (pide confirmación) ──
    const conf = $('ssv-cat-conf');
    let porEliminar = null, botonEliminar = null;
    function confirmarEliminar(s, b) {
        porEliminar = s; botonEliminar = b;
        $('ssv-cat-conf-t').textContent = t('catEliminarT', { nombre: s.nombre });
        conf.hidden = false;
        $('ssv-cat-conf-no').focus();
    }
    function cerrarConf() {
        conf.hidden = true;
        if (botonEliminar && botonEliminar.isConnected) botonEliminar.focus();
        porEliminar = botonEliminar = null;
    }
    $('ssv-cat-conf-no').addEventListener('click', cerrarConf);
    $('ssv-cat-conf-si').addEventListener('click', () => {
        const s = porEliminar;
        if (!s) return;
        $('ssv-cat-conf-si').disabled = true;
        enviar(url('urlEliminar', s.id), {}).then(d => {
            $('ssv-cat-conf-si').disabled = false;
            conf.hidden = true; porEliminar = botonEliminar = null;
            if (!d.ok) { if (window.showToast) showToast({ title: T.errorGuardarTit, description: primerError(d) }, 'error'); return; }
            servicios = servicios.filter(x => x.id !== s.id);
            cambios = true;
            pintar();
            $('ssv-cat-q').focus();
        });
    });

    // ── Abrir / cerrar ──
    function abrir(ev, opciones) {
        const o = opciones || {};
        disparador = ev && ev.currentTarget || document.activeElement;
        if (!servicios) servicios = leer('ssv-catalogo');
        alCrear = o.alCrear || null;
        editando = nuevo = null;
        inItem.value = ''; inNom.value = o.prefill || ''; selTipo.value = '';
        $('ssv-cat-q').value = '';
        errNuevo.hidden = true; [inItem, inNom, selTipo].forEach(x => x.classList.remove('mal'));
        conf.hidden = true;
        pintar();
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        inItem.focus();
    }
    function cerrar(sinRecargar) {
        if (fondo.hidden) return;
        if (cambios && !sinRecargar && !alCrear) { location.reload(); return; }   // la lista copia nombre y tipo
        fondo.hidden = true;
        alCrear = null;
        // Si quedó abierto el modal de seguimiento debajo, el scroll sigue bloqueado
        if (document.getElementById('srd-m') && document.getElementById('srd-m').hidden) document.body.style.overflow = '';
        if (disparador && disparador.focus) disparador.focus();
    }
    caja.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrar(false)));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(false); });

    // ── Teclado: Escape y foco atrapado (va antes que el del modal de seguimiento) ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopImmediatePropagation();
            if (!conf.hidden) cerrarConf();
            else if (editando !== null) { const id = editando; editando = null; pintar(); enfocarFila(id, 0); }
            else cerrar(false);
            return;
        }
        if (e.key !== 'Tab') return;
        e.stopImmediatePropagation();
        const zona = conf.hidden ? caja : conf;
        const f = [...zona.querySelectorAll('button, input:not([type=hidden]), select')]
            .filter(el => !el.disabled && el.offsetParent !== null && (conf.hidden ? !conf.contains(el) : true));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }, true);

    window.ssvCatalogo = { abrir };
})();
