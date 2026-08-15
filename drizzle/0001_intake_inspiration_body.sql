CREATE TABLE `garment_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `garment_id` text NOT NULL,
  `source_kind` text NOT NULL,
  `brand` text,
  `product_code` text,
  `product_url` text,
  `raw_text` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inspirations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `creator` text NOT NULL,
  `occasion` text NOT NULL,
  `style_tags` text DEFAULT '[]' NOT NULL,
  `item_categories` text DEFAULT '[]' NOT NULL,
  `palette` text DEFAULT '[]' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `saved` integer DEFAULT false NOT NULL,
  `used_count` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `preference_profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `explicit_styles` text DEFAULT '[]' NOT NULL,
  `blocked_colors` text DEFAULT '[]' NOT NULL,
  `fit_preference` text DEFAULT '标准' NOT NULL,
  `exploration` integer DEFAULT 35 NOT NULL,
  `total_signals` integer DEFAULT 0 NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_models` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `source_type` text NOT NULL,
  `measurements` text DEFAULT '{}' NOT NULL,
  `mesh_url` text,
  `render_url` text,
  `model_mode` text DEFAULT 'parametric' NOT NULL,
  `status` text DEFAULT 'ready' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tryon_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `body_model_id` text,
  `mode` text NOT NULL,
  `item_ids` text DEFAULT '[]' NOT NULL,
  `result_url` text,
  `status` text DEFAULT 'ready' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_garment_sources_user_garment` ON `garment_sources` (`user_id`,`garment_id`);
--> statement-breakpoint
CREATE INDEX `idx_garment_sources_user_code` ON `garment_sources` (`user_id`,`product_code`);
--> statement-breakpoint
CREATE INDEX `idx_inspirations_user_saved` ON `inspirations` (`user_id`,`saved`);
--> statement-breakpoint
CREATE INDEX `idx_body_models_user_created` ON `body_models` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_tryon_sessions_user_created` ON `tryon_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
