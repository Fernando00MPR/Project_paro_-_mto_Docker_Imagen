# Diagramas de flujo — STOPLINE (Gestión de Paros y Mantenimiento)

Documentación viva del proyecto. Cada diagrama se arma o se actualiza al revisar el código de su módulo,
así que lo que dice está verificado contra el código (ver la línea **Revisado** de cada archivo).

**Cómo verlos:** VS Code con la extensión *Markdown Preview Mermaid Support* → abrir el `.md` y `Ctrl+Shift+V`
(o `Ctrl+K V` para verlo a un lado).

## Orden de lectura

| # | Archivo | Nivel | Estado |
|---|---|---|---|
| 0 | [Mapa general](00-mapa-general.md) | Apps, menú, permisos y áreas | ✅ 2026-11-08 |
| 1 | [Plan de mantenimiento](01-plan-mantenimiento.md) | Pantallas y acciones | ✅ 2026-11-08 (`planes.py`) |
| 2 | [Seguimientos, Backlog y Bitácora](02-seguimientos-bitacora.md) | Pantallas y acciones | 🟡 Backlog ✅ · Seguimientos ✅ 2026-11-08 · Bitácora pendiente |
| 3 | [Inventario](03-inventario.md) | Pantallas y acciones | Pendiente |
| 4 | [Paros y producción](04-paros-produccion.md) | Pantallas y acciones | Pendiente |
| 5 | [Login y permisos](05-login-permisos.md) | Pantallas y acciones | Pendiente |
| 6 | [Dashboard de mantenimiento](06-dashboard-mto.md) | Pantalla y permisos | ✅ 2026-11-08 (`dashboard.py`) |

### Procesos (paso a paso)
| Archivo | Estado |
|---|---|
| [Registrar y validar una OT](procesos/registrar-validar-ot.md) | ✅ 2026-11-08 |
| [Importar plan](procesos/importar-plan.md) | Pendiente |
| [Exportar Excel de la semana](procesos/exportar-semana.md) | ✅ 2026-11-08 (`exportacion.py`) |
| [Número de OT](procesos/numero-ot.md) | Pendiente |

### Datos (tablas y relaciones)
| Archivo | Estado |
|---|---|
| [Mantenimiento](datos/mto.md) | Pendiente |
| [Paros y producción](datos/paros.md) | Pendiente |
| [Inventario](datos/inventario.md) | Pendiente |

## Plantilla de cada archivo

1. `# Título`
2. **Qué es** · **Quién lo usa y con qué permiso** · **Archivos** · **Revisado** (fecha y archivo revisado)
3. `## Diagrama` (uno o varios bloques `mermaid`)
4. `## Notas` (reglas importantes y casos límite)
5. `## Hallazgos de la revisión` (si los hay: qué se encontró y si ya se corrigió)

## Convenciones

| Forma en Mermaid | Color | Significa |
|---|---|---|
| `["..."]` rectángulo | azul `pantalla` | Pantalla o página |
| `["..."]` rectángulo | morado `modal` | Modal |
| `{{"..."}}` hexágono | ámbar `servidor` | Vista del servidor (`views/…`) |
| `[("...")]` cilindro | verde `datos` | Tabla de la base de datos |
| `{"..."}` rombo | — | Decisión o permiso |
| Texto en la flecha | — | Acción del usuario y permiso que pide |

- Pantallas con el nombre que se ve en la app; vistas, URLs y modelos con el nombre del código.
- Un diagrama por bloque; si pasa de ~25 elementos, dividirlo.
- Tipos: `flowchart` (mapas y pantallas), `sequenceDiagram` (procesos), `erDiagram` (datos).

Clases para copiar al final de cada `flowchart`:

```text
classDef pantalla fill:#EEF2FF,stroke:#4F46E5,color:#1E1B4B
classDef modal    fill:#F5F3FF,stroke:#7C3AED,color:#1E1B4B
classDef servidor fill:#FEF3C7,stroke:#D97706,color:#1E1B4B
classDef datos    fill:#DCFCE7,stroke:#16A34A,color:#1E1B4B
```
