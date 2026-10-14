-- واتساب: نتيجة فحص كل رقم (مرة واحدة لكل رقم مهما تكرر في الملفات)،
-- وقوالب الرسائل، وسجل كل رسالة فُتحت للإرسال يدوياً عبر تطبيق واتساب.

CREATE TABLE IF NOT EXISTS wa_numbers (
  phone TEXT PRIMARY KEY,
  status TEXT NOT NULL,            -- yes | no
  method TEXT,                     -- manual | sent
  checked_at INTEGER NOT NULL,
  upload_id TEXT
);

CREATE TABLE IF NOT EXISTS wa_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id TEXT PRIMARY KEY,
  upload_id TEXT,
  phone TEXT NOT NULL,
  name TEXT,
  template_id TEXT,
  template_name TEXT,
  body TEXT,
  status TEXT NOT NULL,            -- sent | skipped | no_whatsapp
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_messages_upload ON wa_messages(upload_id, created_at);
CREATE INDEX IF NOT EXISTS wa_messages_created ON wa_messages(created_at DESC);
