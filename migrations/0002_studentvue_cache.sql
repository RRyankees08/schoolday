CREATE TABLE studentvue_cache (
  owner_key TEXT PRIMARY KEY DEFAULT 'default',
  captured_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
