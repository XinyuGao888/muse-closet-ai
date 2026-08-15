import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { recordWear } from "@/lib/server-p0";
import { seedGarments, type Garment, type GarmentAvailabilityStatus, type GarmentCategory } from "@/lib/wardrobe";

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
  availabilityStatus: GarmentAvailabilityStatus;
  storageLocation: string | null;
  lastWornAt: string | null;
  brand: string | null;
  productCode: string | null;
  productUrl: string | null;
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
    availabilityStatus: row.availabilityStatus,
    storageLocation: row.storageLocation,
    lastWornAt: row.lastWornAt,
    brand: row.brand,
    productCode: row.productCode,
    productUrl: row.productUrl,
    createdAt: row.createdAt,
  };
}

function safeRemoteImage(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" || host === "localhost" || host.endsWith(".local") ||
      host === "127.0.0.1" || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return null;
    return url;
  } catch { return null; }
}

const sourceSelect = `
  (SELECT brand FROM garment_sources WHERE garment_id = garments.id AND user_id = garments.user_id ORDER BY created_at DESC LIMIT 1) AS brand,
  (SELECT product_code FROM garment_sources WHERE garment_id = garments.id AND user_id = garments.user_id ORDER BY created_at DESC LIMIT 1) AS productCode,
  (SELECT product_url FROM garment_sources WHERE garment_id = garments.id AND user_id = garments.user_id ORDER BY created_at DESC LIMIT 1) AS productUrl`;

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
      favorite, wear_count AS wearCount, affinity,
      availability_status AS availabilityStatus, storage_location AS storageLocation,
      last_worn_at AS lastWornAt, created_at AS createdAt,
      ${sourceSelect}
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
  } else {
    const remoteImage = safeRemoteImage(formData.get("remoteImageUrl"));
    if (remoteImage) {
      try {
        const response = await fetch(remoteImage, { signal: AbortSignal.timeout(7000) });
        const length = Number(response.headers.get("content-length") ?? 0);
        const type = response.headers.get("content-type") ?? "";
        if (response.ok && type.startsWith("image/") && (!length || length <= 12_000_000)) {
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength <= 12_000_000) {
            imageType = type;
            imageKey = `${userId}/${id}`;
            await runtime.WARDROBE_IMAGES.put(imageKey, bytes, { httpMetadata: { contentType: type } });
          }
        }
      } catch {
        // Product metadata can still be saved without a remote image.
      }
    }
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
  const brand = String(formData.get("brand") || "").slice(0, 60);
  const productCode = String(formData.get("productCode") || "").slice(0, 100);
  const productUrl = String(formData.get("productUrl") || "").slice(0, 600);
  const rawText = String(formData.get("rawText") || "").slice(0, 2000);

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

  if (brand || productCode || productUrl || rawText || !["ai_guess", "fashion_siglip", "manual"].includes(sourceType)) {
    await runtime.DB.prepare(
      `INSERT INTO garment_sources
      (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), userId, id, sourceType, brand || null, productCode || null, productUrl || null, rawText || null).run();
  }

  const created = await runtime.DB.prepare(
    `SELECT id, name, category, color, pattern, material, season,
      style_tags AS styleTags, occasion_tags AS occasionTags,
      image_key AS imageKey, source_type AS sourceType, confidence,
      favorite, wear_count AS wearCount, affinity,
      availability_status AS availabilityStatus, storage_location AS storageLocation,
      last_worn_at AS lastWornAt, created_at AS createdAt,
      ${sourceSelect}
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
    action?: "favorite" | "worn" | "update" | "status";
    value?: boolean;
    status?: GarmentAvailabilityStatus;
    storageLocation?: string;
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
    await recordWear(userId, [payload.id], { source: "garment" });
  } else if (payload.action === "status" && payload.status) {
    const allowed = new Set<GarmentAvailabilityStatus>(["available", "worn", "washing", "drying", "stored", "lent", "repair"]);
    if (!allowed.has(payload.status)) return Response.json({ error: "衣物状态无效" }, { status: 400 });
    await runtime.DB.prepare(
      `UPDATE garments SET availability_status = ?, storage_location = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
    ).bind(payload.status, String(payload.storageLocation ?? "").slice(0, 80) || null, payload.id, userId).run();
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
  await runtime.DB.prepare("DELETE FROM garment_sources WHERE garment_id = ? AND user_id = ?")
    .bind(id, userId).run();
  await runtime.DB.prepare("DELETE FROM garments WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
  return Response.json({ ok: true });
}
