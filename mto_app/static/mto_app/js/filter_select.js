/* filter_select.js — FilterSelect (menu_app/_filter_select.html).
   Patrón ARIA listbox: el foco se queda en la lista (o en el buscador) y la
   opción activa se anuncia con aria-activedescendant. Al elegir, recarga la
   página con ?{data-param}=valor conservando los demás filtros de la URL, y
   avisa con el evento "fs:cambio" (detail.value). En celular (≤767px) el
   mismo menú se muestra como hoja inferior (role="dialog"). */

(function () {
    const MOVIL = window.matchMedia('(max-width: 767px)');
    const normal = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let cerrarAbierto = null;   // solo un menú abierto a la vez

    function iniciar(raiz) {
        if (raiz.dataset.fsListo) return;
        raiz.dataset.fsListo = '1';
        const btn    = raiz.querySelector('.fs-btn');
        const x      = raiz.querySelector('.fs-x');
        const oculto = raiz.querySelector('input[type="hidden"]');
        const capa   = raiz.querySelector('.fs-capa');
        const menu   = raiz.querySelector('.fs-menu');
        const lista  = raiz.querySelector('.fs-lista');
        const buscar = raiz.querySelector('.fs-buscar');
        const vacio  = raiz.querySelector('.fs-vacio');
        const ops    = [...lista.querySelectorAll('[role="option"]')];
        let activa = null, tecleo = '', tecleoT = null;

        const visibles = () => ops.filter(o => !o.hidden);
        const seleccionada = () => ops.find(o => o.getAttribute('aria-selected') === 'true') || ops[0];

        function marcar(op, desplazar) {
            activa = op || null;
            ops.forEach(o => o.classList.toggle('fs-activa', o === activa));
            [lista, buscar].filter(Boolean).forEach(el => activa
                ? el.setAttribute('aria-activedescendant', activa.id)
                : el.removeAttribute('aria-activedescendant'));
            if (activa && desplazar !== false) activa.scrollIntoView({ block: 'nearest' });
        }

        // Abre hacia arriba si abajo no cabe (solo escritorio).
        function colocar() {
            capa.classList.remove('fs-arriba');
            const caja  = raiz.getBoundingClientRect();
            const alto  = capa.offsetHeight;
            const abajo = innerHeight - caja.bottom, arriba = caja.top;
            if (abajo < alto && arriba > abajo) capa.classList.add('fs-arriba');
        }

        function abrir(desde) {
            if (cerrarAbierto) cerrarAbierto(false);
            const movil = MOVIL.matches;
            capa.hidden = false;
            raiz.classList.add('fs-abierto');
            btn.setAttribute('aria-expanded', 'true');
            if (movil) {
                menu.setAttribute('role', 'dialog');
                menu.setAttribute('aria-modal', 'true');
                document.body.style.overflow = 'hidden';
            } else {
                menu.removeAttribute('role');
                menu.removeAttribute('aria-modal');
            }
            if (buscar) { buscar.value = ''; filtrar(''); }
            if (!movil) colocar();
            marcar(desde === 'ultima' ? visibles().at(-1) : seleccionada());
            (buscar && !movil ? buscar : lista).focus({ preventScroll: true });
            cerrarAbierto = cerrar;
            document.addEventListener('pointerdown', fuera, true);
        }

        function cerrar(devolverFoco) {
            if (capa.hidden) return;
            capa.hidden = true;
            raiz.classList.remove('fs-abierto');
            btn.setAttribute('aria-expanded', 'false');
            menu.removeAttribute('data-teclado');
            document.body.style.overflow = '';
            document.removeEventListener('pointerdown', fuera, true);
            if (cerrarAbierto === cerrar) cerrarAbierto = null;
            if (devolverFoco !== false) btn.focus({ preventScroll: true });
        }

        // Escritorio: clic fuera del componente. Celular: clic en el fondo de la hoja.
        function fuera(e) {
            if (!raiz.contains(e.target) || e.target === capa) {
                if (e.target === capa) e.preventDefault();
                cerrar();
            }
        }

        function elegir(valor) {
            const actual = oculto ? oculto.value : '';
            cerrar();
            if (valor === actual) return;
            if (oculto) oculto.value = valor;
            raiz.dispatchEvent(new CustomEvent('fs:cambio', { bubbles: true, detail: { value: valor } }));
            const param = raiz.dataset.param;
            if (param) {
                const url = new URL(location.href);
                valor ? url.searchParams.set(param, valor) : url.searchParams.delete(param);
                location.assign(url);
            }
        }

        function filtrar(q) {
            const n = normal(q);
            let alguna = false;
            ops.forEach(o => {
                if (o.dataset.value === '') return;   // "Todas" siempre visible
                const si = !n || normal(o.querySelector('.fs-nombre').textContent).includes(n);
                o.hidden = !si;
                alguna = alguna || si;
            });
            vacio.hidden = alguna;
            const sep = lista.querySelector('.fs-sep');
            if (sep) sep.hidden = !alguna;
            if (!activa || activa.hidden) marcar(visibles()[n ? 1 : 0] || visibles()[0]);
        }

        // ── Botón ──
        btn.addEventListener('click', () => (capa.hidden ? abrir() : cerrar()));
        btn.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); abrir(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); abrir('ultima'); }
            else if ((e.key === 'Backspace' || e.key === 'Delete') && x && capa.hidden) { e.preventDefault(); elegir(''); }
        });
        if (x) x.addEventListener('click', e => { e.stopPropagation(); elegir(''); });

        // ── Menú ──
        ops.forEach(o => {
            o.addEventListener('mousemove', () => {
                menu.removeAttribute('data-teclado');
                if (activa !== o) marcar(o, false);
            });
            o.addEventListener('click', () => elegir(o.dataset.value));
        });
        if (buscar) buscar.addEventListener('input', () => filtrar(buscar.value));

        menu.addEventListener('keydown', e => {
            const vis = visibles();
            const i = vis.indexOf(activa);
            const enBuscar = e.target === buscar;
            let nueva;
            switch (e.key) {
                case 'ArrowDown': nueva = vis[Math.min(i + 1, vis.length - 1)] || vis[0]; break;
                case 'ArrowUp':   nueva = vis[Math.max(i - 1, 0)] || vis[0]; break;
                case 'Home':      nueva = vis[0]; break;
                case 'End':       nueva = vis.at(-1); break;
                case 'Enter':     e.preventDefault(); if (activa) elegir(activa.dataset.value); return;
                case ' ':
                    if (enBuscar) return;
                    e.preventDefault(); if (activa) elegir(activa.dataset.value); return;
                case 'Escape':    e.preventDefault(); e.stopPropagation(); cerrar(); return;
                case 'Tab':       cerrar(false); return;
                default:
                    // Typeahead: letras seguidas saltan a la primera opción que empieza así.
                    if (enBuscar || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
                    clearTimeout(tecleoT);
                    tecleo += normal(e.key);
                    tecleoT = setTimeout(() => { tecleo = ''; }, 600);
                    nueva = vis.find(o => normal(o.querySelector('.fs-nombre').textContent).startsWith(tecleo));
                    if (!nueva) return;
            }
            if (nueva) {
                e.preventDefault();
                menu.setAttribute('data-teclado', '');
                marcar(nueva);
            }
        });

        // Al pasar de escritorio a celular (o al revés) con el menú abierto, se cierra.
        MOVIL.addEventListener('change', () => cerrar(false));
    }

    document.querySelectorAll('[data-fs]').forEach(iniciar);
    window.FilterSelectInit = function (cont) { (cont || document).querySelectorAll('[data-fs]').forEach(iniciar); };
})();
