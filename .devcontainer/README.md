# NOVA Dev Container

This environment is for local development and CI-style checks. It is not a production image.

## Included

- Node.js 22 for the existing TypeScript/React application
- Bun for the repository's `bun.lock`
- Python 3 and an isolated `.venv` for backend and research tooling
- Git and common native build tools
- Forwarded development ports: 3000, 5173, 8000 and 8787

## Open

1. Open the repository in VS Code.
2. Install the Microsoft Dev Containers extension.
3. Run **Dev Containers: Reopen in Container**.
4. Wait for dependency installation to finish.

GitHub Codespaces can use the same `.devcontainer/devcontainer.json`.

## Run

Use the scripts already defined by the repository's `package.json`, for example:

```bash
bun run dev
bun run build
bun run lint
```

Activate Python:

```bash
source .venv/bin/activate
```

Install Python dependencies only after confirming the applicable requirements/lock file for the task. Large ML libraries and GPU-specific builds are deliberately excluded from the base image.

## Secrets and safety

- Copy required local values from `.env.example` into an untracked `.env` only when needed.
- Never commit `.env`, broker credentials, API keys, service-role keys or private certificates.
- Use development/test Supabase credentials, not production credentials.
- `VOOM_LIVE_TRADING_ENABLED` is forced to `false` in this container.
- No broker execution bridge, order endpoint or production deployment is started by container creation.
