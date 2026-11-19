# NOVA Dev Container

This environment is for local development and local verification. It is not a production image and does not provide CI/CD.

## Included

- Node.js 22 and npm for the TypeScript/React application
- Python 3 and an isolated `.venv` for backend and research tooling
- Git and common native build tools
- Forwarded development ports: 3000, 5173, 8000 and 8787

## Open

1. Open the repository in VS Code.
2. Install the Microsoft Dev Containers extension.
3. Run **Dev Containers: Reopen in Container**.
4. Wait for `npm ci` and Python virtual-environment setup to finish.

GitHub Codespaces can use the same `.devcontainer/devcontainer.json`.

## Run

Use npm and the scripts already defined by the repository's `package.json`:

```bash
npm run dev
npm run build
npm run lint
```

Install the exact Node dependency tree with:

```bash
npm ci --ignore-scripts --no-audit --no-fund
```

The committed `package-lock.json` is the source of truth. Do not use `npm install` for routine environment setup because it may rewrite the lockfile.

Activate Python:

```bash
source .venv/bin/activate
```

Python dependencies are not installed automatically. Install only the applicable requirements file for the task. VS Code uses `.venv/bin/python`. Large ML libraries and GPU-specific builds are deliberately excluded from the base image.

## Secrets and safety

- Copy required local values from `.env.example` into an untracked `.env` only when needed.
- Never commit `.env`, broker credentials, API keys, service-role keys or private certificates.
- Use development/test Supabase credentials, not production credentials.
- `VOOM_LIVE_TRADING_ENABLED` is forced to `false` in this container.
- No broker execution bridge, order endpoint or production deployment is started by container creation.
