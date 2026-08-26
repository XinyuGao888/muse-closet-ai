import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { ensureAppUser, getDailyUsage, quotaLimits } from "@/lib/security";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AccountRow = {
  email: string;
  displayName: string;
  plan: string;
  status: string;
  aiProcessingConsent: number;
  privacyVersion: string;
  createdAt: string;
};

async function accountPayload(userId: string) {
  const account = await runtime.DB.prepare(
    `SELECT email, display_name AS displayName, plan, status,
     ai_processing_consent AS aiProcessingConsent, privacy_version AS privacyVersion,
     created_at AS createdAt FROM app_users WHERE id = ?`,
  ).bind(userId).first<AccountRow>();
  return {
    account: account ? { ...account, aiProcessingConsent: Boolean(account.aiProcessingConsent) } : null,
    usage: await getDailyUsage(userId),
    limits: quotaLimits(),
    privacy: {
      dataIsolation: "所有结构化记录均按用户ID查询",
      imageStorage: "图片保存在用户专属R2路径，仅通过鉴权接口读取",
      deletion: "删除账户数据会同时删除D1记录和R2图片",
    },
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await ensureAppUser(request, userId);
  return Response.json(await accountPayload(userId), { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await ensureAppUser(request, userId);
  const payload = await request.json().catch(() => ({})) as { aiProcessingConsent?: boolean };
  if (typeof payload.aiProcessingConsent !== "boolean") {
    return Response.json({ error: "缺少有效的隐私设置" }, { status: 400 });
  }
  await runtime.DB.prepare(
    `UPDATE app_users SET ai_processing_consent = ?, privacy_version = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).bind(payload.aiProcessingConsent ? 1 : 0, "2026-08-23", userId).run();
  return Response.json(await accountPayload(userId), { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json().catch(() => ({})) as { confirmation?: string };
  if (payload.confirmation !== "DELETE") {
    return Response.json({ error: "请输入 DELETE 确认删除全部数据" }, { status: 400 });
  }

  const usesSupabase = runtime.AUTH_PROVIDER?.toLowerCase() === "supabase";
  if (usesSupabase && (!runtime.SUPABASE_URL || !runtime.SUPABASE_SECRET_KEY)) {
    return Response.json(
      { error: "账户删除服务尚未完成配置，请联系站点管理员。", code: "ACCOUNT_DELETION_NOT_CONFIGURED" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const imageKeyStatements = [
    "SELECT image_key AS objectKey FROM garments WHERE user_id = ? AND image_key IS NOT NULL",
    "SELECT front_photo_key AS objectKey FROM body_models WHERE user_id = ? AND front_photo_key IS NOT NULL",
    "SELECT side_photo_key AS objectKey FROM body_models WHERE user_id = ? AND side_photo_key IS NOT NULL",
    "SELECT result_key AS objectKey FROM tryon_sessions WHERE user_id = ? AND result_key IS NOT NULL",
    "SELECT render_key AS objectKey FROM tryon_sessions WHERE user_id = ? AND render_key IS NOT NULL",
    "SELECT original_key AS objectKey FROM intake_items WHERE user_id = ? AND original_key IS NOT NULL",
    "SELECT cutout_key AS objectKey FROM intake_items WHERE user_id = ? AND cutout_key IS NOT NULL",
    "SELECT preview_key AS objectKey FROM outfit_cards WHERE user_id = ? AND preview_key IS NOT NULL",
    "SELECT image_key AS objectKey FROM shopping_assessments WHERE user_id = ? AND image_key IS NOT NULL",
    "SELECT photo_key AS objectKey FROM outfit_diaries WHERE user_id = ? AND photo_key IS NOT NULL",
  ];
  // D1 limits compound SELECT terms more aggressively than local SQLite, so keep
  // each image source as its own statement instead of one large UNION.
  const imageKeyResults = await Promise.all(
    imageKeyStatements.map((statement) => runtime.DB.prepare(statement).bind(userId).all<{ objectKey: string }>()),
  );
  const results = imageKeyResults.flatMap((result) => result.results);
  const userObjectPrefixes = [`${userId}/`, `body-models/${userId}/`, `tryon-results/${userId}/`];
  const keys = [...new Set(
    results
      .map((row) => row.objectKey)
      .filter((key): key is string => Boolean(key) && userObjectPrefixes.some((prefix) => key.startsWith(prefix))),
  )];
  for (let index = 0; index < keys.length; index += 12) {
    await Promise.all(keys.slice(index, index + 12).map((key) => runtime.WARDROBE_IMAGES.delete(key)));
  }

  const tables = [
    "style_twin_sessions", "outfit_diaries", "reminder_preferences", "shopping_assessments",
    "outfit_cards", "intake_items", "intake_jobs", "outfit_plans", "wear_events",
    "tryon_sessions", "body_models", "preference_profiles", "inspirations",
    "garment_sources", "feedback", "outfits", "garments", "usage_events", "usage_daily",
    "app_users",
  ];
  await runtime.DB.batch(tables.map((table) => runtime.DB.prepare(`DELETE FROM ${table} WHERE ${table === "app_users" ? "id" : "user_id"} = ?`).bind(userId)));

  if (usesSupabase) {
    const admin = createClient(runtime.SUPABASE_URL!, runtime.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return Response.json(
        { error: "衣柜数据和图片已删除，但登录身份删除失败，请联系站点管理员完成处理。", code: "AUTH_IDENTITY_DELETE_FAILED", deletedObjects: keys.length },
        { status: 502, headers: { "cache-control": "no-store", "clear-site-data": '"cache", "storage"' } },
      );
    }
  }

  return Response.json(
    { deleted: true, deletedObjects: keys.length, signOutPath: usesSupabase ? "/" : "/signout-with-chatgpt?return_to=/" },
    { headers: { "cache-control": "no-store", "clear-site-data": '"cache", "storage"' } },
  );
}
