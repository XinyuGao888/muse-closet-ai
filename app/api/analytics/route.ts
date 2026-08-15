import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { WardrobeAnalytics } from "@/lib/p0";
import { safeJsonArray } from "@/lib/server-p0";
import { categoryColors, type Garment, type GarmentCategory } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type Row = Omit<Garment, "styleTags" | "occasionTags" | "favorite" | "imageUrl"> & {
  category: GarmentCategory;
  styleTags: string;
  occasionTags: string;
  favorite: number;
  imageKey: string | null;
};

function distribution(values: string[], colors?: Record<string, string>) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value || "待确认", (counts.get(value || "待确认") ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, color: colors?.[label] }));
}

function daysSince(value?: string | null) {
  if (!value) return 9999;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const [{ results }, outfitRows] = await Promise.all([
    runtime.DB.prepare(
      `SELECT id, name, category, color, pattern, material, season,
       style_tags AS styleTags, occasion_tags AS occasionTags, image_key AS imageKey,
       source_type AS sourceType, confidence, favorite, wear_count AS wearCount,
       affinity, availability_status AS availabilityStatus,
       storage_location AS storageLocation, last_worn_at AS lastWornAt,
       created_at AS createdAt
       FROM garments WHERE user_id = ?`,
    ).bind(userId).all<Row>(),
    runtime.DB.prepare("SELECT item_ids AS itemIds FROM outfits WHERE user_id = ?").bind(userId).all<{ itemIds: string }>(),
  ]);
  const garments: Garment[] = results.map((row) => ({
    ...row,
    styleTags: safeJsonArray(row.styleTags), occasionTags: safeJsonArray(row.occasionTags),
    favorite: Boolean(row.favorite),
    imageUrl: row.imageKey ? `/api/wardrobe/image?id=${encodeURIComponent(row.id)}` : null,
  }));
  const participation = new Map<string, number>();
  outfitRows.results.flatMap((row) => safeJsonArray(row.itemIds)).forEach((id) => participation.set(id, (participation.get(id) ?? 0) + 1));
  const participationList = garments
    .map((garment) => ({ garment, count: participation.get(garment.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const byWear = [...garments].sort((a, b) => b.wearCount - a.wearCount);
  const inactive = (days: number) => garments.filter((item) => daysSince(item.lastWornAt ?? item.createdAt) >= days).sort((a, b) => a.wearCount - b.wearCount);
  const categoryCount = (category: GarmentCategory) => garments.filter((item) => item.category === category).length;
  const neutralTop = garments.some((item) => item.category === "上装" && /黑|白|灰|米|燕麦|棕/.test(item.color));
  const missingBasics: WardrobeAnalytics["missingBasics"] = [];
  if (!neutralTop) missingBasics.push({ title: "中性色基础上装", reason: "能连接彩色下装与多数外套，是提高组合率最快的单品。", category: "上装" });
  if (categoryCount("下装") < 2) missingBasics.push({ title: "第二件高复用下装", reason: "补足深浅或正式度差异，避免所有搭配落在同一条裤子上。", category: "下装" });
  if (categoryCount("外套") < 1) missingBasics.push({ title: "四季叠穿外套", reason: "解决温差和正式度切换，也是天气推荐的关键层。", category: "外套" });
  if (categoryCount("鞋履") < 2) missingBasics.push({ title: "第二双场景鞋", reason: "建议与现有鞋履拉开正式度，显著增加整套搭配变化。", category: "鞋履" });
  if (!missingBasics.length) missingBasics.push({ title: "衣柜骨架已经完整", reason: "下一件更适合补充与你低频单品能形成至少三套组合的风格连接款。", category: "配饰" });

  const analytics: WardrobeAnalytics = {
    totalItems: garments.length,
    totalWears: garments.reduce((sum, item) => sum + item.wearCount, 0),
    utilization: Math.round((garments.filter((item) => item.wearCount > 0).length / Math.max(1, garments.length)) * 100),
    availableCount: garments.filter((item) => !item.availabilityStatus || ["available", "stored"].includes(item.availabilityStatus)).length,
    unavailableCount: garments.filter((item) => item.availabilityStatus && !["available", "stored"].includes(item.availabilityStatus)).length,
    mostWorn: byWear.slice(0, 5),
    leastWorn: [...byWear].reverse().slice(0, 5),
    inactive: { days30: inactive(30), days60: inactive(60), days90: inactive(90) },
    colors: distribution(garments.map((item) => item.color)),
    categories: distribution(garments.map((item) => item.category), categoryColors),
    seasons: distribution(garments.map((item) => item.season)),
    outfitParticipation: participationList.slice(0, 8),
    isolatedItems: participationList.filter((item) => item.count === 0).slice(0, 5).map((item) => item.garment),
    missingBasics,
  };
  return Response.json({ analytics });
}
