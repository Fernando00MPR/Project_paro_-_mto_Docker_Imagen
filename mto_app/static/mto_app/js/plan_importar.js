/* plan_importar.js — modal "Importar plan de mantenimiento" (escritorio), plan/importar.html.
   Paso 1: área + archivo. Paso 2: el servidor lee el Excel SIN guardar (paso=verificar) y aquí se revisa fila por fila.
   Paso 3: se manda el mismo archivo con paso=importar; el servidor lo vuelve a leer y guarda las filas sin errores.
   Lo abre [data-abrir-importar] (Opciones › Importar Excel) o el fragmento #importar de la dirección. */
(function () {
    'use strict';
    const fondo = document.getElementById('pi-fondo');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const T = JSON.parse($('pi-i18n').textContent);
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const POR_PAGINA = 25, MAX_BYTES = 10 * 1024 * 1024, ORDEN = { err: 0, warn: 1, ok: 2 };
    const csrf = fondo.querySelector('[name=csrfmiddlewaretoken]').value;
    const selArea = $('pi-area'), inFile = $('pi-file'), drop = $('pi-drop');

    let paso = 1, archivo = null, filas = [], filtro = 'all', pagina = 1, importado = null, ocupado = false, disparador = null;

    const hm = m => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? t('hMin', { h: h, m: r }) : t('h', { h: h })) : t('min', { m: r }); };
    const nombreArea = () => (selArea.selectedOptions[0] || {}).textContent || '';

    // ── Pasos ──
    function irPaso(n) {
        paso = n;
        ['pi-p1', 'pi-p2', 'pi-p3'].forEach((id, i) => { $(id).hidden = i + 1 !== n; });
        fondo.querySelectorAll('.pi-pasos li').forEach(li => {
            const p = +li.dataset.paso;
            li.classList.toggle('hecho', p < n);
            li.querySelector('.n').textContent = p < n ? '✓' : p;
            if (p === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        });
        fondo.querySelectorAll('.pi-pie [data-en]').forEach(b => { b.hidden = +b.dataset.en !== n; });
        $('pi-cuerpo').scrollTop = 0;
        pintarSub();
    }
    function pintarSub() {
        const sub = $('pi-sub');
        if (paso === 1 || !archivo) { sub.textContent = T.subPaso1; return; }
        sub.innerHTML = '<span class="pi-xlsx">XLSX</span><span>' + esc(archivo.name + ' · ' + t('areaDe', { area: nombreArea() })) + '</span>';
    }

    // ── Paso 1: área y archivo ──
    function errorP1(msg) { const e = $('pi-err'); e.textContent = msg || ''; e.hidden = !msg; }
    function ponerArchivo(f) {
        errorP1('');
        if (f && !/\.xls[xm]$/i.test(f.name)) { errorP1(T.soloExcel); f = null; }
        else if (f && f.size > MAX_BYTES) { errorP1(T.muyGrande); f = null; }
        archivo = f || null;
        inFile.value = '';
        drop.hidden = !!archivo;
        $('pi-archivo').hidden = !archivo;
        if (archivo) {
            $('pi-archivo-n').textContent = archivo.name;
            $('pi-archivo-s').textContent = t('kb', { n: Math.max(1, Math.round(archivo.size / 1024)) });
        }
        pintarRevisar();
    }
    function pintarRevisar() { $('pi-revisar').disabled = !(archivo && selArea.value) || ocupado; }
    drop.addEventListener('click', () => inFile.click());
    inFile.addEventListener('change', () => ponerArchivo(inFile.files[0]));
    $('pi-quitar').addEventListener('click', () => { ponerArchivo(null); drop.focus(); });
    selArea.addEventListener('change', () => { errorP1(''); pintarRevisar(); });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('sobre'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('sobre')));
    drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); ponerArchivo(e.dataTransfer.files[0]); });
    // Soltar el archivo en cualquier parte del modal no debe abrirlo en el navegador
    fondo.addEventListener('dragover', e => e.preventDefault());
    fondo.addEventListener('drop', e => { e.preventDefault(); if (paso === 1 && e.dataTransfer.files[0]) ponerArchivo(e.dataTransfer.files[0]); });

    // ── Servidor ──
    function enviar(pasoServidor, btn, txtOcupado) {
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', csrf);
        fd.append('area', selArea.value);
        fd.append('archivo', archivo, archivo.name);
        fd.append('paso', pasoServidor);
        const span = btn.querySelector('span') || btn, antes = span.textContent;
        ocupado = true; btn.disabled = true; span.textContent = txtOcupado;
        return fetch(fondo.dataset.url, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(r => r.json().catch(() => ({ ok: false, error: T.errorRed })))
            .catch(() => ({ ok: false, error: T.errorRed }))
            .finally(() => { ocupado = false; btn.disabled = false; span.textContent = antes; pintarRevisar(); });
    }
    $('pi-revisar').addEventListener('click', () => {
        if (!archivo || !selArea.value || ocupado) return;
        enviar('verificar', $('pi-revisar'), T.revisando).then(j => {
            if (!j.ok) { errorP1(j.error || T.errorRed); return; }
            filas = j.filas.slice().sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.fila - b.fila);
            $('pi-ignoradas').textContent = !j.ignoradas ? '' : (j.ignoradas === 1 ? T.ignoradas1 : t('ignoradasN', { n: j.ignoradas }));
            filtro = 'all'; pagina = 1;
            irPaso(2);
            pintarRevision();
            const tab = fondo.querySelector('.pi-tab[aria-selected="true"]');
            if (tab) tab.focus();
        });
    });

    // ── Paso 2: revisión ──
    const cuenta = e => filas.filter(f => f.estado === e).length;
    function pintarRevision() {
        const n = { all: filas.length, ok: cuenta('ok'), warn: cuenta('warn'), err: cuenta('err') };
        fondo.querySelectorAll('.pi-tab').forEach(tab => {
            const on = tab.dataset.f === filtro;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            tab.querySelector('[data-n]').textContent = n[tab.dataset.f];
        });
        const importables = filas.filter(f => f.estado !== 'err');
        const nuevas = importables.filter(f => !f.actualiza).length, actualizan = importables.length - nuevas;
        $('pi-nuevas').textContent = nuevas ? t('nuevas', { n: nuevas }) : '';
        $('pi-actualizan').textContent = actualizan ? t('actualizan', { n: actualizan }) : '';
        $('pi-nota').textContent = !n.err ? '' : (n.err === 1 ? T.notaErr1 : t('notaErrN', { n: n.err }));
        $('pi-importar-t').textContent = !importables.length ? T.importar0 : (importables.length === 1 ? T.importar1 : t('importarN', { n: importables.length }));
        $('pi-importar').disabled = !importables.length;

        const vista = filtro === 'all' ? filas : filas.filter(f => f.estado === filtro);
        $('pi-rev-cnt').textContent = filtro === 'all' ? T.primeroMal : t('nFilas', { n: vista.length });
        const paginas = Math.max(1, Math.ceil(vista.length / POR_PAGINA));
        pagina = Math.min(pagina, paginas);
        const desde = (pagina - 1) * POR_PAGINA, trozo = vista.slice(desde, desde + POR_PAGINA);
        $('pi-filas').innerHTML = trozo.length ? trozo.map(filaHtml).join('')
            : '<tr><td colspan="10" class="pi-vacia">' + esc(filas.length ? T.sinFilas : T.vacio) + '</td></tr>';
        $('pi-rango').textContent = vista.length ? t('mostrando', { a: desde + 1, b: desde + trozo.length, n: vista.length }) : '';
        let pag = '';
        if (paginas > 1) {
            pag += '<button type="button" data-p="' + (pagina - 1) + '" aria-label="' + esc(T.anterior) + '"' + (pagina === 1 ? ' disabled' : '') + '>‹</button>';
            for (let p = 1; p <= paginas; p++) pag += '<button type="button" data-p="' + p + '"' + (p === pagina ? ' aria-current="page"' : '') + '>' + p + '</button>';
            pag += '<button type="button" data-p="' + (pagina + 1) + '" aria-label="' + esc(T.siguiente) + '"' + (pagina === paginas ? ' disabled' : '') + '>›</button>';
        }
        $('pi-pag').innerHTML = pag;
    }
    function filaHtml(f) {
        const m = f.marcas || {}, msgs = f.errores.concat(f.avisos);
        const marca = c => (m[c] ? ' class="m-' + m[c] + '"' : '');
        const frec = f.frec || '—';
        return '<tr class="' + f.estado + '">' +
            '<td><span class="pi-fila"><span class="pi-dot" aria-hidden="true">' + (f.estado === 'ok' ? '✓' : '!') + '</span>' + f.fila + '</span></td>' +
            '<td><span class="pi-cod">' + esc(f.codigo) + '</span>' + (f.actualiza ? '<br><span class="pi-act-b">' + esc(T.actualiza) + '</span>' : '') + '</td>' +
            '<td><span class="pi-acti">' + esc(f.actividad || '—') + '</span>' + msgs.map(x => '<span class="pi-msg">' + esc(x) + '</span>').join('') + '</td>' +
            '<td class="pi-mono pi-suave">' + esc(f.rutina || '—') + '</td>' +
            '<td><span class="pi-frec' + (m.f ? ' ' + m.f : '') + '"><b>' + esc(frec) + '</b>' + esc(f.frec_nombre || T.noValida) + '</span></td>' +
            '<td' + marca('i') + '>' + (f.semana ? esc(t('semana', { n: f.semana, anio: f.anio })) : '—') + '</td>' +
            '<td' + marca('d') + ' style="text-align:right">' + (f.duracion ? esc(hm(f.duracion)) : '—') + '</td>' +
            '<td class="pi-mono">' + esc(f.plan || '—') + '</td>' +
            '<td class="pi-suave">' + esc(f.locacion || '—') + '</td>' +
            '<td>' + esc(f.equipo || '—') + '</td></tr>';
    }
    const tabs = [...fondo.querySelectorAll('.pi-tab')];
    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => { filtro = tab.dataset.f; pagina = 1; pintarRevision(); });
        tab.addEventListener('keydown', e => {
            const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            const sig = tabs[(i + d + tabs.length) % tabs.length];
            sig.click(); sig.focus();
        });
    });
    $('pi-pag').addEventListener('click', e => {
        const b = e.target.closest('button[data-p]');
        if (!b || b.disabled) return;
        pagina = +b.dataset.p;
        pintarRevision();
        $('pi-filas').closest('.pi-rev').scrollIntoView({ block: 'nearest' });
    });
    $('pi-cambiar').addEventListener('click', () => { ponerArchivo(null); irPaso(1); drop.focus(); });

    $('pi-importar').addEventListener('click', () => {
        if (ocupado || !archivo) return;
        enviar('importar', $('pi-importar'), T.importando).then(j => {
             if (!j.ok) { if (typeof window.showToast === 'function') window.showToast({ title: T.errorImportar, description: j.error || window.TXT_REVISA_CONEXION }, 'error'); return; }
            importado = j;
            const total = j.creadas + j.actualizadas;
            $('pi-res-t').textContent = total === 1 ? T.resT1 : t('resTN', { n: total });
            $('pi-res-s').textContent = T.resS;
            $('pi-res-nuevas').textContent = j.creadas;
            $('pi-res-act').textContent = j.actualizadas;
            $('pi-res-omit').textContent = j.omitidas.length;
            $('pi-omitidas').innerHTML = j.omitidas.map(o => '<li><b>' + esc(t('filaN', { n: o.fila }) + ' · ' + o.codigo) + '</b><span>' + esc(o.motivo) + '</span></li>').join('');
            irPaso(3);
            fondo.querySelector('.pi-pie [data-en="3"].pi-btn-pri').focus();
        });
    });
    $('pi-otro').addEventListener('click', () => { ponerArchivo(null); filas = []; irPaso(1); drop.focus(); });

    // ── Abrir / cerrar ──
    function abrir(origen) {
        disparador = origen || document.activeElement;
        importado = null; filas = []; ponerArchivo(null); errorP1('');
        if (!selArea.value && fondo.dataset.area) selArea.value = fondo.dataset.area;
        irPaso(1);
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        (selArea.value ? drop : selArea).focus();
        pintarRevisar();
    }
    function cerrar() {
        if (fondo.hidden || ocupado) return;
        fondo.hidden = true;
        document.body.style.overflow = '';
        if (importado) {       // el plan cambió: se recarga la lista con un aviso
            avisarAlCargar([[{ title: t('toast'), description: t('toastDet', { c: importado.creadas, a: importado.actualizadas }) }, 'success']]);
            window.location.reload();
            return;
        }
        if (disparador && disparador.focus && document.contains(disparador)) disparador.focus();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-importar]');
        if (!b || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        abrir(b);
    });
    fondo.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });

    // ── Teclado: Esc cierra; Tab queda dentro del modal ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
        if (e.key !== 'Tab') return;
        const f = [...fondo.querySelectorAll('button:not([disabled]), select, a[href]')].filter(x => x.offsetParent && x.tabIndex >= 0);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }, true);

    // La dirección /equipos/importar/ llega con #importar
    if (window.location.hash === '#importar' && !window.matchMedia('(max-width: 767px)').matches) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        abrir();
    }
})();
