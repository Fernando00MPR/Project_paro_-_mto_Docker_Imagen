# ── Imagen base ───────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ── Diagnóstico temporal de red (quitar una vez identificada la causa) ─────────
RUN echo "== resolv.conf ==" && cat /etc/resolv.conf; \
    echo "== DNS lookup (getent) ==" && getent hosts deb.debian.org; \
    echo "== DNS lookup (python) ==" && python3 -c "import socket; print(socket.gethostbyname('deb.debian.org'))"; \
    echo "== HTTP por IPv4 ==" && python3 -c "import urllib.request,socket; socket.setdefaulttimeout(10); print(urllib.request.urlopen('http://deb.debian.org').status)"; \
    echo "== FIN DIAGNOSTICO =="
    
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