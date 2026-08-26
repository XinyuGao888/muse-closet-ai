import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { defaultMeasurements, type BodyMeasurements, type BodyModel } from "@/lib/phase-two-three";
import { reserveModelCall, reserveUpload, validateImageFile } from "@/lib/security";

type BodyRow = {
  id: string;
  name: string;
  sourceType: BodyModel["sourceType"];
  measurements: string;
  meshUrl: string | null;
  renderUrl: string | null;
  frontPhotoKey: string | null;
  sidePhotoKey: string | null;
  profileConfidence: number;
  modelMode: BodyModel["modelMode"];
  status: string;
  createdAt: string;
};

function safeMeasurements(value: Partial<BodyMeasurements>): BodyMeasurements {
  type NumericKey = "height" | "weight" | "chest" | "waist" | "hips" | "shoulder" | "inseam";
  const number = (key: NumericKey, min: number, max: number) => {
    const parsed = Number(value[key] ?? defaultMeasurements[key]);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : defaultMeasurements[key]));
  };
  const text = (key: Exclude<keyof BodyMeasurements, NumericKey>, max = 30) =>
    String(value[key] ?? defaultMeasurements[key]).slice(0, max);
  return {
    gender: text("gender", 20),
    height: number("height", 135, 215),
    weight: number("weight", 35, 180),
    chest: number("chest", 60, 150),
    waist: number("waist", 50, 150),
    hips: number("hips", 65, 160),
    shoulder: number("shoulder", 30, 65),
    inseam: number("inseam", 55, 110),
    bodyShape: text("bodyShape"),
    skinTone: text("skinTone"),
    hairStyle: text("hairStyle"),
    hairColor: text("hairColor"),
    shoulderSlope: text("shoulderSlope"),
    posture: text("posture"),
  };
}

function toModel(row: BodyRow): BodyModel {
  let measurements = defaultMeasurements;
  try { measurements = safeMeasurements(JSON.parse(row.measurements) as Partial<BodyMeasurements>); } catch { /* use defaults */ }
  const { frontPhotoKey, sidePhotoKey, ...publicRow } = row;
  return {
    ...publicRow,
    measurements,
    frontPhotoUrl: frontPhotoKey ? `/api/body-model/image?id=${encodeURIComponent(row.id)}&view=front` : null,
    sidePhotoUrl: sidePhotoKey ? `/api/body-model/image?id=${encodeURIComponent(row.id)}&view=side` : null,
  };
}

async function callJsonAdapter(url: string, token: string | undefined, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("3D adapter unavailable");
  return (await response.json()) as { meshUrl?: string; renderUrl?: string; measurements?: Partial<BodyMeasurements>; profileConfidence?: number };
}

type GarmentAdapterItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  pattern: string;
  material: string;
  imageKey: string | null;
  imageType: string | null;
};

type GarmentAdapterResult = {
  status?: "queued" | "processing" | "ready" | "failed";
  jobId?: string;
  statusUrl?: string;
  progress?: number;
  meshUrl?: string;
  renderUrl?: string;
  error?: string;
};

type TryOnRow = {
  id: string;
  bodyModelId: string | null;
  mode: string;
  itemIds: string;
  resultUrl: string | null;
  resultKey: string | null;
  renderKey: string | null;
  externalJobId: string | null;
  externalStatusUrl: string | null;
  status: string;
  progress: number;
  errorMessage: string | null;
};

const tryOnSelect = `SELECT id, body_model_id AS bodyModelId, mode, item_ids AS itemIds,
  result_url AS resultUrl, result_key AS resultKey, render_key AS renderKey,
  external_job_id AS externalJobId, external_status_url AS externalStatusUrl,
  status, progress, error_message AS errorMessage FROM tryon_sessions`;

function clampProgress(value: unknown, fallback = 10) {
  const parsed = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : fallback));
}

function tryOnPayload(row: TryOnRow) {
  let itemIds: string[] = [];
  try { itemIds = JSON.parse(row.itemIds) as string[]; } catch { /* keep empty */ }
  return {
    sessionId: row.id,
    bodyModelId: row.bodyModelId,
    mode: row.mode,
    itemIds,
    status: row.status,
    progress: clampProgress(row.progress, row.status === "ready" ? 100 : 10),
    meshUrl: row.resultKey ? `/api/body-model/result?id=${encodeURIComponent(row.id)}&kind=mesh` : null,
    renderUrl: row.renderKey
      ? `/api/body-model/result?id=${encodeURIComponent(row.id)}&kind=render`
      : row.resultUrl,
    error: row.errorMessage,
  };
}

function adapterAllowedUrl(value: string) {
  if (!runtime.GARMENT_3D_URL) return false;
  try {
    const candidate = new URL(value);
    const adapter = new URL(runtime.GARMENT_3D_URL);
    const extraHosts = (runtime.GARMENT_3D_RESULT_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    return candidate.origin === adapter.origin
      || (candidate.protocol === "https:" && extraHosts.includes(candidate.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

async function r2File(key: string, fileName: string, fallbackType: string) {
  const object = await runtime.WARDROBE_IMAGES.get(key);
  if (!object) return null;
  const bytes = await new Response(object.body).arrayBuffer();
  return new File([bytes], fileName, { type: object.httpMetadata?.contentType ?? fallbackType });
}

async function callGarmentAdapter(body: BodyRow, garments: GarmentAdapterItem[]) {
  if (!runtime.GARMENT_3D_URL) throw new Error("3D adapter unavailable");
  const form = new FormData();
  form.set("action", "garment_simulation");
  form.set("body", JSON.stringify({
    id: body.id,
    sourceType: body.sourceType,
    modelMode: body.modelMode,
    measurements: toModel(body).measurements,
    meshUrl: body.meshUrl,
    profileConfidence: body.profileConfidence,
  }));

  if (body.frontPhotoKey) {
    const person = await r2File(body.frontPhotoKey, "person-front.jpg", "image/jpeg");
    if (person) form.set("person", person, person.name);
  }
  if (body.sidePhotoKey) {
    const side = await r2File(body.sidePhotoKey, "person-side.jpg", "image/jpeg");
    if (side) form.set("person_side", side, side.name);
  }

  const manifest: Array<Omit<GarmentAdapterItem, "imageKey" | "imageType"> & { imageField: string | null }> = [];
  for (const [index, garment] of garments.entries()) {
    let imageField: string | null = null;
    if (garment.imageKey) {
      const candidateField = `garment_${index}`;
      const image = await r2File(garment.imageKey, `${garment.id}.png`, garment.imageType ?? "image/png");
      if (image) {
        form.set(candidateField, image, image.name);
        imageField = candidateField;
      }
    }
    manifest.push({
      id: garment.id,
      name: garment.name,
      category: garment.category,
      color: garment.color,
      pattern: garment.pattern,
      material: garment.material,
      imageField,
    });
  }
  form.set("garments", JSON.stringify(manifest));

  const response = await fetch(runtime.GARMENT_3D_URL, {
    method: "POST",
    headers: runtime.GARMENT_3D_TOKEN ? { authorization: `Bearer ${runtime.GARMENT_3D_TOKEN}` } : undefined,
    body: form,
  });
  if (!response.ok) throw new Error("3D adapter unavailable");
  return (await response.json()) as GarmentAdapterResult;
}

async function storeAdapterAsset(
  sourceUrl: string | undefined,
  objectKey: string,
  kind: "mesh" | "render",
) {
  if (!sourceUrl || !adapterAllowedUrl(sourceUrl)) return null;
  const adapterOrigin = runtime.GARMENT_3D_URL ? new URL(runtime.GARMENT_3D_URL).origin : "";
  const sourceOrigin = new URL(sourceUrl).origin;
  const response = await fetch(sourceUrl, {
    headers: sourceOrigin === adapterOrigin && runtime.GARMENT_3D_TOKEN
      ? { authorization: `Bearer ${runtime.GARMENT_3D_TOKEN}` }
      : undefined,
  });
  if (!response.ok) return null;
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  const maxBytes = kind === "mesh" ? 60 * 1024 * 1024 : 12 * 1024 * 1024;
  if (declaredBytes > maxBytes) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  const contentType = response.headers.get("content-type")
    ?? (kind === "mesh" ? "model/gltf-binary" : "image/png");
  await runtime.WARDROBE_IMAGES.put(objectKey, bytes, { httpMetadata: { contentType } });
  return objectKey;
}

async function persistAdapterResult(userId: string, sessionId: string, result: GarmentAdapterResult) {
  const resultKey = await storeAdapterAsset(
    result.meshUrl,
    `tryon-results/${userId}/${sessionId}/result.glb`,
    "mesh",
  );
  const renderKey = await storeAdapterAsset(
    result.renderUrl,
    `tryon-results/${userId}/${sessionId}/preview.png`,
    "render",
  );
  return { resultKey, renderKey };
}

async function pollTryOn(row: TryOnRow, userId: string) {
  if (!["queued", "processing"].includes(row.status) || !row.externalStatusUrl || !adapterAllowedUrl(row.externalStatusUrl)) {
    return row;
  }
  try {
    const adapterOrigin = runtime.GARMENT_3D_URL ? new URL(runtime.GARMENT_3D_URL).origin : "";
    const statusOrigin = new URL(row.externalStatusUrl).origin;
    const response = await fetch(row.externalStatusUrl, {
      headers: statusOrigin === adapterOrigin && runtime.GARMENT_3D_TOKEN
        ? { authorization: `Bearer ${runtime.GARMENT_3D_TOKEN}` }
        : undefined,
    });
    if (!response.ok) return row;
    const result = (await response.json()) as GarmentAdapterResult;
    const status = result.status === "failed" ? "failed"
      : result.status === "ready" ? "ready"
        : "processing";
    const progress = status === "ready" ? 100 : clampProgress(result.progress, row.progress);
    let resultKey = row.resultKey;
    let renderKey = row.renderKey;
    if (status === "ready") {
      const stored = await persistAdapterResult(userId, row.id, result);
      resultKey = stored.resultKey;
      renderKey = stored.renderKey;
      if (!resultKey && !renderKey) throw new Error("3D 服务没有返回可保存的结果");
    }
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET status = ?, progress = ?, result_key = ?, render_key = ?,
      error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    ).bind(status, progress, resultKey, renderKey, result.error ?? null, row.id, userId).run();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "3D 结果处理失败";
    await runtime.DB.prepare(
      "UPDATE tryon_sessions SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(message, row.id, userId).run();
  }
  return (await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
    .bind(row.id, userId).first<TryOnRow>()) ?? row;
}

const modelSelect = `SELECT id, name, source_type AS sourceType, measurements, mesh_url AS meshUrl,
  render_url AS renderUrl, front_photo_key AS frontPhotoKey, side_photo_key AS sidePhotoKey,
  profile_confidence AS profileConfidence, model_mode AS modelMode, status, created_at AS createdAt
  FROM body_models`;

async function models(userId: string) {
  const { results } = await runtime.DB.prepare(
    `${modelSelect} WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
  ).bind(userId).all<BodyRow>();
  return results.map(toModel);
}

async function latest(userId: string) {
  const row = await runtime.DB.prepare(
    `SELECT id, name, source_type AS sourceType, measurements, mesh_url AS meshUrl,
    render_url AS renderUrl, front_photo_key AS frontPhotoKey, side_photo_key AS sidePhotoKey,
    profile_confidence AS profileConfidence, model_mode AS modelMode, status, created_at AS createdAt FROM body_models
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId).first<BodyRow>();
  return row ? toModel(row) : null;
}

async function latestTryOn(userId: string) {
  return runtime.DB.prepare(`${tryOnSelect} WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(userId).first<TryOnRow>();
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId) {
    const session = await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
      .bind(sessionId, userId).first<TryOnRow>();
    if (!session) return Response.json({ error: "没有找到这次试穿任务" }, { status: 404 });
    return Response.json({ tryon: tryOnPayload(await pollTryOn(session, userId)) });
  }
  const history = await models(userId);
  const recentTryOn = await latestTryOn(userId);
  return Response.json({
    model: history[0] ?? null,
    models: history,
    tryon: recentTryOn ? tryOnPayload(await pollTryOn(recentTryOn, userId)) : null,
    capabilities: {
      garmentGpu: Boolean(runtime.GARMENT_3D_URL),
      bodyReconstruction: Boolean(runtime.SAM3D_BODY_URL),
      budgetProtected: true,
    },
  });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as {
      action?: "build" | "simulate" | "removePhotos";
      measurements?: Partial<BodyMeasurements>;
      bodyModelId?: string;
      itemIds?: string[];
      name?: string;
      styleSessionId?: string;
    };
    if (payload.action === "removePhotos") {
      const row = payload.bodyModelId ? await runtime.DB.prepare(
        "SELECT front_photo_key AS frontPhotoKey, side_photo_key AS sidePhotoKey FROM body_models WHERE id = ? AND user_id = ?",
      ).bind(payload.bodyModelId, userId).first<{ frontPhotoKey: string | null; sidePhotoKey: string | null }>() : null;
      if (!row || !payload.bodyModelId) return Response.json({ error: "没有找到人体模型" }, { status: 404 });
      await Promise.all([row.frontPhotoKey, row.sidePhotoKey].filter((key): key is string => Boolean(key)).map((key) => runtime.WARDROBE_IMAGES.delete(key)));
      await runtime.DB.prepare("UPDATE body_models SET front_photo_key = NULL, side_photo_key = NULL WHERE id = ? AND user_id = ?")
        .bind(payload.bodyModelId, userId).run();
      return Response.json({ model: await latest(userId) });
    }
    if (payload.action === "simulate") {
      const body = payload.bodyModelId
        ? await runtime.DB.prepare(
            `SELECT id, name, source_type AS sourceType, measurements, mesh_url AS meshUrl,
            render_url AS renderUrl, front_photo_key AS frontPhotoKey, side_photo_key AS sidePhotoKey,
            profile_confidence AS profileConfidence, model_mode AS modelMode, status, created_at AS createdAt FROM body_models
            WHERE id = ? AND user_id = ?`,
          ).bind(payload.bodyModelId, userId).first<BodyRow>()
        : null;
      if (!body || !Array.isArray(payload.itemIds) || payload.itemIds.length === 0) {
        return Response.json({ error: "请先创建人体并选择衣物" }, { status: 400 });
      }
      const garments = await Promise.all(payload.itemIds.slice(0, 6).map((id) => runtime.DB.prepare(
        `SELECT id, name, category, color, pattern, material, image_key AS imageKey, image_type AS imageType
        FROM garments WHERE id = ? AND user_id = ?`,
      ).bind(id, userId).first<GarmentAdapterItem>()))
        .then((items) => items.filter((item): item is GarmentAdapterItem => Boolean(item)));
      if (garments.length === 0) return Response.json({ error: "没有找到可试穿的衣物" }, { status: 404 });

      const sessionId = crypto.randomUUID();
      let fallbackReason: string | null = null;
      if (runtime.GARMENT_3D_URL) {
        const modelQuota = await reserveModelCall(userId, "body_simulation");
        if (modelQuota.ok) {
          try {
            const result = await callGarmentAdapter(body, garments);
            const adapterStatus = result.status
              ?? (result.meshUrl || result.renderUrl ? "ready" : result.jobId ? "queued" : "failed");
            if (["queued", "processing"].includes(adapterStatus) && result.statusUrl && adapterAllowedUrl(result.statusUrl)) {
              await runtime.DB.prepare(
                `INSERT INTO tryon_sessions
                (id, user_id, body_model_id, mode, item_ids, status, progress, external_job_id, external_status_url)
                VALUES (?, ?, ?, 'chatgarment', ?, 'processing', ?, ?, ?)`,
              ).bind(
                sessionId,
                userId,
                body.id,
                JSON.stringify(payload.itemIds),
                clampProgress(result.progress, 8),
                result.jobId ?? null,
                result.statusUrl,
              ).run();
              if (payload.styleSessionId) {
                await runtime.DB.prepare("UPDATE style_twin_sessions SET tryon_session_id = ? WHERE id = ? AND user_id = ?")
                  .bind(sessionId, payload.styleSessionId, userId).run();
              }
              const session = await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
                .bind(sessionId, userId).first<TryOnRow>();
              return Response.json({ tryon: session ? tryOnPayload(session) : null }, { status: 202 });
            }
            if (adapterStatus === "ready") {
              const stored = await persistAdapterResult(userId, sessionId, result);
              if (stored.resultKey || stored.renderKey) {
                await runtime.DB.prepare(
                  `INSERT INTO tryon_sessions
                  (id, user_id, body_model_id, mode, item_ids, result_key, render_key, status, progress)
                  VALUES (?, ?, ?, 'chatgarment', ?, ?, ?, 'ready', 100)`,
                ).bind(sessionId, userId, body.id, JSON.stringify(payload.itemIds), stored.resultKey, stored.renderKey).run();
                if (payload.styleSessionId) {
                  await runtime.DB.prepare("UPDATE style_twin_sessions SET tryon_session_id = ? WHERE id = ? AND user_id = ?")
                    .bind(sessionId, payload.styleSessionId, userId).run();
                }
                const session = await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
                  .bind(sessionId, userId).first<TryOnRow>();
                return Response.json({ tryon: session ? tryOnPayload(session) : null });
              }
            }
            fallbackReason = result.error ?? "GPU 服务没有返回可保存的 3D 结果";
          } catch {
            fallbackReason = "GPU 服装仿真暂时不可用";
          }
        } else {
          fallbackReason = "今日 GPU 试穿额度已用完";
        }
      }

      await runtime.DB.prepare(
        `INSERT INTO tryon_sessions (id, user_id, body_model_id, mode, item_ids, status, progress, error_message)
        VALUES (?, ?, ?, 'webgl', ?, 'ready', 100, ?)`,
      ).bind(sessionId, userId, body.id, JSON.stringify(payload.itemIds), fallbackReason).run();
      if (payload.styleSessionId) {
        await runtime.DB.prepare("UPDATE style_twin_sessions SET tryon_session_id = ? WHERE id = ? AND user_id = ?")
          .bind(sessionId, payload.styleSessionId, userId).run();
      }
      const session = await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
        .bind(sessionId, userId).first<TryOnRow>();
      return Response.json({ tryon: session ? tryOnPayload(session) : null, fallbackReason });
    }

    const measurements = safeMeasurements(payload.measurements ?? {});
    let meshUrl: string | null = null;
    let renderUrl: string | null = null;
    let modelMode: BodyModel["modelMode"] = "parametric";
    let profileConfidence = 0.96;
    if (runtime.MHR_URL) {
      const modelQuota = await reserveModelCall(userId, "body_simulation");
      if (modelQuota.ok) try {
        const result = await callJsonAdapter(runtime.MHR_URL, runtime.MHR_TOKEN, {
          action: "measurements_to_body",
          measurements,
        });
        meshUrl = result.meshUrl ?? null;
        renderUrl = result.renderUrl ?? null;
        modelMode = "mhr";
        profileConfidence = Math.max(0.5, Math.min(1, result.profileConfidence ?? 0.96));
      } catch {
        // Use the deterministic parametric avatar.
      }
    }
    const id = crypto.randomUUID();
    await runtime.DB.prepare(
      `INSERT INTO body_models
      (id, user_id, name, source_type, measurements, mesh_url, render_url, profile_confidence, model_mode, status)
      VALUES (?, ?, ?, 'measurements', ?, ?, ?, ?, ?, 'ready')`,
    ).bind(id, userId, String(payload.name || "我的参数人体").slice(0, 60), JSON.stringify(measurements), meshUrl, renderUrl, profileConfidence, modelMode).run();
    return Response.json({ model: await latest(userId) }, { status: 201 });
  }

  const form = await request.formData();
  const front = form.get("front");
  const side = form.get("side");
  let provided: Partial<BodyMeasurements> = {};
  try { provided = JSON.parse(String(form.get("measurements") || "{}")) as Partial<BodyMeasurements>; } catch { /* use defaults */ }
  const measurements = safeMeasurements(provided);
  if (!(front instanceof File)) return Response.json({ error: "请上传正面全身照" }, { status: 400 });
  const sidePhoto = side instanceof File && side.size > 0 ? side : null;
  const photos = [front, ...(sidePhoto ? [sidePhoto] : [])];
  for (const photo of photos) {
    const imageError = await validateImageFile(photo);
    if (imageError) return Response.json({ error: imageError }, { status: 400 });
  }
  const uploadQuota = await reserveUpload(userId, "body_photos", photos);
  if (!uploadQuota.ok) return uploadQuota.response;

  const id = crypto.randomUUID();
  let meshUrl: string | null = null;
  let renderUrl: string | null = null;
  let modelMode: BodyModel["modelMode"] = "parametric";
  let profileConfidence = sidePhoto ? 0.82 : 0.72;
  if (runtime.SAM3D_BODY_URL) {
    const modelQuota = await reserveModelCall(userId, "body_reconstruction");
    if (modelQuota.ok) try {
      const upstream = new FormData();
      upstream.set("front", front, front.name);
      if (sidePhoto) upstream.set("side", sidePhoto, sidePhoto.name);
      upstream.set("measurements", JSON.stringify(measurements));
      const response = await fetch(runtime.SAM3D_BODY_URL, {
        method: "POST",
        headers: runtime.SAM3D_BODY_TOKEN ? { authorization: `Bearer ${runtime.SAM3D_BODY_TOKEN}` } : undefined,
        body: upstream,
      });
      if (!response.ok) throw new Error("SAM 3D Body unavailable");
      const result = (await response.json()) as { meshUrl?: string; renderUrl?: string; measurements?: Partial<BodyMeasurements>; profileConfidence?: number };
      meshUrl = result.meshUrl ?? null;
      renderUrl = result.renderUrl ?? null;
      if (result.measurements) Object.assign(measurements, safeMeasurements(result.measurements));
      modelMode = "sam3d";
      profileConfidence = Math.max(0.5, Math.min(1, result.profileConfidence ?? 0.9));
    } catch {
      // Photo-guided parametric preview remains available.
    }
  }
  const frontPhotoKey = `body-models/${userId}/${id}/front`;
  const sidePhotoKey = sidePhoto ? `body-models/${userId}/${id}/side` : null;
  await runtime.WARDROBE_IMAGES.put(frontPhotoKey, await front.arrayBuffer(), { httpMetadata: { contentType: front.type || "image/jpeg" } });
  if (sidePhoto && sidePhotoKey) {
    await runtime.WARDROBE_IMAGES.put(sidePhotoKey, await sidePhoto.arrayBuffer(), { httpMetadata: { contentType: sidePhoto.type || "image/jpeg" } });
  }
  await runtime.DB.prepare(
    `INSERT INTO body_models
    (id, user_id, name, source_type, measurements, mesh_url, render_url, front_photo_key, side_photo_key,
    profile_confidence, model_mode, status)
    VALUES (?, ?, ?, 'photos', ?, ?, ?, ?, ?, ?, ?, 'ready')`,
  ).bind(id, userId, String(form.get("name") || "我的照片人体").slice(0, 60), JSON.stringify(measurements), meshUrl, renderUrl, frontPhotoKey, sidePhotoKey, profileConfidence, modelMode).run();
  return Response.json({ model: await latest(userId) }, { status: 201 });
}
