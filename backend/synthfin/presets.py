"""Load the financial-domain criteria presets shipped in backend/presets/."""

from __future__ import annotations

import glob
import json
import os

PRESETS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "presets")


def load_presets() -> dict[str, dict]:
    """Return {preset_id: spec} for every JSON file in the presets directory."""
    presets: dict[str, dict] = {}
    for path in sorted(glob.glob(os.path.join(PRESETS_DIR, "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                spec = json.load(f)
        except Exception:
            continue
        pid = spec.get("id") or os.path.splitext(os.path.basename(path))[0]
        spec.setdefault("id", pid)
        presets[pid] = spec
    return presets


def list_presets() -> list[dict]:
    """Lightweight summaries for the UI dropdown."""
    out = []
    for pid, spec in load_presets().items():
        cols = [c for c in spec.get("columns", []) if not c["name"].startswith("_")]
        out.append({
            "id": pid,
            "name": spec.get("name", pid),
            "description": spec.get("description", ""),
            "domain": spec.get("domain", ""),
            "target": spec.get("target"),
            "n_columns": len(cols),
            "n_rules": len(spec.get("rules", [])),
        })
    return out


def get_preset(pid: str) -> dict | None:
    return load_presets().get(pid)
