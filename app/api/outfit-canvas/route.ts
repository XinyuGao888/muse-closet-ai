import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { CanvasPlacement, SavedOutfitCard } from "@/lib/p1";
import { privateImageHeaders, reserveUpload, validateImageFile } from "@/lib/security";
import { safeJsonArray } from "@/lib/server-p0";

export const dynamic = "force-dynamic";

type Row = Omit<SavedOutfitCard, "itemIds" | "layout" | "previewUrl"> & {
  itemIds: string;
  layoutJson: string;
  previewKey: string | null;
};

function safeLayout(value: string): CanvasPlacement[] {
  try {
    const parsed = JSON.parse(value) as Partial<CanvasPlacement>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 16).map((item, index) => ({
      garmentId: String(item.garmentId ?? ""),
      x: Math.max(0, Math.min(100, Number(item.x ?? 50))),
      y: Math.max(0, Math.min(100, Number(item.y ?? 50))),
      scale: Math.max(0.3, Math.min(2.5, Number(item.scale ?? 1))),
      rotation: Math.max(-180, Math.min(180, Number(item.rotation ?? 0))),
      z: Math.max(1, Math.min(99, Number(item.z ?? index + 1))),
    })).filter((item) => item.garmentId);
  } catch { return []; }
}

function toCard(row: Row): SavedOutfitCard {
  return {
    ...row,
    itemIds: safeJsonArray(row.itemIds),
    layout: safeLayout(row.layoutJson),
    previewUrl: row.previewKey ? `/api/outfit-canvas?asset=${encodeURIComponent(row.id)}` : null,
  };
}

async function listCards(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, name, item_ids AS itemIds, layout_json AS layoutJson, preview_key AS previewKey,
     occasion, created_at AS createdAt FROM outfit_cards WHERE user_id = ? ORDER BY created_at DESC LIMIT 24`,
  ).bind(userId).all<Row>();
  return results.map(toCard);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const asset = new URL(request.url).searchParams.get("asset");
  if (asset) {
    const row = await runtime.DB.prepare("SELECT preview_key AS previewKey FROM outfit_cards WHERE id = ? AND user_id = ?")
      .bind(asset, userId).first<{ previewKey: string | null }>();
    if (!row?.previewKey) return new Response("Not found", { status: 404 });
    const object = await runtime.WARDROBE_IMAGES.get(row.previewKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: privateImageHeaders(object.httpMetadata?.contentType ?? "image/jpeg") });
  }
  return Response.json({ cards: await listCards(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const form = await request.formData();
  const name = String(form.get("name") || "我的自由搭配").slice(0, 80);
  const occasion = String(form.get("occasion") || "自由搭配").slice(0, 30);
  const layout = safeLayout(String(form.get("layout") || "[]"));
  const itemIds = [...new Set(layout.map((item) => item.garmentId))];
  if (!itemIds.length) return Response.json({ error: "请先把衣物放到画布中" }, { status: 400 });
  const owned = await runtime.DB.prepare(
    `SELECT id FROM garments WHERE user_id = ? AND id IN (${itemIds.map(() => "?").join(",")})`,
  ).bind(userId, ...itemIds).all<{ id: string }>();
  if (owned.results.length !== itemIds.length) return Response.json({ error: "搭配中包含无效衣物" }, { status: 400 });
  const id = crypto.randomUUID();
  const preview = form.get("preview");
  let previewKey: string | null = null;
  if (preview instanceof File && preview.size > 0) {
    const imageError = await validateImageFile(preview);
    if (imageError) return Response.json({ error: imageError }, { status: 400 });
    const uploadQuota = await reserveUpload(userId, "outfit_card", [preview]);
    if (!uploadQuota.ok) return uploadQuota.response;
    previewKey = `${userId}/outfit-cards/${id}`;
    await runtime.WARDROBE_IMAGES.put(previewKey, await preview.arrayBuffer(), { httpMetadata: { contentType: preview.type || "image/jpeg" } });
  }
  await runtime.DB.batch([
    runtime.DB.prepare(
      `INSERT INTO outfit_cards (id, user_id, name, item_ids, layout_json, preview_key, occasion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, userId, name, JSON.stringify(itemIds), JSON.stringify(layout), previewKey, occasion),
    runtime.DB.prepare(
      `INSERT INTO outfits (id, user_id, name, occasion, weather, item_ids, score, reason, saved)
       VALUES (?, ?, ?, ?, '自由创作', ?, 100, '由用户在自由搭配画布中创作并保存。', 1)`,
    ).bind(`canvas-${id}`, userId, name, occasion, JSON.stringify(itemIds)),
  ]);
  return Response.json({ cards: await listCards(userId) }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少搭配卡" }, { status: 400 });
  const row = await runtime.DB.prepare("SELECT preview_key AS previewKey FROM outfit_cards WHERE id = ? AND user_id = ?")
    .bind(id, userId).first<{ previewKey: string | null }>();
  if (row?.previewKey) await runtime.WARDROBE_IMAGES.delete(row.previewKey);
  await runtime.DB.batch([
    runtime.DB.prepare("DELETE FROM outfit_cards WHERE id = ? AND user_id = ?").bind(id, userId),
    runtime.DB.prepare("DELETE FROM outfits WHERE id = ? AND user_id = ?").bind(`canvas-${id}`, userId),
  ]);
  return Response.json({ cards: await listCards(userId) });
}
