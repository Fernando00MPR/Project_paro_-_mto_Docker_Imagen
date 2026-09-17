# ── Imagen base ───────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ── Causa identificada con el diagnóstico anterior: el host de build de Coolify
#    resuelve IPv6 para deb.debian.org/pypi.org pero esa ruta no funciona ahí,
#    y el intento cuelga/falla antes de caer a IPv4. Se le dice al resolver del
#    sistema (glibc) que prefiera siempre IPv4 — arregla apt Y pip de una vez
#    (Acquire::ForceIPv4 de abajo solo cubre apt). Debe ir antes de cualquier
#    RUN que toque la red.
RUN echo "precedence ::ffff:0:0/96  100" >> /etc/gai.conf

# ── Dependencias del sistema ───────────────────────────────────────────────────
RUN apt-get update \
    -o Acquire::ForceIPv4=true \
    -o Acquire::Retries=3 \
    -o Acquire::http::Timeout=30 \
    -o Acquire::https::Timeout=30 \
    && apt-get install -y \
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