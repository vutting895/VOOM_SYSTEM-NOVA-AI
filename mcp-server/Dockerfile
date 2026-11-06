FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace/mcp-server
COPY mcp-server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY mcp-server/app.py ./app.py
COPY mcp-server/tools ./tools
COPY workers/ /workspace/workers/
CMD ["python", "app.py"]
