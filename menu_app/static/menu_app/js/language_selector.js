/* language_selector.js — anima la píldora del LanguageSelector hacia el idioma nuevo.
   El idioma cambia con una recarga completa, así que se guarda el idioma anterior en sessionStorage
   al enviar el formulario; al cargar la página la píldora arranca en esa posición y se desliza a la actual. */
(function () {
    var prev = null;
    try { prev = sessionStorage.getItem('ls-prev'); sessionStorage.removeItem('ls-prev'); } catch (e) { /* sin storage */ }

    document.querySelectorAll('.ls').forEach(function (ls) {
        var cur = ls.dataset.lang, pill = ls.querySelector('.ls-pastilla');
        if (!prev || prev === cur || !pill) return;
        pill.style.transition = 'none';
        ls.dataset.lang = prev;
        void pill.offsetWidth;                       // fija la posición de partida
        pill.style.transition = '';
        requestAnimationFrame(function () { requestAnimationFrame(function () { ls.dataset.lang = cur; }); });
    });

    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (f && f.classList && f.classList.contains('ls')) {
            try { sessionStorage.setItem('ls-prev', f.dataset.lang); } catch (er) { /* sin storage */ }
        }
    });
})();
