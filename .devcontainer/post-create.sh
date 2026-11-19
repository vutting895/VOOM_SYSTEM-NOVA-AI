#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== NOVA development environment =="
echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo "Python: $(python3 --version)"

echo
echo "Installing the committed Node dependency tree..."
npm ci --ignore-scripts --no-audit --no-fund

if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
fi

echo
echo "NOVA Dev Container dependencies are installed."
echo "Activate Python with: source .venv/bin/activate"
echo "Python packages are not installed automatically."
echo "Live trading remains disabled in this container."
