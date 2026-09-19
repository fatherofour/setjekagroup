FROM python:3.12-slim

# System deps: opencv-python-headless still needs libgl/glib at runtime even
# headless; curl+gnupg to add DDC's apt repo below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# DDC's free "Community" tier publishes signed Linux .deb packages at
# pkg.datadrivenconstruction.io (amd64 only). Installing them at build time,
# while still root, means find_converter() finds them on PATH
# (/usr/bin/{Format}Exporter) with zero runtime setup - same pattern used for
# OpenConstructionERP's backend image (see docs/deploy/VPS_SETUP.md there).
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://pkg.datadrivenconstruction.io/ddc-archive-keyring.gpg \
       | gpg --dearmor -o /etc/apt/keyrings/ddc-archive-keyring.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/ddc-archive-keyring.gpg] https://pkg.datadrivenconstruction.io stable main" \
       > /etc/apt/sources.list.d/ddc.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       ddc-rvtconverter ddc-ifcconverter ddc-dwgconverter ddc-dgnconverter \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r converter && useradd -r -g converter -d /app -s /sbin/nologin converter

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

RUN chown -R converter:converter /app
USER converter

EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
