export const CREATE_SHARED_STORIES_TABLE = `
CREATE TABLE IF NOT EXISTS shared_stories (
  token_hash TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`;

export const CREATE_SHARED_STORIES_EXPIRY_INDEX = `
CREATE INDEX IF NOT EXISTS idx_shared_stories_expires_at
ON shared_stories (expires_at)`;

export const CREATE_SHARE_WINDOWS_TABLE = `
CREATE TABLE IF NOT EXISTS share_publish_windows (
  client_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  publish_count INTEGER NOT NULL,
  PRIMARY KEY (client_hash, window_start)
)`;

export const SCHEMA_STATEMENTS = [
  CREATE_SHARED_STORIES_TABLE,
  CREATE_SHARED_STORIES_EXPIRY_INDEX,
  CREATE_SHARE_WINDOWS_TABLE,
] as const;
