/* documentacion.js */

const docCfg = window.DOC_CFG || {};
const docI18n = docCfg.i18n || {};

function formatearMensajeDoc(plantilla, valores) {
    if (!plantilla) return '';
    return plantilla.replace(/\{(\w+)\}/g, function (_, clave) {
        return (valores && valores[clave] !== undefined) ? valores[clave] : '';
    });
}

// ── Modal nueva categoría (carpeta raíz) ──────────────────────────────────────

function abrirModalCategoria(event) {
    abrirModalConAnimacion('modal-categoria', event);
}

function cerrarModalCategoria() {
    cerrarModalConAnimacion('modal-categoria');
}

// ── Modal subir documento ─────────────────────────────────────────────────────

function abrirModalSubir(event, carpetaId, nombreMostrado) {
    document.getElementById('form-subir').action = `${docCfg.urlSubirBase}${carpetaId}/subir/`;
    document.getElementById('modal-subir-categoria').textContent = nombreMostrado;
    document.getElementById('form-subir').reset();
    document.getElementById('doc-zona-texto').textContent = 'Haz clic para seleccionar un archivo';
    abrirModalConAnimacion('modal-subir', event);
}

function cerrarModalSubir() {
    cerrarModalConAnimacion('modal-subir');
}

// ── Modal nueva subcarpeta (carpeta hija) ─────────────────────────────────────

function abrirModalSubcarpeta(event) {
    document.getElementById('form-subcarpeta').reset();
    abrirModalConAnimacion('modal-subcarpeta', event);
}

function cerrarModalSubcarpeta() {
    cerrarModalConAnimacion('modal-subcarpeta');
}

// ── Modal editar carpeta (código y nombre, cualquier nivel) ───────────────────

function abrirModalEditarCarpeta(event, carpetaId, codigo, nombre) {
    document.getElementById('form-editar-carpeta').action = `${docCfg.urlEditarCarpetaBase}${carpetaId}/editar/`;
    document.getElementById('editar-carpeta-codigo').value = codigo;
    document.getElementById('editar-carpeta-nombre').value = nombre;
    abrirModalConAnimacion('modal-editar-carpeta', event);
}

function cerrarModalEditarCarpeta() {
    cerrarModalConAnimacion('modal-editar-carpeta');
}

// ── Modal confirmar eliminar (carpeta o documento) ────────────────────────────

function confirmarEliminarCarpeta(event, carpetaId, nombre, totalDocs) {
    document.getElementById('titulo-eliminar-doc').textContent = docI18n.tituloCarpeta;
    document.getElementById('texto-eliminar-doc').textContent = totalDocs > 0
        ? formatearMensajeDoc(docI18n.confirmarCarpetaConDocs, { nombre: nombre, n: totalDocs })
        : formatearMensajeDoc(docI18n.confirmarCarpetaSinDocs, { nombre: nombre });
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarCarpetaBase}${carpetaId}/eliminar/`;
    abrirModalConAnimacion('modal-eliminar-doc', event);
}

function confirmarEliminarDocumento(event, docId, nombre) {
    document.getElementById('titulo-eliminar-doc').textContent = docI18n.tituloDocumento;
    document.getElementById('texto-eliminar-doc').textContent = formatearMensajeDoc(docI18n.confirmarDocumento, { nombre: nombre });
    document.getElementById('form-eliminar-doc').action = `${docCfg.urlEliminarDocBase}${docId}/eliminar/`;
    abrirModalConAnimacion('modal-eliminar-doc', event);
}

function cerrarModalEliminarDoc() {
    cerrarModalConAnimacion('modal-eliminar-doc');
}

// ── Menú "⋯" de acciones de fila (Mover a…/Eliminar) ──────────────────────────
// Un solo popover compartido por página, reposicionado con JS cerca del botón
// que lo abrió — así no lo recorta el overflow-x:auto del contenedor de la
// tabla (un popover por fila, con position:absolute dentro de la celda, sí
// quedaría recortado por ese overflow).

let docMenuContexto = null;

function toggleMenuAcciones(event, boton, tipo, id, nombre, totalDocs) {
    event.stopPropagation();
    const menu = document.getElementById('doc-menu-acciones');
    if (!menu) return;
    const claveNueva = tipo + ':' + id;
    const yaAbiertoParaEste = menu.style.display !== 'none' && menu.dataset.abiertoPara === claveNueva;
    cerrarMenuAcciones();
    if (yaAbiertoParaEste) return;

    docMenuContexto = { tipo: tipo, id: id, nombre: nombre, totalDocs: totalDocs };

    const etiquetaEliminar = document.getElementById('doc-menu-item-eliminar');
    if (etiquetaEliminar) {
        etiquetaEliminar.textContent = (tipo === 'carpeta')
            ? (docI18n.eliminarCarpetaMenu || 'Eliminar carpeta')
            : (docI18n.eliminarArchivoMenu || 'Eliminar archivo');
    }

    const r = boton.getBoundingClientRect();
    const alturaEstimada = 90;
    if (window.innerHeight - r.bottom < alturaEstimada + 12 && r.top > alturaEstimada) {
        menu.style.top = 'auto';
        menu.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
        menu.style.bottom = 'auto';
        menu.style.top = (r.bottom + 4) + 'px';
    }
    menu.style.right = (window.innerWidth - r.right) + 'px';
    menu.style.left = 'auto';
    menu.style.display = 'block';
    menu.dataset.abiertoPara = claveNueva;
}

function cerrarMenuAcciones() {
    const menu = document.getElementById('doc-menu-acciones');
    if (menu) {
        menu.style.display = 'none';
        menu.dataset.abiertoPara = '';
    }
}

function menuAccionesMover(event) {
    if (!docMenuContexto) return;
    const ctx = docMenuContexto;
    cerrarMenuAcciones();
    abrirModalMover(event, ctx.tipo, ctx.id, ctx.nombre);
}

function menuAccionesEliminar(event) {
    if (!docMenuContexto) return;
    const ctx = docMenuContexto;
    cerrarMenuAcciones();
    if (ctx.tipo === 'carpeta') {
        confirmarEliminarCarpeta(event, ctx.id, ctx.nombre, ctx.totalDocs);
    } else {
        confirmarEliminarDocumento(event, ctx.id, ctx.nombre);
    }
}

document.addEventListener('click', function (e) {
    const menu = document.getElementById('doc-menu-acciones');
    if (!menu || menu.style.display === 'none') return;
    if (!menu.contains(e.target)) cerrarMenuAcciones();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrarMenuAcciones();
});

// ── Modal "Mover a…" ───────────────────────────────────────────────────────────
// window.DOC_CARPETAS (todo el árbol de carpetas del sitio, no solo lo
// visible en esta página) viene de un json_script "doc-carpetas-data" en la
// plantilla — así se puede mover a cualquier carpeta, no solo a las que ya
// están renderizadas en la tabla actual.

function obtenerCarpetasGlobales() {
    const el = document.getElementById('doc-carpetas-data');
    if (!el) return [];
    try {
        return JSON.parse(el.textContent);
    } catch (e) {
        return [];
    }
}

function construirListaDestinosMover(tipo, id) {
    const todas = obtenerCarpetasGlobales();
    if (tipo !== 'carpeta') return todas;

    const excluidos = new Set([id]);
    let agregado = true;
    while (agregado) {
        agregado = false;
        todas.forEach(function (c) {
            if (!excluidos.has(c.id) && excluidos.has(c.parentId)) {
                excluidos.add(c.id);
                agregado = true;
            }
        });
    }
    return todas.filter(function (c) { return !excluidos.has(c.id); });
}

// Camino de ancestros (nombres) de una carpeta, del más lejano al más
// cercano, sin incluirse a sí misma — para mostrar "de dónde viene" cada
// destino en la lista (p. ej. dos carpetas llamadas igual bajo padres
// distintos dejan de confundirse).
function construirRutaCarpeta(carpetaId, porId) {
    const ruta = [];
    let actual = porId[carpetaId];
    while (actual && actual.parentId !== null && actual.parentId !== undefined) {
        const padre = porId[actual.parentId];
        if (!padre) break;
        ruta.unshift(padre.nombre);
        actual = padre;
    }
    return ruta;
}

function crearItemDestinoMover(id, nombre, ruta) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'doc-mover-item';
    boton.dataset.nombre = nombre.toLowerCase();
    boton.onclick = function () { seleccionarDestinoMover(id, boton); };

    const tieneRuta = ruta && ruta.length;
    boton.innerHTML =
        '<span class="doc-mover-radio"></span>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="1.5" style="flex-shrink:0;">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>' +
        '</svg>' +
        '<span style="min-width:0; overflow:hidden;">' +
        '<span class="doc-mover-nombre" style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
        (tieneRuta ? '<span class="doc-mover-ruta" style="display:block; font-size:11px; color:var(--text-3); font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' : '') +
        '</span>';
    boton.querySelector('.doc-mover-nombre').textContent = nombre;
    if (tieneRuta) boton.querySelector('.doc-mover-ruta').textContent = ruta.join(' / ');
    return boton;
}

function renderizarListaDestinosMover(destinos, incluirRaiz) {
    const cont = document.getElementById('modal-mover-lista');
    if (!cont) return;
    cont.innerHTML = '';

    const porId = {};
    obtenerCarpetasGlobales().forEach(function (c) { porId[c.id] = c; });

    if (incluirRaiz) {
        cont.appendChild(crearItemDestinoMover('', docI18n.raizDocumentos || 'Documentos Generales', []));
    }
    destinos.forEach(function (c) {
        cont.appendChild(crearItemDestinoMover(String(c.id), c.nombre, construirRutaCarpeta(c.id, porId)));
    });
}

function seleccionarDestinoMover(id, elemento) {
    document.querySelectorAll('.doc-mover-item').forEach(function (el) {
        el.classList.remove('doc-mover-item-activo');
    });
    elemento.classList.add('doc-mover-item-activo');
    document.getElementById('modal-mover-destino-id').value = id;
    const boton = document.getElementById('modal-mover-confirmar');
    if (boton) boton.disabled = false;
}

function filtrarDestinosMover() {
    const termino = document.getElementById('modal-mover-buscar').value.trim().toLowerCase();
    document.querySelectorAll('.doc-mover-item').forEach(function (item) {
        item.style.display = item.dataset.nombre.includes(termino) ? 'flex' : 'none';
    });
}

function abrirModalMover(event, tipo, id, nombre) {
    document.getElementById('modal-mover-titulo').textContent =
        formatearMensajeDoc(docI18n.tituloMoverA || 'Mover "{nombre}"', { nombre: nombre });

    const destinos = construirListaDestinosMover(tipo, id);
    renderizarListaDestinosMover(destinos, tipo === 'carpeta');

    const form = document.getElementById('form-mover-doc');
    form.action = (tipo === 'carpeta')
        ? `${docCfg.urlMoverCarpetaBase}${id}/mover/`
        : `${docCfg.urlMoverDocBase}${id}/mover/`;

    document.getElementById('modal-mover-destino-id').value = '';
    document.getElementById('modal-mover-buscar').value = '';
    document.getElementById('modal-mover-confirmar').disabled = true;
    document.getElementById('modal-mover-volver').value = window.location.pathname + window.location.search;

    abrirModalConAnimacion('modal-mover-doc', event);
}

function cerrarModalMover() {
    cerrarModalConAnimacion('modal-mover-doc');
}

// ── Modal ver PDF ──────────────────────────────────────────────────────────────

function verPdf(event, url, nombre) {
    document.getElementById('titulo-pdf').textContent = nombre;

    const iframe   = document.getElementById('iframe-pdf');
    const skeleton = document.getElementById('pdf-skeleton');
    iframe.style.opacity   = '0';
    skeleton.style.display = 'block';
    iframe.onload = () => {
        iframe.style.transition = 'opacity .2s ease';
        iframe.style.opacity    = '1';
        skeleton.style.display  = 'none';
    };
    iframe.src = url;

    abrirModalConAnimacion('modal-pdf', event);
}

function cerrarModalPdf() {
    cerrarModalConAnimacion('modal-pdf');
    document.getElementById('iframe-pdf').src = 'about:blank';
}

// ── Modal ver imagen ─────────────────────────────────────────────────────────

function verImagen(event, url, nombre, subidoEn) {
    document.getElementById('titulo-imagen').textContent = nombre;
    document.getElementById('fecha-imagen').textContent = subidoEn ? `Subido el ${subidoEn}` : '';


    document.getElementById('descargar-imagen').href = url;

    const img      = document.getElementById('img-visor');
    const skeleton = document.getElementById('imagen-skeleton');
    img.style.opacity      = '0';
    skeleton.style.display = 'block';
    img.onload = () => {
        img.style.transition = 'opacity .2s ease';
        img.style.opacity    = '1';
        skeleton.style.display = 'none';
    };
    img.src = url;

    abrirModalConAnimacion('modal-imagen', event);
}

function cerrarModalImagen() {
    cerrarModalConAnimacion('modal-imagen');
    document.getElementById('img-visor').src = '';
}

function previsualizarArchivoDoc(input) {
    const zonaTexto = document.getElementById('doc-zona-texto');
    if (input.files && input.files[0]) {
        zonaTexto.textContent = input.files[0].name;
    } else {
        zonaTexto.textContent = 'Haz clic para seleccionar un archivo';
    }
}

// ── Árbol de carpetas: expandir/contraer (usado en lista_documentos.html y
// carpeta_detalle.html, cualquier página que renderice _fila_carpeta.html) ──

function selectorHijosCarpeta(carpetaId) {
    return '[data-parent-carpeta="' + carpetaId + '"]';
}

function toggleDocCarpetaRow(carpetaId, btn) {
    const filas = document.querySelectorAll(selectorHijosCarpeta(carpetaId));
    if (!filas.length) return;
    const abrir = filas[0].style.display === 'none';
    filas.forEach(function (fila) { fila.style.display = abrir ? 'table-row' : 'none'; });
    const svgPath = btn.querySelector('svg path');
    if (svgPath) svgPath.setAttribute('d', abrir ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6');
    btn.title = abrir
        ? (docI18n.ocultarContenido || 'Ocultar contenido')
        : (docI18n.mostrarContenido || 'Mostrar contenido');
    actualizarEtiquetaExpandirTodo();
}

// Oculta TODO el subárbol de una carpeta (recursivo) y lo deja en su estado
// colapsado por defecto.
function colapsarSubarbolCarpeta(carpetaId) {
    document.querySelectorAll(selectorHijosCarpeta(carpetaId)).forEach(function (fila) {
        fila.style.display = 'none';
        fila.style.background = 'var(--surface)';
        if (fila.classList.contains('doc-row-carpeta')) {
            const btn = fila.querySelector('.doc-toggle-btn');
            if (btn) {
                const svgPath = btn.querySelector('svg path');
                if (svgPath) svgPath.setAttribute('d', 'M9 6l6 6-6 6');
            }
            colapsarSubarbolCarpeta(fila.dataset.carpeta);
        }
    });
}

// Actualiza el texto del enlace "Expandir todo"/"Contraer todo" si existe en
// la página (solo lista_documentos.html lo tiene); no falla si no existe.
function actualizarEtiquetaExpandirTodo() {
    const enlace = document.getElementById('doc-toggle-all');
    if (!enlace) return;
    const conHijos = Array.from(document.querySelectorAll('.doc-toggle-btn')).filter(function (btn) {
        return document.querySelectorAll(selectorHijosCarpeta(btn.dataset.carpeta)).length;
    });
    const todasAbiertas = conHijos.length > 0 && conHijos.every(function (btn) {
        const filas = document.querySelectorAll(selectorHijosCarpeta(btn.dataset.carpeta));
        return filas[0].style.display !== 'none';
    });
    enlace.textContent = todasAbiertas
        ? (docI18n.contraerTodo || 'Contraer todo')
        : (docI18n.expandirTodo || 'Expandir todo');
}


// Abre o cierra TODAS las carpetas con contenido de una sola vez, en
// cualquier nivel del árbol visible en esta página.
function toggleAllDocCatRows() {
    const botones = document.querySelectorAll('.doc-toggle-btn');
    const conHijos = Array.from(botones).filter(function (btn) {
        return document.querySelectorAll(selectorHijosCarpeta(btn.dataset.carpeta)).length;
    });
    if (!conHijos.length) return;

    const todasAbiertas = conHijos.every(function (btn) {
        const filas = document.querySelectorAll(selectorHijosCarpeta(btn.dataset.carpeta));
        return filas[0].style.display !== 'none';
    });
    const abrir = !todasAbiertas;

    conHijos.forEach(function (btn) {
        const filas = document.querySelectorAll(selectorHijosCarpeta(btn.dataset.carpeta));
        filas.forEach(function (fila) { fila.style.display = abrir ? 'table-row' : 'none'; });
        const svgPath = btn.querySelector('svg path');
        if (svgPath) svgPath.setAttribute('d', abrir ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6');
        btn.title = abrir
            ? (docI18n.ocultarContenido || 'Ocultar contenido')
            : (docI18n.mostrarContenido || 'Mostrar contenido');
    });
    actualizarEtiquetaExpandirTodo();
}

// ── Pestañas "Todo/Carpetas/Archivos" (filtro por tipo de fila) ───────────────
// [data-vista-raiz] marca las filas que son la "raíz visual" de ESTA página
// (categorías raíz en lista_documentos.html, o las subcarpetas inmediatas de
// la carpeta que se está viendo en carpeta_detalle.html) — no se puede usar
// ":not([data-parent-carpeta])" porque esas filas SÍ tienen un padre real en
// la base de datos cuando se ven dentro de carpeta_detalle.html.

function aplicarFiltroTipoDoc(tipo, btn) {
    document.querySelectorAll('.doc-filtro-tipo-btn').forEach(function (b) {
        b.classList.toggle('doc-filtro-tipo-activo', b === btn);
    });

    if (tipo === 'todo') {
        document.querySelectorAll('[data-vista-raiz]').forEach(function (raiz) {
            raiz.style.display = 'table-row';
            if (raiz.classList.contains('doc-row-carpeta')) {
                colapsarSubarbolCarpeta(raiz.dataset.carpeta);
            }
        });
        actualizarEtiquetaExpandirTodo();
        return;
    }

    document.querySelectorAll('.doc-row-carpeta').forEach(function (fila) {
        fila.style.display = (tipo === 'carpetas') ? 'table-row' : 'none';
        const btnToggle = fila.querySelector('.doc-toggle-btn');
        if (btnToggle) {
            const svgPath = btnToggle.querySelector('svg path');
            if (svgPath) svgPath.setAttribute('d', 'M6 9l6 6 6-6');
        }
    });
    document.querySelectorAll('.doc-row-file').forEach(function (fila) {
        fila.style.display = (tipo === 'archivos') ? 'table-row' : 'none';
    });
    actualizarEtiquetaExpandirTodo();
}

// ── Ordenamiento de filas hijas (subcarpetas y archivos) dentro de cada
// carpeta — las filas raíz de la página mantienen su orden. Dos controles
// (cabeceras clicables + menú del botón "Ordenar") comparten este estado.

let ordenActual = { key: 'updated', dir: 'desc' };

function etiquetaOrdenDoc(key, dir) {
    const clave = key + ':' + dir;
    const mapa = {
        'updated:desc': docI18n.masRecientesPrimero || 'Más recientes primero',
        'updated:asc':  docI18n.masAntiguosPrimero || 'Más antiguos primero',
        'name:asc':     docI18n.nombreAZ || 'Nombre A–Z',
        'name:desc':    docI18n.nombreZA || 'Nombre Z–A',
        'size:desc':    docI18n.masPesadosPrimero || 'Más pesados primero'
    };
    return mapa[clave] || (docI18n.personalizado || 'Personalizado');
}

function valorOrdenDoc(fila, key) {
    if (key === 'name') return fila.dataset.nombre || '';
    if (key === 'size') return parseFloat(fila.dataset.size || '0');
    return fila.dataset.actualizado || '';
}

function compararFilasOrdenDoc(a, b) {
    const va = valorOrdenDoc(a.fila, ordenActual.key);
    const vb = valorOrdenDoc(b.fila, ordenActual.key);
    let cmp;
    if (ordenActual.key === 'name') {
        cmp = va.localeCompare(vb, 'es', { sensitivity: 'base' });
    } else if (ordenActual.key === 'size') {
        cmp = va - vb;
    } else {
        cmp = va < vb ? -1 : (va > vb ? 1 : 0);
    }
    return ordenActual.dir === 'asc' ? cmp : -cmp;
}

function recolectarBloqueOrdenDoc(fila, acumulador) {
    acumulador.push(fila);
    if (fila.classList.contains('doc-row-carpeta')) {
        document.querySelectorAll(selectorHijosCarpeta(fila.dataset.carpeta)).forEach(function (hijo) {
            recolectarBloqueOrdenDoc(hijo, acumulador);
        });
    }
}

// Reordena los hijos DIRECTOS de una carpeta (cada hijo-carpeta arrastra
// consigo todo su propio subárbol como un bloque).
function ordenarHijosDeCarpeta(carpetaId) {
    const hijosDirectos = document.querySelectorAll(selectorHijosCarpeta(carpetaId));
    if (!hijosDirectos.length) return;

    const bloques = Array.from(hijosDirectos).map(function (fila) {
        const filas = [];
        recolectarBloqueOrdenDoc(fila, filas);
        return { fila: fila, filas: filas };
    });

    const ultimoBloque = bloques[bloques.length - 1];
    const referencia = ultimoBloque.filas[ultimoBloque.filas.length - 1].nextElementSibling;

    bloques.sort(compararFilasOrdenDoc);

    const tbody = document.getElementById('doc-tabla-body');
    if (!tbody) return;
    bloques.forEach(function (bloque) {
        bloque.filas.forEach(function (fila) { tbody.insertBefore(fila, referencia); });
    });
}

// Aplica ordenActual a TODAS las carpetas del árbol de esta página (estén o
// no expandidas), para que al expandir más tarde ya se vea ordenado.
function aplicarOrdenActual() {
    document.querySelectorAll('.doc-row-carpeta').forEach(function (fila) {
        ordenarHijosDeCarpeta(fila.dataset.carpeta);
    });
}

function actualizarUIOrdenDoc() {
    const etiquetaEl = document.getElementById('doc-orden-etiqueta');
    if (etiquetaEl) etiquetaEl.textContent = etiquetaOrdenDoc(ordenActual.key, ordenActual.dir);

    document.querySelectorAll('.doc-orden-item').forEach(function (item) {
        item.classList.toggle('doc-orden-activo', item.dataset.key === ordenActual.key && item.dataset.dir === ordenActual.dir);
    });

    document.querySelectorAll('.doc-th-sort').forEach(function (th) {
        const activo = th.dataset.sortKey === ordenActual.key;
        const arrow = th.querySelector('.doc-th-arrow');
        th.style.color = activo ? 'var(--text)' : 'var(--text-3)';
        if (arrow) arrow.textContent = activo ? (ordenActual.dir === 'asc' ? ' ↑' : ' ↓') : '';
    });
}

function cambiarOrdenDesdeCabecera(key) {
    if (ordenActual.key === key) {
        ordenActual.dir = (ordenActual.dir === 'asc') ? 'desc' : 'asc';
    } else {
        ordenActual.key = key;
        ordenActual.dir = (key === 'name') ? 'asc' : 'desc';
    }
    aplicarOrdenActual();
    actualizarUIOrdenDoc();
}

function elegirOrden(key, dir) {
    ordenActual.key = key;
    ordenActual.dir = dir;
    aplicarOrdenActual();
    actualizarUIOrdenDoc();
    cerrarMenuOrden();
}

function toggleMenuOrden(event) {
    event.stopPropagation();
    const menu = document.getElementById('doc-orden-menu');
    if (!menu) return;
    menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
}

function cerrarMenuOrden() {
    const menu = document.getElementById('doc-orden-menu');
    if (menu) menu.style.display = 'none';
}

document.addEventListener('click', function (e) {
    const menu = document.getElementById('doc-orden-menu');
    const btn = document.getElementById('doc-orden-btn');
    if (!menu || menu.style.display === 'none') return;
    if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        cerrarMenuOrden();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') cerrarMenuOrden();
});

document.addEventListener('DOMContentLoaded', function () {
    aplicarOrdenActual();
    actualizarUIOrdenDoc();
});


// ── Cerrar con backdrop y ESC ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const cerrarPorId = {
        'modal-eliminar-doc': cerrarModalEliminarDoc,
        'modal-mover-doc':    cerrarModalMover,
        'modal-pdf':          cerrarModalPdf,
        'modal-imagen':       cerrarModalImagen,
    };
    Object.entries(cerrarPorId).forEach(([id, cerrar]) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) cerrar();
            });
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cerrarModalCategoria();
            cerrarModalSubir();
            cerrarModalSubcarpeta();
            cerrarModalEditarCarpeta();
            cerrarModalEliminarDoc();
            cerrarModalMover();
            cerrarModalPdf();
            cerrarModalImagen();
        }
    });
});
