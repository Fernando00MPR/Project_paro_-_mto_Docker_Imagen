/* backlog_movil.js — Vista de celular (≤767px) del Backlog de seguimientos.
   Los datos ya vienen en el HTML (misma vista que escritorio). Aquí solo:
   color del atraso, iniciales, conteos/barras por persona (que el filtro por
   tipo recalcula), abrir/cerrar responsables y la hoja de áreas. */

(function () {
    const raiz = document.getElementById('bk-movil');
    if (!raiz) return;

    const T = (window.BACKLOG_MOVIL || {}).i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    // Rangos de antigüedad: vienen de la vista (RANGOS_ANTIGUEDAD en views/backlog.py).
    const RANGOS = (raiz.dataset.rangos || '7,14,21,31').split(',').map(Number);

    // Iniciales: primera letra del nombre y del primer apellido
    // ("Felipe Hernández" → FH, "Fernando Manuel Paz Rodriguez" → FP).
    function iniciales(nombre) {
        const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '—';
        const apellido = p.length >= 4 ? p[2] : p[1];
        return (p[0][0] + (apellido ? apellido[0] : '')).toUpperCase();
    }

    raiz.querySelectorAll('.bk-dias').forEach(el => {
        const d = +el.dataset.dias || 0;
        el.classList.add('r' + ((RANGOS.findIndex(t => d <= t) + 1) || RANGOS.length + 1));
    });
    raiz.querySelectorAll('.bk-avatar').forEach(el => { el.textContent = iniciales(el.dataset.nombre); });

    const personas = Array.from(raiz.querySelectorAll('.bk-persona'));

    function desglose(ot, co) {
        const partes = [];
        if (ot) partes.push(ot === 1 ? t('unaOt') : t('nOts', { n: ot }));
        if (co) partes.push(co === 1 ? t('unCorrectivo') : t('nCorrectivos', { n: co }));
        return partes.join(' · ');
    }

    function aplicarTipo(tipo) {
        const datos = personas.map(p => {
            let ot = 0, co = 0;
            p.querySelectorAll('.bk-ordenes li').forEach(li => {
                const visible = !tipo || li.dataset.tipo === tipo;
                li.hidden = !visible;
                if (!visible) return;
                if (li.dataset.tipo === 'ot') ot++; else co++;
            });
            return { p, ot, co };
        });
        // Las barras son relativas a la persona con más vencidas (con el filtro activo).
        const max = Math.max(1, ...datos.map(d => d.ot + d.co));
        datos.forEach(({ p, ot, co }) => {
            p.hidden = ot + co === 0;
            p.querySelector('.bk-num').textContent = ot + co;
            p.querySelector('.bk-desglose').textContent = desglose(ot, co);
            p.querySelector('.bk-barra-p i.ot').style.width = (ot / max * 100) + '%';
            p.querySelector('.bk-barra-p i.co').style.width = (co / max * 100) + '%';
            p.querySelector('.bk-barra-p').setAttribute('aria-label', desglose(ot, co));
        });
    }

    // El tipo va en la URL (?tipo=ot|manual) para que sobreviva al cambiar de área o de semana,
    // y los conteos del selector de semana lo siguen.
    function ponerTipo(tipo) {
        document.querySelectorAll('.bk-seg button').forEach(x => x.setAttribute('aria-pressed', x.dataset.tipo === tipo ? 'true' : 'false'));
        const url = new URL(location.href);
        tipo ? url.searchParams.set('tipo', tipo) : url.searchParams.delete('tipo');
        history.replaceState(null, '', url);
        raiz.querySelectorAll('[data-ws]').forEach(el => el.wsCategoria && el.wsCategoria(tipo));
        aplicarTipo(tipo);
    }
    document.querySelectorAll('.bk-seg button').forEach(b => b.addEventListener('click', () => ponerTipo(b.dataset.tipo)));


    personas.forEach(p => {
        const head = p.querySelector('.bk-head');
        const cuerpo = p.querySelector('.bk-ordenes');
        head.addEventListener('click', () => {
            const abrir = head.getAttribute('aria-expanded') !== 'true';
            head.setAttribute('aria-expanded', abrir ? 'true' : 'false');
            cuerpo.hidden = !abrir;
        });
    });

    const tipoUrl = new URLSearchParams(location.search).get('tipo');
    ponerTipo(tipoUrl === 'ot' || tipoUrl === 'manual' ? tipoUrl : '');

    // ── Hojas de más acciones ───────────────────────────────────
    const hojas = ['bk-sheet-mas'].map(id => document.getElementById(id)).filter(Boolean);
    let disparador = null;
    function abrirHoja(hoja, e) {
        disparador = e && e.currentTarget;
        abrirModalConAnimacion(hoja, e);
        const actual = hoja.querySelector('[aria-current="true"]') || hoja.querySelector('a, button');
        if (actual) { actual.focus(); actual.scrollIntoView({ block: 'nearest' }); }
    }
    window.bkAbrirMas     = e => abrirHoja(document.getElementById('bk-sheet-mas'), e);
    function cerrarHoja(hoja) {
        if (hoja.style.display === 'none') return;
        cerrarModalConAnimacion(hoja);
        if (disparador) disparador.focus();
    }
    hojas.forEach(h => h.addEventListener('click', e => { if (e.target === h) cerrarHoja(h); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hojas.forEach(cerrarHoja); });
    document.addEventListener('animationend', e => {
        if (e.animationName === 'sheet-movil-in' && e.target.classList.contains('sheet-movil')) e.target.style.animation = 'none';
    });
})();
