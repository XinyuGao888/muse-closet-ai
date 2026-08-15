import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const garments = sqliteTable("garments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  color: text("color").notNull(),
  pattern: text("pattern").notNull().default("纯色"),
  material: text("material").notNull().default("待确认"),
  season: text("season").notNull().default("四季"),
  styleTags: text("style_tags").notNull().default("[]"),
  occasionTags: text("occasion_tags").notNull().default("[]"),
  imageKey: text("image_key"),
  imageType: text("image_type"),
  sourceType: text("source_type").notNull().default("ai_guess"),
  confidence: real("confidence").notNull().default(0.72),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  wearCount: integer("wear_count").notNull().default(0),
  affinity: real("affinity").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const outfits = sqliteTable("outfits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  occasion: text("occasion").notNull(),
  weather: text("weather").notNull(),
  itemIds: text("item_ids").notNull(),
  score: real("score").notNull().default(0),
  reason: text("reason").notNull().default(""),
  saved: integer("saved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  outfitId: text("outfit_id").notNull(),
  action: text("action").notNull(),
  itemIds: text("item_ids").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const garmentSources = sqliteTable("garment_sources", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  garmentId: text("garment_id").notNull(),
  sourceKind: text("source_kind").notNull(),
  brand: text("brand"),
  productCode: text("product_code"),
  productUrl: text("product_url"),
  rawText: text("raw_text"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const inspirations = sqliteTable("inspirations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  creator: text("creator").notNull(),
  occasion: text("occasion").notNull(),
  styleTags: text("style_tags").notNull().default("[]"),
  itemCategories: text("item_categories").notNull().default("[]"),
  palette: text("palette").notNull().default("[]"),
  note: text("note").notNull().default(""),
  saved: integer("saved", { mode: "boolean" }).notNull().default(false),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const preferenceProfiles = sqliteTable("preference_profiles", {
  userId: text("user_id").primaryKey(),
  explicitStyles: text("explicit_styles").notNull().default("[]"),
  blockedColors: text("blocked_colors").notNull().default("[]"),
  fitPreference: text("fit_preference").notNull().default("标准"),
  exploration: integer("exploration").notNull().default(35),
  totalSignals: integer("total_signals").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const bodyModels = sqliteTable("body_models", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  measurements: text("measurements").notNull().default("{}"),
  meshUrl: text("mesh_url"),
  renderUrl: text("render_url"),
  modelMode: text("model_mode").notNull().default("parametric"),
  status: text("status").notNull().default("ready"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tryonSessions = sqliteTable("tryon_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  bodyModelId: text("body_model_id"),
  mode: text("mode").notNull(),
  itemIds: text("item_ids").notNull().default("[]"),
  resultUrl: text("result_url"),
  status: text("status").notNull().default("ready"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
