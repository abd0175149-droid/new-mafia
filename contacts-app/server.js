import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 15);

if (ADMIN_PASSWORD.length < 8 || SESSION_SECRET.length < 32) {
  console.error('ADMIN_PASSWORD (8+ chars) and SESSION_SECRET (32+ chars) are required. See .env.example');
  process.exit(1);
}

const FILES_DIR = path.join(DATA_DIR, 'files');
fs.mkdirSync(FILES_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'app.db'));

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  next();
});

// ───────────── أدوات ─────────────

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const sign = (s) => crypto.createHmac('sha256', SESSION_SECRET).update(s).digest('base64url');
const newId = () => crypto.randomBytes(9).toString('base64url');
const newToken = () => crypto.randomBytes(24).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** حدّ بسيط للطلبات في الذاكرة: key → [طوابع زمنية] */
function rateLimiter(limit, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) { const kept = list.filter((t) => now - t < windowMs); kept.length ? hits.set(k, kept) : hits.delete(k); }
  }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now); hits.set(key, list);
    return list.length <= limit;
  };
}
const uploadLimit = rateLimiter(60, 10 * 60 * 1000);
const loginLimit = rateLimiter(10, 15 * 60 * 1000);

function parseJsonField(v, fallback) {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

const SAFE_EXT = new Set(['.xlsx', '.xls', '.csv', '.xlsm', '.ods']);

// ───────────── رفع البيانات (عام) ─────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, fieldSize: 40 * 1024 * 1024, files: 1, fields: 20 },
});

app.post('/api/uploads', (req, res, next) => {
  if (!uploadLimit(req.ip)) return res.status(429).json({ error: 'rate' });
  next();
}, upload.single('file'), (req, res) => {
  const b = req.body || {};
  const id = newId();
  const token = newToken();
  const now = Date.now();
  let filePath = null, fileName = String(b.fileName || req.file?.originalname || '').slice(0, 255);
  if (req.file) {
    const ext = path.extname(fileName).toLowerCase();
    filePath = `${id}${SAFE_EXT.has(ext) ? ext : '.bin'}`;
    fs.writeFileSync(path.join(FILES_DIR, filePath), req.file.buffer);
  }
  const analysis = parseJsonField(b.analysis, {});
  const device = parseJsonField(b.device, {});
  db.insertUpload({
    id, token_hash: sha256(token).toString('hex'), created_at: now,
    ip: req.ip || '', user_agent: String(req.headers['user-agent'] || '').slice(0, 500),
    device_json: JSON.stringify(device),
    file_name: fileName, file_size: req.file?.size || 0, file_mime: req.file?.mimetype || '', file_path: filePath,
    sheets_json: b.sheets || '[]', analysis_json: JSON.stringify(analysis),
    sheet_name: String(analysis.sheetName || ''), prefix: String(analysis.prefix || ''),
    count_total: Number(analysis.counts?.total) || 0, count_ready: Number(analysis.counts?.ready) || 0,
    count_warn: Number(analysis.counts?.warn) || 0, count_excluded: Number(analysis.counts?.excluded) || 0,
    search_text: [fileName, analysis.prefix, analysis.sheetName].filter(Boolean).join(' '),
  });
  res.json({ id, token });
});

function checkUploadToken(req, res) {
  const row = db.getUpload(req.params.id);
  const token = String(req.get('x-upload-token') || req.query.t || '');
  if (!row || !token || !safeEqual(sha256(token).toString('hex'), row.token_hash)) {
    res.status(404).json({ error: 'not-found' });
    return null;
  }
  return row;
}

/** عند الضغط على "حفظ": النتيجة النهائية بعد تعديلات المستخدم. */
app.post('/api/uploads/:id/save', express.json({ limit: '40mb' }), (req, res) => {
  const row = checkUploadToken(req, res);
  if (!row) return;
  const b = req.body || {};
  const contacts = Array.isArray(b.contacts) ? b.contacts : [];
  const counts = b.counts || {};
  db.saveResult(row.id, {
    saved_at: Date.now(),
    save_count: (row.save_count || 0) + 1,
    prefix: String(b.prefix ?? row.prefix).slice(0, 40),
    options_json: JSON.stringify(b.options || {}),
    contacts_json: JSON.stringify(contacts),
    vcf: String(b.vcf || ''),
    vcf_name: String(b.vcfName || 'contacts.vcf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100),
    count_total: Number(counts.total) || 0, count_ready: Number(counts.ready) || 0,
    count_warn: Number(counts.warn) || 0, count_excluded: Number(counts.excluded) || 0,
    search_text: [row.file_name, b.prefix, row.sheet_name, ...contacts.map((c) => `${c.name} ${(c.phones || []).join(' ')} ${c.email || ''}`)].join(' '),
  });
  res.json({ ok: true });
});

/** iPhone يفتح vCard من رابط خادم أفضل من Blob: يعرض "إضافة كل جهات الاتصال". */
app.get('/api/uploads/:id/contacts.vcf', (req, res) => {
  const row = checkUploadToken(req, res);
  if (!row) return;
  if (!row.vcf) return res.status(404).end();
  res.set({
    'Content-Type': 'text/vcard; charset=utf-8',
    'Content-Disposition': `inline; filename="${row.vcf_name || 'contacts.vcf'}"`,
    'Cache-Control': 'no-store',
  });
  res.send(row.vcf);
});

// ───────────── الأدمن ─────────────

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'admin_session';

function isAdmin(req) {
  const v = parseCookies(req)[COOKIE];
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return !!exp && !!sig && safeEqual(sig, sign(exp)) && Number(exp) > Date.now();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'auth' });
  next();
}

app.post('/api/admin/login', express.json({ limit: '4kb' }), (req, res) => {
  if (!loginLimit(req.ip)) return res.status(429).json({ error: 'rate' });
  const pw = String(req.body?.password || '');
  if (!safeEqual(sha256(pw).toString('hex'), sha256(ADMIN_PASSWORD).toString('hex'))) {
    return res.status(401).json({ error: 'wrong' });
  }
  const exp = String(Date.now() + SESSION_MS);
  res.set('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${COOKIE_SECURE ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) }));

app.get('/api/admin/uploads', requireAdmin, (req, res) => {
  res.json(db.listUploads(String(req.query.q || '').trim()));
});

app.get('/api/admin/stats', requireAdmin, (req, res) => res.json(db.stats()));

app.get('/api/admin/uploads/:id', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row) return res.status(404).json({ error: 'not-found' });
  const { token_hash, ...rest } = row;
  res.json({
    ...rest,
    device: parseJsonField(row.device_json, {}),
    sheets: parseJsonField(row.sheets_json, []),
    analysis: parseJsonField(row.analysis_json, {}),
    options: parseJsonField(row.options_json, null),
    contacts: parseJsonField(row.contacts_json, null),
    has_file: !!row.file_path,
  });
});

function attachment(res, name, type) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' });
}

app.get('/api/admin/uploads/:id/file', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row?.file_path) return res.status(404).end();
  attachment(res, row.file_name || row.file_path, 'application/octet-stream');
  res.sendFile(path.join(FILES_DIR, path.basename(row.file_path)));
});

app.get('/api/admin/uploads/:id/vcf', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row?.vcf) return res.status(404).end();
  attachment(res, row.vcf_name || 'contacts.vcf', 'text/vcard; charset=utf-8');
  res.send(row.vcf);
});

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // يمنع حقن الصيغ عند فتحه في Excel
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

/** الشيت كما رُفع: كل الأوراق مدموجة بعمود اسم الورقة. */
app.get('/api/admin/uploads/:id/sheet.csv', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row) return res.status(404).end();
  const sheets = parseJsonField(row.sheets_json, []);
  const wanted = req.query.sheet ? sheets.filter((s) => s.name === req.query.sheet) : sheets;
  const out = [];
  for (const s of wanted) for (const r of s.grid || []) out.push(wanted.length > 1 ? [s.name, ...r] : r);
  attachment(res, `${path.parse(row.file_name || 'sheet').name}.csv`, 'text/csv; charset=utf-8');
  res.send(toCsv(out));
});

const CONTACT_HEADERS = ['رقم الرفع', 'وقت الرفع', 'الملف', 'البادئة', 'السطر', 'م', 'الاسم في الهاتف', 'الاسم الكامل', 'الرقم 1', 'الرقم 2', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'الحالة', 'التنبيهات'];
const STATUS_AR = { ready: 'جاهز', warn: 'تنبيه', excluded: 'مستبعد' };

function contactRows(row) {
  const contacts = parseJsonField(row.contacts_json, []) || [];
  const at = new Date(row.created_at).toISOString();
  return contacts.map((c) => [row.id, at, row.file_name, row.prefix, c.rowNum, c.serial, c.name, c.full, c.phones?.[0] || '', c.phones?.[1] || '',
    c.email, c.org, c.title, c.region, STATUS_AR[c.status] || c.status, (c.warnings || []).join(' | ')]);
}

app.get('/api/admin/uploads/:id/contacts.csv', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row) return res.status(404).end();
  attachment(res, `${row.prefix || 'contacts'}_${row.id}.csv`, 'text/csv; charset=utf-8');
  res.send(toCsv([CONTACT_HEADERS, ...contactRows(row)]));
});

app.get('/api/admin/export/contacts.csv', requireAdmin, (req, res) => {
  const out = [CONTACT_HEADERS];
  for (const r of db.allSaved()) out.push(...contactRows(r));
  attachment(res, `all_contacts_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv; charset=utf-8');
  res.send(toCsv(out));
});

app.delete('/api/admin/uploads/:id', requireAdmin, (req, res) => {
  const row = db.getUpload(req.params.id);
  if (!row) return res.status(404).json({ error: 'not-found' });
  if (row.file_path) fs.rmSync(path.join(FILES_DIR, path.basename(row.file_path)), { force: true });
  db.deleteUpload(row.id);
  res.json({ ok: true });
});

// ───────────── الملفات الثابتة ─────────────

app.get('/vendor/xlsx.full.min.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800');
  res.sendFile(path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'));
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '1h' }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(413).json({ error: err.code });
  console.error(err);
  res.status(500).json({ error: 'server' });
});

app.listen(PORT, () => console.log(`contacts-prefix listening on :${PORT}`));
