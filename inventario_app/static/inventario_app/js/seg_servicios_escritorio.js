/* seg_servicios_escritorio.js — Seguimiento de servicios, escritorio (35D / 35D-a).
   Lista: tarjetas de estatus, buscador (250 ms), fecha de registro, menú Columnas
   (localStorage columns:segServicios), Excel con las columnas visibles y eliminar con
   confirmación. Modal "Nuevo / Editar seguimiento": servicio del catálogo (o "Agregar al
   catálogo"), cantidad con − / +, motivo, pasos PR → PO → SR con estatus en vivo,
   validaciones y guardado por AJAX (recarga, aviso y fila resaltada 2 s).
   Expone srdModal.{nuevo, editar} y srdEditar / srdEliminar (RowActionButton). */

(function () {
    const raiz = document.getElementById('srd');
    if (!raiz) return;
    const $ = id => document.getElementById(id);
    const CFG = window.SRD_CFG || {};
    const T = CFG.i18n || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);

    // ── Navegar con filtros cambiados (siempre vuelve a la página 1) ──
    function ir(cambios) {
        const url = new URL(location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k] === '' || cambios[k] == null) url.searchParams.delete(k);
            else url.searchParams.set(k, cambios[k]);
        });
        url.searchParams.delete('page');
        location.assign(url);
    }

    // Tarjetas de estatus
    raiz.querySelectorAll('.srd-tab').forEach(b => b.addEventListener('click', () => ir({ estatus: b.dataset.estatus })));

    // Buscador con espera de 250 ms
    const q = $('srd-q');
    let esperaQ;
    q.addEventListener('input', () => { clearTimeout(esperaQ); esperaQ = setTimeout(() => ir({ q: q.value.trim() }), 250); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(esperaQ); ir({ q: q.value.trim() }); } });

    // Fecha de registro: rangos rápidos + rango personalizado
    const fecha = $('srd-fecha'), fBtn = fecha.querySelector('.srd-fecha-btn'), fPop = $('srd-fecha-pop');
    const abrirF = () => { fPop.hidden = false; fecha.classList.add('abierto'); fBtn.setAttribute('aria-expanded', 'true'); };
    const cerrarF = () => { fPop.hidden = true; fecha.classList.remove('abierto'); fBtn.setAttribute('aria-expanded', 'false'); };
    fBtn.addEventListener('click', () => (fPop.hidden ? abrirF() : cerrarF()));
    document.addEventListener('pointerdown', e => {
        if (!fPop.hidden && !fecha.contains(e.target) && !e.target.closest('.dp-popover')) cerrarF();
    });
    fecha.addEventListener('keydown', e => { if (e.key === 'Escape' && !fPop.hidden && !document.querySelector('.dp-popover.dp-abierto')) { e.stopPropagation(); cerrarF(); fBtn.focus(); } });
    fPop.querySelectorAll('.srd-op').forEach(op => op.addEventListener('click', () => {
        if (op.dataset.creado === 'rango') {
            $('srd-rango').hidden = false;
            fPop.querySelectorAll('.srd-op').forEach(o => o.setAttribute('aria-selected', String(o === op)));
            document.querySelector('#dp-srd-desde .dp-control').focus();
            return;
        }
        ir({ creado: op.dataset.creado, desde: '', hasta: '' });
    }));
    $('srd-rango-aplicar').addEventListener('click', () => {
        const d = document.querySelector('#dp-srd-desde .dp-value').value, h = document.querySelector('#dp-srd-hasta .dp-value').value;
        if (!d && !h) { document.querySelector('#dp-srd-desde .dp-control').focus(); return; }
        ir({ creado: '', desde: d, hasta: h });
    });

    // ── Columnas visibles (localStorage columns:segServicios = lista de columnas ocultas) ──
    const CLAVE = 'columns:segServicios';
    const panel = $('ive-cols'), btnCols = $('ive-cols-btn');
    const ops = [...panel.querySelectorAll('.ive-col-op')];
    const html = document.documentElement;
    let ocultas;
    try { const p = JSON.parse(localStorage.getItem(CLAVE)); ocultas = Array.isArray(p) ? p : []; } catch (e) { ocultas = []; }
    const exportar = $('ssv-exportar');
    function pintarCols() {
        ops.forEach(o => {
            const c = o.dataset.col, fija = o.getAttribute('aria-disabled') === 'true';
            const visible = fija || ocultas.indexOf(c) === -1;
            o.setAttribute('aria-checked', String(visible));
            if (!fija) html.classList.toggle('ssv-sin-' + c, !visible);
        });
        const txt = t('colsDe', { v: ops.length - ocultas.length, t: ops.length });
        $('ive-cols-n').textContent = txt;
        $('ive-cols-n2').textContent = txt;
        // El Excel lleva los filtros de la página y solo las columnas visibles
        const u = new URL(raiz.dataset.urlExportar, location.href);
        new URL(location.href).searchParams.forEach((v, k) => { if (k !== 'page' && k !== 'per_page') u.searchParams.set(k, v); });
        if (ocultas.length) u.searchParams.set('ocultas', ocultas.join(','));
        exportar.href = u.pathname + u.search;
        sombra();
    }
    function guardarCols() {
        try { localStorage.setItem(CLAVE, JSON.stringify(ocultas)); } catch (e) { /* sin almacenamiento */ }
        pintarCols();
    }
    ops.forEach(o => o.addEventListener('click', () => {
        if (o.getAttribute('aria-disabled') === 'true') return;
        const c = o.dataset.col, i = ocultas.indexOf(c);
        if (i === -1) ocultas.push(c); else ocultas.splice(i, 1);
        guardarCols();
    }));
    $('ive-cols-reset').addEventListener('click', () => { ocultas = []; guardarCols(); });
    function cerrarCols(foco) {
        if (panel.hidden) return;
        panel.hidden = true;
        btnCols.setAttribute('aria-expanded', 'false');
        if (foco) btnCols.focus();
    }
    btnCols.addEventListener('click', e => {
        e.stopPropagation();
        if (!panel.hidden) { cerrarCols(false); return; }
        panel.hidden = false;
        btnCols.setAttribute('aria-expanded', 'true');
        const primero = ops.find(o => o.getAttribute('aria-disabled') !== 'true');
        if (primero) primero.focus();
    });
    $('ive-cols-listo').addEventListener('click', () => cerrarCols(true));
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target)) cerrarCols(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) cerrarCols(true); });

    // Sombra de la columna fija de Acciones solo cuando la tabla no cabe
    const scroll = raiz.querySelector('.srd-tabla-scroll');
    function sombra() { scroll.classList.toggle('desliza', scroll.scrollWidth > scroll.clientWidth + 1); }
    pintarCols();
    window.addEventListener('resize', sombra);

    // ── Eliminar desde la fila ──
    const fondoElim = $('srd-elim');
    let elimDisparador = null;
    const cerrarElim = () => { fondoElim.hidden = true; if (elimDisparador) elimDisparador.focus(); };
    window.srdEliminar = (ev, pk) => {
        if (!fondoElim) return;
        elimDisparador = ev && ev.currentTarget;
        const tr = raiz.querySelector('tr[data-pk="' + pk + '"]');
        $('srd-elim-t').textContent = t('eliminarT', { pr: tr ? tr.dataset.pr : '' });
        $('srd-elim-form').action = fondoElim.dataset.url.replace('/0/', '/' + pk + '/');
        $('srd-elim-volver').value = location.search;
        fondoElim.hidden = false;
        $('srd-elim-no').focus();
    };
    if (fondoElim) {
        $('srd-elim-no').addEventListener('click', cerrarElim);
        fondoElim.addEventListener('mousedown', e => { if (e.target === fondoElim) cerrarElim(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !fondoElim.hidden) cerrarElim(); });
    }
    window.srdEditar = (ev, pk) => { if (window.srdModal) srdModal.editar(pk, ev); };

    // ── Después de guardar: aviso y fila resaltada 2 s ──
    try {
        const aviso = sessionStorage.getItem('srd-toast'), pk = sessionStorage.getItem('srd-resaltar');
        sessionStorage.removeItem('srd-toast'); sessionStorage.removeItem('srd-resaltar');
        if (aviso && window.showToast) showToast(aviso, 'success');
        const fila = pk && raiz.querySelector('#srd-tabla tr[data-pk="' + pk + '"]');
        if (fila) {
            fila.classList.add('srd-resaltada');
            fila.scrollIntoView({ block: 'center' });
            setTimeout(() => fila.classList.remove('srd-resaltada'), 2000);
        }
    } catch (e) { /* sin almacenamiento */ }

    // ═══ Modal "Nuevo / Editar seguimiento de servicio" ═══
    const fondo = $('srd-m');
    if (!fondo) return;
    const form = $('srd-m-form');
    const DATOS = JSON.parse($('srd-datos').textContent);
    const PASOS = ['pr', 'po', 'sr'];
    const hoyIso = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
    const fechaDe = k => document.querySelector('#dp-srd-m-' + k + ' .dp-value');
    const numDe = k => $('srd-m-numero_' + k);
    const area = $('srd-m-area');            // solo si la página no tiene área elegida
    function ponerFecha(k, iso) {
        const h = fechaDe(k);
        h.value = iso || '';
        h.dispatchEvent(new Event('change', { bubbles: true }));   // date_picker.js repinta
    }

    let actual = null;      // seguimiento en edición (null = nuevo)
    let serv = null;        // servicio elegido del catálogo
    let inicial = '';
    let disparador = null;

    const firma = () => JSON.stringify([serv && serv.id, area && area.value, $('srd-m-cantidad').value, $('srd-m-motivo').value,
        $('srd-m-comentarios').value, PASOS.map(k => [numDe(k).value, fechaDe(k).value])]);

    function abrir(datos, ev) {
        disparador = ev && ev.currentTarget || document.activeElement;
        actual = datos;
        $('srd-m-t').textContent = datos ? T.editar : T.nuevo;
        const elim = $('srd-m-elim');
        if (elim) elim.hidden = !datos;
        const d = datos || {};
        $('srd-m-cantidad').value = d.cantidad || '';
        $('srd-m-motivo').value = d.motivo || '';
        $('srd-m-comentarios').value = d.comentarios || '';
        if (area) { area.value = ''; $('srd-m-area-fila').hidden = !!datos; }   // al editar, el área no cambia
        PASOS.forEach(k => { numDe(k).value = d['numero_' + k] || ''; ponerFecha(k, d['fecha_' + k]); });
        limpiarErrores();
        cerrarLista();
        buscar.value = '';
        if (d.servicio) ponerServ(d.servicio); else quitarServ(false);
        pintarPasos(); contar();
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        inicial = firma();
        (datos ? $('srd-m-cantidad') : buscar).focus();
    }
    function cerrar(forzar) {
        if (fondo.hidden) return;
        if (!forzar && firma() !== inicial) {
            confirmar(T.descartarT, T.descartarD, T.seguir, T.descartar, true, () => cerrar(true));
            return;
        }
        fondo.hidden = true;
        $('srd-m-conf').hidden = true;
        document.body.style.overflow = '';
        if (disparador && disparador.focus) disparador.focus();
    }
    form.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrar(false)));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(false); });

    // ── Servicio: búsqueda en el catálogo ──
    const buscar = $('srd-m-buscar'), lista = $('srd-m-lista');
    let opciones = [], activa = -1, esperaB, consulta = 0;
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function resaltar(el, texto, qTxt) {
        // La parte que coincide va en negritas (sin innerHTML con datos del usuario)
        const i = qTxt ? norm(texto).indexOf(norm(qTxt)) : -1;
        if (i < 0) { el.textContent = texto; return; }
        const b = document.createElement('b');
        b.textContent = texto.slice(i, i + qTxt.length);
        el.append(texto.slice(0, i), b, texto.slice(i + qTxt.length));
    }
    function cerrarLista() { lista.hidden = true; buscar.setAttribute('aria-expanded', 'false'); buscar.removeAttribute('aria-activedescendant'); activa = -1; }
    function marcar(i) {
        activa = i;
        [...lista.children].forEach((o, j) => o.setAttribute('aria-selected', String(j === i)));
        const o = lista.children[i];
        if (o && o.id) { buscar.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    }
    function pintarLista(datos, qTxt) {
        // Opciones = servicios + "Agregar «…» al catálogo" al final
        opciones = datos.slice();
        lista.replaceChildren();
        if (!datos.length) {
            const v = document.createElement('div'); v.className = 'srd-m-op-vacia'; v.textContent = T.sinServicios;
            lista.appendChild(v);
        }
        datos.forEach((s, i) => {
            const o = document.createElement('div');
            o.className = 'srd-m-op'; o.id = 'srd-m-op-' + i; o.setAttribute('role', 'option'); o.setAttribute('aria-selected', 'false');
            const item = document.createElement('span'); item.className = 'srd-cod'; resaltar(item, s.no_item, qTxt);
            const nom = document.createElement('span'); nom.className = 'nom'; resaltar(nom, s.nombre, qTxt);
            const tipo = document.createElement('span'); tipo.className = 'ssv-tipo as-c' + s.color; tipo.textContent = s.tipo;
            o.append(item, nom, tipo);
            o.addEventListener('mousedown', e => { e.preventDefault(); elegir(i); });
            lista.appendChild(o);
        });
        if (window.ssvCatalogo) {
            const n = datos.length;
            const o = document.createElement('div');
            o.className = 'srd-m-op ssv-m-agregar'; o.id = 'srd-m-op-' + n; o.setAttribute('role', 'option'); o.setAttribute('aria-selected', 'false');
            o.textContent = t('agregarCat', { q: qTxt });
            o.addEventListener('mousedown', e => { e.preventDefault(); elegir(n); });
            lista.appendChild(o);
            opciones.push({ agregar: qTxt });
        }
        lista.hidden = false;
        buscar.setAttribute('aria-expanded', 'true');
        if (opciones.length) marcar(0);
    }
    function consultar() {
        const qTxt = buscar.value.trim();
        if (!qTxt) { cerrarLista(); return; }
        const n = ++consulta;
        const url = new URL(CFG.urlBuscar, location.href);
        url.searchParams.set('q', qTxt);
        fetch(url, { credentials: 'same-origin' }).then(r => r.json()).then(datos => {
            if (n === consulta && document.activeElement === buscar) pintarLista(datos, qTxt);
        }).catch(() => { /* sin red: la lista no se abre */ });
    }
    buscar.addEventListener('input', () => { clearTimeout(esperaB); esperaB = setTimeout(consultar, 200); });
    buscar.addEventListener('focus', () => { if (buscar.value.trim()) consultar(); });
    buscar.addEventListener('blur', () => setTimeout(cerrarLista, 120));
    buscar.addEventListener('keydown', e => {
        if (lista.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarLista(); return; }
        if (!opciones.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); marcar((activa + 1) % opciones.length); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); marcar((activa - 1 + opciones.length) % opciones.length); }
        else if (e.key === 'Enter') { e.preventDefault(); if (activa >= 0) elegir(activa); }
    });
    function elegir(i) {
        const o = opciones[i];
        cerrarLista();
        if (o.agregar !== undefined) {
            // Abre el catálogo encima; al crear el servicio vuelve aquí ya elegido
            ssvCatalogo.abrir(null, { prefill: o.agregar, alCrear: s => { ponerServ(s); error('servicio', ''); $('srd-m-cantidad').focus(); } });
            return;
        }
        ponerServ(o);
        error('servicio', '');
        $('srd-m-cantidad').focus();
    }
    function ponerServ(s) {
        serv = s;
        $('srd-m-ref').value = s.id;
        $('srd-m-nombre').textContent = s.nombre;
        $('srd-m-item').textContent = s.no_item;
        const tipo = $('srd-m-tipo');
        tipo.className = 'ssv-tipo as-c' + s.color;
        tipo.textContent = s.tipo;
        const ab = $('srd-m-abiertas');
        ab.hidden = !s.abiertas;
        ab.textContent = s.abiertas === 1 ? T.abierta1 : t('abiertasN', { n: s.abiertas });
        $('srd-m-tarjeta').hidden = false;
        $('srd-m-combo').hidden = true;
    }
    function quitarServ(enfocar) {
        serv = null;
        $('srd-m-ref').value = '';
        $('srd-m-tarjeta').hidden = true;
        $('srd-m-combo').hidden = false;
        if (enfocar) buscar.focus();
    }
    $('srd-m-cambiar').addEventListener('click', () => { buscar.value = ''; quitarServ(true); });

    // ── Cantidad con − / + ──
    const cant = $('srd-m-cantidad');
    const valorCant = () => { const n = parseInt(cant.value, 10); return isNaN(n) ? 0 : n; };
    form.querySelectorAll('.srd-m-cant [data-paso]').forEach(b => b.addEventListener('click', () => {
        cant.value = Math.max(1, valorCant() + Number(b.dataset.paso));
        error('cantidad', '');
    }));
    cant.addEventListener('input', () => error('cantidad', ''));

    // ── Motivo y comentarios (contadores) ──
    function contar() {
        $('srd-m-cont-mot').textContent = $('srd-m-motivo').value.length + ' / 200';
        $('srd-m-cont').textContent = $('srd-m-comentarios').value.length + ' / 300';
    }
    $('srd-m-motivo').addEventListener('input', () => { contar(); error('motivo_servicio', ''); });
    $('srd-m-comentarios').addEventListener('input', contar);
    if (area) area.addEventListener('change', () => error('area', ''));

    // ── Pasos PR → PO → SR: cada uno se habilita cuando el anterior tiene número ──
    function pintarPasos() {
        let anteriorListo = true, siguiente = true;
        PASOS.forEach((k, i) => {
            const paso = form.querySelector('.srd-m-paso[data-paso="' + k + '"]');
            const num = numDe(k), dp = document.querySelector('#dp-srd-m-' + k);
            const activo = anteriorListo;
            num.disabled = !activo;
            fechaDe(k).disabled = !activo;
            dp.classList.toggle('srd-off', !activo);
            dp.querySelector('.dp-control').tabIndex = activo ? 0 : -1;
            const lleno = activo && !!num.value.trim();
            const estado = lleno ? 'hecho' : (siguiente ? 'sig' : 'fut');
            if (!lleno) siguiente = false;
            paso.className = 'srd-m-paso ' + estado;
            paso.querySelector('.srd-m-paso-h').textContent =
                estado === 'hecho' ? T.completado : estado === 'sig' ? T.siguiente : t('despuesDe', { paso: PASOS[i - 1].toUpperCase() });
            // PO o SR con el mismo número que la PR: solo advertencia
            const aviso = paso.querySelector('.srd-m-aviso');
            if (aviso) {
                const igual = lleno && num.value.trim().toLowerCase() === numDe('pr').value.trim().toLowerCase();
                aviso.hidden = !igual;
                aviso.textContent = igual ? T.igualPr : '';
            }
            anteriorListo = lleno;
        });
        const po = !numDe('po').disabled && numDe('po').value.trim(), sr = !numDe('sr').disabled && numDe('sr').value.trim();
        const est = sr ? 'verde' : po ? 'amarillo' : 'rojo';
        const chip = $('srd-m-estado');
        chip.className = 'srd-estado ' + est;
        chip.querySelector('b').textContent = sr ? T.recibido : po ? T.pendiente : T.sinOrden;
    }
    PASOS.forEach(k => {
        numDe(k).addEventListener('input', () => { error('numero_' + k, ''); pintarPasos(); });
        fechaDe(k).addEventListener('change', () => error('fecha_' + k, ''));
    });

    // ── Errores por campo ──
    const CAMPOS = { servicio: () => buscar, area: () => area, cantidad: () => cant, motivo_servicio: () => $('srd-m-motivo'), comentarios: () => $('srd-m-comentarios') };
    function error(campo, msg) {
        const el = form.querySelector('[data-err="' + campo + '"]');
        if (el) { el.textContent = msg || ''; el.hidden = !msg; }
        let inp = CAMPOS[campo] ? CAMPOS[campo]() : campo.indexOf('numero_') === 0 ? numDe(campo.slice(7)) : null;
        if (campo.indexOf('fecha_') === 0) inp = document.querySelector('#dp-srd-m-' + campo.slice(6) + ' .dp-control');
        if (inp) { inp.classList.toggle('mal', !!msg); if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    }
    function limpiarErrores() {
        form.querySelectorAll('[data-err]').forEach(el => { el.hidden = true; el.textContent = ''; });
        form.querySelectorAll('.mal').forEach(el => el.classList.remove('mal'));
        form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    }
    function validar() {
        let ok = true;
        const mal = (c, m) => { error(c, m); ok = false; };
        if (!serv) mal('servicio', T.elegirServ);
        if (area && !actual && !area.value) mal('area', T.elegirArea);
        if (!/^\d+$/.test(cant.value.trim()) || valorCant() <= 0) mal('cantidad', T.cantidadMal);
        if (!$('srd-m-motivo').value.trim()) mal('motivo_servicio', T.motivoObl);
        if (!numDe('pr').value.trim()) mal('numero_pr', T.obligatorio);
        const f = {};
        PASOS.forEach(k => { f[k] = fechaDe(k).disabled ? '' : fechaDe(k).value; if (f[k] && f[k] > hoyIso) mal('fecha_' + k, T.futura); });
        if (!f.pr && !form.querySelector('[data-err="fecha_pr"]:not([hidden])')) mal('fecha_pr', T.prFecha);
        if (f.pr && f.po && f.po < f.pr) mal('fecha_po', T.poAntes);
        if (f.po && f.sr && f.sr < f.po) mal('fecha_sr', T.srAntes);
        return ok;
    }

    // ── Guardar ──
    let guardando = false;
    function enviar(confirmado) {
        const fd = new FormData(form);   // los pasos deshabilitados no se envían (= vacíos)
        if (confirmado) fd.append('confirmar', '1');
        guardando = true;
        $('srd-m-guardar').disabled = true;
        const listo = () => { guardando = false; $('srd-m-guardar').disabled = false; };
        fetch(actual ? actual.url_guardar : form.dataset.urlNuevo, {
            method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin',
        }).then(r => r.json().then(j => ({ status: r.status, j }))).then(({ status, j }) => {
            listo();
            if (j.ok) {
                try {
                    sessionStorage.setItem('srd-toast', T.guardado);
                    sessionStorage.setItem('srd-resaltar', String(j.pk));
                } catch (er) { /* sin almacenamiento */ }
                inicial = firma();
                location.reload();
                return;
            }
            if (status === 409 && j.aviso) {   // mismo servicio y PR: se confirma
                confirmar(j.aviso, T.duplicadoD, T.revisar, T.guardarIgual, false, () => enviar(true));
                return;
            }
            const errores = j.errores || {};
            Object.keys(errores).forEach(c => (c === 'general' ? window.showToast && showToast({ title: T.errorGuardarTit, description: errores[c] }, 'error') : error(c, errores[c])));
            const m = form.querySelector('.mal'); if (m) m.focus();
        }).catch(() => {
            listo();
            if (window.showToast) showToast({ title: T.errorGuardarTit, description: window.TXT_REVISA_CONEXION }, 'error');
        });
    }
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (guardando) return;
        limpiarErrores();
        if (!validar()) { const m = form.querySelector('.mal'); if (m) m.focus(); return; }
        enviar(false);
    });

    // ── Eliminar desde el modal ──
    const elim = $('srd-m-elim');
    if (elim) elim.addEventListener('click', () => {
        if (!actual) return;
        confirmar(t('eliminarT', { pr: actual.numero_pr }), T.eliminarD, T.cancelar, T.eliminar, true, () => {
            const f = $('srd-m-elim-form');
            f.action = actual.url_eliminar;
            $('srd-m-elim-volver').value = location.search;
            f.submit();
        });
    });

    // ── Confirmación dentro del modal ──
    const conf = $('srd-m-conf');
    let alConfirmar = null;
    function confirmar(titulo, desc, no, si, peligro, fn) {
        $('srd-m-conf-t').textContent = titulo;
        $('srd-m-conf-d').textContent = desc;
        $('srd-m-conf-no').textContent = no;
        const b = $('srd-m-conf-si');
        b.textContent = si;
        b.className = 'ive-btn ' + (peligro ? 'ive-btn-rojo' : 'ive-btn-pri');
        alConfirmar = fn;
        conf.hidden = false;
        $('srd-m-conf-no').focus();
    }
    const cerrarConf = () => { conf.hidden = true; alConfirmar = null; };
    $('srd-m-conf-no').addEventListener('click', cerrarConf);
    $('srd-m-conf-si').addEventListener('click', () => { const fn = alConfirmar; cerrarConf(); if (fn) fn(); });

    // ── Teclado: Escape, Ctrl + Enter y foco atrapado ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (document.querySelector('.dp-popover.dp-abierto')) return;   // el calendario atiende sus teclas
        if (e.key === 'Escape') { e.preventDefault(); if (!conf.hidden) cerrarConf(); else cerrar(false); return; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (conf.hidden) form.requestSubmit(); return; }
        if (e.key !== 'Tab') return;
        const caja = conf.hidden ? form : conf;
        const f = [...caja.querySelectorAll('button, input:not([type=hidden]), select, textarea, [tabindex="0"]')]
            .filter(el => !el.disabled && el.offsetParent !== null && el.tabIndex >= 0 && !el.closest('.dp-popover') && (conf.hidden ? !conf.contains(el) : true));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });

    window.srdModal = {
        nuevo: ev => abrir(null, ev),
        editar: (pk, ev) => DATOS[pk] && abrir(DATOS[pk], ev),
    };
})();
