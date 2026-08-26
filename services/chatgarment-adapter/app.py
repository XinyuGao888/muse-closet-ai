from __future__ import annotations

import asyncio
import json
import os
import shlex
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import trimesh
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile


ROOT = Path(os.environ.get("MUSE_JOB_ROOT", "/data/muse-tryon-jobs")).resolve()
RUNNER = os.environ.get("CHATGARMENT_RUNNER", "").strip()
TOKEN = os.environ.get("MUSE_ADAPTER_TOKEN", "").strip()
TIMEOUT_SECONDS = int(os.environ.get("CHATGARMENT_TIMEOUT_SECONDS", "1800"))
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("MAX_CONCURRENT_JOBS", "1")))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))

ROOT.mkdir(parents=True, exist_ok=True)
app = FastAPI(title="Muse ChatGarment Adapter", version="1.0.0")
gpu_slots = threading.BoundedSemaphore(MAX_CONCURRENT_JOBS)
jobs_lock = threading.Lock()


@dataclass
class Job:
    id: str
    status: str = "queued"
    progress: int = 5
    error: str | None = None
    created_at: float = 0


jobs: dict[str, Job] = {}


def require_token(authorization: str | None) -> None:
    if not TOKEN:
        raise HTTPException(status_code=503, detail="MUSE_ADAPTER_TOKEN is not configured")
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid adapter token")


def update_job(job_id: str, **changes: Any) -> None:
    with jobs_lock:
        job = jobs[job_id]
        for key, value in changes.items():
            setattr(job, key, value)


def job_dir(job_id: str) -> Path:
    path = (ROOT / job_id).resolve()
    if ROOT not in path.parents:
        raise RuntimeError("Invalid job path")
    return path


async def save_upload(upload: UploadFile, destination: Path) -> None:
    size = 0
    with destination.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"{upload.filename or 'upload'} is too large")
            output.write(chunk)


def normalize_result(output_dir: Path) -> None:
    glb = output_dir / "result.glb"
    if glb.exists() and glb.stat().st_size > 0:
        return
    obj = output_dir / "result.obj"
    if not obj.exists():
        raise RuntimeError("Runner must write result.glb or result.obj")
    mesh = trimesh.load(obj, force="scene", process=False)
    mesh.export(glb, file_type="glb")


def run_model(job_id: str) -> None:
    path = job_dir(job_id)
    output_dir = path / "output"
    output_dir.mkdir(exist_ok=True)
    if not RUNNER:
        update_job(job_id, status="failed", progress=100, error="CHATGARMENT_RUNNER is not configured")
        return
    try:
        with gpu_slots:
            update_job(job_id, status="processing", progress=22)
            command = [
                *shlex.split(RUNNER),
                "--manifest", str(path / "manifest.json"),
                "--input-dir", str(path / "input"),
                "--output-dir", str(output_dir),
            ]
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
            )
            (path / "runner.stdout.log").write_text(completed.stdout[-20000:], encoding="utf-8")
            (path / "runner.stderr.log").write_text(completed.stderr[-20000:], encoding="utf-8")
            if completed.returncode != 0:
                raise RuntimeError(f"ChatGarment runner exited with code {completed.returncode}")
            update_job(job_id, progress=86)
            normalize_result(output_dir)
            update_job(job_id, status="ready", progress=100)
    except subprocess.TimeoutExpired:
        update_job(job_id, status="failed", progress=100, error="ChatGarment inference timed out")
    except Exception as exc:
        update_job(job_id, status="failed", progress=100, error=str(exc)[:500])


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "runnerConfigured": bool(RUNNER),
        "maxConcurrentJobs": MAX_CONCURRENT_JOBS,
    }


@app.post("/v1/try-on", status_code=202)
async def create_try_on(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(authorization)
    form = await request.form()
    try:
        body = json.loads(str(form.get("body", "{}")))
        garments = json.loads(str(form.get("garments", "[]")))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid body or garment manifest") from exc
    if not isinstance(body, dict) or not isinstance(garments, list) or not garments:
        raise HTTPException(status_code=400, detail="Body and at least one garment are required")

    job_id = uuid.uuid4().hex
    path = job_dir(job_id)
    input_dir = path / "input"
    input_dir.mkdir(parents=True)
    uploaded_fields: dict[str, str] = {}
    for field, value in form.multi_items():
        if not isinstance(value, UploadFile):
            continue
        safe_name = f"{field}{Path(value.filename or '').suffix.lower()[:8]}"
        await save_upload(value, input_dir / safe_name)
        uploaded_fields[field] = safe_name

    manifest = {
        "version": "muse-chatgarment-v1",
        "body": body,
        "garments": garments,
        "files": uploaded_fields,
    }
    (path / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    with jobs_lock:
        jobs[job_id] = Job(id=job_id, created_at=time.time())
    background_tasks.add_task(run_model, job_id)
    return {
        "status": "queued",
        "jobId": job_id,
        "progress": 5,
        "statusUrl": str(request.url_for("job_status", job_id=job_id)),
    }


@app.get("/v1/jobs/{job_id}", name="job_status")
def job_status(
    request: Request,
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(authorization)
    with jobs_lock:
        job = jobs.get(job_id)
        payload = asdict(job) if job else None
    if not payload:
        raise HTTPException(status_code=404, detail="Unknown job")
    if payload["status"] == "ready":
        payload["meshUrl"] = str(request.url_for("job_asset", job_id=job_id, asset="result.glb"))
        preview = job_dir(job_id) / "output" / "preview.png"
        if preview.exists():
            payload["renderUrl"] = str(request.url_for("job_asset", job_id=job_id, asset="preview.png"))
    return payload


@app.get("/v1/jobs/{job_id}/assets/{asset}", name="job_asset")
def job_asset(
    job_id: str,
    asset: str,
    authorization: str | None = Header(default=None),
) -> FileResponse:
    require_token(authorization)
    if asset not in {"result.glb", "preview.png"}:
        raise HTTPException(status_code=404, detail="Unknown asset")
    path = job_dir(job_id) / "output" / asset
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset not ready")
    media_type = "model/gltf-binary" if asset.endswith(".glb") else "image/png"
    return FileResponse(path, media_type=media_type, filename=asset)


@app.on_event("startup")
async def cleanup_old_jobs() -> None:
    cutoff = time.time() - 24 * 60 * 60
    for child in ROOT.iterdir():
        if child.is_dir() and child.stat().st_mtime < cutoff:
            await asyncio.to_thread(shutil.rmtree, child, True)
