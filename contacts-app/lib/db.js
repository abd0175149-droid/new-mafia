import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  saved_at INTEGER,
  save_count INTEGER NOT NULL DEFAULT 0,
  ip TEXT, user_agent TEXT, device_json TEXT,
  file_name TEXT, file_size INTEGER, file_mime TEXT, file_path TEXT,
  sheets_json TEXT, analysis_json TEXT, sheet_name TEXT,
  prefix TEXT, options_json TEXT, contacts_json TEXT, vcf TEXT, vcf_name TEXT,
  count_total INTEGER DEFAULT 0, count_ready INTEGER DEFAULT 0, count_warn INTEGER DEFAULT 0, count_excluded INTEGER DEFAULT 0,
  search_text TEXT
);
CREATE INDEX IF NOT EXISTS uploads_created ON uploads(created_at DESC);
`;

const LIST_COLS = `id, created_at, saved_at, save_count, ip, user_agent, device_json, file_name, file_size, sheet_name, prefix,
  count_total, count_ready, count_warn, count_excluded`;

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const insert = db.prepare(`INSERT INTO uploads (id, token_hash, created_at, ip, user_agent, device_json, file_name, file_size, file_mime,
    file_path, sheets_json, analysis_json, sheet_name, prefix, count_total, count_ready, count_warn, count_excluded, search_text)
    VALUES ($id, $token_hash, $created_at, $ip, $user_agent, $device_json, $file_name, $file_size, $file_mime,
    $file_path, $sheets_json, $analysis_json, $sheet_name, $prefix, $count_total, $count_ready, $count_warn, $count_excluded, $search_text)`);
  const save = db.prepare(`UPDATE uploads SET saved_at=$saved_at, save_count=$save_count, prefix=$prefix, options_json=$options_json,
    contacts_json=$contacts_json, vcf=$vcf, vcf_name=$vcf_name, count_total=$count_total, count_ready=$count_ready,
    count_warn=$count_warn, count_excluded=$count_excluded, search_text=$search_text WHERE id=$id`);
  const get = db.prepare('SELECT * FROM uploads WHERE id = ?');
  const list = db.prepare(`SELECT ${LIST_COLS} FROM uploads ORDER BY created_at DESC LIMIT 1000`);
  const search = db.prepare(`SELECT ${LIST_COLS} FROM uploads WHERE search_text LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\' OR id = ?
    ORDER BY created_at DESC LIMIT 1000`);
  const del = db.prepare('DELETE FROM uploads WHERE id = ?');
  const saved = db.prepare('SELECT id, created_at, file_name, prefix, contacts_json FROM uploads WHERE contacts_json IS NOT NULL ORDER BY created_at');
  const stats = db.prepare(`SELECT COUNT(*) AS uploads, COUNT(saved_at) AS saved, COALESCE(SUM(CASE WHEN saved_at IS NOT NULL THEN count_ready + count_warn END), 0) AS contacts,
    COALESCE(SUM(CASE WHEN created_at > ? THEN 1 END), 0) AS today FROM uploads`);

  return {
    insertUpload: (row) => insert.run(prefixKeys(row)),
    saveResult: (id, row) => save.run(prefixKeys({ ...row, id })),
    getUpload: (id) => get.get(String(id)),
    listUploads: (q) => {
      if (!q) return list.all();
      const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      return search.all(like, like, q);
    },
    deleteUpload: (id) => del.run(id),
    allSaved: () => saved.all(),
    stats: () => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return stats.get(d.getTime());
    },
  };
}

function prefixKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out['$' + k] = v === undefined ? null : v;
  return out;
}
