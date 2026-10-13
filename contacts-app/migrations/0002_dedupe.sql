-- منع التكرار: الملف نفسه (نفس محتوى الخلايا) يُسجَّل مرة واحدة مهما رفعه من مستخدم،
-- وكل شخص (برقم هاتفه) يُسجَّل مرة واحدة في جدول جهات الاتصال الموحّد.

ALTER TABLE uploads ADD COLUMN content_hash TEXT;
ALTER TABLE uploads ADD COLUMN repeat_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE uploads ADD COLUMN last_repeat_at INTEGER;
ALTER TABLE uploads ADD COLUMN repeats_json TEXT;
CREATE INDEX IF NOT EXISTS uploads_hash ON uploads(content_hash);

-- كل من رفع الملف (الأول أو المكرر) يأخذ رمزاً خاصاً به لحفظ نتيجته وتنزيل vCard.
CREATE TABLE IF NOT EXISTS upload_tokens (
  token_hash TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  original INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS upload_tokens_upload ON upload_tokens(upload_id);

CREATE TABLE IF NOT EXISTS contacts (
  phone TEXT PRIMARY KEY,
  phone2 TEXT,
  name TEXT, full TEXT, email TEXT, org TEXT, title TEXT, region TEXT, prefix TEXT,
  first_upload_id TEXT, last_upload_id TEXT,
  first_seen INTEGER, last_seen INTEGER,
  seen_count INTEGER NOT NULL DEFAULT 1,
  search TEXT
);
CREATE INDEX IF NOT EXISTS contacts_phone2 ON contacts(phone2);
CREATE INDEX IF NOT EXISTS contacts_first_seen ON contacts(first_seen DESC);
