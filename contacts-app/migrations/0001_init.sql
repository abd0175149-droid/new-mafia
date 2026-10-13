-- البيانات الكبيرة (الشيت، الجهات، vCard، الملف الأصلي) في KV تحت uploads/<id>/
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  saved_at INTEGER,
  save_count INTEGER NOT NULL DEFAULT 0,
  ip TEXT, user_agent TEXT, device_json TEXT, geo_json TEXT,
  file_name TEXT, file_size INTEGER, file_mime TEXT, file_key TEXT,
  analysis_json TEXT, sheet_name TEXT,
  prefix TEXT, options_json TEXT, vcf_name TEXT,
  count_total INTEGER DEFAULT 0, count_ready INTEGER DEFAULT 0, count_warn INTEGER DEFAULT 0, count_excluded INTEGER DEFAULT 0,
  search_text TEXT
);
CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts(ip, at);
