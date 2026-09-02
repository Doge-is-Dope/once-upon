CREATE TABLE `share_publish_windows` (
	`client_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`publish_count` integer NOT NULL,
	PRIMARY KEY(`client_hash`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `shared_stories` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`document_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_stories_request_hash_unique` ON `shared_stories` (`request_hash`);--> statement-breakpoint
CREATE INDEX `idx_shared_stories_expires_at` ON `shared_stories` (`expires_at`);