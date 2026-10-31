-- 4.17: debate reads look up one group in the current round.
CREATE INDEX IF NOT EXISTS debate_entries_group ON debate_entries(post_id,round,grp);
