import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { defaultMeasurements, type BodyMeasurements, type BodyModel } from "@/lib/phase-two-three";

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

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const history = await models(userId);
  return Response.json({ model: history[0] ?? null, models: history });
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
        "SELECT id, name, category, color FROM garments WHERE id = ? AND user_id = ?",
      ).bind(id, userId).first<{ id: string; name: string; category: string; color: string }>()))
        .then((items) => items.filter(Boolean));
      let modelMode: BodyModel["modelMode"] = "parametric";
      let meshUrl: string | null = body.meshUrl;
      let renderUrl: string | null = null;
      if (runtime.MHR_URL) {
        try {
          const result = await callJsonAdapter(runtime.MHR_URL, runtime.MHR_TOKEN, {
            action: "garment_simulation",
            body: toModel(body),
            garments,
          });
          meshUrl = result.meshUrl ?? meshUrl;
          renderUrl = result.renderUrl ?? null;
          modelMode = "mhr";
        } catch {
          // Parametric preview remains interactive when MHR is unavailable.
        }
      }
      const sessionId = crypto.randomUUID();
      await runtime.DB.prepare(
        `INSERT INTO tryon_sessions (id, user_id, body_model_id, mode, item_ids, result_url, status)
        VALUES (?, ?, ?, '3d', ?, ?, 'ready')`,
      ).bind(sessionId, userId, body.id, JSON.stringify(payload.itemIds), renderUrl).run();
      if (payload.styleSessionId) {
        await runtime.DB.prepare("UPDATE style_twin_sessions SET tryon_session_id = ? WHERE id = ? AND user_id = ?")
          .bind(sessionId, payload.styleSessionId, userId).run();
      }
      return Response.json({ sessionId, mode: modelMode, meshUrl, renderUrl, garments });
    }

    const measurements = safeMeasurements(payload.measurements ?? {});
    let meshUrl: string | null = null;
    let renderUrl: string | null = null;
    let modelMode: BodyModel["modelMode"] = "parametric";
    let profileConfidence = 0.96;
    if (runtime.MHR_URL) {
      try {
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
  if (!front.type.startsWith("image/") || front.size > 12_000_000) return Response.json({ error: "正面照需为 12MB 以内的图片" }, { status: 400 });
  if (side instanceof File && (!side.type.startsWith("image/") || side.size > 12_000_000)) return Response.json({ error: "侧面照需为 12MB 以内的图片" }, { status: 400 });

  const id = crypto.randomUUID();
  let meshUrl: string | null = null;
  let renderUrl: string | null = null;
  let modelMode: BodyModel["modelMode"] = "parametric";
  let profileConfidence = side instanceof File ? 0.82 : 0.72;
  if (runtime.SAM3D_BODY_URL) {
    try {
      const upstream = new FormData();
      upstream.set("front", front, front.name);
      if (side instanceof File) upstream.set("side", side, side.name);
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
  const sidePhotoKey = side instanceof File ? `body-models/${userId}/${id}/side` : null;
  await runtime.WARDROBE_IMAGES.put(frontPhotoKey, await front.arrayBuffer(), { httpMetadata: { contentType: front.type || "image/jpeg" } });
  if (side instanceof File && sidePhotoKey) {
    await runtime.WARDROBE_IMAGES.put(sidePhotoKey, await side.arrayBuffer(), { httpMetadata: { contentType: side.type || "image/jpeg" } });
  }
  await runtime.DB.prepare(
    `INSERT INTO body_models
    (id, user_id, name, source_type, measurements, mesh_url, render_url, front_photo_key, side_photo_key,
    profile_confidence, model_mode, status)
    VALUES (?, ?, ?, 'photos', ?, ?, ?, ?, ?, ?, ?, 'ready')`,
  ).bind(id, userId, String(form.get("name") || "我的照片人体").slice(0, 60), JSON.stringify(measurements), meshUrl, renderUrl, frontPhotoKey, sidePhotoKey, profileConfidence, modelMode).run();
  return Response.json({ model: await latest(userId) }, { status: 201 });
}
