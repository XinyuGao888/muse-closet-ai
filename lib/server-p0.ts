import { runtime } from "@/db/runtime";
import type { WeatherDay } from "@/lib/p0";
import type { Garment, GarmentCategory } from "@/lib/wardrobe";

export function safeJsonArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function recordWear(
  userId: string,
  itemIds: string[],
  options: { outfitId?: string; planId?: string; date?: string; source?: string; affinityDelta?: number } = {},
) {
  const wornDate = options.date ?? isoDate();
  const recordedIds: string[] = [];
  for (const garmentId of [...new Set(itemIds)]) {
    const existing = await runtime.DB.prepare(
      "SELECT id FROM wear_events WHERE user_id = ? AND garment_id = ? AND worn_date = ?",
    ).bind(userId, garmentId, wornDate).first<{ id: string }>();
    if (existing) {
      await runtime.DB.prepare(
        `UPDATE garments SET availability_status = 'worn', last_worn_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
      ).bind(wornDate, garmentId, userId).run();
      continue;
    }
    await runtime.DB.batch([
      runtime.DB.prepare(
        `INSERT INTO wear_events (id, user_id, garment_id, outfit_id, plan_id, worn_date, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), userId, garmentId, options.outfitId ?? null,
        options.planId ?? null, wornDate, options.source ?? "manual",
      ),
      runtime.DB.prepare(
        `UPDATE garments SET wear_count = wear_count + 1, affinity = affinity + ?,
         availability_status = 'worn', last_worn_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
      ).bind(options.affinityDelta ?? 1.5, wornDate, garmentId, userId),
    ]);
    recordedIds.push(garmentId);
  }
  return recordedIds;
}

const cityCoordinates: Record<string, { label: string; latitude: number; longitude: number }> = {
  london: { label: "伦敦", latitude: 51.5072, longitude: -0.1276 },
  "伦敦": { label: "伦敦", latitude: 51.5072, longitude: -0.1276 },
  shanghai: { label: "上海", latitude: 31.2304, longitude: 121.4737 },
  "上海": { label: "上海", latitude: 31.2304, longitude: 121.4737 },
  beijing: { label: "北京", latitude: 39.9042, longitude: 116.4074 },
  "北京": { label: "北京", latitude: 39.9042, longitude: 116.4074 },
  shenzhen: { label: "深圳", latitude: 22.5431, longitude: 114.0579 },
  "深圳": { label: "深圳", latitude: 22.5431, longitude: 114.0579 },
  guangzhou: { label: "广州", latitude: 23.1291, longitude: 113.2644 },
  "广州": { label: "广州", latitude: 23.1291, longitude: 113.2644 },
  paris: { label: "巴黎", latitude: 48.8566, longitude: 2.3522 },
  "巴黎": { label: "巴黎", latitude: 48.8566, longitude: 2.3522 },
  tokyo: { label: "东京", latitude: 35.6762, longitude: 139.6503 },
  "东京": { label: "东京", latitude: 35.6762, longitude: 139.6503 },
};

export function resolveLocation(value?: string | null, latitude?: number, longitude?: number) {
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { label: value?.trim() || "当前位置", latitude: Number(latitude), longitude: Number(longitude) };
  }
  const normalized = value?.trim().toLowerCase() ?? "london";
  return cityCoordinates[normalized] ?? cityCoordinates.london;
}

export function weatherLabel(code: number) {
  if (code === 0) return "晴朗";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "有雾";
  if (code >= 51 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 95) return "雷雨";
  return "天气多变";
}

export async function fetchWeatherForecast(options: {
  location?: string | null;
  latitude?: number;
  longitude?: number;
  days?: number;
}) {
  const place = resolveLocation(options.location, options.latitude, options.longitude);
  const days = Math.max(5, Math.min(16, options.days ?? 10));
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", String(days));
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("weather unavailable");
    const data = await response.json() as { daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[] } };
    const daily = data.daily;
    if (!daily?.time?.length) throw new Error("weather empty");
    return daily.time.map((date, index): WeatherDay => ({
      date,
      temperatureMin: Math.round(daily.temperature_2m_min?.[index] ?? 12),
      temperatureMax: Math.round(daily.temperature_2m_max?.[index] ?? 18),
      weatherCode: daily.weather_code?.[index] ?? 3,
      label: weatherLabel(daily.weather_code?.[index] ?? 3),
      location: place.label,
    }));
  } catch {
    const start = new Date();
    return Array.from({ length: days }, (_, index): WeatherDay => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const code = [3, 61, 2, 1, 80][index % 5];
      return {
        date: isoDate(date), temperatureMin: 10 + (index % 3),
        temperatureMax: 16 + (index % 4), weatherCode: code,
        label: weatherLabel(code), location: place.label,
      };
    });
  }
}

export function nextWeekdays(count = 5) {
  const result: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  while (result.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) result.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export async function loadRecommendationGarments(userId: string) {
  type Row = Omit<Garment, "styleTags" | "occasionTags" | "favorite" | "imageUrl"> & {
    category: GarmentCategory;
    styleTags: string;
    occasionTags: string;
    favorite: number;
  };
  const { results } = await runtime.DB.prepare(
    `SELECT id, name, category, color, pattern, material, season,
      style_tags AS styleTags, occasion_tags AS occasionTags,
      source_type AS sourceType, confidence, favorite, wear_count AS wearCount,
      affinity, availability_status AS availabilityStatus,
      storage_location AS storageLocation, last_worn_at AS lastWornAt,
      created_at AS createdAt
     FROM garments
     WHERE user_id = ? AND availability_status IN ('available', 'stored')`,
  ).bind(userId).all<Row>();
  return results.map((row): Garment => ({
    ...row,
    styleTags: safeJsonArray(row.styleTags),
    occasionTags: safeJsonArray(row.occasionTags),
    favorite: Boolean(row.favorite),
    imageUrl: null,
  }));
}
