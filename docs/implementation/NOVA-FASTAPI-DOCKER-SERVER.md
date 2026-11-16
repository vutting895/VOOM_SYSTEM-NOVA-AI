# NOVA FastAPI Docker Server Candidate

**Status:** Feature-branch deployment candidate only. Not deployed. Not production-approved.
**Branch:** `feat/nova-fastapi-docker-server-20261116`
**Base:** `main` at `b11b46420b5056fea1c1570c4382e6097928c771`

## Purpose

Package the existing `workers.runtime:app` FastAPI research service as a hardened, non-root Docker container for a separately provisioned server. The service remains research/approval-only. This change does not enable broker execution.

## Files

- `workers/Dockerfile`: Python 3.11 image, pinned dependencies, non-root UID/GID 10001.
- `infra/fastapi-server.compose.yml`: standalone service candidate with resource limits, read-only root filesystem, dropped Linux capabilities, health check, and no published host port.

## Local validation

From the repository root:

```bash
docker compose -f infra/fastapi-server.compose.yml config
docker compose -f infra/fastapi-server.compose.yml build nova-fastapi
docker compose -f infra/fastapi-server.compose.yml up -d nova-fastapi
docker compose -f infra/fastapi-server.compose.yml ps
docker compose -f infra/fastapi-server.compose.yml exec nova-fastapi python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read().decode())"
docker compose -f infra/fastapi-server.compose.yml down
```

The Compose file deliberately does not publish port 8000. A successful container health check proves only that the process responds inside the container; it does not prove public reachability or production readiness.

## Required before a public Base URL can be issued

1. Provision and identify the target server, operating system, Docker Engine/Compose versions, region, firewall and owner-controlled access.
2. Configure a domain name and TLS reverse proxy on the server.
3. Add and test authentication/authorization on **every** FastAPI route. At present, not all research endpoints enforce authentication; network isolation alone is not a substitute for application-level authorization.
4. Configure rate limits, request/body limits, timeouts, allowed origins, structured secret injection and log redaction.
5. Keep the FastAPI container on a private Docker network; only the authenticated reverse proxy may reach it. Do not publish `8000:8000`.
6. Supply `SUPABASE_URL` and `SUPABASE_ANON_KEY` only through the server's protected runtime environment if the approval-draft endpoint is required. Never commit secrets or use a service-role key here.
7. Run the repository's Python tests, image build, container health test, authentication-negative tests, and end-to-end staging smoke tests against this exact commit.
8. Record the deployed image digest, commit SHA, TLS/health evidence, rollback image and backup/restore evidence.

## Safety invariants

- `orders_enabled=false`
- `live_trading_enabled=false`
- No broker order, position mutation, transfer or withdrawal routes.
- Human approval creates a draft-review record only; it does not authorize broker execution.
- No production DNS, firewall, secrets, containers or deployment targets are changed by this branch.

## Deployment inputs still required

- Target server hostname/IP and authorized deployment access.
- Domain/subdomain to use for the API.
- Confirmation that this is a new isolated service target, not the production frontend host.

Until those are supplied and staging checks pass, do not claim a public FastAPI Base URL or mark deployment complete.
