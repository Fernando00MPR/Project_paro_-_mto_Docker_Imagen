/* bitacora_agv_movil.js — Vista de celular (≤767px) de la Bitácora de AGVs.
   Lee el mismo estado que bitacora_agv.js (DATOS_AGV, targetMensual,
   vistaEfAgv) y guarda con su misma función enviarValorAgv(td, valor,
   comentario) sobre la celda de escritorio equivalente, así ambos lados quedan
   iguales. La tarjeta de cumplimiento maneja los controles de escritorio
   (#ef-interna, setVistaEf, #dp-ef-*, #ef-mes-*, #ef-anio-*) y pinta su lista
   con el evento 'agv:cumplimiento' que dispara renderizarCumplimiento(). */

(function () {
    const raiz = document.getElementById('agv-movil');
    if (!raiz) return;

    const C    = window.AGV_CFG || {};
    const M    = window.AGV_MOVIL || {};
    const T    = M.i18n || {};
    const lang = M.lang || document.documentElement.lang || 'es';
    const puedeEditar = raiz.dataset.puedeEditar === '1';

    const anio = C.anio, mes = C.mes;
    const diasMes = new Date(anio, mes, 0).getDate();
    const TURNOS = ['dia', 'noche'];
    const CLAVE_LS = 'agv-movil-interna';

    const tabs = Array.from(document.querySelectorAll('#am-areas button'));
    const nombres = {};
    tabs.forEach(b => { nombres[b.dataset.interna] = b.dataset.nombre; });

    const pad = n => String(n).padStart(2, '0');
    const ddmm = d => pad(d) + '/' + pad(mes);
    const fmtPct = v => v.toLocaleString(lang, { maximumFractionDigits: 1 }) + '%';
    function t(clave, vars) {
        let s = T[clave] || clave;
        Object.keys(vars || {}).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
        return s;
    }

    // ── Estado ──────────────────────────────────────────────────────────────
    let interna = null;
    try { interna = localStorage.getItem(CLAVE_LS); } catch (e) { interna = null; }
    if (!nombres[interna]) interna = tabs.length ? tabs[0].dataset.interna : null;
    if (!interna) return;

    // El selector de escritorio debe apuntar a la misma área antes de que
    // bitacora_agv.js cargue el cumplimiento en DOMContentLoaded.
    const efInterna = document.getElementById('ef-interna');
    if (efInterna) efInterna.value = interna;

    function reg(turno, d) {
        const r = DATOS_AGV[interna] && DATOS_AGV[interna][turno] && DATOS_AGV[interna][turno][d];
        return r || null;
    }
    function target() { const v = targetMensual[interna]; return (v === null || v === undefined) ? null : v; }
    function clase(turno, v) {
        if (v === null || v === undefined) return '';
        const tg = target();
        if (tg === null) return 'sin-t-' + turno;
        return v >= tg ? 'ok' : 'bajo';
    }

    const hoy = new Date();
    const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() + 1 === mes;

    function diaInicial() {
        if (esMesActual) return hoy.getDate();
        for (let d = diasMes; d >= 1; d--) {
            if (TURNOS.some(tu => reg(tu, d))) return d;
        }
        return 1;
    }
    let selDia = diaInicial();

    // Días pasados del mes (hasta hoy) a los que les falta algún turno.
    function diasSinCaptura() {
        const fin = new Date(anio, mes, 0) < hoy ? diasMes
                  : (esMesActual ? hoy.getDate() : 0);
        const faltan = [];
        for (let d = 1; d <= fin; d++) {
            if (TURNOS.some(tu => !reg(tu, d))) faltan.push(d);
        }
        return faltan;
    }

    // ── Mes ─────────────────────────────────────────────────────────────────
    window.amCambiarMes = function (delta) {
        let m = mes + delta, a = anio;
        if (m < 1) { m = 12; a--; }
        if (m > 12) { m = 1; a++; }
        const url = new URL(window.location.href);
        url.searchParams.set('mes', m);
        url.searchParams.set('anio', a);
        window.location.href = url.toString();
    };

    // ── Pestañas de área ────────────────────────────────────────────────────
    function renderTabs() {
        tabs.forEach(b => {
            const activa = b.dataset.interna === interna;
            b.setAttribute('aria-selected', activa ? 'true' : 'false');
            const tg = targetMensual[b.dataset.interna];
            b.querySelector('.am-a2').textContent = (tg === null || tg === undefined)
                ? t('sinTarget') : t('targetPorTurno', { n: tg });
        });
    }
    tabs.forEach(b => {
        b.addEventListener('click', () => {
            if (b.dataset.interna === interna) return;
            interna = b.dataset.interna;
            try { localStorage.setItem(CLAVE_LS, interna); } catch (e) { /* sin storage */ }
            selDia = diaInicial();
            renderTodo();
            if (efInterna) {
                efInterna.value = interna;
                efDatos = null; renderCump();
                cargarTargetsGrafico().then(() => cargarCumplimiento());
            }
        });
    });

    // ── KPIs + calendario ───────────────────────────────────────────────────
    function renderMes() {
        const tg = target();
        let total = 0, conCaptura = 0, enMeta = 0;
        for (let d = 1; d <= diasMes; d++) {
            TURNOS.forEach(tu => {
                const r = reg(tu, d);
                if (!r) return;
                total += r.cantidad; conCaptura++;
                if (tg !== null && r.cantidad >= tg) enMeta++;
            });
        }
        document.getElementById('am-k-total').textContent = total;
        document.getElementById('am-k-meta').textContent =
            (tg === null || !conCaptura) ? '—' : t('kDeN', { k: enMeta, n: conCaptura });

        const faltan = diasSinCaptura();
        const btnSin = document.getElementById('am-k-sin-btn');
        const elSin = document.getElementById('am-k-sin');
        elSin.textContent = !faltan.length ? '—' : (faltan.length === 1 ? ddmm(faltan[0]) : t('nDias', { n: faltan.length }));
        elSin.classList.toggle('am-sin', faltan.length > 0);
        btnSin.disabled = !faltan.length || !puedeEditar;
        btnSin.dataset.dia = faltan.length ? faltan[faltan.length - 1] : '';

        const cal = document.getElementById('am-cal');
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
        const mesTxt = lang.startsWith('es') ? (C.mesNombre || '').toLowerCase() : (C.mesNombre || '');
        for (let d = 1; d <= diasMes; d++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'am-dia';
            b.setAttribute('aria-pressed', d === selDia ? 'true' : 'false');
            const num = document.createElement('span');
            num.className = 'am-dia-num';
            num.textContent = d;
            b.appendChild(num);
            const partes = [];
            let conNota = false;
            TURNOS.forEach(tu => {
                const r = reg(tu, d);
                const p = document.createElement('span');
                p.className = 'am-pill ' + (r ? clase(tu, r.cantidad) : '');
                p.textContent = r ? r.cantidad : '·';
                b.appendChild(p);
                partes.push((tu === 'dia' ? t('dia') : t('noche')) + ' ' + (r ? r.cantidad : t('sinCaptura')));
                if (r && r.comentario) conNota = true;
            });
            if (conNota) {
                const n = document.createElement('span');
                n.className = 'am-nota';
                b.appendChild(n);
            }
            b.setAttribute('aria-label', t('ariaDia', { d, mes: mesTxt, partes: partes.join(', ') }) + (conNota ? ', ' + t('conNota') : ''));
            b.addEventListener('click', e => {
                selDia = d;
                renderMes();
                if (puedeEditar) abrirCaptura(e);
            });
            frag.appendChild(b);
        }
        cal.replaceChildren(frag);
    }

    document.getElementById('am-k-sin-btn').addEventListener('click', e => {
        const d = parseInt(e.currentTarget.dataset.dia, 10);
        if (!d) return;
        selDia = d;
        renderMes();
        abrirCaptura(e);
    });

    function renderTodo() { renderTabs(); renderMes(); }

    // ── Hojas inferiores (mismo mecanismo que Hora x hora) ──────────────────
    let trap = null, disparador = null, hojaAbierta = null;

    function focos(box) {
        return Array.from(box.querySelectorAll('button, a[href], input, select, textarea'))
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
    window.amCerrarHoja = cerrarHoja;

    document.querySelectorAll('.am-hoja').forEach(hoja => {
        hoja.addEventListener('click', e => { if (e.target === hoja) cerrarHoja(hoja.id); });
        const box = hoja.querySelector('.modal-box');
        let y0 = null, dy = 0;
        hoja.querySelectorAll('.hm-asa, .am-cap-head, .hr-titulo').forEach(zona => {
            zona.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; box.style.transition = 'none'; }, { passive: true });
            zona.addEventListener('touchmove', e => {
                if (y0 === null) return;
                dy = Math.max(0, e.touches[0].clientY - y0);
                box.style.transform = 'translateY(' + dy + 'px)';
            }, { passive: true });
            zona.addEventListener('touchend', () => {
                if (y0 === null) return;
                y0 = null;
                box.style.transition = 'transform 160ms ease-out';
                if (dy > 80) {
                    box.style.transform = 'translateY(100%)';
                    setTimeout(() => {
                        cerrarHoja(hoja.id);
                        setTimeout(() => { box.style.transform = ''; box.style.transition = ''; }, 150);
                    }, 160);
                } else {
                    box.style.transform = '';
                    setTimeout(() => { box.style.transition = ''; }, 170);
                }
            });
        });
    });

    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) {
            e.target.style.animation = 'none';
        }
    });

    window.amAbrirMas = e => abrirHoja('am-sheet-mas', e);
    window.amConfigurarTarget = function (event) {
        cerrarHoja('am-sheet-mas');
        abrirModalTarget(event, interna, nombres[interna]);
    };

    // ── Hoja de captura del día ─────────────────────────────────────────────
    const inputs = {}, notas = {};
    TURNOS.forEach(tu => {
        inputs[tu] = document.getElementById('am-in-' + tu);
        notas[tu] = document.getElementById('am-nota-' + tu);
        if (!inputs[tu]) return;   // sin permiso de edición la hoja de captura no se incluye
        inputs[tu].addEventListener('input', () => {
            let v = inputs[tu].value.replace(/\D/g, '').slice(0, 3);
            if (v !== '' && +v > 100) v = '100';
            inputs[tu].value = v;
            enVivo();
        });
        inputs[tu].addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (tu === 'dia') inputs.noche.focus(); else window.amGuardar(true);
        });
    });

    function fechaLarga(d) {
        const s = new Date(anio, mes - 1, d).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function enVivo() {
        const tg = target();
        let reales = 0, con = 0;
        TURNOS.forEach(tu => {
            const raw = inputs[tu].value;
            const chip = document.getElementById('am-chip-' + tu);
            if (raw === '') {
                chip.className = 'am-chip';
                chip.textContent = tg === null ? '—' : '— / ' + tg;
                return;
            }
            const v = +raw;
            reales += v; con++;
            chip.className = 'am-chip ' + (tg === null ? '' : (v >= tg ? 'ok' : 'bajo'));
            chip.textContent = tg === null ? String(v) : v + ' / ' + tg;
        });
        const cump = document.getElementById('am-cump');
        if (tg === null || !con) { cump.hidden = true; return; }
        const plan = tg * con;
        const pct = Math.round(reales / plan * 1000) / 10;
        cump.hidden = false;
        cump.className = 'am-cump ' + (pct >= 100 ? 'ok' : 'bajo');
        document.getElementById('am-cump-val').textContent = t('realesDe', { r: reales, p: plan }) + ' · ' + fmtPct(pct);
    }

    function pintarCaptura() {
        const tg = target();
        document.getElementById('am-cap-ctx').textContent =
            t('agvsEn', { area: nombres[interna] }) + (tg === null ? '' : ' · ' + t('targetN', { n: tg }));
        document.getElementById('am-cap-fecha').textContent = fechaLarga(selDia);
        document.getElementById('am-cap-prev').disabled = selDia <= 1;
        document.getElementById('am-cap-next').disabled = selDia >= diasMes;
        TURNOS.forEach(tu => {
            const r = reg(tu, selDia);
            inputs[tu].value = r ? r.cantidad : '';
            notas[tu].value = r ? (r.comentario || '') : '';
        });
        document.getElementById('am-seguir-txt').textContent = selDia < diasMes
            ? t('guardarSeguir', { fecha: ddmm(selDia + 1) }) : t('guardarCerrar');
        enVivo();
        const vacio = TURNOS.find(tu => inputs[tu].value === '') || 'dia';
        setTimeout(() => { inputs[vacio].focus(); inputs[vacio].select(); }, 60);
    }

    function abrirCaptura(event) {
        pintarCaptura();
        abrirHoja('am-sheet-captura', event);
    }
    window.amAbrirCapturaHoy = e => { selDia = diaInicial(); renderMes(); abrirCaptura(e); };

    window.amMoverDia = function (dir) {
        const d = selDia + dir;
        if (d < 1 || d > diasMes) return;
        selDia = d;
        renderMes();
        pintarCaptura();
    };

    window.amSumar = function (tu, delta) {
        const v = parseInt(inputs[tu].value, 10);
        inputs[tu].value = Math.max(0, Math.min(100, (isNaN(v) ? 0 : v) + delta));
        enVivo();
    };

    function bloquear(si) {
        ['am-guardar', 'am-seguir'].forEach(id => { document.getElementById(id).disabled = si; });
    }

    window.amGuardar = async function (seguir) {
        const cambios = [];
        TURNOS.forEach(tu => {
            const v = inputs[tu].value.trim();
            const nota = notas[tu].value.trim();
            const r = reg(tu, selDia);
            const cambio = v === '' ? !!r : (!r || +v !== r.cantidad || nota !== (r.comentario || ''));
            if (cambio) cambios.push({ tu, v, nota: v === '' ? '' : nota });
        });
        bloquear(true);
        for (const c of cambios) {
            const td = document.querySelector(
                `.celda-agv[data-interna="${interna}"][data-dia="${selDia}"][data-turno="${c.tu}"]`);
            if (!td) continue;
            const ok = await enviarValorAgv(td, c.v, c.nota);
            if (!ok) { bloquear(false); renderMes(); return; }   // los valores se quedan y no se avanza
        }
        bloquear(false);
        renderMes();
        if (seguir && selDia < diasMes) {
            selDia++;
            renderMes();
            pintarCaptura();
        } else {
            cerrarHoja('am-sheet-captura');
        }
    };

    // ── Cumplimiento ────────────────────────────────────────────────────────
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

    function renderCump() {
        document.querySelectorAll('#am-vista button').forEach(b =>
            b.setAttribute('aria-pressed', b.dataset.vista === efVista ? 'true' : 'false'));
        document.getElementById('am-rango-txt').textContent = textoRango();
        document.getElementById('am-periodos-titulo').textContent =
            t(efVista === 'dia' ? 'tituloDia' : (efVista === 'mes' ? 'tituloMes' : 'tituloAnio'));
        document.getElementById('am-mostrar-todos').textContent = verTodos ? t('soloConRegistro') : t('mostrarTodos');
        const ol = document.getElementById('am-periodos');
        if (!efDatos) { ol.replaceChildren(); return; }

        const conReg = efDatos.filter(d => d.cumplimiento !== null);
        const maxC = Math.max(0, ...conReg.map(d => d.cumplimiento));
        const escala = maxC > 150 ? Math.ceil(maxC / 25) * 25 : 150;
        document.getElementById('am-leg-escala').textContent = t('escala', { x: escala });

        const lista = verTodos ? efDatos : conReg;
        const frag = document.createDocumentFragment();
        if (!lista.length) {
            const li = document.createElement('li');
            li.className = 'hm-vacio-lista';
            li.textContent = t('sinDatos');
            frag.appendChild(li);
        }
        lista.forEach(d => {
            const tiene = d.cumplimiento !== null;
            const ok = tiene && d.cumplimiento >= 100;
            const li = document.createElement('li');
            if (!tiene) li.className = 'sin';
            li.innerHTML =
                '<div class="hm-per-l1"><span class="hm-per-fecha"></span><span class="hm-per-txt"></span><span class="hm-chip-ef"></span></div>' +
                '<div class="hm-per-barra"><i></i><span class="hm-per-meta"></span></div>';
            li.querySelector('.hm-per-fecha').textContent = d.label;
            li.querySelector('.hm-per-txt').textContent = d.target
                ? t('deAgvs', { c: d.cantidad, p: d.target })
                : (d.cantidad ? t('nAgvs', { c: d.cantidad }) : '—');
            const chip = li.querySelector('.hm-chip-ef');
            chip.className = 'hm-chip-ef ' + (tiene ? (ok ? 'ok' : 'bajo') : 'nada');
            chip.textContent = tiene ? fmtPct(d.cumplimiento) : '—';
            const barra = li.querySelector('.hm-per-barra i');
            barra.className = ok ? 'ok' : 'bajo';
            barra.style.width = tiene ? Math.min(100, d.cumplimiento / escala * 100) + '%' : '0%';
            li.querySelector('.hm-per-meta').style.left = (100 / escala * 100) + '%';
            frag.appendChild(li);
        });
        ol.replaceChildren(frag);
    }

    document.addEventListener('agv:cumplimiento', e => {
        if (e.detail.interna !== interna) return;   // respuesta de un área anterior
        efDatos = e.detail.datos;
        efVista = e.detail.vista;
        renderCump();
        renderTodo();   // los targets ya están cargados: recolorear calendario
    });

    if (document.getElementById('am-cump-card')) {
        document.querySelectorAll('#am-vista button').forEach(b => {
            b.addEventListener('click', () => {
                efVista = b.dataset.vista;
                renderCump();
                setVistaEf(efVista);
            });
        });
        document.getElementById('am-mostrar-todos').addEventListener('click', () => { verTodos = !verTodos; renderCump(); });

        const fijarDp = (id, v) => {
            const el = document.querySelector('#' + id + ' .dp-value');
            if (!el) return;
            el.value = v;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const copiar = (de, a) => { const x = document.getElementById(de), y = document.getElementById(a); if (x && y) y.value = x.value; };

        window.amAbrirRango = function (event) {
            document.querySelectorAll('#am-sheet-rango .hr-campos').forEach(g => {
                g.style.display = g.dataset.vista === efVista ? '' : 'none';
            });
            if (efVista === 'dia') {
                fijarDp('dp-am-desde', dpVal('dp-ef-desde'));
                fijarDp('dp-am-hasta', dpVal('dp-ef-hasta'));
            } else if (efVista === 'mes') {
                copiar('ef-mes-anio', 'am-mes-anio'); copiar('ef-mes-desde', 'am-mes-desde'); copiar('ef-mes-hasta', 'am-mes-hasta');
            } else {
                copiar('ef-anio-desde', 'am-anio-desde'); copiar('ef-anio-hasta', 'am-anio-hasta');
            }
            abrirHoja('am-sheet-rango', event);
        };

        window.amAplicarRango = function () {
            if (efVista === 'dia') {
                const d = dpVal('dp-am-desde'), h = dpVal('dp-am-hasta');
                const elD = document.querySelector('#dp-ef-desde .dp-value');
                const elH = document.querySelector('#dp-ef-hasta .dp-value');
                // Primero los dos valores y luego los eventos: así limitarRangoEf()
                // de escritorio valida el rango completo (máx. 90 días).
                elD.value = d <= h ? d : h;
                elH.value = d <= h ? h : d;
                elD.dispatchEvent(new Event('change', { bubbles: true }));
                elH.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (efVista === 'mes') {
                copiar('am-mes-anio', 'ef-mes-anio'); copiar('am-mes-desde', 'ef-mes-desde'); copiar('am-mes-hasta', 'ef-mes-hasta');
                cargarCumplimiento();
            } else {
                copiar('am-anio-desde', 'ef-anio-desde'); copiar('am-anio-hasta', 'ef-anio-hasta');
                cargarCumplimiento();
            }
            cerrarHoja('am-sheet-rango');
            renderCump();
        };
        renderCump();
    }

    renderTodo();
})();
