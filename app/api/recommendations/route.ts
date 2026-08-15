import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { rankOutfits, type Garment, type GarmentCategory } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  pattern: string;
  material: string;
  season: string;
  styleTags: string;
  occasionTags: string;
  favorite: number;
  wearCount: number;
  affinity: number;
  confidence: number;
  sourceType: Garment["sourceType"];
};

function parseTags(value: string) {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = (await request.json()) as {
    occasion?: string;
    temperature?: number;
    mustWearId?: string;
  };
  const { results } = await runtime.DB.prepare(
    `SELECT id, name, category, color, pattern, material, season,
      style_tags AS styleTags, occasion_tags AS occasionTags,
      favorite, wear_count AS wearCount, affinity, confidence,
      source_type AS sourceType
    FROM garments WHERE user_id = ?`,
  )
    .bind(userId)
    .all<Row>();

  const garments: Garment[] = results.map((row) => ({
    ...row,
    styleTags: parseTags(row.styleTags),
    occasionTags: parseTags(row.occasionTags),
    favorite: Boolean(row.favorite),
    imageUrl: null,
  }));
  const occasion = payload.occasion ?? "通勤";
  const temperature = Number.isFinite(payload.temperature)
    ? Number(payload.temperature)
    : 17;
  const outfits = rankOutfits(garments, occasion, temperature, payload.mustWearId);

  if (outfits.length) {
    await runtime.DB.batch(
      outfits.map((outfit) =>
        runtime.DB.prepare(
          `INSERT OR REPLACE INTO outfits
          (id, user_id, name, occasion, weather, item_ids, score, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          outfit.id,
          userId,
          outfit.name,
          outfit.occasion,
          outfit.weather,
          JSON.stringify(outfit.itemIds),
          outfit.score,
          outfit.reason,
        ),
      ),
    );
  }
  return Response.json({ outfits });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = (await request.json()) as {
    id?: string;
    itemIds?: string[];
    name?: string;
  };
  if (!payload.id || !Array.isArray(payload.itemIds) || payload.itemIds.length === 0) {
    return Response.json({ error: "搭配信息不完整" }, { status: 400 });
  }

  await runtime.DB.prepare(
    `UPDATE outfits SET name = ?, item_ids = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(
      String(payload.name || "我的手动搭配").slice(0, 80),
      JSON.stringify(payload.itemIds),
      payload.id,
      userId,
    )
    .run();
  return Response.json({ ok: true });
}
