import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { inspirationSeeds, type BodyMeasurements, type Inspiration, type StyleTwinLook } from "@/lib/phase-two-three";
import { loadAllGarments, safeJsonObject } from "@/lib/server-p1";
import { isRecommendationEligible, type Garment, type GarmentCategory } from "@/lib/wardrobe";

type InspirationRow = Omit<Inspiration, "styleTags" | "itemCategories" | "palette" | "saved"> & {
  styleTags: string;
  itemCategories: string;
  palette: string;
  saved: number;
};

type SessionRow = {
  id: string;
  inspirationId: string;
  inspirationTitle: string;
  creator: string;
  occasion: string;
  styleTags: string;
  itemIds: string;
  score: number;
  formula: string;
  bodyNote: string;
  colorNote: string;
  saved: number;
  feedback: "like" | "reject" | null;
  tryonSessionId: string | null;
  createdAt: string;
};

function safeArray<T = string>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch { return []; }
}

function toLook(row: SessionRow): StyleTwinLook {
  return {
    ...row,
    styleTags: safeArray(row.styleTags),
    itemIds: safeArray(row.itemIds),
    saved: Boolean(row.saved),
  };
}

async function seedInspirations(userId: string) {
  const count = await runtime.DB.prepare("SELECT COUNT(*) AS count FROM inspirations WHERE user_id = ?")
    .bind(userId).first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;
  await runtime.DB.batch(inspirationSeeds.map((item, index) => runtime.DB.prepare(
    `INSERT OR IGNORE INTO inspirations
    (id, user_id, title, creator, occasion, style_tags, item_categories, palette, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(`${userId}-inspiration-${index + 1}`, userId, item.title, item.creator, item.occasion,
    JSON.stringify(item.styleTags), JSON.stringify(item.itemCategories), JSON.stringify(item.palette), item.note)));
}

async function history(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, inspiration_id AS inspirationId, inspiration_title AS inspirationTitle,
    creator, occasion, style_tags AS styleTags, item_ids AS itemIds, score, formula,
    body_note AS bodyNote, color_note AS colorNote, saved, feedback,
    tryon_session_id AS tryonSessionId, created_at AS createdAt
    FROM style_twin_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 12`,
  ).bind(userId).all<SessionRow>();
  return results.map(toLook);
}

function bodyAdvice(measurements: BodyMeasurements) {
  const torso = measurements.chest - measurements.waist;
  const hipBalance = measurements.hips - measurements.shoulder * 2.1;
  if (measurements.bodyShape.includes("梨") || hipBalance > 5) return "用有结构感的上装平衡下半身量感，高腰线会更利落。";
  if (measurements.bodyShape.includes("倒三角") || hipBalance < -7) return "下装保留适度体积，上身减少横向扩张，整体比例会更平衡。";
  if (measurements.bodyShape.includes("苹果") || torso < 10) return "用纵向开合与清晰肩线拉长视觉，避免腰部过度堆叠。";
  if (measurements.height < 160) return "保持上下装色彩连续，并把腰线向上提，视觉重心更轻。";
  if (measurements.height > 180) return "可以大胆使用长线条和层次切分，充分发挥身高带来的廓形优势。";
  return "保持肩腰臀的自然比例，用一处清晰轮廓作为整套造型的视觉锚点。";
}

function garmentScore(item: Garment, inspiration: InspirationRow, explicitStyles: string[], blockedColors: string[]) {
  const styles = safeArray(inspiration.styleTags);
  const styleOverlap = item.styleTags.filter((tag) => styles.includes(tag) || explicitStyles.includes(tag)).length;
  const occasion = item.occasionTags.includes(inspiration.occasion) ? 1 : 0;
  const blocked = blockedColors.some((color) => item.color.includes(color));
  return styleOverlap * 9 + occasion * 7 + item.affinity * 2 + Number(item.favorite) * 5 + Math.min(5, item.wearCount / 3) - (blocked ? 80 : 0);
}

function chooseItems(garments: Garment[], inspiration: InspirationRow, explicitStyles: string[], blockedColors: string[]) {
  const categories = safeArray<GarmentCategory>(inspiration.itemCategories);
  const chosen: Garment[] = [];
  for (const category of categories) {
    const ranked = garments.filter((item) => item.category === category && !chosen.some((used) => used.id === item.id))
      .sort((a, b) => garmentScore(b, inspiration, explicitStyles, blockedColors) - garmentScore(a, inspiration, explicitStyles, blockedColors));
    if (ranked[0]) chosen.push(ranked[0]);
  }
  return chosen.slice(0, 5);
}

async function applyStyleAdapter(payload: unknown, fallback: Array<Omit<StyleTwinLook, "id" | "saved" | "feedback" | "tryonSessionId">>) {
  if (!runtime.STYLE_TWIN_URL) return fallback;
  try {
    const response = await fetch(runtime.STYLE_TWIN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(runtime.STYLE_TWIN_TOKEN ? { authorization: `Bearer ${runtime.STYLE_TWIN_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return fallback;
    const result = await response.json() as { looks?: Array<Partial<StyleTwinLook>> };
    if (!Array.isArray(result.looks)) return fallback;
    return fallback.map((look) => {
      const enriched = result.looks?.find((item) => item.inspirationId === look.inspirationId);
      return {
        ...look,
        score: Math.max(1, Math.min(99, Number(enriched?.score ?? look.score))),
        formula: String(enriched?.formula || look.formula).slice(0, 180),
        bodyNote: String(enriched?.bodyNote || look.bodyNote).slice(0, 220),
        colorNote: String(enriched?.colorNote || look.colorNote).slice(0, 180),
      };
    });
  } catch { return fallback; }
}

export async function GET(request: Request) {
  await ensureSchema();
  return Response.json({ looks: await history(getUserId(request)) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = await request.json() as {
    action?: "recommend" | "like" | "reject" | "save";
    id?: string;
    bodyModelId?: string;
    occasion?: string;
    inspirationId?: string;
  };

  if (payload.action && payload.action !== "recommend") {
    if (!payload.id) return Response.json({ error: "缺少推荐记录" }, { status: 400 });
    const row = await runtime.DB.prepare(
      `SELECT id, inspiration_id AS inspirationId, inspiration_title AS inspirationTitle,
      creator, occasion, style_tags AS styleTags, item_ids AS itemIds, score, formula,
      body_note AS bodyNote, color_note AS colorNote, saved, feedback,
      tryon_session_id AS tryonSessionId, created_at AS createdAt
      FROM style_twin_sessions WHERE id = ? AND user_id = ?`,
    ).bind(payload.id, userId).first<SessionRow>();
    if (!row) return Response.json({ error: "没有找到这套造型" }, { status: 404 });
    const itemIds = safeArray(row.itemIds);
    const delta = payload.action === "reject" ? -0.7 : payload.action === "like" ? 0.5 : 0.8;
    if (payload.action === "save") {
      const nextSaved = row.saved ? 0 : 1;
      await runtime.DB.batch([
        runtime.DB.prepare("UPDATE style_twin_sessions SET saved = ? WHERE id = ? AND user_id = ?").bind(nextSaved, row.id, userId),
        runtime.DB.prepare(
          `INSERT OR IGNORE INTO outfits (id, user_id, name, occasion, weather, item_ids, score, reason, saved)
          VALUES (?, ?, ?, ?, '按当前天气调整', ?, ?, ?, 1)`,
        ).bind(`style-${row.id}`, userId, `Style Twin · ${row.inspirationTitle}`, row.occasion, row.itemIds, row.score,
          `借鉴 ${row.creator} 的穿搭语言，并结合当前人体比例与个人衣柜生成。`),
        runtime.DB.prepare("UPDATE outfits SET saved = ? WHERE id = ? AND user_id = ?")
          .bind(nextSaved, `style-${row.id}`, userId),
      ]);
    } else {
      await runtime.DB.prepare("UPDATE style_twin_sessions SET feedback = ? WHERE id = ? AND user_id = ?")
        .bind(payload.action, row.id, userId).run();
    }
    const statements = itemIds.map((id) => runtime.DB.prepare("UPDATE garments SET affinity = affinity + ? WHERE id = ? AND user_id = ?").bind(delta, id, userId));
    statements.push(runtime.DB.prepare(
      `INSERT INTO preference_profiles (user_id, total_signals) VALUES (?, 1)
      ON CONFLICT(user_id) DO UPDATE SET total_signals = total_signals + 1, updated_at = CURRENT_TIMESTAMP`,
    ).bind(userId));
    statements.push(runtime.DB.prepare(
      "INSERT INTO feedback (id, user_id, outfit_id, action, item_ids) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), userId, row.id, `style_${payload.action}`, row.itemIds));
    await runtime.DB.batch(statements);
    return Response.json({ looks: await history(userId) });
  }

  await seedInspirations(userId);
  const body = payload.bodyModelId
    ? await runtime.DB.prepare("SELECT id, measurements FROM body_models WHERE id = ? AND user_id = ?")
        .bind(payload.bodyModelId, userId).first<{ id: string; measurements: string }>()
    : await runtime.DB.prepare("SELECT id, measurements FROM body_models WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
        .bind(userId).first<{ id: string; measurements: string }>();
  if (!body) return Response.json({ error: "请先生成你的 3D 人体" }, { status: 400 });
  const measurements = safeJsonObject<BodyMeasurements>(body.measurements, {
    gender: "中性", height: 170, weight: 60, chest: 88, waist: 72, hips: 92, shoulder: 42, inseam: 78,
    bodyShape: "自然匀称", skinTone: "自然暖调", hairStyle: "短发", hairColor: "深棕", shoulderSlope: "自然", posture: "自然站立",
  });
  const profile = await runtime.DB.prepare(
    "SELECT explicit_styles AS explicitStyles, blocked_colors AS blockedColors FROM preference_profiles WHERE user_id = ?",
  ).bind(userId).first<{ explicitStyles: string; blockedColors: string }>();
  const explicitStyles = safeArray(profile?.explicitStyles ?? "[]");
  const blockedColors = safeArray(profile?.blockedColors ?? "[]");
  const { results: inspirations } = await runtime.DB.prepare(
    `SELECT id, title, creator, occasion, style_tags AS styleTags, item_categories AS itemCategories,
    palette, note, saved, used_count AS usedCount FROM inspirations WHERE user_id = ?`,
  ).bind(userId).all<InspirationRow>();
  const garments = (await loadAllGarments(userId)).filter(isRecommendationEligible);
  const scored = inspirations.map((item) => {
    const styleTags = safeArray(item.styleTags);
    const styleMatch = styleTags.filter((tag) => explicitStyles.includes(tag)).length;
    const occasionMatch = !payload.occasion || payload.occasion === "全部" || item.occasion === payload.occasion;
    const pinned = payload.inspirationId === item.id;
    return { item, rank: (pinned ? 100 : 0) + (occasionMatch ? 24 : 0) + styleMatch * 11 + item.saved * 8 + Math.min(12, item.usedCount * 2) };
  }).sort((a, b) => b.rank - a.rank).slice(0, 3);
  const baseLooks = scored.map(({ item, rank }, index) => {
    const chosen = chooseItems(garments, item, explicitStyles, blockedColors);
    const categories = chosen.map((garment) => garment.category);
    const styleTags = safeArray(item.styleTags);
    const palette = safeArray(item.palette);
    return {
      inspirationId: item.id,
      inspirationTitle: item.title,
      creator: item.creator,
      occasion: item.occasion,
      styleTags,
      itemIds: chosen.map((garment) => garment.id),
      score: Math.max(68, Math.min(97, 76 + chosen.length * 3 + Math.min(8, rank / 10) - index * 2)),
      formula: `${categories.join("＋")} · ${styleTags.slice(0, 3).join(" / ")}`,
      bodyNote: bodyAdvice(measurements),
      colorNote: `参考色谱 ${palette.slice(0, 3).join(" · ")}，用衣柜中最接近的低冲突颜色完成映射。`,
      createdAt: new Date().toISOString(),
    };
  }).filter((look) => look.itemIds.length > 0);
  if (!baseLooks.length) return Response.json({ error: "衣柜中暂无可用于 3D 搭配的可穿单品" }, { status: 400 });
  const looks = await applyStyleAdapter({ body: measurements, profile: { explicitStyles, blockedColors }, looks: baseLooks, garments }, baseLooks);
  const ids = looks.map(() => crypto.randomUUID());
  await runtime.DB.batch(looks.map((look, index) => runtime.DB.prepare(
    `INSERT INTO style_twin_sessions
    (id, user_id, inspiration_id, body_model_id, inspiration_title, creator, occasion,
    style_tags, item_ids, score, formula, body_note, color_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(ids[index], userId, look.inspirationId, body.id, look.inspirationTitle, look.creator, look.occasion,
    JSON.stringify(look.styleTags), JSON.stringify(look.itemIds), Math.round(look.score), look.formula, look.bodyNote, look.colorNote)));
  const newest = await history(userId);
  return Response.json({ looks: ids.map((id) => newest.find((look) => look.id === id)).filter(Boolean) }, { status: 201 });
}
