import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { StyleInterpretation } from "@/lib/p0";
import { fetchWeatherForecast, isoDate, loadRecommendationGarments } from "@/lib/server-p0";
import { rankOutfits } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

function targetDate(query: string) {
  const date = new Date();
  if (/明天|tomorrow/i.test(query)) date.setDate(date.getDate() + 1);
  else if (/后天/.test(query)) date.setDate(date.getDate() + 2);
  return isoDate(date);
}

function inferOccasion(query: string) {
  if (/客户|开会|会议|汇报|面试|办公室|上班|通勤|work|office|client/i.test(query)) return "会议";
  if (/约会|晚餐|dating|date night/i.test(query)) return "约会";
  if (/婚礼|宴会|正式|典礼|formal/i.test(query)) return "正式";
  if (/周末|逛街|咖啡|散步|休闲|weekend|casual/i.test(query)) return "周末";
  return "通勤";
}

function inferLocation(query: string) {
  const entries = ["伦敦", "London", "上海", "Shanghai", "北京", "Beijing", "深圳", "Shenzhen", "广州", "Guangzhou", "巴黎", "Paris", "东京", "Tokyo"];
  return entries.find((entry) => query.toLowerCase().includes(entry.toLowerCase())) ?? "伦敦";
}

function parseTags(query: string) {
  const mapping: Array<[RegExp, string]> = [
    [/正式|专业|客户|会议|formal|professional/i, "通勤"],
    [/松弛|舒服|慵懒|relaxed|comfortable/i, "松弛"],
    [/可爱|甜美|cute/i, "浪漫"],
    [/复古|vintage/i, "复古"],
    [/极简|简约|minimal/i, "极简"],
    [/街头|酷|street/i, "街头"],
    [/优雅|高级|elegant/i, "优雅"],
  ];
  return mapping.filter(([pattern]) => pattern.test(query)).map(([, tag]) => tag);
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as { query?: string };
  const query = String(payload.query ?? "").trim().slice(0, 800);
  if (!query) return Response.json({ error: "请先描述你想要的穿搭" }, { status: 400 });

  const location = inferLocation(query);
  const date = targetDate(query);
  const [forecast, garments] = await Promise.all([
    fetchWeatherForecast({ location, days: 10 }),
    loadRecommendationGarments(userId),
  ]);
  const day = forecast.find((entry) => entry.date === date) ?? forecast[0];
  const requestedWeather = /下雨|有雨|阵雨|雨天|rain|shower/i.test(query)
    ? "有雨"
    : /下雪|有雪|雪天|snow/i.test(query) ? "有雪" : day?.label ?? "天气多变";
  const explicitTemperature = query.match(/(-?\d{1,2})\s*(?:°|度)/)?.[1];
  const temperature = explicitTemperature
    ? Number(explicitTemperature)
    : Math.round(((day?.temperatureMin ?? 12) + (day?.temperatureMax ?? 18)) / 2);
  const occasion = inferOccasion(query);
  const moodTags = parseTags(query);
  const colors = ["黑色", "白色", "米白", "燕麦色", "蓝色", "靛蓝", "灰色", "炭灰", "红色", "绿色", "棕色", "粉色"];
  const preferredColors = colors.filter((color) => query.includes(color) && !query.includes(`不要${color}`) && !query.includes(`避免${color}`));
  const avoidedColors = colors.filter((color) => query.includes(`不要${color}`) || query.includes(`避免${color}`));
  const formality = /不要太正式|别太正式|不要像销售|别像销售|不像销售|不想太正式/.test(query)
    ? "松弛正式"
    : /正式|客户|会议|面试/.test(query) ? "正式" : "日常";
  const rankedGarments = garments.map((item) => ({
    ...item,
    affinity: item.affinity
      + item.styleTags.filter((tag) => moodTags.includes(tag)).length * 2.2
      + (preferredColors.some((color) => item.color.includes(color.replace("色", ""))) ? 2 : 0)
      - (avoidedColors.some((color) => item.color.includes(color.replace("色", ""))) ? 20 : 0),
  }));
  const mustWear = rankedGarments.find((item) => query.includes(item.name) || item.productCode && query.includes(item.productCode));
  const outfits = rankOutfits(rankedGarments, occasion === "正式" ? "会议" : occasion, temperature, mustWear?.id)
    .map((outfit, index) => ({
      ...outfit,
      id: `natural-${crypto.randomUUID()}`,
      name: index === 0 ? `${formality}首选` : index === 1 ? "更松弛的替换" : "保留个性的方案",
      weather: `${day?.location ?? location} · ${requestedWeather} · ${temperature}°C`,
      reason: `${outfit.reason}${requestedWeather === "有雨" ? " 降雨时建议另加防水鞋履。" : requestedWeather === "有雪" ? " 降雪时需再确认鞋底防滑。" : ""}${formality === "松弛正式" ? " 保留专业感，但弱化传统销售式商务感。" : ""}`,
    }));

  const interpretation: StyleInterpretation = {
    original: query, occasion, temperature, location: day?.location ?? location,
    dateLabel: date, formality, moodTags, preferredColors, avoidedColors,
    weatherLabel: requestedWeather,
    summary: `${date === isoDate() ? "今天" : /后天/.test(query) ? "后天" : "明天"} · ${day?.location ?? location} · ${requestedWeather} · ${occasion} · ${formality}`,
  };

  if (outfits.length) {
    await runtime.DB.batch(outfits.map((outfit) => runtime.DB.prepare(
      `INSERT OR REPLACE INTO outfits (id, user_id, name, occasion, weather, item_ids, score, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(outfit.id, userId, outfit.name, outfit.occasion, outfit.weather, JSON.stringify(outfit.itemIds), outfit.score, outfit.reason)));
  }
  return Response.json({ interpretation, outfits });
}
