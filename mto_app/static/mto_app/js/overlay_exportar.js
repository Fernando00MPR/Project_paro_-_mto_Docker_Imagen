function mostrarOverlayExportar(e, link) {
    e.preventDefault();

    const overlay = document.getElementById('overlay-exportar');
    const msgEl   = document.getElementById('overlay-msg');
    const msgs    = ['Calculando planes...', 'Organizando pasos...', 'Generando órdenes...', 'Preparando archivo...'];
    let mi = 0;

    overlay.style.display = 'flex';
    msgEl.textContent = msgs[0];

    const msgInterval = setInterval(() => {
        mi = (mi + 1) % msgs.length;
        msgEl.textContent = msgs[mi];
    }, 1800);

    // Construir URLs de status y download a partir del href del link
    const startUrl = link.href;
    const basePath = startUrl.split('?')[0].replace(/\/$/, '');  // /mto/exportar/semana

    fetch(startUrl)
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                clearInterval(msgInterval);
                msgEl.textContent = data.error;
                setTimeout(() => { overlay.style.display = 'none'; }, 2500);
                return;
            }

            const token       = data.token;
            const statusUrl   = `${basePath}/status/${token}/`;
            const downloadUrl = `${basePath}/download/${token}/`;

            const poll = setInterval(() => {
                fetch(statusUrl)
                    .then(r => r.json())
                    .then(st => {
                        if (st.status === 'ready') {
                            clearInterval(poll);
                            clearInterval(msgInterval);
                            msgEl.textContent = '¡Listo!';
                            window.location.href = downloadUrl;
                            setTimeout(() => { overlay.style.display = 'none'; }, 800);
                        } else if (st.status === 'error') {
                            clearInterval(poll);
                            clearInterval(msgInterval);
                            msgEl.textContent = st.error || 'Error al generar el archivo.';
                            setTimeout(() => { overlay.style.display = 'none'; }, 2500);
                        }
                        // status === 'pending' → seguir esperando
                    })
                    .catch(() => {
                        clearInterval(poll);
                        clearInterval(msgInterval);
                        msgEl.textContent = 'Error de conexión.';
                        setTimeout(() => { overlay.style.display = 'none'; }, 2500);
                    });
            }, 800);
        })
        .catch(() => {
            clearInterval(msgInterval);
            msgEl.textContent = 'Error al iniciar la exportación.';
            setTimeout(() => { overlay.style.display = 'none'; }, 2500);
        });
}
