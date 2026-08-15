import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { OutfitPlan } from "@/lib/p0";
import { fetchWeatherForecast, loadRecommendationGarments, nextWeekdays, recordWear, safeJsonArray } from "@/lib/server-p0";
import { rankOutfits, type Outfit } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type PlanRow = Omit<OutfitPlan, "itemIds"> & { itemIds: string };

function toPlan(row: PlanRow): OutfitPlan {
  return { ...row, itemIds: safeJsonArray(row.itemIds) };
}

async function listPlans(userId: string, month?: string | null) {
  const query = month
    ? `SELECT id, plan_date AS planDate, outfit_id AS outfitId, name, item_ids AS itemIds,
       occasion, weather_label AS weatherLabel, temperature, weather_code AS weatherCode,
       location, source, status, worn_at AS wornAt
       FROM outfit_plans WHERE user_id = ? AND plan_date LIKE ? ORDER BY plan_date`
    : `SELECT id, plan_date AS planDate, outfit_id AS outfitId, name, item_ids AS itemIds,
       occasion, weather_label AS weatherLabel, temperature, weather_code AS weatherCode,
       location, source, status, worn_at AS wornAt
       FROM outfit_plans WHERE user_id = ? ORDER BY plan_date DESC LIMIT 62`;
  const statement = runtime.DB.prepare(query);
  const { results } = month
    ? await statement.bind(userId, `${month}%`).all<PlanRow>()
    : await statement.bind(userId).all<PlanRow>();
  return results.map(toPlan);
}

async function savePlan(userId: string, date: string, outfit: Outfit, weather: { label: string; temperature: number; code: number; location: string }, source: OutfitPlan["source"]) {
  const id = crypto.randomUUID();
  await runtime.DB.batch([
    runtime.DB.prepare(
      `INSERT OR REPLACE INTO outfits (id, user_id, name, occasion, weather, item_ids, score, reason, saved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).bind(outfit.id, userId, outfit.name, outfit.occasion, outfit.weather, JSON.stringify(outfit.itemIds), outfit.score, outfit.reason),
    runtime.DB.prepare(
      `INSERT INTO outfit_plans
       (id, user_id, plan_date, outfit_id, name, item_ids, occasion, weather_label,
        temperature, weather_code, location, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned')
       ON CONFLICT(user_id, plan_date) DO UPDATE SET outfit_id = excluded.outfit_id,
       name = excluded.name, item_ids = excluded.item_ids, occasion = excluded.occasion,
       weather_label = excluded.weather_label, temperature = excluded.temperature,
       weather_code = excluded.weather_code, location = excluded.location,
       source = excluded.source, status = 'planned', worn_at = NULL, updated_at = CURRENT_TIMESTAMP`,
    ).bind(id, userId, date, outfit.id, outfit.name, JSON.stringify(outfit.itemIds), outfit.occasion, weather.label, weather.temperature, weather.code, weather.location, source),
  ]);
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const [plans, forecast] = await Promise.all([
    listPlans(userId, url.searchParams.get("month")),
    fetchWeatherForecast({ location: url.searchParams.get("location") || "伦敦", days: 16 }),
  ]);
  return Response.json({ plans, forecast });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as {
    action?: "plan_week" | "schedule" | "wear";
    location?: string;
    planId?: string;
    date?: string;
    outfit?: Outfit;
    weather?: { label?: string; temperature?: number; code?: number; location?: string };
  };

  if (payload.action === "wear" && payload.planId) {
    const plan = await runtime.DB.prepare(
      "SELECT item_ids AS itemIds, outfit_id AS outfitId, plan_date AS planDate FROM outfit_plans WHERE id = ? AND user_id = ?",
    ).bind(payload.planId, userId).first<{ itemIds: string; outfitId: string | null; planDate: string }>();
    if (!plan) return Response.json({ error: "没有找到这一天的搭配" }, { status: 404 });
    const recordedIds = await recordWear(userId, safeJsonArray(plan.itemIds), { outfitId: plan.outfitId ?? undefined, planId: payload.planId, date: plan.planDate, source: "calendar", affinityDelta: 2.5 });
    await runtime.DB.prepare(
      "UPDATE outfit_plans SET status = 'worn', worn_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    ).bind(payload.planId, userId).run();
    return Response.json({ plans: await listPlans(userId), recordedIds });
  }

  if (payload.action === "schedule" && payload.date && payload.outfit) {
    const weather = payload.weather ?? {};
    await savePlan(userId, payload.date, payload.outfit, {
      label: weather.label ?? payload.outfit.weather,
      temperature: Number(weather.temperature ?? (Number.parseFloat(payload.outfit.weather) || 18)),
      code: Number(weather.code ?? 3), location: weather.location ?? payload.location ?? "伦敦",
    }, "manual");
    return Response.json({ plans: await listPlans(userId) });
  }

  if (payload.action === "plan_week") {
    const [garments, forecast] = await Promise.all([
      loadRecommendationGarments(userId),
      fetchWeatherForecast({ location: payload.location ?? "伦敦", days: 16 }),
    ]);
    if (!garments.length) return Response.json({ error: "当前没有可用于搭配的衣物" }, { status: 400 });
    const dates = nextWeekdays(5);
    const used = new Set<string>();
    for (const [index, date] of dates.entries()) {
      const day = forecast.find((entry) => entry.date === date) ?? forecast[index];
      const temperature = Math.round(((day?.temperatureMin ?? 12) + (day?.temperatureMax ?? 18)) / 2);
      const occasion = index === 4 ? "周末" : "通勤";
      const candidates = rankOutfits(garments, occasion, temperature);
      const outfit = candidates.find((candidate) => !used.has([...candidate.itemIds].sort().join("|"))) ?? candidates[index % Math.max(1, candidates.length)];
      if (!outfit) continue;
      used.add([...outfit.itemIds].sort().join("|"));
      const adapted = {
        ...outfit,
        id: `week-${date}-${crypto.randomUUID().slice(0, 8)}`,
        name: `${date.slice(5).replace("-", "月")}日 · ${day?.label ?? "日常"}方案`,
        reason: `${day?.location ?? "当地"}${day?.label ?? "天气多变"}，${temperature}°C；这套兼顾${occasion}需要，并避开清洗、借出和维修中的衣物。`,
      };
      await savePlan(userId, date, adapted, {
        label: day?.label ?? "天气多变", temperature,
        code: day?.weatherCode ?? 3, location: day?.location ?? payload.location ?? "伦敦",
      }, "weekly_ai");
    }
    return Response.json({ plans: await listPlans(userId), forecast });
  }

  return Response.json({ error: "日历操作不完整" }, { status: 400 });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少计划编号" }, { status: 400 });
  await runtime.DB.prepare("DELETE FROM outfit_plans WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return Response.json({ plans: await listPlans(userId) });
}
