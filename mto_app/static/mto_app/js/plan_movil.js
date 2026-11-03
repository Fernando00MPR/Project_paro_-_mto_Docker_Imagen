/* plan_movil.js — Vista de celular (≤767px) del Plan de mantenimiento.
   Usa los mismos endpoints que escritorio:
   - Lista y filtros: GET /mto/equipos/ (semana, anio, frecuencia, q, resp, estado).
   - Detalle: GET /mto/equipos/<pk>/detalle-json/?anio= (mismas semanas que el modal).
   - Registrar ejecución: POST /mto/equipos/<pk>/registro/<semana>/<anio>/.
   - Asignar responsable: POST /mto/equipos/<pk>/asignar/<semana>/<anio>/. */

(function () {
    const raiz = document.getElementById('pm-movil');
    if (!raiz) return;

    const T = (window.PLAN_MOVIL || {}).i18n || {};
    const PUEDE_ASIGNAR = (window.PLAN_MOVIL || {}).puedeAsignar !== false;
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const lang = document.documentElement.lang || 'es';
    const esMovil = () => window.matchMedia('(max-width: 767px)').matches;
    const csrf = (window.MTO_CONFIG || {}).csrf_token || '';

    // ── Semana ISO ──────────────────────────────────────────────────────────
    function semanaIso(d) {
        const f = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dia = f.getUTCDay() || 7;
        f.setUTCDate(f.getUTCDate() + 4 - dia);
        const ini = new Date(Date.UTC(f.getUTCFullYear(), 0, 1));
        return { anio: f.getUTCFullYear(), semana: Math.ceil(((f - ini) / 86400000 + 1) / 7) };
    }
    const semanasDelAnio = a => semanaIso(new Date(a, 11, 28)).semana;   // 52 o 53

    // En celular siempre se trabaja sobre una semana y con un filtro de estado
    // (Pendientes por defecto). Si faltan en la URL, se agregan una sola vez.
    const url0 = new URL(window.location.href);
    if (esMovil() && (!url0.searchParams.get('semana') || !url0.searchParams.get('estado'))) {
        const hoy = semanaIso(new Date());
        if (!url0.searchParams.get('semana')) {
            url0.searchParams.set('semana', hoy.semana);
            url0.searchParams.set('anio', hoy.anio);
        }
        if (!url0.searchParams.get('estado')) url0.searchParams.set('estado', 'pend');
        url0.searchParams.delete('page');
        window.location.replace(url0.toString());
        return;
    }

    // ?abrir=<pk> (p. ej. desde el Backlog): en celular se quita de la URL —para
    // que no se arrastre a los filtros ni se reabra al recargar— y al final se
    // abre el detalle de esa tarea. En escritorio lo atiende plan_lista.js.
    const abrirPk = esMovil() ? url0.searchParams.get('abrir') : null;
    if (abrirPk) {
        url0.searchParams.delete('abrir');
        history.replaceState(null, '', url0.toString());
    }

    const semana = parseInt(raiz.dataset.semana, 10);
    const anio = parseInt(raiz.dataset.anio, 10);
    const area = raiz.dataset.area;

    const leerJson = id => { try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return null; } };
    const respPorArea = leerJson('pm-responsables') || {};
    const responsables = (respPorArea[area] || []).map(r => ({ id: String(r.pk), nombre: (r.nombre + ' ' + r.apellidos).trim() }));
    const carga = leerJson('pm-carga') || {};

    const iniciales = n => (n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '—';
    const normalizar = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const fmtCorta = iso => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '');
    };
    const fmtHoras = min => (min >= 60 ? (Math.round(min / 6) / 10).toString().replace('.', lang.startsWith('es') ? ',' : '.') + ' h' : min + ' min');
    const hoyIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

    // ── Navegación con filtros ──────────────────────────────────────────────
    function urlCon(cambios) {
        const u = new URL(window.location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k] === '' || cambios[k] === null || cambios[k] === undefined) u.searchParams.delete(k);
            else u.searchParams.set(k, cambios[k]);
        });
        u.searchParams.delete('page');
        return u.toString();
    }
    const irCon = cambios => { window.location.href = urlCon(cambios); };

    // Semana anterior / siguiente (cambia de año al pasar de la última a la 1).
    (function () {
        let pS = semana - 1, pA = anio, nS = semana + 1, nA = anio;
        if (pS < 1) { pA = anio - 1; pS = semanasDelAnio(pA); }
        if (nS > semanasDelAnio(anio)) { nA = anio + 1; nS = 1; }
        document.getElementById('pm-sem-prev').href = urlCon({ semana: pS, anio: pA });
        document.getElementById('pm-sem-next').href = urlCon({ semana: nS, anio: nA });
    })();

    // Filtro de estado: conserva los demás filtros.
    document.querySelectorAll('.pm-seg a').forEach(a => { a.href = urlCon({ estado: a.dataset.estado }); });
    document.querySelectorAll('#pm-sheet-frec a[data-frec]').forEach(a => { a.href = urlCon({ frecuencia: a.dataset.frec }); });
    
    const buscar = document.getElementById('pm-buscar');
    let tBuscar = null;
    buscar.addEventListener('input', () => {
        clearTimeout(tBuscar);
        tBuscar = setTimeout(() => {
            try { sessionStorage.setItem('pm-buscando', '1'); } catch (e) { /* sin storage */ }
            irCon({ q: buscar.value.trim() });
        }, 250);
    });
    try {
        if (sessionStorage.getItem('pm-buscando') === '1') {
            sessionStorage.removeItem('pm-buscando');
            buscar.focus();
            buscar.setSelectionRange(buscar.value.length, buscar.value.length);
        }
    } catch (e) { /* sin storage */ }

    // Píldora "Persona" + su hoja.
    const filtroResp = raiz.dataset.resp || '';
    (function () {
        const nombre = filtroResp === 'ninguno' ? t('sinAsignar')
            : filtroResp ? ((responsables.find(r => r.id === filtroResp) || {}).nombre || t('todas'))
            : t('todas');
        document.getElementById('pm-persona-txt').textContent = t('persona', { nombre });
        document.getElementById('pm-btn-persona').classList.toggle('activa', !!filtroResp);
        const lista = document.getElementById('pm-persona-lista');
        const opciones = [{ id: '', nombre: t('todas') }].concat(responsables, [{ id: 'ninguno', nombre: t('sinAsignar') }]);
        opciones.forEach(o => {
            const a = document.createElement('a');
            a.className = 'pm-opcion';
            a.href = urlCon({ resp: o.id });
            a.textContent = o.nombre;
            if (o.id === filtroResp) a.setAttribute('aria-current', 'true');
            lista.appendChild(a);
        });
    })();

    // ── Hojas (pila: el detalle puede tener hojas encima) ───────────────────
    const pila = [];
    function abrirHoja(id, event) {
        const modal = document.getElementById(id);
        if (pila.some(x => x.id === id)) return;
        pila.push({ id, disparador: (event && event.currentTarget) || document.activeElement });
        abrirModalConAnimacion(modal, event && event.currentTarget ? event : null);
        if (id === 'pm-detalle') document.body.style.overflow = 'hidden';
    }
    function cerrarHoja(id, devolverFoco = true) {
        const i = pila.findIndex(x => x.id === id);
        if (i < 0) return;
        const [x] = pila.splice(i, 1);
        cerrarModalConAnimacion(id);
        if (id === 'pm-detalle') document.body.style.overflow = '';
        if (devolverFoco && x.disparador && document.body.contains(x.disparador)) x.disparador.focus();
    }
    window.pmAbrirHoja = abrirHoja;
    window.pmCerrarHoja = cerrarHoja;

    document.querySelectorAll('.pm-hoja').forEach(h => {
        h.addEventListener('click', e => {
            if (e.target !== h) return;
            (window.pmCierres && window.pmCierres[h.id]) ? window.pmCierres[h.id]() : cerrarHoja(h.id);
        });
    });
    document.addEventListener('keydown', e => {
        if (!pila.length) return;
        const arriba = pila[pila.length - 1].id;
        const box = document.querySelector('#' + arriba + ' .modal-box');
        if (e.key === 'Escape') {
            e.stopImmediatePropagation();
            (window.pmCierres && window.pmCierres[arriba]) ? window.pmCierres[arriba]() : cerrarHoja(arriba);
        } else if (e.key === 'Tab' && box) {
            const f = Array.from(box.querySelectorAll('button, a[href], input, select, textarea'))
                .filter(el => !el.disabled && el.offsetParent !== null);
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
    }, true);
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) e.target.style.animation = 'none';
    });

    // ── Eliminar todos (confirmación fuerte) ────────────────────────────────
    const inEliminar = document.getElementById('pm-eliminar-todos-input');
    if (inEliminar) {
        const btn = document.getElementById('pm-eliminar-todos-ok');
        inEliminar.addEventListener('input', () => {
            btn.disabled = inEliminar.value.trim().toUpperCase() !== t('palabraEliminar').toUpperCase();
        });
        window.pmAbrirEliminarTodos = function (e) {
            cerrarHoja('pm-sheet-mas', false);
            inEliminar.value = '';
            btn.disabled = true;
            abrirHoja('pm-sheet-eliminar-todos', e);
            setTimeout(() => inEliminar.focus(), 250);
        };
        btn.addEventListener('click', () => {
            document.getElementById('input-area-eliminar-todos').value = area;
            btn.disabled = true;
            document.getElementById('form-eliminar-todos').submit();
        });
    }

    // ── Cargar más ──────────────────────────────────────────────────────────
    const lista = document.getElementById('pm-lista');
    const btnMas = document.getElementById('pm-cargar-mas');
    if (btnMas) {
        const etiquetar = () => {
            const quedan = +btnMas.dataset.total - +btnMas.dataset.fin;
            btnMas.textContent = t('cargarN', { n: Math.min(+btnMas.dataset.perPage, quedan), m: quedan });
        };
        etiquetar();
        btnMas.addEventListener('click', () => {
            const u = new URL(window.location.href);
            u.searchParams.set('page', btnMas.dataset.next);
            btnMas.disabled = true;
            fetch(u.toString())
                .then(r => r.text())
                .then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    doc.querySelectorAll('#pm-lista .pm-card').forEach(c => { prepararCard(c); lista.appendChild(c); });
                    const nuevo = doc.getElementById('pm-cargar-mas');
                    if (nuevo) {
                        btnMas.dataset.next = nuevo.dataset.next;
                        btnMas.dataset.fin = nuevo.dataset.fin;
                        etiquetar();
                        btnMas.disabled = false;
                    } else {
                        btnMas.remove();
                    }
                })
                .catch(() => { btnMas.disabled = false; mostrarToast(t('errorCargar')); });
        });
    }

    // ── Tarjetas ────────────────────────────────────────────────────────────
    function pintarResp(card) {
        const btn = card.querySelector('.pm-resp');
        const id = card.dataset.respId;
        const nombre = (responsables.find(r => r.id === id) || {}).nombre || card.dataset.respNombre || '';
        btn.classList.toggle('asignado', !!id);
        btn.querySelector('.pm-iniciales').style.display = id ? '' : 'none';
        btn.querySelector('.pm-ico-persona').style.display = id ? 'none' : '';
        btn.querySelector('.pm-iniciales').textContent = iniciales(nombre);
        btn.querySelector('span:last-child').textContent = id ? nombre : (PUEDE_ASIGNAR ? t('asignar') : t('sinAsignar'));
        btn.setAttribute('aria-label', id ? (PUEDE_ASIGNAR ? t('cambiarResp', { nombre }) : nombre) : (PUEDE_ASIGNAR ? t('asignar') : t('sinAsignar')));
        btn.disabled = !PUEDE_ASIGNAR;
    }
    function prepararCard(card) { pintarResp(card); }
    lista.querySelectorAll('.pm-card').forEach(prepararCard);

    lista.addEventListener('click', e => {
        const card = e.target.closest('.pm-card');
        if (!card) return;
        if (e.target.closest('.pm-resp')) { if (PUEDE_ASIGNAR) abrirAsignar(card, e); return; }
        if (e.target.closest('.pm-registrar')) { abrirDetalle(card, e, true); return; }
        if (e.target.closest('.pm-cuerpo')) abrirDetalle(card, e, false);
    });
    lista.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pm-cuerpo')) {
            e.preventDefault();
            abrirDetalle(e.target.closest('.pm-card'), e, false);
        }
    });

    // ── Asignar responsable (solo la semana seleccionada) ───────────────────
    let asig = null;   // { card, actual, elegido }
    const personas = document.getElementById('pm-personas');
    const btnAsignar = document.getElementById('pm-asignar-ok');

    function abrirAsignar(card, event) {
        asig = { card, actual: card.dataset.respId || '', elegido: card.dataset.respId || '' };
        document.getElementById('pm-asig-codigo').textContent = card.dataset.codigo;
        document.getElementById('pm-asig-nombre').textContent = card.dataset.actividad;
        document.getElementById('pm-asig-buscar').value = '';
        const orden = responsables.slice().sort((a, b) => {
            if (a.id === asig.actual) return -1;
            if (b.id === asig.actual) return 1;
            const ca = (carga[a.id] || {}).tareas || 0, cb = (carga[b.id] || {}).tareas || 0;
            return ca - cb || a.nombre.localeCompare(b.nombre);
        });
        personas.replaceChildren();
        orden.concat([{ id: '', nombre: t('sinAsignar'), ninguno: true }]).forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pm-persona' + (p.ninguno ? ' ninguno' : '');
            b.setAttribute('role', 'radio');
            b.dataset.id = p.id;
            b.dataset.busqueda = normalizar(p.nombre);
            const c = carga[p.id] || { tareas: 0, minutos: 0 };
            b.innerHTML = '<span class="pm-avatar"></span><span class="pm-persona-txt"><b></b><small></small></span><span class="pm-radio"></span>';
            b.querySelector('.pm-avatar').textContent = p.ninguno ? '—' : iniciales(p.nombre);
            b.querySelector('b').textContent = p.nombre;
            b.querySelector('small').textContent = p.ninguno ? t('quitarResp')
                : t('carga', { n: c.tareas, h: fmtHoras(c.minutos) });
            b.addEventListener('click', () => { asig.elegido = p.id; pintarAsignar(); });
            personas.appendChild(b);
        });
        pintarAsignar();
        abrirHoja('pm-sheet-asignar', event);
    }
    function pintarAsignar() {
        personas.querySelectorAll('.pm-persona').forEach(b => b.setAttribute('aria-checked', b.dataset.id === asig.elegido ? 'true' : 'false'));
        const nombre = (responsables.find(r => r.id === asig.elegido) || {}).nombre;
        btnAsignar.textContent = asig.elegido ? t('asignarA', { nombre }) : t('quitarResp');
        btnAsignar.disabled = asig.elegido === asig.actual;
    }
    document.getElementById('pm-asig-buscar').addEventListener('input', e => {
        const q = normalizar(e.target.value.trim());
        personas.querySelectorAll('.pm-persona').forEach(b => { b.hidden = !!q && !b.dataset.busqueda.includes(q); });
    });
    btnAsignar.addEventListener('click', () => {
        if (!asig) return;
        const { card, actual, elegido } = asig;
        btnAsignar.disabled = true;
        fetch(`/mto/equipos/${card.dataset.pk}/asignar/${semana}/${anio}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf },
            body: 'responsable=' + encodeURIComponent(elegido),
        })
            .then(r => {
                if (!r.ok) throw new Error();
                const min = +card.dataset.minutos || 0;
                if (actual && carga[actual]) { carga[actual].tareas--; carga[actual].minutos -= min; }
                if (elegido) { carga[elegido] = carga[elegido] || { tareas: 0, minutos: 0 }; carga[elegido].tareas++; carga[elegido].minutos += min; }
                card.dataset.respId = elegido;
                pintarResp(card);
                cerrarHoja('pm-sheet-asignar');
                mostrarToast(t('respGuardado'));
            })
            .catch(() => { btnAsignar.disabled = false; mostrarToast(t('errorGuardar')); });
    });

    // ── Horas por persona ───────────────────────────────────────────────────
    // Usa la misma carga que "Asignar responsable" (se actualiza al asignar, sin
    // recargar). "Sin asignar" = total de la semana − lo asignado.
    const nTareas = n => (n === 1 ? t('unaTarea') : t('nTareas', { n }));
    window.pmAbrirHoras = function (e) {
        cerrarHoja('pm-sheet-mas', false);
        const totalMin = +raiz.dataset.totalMin || 0;
        const totalTar = +raiz.dataset.totalTareas || 0;
        const filas = responsables
            .map(r => Object.assign({ nombre: r.nombre, ini: iniciales(r.nombre) }, carga[r.id] || { tareas: 0, minutos: 0 }))
            .filter(f => f.tareas > 0)
            .sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre));
        const asigTar = filas.reduce((s, f) => s + f.tareas, 0);
        const asigMin = filas.reduce((s, f) => s + f.minutos, 0);
        if (totalTar > asigTar) {
            filas.push({ nombre: t('sinAsignar'), ini: '—', tareas: totalTar - asigTar, minutos: Math.max(0, totalMin - asigMin), ninguno: true });
        }
        document.getElementById('pm-horas-total').textContent = fmtHoras(totalMin) + ' · ' + nTareas(totalTar);

        const ul = document.getElementById('pm-horas-lista');
        ul.replaceChildren();
        if (!filas.length) {
            const li = document.createElement('li');
            li.className = 'pm-horas-vacio';
            li.textContent = t('sinHoras');
            ul.appendChild(li);
        }
        filas.forEach(f => {
            const pct = totalMin ? Math.round(f.minutos * 100 / totalMin) : 0;
            const li = document.createElement('li');
            if (f.ninguno) li.className = 'ninguno';
            li.innerHTML = '<span class="pm-avatar" aria-hidden="true"></span>' +
                '<div class="pm-horas-txt"><div class="pm-horas-l1"><b></b><span></span></div><small></small>' +
                '<div class="pm-horas-barra" aria-hidden="true"><i></i></div></div>';
            li.querySelector('.pm-avatar').textContent = f.ini;
            li.querySelector('b').textContent = f.nombre;
            li.querySelector('.pm-horas-l1 span').textContent = fmtHoras(f.minutos);
            li.querySelector('small').textContent = nTareas(f.tareas) + ' · ' + t('pctTotal', { p: pct });
            li.querySelector('.pm-horas-barra i').style.width = Math.max(pct, f.minutos ? 2 : 0) + '%';
            ul.appendChild(li);
        });
        abrirHoja('pm-sheet-horas', e);
    };

    // ── Detalle del plan, registrar ejecución, seguimientos e historial ─────
    // Mismo contenido que el detalle de escritorio: GET detalle-json y POST registro (multipart: fotos y validación).
    const TD = window.PLAN_MOVIL_DET || {};
    const td = (k, vars) => {
        let s = TD[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const $ = id => document.getElementById(id);
    const MAX_FOTOS = 4, MAX_BYTES = 5 * 1024 * 1024, MAX_LADO = 1600, DIA = 864e5;
    const det = { pk: null, card: null, anio: anio, data: null, sel: null, estado: '', resp: '', validacion: 'por_validar', valPor: '',
                  fotos: [], quitadas: [], sucio: false, huboCambio: false, segFiltro: 'abiertos', hisFiltro: '', guardando: false };
    const fechaHidden = document.querySelector('#dp-pm-fecha .dp-value');
    const segFechaHidden = document.querySelector('#dp-pm-seg-fecha .dp-value');
    const txtObs = $('pm-reg-obs');
    const ESTADOS = ['completada', 'pendiente', 'reagendada', 'cancelada'];
    const marcarSucio = () => { det.sucio = true; };

    // ── Utilidades de fecha ──
    const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const aIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const lunesDe = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const fmtDiaSemana = iso => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(deIso(iso)).replace(/[.,]/g, '');
    const rangoSemana = s => {
        const a = deIso(s.lunes), b = deIso(s.domingo);
        return a.getMonth() === b.getMonth() ? a.getDate() + ' – ' + fmtCorta(s.domingo) : fmtCorta(s.lunes) + ' – ' + fmtCorta(s.domingo);
    };
    const sumarDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return aIso(d); };
    const finDeMes = () => { const d = new Date(); return aIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
    const semanaDeIso = iso => semanaIso(deIso(iso)).semana;
    const etiquetaCls = c => ({ completada: td('completada'), pendiente: td('pendiente'), reagendada: td('reagendada'), cancelada: td('cancelada'),
                                vencida: td('sinRegVencida'), sinreg: td('sinRegistro'), proxima: td('proxima') })[c] || '';
    const persona = id => (det.data ? det.data.responsables : []).find(r => String(r.id) === String(id)) || null;

    // ── Abrir y cargar ──
    function abrirDetalle(card, event, enfocarRegistro) {
        Object.assign(det, { pk: card.dataset.pk, card, anio, data: null, sel: null, sucio: false, huboCambio: false, segFiltro: 'abiertos', hisFiltro: '' });
        $('pm-det-codigo').textContent = card.dataset.codigo;
        $('pm-det-meta').textContent = '';
        $('pm-det-contenido').hidden = true;
        $('pm-det-cargando').hidden = false;
        $('pm-det-cargando').textContent = td('cargando');
        $('pm-det-guardar').disabled = true;
        abrirHoja('pm-detalle', event);
        cargarDetalle(semana, enfocarRegistro);
    }

    function cargarDetalle(semanaPreferida, enfocarRegistro, opciones) {
        const o = opciones || {};
        fetch(`/mto/equipos/${det.pk}/detalle-json/?anio=${det.anio}`, { credentials: 'same-origin' })
            .then(r => r.json())
            .then(data => {
                det.data = data;
                const existe = s => data.semanas.some(x => x.semana === s);
                det.sel = existe(semanaPreferida) ? semanaPreferida
                    : (data.proxima && existe(data.proxima.semana) ? data.proxima.semana
                    : (data.semanas[0] ? data.semanas[0].semana : null));
                pintarDetalle();
                cargarFormulario();
                $('pm-det-cargando').hidden = true;
                $('pm-det-contenido').hidden = false;
                if (o.abrirSeg) { setSec('seg', true); }
                if (o.resaltar) resaltarSeg(o.resaltar);
                if (enfocarRegistro) {
                    setTimeout(() => {
                        $('pm-registro').scrollIntoView({ block: 'start' });
                        const b = document.querySelector('.pm-estados button');
                        if (b) b.focus();
                    }, 260);
                }
            })
            .catch(() => { $('pm-det-cargando').textContent = td('errorCargar'); });
    }

    function semanaSel() { return det.data && det.data.semanas.find(s => s.semana === det.sel); }
    function seleccionarSemana(n, irAlFormulario) {
        if (n === det.sel) { if (irAlFormulario) $('pm-registro').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        conConfirmacion(() => {
            det.sel = n; det.sucio = false;
            pintarDetalle(); cargarFormulario();
            if (irAlFormulario) $('pm-registro').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // ── Pintar encabezado, calendario y secciones ──
    function pintarDetalle() {
        const d = det.data, p = d.plan;
        $('pm-det-meta').textContent = [p.area, p.frecuencia, fmtHoras(p.duracion_minutos)].join(' · ');
        $('pm-det-titulo').textContent = p.actividad;
        $('pm-det-proxima').textContent = d.proxima ? 'S' + d.proxima.semana + ' · ' + fmtDiaSemana(d.proxima.lunes) : '—';
        const c = d.cumplimiento;
        $('pm-det-cum').className = 'cum-' + c.nivel;
        $('pm-det-cum-l').textContent = td('cumLabel', { anio: d.anio });
        $('pm-det-cum-v').textContent = td('cumValor', { h: c.hechas, e: c.exigibles, p: c.pct });
        $('pm-cal-n').textContent = d.semanas.length === 1 ? td('nOcurr1') : td('nOcurrN', { n: d.semanas.length });

        const anios = $('pm-det-anios');
        anios.replaceChildren();
        [d.anio - 1, d.anio, d.anio + 1].forEach(a => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = a;
            b.setAttribute('aria-pressed', a === d.anio ? 'true' : 'false');
            b.addEventListener('click', () => {
                if (a === d.anio) return;
                conConfirmacion(() => { det.anio = a; det.sucio = false; cargarDetalle(null, false); });
            });
            anios.appendChild(b);
        });

        const grid = $('pm-det-semanas');
        grid.replaceChildren();
        if (!d.semanas.length) {
            const v = document.createElement('div'); v.className = 'pm-sem-vacio'; v.textContent = t('sinSemanas'); grid.appendChild(v);
        }
        d.semanas.forEach(s => {
            const b = document.createElement('button');
            b.type = 'button'; b.setAttribute('role', 'option');
            b.className = 'pm-sem' + (s.fuera ? ' fuera' : '');
            b.dataset.cls = s.cls;
            b.innerHTML = '<span class="n"></span><span class="d"></span>' + (s.vencida ? '<i class="late" aria-hidden="true"></i>' : '');
            b.querySelector('.n').textContent = s.semana;
            b.querySelector('.d').textContent = fmtCorta(s.lunes);
            const sel = s.semana === det.sel;
            b.setAttribute('aria-selected', sel ? 'true' : 'false');
            b.setAttribute('aria-label', td('ariaSemana', { n: s.semana, rango: rangoSemana(s), estado: etiquetaCls(s.cls) }) + (sel ? ', ' + t('seleccionada') : ''));
            b.addEventListener('click', () => seleccionarSemana(s.semana, false));
            grid.appendChild(b);
        });
        pintarSecciones();
    }

    function setSec(id, abierta) {
        const sec = $('pm-sec-' + id);
        sec.classList.toggle('open', abierta);
        sec.querySelector('.pm-sec-toggle').setAttribute('aria-expanded', abierta ? 'true' : 'false');
        $('pm-sec-' + id + '-body').hidden = !abierta;
    }
    document.querySelectorAll('.pm-sec').forEach(sec => {
        const id = sec.id.replace('pm-sec-', '');
        const alternar = () => setSec(id, !sec.classList.contains('open'));
        sec.querySelector('.pm-sec-toggle').addEventListener('click', alternar);
        sec.querySelector('.pm-sec-chev').addEventListener('click', alternar);
    });

    function chipEstado(clase, texto) {
        const c = document.createElement('span'); c.className = 'pm-chip ' + clase; c.textContent = texto; return c;
    }
    function pintarSecciones() {
        const d = det.data;
        // Seguimientos
        const segs = d.seguimientos, abiertos = segs.filter(s => s.estatus !== 'completado');
        $('pm-sec-seg-sub').textContent = segs.length
            ? (abiertos.length === 1 ? td('segResumen1', { orden: abiertos[0].orden }) : td('segResumenN', { n: abiertos.length, orden: abiertos[0] ? abiertos[0].orden : '—' }))
            : td('sinSeguimientos');
        const fb = document.querySelectorAll('#pm-seg-filtro button');
        fb[0].textContent = td('abiertos', { n: abiertos.length }); fb[1].textContent = td('todos', { n: segs.length });
        fb.forEach(b => b.setAttribute('aria-pressed', b.dataset.f === det.segFiltro ? 'true' : 'false'));
        const lista = $('pm-seg-lista');
        lista.replaceChildren();
        const ver = segs.filter(s => det.segFiltro === 'todos' || s.estatus !== 'completado');
        if (!ver.length) { const v = document.createElement('div'); v.className = 'pm-vacio'; v.textContent = td('sinSegMostrar'); lista.appendChild(v); }
        ver.forEach(s => {
            const t1 = document.createElement('article'); t1.className = 'pm-tarjeta' + (s.vencido ? ' venc' : ''); t1.dataset.id = s.id;
            const top = document.createElement('div'); top.className = 'top';
            const o = document.createElement('b'); o.className = 'mono'; o.textContent = s.orden;
            top.append(o, chipEstado('est-' + s.estatus, s.estatus_txt));
            const p = document.createElement('p'); p.className = 'prob'; p.textContent = s.problema;
            const m = document.createElement('div'); m.className = 'meta';
            m.textContent = [s.responsable || '—', td('semanaN', { n: s.semana })].join(' · ');
            const fila = document.createElement('div'); fila.className = 'fila';
            if (s.estatus === 'completado') fila.appendChild(chipEstado('est-completado', td('cumplido')));
            else if (s.vencido) fila.appendChild(chipEstado('est-venc', td('vencidoN', { n: s.vencido })));
            else if (s.fecha) { const f = document.createElement('span'); f.className = 'fecha'; f.textContent = td('compromisoF', { f: fmtCorta(s.fecha) }); fila.appendChild(f); }
            if (s.n_imgs) {
                const fb = document.createElement('button'); fb.type = 'button'; fb.className = 'pm-mini'; fb.textContent = td('fotosN', { n: s.n_imgs });
                fb.addEventListener('click', () => {
                    fetch(`/mto/seguimiento/ot/${s.id}/imagenes/`, { credentials: 'same-origin' }).then(r => r.json())
                        .then(d => { if ((d.imagenes || []).length) abrirVisor(d.imagenes.map(i => ({ url: i.url, etiqueta: '' })), null, 0); })
                        .catch(() => mostrarToast(t('errorCargar')));
                });
                fila.appendChild(fb);
            }
            if (det.data.permisos.editar_seg) {
                const e = document.createElement('button'); e.type = 'button'; e.className = 'pm-mini'; e.textContent = td('editar');
                e.addEventListener('click', () => abrirSeg(s));
                fila.appendChild(e);
            }
            t1.append(top, p, m, fila);
            lista.appendChild(t1);
        });
        actualizarDar();

        // Historial
        const sem = d.semanas, cats = { completada: 0, pendiente: 0, cancelada: 0, sinreg: 0, proxima: 0 };
        const catDe = s => s.estado ? ({ completada: 'completada', pendiente: 'pendiente', reagendada: 'pendiente', cancelada: 'cancelada' })[s.estado] : (s.cls === 'proxima' ? 'proxima' : 'sinreg');
        sem.forEach(s => { cats[catDe(s)]++; });
        $('pm-sec-his-sub').textContent = td('hisResumen', { n: sem.length, v: d.vencidas });
        const chips = $('pm-his-chips');
        chips.replaceChildren();
        [['', td('chTodas', { n: sem.length })], ['completada', td('chCompletadas', { n: cats.completada })], ['pendiente', td('chPendientes', { n: cats.pendiente })],
         ['cancelada', td('chCanceladas', { n: cats.cancelada })], ['sinreg', td('chSinReg', { n: cats.sinreg })], ['proxima', td('chProximas', { n: cats.proxima })]].forEach(([k, txt]) => {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.dataset.c = k;
            b.setAttribute('aria-pressed', k === det.hisFiltro ? 'true' : 'false');
            b.addEventListener('click', () => { det.hisFiltro = k; pintarSecciones(); });
            chips.appendChild(b);
        });
        const hl = $('pm-his-lista');
        hl.replaceChildren();
        sem.filter(s => !det.hisFiltro || catDe(s) === det.hisFiltro).forEach(s => {
            const t1 = document.createElement('article'); t1.className = 'pm-tarjeta' + (s.vencida ? ' venc' : '') + (s.semana === det.sel ? ' sel' : '');
            const top = document.createElement('div'); top.className = 'top';
            const w = document.createElement('b'); w.className = 'mono'; w.textContent = 'S' + s.semana;
            const r = document.createElement('span'); r.className = 'rango'; r.textContent = rangoSemana(s);
            top.append(w, r, chipEstado('cls-' + s.cls, etiquetaCls(s.cls)));
            t1.appendChild(top);
            const per = persona(s.responsable_id);
            const l1 = document.createElement('div'); l1.className = 'meta';
            l1.textContent = [per ? per.nombre : (s.vencida ? td('sinAsignar') : '—'),
                              s.fecha_ejecucion ? td('ejecutadaF', { f: fmtCorta(s.fecha_ejecucion) }) : ''].filter(Boolean).join(' · ');
            t1.appendChild(l1);
            const fila = document.createElement('div'); fila.className = 'fila';
            if (s.semanas_atraso) fila.appendChild(chipEstado('cls-atraso', td('atrasoSem', { n: s.semanas_atraso })));
            if (s.estado === 'completada' || s.validacion === 'rechazado') fila.appendChild(chipEstado('val-' + s.validacion, ({ validado: td('validado'), por_validar: td('porValidar'), rechazado: td('rechazado') })[s.validacion]));
            const obs = s.estado === 'cancelada' && s.motivo_cancelacion ? s.motivo_cancelacion
                : (s.validacion === 'rechazado' ? td('rechazadoM', { m: s.motivo_rechazo }) : s.observaciones);
            if (obs) { const ob = document.createElement('p'); ob.className = 'obs'; ob.textContent = obs; t1.appendChild(ob); }
            if (s.fotos.length) {
                const fb2 = document.createElement('button'); fb2.type = 'button'; fb2.className = 'pm-mini'; fb2.textContent = td('fotosN', { n: s.fotos.length });
                fb2.addEventListener('click', () => abrirVisor(s.fotos, s.semana));
                fila.appendChild(fb2);
            }
            const ir = document.createElement('button'); ir.type = 'button'; ir.className = 'pm-mini azul';
            ir.textContent = s.registro_pk ? td('editarRegistro') : (s.cls === 'proxima' ? td('verSemana') : td('registrarEjec'));
            ir.addEventListener('click', () => seleccionarSemana(s.semana, true));
            fila.appendChild(ir);
            t1.appendChild(fila);
            hl.appendChild(t1);
        });
    }
    document.querySelectorAll('#pm-seg-filtro button').forEach(b => b.addEventListener('click', () => { det.segFiltro = b.dataset.f; pintarSecciones(); }));

    function resaltarSeg(id) {
        setSec('seg', true);
        const el = document.querySelector('#pm-seg-lista .pm-tarjeta[data-id="' + id + '"]');
        if (!el) return;
        el.classList.add('resaltada');
        el.scrollIntoView({ block: 'center' });
        setTimeout(() => el.classList.remove('resaltada'), 2000);
    }

    // ── Formulario de la semana seleccionada ──
    function cargarFormulario() {
        const s = semanaSel();
        $('pm-registro').hidden = !s;
        $('pm-det-guardar').hidden = !s;
        if (!s) return;
        $('pm-reg-sub').textContent = td('subSemana', { n: s.semana, rango: rangoSemana(s), anio: det.data.anio }) + (s.editor ? ' · ' + td('editadoPor', { u: s.editor }) : '');
        $('pm-det-guardar').textContent = td('guardarS', { n: s.semana });
        det.resp = s.responsable_id ? String(s.responsable_id) : '';
        det.validacion = s.validacion || 'por_validar';
        det.valPor = s.validado_por_id ? String(s.validado_por_id) : '';
        det.fotos = s.fotos.map(f => ({ id: f.id, url: f.url, etiqueta: f.etiqueta || '' }));
        det.quitadas = [];
        fechaHidden.value = s.fecha_ejecucion || '';
        fechaHidden.dispatchEvent(new Event('change', { bubbles: true }));
        txtObs.value = s.observaciones || '';
        $('pm-reg-canc').value = s.motivo_cancelacion || '';
        $('pm-reag-sem').value = s.reagendada_semana || '';
        $('pm-reag-anio').value = s.reagendada_anio || det.data.anio;
        $('pm-val-motivo').value = s.motivo_rechazo || '';
        document.querySelectorAll('#pm-registro .pm-error').forEach(e => { e.hidden = true; });
        fijarEstado(s.estado || '');
        pintarRespForm(); pintarValPor(); pintarFotos(); pintarValidacion(); pintarReag();
        $('pm-btn-elim-reg').hidden = !s.registro_pk;
        $('pm-elim-reg-txt').textContent = td('elimReg', { n: s.semana });
        aplicarPermisosForm(s);
        $('pm-det-guardar').disabled = false;
        setTimeout(() => { det.sucio = false; }, 0);
    }

    // Permisos: sin Llenar/Editar (o con el registro ya llenado) queda de solo lectura; con Validar solo cambia la validación.
    function modoSemana(s) {
        const p = det.data.permisos, cerrado = ['completada', 'cancelada', 'reagendada'].indexOf(s.estado) !== -1;
        if (p.editar_plan || (p.llenar_plan && !cerrado)) return 'editable';
        if (p.validar && s.registro_pk) return 'solo_validar';
        return 'solo_lectura';
    }
    function aplicarPermisosForm(s) {
        const p = det.data.permisos;
        det.modo = modoSemana(s);
        const libre = det.modo === 'editable';
        const aviso = $('pm-aviso-permiso');
        aviso.hidden = libre;
        if (!libre) aviso.querySelector('.txt').textContent = det.modo === 'solo_validar' ? td('avisoSoloValidar')
            : (['completada', 'cancelada', 'reagendada'].indexOf(s.estado) !== -1 && p.llenar_plan ? td('avisoYaLlenado') : td('avisoLectura'));
        document.querySelectorAll('#pm-registro .pm-estados button, #pm-btn-resp, #pm-reg-obs, #pm-reg-canc, #pm-reag-sem, #pm-reag-anio')
            .forEach(el => { el.disabled = !libre; });
        // Asignar responsable solo con permiso de Editar o Validar: los demás lo ven fijo.
        $('pm-btn-resp').disabled = !libre || !(p.editar_plan || p.validar);
        $('pm-fechaw').classList.toggle('bloq', !libre);
        $('pm-det-guardar').hidden = det.modo === 'solo_lectura';
        $('pm-btn-elim-reg').hidden = !(p.eliminar_plan && s.registro_pk);
        pintarFotos();
    }

    function error(id, msg) { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; }

    // Estado (2×2) + bloques de Reagendada y Cancelada
    function fijarEstado(est) {
        det.estado = est;
        document.querySelectorAll('.pm-estados button[data-estado]').forEach(b => { if (b.closest('#pm-seg-estatus')) return; b.setAttribute('aria-checked', b.dataset.estado === est ? 'true' : 'false'); });
        $('pm-blk-reag').hidden = est !== 'reagendada';
        $('pm-blk-canc').hidden = est !== 'cancelada';
        pintarAtraso(); pintarValidacion(); pintarReset();
    }
    document.querySelectorAll('#pm-registro .pm-estados button').forEach((b, i, todos) => {
        b.addEventListener('click', () => {
            fijarEstado(b.dataset.estado); marcarSucio(); error('pm-err-estado', '');
            if (b.dataset.estado === 'completada' && !fechaHidden.value) {
                fechaHidden.value = hoyIso();
                fechaHidden.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        b.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const n = todos[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + todos.length) % todos.length];
            n.focus(); n.click();
        });
    });
    function pintarReag() {
        const s = parseInt($('pm-reag-sem').value, 10), a = parseInt($('pm-reag-anio').value, 10);
        let rango = '';
        if (s >= 1 && s <= 53 && a >= 2000) {
            const ene4 = new Date(a, 0, 4); const lunes = new Date(ene4); lunes.setDate(ene4.getDate() - ((ene4.getDay() + 6) % 7) + (s - 1) * 7);
            const dom = new Date(lunes); dom.setDate(lunes.getDate() + 6);
            rango = fmtCorta(aIso(lunes)) + ' – ' + fmtCorta(aIso(dom));
        }
        $('pm-reag-rango').textContent = rango;
    }
    ['pm-reag-sem', 'pm-reag-anio'].forEach(id => $(id).addEventListener('input', () => { pintarReag(); marcarSucio(); error('pm-err-reag', ''); }));
    [$('pm-reg-canc'), txtObs, $('pm-val-motivo')].forEach(el => el.addEventListener('input', () => { marcarSucio(); error('pm-err-canc', ''); error('pm-err-motivo', ''); }));

    // Botones tipo selector (responsable / validado por)
    function pintarSelector(btn, id, vacio) {
        const p = persona(id), av = btn.querySelector('.pm-av'), tx = btn.querySelector('.pm-sel-txt');
        av.hidden = !p; av.textContent = p ? iniciales(p.nombre) : '';
        tx.replaceChildren();
        if (p) { tx.append(p.nombre + ' '); const n = document.createElement('small'); n.textContent = p.nomina; tx.appendChild(n); }
        else { tx.textContent = vacio; }
        btn.classList.toggle('vacio', !p);
    }
    const pintarRespForm = () => pintarSelector($('pm-btn-resp'), det.resp, td('elegirResp'));
    const pintarValPor = () => pintarSelector($('pm-btn-valpor'), det.valPor, td('elegirValidador'));

    // ── Hoja para elegir persona ──
    let pickerAlElegir = null;
    function abrirPicker(titulo, actualId, alElegir, event, nombreLibre) {
        pickerAlElegir = alElegir;
        $('pm-resp-titulo').textContent = titulo;
        $('pm-resp-buscar').value = '';
        const caja = $('pm-resp-personas');
        caja.replaceChildren();
        const lista = (det.data ? det.data.responsables : []).slice();
        if (nombreLibre && !lista.some(r => r.nombre === nombreLibre)) lista.unshift({ id: nombreLibre, nombre: nombreLibre, nomina: '', libre: true });
        lista.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'pm-persona'; b.setAttribute('role', 'radio');
            b.dataset.id = p.id; b.dataset.busqueda = normalizar(p.nombre + ' ' + (p.nomina || ''));
            b.setAttribute('aria-checked', (String(p.id) === String(actualId) || p.nombre === actualId) ? 'true' : 'false');
            b.innerHTML = '<span class="pm-avatar"></span><span class="pm-persona-txt"><b></b><small></small></span><span class="pm-radio"></span>';
            b.querySelector('.pm-avatar').textContent = iniciales(p.nombre);
            b.querySelector('b').textContent = p.nombre;
            b.querySelector('small').textContent = p.nomina || '';
            b.addEventListener('click', () => { cerrarHoja('pm-sheet-resp', false); if (pickerAlElegir) pickerAlElegir(p); });
            caja.appendChild(b);
        });
        abrirHoja('pm-sheet-resp', event);
    }
    $('pm-resp-buscar').addEventListener('input', e => {
        const q = normalizar(e.target.value.trim());
        $('pm-resp-personas').querySelectorAll('.pm-persona').forEach(b => { b.hidden = !!q && !b.dataset.busqueda.includes(q); });
    });
    $('pm-btn-resp').addEventListener('click', e => abrirPicker(td('responsable'), det.resp, p => { det.resp = String(p.id); pintarRespForm(); marcarSucio(); error('pm-err-resp', ''); }, e));
    $('pm-btn-valpor').addEventListener('click', e => abrirPicker(td('validadoPor'), det.valPor, p => { det.valPor = String(p.id); pintarValPor(); marcarSucio(); error('pm-err-valpor', ''); }, e));

    // ── Fecha de ejecución: semana, aviso de atraso, no futura ──
    function pintarAtraso() {
        const s = semanaSel(), iso = fechaHidden.value, caja = $('pm-fechaw'), aviso = $('pm-aviso-atraso');
        caja.classList.remove('tarde'); $('pm-fecha-sem').textContent = ''; aviso.hidden = true;
        if (!s || !iso) { return; }
        $('pm-fecha-sem').textContent = 'S' + semanaDeIso(iso);
        if (iso > hoyIso()) { error('pm-err-fecha', td('fechaFutura')); return; }
        error('pm-err-fecha', '');
        const n = Math.max(0, Math.round((lunesDe(deIso(iso)) - deIso(s.lunes)) / (7 * DIA)));
        if (n > 0 && det.estado === 'completada') {
            caja.classList.add('tarde');
            aviso.querySelector('.txt').innerHTML = td(n === 1 ? 'atrasoUna' : 'atrasoN', { n: n, y: s.semana });
            aviso.hidden = false;
        }
    }
    fechaHidden.addEventListener('change', () => { pintarAtraso(); marcarSucio(); pintarReset(); });

    // ── Evidencia fotográfica (cámara o galería; se comprime a 1600 px) ──
    const archivo = $('pm-file');
    function pintarFotos() {
        const caja = $('pm-imgs');
        const items = det.fotos.map((f, i) => {
            const d = document.createElement('div'); d.className = 'pm-foto';
            const im = document.createElement('button'); im.type = 'button'; im.className = 'img';
            im.setAttribute('aria-label', td('verFoto', { n: i + 1 }));
            im.style.backgroundImage = 'url("' + f.url + '")';
            im.addEventListener('click', () => abrirVisor(det.fotos, null, i));
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', td('quitarFoto'));
            rm.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
            rm.addEventListener('click', () => { if (f.id) det.quitadas.push(f.id); det.fotos.splice(i, 1); marcarSucio(); pintarFotos(); pintarReset(); });
            const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tag' + (f.etiqueta ? '' : ' vacia');
            tag.textContent = f.etiqueta ? td(f.etiqueta) : td('sinEtiqueta');
            tag.addEventListener('click', () => { f.etiqueta = ['', 'antes', 'despues'][(['', 'antes', 'despues'].indexOf(f.etiqueta) + 1) % 3]; marcarSucio(); pintarFotos(); pintarReset(); });
            // Sin Editar solo se pueden quitar o re-etiquetar las fotos que uno acaba de agregar.
            if (det.modo === 'editable' && (det.data.permisos.editar_plan || !f.id)) d.append(im, rm, tag);
            else { tag.disabled = true; d.append(im, tag); }
            return d;
        });
        if (det.modo === 'editable' && det.fotos.length < MAX_FOTOS) {
            const a = document.createElement('button'); a.type = 'button'; a.className = 'pm-foto-add'; a.setAttribute('aria-label', td('agregarFoto'));
            a.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>' + td('agregar');
            a.addEventListener('click', () => archivo.click());
            items.push(a);
        }
        while (items.length < MAX_FOTOS) { const v = document.createElement('div'); v.className = 'pm-foto-libre'; v.setAttribute('aria-hidden', 'true'); items.push(v); }
        caja.replaceChildren(...items);
        $('pm-cnt-imgs').textContent = det.fotos.length + ' / ' + MAX_FOTOS;
    }
    function comprimir(file) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(file), im = new Image();
            im.onload = () => {
                const k = Math.min(1, MAX_LADO / Math.max(im.naturalWidth, im.naturalHeight));
                const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
            };
            im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            im.src = url;
        });
    }
    async function agregarArchivos(lst) {
        error('pm-err-fotos', '');
        for (const f of Array.from(lst)) {
            if (det.fotos.length >= MAX_FOTOS) { error('pm-err-fotos', td('maxFotos')); break; }
            if (!f.type.startsWith('image/')) { error('pm-err-fotos', td('soloImagenes')); continue; }
            const blob = await comprimir(f);                    // las fotos de celular (HEIC, etc.) salen como JPEG
            if (!blob || blob.size > MAX_BYTES) { error('pm-err-fotos', td('soloImagenes')); continue; }
            const nombre = (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
            det.fotos.push({ url: URL.createObjectURL(blob), etiqueta: '', file: new File([blob], nombre, { type: 'image/jpeg' }) });
            marcarSucio();
        }
        pintarFotos(); pintarReset();
    }
    archivo.addEventListener('change', () => { agregarArchivos(archivo.files); archivo.value = ''; });

    // Visor de fotos (evidencia y historial)
    const visor = $('pm-visor');
    let vLista = [], vI = 0, vSem = null;
    function pintarVisor() {
        const f = vLista[vI];
        $('pm-visor-img').src = f.url;
        $('pm-visor-pie').textContent = (vSem ? td('fotosDe', { n: vSem }) + ' · ' : '') + td('fotoN', { i: vI + 1, n: vLista.length }) + (f.etiqueta ? ' · ' + td(f.etiqueta) : '');
    }
    function abrirVisor(lista, sem, indice) { vLista = lista; vSem = sem; vI = indice || 0; pintarVisor(); visor.hidden = false; $('pm-visor-x').focus(); }
    function cerrarVisor() { visor.hidden = true; $('pm-visor-img').src = ''; }
    $('pm-visor-x').addEventListener('click', cerrarVisor);
    $('pm-visor-img').addEventListener('click', () => { if (vI < vLista.length - 1) { vI++; pintarVisor(); } else cerrarVisor(); });
    visor.addEventListener('click', e => { if (e.target === visor) cerrarVisor(); });

    // ── Validación (solo con Completada; solo con permiso) ──
    const valOps = Array.from(document.querySelectorAll('.pm-val-op'));
    function pintarValidacion() {
        const s = semanaSel(); if (!s) return;
        const completada = det.estado === 'completada', puede = det.data.puede_validar;
        if (!completada && det.validacion === 'validado') det.validacion = 'por_validar';
        const card = $('pm-val');
        card.dataset.v = det.validacion;
        card.classList.toggle('bloq', !completada);
        valOps.forEach(b => {
            b.setAttribute('aria-checked', b.dataset.val === det.validacion ? 'true' : 'false');
            b.setAttribute('aria-disabled', (!completada || !puede) ? 'true' : 'false');
        });
        $('pm-val-hint').textContent = !completada ? td('valHintNo') : (puede ? td('valHintSi') : td('valHintSolo'));
        $('pm-val-validado').hidden = det.validacion !== 'validado';
        $('pm-val-rechazo').hidden = det.validacion !== 'rechazado';
        $('pm-val-fecha').textContent = (s.validado_en && s.validacion === 'validado') ? s.validado_en : td('hoyF', { f: fmtCorta(hoyIso()) });
        pintarReset();
    }
    valOps.forEach(b => b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        det.validacion = b.dataset.val; marcarSucio();
        error('pm-err-valpor', ''); error('pm-err-motivo', '');
        pintarValidacion();
    }));
    function pintarReset() {
        const s = semanaSel(); if (!s) return;
        const cambia = det.estado !== (s.estado || '') || fechaHidden.value !== (s.fecha_ejecucion || '') || det.fotos.some(f => f.file) || det.quitadas.length > 0;
        $('pm-val-reset').hidden = !(s.validacion === 'validado' && det.validacion === 'validado' && cambia);
    }

    // ── Guardar ──
    function validar() {
        let primero = null;
        const falla = (id, msg) => { error(id, msg); primero = primero || $(id); };
        ['pm-err-estado', 'pm-err-reag', 'pm-err-canc', 'pm-err-resp', 'pm-err-fecha', 'pm-err-valpor', 'pm-err-motivo', 'pm-err-fotos', 'pm-err-general'].forEach(id => error(id, ''));
        if (!det.estado) falla('pm-err-estado', td('elegirEstado'));
        if (!det.resp) falla('pm-err-resp', td('errResp'));
        if (!det.resp) falla('pm-err-resp', (det.data.permisos.editar_plan || det.data.permisos.validar) ? td('errResp') : td('pedirResp'));
        if (fechaHidden.value > hoyIso()) falla('pm-err-fecha', td('fechaFutura'));
        if (det.estado === 'cancelada' && !$('pm-reg-canc').value.trim()) falla('pm-err-canc', td('errCanc'));
        if (det.estado === 'reagendada') {
            const s = parseInt($('pm-reag-sem').value, 10), a = parseInt($('pm-reag-anio').value, 10);
            if (!(s >= 1 && s <= 53) || !(a >= 2000)) falla('pm-err-reag', td('errReag'));
        }
        if (det.validacion === 'validado' && !det.valPor) falla('pm-err-valpor', td('errValPor'));
        if (det.validacion === 'rechazado' && det.data.puede_validar && !$('pm-val-motivo').value.trim()) falla('pm-err-motivo', td('errMotivo'));
        if (primero) { primero.scrollIntoView({ block: 'center', behavior: 'smooth' }); return false; }
        return true;
    }
    function siguientePendiente(desde) {
        const abierta = s => ['', 'pendiente', 'reagendada'].indexOf(s.estado) !== -1;
        const sem = det.data.semanas, i = sem.findIndex(s => s.semana === desde);
        const h = sem.slice(i + 1).find(abierta) || sem.slice(0, Math.max(i, 0)).find(abierta);
        return h ? h.semana : desde;
    }
    $('pm-det-guardar').addEventListener('click', async () => {
        const s = semanaSel();
        if (!s || det.guardando || !validar()) return;
        const btn = $('pm-det-guardar'), txt = btn.textContent;
        det.guardando = true; btn.disabled = true; btn.textContent = td('guardando');
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', csrf);
        fd.append('estado', det.estado);
        fd.append('responsable', det.resp);
        fd.append('fecha_ejecucion', fechaHidden.value);
        fd.append('observaciones', txtObs.value.trim());
        fd.append('motivo_cancelacion', $('pm-reg-canc').value.trim());
        fd.append('reagendada_semana', $('pm-reag-sem').value);
        fd.append('reagendada_anio', $('pm-reag-anio').value);
        fd.append('validacion', det.validacion);
        fd.append('validado_por', det.valPor);
        fd.append('motivo_rechazo', $('pm-val-motivo').value.trim());
        det.quitadas.forEach(id => fd.append('fotos_quitar', id));
        const etq = {}; det.fotos.filter(f => f.id).forEach(f => { etq[f.id] = f.etiqueta; });
        fd.append('fotos_etiquetas', JSON.stringify(etq));
        det.fotos.filter(f => f.file).forEach(f => { fd.append('fotos', f.file, f.file.name); fd.append('fotos_etiquetas_nuevas', f.etiqueta); });
        try {
            const r = await fetch(`/mto/equipos/${det.pk}/registro/${s.semana}/${det.data.anio}/`, { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: fd, credentials: 'same-origin' });
            if (r.ok) {
                det.sucio = false; det.huboCambio = true;
                mostrarToast(t('registroGuardado', { n: s.semana }));
                cargarDetalle(siguientePendiente(s.semana), false);
                return;
            }
            let datos = {};
            try { datos = await r.json(); } catch (e) { /* no JSON */ }
            const mapa = { estado: 'pm-err-estado', responsable: 'pm-err-resp', fecha_ejecucion: 'pm-err-fecha', motivo_cancelacion: 'pm-err-canc', reagendada_semana: 'pm-err-reag',
                           validado_por: 'pm-err-valpor', motivo_rechazo: 'pm-err-motivo', fotos: 'pm-err-fotos' };
            const errs = datos.errores || {};
            Object.keys(errs).forEach(k => error(mapa[k] || 'pm-err-general', errs[k]));
            if (!Object.keys(errs).length) error('pm-err-general', t('errorGuardar'));
        } catch (e) {
            error('pm-err-general', t('errorGuardar'));
        }
        det.guardando = false; btn.disabled = false; btn.textContent = txt;
    });

    // ── Eliminar registro de la semana ──
    let okEliminar = null;
    function pedirEliminar(titulo, texto, alAceptar, event) {
        $('pm-er-titulo').textContent = titulo; $('pm-er-texto').textContent = texto; okEliminar = alAceptar;
        abrirHoja('pm-sheet-elimreg', event);
    }
    $('pm-er-ok').addEventListener('click', () => { const f = okEliminar; okEliminar = null; cerrarHoja('pm-sheet-elimreg', false); if (f) f(); });
    $('pm-btn-elim-reg').addEventListener('click', e => {
        const s = semanaSel(); if (!s) return;
        pedirEliminar(td('eliminarRegistro'), td('elimRegTexto', { n: s.semana }), () => {
            fetch(`/mto/equipos/${det.pk}/registro/${s.semana}/${det.data.anio}/eliminar/`, { method: 'POST', headers: { 'X-CSRFToken': csrf }, credentials: 'same-origin' })
                .then(r => { if (!r.ok) throw new Error(); det.sucio = false; det.huboCambio = true; mostrarToast(td('registroEliminado', { n: s.semana })); cargarDetalle(s.semana, false); })
                .catch(() => mostrarToast(t('errorGuardar')));
        }, e);
    });

    // ── Seguimientos: nuevo / editar ──
    const sf = { modo: 'nuevo', id: '', registroPk: '', resp: '', estatus: 'pendiente', creadoIso: '', fechaOriginal: '', sucio: false, guardando: false, orden: '', fotos: [], quitadas: [] };

    // Imágenes del seguimiento: "Tomar foto" abre la cámara y "Subir imagen" la galería (se comprimen a 1600 px).
    function pintarSegFotos() {
        const caja = $('pm-seg-imgs');
        const items = sf.fotos.map((f, i) => {
            const d = document.createElement('div'); d.className = 'pm-foto';
            const im = document.createElement('button'); im.type = 'button'; im.className = 'img';
            im.setAttribute('aria-label', td('verFoto', { n: i + 1 }));
            im.style.backgroundImage = 'url("' + f.url + '")';
            im.addEventListener('click', () => abrirVisor(sf.fotos, null, i));
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.setAttribute('aria-label', td('quitarFoto'));
            rm.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
            rm.addEventListener('click', () => { if (f.id) sf.quitadas.push(f.id); sf.fotos.splice(i, 1); sf.sucio = true; pintarSegFotos(); });
            d.append(im, rm);
            return d;
        });
        while (items.length < MAX_FOTOS) { const v = document.createElement('div'); v.className = 'pm-foto-libre'; v.setAttribute('aria-hidden', 'true'); items.push(v); }
        caja.replaceChildren(...items);
        $('pm-seg-cnt-imgs').textContent = sf.fotos.length + ' / ' + MAX_FOTOS;
        $('pm-seg-tomar').disabled = $('pm-seg-galeria').disabled = sf.fotos.length >= MAX_FOTOS;
    }
    async function agregarSegArchivos(lst) {
        error('pm-seg-err-fotos', '');
        for (const f of Array.from(lst)) {
            if (sf.fotos.length >= MAX_FOTOS) { error('pm-seg-err-fotos', td('maxFotosSeg')); break; }
            if (!f.type.startsWith('image/')) { error('pm-seg-err-fotos', td('soloImagenes')); continue; }
            const blob = await comprimir(f);                    // las fotos del celular salen como JPEG
            if (!blob || blob.size > MAX_BYTES) { error('pm-seg-err-fotos', td('soloImagenes')); continue; }
            const nombre = (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
            sf.fotos.push({ url: URL.createObjectURL(blob), etiqueta: '', file: new File([blob], nombre, { type: 'image/jpeg' }) });
            sf.sucio = true;
        }
        pintarSegFotos();
    }
    $('pm-seg-tomar').addEventListener('click', () => $('pm-seg-file-cam').click());
    $('pm-seg-galeria').addEventListener('click', () => $('pm-seg-file').click());
    ['pm-seg-file-cam', 'pm-seg-file'].forEach(id => $(id).addEventListener('change', e => { agregarSegArchivos(e.target.files); e.target.value = ''; }));
    const segCampos = { problema: $('pm-seg-problema'), accion: $('pm-seg-accion'), notas: $('pm-seg-notas') };
    function actualizarDar() {
        const s = semanaSel();
        const ok = !!s && s.estado === 'completada';
        $('pm-btn-dar').setAttribute('aria-disabled', ok ? 'false' : 'true');
        $('pm-btn-dar').hidden = !det.data.permisos.llenar_seg;
    }
    $('pm-btn-dar').addEventListener('click', e => {
        const s = semanaSel();
        if (!s || s.estado !== 'completada') { mostrarToast(td('darNoDisponible')); return; }
        abrirSeg(null, s, e);
    });

    function pintarSegResp() { const b = $('pm-seg-btn-resp'); const tx = b.querySelector('.pm-sel-txt'), av = b.querySelector('.pm-av');
        av.hidden = !sf.resp; av.textContent = sf.resp ? iniciales(sf.resp) : ''; tx.textContent = sf.resp || td('elegirResp'); b.classList.toggle('vacio', !sf.resp); }
    function pintarSegFecha() {
        const iso = segFechaHidden.value, tag = $('pm-seg-fecha-sem');
        tag.className = 'pm-fecha-sem'; tag.textContent = '';
        error('pm-seg-err-fecha', '');
        if (!iso) return;
        const hoy = hoyIso(), w = 'S' + semanaDeIso(iso);
        if (iso === hoy && sf.estatus !== 'completado') { tag.textContent = w + ' · ' + td('venceHoy'); tag.classList.add('hoy'); }
        else if (iso < hoy && sf.estatus !== 'completado') { tag.textContent = w + ' · ' + td('vencida'); tag.classList.add('venc'); }
        else tag.textContent = w;
        const minima = (sf.modo === 'editar' && sf.creadoIso) ? sf.creadoIso : hoy;
        if (iso < minima && iso !== sf.fechaOriginal) error('pm-seg-err-fecha', td('fechaAnterior', { f: fmtCorta(minima) }));
    }
    segFechaHidden.addEventListener('change', () => { pintarSegFecha(); sf.sucio = true; });
    document.querySelectorAll('#pm-seg-atajos button').forEach(b => b.addEventListener('click', () => {
        const v = { hoy: hoyIso(), 7: sumarDias(7), 14: sumarDias(14), fin: finDeMes() }[b.dataset.atajo];
        segFechaHidden.value = v; segFechaHidden.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    function fijarSegEstatus(v) {
        sf.estatus = v;
        document.querySelectorAll('#pm-seg-estatus button').forEach(b => b.setAttribute('aria-checked', b.dataset.estado === v ? 'true' : 'false'));
        pintarSegFecha();
    }
    document.querySelectorAll('#pm-seg-estatus button').forEach(b => b.addEventListener('click', () => { fijarSegEstatus(b.dataset.estado); sf.sucio = true; }));
    Object.values(segCampos).forEach(el => el.addEventListener('input', () => { sf.sucio = true; ['problema', 'accion'].forEach(k => { if (segCampos[k].value.trim()) error('pm-seg-err-' + k, ''); }); }));
    $('pm-seg-btn-resp').addEventListener('click', e => abrirPicker(td('responsable'), sf.resp, p => { sf.resp = p.nombre; pintarSegResp(); sf.sucio = true; error('pm-seg-err-resp', ''); }, e, sf.resp));

    function abrirSeg(seg, semanaCtx, event) {
        const s = semanaCtx || det.data.semanas.find(x => x.semana === seg.semana) || semanaSel();
        const editar = !!seg;
        Object.assign(sf, { modo: editar ? 'editar' : 'nuevo', id: editar ? seg.id : '', registroPk: editar ? seg.registro_pk : s.registro_pk,
                            creadoIso: editar ? seg.creado_iso : '', fechaOriginal: editar ? seg.fecha : '', sucio: false, orden: editar ? seg.orden : '' });
        $('pm-seg-titulo').textContent = editar ? td('segEditar') + ' ' + seg.orden : td('segNuevo');
        $('pm-seg-sub').textContent = editar ? td('segSubEditar', { f: seg.creado, u: seg.creado_por || '—' }) : td('segSubNuevo');
        $('pm-seg-cod').textContent = det.data.plan.codigo;
        $('pm-seg-nom').textContent = det.data.plan.actividad;
        $('pm-seg-sem').textContent = 'S' + s.semana + ' · ' + rangoSemana(s);
        segCampos.problema.value = editar ? seg.problema : ''; segCampos.accion.value = editar ? seg.accion : ''; segCampos.notas.value = editar ? seg.notas : '';
        const per = persona(s.responsable_id);
        sf.resp = editar ? (seg.responsable || '') : (per ? per.nombre : '');
        pintarSegResp();
        fijarSegEstatus(editar ? seg.estatus : 'pendiente');
        segFechaHidden.value = editar ? seg.fecha : ''; segFechaHidden.dispatchEvent(new Event('change', { bubbles: true }));
        ['problema', 'accion', 'resp', 'fecha', 'general'].forEach(k => error('pm-seg-err-' + k, ''));
        sf.fotos = []; sf.quitadas = [];
        error('pm-seg-err-fotos', '');
        pintarSegFotos();
        if (editar && seg.n_imgs) {
            fetch(`/mto/seguimiento/ot/${seg.id}/imagenes/`, { credentials: 'same-origin' }).then(r => r.json()).then(d => {
                if (sf.id !== seg.id || sf.fotos.length) return;
                sf.fotos = (d.imagenes || []).map(i => ({ id: i.id, url: i.url, etiqueta: '' }));
                pintarSegFotos();
            }).catch(() => { /* sin fotos */ });
        }
        $('pm-seg-eliminar').hidden = !editar || !det.data.permisos.eliminar_seg;
        $('pm-seg-elim-txt').textContent = td('eliminar') + ' ' + (editar ? seg.orden : '');
        $('pm-seg-guardar').textContent = editar ? td('segGuardar') : td('segCrear');
        abrirHoja('pm-seg', event);
        setTimeout(() => { sf.sucio = false; }, 0);
    }
    function cerrarSeg() { cerrarHoja('pm-seg'); }
    function pedirCerrarSeg() {
        if (!sf.sucio) { cerrarSeg(); return; }
        accionPendiente = cerrarSeg;
        abrirHoja('pm-sheet-salir', null);
        setTimeout(() => $('pm-salir-seguir').focus(), 50);
    }
    $('pm-seg-x').addEventListener('click', pedirCerrarSeg);
    $('pm-seg-cancelar').addEventListener('click', pedirCerrarSeg);

    $('pm-seg-guardar').addEventListener('click', async () => {
        if (sf.guardando) return;
        ['problema', 'accion', 'resp', 'fecha', 'general'].forEach(k => error('pm-seg-err-' + k, ''));
        let primero = null;
        const falla = (k, msg, el) => { error('pm-seg-err-' + k, msg); primero = primero || el; };
        if (!segCampos.problema.value.trim()) falla('problema', td('errProblema'), segCampos.problema);
        if (!sf.resp) falla('resp', td('errResp'), $('pm-seg-btn-resp'));
        const minima = (sf.modo === 'editar' && sf.creadoIso) ? sf.creadoIso : hoyIso();
        if (segFechaHidden.value && segFechaHidden.value < minima && segFechaHidden.value !== sf.fechaOriginal) falla('fecha', td('fechaAnterior', { f: fmtCorta(minima) }), $('pm-seg-fecha-sem'));
        if (primero) { primero.focus(); primero.scrollIntoView({ block: 'center' }); return; }
        const btn = $('pm-seg-guardar'), txt = btn.textContent;
        sf.guardando = true; btn.disabled = true; btn.textContent = td('guardando');
        try {
            const url = sf.modo === 'editar' ? `/mto/seguimiento/editar/${sf.id}/` : `/mto/seguimiento/agregar/${sf.registroPk}/`;
            const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
                body: JSON.stringify({ problema: segCampos.problema.value.trim(), accion: segCampos.accion.value.trim(), responsable: sf.resp,
                                       fecha_compromiso: segFechaHidden.value, estatus: sf.estatus, notas: segCampos.notas.value.trim() }) });
            const d = await r.json();
            if (!d.ok) {
                const errs = d.errores || {};
                Object.keys(errs).forEach(k => error('pm-seg-err-' + (k === 'responsable' ? 'resp' : k), errs[k]));
                if (!Object.keys(errs).length) error('pm-seg-err-general', d.error || t('errorGuardar'));
                return;
            }
            // Imágenes: quitar las marcadas y subir las nuevas al seguimiento ya guardado.
            let falloFotos = false;
            for (const idImg of sf.quitadas) {
                try { await fetch(`/mto/seguimiento/imagen/eliminar/${idImg}/`, { method: 'POST', headers: { 'X-CSRFToken': csrf }, credentials: 'same-origin' }); } catch (e) { falloFotos = true; }
            }
            const nuevas = sf.fotos.filter(f => f.file);
            if (nuevas.length) {
                const fd = new FormData();
                nuevas.forEach(f => fd.append('imagenes', f.file, f.file.name));
                try {
                    const ru = await fetch(`/mto/seguimiento/ot/${d.id}/imagenes/subir/`, { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: fd, credentials: 'same-origin' });
                    if (!ru.ok) falloFotos = true;
                } catch (e) { falloFotos = true; }
            }
            sf.sucio = false; det.huboCambio = true;
            cerrarHoja('pm-seg', false);
            mostrarToast(falloFotos ? td('errorFotosSeg') : (sf.modo === 'editar' ? td('segGuardado') : td('segCreado', { orden: d.orden })));
            cargarDetalle(det.sel, false, { abrirSeg: true, resaltar: d.id });
        } catch (e) {
            error('pm-seg-err-general', t('errorGuardar'));
        } finally { sf.guardando = false; btn.disabled = false; btn.textContent = txt; }
    });
    $('pm-seg-eliminar').addEventListener('click', e => {
        pedirEliminar(td('segEliminar'), td('segElimTexto', { orden: sf.orden }), () => {
            fetch(`/mto/seguimiento/eliminar/${sf.id}/`, { method: 'POST', headers: { 'X-CSRFToken': csrf }, credentials: 'same-origin' })
                .then(r => r.json()).then(d => { if (!d.ok) throw new Error(); sf.sucio = false; det.huboCambio = true; cerrarHoja('pm-seg', false);
                    mostrarToast(td('segEliminado', { orden: sf.orden })); cargarDetalle(det.sel, false, { abrirSeg: true }); })
                .catch(() => mostrarToast(t('errorGuardar')));
        }, e);
    });

    // ── Cerrar el detalle (✕, Cancelar, fondo, Escape), con confirmación si hay cambios ──
    function cerrarDetalle() {
        cerrarHoja('pm-detalle');
        if (det.huboCambio) window.location.reload();   // actualiza tarjeta, avance y conteos
    }
    function pedirCerrarDetalle() { conConfirmacion(cerrarDetalle); }
    window.pmCerrarDetalle = pedirCerrarDetalle;
    window.pmCierres = window.pmCierres || {};
    window.pmCierres['pm-detalle'] = pedirCerrarDetalle;
    window.pmCierres['pm-seg'] = pedirCerrarSeg;

    let accionPendiente = null;
    function conConfirmacion(accion) {
        if (!det.sucio) { accion(); return; }
        accionPendiente = accion;
        abrirHoja('pm-sheet-salir', null);
        setTimeout(() => $('pm-salir-seguir').focus(), 50);
    }
    window.pmSalirSeguir = () => { accionPendiente = null; cerrarHoja('pm-sheet-salir'); };
    window.pmSalirDescartar = () => {
        const a = accionPendiente;
        accionPendiente = null;
        det.sucio = false;
        cerrarHoja('pm-sheet-salir', false);
        if (a) a();
    };

    // "⋯" del detalle: idioma. Cambiarlo recarga la página, así que con un
    // registro sin guardar pasa primero por "¿Salir sin guardar?".
    window.pmAbrirTarea = e => abrirHoja('pm-sheet-tarea', e);
    const formIdioma = document.querySelector('#pm-sheet-tarea form');
    if (formIdioma) {
        formIdioma.addEventListener('submit', e => {
            if (!det.sucio) return;
            e.preventDefault();
            const boton = e.submitter;
            cerrarHoja('pm-sheet-tarea', false);
            conConfirmacion(() => formIdioma.requestSubmit(boton));
        });
    }

    // Se espera a DOMContentLoaded: abrirModalConAnimacion (base_menu.html) se
    // define después de los scripts de la página.
    if (abrirPk) {
        document.addEventListener('DOMContentLoaded', () => {
            const card = lista.querySelector(`.pm-card[data-pk="${abrirPk}"]`);
            if (card) abrirDetalle(card, null, true);
        });
    }

})();
