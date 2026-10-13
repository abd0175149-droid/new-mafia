// خادم Cloudflare Workers: نفس واجهات server.js، والبيانات في D1 + KV (لا يحتاج بطاقة دفع).
// الصفحات الثابتة (public/) يقدّمها Cloudflare مباشرة؛ هذا الملف يخدم /api/* فقط.

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'admin_session';
const SAFE_EXT = new Set(['.xlsx', '.xls', '.csv', '.xlsm', '.ods']);
const STATUS_AR = { ready: 'جاهز', warn: 'تنبيه', excluded: 'مستبعد' };
const CONTACT_HEADERS = ['رقم الرفع', 'وقت الرفع', 'الملف', 'البادئة', 'السطر', 'م', 'الاسم في الهاتف', 'الاسم الكامل', 'الرقم 1', 'الرقم 2', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'الحالة', 'التنبيهات'];
const LIST_COLS = `id, created_at, saved_at, save_count, ip, user_agent, device_json, geo_json, file_name, file_size, sheet_name, prefix,
  count_total, count_ready, count_warn, count_excluded, repeat_count, last_repeat_at`;
const UNIQUE_HEADERS = ['الاسم في الهاتف', 'الاسم الكامل', 'الرقم 1', 'الرقم 2', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'البادئة',
  'أول ظهور', 'آخر ظهور', 'عدد الملفات', 'أول ملف'];
const MAX_REPEATS_KEPT = 100;

// ───────────── أدوات ─────────────

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function hmac(secret, s) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}
function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const parseJson = (v, fallback) => { try { return v == null || v === '' ? fallback : JSON.parse(v); } catch { return fallback; } };
function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function attachment(body, name, type) {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return new Response(body, { headers: {
    'Content-Type': type, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  } });
}
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const baseName = (n) => (n || '').replace(/\.[^.]+$/, '') || 'sheet';
const extOf = (n) => { const m = (n || '').toLowerCase().match(/\.[^.]+$/); return m ? m[0] : ''; };

function config(env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('ADMIN_PASSWORD (8+) and SESSION_SECRET (32+) secrets are required');
  }
  return { maxBytes: Number(env.MAX_FILE_MB || 15) * 1024 * 1024, secure: env.COOKIE_SECURE !== 'false' };
}

const blobKey = (id, name) => `uploads/${id}/${name}`;
const blobText = (env, key) => env.FILES.get(key, 'text');
async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const page = await env.FILES.list({ prefix, cursor });
    await Promise.all(page.keys.map((k) => env.FILES.delete(k.name)));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// ───────────── الرفع (عام) ─────────────

async function createUpload(req, env, cfg) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > cfg.maxBytes + 45 * 1024 * 1024) return json({ error: 'LIMIT_FILE_SIZE' }, 413);
  const form = await req.formData();
  const file = form.get('file');
  if (file && typeof file !== 'string' && file.size > cfg.maxBytes) return json({ error: 'LIMIT_FILE_SIZE' }, 413);

  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ua = (req.headers.get('User-Agent') || '').slice(0, 500);
  const fileName = String(form.get('fileName') || file?.name || '').slice(0, 255);
  const sheets = String(form.get('sheets') || '[]');
  const contentHash = await sha256Hex(sheets);
  const cf = req.cf || {};

  // نفس محتوى الخلايا سبق رفعه (من أي مستخدم): لا يُسجَّل مرة ثانية، فقط يُعدّ.
  const existing = await env.DB.prepare('SELECT id, repeats_json FROM uploads WHERE content_hash = ? ORDER BY created_at LIMIT 1')
    .bind(contentHash).first();
  if (existing) {
    const repeats = parseJson(existing.repeats_json, []);
    repeats.push({ at: now, ip, ua: ua.slice(0, 200), fileName, country: cf.country || '' });
    await env.DB.batch([
      env.DB.prepare('UPDATE uploads SET repeat_count = repeat_count + 1, last_repeat_at = ?, repeats_json = ? WHERE id = ?')
        .bind(now, JSON.stringify(repeats.slice(-MAX_REPEATS_KEPT)), existing.id),
      env.DB.prepare('INSERT INTO upload_tokens (token_hash, upload_id, original, created_at) VALUES (?, ?, 0, ?)').bind(tokenHash, existing.id, now),
    ]);
    return json({ id: existing.id, token, duplicate: true });
  }

  const id = randomToken(9);
  const analysis = parseJson(form.get('analysis'), {});
  let fileKey = null;
  if (file && typeof file !== 'string') {
    const ext = extOf(fileName);
    fileKey = blobKey(id, `original${SAFE_EXT.has(ext) ? ext : '.bin'}`);
    await env.FILES.put(fileKey, await file.arrayBuffer());
  }
  await env.FILES.put(blobKey(id, 'sheets.json'), sheets);

  const geo = { country: cf.country, city: cf.city, region: cf.region, timezone: cf.timezone, asOrganization: cf.asOrganization, colo: cf.colo };
  const counts = analysis.counts || {};
  await env.DB.batch([env.DB.prepare(`INSERT INTO uploads (id, token_hash, created_at, ip, user_agent, device_json, geo_json, file_name, file_size, file_mime,
      file_key, analysis_json, sheet_name, prefix, count_total, count_ready, count_warn, count_excluded, search_text, content_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    id, tokenHash, now, ip, ua,
    String(form.get('device') || '{}').slice(0, 20000), JSON.stringify(geo), fileName, file?.size || 0, file?.type || '', fileKey,
    JSON.stringify(analysis).slice(0, 500000), String(analysis.sheetName || ''), String(analysis.prefix || ''),
    Number(counts.total) || 0, Number(counts.ready) || 0, Number(counts.warn) || 0, Number(counts.excluded) || 0,
    [fileName, analysis.prefix, analysis.sheetName].filter(Boolean).join(' '), contentHash,
  ), env.DB.prepare('INSERT INTO upload_tokens (token_hash, upload_id, original, created_at) VALUES (?, ?, 1, ?)').bind(tokenHash, id, now)]);
  return json({ id, token });
}

/** { row, tokenHash, original } — original=false لمن رفع ملفاً مكرراً. */
async function uploadByToken(req, env, id, url) {
  const token = req.headers.get('X-Upload-Token') || url.searchParams.get('t') || '';
  if (!token) return null;
  const row = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first();
  if (!row) return null;
  const tokenHash = await sha256Hex(token);
  const t = await env.DB.prepare('SELECT upload_id, original FROM upload_tokens WHERE token_hash = ?').bind(tokenHash).first();
  if (t && t.upload_id === row.id) return { row, tokenHash, original: !!t.original };
  if (row.token_hash && safeEqual(tokenHash, row.token_hash)) return { row, tokenHash, original: true };
  return null;
}

/**
 * يدمج جهات رفعة في جدول contacts الموحّد (مفتاحه رقم الهاتف).
 * الشخص الموجود مسبقاً من ملف آخر لا يُضاف مرة ثانية: يُحدَّث آخر ظهور وعدد الملفات،
 * وتُكمَّل حقوله الفارغة فقط. يعيد الجهات معلَّمة بـ dupOf (رقم الرفعة الأولى) أو dupInFile.
 */
async function mergeContacts(env, uploadId, prefix, contacts, at) {
  const valid = contacts.filter((c) => c.status !== 'excluded' && c.phones?.length);
  const phones = [...new Set(valid.flatMap((c) => c.phones.slice(0, 2)))];
  const known = new Map();
  for (let i = 0; i < phones.length; i += 40) {
    const chunk = phones.slice(i, i + 40);
    const ph = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT phone, phone2, first_upload_id, last_upload_id FROM contacts WHERE phone IN (${ph}) OR phone2 IN (${ph})`)
      .bind(...chunk, ...chunk).all();
    for (const r of results) { known.set(r.phone, r); if (r.phone2) known.set(r.phone2, r); }
  }
  const stmts = [];
  for (const c of contacts) {
    delete c.dupOf; delete c.dupInFile;
    if (c.status === 'excluded' || !c.phones?.length) continue;
    const ps = c.phones.slice(0, 2);
    const search = [c.name, c.full, ...ps, c.email].filter(Boolean).join(' ');
    const hit = ps.map((p) => known.get(p)).find(Boolean);
    if (hit) {
      if (hit.fresh) c.dupInFile = true;
      else if (hit.first_upload_id !== uploadId) c.dupOf = hit.first_upload_id;
      const newSource = hit.first_upload_id !== uploadId && hit.last_upload_id !== uploadId;
      const other = ps.find((p) => p !== hit.phone) || null;
      stmts.push(env.DB.prepare(`UPDATE contacts SET last_seen = MAX(COALESCE(last_seen, 0), ?), last_upload_id = ?, seen_count = seen_count + ?,
          phone2 = COALESCE(phone2, ?), full = COALESCE(NULLIF(full, ''), ?), email = COALESCE(NULLIF(email, ''), ?),
          org = COALESCE(NULLIF(org, ''), ?), title = COALESCE(NULLIF(title, ''), ?), region = COALESCE(NULLIF(region, ''), ?),
          search = COALESCE(search, '') || ' ' || ? WHERE phone = ?`)
        .bind(at, uploadId, newSource ? 1 : 0, other, c.full || '', c.email || '', c.org || '', c.title || '', c.region || '', search, hit.phone));
      hit.last_upload_id = uploadId;
      if (other && !hit.phone2) hit.phone2 = other;
      for (const p of ps) if (!known.has(p)) known.set(p, hit);
    } else {
      const row = { phone: ps[0], phone2: ps[1] || null, first_upload_id: uploadId, last_upload_id: uploadId, fresh: true };
      stmts.push(env.DB.prepare(`INSERT INTO contacts (phone, phone2, name, full, email, org, title, region, prefix, first_upload_id, last_upload_id,
          first_seen, last_seen, seen_count, search) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(phone) DO NOTHING`)
        .bind(row.phone, row.phone2, c.name || '', c.full || '', c.email || '', c.org || '', c.title || '', c.region || '', prefix || '',
          uploadId, uploadId, at, at, search));
      for (const p of ps) known.set(p, row);
    }
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return contacts;
}

async function saveResult(req, env, { row, tokenHash, original }) {
  const b = await req.json().catch(() => ({}));
  const contacts = Array.isArray(b.contacts) ? b.contacts : [];
  const counts = b.counts || {};
  const vcfName = String(b.vcfName || 'contacts.vcf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
  // من رفع ملفاً مكرراً لملف محفوظ: لا يُسجَّل شيء جديد؛ يُحفظ ملف vCard مؤقتاً له فقط (ليومٍ) لينزّله على هاتفه.
  if (!original && row.saved_at) {
    await env.FILES.put(`tmp/${tokenHash}.vcf`, String(b.vcf || ''), { expirationTtl: 86400 });
    return json({ ok: true, duplicate: true });
  }
  const now = Date.now();
  await mergeContacts(env, row.id, String(b.prefix ?? row.prefix), contacts, now);
  await Promise.all([
    env.FILES.put(blobKey(row.id, 'contacts.json'), JSON.stringify(contacts)),
    env.FILES.put(blobKey(row.id, 'contacts.vcf'), String(b.vcf || '')),
  ]);
  const search = [row.file_name, b.prefix, row.sheet_name, ...contacts.map((c) => `${c.name} ${(c.phones || []).join(' ')} ${c.email || ''}`)].join(' ');
  await env.DB.prepare(`UPDATE uploads SET saved_at=?, save_count=save_count+1, prefix=?, options_json=?, vcf_name=?,
      count_total=?, count_ready=?, count_warn=?, count_excluded=?, search_text=? WHERE id=?`).bind(
    now, String(b.prefix ?? row.prefix).slice(0, 40), JSON.stringify(b.options || {}).slice(0, 20000), vcfName,
    Number(counts.total) || 0, Number(counts.ready) || 0, Number(counts.warn) || 0, Number(counts.excluded) || 0,
    search.slice(0, 900000), row.id,
  ).run();
  return json({ ok: true });
}

// ───────────── الأدمن ─────────────

async function isAdmin(req, env) {
  const v = cookies(req)[COOKIE];
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return !!exp && !!sig && Number(exp) > Date.now() && safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

async function login(req, env, cfg) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const since = Date.now() - 15 * 60 * 1000;
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(since).run();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip).first();
  if (n >= 10) return json({ error: 'rate' }, 429);
  const body = await req.json().catch(() => ({}));
  if (!safeEqual(await sha256Hex(String(body.password || '')), await sha256Hex(env.ADMIN_PASSWORD))) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
    return json({ error: 'wrong' }, 401);
  }
  const exp = String(Date.now() + SESSION_MS);
  return json({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE}=${exp}.${await hmac(env.SESSION_SECRET, exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${cfg.secure ? '; Secure' : ''}`,
  });
}

async function listUploads(env, q) {
  if (!q) return (await env.DB.prepare(`SELECT ${LIST_COLS} FROM uploads ORDER BY created_at DESC LIMIT 1000`).all()).results;
  const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return (await env.DB.prepare(`SELECT ${LIST_COLS} FROM uploads WHERE search_text LIKE ?1 ESCAPE '\\' OR ip LIKE ?1 ESCAPE '\\' OR id = ?2
    ORDER BY created_at DESC LIMIT 1000`).bind(like, q).all()).results;
}

async function stats(env) {
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  const [u, c] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS uploads, COUNT(saved_at) AS saved, COALESCE(SUM(repeat_count), 0) AS repeats,
      COALESCE(SUM(CASE WHEN created_at > ? THEN 1 END), 0) AS today FROM uploads`).bind(d.getTime()),
    env.DB.prepare('SELECT COUNT(*) AS contacts, COALESCE(SUM(CASE WHEN seen_count > 1 THEN 1 END), 0) AS shared FROM contacts'),
  ]);
  return { ...u.results[0], ...c.results[0] };
}

async function contactRows(env, row) {
  const contacts = parseJson(await blobText(env, blobKey(row.id, 'contacts.json')), []) || [];
  const at = new Date(row.created_at).toISOString();
  return contacts.map((c) => [row.id, at, row.file_name, row.prefix, c.rowNum, c.serial, c.name, c.full, c.phones?.[0] || '', c.phones?.[1] || '',
    c.email, c.org, c.title, c.region, STATUS_AR[c.status] || c.status, (c.warnings || []).join(' | ')]);
}

async function listContacts(env, q, limit = 5000) {
  const base = `SELECT c.*, u.file_name AS first_file FROM contacts c LEFT JOIN uploads u ON u.id = c.first_upload_id`;
  if (!q) return (await env.DB.prepare(`${base} ORDER BY c.first_seen DESC LIMIT ?`).bind(limit).all()).results;
  const like = `%${q.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`;
  return (await env.DB.prepare(`${base} WHERE c.search LIKE ? ESCAPE '\\' ORDER BY c.first_seen DESC LIMIT ?`).bind(like, limit).all()).results;
}

/**
 * مراجعة البيانات القديمة وإزالة تكراراتها، رفعة رفعة من الأقدم (حتى يبقى كل طلب صغيراً):
 *   POST maintenance/start         → يفرّغ جدول الجهات الموحّد ويعيد قائمة الرفعات بالترتيب
 *   POST maintenance/process/<id>  → إن كان محتواها مطابقاً لرفعة أقدم: تُدمج فيها وتُحذف؛ وإلا تُضاف جهاتها للجدول الموحّد
 */
async function maintenance(env, parts) {
  if (parts[0] === 'start') {
    await env.DB.prepare('DELETE FROM contacts').run();
    const { results } = await env.DB.prepare('SELECT id FROM uploads ORDER BY created_at, id').all();
    return json({ ids: results.map((r) => r.id) });
  }
  if (parts[0] !== 'process' || !parts[1]) return json({ error: 'not-found' }, 404);
  const row = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(parts[1]).first();
  if (!row) return json({ gone: true });
  const hash = row.content_hash || await sha256Hex((await blobText(env, blobKey(row.id, 'sheets.json'))) ?? '[]');
  const earlier = await env.DB.prepare(`SELECT * FROM uploads WHERE content_hash = ? AND id != ?
      AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at, id LIMIT 1`)
    .bind(hash, row.id, row.created_at, row.created_at, row.id).first();

  if (earlier) {
    const repeats = [...parseJson(earlier.repeats_json, []),
      { at: row.created_at, ip: row.ip, ua: (row.user_agent || '').slice(0, 200), fileName: row.file_name, merged: true },
      ...parseJson(row.repeats_json, [])].sort((a, b) => a.at - b.at).slice(-MAX_REPEATS_KEPT);
    const stmts = [
      env.DB.prepare('UPDATE uploads SET repeat_count = repeat_count + ?, last_repeat_at = MAX(COALESCE(last_repeat_at, 0), ?), repeats_json = ? WHERE id = ?')
        .bind(1 + (row.repeat_count || 0), row.last_repeat_at || row.created_at, JSON.stringify(repeats), earlier.id),
      env.DB.prepare('UPDATE upload_tokens SET upload_id = ?, original = 0 WHERE upload_id = ?').bind(earlier.id, row.id),
      env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(row.id),
    ];
    // الأقدم لم يُحفظ والمكرر حُفظ: تنتقل النتيجة المحفوظة إلى الأقدم قبل الحذف.
    let moved = null;
    if (!earlier.saved_at && row.saved_at) {
      const [c, v] = await Promise.all([blobText(env, blobKey(row.id, 'contacts.json')), blobText(env, blobKey(row.id, 'contacts.vcf'))]);
      moved = parseJson(c, []);
      await Promise.all([env.FILES.put(blobKey(earlier.id, 'contacts.json'), c || '[]'), env.FILES.put(blobKey(earlier.id, 'contacts.vcf'), v || '')]);
      stmts.push(env.DB.prepare(`UPDATE uploads SET saved_at = ?, save_count = ?, prefix = ?, options_json = ?, vcf_name = ?, count_total = ?,
          count_ready = ?, count_warn = ?, count_excluded = ?, search_text = ? WHERE id = ?`)
        .bind(row.saved_at, row.save_count, row.prefix, row.options_json, row.vcf_name, row.count_total, row.count_ready, row.count_warn,
          row.count_excluded, row.search_text, earlier.id));
    }
    await env.DB.batch(stmts);
    await deletePrefix(env, `uploads/${row.id}/`);
    if (moved) {
      await mergeContacts(env, earlier.id, row.prefix, moved, row.saved_at);
      await env.FILES.put(blobKey(earlier.id, 'contacts.json'), JSON.stringify(moved));
    }
    return json({ merged: earlier.id });
  }

  await env.DB.prepare('UPDATE uploads SET content_hash = ? WHERE id = ?').bind(hash, row.id).run();
  if (row.saved_at) {
    const contacts = parseJson(await blobText(env, blobKey(row.id, 'contacts.json')), []) || [];
    await mergeContacts(env, row.id, row.prefix, contacts, row.saved_at);
    await env.FILES.put(blobKey(row.id, 'contacts.json'), JSON.stringify(contacts));
  }
  return json({ ok: true });
}

async function adminRoute(req, env, url, parts) {
  const getRow = (id) => env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first();
  // /api/admin/uploads
  if (parts.length === 1 && parts[0] === 'uploads' && req.method === 'GET') return json(await listUploads(env, (url.searchParams.get('q') || '').trim()));
  if (parts.length === 1 && parts[0] === 'stats') return json(await stats(env));
  if (parts.length === 1 && parts[0] === 'contacts') return json(await listContacts(env, (url.searchParams.get('q') || '').trim()));
  if (parts.length === 2 && parts[0] === 'export' && parts[1] === 'contacts.csv') {
    const rows = await listContacts(env, '', 1e6);
    const iso = (t) => (t ? new Date(t).toISOString() : '');
    const out = [UNIQUE_HEADERS, ...rows.map((r) => [r.name, r.full, r.phone, r.phone2, r.email, r.org, r.title, r.region, r.prefix,
      iso(r.first_seen), iso(r.last_seen), r.seen_count, r.first_file || r.first_upload_id])];
    return attachment(toCsv(out), `unique_contacts_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv; charset=utf-8');
  }
  if (parts[0] === 'maintenance' && req.method === 'POST') return maintenance(env, parts.slice(1));
  if (parts[0] !== 'uploads' || !parts[1]) return json({ error: 'not-found' }, 404);

  const row = await getRow(parts[1]);
  if (!row) return json({ error: 'not-found' }, 404);
  const sub = parts[2];

  if (!sub && req.method === 'DELETE') {
    await deletePrefix(env, `uploads/${row.id}/`);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM upload_tokens WHERE upload_id = ?').bind(row.id),
      env.DB.prepare('DELETE FROM contacts WHERE first_upload_id = ? AND seen_count <= 1').bind(row.id),
    ]);
    return json({ ok: true });
  }
  if (!sub) {
    const [sheets, contacts, vcf] = await Promise.all([
      blobText(env, blobKey(row.id, 'sheets.json')), blobText(env, blobKey(row.id, 'contacts.json')), blobText(env, blobKey(row.id, 'contacts.vcf')),
    ]);
    const { token_hash, repeats_json, ...rest } = row;
    return json({
      ...rest, vcf: vcf || null, repeats: parseJson(repeats_json, []),
      device: { ...parseJson(row.device_json, {}), geo: parseJson(row.geo_json, {}) },
      sheets: parseJson(sheets, []), analysis: parseJson(row.analysis_json, {}), options: parseJson(row.options_json, null),
      contacts: row.saved_at ? parseJson(contacts, null) : null, has_file: !!row.file_key,
    });
  }
  if (sub === 'file') {
    const obj = row.file_key && await env.FILES.get(row.file_key, 'stream');
    return obj ? attachment(obj, row.file_name || 'file', 'application/octet-stream') : new Response(null, { status: 404 });
  }
  if (sub === 'vcf') {
    const vcf = await blobText(env, blobKey(row.id, 'contacts.vcf'));
    return vcf ? attachment(vcf, row.vcf_name || 'contacts.vcf', 'text/vcard; charset=utf-8') : new Response(null, { status: 404 });
  }
  if (sub === 'sheet.csv') {
    const sheets = parseJson(await blobText(env, blobKey(row.id, 'sheets.json')), []);
    const want = url.searchParams.get('sheet');
    const wanted = want ? sheets.filter((s) => s.name === want) : sheets;
    const out = [];
    for (const s of wanted) for (const r of s.grid || []) out.push(wanted.length > 1 ? [s.name, ...r] : r);
    return attachment(toCsv(out), `${baseName(row.file_name)}.csv`, 'text/csv; charset=utf-8');
  }
  if (sub === 'contacts.csv') {
    return attachment(toCsv([CONTACT_HEADERS, ...await contactRows(env, row)]), `${row.prefix || 'contacts'}_${row.id}.csv`, 'text/csv; charset=utf-8');
  }
  return json({ error: 'not-found' }, 404);
}

// ───────────── التوجيه ─────────────

async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const cfg = config(env);
  const m = path.match(/^\/api\/uploads\/([\w-]+)\/(save|contacts\.vcf)$/);

  if (path === '/api/uploads' && req.method === 'POST') return createUpload(req, env, cfg);
  if (m) {
    const ctx = await uploadByToken(req, env, m[1], url);
    if (!ctx) return json({ error: 'not-found' }, 404);
    if (m[2] === 'save' && req.method === 'POST') return saveResult(req, env, ctx);
    if (m[2] === 'contacts.vcf' && req.method === 'GET') {
      const row = ctx.row;
      const vcf = (!ctx.original && await blobText(env, `tmp/${ctx.tokenHash}.vcf`)) || await blobText(env, blobKey(row.id, 'contacts.vcf'));
      if (!vcf) return new Response(null, { status: 404 });
      return new Response(vcf, { headers: {
        'Content-Type': 'text/vcard; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename="${row.vcf_name || 'contacts.vcf'}"`,
      } });
    }
  }
  if (path === '/api/admin/login' && req.method === 'POST') return login(req, env, cfg);
  if (path === '/api/admin/logout' && req.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${cfg.secure ? '; Secure' : ''}` });
  }
  if (path === '/api/admin/me') return json({ admin: await isAdmin(req, env) });
  if (path.startsWith('/api/admin/')) {
    if (!await isAdmin(req, env)) return json({ error: 'auth' }, 401);
    return adminRoute(req, env, url, path.slice('/api/admin/'.length).split('/').filter(Boolean));
  }
  if (path.startsWith('/api/')) return json({ error: 'not-found' }, 404);
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req, env) {
    try {
      const res = await handle(req, env);
      if (new URL(req.url).pathname.startsWith('/api/')) {
        const h = new Headers(res.headers);
        h.set('X-Content-Type-Options', 'nosniff');
        h.set('Referrer-Policy', 'no-referrer');
        return new Response(res.body, { status: res.status, headers: h });
      }
      return res;
    } catch (e) {
      console.error(e);
      return json({ error: 'server' }, 500);
    }
  },
};
