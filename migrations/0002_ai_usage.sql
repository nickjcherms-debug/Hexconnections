CREATE TABLE IF NOT EXISTS ai_daily_usage (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0),
  PRIMARY KEY(day, scope)
);
