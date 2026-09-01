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

### Volúmenes persistentes requeridos

Configurar en Coolify → Persistent Storage:

| Source Path (servidor) | Destination Path (contenedor) | Descripción |
|---|---|---|
| `/opt/paros/media` | `/app/media` | Imágenes subidas por usuarios |
| `/opt/paros/respaldos` | `/app/respaldos` | Respaldos de la base de datos |

> Sin estos volúmenes las imágenes y los respaldos se pierden en cada redeploy.

## Comandos útiles

```bash
# Ver logs en tiempo real
docker logs -f <nombre-contenedor>

# Ejecutar migraciones manualmente
python manage.py migrate

# Compilar traducciones
python manage.py compilemessages

# Recopilar archivos estáticos
python manage.py collectstatic --noinput
```

---

## Estructura del proyecto

```
├── login_app/         # Autenticación y usuarios
├── menu_app/          # Menú y navegación
├── paros_app/         # Registro de paros
│   └── management/
│       └── commands/
│           └── crear_superusuario.py # Comando de superusuario
├── mto_app/           # Gestión de mantenimiento
├── inventario_app/    # Inventario de refacciones
├── paros_project/     # Configuración Django
├── locale/            # Traducciones (en/es)
├── media/             # Imágenes subidas (generado en runtime, no versionado)
├── Dockerfile          # Imagen de la app Django
├── Dockerfile.nginx    # Imagen de nginx
├── docker-compose.yml  # Orquestación de servicios (db, web, nginx)
├── nginx.conf          # Configuración de nginx
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
| `APP_NAME` *(opcional)* | Nombre de la app mostrado en el login | `STOPLINE` |
| `ENABLE_REQUEST_TIMING` *(opcional)* | Loguea el tiempo de cada request | `False` |

---

## Notas importantes

- `DB_HOST` debe ser el nombre del contenedor de PostgreSQL en Coolify, no `localhost`.
- El superusuario se crea automáticamente en el primer deploy — en deploys posteriores no hace nada si ya existe.
- El archivo `.env` nunca debe subirse al repositorio — está en `.gitignore`.
- Los archivos de traducción `.mo` se generan automáticamente en cada deploy — no subir al repositorio.