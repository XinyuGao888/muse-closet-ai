import type { GarmentCategory } from "./wardrobe";

export type IntakeMode = "photo" | "label" | "barcode" | "link";

export type Inspiration = {
  id: string;
  title: string;
  creator: string;
  occasion: string;
  styleTags: string[];
  itemCategories: GarmentCategory[];
  palette: string[];
  note: string;
  saved: boolean;
  usedCount: number;
};

export type PreferenceProfile = {
  styleWeights: Array<{ label: string; score: number }>;
  colorWeights: Array<{ label: string; score: number }>;
  occasionWeights: Array<{ label: string; score: number }>;
  explicitStyles: string[];
  blockedColors: string[];
  fitPreference: string;
  exploration: number;
  totalSignals: number;
  feedbackCounts: Record<string, number>;
};

export type BodyMeasurements = {
  gender: string;
  height: number;
  weight: number;
  chest: number;
  waist: number;
  hips: number;
  shoulder: number;
  inseam: number;
  bodyShape: string;
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  shoulderSlope: string;
  posture: string;
};

export type BodyModel = {
  id: string;
  name: string;
  sourceType: "measurements" | "photos";
  measurements: BodyMeasurements;
  meshUrl: string | null;
  renderUrl: string | null;
  modelMode: "parametric" | "sam3d" | "mhr";
  status: string;
  frontPhotoUrl: string | null;
  sidePhotoUrl: string | null;
  profileConfidence: number;
  createdAt?: string;
};

export type StyleTwinLook = {
  id: string;
  inspirationId: string;
  inspirationTitle: string;
  creator: string;
  occasion: string;
  styleTags: string[];
  itemIds: string[];
  score: number;
  formula: string;
  bodyNote: string;
  colorNote: string;
  saved: boolean;
  feedback: "like" | "reject" | null;
  tryonSessionId: string | null;
  createdAt?: string;
};

export const defaultMeasurements: BodyMeasurements = {
  gender: "中性",
  height: 170,
  weight: 60,
  chest: 88,
  waist: 72,
  hips: 92,
  shoulder: 42,
  inseam: 78,
  bodyShape: "自然匀称",
  skinTone: "自然暖调",
  hairStyle: "短发",
  hairColor: "深棕",
  shoulderSlope: "自然",
  posture: "自然站立",
};

export const inspirationSeeds: Omit<Inspiration, "id" | "saved" | "usedCount">[] = [
  {
    title: "低饱和城市通勤",
    creator: "Mina Park",
    occasion: "通勤",
    styleTags: ["极简", "通勤", "松弛"],
    itemCategories: ["上装", "下装", "外套", "鞋履"],
    palette: ["#d8cfbd", "#31423d", "#172c47", "#282a29"],
    note: "用同一明度的中性色建立层次，鞋履负责收住轮廓。",
  },
  {
    title: "莓果色约会公式",
    creator: "Ari Chen",
    occasion: "约会",
    styleTags: ["轻熟", "浪漫", "优雅"],
    itemCategories: ["连衣裙", "外套", "鞋履", "配饰"],
    palette: ["#8e3c58", "#e4d5d9", "#2e2a28", "#b88c52"],
    note: "只保留一个高记忆色，其余单品用低对比材质托住它。",
  },
  {
    title: "周末复古丹宁",
    creator: "Leo Mori",
    occasion: "周末",
    styleTags: ["复古", "休闲", "街头"],
    itemCategories: ["上装", "下装", "鞋履", "配饰"],
    palette: ["#ebe2cf", "#35516c", "#845a3a", "#242726"],
    note: "直筒丹宁配轻量上装，用皮革或琥珀色小物增加年代感。",
  },
  {
    title: "重要会议的柔和权威感",
    creator: "Noa Studio",
    occasion: "会议",
    styleTags: ["经典", "极简", "优雅"],
    itemCategories: ["上装", "下装", "外套", "鞋履"],
    palette: ["#f0ece3", "#676b69", "#263e37", "#111514"],
    note: "硬朗外套配柔软内搭，既清晰又不过分有攻击性。",
  },
  {
    title: "雨天轻机能层次",
    creator: "Kai Xu",
    occasion: "日常",
    styleTags: ["中性", "机能", "简约"],
    itemCategories: ["上装", "下装", "外套", "鞋履"],
    palette: ["#c9d2cd", "#56645d", "#303836", "#171b1a"],
    note: "短外套与高腰下装切出利落比例，材质选择比颜色更重要。",
  },
  {
    title: "一件针织衫的三层穿法",
    creator: "Muse Edit",
    occasion: "通勤",
    styleTags: ["学院", "松弛", "层次"],
    itemCategories: ["上装", "下装", "外套", "配饰"],
    palette: ["#d9cbb6", "#6e5143", "#243b55", "#b68442"],
    note: "让领口、袖口和下摆分别露出少量层次，避免整体变厚重。",
  },
];
