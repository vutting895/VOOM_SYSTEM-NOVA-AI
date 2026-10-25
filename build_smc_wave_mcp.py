from pathlib import Path
import json, shutil, hashlib, datetime

ROOT = Path(r"C:\Program Files\voom_system")
SOURCE = Path(r"G:\ไดรฟ์ของฉัน\Colab Notebooks")
DEST = ROOT / "workers" / "feature" / "smc_wave"
NB_DEST = DEST / "source_notebooks"
DEST.mkdir(parents=True, exist_ok=True)
NB_DEST.mkdir(parents=True, exist_ok=True)

files = {
    "Elliott Wave.ipynb": "elliott_wave_source.ipynb",
    "hamonic pattren.ipynb": "harmonic_patterns_source.ipynb",
    "Liquidity Sweeps.ipynb": "liquidity_sweeps_source.ipynb",
}
manifest = {
    "project": "VOOM_SYSTEM-NOVA-AI",
    "purpose": "SMC/Wave components for MCP integration",
    "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "source_root": str(SOURCE),
    "source_files": [],
    "safety": {
        "live_trading_enabled": False,
        "orders_submitted": False,
        "source_notebooks_modified": False,
        "core_notebook_from_github_found": False,
        "note": "AI_SNIPER_SMC_WAVE_FULL.ipynb was not found in the searched GitHub repositories/default branches. The generated master notebook is an integration scaffold, not a copy of that missing original."
    }
}
for src_name, dst_name in files.items():
    src = SOURCE / src_name
    if not src.exists():
        manifest["source_files"].append({"source": src_name, "status": "missing"})
        continue
    dst = NB_DEST / dst_name
    shutil.copy2(src, dst)
    raw = dst.read_bytes()
    try:
        nb = json.loads(raw.decode("utf-8"))
        cells = nb.get("cells", [])
        cell_count = len(cells)
        code_cells = sum(1 for c in cells if c.get("cell_type") == "code")
    except Exception:
        cell_count, code_cells = None, None
    manifest["source_files"].append({
        "source": src_name, "copied_to": str(dst.relative_to(ROOT)),
        "size_bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
        "cell_count": cell_count, "code_cells": code_cells, "status": "copied"
    })

adapter = '''"""Safe entry point for the VOOM SMC/Wave MCP feature package.

This module intentionally does not invent trading signals. The source notebooks
are preserved under source_notebooks/ and must be audited and ported into
deterministic, testable functions before they can emit strategy signals.
"""
from __future__ import annotations
from typing import Any

COMPONENTS = {
    "elliott_wave": {
        "source": "source_notebooks/elliott_wave_source.ipynb",
        "status": "source_preserved_needs_audit",
    },
    "harmonic_patterns": {
        "source": "source_notebooks/harmonic_patterns_source.ipynb",
        "status": "source_preserved_needs_audit",
    },
    "liquidity_sweeps": {
        "source": "source_notebooks/liquidity_sweeps_source.ipynb",
        "status": "source_preserved_needs_audit",
    },
}

def component_status() -> dict[str, Any]:
    """Return honest readiness metadata; never represents a trade recommendation."""
    return {
        "module": "smc_wave",
        "status": "integration_scaffold",
        "components": COMPONENTS,
        "live_trading_enabled": False,
        "orders_submitted": False,
        "signals_ready": False,
        "reason": "Source notebooks require code review and deterministic tests before activation.",
    }

def analyze_ohlcv(candles: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate the basic candle shape and report readiness without fabricating signals."""
    required = {"open", "high", "low", "close"}
    if not isinstance(candles, list) or not candles:
        return {"ok": False, "error": "candles must be a non-empty list", **component_status()}
    for i, candle in enumerate(candles):
        if not isinstance(candle, dict) or not required.issubset(candle):
            return {"ok": False, "error": f"candle {i} missing required OHLC fields", **component_status()}
    return {
        "ok": True,
        "candles_validated": len(candles),
        "signal": None,
        "note": "OHLC shape validated only; SMC/Wave signal generation is not active.",
        **component_status(),
    }
'''
(DEST / "adapter.py").write_text(adapter, encoding="utf-8")

readme = """# SMC/Wave MCP Components

This folder is a safe integration scaffold for VOOM_SYSTEM-NOVA-AI.

## Preserved source notebooks
- source_notebooks/elliott_wave_source.ipynb — copied from G:\\ไดรฟ์ของฉัน\\Colab Notebooks\\Elliott Wave.ipynb
- source_notebooks/harmonic_patterns_source.ipynb — copied from G:\\ไดรฟ์ของฉัน\\Colab Notebooks\\hamonic pattren.ipynb
- source_notebooks/liquidity_sweeps_source.ipynb — copied from G:\\ไดรฟ์ของฉัน\\Colab Notebooks\\Liquidity Sweeps.ipynb

The original files are unchanged. The Liquidity Sweeps notebook was found with zero cells; it is preserved as-is and needs recovery/population before it can provide logic.

## Core notebook status
AI_SNIPER_SMC_WAVE_FULL.ipynb was not found by exact-name search in the GitHub repositories checked, so the generated notebook at the project root is explicitly an integration scaffold—not a copy of the missing upstream original.

## Safety and readiness
- Live trading remains disabled; this package cannot place orders.
- adapter.py validates basic OHLC input only. It deliberately emits no trade signal.
- Next step: audit each code cell, remove notebook-only dependencies/secrets, port deterministic logic into individual modules, and add unit tests before connecting tools in mcp-server/app.py.
"""
(DEST / "README.md").write_text(readme, encoding="utf-8")

master = ROOT / "AI_SNIPER_SMC_WAVE_FULL.ipynb"
if master.exists():
    raise SystemExit(f"Refusing to overwrite existing file: {master}")
cells = [
    {"cell_type":"markdown","metadata":{},"source":[
        "# AI_SNIPER_SMC_WAVE_FULL — VOOM_SYSTEM MCP Integration\n",
        "\n",
        "**Generated integration scaffold, not the missing original GitHub notebook.**\n",
        "\n",
        "This notebook assembles the preserved Elliott Wave, Harmonic Patterns, and Liquidity Sweeps sources as future MCP components. No live orders are enabled and no trading signals are fabricated.\n"
    ]},
    {"cell_type":"code","execution_count":None,"metadata":{},"outputs":[],"source":[
        "from pathlib import Path\n",
        "import json\n",
        "ROOT = Path.cwd()\n",
        "COMPONENT_DIR = ROOT / 'workers' / 'feature' / 'smc_wave'\n",
        "print('Component directory:', COMPONENT_DIR)\n",
        "print('Adapter exists:', (COMPONENT_DIR / 'adapter.py').exists())\n"
    ]},
    {"cell_type":"code","execution_count":None,"metadata":{},"outputs":[],"source":[
        "import sys\n",
        "sys.path.insert(0, str(COMPONENT_DIR))\n",
        "from adapter import component_status\n",
        "component_status()\n"
    ]},
    {"cell_type":"markdown","metadata":{},"source":[
        "## Component sources\n",
        "- Elliott Wave: workers/feature/smc_wave/source_notebooks/elliott_wave_source.ipynb\n",
        "- Harmonic Patterns: workers/feature/smc_wave/source_notebooks/harmonic_patterns_source.ipynb\n",
        "- Liquidity Sweeps: workers/feature/smc_wave/source_notebooks/liquidity_sweeps_source.ipynb\n",
        "\n",
        "Each source must be reviewed and ported to deterministic, testable Python before activation. The source notebooks remain unchanged."
    ]}
]
master.write_text(json.dumps({"cells":cells,"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"},"language_info":{"name":"python","version":"3.x"}}, "nbformat":4,"nbformat_minor":5}, ensure_ascii=False, indent=2), encoding="utf-8")
manifest["generated_files"] = [
    str((DEST / "adapter.py").relative_to(ROOT)),
    str((DEST / "README.md").relative_to(ROOT)),
    str(master.relative_to(ROOT)),
]
(ROOT / "artifacts" / "smc-wave-mcp").mkdir(parents=True, exist_ok=True)
(ROOT / "artifacts" / "smc-wave-mcp" / "component_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "copied_sources": manifest["source_files"],
    "generated_files": manifest["generated_files"],
    "master_notebook": str(master),
    "live_trading_enabled": False,
    "orders_submitted": False
}, ensure_ascii=False, indent=2))
