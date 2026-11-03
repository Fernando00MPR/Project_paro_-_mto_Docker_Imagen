/* registro_form.js — formulario "Registrar ejecución" del detalle del plan (se carga en un <iframe>).
   Lee su configuración de #rf-cfg (json_script), las personas de #rf-personas y los textos de window.RF_I18N.
   Las reglas de negocio también se aplican en el servidor (views/registro_ejecucion.py). */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const CFG = JSON.parse($('rf-cfg').textContent);
    const PERSONAS = JSON.parse($('rf-personas').textContent);
    const I = window.RF_I18N || {};
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), I[k] || k);
    const DIA = 864e5;
    const MAX_BYTES = 5 * 1024 * 1024;
    const MAX_LADO = 1600;

    const form = $('rf-form');
    const F = n => form.elements[n];
    const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // ── Semanas ISO (UTC, igual que el resto del Plan) ──
    const isoADate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
    const lunesDe = d => new Date(d.getTime() - ((d.getUTCDay() || 7) - 1) * DIA);
    function semanaIso(d) {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
        const anio = x.getUTCFullYear();
        return [anio, Math.ceil(((x - Date.UTC(anio, 0, 1)) / DIA + 1) / 7)];
    }
    function lunesIso(anio, semana) {
        const ene4 = new Date(Date.UTC(anio, 0, 4));
        return new Date(ene4.getTime() - ((ene4.getUTCDay() || 7) - 1) * DIA + (semana - 1) * 7 * DIA);
    }
    const fmt = new Intl.DateTimeFormat(document.documentElement.lang || 'es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const corto = d => fmt.format(d).replace('.', '');
    const rango = (anio, s) => { const l = lunesIso(anio, s); return corto(l) + ' – ' + corto(new Date(l.getTime() + 6 * DIA)); };
    const lunesProg = isoADate(CFG.lunesIso);

    // ── Errores por campo ──
    function error(clave, msg) {
        const e = $('rf-err-' + clave);
        if (!e) return;
        e.textContent = msg || '';
        e.hidden = !msg;
    }
    const limpiarErrores = () => document.querySelectorAll('.rf2-err').forEach(e => { e.hidden = true; e.textContent = ''; });

    // ── Combobox de personas (Responsable / Validado por) ──
    function combo(raiz, hidden, excluir) {
        const inp = raiz.querySelector('.rf2-combo-in'), av = raiz.querySelector('.rf2-av'), nom = raiz.querySelector('.rf2-nomina');
        const quitar = raiz.querySelector('.rf2-combo-x'), lista = raiz.querySelector('.rf2-lista');
        let sel = -1, abiertaLista = [];
        const porId = id => PERSONAS.find(p => String(p.id) === String(id));
        function pintarElegido() {
            const p = porId(hidden.value);
            inp.value = p ? p.nombre : '';
            raiz.title = p ? p.nombre + ' - ' + p.nomina : '';
            av.textContent = p ? p.ini : '';
            av.hidden = !p;
            nom.textContent = p ? p.nomina : '';
            quitar.hidden = !p;
        }
        function cerrar() { lista.hidden = true; lista.classList.remove('arriba'); inp.setAttribute('aria-expanded', 'false'); sel = -1; }
        function abrir() {
            const q = norm(inp.value), p0 = porId(hidden.value);
            const filtrar = !(p0 && inp.value === p0.nombre);
            abiertaLista = PERSONAS.filter(p => String(p.id) !== String(excluir ? excluir() : '') &&
                (!filtrar || norm(p.nombre).includes(q) || String(p.nomina).includes(q)));
            lista.replaceChildren(...abiertaLista.map((p, i) => {
                const li = document.createElement('li');
                li.setAttribute('role', 'option');
                li.dataset.i = i;
                li.innerHTML = '<span class="rf2-av"></span><span class="n"></span><span class="rf2-mono nm"></span>';
                li.children[0].textContent = p.ini; li.children[1].textContent = p.nombre; li.children[2].textContent = p.nomina;
                li.addEventListener('mousedown', e => { e.preventDefault(); elegir(p); });
                return li;
            }));
            if (!abiertaLista.length) {
                const li = document.createElement('li'); li.className = 'vacio'; li.textContent = t('sinResultados'); lista.replaceChildren(li);
            }
            lista.hidden = false;
            // El formulario vive en un iframe del alto de su contenido: si no cabe abajo, la lista se abre hacia arriba
            lista.classList.remove('arriba');
            if (lista.getBoundingClientRect().bottom > window.innerHeight) lista.classList.add('arriba');
            inp.setAttribute('aria-expanded', 'true');
        }
        function elegir(p) {
            hidden.value = p.id;
            pintarElegido(); cerrar();
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function resaltar(n) {
            const items = [...lista.querySelectorAll('li[role=option]')];
            if (!items.length) return;
            sel = (n + items.length) % items.length;
            items.forEach((li, i) => li.classList.toggle('on', i === sel));
            items[sel].scrollIntoView({ block: 'nearest' });
        }
        inp.addEventListener('focus', () => { inp.select(); abrir(); });
        inp.addEventListener('input', abrir);
        inp.addEventListener('blur', () => { cerrar(); pintarElegido(); });
        inp.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) abrir(); resaltar(sel + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); resaltar(sel - 1); }
            else if (e.key === 'Enter' && !lista.hidden && sel >= 0) { e.preventDefault(); e.stopPropagation(); elegir(abiertaLista[sel]); }
            else if (e.key === 'Escape' && !lista.hidden) { e.stopPropagation(); cerrar(); }
        });
        quitar.addEventListener('mousedown', e => {
            e.preventDefault(); hidden.value = ''; pintarElegido();
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
        });
        pintarElegido();
        return { refrescar: pintarElegido };
    }
    const comboResp = combo($('rf-combo-resp'), F('responsable'), () => (F('validacion').value === 'validado' ? '' : ''));
    const comboVal = combo($('rf-combo-val'), F('validado_por'));

    // ── Estado ──
    const radiosEstado = [...document.querySelectorAll('.rf2-est')];
    function setEstado(v) {
        F('estado').value = v;
        radiosEstado.forEach(b => b.setAttribute('aria-checked', b.dataset.val === v ? 'true' : 'false'));
        $('rf-blk-reag').hidden = v !== 'reagendada';
        $('rf-blk-canc').hidden = v !== 'cancelada';
        error('estado', '');
        pintarValidacion();
        pintarAtraso();
        pintarReset();
        notificarAltura();
    }
    radiosEstado.forEach((b, i) => {
        b.addEventListener('click', () => setEstado(b.dataset.val));
        b.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const n = radiosEstado[(i + (e.key === 'ArrowRight' ? 1 : -1) + radiosEstado.length) % radiosEstado.length];
                n.focus(); setEstado(n.dataset.val);
            }
        });
    });

    // ── Reagendar: semana y año con vista previa del rango ──
    function pintarReag() {
        const s = parseInt(F('reagendada_semana').value, 10), a = parseInt(F('reagendada_anio').value, 10);
        $('rf-reag-rango').textContent = (s >= 1 && s <= 53 && a >= 2000) ? rango(a, s) : '';
    }
    ['reagendada_semana', 'reagendada_anio'].forEach(n => F(n).addEventListener('input', () => { pintarReag(); error('reagendada_semana', ''); }));

    // ── Fecha de ejecución: semana, aviso de atraso, no futura ──
    function pintarAtraso() {
        const iso = F('fecha_ejecucion').value;
        const caja = $('rf-fechaw'), sem = $('rf-sem-fecha'), aviso = $('rf-aviso-atraso');
        caja.classList.remove('tarde');
        sem.textContent = '';
        aviso.hidden = true;
        if (!iso) return;
        const d = isoADate(iso), [, s] = semanaIso(d);
        sem.textContent = 'S' + s;
        if (iso > CFG.hoyIso) { error('fecha_ejecucion', t('fechaFutura')); return; }
        error('fecha_ejecucion', '');
        const n = Math.max(0, Math.round((lunesDe(d) - lunesProg) / (7 * DIA)));
        if (n > 0 && F('estado').value === 'completada') {
            caja.classList.add('tarde');
            aviso.querySelector('.txt').innerHTML = t(n === 1 ? 'atrasoUna' : 'atrasoN', { x: s, y: CFG.semana, n: '<b>' + n + '</b>' });
            aviso.hidden = false;
        }
    }
    F('fecha_ejecucion').addEventListener('change', () => { pintarAtraso(); pintarReset(); });

    // ── Observaciones ──
    const obs = F('observaciones');
    const cnt = () => { $('rf-cnt-obs').textContent = t('opcionalCnt', { n: obs.value.length }); };
    obs.addEventListener('input', cnt); cnt();

    // ── Evidencia fotográfica ──
    // Cada foto: { id?, url, etiqueta, file? }. Las nuevas se comprimen en el cliente (lado mayor 1600 px) al elegirlas.
    const fotos = CFG.fotos.map(f => ({ id: f.id, url: f.url, etiqueta: f.etiqueta || '' }));
    const quitadas = [];
    const ETQ = ['', 'antes', 'despues'];
    const cuadro = $('rf-fotos'), archivo = $('rf-file');
    const fotosCambian = () => quitadas.length > 0 || fotos.some(f => f.file);

    function pintarFotos() {
        const items = fotos.map((f, i) => {
            const b = document.createElement('div');
            b.className = 'rf2-foto';
            b.innerHTML = '<img alt=""><button type="button" class="rm" aria-label="' + t('quitarFoto') + '">' +
                '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
                '<button type="button" class="tag"></button>';
            const img = b.querySelector('img');
            img.src = f.url; img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', t('verFoto', { n: i + 1 }));
            img.addEventListener('click', () => abrirVisor(f.url));
            img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirVisor(f.url); } });
            const tag = b.querySelector('.tag');
            tag.textContent = f.etiqueta ? t(f.etiqueta) : t('sinEtiqueta');
            tag.classList.toggle('vacia', !f.etiqueta);
            tag.addEventListener('click', () => { f.etiqueta = ETQ[(ETQ.indexOf(f.etiqueta) + 1) % ETQ.length]; pintarFotos(); pintarReset(); });
            b.querySelector('.rm').addEventListener('click', () => {
                if (f.id) quitadas.push(f.id);
                else if (f.url.startsWith('blob:')) URL.revokeObjectURL(f.url);
                fotos.splice(i, 1); pintarFotos(); pintarReset();
            });
            // Sin permiso de Editar solo se pueden quitar o re-etiquetar las fotos que uno mismo acaba de agregar.
            if (!(CFG.modo === 'editable' && (CFG.puedeEditar || !f.id))) { b.querySelector('.rm').remove(); tag.disabled = true; tag.style.cursor = 'default'; }
            return b;
        });
        if (CFG.modo === 'editable' && fotos.length < CFG.maxFotos) {
            const a = document.createElement('button');
            a.type = 'button'; a.className = 'rf2-foto-add'; a.setAttribute('aria-label', t('agregarFoto'));
            a.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' + t('agregar');
            a.addEventListener('click', () => archivo.click());
            items.push(a);
        }
        while (items.length < CFG.maxFotos) {
            const v = document.createElement('div'); v.className = 'rf2-foto-libre'; v.setAttribute('aria-hidden', 'true'); items.push(v);
        }
        cuadro.replaceChildren(...items);
        $('rf-cnt-fotos').textContent = fotos.length + ' / ' + CFG.maxFotos;
        notificarAltura();
    }

    function comprimir(file) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                const k = Math.min(1, MAX_LADO / Math.max(im.naturalWidth, im.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => resolve(b && b.size < file.size ? b : file), 'image/jpeg', 0.85);
            };
            im.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            im.src = url;
        });
    }
    async function agregarArchivos(lista) {
        error('fotos', '');
        for (const f of Array.from(lista)) {
            if (fotos.length >= CFG.maxFotos) { error('fotos', t('maxFotos')); break; }
            if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > MAX_BYTES) { error('fotos', t('soloImagenes')); continue; }
            const blob = await comprimir(f);
            const nombre = (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
            fotos.push({ url: URL.createObjectURL(blob), etiqueta: '', file: blob.type === 'image/jpeg' ? new File([blob], nombre, { type: 'image/jpeg' }) : f });
        }
        pintarFotos(); pintarReset();
    }
    archivo.addEventListener('change', () => { agregarArchivos(archivo.files); archivo.value = ''; });
    cuadro.addEventListener('dragover', e => { e.preventDefault(); cuadro.classList.add('arrastrando'); });
    cuadro.addEventListener('dragleave', () => cuadro.classList.remove('arrastrando'));
    cuadro.addEventListener('drop', e => { e.preventDefault(); cuadro.classList.remove('arrastrando'); agregarArchivos(e.dataTransfer.files); });
    document.addEventListener('paste', e => {
        const imgs = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.startsWith('image/'));
        if (imgs.length) { e.preventDefault(); agregarArchivos(imgs); }
    });

    // Visor de fotos
    const visor = $('rf-visor');
    function abrirVisor(url) { visor.querySelector('img').src = url; visor.hidden = false; visor.querySelector('button').focus(); }
    function cerrarVisor() { visor.hidden = true; visor.querySelector('img').src = ''; }
    visor.addEventListener('click', e => { if (e.target === visor || e.target.closest('button')) cerrarVisor(); });

    // ── Validación ──
    const radiosVal = [...document.querySelectorAll('.rf2-val-op')];
    function pintarValidacion() {
        const completada = F('estado').value === 'completada';
        let v = F('validacion').value;
        if (!completada && v === 'validado') v = 'por_validar';             // solo se valida lo completado
        F('validacion').value = v;
        const card = $('rf-val');
        card.dataset.v = v;
        card.classList.toggle('bloq', !completada);
        radiosVal.forEach(b => {
            b.setAttribute('aria-checked', b.dataset.val === v ? 'true' : 'false');
            b.setAttribute('aria-disabled', (!completada || !CFG.puedeValidar) ? 'true' : 'false');
        });
        $('rf-val-hint').textContent = !completada ? t('valHintNo') : (CFG.puedeValidar ? t('valHintSi') : t('valHintSolo'));
        $('rf-val-validado').hidden = v !== 'validado';
        $('rf-val-rechazo').hidden = v !== 'rechazado';
        $('rf-val-fecha').textContent = (CFG.validadoEn && CFG.validacionInicial === 'validado') ? CFG.validadoEn : CFG.hoyTxt;
        pintarReset();
        notificarAltura();
    }
    radiosVal.forEach((b, i) => {
        b.addEventListener('click', () => {
            if (b.getAttribute('aria-disabled') === 'true') return;
            F('validacion').value = b.dataset.val;
            error('validado_por', ''); error('motivo_rechazo', '');
            pintarValidacion();
        });
        b.addEventListener('keydown', e => {
            if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && b.getAttribute('aria-disabled') !== 'true') {
                e.preventDefault();
                const n = radiosVal[(i + (e.key === 'ArrowRight' ? 1 : -1) + radiosVal.length) % radiosVal.length];
                n.focus(); n.click();
            }
        });
    });
    function pintarReset() {
        const cambia = F('estado').value !== CFG.estadoInicial || F('fecha_ejecucion').value !== CFG.fechaInicial || fotosCambian();
        $('rf-val-reset').hidden = !(CFG.validacionInicial === 'validado' && F('validacion').value === 'validado' && cambia);
    }
    F('responsable').addEventListener('change', () => error('responsable', ''));
    F('validado_por').addEventListener('change', () => error('validado_por', ''));

    // ── Cambios sin guardar / cerrar ──
    const firma = () => JSON.stringify([
        ['estado', 'responsable', 'fecha_ejecucion', 'observaciones', 'motivo_cancelacion', 'reagendada_anio', 'reagendada_semana',
         'validacion', 'validado_por', 'motivo_rechazo'].map(n => F(n).value),
        fotos.map(f => [f.id || (f.file && f.file.name) || '', f.etiqueta]), quitadas]);
    let inicial = firma();
    const hayCambios = () => firma() !== inicial;
    window.rfHayCambios = hayCambios;       // lo consulta el modal padre antes de cambiar de semana o cerrar
    function cancelar() {
        if (hayCambios()) { $('rf-descartar').style.display = 'flex'; $('rf-d-seguir').focus(); }
        else window.parent.postMessage('cerrar_form_registro', '*');
    }
    $('rf-btn-cancelar').addEventListener('click', cancelar);
    $('rf-d-seguir').addEventListener('click', () => { $('rf-descartar').style.display = 'none'; });
    $('rf-d-descartar').addEventListener('click', () => window.parent.postMessage('cerrar_form_registro', '*'));

    // ── Guardar ──
    function validar() {
        limpiarErrores();
        let primero = null;
        const falla = (clave, msg) => { error(clave, msg); primero = primero || $('rf-err-' + clave); };
        const estado = F('estado').value, fecha = F('fecha_ejecucion').value;
        if (!estado) falla('estado', t('elegirEstado'));
        if (!F('responsable').value) falla('responsable', t('elegirResponsable'));
        if (!F('responsable').value) falla('responsable', CFG.puedeAsignar ? t('elegirResponsable') : t('pedirResponsable'));
        if (estado === 'completada' && !fecha) falla('fecha_ejecucion', t('fechaObligatoria'));
        if (fecha && fecha > CFG.hoyIso) falla('fecha_ejecucion', t('fechaFutura'));
        if (estado === 'cancelada' && !F('motivo_cancelacion').value.trim()) falla('motivo_cancelacion', t('motivoCancelacion'));
        if (estado === 'reagendada') {
            const s = parseInt(F('reagendada_semana').value, 10), a = parseInt(F('reagendada_anio').value, 10);
            if (!(s >= 1 && s <= 53) || !(a >= 2000)) falla('reagendada_semana', t('semanaDestino'));
        }
        if (F('validacion').value === 'validado') {
            if (!F('validado_por').value) falla('validado_por', t('elegirValidador'));
        }
        if (F('validacion').value === 'rechazado' && CFG.puedeValidar && !F('motivo_rechazo').value.trim()) falla('motivo_rechazo', t('motivoRechazo'));
        if (primero) primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return !primero;
    }

    let guardando = false;
    async function guardar() {
        if (guardando || !validar()) return;
        const btn = $('rf-btn-guardar'), txt = btn.textContent;
        guardando = true; btn.disabled = true; btn.textContent = t('guardando');
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', form.elements.csrfmiddlewaretoken.value);
        ['estado', 'responsable', 'fecha_ejecucion', 'observaciones', 'motivo_cancelacion', 'reagendada_anio', 'reagendada_semana',
         'validacion', 'validado_por', 'motivo_rechazo'].forEach(n => fd.append(n, F(n).value));
        quitadas.forEach(id => fd.append('fotos_quitar', id));
        const etq = {};
        fotos.filter(f => f.id).forEach(f => { etq[f.id] = f.etiqueta; });
        fd.append('fotos_etiquetas', JSON.stringify(etq));
        fotos.filter(f => f.file).forEach(f => { fd.append('fotos', f.file, f.file.name); fd.append('fotos_etiquetas_nuevas', f.etiqueta); });
        try {
            const r = await fetch(window.location.href, { method: 'POST', body: fd, credentials: 'same-origin' });
            if (r.ok) {
                inicial = firma();
                const toast = $('toast-ok');
                toast.style.display = 'flex';
                setTimeout(() => window.parent.postMessage('registro_guardado:' + CFG.planPk + ':' + CFG.anio, '*'), 900);
                return;
            }
            let data = {};
            try { data = await r.json(); } catch (e) { /* respuesta no JSON */ }
            const errs = data.errores || {};
            Object.keys(errs).forEach(k => error(k, errs[k]));
            if (!Object.keys(errs).length) error('general', t('errorGuardar'));
        } catch (e) {
            error('general', t('errorRed'));
        }
        guardando = false; btn.disabled = false; btn.textContent = txt;
    }
    $('rf-btn-guardar').addEventListener('click', guardar);
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); guardar(); }
        else if (e.key === 'Escape') {
            if (!visor.hidden) cerrarVisor();
            else if ($('rf-descartar').style.display === 'flex') $('rf-descartar').style.display = 'none';
            else if ($('modal-confirm').style.display === 'flex') $('modal-confirm').style.display = 'none';
            else cancelar();
        }
    });

    // ── Eliminar registro ──
    window.confirmarEliminar = function () {
        const url = '/mto/equipos/' + CFG.planPk + '/registro/' + CFG.semana + '/' + CFG.anio + '/eliminar/';
        fetch(url, { method: 'POST', headers: { 'X-CSRFToken': form.elements.csrfmiddlewaretoken.value } })
            .then(r => { if (r.ok) window.parent.postMessage('registro_guardado:' + CFG.planPk + ':' + CFG.anio, '*'); })
            .catch(() => { $('modal-confirm').style.display = 'none'; error('general', t('errorRed')); });
    };

    // Avisa al padre el alto real (el iframe se ajusta a su contenido).
    function notificarAltura() { window.parent.postMessage('resize_iframe:' + document.body.scrollHeight, '*'); }
    window.notificarAltura = notificarAltura;

    // ── Arranque ──
    setEstado(F('estado').value);
    pintarReag();
    pintarFotos();
    pintarValidacion();
    pintarAtraso();
    aplicarPermisos();
    inicial = firma();

    // ── Permisos: sin Llenar/Editar (o con el registro ya llenado) el formulario queda de solo lectura;
    //    con Validar puede cambiarse únicamente la tarjeta de validación. El servidor lo verifica igual.
    function aplicarPermisos() {
        // Asignar responsable solo con permiso de Editar o Validar: los demás lo ven fijo.
        if (!CFG.puedeAsignar) {
            const c = $('rf-combo-resp');
            c.classList.add('bloq');
            c.querySelector('.rf2-combo-x').hidden = true;
            c.querySelector('.rf2-combo-in').disabled = true;
        }
        if (CFG.modo === 'editable') return;
        const aviso = $('rf-aviso-permiso');
        aviso.querySelector('.txt').textContent = CFG.modo === 'solo_validar' ? t('avisoSoloValidar') : (CFG.yaLlenado ? t('avisoYaLlenado') : t('avisoLectura'));
        aviso.hidden = false;
        form.querySelectorAll('input[type=text], input[type=number], textarea, button.rf2-est').forEach(el => {
            if (!el.closest('#rf-val')) el.disabled = true;
        });
        ['rf-combo-resp'].forEach(id => { $(id).classList.add('bloq'); $(id).querySelector('.rf2-combo-x').hidden = true; });
        $('rf-fechaw').classList.add('bloq');
        if (CFG.modo === 'solo_lectura') $('rf-btn-guardar').hidden = true;
        pintarFotos();
        notificarAltura();
    }
})();
