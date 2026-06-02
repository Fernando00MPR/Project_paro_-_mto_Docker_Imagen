# Proyecto MTO — Registro de Mantenimiento

Sistema de gestión de mantenimiento desarrollado con Django y PostgreSQL, desplegado con Docker.

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

Verifica que los tres contenedores estén corriendo:

```
✔ Container mto-db-1     Healthy
✔ Container mto-web-1    Started
✔ Container mto-nginx-1  Started
```

### 5. Crear superusuario

```bash
docker-compose exec web python manage.py createsuperuser
```

### 6. Acceder al sistema

- Aplicación: http://localhost:8080
- Admin Django: http://localhost:8080/admin

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker-compose logs -f web

# Bajar los contenedores (conserva datos)
docker-compose down

# Bajar y eliminar todos los datos
docker-compose down -v

# Reiniciar un contenedor
docker-compose restart web

# Ejecutar migraciones manualmente
docker-compose exec web python manage.py migrate
```

---

## Estructura del proyecto

```
├── login_app/        # Autenticación y usuarios
├── menu_app/         # Menú y navegación
├── paros_app/        # Registro de paros
├── mto_app/          # Gestión de mantenimiento
├── paros_project/    # Configuración Django
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
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

---

## Notas importantes

- `DB_HOST` debe ser `db` cuando se ejecuta con Docker Compose.
- Si cambias `DB_PASSWORD` con un volumen existente, debes correr `docker-compose down -v` para reiniciar la base de datos.
- El archivo `.env` nunca debe subirse al repositorio — está en `.gitignore`.
