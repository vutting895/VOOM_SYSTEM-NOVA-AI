FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend/async_runtime
COPY backend/async_runtime/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/async_runtime/ .

CMD ["celery", "-A", "tasks:celery_app", "worker", "--loglevel=info", "--queues=smc_analysis"]
