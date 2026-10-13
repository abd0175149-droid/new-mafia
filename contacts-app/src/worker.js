// خادم Cloudflare Workers: نفس واجهات server.js، والبيانات في D1 + KV (لا يحتاج بطاقة دفع).
// الصفحات الثابتة (public/) يقدّمها Cloudflare مباشرة؛ هذا الملف يخدم /api/* فقط.

const SESSION_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'admin_session';
const SAFE_EXT = new Set(['.xlsx', '.xls', '.csv', '.xlsm', '.ods']);
const STATUS_AR = { ready: 'جاهز', warn: 'تنبيه', excluded: 'مستبعد' };
const CONTACT_HEADERS = ['رقم الرفع', 'وقت الرفع', 'الملف', 'البادئة', 'السطر', 'م', 'الاسم في الهاتف', 'الاسم الكامل', 'الرقم 1', 'الرقم 2', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'الحالة', 'التنبيهات'];
const LIST_COLS = `id, created_at, saved_at, save_count, ip, user_agent, device_json, geo_json, file_name, file_size, sheet_name, prefix,
  count_total, count_ready, count_warn, count_excluded`;

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

  const id = randomToken(9);
  const token = randomToken(24);
  const fileName = String(form.get('fileName') || file?.name || '').slice(0, 255);
  const analysis = parseJson(form.get('analysis'), {});
  let fileKey = null;
  if (file && typeof file !== 'string') {
    const ext = extOf(fileName);
    fileKey = blobKey(id, `original${SAFE_EXT.has(ext) ? ext : '.bin'}`);
    await env.FILES.put(fileKey, await file.arrayBuffer());
  }
  await env.FILES.put(blobKey(id, 'sheets.json'), String(form.get('sheets') || '[]'));

  const cf = req.cf || {};
  const geo = { country: cf.country, city: cf.city, region: cf.region, timezone: cf.timezone, asOrganization: cf.asOrganization, colo: cf.colo };
  const counts = analysis.counts || {};
  await env.DB.prepare(`INSERT INTO uploads (id, token_hash, created_at, ip, user_agent, device_json, geo_json, file_name, file_size, file_mime,
      file_key, analysis_json, sheet_name, prefix, count_total, count_ready, count_warn, count_excluded, search_text)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    id, await sha256Hex(token), Date.now(), req.headers.get('CF-Connecting-IP') || '', (req.headers.get('User-Agent') || '').slice(0, 500),
    String(form.get('device') || '{}').slice(0, 20000), JSON.stringify(geo), fileName, file?.size || 0, file?.type || '', fileKey,
    JSON.stringify(analysis).slice(0, 500000), String(analysis.sheetName || ''), String(analysis.prefix || ''),
    Number(counts.total) || 0, Number(counts.ready) || 0, Number(counts.warn) || 0, Number(counts.excluded) || 0,
    [fileName, analysis.prefix, analysis.sheetName].filter(Boolean).join(' '),
  ).run();
  return json({ id, token });
}

async function uploadByToken(req, env, id, url) {
  const row = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first();
  const token = req.headers.get('X-Upload-Token') || url.searchParams.get('t') || '';
  if (!row || !token || !safeEqual(await sha256Hex(token), row.token_hash)) return null;
  return row;
}

async function saveResult(req, env, row) {
  const b = await req.json().catch(() => ({}));
  const contacts = Array.isArray(b.contacts) ? b.contacts : [];
  const counts = b.counts || {};
  const vcfName = String(b.vcfName || 'contacts.vcf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
  await Promise.all([
    env.FILES.put(blobKey(row.id, 'contacts.json'), JSON.stringify(contacts)),
    env.FILES.put(blobKey(row.id, 'contacts.vcf'), String(b.vcf || '')),
  ]);
  const search = [row.file_name, b.prefix, row.sheet_name, ...contacts.map((c) => `${c.name} ${(c.phones || []).join(' ')} ${c.email || ''}`)].join(' ');
  await env.DB.prepare(`UPDATE uploads SET saved_at=?, save_count=save_count+1, prefix=?, options_json=?, vcf_name=?,
      count_total=?, count_ready=?, count_warn=?, count_excluded=?, search_text=? WHERE id=?`).bind(
    Date.now(), String(b.prefix ?? row.prefix).slice(0, 40), JSON.stringify(b.options || {}).slice(0, 20000), vcfName,
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
  return env.DB.prepare(`SELECT COUNT(*) AS uploads, COUNT(saved_at) AS saved,
    COALESCE(SUM(CASE WHEN saved_at IS NOT NULL THEN count_ready + count_warn END), 0) AS contacts,
    COALESCE(SUM(CASE WHEN created_at > ? THEN 1 END), 0) AS today FROM uploads`).bind(d.getTime()).first();
}

async function contactRows(env, row) {
  const contacts = parseJson(await blobText(env, blobKey(row.id, 'contacts.json')), []) || [];
  const at = new Date(row.created_at).toISOString();
  return contacts.map((c) => [row.id, at, row.file_name, row.prefix, c.rowNum, c.serial, c.name, c.full, c.phones?.[0] || '', c.phones?.[1] || '',
    c.email, c.org, c.title, c.region, STATUS_AR[c.status] || c.status, (c.warnings || []).join(' | ')]);
}

async function adminRoute(req, env, url, parts) {
  const getRow = (id) => env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(id).first();
  // /api/admin/uploads
  if (parts.length === 1 && parts[0] === 'uploads' && req.method === 'GET') return json(await listUploads(env, (url.searchParams.get('q') || '').trim()));
  if (parts.length === 1 && parts[0] === 'stats') return json(await stats(env));
  if (parts.length === 2 && parts[0] === 'export' && parts[1] === 'contacts.csv') {
    const rows = (await env.DB.prepare('SELECT id, created_at, file_name, prefix FROM uploads WHERE saved_at IS NOT NULL ORDER BY created_at').all()).results;
    const out = [CONTACT_HEADERS];
    for (const r of rows) out.push(...await contactRows(env, r));
    return attachment(toCsv(out), `all_contacts_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv; charset=utf-8');
  }
  if (parts[0] !== 'uploads' || !parts[1]) return json({ error: 'not-found' }, 404);

  const row = await getRow(parts[1]);
  if (!row) return json({ error: 'not-found' }, 404);
  const sub = parts[2];

  if (!sub && req.method === 'DELETE') {
    await deletePrefix(env, `uploads/${row.id}/`);
    await env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(row.id).run();
    return json({ ok: true });
  }
  if (!sub) {
    const [sheets, contacts, vcf] = await Promise.all([
      blobText(env, blobKey(row.id, 'sheets.json')), blobText(env, blobKey(row.id, 'contacts.json')), blobText(env, blobKey(row.id, 'contacts.vcf')),
    ]);
    const { token_hash, ...rest } = row;
    return json({
      ...rest, vcf: vcf || null,
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
    const row = await uploadByToken(req, env, m[1], url);
    if (!row) return json({ error: 'not-found' }, 404);
    if (m[2] === 'save' && req.method === 'POST') return saveResult(req, env, row);
    if (m[2] === 'contacts.vcf' && req.method === 'GET') {
      const vcf = await blobText(env, blobKey(row.id, 'contacts.vcf'));
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
