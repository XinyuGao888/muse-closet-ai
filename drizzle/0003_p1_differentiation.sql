CREATE TABLE `outfit_cards` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `name` text NOT NULL, `item_ids` text DEFAULT '[]' NOT NULL, `layout_json` text DEFAULT '[]' NOT NULL, `preview_key` text, `occasion` text DEFAULT '自由搭配' NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `shopping_assessments` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `candidate_json` text DEFAULT '{}' NOT NULL, `decision` text NOT NULL, `score` integer DEFAULT 0 NOT NULL, `analysis_json` text DEFAULT '{}' NOT NULL, `image_key` text, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `reminder_preferences` (`user_id` text PRIMARY KEY NOT NULL, `location_label` text DEFAULT '当前位置' NOT NULL, `latitude` real, `longitude` real, `evening_enabled` integer DEFAULT true NOT NULL, `evening_time` text DEFAULT '21:00' NOT NULL, `weather_alerts` integer DEFAULT true NOT NULL, `morning_rerank` integer DEFAULT true NOT NULL, `notification_permission` text DEFAULT 'default' NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `outfit_diaries` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `plan_id` text, `outfit_id` text, `tryon_session_id` text, `item_ids` text DEFAULT '[]' NOT NULL, `photo_key` text, `caption` text DEFAULT '' NOT NULL, `fit_feedback` text DEFAULT '合身' NOT NULL, `comfort_rating` integer DEFAULT 4 NOT NULL, `compliments` integer DEFAULT 0 NOT NULL, `difference_notes` text DEFAULT '' NOT NULL, `ai_notes` text DEFAULT '' NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE INDEX `idx_outfit_cards_user_created` ON `outfit_cards` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_shopping_assessments_user_created` ON `shopping_assessments` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_outfit_diaries_user_created` ON `outfit_diaries` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_outfit_diaries_plan` ON `outfit_diaries` (`user_id`,`plan_id`);
--> statement-breakpoint
PRAGMA optimize;
