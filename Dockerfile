# ── Imagen base ───────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# ── Diagnóstico temporal de red (quitar una vez identificada la causa) ─────────
RUN printf '%s\n' \
    "import socket, urllib.request, time" \
    "orig = socket.getaddrinfo" \
    "def test(family, label):" \
    "    def filtered(*a, **k):" \
    "        r = [x for x in orig(*a, **k) if x[0] == family]" \
    "        if not r: raise Exception('sin direcciones de esta familia')" \
    "        return r" \
    "    socket.getaddrinfo = filtered" \
    "    t0 = time.time()" \
    "    try:" \
    "        resp = urllib.request.urlopen('http://deb.debian.org', timeout=8)" \
    "        print(f'{label}: OK status={resp.status} en {time.time()-t0:.1f}s')" \
    "    except Exception as e:" \
    "        print(f'{label}: FALLO -> {e} (tras {time.time()-t0:.1f}s)')" \
    "    finally:" \
    "        socket.getaddrinfo = orig" \
    "test(socket.AF_INET, 'IPv4')" \
    "test(socket.AF_INET6, 'IPv6')" \
    > /tmp/diag.py && python3 /tmp/diag.py && rm /tmp/diag.py

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