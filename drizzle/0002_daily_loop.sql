ALTER TABLE `garments` ADD COLUMN `availability_status` text DEFAULT 'available' NOT NULL;
--> statement-breakpoint
ALTER TABLE `garments` ADD COLUMN `storage_location` text;
--> statement-breakpoint
ALTER TABLE `garments` ADD COLUMN `last_worn_at` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `result_key` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `progress` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `favorite` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `previous_session_id` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `error_message` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `updated_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `wear_events` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `garment_id` text NOT NULL, `outfit_id` text, `plan_id` text, `worn_date` text NOT NULL, `source` text DEFAULT 'manual' NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `outfit_plans` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `plan_date` text NOT NULL, `outfit_id` text, `name` text NOT NULL, `item_ids` text DEFAULT '[]' NOT NULL, `occasion` text DEFAULT '日常' NOT NULL, `weather_label` text DEFAULT '' NOT NULL, `temperature` real DEFAULT 18 NOT NULL, `weather_code` integer DEFAULT 0 NOT NULL, `location` text DEFAULT '伦敦' NOT NULL, `source` text DEFAULT 'manual' NOT NULL, `status` text DEFAULT 'planned' NOT NULL, `worn_at` text, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `intake_jobs` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `name` text NOT NULL, `status` text DEFAULT 'processing' NOT NULL, `total_items` integer DEFAULT 0 NOT NULL, `completed_items` integer DEFAULT 0 NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE TABLE `intake_items` (`id` text PRIMARY KEY NOT NULL, `user_id` text NOT NULL, `job_id` text NOT NULL, `file_name` text NOT NULL, `status` text DEFAULT 'processing' NOT NULL, `draft_json` text DEFAULT '{}' NOT NULL, `original_key` text, `cutout_key` text, `product_image_url` text, `selected_cover` text DEFAULT 'cutout' NOT NULL, `error_message` text, `garment_id` text, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wear_events_user_garment_date` ON `wear_events` (`user_id`,`garment_id`,`worn_date`);
--> statement-breakpoint
CREATE INDEX `idx_wear_events_user_date` ON `wear_events` (`user_id`,`worn_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outfit_plans_user_date` ON `outfit_plans` (`user_id`,`plan_date`);
--> statement-breakpoint
CREATE INDEX `idx_outfit_plans_user_month` ON `outfit_plans` (`user_id`,`plan_date`);
--> statement-breakpoint
CREATE INDEX `idx_intake_jobs_user_created` ON `intake_jobs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_intake_items_job_status` ON `intake_items` (`job_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
