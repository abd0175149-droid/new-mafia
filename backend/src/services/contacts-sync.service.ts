// ══════════════════════════════════════════════════════
// 📇 دفتر أرقام MC — مزامنةٌ حيّة لجهات اتصال الآيفون (CardDAV، قراءةٌ فقط)
// ══════════════════════════════════════════════════════
// الآيفون يضيف حساب «CardDAV» يشير إلى خادمنا (ملفّ إعدادٍ بضغطة أو يدويّاً)، فيأخذ جهات
// الاتصال منّا مباشرة: الملاحظات تتحدّث وحدها، والجديد يظهر، ومن حذف حسابه يختفي، وإطفاء
// الحساب على الهاتف يزيلهم كلّهم. قرار المالك 2026-09-30 («المزامنة المباشرة مهمّة جدّاً»).
//
// التصميم:
//   • بطاقات مُجسَّدة في `carddav_cards` (uid، vCard، etag، version، deleted). `refreshCards`
//     يعيد بناء الكلّ من النظام ويرفع `version` لما تغيّر فقط ⟵ رمز المزامنة (sync-token) =
//     أعلى version، فيأخذ الهاتف الفرق وحده (RFC 6578) أو يقارن getctag/getetag.
//   • الشخص الواحد برقمه الموحّد: الحساب أولى، ثمّ محادثة واتساب، ثمّ حجز الموظّف. UID ثابت
//     بالرقم (مُعمّى) فيحدّث الهاتف البطاقة نفسها حين يسجّل من راسلنا حساباً.
//   • الإعدادات (المصادر، شكل الاسم، أجزاء الملاحظة، الميلاد) من الداشبورد في
//     `contacts_sync_config` — قرارات التصوّر بتوصياتها افتراضاً (artifact KHGsxzji1xirwPEKXApwzC).
//   • الأجهزة: اسم مستخدم + كلمة سرّ عشوائيّة لكلّ هاتف (bcrypt)، تُلغى من الداشبورد.
// ══════════════════════════════════════════════════════

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

const H = 3600e3;
function rowsOf(r: any): any[] { return r?.rows ?? (Array.isArray(r) ? r : []); }

// ══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ══════════════════════════════════════════════════════
export interface ContactsConfig {
  enabled: boolean;
  prefix: string;
  sources: { players: boolean; wa: boolean; res: boolean; campaign: boolean };
  includeTestPlayed: boolean;
  nameFormat: 'plain' | 'status' | 'city';
  parts: { join: boolean; place: boolean; play: boolean; loyal: boolean; msg: boolean; noshow: boolean; link: boolean };
  birthday: boolean;
}
export const DEFAULT_CONTACTS_CONFIG: ContactsConfig = {
  enabled: true, prefix: 'MC',
  sources: { players: true, wa: true, res: false, campaign: false },
  includeTestPlayed: true, nameFormat: 'plain',
  parts: { join: true, place: true, play: true, loyal: true, msg: true, noshow: true, link: true },
  birthday: true,
};
let cfgCache: { v: ContactsConfig; at: number } | null = null;
export async function getContactsConfig(): Promise<ContactsConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.v;
  const db = getDB(); if (!db) return DEFAULT_CONTACTS_CONFIG;
  const r: any = await db.execute(sql`SELECT value FROM contacts_sync_config WHERE key = 'contacts'`).catch(() => null);
  const v = rowsOf(r)[0]?.value || {};
  const d = DEFAULT_CONTACTS_CONFIG;
  const out: ContactsConfig = {
    ...d, ...v,
    sources: { ...d.sources, ...(v.sources || {}) },
    parts: { ...d.parts, ...(v.parts || {}) },
  };
  out.prefix = String(out.prefix || 'MC').slice(0, 12);
  if (!['plain', 'status', 'city'].includes(out.nameFormat)) out.nameFormat = 'plain';
  cfgCache = { v: out, at: Date.now() };
  return out;
}
export async function saveContactsConfig(patch: any): Promise<ContactsConfig> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  const cur = await getContactsConfig();
  const b = (x: any, dflt: boolean) => (typeof x === 'boolean' ? x : dflt);
  const next: ContactsConfig = {
    enabled: b(patch.enabled, cur.enabled),
    prefix: typeof patch.prefix === 'string' && patch.prefix.trim() ? patch.prefix.trim().slice(0, 12) : cur.prefix,
    sources: {
      players: b(patch.sources?.players, cur.sources.players), wa: b(patch.sources?.wa, cur.sources.wa),
      res: b(patch.sources?.res, cur.sources.res), campaign: b(patch.sources?.campaign, cur.sources.campaign),
    },
    includeTestPlayed: b(patch.includeTestPlayed, cur.includeTestPlayed),
    nameFormat: ['plain', 'status', 'city'].includes(patch.nameFormat) ? patch.nameFormat : cur.nameFormat,
    parts: Object.fromEntries(Object.keys(cur.parts).map(k => [k, b(patch.parts?.[k], (cur.parts as any)[k])])) as any,
    birthday: b(patch.birthday, cur.birthday),
  };
  await db.execute(sql`INSERT INTO contacts_sync_config (key, value, updated_at) VALUES ('contacts', ${JSON.stringify(next)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  cfgCache = null; lastRefresh = 0;
  return next;
}

// ══════════════════════════════════════════════════════
// 🧾 vCard — دوالّ نقيّة (test-contacts-sync.ts يختبرها)
// ══════════════════════════════════════════════════════
const AR = '٠١٢٣٤٥٦٧٨٩';
export const arD = (x: any) => String(x).replace(/\d/g, d => AR[Number(d)]);
const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران', 'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];
/** تاريخٌ بتوقيت عمّان «٢٧ أيلول ٢٠٢٦» */
export function dateAr(v: any, withYear = true): string {
  const t = new Date(v).getTime(); if (isNaN(t)) return '';
  const d = new Date(t + 3 * H);
  return `${arD(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}${withYear ? ' ' + arD(d.getUTCFullYear()) : ''}`;
}
/** الرقم بصيغة +962 (أو الدوليّ كما هو) — null إن لم يكن صالحاً */
export function intlPhone(raw: string | null | undefined): { intl: string; local: string | null; fixed: boolean } | null {
  const s = String(raw || '').trim();
  if (!s || s.startsWith('deleted:')) return null;
  const local = normalizeLocalPhone(s);
  if (local) return { intl: '+962' + local.slice(1), local, fixed: s !== local };
  const digits = s.replace(/[^\d]/g, '');
  if (s.startsWith('+') && !s.startsWith('+962') && digits.length >= 8 && digits.length <= 15) return { intl: '+' + digits, local: null, fixed: false };
  if (s.startsWith('00') && !s.startsWith('00962') && digits.length >= 10 && digits.length <= 17) return { intl: '+' + digits.slice(2), local: null, fixed: true };
  return null;
}
/** هروب قيم vCard 3.0 (RFC 2426): \ ثمّ , ; ثمّ السطر الجديد */
export function vEsc(s: string): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
}
/** طيّ السطر عند ٧٥ بايتاً دون قطع حرفٍ متعدّد البايتات (العربيّة والإيموجي) */
export function foldLine(line: string): string {
  const out: string[] = []; let cur = ''; let bytes = 0; let limit = 75;
  for (const ch of Array.from(line)) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; limit = 75; }
    else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join('\r\n');
}
export interface Contact {
  uid: string; phoneKey: string; intl: string; name: string; note: string[]; bday: string | null; url: string | null;
  source: 'player' | 'wa' | 'res' | 'campaign'; playerId: number | null; played: boolean; fixedPhone: boolean;
}
export function buildVCard(c: Contact, cfg: Pick<ContactsConfig, 'prefix'>): string {
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0', 'PRODID:-//Mafia Club//Contacts//AR',
    `UID:${c.uid}`, `N:;${vEsc(c.name)};;;`, `FN:${vEsc(c.name)}`, 'ORG:Mafia Club', `CATEGORIES:${vEsc(cfg.prefix)}`,
    `TEL;TYPE=CELL,VOICE:${c.intl}`,
  ];
  if (c.bday) lines.push(`BDAY:${c.bday}`);
  if (c.note.length) lines.push(`NOTE:${c.note.map(vEsc).join('\\n')}`);
  if (c.url) lines.push(`URL:${c.url}`);
  lines.push('END:VCARD');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
export function uidFor(phoneKey: string): string {
  // ملحٌ ثابت: لو رُبط بسرّ الـJWT لأعاد تدويرُه إنشاءَ كلّ جهات الاتصال على الهواتف
  const salt = 'mafia-club-contacts-v1';
  return 'mc-' + crypto.createHash('sha256').update(salt + '|' + phoneKey).digest('hex').slice(0, 24);
}

// ══════════════════════════════════════════════════════
// 👥 جمع الأشخاص من النظام
// ══════════════════════════════════════════════════════
const RANK_AR: Record<string, string> = { INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'أندربوس', GODFATHER: 'الأب الروحي' };
const baseUrl = () => String(env.PUBLIC_URL || 'https://club-mafia.grade.sbs').replace(/\/$/, '');
function period(): string { const d = new Date(Date.now() + 3 * H); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
const cleanName = (s: any) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);

export interface BuildResult { contacts: Contact[]; invalid: Array<{ source: string; name: string; phone: string; playerId: number | null; played: boolean }>; }
export async function buildContacts(cfg?: ContactsConfig): Promise<BuildResult> {
  cfg = cfg || await getContactsConfig();
  const db = getDB(); if (!db) return { contacts: [], invalid: [] };
  const byKey = new Map<string, Contact>();
  const invalid: BuildResult['invalid'] = [];
  const P = cfg.prefix;
  const nameOf = (base: string, extra: { games?: number; city?: string | null; source: string }) => {
    let n = `${P} ${base}`;
    if (cfg!.nameFormat === 'status' && extra.source === 'player') n += (extra.games || 0) >= 20 ? ' ⭐' : (extra.games || 0) === 0 ? ' 🆕' : '';
    if (cfg!.nameFormat === 'city' && extra.city) n += ` · ${extra.city}`;
    return n;
  };

  // ── ١. اللاعبون ──
  if (cfg.sources.players) {
    const r: any = await db.execute(sql`
      WITH mrows AS (
        SELECT mp.player_id, s.activity_id, a.date, l.name AS loc
          FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
          JOIN activities a ON a.id = s.activity_id LEFT JOIN locations l ON l.id = a.location_id
         WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL AND COALESCE(l.is_test_location, false) = false
      ), agg AS (SELECT player_id, COUNT(*)::int AS games, COUNT(DISTINCT activity_id)::int AS nights, MAX(date) AS last_date FROM mrows GROUP BY player_id),
      lastv AS (SELECT DISTINCT ON (player_id) player_id, loc FROM mrows ORDER BY player_id, date DESC)
      SELECT p.id, p.name, p.phone, p.dob, p.created_at, c.name AS city, p.rank_tier, p.level, p.is_test_account,
             COALESCE(agg.games, 0) AS games, COALESCE(agg.nights, 0) AS nights, agg.last_date, lastv.loc AS last_loc,
             (SELECT COUNT(*)::int FROM loyalty_stamps st WHERE st.player_id = p.id AND st.period = ${period()} AND st.voided_at IS NULL) AS stamps,
             (SELECT MAX(w.last_inbound_at) FROM wa_conversations w WHERE w.player_id = p.id OR w.phone = p.phone) AS last_msg,
             (SELECT COUNT(*)::int FROM no_show_strikes ns WHERE (ns.player_id = p.id OR ns.phone = p.phone) AND ns.status <> 'waived' AND ns.created_at > NOW() - INTERVAL '90 days') AS no_shows
        FROM players p LEFT JOIN cities c ON c.id = p.home_city_id
        LEFT JOIN agg ON agg.player_id = p.id LEFT JOIN lastv ON lastv.player_id = p.id
       WHERE p.deleted_at IS NULL AND p.anonymized_at IS NULL`);
    for (const x of rowsOf(r)) {
      const games = Number(x.games || 0);
      if (x.is_test_account && !(cfg.includeTestPlayed && games > 0)) continue;
      const ph = intlPhone(x.phone);
      const base = cleanName(x.name) || 'لاعب';
      if (!ph) { invalid.push({ source: 'player', name: base, phone: String(x.phone || ''), playerId: Number(x.id), played: games > 0 }); continue; }
      const key = ph.local || ph.intl;
      const note: string[] = [];
      const pt = cfg.parts;
      if (pt.join) note.push(`🎭 مافيا كلوب · لاعب منذ ${dateAr(x.created_at)}`);
      if (pt.place) { const s = [x.city ? `📍 ${x.city}` : '', x.rank_tier ? `🎖️ ${RANK_AR[x.rank_tier] || x.rank_tier}` : '', x.level ? `مستوى ${arD(x.level)}` : ''].filter(Boolean).join(' · '); if (s) note.push(s); }
      if (pt.play) note.push(games > 0 ? `🎮 ${arD(games)} لعبة في ${arD(x.nights)} ${Number(x.nights) === 1 ? 'ليلة' : 'ليالٍ'} · آخر زيارة ${dateAr(x.last_date)}${x.last_loc ? ` (${x.last_loc})` : ''}` : '🆕 سجّل ولم يلعب بعد');
      if (pt.loyal && Number(x.stamps) > 0) note.push(`✦ ${arD(x.stamps)} ${Number(x.stamps) === 1 ? 'ختم ولاء' : 'أختام ولاء'} هذا الشهر`);
      if (pt.msg && x.last_msg) note.push(`💬 آخر رسالة للدون ${dateAr(x.last_msg)}`);
      if (pt.noshow && Number(x.no_shows) > 0) note.push(`🚫 غاب عن ${Number(x.no_shows) === 1 ? 'حجزٍ واحد' : `${arD(x.no_shows)} حجوزات`} (آخر ٩٠ يوماً)`);
      let bday: string | null = null;
      if (cfg.birthday && x.dob) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(x.dob)); if (m && m[1] > '1900') bday = `${m[1]}-${m[2]}-${m[3]}`; }
      byKey.set(key, {
        uid: uidFor(key), phoneKey: key, intl: ph.intl, name: nameOf(base, { games, city: x.city, source: 'player' }), note, bday,
        url: pt.link ? `${baseUrl()}/admin/players/${x.id}` : null, source: 'player', playerId: Number(x.id), played: games > 0, fixedPhone: ph.fixed,
      });
    }
  }

  // ── ٢. محادثات واتساب بلا حساب: من راسل فعلاً، وأرقام الحملة التي لم تردّ ──
  if (cfg.sources.wa || cfg.sources.campaign) {
    const r: any = await db.execute(sql`
      SELECT w.id, w.phone, w.display_name, w.created_at, w.last_inbound_at,
             EXISTS (SELECT 1 FROM wa_messages m WHERE m.conversation_id = w.id AND m.direction = 'in') AS inbound,
             (SELECT COUNT(*)::int FROM reservations r WHERE r.phone = w.phone AND r.deleted_at IS NULL) AS booked,
             (SELECT COUNT(*)::int FROM reservations r WHERE r.phone = w.phone AND r.deleted_at IS NULL AND r.attended = TRUE) AS attended
        FROM wa_conversations w WHERE w.player_id IS NULL`);
    for (const x of rowsOf(r)) {
      const src = x.inbound ? 'wa' : 'campaign';
      if ((src === 'wa' && !cfg.sources.wa) || (src === 'campaign' && !cfg.sources.campaign)) continue;
      const ph = intlPhone(x.phone); if (!ph) continue;
      const key = ph.local || ph.intl;
      if (byKey.has(key)) continue;   // الحساب أولى
      const base = cleanName(x.display_name) || `بلا اسم ${ph.local || ph.intl}`;
      const note: string[] = [];
      const pt = cfg.parts;
      if (src === 'wa') {
        if (pt.join) note.push(`🎭 مافيا كلوب · راسل الدون أوّل مرّة ${dateAr(x.created_at)} · بلا حساب`);
        if (pt.play) note.push(Number(x.booked) ? `📋 حجز ${Number(x.booked) === 1 ? 'مرّة' : `${arD(x.booked)} مرّات`} · ${Number(x.attended) ? `حضر ${arD(x.attended)}` : 'لم يحضر بعد'}` : '🆕 لم يحجز بعد');
        if (pt.msg && x.last_inbound_at) note.push(`💬 آخر رسالة ${dateAr(x.last_inbound_at)}`);
      } else {
        note.push(`🎭 مافيا كلوب · رقمٌ من قائمة حملة ${dateAr(x.created_at)}، لم يردّ`);
      }
      byKey.set(key, { uid: uidFor(key), phoneKey: key, intl: ph.intl, name: nameOf(base, { source: src }), note, bday: null,
        url: pt.link && src === 'wa' ? `${baseUrl()}/admin/whatsapp?conv=${x.id}` : null, source: src, playerId: null, played: Number(x.attended) > 0, fixedPhone: ph.fixed });
    }
  }

  // ── ٣. حجوزات الموظّفين فقط ──
  if (cfg.sources.res) {
    const r: any = await db.execute(sql`
      SELECT r.phone, (array_agg(r.contact_name ORDER BY r.created_at DESC))[1] AS name, COUNT(*)::int AS booked,
             MAX(a.date) AS last_date, (array_agg(r.created_by ORDER BY r.created_at DESC))[1] AS by
        FROM reservations r LEFT JOIN activities a ON a.id = r.activity_id
        LEFT JOIN locations l ON l.id = a.location_id
       WHERE r.deleted_at IS NULL AND COALESCE(r.phone, '') <> '' AND COALESCE(l.is_test_location, false) = false
       GROUP BY r.phone`);
    for (const x of rowsOf(r)) {
      const ph = intlPhone(x.phone); if (!ph) continue;
      const key = ph.local || ph.intl;
      if (byKey.has(key)) continue;
      const base = cleanName(x.name) || `بلا اسم ${ph.local || ph.intl}`;
      const note: string[] = [];
      if (cfg.parts.join) note.push(`🎭 مافيا كلوب · حجز عن طريق ${cleanName(x.by) || 'الموظّفين'} · بلا حساب`);
      if (cfg.parts.play) note.push(`📋 ${arD(x.booked)} ${Number(x.booked) === 1 ? 'حجز' : 'حجوزات'}${x.last_date ? `، آخرها ${dateAr(x.last_date)}` : ''}`);
      byKey.set(key, { uid: uidFor(key), phoneKey: key, intl: ph.intl, name: nameOf(base, { source: 'res' }), note, bday: null, url: null, source: 'res', playerId: null, played: false, fixedPhone: ph.fixed });
    }
  }
  return { contacts: [...byKey.values()], invalid };
}

// ══════════════════════════════════════════════════════
// 🗃️ البطاقات المُجسَّدة + رمز المزامنة
// ══════════════════════════════════════════════════════
let lastRefresh = 0; let refreshing: Promise<void> | null = null;
/** يعيد بناء البطاقات ويرفع version لما تغيّر فقط (دقيقة واحدة على الأقلّ بين إعادتين) */
export async function refreshCards(force = false): Promise<void> {
  if (!force && Date.now() - lastRefresh < 60_000) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const db = getDB(); if (!db) return;
    try {
      const cfg = await getContactsConfig();
      const { contacts } = cfg.enabled ? await buildContacts(cfg) : { contacts: [] as Contact[] };
      const cur: any = await db.execute(sql`SELECT uid, etag, deleted FROM carddav_cards`);
      const have = new Map<string, { etag: string; deleted: boolean }>(rowsOf(cur).map((x: any) => [x.uid, { etag: x.etag, deleted: !!x.deleted }]));
      const seen = new Set<string>();
      let changed = 0;
      for (const c of contacts) {
        seen.add(c.uid);
        const vcard = buildVCard(c, cfg);
        const etag = crypto.createHash('sha1').update(vcard).digest('hex').slice(0, 24);
        const h = have.get(c.uid);
        if (h && h.etag === etag && !h.deleted) continue;
        await db.execute(sql`
          INSERT INTO carddav_cards (uid, etag, vcard, source, version, deleted, updated_at)
          VALUES (${c.uid}, ${etag}, ${vcard}, ${c.source}, nextval('carddav_version_seq'), false, NOW())
          ON CONFLICT (uid) DO UPDATE SET etag = EXCLUDED.etag, vcard = EXCLUDED.vcard, source = EXCLUDED.source,
            version = EXCLUDED.version, deleted = false, updated_at = NOW()`);
        changed++;
      }
      for (const [uid, h] of have) {
        if (seen.has(uid) || h.deleted) continue;
        await db.execute(sql`UPDATE carddav_cards SET deleted = true, vcard = '', version = nextval('carddav_version_seq'), updated_at = NOW() WHERE uid = ${uid}`);
        changed++;
      }
      lastRefresh = Date.now();
      if (changed) console.log(`📇 contacts-sync: ${changed} card(s) changed · ${contacts.length} live`);
    } catch (e: any) { console.warn('⚠️ contacts refresh:', e?.message); }
    finally { refreshing = null; }
  })();
  return refreshing;
}
export async function currentVersion(): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`SELECT COALESCE(MAX(version), 0)::bigint AS v FROM carddav_cards`);
  return Number(rowsOf(r)[0]?.v || 0);
}
export async function liveCards(): Promise<Array<{ uid: string; etag: string }>> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`SELECT uid, etag FROM carddav_cards WHERE deleted = false ORDER BY uid`);
  return rowsOf(r).map((x: any) => ({ uid: String(x.uid), etag: String(x.etag) }));
}
export async function cardsByUid(uids: string[]): Promise<Map<string, { etag: string; vcard: string }>> {
  const out = new Map<string, { etag: string; vcard: string }>();
  const db = getDB(); if (!db || !uids.length) return out;
  const safe = uids.filter(u => /^mc-[a-f0-9]{24}$/.test(u));
  if (!safe.length) return out;
  const r: any = await db.execute(sql`SELECT uid, etag, vcard FROM carddav_cards WHERE deleted = false AND uid IN (${sql.join(safe.map(u => sql`${u}`), sql`, `)})`);
  for (const x of rowsOf(r)) out.set(String(x.uid), { etag: String(x.etag), vcard: String(x.vcard) });
  return out;
}
export async function changesSince(v: number): Promise<Array<{ uid: string; etag: string; deleted: boolean }>> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`SELECT uid, etag, deleted FROM carddav_cards WHERE version > ${v} ORDER BY version`);
  return rowsOf(r).map((x: any) => ({ uid: String(x.uid), etag: String(x.etag), deleted: !!x.deleted }));
}
export async function allVCards(): Promise<string> {
  const db = getDB(); if (!db) return '';
  const r: any = await db.execute(sql`SELECT vcard FROM carddav_cards WHERE deleted = false ORDER BY uid`);
  return rowsOf(r).map((x: any) => String(x.vcard)).join('');
}
export async function cardStats(): Promise<any> {
  const db = getDB(); if (!db) return {};
  const r: any = await db.execute(sql`SELECT source, COUNT(*)::int AS n FROM carddav_cards WHERE deleted = false GROUP BY source`);
  const m: any = { total: 0 }; for (const x of rowsOf(r)) { m[x.source] = Number(x.n); m.total += Number(x.n); }
  const u: any = await db.execute(sql`SELECT MAX(updated_at) AS t FROM carddav_cards`);
  m.lastChangeAt = rowsOf(u)[0]?.t || null; m.version = await currentVersion(); m.lastRefreshAt = lastRefresh ? new Date(lastRefresh) : null;
  return m;
}

// ══════════════════════════════════════════════════════
// 📱 الأجهزة (اسم مستخدم + كلمة سرّ لكلّ هاتف)
// ══════════════════════════════════════════════════════
// رابط الإعداد في القاعدة (لا في الذاكرة: نشرٌ أو إعادة تشغيلٍ بين الإنشاء والفتح كانت تُبطله).
// كلمة السرّ لازمةٌ داخل ملفّ الإعداد، فتُحفظ **مُعمّاةً** (AES-256-GCM) حتّى أوّل استعمالٍ أو ٣٠
// دقيقة ثمّ تُمحى؛ الرمز نفسه لا يُحفظ إلّا مُجزَّأ (sha256).
const setupKey = () => crypto.createHash('sha256').update(String(env.JWT_SECRET) + '|carddav-setup').digest();
function seal(plain: string): string {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', setupKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
}
function unseal(box: string): string | null {
  try {
    const [iv, tag, enc] = box.split('.').map(s => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', setupKey(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}
const tokenHash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export async function createDevice(label: string, by: string): Promise<{ id: number; username: string; password: string; setupToken: string }> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  const username = 'mc-' + crypto.randomBytes(4).toString('hex');
  const password = crypto.randomBytes(18).toString('base64url');   // ١٤٤ بتّاً — لا تخمين
  const hash = await bcrypt.hash(password, 10);
  const setupToken = crypto.randomBytes(24).toString('hex');
  const r: any = await db.execute(sql`
    INSERT INTO carddav_devices (label, username, password_hash, created_by, setup_token_hash, setup_secret, setup_expires_at)
    VALUES (${label.slice(0, 80) || 'جهاز'}, ${username}, ${hash}, ${by}, ${tokenHash(setupToken)}, ${seal(password)}, ${new Date(Date.now() + 30 * 60e3)}) RETURNING id`);
  return { id: Number(rowsOf(r)[0].id), username, password, setupToken };
}
/** رابط ملفّ الإعداد: صالحٌ ٣٠ دقيقة ولمرّةٍ واحدة — يُمحى السرّ المعمّى فور الاستعمال */
export async function takeSetup(token: string): Promise<{ username: string; password: string } | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`
    UPDATE carddav_devices SET setup_token_hash = NULL, setup_secret = NULL, setup_expires_at = NULL
     WHERE setup_token_hash = ${tokenHash(token)} AND revoked_at IS NULL
     RETURNING username, setup_secret, setup_expires_at`);
  const row = rowsOf(r)[0]; if (!row) return null;
  if (!row.setup_expires_at || new Date(row.setup_expires_at).getTime() < Date.now()) return null;
  const password = unseal(String(row.setup_secret || ''));
  return password ? { username: String(row.username), password } : null;
}
export async function listDevices(): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  const r: any = await db.execute(sql`SELECT id, label, username, created_by, created_at, last_seen_at, revoked_at FROM carddav_devices ORDER BY id DESC`);
  return rowsOf(r);
}
export async function revokeDevice(id: number): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r: any = await db.execute(sql`UPDATE carddav_devices SET revoked_at = NOW() WHERE id = ${id} AND revoked_at IS NULL RETURNING username`);
  const u = rowsOf(r)[0]?.username; if (u) for (const k of [...authCache.keys()]) if (k.startsWith(u + ':')) authCache.delete(k);
  return !!u;
}
const authCache = new Map<string, { id: number; exp: number }>();
/** Basic auth ⟵ الجهاز (أو null). تُخزَّن النتيجة الناجحة ٥ دقائق كي لا يُعاد bcrypt لكلّ طلب */
export async function authDevice(header: string | undefined): Promise<{ id: number; username: string } | null> {
  const m = /^Basic\s+(.+)$/i.exec(String(header || '')); if (!m) return null;
  let dec = ''; try { dec = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return null; }
  const i = dec.indexOf(':'); if (i <= 0) return null;
  const username = dec.slice(0, i), password = dec.slice(i + 1);
  if (!/^mc-[a-f0-9]{8}$/.test(username)) return null;
  const ck = username + ':' + crypto.createHash('sha256').update(password).digest('hex');
  const db = getDB(); if (!db) return null;
  const hit = authCache.get(ck);
  if (hit && hit.exp > Date.now()) {
    // الإلغاء يسري فوراً: bcrypt مخزَّن، أمّا حالة الجهاز فتُقرأ كلّ طلب (مفتاحٌ أساسيّ — رخيص)
    const alive: any = await db.execute(sql`SELECT 1 FROM carddav_devices WHERE id = ${hit.id} AND revoked_at IS NULL`);
    if (rowsOf(alive).length) return { id: hit.id, username };
    authCache.delete(ck); return null;
  }
  const r: any = await db.execute(sql`SELECT id, password_hash FROM carddav_devices WHERE username = ${username} AND revoked_at IS NULL`);
  const row = rowsOf(r)[0]; if (!row) return null;
  if (!(await bcrypt.compare(password, String(row.password_hash)))) return null;
  authCache.set(ck, { id: Number(row.id), exp: Date.now() + 5 * 60e3 });
  return { id: Number(row.id), username };
}
const seenAt = new Map<number, number>();
export async function touchDevice(id: number, ip: string | undefined): Promise<void> {
  if ((seenAt.get(id) || 0) > Date.now() - 60e3) return;
  seenAt.set(id, Date.now());
  const db = getDB(); if (!db) return;
  await db.execute(sql`UPDATE carddav_devices SET last_seen_at = NOW(), last_ip = ${String(ip || '').slice(0, 64)} WHERE id = ${id}`).catch(() => {});
}

/** ملفّ إعداد الآيفون (.mobileconfig) — يضيف حساب CardDAV بضغطة */
export function mobileConfig(username: string, password: string): string {
  const host = new URL(baseUrl()).hostname;
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const u1 = crypto.randomUUID().toUpperCase(), u2 = crypto.randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>CardDAVAccountDescription</key><string>Mafia Club</string>
      <key>CardDAVHostName</key><string>${x(host)}</string>
      <key>CardDAVPort</key><integer>443</integer>
      <key>CardDAVPrincipalURL</key><string>/api/carddav/principals/${x(username)}/</string>
      <key>CardDAVUseSSL</key><true/>
      <key>CardDAVUsername</key><string>${x(username)}</string>
      <key>CardDAVPassword</key><string>${x(password)}</string>
      <key>PayloadDescription</key><string>جهات اتصال لاعبي مافيا كلوب — تتحدّث تلقائيّاً</string>
      <key>PayloadDisplayName</key><string>جهات اتصال Mafia Club</string>
      <key>PayloadIdentifier</key><string>sbs.grade.mafiaclub.carddav.${x(username)}</string>
      <key>PayloadType</key><string>com.apple.carddav.account</string>
      <key>PayloadUUID</key><string>${u1}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>Mafia Club — جهات الاتصال</string>
  <key>PayloadIdentifier</key><string>sbs.grade.mafiaclub.contacts.${x(username)}</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${u2}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
}
