import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { GarmentRelation } from "@/lib/p1";
import { loadAllGarments } from "@/lib/server-p1";
import { safeJsonArray } from "@/lib/server-p0";
import { rankOutfits } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type OutfitRow = { id: string; name: string; occasion: string; itemIds: string; createdAt: string };

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少衣物编号" }, { status: 400 });
  const garments = await loadAllGarments(userId);
  const garment = garments.find((item) => item.id === id);
  if (!garment) return Response.json({ error: "衣物不存在" }, { status: 404 });

  const [outfitRows, planRows, wear] = await Promise.all([
    runtime.DB.prepare(
      "SELECT id, name, occasion, item_ids AS itemIds, created_at AS createdAt FROM outfits WHERE user_id = ? ORDER BY created_at DESC LIMIT 240",
    ).bind(userId).all<OutfitRow>(),
    runtime.DB.prepare(
      `SELECT id, name, occasion, item_ids AS itemIds, created_at AS createdAt
       FROM outfit_plans WHERE user_id = ? ORDER BY plan_date DESC LIMIT 120`,
    ).bind(userId).all<OutfitRow>(),
    runtime.DB.prepare(
      "SELECT MAX(worn_date) AS lastWornAt FROM wear_events WHERE user_id = ? AND garment_id = ?",
    ).bind(userId, id).first<{ lastWornAt: string | null }>(),
  ]);
  const related = [...outfitRows.results, ...planRows.results]
    .map((row) => ({ ...row, itemIds: safeJsonArray(row.itemIds) }))
    .filter((row) => row.itemIds.includes(id));
  const uniqueOutfits = related.filter((row, index, list) => list.findIndex((item) => `${item.name}|${[...item.itemIds].sort().join("|")}` === `${row.name}|${[...row.itemIds].sort().join("|")}`) === index);
  const companionCounts = new Map<string, number>();
  uniqueOutfits.forEach((outfit) => outfit.itemIds.filter((itemId) => itemId !== id).forEach((itemId) => companionCounts.set(itemId, (companionCounts.get(itemId) ?? 0) + 1)));
  const companions = garments
    .filter((item) => item.id !== id)
    .map((item) => {
      const count = companionCounts.get(item.id) ?? 0;
      const styleMatch = item.styleTags.filter((tag) => garment.styleTags.includes(tag)).length;
      const occasionMatch = item.occasionTags.filter((tag) => garment.occasionTags.includes(tag)).length;
      const complementary = item.category !== garment.category ? 2 : 0;
      return { garment: item, count, score: Math.round(count * 12 + styleMatch * 5 + occasionMatch * 3 + complementary + item.affinity) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const occasionCounts = new Map<string, number>();
  uniqueOutfits.forEach((outfit) => occasionCounts.set(outfit.occasion || "日常", (occasionCounts.get(outfit.occasion || "日常") ?? 0) + 1));
  garment.occasionTags.forEach((occasion) => {
    if (!occasionCounts.has(occasion)) occasionCounts.set(occasion, 0);
  });
  const rankingWardrobe = garments.map((item) => ({ ...item, availabilityStatus: "available" as const }));
  const suggestedLooks = rankOutfits(rankingWardrobe, garment.occasionTags[0] ?? "通勤", 18, id)
    .map((outfit, index) => ({
      ...outfit,
      id: `relation-${id}-${index}`,
      name: ["最稳妥的新搭法", "跨场景变化", "风格突破方案"][index] ?? outfit.name,
      reason: `围绕「${garment.name}」，${index === 0 ? "优先选择关系分最高的衣物" : index === 1 ? "切换正式度和使用场合" : "引入较少一起出现的风格连接单品"}。`,
    }));

  const relation: GarmentRelation = {
    garment,
    outfits: uniqueOutfits.slice(0, 12),
    companions,
    lastWornAt: wear?.lastWornAt ?? garment.lastWornAt ?? null,
    occasions: [...occasionCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    suggestedLooks,
  };
  return Response.json({ relation });
}
