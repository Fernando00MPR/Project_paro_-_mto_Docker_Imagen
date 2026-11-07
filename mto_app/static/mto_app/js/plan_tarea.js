/* plan_tarea.js — modal "Nueva / Editar tarea" del Plan de mantenimiento (17D-b, escritorio).
   Lo abren [data-abrir-tarea] y [data-editar-tarea="pk"] (o el fragmento #nueva / #editar-<pk> de la dirección).
   Guarda por AJAX en mto:nuevo_plan / mto:editar_plan. El resumen usa el mismo cálculo que el servidor
   (_planes_que_tocan): desde el lunes de la primera semana, cada N semanas. */
(function () {
    'use strict';
    const fondo = document.getElementById('pt-fondo');
    if (!fondo) return;
    const $ = id => document.getElementById(id);
    const T = JSON.parse($('pt-i18n').textContent);
    const t = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toast = (m, tipo) => { if (typeof window.showToast === 'function') window.showToast(m, tipo || 'success'); };
    const form = $('pt-form'), E = form.elements, conf = $('pt-conf'), pop = $('pt-sem-pop'), btnSem = $('pt-sem-btn');
    const TEXTOS = ['codigo', 'rutina', 'plan_trabajo', 'actividad', 'nombre_equipo', 'locacion'];
    const OBLIGATORIOS = ['codigo', 'rutina', 'plan_trabajo', 'actividad', 'area', 'locacion'];
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    const fDia = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const dia = d => fDia.format(d).replace('.', '');
    const MS_DIA = 864e5;

    // ── Semanas ISO (en UTC, misma numeración que el servidor) ──
    function semanaIso(d) {
        const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        f.setUTCDate(f.getUTCDate() + 4 - (f.getUTCDay() || 7));
        const anio = f.getUTCFullYear();
        return { anio: anio, semana: Math.ceil(((f - Date.UTC(anio, 0, 1)) / MS_DIA + 1) / 7) };
    }
    function lunesIso(anio, semana) {
        const ene4 = new Date(Date.UTC(anio, 0, 4));
        return ene4.getTime() - ((ene4.getUTCDay() || 7) - 1) * MS_DIA + (semana - 1) * 7 * MS_DIA;
    }
    const semanasDelAnio = a => semanaIso(new Date(Date.UTC(a, 11, 28))).semana;
    const ahora = new Date();
    const hoy = semanaIso(new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())));
    const rango = ms => dia(new Date(ms)) + ' – ' + dia(new Date(ms + 6 * MS_DIA));
    // Primer lunes con OT que no sea anterior a `desde`
    function primeraDesde(inicio, paso, desde) {
        const sem = paso * 7 * MS_DIA;
        return inicio >= desde ? inicio : inicio + Math.ceil((desde - inicio) / sem) * sem;
    }

    const hm = m => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? t('hMin', { h: h, m: r }) : t('h', { h: h })) : t('min', { m: r }); };
    const duracion = () => { const n = parseInt(E.duracion_minutos.value, 10); return n > 0 ? n : 0; };
    const pasoElegido = () => { const o = E.frecuencia.selectedOptions[0]; return o && o.dataset.semanas ? +o.dataset.semanas : 0; };

    let plan = null, sem = { anio: hoy.anio, semana: hoy.semana }, activo = true, inicial = '', disparador = null, guardando = false, anioPop = hoy.anio, otsVista = 0, anioVista = hoy.anio;

    const firma = () => JSON.stringify([activo, [...new FormData(form)].filter(p => p[0] !== 'csrfmiddlewaretoken')]);

    // ── Controles ──
    function ponerActivo(v) {
        activo = v;
        $('pt-activa').setAttribute('aria-checked', String(v));
        $('pt-activa-t').textContent = v ? T.activa : T.inactiva;
    }
    function ponerSeg(nombre, valor) {
        E[nombre].value = valor;
        form.querySelectorAll('[data-seg="' + nombre + '"] [role="radio"]').forEach(b => {
            const on = b.dataset.valor === valor;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });
    }
    function ponerSemana(anio, semana) {
        sem = { anio: anio, semana: semana };
        E.anio_inicio.value = anio;
        E.semana_inicio.value = semana;
        $('pt-sem-t').innerHTML = '<b>' + esc(t('semana', { n: semana, anio: anio })) + '</b> <span>· ' + esc(rango(lunesIso(anio, semana))) + '</span>';
        error('semana_inicio', '');
    }

    // ── Resumen "Así quedará en el plan" ──
    function pintarResumen() {
        const paso = pasoElegido(), dur = duracion();
        const inicio = lunesIso(sem.anio, sem.semana);
        const anio = Math.max(sem.anio, hoy.anio), total = semanasDelAnio(anio);
        const fin = lunesIso(anio + 1, 1);
        const conOt = new Set();
        if (paso) {
            for (let c = primeraDesde(inicio, paso, lunesIso(anio, 1)); c < fin; c += paso * 7 * MS_DIA) conOt.add(semanaIso(new Date(c)).semana);
        }
        otsVista = conOt.size; anioVista = anio;
        const porAnio = paso ? Math.round(52 / paso) : 0;
        $('pt-r-en-l').textContent = t('otsEn', { anio: anio });
        $('pt-r-en').textContent = paso ? conOt.size : '—';
        $('pt-r-anio').textContent = paso ? porAnio : '—';
        $('pt-r-tiempo').textContent = paso && dur ? hm(porAnio * dur) : '—';
        $('pt-r-tiempo-s').textContent = paso && dur ? t('otsX', { n: porAnio, dur: hm(dur) }) : '';
        $('pt-r-sem-l').textContent = t('semanasDe', { anio: anio });
        let tira = '';
        for (let s = 1; s <= total; s++) {
            const con = conOt.has(s), pasada = anio < hoy.anio || (anio === hoy.anio && s < hoy.semana), actual = anio === hoy.anio && s === hoy.semana;
            tira += '<span class="' + (con ? 'con' : pasada ? 'pas' : '') + (actual ? ' act' : '') + '" title="' + esc(t('semanaN', { n: s }) + (con ? ' · ' + T.conOt : '')) + '"></span>';
        }
        $('pt-tira').innerHTML = tira;
        let prox = '';
        if (paso) {
            const primera = primeraDesde(inicio, paso, lunesIso(hoy.anio, hoy.semana));
            for (let i = 0; i < 4; i++) {
                const ms = primera + i * paso * 7 * MS_DIA, s = semanaIso(new Date(ms));
                prox += '<div><b>' + esc(t('semanaN', { n: s.semana })) + ' · ' + String(s.anio).slice(2) + '</b><span>' + esc(rango(ms)) + '</span><em>' + (dur ? esc(hm(dur)) : '') + '</em></div>';
            }
        }
        $('pt-prox').innerHTML = prox || '<span class="pt-vacio">—</span>';
    }
    function pintarAviso() {
        const av = $('pt-aviso');
        if (!plan) { av.hidden = true; return; }
        const cambiaSemanas = E.frecuencia.value !== plan.frecuencia || sem.anio !== plan.anio_inicio || sem.semana !== plan.semana_inicio;
        const cambiaDur = duracion() !== plan.duracion_minutos;
        av.hidden = !cambiaSemanas && !cambiaDur;
        av.textContent = cambiaSemanas ? T.avisoSemanas : cambiaDur ? T.avisoDur : '';
    }
    function pintar() {
        const d = duracion();
        $('pt-equiv').textContent = d ? hm(d) : '—';
        pintarResumen();
        pintarAviso();
    }

    // ── Abrir / cerrar ──
    function llenar(d) {
        plan = d.pk ? d : null;
        TEXTOS.forEach(n => { E[n].value = d[n] || ''; });
        E.area.value = d.area == null ? '' : String(d.area);
        E.frecuencia.value = d.frecuencia || '';
        E.estatus.value = d.estatus || 'Abierta';
        E.duracion_minutos.value = d.duracion_minutos || '';
        ponerSeg('tipo_mto', d.tipo_mto || 'Preventivo');
        ponerSeg('prioridad', d.prioridad || 'Baja');
        ponerActivo(d.activo !== false);
        $('pt-titulo').textContent = plan ? T.editar : T.nueva;
        $('pt-sub').textContent = plan ? plan.codigo + ' · ' + (plan.actividad || plan.rutina) : T.nuevaSub;
        $('pt-estatus-c').hidden = !plan;
        $('pt-fila-dur').classList.toggle('tres', !!plan);
        $('pt-eliminar').hidden = !(plan && fondo.dataset.puedeEliminar);
        limpiarErrores();
        // Una tarea importada puede no traer semana de inicio: se propone la actual
        ponerSemana(d.anio_inicio || hoy.anio, d.semana_inicio || hoy.semana);
        pintar();
    }
    function mostrar(origen) {
        disparador = origen || document.activeElement;
        cerrarPop(false);
        conf.hidden = true;
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        inicial = firma();
        E.codigo.focus();
    }
    function abrirNueva(origen) {
        llenar({ area: fondo.dataset.area, duracion_minutos: 60 });
        mostrar(origen);
    }
    function abrirEditar(pk, origen) {
        fetch(fondo.dataset.urlEditar.replace('/0/', '/' + pk + '/'), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
            .then(d => { llenar(d); mostrar(origen); })
            .catch(() => toast(T.errorCargar, 'error'));
    }
    function cerrar(forzar) {
        if (fondo.hidden) return;
        if (!forzar && firma() !== inicial) { conf.hidden = false; $('pt-conf-no').focus(); return; }
        fondo.hidden = true;
        document.body.style.overflow = '';
        if (disparador && disparador.focus && document.contains(disparador)) disparador.focus();
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-tarea], [data-editar-tarea]');
        if (!b || e.ctrlKey || e.metaKey) return;   // Ctrl + clic: pestaña nueva con el fragmento
        e.preventDefault();
        if (b.dataset.editarTarea) abrirEditar(b.dataset.editarTarea, b); else abrirNueva(b);
    });
    form.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrar(false)));
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(false); });
    $('pt-conf-no').addEventListener('click', () => { conf.hidden = true; E.codigo.focus(); });
    $('pt-conf-si').addEventListener('click', () => { conf.hidden = true; cerrar(true); });
    $('pt-activa').addEventListener('click', () => ponerActivo(!activo));
    $('pt-eliminar').addEventListener('click', () => {
        if (plan) confirmarEliminar(fondo.dataset.urlEliminar.replace('/0/', '/' + plan.pk + '/'));   // plan_lista.js
    });
    E.frecuencia.addEventListener('change', () => { error('frecuencia', ''); pintar(); });
    E.duracion_minutos.addEventListener('input', () => { error('duracion_minutos', ''); pintar(); });
    OBLIGATORIOS.concat('nombre_equipo').forEach(n => E[n].addEventListener('input', () => error(n, '')));

    // ── Segmentados ──
    form.querySelectorAll('[data-seg]').forEach(g => {
        const ops = [...g.querySelectorAll('[role="radio"]')];
        ops.forEach((b, i) => {
            b.addEventListener('click', () => ponerSeg(g.dataset.seg, b.dataset.valor));
            b.addEventListener('keydown', e => {
                const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (!d) return;
                e.preventDefault();
                const sig = ops[(i + d + ops.length) % ops.length];
                ponerSeg(g.dataset.seg, sig.dataset.valor);
                sig.focus();
            });
        });
    });

    // ── Primera semana: calendario de semanas ──
    function pintarPop() {
        let h = '<div class="pt-sp-anio"><button type="button" data-a="-1" aria-label="' + esc(T.anioAnt) + '">‹</button><b aria-live="polite">' + anioPop +
            '</b><button type="button" data-a="1" aria-label="' + esc(T.anioSig) + '">›</button></div><div class="pt-sp-grid">';
        for (let s = 1, n = semanasDelAnio(anioPop); s <= n; s++) {
            const cls = (s === sem.semana && anioPop === sem.anio ? 'sel ' : '') + (s === hoy.semana && anioPop === hoy.anio ? 'hoy' : '');
            h += '<button type="button" class="' + cls + '" data-s="' + s + '" title="' + esc(rango(lunesIso(anioPop, s))) + '">' + s + '</button>';
        }
        pop.innerHTML = h + '</div>';
    }
    function cerrarPop(foco) {
        if (pop.hidden) return;
        pop.hidden = true;
        btnSem.setAttribute('aria-expanded', 'false');
        if (foco) btnSem.focus();
    }
    btnSem.addEventListener('click', () => {
        if (!pop.hidden) { cerrarPop(true); return; }
        anioPop = sem.anio;
        pintarPop();
        pop.hidden = false;
        btnSem.setAttribute('aria-expanded', 'true');
        pop.scrollIntoView({ block: 'nearest' });   // el cuerpo del modal recorta el calendario en pantallas bajas
        (pop.querySelector('.sel') || pop.querySelector('.hoy') || pop.querySelector('[data-s]')).focus({ preventScroll: true });
    });
    pop.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.a) {
            anioPop += +b.dataset.a;
            pintarPop();
            pop.querySelector('[data-a="' + b.dataset.a + '"]').focus();
            return;
        }
        ponerSemana(anioPop, +b.dataset.s);
        pintar();
        cerrarPop(true);
    });
    pop.addEventListener('keydown', e => {
        const g = [...pop.querySelectorAll('[data-s]')], i = g.indexOf(document.activeElement);
        const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[e.key];
        if (i < 0 || !d) return;
        e.preventDefault();
        g[Math.min(g.length - 1, Math.max(0, i + d))].focus();
    });
    document.addEventListener('pointerdown', e => {
        if (!pop.hidden && !pop.contains(e.target) && !btnSem.contains(e.target)) cerrarPop(false);
    });

    // ── Errores por campo ──
    function error(campo, msg) {
        const el = form.querySelector('[data-err="' + campo + '"]');
        if (el) { el.textContent = msg || ''; el.hidden = !msg; }
        const inp = campo === 'semana_inicio' ? btnSem : E[campo];
        if (inp && inp.classList) inp.classList.toggle('mal', !!msg);
    }
    function limpiarErrores() {
        form.querySelectorAll('[data-err]').forEach(el => error(el.dataset.err, ''));
    }
    function validar() {
        OBLIGATORIOS.forEach(n => { if (!E[n].value.trim()) error(n, T.obligatorio); });
        if (!E.frecuencia.value) error('frecuencia', T.eligeFrec);
        const v = E.duracion_minutos.value.trim();
        if (!/^\d+$/.test(v) || +v < 1 || +v > 1440) error('duracion_minutos', T.durMal);
        return !form.querySelector('.mal');
    }

    // ── Guardar ──
    form.addEventListener('submit', e => {
        e.preventDefault();
        if (guardando) return;
        limpiarErrores();
        if (!validar()) { form.querySelector('.mal').focus(); return; }
        const fd = new FormData(form);
        fd.set('activo', activo ? '1' : '0');
        if (!plan) fd.delete('estatus');   // toda tarea nueva nace Abierta
        const btn = $('pt-guardar'), url = plan ? fondo.dataset.urlEditar.replace('/0/', '/' + plan.pk + '/') : fondo.dataset.urlNuevo;
        guardando = true; btn.disabled = true; btn.textContent = T.guardando;
        const listo = () => { guardando = false; btn.disabled = false; btn.textContent = T.guardar; };
        fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(r => r.json())
            .then(j => {
                listo();
                if (j.ok) {
                    try {
                        sessionStorage.setItem('pe-toast', plan ? t('actualizada', { codigo: j.codigo }) : t('creada', { codigo: j.codigo, n: otsVista, anio: anioVista }));
                        sessionStorage.setItem('pt-resaltar', String(j.pk));
                    } catch (er) { /* sin almacenamiento */ }
                    inicial = firma();
                    window.location.reload();
                    return;
                }
                const errores = j.errores || {};
                Object.keys(errores).forEach(c => (c === 'general' ? toast(errores[c], 'error') : error(c, errores[c])));
                const m = form.querySelector('.mal');
                if (m) m.focus();
            })
            .catch(() => { listo(); toast(T.errorRed, 'error'); });
    });

    // ── Teclado: Esc, Ctrl + Enter y foco atrapado ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        const elim = $('modal-eliminar');
        if (elim && elim.style.display === 'flex') return;   // la confirmación de eliminar va encima
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            if (!pop.hidden) cerrarPop(true);
            else if (!conf.hidden) { conf.hidden = true; E.codigo.focus(); }
            else cerrar(false);
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (conf.hidden) form.requestSubmit();
            return;
        }
        if (e.key !== 'Tab') return;
        const caja = conf.hidden ? form : conf;
        const f = [...caja.querySelectorAll('button:not([disabled]), input:not([type=hidden]), select')]
            .filter(x => x.offsetParent && x.tabIndex >= 0 && (conf.hidden ? !conf.contains(x) : true));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }, true);

    // ── Después de guardar: fila resaltada 2 s ──
    try {
        const pk = sessionStorage.getItem('pt-resaltar');
        sessionStorage.removeItem('pt-resaltar');
        const fila = pk && document.querySelector('tr[data-plan="' + pk + '"]');
        if (fila) {
            fila.classList.add('pt-resaltada');
            fila.scrollIntoView({ block: 'center' });
            setTimeout(() => fila.classList.remove('pt-resaltada'), 2000);
        }
    } catch (er) { /* sin almacenamiento */ }

    // ── Direcciones /equipos/nuevo/ y /equipos/editar/<pk>/: llegan con #nueva o #editar-<pk> ──
    const m = /^#(nueva|editar-(\d+))$/.exec(window.location.hash);
    if (m && !window.matchMedia('(max-width: 767px)').matches) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        if (m[2]) abrirEditar(m[2]); else abrirNueva();
    }
})();
