// ══════════════════════════════════════════════════════
// 📣 إشعار إلغاء الفعاليّة — رسالةٌ آليّة لكلّ حاجز + تقريرٌ بمن وصلته ومن لا
// ══════════════════════════════════════════════════════
// قرار المالك 2026-10-02: حين تتحوّل فعاليّةٌ إلى «ملغاة» **قبل موعدها** يُراسَل كلّ من حجز فيها
// آليّاً، ويظهر تقريرٌ: كم حاجزاً، ومن استطاع البوت مراسلته ومن لا (نافذة الـ٢٤ ساعة).
//
// لماذا: الزرقاء ٢٦٤ (2026-10-01) أُعلن إلغاؤها ببثٍّ يدويّ ٥:٣٧م، وبقيت «مخطّطة» في النظام
// فحجز فيها أيهم ٦:١٥م، ووصل تذكيرٌ «لعبتك بعد ساعة» لحاجزٍ آخر. الإلغاء صار حدثاً واحداً:
// زرّ الحالة يُغلق الحجز (notBookable) ويُخبر الحاجزين معاً.
//
// 🔒 القيود (لا تُكسر):
//   • لا رسالة خارج نافذة الـ٢٤ ساعة — sendMessage نفسها ترفض؛ هنا تُصنَّف مسبقاً للتقرير.
//   • موقع الاختبار لا يصل واتساب أبداً — يُسجَّل التقرير ولا يُرسَل شيء.
//   • مرّةً لكلّ رقمٍ لكلّ فعاليّة (UNIQUE) — إعادة الإلغاء بعد التراجع تراسل الجدد وحدهم.
//   • رسالةٌ تخصّ حجزه لا إعلان: المعتذرون عن الإعلانات (wa_optouts) يُراسَلون ويُوسَمون.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

export type CancelOutcome = 'sent' | 'failed' | 'window_closed' | 'no_conversation' | 'invalid_phone' | 'test_location';

export const CANCEL_NOTICE_DEFAULT =
  'مرحباً {الاسم} 🎭\nبنعتذر منك، اضطرّينا نلغي فعاليّة «{الفعالية}» اللي كانت {الموعد}.\n'
  + 'إذا حابب نحجزلك بموعد ثاني، ردّ علينا هون وبنرتّبلك 🙏';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const SEND_GAP_MS = 350;

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** «الخميس 1/10 الساعة 7:30 مساءً» بتوقيت عمّان */
export function whenAr(date: Date): string {
  const d = new Date(new Date(date).getTime() + 3 * 3600e3);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const h12 = h % 12 || 12;
  return `${AR_DAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1} الساعة ${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'صباحاً' : 'مساءً'}`;
}

export function renderCancelText(tpl: string, v: { name: string; activity: string; when: string }): string {
  const first = String(v.name || '').trim().split(/\s+/)[0] || '';
  return String(tpl || CANCEL_NOTICE_DEFAULT)
    .replace(/\{الاسم\}/g, first || 'ضيفنا')
    .replace(/\{الفعالية\}/g, v.activity)
    .replace(/\{الموعد\}/g, v.when)
    .replace(/[ \t]+\n/g, '\n').trim();
}

export interface Booker { phone: string; name: string; playerId: number | null; source: 'booking' | 'reservation' | 'waitlist'; people: number }

/** كلّ من حجز: صفوف الحجز + المتابعة (بلا الملغاة)، موحَّدةً بالرقم. الحجز أولى، ثمّ المتابعة، ثمّ الانتظار. */
export async function collectBookers(activityId: number): Promise<{ bookers: Booker[]; invalid: Array<{ name: string; phone: string; source: string }> }> {
  const db = getDB(); if (!db) return { bookers: [], invalid: [] };
  const rows = rowsOf(await db.execute(sql`
    SELECT 'booking' AS src, b.name, COALESCE(NULLIF(b.phone, ''), p.phone) AS phone, b.player_id, COALESCE(b.count, 1) AS people, b.id AS ord
      FROM bookings b LEFT JOIN players p ON p.id = b.player_id
     WHERE b.activity_id = ${activityId} AND b.deleted_at IS NULL
    UNION ALL
    SELECT CASE WHEN r.status = 'waitlist' THEN 'waitlist' ELSE 'reservation' END, r.contact_name, COALESCE(NULLIF(r.phone, ''), p.phone), r.player_id, COALESCE(r.people_count, 1), 1000000 + r.id
      FROM reservations r LEFT JOIN players p ON p.id = r.player_id
     WHERE r.activity_id = ${activityId} AND r.deleted_at IS NULL AND r.status <> 'cancelled'
     ORDER BY 1, ord`));
  const rank: Record<string, number> = { booking: 0, reservation: 1, waitlist: 2 };
  const byPhone = new Map<string, Booker>();
  const invalid: Array<{ name: string; phone: string; source: string }> = [];
  for (const r of rows) {
    const local = normalizeLocalPhone(String(r.phone || ''));
    if (!local) { invalid.push({ name: String(r.name || ''), phone: String(r.phone || ''), source: r.src }); continue; }
    const cur = byPhone.get(local);
    if (cur && rank[cur.source] <= rank[r.src]) continue;
    byPhone.set(local, { phone: local, name: String(r.name || '').trim(), playerId: r.player_id ?? null, source: r.src, people: Number(r.people || 1) });
  }
  return { bookers: [...byPhone.values()], invalid };
}

interface Reach { conversationId: number | null; windowOpen: boolean; optedOut: boolean }
async function reachOf(phones: string[]): Promise<Map<string, Reach>> {
  const db = getDB(); const out = new Map<string, Reach>();
  if (!db || !phones.length) return out;
  const { isFreeWindowOpen } = await import('./whatsapp-inbox.service.js');
  const convs = rowsOf(await db.execute(sql`
    SELECT c.id, c.phone, c.last_inbound_at, EXISTS (SELECT 1 FROM wa_optouts o WHERE o.phone = c.phone) AS opted
      FROM wa_conversations c WHERE c.phone IN (${sql.join(phones.map(p => sql`${p}`), sql`, `)})`));
  for (const c of convs) out.set(String(c.phone), { conversationId: Number(c.id), windowOpen: isFreeWindowOpen({ lastInboundAt: c.last_inbound_at }), optedOut: !!c.opted });
  return out;
}

async function activityInfo(activityId: number) {
  const db = getDB(); if (!db) return null;
  const [a] = rowsOf(await db.execute(sql`
    SELECT a.id, a.name, a.date, a.status, COALESCE(l.is_test_location, false) AS is_test
      FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.id = ${activityId}`));
  return a ? { id: Number(a.id), name: String(a.name), date: new Date(a.date), status: String(a.status), isTest: !!a.is_test } : null;
}

/** معاينةٌ قبل الإلغاء: كم حاجزاً، وكم ستصله الرسالة الآن — بلا إرسالٍ ولا كتابة */
export async function previewCancelNotice(activityId: number) {
  const act = await activityInfo(activityId);
  if (!act) return null;
  const { bookers, invalid } = await collectBookers(activityId);
  const reach = await reachOf(bookers.map(b => b.phone));
  const rows = bookers.map(b => {
    const r = reach.get(b.phone);
    const outcome: CancelOutcome = act.isTest ? 'test_location' : !r ? 'no_conversation' : r.windowOpen ? 'sent' : 'window_closed';
    return { ...b, outcome, optedOut: !!r?.optedOut };
  });
  const beforeStart = Date.now() < act.date.getTime();
  return {
    activity: { id: act.id, name: act.name, when: whenAr(act.date), status: act.status, isTest: act.isTest },
    beforeStart,
    willSend: beforeStart && !act.isTest,
    total: bookers.length,
    reachable: rows.filter(r => r.outcome === 'sent').length,
    windowClosed: rows.filter(r => r.outcome === 'window_closed').length,
    noConversation: rows.filter(r => r.outcome === 'no_conversation').length,
    invalid: invalid.length,
    message: renderCancelText(CANCEL_NOTICE_DEFAULT, { name: '{الاسم}', activity: act.name, when: whenAr(act.date) }),
    rows,
  };
}

const running = new Set<number>();

/**
 * يُشغَّل عند تحوّل الحالة إلى «ملغاة». يكتب الإشعار والمستلمين، ويراسل من نافذته مفتوحة.
 * بعد موعد الفعاليّة: يُسجَّل الإشعار «بعد الموعد» ولا يُرسَل شيء (القرار: قبل الموعد فقط).
 */
export async function runCancelNotice(activityId: number, opts: { by: string; text?: string | null }): Promise<{ ok: boolean; skipped?: string; sent?: number; total?: number }> {
  const db = getDB(); if (!db) return { ok: false, skipped: 'no_db' };
  if (running.has(activityId)) return { ok: false, skipped: 'running' };
  running.add(activityId);
  try {
    const act = await activityInfo(activityId);
    if (!act) return { ok: false, skipped: 'not_found' };
    const beforeStart = Date.now() < act.date.getTime();
    // «بعد الموعد» أوّلاً: لا شيء يُفعل بعد بدء الفعاليّة، أيّاً كان مكانها
    const skipped = !beforeStart ? 'after_start' : act.isTest ? 'test_location' : null;
    const tpl = String(opts.text || '').trim() || CANCEL_NOTICE_DEFAULT;
    await db.execute(sql`
      INSERT INTO activity_cancel_notices (activity_id, created_by, text, before_start, skipped_reason, last_run_at)
      VALUES (${activityId}, ${opts.by || ''}, ${tpl}, ${beforeStart}, ${skipped}, NOW())
      ON CONFLICT (activity_id) DO UPDATE SET last_run_at = NOW(), runs = activity_cancel_notices.runs + 1,
        before_start = EXCLUDED.before_start, skipped_reason = EXCLUDED.skipped_reason,
        text = CASE WHEN ${String(opts.text || '').trim()} <> '' THEN EXCLUDED.text ELSE activity_cancel_notices.text END`);
    if (skipped === 'after_start') return { ok: true, skipped };

    const { bookers, invalid } = await collectBookers(activityId);
    const reach = await reachOf(bookers.map(b => b.phone));
    const fresh: Array<Booker & { reach?: Reach }> = [];
    for (const b of bookers) {
      const r = reach.get(b.phone);
      const outcome: CancelOutcome | 'queued' = skipped ? 'test_location' : !r ? 'no_conversation' : r.windowOpen ? 'queued' : 'window_closed';
      const ins = rowsOf(await db.execute(sql`
        INSERT INTO activity_cancel_recipients (activity_id, phone, name, player_id, source, people, conversation_id, window_open, opted_out, outcome)
        VALUES (${activityId}, ${b.phone}, ${b.name.slice(0, 150)}, ${b.playerId}, ${b.source}, ${b.people}, ${r?.conversationId ?? null}, ${!!r?.windowOpen}, ${!!r?.optedOut}, ${outcome})
        ON CONFLICT (activity_id, phone) DO NOTHING RETURNING id`));
      if (ins.length && outcome === 'queued') fresh.push({ ...b, reach: r });
    }
    for (const [i, iv] of invalid.entries()) {
      await db.execute(sql`
        INSERT INTO activity_cancel_recipients (activity_id, phone, name, source, outcome)
        VALUES (${activityId}, ${`?${i}:${iv.phone}`.slice(0, 20)}, ${iv.name.slice(0, 150)}, ${iv.source}, 'invalid_phone')
        ON CONFLICT (activity_id, phone) DO NOTHING`);
    }
    if (skipped) return { ok: true, skipped, total: bookers.length };

    const sent = await sendQueued(activityId, act, tpl, fresh);
    console.log(`📣 إلغاء #${activityId} «${act.name}»: ${bookers.length} حاجزاً · أُرسل ${sent} · نافذةٌ مغلقة/بلا محادثة ${bookers.length - fresh.length}`);
    return { ok: true, sent, total: bookers.length };
  } catch (e: any) {
    console.warn('⚠️ cancel-notice:', e?.message);
    return { ok: false, skipped: 'error' };
  } finally {
    running.delete(activityId);
  }
}

async function sendQueued(activityId: number, act: { name: string; date: Date }, tpl: string, list: Array<Booker & { reach?: Reach }>): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  let sent = 0;
  for (const b of list) {
    const text = renderCancelText(tpl, { name: b.name, activity: act.name, when: whenAr(act.date) });
    try {
      const r: any = await sendMessage({ conversationId: b.reach!.conversationId!, text, source: 'system', meta: { cancelNotice: activityId } });
      await db.execute(sql`UPDATE activity_cancel_recipients SET outcome = 'sent', wa_message_id = ${r?.message?.id ?? null}, sent_at = NOW(), error = NULL
        WHERE activity_id = ${activityId} AND phone = ${b.phone}`);
      sent++;
    } catch (e: any) {
      const code = e?.code === 'WINDOW_EXPIRED' ? 'window_closed' : 'failed';
      await db.execute(sql`UPDATE activity_cancel_recipients SET outcome = ${code}, error = ${String(e?.message || e).slice(0, 300)}
        WHERE activity_id = ${activityId} AND phone = ${b.phone}`);
    }
    await new Promise(r => setTimeout(r, SEND_GAP_MS));
  }
  return sent;
}

/** «أعد الإرسال لمن انفتحت نافذته»: من لم يُرسَل له وصارت نافذته مفتوحة الآن (راسلنا بعد الإلغاء) */
export async function resendCancelNotice(activityId: number): Promise<{ ok: boolean; sent: number; stillClosed: number; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, sent: 0, stillClosed: 0 };
  const act = await activityInfo(activityId);
  if (!act) return { ok: false, sent: 0, stillClosed: 0, error: 'الفعاليّة غير موجودة' };
  if (act.isTest) return { ok: false, sent: 0, stillClosed: 0, error: 'موقع اختبار — لا يصل واتساب' };
  if (act.status !== 'cancelled') return { ok: false, sent: 0, stillClosed: 0, error: 'الفعاليّة ليست ملغاة' };
  const [n] = rowsOf(await db.execute(sql`SELECT text FROM activity_cancel_notices WHERE activity_id = ${activityId}`));
  if (!n) return { ok: false, sent: 0, stillClosed: 0, error: 'لا إشعار إلغاء لهذه الفعاليّة' };
  if (running.has(activityId)) return { ok: false, sent: 0, stillClosed: 0, error: 'الإرسال جارٍ' };
  running.add(activityId);
  try {
    const pend = rowsOf(await db.execute(sql`SELECT phone, name, player_id, source, people FROM activity_cancel_recipients
      WHERE activity_id = ${activityId} AND outcome IN ('window_closed', 'no_conversation', 'failed')`));
    const reach = await reachOf(pend.map((p: any) => String(p.phone)));
    const open = pend.filter((p: any) => reach.get(String(p.phone))?.windowOpen)
      .map((p: any) => ({ phone: String(p.phone), name: String(p.name || ''), playerId: p.player_id ?? null, source: p.source, people: Number(p.people || 1), reach: reach.get(String(p.phone)) }));
    for (const p of open) await db.execute(sql`UPDATE activity_cancel_recipients SET conversation_id = ${p.reach!.conversationId}, window_open = true WHERE activity_id = ${activityId} AND phone = ${p.phone}`);
    const sent = await sendQueued(activityId, act, String(n.text || CANCEL_NOTICE_DEFAULT), open as any);
    return { ok: true, sent, stillClosed: pend.length - open.length };
  } finally {
    running.delete(activityId);
  }
}

/** التقرير: الإشعار + المستلمون + حالة التسليم من واتساب (وصلت/قُرئت) */
export async function getCancelReport(activityId: number) {
  const db = getDB(); if (!db) return null;
  const [n] = rowsOf(await db.execute(sql`SELECT * FROM activity_cancel_notices WHERE activity_id = ${activityId}`));
  if (!n) return null;
  const rec = rowsOf(await db.execute(sql`
    SELECT r.phone, r.name, r.source, r.people, r.outcome, r.error, r.window_open, r.opted_out, r.sent_at, r.player_id,
           m.status AS delivery
      FROM activity_cancel_recipients r LEFT JOIN wa_messages m ON m.id = r.wa_message_id
     WHERE r.activity_id = ${activityId}
     ORDER BY CASE r.outcome WHEN 'sent' THEN 1 WHEN 'failed' THEN 2 WHEN 'window_closed' THEN 3 WHEN 'no_conversation' THEN 4 ELSE 5 END, r.name`));
  const count = (o: string) => rec.filter((r: any) => r.outcome === o).length;
  const act = await activityInfo(activityId);
  return {
    activity: act ? { name: act.name, when: whenAr(act.date), status: act.status } : null,
    notice: { createdAt: n.created_at, createdBy: n.created_by, beforeStart: !!n.before_start, skippedReason: n.skipped_reason, runs: Number(n.runs || 1), lastRunAt: n.last_run_at, text: n.text },
    totals: {
      bookers: rec.length,
      sent: count('sent'),
      delivered: rec.filter((r: any) => r.outcome === 'sent' && ['delivered', 'read'].includes(String(r.delivery))).length,
      read: rec.filter((r: any) => r.outcome === 'sent' && String(r.delivery) === 'read').length,
      windowClosed: count('window_closed'), noConversation: count('no_conversation'),
      failed: count('failed'), invalidPhone: count('invalid_phone'), testLocation: count('test_location'),
    },
    recipients: rec.map((r: any) => ({
      name: r.name, phone: String(r.phone).startsWith('?') ? String(r.phone).replace(/^\?\d+:/, '') : r.phone, source: r.source, people: Number(r.people || 1),
      outcome: r.outcome, error: r.error || null, optedOut: !!r.opted_out, sentAt: r.sent_at, delivery: r.delivery || null, playerId: r.player_id ?? null,
    })),
  };
}
