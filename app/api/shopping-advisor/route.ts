import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import type { BodyMeasurements } from "@/lib/phase-two-three";
import type { ShoppingAssessment, ShoppingCandidate } from "@/lib/p1";
import { duplicateScore, estimateSize, loadAllGarments, potentialWithWardrobe, safeJsonObject } from "@/lib/server-p1";
import { safeJsonArray } from "@/lib/server-p0";
import type { GarmentCategory } from "@/lib/wardrobe";

export const dynamic = "force-dynamic";

type Row = { id: string; candidateJson: string; decision: ShoppingAssessment["decision"]; score: number; analysisJson: string; imageKey: string | null; createdAt: string };

function toAssessment(row: Row): ShoppingAssessment {
  const candidate = safeJsonObject<ShoppingCandidate>(row.candidateJson, { name: "候选单品", category: "上装", color: "待确认", styleTags: [], brand: "", price: null });
  const analysis = safeJsonObject<Omit<ShoppingAssessment, "id" | "candidate" | "decision" | "score" | "imageUrl" | "createdAt">>(row.analysisJson, {
    duplicateItems: [], alternatives: [], outfitPotential: 0, preferenceFit: 0, bodyFit: 0,
    recommendedSize: "待确认", sizeReason: "", reasons: [], tryOnNote: "",
  });
  return { id: row.id, candidate, decision: row.decision, score: row.score, ...analysis, imageUrl: row.imageKey ? `/api/shopping-advisor?asset=${encodeURIComponent(row.id)}` : null, createdAt: row.createdAt };
}

async function listAssessments(userId: string) {
  const { results } = await runtime.DB.prepare(
    `SELECT id, candidate_json AS candidateJson, decision, score, analysis_json AS analysisJson,
     image_key AS imageKey, created_at AS createdAt FROM shopping_assessments
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 18`,
  ).bind(userId).all<Row>();
  return results.map(toAssessment);
}

function safeCategory(value: unknown): GarmentCategory {
  const category = String(value ?? "上装") as GarmentCategory;
  return ["上装", "下装", "连衣裙", "外套", "鞋履", "配饰"].includes(category) ? category : "上装";
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const asset = new URL(request.url).searchParams.get("asset");
  if (asset) {
    const row = await runtime.DB.prepare("SELECT image_key AS imageKey FROM shopping_assessments WHERE id = ? AND user_id = ?")
      .bind(asset, userId).first<{ imageKey: string | null }>();
    if (!row?.imageKey) return new Response("Not found", { status: 404 });
    const object = await runtime.WARDROBE_IMAGES.get(row.imageKey);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
  }
  return Response.json({ assessments: await listAssessments(userId) });
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || !image.size) return Response.json({ error: "请上传商场实拍或商品截图" }, { status: 400 });
  let model: Partial<ShoppingCandidate> = {};
  if (runtime.FASHION_SIGLIP_URL) {
    try {
      const upstream = new FormData();
      upstream.set("image", image, image.name);
      const response = await fetch(runtime.FASHION_SIGLIP_URL, {
        method: "POST",
        headers: runtime.FASHION_SIGLIP_TOKEN ? { authorization: `Bearer ${runtime.FASHION_SIGLIP_TOKEN}` } : undefined,
        body: upstream,
      });
      if (response.ok) model = await response.json() as Partial<ShoppingCandidate>;
    } catch { /* use user-confirmed fields and stable local scoring */ }
  }
  const candidate: ShoppingCandidate = {
    name: String(form.get("name") || model.name || "待购买候选单品").slice(0, 80),
    category: safeCategory(form.get("category") || model.category),
    color: String(form.get("color") || model.color || "待确认").slice(0, 30),
    styleTags: safeJsonArray(String(form.get("styleTags") || JSON.stringify(model.styleTags ?? ["日常"]))).slice(0, 10),
    brand: String(form.get("brand") || model.brand || "").slice(0, 60),
    price: Number.isFinite(Number(form.get("price"))) && String(form.get("price") || "").trim() ? Math.max(0, Number(form.get("price"))) : null,
  };
  const [garments, profile, body] = await Promise.all([
    loadAllGarments(userId),
    runtime.DB.prepare(
      "SELECT explicit_styles AS explicitStyles, blocked_colors AS blockedColors, fit_preference AS fitPreference FROM preference_profiles WHERE user_id = ?",
    ).bind(userId).first<{ explicitStyles: string; blockedColors: string; fitPreference: string }>(),
    runtime.DB.prepare("SELECT measurements FROM body_models WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(userId).first<{ measurements: string }>(),
  ]);
  const scoredDuplicates = garments.map((garment) => ({ garment, score: duplicateScore(candidate, garment) })).filter((item) => item.score >= 4).sort((a, b) => b.score - a.score);
  const duplicateItems = scoredDuplicates.filter((item) => item.score >= 8).slice(0, 4).map((item) => item.garment);
  const alternatives = scoredDuplicates.slice(0, 4).map((item) => item.garment);
  const outfitPotential = potentialWithWardrobe(candidate, garments);
  const explicitStyles = safeJsonArray(profile?.explicitStyles);
  const blockedColors = safeJsonArray(profile?.blockedColors);
  const matchedStyles = candidate.styleTags.filter((tag) => explicitStyles.includes(tag)).length;
  const similarAffinity = garments.filter((item) => item.styleTags.some((tag) => candidate.styleTags.includes(tag))).reduce((sum, item) => sum + Math.max(0, item.affinity), 0);
  const isBlocked = blockedColors.some((color) => candidate.color.includes(color) || color.includes(candidate.color));
  const preferenceFit = Math.max(22, Math.min(96, Math.round(62 + matchedStyles * 9 + Math.min(16, similarAffinity) - (isBlocked ? 38 : 0))));
  const measurements = body ? safeJsonObject<BodyMeasurements | null>(body.measurements, null) : null;
  const size = estimateSize(measurements);
  const duplicatePenalty = duplicateItems.length * 12;
  const score = Math.max(18, Math.min(96, Math.round(42 + outfitPotential * 1.8 + preferenceFit * 0.28 + size.fit * 0.12 - duplicatePenalty)));
  const decision: ShoppingAssessment["decision"] = duplicateItems.length >= 3 || score < 50 ? "不买" : score >= 78 && outfitPotential >= 7 ? "买" : "降价再买";
  const reasons = [
    duplicateItems.length ? `衣柜中有 ${duplicateItems.length} 件高度接近的${candidate.category}，重复购买风险${duplicateItems.length >= 3 ? "高" : "中等"}。` : `现有衣柜没有明显重复的${candidate.category}。`,
    `预计能与现有衣物形成约 ${outfitPotential} 套有效组合。`,
    `与近期偏好匹配度 ${preferenceFit}%，${isBlocked ? "但颜色命中你的屏蔽偏好。" : "风格方向与历史反馈基本一致。"}`,
    decision === "降价再买" ? "价值明确但不是当前衣柜的刚需，建议加入降价观察。" : decision === "买" ? "组合增量和偏好匹配都足够高，购买后大概率能被频繁使用。" : "新增价值不足，优先使用衣柜内替代品。",
  ];
  const id = crypto.randomUUID();
  const imageKey = `${userId}/shopping/${id}`;
  await runtime.WARDROBE_IMAGES.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type || "image/jpeg" } });
  const analysis: Omit<ShoppingAssessment, "id" | "candidate" | "decision" | "score" | "imageUrl" | "createdAt"> = {
    duplicateItems, alternatives, outfitPotential, preferenceFit, bodyFit: size.fit,
    recommendedSize: size.size, sizeReason: size.reason, reasons,
    tryOnNote: "可在下方上传全身照生成购买前二维试穿；结果用于廓形与配色判断，不替代品牌尺码表。",
  };
  await runtime.DB.prepare(
    `INSERT INTO shopping_assessments (id, user_id, candidate_json, decision, score, analysis_json, image_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, JSON.stringify(candidate), decision, score, JSON.stringify(analysis), imageKey).run();
  const assessment: ShoppingAssessment = { id, candidate, decision, score, ...analysis, imageUrl: `/api/shopping-advisor?asset=${encodeURIComponent(id)}`, createdAt: new Date().toISOString() };
  return Response.json({ assessment, assessments: await listAssessments(userId) }, { status: 201 });
}
