-- Helmgast user database — initial schema
-- Apply with: npx wrangler d1 execute helmgast-users --file=workers/api/migrations/0001_initial.sql --remote

-- Canonical user record
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,   -- internal ID, generated on first login
  primary_email TEXT,               -- user-chosen contact email, nullable until explicitly set
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- External login identities — one row per linked account
CREATE TABLE IF NOT EXISTS user_identities (
  id            TEXT PRIMARY KEY,   -- internal row ID
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,      -- "auth0", "firebase", etc.
  provider_sub  TEXT NOT NULL,      -- external user ID, e.g. "google-oauth2|123456"
  connection    TEXT NOT NULL,      -- login method: "email", "google-oauth2", "github", etc.
  email         TEXT,               -- email reported by this identity
  display_name  TEXT,
  picture_url   TEXT,
  linked_at     TEXT NOT NULL,
  UNIQUE(provider, provider_sub)    -- same external account can't be linked twice
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

-- Which game worlds a user follows, and how they want notifications
CREATE TABLE IF NOT EXISTS user_game_follows (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_slug    TEXT NOT NULL,      -- e.g. "neotech", "eon", "kult"
  notification  TEXT NOT NULL DEFAULT 'none',  -- "none" | "web" | "email"
  followed_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, world_slug)
);

-- Migration tracking
CREATE TABLE IF NOT EXISTS migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('0001_initial', datetime('now'));
