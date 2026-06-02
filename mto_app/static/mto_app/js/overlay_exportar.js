function mostrarOverlayExportar(e, link) {
    const overlay = document.getElementById('overlay-exportar');
    const msgEl   = document.getElementById('overlay-msg');
    const msgs    = ['Calculando planes...', 'Organizando pasos...', 'Generando órdenes...', 'Preparando archivo...'];
    let mi = 0;

    overlay.style.display = 'flex';

    const msgInterval = setInterval(() => {
        mi = (mi + 1) % msgs.length;
        msgEl.textContent = msgs[mi];
    }, 1800);

    // Cerrar cuando el navegador empiece a recibir el archivo
    window.addEventListener('focus', function onFocus() {
        clearInterval(msgInterval);
        msgEl.textContent = '¡Listo!';
        setTimeout(() => { overlay.style.display = 'none'; }, 600);
        window.removeEventListener('focus', onFocus);
    });
}