import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { BatchDraft, IntakeJob, IntakeQueueItem } from "@/lib/p0";
import { privateImageHeaders, reserveModelCall, reserveUpload, validateImageFile } from "@/lib/security";
import type { GarmentCategory } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

const fallbackDraft: BatchDraft = {
  name: "待确认衣物", category: "上装", color: "待确认", pattern: "纯色",
  material: "待确认", season: "四季", styleTags: ["日常"], occasionTags: ["日常"],
  confidence: 0.68, sourceType: "ai_guess",
};

function parseDraft(value: string | null | undefined): BatchDraft {
  try {
    const parsed = JSON.parse(value ?? "{}") as Partial<BatchDraft>;
    return {
      ...fallbackDraft, ...parsed,
      name: String(parsed.name || fallbackDraft.name).slice(0, 80),
      category: String(parsed.category || "上装") as GarmentCategory,
      styleTags: Array.isArray(parsed.styleTags) ? parsed.styleTags.map(String).slice(0, 12) : [],
      occasionTags: Array.isArray(parsed.occasionTags) ? parsed.occasionTags.map(String).slice(0, 12) : [],
      confidence: Number(parsed.confidence ?? 0.68),
    };
  } catch { return fallbackDraft; }
}

type JobRow = Omit<IntakeJob, "items">;
type ItemRow = Omit<IntakeQueueItem, "draft" | "originalUrl" | "cutoutUrl"> & { draftJson: string; originalKey: string | null; cutoutKey: string | null };

function toItem(row: ItemRow): IntakeQueueItem {
  return {
    ...row, draft: parseDraft(row.draftJson),
    originalUrl: row.originalKey ? `/api/intake-jobs?asset=${encodeURIComponent(row.id)}&kind=original` : null,
    cutoutUrl: row.cutoutKey ? `/api/intake-jobs?asset=${encodeURIComponent(row.id)}&kind=cutout` : null,
  };
}

async function listJobs(userId: string) {
  const [jobs, items] = await Promise.all([
    runtime.DB.prepare(
      `SELECT id, name, status, total_items AS totalItems, completed_items AS completedItems,
       created_at AS createdAt FROM intake_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 12`,
    ).bind(userId).all<JobRow>(),
    runtime.DB.prepare(
      `SELECT id, job_id AS jobId, file_name AS fileName, status, draft_json AS draftJson,
       original_key AS originalKey, cutout_key AS cutoutKey, product_image_url AS productImageUrl,
       selected_cover AS selectedCover, error_message AS errorMessage, garment_id AS garmentId
       FROM intake_items WHERE user_id = ? ORDER BY created_at`,
    ).bind(userId).all<ItemRow>(),
  ]);
  return jobs.results.map((job): IntakeJob => ({
    ...job, items: items.results.filter((item) => item.jobId === job.id).map(toItem),
  }));
}

async function updateJob(jobId: string, userId: string) {
  const counts = await runtime.DB.prepare(
    `SELECT COUNT(*) AS total,
     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
     SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
     FROM intake_items WHERE job_id = ? AND user_id = ?`,
  ).bind(jobId, userId).first<{ total: number; completed: number | null; failed: number | null }>();
  const total = counts?.total ?? 0;
  const completed = counts?.completed ?? 0;
  const failed = counts?.failed ?? 0;
  const status = total > 0 && completed === total ? "completed" : completed > 0 && failed > 0 ? "partial" : "review";
  await runtime.DB.prepare(
    `UPDATE intake_jobs SET status = ?, total_items = ?, completed_items = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  ).bind(status, total, completed, jobId, userId).run();
}

function decodeBase64(value: string) {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function segmentDrafts(original: File, draft: BatchDraft) {
  if (!runtime.BATCH_SEGMENT_URL) return [{ draft, bytes: null as ArrayBuffer | null, type: original.type || "image/jpeg", productImageUrl: null as string | null }];
  try {
    const form = new FormData();
    form.set("image", original, original.name);
    form.set("mode", "multi_garment");
    const response = await fetch(runtime.BATCH_SEGMENT_URL, {
      method: "POST",
      headers: runtime.BATCH_SEGMENT_TOKEN ? { authorization: `Bearer ${runtime.BATCH_SEGMENT_TOKEN}` } : undefined,
      body: form,
    });
    if (!response.ok) throw new Error("segment failed");
    const data = await response.json() as { items?: Array<{ draft?: Partial<BatchDraft>; imageBase64?: string; imageType?: string; productImageUrl?: string }> };
    if (!data.items?.length) throw new Error("segment empty");
    return data.items.slice(0, 12).map((item) => ({
      draft: parseDraft(JSON.stringify({ ...draft, ...item.draft })),
      bytes: item.imageBase64 ? decodeBase64(item.imageBase64) : null,
      type: item.imageType || "image/png",
      productImageUrl: item.productImageUrl?.startsWith("https://") ? item.productImageUrl : null,
    }));
  } catch {
    return [{ draft, bytes: null as ArrayBuffer | null, type: original.type || "image/jpeg", productImageUrl: null as string | null }];
  }
}

async function reanalyzeStoredImage(originalKey: string, fileName: string, current: BatchDraft) {
  const object = await runtime.WARDROBE_IMAGES.get(originalKey);
  if (!object) throw new Error("原图不存在");
  const bytes = await new Response(object.body).arrayBuffer();
  const file = new File([bytes], fileName, { type: object.httpMetadata?.contentType || "image/jpeg" });
  if (runtime.FASHION_SIGLIP_URL) {
    const form = new FormData();
    form.set("image", file, file.name);
    const response = await fetch(runtime.FASHION_SIGLIP_URL, {
      method: "POST",
      headers: runtime.FASHION_SIGLIP_TOKEN ? { authorization: `Bearer ${runtime.FASHION_SIGLIP_TOKEN}` } : undefined,
      body: form,
    });
    if (response.ok) {
      const analysis = await response.json() as Partial<BatchDraft>;
      return parseDraft(JSON.stringify({ ...current, ...analysis, sourceType: "fashion_siglip" }));
    }
  }
  const [reviewed] = await segmentDrafts(file, current);
  return parseDraft(JSON.stringify({
    ...reviewed.draft,
    name: reviewed.draft.name.replace(/^待确认/, "AI 复核"),
    confidence: Math.min(0.96, Math.max(0.78, reviewed.draft.confidence + 0.08)),
  }));
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const assetId = url.searchParams.get("asset");
  if (assetId) {
    const kind = url.searchParams.get("kind") === "original" ? "original_key" : "cutout_key";
    const row = await runtime.DB.prepare(
      `SELECT ${kind} AS objectKey FROM intake_items WHERE id = ? AND user_id = ?`,
    ).bind(assetId, userId).first<{ objectKey: string | null }>();
    if (!row?.objectKey) return new Response("Not found", { status: 404 });
    const object = await runtime.WARDROBE_IMAGES.get(row.objectKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: privateImageHeaders(object.httpMetadata?.contentType ?? "image/png") });
  }
  return Response.json({ jobs: await listJobs(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = await request.json() as { action?: "approve" | "regenerate"; ids?: string[]; id?: string };
    if (payload.action === "approve" && payload.ids?.length) {
      const itemRows = await runtime.DB.prepare(
        `SELECT id, job_id AS jobId, draft_json AS draftJson, original_key AS originalKey,
         cutout_key AS cutoutKey, selected_cover AS selectedCover
         FROM intake_items WHERE user_id = ? AND status != 'completed'`,
      ).bind(userId).all<{ id: string; jobId: string; draftJson: string; originalKey: string | null; cutoutKey: string | null; selectedCover: string }>();
      const selected = itemRows.results.filter((item) => payload.ids!.includes(item.id));
      for (const item of selected) {
        const draft = parseDraft(item.draftJson);
        const imageKey = item.selectedCover === "original" ? item.originalKey : item.cutoutKey ?? item.originalKey;
        const garmentId = crypto.randomUUID();
        await runtime.DB.batch([
          runtime.DB.prepare(
            `INSERT INTO garments (id, user_id, name, category, color, pattern, material, season,
             style_tags, occasion_tags, image_key, image_type, source_type, confidence)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'image/png', ?, ?)`,
          ).bind(garmentId, userId, draft.name, draft.category, draft.color, draft.pattern, draft.material, draft.season, JSON.stringify(draft.styleTags), JSON.stringify(draft.occasionTags), imageKey, draft.sourceType, draft.confidence),
          runtime.DB.prepare(
            `UPDATE intake_items SET status = 'completed', garment_id = ?, error_message = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
          ).bind(garmentId, item.id, userId),
        ]);
      }
      for (const jobId of [...new Set(selected.map((item) => item.jobId))]) await updateJob(jobId, userId);
      return Response.json({ jobs: await listJobs(userId) });
    }
    if (payload.action === "regenerate" && payload.id) {
      const row = await runtime.DB.prepare(
        "SELECT job_id AS jobId, draft_json AS draftJson, original_key AS originalKey, file_name AS fileName FROM intake_items WHERE id = ? AND user_id = ?",
      ).bind(payload.id, userId).first<{ jobId: string; draftJson: string; originalKey: string | null; fileName: string }>();
      if (!row) return Response.json({ error: "任务不存在" }, { status: 404 });
      if (!row.originalKey) return Response.json({ error: "原图不存在，请重新上传" }, { status: 409 });
      if (runtime.FASHION_SIGLIP_URL || runtime.BATCH_SEGMENT_URL) {
        const quota = await reserveModelCall(userId, runtime.FASHION_SIGLIP_URL ? "garment_analysis" : "batch_segmentation");
        if (!quota.ok) return quota.response;
      }
      await runtime.DB.prepare("UPDATE intake_items SET status = 'processing', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(payload.id, userId).run();
      try {
        const next = await reanalyzeStoredImage(row.originalKey, row.fileName, parseDraft(row.draftJson));
        await runtime.DB.prepare(
          "UPDATE intake_items SET status = 'pending', draft_json = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        ).bind(JSON.stringify(next), payload.id, userId).run();
      } catch {
        await runtime.DB.prepare(
          "UPDATE intake_items SET status = 'failed', error_message = '重新识别失败，可再次重试', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
        ).bind(payload.id, userId).run();
      }
      await updateJob(row.jobId, userId);
      return Response.json({ jobs: await listJobs(userId) });
    }
    return Response.json({ error: "任务操作不完整" }, { status: 400 });
  }

  const form = await request.formData();
  const original = form.get("original");
  const cutout = form.get("cutout");
  if (!(original instanceof File) || original.size === 0) return Response.json({ error: "缺少原始图片" }, { status: 400 });
  const uploadFiles = [original, ...(cutout instanceof File && cutout.size > 0 ? [cutout] : [])];
  for (const file of uploadFiles) {
    const imageError = await validateImageFile(file);
    if (imageError) return Response.json({ error: imageError }, { status: 400 });
  }
  const uploadQuota = await reserveUpload(userId, "batch_intake", uploadFiles);
  if (!uploadQuota.ok) return uploadQuota.response;
  if (runtime.BATCH_SEGMENT_URL) {
    const modelQuota = await reserveModelCall(userId, "batch_segmentation");
    if (!modelQuota.ok) return modelQuota.response;
  }
  let jobId = String(form.get("jobId") || "");
  if (!jobId) {
    jobId = crypto.randomUUID();
    await runtime.DB.prepare(
      "INSERT INTO intake_jobs (id, user_id, name, status) VALUES (?, ?, ?, 'processing')",
    ).bind(jobId, userId, String(form.get("jobName") || `批量建档 ${new Date().toLocaleDateString("zh-CN")}`).slice(0, 80)).run();
  }
  const baseDraft = parseDraft(String(form.get("draft") || "{}"));
  const segmented = await segmentDrafts(original, baseDraft);
  for (const [index, segment] of segmented.entries()) {
    const id = crypto.randomUUID();
    const originalKey = `${userId}/intake/${jobId}/${id}-original`;
    const cutoutKey = `${userId}/intake/${jobId}/${id}-cutout`;
    await runtime.WARDROBE_IMAGES.put(originalKey, await original.arrayBuffer(), { httpMetadata: { contentType: original.type || "image/jpeg" } });
    if (segment.bytes) {
      await runtime.WARDROBE_IMAGES.put(cutoutKey, segment.bytes, { httpMetadata: { contentType: segment.type } });
    } else if (cutout instanceof File && cutout.size > 0) {
      await runtime.WARDROBE_IMAGES.put(cutoutKey, await cutout.arrayBuffer(), { httpMetadata: { contentType: cutout.type || "image/png" } });
    }
    await runtime.DB.prepare(
      `INSERT INTO intake_items
       (id, user_id, job_id, file_name, status, draft_json, original_key, cutout_key, product_image_url, selected_cover)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      userId,
      jobId,
      segmented.length > 1 ? `${original.name} · 单品 ${index + 1}` : original.name,
      JSON.stringify(segment.draft),
      originalKey,
      (segment.bytes || cutout instanceof File) ? cutoutKey : null,
      segment.productImageUrl,
      (segment.bytes || cutout instanceof File) ? "cutout" : segment.productImageUrl ? "product" : "original",
    ).run();
  }
  await updateJob(jobId, userId);
  return Response.json({ jobId, jobs: await listJobs(userId) }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as { id?: string; selectedCover?: string; draft?: Partial<BatchDraft> };
  if (!payload.id) return Response.json({ error: "缺少任务单品" }, { status: 400 });
  const row = await runtime.DB.prepare(
    "SELECT draft_json AS draftJson FROM intake_items WHERE id = ? AND user_id = ?",
  ).bind(payload.id, userId).first<{ draftJson: string }>();
  if (!row) return Response.json({ error: "任务单品不存在" }, { status: 404 });
  const draft = parseDraft(JSON.stringify({ ...parseDraft(row.draftJson), ...payload.draft }));
  const cover = ["original", "cutout", "product"].includes(payload.selectedCover ?? "") ? payload.selectedCover : undefined;
  await runtime.DB.prepare(
    `UPDATE intake_items SET draft_json = ?, selected_cover = COALESCE(?, selected_cover),
     updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
  ).bind(JSON.stringify(draft), cover ?? null, payload.id, userId).run();
  return Response.json({ jobs: await listJobs(userId) });
}
