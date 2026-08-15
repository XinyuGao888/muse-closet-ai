import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { ReminderPreferences } from "@/lib/p1";

export const dynamic = "force-dynamic";

type Row = Omit<ReminderPreferences, "eveningEnabled" | "weatherAlerts" | "morningRerank"> & {
  eveningEnabled: number;
  weatherAlerts: number;
  morningRerank: number;
};

function toPreferences(row: Row): ReminderPreferences {
  return { ...row, eveningEnabled: Boolean(row.eveningEnabled), weatherAlerts: Boolean(row.weatherAlerts), morningRerank: Boolean(row.morningRerank) };
}

async function getPreferences(userId: string) {
  await runtime.DB.prepare("INSERT OR IGNORE INTO reminder_preferences (user_id) VALUES (?)").bind(userId).run();
  const row = await runtime.DB.prepare(
    `SELECT location_label AS locationLabel, latitude, longitude, evening_enabled AS eveningEnabled,
     evening_time AS eveningTime, weather_alerts AS weatherAlerts, morning_rerank AS morningRerank,
     notification_permission AS notificationPermission FROM reminder_preferences WHERE user_id = ?`,
  ).bind(userId).first<Row>();
  return row ? toPreferences(row) : null;
}

export async function GET(request: Request) {
  await ensureSchema();
  return Response.json({ preferences: await getPreferences(getUserId(request)) });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as Partial<ReminderPreferences>;
  const current = await getPreferences(userId);
  if (!current) return Response.json({ error: "提醒设置不可用" }, { status: 500 });
  const latitude = Number(payload.latitude ?? current.latitude);
  const longitude = Number(payload.longitude ?? current.longitude);
  const permission = ["default", "denied", "granted"].includes(String(payload.notificationPermission)) ? payload.notificationPermission : current.notificationPermission;
  const eveningTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(payload.eveningTime)) ? String(payload.eveningTime) : current.eveningTime;
  await runtime.DB.prepare(
    `UPDATE reminder_preferences SET location_label = ?, latitude = ?, longitude = ?,
     evening_enabled = ?, evening_time = ?, weather_alerts = ?, morning_rerank = ?,
     notification_permission = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
  ).bind(
    String(payload.locationLabel ?? current.locationLabel).slice(0, 80),
    Number.isFinite(latitude) ? latitude : null,
    Number.isFinite(longitude) ? longitude : null,
    (payload.eveningEnabled ?? current.eveningEnabled) ? 1 : 0,
    eveningTime,
    (payload.weatherAlerts ?? current.weatherAlerts) ? 1 : 0,
    (payload.morningRerank ?? current.morningRerank) ? 1 : 0,
    permission,
    userId,
  ).run();
  return Response.json({ preferences: await getPreferences(userId) });
}
