import { runtime } from "@/db/runtime";

export const PRIVACY_VERSION = "2026-08-23";

export type UsageSnapshot = {
  uploadCount: number;
  uploadBytes: number;
  modelCalls: number;
  estimatedCostMicros: number;
};

export type QuotaLimits = {
  maxImageBytes: number;
  dailyUploadCount: number;
  dailyUploadBytes: number;
  dailyModelCalls: number;
  dailyModelBudgetMicros: number;
  globalDailyModelCalls: number;
  globalDailyModelBudgetMicros: number;
};

type QuotaDecision =
  | { ok: true; usage: UsageSnapshot; limits: QuotaLimits }
  | { ok: false; response: Response };

const MODEL_COST_MICROS: Record<string, number> = {
  garment_analysis: 2_000,
  batch_segmentation: 8_000,
  virtual_tryon: 50_000,
  ocr_barcode: 4_000,
  product_import: 3_000,
  body_reconstruction: 100_000,
  body_simulation: 80_000,
  diary_vision: 6_000,
  style_twin: 10_000,
};

const GLOBAL_USAGE_ID = "__muse_global_ai_budget__";

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function quotaLimits(): QuotaLimits {
  return {
    maxImageBytes: positiveInt(runtime.MAX_IMAGE_BYTES, 8 * 1024 * 1024),
    dailyUploadCount: positiveInt(runtime.DAILY_UPLOAD_COUNT, 40),
    dailyUploadBytes: positiveInt(runtime.DAILY_UPLOAD_BYTES, 100 * 1024 * 1024),
    dailyModelCalls: positiveInt(runtime.DAILY_MODEL_CALLS, 20),
    dailyModelBudgetMicros: positiveInt(runtime.DAILY_MODEL_BUDGET_MICROS, 300_000),
    globalDailyModelCalls: positiveInt(runtime.GLOBAL_DAILY_MODEL_CALLS, 250),
    globalDailyModelBudgetMicros: positiveInt(runtime.GLOBAL_DAILY_MODEL_BUDGET_MICROS, 5_000_000),
  };
}

export function usageDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function ensureAppUser(request: Request, userId: string) {
  const email = request.headers.get("oai-authenticated-user-email")?.slice(0, 320) ?? "";
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let displayName = email || "Muse 用户";
  if (encodedName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName).slice(0, 120) || displayName; } catch { /* use email */ }
  }
  await runtime.DB.prepare(
    `INSERT INTO app_users (id, email, display_name, privacy_version)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
     last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
  ).bind(userId, email, displayName, PRIVACY_VERSION).run();
}

export async function getDailyUsage(userId: string): Promise<UsageSnapshot> {
  const row = await runtime.DB.prepare(
    `SELECT upload_count AS uploadCount, upload_bytes AS uploadBytes,
     model_calls AS modelCalls, estimated_cost_micros AS estimatedCostMicros
     FROM usage_daily WHERE user_id = ? AND usage_date = ?`,
  ).bind(userId, usageDate()).first<UsageSnapshot>();
  return row ?? { uploadCount: 0, uploadBytes: 0, modelCalls: 0, estimatedCostMicros: 0 };
}

function quotaExceeded(message: string, code: string) {
  return Response.json(
    { error: message, code },
    { status: 429, headers: { "retry-after": "3600", "cache-control": "no-store" } },
  );
}

export async function reserveUpload(
  userId: string,
  capability: string,
  files: File[],
): Promise<QuotaDecision> {
  const limits = quotaLimits();
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  const units = files.length;
  const date = usageDate();
  await runtime.DB.prepare(
    "INSERT OR IGNORE INTO usage_daily (user_id, usage_date) VALUES (?, ?)",
  ).bind(userId, date).run();
  const result = await runtime.DB.prepare(
    `UPDATE usage_daily SET upload_count = upload_count + ?, upload_bytes = upload_bytes + ?,
     updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND usage_date = ?
     AND upload_count + ? <= ? AND upload_bytes + ? <= ?`,
  ).bind(units, bytes, userId, date, units, limits.dailyUploadCount, bytes, limits.dailyUploadBytes).run();
  if ((result.meta?.changes ?? 0) < 1) {
    return { ok: false, response: quotaExceeded("今日图片上传额度已用完，请明天再试或删除不需要的内容。", "UPLOAD_QUOTA_EXCEEDED") };
  }
  await runtime.DB.prepare(
    `INSERT INTO usage_events (id, user_id, kind, capability, units, bytes)
     VALUES (?, ?, 'upload', ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, capability, units, bytes).run();
  return { ok: true, usage: await getDailyUsage(userId), limits };
}

export async function reserveModelCall(userId: string, capability: string): Promise<QuotaDecision> {
  const consent = await runtime.DB.prepare(
    "SELECT ai_processing_consent AS consent FROM app_users WHERE id = ? AND status = 'active'",
  ).bind(userId).first<{ consent: number }>();
  if (userId !== "demo-user" && !consent?.consent) {
    return {
      ok: false,
      response: Response.json(
        { error: "请先在账户与隐私设置中同意将所选图片发送给已配置的 AI 服务。", code: "AI_CONSENT_REQUIRED" },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  const limits = quotaLimits();
  const cost = MODEL_COST_MICROS[capability] ?? 5_000;
  const date = usageDate();
  await runtime.DB.batch([
    runtime.DB.prepare("INSERT OR IGNORE INTO usage_daily (user_id, usage_date) VALUES (?, ?)").bind(userId, date),
    runtime.DB.prepare("INSERT OR IGNORE INTO usage_daily (user_id, usage_date) VALUES (?, ?)").bind(GLOBAL_USAGE_ID, date),
  ]);
  const globalResult = await runtime.DB.prepare(
    `UPDATE usage_daily SET model_calls = model_calls + 1,
     estimated_cost_micros = estimated_cost_micros + ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND usage_date = ? AND model_calls + 1 <= ?
     AND estimated_cost_micros + ? <= ?`,
  ).bind(cost, GLOBAL_USAGE_ID, date, limits.globalDailyModelCalls, cost, limits.globalDailyModelBudgetMicros).run();
  if ((globalResult.meta?.changes ?? 0) < 1) {
    return { ok: false, response: quotaExceeded("今日全站 AI 预算已达到上限，基础衣柜、日历和本地推荐仍可继续使用。", "GLOBAL_MODEL_BUDGET_EXCEEDED") };
  }
  const userResult = await runtime.DB.prepare(
    `UPDATE usage_daily SET model_calls = model_calls + 1,
     estimated_cost_micros = estimated_cost_micros + ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND usage_date = ? AND model_calls + 1 <= ?
     AND estimated_cost_micros + ? <= ?`,
  ).bind(cost, userId, date, limits.dailyModelCalls, cost, limits.dailyModelBudgetMicros).run();
  if ((userResult.meta?.changes ?? 0) < 1) {
    await runtime.DB.prepare(
      `UPDATE usage_daily SET model_calls = MAX(model_calls - 1, 0),
       estimated_cost_micros = MAX(estimated_cost_micros - ?, 0), updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND usage_date = ?`,
    ).bind(cost, GLOBAL_USAGE_ID, date).run();
    return { ok: false, response: quotaExceeded("今日 AI 生成额度已用完，基础衣柜、日历和本地推荐仍可继续使用。", "MODEL_QUOTA_EXCEEDED") };
  }
  await runtime.DB.prepare(
    `INSERT INTO usage_events (id, user_id, kind, capability, units, estimated_cost_micros)
     VALUES (?, ?, 'model', ?, 1, ?)`,
  ).bind(crypto.randomUUID(), userId, capability, cost).run();
  return { ok: true, usage: await getDailyUsage(userId), limits };
}

export async function validateImageFile(file: File): Promise<string | null> {
  const limits = quotaLimits();
  if (!file.size) return "图片内容为空";
  if (file.size > limits.maxImageBytes) return `单张图片不能超过 ${Math.round(limits.maxImageBytes / 1024 / 1024)}MB`;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "仅支持 JPEG、PNG 或 WebP 图片";
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) return "图片文件格式与内容不一致";
  return null;
}

export function privateImageHeaders(contentType = "image/jpeg") {
  const safeContentType = ["image/jpeg", "image/png", "image/webp"].includes(contentType)
    ? contentType
    : "application/octet-stream";
  return {
    "content-type": safeContentType,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
}
