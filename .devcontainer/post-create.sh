#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== NOVA development environment =="
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo "Python: $(python3 --version)"

# The repository uses bun.lock. Install Bun for the workspace user if needed.
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

if [ -f "bun.lock" ] || [ -f "bun.lockb" ]; then
  echo "Installing JavaScript dependencies with Bun..."
  bun install --frozen-lockfile
elif [ -f "package-lock.json" ]; then
  echo "Installing JavaScript dependencies with npm..."
  npm ci
elif [ -f "package.json" ]; then
  echo "No lockfile found; installing package.json dependencies with npm."
  npm install
fi

# Create an isolated Python environment without assuming ML dependencies.
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

echo
echo "NOVA Dev Container is ready."
echo "Python packages are intentionally not installed automatically."
echo "Install only the project-specific requirements when their manifest is available."
echo "Live trading remains disabled in this container."
