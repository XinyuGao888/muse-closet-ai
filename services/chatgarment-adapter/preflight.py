"""Check whether a notebook or GPU host can run the Muse ChatGarment pipeline.

This does not download weights or start a billable resource. Run it after the
official repositories and model assets have been placed on the machine.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
from pathlib import Path


def mark(ok: bool) -> str:
    return "OK" if ok else "MISSING"


def main() -> int:
    chatgarment = Path(os.environ.get("CHATGARMENT_ROOT", "/workspace/ChatGarment"))
    garmentcode = Path(os.environ.get("GARMENTCODE_ROOT", "/workspace/GarmentCodeRC"))
    weights = Path(
        os.environ.get(
            "CHATGARMENT_WEIGHTS",
            str(chatgarment / "checkpoints/try_7b_lr1e_4_v3_garmentcontrol_4h100_v4_final/pytorch_model.bin"),
        )
    )

    checks: list[tuple[str, bool, str]] = [
        ("ChatGarment repository", (chatgarment / "README.md").exists(), str(chatgarment)),
        ("GarmentCodeRC repository", garmentcode.exists(), str(garmentcode)),
        ("Pretrained weights", weights.exists() and weights.stat().st_size > 0, str(weights)),
        ("nvidia-smi", shutil.which("nvidia-smi") is not None, shutil.which("nvidia-smi") or "not found"),
        ("flash-attn", importlib.util.find_spec("flash_attn") is not None, "Python import flash_attn"),
    ]

    cuda_ok = False
    cuda_detail = "PyTorch unavailable"
    try:
        import torch

        cuda_ok = torch.cuda.is_available()
        if cuda_ok:
            props = torch.cuda.get_device_properties(0)
            cuda_detail = f"{torch.cuda.get_device_name(0)} · {props.total_memory / 1024**3:.1f} GiB"
        else:
            cuda_detail = "torch.cuda.is_available() returned False"
    except Exception as exc:  # pragma: no cover - diagnostic script
        cuda_detail = str(exc)
    checks.append(("PyTorch CUDA", cuda_ok, cuda_detail))

    print("Muse ChatGarment GPU preflight")
    print("=" * 36)
    for label, ok, detail in checks:
        print(f"[{mark(ok):7}] {label}: {detail}")

    if shutil.which("nvidia-smi"):
        subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv"], check=False)

    ready = all(ok for _, ok, _ in checks)
    print("\nREADY" if ready else "\nNOT READY — complete the missing items before running inference.")
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
