import type { Garment, GarmentCategory } from "./wardrobe";

export type WeatherDay = {
  date: string;
  temperatureMin: number;
  temperatureMax: number;
  weatherCode: number;
  label: string;
  location: string;
};

export type OutfitPlan = {
  id: string;
  planDate: string;
  outfitId: string | null;
  name: string;
  itemIds: string[];
  occasion: string;
  weatherLabel: string;
  temperature: number;
  weatherCode: number;
  location: string;
  source: "manual" | "weekly_ai" | "natural_language";
  status: "planned" | "worn";
  wornAt: string | null;
};

export type BatchDraft = {
  name: string;
  category: GarmentCategory;
  color: string;
  pattern: string;
  material: string;
  season: string;
  styleTags: string[];
  occasionTags: string[];
  confidence: number;
  sourceType: Garment["sourceType"];
};

export type IntakeQueueItem = {
  id: string;
  jobId: string;
  fileName: string;
  status: "processing" | "pending" | "failed" | "completed";
  draft: BatchDraft;
  originalUrl: string | null;
  cutoutUrl: string | null;
  productImageUrl: string | null;
  selectedCover: "original" | "cutout" | "product";
  errorMessage: string | null;
  garmentId: string | null;
};

export type IntakeJob = {
  id: string;
  name: string;
  status: "processing" | "review" | "completed" | "partial";
  totalItems: number;
  completedItems: number;
  createdAt: string;
  items: IntakeQueueItem[];
};

export type TryOnHistorySession = {
  id: string;
  mode: string;
  itemIds: string[];
  resultUrl: string | null;
  status: "processing" | "ready" | "failed";
  progress: number;
  favorite: boolean;
  previousSessionId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type AnalyticsSlice = { label: string; value: number; color?: string };

export type WardrobeAnalytics = {
  totalItems: number;
  totalWears: number;
  utilization: number;
  availableCount: number;
  unavailableCount: number;
  mostWorn: Garment[];
  leastWorn: Garment[];
  inactive: { days30: Garment[]; days60: Garment[]; days90: Garment[] };
  colors: AnalyticsSlice[];
  categories: AnalyticsSlice[];
  seasons: AnalyticsSlice[];
  outfitParticipation: Array<{ garment: Garment; count: number }>;
  isolatedItems: Garment[];
  missingBasics: Array<{ title: string; reason: string; category: GarmentCategory }>;
};

export type StyleInterpretation = {
  original: string;
  occasion: string;
  temperature: number;
  location: string;
  dateLabel: string;
  formality: string;
  moodTags: string[];
  preferredColors: string[];
  avoidedColors: string[];
  weatherLabel: string;
  summary: string;
};
