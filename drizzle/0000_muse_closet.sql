CREATE TABLE `garments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text NOT NULL,
	`pattern` text DEFAULT '纯色' NOT NULL,
	`material` text DEFAULT '待确认' NOT NULL,
	`season` text DEFAULT '四季' NOT NULL,
	`style_tags` text DEFAULT '[]' NOT NULL,
	`occasion_tags` text DEFAULT '[]' NOT NULL,
	`image_key` text,
	`image_type` text,
	`source_type` text DEFAULT 'ai_guess' NOT NULL,
	`confidence` real DEFAULT 0.72 NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`wear_count` integer DEFAULT 0 NOT NULL,
	`affinity` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`occasion` text NOT NULL,
	`weather` text NOT NULL,
	`item_ids` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`saved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`outfit_id` text NOT NULL,
	`action` text NOT NULL,
	`item_ids` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_garments_user_category` ON `garments` (`user_id`,`category`);
--> statement-breakpoint
CREATE INDEX `idx_garments_user_favorite` ON `garments` (`user_id`,`favorite`);
--> statement-breakpoint
CREATE INDEX `idx_outfits_user_created` ON `outfits` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_feedback_user_action` ON `feedback` (`user_id`,`action`);
