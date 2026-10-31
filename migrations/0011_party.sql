-- 4.18 Hex Party: a Jackbox-style class game. The teacher's screen hosts; students join with a
-- room code on their own devices. Round state lives in party_games.state (JSON) with a revision
-- number so student screens only download details when something changed.
CREATE TABLE IF NOT EXISTS party_games (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 owner_uid TEXT NOT NULL REFERENCES users(uid),
 post_id TEXT,
 title TEXT NOT NULL,
 terms TEXT NOT NULL,
 settings TEXT NOT NULL,
 state TEXT NOT NULL,
 rev INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'OPEN',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS party_games_owner ON party_games(owner_uid,created_at);
CREATE INDEX IF NOT EXISTS party_games_post ON party_games(post_id);
CREATE TABLE IF NOT EXISTS party_players (
 game_id TEXT NOT NULL REFERENCES party_games(id),
 uid TEXT NOT NULL REFERENCES users(uid),
 nick TEXT NOT NULL,
 points INTEGER NOT NULL DEFAULT 0,
 joined_at TEXT NOT NULL,
 PRIMARY KEY(game_id,uid)
);
CREATE INDEX IF NOT EXISTS party_players_uid ON party_players(uid);
CREATE TABLE IF NOT EXISTS party_answers (
 game_id TEXT NOT NULL REFERENCES party_games(id),
 round INTEGER NOT NULL,
 uid TEXT NOT NULL,
 body TEXT NOT NULL,
 pick TEXT,
 hidden INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 PRIMARY KEY(game_id,round,uid)
);
CREATE TABLE IF NOT EXISTS party_votes (
 game_id TEXT NOT NULL REFERENCES party_games(id),
 round INTEGER NOT NULL,
 duel INTEGER NOT NULL DEFAULT 0,
 voter_uid TEXT NOT NULL,
 choice TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(game_id,round,duel,voter_uid)
);
