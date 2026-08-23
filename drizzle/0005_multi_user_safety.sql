CREATE TABLE IF NOT EXISTS `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT 'Muse 用户' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`ai_processing_consent` integer DEFAULT false NOT NULL,
	`privacy_version` text DEFAULT '2026-08-23' NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_daily` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`upload_count` integer DEFAULT 0 NOT NULL,
	`upload_bytes` integer DEFAULT 0 NOT NULL,
	`model_calls` integer DEFAULT 0 NOT NULL,
	`estimated_cost_micros` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`capability` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`estimated_cost_micros` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_app_users_status` ON `app_users` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_usage_events_user_created` ON `usage_events` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_intake_items_user_job_status` ON `intake_items` (`user_id`,`job_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
