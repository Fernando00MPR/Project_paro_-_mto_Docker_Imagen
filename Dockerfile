# ── Imagen base ───────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ── Dependencias del sistema ───────────────────────────────────────────────────
RUN apt-get update -o Acquire::Retries=3 && apt-get install -y \
    gettext \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ── Directorio de trabajo ──────────────────────────────────────────────────────
WORKDIR /app

# ── Dependencias de Python ─────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install -r requirements.txt

# ── Código fuente ──────────────────────────────────────────────────────────────
COPY . .

# ── Puerto expuesto ────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Comando de inicio ─────────────────────────────────────────────────────────
CMD ["sh", "-c", "python manage.py migrate && python manage.py collectstatic --noinput && python manage.py compilemessages && python manage.py crear_superusuario && gunicorn paros_project.wsgi:application --bind 0.0.0.0:8000 --worker-class gthread --workers 3 --threads 4 --worker-tmp-dir /dev/shm --timeout 120 --graceful-timeout 30 --max-requests 1000 --max-requests-jitter 100"]