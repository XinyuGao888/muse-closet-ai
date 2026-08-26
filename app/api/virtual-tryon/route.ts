import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { demoGarmentAssetForId } from "@/lib/demo-assets";
import { ensureAppUser, reserveModelCall, reserveUpload, validateImageFile } from "@/lib/security";

export const dynamic = "force-dynamic";

type GarmentRow = {
  id: string;
  name: string;
  category: string;
  imageKey: string | null;
  imageType: string | null;
};

type TryOnRow = {
  id: string;
  itemIds: string;
  status: string;
  resultKey: string | null;
  personPhotoKey: string | null;
  providerName: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type FashnStatus = {
  id?: string;
  status?: "starting" | "in_queue" | "processing" | "completed" | "failed";
  output?: string[];
  error?: string | { name?: string; message?: string } | null;
  message?: string;
};

type TryOnProvider = {
  id: "tryoncloud" | "fashn";
  mode: "tryoncloud-vton" | "fashn-vton";
  name: string;
};

type GeneratedTryOn = {
  externalJobId: string;
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

const tryOnSelect = `SELECT id, item_ids AS itemIds, status, result_key AS resultKey,
  person_photo_key AS personPhotoKey, provider_name AS providerName,
  error_message AS errorMessage, created_at AS createdAt
  FROM tryon_sessions`;

function sessionPayload(row: TryOnRow) {
  let itemIds: string[] = [];
  try { itemIds = JSON.parse(row.itemIds) as string[]; } catch { /* keep empty */ }
  return {
    id: row.id,
    itemIds,
    status: row.status,
    resultUrl: row.resultKey ? `/api/virtual-tryon/image?id=${encodeURIComponent(row.id)}&kind=result` : null,
    personUrl: row.personPhotoKey ? `/api/virtual-tryon/image?id=${encodeURIComponent(row.id)}&kind=person` : null,
    provider: row.providerName ?? "真人试穿服务",
    error: row.errorMessage,
    createdAt: row.createdAt,
  };
}

function safeError(error: FashnStatus["error"]) {
  if (!error) return "试穿模型没有返回结果";
  if (typeof error === "string") return error.slice(0, 240);
  return String(error.message || error.name || "试穿生成失败").slice(0, 240);
}

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function dataUriToBytes(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) throw new Error("试穿模型返回了无法识别的图片格式");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes: bytes.buffer, contentType: match[1] };
}

function categoryForFashn(category: string) {
  if (category === "下装") return "bottoms";
  if (category === "连衣裙") return "one-pieces";
  return "tops";
}

function configuredProvider(): TryOnProvider | null {
  if (runtime.TRYONCLOUD_API_KEY) {
    return { id: "tryoncloud", mode: "tryoncloud-vton", name: "TryOnCloud Virtual Try-On" };
  }
  if (runtime.FASHN_API_KEY) {
    return { id: "fashn", mode: "fashn-vton", name: "FASHN Virtual Try-On v1.6" };
  }
  return null;
}

function imageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function providerError(response: Response) {
  try {
    const payload = await response.clone().json() as { error?: string; message?: string; code?: string };
    return String(payload.error || payload.message || payload.code || `试穿服务返回 ${response.status}`).slice(0, 240);
  } catch {
    const message = (await response.text()).trim();
    return (message || `试穿服务返回 ${response.status}`).slice(0, 240);
  }
}

async function runTryOnCloud(
  personBuffer: ArrayBuffer,
  personType: string,
  garmentBuffer: ArrayBuffer,
  garmentType: string,
): Promise<GeneratedTryOn> {
  const form = new FormData();
  form.set("person_image", new File([personBuffer], `person.${imageExtension(personType)}`, { type: personType }));
  form.set("garment_image", new File([garmentBuffer], `garment.${imageExtension(garmentType)}`, { type: garmentType }));
  const response = await fetch("https://www.tryoncloud.com/api/v1/generate", {
    method: "POST",
    headers: { "x-api-key": runtime.TRYONCLOUD_API_KEY! },
    body: form,
  });
  if (!response.ok) throw new Error(await providerError(response));
  const contentType = (response.headers.get("content-type") || "image/png").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new Error("试穿服务没有返回可用的图片结果");
  }
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error("试穿服务返回的图片大小异常");
  }
  return {
    externalJobId: response.headers.get("x-request-id") || crypto.randomUUID(),
    bytes,
    contentType: contentType as GeneratedTryOn["contentType"],
  };
}

async function runFashn(modelImage: string, garmentImage: string, category: string): Promise<GeneratedTryOn> {
  const response = await fetch("https://api.fashn.ai/v1/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${runtime.FASHN_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: modelImage,
        garment_image: garmentImage,
        category: categoryForFashn(category),
        garment_photo_type: "auto",
        mode: "quality",
        moderation_level: "conservative",
        output_format: "jpeg",
        return_base64: true,
        num_samples: 1,
      },
    }),
  });
  const initial = await response.json() as FashnStatus;
  if (!response.ok || !initial.id) throw new Error(initial.message || safeError(initial.error));

  for (let attempt = 0; attempt < 32; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt < 4 ? 1200 : 2000));
    const statusResponse = await fetch(`https://api.fashn.ai/v1/status/${encodeURIComponent(initial.id)}`, {
      headers: { authorization: `Bearer ${runtime.FASHN_API_KEY}` },
    });
    const status = await statusResponse.json() as FashnStatus;
    if (!statusResponse.ok) throw new Error(status.message || safeError(status.error));
    if (status.status === "failed") throw new Error(safeError(status.error));
    if (status.status === "completed") {
      const output = status.output?.[0];
      if (!output) throw new Error("试穿模型已完成，但没有返回图片");
      const decoded = dataUriToBytes(output);
      return {
        externalJobId: initial.id,
        bytes: decoded.bytes,
        contentType: decoded.contentType as GeneratedTryOn["contentType"],
      };
    }
  }
  throw new Error("生成时间超过预期，请稍后重试");
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const provider = configuredProvider();
  const rows = await runtime.DB.prepare(
    `${tryOnSelect} WHERE user_id = ? AND mode IN ('tryoncloud-vton', 'fashn-vton') ORDER BY created_at DESC LIMIT 8`,
  ).bind(userId).all<TryOnRow>();
  return Response.json({
    capabilities: {
      enabled: Boolean(provider),
      provider: provider?.name ?? "真人试穿服务",
      maxItems: 1,
      supportedCategories: ["上装", "下装", "连衣裙", "外套"],
    },
    sessions: rows.results.map(sessionPayload),
  });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await ensureAppUser(request, userId);
  const provider = configuredProvider();
  if (!provider) {
    return Response.json(
      { error: "真人试穿模型尚未配置，当前不会生成伪造结果。", code: "VTON_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const person = form.get("person");
  const itemId = String(form.get("itemId") || "");
  if (!(person instanceof File) || !itemId) {
    return Response.json({ error: "请上传一张真人全身照并选择一件衣服" }, { status: 400 });
  }
  const validationError = await validateImageFile(person);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const garment = await runtime.DB.prepare(
    `SELECT id, name, category, image_key AS imageKey, image_type AS imageType
     FROM garments WHERE id = ? AND user_id = ?`,
  ).bind(itemId, userId).first<GarmentRow>();
  if (!garment || !garment.imageKey) {
    return Response.json({ error: "这件衣服缺少可用于试穿的原图，请先补充衣物照片。" }, { status: 400 });
  }
  if (!["上装", "下装", "连衣裙", "外套"].includes(garment.category)) {
    return Response.json({ error: "当前真人试穿支持上装、下装、连衣裙和外套。" }, { status: 400 });
  }

  const uploadDecision = await reserveUpload(userId, "virtual_tryon_person", [person]);
  if (!uploadDecision.ok) return uploadDecision.response;
  const modelDecision = await reserveModelCall(
    userId,
    provider.id === "tryoncloud" ? "virtual_tryon_tryoncloud" : "virtual_tryon",
  );
  if (!modelDecision.ok) return modelDecision.response;

  const garmentObject = await runtime.WARDROBE_IMAGES.get(garment.imageKey);
  let garmentBuffer: ArrayBuffer;
  let garmentType: string;
  if (garmentObject) {
    garmentType = garmentObject.httpMetadata?.contentType ?? garment.imageType ?? "image/jpeg";
    garmentBuffer = await new Response(garmentObject.body).arrayBuffer();
  } else {
    const fallbackPath = demoGarmentAssetForId(garment.id);
    if (!fallbackPath) return Response.json({ error: "没有找到这件衣服的原图，请重新上传。" }, { status: 404 });
    const asset = await runtime.ASSETS.fetch(new Request(new URL(fallbackPath, request.url)));
    if (!asset.ok) return Response.json({ error: "没有找到这件衣服的原图，请重新上传。" }, { status: 404 });
    garmentType = asset.headers.get("content-type") ?? garment.imageType ?? "image/jpeg";
    garmentBuffer = await asset.arrayBuffer();
  }

  const sessionId = crypto.randomUUID();
  const extension = person.type === "image/png" ? "png" : person.type === "image/webp" ? "webp" : "jpg";
  const personKey = `tryon-inputs/${userId}/${sessionId}/person.${extension}`;
  const personBuffer = await person.arrayBuffer();
  await runtime.WARDROBE_IMAGES.put(personKey, personBuffer, { httpMetadata: { contentType: person.type } });
  await runtime.DB.prepare(
    `INSERT INTO tryon_sessions
     (id, user_id, mode, item_ids, status, progress, person_photo_key, person_photo_type, provider_name)
     VALUES (?, ?, ?, ?, 'processing', 10, ?, ?, ?)`,
  ).bind(sessionId, userId, provider.mode, JSON.stringify([garment.id]), personKey, person.type, provider.name).run();

  try {
    const generated = provider.id === "tryoncloud"
      ? await runTryOnCloud(personBuffer, person.type, garmentBuffer, garmentType)
      : await runFashn(
          `data:${person.type};base64,${bytesToBase64(personBuffer)}`,
          `data:${garmentType};base64,${bytesToBase64(garmentBuffer)}`,
          garment.category,
        );
    const resultKey = `tryon-results/${userId}/${sessionId}/result.${imageExtension(generated.contentType)}`;
    await runtime.WARDROBE_IMAGES.put(resultKey, generated.bytes, { httpMetadata: { contentType: generated.contentType } });
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET status = 'ready', progress = 100, result_key = ?,
       external_job_id = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(resultKey, generated.externalJobId, sessionId, userId).run();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.slice(0, 240) : "真人试穿生成失败";
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET status = 'failed', progress = 100, error_message = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    ).bind(message, sessionId, userId).run();
    return Response.json({ error: message, code: "VTON_GENERATION_FAILED" }, { status: 502 });
  }

  const row = await runtime.DB.prepare(`${tryOnSelect} WHERE id = ? AND user_id = ?`)
    .bind(sessionId, userId).first<TryOnRow>();
  return Response.json({ session: row ? sessionPayload(row) : null });
}
