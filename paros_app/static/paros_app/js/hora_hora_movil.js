/* hora_hora_movil.js — Vista de celular (≤767px) de Hora x hora.
   Lee el mismo estado que hora_hora.js (DATOS, targetSkid, targetEf,
   SKIDS_POR_HORA, vistaEf) y guarda con su misma función enviarValor(td, valor)
   sobre la celda de escritorio equivalente, así ambos lados quedan iguales.
   La tarjeta de eficiencia maneja los controles de escritorio (setVistaEf,
   #dp-ef-desde/#dp-ef-hasta, #ef-mes-*, #ef-anio-*) y pinta la lista con el
   evento 'hxh:eficiencia' que dispara renderizarEficiencia(). */

(function () {
    const raiz = document.getElementById('hxh-movil');
    if (!raiz) return;

    const C    = window.HORA_HORA_CFG || {};
    const M    = window.HXH_MOVIL || {};
    const T    = M.i18n || {};
    const lang = M.lang || document.documentElement.lang || 'es';

    const aid        = raiz.dataset.areaId;
    const areaNombre = raiz.dataset.areaNombre;
    const anio = C.anio, mes = C.mes;
    const diasMes = new Date(anio, mes, 0).getDate();
    const HORAS = {
        dia:   [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
        noche: [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5],
    };

    const pad = n => String(n).padStart(2, '0');
    const hh  = h => pad(h) + ':00';
    const fmtPct = v => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    const fmtNum = v => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
    function t(clave, vars) {
        let s = T[clave] || clave;
        Object.keys(vars || {}).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
        return s;
    }

    // ── Datos ───────────────────────────────────────────────────────────────
    function vals(turno, d) { return (DATOS[aid] && DATOS[aid][turno] && DATOS[aid][turno][d]) || {}; }
    function valor(turno, d, h) { const v = vals(turno, d)[h]; return v === undefined ? null : v; }
    function meta() { return targetEf[aid] ?? 91; }
    function sumar(o) { return Object.values(o).reduce((s, v) => s + v, 0); }

    function statsTurno(turno, d) {
        const o = vals(turno, d);
        return { total: sumar(o), hrs: Object.keys(o).length };
    }
    function statsDia(d) {
        const a = statsTurno('dia', d), b = statsTurno('noche', d);
        const corridos = a.total + b.total;
        const planeados = (a.hrs + b.hrs) * SKIDS_POR_HORA;
        const ef = planeados > 0 ? Math.round(corridos / planeados * 1000) / 10 : null;
        return { corridos, planeados, ef };
    }

    // Turno en curso: las 00:00–05:00 son del turno de noche del día anterior.
    function turnoEnCurso() {
        const ahora = new Date();
        const h = ahora.getHours();
        const f = new Date(ahora);
        let turno = 'dia';
        if (h >= 18) turno = 'noche';
        else if (h < 6) { turno = 'noche'; f.setDate(f.getDate() - 1); }
        const enMes = f.getFullYear() === anio && f.getMonth() + 1 === mes;
        return { dia: enMes ? f.getDate() : null, turno, hora: h };
    }

    // ── Estado ──────────────────────────────────────────────────────────────
    const enCurso = turnoEnCurso();
    let selDia, selTurno;
    if (enCurso.dia) {
        selDia = enCurso.dia; selTurno = enCurso.turno;
    } else {
        selDia = 1;
        for (let d = diasMes; d >= 1; d--) {
            if (statsDia(d).planeados > 0) { selDia = d; break; }
        }
        selTurno = 'dia';
    }

    // ── Mes ─────────────────────────────────────────────────────────────────
    window.hmCambiarMes = function (delta) {
        let m = mes + delta, a = anio;
        if (m < 1) { m = 12; a--; }
        if (m > 12) { m = 1; a++; }
        const url = new URL(window.location.href);
        url.searchParams.set('mes', m);
        url.searchParams.set('anio', a);
        window.location.href = url.toString();
    };

    // ── Calendario ──────────────────────────────────────────────────────────
    function renderCal() {
        const cal = document.getElementById('hm-cal');
        document.getElementById('hm-meta').textContent = t('meta', { x: fmtNum(meta()) });
        const frag = document.createDocumentFragment();
        const fmtDow = new Intl.DateTimeFormat(lang, { weekday: 'narrow' });
        for (let i = 0; i < 7; i++) {
            const s = document.createElement('span');
            s.className = 'hm-dow';
            s.textContent = fmtDow.format(new Date(2024, 0, 1 + i)); // 1/ene/2024 fue lunes
            frag.appendChild(s);
        }
        const huecos = (new Date(anio, mes - 1, 1).getDay() + 6) % 7;
        for (let i = 0; i < huecos; i++) {
            const s = document.createElement('span');
            s.className = 'hm-dia-vacio';
            frag.appendChild(s);
        }
       // "22 de septiembre" en español; en inglés el mes va con mayúscula.
        const mesTxt = lang.startsWith('es') ? (C.mesNombre || '').toLowerCase() : (C.mesNombre || '');
        const m = meta();
        for (let d = 1; d <= diasMes; d++) {
            const st = statsDia(d);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'hm-dia' + (st.ef === null ? '' : (st.ef >= m ? ' ok' : ' bajo'));
            b.setAttribute('aria-pressed', d === selDia ? 'true' : 'false');
            b.setAttribute('aria-label', st.ef === null
                ? t('ariaDiaSin', { d, mes: mesTxt })
                : t('ariaDia', { d, mes: mesTxt, x: fmtPct(st.ef) }));
            b.innerHTML = '<span class="hm-dia-num"></span><span class="hm-dia-ef"></span>';
            b.firstChild.textContent = d;
            b.lastChild.textContent = st.ef === null ? '' : fmtPct(st.ef);
            b.addEventListener('click', () => {
                selDia = d;
                selTurno = (enCurso.dia === d) ? enCurso.turno : 'dia';
                renderCal(); renderDia();
            });
            frag.appendChild(b);
        }
        cal.replaceChildren(frag);
    }

    // ── Día seleccionado ────────────────────────────────────────────────────
    function fechaLarga(d) {
        const s = new Date(anio, mes - 1, d).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function siguienteHoraVacia() {
        const horas = HORAS[selTurno];
        const vacia = h => valor(selTurno, selDia, h) === null;
        if (enCurso.dia === selDia && enCurso.turno === selTurno) {
            if (vacia(enCurso.hora)) return enCurso.hora;
            const idx = horas.indexOf(enCurso.hora);
            const antes = horas.slice(0, idx).find(vacia);
            if (antes !== undefined) return antes;
        }
        const h = horas.find(vacia);
        return h === undefined ? null : h;
    }

    function renderDia() {
        const st = statsDia(selDia);
        document.getElementById('hm-fecha').textContent = fechaLarga(selDia);
        const chip = document.getElementById('hm-chip-ef');
        chip.className = 'hm-chip-ef ' + (st.ef === null ? 'nada' : (st.ef >= meta() ? 'ok' : 'bajo'));
        chip.textContent = st.ef === null ? '—' : fmtPct(st.ef);
        document.getElementById('hm-corr').textContent = st.planeados ? st.corridos : '—';
        document.getElementById('hm-plan').textContent = st.planeados ? st.planeados : '—';

        document.querySelectorAll('#hm-turnos button').forEach(b => {
            const turno = b.dataset.turno;
            b.setAttribute('aria-selected', turno === selTurno ? 'true' : 'false');
            b.querySelector('.hm-t1').textContent =
                (turno === 'dia' ? t('turnoDia') : t('turnoNoche')) + ' · ' + statsTurno(turno, selDia).total;
        });

        const horas = HORAS[selTurno];
        const tS = targetSkid[aid];
        const valsTurno = horas.map(h => valor(selTurno, selDia, h)).filter(v => v !== null);
        const base = (tS && tS > 0) ? tS : Math.max(1, ...valsTurno);
        const ul = document.getElementById('hm-horas');
        const frag = document.createDocumentFragment();
        horas.forEach(h => {
            const v = valor(selTurno, selDia, h);
            const li = document.createElement('li');
            li.innerHTML =
                '<button type="button" class="hm-hora">' +
                '<span class="hm-hora-t"></span>' +
                '<span class="hm-barra"><i></i></span>' +
                '<span class="hm-hora-v"></span>' +
                '<svg class="hm-lapiz" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>' +
                '</button>';
            const btn = li.firstChild;
            btn.setAttribute('aria-label', t('capturarHora', { hora: hh(h) }));
            btn.querySelector('.hm-hora-t').textContent = hh(h);
            const barra = btn.querySelector('.hm-barra i');
            const txt = btn.querySelector('.hm-hora-v');
            if (v === null) {
                barra.style.width = '0%';
                txt.textContent = t('capturar');
                txt.classList.add('vacio');
            } else {
                barra.style.width = Math.min(100, v / base * 100) + '%';
                if (v === 0) { barra.classList.add('cero'); txt.classList.add('cero'); }
                txt.textContent = v;
            }
            btn.addEventListener('click', e => abrirCaptura(h, e));
            frag.appendChild(li);
        });
        ul.replaceChildren(frag);

        const stT = statsTurno(selTurno, selDia);
        document.getElementById('hm-pie-label').textContent = selTurno === 'dia' ? t('totalTurnoDia') : t('totalTurnoNoche');
        document.getElementById('hm-pie-hrs').textContent = t('hrs') + ' ' + (stT.hrs ? stT.hrs * 60 : '—');
        document.getElementById('hm-pie-total').textContent = stT.hrs ? stT.total : '—';

        const fab = document.getElementById('hm-fab');
        const sig = siguienteHoraVacia();
        fab.hidden = sig === null;
        if (sig !== null) {
            fab.dataset.hora = sig;
            document.getElementById('hm-fab-txt').textContent = t('capturarHora', { hora: hh(sig) });
        }
    }

    document.querySelectorAll('#hm-turnos button').forEach(b => {
        b.addEventListener('click', () => { selTurno = b.dataset.turno; renderDia(); });
    });
    document.getElementById('hm-fab').addEventListener('click', e => {
        abrirCaptura(parseInt(e.currentTarget.dataset.hora, 10), e);
    });

    function renderTodo() { renderCal(); renderDia(); }

    // ── Hojas inferiores ────────────────────────────────────────────────────
    let trap = null, disparador = null, hojaAbierta = null;

    function focos(box) {
        return Array.from(box.querySelectorAll('button, a[href], input, select'))
            .filter(el => !el.hidden && !el.disabled && el.offsetParent !== null);
    }

    function abrirHoja(id, event) {
        if (hojaAbierta === id) return;
        const modal = document.getElementById(id);
        disparador = (event && event.currentTarget) || document.activeElement;
        abrirModalConAnimacion(modal, event);
        hojaAbierta = id;
        const box = modal.querySelector('.modal-box');
        trap = function (e) {
            if (e.key === 'Escape') { cerrarHoja(id); return; }
            if (e.key !== 'Tab') return;
            const f = focos(box);
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        };
        document.addEventListener('keydown', trap);
    }

    function cerrarHoja(id) {
        if (hojaAbierta !== id) return;
        cerrarModalConAnimacion(id);
        hojaAbierta = null;
        if (trap) document.removeEventListener('keydown', trap);
        trap = null;
        if (disparador && document.body.contains(disparador)) disparador.focus();
        disparador = null;
    }

    document.querySelectorAll('.hm-hoja').forEach(hoja => {
        hoja.addEventListener('click', e => { if (e.target === hoja) cerrarHoja(hoja.id); });

        // Deslizar hacia abajo desde el asa / encabezado para cerrar.
        const box = hoja.querySelector('.modal-box');
        let y0 = null, dy = 0;
        hoja.querySelectorAll('.hm-asa, .hc-head, .hr-titulo').forEach(zona => {
            zona.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; box.style.transition = 'none'; }, { passive: true });
            zona.addEventListener('touchmove', e => {
                if (y0 === null) return;
                dy = Math.max(0, e.touches[0].clientY - y0);
                box.style.transform = 'translateY(' + dy + 'px)';
            }, { passive: true });
            zona.addEventListener('touchend', () => {
                if (y0 === null) return;
                y0 = null;
                if (dy > 80) {
                    box.style.transition = 'transform 160ms ease-out';
                    box.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                        cerrarHoja(hoja.id);
                        setTimeout(() => { box.style.transform = ''; box.style.transition = ''; }, 150);
                    }, 160);
                } else {
                    box.style.transition = 'transform 160ms ease-out';
                    box.style.transform = '';
                    setTimeout(() => { box.style.transition = ''; }, 170);
                }
            });
        });
    });

    // No dejar pegado el transform final de la animación (igual que en Paros).
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) {
            e.target.style.animation = 'none';
        }
    });

    // ── Hoja de captura ─────────────────────────────────────────────────────
    let cap = null;   // { turno, hora }
    const input = document.getElementById('hc-input');

    function celda(turno, h) {
        return document.querySelector(
            `.celda-hora[data-area="${aid}"][data-dia="${selDia}"][data-hora="${h}"][data-turno="${turno}"]`);
    }

    function pintarCaptura() {
        const horas = HORAS[cap.turno];
        const idx = horas.indexOf(cap.hora);
        const actual = valor(cap.turno, selDia, cap.hora);
        document.getElementById('hc-contexto').textContent =
            areaNombre + ' · ' + (cap.turno === 'dia' ? t('turnoDeDia') : t('turnoDeNoche'));
        document.getElementById('hc-titulo').textContent = fechaLarga(selDia);
        document.getElementById('hc-hora').textContent = hh(cap.hora);
        document.getElementById('hc-rango').textContent = hh(cap.hora) + ' – ' + pad(cap.hora) + ':59';
        document.getElementById('hc-prev').disabled = idx <= 0;
        document.getElementById('hc-next').disabled = idx >= horas.length - 1;
        input.value = actual === null ? '' : actual;

        const prev = idx > 0 ? valor(cap.turno, selDia, horas[idx - 1]) : null;
        const bPrev = document.getElementById('hc-at-prev');
        bPrev.hidden = prev === null;
        if (prev !== null) { bPrev.textContent = t('atajoPrev', { n: prev }); bPrev.dataset.v = prev; }
        const tS = targetSkid[aid];
        const bT = document.getElementById('hc-at-target');
        bT.hidden = tS === null || tS === undefined;
        if (!bT.hidden) { bT.textContent = t('atajoTarget', { n: tS }); bT.dataset.v = tS; }

        const sig = horas[idx + 1];
        document.getElementById('hc-seguir-txt').textContent =
            sig === undefined ? t('guardarCerrar') : t('guardarSeguir', { hora: hh(sig) });
        document.getElementById('hc-borrar').hidden = actual === null;
        totalVivo();
        setTimeout(() => { input.focus(); input.select(); }, 60);
    }

    function totalVivo() {
        let total = 0;
        HORAS[cap.turno].forEach(h => {
            if (h === cap.hora) return;
            const v = valor(cap.turno, selDia, h);
            if (v !== null) total += v;
        });
        const v = parseInt(input.value, 10);
        if (!isNaN(v)) total += v;
        document.getElementById('hc-total').textContent = total;
    }

    function abrirCaptura(h, event) {
        cap = { turno: selTurno, hora: h };
        pintarCaptura();
        abrirHoja('hm-sheet-captura', event);
    }

    window.hmCerrarCaptura = () => cerrarHoja('hm-sheet-captura');

    window.hmMoverHora = function (dir) {
        const horas = HORAS[cap.turno];
        const idx = horas.indexOf(cap.hora) + dir;
        if (idx < 0 || idx >= horas.length) return;
        cap.hora = horas[idx];
        pintarCaptura();
    };

    input.addEventListener('input', () => {
        let s = input.value.replace(/\D/g, '').slice(0, 2);
        input.value = s;
        totalVivo();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); window.hmGuardar(true); } });

    window.hmSumar = function (d) {
        const v = parseInt(input.value, 10);
        input.value = Math.max(0, Math.min(99, (isNaN(v) ? 0 : v) + d));
        totalVivo();
    };
    window.hmAtajo = function (btn) {
        input.value = btn.dataset.v;
        totalVivo();
        input.focus();
    };

    function bloquear(si) {
        ['hc-guardar', 'hc-seguir', 'hc-borrar'].forEach(id => { document.getElementById(id).disabled = si; });
    }

    window.hmGuardar = function (seguir) {
        if (!cap) return;
        const horas = HORAS[cap.turno];
        const sig = horas[horas.indexOf(cap.hora) + 1];
        const avanzar = () => {
            if (seguir && sig !== undefined) { cap.hora = sig; pintarCaptura(); }
            else cerrarHoja('hm-sheet-captura');
        };
        const v = input.value.trim();
        const actual = valor(cap.turno, selDia, cap.hora);
        if (v === '' || parseInt(v, 10) === actual) { avanzar(); return; }   // nada que guardar
        const td = celda(cap.turno, cap.hora);
        if (!td) return;
        bloquear(true);
        enviarValor(td, v).then(ok => {
            bloquear(false);
            if (!ok) return;        // el input conserva el valor y no se avanza
            renderTodo();
            avanzar();
        });
    };

    window.hmBorrar = function () {
        if (!cap) return;
        const td = celda(cap.turno, cap.hora);
        if (!td) return;
        bloquear(true);
        enviarValor(td, '').then(ok => {
            bloquear(false);
            if (!ok) return;
            renderTodo();
            cerrarHoja('hm-sheet-captura');
        });
    };

    // ── Eficiencia de producción ────────────────────────────────────────────
    const efCard = document.getElementById('hm-ef');
    let efDatos = null, efVista = 'dia', verTodos = false;

    const val = id => (document.getElementById(id) || {}).value;
    const dpVal = id => { const el = document.querySelector('#' + id + ' .dp-value'); return el ? el.value : ''; };
    const isoCorta = iso => { const p = (iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—'; };
    const textoOpcion = id => { const s = document.getElementById(id); return s ? s.options[s.selectedIndex].text : ''; };

    function textoRango() {
        if (efVista === 'dia') return isoCorta(dpVal('dp-ef-desde')) + ' – ' + isoCorta(dpVal('dp-ef-hasta'));
        if (efVista === 'mes') return textoOpcion('ef-mes-desde') + ' – ' + textoOpcion('ef-mes-hasta') + ' ' + val('ef-mes-anio');
        return val('ef-anio-desde') + ' – ' + val('ef-anio-hasta');
    }

    function renderEf() {
        document.querySelectorAll('#hm-vista button').forEach(b =>
            b.setAttribute('aria-pressed', b.dataset.vista === efVista ? 'true' : 'false'));
        document.getElementById('hm-rango-txt').textContent = textoRango();
        if (!efDatos) return;

        const m = meta();
        const conReg = efDatos.filter(d => d.planeados > 0);
        const corr = conReg.reduce((s, d) => s + d.corridos, 0);
        const plan = conReg.reduce((s, d) => s + d.planeados, 0);
        const ef = plan > 0 ? corr / plan * 100 : null;
        const elEf = document.getElementById('hm-ef-pct');
        elEf.textContent = ef === null ? '—' : fmtPct(Math.round(ef * 10) / 10);
        elEf.className = 'hm-kpi-num' + (ef === null ? '' : (ef >= m ? ' ok' : ' bajo'));
        document.getElementById('hm-ef-corr').textContent = plan ? corr : '—';
        document.getElementById('hm-ef-plan').textContent = plan ? plan : '—';

        const metaDe = d => d.target_ef ?? m;
        const k = conReg.filter(d => d.eficiencia !== null && d.eficiencia >= metaDe(d)).length;
        const claveFrase = efVista === 'dia' ? 'fraseDia' : (efVista === 'mes' ? 'fraseMes' : 'fraseAnio');
        document.getElementById('hm-frase').textContent = conReg.length
            ? t(claveFrase, { k, n: conReg.length, x: fmtNum(m) }) : '';
        document.getElementById('hm-periodos-titulo').textContent =
            t(efVista === 'dia' ? 'tituloDia' : (efVista === 'mes' ? 'tituloMes' : 'tituloAnio'));
        document.getElementById('hm-mostrar-todos').textContent = verTodos ? t('soloConRegistro') : t('mostrarTodos');

        const maxEf = Math.max(0, ...conReg.map(d => d.eficiencia || 0));
        const escala = maxEf > 110 ? Math.ceil(maxEf / 10) * 10 : 110;
        document.getElementById('hm-leg-meta').textContent = t('meta', { x: fmtNum(m) });
        document.getElementById('hm-leg-escala').textContent = t('escala', { x: escala });

        const lista = verTodos ? efDatos : conReg;
        const ol = document.getElementById('hm-periodos');
        const frag = document.createDocumentFragment();
        if (!lista.length) {
            const li = document.createElement('li');
            li.className = 'hm-vacio-lista';
            li.textContent = t('sinDatos');
            frag.appendChild(li);
        }
        lista.forEach(d => {
            const tiene = d.planeados > 0 && d.eficiencia !== null;
            const ok = tiene && d.eficiencia >= metaDe(d);
            const li = document.createElement('li');
            if (!tiene) li.className = 'sin';
            li.innerHTML =
                '<div class="hm-per-l1"><span class="hm-per-fecha"></span><span class="hm-per-txt"></span><span class="hm-chip-ef"></span></div>' +
                '<div class="hm-per-barra"><i></i><span class="hm-per-meta"></span></div>';
            li.querySelector('.hm-per-fecha').textContent = d.label;
            li.querySelector('.hm-per-txt').textContent = tiene ? t('deSkid', { c: d.corridos, p: d.planeados }) : '—';
            const chip = li.querySelector('.hm-chip-ef');
            chip.className = 'hm-chip-ef ' + (tiene ? (ok ? 'ok' : 'bajo') : 'nada');
            chip.textContent = tiene ? fmtPct(d.eficiencia) : '—';
            const barra = li.querySelector('.hm-per-barra i');
            barra.className = ok ? 'ok' : 'bajo';
            barra.style.width = tiene ? Math.min(100, d.eficiencia / escala * 100) + '%' : '0%';
            li.querySelector('.hm-per-meta').style.left = Math.min(100, metaDe(d) / escala * 100) + '%';
            frag.appendChild(li);
        });
        ol.replaceChildren(frag);
    }

    document.addEventListener('hxh:eficiencia', e => {
        efDatos = e.detail.datos;
        efVista = e.detail.vista;
        renderEf();
        renderTodo();   // los targets ya están cargados: recolorear calendario y día
    });

    if (efCard) {
        document.querySelectorAll('#hm-vista button').forEach(b => {
            b.addEventListener('click', () => {
                efVista = b.dataset.vista;
                renderEf();
                setVistaEf(efVista);
            });
        });
        document.getElementById('hm-mostrar-todos').addEventListener('click', () => { verTodos = !verTodos; renderEf(); });

        const fijarDp = (id, v) => {
            const el = document.querySelector('#' + id + ' .dp-value');
            if (!el) return;
            el.value = v;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const copiar = (de, a) => { const x = document.getElementById(de), y = document.getElementById(a); if (x && y) y.value = x.value; };

        window.hmAbrirRango = function (event) {
            document.querySelectorAll('#hm-sheet-rango .hr-campos').forEach(g => {
                g.style.display = g.dataset.vista === efVista ? '' : 'none';
            });
            if (efVista === 'dia') {
                fijarDp('dp-hm-desde', dpVal('dp-ef-desde'));
                fijarDp('dp-hm-hasta', dpVal('dp-ef-hasta'));
            } else if (efVista === 'mes') {
                copiar('ef-mes-anio', 'hm-mes-anio'); copiar('ef-mes-desde', 'hm-mes-desde'); copiar('ef-mes-hasta', 'hm-mes-hasta');
            } else {
                copiar('ef-anio-desde', 'hm-anio-desde'); copiar('ef-anio-hasta', 'hm-anio-hasta');
            }
            abrirHoja('hm-sheet-rango', event);
        };

        window.hmAplicarRango = function () {
            if (efVista === 'dia') {
                const d = dpVal('dp-hm-desde'), h = dpVal('dp-hm-hasta');
                const elD = document.querySelector('#dp-ef-desde .dp-value');
                const elH = document.querySelector('#dp-ef-hasta .dp-value');
                // Primero los dos valores, luego los eventos: así limitarRangoEf()
                // de escritorio valida el rango completo (máx. 90 días).
                elD.value = d <= h ? d : h;
                elH.value = d <= h ? h : d;
                elD.dispatchEvent(new Event('change', { bubbles: true }));
                elH.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (efVista === 'mes') {
                copiar('hm-mes-anio', 'ef-mes-anio'); copiar('hm-mes-desde', 'ef-mes-desde'); copiar('hm-mes-hasta', 'ef-mes-hasta');
                cargarEficiencia();
            } else {
                copiar('hm-anio-desde', 'ef-anio-desde'); copiar('hm-anio-hasta', 'ef-anio-hasta');
                cargarEficiencia();
            }
            cerrarHoja('hm-sheet-rango');
            renderEf();
        };
        renderEf();
    }

    renderTodo();
})();
