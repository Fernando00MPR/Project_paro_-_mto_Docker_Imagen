/* backlog_escritorio.js — Vista de escritorio (≥768px) del Backlog de seguimientos.
   Las órdenes vienen en #bkd-ordenes (ya filtradas por Área y Semana en el
   servidor). Aquí: filtro por tipo, gráfica de pastel (3 vistas), "Carga por
   responsable", tabla ordenable con buscador y el enlace de Exportar. */

(function () {
    const raiz  = document.getElementById('bkd');
    const datos = document.getElementById('bkd-ordenes');
    if (!raiz || !datos) return;

    const ORDENES = JSON.parse(datos.textContent);
    // Rangos de antigüedad (límite superior en días; después del último, "más de 1 mes").
    const RANGOS  = (raiz.dataset.rangos || '7,14,21,31').split(',').map(Number);
    const ANT     = JSON.parse(document.getElementById('bkd-rangos').textContent);

    const T = (window.BACKLOG_ESCRITORIO || {}).i18n || {};
    const t = (k, vars) => {
        let s = T[k] || k;
        Object.keys(vars || {}).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
        return s;
    };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Nombre + primer apellido: "Felipe Hernández" → FH, "Fernando Manuel Paz Rodriguez" → FP
    // (misma regla que la vista de celular).
    function iniciales(nombre) {
        const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '—';
        const apellido = p.length >= 4 ? p[2] : p[1];
        return (p[0][0] + (apellido ? apellido[0] : '')).toUpperCase();
    }
    // En la tabla, los segundos nombres van abreviados: "Fernando M. Paz Rodriguez".
    function abreviar(nombre) {
        const p = (nombre || '').trim().split(/\s+/).filter(Boolean);
        return p.length >= 4 ? [p[0], p[1][0] + '.', ...p.slice(2)].join(' ') : nombre;
    }
    const rango   = d => 'r' + ((RANGOS.findIndex(t => d <= t) + 1) || RANGOS.length + 1);
    const fecha   = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
    const desglose = (ot, co) => [
        ot ? (ot === 1 ? t('unaOt') : t('nOts', { n: ot })) : '',
        co ? (co === 1 ? t('unCorrectivo') : t('nCorrectivos', { n: co })) : '',
    ].filter(Boolean).join(' · ');

    // Porcentajes enteros que suman 100 (método del mayor residuo).
    function porcentajes(ns) {
        const total = ns.reduce((a, b) => a + b, 0);
        if (!total) return ns.map(() => 0);
        const crudos = ns.map(n => n * 100 / total);
        const pct    = crudos.map(Math.floor);
        let falta    = 100 - pct.reduce((a, b) => a + b, 0);
        crudos.map((c, i) => [c - pct[i], i]).sort((a, b) => b[0] - a[0])
              .forEach(([, i]) => { if (falta > 0 && ns[i]) { pct[i]++; falta--; } });
        return pct;
    }

    // Responsables con sus conteos, de más a menos vencidas y, en empate, mayor atraso.
    function agrupar(ordenes) {
        const m = new Map();
        ordenes.forEach(o => {
            const p = m.get(o.resp) || { nombre: o.resp, ot: 0, co: 0, total: 0, max: 0 };
            o.tipo === 'ot' ? p.ot++ : p.co++;
            p.total++;
            p.max = Math.max(p.max, o.dias);
            m.set(o.resp, p);
        });
        return [...m.values()].sort((a, b) => b.total - a.total || b.max - a.max);
    }

    const estado = { tipo: '', resp: null, q: '', col: 'dias', dir: 'desc', vista: 'ant' };
    try {
        const v = localStorage.getItem('bkd-vista');
        if (['ant', 'tipo', 'resp'].includes(v)) estado.vista = v;
    } catch (e) { /* sin almacenamiento: vista por defecto */ }
    // El tipo va en la URL (?tipo=ot|manual) para que sobreviva al cambiar de área o de semana.
    const tipoUrl = new URLSearchParams(location.search).get('tipo');
    if (tipoUrl === 'ot' || tipoUrl === 'manual') estado.tipo = tipoUrl;
    // La búsqueda también puede venir en la URL (?q=): p. ej. "Abrir en Backlog" desde el detalle de un plan.
    estado.q = (new URLSearchParams(location.search).get('q') || '').trim();

    // ── Filtro por tipo ──
    const segBtns = raiz.querySelectorAll('.bkd-seg button');
    function ponerTipo(tipo) {
        estado.tipo = tipo;
        segBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo)));
        const url = new URL(location.href);
        tipo ? url.searchParams.set('tipo', tipo) : url.searchParams.delete('tipo');
        history.replaceState(null, '', url);
        // Los conteos del selector de semana siguen al tipo.
        raiz.querySelectorAll('[data-ws]').forEach(el => el.wsCategoria && el.wsCategoria(tipo));
        pintarCarga();
        pintarTabla();
    }
    segBtns.forEach(b => b.addEventListener('click', () => ponerTipo(b.dataset.tipo)));

    // ── Gráfica de pastel ──
    const pie     = raiz.querySelector('.bkd-pie');
    const svg     = pie.querySelector('svg');
    const dona    = pie.querySelector('.bkd-dona');
    const leyenda = pie.querySelector('.bkd-leyenda');
    const tip     = pie.querySelector('.bkd-tip');
    const panel   = document.getElementById('bkd-pie-cuerpo');
    const tabs    = [...pie.querySelectorAll('[role="tab"]')];
    const AZULES  = ['#2C44A8', '#6F8BE8', '#B9C6F3', '#DCE4FB', '#1B2A6B'];

    function segmentos(vista) {
        if (vista === 'tipo') {
            const ot = ORDENES.filter(o => o.tipo === 'ot').length;
            return [
                { label: t('ots'),         n: ot,                  color: '#3D5BD9', accion: () => ponerTipo('ot') },
                { label: t('correctivos'), n: ORDENES.length - ot, color: '#D9534F', accion: () => ponerTipo('manual') },
            ];
        }
        if (vista === 'resp') {
            const gente = agrupar(ORDENES);
            const segs  = gente.slice(0, 5).map((p, i) => ({
                label: p.nombre, n: p.total, color: AZULES[i], accion: () => elegir(p.nombre, true),
            }));
            const resto = gente.slice(5).reduce((a, p) => a + p.total, 0);
            if (resto) segs.push({ label: t('otros'), n: resto, color: '#C5C7D4' });
            return segs;
        }
        // De la más antigua a la más reciente.
        const COLOR = { r1: '#E3A23B', r2: '#E07B39', r3: '#D9534F', r4: '#B23A33', r5: '#8E2A23' };
        return ANT.slice().reverse().map(r => ({
            label: r.label, n: ORDENES.filter(o => rango(o.dias) === r.clave).length, color: COLOR[r.clave],
        }));
    }

    function pintarPie() {
        const segs = segmentos(estado.vista);
        const pct  = porcentajes(segs.map(s => s.n));
        const R = 53, C = 2 * Math.PI * R;
        const total = segs.reduce((a, s) => a + s.n, 0);
        let inicio = 0;
        svg.innerHTML = '';
        leyenda.innerHTML = '';
        segs.forEach((s, i) => {
            const texto = `${s.label}: ${s.n} (${pct[i]}%)`;
            let circulo = null;
            if (s.n) {
                const largo = total ? s.n / total * C : 0;
                circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circulo.setAttribute('cx', 66);
                circulo.setAttribute('cy', 66);
                circulo.setAttribute('r', R);
                circulo.setAttribute('stroke', s.color);
                circulo.setAttribute('stroke-dasharray', `${largo} ${C - largo}`);
                circulo.setAttribute('stroke-dashoffset', -inicio);
                if (s.accion) circulo.classList.add('clic');
                svg.appendChild(circulo);
                inicio += largo;
            }
            const li = document.createElement('li');
            li.innerHTML = `<i style="background:${s.color}"></i><span class="et" title="${esc(s.label)}">${esc(s.label)}</span>`
                         + `<span class="n">${s.n}</span><span class="pct">${pct[i]}%</span>`;
            leyenda.appendChild(li);

            const resaltar = ev => {
                pie.classList.add('resaltando');
                li.classList.add('activo');
                if (circulo) circulo.classList.add('activo');
                tip.textContent = texto;
                tip.hidden = false;
                moverTip(ev);
            };
            const soltar = () => {
                pie.classList.remove('resaltando');
                li.classList.remove('activo');
                if (circulo) circulo.classList.remove('activo');
                tip.hidden = true;
            };
            [li, circulo].filter(Boolean).forEach(el => {
                el.addEventListener('mouseenter', resaltar);
                el.addEventListener('mousemove', moverTip);
                el.addEventListener('mouseleave', soltar);
                if (s.accion && s.n) el.addEventListener('click', s.accion);
            });
            if (s.accion && s.n) {
                // Clic en la leyenda = clic en el segmento; también con teclado.
                li.classList.add('clic');
                li.tabIndex = 0;
                li.setAttribute('role', 'button');
                li.setAttribute('aria-label', texto);
                li.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.accion(); }
                });
                li.addEventListener('focus', resaltar);
                li.addEventListener('blur', soltar);
            }
        });
        const titulo = document.getElementById('bkd-pie-titulo').textContent;
        dona.setAttribute('aria-label', titulo + ': ' + segs.map(s => `${s.label} ${s.n}`).join(', '));
    }

    function moverTip(ev) {
        if (!ev || ev.clientX === undefined) {   // foco por teclado: arriba de la leyenda
            tip.style.left = leyenda.offsetLeft + 'px';
            tip.style.top  = (leyenda.offsetTop - 34) + 'px';
            return;
        }
        const caja = pie.getBoundingClientRect();
        const x = Math.min(ev.clientX - caja.left + 12, caja.width - tip.offsetWidth - 8);
        tip.style.left = Math.max(8, x) + 'px';
        tip.style.top  = (ev.clientY - caja.top - 36) + 'px';
    }

    function ponerVista(vista, foco) {
        estado.vista = vista;
        tabs.forEach(b => {
            const si = b.dataset.vista === vista;
            b.setAttribute('aria-selected', String(si));
            b.tabIndex = si ? 0 : -1;
            if (si) {
                panel.setAttribute('aria-labelledby', b.id);
                if (foco) b.focus();
            }
        });
        try { localStorage.setItem('bkd-vista', vista); } catch (e) { /* sin almacenamiento */ }
        pintarPie();
    }
    tabs.forEach((b, i) => {
        b.addEventListener('click', () => ponerVista(b.dataset.vista));
        b.addEventListener('keydown', e => {
            const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!paso) return;
            e.preventDefault();
            ponerVista(tabs[(i + paso + tabs.length) % tabs.length].dataset.vista, true);
        });
    });

    // ── Carga por responsable (respeta el filtro de tipo) ──
    const carga = document.getElementById('bkd-carga');
    const porTipo = () => estado.tipo ? ORDENES.filter(o => o.tipo === estado.tipo) : ORDENES;

    function pintarCarga() {
        const lista = porTipo();
        const gente = agrupar(lista);
        if (estado.resp !== null && !gente.some(p => p.nombre === estado.resp)) estado.resp = null;
        const max = gente.length ? gente[0].total : 1;
        const ot  = lista.filter(o => o.tipo === 'ot').length;

        let html = `<li class="bkd-op" role="option" data-resp="" aria-selected="${estado.resp === null}">
                <span class="bkd-ini todos" aria-hidden="true">${lista.length}</span>
                <span class="bkd-op-nom"><b>${esc(t('todosResp'))}</b><span>${esc(desglose(ot, lista.length - ot))}</span></span>
                <span></span>
            </li>`;
        gente.forEach(p => {
            html += `<li class="bkd-op" role="option" data-resp="${esc(p.nombre)}" aria-selected="${estado.resp === p.nombre}">
                <span class="bkd-ini" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
                <span class="bkd-op-nom"><b title="${esc(p.nombre)}">${esc(p.nombre)}</b><span>${esc(desglose(p.ot, p.co))}</span></span>
                <span class="bkd-op-tot"><b>${p.total}</b><span>${esc((p.max === 1 ? t('maxUnDia') : t('maxDias', { n: p.max })))}</span></span>
                <span class="bkd-op-barra" aria-hidden="true"><div style="width:${p.total / max * 100}%">`
                + (p.ot ? `<i class="ot" style="flex:${p.ot}"></i>` : '')
                + (p.co ? `<i class="co" style="flex:${p.co}"></i>` : '')
                + `</div></span>
            </li>`;
        });
        carga.innerHTML = html;
        carga.querySelectorAll('.bkd-op').forEach(op => {
            op.tabIndex = op.getAttribute('aria-selected') === 'true' ? 0 : -1;
        });
    }

    function elegir(resp, desplazar) {
        estado.resp = resp || null;
        pintarCarga();
        pintarTabla();
        const op = carga.querySelector('[aria-selected="true"]');
        if (desplazar && op) op.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return op;
    }
    carga.addEventListener('click', e => {
        const op = e.target.closest('.bkd-op');
        if (op) elegir(op.dataset.resp).focus();
    });
    carga.addEventListener('keydown', e => {
        const ops = [...carga.querySelectorAll('.bkd-op')];
        const i   = ops.indexOf(document.activeElement);
        if (i < 0) return;
        let j = null;
        if (e.key === 'ArrowDown') j = Math.min(i + 1, ops.length - 1);
        if (e.key === 'ArrowUp')   j = Math.max(i - 1, 0);
        if (e.key === 'Home')      j = 0;
        if (e.key === 'End')       j = ops.length - 1;
        if (j === null) return;
        e.preventDefault();
        elegir(ops[j].dataset.resp).focus();
    });

    // ── Tabla de órdenes ──
    const tbody  = document.getElementById('bkd-tbody');
    const quien  = document.getElementById('bkd-tabla-quien');
    const thResp = raiz.querySelector('th[data-col="resp"]');
    const ths    = [...raiz.querySelectorAll('.bkd-tabla th')];
    const buscar = document.getElementById('bkd-q');
    const expo   = document.getElementById('bkd-exportar');

    
    // ── Paginación (en el navegador). Filas por página recordadas en localStorage ──
    const TAMANOS = [10, 25, 50];
    const pagNav  = document.getElementById('bkd-pag');
    const pagTxt  = document.getElementById('bkd-pag-txt');
    const tamOps  = [...document.querySelectorAll('#bkd-tam [role="radio"]')];
    let pagina = 1, tam = 10;
    try { const g = parseInt(localStorage.getItem('pageSize:backlog'), 10); if (TAMANOS.includes(g)) tam = g; } catch (e) { /* sin almacenamiento */ }
    function pintarTam() {
        tamOps.forEach(o => { const on = +o.dataset.value === tam; o.setAttribute('aria-checked', String(on)); o.tabIndex = on ? 0 : -1; });
    }
    function ponerTam(n) {
        tam = n;
        try { localStorage.setItem('pageSize:backlog', n); } catch (e) { /* sin almacenamiento */ }
        pintarTam();
        pintarTabla();   // vuelve a la página 1
    }
    tamOps.forEach((op, i) => {
        op.addEventListener('click', () => ponerTam(+op.dataset.value));
        op.addEventListener('keydown', e => {
            const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            const sig = tamOps[(i + d + tamOps.length) % tamOps.length];
            ponerTam(+sig.dataset.value);
            sig.focus();
        });
    });
    pintarTam();

    // "Mostrando a–b de n" y botones ‹ 1 … 4 5 6 … 9 › (la primera, la última y las vecinas de la actual)
    function pintarPaginas(n, paginas, ini, enPagina) {
        pagTxt.textContent = n ? t('mostrando', { a: ini + 1, b: ini + enPagina, n: n }) : '';
        const nums = [...new Set([1, paginas, pagina - 1, pagina, pagina + 1])].filter(x => x >= 1 && x <= paginas).sort((a, b) => a - b);
        let h = `<button type="button" class="bkd-pag-b ant" data-p="${pagina - 1}"${pagina === 1 ? ' disabled' : ''} aria-label="${esc(t('pagAnt'))}">‹</button>`;
        nums.forEach((x, i) => {
            if (i && x - nums[i - 1] > 1) h += '<span class="bkd-pag-e" aria-hidden="true">…</span>';
            h += x === pagina
                ? `<span class="bkd-pag-b act" aria-current="page">${x}</span>`
                : `<button type="button" class="bkd-pag-b" data-p="${x}" aria-label="${esc(t('pagina', { n: x }))}">${x}</button>`;
        });
        h += `<button type="button" class="bkd-pag-b sig" data-p="${pagina + 1}"${pagina === paginas ? ' disabled' : ''} aria-label="${esc(t('pagSig'))}">›</button>`;
        pagNav.innerHTML = h;
        pagNav.hidden = paginas <= 1;
    }
    pagNav.addEventListener('click', e => {
        const b = e.target.closest('button[data-p]');
        if (!b || b.disabled) return;
        const flecha = b.classList.contains('ant') ? '.ant' : b.classList.contains('sig') ? '.sig' : null;
        pagina = +b.dataset.p;
        pintarTabla(true);
        const f = flecha && pagNav.querySelector(flecha + ':not([disabled])');   // el foco se queda en la flecha
        if (f) f.focus();
    });


    const valor = (o, col) => col === 'semana' ? o.skey : o[col];
    function comparar(a, b) {
        const va = valor(a, estado.col), vb = valor(b, estado.col);
        const r  = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
        return (estado.dir === 'asc' ? r : -r) || b.dias - a.dias;
    }

        function pintarTabla(mantenerPagina) {   // sin argumento (cambió filtro, búsqueda u orden) vuelve a la página 1
        const q = estado.q.toLowerCase();
        const filas = porTipo()
            .filter(o => estado.resp === null || o.resp === estado.resp)
            .filter(o => !q || o.folio.toLowerCase().includes(q) || o.desc.toLowerCase().includes(q) || (o.plan || '').toLowerCase().includes(q))
            .sort(comparar);
        const conResp = estado.resp === null;
        thResp.hidden = !conResp;
        quien.textContent = conResp ? t('todos') : estado.resp;
        
        if (!mantenerPagina) pagina = 1;
        const paginas = Math.max(1, Math.ceil(filas.length / tam));
        pagina = Math.min(pagina, paginas);
        const ini = (pagina - 1) * tam, vista = filas.slice(ini, ini + tam);

        tbody.innerHTML = vista.length ? vista.map(o => {
            const folio = o.url
                ? `<a class="folio" href="${esc(o.url)}">${esc(o.folio || '—')}</a>`
                : `<span class="folio">${esc(o.folio || '—')}</span>`;
            return `<tr>
                <td>${folio}</td>
                <td><span class="bkd-tag ${o.tipo}">${esc(o.tipo === 'ot' ? t('ot') : t('correctivo'))}</span></td>
                ${conResp ? `<td class="resp" title="${esc(o.resp)}">${esc(abreviar(o.resp))}</td>` : ''}
                <td class="desc">${esc(o.desc)}</td>
                <td class="mono">${esc(o.semana)}</td>
                <td class="nw">${fecha(o.vencia)}</td>
                <td class="der"><span class="bkd-atraso ${rango(o.dias)}">${esc(o.dias === 1 ? t('unDia') : t('dias', { n: o.dias }))}</span></td>
            </tr>`;
        }).join('') : `<tr><td class="sin" colspan="${conResp ? 7 : 6}">${esc(t('sinResultados'))}</td></tr>`;
        
        pintarPaginas(filas.length, paginas, ini, vista.length);
        // Exportar = lo mismo que se ve: Área y Semana de la URL + tipo, responsable y búsqueda.
        const p = new URLSearchParams(location.search);
        ['tipo', 'resp', 'q'].forEach(k => p.delete(k));
        if (estado.tipo) p.set('tipo', estado.tipo);
        if (estado.resp !== null) p.set('resp', estado.resp);
        if (estado.q) p.set('q', estado.q);
        const qs = p.toString();
        expo.href = raiz.dataset.exportar + (qs ? '?' + qs : '');
    }

    ths.forEach(th => th.querySelector('button').addEventListener('click', () => {
        const col = th.dataset.col;
        if (estado.col === col) estado.dir = estado.dir === 'asc' ? 'desc' : 'asc';
        else { estado.col = col; estado.dir = col === 'dias' ? 'desc' : 'asc'; }
        ths.forEach(x => x === th
            ? x.setAttribute('aria-sort', estado.dir === 'asc' ? 'ascending' : 'descending')
            : x.removeAttribute('aria-sort'));
        pintarTabla();
    }));

    let espera;
    buscar.addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(() => { estado.q = buscar.value.trim(); pintarTabla(); }, 200);
    });

    buscar.value = estado.q;
    ponerVista(estado.vista);
    ponerTipo(estado.tipo);
})();
