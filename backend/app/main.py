"""
NOVA FastAPI backend.

Endpoints:
    GET  /api/health    -> liveness + whether a model is loaded
    GET  /api/status    -> model metadata (epochs, columns, target, device)
    POST /api/generate  -> CSV (optional) + num_rows + default_rate
                           => synthetic preview, full CSV, validation metrics
    GET  /api/sample    -> download the bundled ground-truth CSV to try the app
"""

from __future__ import annotations

import io
import os

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .service import DEFAULT_CSV, SynthFinService

app = FastAPI(
    title="NOVA API",
    version="1.0.0",
    description="Privacy-safe synthetic financial data for West African microfinance.",
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


@app.get("/")
def root():
    return {"name": "NOVA API", "docs": "/docs", "health": "/api/health"}
