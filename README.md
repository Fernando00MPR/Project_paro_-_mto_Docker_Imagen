# Proyecto MTO — Registro de Mantenimiento

Sistema de gestión de paros de producción y mantenimiento desarrollado con Django y PostgreSQL, desplegado con Docker.

---

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

---

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd <nombre-del-proyecto>
```

### 2. Crear el archivo `.env`

Copia el archivo de ejemplo y rellena los valores reales:

```bash
cp env.example .env
```

Edita el `.env` con tus credenciales:

```env
DJANGO_SECRET_KEY=una-clave-secreta-segura
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

DB_NAME=mto_produccion
DB_USER=postgres
DB_PASSWORD=tu-contraseña
DB_HOST=db
DB_PORT=5432

CSRF_TRUSTED_ORIGINS=http://localhost:8080

DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@empresa.com
DJANGO_SUPERUSER_PASSWORD=tu-password-seguro

PGDUMP_PATH=pg_dump
```

> ⚠️ Nunca subas el archivo `.env` al repositorio.

### 3. Construir la imagen

```bash
docker-compose build --no-cache
```

### 4. Levantar los contenedores

```bash
docker-compose up -d
```

Verifica que los contenedores estén corriendo:

```
✔ Container mto-db-1     Healthy
✔ Container mto-web-1    Started
```

### 5. Acceder al sistema

- Aplicación: http://localhost:8000
- Admin Django: http://localhost:8000/admin

> El superusuario se crea automáticamente con las credenciales del `.env`.

---

## Despliegue en Coolify

### Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django | `clave-larga-y-segura` |
| `DJANGO_DEBUG` | Modo debug | `False` |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos | `tudominio.com,10.0.1.9` |
| `CSRF_TRUSTED_ORIGINS` | Orígenes CSRF permitidos | `http://tudominio.com` |
| `DB_NAME` | Nombre de la base de datos | `postgres` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `tu-contraseña` |
| `DB_HOST` | Host del contenedor de BD | `nombre-contenedor-bd` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DJANGO_SUPERUSER_USERNAME` | Usuario administrador inicial | `admin` |
| `DJANGO_SUPERUSER_EMAIL` | Email del administrador | `admin@empresa.com` |
| `DJANGO_SUPERUSER_PASSWORD` | Contraseña del administrador | `password-seguro` |
| `PGDUMP_PATH` | Ruta a pg_dump | `pg_dump` |

### Volúmenes persistentes requeridos

Configurar en Coolify → Persistent Storage:

| Source Path (servidor) | Destination Path (contenedor) | Descripción |
|---|---|---|
| `/opt/paros/media` | `/app/media` | Imágenes subidas por usuarios |
| `/opt/paros/respaldos` | `/app/respaldos` | Respaldos automáticos de BD |

> Sin estos volúmenes las imágenes y respaldos se pierden en cada redeploy.

---

## Respaldos automáticos

El sistema genera respaldos automáticamente cada **lunes a las 2 AM**:

- Respaldo completo de la base de datos con `pg_dump`
- Respaldo de todas las imágenes subidas (`media/`)
- Conserva los **últimos 2 respaldos** — los anteriores se eliminan automáticamente

Los respaldos se guardan en `/opt/paros/respaldos/` en el servidor:

```
respaldos/
├── respaldo_2026_06_09_0200.dump   ← respaldo anterior
├── respaldo_2026_06_16_0200.dump   ← respaldo más reciente
└── media_backup/                   ← copia de imágenes
```

Para ejecutar un respaldo manualmente:

```bash
python manage.py respaldar_bd
```

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker logs -f <nombre-contenedor>

# Ejecutar migraciones manualmente
python manage.py migrate

# Crear respaldo manual
python manage.py respaldar_bd

# Compilar traducciones
python manage.py compilemessages

# Recopilar archivos estáticos
python manage.py collectstatic --noinput
```

---

## Estructura del proyecto

```
├── login_app/        # Autenticación y usuarios
├── menu_app/         # Menú y navegación
├── paros_app/        # Registro de paros
│   └── management/
│       └── commands/
│           ├── respaldar_bd.py       # Comando de respaldo
│           └── crear_superusuario.py # Comando de superusuario
├── mto_app/          # Gestión de mantenimiento
├── paros_project/    # Configuración Django
├── Dockerfile
├── requirements.txt
└── env.example
```

---

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django | `mi-clave-segura` |
| `DJANGO_DEBUG` | Modo debug | `False` |
| `DJANGO_ALLOWED_HOSTS` | Hosts permitidos | `localhost,127.0.0.1` |
| `DB_NAME` | Nombre de la base de datos | `mto_produccion` |
| `DB_USER` | Usuario de PostgreSQL | `postgres` |
| `DB_PASSWORD` | Contraseña de PostgreSQL | `tu-contraseña` |
| `DB_HOST` | Host de la base de datos | `db` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `CSRF_TRUSTED_ORIGINS` | Orígenes CSRF permitidos | `http://localhost:8080` |
| `DJANGO_SUPERUSER_USERNAME` | Usuario administrador inicial | `admin` |
| `DJANGO_SUPERUSER_EMAIL` | Email del administrador | `admin@empresa.com` |
| `DJANGO_SUPERUSER_PASSWORD` | Contraseña del administrador | `password-seguro` |
| `PGDUMP_PATH` | Ruta a pg_dump | `pg_dump` |

---

## Notas importantes

- `DB_HOST` debe ser el nombre del contenedor de PostgreSQL en Coolify, no `localhost`.
- El superusuario se crea automáticamente en el primer deploy — en deploys posteriores no hace nada si ya existe.
- El archivo `.env` nunca debe subirse al repositorio — está en `.gitignore`.
- `PGDUMP_PATH=pg_dump` funciona en Coolify/Linux. En Windows local usa la ruta completa al ejecutable.
- Los archivos de traducción `.mo` se generan automáticamente en cada deploy — no subir al repositorio.