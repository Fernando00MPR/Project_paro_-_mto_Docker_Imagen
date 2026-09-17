/**
 * date_range_picker.js
 * Widget de calendario para elegir un RANGO de fechas (Desde/Hasta),
 * reutilizable en cualquier formulario. Ver
 * menu_app/templates/menu_app/_date_range_picker.html para el uso.
 *
 * Cada ".dpr-wrap" se inicializa por separado (sin ids globales), así que se
 * puede incluir varias veces en la misma página sin conflicto.
 *
 * La página puede reaccionar a un cambio de rango escuchando "change" sobre
 * los inputs .dpr-desde-value / .dpr-hasta-value (por ejemplo, para disparar
 * un conteo en vivo) — el widget no conoce nada de la lógica de la página.
 */
(function () {
    function localeActual() {
        var lang = (document.documentElement.lang || 'es').toLowerCase();
        return lang.indexOf('en') === 0 ? 'en-US' : 'es-MX';
    }

    function diasSemana(locale) {
        var out = [];
        for (var i = 1; i <= 7; i++) {
            var d = new Date(2024, 0, i); // 1 ene 2024 fue lunes
            out.push(d.toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase());
        }
        return out;
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function formatDisplay(d) { return pad(d.getDate()) + ' / ' + pad(d.getMonth() + 1) + ' / ' + d.getFullYear(); }
    function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseIso(s) {
        if (!s) return null;
        var partes = s.split('-').map(Number);
        var y = partes[0], m = partes[1], d = partes[2];
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }
    function hoySinHora() { var h = new Date(); h.setHours(0, 0, 0, 0); return h; }
    function mismoDia(a, b) {
        return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function cerrarTodos() {
        document.querySelectorAll('.dpr-popover.dpr-abierto').forEach(function (p) { p.classList.remove('dpr-abierto'); });
        document.querySelectorAll('.dpr-control.dpr-abierto').forEach(function (c) { c.classList.remove('dpr-abierto'); });
    }

    function initOne(wrap) {
        var hiddenDesde = wrap.querySelector('.dpr-desde-value');
        var hiddenHasta = wrap.querySelector('.dpr-hasta-value');
        var control     = wrap.querySelector('.dpr-control');
        var desdeTxt    = wrap.querySelector('.dpr-desde-txt');
        var hastaTxt    = wrap.querySelector('.dpr-hasta-txt');
        var chips       = wrap.querySelectorAll('.dpr-chip');
        var pop         = wrap.querySelector('.dpr-popover');
        var titleEl     = wrap.querySelector('.dpr-cal-title');
        var dowEl       = wrap.querySelector('.dpr-cal-dow');
        var gridEl      = wrap.querySelector('.dpr-cal-grid');
        var conteoEl    = wrap.querySelector('.dpr-cal-conteo');
        var btnPrev     = wrap.querySelector('.dpr-cal-prev');
        var btnNext     = wrap.querySelector('.dpr-cal-next');
        var btnListo    = wrap.querySelector('.dpr-cal-listo');

        // Saca el popover del flujo normal y lo mueve a <body>, para que un
        // ancestro con overflow:hidden (p. ej. un modal) no le corte la parte
        // de abajo. Se reposiciona a mano cada vez que se abre.
        document.body.appendChild(pop);

        var desde = parseIso(hiddenDesde.value) || hoySinHora();
        var hasta = parseIso(hiddenHasta.value) || hoySinHora();
        var vista = new Date(hasta);
        var eligiendoSegundo = false;

        function refrescarTexto() {
            desdeTxt.textContent = formatDisplay(desde);
            hastaTxt.textContent = formatDisplay(hasta);
        }

        function actualizarChipsActivos() {
            var hoy = hoySinHora();
            var hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 6);
            var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            var finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
            var inicioMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            var finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);

            chips.forEach(function (c) { c.classList.remove('active'); });
            var activo = null;
            if (mismoDia(desde, hoy) && mismoDia(hasta, hoy)) activo = 'hoy';
            else if (mismoDia(desde, hace7) && mismoDia(hasta, hoy)) activo = '7dias';
            else if (mismoDia(desde, inicioMes) && mismoDia(hasta, finMes)) activo = 'mes';
            else if (mismoDia(desde, inicioMesPasado) && mismoDia(hasta, finMesPasado)) activo = 'mes_pasado';
            if (activo) {
                var el = wrap.querySelector('.dpr-chip[data-atajo="' + activo + '"]');
                if (el) el.classList.add('active');
            }
        }

        function aplicarCambio() {
            hiddenDesde.value = isoOf(desde);
            hiddenHasta.value = isoOf(hasta);
            refrescarTexto();
            actualizarChipsActivos();
            hiddenDesde.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenHasta.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function aplicarRango(nDesde, nHasta) {
            if (nHasta < nDesde) { var t = nDesde; nDesde = nHasta; nHasta = t; }
            desde = nDesde; hasta = nHasta;
            vista = new Date(hasta);
            aplicarCambio();
            if (pop.classList.contains('dpr-abierto')) render();
        }

        function render() {
            var locale = localeActual();
            var anio = vista.getFullYear(), mes = vista.getMonth();
            titleEl.textContent = vista.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
            dowEl.innerHTML = diasSemana(locale).map(function (d) { return '<div class="dpr-dow">' + d + '</div>'; }).join('');

            var primerDia = new Date(anio, mes, 1);
            var offset = (primerDia.getDay() + 6) % 7;
            var diasMes = new Date(anio, mes + 1, 0).getDate();
            var diasMesAnt = new Date(anio, mes, 0).getDate();

            var celdas = [];
            for (var i = offset; i > 0; i--) celdas.push({ dia: diasMesAnt - i + 1, fuera: true, mes: mes - 1 });
            for (var d = 1; d <= diasMes; d++) celdas.push({ dia: d, fuera: false, mes: mes });
            var sig = 1;
            while (celdas.length % 7 !== 0 || celdas.length < 42) celdas.push({ dia: sig++, fuera: true, mes: mes + 1 });

            var hoy = hoySinHora();
            gridEl.innerHTML = celdas.map(function (c) {
                var fechaCelda = new Date(anio, c.mes, c.dia);
                if (c.fuera) {
                    return '<button type="button" class="dpr-day dpr-day--fuera" tabindex="-1" disabled>' + c.dia + '</button>';
                }
                var esInicio = mismoDia(fechaCelda, desde);
                var esFin    = mismoDia(fechaCelda, hasta);
                var enMedio  = desde && hasta && fechaCelda > desde && fechaCelda < hasta;
                var esHoy    = mismoDia(fechaCelda, hoy);
                var clases = ['dpr-day'];
                if (esInicio) clases.push('dpr-day--sel', 'dpr-day--inicio');
                if (esFin)    clases.push('dpr-day--sel', 'dpr-day--fin');
                if (enMedio)  clases.push('dpr-day--medio');
                if (esHoy)    clases.push('dpr-day--hoy');
                return '<button type="button" class="' + clases.join(' ') + '" tabindex="-1" ' +
                    'data-y="' + anio + '" data-m="' + c.mes + '" data-d="' + c.dia + '">' + c.dia + '</button>';
            }).join('');

            var celdasClic = Array.prototype.slice.call(gridEl.querySelectorAll('.dpr-day:not(.dpr-day--fuera)'));
            var objetivo = celdasClic.find(function (c) { return c.classList.contains('dpr-day--fin'); }) || celdasClic[0];
            if (objetivo) objetivo.tabIndex = 0;

            var msDia = 24 * 60 * 60 * 1000;
            var nDias = desde && hasta ? Math.round((hasta - desde) / msDia) + 1 : 0;
            conteoEl.textContent = nDias + (localeActual() === 'en-US'
                ? (nDias === 1 ? ' day selected' : ' days selected')
                : ' días seleccionados');
        }

        function posicionar() {
            var r = control.getBoundingClientRect();
            pop.style.top = (r.bottom + 8) + 'px';
            pop.style.left = r.left + 'px';
            requestAnimationFrame(function () {
                var pr = pop.getBoundingClientRect();
                if (pr.right > window.innerWidth - 8) {
                    pop.style.left = Math.max(8, window.innerWidth - pr.width - 8) + 'px';
                }
                if (pr.bottom > window.innerHeight - 8) {
                    pop.style.top = Math.max(8, r.top - pr.height - 8) + 'px';
                }
            });
        }

        function abrir() {
            cerrarTodos();
            eligiendoSegundo = false;
            pop.classList.add('dpr-abierto');
            control.classList.add('dpr-abierto');
            render();
            posicionar();
        }

        function cerrar() {
            pop.classList.remove('dpr-abierto');
            control.classList.remove('dpr-abierto');
        }

        control.addEventListener('click', function () {
            pop.classList.contains('dpr-abierto') ? cerrar() : abrir();
        });
        control.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
        });

        gridEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.dpr-day');
            if (!btn || btn.disabled) return;
            // render() reemplaza el grid completo (innerHTML), así que el botón
            // clicado queda desconectado del documento antes de que este mismo
            // clic termine de burbujear. Si llega a document, el listener de
            // "cerrar si es clic afuera" ya no reconoce el nodo como parte del
            // popover y lo cierra — cortando la selección del segundo día.
            e.stopPropagation();
            var fecha = new Date(+btn.dataset.y, +btn.dataset.m, +btn.dataset.d);
            if (!eligiendoSegundo) {
                desde = fecha; hasta = fecha; eligiendoSegundo = true;
            } else {
                if (fecha < desde) { hasta = desde; desde = fecha; } else { hasta = fecha; }
                eligiendoSegundo = false;
            }
            aplicarCambio();
            render();
        });

        gridEl.addEventListener('keydown', function (e) {
            var cells = Array.prototype.slice.call(gridEl.querySelectorAll('.dpr-day:not(.dpr-day--fuera)'));
            var idx = cells.indexOf(document.activeElement);
            if (idx === -1) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); return; }
            var destino = -1;
            if (e.key === 'ArrowRight') destino = idx + 1;
            else if (e.key === 'ArrowLeft') destino = idx - 1;
            else if (e.key === 'ArrowDown') destino = idx + 7;
            else if (e.key === 'ArrowUp') destino = idx - 7;
            else return;
            e.preventDefault();
            if (destino >= 0 && destino < cells.length) {
                cells[idx].tabIndex = -1;
                cells[destino].tabIndex = 0;
                cells[destino].focus();
            }
        });

        btnPrev.addEventListener('click', function () { vista.setMonth(vista.getMonth() - 1); render(); });
        btnNext.addEventListener('click', function () { vista.setMonth(vista.getMonth() + 1); render(); });
        btnListo.addEventListener('click', cerrar);

        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                var hoy = hoySinHora();
                var atajo = chip.dataset.atajo;
                if (atajo === 'hoy') {
                    aplicarRango(hoy, hoy);
                } else if (atajo === '7dias') {
                    var d7 = new Date(hoy); d7.setDate(hoy.getDate() - 6);
                    aplicarRango(d7, hoy);
                } else if (atajo === 'mes') {
                    var dMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                    var hMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
                    aplicarRango(dMes, hMes);
                } else if (atajo === 'mes_pasado') {
                    var dMesPas = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
                    var hMesPas = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
                    aplicarRango(dMesPas, hMesPas);
                }
            });
        });

        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target) && !pop.contains(e.target)) cerrar();
        });

        refrescarTexto();
        actualizarChipsActivos();
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') cerrarTodos();
    });

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.dpr-wrap').forEach(initOne);
    });
})();
