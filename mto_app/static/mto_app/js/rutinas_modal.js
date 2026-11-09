/* rutinas_modal.js — modal "Rutinas de mantenimiento" (Plan de mantenimiento).
   Depende de: RT_CFG {urlLista, urlImportar, urlEliminar, area, csrf}, RT_I18N (template).
   Se abre con cualquier elemento [data-abrir-rutinas]. La lista y la rutina elegida se piden por fetch a mto:rutinas_modal. */
(function () {
    'use strict';
    const fondo = document.getElementById('rt-fondo');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const cuerpo = $('rt-cuerpo'), btnX = $('rt-x');
    const CFG = window.RT_CFG || {}, I = window.RT_I18N || {};
    const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && k in o ? o[k] : m));
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'success'); };
    const CLAVE_VISTA = 'rutinas:vista';
    let params = new URLSearchParams(), abrio = null, tq = null, pedido = 0;

    // ── Vista "Con detalle" / "Solo títulos" (se recuerda) ──
    function vistaGuardada() {
        try { return localStorage.getItem(CLAVE_VISTA) === 'titulos' ? 'titulos' : 'detalle'; } catch (e) { return 'detalle'; }
    }
    function aplicarVista(v) {
        const raiz = $('rt-raiz');
        if (!raiz) return;
        raiz.classList.toggle('rt-solo-titulos', v === 'titulos');
        raiz.querySelectorAll('[data-vista]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === v)));
    }

    // ── Lista y rutina elegida ──
    async function cargar() {
        const mio = ++pedido;
        const activo = document.activeElement;
        const previo = activo && activo.id, enLista = !!(activo && activo.classList && activo.classList.contains('rt-item'));
        const scroll = (cuerpo.querySelector('#rt-items') || {}).scrollTop || 0;
        cuerpo.classList.add('ocupado');
        try {
            const r = await fetch(CFG.urlLista + '?' + params.toString(), { credentials: 'same-origin' });
            if (!r.ok) throw new Error('http ' + r.status);
            const html = await r.text();
            if (mio !== pedido) return;
            cuerpo.innerHTML = html;
            aplicarVista(vistaGuardada());
            const it = cuerpo.querySelector('#rt-items');
            if (it) it.scrollTop = scroll;
            if (enLista) {
                const sel = cuerpo.querySelector('.rt-item[aria-selected="true"]');
                if (sel) sel.focus({ preventScroll: true });
            } else {
                const el = previo && document.getElementById(previo);
                if (el && cuerpo.contains(el)) {
                    el.focus();
                    if (el.type === 'search') el.setSelectionRange(el.value.length, el.value.length);
                }
            }
        } catch (e) {
            if (mio === pedido && !cuerpo.querySelector('.rt')) cuerpo.innerHTML = '<div class="rt-cargando">' + I.error + '</div>';
            else toast({ title: I.error, description: window.TXT_REVISA_CONEXION }, 'error');
        } finally {
            if (mio === pedido) cuerpo.classList.remove('ocupado');
        }
    }
    function abrir(origen) {
        abrio = origen || document.activeElement;
        params = new URLSearchParams();
        if (CFG.area) params.set('area', CFG.area);
        cuerpo.innerHTML = '<div class="rt-cargando">' + I.cargando + '</div>';
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
        if (abrio && abrio.focus && document.contains(abrio)) abrio.focus();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-rutinas]');
        if (b) { e.preventDefault(); abrir(b); }
    });
    btnX.addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });

    // ── Búsqueda, selección, vista (delegación: el contenido se reemplaza en cada carga) ──
    function poner(clave, valor) {
        if (valor) params.set(clave, valor); else params.delete(clave);
        cargar();
    }
    cuerpo.addEventListener('input', e => {
        if (e.target.id !== 'rt-q') return;
        clearTimeout(tq);
        tq = setTimeout(() => poner('q', e.target.value.trim()), 250);
    });
    cuerpo.addEventListener('click', e => {
        const it = e.target.closest('.rt-item');
        if (it) { if (it.getAttribute('aria-selected') !== 'true') poner('rutina', it.dataset.clave); return; }
        const ley = e.target.closest('.rt-ley');
        if (ley) { filtrarPc(ley.getAttribute('aria-pressed') === 'true' ? '' : ley.dataset.pc); return; }
        if (e.target.closest('#rt-limpiar')) { poner('q', ''); return; }
        const v = e.target.closest('[data-vista]');
        if (v) {
            try { localStorage.setItem(CLAVE_VISTA, v.dataset.vista); } catch (er) { /* sin storage */ }
            aplicarVista(v.dataset.vista);
            return;
        }
        if (e.target.closest('#rt-importar')) { abrirImportar(); return; }
        const del = e.target.closest('#rt-eliminar');
        if (del) abrirEliminar(del);
    });
    cuerpo.addEventListener('keydown', e => {
        const it = e.target.closest && e.target.closest('.rt-item');
        if (!it || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
        e.preventDefault();
        const todos = Array.from(cuerpo.querySelectorAll('.rt-item')), i = todos.indexOf(it);
        const sig = todos[e.key === 'ArrowDown' ? i + 1 : i - 1];
        if (sig) { sig.focus(); sig.click(); }
    });

    
    // ── Leyenda de puntos críticos: filtra los pasos (otro clic en la activa o en "Todos" quita el filtro) ──
    function filtrarPc(v) {
        const ley = cuerpo.querySelector('.rt-leyenda');
        if (!ley) return;
        ley.querySelectorAll('.rt-ley').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pc === v)));
        let m = 0;
        cuerpo.querySelectorAll('.rt-paso').forEach(li => {
            const si = !v || li.dataset.pc.split(' ').indexOf(v) >= 0;
            li.hidden = !si;
            if (si) m++;
        });
        const n = ley.dataset.total, b = ley.querySelector('.rt-ley[data-pc="' + v + '"]');
        $('rt-pasos-txt').textContent = '· ' + (v ? fmt(I.filtroPc, { m: m, n: n, v: v, nombre: (b.dataset.nombre || '').toLowerCase() })
                                                  : fmt(I.ordenEjecucion, { n: n }));
    }

    // ── Importar nueva rutina ──
    const ri = $('rtdi-fondo');
    const selPlan = $('rtdi-plan'), inArchivo = $('rtdi-archivo'), taMotivo = $('rtdi-motivo');
    const bloqueExiste = $('rtdi-existe'), btnImp = $('rtdi-ok');
    const caja = $('rtdi-caja-archivo'), zona = $('rtdz-vacio'), tarjeta = $('rtdz-tarjeta');
    const anuncio = $('rtdz-anuncio'), txtArr = $('rtdz-arr-txt');
    const TIPOS_XLSX = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroEnabled.12'];
    const SV = (d, w) => '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    const SV_OK = SV('<path d="m5 12 5 5 9-10"/>', 13), SV_X = SV('<path d="M6 6l12 12M18 6 6 18"/>', 15);
    
    const FIG = ['M3 5h18L12 20z', 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z', 'M12 4l9 15H3z'];   // igual que _punto_critico.html
    const fig = (v, w) => '<svg class="rt-fig rt-fig-' + v + '" width="' + w + '" height="' + w + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + FIG[v] + '"/></svg>';
    const chipPc = v => '<span class="rt-pc rt-pc-' + v + '"><span class="rt-pc-ins">' + fig(v, 13) + v + '</span>' + esc(I.pcNombres[v]) + '</span>';

    const SV_INFO = SV('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 13);
    const fmtB = (t, o) => esc(t).replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
    const tamano = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    let archivo = null, lectura = null, revisandoArch = false, importando = false, confirmado = false, previaAbierta = false, pedidoVal = 0;

    function errImp(clave, msg) {
        const e = $('rtdi-err-' + clave);
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
        const campo = { plan: selPlan, motivo: taMotivo, archivo: zona }[clave];
        if (campo) campo.classList.toggle('err', !!msg);
    }
    const limpiarErrImp = () => ['plan', 'archivo', 'motivo', 'general'].forEach(k => errImp(k, ''));

    function actualizarBoton() {
        const listo = !!(selPlan.value && archivo && lectura && lectura.ok && !revisandoArch && taMotivo.value.trim());
        btnImp.disabled = importando || !listo;
        btnImp.textContent = importando ? I.importando : (lectura && lectura.ok && lectura.existe ? I.reemplazar : I.importar);
    }

    // Tarjeta del archivo: revisando, listo o con errores
    function pintar() {
        zona.hidden = !!archivo; tarjeta.hidden = !archivo;
        if (!archivo) { tarjeta.innerHTML = ''; return; }
        const nom = esc(archivo.name);
        const fila = meta => '<div class="rtdz-fila"><span class="rtdz-xlsx">XLSX</span><div class="rtdz-info"><div class="rtdz-nombre" title="' + nom + '">' + nom + '</div>' + meta +
            '</div><button type="button" class="rtdz-quitar" data-z="quitar" aria-label="' + esc(I.quitar) + '">' + SV_X + '</button></div>';
        if (revisandoArch) {
            tarjeta.className = 'rtdz-t rev';
            tarjeta.innerHTML = fila('<div class="rtdz-meta"><i class="rtdz-spin"></i>' + esc(I.revisando) + '</div>') + '<div class="rtdz-barra"></div>';
            return;
        }
        if (!lectura || !lectura.ok) {
            const errs = (lectura && lectura.errores && lectura.errores.length) ? lectura.errores : [I.errorRevisar];
            const lista = errs.slice(0, 5).map(t => '<li>' + esc(t) + '</li>');
            if (errs.length > 5) lista.push('<li>' + esc(fmt(I.masErrores, { k: errs.length - 5 })) + '</li>');
            const plantilla = (document.querySelector('.rtdz-plantilla') || {}).href || '#';
            tarjeta.className = 'rtdz-t mal';
            tarjeta.innerHTML = fila('<div class="rtdz-meta">' + esc(I.noSePuede) + '</div>') +
                '<ul class="rtdz-err">' + lista.join('') + '</ul>' +
                '<div class="rtdz-enl"><a class="pri" href="' + esc(plantilla) + '">' + esc(I.plantilla) + '</a>' +
                '<button type="button" data-z="cambiar">' + esc(I.elegirOtro) + '</button></div>';
            return;
        }
                const L = lectura, res = [];
        const linea = (clase, icono, html) => res.push('<span' + (clase ? ' class="' + clase + '"' : '') + '>' + icono + '<span>' + html + '</span></span>');
        const omit = L.omitidas ? ' · ' + esc(L.omitidas === 1 ? I.omitida1 : fmt(I.omitidasN, { k: L.omitidas })) : '';
        linea('', SV_OK, fmtB(I.pasosDetectados, { n: '<b>' + L.n + '</b>', min: L.min, max: L.max }) + omit);
        if (L.codigo) linea('', SV_OK, fmtB(I.codigoArea, { codigo: '<b>' + esc(L.codigo) + '</b>', area: esc(L.area_doc || CFG.areaNombre || '') }).replace(/ · $/, '') +
            (L.codigo_documento ? ' · ' + fmtB(I.documento, { doc: esc(L.codigo_documento) }) : ''));
        const pc = [];
        if (L.prioridad) pc.push(fmtB(I.prioridadRes, { p: '<b>' + esc(L.prioridad) + '</b>' }));
        if (L.creador) pc.push(fmtB(I.creadorRes, { c: esc(L.creador) }));
        if (pc.length) linea('', SV_OK, pc.join(' · '));
        if (L.n_pc) linea('', SV_OK, fmtB(I.conPc, { k: '<b>' + L.n_pc + '</b>' }) +
            [0, 1, 2].map(v => '<span class="rtdz-pc rt-pc-' + v + '">' + fig(v, 12) + v + ' ×' + (L.conteo_pc[v] || 0) + '</span>').join(''));
        if (L.existe) {
            linea('am', SV_INFO, fmtB(I.yaExiste, { codigo: '<b>' + esc(L.existe.codigo) + '</b>', n: L.existe.n }));
            (L.existe.cambios || []).forEach(t => linea('am', SV_INFO, esc(t)));
        }
        (L.avisos || []).forEach(t => linea('am', SV_INFO, esc(t)));
        // Vista previa: misma tabla que la rutina (Seq · Paso y detalle · Puntos críticos) con un encabezado compacto
        const cabPrev = [[I.prioridad, L.prioridad], [I.area, L.area_doc], [I.locacion, L.locacion], [I.creador, L.creador]]
            .filter(x => x[1]).map(x => '<span><small>' + esc(x[0]) + '</small>' + esc(x[1]) + '</span>').join('');
        const previa = previaAbierta ? '<div class="rtdz-prev">' + (cabPrev ? '<div class="rtdz-prev-cab">' + cabPrev + '</div>' : '') +
            '<div class="rtdz-pv rtdz-pv-cab"><span>' + esc(I.seq) + '</span><span>' + esc(I.pasoDetalle) + '</span><span>' + esc(I.puntosCriticos) + '</span></div>' +
            L.pasos.map(p => '<div class="rtdz-pv"><b>' + p.seq + '</b><div><strong>' + esc(p.titulo) + '</strong><span>' + esc(p.detalle || I.sinDetalle) + '</span></div>' +
                '<div class="rtdz-pv-pc">' + (p.pc.length ? p.pc.map(chipPc).join('') : '<span class="rt-pc-no">—</span>') + '</div></div>').join('') + '</div>' : '';
        tarjeta.className = 'rtdz-t ok';
        tarjeta.innerHTML = fila('<div class="rtdz-meta">' + esc(fmt(I.subido, { tamano: tamano(archivo.size) })) + '</div>') +
            '<div class="rtdz-barra"></div><div class="rtdz-res">' + res.join('') + '</div>' +
            '<div class="rtdz-enl"><button type="button" class="pri" data-z="previa" aria-expanded="' + previaAbierta + '">' + esc(previaAbierta ? I.ocultarPrevia : I.verPrevia) + '</button>' +
            '<button type="button" data-z="cambiar">' + esc(I.cambiarArchivo) + '</button></div>' + previa;

    }

    function limpiarArchivo(foco) {
        pedidoVal++;
        archivo = null; lectura = null; revisandoArch = false; previaAbierta = false; confirmado = false;
        inArchivo.value = ''; bloqueExiste.hidden = true; anuncio.textContent = ''; errImp('archivo', '');
        pintar(); actualizarBoton();
        if (foco) zona.focus();
    }

    // El archivo se revisa en el servidor apenas se sube (sin guardar nada)
    async function revisar(f) {
        const mio = ++pedidoVal;
        archivo = f; lectura = null; revisandoArch = true; previaAbierta = false; confirmado = false;
        bloqueExiste.hidden = true; errImp('archivo', '');
        pintar(); actualizarBoton();
        try {
            const fd = new FormData();
            fd.append('archivo', f); fd.append('area', CFG.area);
            if (selPlan.value) fd.append('plan_trabajo', selPlan.value);
            const r = await fetch(CFG.urlValidar, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': CFG.csrf }, body: fd });
            const d = await r.json();
            if (mio !== pedidoVal) return;
            lectura = d.errores ? d : { ok: false, errores: [d.error || I.errorRevisar] };
        } catch (e) {
            if (mio !== pedidoVal) return;
            lectura = { ok: false, errores: [I.errorRevisar] };
        }
        revisandoArch = false;
        pintar(); actualizarBoton();
        anuncio.textContent = lectura.ok ? fmt(I.anuncioListo, { n: lectura.n }) : fmt(I.anuncioError, { k: lectura.errores.length });
    }

    // Zona para arrastrar: clic, Enter/Espacio o soltar el archivo
    zona.addEventListener('click', () => inArchivo.click());
    zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inArchivo.click(); } });
    inArchivo.addEventListener('change', () => { if (inArchivo.files.length) revisar(inArchivo.files[0]); });
    const llevaArchivos = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0);
    const quitarMarca = () => zona.classList.remove('arrastrando', 'arr-mal');
    caja.addEventListener('dragover', e => {
        if (!llevaArchivos(e)) return;
        e.preventDefault();
        const it = e.dataTransfer.items && e.dataTransfer.items[0];
        const mal = !!(it && it.kind === 'file' && it.type && TIPOS_XLSX.indexOf(it.type) < 0);
        e.dataTransfer.dropEffect = mal ? 'none' : 'copy';
        if (zona.hidden) return;
        zona.classList.add('arrastrando'); zona.classList.toggle('arr-mal', mal);
        txtArr.textContent = mal ? I.soloExcel : I.suelta;
    });
    caja.addEventListener('dragleave', e => { if (!caja.contains(e.relatedTarget)) quitarMarca(); });
    caja.addEventListener('drop', e => {
        e.preventDefault(); quitarMarca();
        if (e.dataTransfer.files.length) revisar(e.dataTransfer.files[0]);
    });
    ri.addEventListener('dragover', e => e.preventDefault());   // soltar fuera de la zona no abre el archivo en el navegador
    ri.addEventListener('drop', e => e.preventDefault());
    tarjeta.addEventListener('click', e => {
        const b = e.target.closest('[data-z]');
        if (!b) return;
        if (b.dataset.z === 'quitar') limpiarArchivo(true);
        else if (b.dataset.z === 'cambiar') { inArchivo.value = ''; inArchivo.click(); }
        else if (b.dataset.z === 'previa') {
            previaAbierta = !previaAbierta; pintar();
            const n = tarjeta.querySelector('[data-z="previa"]'); if (n) n.focus();
        }
    });

    
    function abrirImportar() {
        if (!CFG.area) { toast({ title: I.sinAreaTit, description: I.sinArea }, 'warning'); return; }
        let planes = [];
        try { planes = JSON.parse($('rt-planes-json').textContent) || []; } catch (e) { planes = []; }
        selPlan.innerHTML = '<option value="">' + esc(I.eligePlan) + '</option>' +
            planes.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
        taMotivo.value = '';
        limpiarArchivo(false); limpiarErrImp();
        ri.hidden = false;
        selPlan.focus();
    }
    function cerrarImportar() {
        if (ri.hidden) return;
        if ((archivo || taMotivo.value.trim()) && !importando && !window.confirm(I.descartar)) return;
        pedidoVal++;
        ri.hidden = true;
        (document.getElementById('rt-importar') || btnX).focus();
    }
    $('rtdi-cancelar').addEventListener('click', cerrarImportar);
    $('rtdi-x').addEventListener('click', cerrarImportar);
    ri.addEventListener('mousedown', e => { if (e.target === ri) cerrarImportar(); });
    selPlan.addEventListener('change', () => {          // al cambiar de plan se vuelve a revisar si ya existe
        errImp('plan', ''); bloqueExiste.hidden = true; confirmado = false;
        if (archivo) revisar(archivo); else actualizarBoton();
    });
    taMotivo.addEventListener('input', () => { errImp('motivo', ''); bloqueExiste.hidden = true; confirmado = false; actualizarBoton(); });

    btnImp.addEventListener('click', async () => {
        if (importando || btnImp.disabled) return;
        limpiarErrImp();
        if (lectura.existe && !confirmado) {              // reemplazar pide confirmar antes
            bloqueExiste.textContent = fmt(I.confirmaReemplazo, { codigo: lectura.existe.codigo, m: lectura.existe.n, n: lectura.n }) +
                ((lectura.existe.cambios || []).length ? ' ' + lectura.existe.cambios.join('. ') + '.' : '');
            bloqueExiste.hidden = false; confirmado = true;
            return;
        }
        importando = true; actualizarBoton();
        try {
            const fd = new FormData();
            fd.append('area', CFG.area); fd.append('plan_trabajo', selPlan.value);
            fd.append('motivo', taMotivo.value.trim()); fd.append('archivo', archivo);
            if (lectura.existe) fd.append('reemplazar', '1');
            const r = await fetch(CFG.urlImportar, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': CFG.csrf }, body: fd });
            const d = await r.json();
            if (r.status === 409 && d.existe) {           // alguien la creó mientras tanto: se vuelve a revisar
                importando = false; await revisar(archivo);
                return;
            }
            if (!r.ok || !d.ok) {
                const errs = d.errores || {};
                Object.keys(errs).forEach(k => errImp(k, errs[k]));
                if (!Object.keys(errs).length) errImp('general', d.error || I.errorGuardar);
                return;
            }
            ri.hidden = true;
            toast({ title: I.toastImportada, description: fmt(I.toastImportadaDet, { codigo: d.codigo || selPlan.value, n: d.n }) });
            params.delete('q'); params.set('rutina', d.clave);
            cargar();
        } catch (e) {
            errImp('general', I.errorGuardar);
        } finally {
            importando = false; actualizarBoton();
        }
    });
    

    // ── Eliminar rutina (motivo obligatorio; si la usan planes, también su código) ──
    const re_ = $('rtde-fondo');
    const taMotivoDel = $('rtde-motivo'), inConfirma = $('rtde-confirmar'), btnDel = $('rtde-ok');
    let rutinaDel = null, eliminando = false;

    function errDel(clave, msg) {
        const e = $('rtde-err-' + clave);
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
    }
    function validarDel() {
        const ok = taMotivoDel.value.trim() && (!rutinaDel.usada || inConfirma.value.trim().toLowerCase() === rutinaDel.codigo.toLowerCase());
        btnDel.disabled = !ok;
    }
    function abrirEliminar(b) {
        rutinaDel = { area: b.dataset.area, plan: b.dataset.plan, codigo: b.dataset.codigo || b.dataset.plan,
                      usada: parseInt(b.dataset.usada, 10) || 0, n: parseInt(b.dataset.n, 10) || 0 };
        $('rtde-titulo').textContent = fmt(I.eliminarTitulo, { codigo: rutinaDel.codigo });
        $('rtde-txt').textContent = rutinaDel.usada ? fmt(I.eliminarTxtUso, { n: rutinaDel.n, k: rutinaDel.usada })
                                                    : fmt(I.eliminarTxt, { n: rutinaDel.n });
        $('rtde-confirmar-wrap').hidden = !rutinaDel.usada;
        $('rtde-confirmar-lab').textContent = fmt(I.confirmaCodigo, { codigo: rutinaDel.codigo });
        taMotivoDel.value = ''; inConfirma.value = '';
        ['motivo', 'confirmar', 'general'].forEach(k => errDel(k, ''));
        validarDel();
        re_.hidden = false;
        taMotivoDel.focus();
    }
    function cerrarEliminar() {
        if (re_.hidden) return;
        re_.hidden = true;
        (document.getElementById('rt-eliminar') || btnX).focus();
    }
    $('rtde-cancelar').addEventListener('click', cerrarEliminar);
    re_.addEventListener('mousedown', e => { if (e.target === re_) cerrarEliminar(); });
    [taMotivoDel, inConfirma].forEach(el => el.addEventListener('input', validarDel));

    btnDel.addEventListener('click', async () => {
        if (eliminando || btnDel.disabled) return;
        eliminando = true; btnDel.disabled = true;
        ['motivo', 'confirmar', 'general'].forEach(k => errDel(k, ''));
        try {
            const r = await fetch(CFG.urlEliminar, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CFG.csrf },
                body: JSON.stringify({ area: rutinaDel.area, plan: rutinaDel.plan, motivo: taMotivoDel.value.trim(), confirmar: inConfirma.value.trim() })
            });
            const d = await r.json();
            if (!r.ok || !d.ok) {
                const errs = d.errores || {};
                Object.keys(errs).forEach(k => errDel(k, errs[k]));
                if (!Object.keys(errs).length) errDel('general', d.error || I.errorEliminar);
                return;
            }
            re_.hidden = true;
            toast(fmt(I.toastEliminada, { codigo: d.codigo }));
            params.delete('rutina');          // se elige la siguiente de la lista
            cargar();
        } catch (e) {
            errDel('general', I.errorEliminar);
        } finally {
            eliminando = false; validarDel();
        }
    });

    // ── Teclado: Escape cierra lo de más arriba; Tab queda dentro del diálogo de arriba ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        const arriba = !re_.hidden ? re_ : (!ri.hidden ? ri : fondo);
        if (e.key === 'Escape') {
            e.stopPropagation();
            if (!re_.hidden) cerrarEliminar(); else if (!ri.hidden) cerrarImportar(); else cerrar();
            return;
        }
        if (e.key !== 'Tab') return;
        const f = Array.from(arriba.querySelectorAll('button:not([disabled]), a[href], input, select, textarea, [tabindex="0"]')).filter(x => x.offsetParent);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }, true);
})();

