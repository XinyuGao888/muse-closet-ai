export type GarmentCategory =
  | "上装"
  | "下装"
  | "连衣裙"
  | "外套"
  | "鞋履"
  | "配饰";

export type Garment = {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  pattern: string;
  material: string;
  season: string;
  styleTags: string[];
  occasionTags: string[];
  imageUrl: string | null;
  sourceType: "ai_guess" | "manual" | "fashion_siglip" | "ocr" | "barcode" | "product_link";
  confidence: number;
  favorite: boolean;
  wearCount: number;
  affinity: number;
  brand?: string | null;
  productCode?: string | null;
  productUrl?: string | null;
  createdAt?: string;
};

export type Outfit = {
  id: string;
  name: string;
  itemIds: string[];
  score: number;
  reason: string;
  occasion: string;
  weather: string;
  saved?: boolean;
};

export const categoryColors: Record<GarmentCategory, string> = {
  上装: "#d7e5df",
  下装: "#b7c4d3",
  连衣裙: "#ead8de",
  外套: "#d6ccbb",
  鞋履: "#c7b8ad",
  配饰: "#e9d6ae",
};

export const categoryGlyphs: Record<GarmentCategory, string> = {
  上装: "T",
  下装: "Ⅱ",
  连衣裙: "A",
  外套: "M",
  鞋履: "⌁",
  配饰: "○",
};

export const seedGarments: Omit<Garment, "imageUrl">[] = [
  {
    id: "seed-top-cream",
    name: "燕麦色宽松针织衫",
    category: "上装",
    color: "燕麦色",
    pattern: "纯色",
    material: "羊毛混纺",
    season: "秋冬",
    styleTags: ["松弛", "简约", "通勤"],
    occasionTags: ["日常", "通勤", "约会"],
    sourceType: "fashion_siglip",
    confidence: 0.92,
    favorite: true,
    wearCount: 8,
    affinity: 3.8,
  },
  {
    id: "seed-bottom-denim",
    name: "复古水洗直筒牛仔裤",
    category: "下装",
    color: "靛蓝",
    pattern: "纯色",
    material: "丹宁",
    season: "四季",
    styleTags: ["复古", "休闲", "街头"],
    occasionTags: ["日常", "约会", "周末"],
    sourceType: "fashion_siglip",
    confidence: 0.95,
    favorite: true,
    wearCount: 12,
    affinity: 4.6,
  },
  {
    id: "seed-coat-charcoal",
    name: "炭灰色廓形短风衣",
    category: "外套",
    color: "炭灰",
    pattern: "纯色",
    material: "棉质混纺",
    season: "春秋",
    styleTags: ["极简", "中性", "通勤"],
    occasionTags: ["通勤", "日常", "会议"],
    sourceType: "fashion_siglip",
    confidence: 0.89,
    favorite: false,
    wearCount: 5,
    affinity: 1.5,
  },
  {
    id: "seed-dress-berry",
    name: "莓果色收腰长裙",
    category: "连衣裙",
    color: "莓果红",
    pattern: "纯色",
    material: "醋酸纤维",
    season: "春夏",
    styleTags: ["优雅", "轻熟", "浪漫"],
    occasionTags: ["约会", "聚会", "正式"],
    sourceType: "fashion_siglip",
    confidence: 0.94,
    favorite: true,
    wearCount: 4,
    affinity: 2.8,
  },
  {
    id: "seed-shoe-loafer",
    name: "黑色方头乐福鞋",
    category: "鞋履",
    color: "黑色",
    pattern: "纯色",
    material: "皮革",
    season: "四季",
    styleTags: ["经典", "通勤", "学院"],
    occasionTags: ["日常", "通勤", "约会", "会议"],
    sourceType: "fashion_siglip",
    confidence: 0.97,
    favorite: false,
    wearCount: 16,
    affinity: 4.2,
  },
  {
    id: "seed-accessory-scarf",
    name: "琥珀格纹轻薄围巾",
    category: "配饰",
    color: "琥珀棕",
    pattern: "格纹",
    material: "羊毛",
    season: "秋冬",
    styleTags: ["复古", "温暖", "英伦"],
    occasionTags: ["日常", "通勤", "周末"],
    sourceType: "fashion_siglip",
    confidence: 0.88,
    favorite: false,
    wearCount: 3,
    affinity: 0.8,
  },
];

const occasionStyles: Record<string, string[]> = {
  通勤: ["通勤", "极简", "经典", "简约"],
  约会: ["浪漫", "轻熟", "优雅", "复古"],
  周末: ["休闲", "松弛", "街头", "复古"],
  会议: ["通勤", "经典", "极简", "优雅"],
};

function uniqueCombos(garments: Garment[], mustWearId?: string) {
  const shortlist = (category: GarmentCategory, limit = 4) => {
    const ranked = garments
      .filter((item) => item.category === category)
      .sort((a, b) => b.affinity + Number(b.favorite) - a.affinity - Number(a.favorite));
    const mustWear = ranked.find((item) => item.id === mustWearId);
    return [...ranked.slice(0, limit), ...(mustWear ? [mustWear] : [])].filter(
      (item, index, list) => list.findIndex((other) => other.id === item.id) === index,
    );
  };
  const tops = shortlist("上装");
  const bottoms = shortlist("下装");
  const dresses = shortlist("连衣裙");
  const coats = shortlist("外套", 3);
  const shoes = shortlist("鞋履", 3);
  const accessories = shortlist("配饰", 2);
  const combos: string[][] = [];
  const optionalCoats: Array<Garment | undefined> = coats.length ? [undefined, ...coats] : [undefined];
  const optionalShoes: Array<Garment | undefined> = shoes.length ? shoes : [undefined];
  const optionalAccessories: Array<Garment | undefined> = accessories.length
    ? [undefined, ...accessories]
    : [undefined];

  for (const dress of dresses) {
    for (const coat of optionalCoats) {
      for (const shoe of optionalShoes) {
        for (const accessory of optionalAccessories) {
          combos.push(
            [dress, coat, shoe, accessory]
              .filter((item): item is Garment => Boolean(item))
              .map((item) => item.id),
          );
        }
      }
    }
  }
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const coat of optionalCoats) {
        for (const shoe of optionalShoes) {
          for (const accessory of optionalAccessories) {
            combos.push(
              [top, bottom, coat, shoe, accessory]
                .filter((item): item is Garment => Boolean(item))
                .map((item) => item.id),
            );
          }
        }
      }
    }
  }

  const fallback = garments.slice(0, Math.min(3, garments.length)).map((g) => g.id);
  if (fallback.length) combos.push(fallback);

  return combos
    .filter((combo, index, list) => {
      const key = [...combo].sort().join("|");
      return list.findIndex((other) => [...other].sort().join("|") === key) === index;
    })
    .filter((combo) => !mustWearId || combo.includes(mustWearId));
}

export function rankOutfits(
  garments: Garment[],
  occasion: string,
  temperature: number,
  mustWearId?: string,
): Outfit[] {
  const desiredStyles = occasionStyles[occasion] ?? occasionStyles.周末;
  const combos = uniqueCombos(garments, mustWearId);

  return combos
    .map((itemIds, index) => {
      const items = itemIds
        .map((id) => garments.find((garment) => garment.id === id))
        .filter((item): item is Garment => Boolean(item));
      const styleMatches = items.reduce(
        (sum, item) =>
          sum + item.styleTags.filter((tag) => desiredStyles.includes(tag)).length,
        0,
      );
      const occasionMatches = items.filter((item) =>
        item.occasionTags.includes(occasion),
      ).length;
      const preference = items.reduce(
        (sum, item) => sum + item.affinity + (item.favorite ? 1.2 : 0),
        0,
      );
      const warmEnough =
        temperature < 16
          ? items.some((item) => item.category === "外套" || item.season === "秋冬")
          : items.every((item) => item.season !== "秋冬") || temperature < 22;
      const score =
        62 +
        styleMatches * 4.2 +
        occasionMatches * 3.3 +
        Math.min(preference, 12) +
        (warmEnough ? 5 : -4) -
        index * 0.7;
      const anchor = mustWearId
        ? garments.find((item) => item.id === mustWearId)?.name
        : items[0]?.name;
      return {
        id: `rec-${Date.now()}-${index}`,
        name:
          index === 0
            ? `${occasion}首选`
            : index === 1
              ? "轻松替换方案"
              : "风格探索方案",
        itemIds,
        score: Math.max(56, Math.min(98, Math.round(score))),
        occasion,
        weather: `${temperature}°C`,
        reason: `${anchor ? `围绕「${anchor}」` : "结合你的衣橱"}，兼顾${occasion}场景、${temperature}°C体感和近期偏好。`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
