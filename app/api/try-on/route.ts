import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { TryOnHistorySession } from "@/lib/p0";
import { safeJsonArray } from "@/lib/server-p0";

export const dynamic = "force-dynamic";

type Row = Omit<TryOnHistorySession, "itemIds" | "favorite"> & { itemIds: string; favorite: number };

function toSession(row: Row): TryOnHistorySession {
  return { ...row, itemIds: safeJsonArray(row.itemIds), favorite: Boolean(row.favorite) };
}

async function getSession(userId: string, id: string) {
  const row = await runtime.DB.prepare(
    `SELECT id, mode, item_ids AS itemIds, result_url AS resultUrl, status, progress,
     favorite, previous_session_id AS previousSessionId, error_message AS errorMessage,
     created_at AS createdAt FROM tryon_sessions WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<Row>();
  return row ? toSession(row) : null;
}

async function listSessions(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, mode, item_ids AS itemIds, result_url AS resultUrl, status, progress,
     favorite, previous_session_id AS previousSessionId, error_message AS errorMessage,
     created_at AS createdAt FROM tryon_sessions
     WHERE user_id = ? AND mode IN ('fashn', 'composite', '2d-multi')
     ORDER BY favorite DESC, created_at DESC LIMIT 24`,
  ).bind(userId).all<Row>();
  return results.map(toSession);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const asset = url.searchParams.get("asset");
  if (asset) {
    const row = await runtime.DB.prepare(
      "SELECT result_key AS resultKey FROM tryon_sessions WHERE id = ? AND user_id = ?",
    ).bind(asset, userId).first<{ resultKey: string | null }>();
    if (!row?.resultKey) return new Response("Not found", { status: 404 });
    const object = await runtime.WARDROBE_IMAGES.get(row.resultKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
  }
  return Response.json({ sessions: await listSessions(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const form = await request.formData();
  const action = String(form.get("action") || "generate");

  if (action === "complete") {
    const sessionId = String(form.get("sessionId") || "");
    const result = form.get("result");
    if (!sessionId || !(result instanceof File) || !result.size) return Response.json({ error: "试穿结果不完整" }, { status: 400 });
    const resultKey = `${userId}/tryon/${sessionId}-result`;
    await runtime.WARDROBE_IMAGES.put(resultKey, await result.arrayBuffer(), { httpMetadata: { contentType: result.type || "image/jpeg" } });
    const resultUrl = `/api/try-on?asset=${encodeURIComponent(sessionId)}`;
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET result_key = ?, result_url = ?, status = 'ready', progress = 100,
       error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    ).bind(resultKey, resultUrl, sessionId, userId).run();
    return Response.json({ session: await getSession(userId, sessionId), sessions: await listSessions(userId) });
  }

  const person = form.get("person");
  const legacyGarment = form.get("garment");
  const garments = form.getAll("garments").filter((item): item is File => item instanceof File);
  if (legacyGarment instanceof File && garments.length === 0) garments.push(legacyGarment);
  const category = String(form.get("category") || "tops");
  const itemIds = safeJsonArray(String(form.get("itemIds") || "[]"));
  const previousSessionId = String(form.get("previousSessionId") || "") || null;
  if (!(person instanceof File) || garments.length === 0) return Response.json({ error: "需要人物照和至少一件衣物" }, { status: 400 });

  const id = crypto.randomUUID();
  await runtime.DB.prepare(
    `INSERT INTO tryon_sessions
     (id, user_id, mode, item_ids, status, progress, previous_session_id, updated_at)
     VALUES (?, ?, '2d-multi', ?, 'processing', 12, ?, CURRENT_TIMESTAMP)`,
  ).bind(id, userId, JSON.stringify(itemIds), previousSessionId).run();

  if (!runtime.FASHN_VTON_URL) {
    await runtime.DB.prepare(
      "UPDATE tryon_sessions SET mode = 'composite', progress = 68, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(id, userId).run();
    return Response.json({ mode: "composite", itemCount: garments.length, session: await getSession(userId, id) });
  }

  try {
    await runtime.DB.prepare("UPDATE tryon_sessions SET progress = 34 WHERE id = ? AND user_id = ?").bind(id, userId).run();
    const upstream = new FormData();
    upstream.set("person", person, person.name);
    garments.forEach((garment) => upstream.append("garments", garment, garment.name));
    upstream.set("garment", garments[0], garments[0].name);
    upstream.set("category", category);
    upstream.set("mode", garments.length > 1 ? "multi" : "single");
    const response = await fetch(runtime.FASHN_VTON_URL, {
      method: "POST",
      headers: runtime.FASHN_VTON_TOKEN ? { authorization: `Bearer ${runtime.FASHN_VTON_TOKEN}` } : undefined,
      body: upstream,
    });
    if (!response.ok) throw new Error("试穿服务暂时不可用");
    const bytes = await response.arrayBuffer();
    const type = response.headers.get("content-type") ?? "image/png";
    const resultKey = `${userId}/tryon/${id}-result`;
    await runtime.WARDROBE_IMAGES.put(resultKey, bytes, { httpMetadata: { contentType: type } });
    const resultUrl = `/api/try-on?asset=${encodeURIComponent(id)}`;
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET mode = 'fashn', result_key = ?, result_url = ?, status = 'ready',
       progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    ).bind(resultKey, resultUrl, id, userId).run();
    return Response.json({ mode: "fashn", session: await getSession(userId, id), sessions: await listSessions(userId) });
  } catch {
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET mode = 'composite', progress = 68,
       error_message = '真实试穿服务暂不可用，已切换本地组合预览', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(id, userId).run();
    return Response.json({ mode: "composite", itemCount: garments.length, session: await getSession(userId, id) });
  }
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as { id?: string; action?: "favorite" | "failed"; value?: boolean; error?: string };
  if (!payload.id) return Response.json({ error: "缺少试穿记录" }, { status: 400 });
  if (payload.action === "favorite") {
    await runtime.DB.prepare(
      "UPDATE tryon_sessions SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(payload.value ? 1 : 0, payload.id, userId).run();
  } else if (payload.action === "failed") {
    await runtime.DB.prepare(
      `UPDATE tryon_sessions SET status = 'failed', progress = 0, error_message = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    ).bind(String(payload.error || "生成失败").slice(0, 240), payload.id, userId).run();
  } else return Response.json({ error: "试穿操作无效" }, { status: 400 });
  return Response.json({ sessions: await listSessions(userId) });
}
