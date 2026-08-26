# Muse ChatGarment GPU adapter

This service is the private GPU boundary between Muse Closet and a locally
installed ChatGarment/ContourCraft pipeline. Cloudflare sends one person photo,
the private wardrobe-item images, body measurements, and a garment manifest as
multipart form data. The adapter runs the configured model command asynchronously
and exposes a short-lived job status API. Muse then copies the final GLB and
preview image into the user's private R2 prefix.

This directory does **not** vendor ChatGarment weights, SMPL-X assets, or model
datasets. Their licenses and download terms remain separate from Muse Closet.

Before configuring the runner on a notebook or GPU host, follow
[`docs/FREE_GPU_VALIDATION.md`](../../docs/FREE_GPU_VALIDATION.md) and run:

```bash
python preflight.py
```

The preflight reports the CUDA device, visible memory, repositories, weights
and `flash-attn` availability. It never downloads assets or starts inference.

## Runner contract

Set `CHATGARMENT_RUNNER` to an executable command installed in the same GPU
image. The adapter appends:

```text
--manifest /data/.../manifest.json
--input-dir /data/.../input
--output-dir /data/.../output
```

The runner should:

1. reconstruct or load the body mesh from the `person` file and measurements;
2. use each garment image field listed in the manifest to estimate a sewing
   pattern or reusable garment mesh;
3. stitch/drape the selected layers on the body with GarmentCode and
   ContourCraft/HOOD;
4. write `result.glb` (preferred) or `result.obj` to the output directory;
5. optionally write `preview.png`.

The adapter converts `result.obj` to `result.glb` when needed. It never invents
an AI result when the runner is missing: the job fails with a clear status and
the Muse web app falls back to its labelled WebGL preview.

## Required environment

```text
MUSE_ADAPTER_TOKEN=<long random secret>
CHATGARMENT_RUNNER=python /opt/muse-chatgarment/run_pipeline.py
MUSE_JOB_ROOT=/data/muse-tryon-jobs
MAX_CONCURRENT_JOBS=1
CHATGARMENT_TIMEOUT_SECONDS=1800
```

Deploy this image on an NVIDIA GPU host together with the official
[ChatGarment](https://github.com/biansy000/ChatGarment) checkout and its model
assets. Point Cloudflare's `GARMENT_3D_URL` to `/v1/try-on`, and store the same
token as the `GARMENT_3D_TOKEN` Worker secret.
