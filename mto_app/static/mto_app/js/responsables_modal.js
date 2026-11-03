/* responsables_modal.js — modal "Responsables" y su formulario (Plan de mantenimiento).
   Depende de: RS_CFG {urlLista, urlGuardar, urlAlternar, area, csrf, puestos:[{valor,label}]}, RS_I18N (template).
   Se abre con cualquier elemento [data-abrir-responsables]. La lista se pide por fetch a mto:responsables_modal. */
(function () {
    'use strict';
    const fondo = document.getElementById('rs-fondo');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const cuerpo = $('rs-cuerpo'), btnX = $('rs-x');
    const CFG = window.RS_CFG || {}, I = window.RS_I18N || {};
    const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && k in o ? o[k] : m));
    const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'success'); };
    let params = new URLSearchParams(), abrio = null, tq = null, pedido = 0, huboCambio = false;

    // ── Lista ──────────────────────────────────────────────────────────────
    async function cargar() {
        const mio = ++pedido, previo = document.activeElement && document.activeElement.id;
        cuerpo.classList.add('ocupado');
        try {
            const r = await fetch(CFG.urlLista + '?' + params.toString(), { credentials: 'same-origin' });
            if (!r.ok) throw new Error('http ' + r.status);
            const html = await r.text();
            if (mio !== pedido) return;
            cuerpo.innerHTML = html;
            const el = previo && document.getElementById(previo);
            if (el && cuerpo.contains(el)) {
                el.focus();
                if (el.type === 'search') el.setSelectionRange(el.value.length, el.value.length);
            }
        } catch (e) {
            if (mio === pedido && !cuerpo.querySelector('.rs')) cuerpo.innerHTML = '<div class="rs-cargando">' + I.error + '</div>';
            else toast(I.error, 'error');
        } finally {
            if (mio === pedido) cuerpo.classList.remove('ocupado');
        }
    }
    function abrir(origen) {
        abrio = origen || document.activeElement;
        params = new URLSearchParams();
        if (CFG.area) params.set('area', CFG.area);
        huboCambio = false;
        cuerpo.innerHTML = '<div class="rs-cargando">' + I.cargando + '</div>';
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        btnX.focus();
        cargar();
    }
    function cerrar() {
        if (fondo.hidden) return;
        fondo.hidden = true;
        document.body.style.overflow = '';
        pedido++;
        if (huboCambio) { window.location.reload(); return; }   // los selectores de responsable de la página se rearman al cargar
        if (abrio && abrio.focus && document.contains(abrio)) abrio.focus();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-responsables]');
        if (b) { e.preventDefault(); abrir(b); }
    });
    btnX.addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });

    function poner(clave, valor) {
        if (valor) params.set(clave, valor); else params.delete(clave);
        cargar();
    }
    cuerpo.addEventListener('input', e => {
        if (e.target.id !== 'rs-q') return;
        clearTimeout(tq);
        tq = setTimeout(() => poner('q', e.target.value.trim()), 250);
    });
    cuerpo.addEventListener('click', e => {
        const est = e.target.closest('[data-estado]');
        if (est) { poner('estado', est.dataset.estado); return; }
        const chip = e.target.closest('.rs-chip[data-puesto]');
        if (chip) { poner('puesto', chip.getAttribute('aria-pressed') === 'true' ? '' : chip.dataset.puesto); return; }
        if (e.target.closest('#rs-nuevo')) { abrirForm(null); return; }
        const ed = e.target.closest('[data-editar]');
        if (ed) { abrirForm(ed.dataset); return; }
        const del = e.target.closest('[data-eliminar]');
        if (del && !del.disabled) { abrirEliminar(del); return; }
        const alt = e.target.closest('[data-alternar]');
        if (alt) alternar(alt);
    });

    async function alternar(btn) {
        btn.disabled = true;
        try {
            const r = await fetch(CFG.urlAlternar + btn.dataset.alternar + '/', {
                method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': CFG.csrf }
            });
            const d = await r.json();
            if (!r.ok || !d.ok) throw new Error(d.error || 'http');
            huboCambio = true;
            toast(fmt(d.activo ? I.toastReactivado : I.toastDesactivado, { nombre: d.nombre }));
            cargar();
        } catch (e) {
            btn.disabled = false;
            toast(I.errorGuardar, 'error');
        }
    }

    // ── Formulario (segundo diálogo) ───────────────────────────────────────
    const ff = $('rsf-fondo');
    const F = { nomina: $('rsf-nomina'), nombre: $('rsf-nombre'), apellidos: $('rsf-apellidos') };
    const swAct = $('rsf-activo'), cPuestos = $('rsf-puestos'), btnGuardar = $('rsf-guardar');
    let modoForm = 'nuevo', idForm = '', puesto = '', activo = true, guardando = false;

    const ini = (n, a) => ((n || '').trim().charAt(0) + (a || '').trim().charAt(0)).toUpperCase();
    function error(clave, msg) {
        const e = $('rsf-err-' + clave);
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
        if (F[clave]) F[clave].classList.toggle('err', !!msg);
    }
    const limpiarErrores = () => ['nomina', 'nombre', 'apellidos', 'general'].forEach(k => error(k, ''));

    function vistaPrevia() {
        const nom = (F.nombre.value + ' ' + F.apellidos.value).trim();
        const av = $('rsf-prev-av');
        av.textContent = ini(F.nombre.value, F.apellidos.value) || '?';
        av.setAttribute('data-p', puesto);
        $('rsf-prev-nom').textContent = nom || I.previoVacio;
        $('rsf-prev-sub').textContent = fmt(I.previoSub, {
            nomina: F.nomina.value.trim() || '—', puesto: puestoLabel(puesto) || I.sinPuesto, estado: activo ? I.activo : I.inactivo });
    }
    function puestoLabel(v) {
        const p = (CFG.puestos || []).find(x => x.valor === v);
        return p ? p.label : v;
    }
    function pintarPuestos() {
        const lista = (CFG.puestos || []).slice();
        if (puesto && !lista.some(p => p.valor === puesto)) lista.push({ valor: puesto, label: puesto });   // puesto viejo guardado
        cPuestos.innerHTML = '';
        lista.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'rsf-pchip'; b.setAttribute('role', 'radio');
            b.setAttribute('data-p', p.valor); b.dataset.valor = p.valor;
            b.setAttribute('aria-checked', String(p.valor === puesto));
            const d = document.createElement('span'); d.className = 'rs-punto'; d.setAttribute('data-p', p.valor);
            b.append(d, document.createTextNode(p.label));
            cPuestos.appendChild(b);
        });
    }
    function pintarActivo() {
        swAct.setAttribute('aria-checked', String(activo));
    }
    cPuestos.addEventListener('click', e => {
        const b = e.target.closest('.rsf-pchip'); if (!b) return;
        puesto = (puesto === b.dataset.valor) ? '' : b.dataset.valor;   // otro clic lo quita (el puesto es opcional)
        pintarPuestos(); vistaPrevia();
    });
    swAct.addEventListener('click', () => { activo = !activo; pintarActivo(); vistaPrevia(); });
    Object.keys(F).forEach(k => F[k].addEventListener('input', () => { error(k, ''); vistaPrevia(); }));

    function abrirForm(d) {
        if (!CFG.area && !d) { toast(I.sinArea, 'warning'); return; }
        modoForm = d ? 'editar' : 'nuevo';
        idForm = d ? d.id : '';
        F.nomina.value = d ? d.nomina : ''; F.nombre.value = d ? d.nombre : ''; F.apellidos.value = d ? d.apellidos : '';
        puesto = d ? d.puesto : '';
        activo = d ? d.activo === '1' : true;
        limpiarErrores(); pintarPuestos(); pintarActivo(); vistaPrevia();
        $('rsf-titulo').textContent = d ? I.tituloEditar : I.tituloNuevo;
        $('rsf-sub').textContent = d ? fmt(I.subEditar, { alta: d.alta, edicion: d.edicion }) : (CFG.areaNombre || '');
        btnGuardar.textContent = d ? I.guardarCambios : I.agregar;
        ff.hidden = false;
        F.nomina.focus();
    }
    function cerrarForm() {
        if (ff.hidden) return;
        ff.hidden = true;
        const alvo = document.getElementById('rs-nuevo') || btnX;
        alvo.focus();
    }
    $('rsf-x').addEventListener('click', cerrarForm);
    $('rsf-cancelar').addEventListener('click', cerrarForm);
    ff.addEventListener('mousedown', e => { if (e.target === ff) cerrarForm(); });

    
    async function guardar() {
        if (guardando) return;
        limpiarErrores();
        let primero = null;
        const falla = (k, m) => { error(k, m); if (!primero) primero = F[k]; };
        if (!F.nomina.value.trim()) falla('nomina', I.errNomina);
        if (!F.nombre.value.trim()) falla('nombre', I.errNombre);
        if (!F.apellidos.value.trim()) falla('apellidos', I.errApellidos);
        if (primero) { primero.focus(); return; }
        guardando = true; btnGuardar.disabled = true;
        const txt = btnGuardar.textContent; btnGuardar.textContent = I.guardando;
        try {
            const url = CFG.urlGuardar + (modoForm === 'editar' ? idForm + '/' : '');
            const r = await fetch(url, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CFG.csrf },
                body: JSON.stringify({ area: CFG.area, nomina: F.nomina.value.trim(), nombre: F.nombre.value.trim(),
                                       apellidos: F.apellidos.value.trim(), posicion: puesto, activo: activo })
            });
            const d = await r.json();
            if (!r.ok || !d.ok) {
                const errs = d.errores || {};
                Object.keys(errs).forEach(k => error(k, errs[k]));
                if (!Object.keys(errs).length) error('general', d.error || I.errorGuardar);
                return;
            }
            huboCambio = true;
            ff.hidden = true;
            toast(modoForm === 'editar' ? I.toastGuardado : I.toastCreado);
            toast(d.recuperado ? fmt(I.toastRecuperado, { nombre: d.nombre })
                               : (modoForm === 'editar' ? I.toastGuardado : I.toastCreado));
            cargar();
            (document.getElementById('rs-nuevo') || btnX).focus();
        } catch (e) {
            error('general', I.errorGuardar);
        } finally {
            guardando = false; btnGuardar.disabled = false; btnGuardar.textContent = txt;
        }
    }
    btnGuardar.addEventListener('click', guardar);

    // ── Confirmar eliminar (solo se puede si nunca se usó; el servidor también lo exige) ──
    const fe = $('rse-fondo');
    let idEliminar = '', eliminando = false;
    function abrirEliminar(b) {
        idEliminar = b.dataset.eliminar;
        const n = parseInt(b.dataset.registros, 10) || 0;
        $('rse-txt').textContent = n ? fmt(I.eliminarCon, { n: n }) : I.eliminarSin;
        $('rse-titulo').textContent = fmt(I.eliminarTitulo, { nombre: b.dataset.nombre });
        const err = $('rse-err'); err.hidden = true; err.textContent = '';
        fe.hidden = false;
        $('rse-cancelar').focus();
    }
    function cerrarEliminar() {
        if (fe.hidden) return;
        fe.hidden = true;
        (document.getElementById('rs-nuevo') || btnX).focus();
    }
    $('rse-cancelar').addEventListener('click', cerrarEliminar);
    fe.addEventListener('mousedown', e => { if (e.target === fe) cerrarEliminar(); });
    $('rse-ok').addEventListener('click', async () => {
        if (eliminando) return;
        eliminando = true;
        const ok = $('rse-ok'), err = $('rse-err');
        ok.disabled = true;
        try {
            const r = await fetch(CFG.urlEliminar + idEliminar + '/', {
                method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': CFG.csrf }
            });
            const d = await r.json();
            if (!r.ok || !d.ok) { err.textContent = d.error || I.errorEliminar; err.hidden = false; return; }
            huboCambio = true;
            fe.hidden = true;
            toast(fmt(I.toastEliminado, { nombre: d.nombre }));
            cargar();
            (document.getElementById('rs-nuevo') || btnX).focus();
        } catch (e) {
            err.textContent = I.errorEliminar; err.hidden = false;
        } finally {
            eliminando = false; ok.disabled = false;
        }
    });

    // ── Teclado: Escape cierra lo de más arriba; Ctrl+Enter guarda; Tab queda dentro ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        const arriba = !fe.hidden ? fe : (ff.hidden ? fondo : ff);
        if (e.key === 'Escape') {
            if (!fe.hidden) { e.stopPropagation(); cerrarEliminar(); return; }
            if (!ff.hidden) { e.stopPropagation(); cerrarForm(); return; }
            e.stopPropagation(); cerrar(); return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ff.hidden) { e.preventDefault(); guardar(); return; }
        if (e.key !== 'Tab') return;
        const f = Array.from(arriba.querySelectorAll('button:not([disabled]), a[href], input, select')).filter(x => x.offsetParent);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }, true);
})();

