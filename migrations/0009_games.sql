-- 4.15 games: debate groups, defenses and votes. Game mode settings, timed rounds
-- and debate round state live in the posting body (posts.body -> asg.game / asg.debate).
CREATE TABLE IF NOT EXISTS debate_members (
 post_id TEXT NOT NULL REFERENCES posts(id),
 uid TEXT NOT NULL REFERENCES users(uid),
 grp INTEGER NOT NULL,
 PRIMARY KEY(post_id,uid)
);
CREATE TABLE IF NOT EXISTS debate_entries (
 post_id TEXT NOT NULL REFERENCES posts(id),
 round INTEGER NOT NULL,
 uid TEXT NOT NULL REFERENCES users(uid),
 grp INTEGER NOT NULL,
 pair TEXT NOT NULL,
 defense TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(post_id,round,uid)
);
CREATE TABLE IF NOT EXISTS debate_votes (
 post_id TEXT NOT NULL REFERENCES posts(id),
 round INTEGER NOT NULL,
 voter_uid TEXT NOT NULL REFERENCES users(uid),
 target_uid TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(post_id,round,voter_uid)
);
CREATE INDEX IF NOT EXISTS debate_entries_post ON debate_entries(post_id,round);
CREATE INDEX IF NOT EXISTS debate_votes_post ON debate_votes(post_id,round);
