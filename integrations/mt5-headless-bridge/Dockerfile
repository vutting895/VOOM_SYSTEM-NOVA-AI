FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY bridge.py bridge_relay_client.py ./

# Compose drops all Linux capabilities and uses a read-only filesystem. Root is
# retained only because file-backed Compose secrets preserve host file ownership
# and permissions, so a non-root UID cannot reliably read restricted secret mounts.
ENTRYPOINT ["python", "bridge_relay_client.py"]
