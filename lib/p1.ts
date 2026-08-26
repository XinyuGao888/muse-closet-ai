import type { Garment, GarmentCategory, Outfit } from "./wardrobe";

export type CanvasPlacement = {
  garmentId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
};

export type SavedOutfitCard = {
  id: string;
  name: string;
  itemIds: string[];
  layout: CanvasPlacement[];
  previewUrl: string | null;
  occasion: string;
  createdAt: string;
};

export type GarmentRelation = {
  garment: Garment;
  outfits: Array<{ id: string; name: string; occasion: string; itemIds: string[]; createdAt: string }>;
  companions: Array<{ garment: Garment; count: number; score: number }>;
  lastWornAt: string | null;
  occasions: Array<{ label: string; count: number }>;
  suggestedLooks: Outfit[];
};

export type ShoppingCandidate = {
  name: string;
  category: GarmentCategory;
  color: string;
  styleTags: string[];
  brand: string;
  price: number | null;
};

export type ShoppingAssessment = {
  id: string;
  candidate: ShoppingCandidate;
  decision: "买" | "不买" | "降价再买";
  score: number;
  duplicateItems: Garment[];
  alternatives: Garment[];
  outfitPotential: number;
  preferenceFit: number;
  bodyFit: number;
  recommendedSize: string;
  sizeReason: string;
  reasons: string[];
  imageUrl: string | null;
  createdAt: string;
};

export type ReminderPreferences = {
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  eveningEnabled: boolean;
  eveningTime: string;
  weatherAlerts: boolean;
  morningRerank: boolean;
  notificationPermission: NotificationPermission;
};

export type DiaryEntry = {
  id: string;
  planId: string | null;
  outfitId: string | null;
  tryonSessionId: string | null;
  itemIds: string[];
  photoUrl: string | null;
  caption: string;
  fitFeedback: "偏松" | "合身" | "偏紧";
  comfortRating: number;
  compliments: number;
  differenceNotes: string;
  aiNotes: string;
  planName: string | null;
  planDate: string | null;
  createdAt: string;
};

export type DiaryInsights = {
  totalEntries: number;
  fitSignals: Array<{ label: string; count: number }>;
  averageComfort: number;
  totalCompliments: number;
  topComplimentLook: string | null;
  plannedNeverWorn: number;
  comparedTryOns: number;
  learningSummary: string[];
};
