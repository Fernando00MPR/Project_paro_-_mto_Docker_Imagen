/* seguimientos_movil.js — Vista de celular (≤767px) de Seguimientos de OTs.
   Guarda con los mismos endpoints que escritorio (constantes de la plantilla:
   CSRF_SM, AREA_ID_SM, URL_SM_ADD, URL_SM_EDIT, URL_OT_EDIT, URL_SM_DEL,
   URL_OT_DEL) y abre las fotos con el visor de escritorio (verImagenesSeg,
   de lista_seguimientos.js). Las tarjetas traen solo data-*; pintarCard()
   dibuja su contenido, así las nuevas y las editadas salen iguales. */

(function () {
    const raiz = document.getElementById('sg-movil');
    if (!raiz) return;

    const CFG = window.SEG_MOVIL || {};
    const T = CFG.i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const esMovil = () => window.matchMedia('(max-width: 1023px)').matches;
    let responsables = [];
    try { responsables = JSON.parse(document.getElementById('sg-responsables').textContent) || []; } catch (e) { /* sin datos */ }

    // ── Fechas (siempre 'AAAA-MM-DD' locales) ───────────────────────────────
    const pad = n => String(n).padStart(2, '0');
    const aIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const dmy = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
    const hoyIso = CFG.hoy || aIso(new Date());
    const masDias = n => { const d = deIso(hoyIso); d.setDate(d.getDate() + n); return aIso(d); };
    // Semana ISO 'S{n}/{año}' de una fecha 'AAAA-MM-DD' (misma regla que el servidor).
    function semanaIso(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        const f = new Date(Date.UTC(y, m - 1, d));
        f.setUTCDate(f.getUTCDate() + 4 - (f.getUTCDay() || 7));
        const ini = new Date(Date.UTC(f.getUTCFullYear(), 0, 1));
        return `S${Math.ceil(((f - ini) / 86400000 + 1) / 7)}/${f.getUTCFullYear()}`;
    }
    const diasVencido = (fecha, estatus) =>
        (fecha && fecha < hoyIso && estatus !== 'completado') ? Math.round((deIso(hoyIso) - deIso(fecha)) / 86400000) : 0;

    function iniciales(nombre) {
        const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
        return (p[0][0] + (p.length >= 4 ? p[2] : p[1])[0]).toUpperCase();
    }
    const normalizar = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const aviso = (msg, tipo) => { if (typeof showToast === 'function') showToast(msg, tipo); };
    // Detalle de un error: el motivo que mandó el servidor o, sin él (red, código HTTP), "Revisa tu conexión".
    const motivo = e => (e && e.message && !/^\d+$/.test(e.message)) ? e.message : window.TXT_REVISA_CONEXION;

    // ── Navegación con filtros (misma lógica de servidor que escritorio) ────
    function urlCon(cambios) {
        const url = new URL(window.location.href);
        Object.keys(cambios).forEach(k => {
            if (cambios[k]) url.searchParams.set(k, cambios[k]); else url.searchParams.delete(k);
        });
        url.searchParams.delete('page');
        return url;
    }
    const irCon = cambios => { window.location.href = urlCon(cambios).toString(); };

    const buscar = document.getElementById('sg-buscar');
    let tBuscar = null;
    buscar.addEventListener('input', () => {
        clearTimeout(tBuscar);
        tBuscar = setTimeout(() => {
            try { sessionStorage.setItem('sg-buscando', '1'); } catch (e) { /* sin storage */ }
            irCon({ q: buscar.value.trim() });
        }, 250);
    });
    // Tras recargar por la búsqueda, el cursor vuelve al campo para seguir escribiendo.
    try {
        if (sessionStorage.getItem('sg-buscando') === '1' && esMovil()) {
            sessionStorage.removeItem('sg-buscando');
            buscar.focus();
            const n = buscar.value.length;
            buscar.setSelectionRange(n, n);
        }
    } catch (e) { /* sin storage */ }

    raiz.querySelectorAll('.sg-chips button').forEach(b => {
        b.addEventListener('click', () => irCon({ estatus: b.dataset.estatus }));
    });
    const chipActivo = raiz.querySelector('.sg-chips [aria-pressed="true"]');
    if (chipActivo) chipActivo.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    // ── Hojas inferiores ────────────────────────────────────────────────────
    let trap = null, disparador = null, hojaAbierta = null;

    function abrirHoja(id, event) {
        if (hojaAbierta) cerrarHoja(hojaAbierta, false);
        const modal = document.getElementById(id);
        disparador = (event && event.currentTarget) || document.activeElement;
        abrirModalConAnimacion(modal, event);
        hojaAbierta = id;
        const box = modal.querySelector('.modal-box');
        trap = function (e) {
            if (e.key === 'Escape') { cerrarHoja(id); return; }
            if (e.key !== 'Tab') return;
            const f = Array.from(box.querySelectorAll('button, a[href], input, textarea'))
                .filter(el => !el.disabled && el.offsetParent !== null);
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        };
        document.addEventListener('keydown', trap);
    }

    function cerrarHoja(id, devolverFoco = true) {
        if (hojaAbierta !== id) return;
        cerrarModalConAnimacion(id);
        hojaAbierta = null;
        if (trap) document.removeEventListener('keydown', trap);
        trap = null;
        if (devolverFoco && disparador && document.body.contains(disparador)) disparador.focus();
        disparador = null;
    }

    // Tocar fuera cierra (en las confirmaciones equivale a la opción segura: nunca descarta).
    document.querySelectorAll('.sg-hoja').forEach(hoja => {
        hoja.addEventListener('click', e => { if (e.target === hoja) cerrarHoja(hoja.id); });
    });
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) {
            e.target.style.animation = 'none';
        }
    });

    // ── Tarjetas ────────────────────────────────────────────────────────────
    const lista = document.getElementById('sg-lista');
    const vacio = document.getElementById('sg-vacio');
    const SVG_OK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
    const SVG_RELOJ = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    const SVG_FOTO = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>';

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto !== undefined) e.textContent = texto;
        return e;
    }

    function pintarCard(card) {
        const d = card.dataset;
        const f1 = el('div', 'sg-fila');
        f1.append(el('span', 'sg-folio', d.orden),
                  el('span', 'sg-tag ' + d.tipo, d.tipo === 'ot' ? t('ot') : t('correctivo')),
                  el('span', 'sg-est ' + d.estatus, t(d.estatus)));

        const f2 = el('div', 'sg-fila');
        const av = el('span', 'sg-avatar', d.responsable ? iniciales(d.responsable) : '?');
        av.setAttribute('aria-hidden', 'true');
        f2.append(av, el('span', 'sg-resp' + (d.responsable ? '' : ' vacio'), d.responsable || t('sinResp')));

        const fechas = el('div', 'sg-fechas');
        const dias = diasVencido(d.fecha, d.estatus);
        const comp = el('div', dias ? 'vencido' : (d.fecha ? '' : 'sin-fecha'));
        comp.append(el('small', '', t('compromiso')),
                    el('b', '', !d.fecha ? t('sinFecha') : dias ? t('vencido', { fecha: dmy(d.fecha), n: dias }) : dmy(d.fecha)));
        const cre = el('div');
        cre.append(el('small', '', t('creado')), el('b', '', d.creado));
        fechas.append(comp, cre);

        const partes = [f1, f2, fechas];
        const detalle = el('dl', 'sg-detalle');
        [['lblProblema', d.problema, 'prob'], ['lblAccion', d.accion, 'acc'], ['lblNotas', d.notas, 'nota']].forEach(([k, v, c]) => {
            if (!v) return;
            const fila = el('div', c);
            fila.append(el('dt', '', t(k)), el('dd', '', v));
            detalle.append(fila);
        });

        if (detalle.childNodes.length) partes.push(detalle);

        const pie = el('div', 'sg-pie-card');
        const ok = d.validado === '1';
        const val = el(CFG.puedeValidar ? 'button' : 'span', 'sg-val' + (ok ? ' ok' : ''));
        if (CFG.puedeValidar) val.type = 'button';
        if (CFG.puedeValidar && !ok && d.estatus !== 'completado') { val.setAttribute('aria-disabled', 'true'); val.classList.add('bloq'); }
        val.innerHTML = ok ? SVG_OK : SVG_RELOJ;
        val.append(ok ? t('validado') : t('porValidar'));
        pie.append(val);

        if (+d.nimg > 0) {
            const foto = el('button', 'sg-foto');
            foto.type = 'button';
            foto.setAttribute('aria-label', t('verFotos'));
            foto.innerHTML = SVG_FOTO;
            foto.append(+d.nimg === 1 ? t('unaFoto') : t('nFotos', { n: d.nimg }));
            pie.append(foto);
        }
        const der = el('span', 'sg-pie-der');
        if (d.semana) der.append(el('span', 'sg-sem', d.semana));
        if (d.codigo) der.append(el('span', 'sg-plan', t('plan', { codigo: d.codigo })));
        if (der.childNodes.length) pie.append(der);
        partes.push(pie);

        card.replaceChildren(...partes);
        if (CFG.puedeEditar) {
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.setAttribute('aria-label', t('abrirSeg', { orden: d.orden }));
        }
    }
    lista.querySelectorAll('.sg-card').forEach(pintarCard);

    lista.addEventListener('click', e => {
        const card = e.target.closest('.sg-card');
        if (!card) return;
        const chipVal = e.target.closest('.sg-val');
        if (chipVal && chipVal.tagName === 'BUTTON') {
            e.stopPropagation();
            if (chipVal.getAttribute('aria-disabled') === 'true') { aviso({ title: t('soloCompletadoTit'), description: t('soloCompletado') }, 'warning'); return; }
            chipVal.disabled = true;
            fetch('/mto/seguimiento/validar-manual/' + card.dataset.id + '/', { method: 'POST', headers: { 'X-CSRFToken': CSRF_SM } })
                .then(r => r.json())
                .then(data => {
                    if (!data.ok) { aviso({ title: t('errorValidar'), description: data.error || window.TXT_REVISA_CONEXION }, 'error'); return; }
                    card.dataset.validado = data.validado ? '1' : '0';
                    chipVal.classList.toggle('ok', !!data.validado);
                    chipVal.innerHTML = data.validado ? SVG_OK : SVG_RELOJ;
                    chipVal.append(data.validado ? t('validado') : t('porValidar'));
                })
                .catch(() => {})
                .finally(() => {
                    const bloq = card.dataset.validado !== '1' && card.dataset.estatus !== 'completado';
                    chipVal.disabled = false;
                    chipVal.setAttribute('aria-disabled', bloq ? 'true' : 'false');
                    chipVal.classList.toggle('bloq', bloq);
                });
            return;
        }
        if (e.target.closest('.sg-foto')) {
            const d = card.dataset;
            verImagenesSeg(e, d.tipo, d.id, d.creado, d.area, d.estatus, t(d.estatus));
            return;
        }
        if (CFG.puedeEditar) abrirForm('editar', card, e);
    });
    lista.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('sg-card') && CFG.puedeEditar) {
            e.preventDefault();
            abrirForm('editar', e.target, { currentTarget: e.target });
        }
    });

    // Conteos de chips y subtítulo tras crear / editar estatus / eliminar.
    const subtitulo = document.getElementById('sg-subtitulo');
    function ajustarConteo(estatus, delta, total) {
        const sumar = sel => {
            const s = raiz.querySelector(`.sg-chips [data-conteo="${sel}"]`);
            if (s) s.textContent = Math.max(0, (+s.textContent || 0) + delta);
        };
        sumar(estatus);
        if (!total) return;
        sumar('');
        const n = Math.max(0, (+subtitulo.dataset.n || 0) + delta);
        subtitulo.dataset.n = n;
        subtitulo.textContent = (CFG.areaNombre ? CFG.areaNombre + ' · ' : '') + (n === 1 ? t('unSeg') : t('nSeg', { n }));
        vacio.hidden = !!lista.querySelector('.sg-card');
    }

    // ── Cargar más ──────────────────────────────────────────────────────────
    const btnMas = document.getElementById('sg-cargar-mas');
    if (btnMas) {
        const etiquetar = () => {
            const n = Math.min(+btnMas.dataset.perPage, +btnMas.dataset.total - +btnMas.dataset.fin);
            btnMas.textContent = t('cargarN', { n });
        };
        etiquetar();
        btnMas.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('page', btnMas.dataset.next);
            btnMas.disabled = true;
            fetch(url.toString())
                .then(r => r.text())
                .then(html => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    doc.querySelectorAll('#sg-lista .sg-card').forEach(c => {
                        if (lista.querySelector(`.sg-card[data-tipo="${c.dataset.tipo}"][data-id="${c.dataset.id}"]`)) return;
                        const nueva = document.importNode(c, true);
                        lista.appendChild(nueva);
                        pintarCard(nueva);
                    });
                    const sig = doc.getElementById('sg-cargar-mas');
                    if (sig) {
                        btnMas.dataset.next = sig.dataset.next;
                        btnMas.dataset.fin = sig.dataset.fin;
                        etiquetar();
                        btnMas.disabled = false;
                    } else {
                        btnMas.remove();
                    }
                })
                .catch(() => { btnMas.disabled = false; aviso({ title: t('errorCargarTit'), description: window.TXT_REVISA_CONEXION }, 'error'); });
        });
    }

    // ── Hoja de filtros ─────────────────────────────────────────────────────
    const fl = {
        desde: document.getElementById('sgfl-desde'),
        hasta: document.getElementById('sgfl-hasta'),
        vencidos: document.getElementById('sgfl-vencidos'),
        problema: document.getElementById('sgfl-problema'),
        accion: document.getElementById('sgfl-accion'),
        ver: document.getElementById('sgfl-ver'),
    };
    const segFiltro = nombre => document.querySelector(`#sg-sheet-filtros .sg-seg[data-filtro="${nombre}"]`);
    const valorSeg = nombre => (segFiltro(nombre).querySelector('[aria-pressed="true"]') || {}).dataset?.v || '';
    function fijarSeg(nombre, v) {
        segFiltro(nombre).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    }
    function valoresFiltro() {
        return {
            validado: valorSeg('validado'),
            fecha_desde: fl.desde.value,
            fecha_hasta: fl.hasta.value,
            vencidos: fl.vencidos.getAttribute('aria-checked') === 'true' ? '1' : '',
            problema: fl.problema.value.trim(),
            accion: fl.accion.value.trim(),
        };
    }
    function pintarRangos() {
        const inicioMes = hoyIso.slice(0, 8) + '01';
        const r = { mes: [inicioMes, hoyIso], 90: [masDias(-90), hoyIso] };
        document.querySelectorAll('#sg-sheet-filtros [data-rango]').forEach(b => {
            const [a, z] = r[b.dataset.rango];
            b.setAttribute('aria-pressed', fl.desde.value === a && fl.hasta.value === z ? 'true' : 'false');
        });
    }
    let tConteo = null, pedido = 0;
    function contar() {
        pintarRangos();
        clearTimeout(tConteo);
        tConteo = setTimeout(() => {
            const url = urlCon(valoresFiltro());
            url.searchParams.set('conteo', '1');
            const mio = ++pedido;
            fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(r => r.json())
                .then(data => {
                    if (mio !== pedido) return;
                    const n = +data.n || 0;
                    fl.ver.textContent = n === 0 ? t('sinResultados') : n === 1 ? t('verUno') : t('verN', { n });
                })
                .catch(() => {});
        }, 300);
    }

    window.sgAbrirFiltros = function (e) {
        const p = new URL(window.location.href).searchParams;
        fijarSeg('validado', p.get('validado') || '');
        fl.desde.value = p.get('fecha_desde') || '';
        fl.hasta.value = p.get('fecha_hasta') || '';
        fl.vencidos.setAttribute('aria-checked', p.get('vencidos') === '1' ? 'true' : 'false');
        fl.problema.value = p.get('problema') || '';
        fl.accion.value = p.get('accion') || '';
        contar();
        abrirHoja('sg-sheet-filtros', e);
    };
    document.querySelectorAll('#sg-sheet-filtros .sg-seg').forEach(seg => {
        seg.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (b) { fijarSeg(seg.dataset.filtro, b.dataset.v); contar(); }
        });
    });
    document.querySelectorAll('#sg-sheet-filtros [data-rango]').forEach(b => {
        b.addEventListener('click', () => {
            fl.desde.value = b.dataset.rango === 'mes' ? hoyIso.slice(0, 8) + '01' : masDias(-90);
            fl.hasta.value = hoyIso;
            contar();
        });
    });
    fl.vencidos.addEventListener('click', () => {
        fl.vencidos.setAttribute('aria-checked', fl.vencidos.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
        contar();
    });
    [fl.desde, fl.hasta, fl.problema, fl.accion].forEach(i => i.addEventListener('input', contar));
    window.sgLimpiarFiltros = function () {
        fijarSeg('validado', '');
        fl.desde.value = fl.hasta.value = fl.problema.value = fl.accion.value = '';
        fl.vencidos.setAttribute('aria-checked', 'false');
        contar();
    };
    window.sgAplicarFiltros = function () {
        cerrarHoja('sg-sheet-filtros', false);
        irCon(valoresFiltro());
    };

    // ── Formulario a pantalla completa (nuevo / editar) ─────────────────────
    const form = document.getElementById('sg-form');
    const f = {
        titulo: document.getElementById('sg-form-titulo'),
        sub: document.getElementById('sg-form-sub'),
        mas: document.getElementById('sg-form-mas'),
        problema: document.getElementById('sgf-problema'),
        error: document.getElementById('sgf-problema-error'),
        accion: document.getElementById('sgf-accion'),
        resp: document.getElementById('sgf-resp'),
        respTxt: document.getElementById('sgf-resp-txt'),
        fecha: document.getElementById('sgf-fecha'),
        fechaTxt: document.getElementById('sgf-fecha-txt'),
        notas: document.getElementById('sgf-notas'),
        imgs: document.getElementById('sgf-imgs'),
        imgN: document.getElementById('sgf-img-n'),
        guardar: document.getElementById('sg-form-guardar'),
    };
    const MAX_IMG = 4;
    // modo, card (en edición), estatus, responsable, fotos guardadas / a borrar / nuevas, foto inicial del estado
    let st = null;
    let disparadorForm = null, ignorarPop = false;

    const formAbierto = () => !form.hidden;
    const valores = () => JSON.stringify([f.problema.value.trim(), f.accion.value.trim(), st.responsable,
        f.fecha.value, st.estatus, f.notas.value.trim(), st.borrar.length, st.nuevas.length]);
    const haySinGuardar = () => st && valores() !== st.inicial;

    function pintarResp() {
        f.respTxt.textContent = st.responsable || t('elegirResp');
        f.resp.classList.toggle('lleno', !!st.responsable);
    }
    function pintarFecha() {
        f.fechaTxt.textContent = f.fecha.value ? dmy(f.fecha.value) : t('fechaVacia');
        f.fechaTxt.parentElement.classList.toggle('lleno', !!f.fecha.value);
    }
    function pintarEstatus() {
        form.querySelectorAll('.sg-estatus button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === st.estatus ? 'true' : 'false'));
    }

    function pintarImagenes() {
        const guardadas = st.existentes.filter(im => !st.borrar.includes(im.id));
        const total = guardadas.length + st.nuevas.length;
        f.imgN.textContent = t('nDe4', { n: total });
        const celdas = [];
        const miniatura = (url, quitar) => {
            const c = el('div', 'sg-img');
            const img = el('img'); img.src = url; img.alt = '';
            const x = el('button'); x.type = 'button';
            x.setAttribute('aria-label', t('quitarImg'));
            x.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
            x.addEventListener('click', () => { quitar(); pintarImagenes(); });
            c.append(img, x);
            return c;
        };
        guardadas.forEach(im => celdas.push(miniatura(im.url, () => st.borrar.push(im.id))));
        st.nuevas.forEach(n => celdas.push(miniatura(n.url, () => {
            URL.revokeObjectURL(n.url);
            st.nuevas.splice(st.nuevas.indexOf(n), 1);
        })));
        if (total < MAX_IMG) {
            const boton = (etiqueta, aria, icono, attrs) => {
                const l = el('label', 'sg-img-btn');
                l.innerHTML = icono;
                const inp = el('input');
                inp.type = 'file';
                inp.accept = 'image/*';
                Object.keys(attrs).forEach(k => inp.setAttribute(k, attrs[k]));
                inp.setAttribute('aria-label', aria);
                inp.addEventListener('change', () => agregarFotos(inp));
                l.append(inp, etiqueta);
                return l;
            };
            celdas.push(boton(t('camara'), t('tomarFoto'),
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
                { capture: 'environment' }));
            celdas.push(boton(t('galeria'), t('elegirGaleria'),
                '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/></svg>',
                { multiple: '' }));
        }
        while (celdas.length % 4) {
            const libre = el('div', 'sg-img-libre');
            libre.setAttribute('aria-hidden', 'true');
            celdas.push(libre);
        }
        f.imgs.replaceChildren(...celdas);
    }

    // Comprime antes de subir: lado mayor ~1600px, JPEG al 80% (como la Bitácora).
    function comprimir(file) {
        return new Promise(resolve => {
            if (!file.type.startsWith('image/')) { resolve(file); return; }
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const lado = Math.max(img.naturalWidth, img.naturalHeight);
                const k = lado > 1600 ? 1600 / lado : 1;
                const c = document.createElement('canvas');
                c.width = Math.round(img.naturalWidth * k);
                c.height = Math.round(img.naturalHeight * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                c.toBlob(blob => {
                    if (!blob || blob.size >= file.size) { resolve(file); return; }
                    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                    resolve(new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.8);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };   // p. ej. HEIC: se sube tal cual
            img.src = url;
        });
    }

    async function agregarFotos(input) {
        const archivos = Array.from(input.files || []).filter(a => a.type.startsWith('image/'));
        input.value = '';
        if (!archivos.length) return;
        const libres = MAX_IMG - (st.existentes.length - st.borrar.length) - st.nuevas.length;
        if (archivos.length > libres) aviso({ title: t('limiteFotos'), description: t('maxImg') }, 'warning');
        const listos = await Promise.all(archivos.slice(0, Math.max(libres, 0)).map(comprimir));
        listos.forEach(file => st.nuevas.push({ file, url: URL.createObjectURL(file) }));
        pintarImagenes();
    }

    function abrirForm(modo, card, event) {
        const d = card ? card.dataset : {};
        st = {
            modo, card,
            estatus: d.estatus || 'pendiente',
            responsable: d.responsable || '',
            existentes: [], borrar: [], nuevas: [],
        };
        f.titulo.textContent = modo === 'editar' ? t('editar') : t('nuevo');
        f.sub.textContent = modo === 'editar' ? t('subEditar', { orden: d.orden }) : t('subNuevo');
        f.mas.hidden = modo !== 'editar';
        f.problema.value = d.problema || '';
        f.accion.value = d.accion || '';
        f.fecha.value = d.fecha || '';
        f.notas.value = d.notas || '';
        f.problema.removeAttribute('aria-invalid');
        f.error.hidden = true;
        f.guardar.disabled = false;
        f.guardar.textContent = form.dataset.textoGuardar || (form.dataset.textoGuardar = f.guardar.textContent);
        pintarResp(); pintarFecha(); pintarEstatus(); pintarImagenes();
        st.inicial = valores();

        if (modo === 'editar' && +d.nimg > 0) {
            fetch(`/mto/seguimiento/${d.tipo}/${d.id}/imagenes/`)
                .then(r => r.json())
                .then(data => { if (st && st.card === card) { st.existentes = data.imagenes || []; pintarImagenes(); } })
                .catch(() => {});
        }

        disparadorForm = (event && event.currentTarget) || document.activeElement;
        form.hidden = false;
        form.querySelector('.sg-form-cuerpo').scrollTop = 0;
        document.body.style.overflow = 'hidden';
        history.pushState({ sgForm: true }, '');
        setTimeout(() => (modo === 'nuevo' ? f.problema : document.getElementById('sg-form-cerrar')).focus(), 50);
    }
    window.sgNuevo = e => abrirForm('nuevo', null, e);

    // Llegada desde Backlog (?abrir=<id>): abre el formulario de ese correctivo.
    (function abrirDesdeUrl() {
        if (!window.matchMedia('(max-width: 1023px)').matches) return;    // en escritorio lo atiende seguimientos_escritorio.js
        const url = new URL(window.location.href);
        const id = url.searchParams.get('abrir');
        if (!id) return;
        url.searchParams.delete('abrir');                 // para que recargar no lo reabra
        history.replaceState(null, '', url);
        // Se espera a DOMContentLoaded: abrirModalConAnimacion (base_menu.html) se define después de los scripts de la página.
        document.addEventListener('DOMContentLoaded', () => {
            const card = lista.querySelector(`.sg-card[data-id="${id}"]`);
            if (card && CFG.puedeEditar) abrirForm('editar', card, null);
        });
    })();

    function cerrarForm(desdeAtras) {
        if (!formAbierto()) return;
        form.hidden = true;
        document.body.style.overflow = '';
        st.nuevas.forEach(n => URL.revokeObjectURL(n.url));
        st = null;
        if (!desdeAtras && history.state && history.state.sgForm) { ignorarPop = true; history.back(); }
        if (disparadorForm && document.body.contains(disparadorForm)) disparadorForm.focus();
        disparadorForm = null;
    }

    function intentarSalir(event) {
        if (haySinGuardar()) abrirSalir(event);
        else cerrarForm();
    }
    function abrirSalir(event) {
        const p = st.modo === 'editar' ? 'salirEditar' : 'salirNuevo';
        document.getElementById('sg-salir-titulo').textContent = t(p + 'Titulo');
        document.getElementById('sg-salir-texto').textContent = t(p + 'Texto');
        document.getElementById('sg-salir-seguir').textContent = t(p + 'Seguir');
        document.getElementById('sg-salir-descartar').textContent = t(p + 'Descartar');
        abrirHoja('sg-sheet-salir', event && event.currentTarget ? event : { currentTarget: document.getElementById('sg-form-cerrar') });
        setTimeout(() => document.getElementById('sg-salir-seguir').focus(), 50);   // la opción segura primero
    }
    document.getElementById('sg-salir-seguir').addEventListener('click', () => cerrarHoja('sg-sheet-salir'));
    document.getElementById('sg-salir-descartar').addEventListener('click', () => {
        cerrarHoja('sg-sheet-salir', false);
        cerrarForm();
    });

    document.getElementById('sg-form-cerrar').addEventListener('click', intentarSalir);
    document.getElementById('sg-form-cancelar').addEventListener('click', intentarSalir);

    // "Atrás" del teléfono: con cambios pide confirmación y se queda en el formulario.
    window.addEventListener('popstate', () => {
        if (ignorarPop) { ignorarPop = false; return; }
        if (!formAbierto()) return;
        if (hojaAbierta) cerrarHoja(hojaAbierta, false);
        if (haySinGuardar()) {
            history.pushState({ sgForm: true }, '');
            abrirSalir(null);
        } else {
            cerrarForm(true);
        }
    });

    // Escape y Tab dentro del formulario (las hojas abiertas encima manejan los suyos).
    document.addEventListener('keydown', e => {
        if (!formAbierto() || hojaAbierta) return;
        if (e.key === 'Escape') { e.preventDefault(); intentarSalir(); return; }
        if (e.key !== 'Tab') return;
        const focos = Array.from(form.querySelectorAll('button, input, textarea'))
            .filter(x => !x.disabled && x.offsetParent !== null);
        if (!focos.length) return;
        if (e.shiftKey && document.activeElement === focos[0]) { e.preventDefault(); focos[focos.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === focos[focos.length - 1]) { e.preventDefault(); focos[0].focus(); }
    });

    f.problema.addEventListener('input', () => {
        if (f.problema.value.trim()) { f.problema.removeAttribute('aria-invalid'); f.error.hidden = true; }
    });
    // Abrir el selector nativo al tocar cualquier parte del campo (no solo el ícono).
    f.fecha.addEventListener('click', () => {
        if (typeof f.fecha.showPicker === 'function') {
            try { f.fecha.showPicker(); } catch (e) { /* ya abierto o no permitido */ }
        }
    });
    f.fecha.addEventListener('change', pintarFecha);
    f.fecha.addEventListener('input', pintarFecha);
    form.querySelectorAll('.sg-atajos [data-atajo]').forEach(b => {
        b.addEventListener('click', () => {
            if (b.dataset.atajo === 'fin') {
                const d = deIso(hoyIso);
                f.fecha.value = aIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
            } else {
                f.fecha.value = masDias(+b.dataset.atajo);
            }
            pintarFecha();
        });
    });
    form.querySelector('.sg-estatus').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) { st.estatus = b.dataset.v; pintarEstatus(); }
    });

    // ── Hoja: elegir responsable ────────────────────────────────────────────
    const personas = document.getElementById('sg-personas');
    const buscarPersona = document.getElementById('sg-personas-buscar');
    f.resp.addEventListener('click', e => {
        const nombres = responsables.map(r => r.nombre);
        // Si el nombre guardado no está en el catálogo (texto libre de antes), se ofrece igual.
        if (st.responsable && !nombres.includes(st.responsable)) nombres.unshift(st.responsable);
        personas.replaceChildren();
        nombres.map(n => ({ nombre: n })).concat([{ nombre: '', ninguno: true }]).forEach(p => {
            const b = el('button', 'sg-persona' + (p.ninguno ? ' ninguno' : ''));
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', p.nombre === st.responsable ? 'true' : 'false');
            b.dataset.busqueda = normalizar(p.nombre);
            const av = el('span', 'sg-avatar', p.ninguno ? '—' : iniciales(p.nombre));
            av.setAttribute('aria-hidden', 'true');
            b.append(av, el('b', '', p.ninguno ? t('sinAsignar') : p.nombre), el('span', 'sg-radio'));
            b.addEventListener('click', () => {
                st.responsable = p.nombre;
                pintarResp();
                cerrarHoja('sg-sheet-personas');
            });
            personas.appendChild(b);
        });
        buscarPersona.value = '';
        abrirHoja('sg-sheet-personas', e);
        const actual = personas.querySelector('[aria-checked="true"]');
        if (actual) actual.scrollIntoView({ block: 'nearest' });
    });
    buscarPersona.addEventListener('input', () => {
        const q = normalizar(buscarPersona.value.trim());
        personas.querySelectorAll('.sg-persona').forEach(b => {
            b.hidden = !!q && !b.classList.contains('ninguno') && !b.dataset.busqueda.includes(q);
        });
    });

    // ── Guardar ─────────────────────────────────────────────────────────────
    const postJson = (url, body) => fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_SM },
        body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json().then(data => { if (!r.ok || !data.ok) throw new Error(data.error || r.status); return data; }));

    f.guardar.addEventListener('click', async () => {
        const problema = f.problema.value.trim();
        if (!problema) {
            f.problema.setAttribute('aria-invalid', 'true');
            f.error.hidden = false;
            f.problema.scrollIntoView({ block: 'center', behavior: 'smooth' });
            f.problema.focus();
            return;
        }
        const { modo, card } = st;
        const d = card ? card.dataset : null;
        const url = modo === 'nuevo' ? URL_SM_ADD
                  : d.tipo === 'ot'  ? `${URL_OT_EDIT}${d.id}/` : `${URL_SM_EDIT}${d.id}/`;
        const datos = {
            problema,
            accion: f.accion.value.trim(),
            responsable: st.responsable,
            fecha_compromiso: f.fecha.value,
            estatus: st.estatus,
            notas: f.notas.value.trim(),
            area_id: AREA_ID_SM || null,
        };
        f.guardar.disabled = true;
        f.guardar.innerHTML = '<span class="sg-spinner" aria-hidden="true"></span>';
        f.guardar.append(t('guardando'));
        try {
            const res = await postJson(url, datos);
            const tipo = modo === 'nuevo' ? 'manual' : d.tipo;
            const id = modo === 'nuevo' ? res.id : d.id;
            for (const imgId of st.borrar) {
                await postJson(`/mto/seguimiento/imagen/eliminar/${imgId}/`);
            }
            let nimg = st.existentes.length - st.borrar.length;
            if (st.nuevas.length) {
                const fd = new FormData();
                st.nuevas.forEach(n => fd.append('imagenes', n.file));
                const r = await fetch(`/mto/seguimiento/${tipo}/${id}/imagenes/subir/`, {
                    method: 'POST', headers: { 'X-CSRFToken': CSRF_SM }, body: fd,
                }).then(x => x.json());
                nimg = r.total !== undefined ? r.total : nimg + st.nuevas.length;
            } else if (modo === 'editar' && !st.existentes.length) {
                nimg = +d.nimg;   // aún no cargaban las guardadas: no cambió nada
            }

            let c = card;
            if (modo === 'nuevo') {
                c = el('article', 'sg-card');
                Object.assign(c.dataset, {
                    // fecha_creacion del endpoint viene en UTC; la de la lista es la local (= hoy).
                    tipo: 'manual', id: res.id, orden: res.no_orden, codigo: '', creado: dmy(hoyIso),
                    validado: '0', area: CFG.areaNombre || '',
                });
                lista.prepend(c);
            } else if (d.estatus !== st.estatus) {
                ajustarConteo(d.estatus, -1, false);
                ajustarConteo(st.estatus, +1, false);
            }
            Object.assign(c.dataset, {
                problema: datos.problema, accion: datos.accion, responsable: datos.responsable,
                fecha: datos.fecha_compromiso, estatus: datos.estatus, notas: datos.notas, nimg: String(nimg),
            });
            // Correctivos: la semana sigue al compromiso (o a la creación si no tiene fecha).
            if (c.dataset.tipo === 'manual') {
                const cre = c.dataset.creado.split('/').reverse().join('-');
                c.dataset.semana = semanaIso(datos.fecha_compromiso || cre);
            }
            pintarCard(c);
            if (modo === 'nuevo') ajustarConteo(st.estatus, +1, true);
            disparadorForm = c;
            cerrarForm();
            aviso(t('guardado'), 'success');
            if (modo === 'nuevo') window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            f.guardar.disabled = false;
            f.guardar.textContent = form.dataset.textoGuardar;
            aviso({ title: t('errorGuardarTit'), description: motivo(err) }, 'error');
        }
    });

    // ── ⋯ de edición: validar / eliminar ────────────────────────────────────
    const btnValidar = document.getElementById('sg-mas-validar');
    f.mas.addEventListener('click', e => {
        const d = st.card.dataset;
        document.getElementById('sg-mas-titulo').textContent = d.orden;
        
        if (btnValidar) {
            document.getElementById('sg-mas-validar-txt').textContent = d.validado === '1' ? t('quitarValidado') : t('marcarValidado');
            btnValidar.setAttribute('aria-disabled', d.validado !== '1' && d.estatus !== 'completado' ? 'true' : 'false');
        }
        abrirHoja('sg-sheet-mas', e);
    });

    if (btnValidar) btnValidar.addEventListener('click', () => {
        const card = st.card, d = card.dataset;
        if (btnValidar.getAttribute('aria-disabled') === 'true') { aviso({ title: t('soloCompletadoTit'), description: t('soloCompletado') }, 'warning'); return; }
        const url = d.tipo === 'ot' ? `/mto/seguimiento/validar-ot/${d.id}/` : `/mto/seguimiento/validar-manual/${d.id}/`;
        btnValidar.disabled = true;
        postJson(url)
            .then(data => {
                d.validado = data.validado ? '1' : '0';
                pintarCard(card);
                cerrarHoja('sg-sheet-mas');
                aviso(data.validado ? t('validado') : t('porValidar'), 'success');
            })
            .catch(e => aviso({ title: t('errorValidar'), description: motivo(e) }, 'error'))
            .finally(() => { btnValidar.disabled = false; });
    });

    const btnEliminar = document.getElementById('sg-mas-eliminar');
    if (btnEliminar) {
        btnEliminar.addEventListener('click', () => {
            cerrarHoja('sg-sheet-mas', false);
            abrirHoja('sg-sheet-eliminar', { currentTarget: f.mas });
            setTimeout(() => document.getElementById('sg-elim-cancelar').focus(), 50);
        });
        document.getElementById('sg-elim-cancelar').addEventListener('click', () => cerrarHoja('sg-sheet-eliminar'));
        const ok = document.getElementById('sg-elim-ok');
        ok.addEventListener('click', () => {
            const card = st.card, d = card.dataset;
            ok.disabled = true;
            postJson(d.tipo === 'ot' ? `${URL_OT_DEL}${d.id}/` : `${URL_SM_DEL}${d.id}/`)
                .then(() => {
                    cerrarHoja('sg-sheet-eliminar', false);
                    disparadorForm = document.querySelector('.sg-fab');
                    cerrarForm();
                    card.remove();
                    ajustarConteo(d.estatus, -1, true);
                    aviso(t('eliminado'), 'success');
                })
                .catch(e => aviso({ title: t('errorEliminarTit'), description: motivo(e) }, 'error'))
                .finally(() => { ok.disabled = false; });
        });
    }
})();

// Visor de fotos: deslizar a la izquierda / derecha cambia de foto
// (lightboxSegSiguiente/Anterior y lightboxSegImagenes vienen de lista_seguimientos.js).
(function () {
    const img = document.getElementById('lightbox-seg-img-principal');
    const zona = img && img.parentElement;
    if (!zona) return;
    let x0 = null, y0 = 0;
    zona.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    zona.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (lightboxSegImagenes.length > 1 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) lightboxSegSiguiente(); else lightboxSegAnterior();
        }
    });
})();
