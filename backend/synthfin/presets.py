"""Load the financial-domain criteria presets shipped inside the package.

These used to live at backend/presets, one directory above the package, and
were resolved with a path built from __file__. That works from a source
checkout and silently returns nothing from an installed wheel, because the
directory is not part of the package at all. They now sit in
synthfin/presets_data and are read through importlib.resources, which works
the same from a checkout, a wheel, or a zipimport.
"""

from __future__ import annotations

import json
from importlib import resources

PRESETS_PACKAGE = "synthfin.presets_data"


def load_presets() -> dict[str, dict]:
    """Return {preset_id: spec} for every JSON file in the presets directory."""
    presets: dict[str, dict] = {}
    for entry in sorted(resources.files(PRESETS_PACKAGE).iterdir(), key=lambda p: p.name):
        if not entry.name.endswith(".json"):
            continue
        try:
            spec = json.loads(entry.read_text(encoding="utf-8"))
        except Exception:
            continue
        pid = spec.get("id") or entry.name.removesuffix(".json")
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
