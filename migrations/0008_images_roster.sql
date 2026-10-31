-- 4.14: small pictures on hexagons (teacher uploads, resized in the browser) and
-- versions planned before students open a posting. Additive only.
CREATE TABLE IF NOT EXISTS images (
 id TEXT PRIMARY KEY,
 owner_uid TEXT NOT NULL REFERENCES users(uid),
 mime TEXT NOT NULL,
 data TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_owner ON images(owner_uid);
