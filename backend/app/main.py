"""
NOVA FastAPI backend.

Mode 1 (Copy) — learn from real data, generate more:
    GET  /api/health            -> liveness + whether a model is loaded
    GET  /api/status            -> model metadata (epochs, columns, target, device)
    POST /api/generate          -> CSV (optional) + num_rows + default_rate
    GET  /api/sample            -> download the bundled ground-truth CSV

Mode 2 (Create) — generate from domain knowledge alone, no dataset:
    GET  /api/presets           -> list the financial-domain criteria presets
    GET  /api/preset/{id}       -> full criteria spec for one preset
    POST /api/generate-criteria -> spec (or preset_id) + num_rows => synthetic data
"""

from __future__ import annotations

import io
import os

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from synthfin.criteria import CriteriaError, generate_from_criteria, validate_spec
from synthfin.presets import get_preset, list_presets

from .service import DEFAULT_CSV, MAX_ROWS, SynthFinService

app = FastAPI(
    title="NOVA API",
    version="2.0.0",
    description="Universal synthetic financial data — Copy (CTGAN) and Create (criteria engine).",
)

origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

service: SynthFinService | None = None


@app.on_event("startup")
def _startup():
    global service
    service = SynthFinService()


@app.get("/api/health")
def health():
    return service.health()


@app.get("/api/status")
def status():
    return service.status()


@app.get("/api/sample")
def sample_csv():
    if not os.path.exists(DEFAULT_CSV):
        raise HTTPException(404, "Sample dataset not found.")
    df = pd.read_csv(DEFAULT_CSV, keep_default_na=False).head(1000)
    return PlainTextResponse(df.to_csv(index=False), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=sample_loans.csv"})


@app.post("/api/generate")
async def generate(
    file: UploadFile | None = File(None),
    num_rows: int = Form(10000),
    default_rate: float | None = Form(None),
):
    if service is None or not service.model_loaded:
        raise HTTPException(503, "Model is not loaded yet. Try again shortly.")

    real_df = None
    if file is not None:
        if not file.filename.lower().endswith(".csv"):
            raise HTTPException(400, "Please upload a .csv file.")
        raw = await file.read()
        if len(raw) > 25 * 1024 * 1024:
            raise HTTPException(413, "File too large (max 25 MB).")
        try:
            real_df = pd.read_csv(io.BytesIO(raw), keep_default_na=False)
        except Exception as exc:
            raise HTTPException(400, f"Could not parse CSV: {exc}")
        if real_df.empty:
            raise HTTPException(400, "Uploaded CSV has no rows.")

    try:
        return service.generate(real_df, num_rows=num_rows, default_rate=default_rate)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Generation failed: {exc}")


# --------------------------------------------------------------------------- #
# Mode 2: Create (criteria engine — no dataset required)
# --------------------------------------------------------------------------- #
class CriteriaRequest(BaseModel):
    preset_id: str | None = None
    spec: dict | None = None
    num_rows: int = 10000
    seed: int = 0


@app.get("/api/presets")
def presets():
    return {"presets": list_presets()}


@app.get("/api/preset/{preset_id}")
def preset(preset_id: str):
    spec = get_preset(preset_id)
    if spec is None:
        raise HTTPException(404, f"Unknown preset: {preset_id!r}")
    return spec


@app.post("/api/generate-criteria")
def generate_criteria(req: CriteriaRequest):
    spec = get_preset(req.preset_id) if req.preset_id else req.spec
    if spec is None:
        raise HTTPException(422, "Provide a known 'preset_id' or a custom 'spec'.")
    problems = validate_spec(spec)
    if problems:
        raise HTTPException(422, "; ".join(problems))

    n = max(1, min(int(req.num_rows), MAX_ROWS))
    try:
        df, report = generate_from_criteria(spec, n_rows=n, seed=req.seed)
    except CriteriaError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Criteria generation failed: {exc}")

    return {
        "mode": "create",
        "spec_name": spec.get("name", spec.get("id")),
        "domain": spec.get("domain"),
        "num_rows": int(len(df)),
        "columns": list(df.columns),
        "preview": df.head(10).to_dict(orient="records"),
        "report": report,
        "csv": df.to_csv(index=False),
    }


@app.get("/")
def root():
    return {"name": "NOVA API", "version": "2.0.0", "modes": ["copy", "create"],
            "docs": "/docs", "health": "/api/health"}
