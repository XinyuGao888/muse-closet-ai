import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { ensureAppUser, getDailyUsage, quotaLimits } from "@/lib/security";

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

  const { results } = await runtime.DB.prepare(
    `SELECT image_key AS objectKey FROM garments WHERE user_id = ? AND image_key IS NOT NULL
     UNION ALL SELECT front_photo_key FROM body_models WHERE user_id = ? AND front_photo_key IS NOT NULL
     UNION ALL SELECT side_photo_key FROM body_models WHERE user_id = ? AND side_photo_key IS NOT NULL
     UNION ALL SELECT result_key FROM tryon_sessions WHERE user_id = ? AND result_key IS NOT NULL
     UNION ALL SELECT original_key FROM intake_items WHERE user_id = ? AND original_key IS NOT NULL
     UNION ALL SELECT cutout_key FROM intake_items WHERE user_id = ? AND cutout_key IS NOT NULL
     UNION ALL SELECT preview_key FROM outfit_cards WHERE user_id = ? AND preview_key IS NOT NULL
     UNION ALL SELECT image_key FROM shopping_assessments WHERE user_id = ? AND image_key IS NOT NULL
     UNION ALL SELECT photo_key FROM outfit_diaries WHERE user_id = ? AND photo_key IS NOT NULL`,
  ).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId)
    .all<{ objectKey: string }>();
  const keys = [...new Set(results.map((row) => row.objectKey).filter(Boolean))];
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

  return Response.json(
    { deleted: true, deletedObjects: keys.length, signOutPath: "/signout-with-chatgpt?return_to=/" },
    { headers: { "cache-control": "no-store", "clear-site-data": '"cache", "storage"' } },
  );
}
