// ══════════════════════════════════════════════════════
// 🕘 متابعة الوصول — «متى توصل؟» في صفحة متابعة الحجوزات
// ══════════════════════════════════════════════════════
// قواعد المالك (نهائيّة):
//   • «حضر» تُقرّره الآليّات القائمة وحدها (دخول الغرفة ← markArrivalAttended، صفحة الباب،
//     تعليم الموظّف). 🔴 لا سطرَ في هذا الملفّ يكتب attended = TRUE — البوت لا يُحضِر أحداً.
//   • الموظّف يسجّل موعد وصولٍ متوقّعاً، ويرسل رسالة متابعةٍ لمن لم يصل.
//   • الدون يقرأ الردّ: وقتٌ ⟵ يسجّله موعداً · اعتذار ⟵ زرّ تأكيد، والكتابة عند الضغط فقط.
//   • من اعتذر بالمتابعة يبقى عليه حكم الغياب (judgeNoShows) لكن بلا رسالة «حجزت وما حضرت».
//   • كلّ تغييرٍ من البوت أو الموظّف صفٌّ في reservation_events، وله تراجع.
//
// 🔴 الكتابة من نصّ العميل أدواتٌ حتميّة على **حجز المحادثة نفسها** للفعاليّة المُتابَعة:
//    المعرّف يُشتقّ هنا من رقم المحادثة/حسابها، ولا يُقبل معرّفٌ من النموذج أبداً،
//    وتُرفض في محادثةٍ رقمها غير ظاهر (phoneVerified === false).
//
// 🔴 رسالة المتابعة نصٌّ حرّ لا قائمةٌ مرقّمة: على رقم الأعمال يُترجَم الرقم المجرّد إلى
//    خيار قائمة (applyMenuReply) إن كانت للمحادثة قائمةٌ حيّة — فتُمحى القائمة القديمة
//    لحظة الإرسال كي يصل «9» إلى الدون نصّاً لا «الخيار التاسع».
// ══════════════════════════════════════════════════════

import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { reservations, reservationEvents, activities, locations, waConversations, waMessages, waOptouts } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { isConfirmedStatus } from '../lib/reservation-status.js';
import { normalizeAnyPhone } from '../utils/phone.util.js';
import { pickChannel } from './wa-transport/router.js';

export const STAFF_RESERVATIONS_ROOM = 'staff:reservations';
const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const iso = (d: any): string | null => { if (!d) return null; const t = new Date(d); return isNaN(t.getTime()) ? null : t.toISOString(); };
const sameMs = (a: any, b: any) => (a ? new Date(a).getTime() : 0) === (b ? new Date(b).getTime() : 0);

// ── الإعدادات ─────────────────────────────────────────
export interface ArrivalFollowupSettings {
  /** الدون يسجّل الموعد من ردّ العميل */
  botSetEta: boolean;
  /** الدون يعرض زرّ تأكيد الاعتذار ويسجّله عند الضغط */
  botDecline: boolean;
  /** تذكيرٌ لطيف بعد مضيّ هذا العدد من الدقائق على الموعد (0 = مطفأ) */
  lateReminderMinutes: number;
  /** متابعةٌ آليّة لمن لا موعد له بعد بدء الفعاليّة */
  autoEnabled: boolean;
  autoAfterMinutes: number;
  /** يدعم {الاسم} و{الفعاليّة} */
  template: string;
}

export const DEFAULT_ARRIVAL_TEMPLATE =
  'مسا الخير {الاسم} 🌙\nبدأنا {الفعاليّة} وبانتظارك. متى توصل تقريباً؟ اكتب لنا الوقت، وإذا ما رح تقدر تيجي خبّرنا.';

export const DEFAULT_ARRIVAL_FOLLOWUP: ArrivalFollowupSettings = {
  botSetEta: true,
  botDecline: true,
  lateReminderMinutes: 15,
  autoEnabled: false,          // يُنشر مطفأً — التفعيل قرارٌ واعٍ
  autoAfterMinutes: 20,
  template: DEFAULT_ARRIVAL_TEMPLATE,
};

const TEMPLATE_MAX = 1000;
function clampInt(v: any, min: number, max: number, fb: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
}

export function mergeArrivalFollowup(raw: any): ArrivalFollowupSettings {
  const d = DEFAULT_ARRIVAL_FOLLOWUP;
  const v = raw && typeof raw === 'object' ? raw : {};
  const tpl = typeof v.template === 'string' ? v.template.replace(/\r\n/g, '\n').trim().slice(0, TEMPLATE_MAX) : '';
  return {
    botSetEta: v.botSetEta != null ? !!v.botSetEta : d.botSetEta,
    botDecline: v.botDecline != null ? !!v.botDecline : d.botDecline,
    lateReminderMinutes: v.lateReminderMinutes != null ? clampInt(v.lateReminderMinutes, 0, 180, d.lateReminderMinutes) : d.lateReminderMinutes,
    autoEnabled: v.autoEnabled != null ? !!v.autoEnabled : d.autoEnabled,
    autoAfterMinutes: v.autoAfterMinutes != null ? clampInt(v.autoAfterMinutes, 5, 180, d.autoAfterMinutes) : d.autoAfterMinutes,
    template: tpl || d.template,
  };
}

export async function getArrivalSettings(): Promise<ArrivalFollowupSettings> {
  try {
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const s: any = await getBotSettings();
    return mergeArrivalFollowup(s?.arrivalFollowup);
  } catch { return DEFAULT_ARRIVAL_FOLLOWUP; }
}

export async function setArrivalSettings(patch: any, by: string): Promise<ArrivalFollowupSettings> {
  const cur = await getArrivalSettings();
  const next = mergeArrivalFollowup({ ...cur, ...(patch && typeof patch === 'object' ? patch : {}) });
  const { updateBotSettings } = await import('./whatsapp-bot.service.js');
  await updateBotSettings({ arrivalFollowup: next }, by);
  return next;
}

// ── صياغات ────────────────────────────────────────────
const firstName = (name: any) => String(name || '').trim().split(/\s+/)[0] || '';

export function renderFollowupText(tpl: string, v: { name: string; activity: string }): string {
  return String(tpl || DEFAULT_ARRIVAL_TEMPLATE)
    .replace(/\{الاسم\}/g, firstName(v.name) || 'ضيفنا')
    .replace(/\{الفعالي[ّ]?ة\}/g, v.activity)
    .replace(/[ \t]+\n/g, '\n').trim();
}

/** «9:30 م» بتوقيت عمّان (UTC+3 ثابتة) */
export function fmtClockJo(d: any): string {
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  const x = new Date(t + 3 * 3600e3);
  const h = x.getUTCHours(), m = x.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

// ── السوكِت والسجلّ ───────────────────────────────────
/** إشارة «تغيّر شيء في حجوزات هذه الفعاليّة» لمقابس الموظّفين الموثَّقين وحدهم */
export function emitReservationsChanged(activityId: number | null | undefined): void {
  try {
    const id = Number(activityId);
    if (!Number.isFinite(id) || id <= 0) return;
    const io = (global as any).io;
    if (io) io.to(STAFF_RESERVATIONS_ROOM).emit('reservations:changed', { activityId: id });
  } catch { /* البثّ ليس حرجاً */ }
}

export type ResEventKind = 'eta_set' | 'eta_cleared' | 'declined' | 'followup_sent' | 'needs_review' | 'late_reminder' | 'undo';
export type ResEventActor = 'bot' | 'staff' | 'system';

export async function logReservationEvent(e: {
  reservationId: number; activityId: number | null | undefined; actor: ResEventActor; actorName?: string;
  kind: ResEventKind; detail?: any; quote?: string | null;
}): Promise<number | null> {
  const db = getDB(); if (!db) return null;
  try {
    const [row] = await db.insert(reservationEvents).values({
      reservationId: e.reservationId,
      activityId: e.activityId ?? null,
      at: new Date(),            // من الخادم لا من افتراضيّ القاعدة — ليُقارَن بأعمدة الحجز المكتوبة بالطريقة نفسها
      actor: e.actor,
      actorName: String(e.actorName || '').slice(0, 100),
      kind: e.kind,
      detail: e.detail ?? {},
      quote: e.quote ? String(e.quote).slice(0, 1000) : null,
    } as any).returning({ id: reservationEvents.id });
    return row?.id ?? null;
  } catch (err: any) {
    console.warn('⚠️ reservation event log:', err?.message);
    return null;
  }
}

const UNDOABLE: ResEventKind[] = ['eta_set', 'eta_cleared', 'declined'];

/** هل ما زال الحجز على الحال التي تركه عليها هذا الحدث؟ (وإلّا فالتراجع يدهس تعديلاً أحدث) */
function stateMatches(ev: any, res: any): boolean {
  if (!res || res.deletedAt) return false;
  const after = (ev.detail as any)?.after || {};
  if (ev.kind === 'declined') return res.attended === false && !!res.declinedAt;
  if (ev.kind === 'eta_set' || ev.kind === 'eta_cleared') {
    if (res.attended === true) return false;
    return sameMs(res.etaAt, after.etaAt ?? null);
  }
  return false;
}

function eventText(ev: any, name: string): string {
  const who = String(ev.actorName || '').trim() || 'موظّف';
  const n = name || 'حاجز';
  const d: any = ev.detail || {};
  switch (ev.kind as ResEventKind) {
    case 'eta_set': {
      const at = d.after?.etaAt ? fmtClockJo(d.after.etaAt) : '';
      const back = d.before?.declinedAt ? ' (وتراجع عن اعتذاره)' : '';
      return ev.actor === 'bot'
        ? `الدون سجّل موعد وصول ${n}: ${at}${back}`
        : `${who} حدّد موعد وصول ${n}: ${at}`;
    }
    case 'eta_cleared': return `${who} مسح موعد وصول ${n}`;
    case 'declined':
      return d.after?.declinedVia === 'followup'
        ? `${n} اعتذر عن الحضور وأكّد بالزرّ`
        : `${who} علّم ${n} «لم يحضر»`;
    case 'followup_sent':
      return ev.actor === 'system' ? `أُرسلت متابعة الوصول آليّاً إلى ${n}` : `${who} أرسل متابعة الوصول إلى ${n}`;
    case 'needs_review': return `ردّ ${n} يحتاج مراجعة — لم يُسجَّل منه موعدٌ ولا اعتذار`;
    case 'late_reminder': return `أُرسل تذكيرٌ لطيف إلى ${n} بعد تأخّره عن موعده`;
    case 'undo':
      if (d.reason === 'arrived') return `${n} حضر فعلاً — أُلغي اعتذاره`;
      return `${who} تراجع عن ${d.ofKind === 'declined' ? 'اعتذار' : 'موعد وصول'} ${n}`;
    default: return '';
  }
}

export async function listReservationEvents(activityId: number, limit = 50) {
  const db = getDB(); if (!db) return [];
  const lim = Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), 200);
  const evs = await db.select().from(reservationEvents)
    .where(eq(reservationEvents.activityId, activityId))
    .orderBy(desc(reservationEvents.id)).limit(lim);
  const ids = [...new Set(evs.map(e => e.reservationId))];
  const resMap = new Map<number, any>();
  if (ids.length) {
    const rs = await db.select({
      id: reservations.id, contactName: reservations.contactName, etaAt: reservations.etaAt,
      attended: reservations.attended, declinedAt: reservations.declinedAt, deletedAt: reservations.deletedAt,
    }).from(reservations).where(inArray(reservations.id, ids));
    for (const r of rs) resMap.set(r.id, r);
  }
  return evs.map(ev => {
    const res = resMap.get(ev.reservationId);
    const name = String(res?.contactName || '').trim();
    const undone = !!ev.undoneAt;
    return {
      id: ev.id,
      at: iso(ev.at),
      actor: ev.actor,
      actorName: ev.actorName || '',
      reservationId: ev.reservationId,
      name,
      kind: ev.kind,
      text: eventText(ev, name),
      quote: ev.quote || null,
      undoable: !undone && UNDOABLE.includes(ev.kind as ResEventKind) && stateMatches(ev, res),
      undone,
    };
  });
}

/** علامة تسليم رسالة المتابعة لكلّ صفّ: queued | sent | delivered | read | failed | null */
export async function attachFollowupStatus(rows: any[]): Promise<void> {
  const db = getDB(); if (!db || !rows.length) return;
  const mids = [...new Set(rows.map(r => Number(r.followupMessageId)).filter(x => Number.isFinite(x) && x > 0))];
  const st = new Map<number, string>();
  if (mids.length) {
    const ms = await db.select({ id: waMessages.id, status: waMessages.status }).from(waMessages).where(inArray(waMessages.id, mids));
    for (const m of ms) st.set(m.id, String(m.status || ''));
  }
  for (const r of rows) {
    if (!r.followupSentAt) { r.followupStatus = null; continue; }
    const s = r.followupMessageId ? st.get(Number(r.followupMessageId)) : undefined;
    r.followupStatus = s === 'queued' || s === 'sending' ? 'queued'
      : s === 'delivered' || s === 'read' || s === 'failed' ? s
      : 'sent';
  }
}

// ══════════════════════════════════════════════════════
// التراجع
// ══════════════════════════════════════════════════════
export async function undoReservationEvent(eventId: number, staffName: string): Promise<{ ok: boolean; status?: number; error?: string; row?: any }> {
  const db = getDB(); if (!db) return { ok: false, status: 503, error: 'قاعدة البيانات غير متوفرة' };
  const [ev] = await db.select().from(reservationEvents).where(eq(reservationEvents.id, eventId)).limit(1);
  if (!ev) return { ok: false, status: 404, error: 'الإجراء غير موجود' };
  if (ev.undoneAt) return { ok: false, status: 409, error: 'سبق التراجع عن هذا الإجراء' };
  if (!UNDOABLE.includes(ev.kind as ResEventKind)) return { ok: false, status: 400, error: 'هذا الإجراء لا تراجعَ عنه' };
  const [res] = await db.select().from(reservations).where(eq(reservations.id, ev.reservationId)).limit(1);
  if (!res || res.deletedAt) return { ok: false, status: 404, error: 'الحجز غير موجود' };
  if (!stateMatches(ev, res)) return { ok: false, status: 409, error: 'تغيّر الحجز بعد هذا الإجراء — التراجع يدهس تعديلاً أحدث' };

  const before: any = (ev.detail as any)?.before || {};
  const patch: any = { updatedAt: new Date() };
  if ('etaAt' in before) patch.etaAt = before.etaAt ? new Date(before.etaAt) : null;
  if ('etaSource' in before) patch.etaSource = before.etaSource ?? null;
  if ('etaNote' in before) patch.etaNote = before.etaNote ?? null;
  // 🔴 التراجع عن فعلِ البوت لا يُحضِر أحداً أبداً. «حضر» تُستعاد فقط حين يتراجع موظّفٌ
  //    عن تعليم موظّف (حضر ⟵ لم يحضر خطأً) — وتعليم الموظّف آليّةُ حضورٍ قائمة.
  if ('attended' in before && (before.attended !== true || ev.actor === 'staff')) patch.attended = before.attended ?? null;
  if ('declinedAt' in before) patch.declinedAt = before.declinedAt ? new Date(before.declinedAt) : null;
  if ('declinedVia' in before) patch.declinedVia = before.declinedVia ?? null;

  // حجزُ التراجع أوّلاً (تحديثٌ مشروط) فلا ينفَّذ مرّتين بنقرتين
  const claimed = await db.update(reservationEvents).set({ undoneAt: new Date() } as any)
    .where(and(eq(reservationEvents.id, eventId), isNull(reservationEvents.undoneAt))).returning({ id: reservationEvents.id });
  if (!claimed.length) return { ok: false, status: 409, error: 'سبق التراجع عن هذا الإجراء' };

  const [row] = await db.update(reservations).set(patch).where(eq(reservations.id, res.id)).returning();
  await logReservationEvent({
    reservationId: res.id, activityId: res.activityId, actor: 'staff', actorName: staffName, kind: 'undo',
    detail: { ofEventId: ev.id, ofKind: ev.kind, restored: before }, quote: null,
  });
  const out: any = { ...row };
  await attachFollowupStatus([out]);
  emitReservationsChanged(res.activityId);
  return { ok: true, row: out };
}

// ══════════════════════════════════════════════════════
// المعاينة والإرسال
// ══════════════════════════════════════════════════════
export type FollowupGroup = 'silent' | 'late' | 'onway';
export interface FollowupRecipient {
  reservationId: number; name: string; phone: string; people: number;
  group: FollowupGroup; etaAt: string | null;
  reachable: boolean; channel: 'cloud' | 'web' | null; reason: string | null;
  /** إضافيّ: هل سيقرأ الدون ردَّه؟ (البوت مطفأ/موقوف لهذه المحادثة ⟵ الردّ يظهر «يحتاج مراجعة») */
  botActive: boolean;
  followupSentAt: string | null;
}
interface RecipientInternal extends FollowupRecipient { local: string | null; conversationId: number | null }

async function activityLite(activityId: number) {
  const db = getDB(); if (!db) return null;
  const [a] = await db.select({
    id: activities.id, name: activities.name, date: activities.date, status: activities.status,
    isTest: sql<boolean>`COALESCE(${locations.isTestLocation}, false)`,
  }).from(activities).leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt))).limit(1);
  return a ? { id: a.id, name: String(a.name || ''), date: a.date as Date, status: String(a.status || ''), isTest: !!a.isTest } : null;
}

async function buildRecipients(act: { id: number; isTest: boolean }, onlyIds?: number[]): Promise<RecipientInternal[]> {
  const db = getDB(); if (!db) return [];
  const { waEnabled, sendingSuspendedReason, isBotActive } = await import('./whatsapp-inbox.service.js');
  const conds: any[] = [
    eq(reservations.activityId, act.id), isNull(reservations.deletedAt),
    isNull(reservations.attended), isNull(reservations.declinedAt),
  ];
  if (onlyIds?.length) conds.push(inArray(reservations.id, onlyIds));
  const rows = (await db.select({
    id: reservations.id, name: reservations.contactName, phone: reservations.phone, playerPhone: players.phone,
    people: reservations.peopleCount, status: reservations.status,
    etaAt: reservations.etaAt, followupSentAt: reservations.followupSentAt,
  }).from(reservations).leftJoin(players, eq(reservations.playerId, players.id))
    .where(and(...conds)).orderBy(reservations.id))
    .filter(r => isConfirmedStatus(r.status));

  const norms = rows.map(r => normalizeAnyPhone(String(r.phone || '').trim() || String(r.playerPhone || '')));
  const locals = [...new Set(norms.map(n => n?.local).filter(Boolean) as string[])];
  const convs = new Map<string, any>();
  const opted = new Set<string>();
  if (locals.length) {
    for (const c of await db.select().from(waConversations).where(inArray(waConversations.phone, locals))) convs.set(String((c as any).phone), c);
    for (const o of await db.select({ phone: waOptouts.phone }).from(waOptouts).where(inArray(waOptouts.phone, locals))) opted.add(String(o.phone));
  }
  const enabled = waEnabled();
  const now = Date.now();
  return rows.map((r, i) => {
    const norm = norms[i];
    const eta = r.etaAt ? new Date(r.etaAt as any) : null;
    const group: FollowupGroup = !eta ? 'silent' : eta.getTime() < now ? 'late' : 'onway';
    const base: RecipientInternal = {
      reservationId: r.id, name: String(r.name || '').trim(), phone: norm?.local || String(r.phone || ''),
      people: Math.max(1, Number(r.people || 1)), group, etaAt: iso(eta),
      reachable: false, channel: null, reason: null, botActive: false,
      followupSentAt: iso(r.followupSentAt), local: norm?.local || null, conversationId: null,
    };
    if (!norm) return { ...base, reason: 'رقم الهاتف غير صالح أو غير مسجّل' };
    const conv = convs.get(norm.local);
    base.conversationId = conv?.id ?? null;
    base.botActive = conv ? isBotActive(conv) : true;
    if (act.isTest) return { ...base, reason: 'موقع اختبار — لا يصله واتساب' };
    if (!enabled) return { ...base, reason: 'إرسال واتساب غير مفعّل' };
    if (opted.has(norm.local)) return { ...base, reason: 'طلب إيقاف الرسائل' };
    const pick = conv
      ? pickChannel(conv, 'timely')
      : pickChannel({ id: 0, phone: norm.local, waPhone: norm.wa, channel: 'web', cloudLastInboundAt: null, lastInboundAt: null }, 'timely');
    if (!pick.channel) {
      return {
        ...base,
        reason: !conv ? 'لا محادثة واتساب مع هذا الرقم'
          : pick.code === 'WINDOW_EXPIRED' ? 'نافذة الـ24 ساعة مغلقة — لم يراسلنا مؤخّراً'
          : 'نافذة ميتا مغلقة ورقم الأعمال غير متاح الآن',
      };
    }
    const locked = sendingSuspendedReason(pick.channel);
    if (locked) return { ...base, channel: pick.channel, reason: `الإرسال مقفل: ${locked}` };
    return { ...base, reachable: true, channel: pick.channel };
  });
}

const publicRecipient = ({ local: _l, conversationId: _c, ...r }: RecipientInternal): FollowupRecipient => r;

export async function previewFollowup(activityId: number) {
  const act = await activityLite(activityId);
  if (!act) return null;
  const cfg = await getArrivalSettings();
  const rec = await buildRecipients(act);
  const firstOk = rec.find(r => r.reachable) || rec[0];
  return {
    text: cfg.template,
    sample: firstOk ? renderFollowupText(cfg.template, { name: firstOk.name, activity: act.name }) : renderFollowupText(cfg.template, { name: '', activity: act.name }),
    activity: { id: act.id, name: act.name, date: iso(act.date) },
    recipients: rec.map(publicRecipient),
  };
}

const RESEND_GUARD_MS = 10 * 60e3;
const CLOUD_GAP_MS = 350;

export async function sendArrivalFollowup(input: {
  activityId: number; reservationIds: number[]; text?: string | null; force?: boolean;
  actor: 'staff' | 'system'; staffId?: number; staffName: string;
}): Promise<{ sent: number; skipped: Array<{ reservationId: number; reason: string }> }> {
  const db = getDB(); if (!db) throw new Error('قاعدة البيانات غير متوفرة');
  const act = await activityLite(input.activityId);
  if (!act) throw Object.assign(new Error('الفعاليّة غير موجودة'), { status: 404 });
  const ids = [...new Set((input.reservationIds || []).map(Number).filter(x => Number.isFinite(x) && x > 0))].slice(0, 300);
  const skipped: Array<{ reservationId: number; reason: string }> = [];
  if (!ids.length) return { sent: 0, skipped };

  const cfg = await getArrivalSettings();
  const tpl = String(input.text || '').replace(/\r\n/g, '\n').trim().slice(0, TEMPLATE_MAX) || cfg.template;
  const rec = new Map((await buildRecipients(act, ids)).map(r => [r.reservationId, r]));
  const { sendMessage, isUnreachable } = await import('./whatsapp-inbox.service.js');
  const seenPhones = new Set<string>();
  let sent = 0;

  for (const id of ids) {
    const r = rec.get(id);
    if (!r) { skipped.push({ reservationId: id, reason: 'الحجز غير مؤهّل للمتابعة (حضر أو اعتذر أو غير مثبّت أو ليس من هذه الفعاليّة)' }); continue; }
    if (!r.reachable || !r.local) { skipped.push({ reservationId: id, reason: r.reason || 'لا يمكن الوصول إليه' }); continue; }
    if (seenPhones.has(r.local)) { skipped.push({ reservationId: id, reason: 'الرقم نفسه على حجزٍ آخر أُرسلت له الرسالة' }); continue; }
    const prevSent = r.followupSentAt ? new Date(r.followupSentAt) : null;
    if (!input.force && prevSent && Date.now() - prevSent.getTime() < RESEND_GUARD_MS) {
      skipped.push({ reservationId: id, reason: 'أُرسلت له متابعة قبل أقلّ من 10 دقائق' }); continue;
    }
    // 🔒 حجزُ الدور قبل الإرسال (تحديثٌ مشروط): نقرتان متزامنتان لا ترسلان رسالتين
    const stamp = new Date();
    const claim = await db.update(reservations).set({ followupSentAt: stamp } as any)
      .where(and(
        eq(reservations.id, id), isNull(reservations.attended), isNull(reservations.declinedAt), isNull(reservations.deletedAt),
        input.force ? sql`TRUE` : or(isNull(reservations.followupSentAt), lt(reservations.followupSentAt, new Date(stamp.getTime() - RESEND_GUARD_MS))),
      )).returning({ id: reservations.id });
    if (!claim.length) { skipped.push({ reservationId: id, reason: 'تغيّرت حالة الحجز أو أُرسلت له متابعة للتوّ' }); continue; }

    const text = renderFollowupText(tpl, { name: r.name, activity: act.name });
    try {
      const out: any = await sendMessage({
        ...(r.conversationId ? { conversationId: r.conversationId } : { phone: r.local }),
        text,
        // outreach: رسالةُ موظّفٍ من صفحة الحجوزات لا توقف البوت — وهو من سيقرأ الردّ
        source: input.actor === 'staff' ? 'outreach' : 'system',
        lane: 'timely', priority: 2,
        staffId: input.staffId, staffName: input.staffName,
        // 🔴 ليس `reservationId`: ذاك المفتاح يجعل طابور رقم الأعمال يضبط wa_sent_at (رسالة التثبيت)
        meta: { arrivalFollowup: act.id, arrivalReservationId: id, staffName: input.staffName },
      });
      const mid = out?.message?.id ?? null;
      const channel = out?.message?.channel === 'web' ? 'web' : 'cloud';
      await db.update(reservations).set({ followupMessageId: mid } as any).where(eq(reservations.id, id));
      // رقم الأعمال: قائمةٌ قديمة حيّة كانت ستبتلع «9» كخيارٍ تاسع — تُمحى ليصل الردّ نصّاً
      if (channel === 'web') {
        try {
          const { deleteAux } = await import('../config/redis.js');
          const { menuKey } = await import('./wa-transport/menu-emulation.js');
          await deleteAux(`wamenu:${menuKey(r.local)}`);
        } catch { /* تكميليّ */ }
      }
      await logReservationEvent({
        reservationId: id, activityId: act.id, actor: input.actor, actorName: input.staffName, kind: 'followup_sent',
        detail: { messageId: mid, channel, group: r.group, resend: !!prevSent }, quote: null,
      });
      seenPhones.add(r.local);
      sent++;
      if (channel === 'cloud') await new Promise(x => setTimeout(x, CLOUD_GAP_MS));
    } catch (e: any) {
      // لم تخرج ⟵ يُعاد الختم كما كان، فلا يظهر «أُرسلت» لرسالةٍ لم تُرسل
      await db.update(reservations).set({ followupSentAt: prevSent } as any).where(eq(reservations.id, id)).catch(() => {});
      skipped.push({ reservationId: id, reason: isUnreachable(e) ? (e?.message || 'لا قناة متاحة') : `تعذّر الإرسال: ${String(e?.message || e).slice(0, 160)}` });
      if (e?.code === 'SENDING_SUSPENDED') {
        for (const rest of ids.slice(ids.indexOf(id) + 1)) skipped.push({ reservationId: rest, reason: 'الإرسال مقفل' });
        break;
      }
    }
  }
  if (sent) {
    emitReservationsChanged(act.id);
    console.log(`🕘 arrival follow-up «${act.name}» #${act.id}: sent=${sent} skipped=${skipped.length} by ${input.staffName}`);
  }
  return { sent, skipped };
}

// ══════════════════════════════════════════════════════
// كتابات الموظّف (PUT /api/reservations/:id)
// ══════════════════════════════════════════════════════
/**
 * يحسب ما يضيفه PUT على التحديث من حقول الموعد والاعتذار، وما يُسجَّل بعد نجاحه.
 * يرمي {status:400} إن كان etaAt غير صالح.
 */
export function staffArrivalPatch(existing: any, body: any): { updates: any; events: Array<{ kind: ResEventKind; detail: any }> } {
  const updates: any = {};
  const events: Array<{ kind: ResEventKind; detail: any }> = [];
  const etaBefore = { etaAt: iso(existing.etaAt), etaSource: existing.etaSource ?? null, etaNote: existing.etaNote ?? null };

  if (body?.etaAt !== undefined) {
    if (body.etaAt === null || body.etaAt === '') {
      if (existing.etaAt) {
        updates.etaAt = null; updates.etaSource = null; updates.etaNote = null;
        events.push({ kind: 'eta_cleared', detail: { before: etaBefore, after: { etaAt: null, etaSource: null, etaNote: null } } });
      }
    } else {
      const d = new Date(body.etaAt);
      if (isNaN(d.getTime())) throw Object.assign(new Error('موعد الوصول غير صالح'), { status: 400 });
      if (sameMs(existing.etaAt, d)) {
        // الوقت نفسه (نموذج تعديلٍ أعاد إرسال الصفّ): لا يُنسب موعدُ البوت للموظّف ولا يُسجَّل حدث
        if (body.etaNote !== undefined) updates.etaNote = String(body.etaNote ?? '').trim().slice(0, 500) || null;
      } else {
        const note = body.etaNote !== undefined ? (String(body.etaNote ?? '').trim().slice(0, 500) || null) : null;
        updates.etaAt = d; updates.etaSource = 'staff'; updates.etaNote = note;
        events.push({ kind: 'eta_set', detail: { before: etaBefore, after: { etaAt: d.toISOString(), etaSource: 'staff', etaNote: note } } });
      }
    }
  } else if (body?.etaNote !== undefined && existing.etaAt) {
    updates.etaNote = String(body.etaNote ?? '').trim().slice(0, 500) || null;   // ملاحظةٌ فقط — لا حدث
  }

  if (body?.attended !== undefined) {
    const declBefore = { attended: existing.attended ?? null, declinedAt: iso(existing.declinedAt), declinedVia: existing.declinedVia ?? null };
    if (body.attended === false) {
      // «لم يحضر» من الموظّف: يُنسب إليه فقط إن لم يُنسب قبلاً (اعتذار المتابعة يبقى منسوباً لصاحبه)
      //    وعند الانتقال فقط: نموذجُ تعديلٍ يعيد إرسال attended=false لا يَسِم غياباً حكم به النظام.
      if (existing.attended !== false) {
        if (!existing.declinedVia) { updates.declinedVia = 'staff'; updates.declinedAt = new Date(); }
        events.push({ kind: 'declined', detail: { before: declBefore, after: { attended: false, declinedAt: iso(updates.declinedAt ?? existing.declinedAt), declinedVia: updates.declinedVia ?? existing.declinedVia } } });
      }
    } else if (body.attended === null && (existing.declinedAt || existing.declinedVia)) {
      // أعاده الموظّف إلى «لم يُحدَّد» ⟵ لا يبقى موسوماً معتذراً (وإلّا خرج من قائمة المتابعة بلا سبب ظاهر)
      updates.declinedAt = null; updates.declinedVia = null;
    }
    // attended === true: لا يمسّ شيئاً آخر (العقد)
  }
  return { updates, events };
}

// ══════════════════════════════════════════════════════
// الحضور الفعليّ بعد اعتذار (يُنادى من markArrivalAttended)
// ══════════════════════════════════════════════════════
export async function onArrivalMarked(activityId: number, rows: Array<{ id: number; declinedAt?: string | null; declinedVia?: string | null }>): Promise<void> {
  if (!rows.length) return;
  const db = getDB();
  for (const r of rows) {
    if (!r.declinedAt && !r.declinedVia) continue;
    try {
      await logReservationEvent({
        reservationId: Number(r.id), activityId, actor: 'system', actorName: 'النظام', kind: 'undo',
        detail: { reason: 'arrived', before: { attended: false, declinedAt: r.declinedAt ?? null, declinedVia: r.declinedVia ?? null }, after: { attended: true, declinedAt: null, declinedVia: null } },
      });
      // اعتذارٌ أبطله الحضور لا يبقى قابلاً للتراجع
      if (db) await db.update(reservationEvents).set({ undoneAt: new Date() } as any)
        .where(and(eq(reservationEvents.reservationId, Number(r.id)), eq(reservationEvents.kind, 'declined'), isNull(reservationEvents.undoneAt)));
    } catch (e: any) { console.warn('⚠️ arrival-after-decline log:', e?.message); }
  }
  emitReservationsChanged(activityId);
}

// ══════════════════════════════════════════════════════
// 🤖 الدون: السياق والأدوات والزرّ
// ══════════════════════════════════════════════════════
const ARRIVAL_TOOLS = new Set(['set_arrival_eta', 'decline_attendance', 'flag_arrival_reply']);
const DECLINE_TTL_MS = 30 * 60e3;

interface FollowupCtx { res: any; activityName: string; activityDate: Date }

/**
 * حجزُ **هذه المحادثة** الذي سُئل صاحبه «متى توصل؟» خلال آخر ٦ ساعات، لفعاليّةٍ بدايتها
 * ضمن [−٨ ساعات، +٣ ساعات] من الآن. المطابقة بحساب المحادثة أو بآخر تسعة أرقام من رقمها.
 */
async function activeFollowup(conv: any): Promise<FollowupCtx | null> {
  const db = getDB();
  if (!db || !conv?.id || conv.phoneVerified === false) return null;
  const digits = String(conv.phone || '').startsWith('lid:') ? '' : String(conv.phone || '').replace(/\D/g, '');
  const tail = digits.length >= 9 ? digits.slice(-9) : '';
  const pid = Number(conv.playerId) > 0 ? Number(conv.playerId) : null;
  if (!tail && !pid) return null;
  const now = Date.now();
  const since6h = new Date(now - 6 * 3600e3).toISOString();
  const rows = await db.select({ res: reservations, activityName: activities.name, activityDate: activities.date })
    .from(reservations).innerJoin(activities, eq(reservations.activityId, activities.id))
    .where(and(
      isNull(reservations.deletedAt), isNull(activities.deletedAt),
      sql`${reservations.attended} IS DISTINCT FROM TRUE`,
      gt(activities.date, new Date(now - 8 * 3600e3)), lt(activities.date, new Date(now + 3 * 3600e3)),
      // 🔴 التاريخ يُمرَّر نصّاً ISO مصبوباً لا كائن Date: داخل sql`` لا يمرّ بمحوّل العمود،
      //    فيُسلسله المشغّل بتوقيت العمليّة المحلّيّ لا UTC.
      sql`(${reservations.followupSentAt} > ${since6h}::timestamp
           OR EXISTS (SELECT 1 FROM reservation_events e WHERE e.reservation_id = "reservations"."id" AND e.kind = 'late_reminder' AND e.at > ${since6h}::timestamp))`,
      sql`((${tail} <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(${reservations.phone}, ''), '\\D', '', 'g'), 9) = ${tail})
           OR (${pid}::int IS NOT NULL AND ${reservations.playerId} = ${pid}::int))`,
    ))
    .orderBy(sql`${reservations.followupSentAt} DESC NULLS LAST`, desc(reservations.id)).limit(1);
  const r = rows[0];
  return r ? { res: r.res, activityName: String(r.activityName || ''), activityDate: r.activityDate as Date } : null;
}

export async function arrivalCardLine(conv: any): Promise<string> {
  const ctx = await activeFollowup(conv);
  if (!ctx) return '';
  const cfg = await getArrivalSettings();
  const res = ctx.res;
  const parts: string[] = [`🕘 متابعة الوصول: سُئل هذا العميل قبل قليل متى سيصل إلى «${ctx.activityName}» (بدايتها ${fmtClockJo(ctx.activityDate)}).`];
  if (res.attended === false && res.declinedAt) parts.push('سبق أن اعتذر عن الحضور وأكّد. إن قال الآن إنّه قادم وذكر وقتاً فاستدعِ set_arrival_eta.');
  else if (res.etaAt) parts.push(`موعده المسجّل حاليّاً: ${fmtClockJo(res.etaAt)} — إن ذكر وقتاً جديداً حدّثه.`);
  parts.push(cfg.botSetEta
    ? 'إن ذكر وقتاً أو مدّة («بعد ربع ساعة»، «عالتسعة») ⟵ استدعِ set_arrival_eta (minutes للمدّة أو clock للساعة).'
    : 'إن ذكر وقتاً ⟵ استدعِ flag_arrival_reply ليراه الموظّفون (تسجيل الموعد آليّاً مطفأ)، وقل له إنّك بلّغت الفريق.');
  parts.push(cfg.botDecline
    ? 'إن قال إنّه لن يحضر ⟵ استدعِ decline_attendance: ترسل له زرّ تأكيد، والاعتذار لا يُسجَّل إلا بعد ضغطه — فلا تقل إنّ حجزه أُلغي ولا إنّ اعتذاره سُجّل.'
    : 'إن قال إنّه لن يحضر ⟵ استدعِ flag_arrival_reply ليراه الموظّفون، وقل له إنّك بلّغت الفريق — لا تقل إنّ حجزه أُلغي.');
  parts.push('إن ردّ على السؤال بما لا يُفهم منه وقتٌ ولا اعتذار ⟵ استدعِ flag_arrival_reply ثمّ أجبه طبيعيّاً.');
  parts.push('⛔ لا تقل له أبداً إنّه سُجّل «حاضراً» أو «وصل» — الحضور يُسجَّل عند دخوله الفعاليّة فقط، وليس من شأنك.');
  return parts.join(' ');
}

export async function arrivalToolDeclarations(conv: any): Promise<any[]> {
  const ctx = await activeFollowup(conv);
  if (!ctx) return [];
  const cfg = await getArrivalSettings();
  const d: any[] = [];
  if (cfg.botSetEta) d.push({
    name: 'set_arrival_eta',
    description: 'تسجيل موعد الوصول المتوقّع الذي ذكره العميل ردّاً على سؤال «متى توصل؟» — على حجزه هو للفعاليّة المُتابَعة. مرّر **واحداً فقط**: minutes («بعد ربع ساعة» ⟵ 15) أو clock («عالتسعة ونص» ⟵ "9:30"). لا تسجّل حضوراً ولا تقل له إنّه حضر.',
    parameters: {
      type: 'OBJECT',
      properties: {
        minutes: { type: 'NUMBER', description: 'بعد كم دقيقة من الآن يصل (0–360)' },
        clock: { type: 'STRING', description: 'الساعة التي ذكرها بصيغة HH:MM بتوقيت الأردن (مثل "21:15" أو "9:15")' },
      },
      required: [],
    },
  });
  if (cfg.botDecline) d.push({
    name: 'decline_attendance',
    description: 'عندما يقول العميل إنّه لن يحضر الفعاليّة التي سُئل عن وصوله إليها. ترسل له زرّي تأكيد («أكّد: ما رح أحضر» / «لا، جاي») — الاعتذار يُسجَّل آليّاً بعد ضغطه فقط. بعدها اكتب جملة قصيرة جداً ولا تقل إنّ الحجز أُلغي.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  d.push({
    name: 'flag_arrival_reply',
    description: 'عندما يردّ العميل على سؤال «متى توصل؟» بما لا يُفهم منه وقتٌ ولا اعتذار واضح (أو يطلب شيئاً يحتاج موظّفاً). تسجّل ردّه ليراه الموظّفون في صفحة الحجوزات. ثمّ أجبه طبيعيّاً.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  return d;
}

async function lastCustomerText(convId: number): Promise<string> {
  const db = getDB(); if (!db) return '';
  const [m] = await db.select({ body: waMessages.body }).from(waMessages)
    .where(and(eq(waMessages.conversationId, convId), eq(waMessages.direction, 'in')))
    .orderBy(desc(waMessages.createdAt), desc(waMessages.id)).limit(1);
  return String(m?.body || '').trim().slice(0, 1000);
}

const latinDigits = (s: string) => s.replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch))).replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)));

/** minutes أو clock ⟵ لحظةٌ مطلقة (عمّان UTC+3). تُرفض إن بعدت أكثر من ٦ ساعات أو مضت بأكثر من ٥ دقائق. */
export function resolveEta(args: any, nowMs = Date.now()): { at: Date } | { error: string } {
  const hasMin = args?.minutes !== undefined && args?.minutes !== null && String(args.minutes).trim() !== '';
  const hasClock = typeof args?.clock === 'string' ? args.clock.trim() !== '' : args?.clock != null;
  if (hasMin === hasClock) return { error: 'مرّر واحداً فقط: minutes (مدّة) أو clock (ساعة) — لا الاثنين ولا لا شيء.' };
  const MAX = 6 * 3600e3, PAST = 5 * 60e3;
  if (hasMin) {
    const n = Number(latinDigits(String(args.minutes)));
    if (!Number.isFinite(n) || n < 0 || n > 360) return { error: 'المدّة خارج المدى (حتى 6 ساعات) — اسأله متى يصل تقريباً.' };
    return { at: new Date(nowMs + Math.round(n) * 60e3) };
  }
  const m = /^(\d{1,2})(?:[:.٫](\d{1,2}))?$/.exec(latinDigits(String(args.clock)).trim());
  if (!m) return { error: 'صيغة الساعة غير مفهومة — المطلوب HH:MM.' };
  const h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || mi > 59) return { error: 'ساعةٌ غير صالحة — اسأله أن يوضّح.' };
  // «عالتسعة» في أمسيةٍ تعني ٩ مساءً: ساعةٌ ≤١٢ تُجرَّب صباحاً ومساءً ويؤخذ أقرب موعدٍ قادم
  const hours = h >= 13 || h === 0 ? [h] : [h % 12, (h % 12) + 12];
  const jo = new Date(nowMs + 3 * 3600e3);
  const midnight = Date.UTC(jo.getUTCFullYear(), jo.getUTCMonth(), jo.getUTCDate()) - 3 * 3600e3;
  const cands: number[] = [];
  for (const day of [0, 1]) for (const hh of hours) cands.push(midnight + day * 86400e3 + (hh * 60 + mi) * 60e3);
  const ok = cands.filter(t => t >= nowMs - PAST && t <= nowMs + MAX).sort((a, b) => a - b);
  if (!ok.length) return { error: 'الوقت المذكور مضى أو يبعد أكثر من 6 ساعات — اسأله أن يوضّح متى يصل تقريباً.' };
  return { at: new Date(ok[0]) };
}

async function flagNeedsReview(ctx: FollowupCtx, quote: string, actor: ResEventActor, why?: string): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const res = ctx.res;
  // مرّةً لكلّ ردّ: النصّ نفسه بعد آخر متابعة لا يُسجَّل مرّتين
  const since = res.followupSentAt ? new Date(res.followupSentAt) : new Date(Date.now() - 6 * 3600e3);
  const dup = await db.select({ id: reservationEvents.id }).from(reservationEvents)
    .where(and(eq(reservationEvents.reservationId, res.id), eq(reservationEvents.kind, 'needs_review'),
      gt(reservationEvents.at, since), sql`COALESCE(${reservationEvents.quote}, '') = ${quote || ''}`)).limit(1);
  if (dup.length) return false;
  await logReservationEvent({ reservationId: res.id, activityId: res.activityId, actor, actorName: actor === 'bot' ? 'الدون' : 'النظام', kind: 'needs_review', detail: why ? { why } : {}, quote });
  emitReservationsChanged(res.activityId);
  return true;
}

/** undefined = ليست من أدواتنا (يكمل execTool إلى غيرها) */
export async function execArrivalTool(name: string, args: any, tctx: { conv: any; dryRun: boolean; interactives: any[] }): Promise<any | undefined> {
  if (!ARRIVAL_TOOLS.has(name)) return undefined;
  const db = getDB(); if (!db) return { error: 'DB unavailable' };
  const conv = tctx.conv;
  if (tctx.dryRun) return { dryRun: true, note: 'ساحة الاختبار: لا كتابة ولا إرسال.' };
  if (conv?.phoneVerified === false) return { error: 'رقم هذه المحادثة غير ظاهر لنا بعد — لا يمكن تنفيذ عملٍ على حجز.' };
  const ctx = await activeFollowup(conv);
  if (!ctx) return { error: 'لا متابعة وصول قائمة لهذا العميل الآن — لا شيء يُسجَّل. أجبه طبيعيّاً.' };
  const cfg = await getArrivalSettings();
  const res = ctx.res;
  const quote = await lastCustomerText(conv.id);

  if (name === 'flag_arrival_reply') {
    await flagNeedsReview(ctx, quote, 'bot');
    return { flagged: true, note: 'سُجّل ردّه ليراه الموظّفون. أجبه طبيعيّاً — لا تقل إنّ موعداً أو اعتذاراً سُجّل.' };
  }

  if (name === 'set_arrival_eta') {
    if (!cfg.botSetEta) {
      await flagNeedsReview(ctx, quote, 'bot', 'botSetEta_off');
      return { saved: false, note: 'تسجيل الموعد آليّاً مطفأ — سُجّل ردّه ليراه الموظّفون. قل له إنّك بلّغت الفريق.' };
    }
    const staffDeclined = res.attended === false && res.declinedVia !== 'followup';
    if (staffDeclined) {
      await flagNeedsReview(ctx, quote, 'bot', 'marked_absent_by_staff');
      return { saved: false, note: 'حجزه معلَّم من الإدارة — لم يُسجَّل شيء آليّاً، وسُجّل ردّه ليراه الموظّفون. قل له إنّك بلّغت الفريق.' };
    }
    const eta = resolveEta(args);
    if ('error' in eta) return { error: eta.error };
    const reviving = res.attended === false && res.declinedVia === 'followup';
    const before: any = { etaAt: iso(res.etaAt), etaSource: res.etaSource ?? null, etaNote: res.etaNote ?? null };
    const after: any = { etaAt: eta.at.toISOString(), etaSource: 'bot', etaNote: quote || null };
    const patch: any = { etaAt: eta.at, etaSource: 'bot', etaNote: quote || null, updatedAt: new Date() };
    if (reviving) {
      // اعتذر ثمّ قال «جاي»: يعود «لم يُحدَّد» (لا «حضر») ويُمحى اعتذاره — والتراجع يعيد الاثنين
      Object.assign(before, { attended: false, declinedAt: iso(res.declinedAt), declinedVia: res.declinedVia });
      Object.assign(after, { attended: null, declinedAt: null, declinedVia: null });
      Object.assign(patch, { attended: null, declinedAt: null, declinedVia: null });
    }
    const upd = await db.update(reservations).set(patch)
      .where(and(eq(reservations.id, res.id), isNull(reservations.deletedAt), sql`${reservations.attended} IS DISTINCT FROM TRUE`))
      .returning({ id: reservations.id });
    if (!upd.length) return { saved: false, note: 'لا حاجة لتسجيل موعد لهذا الحجز الآن. أجبه طبيعيّاً ولا تذكر له شيئاً عن حالة حضوره.' };
    if (reviving) await db.update(reservationEvents).set({ undoneAt: new Date() } as any)
      .where(and(eq(reservationEvents.reservationId, res.id), eq(reservationEvents.kind, 'declined'), isNull(reservationEvents.undoneAt)));
    await logReservationEvent({ reservationId: res.id, activityId: res.activityId, actor: 'bot', actorName: 'الدون', kind: 'eta_set', detail: { before, after }, quote });
    emitReservationsChanged(res.activityId);
    return { saved: true, eta: fmtClockJo(eta.at), note: 'سُجّل موعد وصوله المتوقّع. أكّد له بجملة قصيرة («تمام، بانتظارك») — ولا تقل إنّه سُجّل حاضراً.' };
  }

  // decline_attendance
  if (!cfg.botDecline) {
    await flagNeedsReview(ctx, quote, 'bot', 'botDecline_off');
    return { sent: false, note: 'تأكيد الاعتذار آليّاً مطفأ — سُجّل ردّه ليراه الموظّفون. قل له إنّك بلّغت الفريق، ولا تقل إنّ حجزه أُلغي.' };
  }
  if (res.attended === false) return { sent: false, note: 'اعتذاره/غيابه مسجّل سابقاً — لا حاجة لزرّ جديد. أجبه بلطف.' };
  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  const { setAux } = await import('../config/redis.js');
  await setAux(`arr-decline:${conv.id}`, { reservationId: res.id, quote, expiresAt: Date.now() + DECLINE_TTL_MS });
  await sendMessage({
    conversationId: conv.id,
    interactive: {
      type: 'button',
      body: { text: `بدّك تعتذر عن حضور «${ctx.activityName}»؟ أكّد لنا حتى نرتّب المقاعد 🙏` },
      action: { buttons: [
        { type: 'reply', reply: { id: `arrno:${res.id}`, title: 'أكّد: ما رح أحضر' } },
        { type: 'reply', reply: { id: `arryes:${res.id}`, title: 'لا، جاي' } },
      ] },
    },
    source: 'bot',
  });
  tctx.interactives.push({ kind: 'buttons', preview: 'تأكيد الاعتذار عن الحضور' });
  return { sent: true, note: 'أُرسل زرّ التأكيد — الاعتذار لا يُسجَّل إلا بعد ضغطه. اكتب جملة قصيرة جداً فقط، ولا تقل إنّ الحجز أُلغي أو إنّ الاعتذار سُجّل.' };
}

/** ضغطة «أكّد: ما رح أحضر» / «لا، جاي» — حتميّة. true = عولجت. */
export async function handleArrivalButton(conv: any, btnId: string): Promise<boolean> {
  const m = /^arr(no|yes):(\d+)$/.exec(btnId || '');
  if (!m) return false;
  const db = getDB(); if (!db) return false;
  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  const { getAux, deleteAux } = await import('../config/redis.js');
  const say = (text: string) => sendMessage({ conversationId: conv.id, text, source: 'bot' }).catch(() => {});
  const key = `arr-decline:${conv.id}`;
  const resId = Number(m[2]);

  if (m[1] === 'yes') {
    await deleteAux(key).catch(() => {});
    await say('تمام 👌 بانتظارك — متى توصل تقريباً؟');
    return true;
  }

  const expired = 'انتهت صلاحيّة التأكيد 🙏 إذا ما رح تقدر تيجي خبّرني كمان مرّة.';
  if (conv?.phoneVerified === false) { await say('ما بقدر أسجّل اعتذارك من هذا الرقم — راسلنا من رقمك أو خبّر الإدارة 🙏'); return true; }
  const pend = await getAux(key);
  if (!pend || Number(pend.reservationId) !== resId || Number(pend.expiresAt) < Date.now()) { await say(expired); return true; }
  // 🔒 يُعاد الفحص لحظة الضغط: الحجز ما زال حجزَ هذه المحادثة، والمتابعة قائمة، والمفتاح مفعّل
  const ctx = await activeFollowup(conv);
  if (!ctx || ctx.res.id !== resId) { await deleteAux(key).catch(() => {}); await say(expired); return true; }
  const cfg = await getArrivalSettings();
  if (!cfg.botDecline) {
    await deleteAux(key).catch(() => {});
    await flagNeedsReview(ctx, String(pend.quote || ''), 'bot', 'botDecline_off');
    await say('وصلتني 🙏 بلّغت الفريق باعتذارك.');
    return true;
  }
  const res = ctx.res;
  const now = new Date();
  // 🔴 ما زال «لم يُحدَّد»؟ من حضر فعلاً (أو علّمه موظّف) بين الرسالة والضغطة لا يُكتب فوقه
  const upd = await db.update(reservations)
    .set({ attended: false, declinedAt: now, declinedVia: 'followup', updatedAt: now } as any)
    .where(and(eq(reservations.id, resId), isNull(reservations.deletedAt), isNull(reservations.attended)))
    .returning({ id: reservations.id });
  await deleteAux(key).catch(() => {});
  if (!upd.length) { await say('ما قدرت أسجّل اعتذارك — حالة حجزك تغيّرت. إذا في شي راسلنا 🙏'); return true; }
  await logReservationEvent({
    reservationId: resId, activityId: res.activityId, actor: 'bot', actorName: 'الدون', kind: 'declined',
    detail: {
      before: { attended: null, declinedAt: null, declinedVia: null },
      after: { attended: false, declinedAt: now.toISOString(), declinedVia: 'followup' },
    },
    quote: String(pend.quote || '') || null,
  });
  emitReservationsChanged(res.activityId);
  await say('تمام، سجّلت إنك ما رح تقدر تيجي الليلة 🙏 منشوفك بفعاليّة جاية 🌙');
  return true;
}

// ══════════════════════════════════════════════════════
// ⏱️ الماسح (كلّ ٦٠ ثانية) — تذكيرٌ لطيف · متابعةٌ آليّة · ردودٌ لم تُفهم
// ══════════════════════════════════════════════════════
const LATE_TEXT = '{الاسم}، لسا بانتظارك — كل شي تمام؟';

async function inQuietHours(): Promise<boolean> {
  try {
    const { getFollowupConfig } = await import('./wa-followup.service.js');
    const cfg = await getFollowupConfig();
    const h = new Date(Date.now() + 3 * 3600e3).getUTCHours();
    const { quietFromHour: from, quietToHour: to } = cfg;
    if (from === to) return false;
    return from < to ? (h >= from && h < to) : (h >= from || h < to);
  } catch { return false; }
}

async function lateReminders(cfg: ArrivalFollowupSettings): Promise<void> {
  const db = getDB(); if (!db || cfg.lateReminderMinutes <= 0) return;
  const now = Date.now();
  const due = (await db.select({
    id: reservations.id, activityId: reservations.activityId, name: reservations.contactName, status: reservations.status,
    actName: activities.name,
  }).from(reservations)
    .innerJoin(activities, eq(reservations.activityId, activities.id))
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(
      isNull(reservations.deletedAt), isNull(reservations.attended), isNull(reservations.declinedAt),
      lt(reservations.etaAt, new Date(now - cfg.lateReminderMinutes * 60e3)),
      gt(reservations.etaAt, new Date(now - 3 * 3600e3)),            // موعدٌ قديم جدّاً لا يُذكَّر به
      isNull(activities.deletedAt), sql`${activities.status} <> 'cancelled'`,
      gt(activities.date, new Date(now - 8 * 3600e3)), lt(activities.date, new Date(now + 3 * 3600e3)),
      sql`COALESCE(${locations.isTestLocation}, false) = false`,
      // مرّةً واحدة لكلّ حجز — الحجز لفعاليّةٍ واحدة، فهي مرّةٌ لكلّ حجزٍ لكلّ فعاليّة
      sql`NOT EXISTS (SELECT 1 FROM reservation_events e WHERE e.reservation_id = "reservations"."id" AND e.kind = 'late_reminder')`,
    )).limit(20)).filter(r => isConfirmedStatus(r.status));
  if (!due.length) return;

  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  const byAct = new Map<number, typeof due>();
  for (const r of due) { const k = Number(r.activityId); byAct.set(k, [...(byAct.get(k) || []), r]); }
  for (const [actId, list] of byAct) {
    const rec = new Map((await buildRecipients({ id: actId, isTest: false }, list.map(r => r.id))).map(x => [x.reservationId, x]));
    for (const r of list) {
      const x = rec.get(r.id);
      if (!x?.reachable || !x.local) continue;              // قد تُفتح قناته لاحقاً — تكّةٌ قادمة
      // 🔒 الحدث أوّلاً ثمّ الإرسال: إعادة تشغيلٍ في المنتصف لا تُرسل تذكيرين
      const evId = await logReservationEvent({ reservationId: r.id, activityId: actId, actor: 'system', actorName: 'النظام', kind: 'late_reminder', detail: { channel: x.channel } });
      if (!evId) continue;
      try {
        const text = renderFollowupText(LATE_TEXT, { name: x.name, activity: String(r.actName || '') });
        const out: any = await sendMessage({
          ...(x.conversationId ? { conversationId: x.conversationId } : { phone: x.local }),
          text, source: 'system', lane: 'timely', priority: 2, meta: { arrivalLateReminder: actId, arrivalReservationId: r.id },
        });
        await db.update(reservationEvents).set({ detail: { channel: x.channel, messageId: out?.message?.id ?? null } } as any).where(eq(reservationEvents.id, evId));
        console.log(`🕘 late reminder → reservation #${r.id}`);
      } catch (e: any) {
        await db.update(reservationEvents).set({ detail: { channel: x.channel, failed: true, error: String(e?.message || e).slice(0, 200) } } as any).where(eq(reservationEvents.id, evId)).catch(() => {});
        console.warn(`⚠️ late reminder reservation #${r.id}:`, e?.message);
      }
    }
    emitReservationsChanged(actId);
  }
}

async function autoFollowups(cfg: ArrivalFollowupSettings): Promise<void> {
  const db = getDB(); if (!db || !cfg.autoEnabled) return;
  const now = Date.now();
  // بعد البداية بـautoAfterMinutes، وضمن ساعةٍ منها فقط — خادمٌ عاد من توقّفٍ طويل لا يتابع فعاليّةً انتهت
  const acts = await db.select({ id: activities.id }).from(activities)
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(
      isNull(activities.deletedAt), sql`${activities.status} <> 'cancelled'`,
      lt(activities.date, new Date(now - cfg.autoAfterMinutes * 60e3)),
      gt(activities.date, new Date(now - (cfg.autoAfterMinutes + 60) * 60e3)),
      sql`COALESCE(${locations.isTestLocation}, false) = false`,
      // مرّةً واحدة لكلّ فعاليّة
      sql`NOT EXISTS (SELECT 1 FROM reservation_events e WHERE e.activity_id = "activities"."id" AND e.kind = 'followup_sent' AND e.actor = 'system')`,
    )).limit(10);
  for (const a of acts) {
    try {
      const rec = await buildRecipients({ id: a.id, isTest: false });
      const ids = rec.filter(r => r.group === 'silent' && r.reachable && !r.followupSentAt).map(r => r.reservationId);
      if (!ids.length) continue;
      await sendArrivalFollowup({ activityId: a.id, reservationIds: ids, actor: 'system', staffName: 'النظام' });
    } catch (e: any) { console.warn(`⚠️ auto arrival follow-up #${a.id}:`, e?.message); }
  }
}

/**
 * ردٌّ على المتابعة لم يُسجَّل منه موعدٌ ولا اعتذار (لم يفهمه الدون، أو البوت موقوف لهذه
 * المحادثة فلم يقرأه أصلاً) ⟵ «يحتاج مراجعة» ليراه الموظّف. حتميّ، لا يعتمد على النموذج.
 * مهلة ٣ دقائق تترك للدون وقته قبل الحكم.
 */
async function sweepUnreadReplies(): Promise<void> {
  const db = getDB(); if (!db) return;
  const r = await db.execute(sql`
    SELECT r.id, r.activity_id,
           (SELECT m.body FROM wa_messages m JOIN wa_conversations c ON c.id = m.conversation_id
             WHERE m.direction = 'in' AND m.source <> 'injected' AND m.msg_type <> 'interactive'
               AND COALESCE(m.body, '') <> ''
               AND m.created_at > r.followup_sent_at AND m.created_at < NOW() - INTERVAL '3 minutes'
               AND ((r.player_id IS NOT NULL AND c.player_id = r.player_id)
                 OR (length(regexp_replace(COALESCE(r.phone, ''), '[^0-9]', '', 'g')) >= 9
                     AND right(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), 9) = right(regexp_replace(COALESCE(r.phone, ''), '[^0-9]', '', 'g'), 9)))
             ORDER BY m.created_at ASC LIMIT 1) AS body
      FROM reservations r
     WHERE r.deleted_at IS NULL AND r.attended IS NULL AND r.declined_at IS NULL
       AND r.followup_sent_at > NOW() - INTERVAL '6 hours'
       AND NOT EXISTS (SELECT 1 FROM reservation_events e WHERE e.reservation_id = r.id
                        AND e.kind IN ('eta_set', 'declined', 'needs_review') AND e.at >= r.followup_sent_at)
     LIMIT 50`);
  for (const x of rowsOf(r)) {
    const body = String(x.body || '').trim();
    if (!body) continue;
    await logReservationEvent({ reservationId: Number(x.id), activityId: x.activity_id ?? null, actor: 'system', actorName: 'النظام', kind: 'needs_review', detail: { why: 'no_outcome' }, quote: body });
    emitReservationsChanged(x.activity_id);
  }
}

let ticking = false;
export async function arrivalTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const db = getDB(); if (!db) return;
    // لا يرسل شيئاً — يعمل دائماً
    await sweepUnreadReplies().catch(e => console.warn('⚠️ arrival sweep:', e?.message));

    const { waEnabled, sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
    if (!waEnabled() || env.WA_SUSPENDED) return;
    if (sendingSuspendedReason()) return;
    if (await inQuietHours()) return;
    const cfg = await getArrivalSettings();
    await lateReminders(cfg).catch(e => console.warn('⚠️ arrival late reminders:', e?.message));
    await autoFollowups(cfg).catch(e => console.warn('⚠️ arrival auto follow-up:', e?.message));
  } finally { ticking = false; }
}

let started = false;
export function startArrivalFollowupScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => arrivalTick().catch(e => console.warn('⚠️ arrival follow-up tick:', e?.message || e));
  setTimeout(tick, 75_000);
  setInterval(tick, 60_000);
  console.log('🕘 Arrival follow-up scheduler started (every 60s)');
}
