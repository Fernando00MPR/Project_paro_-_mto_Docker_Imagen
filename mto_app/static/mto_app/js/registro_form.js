function guardarRegistro() {
    const form  = document.querySelector('form');
    const btn   = document.getElementById('btn-guardar');
    const datos = new FormData(form);
    const cfg   = window.REGISTRO_CONFIG;

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    fetch(form.action || window.location.href, {
        method:  'POST',
        headers: { 'X-CSRFToken': datos.get('csrfmiddlewaretoken') },
        body:    new URLSearchParams(datos),
    })
    .then(function(response) {
        if (response.ok) {
            const toast = document.getElementById('toast-ok');
            toast.style.display = 'flex';
            setTimeout(function() {
                window.parent.postMessage('registro_guardado:' + cfg.plan_pk + ':' + cfg.anio, '*');
            }, 1200);
        } else {
            btn.disabled = false;
            btn.textContent = 'Guardar';
            alert('Error al guardar. Intenta de nuevo.');
        }
    })
    .catch(function(err) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        console.error('Error:', err);
        alert('Error de red. Intenta de nuevo.');
    });
}

function confirmarEliminar() {
    const cfg  = window.REGISTRO_CONFIG;
    const url  = '/mto/equipos/' + cfg.plan_pk + '/registro/' + cfg.semana + '/' + cfg.anio + '/eliminar/';
    const csrf = document.querySelector('[name=csrfmiddlewaretoken]').value;

    fetch(url, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf },
    })
    .then(function(response) {
        if (response.ok) {
            window.parent.postMessage('registro_guardado:' + cfg.plan_pk + ':' + cfg.anio, '*');
        }
    })
    .catch(function(err) {
        console.error('Error al eliminar:', err);
    });
}