/* modal_calendario.js — detalle del plan (escritorio). Documento que se carga en el <iframe> de plan/lista.html.
   Calendario + "Registrar ejecución" (otro <iframe>, registro_form.html) + secciones Seguimientos / Historial del año.
   Habla con la lista (window.parent) por postMessage: cerrar_modal, cambiar_anio, hubo_cambio, abrir_mseg. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const CFG = JSON.parse($('mc-cfg').textContent);
    const I = window.MC_I18N || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), I[k] || k);

    const grid = $('mc-grid');
    const iframe = $('iframe-registro');
    const celdas = Array.from(grid.querySelectorAll('.mc-cell'));
    const darBtn = $('mc-dar-seg');
    const celdaDe = s => celdas.find(c => +c.dataset.semana === s) || null;
    let sel = null;                       // semana cargada en "Registrar ejecución"

    const urlForm = s => '/mto/equipos/' + CFG.planPk + '/registro/' + s + '/' + CFG.anio + '/';
    const urlModal = (s, resaltar) => '/mto/equipos/' + CFG.planPk + '/modal/?anio=' + CFG.anio + (s ? '&semana=' + s : '') + (resaltar ? '&resaltar=' + resaltar : '');
    const aLista = msg => window.parent.postMessage(msg, '*');

    // ── ¿El formulario tiene cambios sin guardar? (mismo origen: se le pregunta directo) ──
    function hayCambios() {
        try { return !!(iframe.contentWindow && iframe.contentWindow.rfHayCambios && iframe.contentWindow.rfHayCambios()); }
        catch (e) { return false; }
    }
    const dlg = $('mc-descartar');
    let alDescartar = null;
    function confirmarDescarte(texto, accion) {
        $('mc-d-tx').textContent = texto;
        alDescartar = accion;
        dlg.style.display = 'flex';
        $('mc-d-seguir').focus();
    }
    function cerrarDialogo() { dlg.style.display = 'none'; alDescartar = null; }
    $('mc-d-seguir').addEventListener('click', cerrarDialogo);
    $('mc-d-descartar').addEventListener('click', () => { const f = alDescartar; cerrarDialogo(); if (f) f(); });

    function cerrar() { aLista('cerrar_modal'); }
    function cerrarConConfirmacion() {
        if (hayCambios()) confirmarDescarte(t('descartarCerrar'), cerrar);
        else cerrar();
    }
    $('mc-cerrar').addEventListener('click', cerrarConConfirmacion);
    window.mcCerrarConConfirmacion = cerrarConConfirmacion;      // lo usa la lista al pulsar Escape fuera del modal

    // ── Año ──
    document.querySelectorAll('.mc-year [data-anio]').forEach(b => b.addEventListener('click', () => {
        const ir = () => aLista('cambiar_anio:' + b.dataset.anio + ':' + CFG.planPk);
        if (hayCambios()) confirmarDescarte(t('descartarSemana', { n: sel }), ir); else ir();
    }));

    // ── Selección de semana ──
    function pintarSeleccion() {
        celdas.forEach((c, i) => {
            const on = +c.dataset.semana === sel;
            c.setAttribute('aria-selected', on ? 'true' : 'false');
            c.tabIndex = on || (sel === null && i === 0) ? 0 : -1;
        });
        document.querySelectorAll('#his-tbody tr').forEach(tr => {
            const on = +tr.dataset.semana === sel;
            tr.classList.toggle('sel', on);
            tr.querySelector('.mc-actual').hidden = !on;
        });
        $('seg-sem-sel').textContent = sel ? t('semanaSel', { n: sel }) : t('sinSeleccion');
        const c = celdaDe(sel);
        const puede = !!c && c.dataset.estado === 'completada';
        darBtn.setAttribute('aria-disabled', puede ? 'false' : 'true');
        darBtn.title = puede ? '' : t('noDisponible');
    }
    function verFormulario() { $('panel-registro').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    function seleccionar(semana, opciones) {
        const o = opciones || {};
        const ir = () => {
            sel = semana;
            pintarSeleccion();
            iframe.src = urlForm(semana);
            if (o.scroll) verFormulario();
        };
        if (sel === semana && !o.forzar) { if (o.scroll) verFormulario(); return; }
        if (sel !== null && !o.forzar && hayCambios()) confirmarDescarte(t('descartarSemana', { n: sel }), ir);
        else ir();
    }
    celdas.forEach(c => c.addEventListener('click', () => seleccionar(+c.dataset.semana)));
    grid.addEventListener('keydown', e => {
        const i = celdas.indexOf(document.activeElement);
        if (i < 0) return;
        let n = null;
        if (e.key === 'ArrowRight') n = i + 1;
        else if (e.key === 'ArrowLeft') n = i - 1;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = celdas.length - 1;
        if (n === null || !celdas[n]) return;
        e.preventDefault();
        celdas.forEach(c => { c.tabIndex = -1; });
        celdas[n].tabIndex = 0;
        celdas[n].focus();
    });
    iframe.addEventListener('load', () => {
        try { iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'; } catch (e) { iframe.style.height = '620px'; }
    });

    // Tras guardar, la selección pasa a la siguiente ocurrencia que siga pendiente.
    function siguientePendiente(desde) {
        const abierta = c => ['', 'pendiente', 'reagendada'].indexOf(c.dataset.estado) !== -1;
        const i = celdas.findIndex(c => +c.dataset.semana === desde);
        const hallada = celdas.slice(i + 1).find(abierta) || celdas.slice(0, Math.max(i, 0)).find(abierta);
        return hallada ? +hallada.dataset.semana : desde;
    }

    // ── Mensajes: del formulario (iframe) y de la lista (modal de seguimiento) ──
    window.addEventListener('message', e => {
        const d = e.data;
        if (d === 'cerrar_form_registro') { cerrar(); return; }
        if (typeof d !== 'string') return;
        if (d.startsWith('registro_guardado:')) {
            // Se avisa a la lista aquí (no al cerrar): el modal se recarga y perdería cualquier marca puesta en su URL.
            aLista('hubo_cambio');
            window.location.href = urlModal(siguientePendiente(sel));
        } else if (d.startsWith('resize_iframe:')) {
            iframe.style.height = parseInt(d.split(':')[1], 10) + 'px';
        } else if (d.charAt(0) === '{') {
            try {
                const m = JSON.parse(d);
                if (m.tipo === 'mseg_guardado') { aLista('hubo_cambio'); window.location.href = urlModal(sel, m.data && m.data.id); }
                else if (m.tipo === 'mseg_eliminado') { aLista('hubo_cambio'); window.location.href = urlModal(sel); }
            } catch (err) { /* mensaje ajeno */ }
        }
    });

    // ── Secciones plegables (recuerdan qué abrió el usuario) ──
    const CLAVE = 'mto_plan_secs';
    const secs = Array.from(document.querySelectorAll('.mc-sec'));
    const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch (e) { return {}; } };
    const guardar = o => { try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch (e) { /* sin storage */ } };
    function pintarSecciones() {
        const estado = leer();
        secs.forEach(s => {
            const abierta = !!estado[s.dataset.sec];
            s.classList.toggle('open', abierta);
            s.querySelector('.mc-sec-toggle').setAttribute('aria-expanded', abierta ? 'true' : 'false');
            s.style.order = 0;
        });
        const seg = $('sec-seg'), his = $('sec-his');
        if (his.classList.contains('open') && !seg.classList.contains('open')) his.style.order = -1;   // la abierta queda arriba
    }
    secs.forEach(s => {
        const alternar = () => {
            const estado = leer();
            estado[s.dataset.sec] = !s.classList.contains('open');
            guardar(estado);
            pintarSecciones();
            if (estado[s.dataset.sec]) s.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
        s.querySelector('.mc-sec-toggle').addEventListener('click', alternar);
        s.querySelector('.mc-chev').addEventListener('click', alternar);
    });
    pintarSecciones();

    // ── Seguimientos: Abiertos / Todos, "Dar seguimiento" y Editar (abre el modal de la lista) ──
    const filas = Array.from(document.querySelectorAll('#seg-tbody tr'));
    function filtrarSeguimientos(f) {
        let n = 0;
        filas.forEach(tr => {
            const ver = f === 'todos' || tr.dataset.estatus !== 'completado';
            tr.hidden = !ver;
            if (ver) n++;
        });
        $('seg-vacio').hidden = n > 0;
        document.querySelectorAll('#seg-filtro button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === f ? 'true' : 'false'));
    }
    document.querySelectorAll('#seg-filtro button').forEach(b => b.addEventListener('click', () => filtrarSeguimientos(b.dataset.f)));
    filtrarSeguimientos('abiertos');

    // El formulario "Nuevo / Editar seguimiento" vive en la lista (plan_seguimiento_form.js); aquí solo se le manda
    // qué abrir y la franja "Ligado a" (plan, semana, estado de esa semana).
    const abrirMseg = datos => aLista(JSON.stringify(Object.assign({ tipo: 'abrir_mseg', puedeEliminar: !!(CFG.permSeg && CFG.permSeg.eliminar) }, datos)));
    // Permisos de Seguimientos: Llenar crea, Editar modifica (el servidor también lo verifica).
    const permSeg = CFG.permSeg || { llenar: true, editar: true };
    darBtn.hidden = !permSeg.llenar;
    document.querySelectorAll('[data-editar-seg]').forEach(b => { b.hidden = !permSeg.editar; });
    function contexto(semana) {
        const c = celdaDe(semana);
        return { codigo: CFG.codigo, nombre: CFG.nombre, semana: semana, anio: CFG.anio,
                 rango: c ? c.dataset.rango : '', estado: c ? c.dataset.estado : '', estadoTxt: c ? c.dataset.estadoTxt : '',
                 responsableSemana: c ? c.dataset.resp : '' };
    }
    darBtn.addEventListener('click', () => {
        if (darBtn.getAttribute('aria-disabled') === 'true') return;
        const c = celdaDe(sel);
        abrirMseg({ registro_pk: +c.dataset.reg, contexto: contexto(sel), problema: '', accion: '', responsable: c.dataset.resp || '',
                    fecha: '', estatus: 'pendiente', notas: '', id: '' });
    });
    document.querySelectorAll('[data-editar-seg]').forEach(b => b.addEventListener('click', () => {
        const d = b.closest('tr').dataset;
        abrirMseg({ registro_pk: +d.reg, contexto: contexto(+d.semana), id: +d.id, orden: d.orden,
                    creado: d.creado, creadoIso: d.creadoIso, creadoPor: d.creadoPor, modificado: d.modificado,
                    problema: d.problema, accion: d.accion, responsable: d.responsable, fecha: d.fecha, estatus: d.estatus, notas: d.notas });
    }));

    // ── Historial del año: chips con conteos y botón por fila que carga esa semana arriba ──
    const filasHis = Array.from(document.querySelectorAll('#his-tbody tr'));
    document.querySelectorAll('#his-chips button').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#his-chips button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        filasHis.forEach(tr => { tr.hidden = !!b.dataset.c && tr.dataset.cat !== b.dataset.c; });
    }));
    document.querySelectorAll('#his-tbody [data-sel]').forEach(b => b.addEventListener('click', () => {
        seleccionar(+b.closest('tr').dataset.semana, { scroll: true });
    }));

    // ── Visor de fotos del Historial (botón con globito de cantidad) ──
    const visor = $('mc-visor');
    let fotosVisor = [], iVisor = 0, semVisor = 0;
    function pintarVisor() {
        const f = fotosVisor[iVisor];
        $('mc-visor-img').src = f.url;
        $('mc-visor-tit').textContent = t('fotosDe', { n: semVisor }) + ' · ' + t('fotoN', { i: iVisor + 1, n: fotosVisor.length });
        $('mc-visor-pie').textContent = f.etiqueta ? t(f.etiqueta) : '';
        $('mc-visor-ant').disabled = iVisor === 0;
        $('mc-visor-sig').disabled = iVisor === fotosVisor.length - 1;
    }
    function abrirVisor(fotos, sem) {
        if (!fotos.length) return;
        fotosVisor = fotos; iVisor = 0; semVisor = sem;
        pintarVisor();
        visor.hidden = false;
        $('mc-visor-cerrar').focus();
    }
    function cerrarVisor() { visor.hidden = true; $('mc-visor-img').src = ''; }
    const moverVisor = n => { const i = iVisor + n; if (i >= 0 && i < fotosVisor.length) { iVisor = i; pintarVisor(); } };
    $('mc-visor-cerrar').addEventListener('click', cerrarVisor);
    $('mc-visor-ant').addEventListener('click', () => moverVisor(-1));
    $('mc-visor-sig').addEventListener('click', () => moverVisor(1));
    visor.addEventListener('click', e => { if (e.target === visor || e.target.classList.contains('mc-visor-cuerpo')) cerrarVisor(); });
    
    // Fotos de un seguimiento (se piden al abrir el visor)
    document.querySelectorAll('#seg-tbody [data-fotos-seg]').forEach(b => b.addEventListener('click', () => {
        fetch('/mto/seguimiento/ot/' + b.dataset.fotosSeg + '/imagenes/', { credentials: 'same-origin' })
            .then(r => r.json())
            .then(d => abrirVisor((d.imagenes || []).map(i => ({ url: i.url, etiqueta: '' })), +b.dataset.sem))
            .catch(() => { /* sin red: no se abre */ });
    }));
    
    document.querySelectorAll('#his-tbody [data-fotos]').forEach(b => b.addEventListener('click', () => {
        let lista = [];
        try { lista = JSON.parse(b.dataset.fotos); } catch (err) { /* sin fotos */ }
        abrirVisor(lista, +b.dataset.sem);
    }));

    document.addEventListener('keydown', e => {
        if (!visor.hidden) {
            if (e.key === 'Escape') { e.preventDefault(); cerrarVisor(); }
            else if (e.key === 'ArrowLeft') moverVisor(-1);
            else if (e.key === 'ArrowRight') moverVisor(1);
            return;
        }
        if (e.key !== 'Escape') return;
        if (dlg.style.display === 'flex') cerrarDialogo(); else cerrarConConfirmacion();
    });

    // Tras crear/editar un seguimiento se abre la sección y se resalta su fila 2 s.
    if (CFG.resaltar) {
        const estado = leer(); estado.seg = true; guardar(estado); pintarSecciones();
        const tr = document.querySelector('#seg-tbody tr[data-id="' + CFG.resaltar + '"]');
        if (tr) {
            if (tr.hidden) filtrarSeguimientos('todos');
            tr.classList.add('resaltada');
            tr.scrollIntoView({ block: 'center' });
            setTimeout(() => tr.classList.remove('resaltada'), 2000);
        }
    }

    // ── Arranque: carga la semana elegida (o la próxima) en "Registrar ejecución" ──
    if (CFG.selSemana && celdaDe(CFG.selSemana)) seleccionar(CFG.selSemana, { forzar: true });
    else pintarSeleccion();
})();
