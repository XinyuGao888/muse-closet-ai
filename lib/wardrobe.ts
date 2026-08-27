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
  availabilityStatus?: GarmentAvailabilityStatus;
  storageLocation?: string | null;
  lastWornAt?: string | null;
  brand?: string | null;
  productCode?: string | null;
  productUrl?: string | null;
  createdAt?: string;
};

export type GarmentAvailabilityStatus =
  | "available"
  | "worn"
  | "washing"
  | "drying"
  | "stored"
  | "lent"
  | "repair";

export const availabilityLabels: Record<GarmentAvailabilityStatus, string> = {
  available: "可穿",
  worn: "已穿待洗",
  washing: "清洗中",
  drying: "晾晒中",
  stored: "收纳中",
  lent: "借出",
  repair: "维修中",
};

export function isRecommendationEligible(item: Pick<Garment, "availabilityStatus">) {
  return !item.availabilityStatus || item.availabilityStatus === "available" || item.availabilityStatus === "stored";
}

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
    name: "炭灰色腰带长风衣",
    category: "外套",
    color: "炭灰",
    pattern: "纯色",
    material: "棉质混纺",
    season: "春秋",
    styleTags: ["极简", "经典", "通勤"],
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
  日常: ["简约", "休闲", "松弛", "经典"],
};

const adjacentOccasions: Record<string, string[]> = {
  通勤: ["日常"],
  会议: ["通勤", "正式"],
  约会: ["日常", "聚会"],
  周末: ["日常", "约会"],
  日常: ["周末", "通勤"],
};

const styleFamilies: Record<string, string[]> = {
  利落: ["通勤", "极简", "经典", "简约", "学院", "中性"],
  松弛: ["休闲", "松弛", "街头", "复古", "简约", "中性"],
  柔和: ["浪漫", "轻熟", "优雅", "复古"],
  机能: ["机能", "运动", "户外", "街头", "中性"],
};

const neutralColorTokens = ["黑", "白", "灰", "米", "燕麦", "奶油", "卡其", "驼", "棕", "丹宁", "靛蓝", "藏蓝"];

type OutfitStructure = {
  baseType: "dress" | "separates";
  core: Garment[];
  dress?: Garment;
  top?: Garment;
  bottom?: Garment;
  coat?: Garment;
  shoe?: Garment;
  accessory?: Garment;
  formula: string;
};

type RankedCandidate = {
  itemIds: string[];
  score: number;
  reason: string;
  formula: string;
  baseSignature: string;
};

function occasionFit(item: Garment, occasion: string) {
  if (item.occasionTags.includes(occasion)) return 1;
  if ((adjacentOccasions[occasion] ?? []).some((tag) => item.occasionTags.includes(tag))) return 0.45;
  return 0;
}

function isNeutralColor(color: string) {
  return neutralColorTokens.some((token) => color.includes(token));
}

function itemStyleFamilies(item: Garment) {
  return Object.entries(styleFamilies)
    .filter(([, tags]) => item.styleTags.some((tag) => tags.includes(tag)))
    .map(([family]) => family);
}

function sharedStyleFamily(left: Garment, right: Garment) {
  const rightFamilies = new Set(itemStyleFamilies(right));
  return itemStyleFamilies(left).some((family) => rightFamilies.has(family));
}

function inspectStructure(items: Garment[]): OutfitStructure | null {
  const byCategory = (category: GarmentCategory) => items.filter((item) => item.category === category);
  const dresses = byCategory("连衣裙");
  const tops = byCategory("上装");
  const bottoms = byCategory("下装");
  const coats = byCategory("外套");
  const shoes = byCategory("鞋履");
  const accessories = byCategory("配饰");
  if (dresses.length > 1 || tops.length > 1 || bottoms.length > 1 || coats.length > 1 || shoes.length > 1 || accessories.length > 1) return null;
  if (dresses.length === 1 && tops.length === 0 && bottoms.length === 0) {
    return {
      baseType: "dress", core: dresses, dress: dresses[0], coat: coats[0], shoe: shoes[0], accessory: accessories[0],
      formula: coats[0] ? "连衣裙＋外套" : "一件式连衣裙",
    };
  }
  if (dresses.length === 0 && tops.length === 1 && bottoms.length === 1) {
    return {
      baseType: "separates", core: [tops[0], bottoms[0]], top: tops[0], bottom: bottoms[0], coat: coats[0], shoe: shoes[0], accessory: accessories[0],
      formula: coats[0] ? "上装＋下装＋外套" : "上装＋下装",
    };
  }
  return null;
}

function proportionAssessment(structure: OutfitStructure) {
  let score = 6;
  let note = "保持清晰的上下轮廓";
  if (structure.top && structure.bottom) {
    const relaxedTop = /宽松|廓形|oversize/i.test(structure.top.name);
    const controlledBottom = /直筒|修身|窄|铅笔|锥形/i.test(structure.bottom.name);
    const volumeBottom = /阔腿|蓬|伞|宽松/i.test(structure.bottom.name);
    if (relaxedTop && controlledBottom) {
      score += 4;
      note = "宽松上装由直线下装收住量感";
    } else if (relaxedTop && volumeBottom) {
      score -= 5;
      note = "上下同时宽松，容易失去重心";
    }
  }
  if (structure.dress && structure.coat) {
    const controlledDress = /收腰|修身|直筒|垂坠/i.test(structure.dress.name);
    const voluminousDress = /蓬|伞|蛋糕|大摆/i.test(structure.dress.name);
    const voluminousCoat = /廓形|宽松|茧型/i.test(structure.coat.name);
    if (controlledDress) {
      score += 3;
      note = "收束的裙身为外套保留了纵向线条";
    } else if (voluminousDress && voluminousCoat) {
      score -= 7;
      note = "裙装与外套都扩张，层次会显得臃肿";
    }
  }
  return { score: Math.max(0, Math.min(10, score)), note };
}

function styleAssessment(structure: OutfitStructure, desiredStyles: string[]) {
  let score = 6;
  const pairs: Array<[Garment, Garment]> = [];
  if (structure.top && structure.bottom) pairs.push([structure.top, structure.bottom]);
  if (structure.coat) structure.core.forEach((item) => pairs.push([item, structure.coat!]));
  if (structure.shoe) structure.core.forEach((item) => pairs.push([item, structure.shoe!]));
  for (const [left, right] of pairs) {
    if (sharedStyleFamily(left, right)) score += 1.5;
    else if (!isNeutralColor(left.color) && !isNeutralColor(right.color)) score -= 2;
  }
  score += structure.core.reduce(
    (sum, item) => sum + Math.min(1, item.styleTags.filter((tag) => desiredStyles.includes(tag)).length),
    0,
  );
  return Math.max(0, Math.min(12, score));
}

function colorAssessment(items: Garment[]) {
  const accentCount = items.filter((item) => !isNeutralColor(item.color)).length;
  const patternedCount = items.filter((item) => item.pattern && item.pattern !== "纯色" && item.pattern !== "无").length;
  const statementCount = accentCount + patternedCount;
  return {
    score: Math.max(1, Math.min(10, 10 - Math.max(0, accentCount - 1) * 2 - Math.max(0, patternedCount - 1) * 2 - Math.max(0, statementCount - 2))),
    note: accentCount === 1
      ? "用一个强调色，其余单品保持低冲突"
      : accentCount === 0 ? "用中性色和材质差异建立层次" : "控制多色之间的视觉竞争",
  };
}

function weatherAssessment(items: Garment[], structure: OutfitStructure, temperature: number) {
  const hasCoat = Boolean(structure.coat);
  const hasWarmCore = structure.core.some((item) => item.season === "秋冬" || /羊毛|针织|羽绒|呢/.test(item.material));
  if (temperature <= 10 && !hasCoat) return { valid: false, score: 0, note: "低温缺少外套层" };
  if (temperature >= 28 && hasCoat) return { valid: false, score: 0, note: "高温不应强加外套" };
  let score = 8;
  if (temperature < 17) score += hasCoat ? 4 : hasWarmCore ? 0 : -5;
  if (temperature >= 22) score += hasCoat ? -4 : 3;
  if (temperature < 12 && items.some((item) => item.season === "春夏")) score -= 3;
  return {
    valid: true,
    score: Math.max(0, Math.min(12, score)),
    note: temperature < 17
      ? hasCoat ? `${temperature}°C 用外套完成室内外切换` : `${temperature}°C 由保暖内层承担体感`
      : `${temperature}°C 控制叠穿层数`,
  };
}

function buildReason(structure: OutfitStructure, temperature: number, proportionNote: string, colorNote: string) {
  const pieces = structure.baseType === "dress"
    ? `${structure.dress!.name}作为唯一主视觉`
    : `${structure.top!.name}配${structure.bottom!.name}`;
  const layer = structure.coat ? `，${structure.coat.name}负责${temperature}°C的室内外切换` : "";
  const finish = structure.shoe ? `，${structure.shoe.name}收住整套风格` : "";
  return `${pieces}${layer}${finish}；${proportionNote}，${colorNote}。`;
}

function overlapRatio(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((id) => rightSet.has(id)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

function uniqueCombos(garments: Garment[], mustWearId?: string) {
  garments = garments.filter(isRecommendationEligible);
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

  const candidates = combos
    .map((itemIds): RankedCandidate | null => {
      const items = itemIds
        .map((id) => garments.find((garment) => garment.id === id))
        .filter((item): item is Garment => Boolean(item));
      const structure = inspectStructure(items);
      if (!structure) return null;

      const coreOccasionFits = structure.core.map((item) => occasionFit(item, occasion));
      const incompatibleCore = structure.core.find((item, index) => coreOccasionFits[index] === 0 && item.id !== mustWearId);
      if (incompatibleCore) return null;
      const supportItems = [structure.coat, structure.shoe, structure.accessory].filter((item): item is Garment => Boolean(item));
      const supportOccasionFits = supportItems.map((item) => occasionFit(item, occasion));
      const occasionScore =
        (coreOccasionFits.reduce((sum, fit) => sum + fit, 0) / structure.core.length) * 22 +
        (supportOccasionFits.length ? supportOccasionFits.reduce((sum, fit) => sum + fit, 0) / supportOccasionFits.length * 4 : 0);
      const weather = weatherAssessment(items, structure, temperature);
      if (!weather.valid) return null;
      const proportion = proportionAssessment(structure);
      if (proportion.score <= 1) return null;
      const color = colorAssessment(items);
      const styleScore = styleAssessment(structure, desiredStyles);
      const preferenceScore = Math.max(0, Math.min(10,
        items.reduce((sum, item) => sum + Math.max(-2, item.affinity) + Number(item.favorite), 0) / Math.max(1, items.length) * 1.7,
      ));
      const completenessScore = (structure.shoe ? 4 : 0) + (structure.accessory ? 1 : 0) + (structure.coat && temperature < 18 ? 1 : 0);
      const score = 18 + occasionScore + styleScore + proportion.score + color.score + weather.score + preferenceScore + completenessScore;
      if (score < 62) return null;
      return {
        itemIds,
        score: Math.max(58, Math.min(94, Math.round(score))),
        reason: buildReason(structure, temperature, proportion.note, color.note),
        formula: structure.formula,
        baseSignature: structure.core.map((item) => item.id).sort().join("|"),
      };
    })
    .filter((item): item is RankedCandidate => Boolean(item))
    .sort((a, b) => b.score - a.score);

  const selected: RankedCandidate[] = [];
  for (const candidate of candidates) {
    const repeatsBase = selected.some((item) => item.baseSignature === candidate.baseSignature);
    const tooSimilar = selected.some((item) => overlapRatio(item.itemIds, candidate.itemIds) > 0.72);
    if (!repeatsBase && !tooSimilar) selected.push(candidate);
    if (selected.length === 3) break;
  }

  const labels = [`${occasion}首选`, "轻松替换", "风格变化"];
  return selected.map((candidate, index) => ({
    id: `rec-${Date.now()}-${index}`,
    name: `${labels[index]} · ${candidate.formula}`,
    itemIds: candidate.itemIds,
    score: candidate.score,
    occasion,
    weather: `${temperature}°C`,
    reason: candidate.reason,
  }));
}
