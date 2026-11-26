FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY workers/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && addgroup --system --gid 10001 nova \
    && adduser --system --uid 10001 --ingroup nova nova

COPY --chown=10001:10001 workers /app/workers

USER 10001:10001

EXPOSE 8000

CMD ["uvicorn", "workers.runtime:app", "--host", "0.0.0.0", "--port", "8000"]
