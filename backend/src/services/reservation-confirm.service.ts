// ══════════════════════════════════════════════════════
// 📋 رسالة تثبيت الحجز — تلقائيّاً من رقم الأعمال (2026-10-30، التصوّر المعتمد)
//   https://claude.ai/artifact/VW4AqkJLqBft2NofiiTuGY
//
// القاعدة: كلّ حجزٍ يصير «مثبّتاً» تصل صاحبه رسالة القالب (المكان، الخريطة، الموعد، برنامج الليلة،
// القواعد) مرّةً واحدة لكلّ فعاليّة — أيّاً كان طريقه: البوت، قائمة الانتظار، «خذ المقعد»، التطبيق،
// «جيب صحابك» (صاحبها، وكلّ صاحبٍ لحظة قبوله)، الحجز اليدويّ، أداة الأدمن، النقل لفعاليّةٍ أخرى.
//
// قرارات المالك التسعة (كلّها كما أُوصي):
//   ١ التطبيق يصله فوراً · ٢ البوت يكتب ردّاً قصيراً والقالب تحته · ٣ قالبٌ واحد في الخادم يعدّله الأدمن ·
//   ٤ الختام «إذا تغيّرت خطّتك ردّ…» · ٥ مهلة تراجع دقيقتان لتثبيت الموظّف · ٦ بين ١٢ ليلاً و٩ صباحاً تنتظر
//   حتّى ٩ إلّا لفعاليّةٍ قبل ظهر ذلك اليوم · ٧ صاحب المجموعة، وكلّ صاحبٍ عند قبوله · ٨ سقفٌ مستقلّ (٣٠٠) في
//   المسار المقيّد بوقت · ٩ لا رجعيّة: من لحظة التشغيل فقط (المفتاح المطفأ لا يُنشئ مهامّ أصلاً).
//
// السجلّ: reservation_confirm_jobs — صفٌّ لكلّ (مرجع، فعاليّة): res:<id> أو mem:<عضو مجموعة>.
//   pending ⟵ sending ⟵ sent | failed | skipped | cancelled. فريدٌ فلا تتكرّر الرسالة بتكرار التثبيت،
//   ومحفوظ في القاعدة فلا يضيع بإعادة التشغيل. العامل في عمليّة الخادم وحدها (startResConfirm).
// ══════════════════════════════════════════════════════

import { eq, sql } from 'drizzle-orm';
import { getDB, type Database } from '../config/db.js';
import { reservations } from '../schemas/admin.schema.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';
import { resStatus } from '../lib/reservation-status.js';

const FLAG = 'res_confirm';
const TPL_KEY = 'res_confirm_tpl';
export const UNDO_MS = 2 * 60_000;        // القرار ٥
const QUICK_MS = 15_000;                  // اللاعب ضغط بنفسه — ردّ البوت يسبق القالب
const rows = (r: any): any[] => r?.rows ?? r ?? [];
/** ختم «أُرسلت» الذي تضعه هذه الخدمة — يُميّز إرسالها عن إرسال الموظّف اليدويّ */
export const AUTO_SENDER = 'رسالة التثبيت تلقائيّاً';

export type ConfirmVia = 'bot' | 'wl_take' | 'app' | 'group' | 'member' | 'page' | 'manual' | 'admin' | 'move';
const QUICK: ConfirmVia[] = ['bot', 'wl_take', 'app', 'group', 'member'];

/** 🧪 للفحوص (e2e-res-confirm): مفتاحٌ مفروض، وموقع الاختبار كمكانٍ حقيقيّ، وإرسالٌ مستبدَل، وساعةٌ مفروضة */
export const testHooks: {
  forceEnabled: boolean | null; allowTestLocation: boolean; now: (() => number) | null;
  send: ((input: any) => Promise<any>) | null;
} = { forceEnabled: null, allowTestLocation: false, now: null, send: null };
const now = () => (testHooks.now ? testHooks.now() : Date.now());

// ══════════════════════════════════════════════════════
// 📝 القالب — واحدٌ للجميع (القرار ٣)
// ══════════════════════════════════════════════════════
// 🔴 النصّ نفسه في frontend/src/app/admin/reservations/page.tsx (RES_TPL_DEFAULT) — يتغيّران معاً.
//    الختام القديم «يُرجى الردّ… لتثبيت الحجز نهائيّاً» ناقض رسالةً تخرج لأنّ الحجز ثُبّت فعلاً (القرار ٤).
export const DEFAULT_TPL = [
  'مرحباً {الاسم} 👋',
  'نؤكّد حجزك في «{الفعالية}» لعدد {العدد}.',
  '📍 المكان: {المكان}',
  '🗺️ الموقع على الخريطة: {الخريطة}',
  '🗓️ الموعد: {الموعد}',
  '{الجدول}',
  '',
  'وقبل الحضور، ثلاثُ نقاطٍ تجعل الليلة أمتعَ للجميع:',
  '',
  '⏰ الحضور في الموعد',
  'المقاعد تُوزَّع قبل البداية والجولة تنطلق بوقتها — والمتأخّر قد يفوته الدور الأوّل.',
  '',
  '🎭 تنظيم اللعبة',
  'اللعب بجولات، ولكلّ لاعبٍ مقعدُه المحدَّد — فنرجو التعاون مع فريق التنظيم في الجلوس والترتيب.',
  '',
  '🎙️ تعليمات الليدر',
  'الليدر يدير الجولة، وقرارُه أثناء اللعب نهائيّ — والنقاشُ بعد انتهائها.',
  '',
  'إذا تغيّرت خطّتك ردّ على هذه الرسالة وبنرتّبها معك. بانتظارك! 🎭',
].join('\n');

export async function getTemplate(): Promise<{ text: string; isDefault: boolean; by: string; at: string | null }> {
  const db = getDB();
  if (db) {
    try {
      const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${TPL_KEY} LIMIT 1`));
      const t = String(r?.value?.text || '').trim();
      if (t) return { text: t, isDefault: t === DEFAULT_TPL.trim(), by: r.value.by || '', at: r.value.at || null };
    } catch { /* الافتراضيّ */ }
  }
  return { text: DEFAULT_TPL, isDefault: true, by: '', at: null };
}
export async function setTemplate(text: string | null, by: string): Promise<void> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  if (text === null) { await db.execute(sql`DELETE FROM wa_runtime_flags WHERE key = ${TPL_KEY}`); return; }
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${TPL_KEY}, ${JSON.stringify({ text, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
}

// ── الملء في الخادم — نقلٌ أمين لـfillTemplate/RES_VARS/scheduleBlock من صفحة المتابعة ──
const arDigits = (t: string) => String(t).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
function hhmmAr(t: unknown): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${arDigits(String(h))}:${arDigits(m[2])} ${period}`;
}
const minutesOf = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export function scheduleBlock(slots?: any[]): string {
  const list = Array.isArray(slots) ? slots : [];
  const games = list.filter(x => x && x.kind !== 'break' && x.start);
  if (!games.length) return '';
  const durs = list.filter(x => x && x.kind === 'break').map(b => {
    const a = minutesOf(b.start), z = minutesOf(b.end);
    return a == null || z == null ? null : ((z - a) + 1440) % 1440;
  }).filter((d): d is number => d != null && d > 0);
  const lines = ['', '🕹️ برنامج الليلة:'];
  for (const g of games) lines.push(`• ${g.label || 'لعبة'} — ${hhmmAr(g.start)}`);
  if (durs.length && durs.every(d => d === durs[0])) {
    const d = durs[0];
    const unit = d === 1 ? 'دقيقة' : d === 2 ? 'دقيقتان' : d <= 10 ? 'دقائق' : 'دقيقة';
    lines.push(`وبين كلّ لعبتين استراحة ${arDigits(String(d))} ${unit}.`);
  } else if (durs.length) lines.push('وبين الألعاب استراحات.');
  return lines.join('\n');
}
const ensureHttp = (raw?: string | null) => { const s = String(raw || '').trim(); return s && !/^https?:\/\//i.test(s) ? `https://${s}` : s; };
export const whenAr = (date: any) => new Date(date).toLocaleString('ar-JO', {
  timeZone: 'Asia/Amman', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const countAr = (n: number) => (n === 1 ? 'شخص واحد' : n === 2 ? 'شخصين' : `${n} أشخاص`);

export interface ConfirmVars { name: string; activityName: string; count: number; locationName?: string; region?: string; mapUrl?: string; date?: any; schedule?: any[] }
const VARS: { token: string; optional?: boolean; get: (d: ConfirmVars) => string }[] = [
  { token: '{الاسم}', get: d => d.name || '' },
  { token: '{الفعالية}', get: d => d.activityName || '' },
  { token: '{العدد}', get: d => countAr(Math.max(1, Number(d.count) || 1)) },
  { token: '{المكان}', optional: true, get: d => [d.locationName, d.region].filter(Boolean).join(' — ') },
  { token: '{الخريطة}', optional: true, get: d => ensureHttp(d.mapUrl) },
  { token: '{الموعد}', optional: true, get: d => (d.date ? whenAr(d.date) : '') },
  { token: '{الجدول}', optional: true, get: d => scheduleBlock(d.schedule) },
];
/** يستبدل الرموز، ويُسقط السطر الذي كلُّ متغيّراته اختياريّةٌ وفارغة (سلوك fillTemplate نفسه) */
export function renderTemplate(tpl: string, d: ConfirmVars): string {
  return String(tpl || '').split('\n').map(line => {
    let filled = line, hasToken = false, hasValue = false, anyOptional = false;
    for (const v of VARS) {
      if (!filled.includes(v.token)) continue;
      hasToken = true;
      if (v.optional) anyOptional = true;
      const value = String(v.get(d) ?? '').trim();
      if (value) hasValue = true;
      filled = filled.split(v.token).join(value);
    }
    if (hasToken && anyOptional && !hasValue) return null;
    // اسمٌ غائب لا يترك «مرحباً  👋» بمسافتين
    return hasToken ? filled.replace(/ {2,}/g, ' ') : filled;
  }).filter((l): l is string => l !== null).join('\n');
}

// ══════════════════════════════════════════════════════
// 🔌 المفتاح (الداشبورد) — مطفأ افتراضاً
// ══════════════════════════════════════════════════════
let flagCache: { on: boolean; at: number } | null = null;
export async function resConfirmEnabled(): Promise<boolean> {
  if (testHooks.forceEnabled !== null) return testHooks.forceEnabled;
  if (flagCache && Date.now() - flagCache.at < 15_000) return flagCache.on;
  const db = getDB(); if (!db) return false;
  try {
    const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
    flagCache = { on: r?.value?.enabled === true, at: Date.now() };
  } catch { flagCache = { on: false, at: Date.now() }; }
  return flagCache.on;
}
export async function setResConfirmEnabled(on: boolean, by: string): Promise<void> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${FLAG}, ${JSON.stringify({ enabled: on, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  flagCache = { on, at: Date.now() };
  // الإطفاء يُسقط المنتظر — لا تخرج رسائل متراكمة عند إعادة التشغيل
  if (!on) await db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'cancelled', reason = 'أُطفئ من الداشبورد' WHERE status = 'pending'`);
}

/**
 * وضع الفعاليّة: live — المفتاح شغّال · off — مطفأ · test — موقع اختبار: يعمل **دائماً** ويصل حسابات
 * الموظّفين وحدها (players.linked_staff_id) — نفس استثناء فواتير واتساب، كي تُجرَّب قبل التشغيل.
 */
async function modeFor(isTest: boolean): Promise<'live' | 'test' | 'off'> {
  if (isTest && !testHooks.allowTestLocation) return 'test';
  return (await resConfirmEnabled()) ? 'live' : 'off';
}

// ══════════════════════════════════════════════════════
// 🧩 بيانات المرجع — حجز متابعة أو عضو مجموعة
// ══════════════════════════════════════════════════════
interface Target {
  ref: string; reservationId: number | null; memberId: number | null; activityId: number;
  name: string; phone: string; count: number; playerId: number | null; staffLinked: boolean;
  confirmed: boolean; manualSentAt: Date | null; waMessageId: number | null;
  act: { name: string; date: any; status: string | null; schedule: any[] };
  loc: { name: string; region: string; mapUrl: string; isTest: boolean };
}
const looksLikePhone = (s: string) => /^[+\d\s\-()]{7,}$/.test(String(s || '').trim()) || /^lid:/.test(String(s || ''));

async function loadActivity(db: Database, activityId: number) {
  const [a] = rows(await db.execute(sql`SELECT a.name, a.date, a.status, a.game_schedule, l.name AS loc_name, l.region, l.map_url,
      COALESCE(l.is_test_location, false) AS is_test
    FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.id = ${activityId} AND a.deleted_at IS NULL LIMIT 1`));
  return a || null;
}

async function loadTarget(db: Database, ref: string): Promise<Target | null> {
  const [kind, idStr] = ref.split(':');
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  if (kind === 'res') {
    const [r] = rows(await db.execute(sql`SELECT r.*, p.name AS player_name, p.linked_staff_id
      FROM reservations r LEFT JOIN players p ON p.id = r.player_id WHERE r.id = ${id} LIMIT 1`));
    if (!r || r.deleted_at || !r.activity_id) return null;
    const a = await loadActivity(db, Number(r.activity_id)); if (!a) return null;
    const name = looksLikePhone(r.contact_name) ? String(r.player_name || '') : String(r.contact_name || '');
    return {
      ref, reservationId: id, memberId: null, activityId: Number(r.activity_id),
      name: name.trim(), phone: String(r.phone || ''), count: Number(r.people_count) || 1,
      playerId: r.player_id ? Number(r.player_id) : null, staffLinked: !!r.linked_staff_id,
      confirmed: resStatus(r.status) === 'confirmed',
      // ختمٌ وضعته هذه الخدمة نفسها ليس إرسالاً يدويّاً (وإلّا لم يصل النقلَ لفعاليّةٍ أخرى رسالةٌ جديدة)
      manualSentAt: r.wa_sent_at && r.wa_sent_by !== AUTO_SENDER ? new Date(r.wa_sent_at) : null,
      waMessageId: r.wa_message_id ? Number(r.wa_message_id) : null,
      act: { name: a.name, date: a.date, status: a.status, schedule: a.game_schedule || [] },
      loc: { name: a.loc_name || '', region: a.region || '', mapUrl: a.map_url || '', isTest: a.is_test === true },
    };
  }
  if (kind === 'mem') {
    const [m] = rows(await db.execute(sql`SELECT m.*, p.name AS player_name, p.phone AS player_phone, p.linked_staff_id
      FROM booking_group_members m LEFT JOIN players p ON p.id = m.player_id WHERE m.id = ${id} LIMIT 1`));
    if (!m) return null;
    const a = await loadActivity(db, Number(m.activity_id)); if (!a) return null;
    return {
      ref, reservationId: null, memberId: id, activityId: Number(m.activity_id),
      name: String(m.player_name || m.name || '').trim(), phone: String(m.player_phone || m.phone || ''), count: 1,
      playerId: m.player_id ? Number(m.player_id) : null, staffLinked: !!m.linked_staff_id,
      confirmed: m.status === 'joined', manualSentAt: null, waMessageId: null,
      act: { name: a.name, date: a.date, status: a.status, schedule: a.game_schedule || [] },
      loc: { name: a.loc_name || '', region: a.region || '', mapUrl: a.map_url || '', isTest: a.is_test === true },
    };
  }
  return null;
}

export function renderFor(t: Target, tpl: string): string {
  return renderTemplate(tpl, {
    name: t.name, activityName: t.act.name, count: t.count,
    locationName: t.loc.name, region: t.loc.region, mapUrl: t.loc.mapUrl, date: t.act.date, schedule: t.act.schedule,
  });
}

// ══════════════════════════════════════════════════════
// ⏱ الجدولة
// ══════════════════════════════════════════════════════
const JO_OFFSET_MS = 3 * 3600e3;   // الأردن UTC+3 طوال السنة
/**
 * القرار ٦: تثبيتٌ بين ١٢:٠٠ ليلاً و٩:٠٠ صباحاً بتوقيت عمّان ينتظر حتّى ٩:٠٠ — إلّا إن كانت الفعاليّة قبل ظهر
 * ذلك اليوم (فالانتظار يُفوّتها).
 */
export function quietAdjust(dueMs: number, activityDate: any): number {
  const jo = new Date(dueMs + JO_OFFSET_MS);
  const minutes = jo.getUTCHours() * 60 + jo.getUTCMinutes();
  if (minutes >= 9 * 60) return dueMs;
  const dayStartUtc = Date.UTC(jo.getUTCFullYear(), jo.getUTCMonth(), jo.getUTCDate()) - JO_OFFSET_MS;
  const nine = dayStartUtc + 9 * 3600e3, noon = dayStartUtc + 12 * 3600e3;
  const actMs = new Date(activityDate).getTime();
  if (Number.isFinite(actMs) && actMs < noon) return dueMs;
  return nine;
}

export interface ScheduleResult { scheduled: boolean; dueAt?: Date; reason?: string }

async function schedule(ref: string, via: ConfirmVia, staffName = ''): Promise<ScheduleResult> {
  const db = getDB(); if (!db) return { scheduled: false, reason: 'DB' };
  const t = await loadTarget(db, ref);
  if (!t) return { scheduled: false, reason: 'المرجع غير موجود' };
  if (!t.confirmed) return { scheduled: false, reason: 'غير مثبّت' };
  const mode = await modeFor(t.loc.isTest);
  if (mode === 'off') return { scheduled: false, reason: 'مطفأ' };          // القرار ٩: لا مهامّ والمفتاح مطفأ
  if (t.act.status === 'cancelled' || new Date(t.act.date).getTime() <= now()) return { scheduled: false, reason: 'الفعاليّة بدأت أو أُلغيت' };
  if (t.manualSentAt) return { scheduled: false, reason: 'أُرسلت يدويّاً من قبل' };

  // نُقل لفعاليّةٍ أخرى ⟵ ما ينتظر للقديمة يسقط
  await db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'cancelled', reason = 'نُقل لفعاليّةٍ أخرى'
    WHERE ref = ${ref} AND activity_id <> ${t.activityId} AND status = 'pending'`);

  let due = now() + (QUICK.includes(via) ? QUICK_MS : UNDO_MS);
  due = quietAdjust(due, t.act.date);
  const dueIso = new Date(due).toISOString();
  // موقع الاختبار لغير الموظّفين: صفٌّ «تُخطّي» بسببه — يظهر على صفّ المتابعة لا يُرسل
  const skipTest = mode === 'test' && !t.staffLinked;
  const status = skipTest ? 'skipped' : 'pending';
  const reason = skipTest ? 'موقع اختبار — يصل حسابات الموظّفين فقط' : '';

  const [existing] = rows(await db.execute(sql`SELECT id, status FROM reservation_confirm_jobs WHERE ref = ${ref} AND activity_id = ${t.activityId} LIMIT 1`));
  if (existing && (existing.status === 'sent' || existing.status === 'sending')) return { scheduled: false, reason: 'وصلته لهذه الفعاليّة من قبل' };
  if (existing && existing.status === 'pending') return { scheduled: true, reason: 'مهمّة قائمة' };
  if (existing) {
    await db.execute(sql`UPDATE reservation_confirm_jobs SET status = ${status}, reason = ${reason}, due_at = ${dueIso}::timestamptz,
        via = ${via}, staff_name = ${staffName}, attempts = 0, created_at = NOW() WHERE id = ${existing.id}`);
  } else {
    await db.execute(sql`INSERT INTO reservation_confirm_jobs (ref, reservation_id, member_id, activity_id, via, status, reason, due_at, staff_name)
      VALUES (${ref}, ${t.reservationId}, ${t.memberId}, ${t.activityId}, ${via}, ${status}, ${reason}, ${dueIso}::timestamptz, ${staffName})
      ON CONFLICT (ref, activity_id) DO NOTHING`);
  }
  if (skipTest) return { scheduled: false, reason };
  // 🔎 افحص الرقم الآن بصمت — النتيجة جاهزة لحظة الإرسال (لا محاولة لرقمٍ بلا واتساب)
  const local = normalizeLocalPhone(t.phone);
  if (local) { try { const { scheduleChecks } = await import('./wa-transport/number-check.js'); scheduleChecks([local]); } catch { /* تكميليّ */ } }
  kick();
  return { scheduled: true, dueAt: new Date(due) };
}

/** حجز متابعة صار مثبّتاً — من أيّ مدخل */
export async function scheduleReservationConfirm(reservationId: number, via: ConfirmVia, staffName = ''): Promise<ScheduleResult> {
  try { return await schedule(`res:${Number(reservationId)}`, via, staffName); }
  catch (e: any) { console.warn('⚠️ res-confirm schedule:', e?.message); return { scheduled: false, reason: e?.message }; }
}
/** صاحبٌ في «جيب صحابك» قبل الدعوة (القرار ٧) */
export async function scheduleMemberConfirm(memberId: number): Promise<ScheduleResult> {
  try { return await schedule(`mem:${Number(memberId)}`, 'member'); }
  catch (e: any) { console.warn('⚠️ res-confirm member:', e?.message); return { scheduled: false, reason: e?.message }; }
}
/** فكّ التثبيت أو الحذف خلال المهلة ⟵ لا رسالة */
export async function cancelReservationConfirm(reservationId: number, reason: string): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r = rows(await db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'cancelled', reason = ${reason}
    WHERE ref = ${`res:${Number(reservationId)}`} AND status = 'pending' RETURNING id`));
  return r.length;
}

// ══════════════════════════════════════════════════════
// 📤 الإرسال
// ══════════════════════════════════════════════════════
async function finish(id: number, status: string, patch: { reason?: string; channel?: string | null; waMessageId?: number | null } = {}) {
  const db = getDB(); if (!db) return null;
  const [r] = rows(await db.execute(sql`UPDATE reservation_confirm_jobs SET status = ${status}, reason = ${patch.reason ?? ''},
      channel = COALESCE(${patch.channel ?? null}, channel), wa_message_id = COALESCE(${patch.waMessageId ?? null}, wa_message_id),
      sent_at = CASE WHEN ${status} = 'sent' THEN NOW() ELSE sent_at END
    WHERE id = ${id} RETURNING *`));
  return r;
}

/** يعالج مهمّةً واحدة — كلّ مسارٍ ينتهي بحالةٍ نهائيّة (إلّا القفل المؤقّت فيُعاد بعد ربع ساعة) */
export async function processJob(job: any): Promise<any> {
  const db = getDB(); if (!db) return null;
  const id = Number(job.id);
  try {
    const t = await loadTarget(db, String(job.ref));
    if (!t) return finish(id, 'cancelled', { reason: 'الحجز حُذف' });
    if (t.activityId !== Number(job.activity_id)) return finish(id, 'cancelled', { reason: 'نُقل لفعاليّةٍ أخرى' });
    if (!t.confirmed) return finish(id, 'cancelled', { reason: 'لم يعد مثبّتاً' });
    const mode = await modeFor(t.loc.isTest);
    if (mode === 'off') return finish(id, 'skipped', { reason: 'أُطفئ من الداشبورد' });
    if (mode === 'test' && !t.staffLinked) return finish(id, 'skipped', { reason: 'موقع اختبار — يصل حسابات الموظّفين فقط' });
    if (t.act.status === 'cancelled') return finish(id, 'skipped', { reason: 'أُلغيت الفعاليّة' });
    if (new Date(t.act.date).getTime() <= now()) return finish(id, 'skipped', { reason: 'بدأت الفعاليّة' });
    if (t.manualSentAt) return finish(id, 'skipped', { reason: 'أُرسلت يدويّاً' });
    // أرسلها موظّفٌ يدويّاً وما زالت في طابور رقم الأعمال («أُرسلت» تُختم عند خروجها) ⟵ لا ثانية
    if (t.waMessageId) {
      const [m] = rows(await db.execute(sql`SELECT status, payload->>'kind' AS kind FROM wa_messages WHERE id = ${t.waMessageId} LIMIT 1`));
      if (m && m.status !== 'failed' && m.kind !== 'res_confirm') return finish(id, 'skipped', { reason: 'أُرسلت يدويّاً' });
    }

    // المحادثة نفسها إن وُجدت (ومنها محادثة البوت — ولو كان رقمها معرّفاً مستعاراً)، وإلّا الرقم
    const local = normalizeLocalPhone(t.phone);
    const [conv] = t.phone ? rows(await db.execute(sql`SELECT id FROM wa_conversations
      WHERE phone = ${t.phone} ${local ? sql`OR phone = ${local}` : sql``} ORDER BY last_message_at DESC NULLS LAST LIMIT 1`)) : [];
    if (!conv && !local) return finish(id, 'failed', { reason: 'لا رقم صالح' });
    // الشخص نفسه بصفّين للفعاليّة نفسها (صاحبٌ في مجموعة حجز من التطبيق أيضاً) ⟵ رسالةٌ واحدة
    const who = local || t.phone;
    await db.execute(sql`UPDATE reservation_confirm_jobs SET phone = ${who} WHERE id = ${id}`);
    const [dup] = rows(await db.execute(sql`SELECT 1 FROM reservation_confirm_jobs
      WHERE activity_id = ${t.activityId} AND phone = ${who} AND status = 'sent' AND id <> ${id} LIMIT 1`));
    if (dup) return finish(id, 'skipped', { reason: 'وصلت الرقمَ نفسه لهذه الفعاليّة' });
    if (local) {
      const { cachedChecks } = await import('./wa-transport/number-check.js');
      const ck = (await cachedChecks([local])).get(local);
      if (ck && ck.onWa === false) return finish(id, 'failed', { reason: 'الرقم بلا واتساب' });
    }

    const { text: tpl } = await getTemplate();
    const text = renderFor(t, tpl);
    const input = {
      ...(conv ? { conversationId: Number(conv.id) } : { phone: local! }),
      text, source: 'system', lane: 'timely', priority: 2, staffName: 'رسالة التثبيت',
      meta: { kind: 'res_confirm', resConfirmJob: id, staffName: AUTO_SENDER, ...(t.reservationId ? { reservationId: t.reservationId } : {}) },
    };
    const res: any = testHooks.send ? await testHooks.send(input) : await (await import('./whatsapp-inbox.service.js')).sendMessage(input as any);
    const mid = res?.message?.id ?? null;
    const channel = res?.message?.channel ?? null;
    if (t.reservationId) {
      await db.update(reservations).set({ waMessageId: mid } as any).where(eq(reservations.id, t.reservationId)).catch(() => {});
      // ميتا ترسل فوراً ⟵ «أُرسلت» الآن · رقم الأعمال ⟵ عند خروجها من الطابور (web.transport يقرأ reservationId)
      if (channel === 'cloud') { const { markReservationSent } = await import('./wa-outreach.service.js'); await markReservationSent(t.reservationId, AUTO_SENDER); }
    }
    return finish(id, 'sent', { channel, waMessageId: mid });
  } catch (e: any) {
    if (e?.code === 'SENDING_SUSPENDED' && Number(job.attempts || 0) < 8) {
      // قفلٌ مؤقّت على القناة — تُعاد لاحقاً لا تفشل
      await db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'pending', attempts = attempts + 1,
        due_at = NOW() + INTERVAL '15 minutes', reason = ${`الإرسال مقفل مؤقّتاً: ${String(e.message || '').slice(0, 160)}`} WHERE id = ${id}`);
      return null;
    }
    const reason = e?.code === 'CHANNEL_UNAVAILABLE' || e?.code === 'WINDOW_EXPIRED' ? 'لا قناة متاحة — رقم الأعمال غير متّصل ونافذة ميتا مغلقة'
      : (e?.message || 'فشل');
    console.warn(`⚠️ res-confirm job ${id}:`, reason);
    return finish(id, 'failed', { reason: String(reason).slice(0, 300) });
  }
}

// ── العامل ────────────────────────────────────────────
let busy = false;
let workerOn = false;
function kick(): void { if (workerOn) setTimeout(() => { void tick(); }, 50); }

export async function tick(): Promise<number> {
  if (busy) return 0;
  busy = true;
  let done = 0;
  try {
    const db = getDB(); if (!db) return 0;
    for (;;) {
      const [job] = rows(await db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'sending'
        WHERE id = (SELECT id FROM reservation_confirm_jobs WHERE status = 'pending' AND due_at <= ${new Date(now()).toISOString()}::timestamptz
                     ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`));
      if (!job) break;
      await processJob(job);
      done++;
    }
  } catch (e: any) { console.warn('⚠️ res-confirm tick:', e?.message); }
  finally { busy = false; }
  return done;
}

/** في عمليّة الخادم وحدها — السكربتات تجدول ولا ترسل */
export function startResConfirm(): void {
  workerOn = true;
  const db = getDB();
  // ما بقي «sending» من تشغيلٍ انقطع ⟵ يعود منتظراً
  if (db) db.execute(sql`UPDATE reservation_confirm_jobs SET status = 'pending' WHERE status = 'sending' AND created_at > NOW() - INTERVAL '2 days'`).catch(() => {});
  const t = setInterval(() => { void tick(); }, 5_000); t.unref?.();
  console.log('📋 reservation-confirm worker started');
}

// ══════════════════════════════════════════════════════
// 📊 الحالة — لصفوف المتابعة وبطاقة الداشبورد
// ══════════════════════════════════════════════════════
/** آخر مهمّة لكلّ حجز (للفعاليّة الحاليّة) — يُلحق بـGET /api/reservations */
export async function confirmJobsFor(reservationIds: number[]): Promise<Map<number, any>> {
  const out = new Map<number, any>();
  const db = getDB(); if (!db || !reservationIds.length) return out;
  const r = rows(await db.execute(sql`SELECT DISTINCT ON (j.reservation_id) j.reservation_id, j.status, j.reason, j.due_at, j.sent_at, j.via
    FROM reservation_confirm_jobs j JOIN reservations r ON r.id = j.reservation_id AND r.activity_id = j.activity_id
    WHERE j.reservation_id IN (${sql.join(reservationIds.map(i => sql`${i}`), sql`, `)})
    ORDER BY j.reservation_id, j.created_at DESC`));
  for (const x of r) out.set(Number(x.reservation_id), { status: x.status, reason: x.reason || '', dueAt: x.due_at, sentAt: x.sent_at, via: x.via });
  return out;
}

export async function resConfirmStatus(): Promise<any> {
  const db = getDB();
  const on = await resConfirmEnabled();
  const raw: any = db ? await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG}`) : null;
  const meta = rows(raw)[0]?.value || {};
  const [t] = db ? rows(await db.execute(sql`SELECT
      COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped
    FROM reservation_confirm_jobs WHERE created_at >= NOW() - INTERVAL '24 hours'`)) : [{}];
  const tpl = await getTemplate();
  return { enabled: on, by: meta.by || '', at: meta.at || null, last24h: t || {}, templateIsDefault: tpl.isDefault, testLocationAlwaysOn: true };
}
