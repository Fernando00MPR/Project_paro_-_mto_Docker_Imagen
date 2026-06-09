/* autocomplete.js — Búsqueda de fallas, equipos y responsables */

(function () {
    const areaSelect = document.getElementById('id_area');

    /**
     * pkInputId: id del <input type="hidden"> donde guardar el pk del catálogo.
     *            Si es null no se gestiona pk (ej. campo "atendió").
     */
    function makeAutocomplete({ inputId, dropdownId, helpId, pkInputId, searchUrl, valueKey, helpDefault }) {
        const input    = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);
        const help     = document.getElementById(helpId);
        const pkInput  = pkInputId ? document.getElementById(pkInputId) : null;
        if (!input || !dropdown) return;
        let debounce = null, activeIdx = -1, items = [];

        function getAreaId() { return areaSelect ? areaSelect.value : ''; }

        function updateHelp() {
            if (help) help.textContent = getAreaId()
                ? 'Escribe para buscar en el catálogo del área seleccionada.'
                : helpDefault;
        }

        function renderItems(data) {
            dropdown.innerHTML = ''; items = data; activeIdx = -1;
            if (!data.length) {
                dropdown.innerHTML = '<div class="falla-empty">Sin resultados en el catálogo</div>';
                dropdown.style.display = 'block'; return;
            }
            data.forEach(f => {
                const div = document.createElement('div');
                div.className = 'falla-item';
                const name = f[valueKey];
                const desc = f.descripcion ? `<div class="fi-desc">${f.descripcion}</div>` : '';
                div.innerHTML = `<span class="fi-code">${f.codigo}</span><strong>${name}</strong>${desc}`;
                div.addEventListener('mousedown', e => { e.preventDefault(); selectItem(f); });
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        }

        function selectItem(f) {
            input.value = f[valueKey];
            // Guardar el pk del catálogo en el campo oculto para que la vista
            // pueda resolver ambas traducciones sin depender del idioma activo.
            if (pkInput) pkInput.value = f.pk != null ? f.pk : '';
            dropdown.style.display = 'none';
            activeIdx = -1;
        }

        function closeDropdown() { dropdown.style.display = 'none'; activeIdx = -1; }

        function search(q) {
            fetch(`${searchUrl}?q=${encodeURIComponent(q)}&area_id=${getAreaId()}`)
                .then(r => r.json()).then(renderItems).catch(closeDropdown);
        }

        input.addEventListener('input', () => {
            // Si el usuario edita el texto manualmente, invalidar el pk guardado
            if (pkInput) pkInput.value = '';
            clearTimeout(debounce);
            debounce = setTimeout(() => search(input.value.trim()), 220);
        });
        input.addEventListener('focus', () => { if (getAreaId()) search(input.value.trim()); });
        input.addEventListener('keydown', e => {
            const divs = dropdown.querySelectorAll('.falla-item');
            if (!divs.length) return;
            if      (e.key === 'ArrowDown')                { e.preventDefault(); activeIdx = Math.min(activeIdx+1, divs.length-1); }
            else if (e.key === 'ArrowUp')                  { e.preventDefault(); activeIdx = Math.max(activeIdx-1, 0); }
            else if (e.key === 'Enter' && activeIdx >= 0)  { e.preventDefault(); selectItem(items[activeIdx]); return; }
            else if (e.key === 'Escape')                   { closeDropdown(); return; }
            else return;
            divs.forEach((d, i) => d.classList.toggle('selected', i === activeIdx));
            divs[activeIdx]?.scrollIntoView({ block: 'nearest' });
        });
        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
        });
        areaSelect && areaSelect.addEventListener('change', () => {
            input.value = '';
            if (pkInput) pkInput.value = '';
            closeDropdown();
            updateHelp();
        });
        updateHelp();
    }

    makeAutocomplete({ inputId:'id_falla',       dropdownId:'falla-dropdown',       helpId:'falla-help',       pkInputId:'id_falla_pk',       searchUrl:'/fallas/buscar/',       valueKey:'nombre',      helpDefault:'Selecciona un área primero para filtrar el catálogo de fallas.' });
    makeAutocomplete({ inputId:'id_responsable', dropdownId:'responsable-dropdown', helpId:'responsable-help', pkInputId:'id_responsable_pk', searchUrl:'/responsables/buscar/', valueKey:'responsable', helpDefault:'Selecciona un área primero para filtrar el catálogo de responsables.' });
    makeAutocomplete({ inputId:'id_equipo',      dropdownId:'equipo-dropdown',      helpId:'equipo-help',      pkInputId:'id_equipo_pk',      searchUrl:'/equipos/buscar/',      valueKey:'equipo',      helpDefault:'Selecciona un área primero para filtrar el catálogo de equipos.' });
    makeAutocomplete({ inputId:'id_atendio',     dropdownId:'atendio-dropdown',     helpId:null,               pkInputId:null,                searchUrl:'/mto/responsables/buscar-mto/', valueKey:'nombre', helpDefault:'' });
})();
