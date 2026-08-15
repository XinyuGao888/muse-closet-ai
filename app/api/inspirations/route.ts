import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { inspirationSeeds, type Inspiration } from "@/lib/phase-two-three";
import type { Garment, GarmentCategory, Outfit } from "@/lib/wardrobe";

type InspirationRow = {
  id: string;
  title: string;
  creator: string;
  occasion: string;
  styleTags: string;
  itemCategories: string;
  palette: string;
  note: string;
  saved: number;
  usedCount: number;
};

function parseList<T = string>(value: string): T[] {
  try { return JSON.parse(value) as T[]; } catch { return []; }
}

function toInspiration(row: InspirationRow): Inspiration {
  return {
    ...row,
    styleTags: parseList(row.styleTags),
    itemCategories: parseList<GarmentCategory>(row.itemCategories),
    palette: parseList(row.palette),
    saved: Boolean(row.saved),
  };
}

async function seed(userId: string) {
  const existing = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM inspirations WHERE user_id = ?")
    .bind(userId).first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;
  await runtime.DB.batch(inspirationSeeds.map((item, index) => runtime.DB.prepare(
    `INSERT OR IGNORE INTO inspirations
    (id, user_id, title, creator, occasion, style_tags, item_categories, palette, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `${userId}-inspiration-${index + 1}`,
    userId,
    item.title,
    item.creator,
    item.occasion,
    JSON.stringify(item.styleTags),
    JSON.stringify(item.itemCategories),
    JSON.stringify(item.palette),
    item.note,
  )));
}

async function list(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, title, creator, occasion, style_tags AS styleTags,
    item_categories AS itemCategories, palette, note, saved,
    used_count AS usedCount FROM inspirations
    WHERE user_id = ? ORDER BY saved DESC, used_count DESC, created_at ASC`,
  ).bind(userId).all<InspirationRow>();
  return results.map(toInspiration);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await seed(userId);
  return Response.json({ inspirations: await list(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await seed(userId);
  const payload = (await request.json()) as { id?: string; action?: "save" | "use"; value?: boolean };
  if (!payload.id || !payload.action) return Response.json({ error: "灵感操作不完整" }, { status: 400 });

  if (payload.action === "save") {
    await runtime.DB.prepare("UPDATE inspirations SET saved = ? WHERE id = ? AND user_id = ?")
      .bind(payload.value ? 1 : 0, payload.id, userId).run();
    return Response.json({ inspirations: await list(userId) });
  }

  const inspiration = await runtime.DB.prepare(
    `SELECT id, title, creator, occasion, style_tags AS styleTags,
    item_categories AS itemCategories, palette, note, saved,
    used_count AS usedCount FROM inspirations WHERE id = ? AND user_id = ?`,
  ).bind(payload.id, userId).first<InspirationRow>();
  if (!inspiration) return Response.json({ error: "没有找到这条灵感" }, { status: 404 });

  type GarmentRow = Pick<Garment, "id" | "name" | "category" | "color" | "affinity"> & { favorite: number };
  const { results: garments } = await runtime.DB.prepare(
    `SELECT id, name, category, color, affinity, favorite FROM garments
    WHERE user_id = ? ORDER BY affinity DESC, favorite DESC, wear_count DESC`,
  ).bind(userId).all<GarmentRow>();
  const categories = parseList<GarmentCategory>(inspiration.itemCategories);
  const chosen = categories
    .map((category) => garments.find((item) => item.category === category))
    .filter((item): item is GarmentRow => Boolean(item))
    .filter((item, index, items) => items.findIndex((other) => other.id === item.id) === index);
  if (!chosen.length) return Response.json({ error: "衣柜里暂时没有可映射的单品" }, { status: 400 });

  const outfit: Outfit = {
    id: `inspired-${crypto.randomUUID()}`,
    name: `借鉴 · ${inspiration.title}`,
    itemIds: chosen.map((item) => item.id),
    score: Math.min(96, 78 + chosen.length * 4),
    reason: `把「${inspiration.title}」的${parseList(inspiration.styleTags).join("、")}语言映射到你的真实衣柜。`,
    occasion: inspiration.occasion,
    weather: "按当前天气调整",
  };
  await runtime.DB.batch([
    runtime.DB.prepare(
      `INSERT INTO outfits (id, user_id, name, occasion, weather, item_ids, score, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(outfit.id, userId, outfit.name, outfit.occasion, outfit.weather, JSON.stringify(outfit.itemIds), outfit.score, outfit.reason),
    runtime.DB.prepare("UPDATE inspirations SET used_count = used_count + 1 WHERE id = ? AND user_id = ?")
      .bind(payload.id, userId),
  ]);
  return Response.json({ outfit });
}
