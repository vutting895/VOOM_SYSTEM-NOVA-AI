FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       python3-venv \
       python3-pip \
       python3-dev \
       build-essential \
       curl \
       ca-certificates \
       git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /workspaces/VOOM_SYSTEM-NOVA-AI
