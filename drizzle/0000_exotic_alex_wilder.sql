CREATE TABLE `leaderboard_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`player_name` text NOT NULL,
	`fans` integer NOT NULL,
	`max_combo` integer NOT NULL,
	`score` integer NOT NULL,
	`concert` text NOT NULL,
	`song` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_scores_player_id_unique` ON `leaderboard_scores` (`player_id`);