import { runtime } from "@/db/runtime";
import type { BodyMeasurements } from "@/lib/phase-two-three";
import type { Garment, GarmentCategory } from "@/lib/wardrobe";
import { safeJsonArray } from "@/lib/server-p0";

type GarmentRow = Omit<Garment, "styleTags" | "occasionTags" | "favorite" | "imageUrl"> & {
  category: GarmentCategory;
  styleTags: string;
  occasionTags: string;
  favorite: number;
  imageKey: string | null;
};

export async function loadAllGarments(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT g.id, g.name, g.category, g.color, g.pattern, g.material, g.season,
     g.style_tags AS styleTags, g.occasion_tags AS occasionTags, g.image_key AS imageKey,
     g.source_type AS sourceType, g.confidence, g.favorite, g.wear_count AS wearCount,
     g.affinity, g.availability_status AS availabilityStatus,
     g.storage_location AS storageLocation, g.last_worn_at AS lastWornAt,
     g.created_at AS createdAt,
     (SELECT brand FROM garment_sources WHERE garment_id = g.id AND user_id = g.user_id ORDER BY created_at DESC LIMIT 1) AS brand,
     (SELECT product_code FROM garment_sources WHERE garment_id = g.id AND user_id = g.user_id ORDER BY created_at DESC LIMIT 1) AS productCode,
     (SELECT product_url FROM garment_sources WHERE garment_id = g.id AND user_id = g.user_id ORDER BY created_at DESC LIMIT 1) AS productUrl
     FROM garments g WHERE g.user_id = ? ORDER BY g.favorite DESC, g.affinity DESC, g.created_at DESC`,
  ).bind(userId).all<GarmentRow>();
  return results.map((row): Garment => ({
    ...row,
    styleTags: safeJsonArray(row.styleTags),
    occasionTags: safeJsonArray(row.occasionTags),
    favorite: Boolean(row.favorite),
    imageUrl: row.imageKey ? `/api/wardrobe/image?id=${encodeURIComponent(row.id)}` : null,
  }));
}

export function safeJsonObject<T>(value: string | null | undefined, fallback: T): T {
  try {
    const parsed = JSON.parse(value ?? "") as T;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch { return fallback; }
}

export function estimateSize(measurements: Partial<BodyMeasurements> | null) {
  if (!measurements) return { size: "M（待身体参数确认）", fit: 64, reason: "尚未建立身体参数，先给出常规版型建议；试穿前请核对商品尺码表。" };
  const chest = Number(measurements.chest ?? 88);
  const waist = Number(measurements.waist ?? 72);
  const hips = Number(measurements.hips ?? 92);
  const frame = Math.max(chest, waist + 16, hips - 4);
  const size = frame < 84 ? "S" : frame < 94 ? "M" : frame < 104 ? "L" : "XL";
  return {
    size,
    fit: 82,
    reason: `根据最近人体档案的胸围 ${Math.round(chest)}cm、腰围 ${Math.round(waist)}cm、臀围 ${Math.round(hips)}cm 推测；不同品牌仍需对照成衣尺寸。`,
  };
}

export function potentialWithWardrobe(candidate: { category: GarmentCategory; styleTags: string[]; color: string }, garments: Garment[]) {
  const available = garments.filter((item) => ["available", "stored"].includes(item.availabilityStatus ?? "available"));
  const complements: Record<GarmentCategory, GarmentCategory[]> = {
    上装: ["下装", "外套", "鞋履", "配饰"],
    下装: ["上装", "外套", "鞋履", "配饰"],
    连衣裙: ["外套", "鞋履", "配饰"],
    外套: ["上装", "下装", "连衣裙", "鞋履"],
    鞋履: ["上装", "下装", "连衣裙", "外套"],
    配饰: ["上装", "下装", "连衣裙", "外套"],
  };
  const compatible = available.filter((item) => complements[candidate.category].includes(item.category));
  const styleLinks = compatible.reduce((sum, item) => sum + Math.max(1, item.styleTags.filter((tag) => candidate.styleTags.includes(tag)).length), 0);
  const categoryVariety = new Set(compatible.map((item) => item.category)).size;
  return Math.max(0, Math.min(24, Math.round(styleLinks * 0.7 + categoryVariety * 2)));
}

export function duplicateScore(candidate: { category: GarmentCategory; color: string; styleTags: string[] }, garment: Garment) {
  if (candidate.category !== garment.category) return 0;
  const color = candidate.color && garment.color && (candidate.color.includes(garment.color) || garment.color.includes(candidate.color)) ? 4 : 0;
  const style = garment.styleTags.filter((tag) => candidate.styleTags.includes(tag)).length * 1.5;
  return 4 + color + style;
}
