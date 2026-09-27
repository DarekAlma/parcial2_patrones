# -----------------------------------------------------------------------------
# Imagen única del plano de datos: la usan prefect-server, dask-scheduler,
# dask-worker-N e ingestion. Compartir imagen garantiza que cliente, scheduler
# y workers tengan EXACTAMENTE las mismas versiones de Dask/Prefect (requisito
# de Dask para serializar tareas entre nodos).
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bookworm

# Chromium + chromedriver del sistema (misma versión, sin descargas en runtime)
# para el scraper de Kayak con Selenium.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium chromium-driver fonts-liberation curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY wandersync ./wandersync
COPY tests ./tests

# Usuario sin privilegios (el scraping no necesita root).
RUN useradd --create-home --uid 10001 wander \
    && mkdir -p /home/wander/.prefect \
    && chown -R wander:wander /app /home/wander
USER wander

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PREFECT_HOME=/home/wander/.prefect

CMD ["python", "-m", "wandersync.serve"]
