FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace/mcp-server
COPY mcp-server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY mcp-server/app.py ./app.py
COPY mcp-server/tools ./tools
COPY workers/ /workspace/workers/
CMD ["python", "app.py"]

[executed on device: 10_3_6_9 (85294689-03d5-431e-abd5-9e27d4c94814)]