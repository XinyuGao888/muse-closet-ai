ALTER TABLE `body_models` ADD COLUMN `front_photo_key` text;
--> statement-breakpoint
ALTER TABLE `body_models` ADD COLUMN `side_photo_key` text;
--> statement-breakpoint
ALTER TABLE `body_models` ADD COLUMN `profile_confidence` real DEFAULT 0.8 NOT NULL;
--> statement-breakpoint
CREATE TABLE `style_twin_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `inspiration_id` text NOT NULL,
  `body_model_id` text NOT NULL,
  `inspiration_title` text NOT NULL,
  `creator` text NOT NULL,
  `occasion` text NOT NULL,
  `style_tags` text DEFAULT '[]' NOT NULL,
  `item_ids` text DEFAULT '[]' NOT NULL,
  `score` integer DEFAULT 0 NOT NULL,
  `formula` text DEFAULT '' NOT NULL,
  `body_note` text DEFAULT '' NOT NULL,
  `color_note` text DEFAULT '' NOT NULL,
  `saved` integer DEFAULT false NOT NULL,
  `feedback` text,
  `tryon_session_id` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_style_twin_user_created` ON `style_twin_sessions` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_style_twin_user_body` ON `style_twin_sessions` (`user_id`,`body_model_id`);
--> statement-breakpoint
PRAGMA optimize;
