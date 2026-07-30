DROP INDEX `leaderboard_scores_player_id_unique`;--> statement-breakpoint
DROP INDEX `leaderboard_scores_rank_idx`;--> statement-breakpoint
ALTER TABLE `leaderboard_scores` ADD `song_key` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `leaderboard_scores_player_song_unique` ON `leaderboard_scores` (`player_id`,`song_key`);--> statement-breakpoint
CREATE INDEX `leaderboard_scores_rank_idx` ON `leaderboard_scores` (`song_key`,`score`,`fans`,`max_combo`,`updated_at`);
