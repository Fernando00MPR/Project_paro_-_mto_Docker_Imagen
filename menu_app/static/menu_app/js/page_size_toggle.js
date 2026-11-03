/* page_size_toggle.js — PageSizeToggle (menu_app/_page_size_toggle.html).
   Un clic (o ← → ↑ ↓ / Inicio / Fin) cambia el tamaño: recarga con ?{data-param}=N, vuelve a la
   página 1 y recuerda la elección en localStorage[data-storage] (si no hay ?param en la URL). */
(function () {

    // La elección también va en una cookie para que el servidor pinte la tabla con ese
    // tamaño desde el principio (sin recargar al cargar). "pageSize:plan" → pst_pageSize_plan.
    function guardarCookie(clave, valor) {
        if (!clave) return;
        document.cookie = 'pst_' + clave.replace(/[^A-Za-z0-9_-]/g, '_') + '=' + encodeURIComponent(valor)
            + '; path=/; max-age=31536000; SameSite=Lax';
    }

    function iniciar(raiz) {
        const ops = Array.from(raiz.querySelectorAll('[role="radio"]'));
        if (!ops.length) return;
        const param = raiz.dataset.param || 'per_page';
        const clave = raiz.dataset.storage || '';
        const valores = ops.map(o => o.dataset.value);
        const actual = () => (ops.find(o => o.getAttribute('aria-checked') === 'true') || { dataset: {} }).dataset.value;

        function ir(valor, porTeclado) {
            try { if (clave) localStorage.setItem(clave, valor); } catch (e) { /* sin storage */ }
            guardarCookie(clave, valor);
            if (porTeclado) { try { sessionStorage.setItem('pst-foco', raiz.id); } catch (e) { /* sin storage */ } }
            const url = new URL(window.location.href);
            url.searchParams.set(param, valor);
            url.searchParams.delete('page');
            window.location.assign(url);
        }

        // Preferencia guardada: se aplica si la URL no trae el parámetro.
        try {
            const guardado = clave && localStorage.getItem(clave);
            if (guardado && valores.indexOf(guardado) !== -1) guardarCookie(clave, guardado);   // pasa la preferencia vieja a la cookie
            if (guardado && valores.indexOf(guardado) !== -1 && guardado !== actual()
                    && !new URL(window.location.href).searchParams.has(param)) {
                ir(guardado, false);
                return;
            }
        } catch (e) { /* sin storage */ }

        if (!ops.some(o => o.tabIndex === 0)) ops[0].tabIndex = 0;

        // Tras elegir con teclado la página recarga: el foco vuelve a la opción activa.
        try {
            if (sessionStorage.getItem('pst-foco') === raiz.id) {
                sessionStorage.removeItem('pst-foco');
                (ops.find(o => o.tabIndex === 0) || ops[0]).focus();
            }
        } catch (e) { /* sin storage */ }

        ops.forEach((op, i) => {
            op.addEventListener('click', () => { if (op.dataset.value !== actual()) ir(op.dataset.value, false); });
            op.addEventListener('keydown', e => {
                let j = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % ops.length;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + ops.length) % ops.length;
                else if (e.key === 'Home') j = 0;
                else if (e.key === 'End') j = ops.length - 1;
                if (j === null) return;
                e.preventDefault();
                if (ops[j].dataset.value !== actual()) ir(ops[j].dataset.value, true);
            });
        });
    }
    document.querySelectorAll('[data-pst]').forEach(iniciar);
})();
