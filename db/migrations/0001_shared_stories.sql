CREATE TABLE IF NOT EXISTS shared_stories (
  token_hash TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  document_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_stories_expires_at
ON shared_stories (expires_at);

CREATE TABLE IF NOT EXISTS share_publish_windows (
  client_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  publish_count INTEGER NOT NULL,
  PRIMARY KEY (client_hash, window_start)
);
