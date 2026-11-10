/* week_select.js — WeekSelect (mto_app/_week_select.html).
   Calendario de semanas ISO 8601 (la misma numeración que el Plan de
   mantenimiento: el 29/12/2025 es la S1/2026). Escritorio: popover que aplica
   el filtro al elegir. Celular (≤767px): hoja inferior que aplica con el botón
   "Ver {n} órdenes". Al aplicar recarga con ?{data-param}=AAAA-SS | mas6,
   conservando los demás filtros de la URL.
   La página puede filtrar los conteos por categoría: el.wsCategoria('ot'). */

(function () {
    const MOVIL = window.matchMedia('(max-width: 1023px)');
    const DIA = 864e5;
    let cerrarAbierto = null;

    // ── Semanas ISO (en UTC para no depender de la zona horaria) ──
    function semanaIso(d) {
        const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
        const anio = t.getUTCFullYear();
        return [anio, Math.ceil(((t - Date.UTC(anio, 0, 1)) / DIA + 1) / 7)];
    }
    function lunesIso(anio, semana) {
        const ene4 = new Date(Date.UTC(anio, 0, 4));
        return new Date(ene4.getTime() - ((ene4.getUTCDay() || 7) - 1) * DIA + (semana - 1) * 7 * DIA);
    }
    const semanasDelAnio = anio => semanaIso(new Date(Date.UTC(anio, 11, 28)))[1];
    const clave = (anio, s) => anio + '-' + String(s).padStart(2, '0');
    const fmt = new Intl.DateTimeFormat(document.documentElement.lang || 'es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const corto = d => fmt.format(d).replace('.', '');
    function rango(anio, s) {
        const l = lunesIso(anio, s);
        return corto(l) + ' – ' + corto(new Date(l.getTime() + 6 * DIA));
    }

    function iniciar(raiz) {
        const datos  = JSON.parse(raiz.querySelector('script[type="application/json"]:not(.ws-i18n)').textContent);
        const T      = JSON.parse(raiz.querySelector('.ws-i18n').textContent);
        const t      = (k, v) => Object.keys(v || {}).reduce((s, x) => s.split('{' + x + '}').join(v[x]), T[k] || k);
        const btn    = raiz.querySelector('.fs-btn');
        const valor  = raiz.querySelector('.fs-valor');
        const label  = raiz.querySelector('.fs-label').textContent;
        const x      = raiz.querySelector('.fs-x');
        const capa   = raiz.querySelector('.fs-capa');
        const menu   = raiz.querySelector('.fs-menu');
        const anioEl = raiz.querySelector('.ws-anio-n');
        const [prev, next] = raiz.querySelectorAll('.ws-flecha');
        const chips  = [...raiz.querySelectorAll('.ws-chip')];
        const grid   = raiz.querySelector('.ws-grid');
        const ver    = raiz.querySelector('.ws-ver');
        const [anioAct, semAct] = datos.actual.split('-').map(Number);

        let cat = '';            // categoría de los conteos ('' = todas)
        let anio = anioAct;      // año que se muestra
        let pendiente = datos.valor;   // celular: elección antes de "Ver"
        let foco = null;         // clave de la celda con tabindex=0

        const n = c => c ? (cat ? c[cat] || 0 : (c.ot || 0) + (c.manual || 0)) : 0;
        const nSemana = k => n(datos.conteos[k]);
        const elegida = () => MOVIL.matches ? pendiente : datos.valor;
        const resolver = v => v === 'actual' ? datos.actual : v;
        const conteoDe = v => !v ? n(datos.total) : v === 'mas6' ? n(datos.mas6) : nSemana(v);
        const aniosConVencidas = () => Object.keys(datos.conteos).filter(k => nSemana(k) > 0).map(k => +k.slice(0, 4));

        function texto(v) {
            if (!v) return T.todas;
            if (v === 'mas6') return T.mas6;
            const [a, s] = v.split('-').map(Number);
            return t('semana', { n: s, anio: a }) + ' · ' + rango(a, s);

        }
        function pintarBoton() {
            const txt = texto(datos.valor);
            valor.textContent = txt;
            valor.title = txt;
            btn.setAttribute('aria-label', label + ': ' + txt);
        }

        function ponerFoco(celda, enfocar) {
            if (!celda) return;
            grid.querySelectorAll('.ws-sem').forEach(c => { c.tabIndex = c === celda ? 0 : -1; });
            foco = celda.dataset.k;
            if (enfocar) celda.focus({ preventScroll: true });
        }

        function pintar() {
            const teniaFoco = grid.contains(document.activeElement);
            const sel = elegida();
            const anios = aniosConVencidas();
            anioEl.textContent = anio;
            prev.disabled = !anios.some(a => a < anio);
            next.disabled = !anios.some(a => a > anio);

            const nAct = nSemana(datos.actual), n6 = n(datos.mas6);
            chips[0].textContent = t('chipTodas', { n: n(datos.total) });
            chips[1].textContent = nAct ? t('chipActual', { n: semAct }) : t('chipActual0');
            chips[2].textContent = t('chipMas6', { n: n6 });
            chips[1].disabled = !nAct;
            chips[2].disabled = !n6;
            chips.forEach(c => c.setAttribute('aria-pressed', String(resolver(c.dataset.valor) === sel)));

            // Celdas en filas (role="row" con display: contents): 9 columnas en escritorio, 7 en celular.
            const cols = MOVIL.matches ? 7 : 9, total = semanasDelAnio(anio);
            grid.setAttribute('aria-label', t('semanasDe', { anio }));
            let html = '';
            for (let s = 1; s <= total; s++) {
                if ((s - 1) % cols === 0) html += '<div role="row" class="ws-fila">';
                const k = clave(anio, s), v = nSemana(k), r = rango(anio, s);
                const futura = anio > anioAct || (anio === anioAct && s > semAct);
                const venc = v ? (v === 1 ? T.unaVencida : t('nVencidas', { n: v })) : T.sinVencidas;
                const clases = ['ws-sem', v ? 'venc' : futura ? 'fut' : 'vacia', k === sel ? 'sel' : '', k === datos.actual ? 'act' : ''].join(' ');
                html += `<button type="button" role="gridcell" class="${clases}" data-k="${k}" tabindex="-1"`
                     + ` aria-selected="${k === sel}"${v ? '' : ' aria-disabled="true"'}`
                     + ` title="${t('semanaN', { n: s })} · ${r} · ${venc}" aria-label="${t('celda', { n: s, rango: r, venc })}">${s}`
                     + (v ? `<span class="ws-badge" aria-hidden="true">${v}</span>` : '') + '</button>';
                if (s % cols === 0 || s === total) html += '</div>';
            }
            grid.innerHTML = html;

            // Foco: la celda que ya lo tenía, la elegida, la semana actual o la primera con vencidas.
            const celdas = [...grid.querySelectorAll('.ws-sem')];
            const por = k => celdas.find(c => c.dataset.k === k);
            ponerFoco(por(foco) || por(sel) || por(datos.actual) || celdas.find(c => c.classList.contains('venc')) || celdas[0], teniaFoco);

            const nv = conteoDe(pendiente);
            ver.textContent = nv === 1 ? T.verUna : t('verN', { n: nv });
        }

        function colocar() {
            capa.classList.remove('fs-arriba', 'ws-derecha');
            const caja = raiz.getBoundingClientRect();
            if (caja.left + capa.offsetWidth > innerWidth - 8) capa.classList.add('ws-derecha');
            if (innerHeight - caja.bottom < capa.offsetHeight && caja.top > innerHeight - caja.bottom) capa.classList.add('fs-arriba');
        }

        function abrir() {
            if (cerrarAbierto) cerrarAbierto(false);
            const movil = MOVIL.matches;
            pendiente = datos.valor;
            const semanaElegida = datos.valor && datos.valor !== 'mas6' ? datos.valor : null;
            anio = semanaElegida ? +semanaElegida.slice(0, 4) : anioAct;
            foco = null;
            capa.hidden = false;
            raiz.classList.add('fs-abierto');
            btn.setAttribute('aria-expanded', 'true');
            if (movil) {
                menu.setAttribute('aria-modal', 'true');
                document.body.style.overflow = 'hidden';
            } else {
                menu.removeAttribute('aria-modal');
            }
            pintar();
            if (!movil) colocar();
            const celda = grid.querySelector('[tabindex="0"]');
            if (celda) celda.focus({ preventScroll: !movil });
            cerrarAbierto = cerrar;
            document.addEventListener('pointerdown', fuera, true);
        }

        function cerrar(devolverFoco) {
            if (capa.hidden) return;
            capa.hidden = true;
            raiz.classList.remove('fs-abierto');
            btn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            document.removeEventListener('pointerdown', fuera, true);
            if (cerrarAbierto === cerrar) cerrarAbierto = null;
            if (devolverFoco !== false) btn.focus({ preventScroll: true });
        }

        function fuera(e) {
            if (!raiz.contains(e.target) || e.target === capa) {
                if (e.target === capa) e.preventDefault();
                cerrar();
            }
        }

        function aplicar(v) {
            cerrar();
            if (v === datos.valor) return;
            raiz.dispatchEvent(new CustomEvent('ws:cambio', { bubbles: true, detail: { value: v } }));
            const url = new URL(location.href);
            v ? url.searchParams.set(raiz.dataset.param, v) : url.searchParams.delete(raiz.dataset.param);
            location.assign(url);
        }

        // Escritorio aplica al elegir; celular solo marca y aplica con "Ver".
        function elegir(v) {
            if (MOVIL.matches) { pendiente = v; pintar(); }
            else aplicar(v);
        }

        // ── Eventos ──
        btn.addEventListener('click', () => (capa.hidden ? abrir() : cerrar()));
        btn.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); abrir(); }
            else if ((e.key === 'Backspace' || e.key === 'Delete') && x && capa.hidden) { e.preventDefault(); aplicar(''); }
        });
        if (x) x.addEventListener('click', e => { e.stopPropagation(); aplicar(''); });

        [prev, next].forEach(b => b.addEventListener('click', () => {
            anio += +b.dataset.paso;
            foco = null;
            pintar();
        }));
        chips.forEach(c => c.addEventListener('click', () => elegir(resolver(c.dataset.valor))));
        ver.addEventListener('click', () => aplicar(pendiente));

        grid.addEventListener('click', e => {
            const c = e.target.closest('.ws-sem');
            if (!c || c.getAttribute('aria-disabled') === 'true') return;
            ponerFoco(c, true);
            elegir(c.dataset.k);
        });

        grid.addEventListener('keydown', e => {
            const celdas = [...grid.querySelectorAll('.ws-sem')];
            const i = celdas.indexOf(document.activeElement);
            if (i < 0) return;
            const cols = MOVIL.matches ? 7 : 9;
            let j = null;
            switch (e.key) {
                case 'ArrowLeft':  j = Math.max(i - 1, 0); break;
                case 'ArrowRight': j = Math.min(i + 1, celdas.length - 1); break;
                case 'ArrowUp':    j = i - cols >= 0 ? i - cols : i; break;
                case 'ArrowDown':  j = i + cols < celdas.length ? i + cols : i; break;
                case 'Home':       j = i - (i % cols); break;
                case 'End':        j = Math.min(i - (i % cols) + cols - 1, celdas.length - 1); break;
                case 'PageUp':
                case 'PageDown': {
                    const flecha = e.key === 'PageUp' ? prev : next;
                    e.preventDefault();
                    if (flecha.disabled) return;
                    anio += e.key === 'PageUp' ? -1 : 1;
                    foco = clave(anio, Math.min(i + 1, semanasDelAnio(anio)));
                    pintar();
                    return;
                }
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (celdas[i].getAttribute('aria-disabled') !== 'true') elegir(celdas[i].dataset.k);
                    return;
                default: return;
            }
            e.preventDefault();
            ponerFoco(celdas[j], true);
        });

        menu.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
            if (e.key !== 'Tab') return;
            // Celular (hoja modal): el foco no sale de la hoja.
            if (MOVIL.matches) {
                const f = [...menu.querySelectorAll('button:not(:disabled)')].filter(b => b.tabIndex >= 0 && b.offsetParent);
                const primero = f[0], ultimo = f[f.length - 1];
                if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
                else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
            }
        });
        // Un clic en una zona sin botones del popover no le quita el foco a la cuadrícula.
        menu.addEventListener('mousedown', e => { if (!e.target.closest('button')) e.preventDefault(); });
        // Escritorio: si el foco sale del componente (Tab), se cierra.
        raiz.addEventListener('focusout', () => setTimeout(() => {
            if (!capa.hidden && !MOVIL.matches && !raiz.contains(document.activeElement)) cerrar(false);
        }, 0));
        MOVIL.addEventListener('change', () => cerrar(false));

        raiz.wsCategoria = c => {
            cat = c || '';
            if (!capa.hidden) pintar();
        };
        pintarBoton();
    }

    document.querySelectorAll('[data-ws]').forEach(iniciar);
})();
