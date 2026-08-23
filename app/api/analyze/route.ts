import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { reserveModelCall, validateImageFile } from "@/lib/security";

const categoryKeywords = [
  ["连衣裙", ["dress", "裙", "连衣"]],
  ["外套", ["coat", "jacket", "外套", "风衣", "夹克"]],
  ["下装", ["pants", "jeans", "trouser", "裤", "牛仔"]],
  ["鞋履", ["shoe", "sneaker", "loafer", "鞋", "靴"]],
] as const;

function inferCategory(filename: string) {
  const normalized = filename.toLowerCase();
  const matched = categoryKeywords.find(([, words]) =>
    words.some((word) => normalized.includes(word)),
  );
  return matched?.[0] ?? "上装";
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) {
    return Response.json({ error: "请上传图片" }, { status: 400 });
  }
  const imageError = await validateImageFile(image);
  if (imageError) return Response.json({ error: imageError }, { status: 400 });

  if (runtime.FASHION_SIGLIP_URL) {
    const quota = await reserveModelCall(userId, "garment_analysis");
    if (!quota.ok) return quota.response;
    try {
      const upstream = new FormData();
      upstream.set("image", image, image.name);
      const response = await fetch(runtime.FASHION_SIGLIP_URL, {
        method: "POST",
        headers: runtime.FASHION_SIGLIP_TOKEN
          ? { authorization: `Bearer ${runtime.FASHION_SIGLIP_TOKEN}` }
          : undefined,
        body: upstream,
      });
      if (response.ok) {
        const analysis = (await response.json()) as Record<string, unknown>;
        return Response.json({
          ...analysis,
          sourceType: "fashion_siglip",
        });
      }
    } catch {
      // Keep the product usable when the optional model service is unavailable.
    }
  }

  const category = inferCategory(image.name);
  const noun =
    category === "连衣裙"
      ? "简约连衣裙"
      : category === "外套"
        ? "日常廓形外套"
        : category === "下装"
          ? "休闲直筒下装"
          : category === "鞋履"
            ? "百搭日常鞋履"
            : "基础款休闲上装";

  return Response.json({
    name: noun,
    category,
    pattern: "纯色",
    material: "待确认",
    season: category === "外套" ? "春秋" : "四季",
    styleTags: category === "连衣裙" ? ["简约", "优雅"] : ["简约", "休闲"],
    occasionTags: category === "连衣裙" ? ["约会", "聚会"] : ["日常", "周末"],
    confidence: 0.72,
    sourceType: "ai_guess",
    modelMode: "demo",
  });
}
