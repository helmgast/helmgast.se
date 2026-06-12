-- Rebuild schema to match 0001_initial.sql
-- Safe to run on the existing DB — drops and recreates all app tables.

DROP TABLE IF EXISTS user_game_follows;
DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  primary_email TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE user_identities (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  provider_sub  TEXT NOT NULL,
  connection    TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT,
  picture_url   TEXT,
  linked_at     TEXT NOT NULL,
  UNIQUE(provider, provider_sub)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

CREATE TABLE user_game_follows (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_slug    TEXT NOT NULL,
  notification  TEXT NOT NULL DEFAULT 'none',
  followed_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, world_slug)
);

INSERT OR IGNORE INTO migrations (name, applied_at) VALUES ('0002_rebuild_schema', datetime('now'));
