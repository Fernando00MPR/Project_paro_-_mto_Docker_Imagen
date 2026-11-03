/* plan_seguimiento_form.js — modal "Nuevo / Editar seguimiento" que se abre desde el detalle de un plan
   (plan/lista.html, #modal-seg-padre). El detalle del plan (iframe) manda por postMessage un JSON
   {tipo:'abrir_mseg', id, registro_pk, contexto:{…}, …}; al guardar o eliminar se le avisa de vuelta
   ('mseg_guardado' / 'mseg_eliminado') para que refresque su tabla de Seguimientos. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const raiz = $('modal-seg-padre');
    if (!raiz) return;
    const I = window.PSF_I18N || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), I[k] || k);
    const csrf = () => (typeof CSRF_MTO !== 'undefined' ? CSRF_MTO : '');
    const MAX_FOTOS = 4, MAX_BYTES = 5 * 1024 * 1024, MAX_LADO = 1600, DIA = 864e5;

    const F = { problema: $('psf-problema'), accion: $('psf-accion'), notas: $('psf-notas') };
    const fechaIn = document.querySelector('#dp-psf-fecha .dp-value');
    let modo = 'nuevo', segId = '', registroPk = '', contexto = null, creadoIso = '';
    let resp = '';                       // responsable elegido (nombre)
    let estatus = 'pendiente';
    let fotos = [], quitadas = [], inicial = '', guardando = false, abrio = null;

    // ── Fechas ──
    const pad = n => String(n).padStart(2, '0');
    const aIso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const hoyIso = () => aIso(new Date());
    const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    function semanaIso(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        const x = new Date(Date.UTC(y, m - 1, d));
        x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
        const anio = x.getUTCFullYear();
        return Math.ceil(((x - Date.UTC(anio, 0, 1)) / DIA + 1) / 7);
    }
    const sumarDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return aIso(d); };
    const finDeMes = () => { const d = new Date(); return aIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
    const getFecha = () => fechaIn.value;
    function setFecha(iso) { fechaIn.value = iso || ''; fechaIn.dispatchEvent(new Event('change', { bubbles: true })); }
    
    const fechaMinima = () => (modo === 'editar' && creadoIso) ? creadoIso : hoyIso();
    let fechaOriginal = '';              // al editar, una fecha anterior ya guardada no se vuelve a exigir si no se toca
    const fechaInvalida = iso => !!iso && iso < fechaMinima() && iso !== fechaOriginal;

    // ── Errores ──
    function error(clave, msg) {
        const e = $('psf-err-' + clave);
        if (e) { e.textContent = msg || ''; e.hidden = !msg; }
        const campo = { problema: F.problema, accion: F.accion, resp: $('psf-combo'), fecha: $('psf-fechaw') }[clave];
        if (campo) campo.classList.toggle('err', !!msg);
    }
    const limpiarErrores = () => ['problema', 'accion', 'resp', 'fecha', 'general'].forEach(k => error(k, ''));

    // ── Contadores ──
    function contadores() {
        $('psf-cnt-problema').textContent = F.problema.value.length + ' / 500';
        $('psf-cnt-accion').textContent = F.accion.value.length + ' / 500';
    }
    F.problema.addEventListener('input', () => { contadores(); if (F.problema.value.trim()) error('problema', ''); });
    F.accion.addEventListener('input', () => { contadores(); if (F.accion.value.trim()) error('accion', ''); });

    // ── Responsable: combobox con búsqueda (solo personas existentes) ──
    const combo = $('psf-combo'), inp = $('psf-resp-input'), lista = $('psf-resp-lista'), quitarBtn = $('psf-resp-quitar');
    let resultados = [], activa = -1, deb = null, tokenBusq = 0;
    const iniciales = n => ((n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('') || '?').toUpperCase();
    function pintarResp() {
        combo.classList.toggle('elegido', !!resp);
        $('psf-resp-elegido').innerHTML = '';
        if (resp) {
            const av = document.createElement('span'); av.className = 'psf-av'; av.textContent = iniciales(resp);
            const nm = document.createElement('span'); nm.className = 'psf-resp-nom'; nm.textContent = resp; nm.title = resp;
            $('psf-resp-elegido').append(av, nm);
        }
        inp.setAttribute('aria-expanded', lista.hidden ? 'false' : 'true');
    }
    function cerrarLista() { lista.hidden = true; activa = -1; inp.setAttribute('aria-expanded', 'false'); }
    function elegir(nombre) { resp = nombre; inp.value = ''; cerrarLista(); pintarResp(); error('resp', ''); }
    function pintarLista() {
        lista.replaceChildren();
        if (!resultados.length) {
            const li = document.createElement('li'); li.className = 'vacio'; li.textContent = t('sinResultados'); lista.append(li);
        }
        resultados.forEach((r, i) => {
            const li = document.createElement('li'); li.setAttribute('role', 'option'); li.dataset.i = i;
            const av = document.createElement('span'); av.className = 'av'; av.textContent = iniciales(r.nombre);
            const tx = document.createElement('span'); tx.textContent = r.nombre;
            li.append(av, tx);
            li.addEventListener('mousedown', e => { e.preventDefault(); elegir(r.nombre); });
            lista.append(li);
        });
        lista.hidden = false;
        inp.setAttribute('aria-expanded', 'true');
    }
    function buscar(q) {
        const mio = ++tokenBusq;
        fetch('/mto/responsables/buscar-mto/?q=' + encodeURIComponent(q), { credentials: 'same-origin' })
            .then(r => r.json())
            .then(d => { if (mio !== tokenBusq) return; resultados = d || []; activa = resultados.length ? 0 : -1; pintarLista(); markActiva(); })
            .catch(() => { /* sin red: se queda la lista anterior */ });
    }
    function markActiva() { [...lista.querySelectorAll('li[role=option]')].forEach((li, i) => li.classList.toggle('activa', i === activa)); }
    inp.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => buscar(inp.value.trim()), 200); });
    inp.addEventListener('focus', () => buscar(inp.value.trim()));
    inp.addEventListener('blur', () => setTimeout(() => { cerrarLista(); inp.value = ''; }, 120));
    inp.addEventListener('keydown', e => {
        const n = resultados.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) buscar(inp.value.trim()); else { activa = (activa + 1) % n; markActiva(); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { activa = (activa - 1 + n) % n; markActiva(); } }
        else if (e.key === 'Enter' && !lista.hidden && activa >= 0) { e.preventDefault(); e.stopPropagation(); elegir(resultados[activa].nombre); }
        else if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); e.stopPropagation(); cerrarLista(); }
    });
    quitarBtn.addEventListener('click', () => { resp = ''; pintarResp(); inp.focus(); });

    // ── Fecha compromiso: semana, aviso (vence hoy / vencida) y atajos ──
    function pintarFecha() {
        const iso = getFecha(), tag = $('psf-sem-tag');
        tag.className = 'psf-semtag';
        tag.textContent = '';
        if (iso) {
            const s = 'S' + semanaIso(iso);
            if (iso === hoyIso() && estatus !== 'completado') { tag.textContent = s + ' · ' + t('venceHoy'); tag.classList.add('hoy'); }
            else if (iso < hoyIso() && estatus !== 'completado') { tag.textContent = s + ' · ' + t('vencida'); tag.classList.add('venc'); }
            else tag.textContent = s;
            if (fechaInvalida(iso)) error('fecha', t('fechaAnterior', { f: deIso(fechaMinima()).toLocaleDateString(document.documentElement.lang || 'es') }));
            else error('fecha', '');
        } else error('fecha', '');
        const vals = { hoy: hoyIso(), 7: sumarDias(7), 14: sumarDias(14), fin: finDeMes() };
        document.querySelectorAll('.psf-atajo').forEach(b => b.setAttribute('aria-pressed', iso && vals[b.dataset.atajo] === iso ? 'true' : 'false'));
    }
    fechaIn.addEventListener('change', pintarFecha);
    document.querySelectorAll('.psf-atajo').forEach(b => b.addEventListener('click', () => {
        const v = { hoy: hoyIso(), 7: sumarDias(7), 14: sumarDias(14), fin: finDeMes() }[b.dataset.atajo];
        setFecha(v);
    }));

    // ── Estatus ──
    const botonesEst = [...document.querySelectorAll('.psf-eb')];
    function setEstatus(v) {
        estatus = v;
        botonesEst.forEach(b => b.setAttribute('aria-checked', b.dataset.val === v ? 'true' : 'false'));
        pintarFecha();
    }
    botonesEst.forEach((b, i) => {
        b.addEventListener('click', () => setEstatus(b.dataset.val));
        b.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const n = botonesEst[(i + (e.key === 'ArrowRight' ? 1 : -1) + botonesEst.length) % botonesEst.length];
                n.focus(); setEstatus(n.dataset.val);
            }
        });
    });

    // ── Imágenes (hasta 4; JPG/PNG de 5 MB; se comprimen en el cliente) ──
    const cuadro = $('psf-imgs'), archivo = $('psf-file');
    function pintarFotos() {
        const items = fotos.map((f, i) => {
            const d = document.createElement('div'); d.className = 'sge-slot foto';
            const im = document.createElement('img'); im.src = f.url; im.alt = ''; im.tabIndex = 0; im.setAttribute('role', 'button');
            im.setAttribute('aria-label', t('verFoto', { n: i + 1 }));
            im.addEventListener('click', () => abrirVisor(f.url));
            im.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirVisor(f.url); } });
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', t('quitarFoto'));
            rm.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
            rm.addEventListener('click', () => {
                if (f.id) quitadas.push(f.id); else if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url);
                fotos.splice(i, 1); pintarFotos();
            });
            d.append(im, rm);
            return d;
        });
        if (fotos.length < MAX_FOTOS) {
            const a = document.createElement('button'); a.type = 'button'; a.className = 'sge-slot agregar'; a.setAttribute('aria-label', t('agregarFoto'));
            a.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' + t('agregar');
            a.addEventListener('click', () => archivo.click());
            items.push(a);
        }
        while (items.length < MAX_FOTOS) { const v = document.createElement('div'); v.className = 'sge-slot'; v.setAttribute('aria-hidden', 'true'); items.push(v); }
        cuadro.replaceChildren(...items);
        $('psf-cnt-imgs').textContent = fotos.length + ' / ' + MAX_FOTOS;
    }
    function comprimir(file) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                const k = Math.min(1, MAX_LADO / Math.max(im.naturalWidth, im.naturalHeight));
                const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => resolve(b && b.size < file.size ? b : file), 'image/jpeg', 0.85);
            };
            im.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            im.src = url;
        });
    }
    async function agregarArchivos(lst) {
        error('general', '');
        for (const f of Array.from(lst)) {
            if (fotos.length >= MAX_FOTOS) { error('general', t('maxFotos')); break; }
            if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > MAX_BYTES) { error('general', t('soloImagenes')); continue; }
            const blob = await comprimir(f);
            const nombre = (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
            fotos.push({ url: URL.createObjectURL(blob), file: blob.type === 'image/jpeg' ? new File([blob], nombre, { type: 'image/jpeg' }) : f });
        }
        pintarFotos();
    }
    archivo.addEventListener('change', () => { agregarArchivos(archivo.files); archivo.value = ''; });
    cuadro.addEventListener('dragover', e => { e.preventDefault(); cuadro.classList.add('arrastrando'); });
    cuadro.addEventListener('dragleave', () => cuadro.classList.remove('arrastrando'));
    cuadro.addEventListener('drop', e => { e.preventDefault(); cuadro.classList.remove('arrastrando'); agregarArchivos(e.dataTransfer.files); });
    document.addEventListener('paste', e => {
        if (!abierto()) return;
        const imgs = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.startsWith('image/'));
        if (imgs.length) { e.preventDefault(); agregarArchivos(imgs); }
    });
    const visor = $('psf-visor');
    function abrirVisor(url) { visor.querySelector('img').src = url; visor.hidden = false; visor.querySelector('button').focus(); }
    function cerrarVisor() { visor.hidden = true; visor.querySelector('img').src = ''; }
    visor.addEventListener('click', e => { if (e.target === visor || e.target.closest('button')) cerrarVisor(); });

    // ── Abrir ──
    const abierto = () => raiz.style.display === 'flex';
    const firma = () => JSON.stringify([F.problema.value, F.accion.value, F.notas.value, resp, getFecha(), estatus,
                                         fotos.map(f => f.id || (f.file && f.file.name) || ''), quitadas]);
    function relativo(iso) {
        const seg = (new Date(iso) - Date.now()) / 1000, abs = Math.abs(seg);
        const rtf = new Intl.RelativeTimeFormat(document.documentElement.lang || 'es', { numeric: 'auto' });
        if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
        return rtf.format(Math.round(seg / 86400), 'day');
    }
    function pintarContexto() {
        const c = $('psf-ligado');
        c.hidden = !contexto;
        if (!contexto) return;
        $('psf-lig-cod').textContent = contexto.codigo || '';
        const nom = $('psf-lig-nom'); nom.textContent = contexto.nombre || ''; nom.title = contexto.nombre || '';
        $('psf-lig-sem').textContent = 'S' + contexto.semana + (contexto.rango ? ' · ' + contexto.rango : '') + ' ' + contexto.anio;
        const e = $('psf-lig-est');
        e.textContent = contexto.estadoTxt || t('sinRegistro');
        e.className = 'psf-est ' + (contexto.estado || 'sinreg');
    }
    function abrir(msg) {
        // El botón que lo abrió vive dentro del iframe del detalle del plan: ahí se devuelve el foco al cerrar.
        try { abrio = $('modal-iframe').contentDocument.activeElement; } catch (e) { abrio = null; }
        modo = msg.id ? 'editar' : 'nuevo';
        segId = msg.id || ''; registroPk = msg.registro_pk || ''; contexto = msg.contexto || null;
        creadoIso = msg.creadoIso || '';
        fechaOriginal = msg.id ? (msg.fecha || '') : '';
        F.problema.value = msg.problema || ''; F.accion.value = msg.accion || ''; F.notas.value = msg.notas || '';
        resp = msg.responsable || '';
        fotos = []; quitadas = [];
        limpiarErrores(); contadores();

        $('psf-titulo-txt').textContent = modo === 'editar' ? t('tituloEditar') : t('tituloNuevo');
        const ord = $('psf-orden'); ord.hidden = !(modo === 'editar' && msg.orden); ord.textContent = msg.orden || '';
        let sub = t('subNuevo');
        if (modo === 'editar') {
            sub = t('subEditar', { fecha: msg.creado || '', usuario: msg.creadoPor || '—' });
            if (msg.modificado && msg.creadoIso && new Date(msg.modificado) - new Date(msg.creadoIso + 'T00:00:00') > 60000
                && (Date.now() - new Date(msg.modificado)) > 0) {
                const m = new Date(msg.modificado);
                if (aIso(m) !== msg.creadoIso || (Date.now() - m) > 120000) sub += ' · ' + t('ultimaEdicion', { cuando: relativo(msg.modificado) });
            }
        }
        $('psf-sub').textContent = sub;
        $('psf-ico-path').setAttribute('d', modo === 'editar' ? 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' : 'M12 5v14M5 12h14');
        $('psf-eliminar').hidden = modo !== 'editar' || msg.puedeEliminar === false;
        $('psf-guardar').textContent = modo === 'editar' ? t('guardarCambios') : t('crearSeguimiento');
        pintarContexto();
        pintarResp();
        setEstatus(msg.estatus || 'pendiente');
        setFecha(msg.fecha || '');
        pintarFotos();
        raiz.removeAttribute('data-closing');
        raiz.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => F.problema.focus(), 50);
        inicial = firma();
        if (modo === 'editar') {
            fetch('/mto/seguimiento/ot/' + segId + '/imagenes/', { credentials: 'same-origin' }).then(r => r.json()).then(d => {
                if (!abierto() || String(segId) !== String(msg.id)) return;
                fotos = (d.imagenes || []).map(i => ({ id: i.id, url: i.url }));
                pintarFotos(); inicial = firma();
            }).catch(() => { /* sin fotos */ });
        }
    }

    // ── Cerrar ──
    function cerrarYa() {
        raiz.style.display = 'none';
        $('psf-descartar').style.display = 'none'; $('psf-eliminar-dlg').style.display = 'none'; cerrarVisor();
        fotos.forEach(f => { if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url); });
        fotos = []; quitadas = [];
        document.body.style.overflow = $('modal-backdrop') && $('modal-backdrop').style.display === 'flex' ? 'hidden' : '';
        try {
            const ventana = $('modal-iframe').contentWindow;
            ventana.focus();
            if (abrio && abrio.ownerDocument === ventana.document && ventana.document.body.contains(abrio)) abrio.focus();
        } catch (e) { /* sin foco */ }
    }
    function intentarCerrar() {
        if (firma() !== inicial) { $('psf-descartar').style.display = 'flex'; $('psf-d-seguir').focus(); }
        else cerrarYa();
    }
    $('psf-cerrar').addEventListener('click', intentarCerrar);
    $('psf-cancelar').addEventListener('click', intentarCerrar);
    raiz.addEventListener('mousedown', e => { if (e.target === raiz) intentarCerrar(); });
    $('psf-d-seguir').addEventListener('click', () => { $('psf-descartar').style.display = 'none'; });
    $('psf-d-descartar').addEventListener('click', cerrarYa);

    // ── Validar y guardar ──
    function validar() {
        limpiarErrores();
        let primero = null;
        const falla = (k, msg, el) => { error(k, msg); if (!primero) primero = el; };
        if (!F.problema.value.trim()) falla('problema', t('errProblema'), F.problema);
        if (!resp) falla('resp', t('errResp'), inp);
        if (fechaInvalida(getFecha())) falla('fecha', t('fechaAnterior', { f: deIso(fechaMinima()).toLocaleDateString(document.documentElement.lang || 'es') }), $('psf-fechaw').querySelector('.dp-control'));
        if (primero) { primero.focus(); return false; }
        return true;
    }
    const post = (url, cuerpo, esJson) => fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: Object.assign({ 'X-CSRFToken': csrf() }, esJson ? { 'Content-Type': 'application/json' } : {}),
        body: esJson ? JSON.stringify(cuerpo) : cuerpo,
    });
    const avisar = (tipo, data) => { try { $('modal-iframe').contentWindow.postMessage(JSON.stringify({ tipo: tipo, data: data }), '*'); } catch (e) { /* modal cerrado */ } };
    const toast = (msg, tipo) => { if (typeof showToast === 'function') showToast(msg, tipo || 'success'); };

    async function guardar() {
        if (guardando || !validar()) return;
        const btn = $('psf-guardar'), txt = btn.textContent;
        guardando = true; btn.disabled = true; btn.textContent = t('guardando');
        try {
            const url = modo === 'editar' ? '/mto/seguimiento/editar/' + segId + '/' : '/mto/seguimiento/agregar/' + registroPk + '/';
            const r = await post(url, { problema: F.problema.value.trim(), accion: F.accion.value.trim(), responsable: resp,
                                        fecha_compromiso: getFecha(), estatus: estatus, notas: F.notas.value.trim() }, true);
            const data = await r.json();
            if (!data.ok) {
                const errs = data.errores || {};
                Object.keys(errs).forEach(k => error(k === 'responsable' ? 'resp' : k, errs[k]));
                if (!Object.keys(errs).length) error('general', data.error || t('errorGuardar'));
                return;
            }
            // Imágenes: quitar las marcadas y subir las nuevas al seguimiento ya guardado.
            for (const id of quitadas) { try { await post('/mto/seguimiento/imagen/eliminar/' + id + '/', null, false); } catch (e) { /* se reintenta al editar */ } }
            const nuevas = fotos.filter(f => f.file);
            if (nuevas.length) {
                const fd = new FormData();
                nuevas.forEach(f => fd.append('imagenes', f.file, f.file.name));
                try { await post('/mto/seguimiento/ot/' + data.id + '/imagenes/subir/', fd, false); } catch (e) { toast(t('errorFotos'), 'warning'); }
            }
            inicial = firma();
            cerrarYa();
            toast(modo === 'editar' ? t('toastGuardado') : t('toastCreado', { orden: data.orden }), 'success');
            avisar('mseg_guardado', data);
        } catch (e) {
            error('general', t('errorRed'));
        } finally {
            guardando = false; btn.disabled = false; btn.textContent = txt;
        }
    }
    $('psf-guardar').addEventListener('click', guardar);

    // ── Eliminar ──
    $('psf-eliminar').addEventListener('click', () => {
        $('psf-eliminar-tx').textContent = t('confirmarEliminar', { orden: $('psf-orden').textContent });
        $('psf-eliminar-dlg').style.display = 'flex'; $('psf-e-cancelar').focus();
    });
    $('psf-e-cancelar').addEventListener('click', () => { $('psf-eliminar-dlg').style.display = 'none'; });
    $('psf-e-eliminar').addEventListener('click', async () => {
        const orden = $('psf-orden').textContent;
        try {
            const r = await post('/mto/seguimiento/eliminar/' + segId + '/', null, false);
            const d = await r.json();
            if (!d.ok) throw new Error('no');
            inicial = firma(); cerrarYa();
            toast(t('toastEliminado', { orden: orden }), 'success');
            avisar('mseg_eliminado', { id: segId });
        } catch (e) {
            $('psf-eliminar-dlg').style.display = 'none'; error('general', t('errorEliminar'));
        }
    });

    // ── Teclado: Escape cierra SOLO este modal (no el del plan); Ctrl+Enter guarda; el foco no se escapa ──
    document.addEventListener('keydown', e => {
        if (!abierto()) return;
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopImmediatePropagation();
            if (!visor.hidden) cerrarVisor();
            else if ($('psf-eliminar-dlg').style.display === 'flex') $('psf-eliminar-dlg').style.display = 'none';
            else if ($('psf-descartar').style.display === 'flex') $('psf-descartar').style.display = 'none';
            else intentarCerrar();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); guardar();
        } else if (e.key === 'Tab') {
            const cont = $('psf-eliminar-dlg').style.display === 'flex' ? $('psf-eliminar-dlg')
                       : $('psf-descartar').style.display === 'flex' ? $('psf-descartar') : raiz.querySelector('.sge-modal');
            const lst = [...cont.querySelectorAll('button, [href], input:not([type=hidden]):not([hidden]), textarea, [tabindex]:not([tabindex="-1"])')]
                .filter(x => !x.disabled && x.offsetParent !== null);
            if (!lst.length) return;
            const pri = lst[0], ult = lst[lst.length - 1];
            if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
            else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
        }
    }, true);

    // ── Mensajes del detalle del plan ──
    window.addEventListener('message', e => {
        if (typeof e.data !== 'string' || e.data.charAt(0) !== '{') return;
        try { const m = JSON.parse(e.data); if (m.tipo === 'abrir_mseg') abrir(m); } catch (err) { /* mensaje ajeno */ }
    });
})();
