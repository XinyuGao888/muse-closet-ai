import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { reserveModelCall, validateImageFile } from "@/lib/security";
import type { GarmentCategory } from "@/lib/wardrobe";

const categoryTerms: Array<[GarmentCategory, string[]]> = [
  ["连衣裙", ["dress", "gown", "连衣裙", "裙装"]],
  ["外套", ["coat", "jacket", "blazer", "parka", "外套", "夹克", "西装"]],
  ["下装", ["pants", "trouser", "jeans", "skirt", "裤", "牛仔", "半裙"]],
  ["鞋履", ["shoe", "sneaker", "loafer", "boot", "鞋", "靴"]],
  ["配饰", ["scarf", "bag", "belt", "hat", "围巾", "包", "腰带", "帽"]],
];

function inferCategory(text: string): GarmentCategory {
  const normalized = text.toLowerCase();
  return categoryTerms.find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] ?? "上装";
}

function fallbackName(category: GarmentCategory) {
  return {
    上装: "标签识别基础上装",
    下装: "标签识别日常下装",
    连衣裙: "标签识别连衣裙",
    外套: "标签识别廓形外套",
    鞋履: "条码识别日常鞋履",
    配饰: "条码识别日常配饰",
  }[category];
}

function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function readMeta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i").exec(html)?.[1];
  const second = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i").exec(html)?.[1];
  return (first ?? second)?.replace(/&amp;/g, "&").trim();
}

async function callAdapter(url: string, token: string | undefined, body: FormData | string, contentType?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (contentType) headers["content-type"] = contentType;
  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) throw new Error("adapter unavailable");
  return (await response.json()) as Record<string, unknown>;
}

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as { mode?: string; url?: string };
    if (payload.mode !== "link" || !payload.url) {
      return Response.json({ error: "商品链接不能为空" }, { status: 400 });
    }
    const productUrl = safePublicUrl(payload.url);
    if (!productUrl) return Response.json({ error: "请使用公开的 HTTPS 商品链接" }, { status: 400 });

    if (runtime.PRODUCT_IMPORT_URL) {
      const modelQuota = await reserveModelCall(userId, "product_import");
      if (modelQuota.ok) try {
        const result = await callAdapter(
          runtime.PRODUCT_IMPORT_URL,
          runtime.PRODUCT_IMPORT_TOKEN,
          JSON.stringify({ url: productUrl.href }),
          "application/json",
        );
        return Response.json({ ...result, sourceType: "product_link", productUrl: productUrl.href });
      } catch {
        // Fall through to metadata extraction.
      }
    }

    let title = "商品链接导入单品";
    let imageUrl: string | null = null;
    let brand = productUrl.hostname.replace(/^www\./, "").split(".")[0].toUpperCase();
    try {
      const response = await fetch(productUrl, {
        headers: { "user-agent": "MuseCloset/1.0 product-metadata-import" },
        redirect: "follow",
        signal: AbortSignal.timeout(6500),
      });
      const length = Number(response.headers.get("content-length") ?? 0);
      if (response.ok && (!length || length < 2_000_000)) {
        const html = (await response.text()).slice(0, 800_000);
        title = readMeta(html, "og:title") ?? readMeta(html, "twitter:title") ?? title;
        imageUrl = readMeta(html, "og:image") ?? readMeta(html, "twitter:image") ?? null;
        brand = readMeta(html, "product:brand") ?? readMeta(html, "og:site_name") ?? brand;
      }
    } catch {
      // URL structure still provides a confirmable draft.
    }
    const category = inferCategory(`${title} ${productUrl.pathname}`);
    return Response.json({
      name: title.slice(0, 80),
      category,
      color: "待确认",
      pattern: "待确认",
      material: "待确认",
      season: "四季",
      styleTags: ["待确认"],
      occasionTags: ["日常"],
      confidence: title === "商品链接导入单品" ? 0.58 : 0.82,
      sourceType: "product_link",
      brand: brand.slice(0, 60),
      productCode: productUrl.pathname.split("/").filter(Boolean).at(-1)?.slice(0, 80) ?? "",
      productUrl: productUrl.href,
      remoteImageUrl: imageUrl && safePublicUrl(imageUrl) ? imageUrl : null,
      modelMode: "metadata",
    });
  }

  const form = await request.formData();
  const image = form.get("image");
  const mode = String(form.get("mode") || "label");
  const barcode = String(form.get("barcode") || "").trim();
  if (!(image instanceof File) && !barcode) {
    return Response.json({ error: "请上传吊牌照片或输入条码" }, { status: 400 });
  }
  if (image instanceof File) {
    const imageError = await validateImageFile(image);
    if (imageError) return Response.json({ error: imageError }, { status: 400 });
  }

  if (runtime.OCR_BARCODE_URL) {
    const modelQuota = await reserveModelCall(userId, "ocr_barcode");
    if (modelQuota.ok) try {
      const upstream = new FormData();
      upstream.set("mode", mode);
      if (image instanceof File) upstream.set("image", image, image.name);
      if (barcode) upstream.set("barcode", barcode);
      const result = await callAdapter(runtime.OCR_BARCODE_URL, runtime.OCR_BARCODE_TOKEN, upstream);
      return Response.json({ ...result, sourceType: mode === "barcode" ? "barcode" : "ocr" });
    } catch {
      // Keep manual confirmation available when the OCR service is absent.
    }
  }

  const sourceText = `${image instanceof File ? image.name : ""} ${barcode}`;
  const category = inferCategory(sourceText);
  const detectedBrand = /uniqlo/i.test(sourceText)
    ? "UNIQLO"
    : /zara/i.test(sourceText)
      ? "ZARA"
      : /nike/i.test(sourceText)
        ? "NIKE"
        : "待确认";
  return Response.json({
    name: fallbackName(category),
    category,
    color: "待确认",
    pattern: "待确认",
    material: "待确认",
    season: "四季",
    styleTags: ["基础款", "待确认"],
    occasionTags: ["日常"],
    confidence: barcode ? 0.76 : 0.64,
    sourceType: mode === "barcode" ? "barcode" : "ocr",
    brand: detectedBrand,
    productCode: barcode || `OCR-${Date.now().toString(36).toUpperCase()}`,
    rawText: barcode ? `BARCODE ${barcode}` : "标签文字等待人工确认",
    modelMode: "confirmable_fallback",
  });
}
