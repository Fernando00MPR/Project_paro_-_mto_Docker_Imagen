/* historial_acciones.js — modal "Historial de acciones" (Plan de mantenimiento).
   Depende de: HA_CFG {url}, HA_I18N (template). Se abre con cualquier elemento [data-abrir-historial].
   Pide el contenido HTML a mto:historial_acciones y lo vuelve a pedir al cambiar filtro, búsqueda o página. */
(function () {
    'use strict';
    const fondo = document.getElementById('ha-fondo');
    if (!fondo) return;
    const cuerpo = document.getElementById('ha-cuerpo'), btnX = document.getElementById('ha-x');
    const CFG = window.HA_CFG || {}, I = window.HA_I18N || {};
    const CLAVE_PP = 'pageSize:historial';
    let params = new URLSearchParams(), abrio = null, tq = null, pedido = 0;

    function perPageGuardado() {
        try { const v = localStorage.getItem(CLAVE_PP); return ['10', '25', '50'].indexOf(v) !== -1 ? v : ''; } catch (e) { return ''; }
    }

    function iniciarComponentes() {
        if (window.FilterSelectInit) window.FilterSelectInit(cuerpo);
        if (window.dprIniciar) window.dprIniciar(cuerpo);
    }

    async function cargar() {
        const mio = ++pedido, previo = document.activeElement && document.activeElement.id;
        cuerpo.classList.add('ocupado');
        try {
            const r = await fetch(CFG.url + '?' + params.toString(), { credentials: 'same-origin' });
            if (!r.ok) throw new Error('http ' + r.status);
            const html = await r.text();
            if (mio !== pedido) return;    // llegó una respuesta más nueva
            document.querySelectorAll('.dpr-popover').forEach(p => p.remove());   // el selector los mueve a <body>
            cuerpo.innerHTML = html;
            iniciarComponentes();

            const el = previo && document.getElementById(previo);   // el foco no se pierde al repintar
            if (el && cuerpo.contains(el)) {
                el.focus();
                if (el.type === 'search') el.setSelectionRange(el.value.length, el.value.length);
            }
        } catch (e) {
            if (mio === pedido && !cuerpo.querySelector('.ha')) cuerpo.innerHTML = '<div class="ha-cargando">' + I.error + '</div>';
            else if (typeof window.showToast === 'function') window.showToast({ title: I.error, description: window.TXT_REVISA_CONEXION }, 'error');
        } finally {
            if (mio === pedido) cuerpo.classList.remove('ocupado');
        }
    }

    function abrir(origen) {
        abrio = origen || document.activeElement;
        params = new URLSearchParams();
        const pp = perPageGuardado();
        if (pp) params.set('per_page', pp);
        if (CFG.area) params.set('area', CFG.area);
        cuerpo.innerHTML = '<div class="ha-cargando">' + I.cargando + '</div>';
        fondo.hidden = false;
        document.body.style.overflow = 'hidden';
        btnX.focus();
        cargar();
    }
    function cerrar() {
        if (fondo.hidden) return;
        fondo.hidden = true;
        document.querySelectorAll('.dpr-popover').forEach(p => p.remove());
        document.body.style.overflow = '';
        pedido++;
        if (abrio && abrio.focus && document.contains(abrio)) abrio.focus();
    }

    document.addEventListener('click', e => {
        const b = e.target.closest('[data-abrir-historial]');
        if (b) { e.preventDefault(); abrir(b); }
    });
    btnX.addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });

    // ── Filtros (delegación: el contenido se reemplaza en cada carga) ──
    
    function poner(clave, valor) {
        if (valor) params.set(clave, valor); else params.delete(clave);
        params.delete('page');
        cargar();
    }
    cuerpo.addEventListener('input', e => {
        if (e.target.id !== 'ha-q') return;
        clearTimeout(tq);
        tq = setTimeout(() => poner('q', e.target.value.trim()), 250);
    });

    let tr = null;
    function sincronizarRango() {
        const d = cuerpo.querySelector('.dpr-desde-value'), h = cuerpo.querySelector('.dpr-hasta-value');
        if (!d || !h) return;
        if ((d.value || '') === (params.get('desde') || '') && (h.value || '') === (params.get('hasta') || '')) return;
        if (d.value) params.set('desde', d.value); else params.delete('desde');
        if (h.value) params.set('hasta', h.value); else params.delete('hasta');
        params.delete('page');
        cargar();
    }
    let rangoPendiente = false;
    const calendarioAbierto = () => !!document.querySelector('.dpr-popover.dpr-abierto');
    function aplicarRangoSiCerrado() {
        if (!rangoPendiente || calendarioAbierto()) return;
        rangoPendiente = false;
        sincronizarRango();
    }
    cuerpo.addEventListener('change', e => {
        if (!e.target.matches('.dpr-desde-value, .dpr-hasta-value')) return;
        rangoPendiente = true;                 // con el calendario abierto se espera a que se cierre
        clearTimeout(tr); tr = setTimeout(aplicarRangoSiCerrado, 150);
    });
    ['click', 'keyup'].forEach(ev => document.addEventListener(ev, () => setTimeout(aplicarRangoSiCerrado, 0)));
    cuerpo.addEventListener('fs:cambio', e => {
        if (e.target.id === 'ha-fs-usuario') poner('usuario', e.detail.value);
    });
    
    cuerpo.addEventListener('click', e => {
        const chip = e.target.closest('.ha-chip');
        if (chip) { poner('accion', chip.dataset.accion); return; }
        if (e.target.closest('#ha-limpiar')) {
            const pp = params.get('per_page');
            params = new URLSearchParams();
            if (pp) params.set('per_page', pp);
            if (CFG.area) params.set('area', CFG.area);
            cargar();
            return;
        }
        const pp = e.target.closest('#ha-pp [role="radio"]');
        if (pp) {
            try { localStorage.setItem(CLAVE_PP, pp.dataset.value); } catch (er) { /* sin storage */ }
            poner('per_page', pp.dataset.value);
            return;
        }
        const pag = e.target.closest('a[data-page]');
        if (pag) { e.preventDefault(); params.set('page', pag.dataset.page); cargar(); }
    });

    // ── Teclado: Escape cierra; Tab queda dentro del modal ──
    document.addEventListener('keydown', e => {
        if (fondo.hidden) return;
        if (e.key === 'Escape') {
            if (fondo.querySelector('.dpr-popover.dpr-abierto, .fs-abierto')) return;   // lo cierra el propio componente
            e.stopPropagation(); cerrar(); return;
        }

        if (e.key !== 'Tab') return;
        const f = Array.from(fondo.querySelectorAll('button:not([disabled]), a[href], input, select')).filter(x => x.offsetParent);
        
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];

        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }, true);
})();
