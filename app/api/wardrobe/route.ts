import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { seedGarments, type Garment, type GarmentCategory } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type GarmentRow = {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  pattern: string;
  material: string;
  season: string;
  styleTags: string;
  occasionTags: string;
  imageKey: string | null;
  sourceType: Garment["sourceType"];
  confidence: number;
  favorite: number;
  wearCount: number;
  affinity: number;
  createdAt: string;
};

function safeArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toGarment(row: GarmentRow): Garment {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color,
    pattern: row.pattern,
    material: row.material,
    season: row.season,
    styleTags: safeArray(row.styleTags),
    occasionTags: safeArray(row.occasionTags),
    imageUrl: row.imageKey ? `/api/wardrobe/image?id=${encodeURIComponent(row.id)}` : null,
    sourceType: row.sourceType,
    confidence: row.confidence,
    favorite: Boolean(row.favorite),
    wearCount: row.wearCount,
    affinity: row.affinity,
    createdAt: row.createdAt,
  };
}

async function seedUser(userId: string) {
  const existing = await runtime.DB.prepare(
    "SELECT COUNT(*) AS count FROM garments WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  await runtime.DB.batch(
    seedGarments.map((item) =>
      runtime.DB.prepare(
        `INSERT OR IGNORE INTO garments (
          id, user_id, name, category, color, pattern, material, season,
          style_tags, occasion_tags, source_type, confidence, favorite,
          wear_count, affinity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${userId}-${item.id}`,
        userId,
        item.name,
        item.category,
        item.color,
        item.pattern,
        item.material,
        item.season,
        JSON.stringify(item.styleTags),
        JSON.stringify(item.occasionTags),
        item.sourceType,
        item.confidence,
        item.favorite ? 1 : 0,
        item.wearCount,
        item.affinity,
      ),
    ),
  );
}

async function listGarments(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, name, category, color, pattern, material, season,
      style_tags AS styleTags, occasion_tags AS occasionTags,
      image_key AS imageKey, source_type AS sourceType, confidence,
      favorite, wear_count AS wearCount, affinity, created_at AS createdAt
    FROM garments WHERE user_id = ? ORDER BY favorite DESC, created_at DESC`,
  )
    .bind(userId)
    .all<GarmentRow>();
  return results.map(toGarment);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await seedUser(userId);
  return Response.json({ garments: await listGarments(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const formData = await request.formData();
  const file = formData.get("image");
  const id = crypto.randomUUID();
  let imageKey: string | null = null;
  let imageType: string | null = null;

  if (file instanceof File && file.size > 0) {
    imageType = file.type || "image/png";
    imageKey = `${userId}/${id}`;
    await runtime.WARDROBE_IMAGES.put(imageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: imageType },
    });
  }

  const name = String(formData.get("name") || "未命名衣物").slice(0, 80);
  const category = String(formData.get("category") || "上装");
  const color = String(formData.get("color") || "待确认").slice(0, 30);
  const pattern = String(formData.get("pattern") || "纯色").slice(0, 30);
  const material = String(formData.get("material") || "待确认").slice(0, 30);
  const season = String(formData.get("season") || "四季").slice(0, 20);
  const styleTags = String(formData.get("styleTags") || "[]");
  const occasionTags = String(formData.get("occasionTags") || "[]");
  const sourceType = String(formData.get("sourceType") || "ai_guess");
  const confidence = Number(formData.get("confidence") || 0.72);

  await runtime.DB.prepare(
    `INSERT INTO garments (
      id, user_id, name, category, color, pattern, material, season,
      style_tags, occasion_tags, image_key, image_type, source_type, confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      userId,
      name,
      category,
      color,
      pattern,
      material,
      season,
      styleTags,
      occasionTags,
      imageKey,
      imageType,
      sourceType,
      Number.isFinite(confidence) ? confidence : 0.72,
    )
    .run();

  const created = await runtime.DB.prepare(
    `SELECT id, name, category, color, pattern, material, season,
      style_tags AS styleTags, occasion_tags AS occasionTags,
      image_key AS imageKey, source_type AS sourceType, confidence,
      favorite, wear_count AS wearCount, affinity, created_at AS createdAt
    FROM garments WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<GarmentRow>();

  return Response.json({ garment: created ? toGarment(created) : null }, { status: 201 });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = (await request.json()) as {
    id?: string;
    action?: "favorite" | "worn" | "update";
    value?: boolean;
    fields?: Partial<Garment>;
  };
  if (!payload.id) return Response.json({ error: "缺少衣物编号" }, { status: 400 });

  if (payload.action === "favorite") {
    await runtime.DB.prepare(
      "UPDATE garments SET favorite = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    )
      .bind(payload.value ? 1 : 0, payload.id, userId)
      .run();
  } else if (payload.action === "worn") {
    await runtime.DB.prepare(
      "UPDATE garments SET wear_count = wear_count + 1, affinity = affinity + 1.5, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    )
      .bind(payload.id, userId)
      .run();
  } else if (payload.action === "update" && payload.fields) {
    const fields = payload.fields;
    await runtime.DB.prepare(
      `UPDATE garments SET name = ?, category = ?, color = ?, pattern = ?,
       material = ?, season = ?, style_tags = ?, occasion_tags = ?,
       source_type = 'manual', confidence = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        fields.name ?? "未命名衣物",
        fields.category ?? "上装",
        fields.color ?? "待确认",
        fields.pattern ?? "纯色",
        fields.material ?? "待确认",
        fields.season ?? "四季",
        JSON.stringify(fields.styleTags ?? []),
        JSON.stringify(fields.occasionTags ?? []),
        payload.id,
        userId,
      )
      .run();
  } else {
    return Response.json({ error: "不支持的操作" }, { status: 400 });
  }

  return Response.json({ garments: await listGarments(userId) });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少衣物编号" }, { status: 400 });

  const row = await runtime.DB.prepare(
    "SELECT image_key AS imageKey FROM garments WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first<{ imageKey: string | null }>();
  if (row?.imageKey) await runtime.WARDROBE_IMAGES.delete(row.imageKey);
  await runtime.DB.prepare("DELETE FROM garments WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return Response.json({ ok: true });
}
