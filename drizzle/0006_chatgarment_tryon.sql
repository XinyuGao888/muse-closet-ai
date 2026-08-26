ALTER TABLE `tryon_sessions` ADD COLUMN `render_key` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `external_job_id` text;
--> statement-breakpoint
ALTER TABLE `tryon_sessions` ADD COLUMN `external_status_url` text;
--> statement-breakpoint
PRAGMA optimize;
