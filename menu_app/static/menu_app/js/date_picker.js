/**
 * date_picker.js
 * Widget de calendario para elegir UNA fecha, reutilizable en cualquier
 * formulario. Ver menu_app/templates/menu_app/_date_picker.html para el uso.
 *
 * Cada ".dp-wrap" se inicializa por separado (sin ids globales), así que se
 * puede incluir varias veces en la misma página sin conflicto.
 */
(function () {
    // Idioma real de la página (lo fija Django vía <html lang="...">, ver
    // base_menu.html), no fijo en español — así el título del mes y los
    // encabezados de día cambian solos si el sitio pasa a inglés.
    function localeActual() {
        var lang = (document.documentElement.lang || 'es').toLowerCase();
        return lang.indexOf('en') === 0 ? 'en-US' : 'es-MX';
    }

    function diasSemana(locale) {
        // Lunes a Domingo, una sola letra por idioma (L M X J V S D en
        // español; M T W T F S S en inglés).
        var out = [];
        for (var i = 1; i <= 7; i++) {
            var d = new Date(2024, 0, i); // 1 ene 2024 fue lunes
            out.push(d.toLocaleDateString(locale, { weekday: 'narrow' }).toUpperCase());
        }
        return out;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function formatDisplay(d) {
        return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    function isoOf(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function parseIso(s) {
        if (!s) return null;
        var partes = s.split('-').map(Number);
        var y = partes[0], m = partes[1], d = partes[2];
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }

    function mismoDia(a, b) {
        return !!a && !!b && a.toDateString() === b.toDateString();
    }

    function cerrarTodos() {
        document.querySelectorAll('.dp-popover.dp-abierto').forEach(function (p) {
            p.classList.remove('dp-abierto');
        });
        document.querySelectorAll('.dp-control.dp-abierto').forEach(function (c) {
            c.classList.remove('dp-abierto');
        });
    }

    function initDatePicker(wrap) {
        var hidden   = wrap.querySelector('.dp-value');
        var control  = wrap.querySelector('.dp-control');
        var text     = wrap.querySelector('.dp-text');
        var pop      = wrap.querySelector('.dp-popover');
        var titleEl  = wrap.querySelector('.dp-cal-title');
        var dowEl    = wrap.querySelector('.dp-cal-dow');
        var gridEl   = wrap.querySelector('.dp-cal-grid');
        var btnPrev  = wrap.querySelector('.dp-cal-prev');
        var btnNext  = wrap.querySelector('.dp-cal-next');
        var btnHoy   = wrap.querySelector('.dp-cal-hoy');
        var btnListo = wrap.querySelector('.dp-cal-listo');

        var seleccion = parseIso(hidden.value);
        var vista = seleccion ? new Date(seleccion) : new Date();

        function refrescarTexto() {
            text.textContent = seleccion ? formatDisplay(seleccion) : 'dd/mm/aaaa';
            text.classList.toggle('dp-text--vacio', !seleccion);
        }

        function render() {
            var locale = localeActual();
            var anio = vista.getFullYear(), mes = vista.getMonth();
            titleEl.textContent = vista.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
            dowEl.innerHTML = diasSemana(locale).map(function (d) { return '<div class="dp-dow">' + d + '</div>'; }).join('');

            var primerDia = new Date(anio, mes, 1);
            var offset = (primerDia.getDay() + 6) % 7; // Lunes=0 ... Domingo=6
            var diasMes = new Date(anio, mes + 1, 0).getDate();
            var diasMesAnt = new Date(anio, mes, 0).getDate();

            var celdas = [];
            for (var i = offset; i > 0; i--) {
                celdas.push({ dia: diasMesAnt - i + 1, fuera: true, mes: mes - 1 });
            }
            for (var d = 1; d <= diasMes; d++) {
                celdas.push({ dia: d, fuera: false, mes: mes });
            }
            var sig = 1;
            while (celdas.length % 7 !== 0) {
                celdas.push({ dia: sig++, fuera: true, mes: mes + 1 });
            }

            var hoy = new Date();
            gridEl.innerHTML = celdas.map(function (c) {
                var fechaCelda = new Date(anio, c.mes, c.dia);
                var esHoy = !c.fuera && mismoDia(fechaCelda, hoy);
                var esSel = !c.fuera && mismoDia(fechaCelda, seleccion);
                var clases = ['dp-day'];
                if (c.fuera) clases.push('dp-day--fuera');
                if (esSel) clases.push('dp-day--sel');
                if (esHoy) clases.push('dp-day--hoy');
                return '<button type="button" class="' + clases.join(' ') + '" ' +
                    (c.fuera ? 'tabindex="-1" disabled' : '') +
                    ' data-y="' + anio + '" data-m="' + c.mes + '" data-d="' + c.dia + '">' + c.dia + '</button>';
            }).join('');
        }

        function posicionar() {
            var r = control.getBoundingClientRect();
            pop.style.top = (r.bottom + 6) + 'px';
            pop.style.left = r.left + 'px';
            requestAnimationFrame(function () {
                var pr = pop.getBoundingClientRect();
                if (pr.right > window.innerWidth - 8) {
                    pop.style.left = Math.max(8, window.innerWidth - pr.width - 8) + 'px';
                }
                if (pr.bottom > window.innerHeight - 8) {
                    pop.style.top = Math.max(8, r.top - pr.height - 6) + 'px';
                }
            });
        }

        function abrir() {
            cerrarTodos();
            pop.classList.add('dp-abierto');
            control.classList.add('dp-abierto');
            render();
            posicionar();
        }

        function cerrar() {
            pop.classList.remove('dp-abierto');
            control.classList.remove('dp-abierto');
        }

        control.addEventListener('click', function () {
            pop.classList.contains('dp-abierto') ? cerrar() : abrir();
        });
        control.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
            if (e.key === 'Escape') cerrar();
        });

        gridEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.dp-day');
            if (!btn || btn.disabled) return;
            seleccion = new Date(+btn.dataset.y, +btn.dataset.m, +btn.dataset.d);
            hidden.value = isoOf(seleccion);
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
            refrescarTexto();
            render();
            cerrar();
        });

        btnPrev.addEventListener('click', function () { vista.setMonth(vista.getMonth() - 1); render(); });
        btnNext.addEventListener('click', function () { vista.setMonth(vista.getMonth() + 1); render(); });
        btnHoy.addEventListener('click', function () {
            var hoy = new Date();
            seleccion = hoy;
            vista = new Date(hoy);
            hidden.value = isoOf(seleccion);
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
            refrescarTexto();
            render();
        });
        btnListo.addEventListener('click', cerrar);

        // Permite que código externo fije el valor a mano (p. ej. atajos tipo
        // "Hoy"/"Mismo día" fuera del propio widget): basta con hacer
        // hidden.value = iso; hidden.dispatchEvent(new Event('change')) y el
        // widget se resincroniza. El propio widget también dispara 'change'
        // al elegir un día, así que este listener corre en ambos casos (sin
        // problema, es idempotente).
        hidden.addEventListener('change', function () {
            seleccion = parseIso(hidden.value);
            if (seleccion) vista = new Date(seleccion);
            refrescarTexto();
            render();
        });
        
        document.addEventListener('click', function (e) {
            if (!wrap.contains(e.target)) cerrar();
        });

        refrescarTexto();
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') cerrarTodos();
    });

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.dp-wrap').forEach(initDatePicker);
    });
})();
