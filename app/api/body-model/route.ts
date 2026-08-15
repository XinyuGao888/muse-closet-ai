import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { defaultMeasurements, type BodyMeasurements, type BodyModel } from "@/lib/phase-two-three";

type BodyRow = {
  id: string;
  name: string;
  sourceType: BodyModel["sourceType"];
  measurements: string;
  meshUrl: string | null;
  renderUrl: string | null;
  modelMode: BodyModel["modelMode"];
  status: string;
};

function safeMeasurements(value: Partial<BodyMeasurements>): BodyMeasurements {
  const number = (key: keyof Omit<BodyMeasurements, "gender">, min: number, max: number) => {
    const parsed = Number(value[key] ?? defaultMeasurements[key]);
    return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : defaultMeasurements[key]));
  };
  return {
    gender: String(value.gender ?? defaultMeasurements.gender).slice(0, 20),
    height: number("height", 135, 215),
    weight: number("weight", 35, 180),
    chest: number("chest", 60, 150),
    waist: number("waist", 50, 150),
    hips: number("hips", 65, 160),
    shoulder: number("shoulder", 30, 65),
    inseam: number("inseam", 55, 110),
  };
}

function toModel(row: BodyRow): BodyModel {
  let measurements = defaultMeasurements;
  try { measurements = safeMeasurements(JSON.parse(row.measurements) as Partial<BodyMeasurements>); } catch { /* use defaults */ }
  return { ...row, measurements };
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
  return (await response.json()) as { meshUrl?: string; renderUrl?: string; measurements?: Partial<BodyMeasurements> };
}

async function latest(userId: string) {
  const row = await runtime.DB.prepare(
    `SELECT id, name, source_type AS sourceType, measurements, mesh_url AS meshUrl,
    render_url AS renderUrl, model_mode AS modelMode, status FROM body_models
    WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(userId).first<BodyRow>();
  return row ? toModel(row) : null;
}

export async function GET(request: Request) {
  await ensureSchema();
  return Response.json({ model: await latest(getUserId(request)) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as {
      action?: "build" | "simulate";
      measurements?: Partial<BodyMeasurements>;
      bodyModelId?: string;
      itemIds?: string[];
      name?: string;
    };
    if (payload.action === "simulate") {
      const body = payload.bodyModelId
        ? await runtime.DB.prepare(
            `SELECT id, name, source_type AS sourceType, measurements, mesh_url AS meshUrl,
            render_url AS renderUrl, model_mode AS modelMode, status FROM body_models
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
      return Response.json({ sessionId, mode: modelMode, meshUrl, renderUrl, garments });
    }

    const measurements = safeMeasurements(payload.measurements ?? {});
    let meshUrl: string | null = null;
    let renderUrl: string | null = null;
    let modelMode: BodyModel["modelMode"] = "parametric";
    if (runtime.MHR_URL) {
      try {
        const result = await callJsonAdapter(runtime.MHR_URL, runtime.MHR_TOKEN, {
          action: "measurements_to_body",
          measurements,
        });
        meshUrl = result.meshUrl ?? null;
        renderUrl = result.renderUrl ?? null;
        modelMode = "mhr";
      } catch {
        // Use the deterministic parametric avatar.
      }
    }
    const id = crypto.randomUUID();
    await runtime.DB.prepare(
      `INSERT INTO body_models
      (id, user_id, name, source_type, measurements, mesh_url, render_url, model_mode, status)
      VALUES (?, ?, ?, 'measurements', ?, ?, ?, ?, 'ready')`,
    ).bind(id, userId, String(payload.name || "我的参数人体").slice(0, 60), JSON.stringify(measurements), meshUrl, renderUrl, modelMode).run();
    return Response.json({ model: await latest(userId) }, { status: 201 });
  }

  const form = await request.formData();
  const front = form.get("front");
  const side = form.get("side");
  let provided: Partial<BodyMeasurements> = {};
  try { provided = JSON.parse(String(form.get("measurements") || "{}")) as Partial<BodyMeasurements>; } catch { /* use defaults */ }
  const measurements = safeMeasurements(provided);
  if (!(front instanceof File)) return Response.json({ error: "请上传正面全身照" }, { status: 400 });

  let meshUrl: string | null = null;
  let renderUrl: string | null = null;
  let modelMode: BodyModel["modelMode"] = "parametric";
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
      const result = (await response.json()) as { meshUrl?: string; renderUrl?: string; measurements?: Partial<BodyMeasurements> };
      meshUrl = result.meshUrl ?? null;
      renderUrl = result.renderUrl ?? null;
      if (result.measurements) Object.assign(measurements, safeMeasurements(result.measurements));
      modelMode = "sam3d";
    } catch {
      // Photo-guided parametric preview remains available.
    }
  }
  const id = crypto.randomUUID();
  await runtime.DB.prepare(
    `INSERT INTO body_models
    (id, user_id, name, source_type, measurements, mesh_url, render_url, model_mode, status)
    VALUES (?, ?, ?, 'photos', ?, ?, ?, ?, 'ready')`,
  ).bind(id, userId, String(form.get("name") || "我的双照人体").slice(0, 60), JSON.stringify(measurements), meshUrl, renderUrl, modelMode).run();
  return Response.json({ model: await latest(userId) }, { status: 201 });
}
