import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { PreferenceProfile } from "@/lib/phase-two-three";

function parseList(value: string | undefined) {
  try { return value ? (JSON.parse(value) as string[]) : []; } catch { return []; }
}

function add(map: Map<string, number>, labels: string[], amount: number) {
  labels.forEach((label) => map.set(label, (map.get(label) ?? 0) + amount));
}

function topWeights(map: Map<string, number>) {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, sorted[0]?.[1] ?? 1);
  return sorted.map(([label, value]) => ({ label, score: Math.round(38 + (value / max) * 58) }));
}

async function ensureProfile(userId: string) {
  await runtime.DB.prepare("INSERT OR IGNORE INTO preference_profiles (user_id) VALUES (?)").bind(userId).run();
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await ensureProfile(userId);
  const stored = await runtime.DB.prepare(
    `SELECT explicit_styles AS explicitStyles, blocked_colors AS blockedColors,
    fit_preference AS fitPreference, exploration, total_signals AS totalSignals
    FROM preference_profiles WHERE user_id = ?`,
  ).bind(userId).first<{ explicitStyles: string; blockedColors: string; fitPreference: string; exploration: number; totalSignals: number }>();

  const { results: garments } = await runtime.DB.prepare(
    `SELECT color, style_tags AS styleTags, occasion_tags AS occasionTags,
    favorite, wear_count AS wearCount, affinity FROM garments WHERE user_id = ?`,
  ).bind(userId).all<{ color: string; styleTags: string; occasionTags: string; favorite: number; wearCount: number; affinity: number }>();
  const { results: feedback } = await runtime.DB.prepare(
    "SELECT action, COUNT(*) AS count FROM feedback WHERE user_id = ? GROUP BY action",
  ).bind(userId).all<{ action: string; count: number }>();

  const styles = new Map<string, number>();
  const colors = new Map<string, number>();
  const occasions = new Map<string, number>();
  garments.forEach((item) => {
    const signal = Math.max(0.3, item.affinity + item.wearCount * 0.22 + (item.favorite ? 1.8 : 0));
    add(styles, parseList(item.styleTags), signal);
    add(colors, [item.color], signal);
    add(occasions, parseList(item.occasionTags), signal * 0.8);
  });
  const explicitStyles = parseList(stored?.explicitStyles);
  add(styles, explicitStyles, 3.2);
  const feedbackCounts = Object.fromEntries(feedback.map((item) => [item.action, Number(item.count)]));
  const totalSignals = feedback.reduce((sum, item) => sum + Number(item.count), 0) + garments.reduce((sum, item) => sum + item.wearCount, 0);
  if (totalSignals !== stored?.totalSignals) {
    await runtime.DB.prepare("UPDATE preference_profiles SET total_signals = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
      .bind(totalSignals, userId).run();
  }
  const profile: PreferenceProfile = {
    styleWeights: topWeights(styles),
    colorWeights: topWeights(colors),
    occasionWeights: topWeights(occasions),
    explicitStyles,
    blockedColors: parseList(stored?.blockedColors),
    fitPreference: stored?.fitPreference ?? "标准",
    exploration: stored?.exploration ?? 35,
    totalSignals,
    feedbackCounts,
  };
  return Response.json({ profile });
}

export async function PATCH(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  await ensureProfile(userId);
  const payload = (await request.json()) as {
    explicitStyles?: string[];
    blockedColors?: string[];
    fitPreference?: string;
    exploration?: number;
  };
  const exploration = Math.max(0, Math.min(100, Number(payload.exploration ?? 35)));
  await runtime.DB.prepare(
    `UPDATE preference_profiles SET explicit_styles = ?, blocked_colors = ?,
    fit_preference = ?, exploration = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
  ).bind(
    JSON.stringify((payload.explicitStyles ?? []).slice(0, 12)),
    JSON.stringify((payload.blockedColors ?? []).slice(0, 12)),
    String(payload.fitPreference ?? "标准").slice(0, 30),
    exploration,
    userId,
  ).run();
  return GET(request);
}
