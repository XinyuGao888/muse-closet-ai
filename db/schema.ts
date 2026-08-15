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
