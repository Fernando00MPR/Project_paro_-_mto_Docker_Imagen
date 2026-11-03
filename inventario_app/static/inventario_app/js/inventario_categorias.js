/* inventario_categorias.js — Modal "Categorías de refacciones" de escritorio (≥768px).
   Datos en #iv-cats-datos (los mismos de la hoja de celular: id, es, en, n). Agrega y edita con
   crear/editar_categoria_refaccion y elimina con eliminar_categoria_refaccion (solo si no tiene
   refacciones). Si algo cambió, al cerrar recarga la lista para que filtros y chips se actualicen.
   Expone window.iveCats.abrir(ev). */

(function () {
    const fondo = document.getElementById('ive-cats');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const caja = fondo.querySelector('.ive-cats');
    const T = (window.IVE_CFG || {}).i18n || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const url = (clave, id) => fondo.dataset[clave].replace('/0/', '/' + id + '/');
    const SVG_LAPIZ = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>';
    const SVG_BASURA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

    let cats = null;          // se leen al abrir: #iv-cats-datos va al final de la página
    let editando = null;      // id de la categoría en edición en línea
    let nueva = null;         // id recién agregada (se resalta)
    let cambios = false;      // si hubo cambios, al cerrar se recarga la lista
    let disparador = null;

    // Repetida: compara español e inglés sin mayúsculas ni acentos
    const existe = (es, en, salvo) => cats.some(c => c.id !== salvo &&
        [norm(c.es), norm(c.en)].some(x => x && (x === norm(es) || (en && x === norm(en)))));

    function enviar(dest, datos) {
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', caja.querySelector('[name=csrfmiddlewaretoken]').value);
        Object.keys(datos).forEach(k => fd.append(k, datos[k]));
        return fetch(dest, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
            .then(r => r.json())
            .catch(() => ({ ok: false, error: T.errorRed }));
    }

    // ── Lista ──
    function celda(clase, texto) {
        const td = document.createElement('td');
        if (clase) td.className = clase;
        td.textContent = texto;
        return td;
    }
    function boton(clase, svg, etiqueta) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = clase; b.innerHTML = svg;
        b.setAttribute('aria-label', etiqueta); b.title = etiqueta;
        return b;
    }
    function fila(c) {
        const tr = document.createElement('tr');
        tr.dataset.id = c.id;
        if (c.id === nueva) tr.className = 'ive-cats-recien';
        tr.appendChild(celda('es', c.es));
        const en = celda('en', c.en || T.catsSinIngles);
        if (!c.en) en.classList.add('vacio');
        tr.appendChild(en);
        tr.appendChild(celda('num', String(c.n)));
        const acc = document.createElement('td');
        acc.className = 'acc';
        const ed = boton('ive-ico-btn', SVG_LAPIZ, t('catsEditar', { nombre: c.es }));
        ed.addEventListener('click', () => { editando = c.id; nueva = null; pintar(); });
        // Con refacciones no se elimina: aria-disabled (no disabled) para que el tooltip se vea
        const el = boton('ive-ico-btn ive-cats-elim', SVG_BASURA, c.n ? T.catsTieneRef : t('catsEliminar', { nombre: c.es }));
        if (c.n) el.setAttribute('aria-disabled', 'true');
        else el.addEventListener('click', () => confirmarEliminar(c, el));
        acc.append(ed, el);
        tr.appendChild(acc);
        return tr;
    }
    function filaEdicion(c) {
        const tr = document.createElement('tr');
        tr.className = 'ive-cats-editando';
        tr.dataset.id = c.id;
        const entrada = (valor, etiqueta, clase) => {
            const i = document.createElement('input');
            i.className = 'ive-cats-in ' + clase; i.maxLength = 100; i.autocomplete = 'off';
            i.value = valor; i.setAttribute('aria-label', etiqueta);
            return i;
        };
        const inEs = entrada(c.es, T.catsNombreEs, 'es-in'), inEn = entrada(c.en, T.catsNombreEn, '');
        const err = document.createElement('div');
        err.className = 'ive-ed-err'; err.hidden = true; err.setAttribute('role', 'alert');
        const tdEs = document.createElement('td'); tdEs.append(inEs, err);
        const tdEn = document.createElement('td'); tdEn.append(inEn);
        const tdB = document.createElement('td'); tdB.colSpan = 2;
        const botones = document.createElement('div'); botones.className = 'botones';
        const no = document.createElement('button'); no.type = 'button'; no.className = 'ive-btn'; no.textContent = T.cancelar;
        const si = document.createElement('button'); si.type = 'button'; si.className = 'ive-btn ive-btn-pri'; si.textContent = T.catsGuardar;
        botones.append(no, si); tdB.appendChild(botones);
        tr.append(tdEs, tdEn, tdB);

        const fallo = msg => { err.textContent = msg; err.hidden = false; inEs.classList.add('mal'); inEs.focus(); };
        const cancelar = () => { editando = null; pintar(); enfocarFila(c.id, 0); };
        const guardar = () => {
            const vEs = inEs.value.trim(), vEn = inEn.value.trim();
            if (!vEs) return fallo(T.catsObligatorio);
            if (existe(vEs, vEn, c.id)) return fallo(T.catsExiste);
            if (vEs === c.es && vEn === c.en) return cancelar();
            si.disabled = true;
            enviar(url('urlEditar', c.id), { nombre_es: vEs, nombre_en: vEn }).then(d => {
                si.disabled = false;
                if (!d.ok) return fallo(d.error || T.errorRed);
                Object.assign(c, { es: d.es, en: d.en });
                cambios = true;
                cancelar();
                if (window.showToast) showToast(T.catsGuardada, 'success');
            });
        };
        no.addEventListener('click', cancelar);
        si.addEventListener('click', guardar);
        tr.addEventListener('keydown', e => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); guardar(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelar(); }
        });
        [inEs, inEn].forEach(i => i.addEventListener('input', () => { err.hidden = true; inEs.classList.remove('mal'); }));
        setTimeout(() => { inEs.focus(); inEs.select(); });
        return tr;
    }
    function enfocarFila(id, i) {
        const b = $('ive-cats-filas').querySelectorAll('tr[data-id="' + id + '"] .ive-ico-btn')[i];
        if (b) b.focus();
    }
    function pintar() {
        const qTxt = $('ive-cats-q').value.trim(), q = norm(qTxt);
        const visibles = cats
            .filter(c => !q || norm(c.es).includes(q) || norm(c.en).includes(q))
            .sort((a, b) => a.es.localeCompare(b.es, undefined, { sensitivity: 'base' }));
        $('ive-cats-n').textContent = t('catsExistentes', { n: cats.length });
        $('ive-cats-filas').replaceChildren(...visibles.map(c => (c.id === editando ? filaEdicion(c) : fila(c))));
        const vacio = $('ive-cats-vacio');
        vacio.hidden = visibles.length > 0;
        vacio.textContent = cats.length ? t('catsSinRes', { q: qTxt }) : T.catsVacio;
    }
    $('ive-cats-q').addEventListener('input', () => { editando = null; pintar(); });

    // ── Agregar ──
    const inEs = $('ive-cats-es'), inEn = $('ive-cats-en'), errNueva = $('ive-cats-err');
    const falloNueva = msg => { errNueva.textContent = msg; errNueva.hidden = false; inEs.classList.add('mal'); inEs.focus(); };
    [inEs, inEn].forEach(i => i.addEventListener('input', () => { errNueva.hidden = true; inEs.classList.remove('mal'); }));
    $('ive-cats-nueva').addEventListener('submit', e => {
        e.preventDefault();
        const es = inEs.value.trim(), en = inEn.value.trim();
        if (!es) return falloNueva(T.catsObligatorio);
        if (existe(es, en)) return falloNueva(T.catsExiste);
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        enviar(fondo.dataset.urlCrear, { nombre_es: es, nombre_en: en }).then(d => {
            btn.disabled = false;
            if (!d.ok) return falloNueva(d.error || T.errorRed);
            cats.push({ id: d.id, es: d.es, en: d.en, n: 0 });
            cambios = true; nueva = d.id; editando = null;
            inEs.value = ''; inEn.value = ''; $('ive-cats-q').value = '';
            pintar();
            const tr = $('ive-cats-filas').querySelector('tr[data-id="' + d.id + '"]');
            if (tr) tr.scrollIntoView({ block: 'nearest' });
            inEs.focus();
        });
    });

    // ── Eliminar (pide confirmación) ──
    const conf = $('ive-cats-conf');
    let porEliminar = null, botonEliminar = null;
    function confirmarEliminar(c, b) {
        porEliminar = c; botonEliminar = b;
        $('ive-cats-conf-t').textContent = t('catsEliminarT', { nombre: c.es });
        conf.hidden = false;
        $('ive-cats-conf-no').focus();
    }
    function cerrarConf() {
        conf.hidden = true;
        if (botonEliminar && botonEliminar.isConnected) botonEliminar.focus();
        porEliminar = botonEliminar = null;
    }
    $('ive-cats-conf-no').addEventListener('click', cerrarConf);
    $('ive-cats-conf-si').addEventListener('click', () => {
        const c = porEliminar;
        if (!c) return;
        $('ive-cats-conf-si').disabled = true;
        enviar(url('urlEliminar', c.id), {}).then(d => {
            $('ive-cats-conf-si').disabled = false;
            conf.hidden = true; porEliminar = botonEliminar = null;
            if (!d.ok) { if (window.showToast) showToast(d.error || T.errorRed, 'error'); return; }
            cats = cats.filter(x => x.id !== c.id);
            cambios = true;
            pintar();
            $('ive-cats-q').focus();
        });
    });

    // ── Abrir / cerrar ──
    function abrir(ev) {
        disparador = ev && ev.currentTarget || document.activeElement;
        if (!cats) {
            try { cats = JSON.parse($('iv-cats-datos').textContent) || []; } catch (e) { cats = []; }
        }
        editando = nueva = null;
        inEs.value = inEn.value = $('ive-cats-q').value = '';
        errNueva.hidden = true; inEs.classList.remove('mal');
        conf.hidden = true;
        pintar();
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        inEs.focus();
    }
    function cerrar() {
        if (fondo.hidden) return;
        if (cambios) { location.reload(); return; }   // filtros, chips y conteos se arman en el servidor
        fondo.hidden = true;
        document.body.style.overflow = '';
        if (disparador && disparador.focus) disparador.focus();
    }
    caja.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });

    // ── Teclado: Escape y foco atrapado ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            if (!conf.hidden) cerrarConf();
            else if (editando !== null) { const id = editando; editando = null; pintar(); enfocarFila(id, 0); }
            else cerrar();
            return;
        }
        if (e.key !== 'Tab') return;
        const zona = conf.hidden ? caja : conf;
        const f = [...zona.querySelectorAll('button, input:not([type=hidden])')]
            .filter(el => !el.disabled && el.offsetParent !== null && (conf.hidden ? !conf.contains(el) : true));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });

    window.iveCats = { abrir };
})();
