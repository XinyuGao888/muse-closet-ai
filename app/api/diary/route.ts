import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { DiaryEntry, DiaryInsights } from "@/lib/p1";
import { isoDate, recordWear, safeJsonArray } from "@/lib/server-p0";

export const dynamic = "force-dynamic";

type Row = Omit<DiaryEntry, "itemIds" | "photoUrl"> & { itemIds: string; photoKey: string | null };

function toEntry(row: Row): DiaryEntry {
  return { ...row, itemIds: safeJsonArray(row.itemIds), photoUrl: row.photoKey ? `/api/diary?asset=${encodeURIComponent(row.id)}` : null };
}

async function listEntries(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT d.id, d.plan_id AS planId, d.outfit_id AS outfitId, d.tryon_session_id AS tryonSessionId,
     d.item_ids AS itemIds, d.photo_key AS photoKey, d.caption, d.fit_feedback AS fitFeedback,
     d.comfort_rating AS comfortRating, d.compliments, d.difference_notes AS differenceNotes,
     d.ai_notes AS aiNotes, d.created_at AS createdAt, p.name AS planName, p.plan_date AS planDate
     FROM outfit_diaries d LEFT JOIN outfit_plans p ON p.id = d.plan_id AND p.user_id = d.user_id
     WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 36`,
  ).bind(userId).all<Row>();
  return results.map(toEntry);
}

async function insights(userId: string, entries: DiaryEntry[]): Promise<DiaryInsights> {
  const fitCounts = new Map<string, number>();
  entries.forEach((entry) => fitCounts.set(entry.fitFeedback, (fitCounts.get(entry.fitFeedback) ?? 0) + 1));
  const today = isoDate();
  const planned = await runtime.DB.prepare(
    `SELECT COUNT(*) AS count FROM outfit_plans p WHERE p.user_id = ? AND p.plan_date < ?
     AND p.status = 'planned' AND NOT EXISTS (SELECT 1 FROM outfit_diaries d WHERE d.user_id = p.user_id AND d.plan_id = p.id)`,
  ).bind(userId, today).first<{ count: number }>();
  const top = [...entries].sort((a, b) => b.compliments - a.compliments)[0];
  const dominantFit = [...fitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const compared = entries.filter((entry) => entry.tryonSessionId || entry.differenceNotes).length;
  const learningSummary = [
    dominantFit ? `真人记录中“${dominantFit}”出现最多，后续版型排序会优先参考这一信号。` : "上传第一篇真人穿搭日记后，Muse 会开始学习你真实偏好的松紧度。",
    top?.compliments ? `「${top.planName || top.caption || "最近造型"}」获得 ${top.compliments} 次好评，是当前最强社交反馈。` : "记录收到的好评次数，可以区分自己喜欢与外界反馈都强的造型。",
    compared ? `已有 ${compared} 次真人效果与虚拟试穿或预期进行对照。` : "关联一次虚拟试穿后，就能开始校正虚拟效果与真人效果的差异。",
  ];
  return {
    totalEntries: entries.length,
    fitSignals: [...fitCounts.entries()].map(([label, count]) => ({ label, count })),
    averageComfort: entries.length ? Math.round((entries.reduce((sum, entry) => sum + entry.comfortRating, 0) / entries.length) * 10) / 10 : 0,
    totalCompliments: entries.reduce((sum, entry) => sum + entry.compliments, 0),
    topComplimentLook: top?.compliments ? top.planName || top.caption || "真人穿搭" : null,
    plannedNeverWorn: planned?.count ?? 0,
    comparedTryOns: compared,
    learningSummary,
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const asset = new URL(request.url).searchParams.get("asset");
  if (asset) {
    const row = await runtime.DB.prepare("SELECT photo_key AS photoKey FROM outfit_diaries WHERE id = ? AND user_id = ?")
      .bind(asset, userId).first<{ photoKey: string | null }>();
    if (!row?.photoKey) return new Response("Not found", { status: 404 });
    const object = await runtime.WARDROBE_IMAGES.get(row.photoKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
  }
  const entries = await listEntries(userId);
  return Response.json({ entries, insights: await insights(userId, entries) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) return Response.json({ error: "请上传一张真人穿搭照片" }, { status: 400 });
  const planId = String(form.get("planId") || "") || null;
  const plan = planId ? await runtime.DB.prepare(
    "SELECT id, outfit_id AS outfitId, item_ids AS itemIds, plan_date AS planDate, name FROM outfit_plans WHERE id = ? AND user_id = ?",
  ).bind(planId, userId).first<{ id: string; outfitId: string | null; itemIds: string; planDate: string; name: string }>() : null;
  let itemIds = safeJsonArray(String(form.get("itemIds") || "[]"));
  if (!itemIds.length && plan) itemIds = safeJsonArray(plan.itemIds);
  const fitFeedback = ["偏松", "合身", "偏紧"].includes(String(form.get("fitFeedback"))) ? String(form.get("fitFeedback")) : "合身";
  const comfortRating = Math.max(1, Math.min(5, Number(form.get("comfortRating") || 4)));
  const compliments = Math.max(0, Math.min(99, Number(form.get("compliments") || 0)));
  const caption = String(form.get("caption") || "").slice(0, 300);
  const differenceNotes = String(form.get("differenceNotes") || "").slice(0, 600);
  const tryonSessionId = String(form.get("tryonSessionId") || "") || null;
  let aiNotes = `${fitFeedback} · 舒适度 ${comfortRating}/5${compliments ? ` · 收到 ${compliments} 次好评` : ""}。这条真人反馈已进入下一轮版型和搭配排序。`;
  if (runtime.OUTFIT_DIARY_VISION_URL) {
    try {
      const upstream = new FormData();
      upstream.set("photo", photo, photo.name);
      upstream.set("context", JSON.stringify({ itemIds, fitFeedback, comfortRating, compliments, differenceNotes }));
      const response = await fetch(runtime.OUTFIT_DIARY_VISION_URL, {
        method: "POST",
        headers: runtime.OUTFIT_DIARY_VISION_TOKEN ? { authorization: `Bearer ${runtime.OUTFIT_DIARY_VISION_TOKEN}` } : undefined,
        body: upstream,
      });
      if (response.ok) aiNotes = String(((await response.json()) as { summary?: string }).summary || aiNotes).slice(0, 800);
    } catch { /* structured user feedback remains a reliable learning signal */ }
  }
  const id = crypto.randomUUID();
  const photoKey = `${userId}/diary/${id}`;
  await runtime.WARDROBE_IMAGES.put(photoKey, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type || "image/jpeg" } });
  await runtime.DB.prepare(
    `INSERT INTO outfit_diaries
     (id, user_id, plan_id, outfit_id, tryon_session_id, item_ids, photo_key, caption,
      fit_feedback, comfort_rating, compliments, difference_notes, ai_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, plan?.id ?? null, plan?.outfitId ?? null, tryonSessionId, JSON.stringify(itemIds), photoKey, caption, fitFeedback, comfortRating, compliments, differenceNotes, aiNotes).run();
  if (itemIds.length) {
    const delta = Math.max(-0.5, comfortRating - 3 + Math.min(1.5, compliments * 0.25));
    await runtime.DB.batch(itemIds.map((garmentId) => runtime.DB.prepare(
      "UPDATE garments SET affinity = affinity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(delta, garmentId, userId)));
    await recordWear(userId, itemIds, { outfitId: plan?.outfitId ?? undefined, planId: plan?.id, date: plan?.planDate ?? isoDate(), source: "diary", affinityDelta: 0 });
  }
  if (plan) await runtime.DB.prepare("UPDATE outfit_plans SET status = 'worn', worn_at = COALESCE(worn_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind(plan.id, userId).run();
  const fitRows = await runtime.DB.prepare(
    "SELECT fit_feedback AS label, COUNT(*) AS count FROM outfit_diaries WHERE user_id = ? GROUP BY fit_feedback ORDER BY count DESC LIMIT 1",
  ).bind(userId).first<{ label: string; count: number }>();
  await runtime.DB.prepare(
    `INSERT INTO preference_profiles (user_id, fit_preference, total_signals) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET fit_preference = excluded.fit_preference,
     total_signals = preference_profiles.total_signals + excluded.total_signals, updated_at = CURRENT_TIMESTAMP`,
  ).bind(userId, fitRows?.label ?? fitFeedback, Math.max(1, itemIds.length)).run();
  const entries = await listEntries(userId);
  return Response.json({ entries, insights: await insights(userId, entries) }, { status: 201 });
}
