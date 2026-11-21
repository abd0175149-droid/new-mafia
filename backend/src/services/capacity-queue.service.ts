// ══════════════════════════════════════════════════════
// 🪑 السعة وقائمة الانتظار في كلّ القنوات (خطّة توحيد الحجز م٥ج، 2026-11-21)
// ══════════════════════════════════════════════════════
// ق١ (معتمد): سقفٌ اختياريّ لكلّ فعاليّة (activities.cap_enabled)، مطفأٌ افتراضاً. مطفأ = بلا سقف في كلّ
//    القنوات (والدون لم يعد يضع أحداً في الانتظار). مشغَّل = من يتجاوز السعة ينتظر بالدور في كلّ القنوات.
// ق٢٠: كلّ ما يحرّر مقعداً يشغّل الدور (runQueue): يُعرض المقعد على أوّل الدور بمهلة (سياسة الحجز
//    waitlistHoldMinutes، ٣٠)، والمعروض يُحسب محجوزاً خلال مهلته، وانتهاؤها يعيده آخر الدور ويُعرض على التالي.
//    حجزٌ أكبر من المتاح يُتخطّى ولا يُؤخَّر («معاً» — ق١٩ «ثبّت الباقي» ينتظر مقاعد م٥).
// ق٢١: السعر يُقفل لحظة دخول الانتظار (applyOnNewReservation يعمل للمنتظر أيضاً) فلا يخسر المبكّر.
// ق٢٢: المتابعة والباب يثبّتان فوق السعة بزرٍّ صريح، ويُكتب سطرٌ «فوق السعة» في سجلّ الحجز.

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const MIN = 60e3;

export interface CapInfo { enabled: boolean; total: number; booked: number; held: number; waiting: number; remaining: number }

export async function migrateCapacityQueue(db: any): Promise<void> {
  await db.execute(sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS cap_enabled BOOLEAN DEFAULT false`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wl_rank_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wl_offered_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS wl_offer_until TIMESTAMP`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_reservations_waitlist ON reservations (activity_id, wl_rank_at) WHERE status = 'waitlist' AND deleted_at IS NULL`);
}

export async function capEnabled(activityId: number): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r = rowsOf(await db.execute(sql`SELECT cap_enabled FROM activities WHERE id = ${Math.trunc(activityId)}`))[0];
  return r?.cap_enabled === true;
}

/** السعة الآن: المحجوز (صيغة العدّ الواحدة)، والمعروض ضمن مهلته، والمنتظرون، والمتاح */
export async function capInfo(activityId: number, opts: { exceptResId?: number } = {}): Promise<CapInfo> {
  const db = getDB();
  const { resolveRoomCapacity } = await import('./capacity.service.js');
  const { countBookedPeople } = await import('./booking-count.service.js');
  const total = await resolveRoomCapacity(activityId);
  const booked = await countBookedPeople(activityId);
  const enabled = await capEnabled(activityId);
  let held = 0, waiting = 0;
  if (db) {
    const r = rowsOf(await db.execute(sql`
      SELECT COALESCE(SUM(people_count) FILTER (WHERE wl_offer_until > NOW() ${opts.exceptResId ? sql`AND id <> ${opts.exceptResId}` : sql``}), 0)::int AS held,
             COALESCE(SUM(people_count), 0)::int AS waiting
        FROM reservations WHERE activity_id = ${Math.trunc(activityId)} AND deleted_at IS NULL AND status = 'waitlist'`))[0];
    held = Number(r?.held || 0); waiting = Number(r?.waiting || 0);
  }
  return { enabled, total, booked, held, waiting, remaining: Math.max(0, total - booked - held) };
}

/** يكفي المكان لـ people الآن؟ (السقف مطفأ ⟵ دائماً نعم) */
export async function fits(activityId: number, people: number, opts: { exceptResId?: number } = {}): Promise<{ ok: boolean; info: CapInfo }> {
  const info = await capInfo(activityId, opts);
  return { ok: !info.enabled || info.remaining >= Math.max(1, people), info };
}

/** ترتيب المنتظرين — مفتاح الدور wl_rank_at (وإلّا وقت الإنشاء) */
export async function queueOf(activityId: number): Promise<any[]> {
  const db = getDB(); if (!db) return [];
  return rowsOf(await db.execute(sql`
    SELECT id, contact_name AS "contactName", phone, people_count AS "peopleCount", player_id AS "playerId", channel,
           COALESCE(wl_rank_at, created_at) AS "rankAt", wl_offered_at AS "offeredAt", wl_offer_until AS "offerUntil", created_at AS "createdAt"
      FROM reservations WHERE activity_id = ${Math.trunc(activityId)} AND deleted_at IS NULL AND status = 'waitlist'
     ORDER BY COALESCE(wl_rank_at, created_at), id`)).map((x, i) => ({ ...x, position: i + 1 }));
}

async function holdMinutes(): Promise<number> {
  const { bookingPolicy } = await import('./booking-policy.service.js');
  return bookingPolicy().waitlistHoldMinutes;
}

/**
 * ▶️ شغّل الدور: ما دام في المكان متّسع، يُعرض على أوّل منتظرٍ يكفيه المتاح (بمهلة). لا يفعل شيئاً
 * والسقف مطفأ. آمنٌ للتكرار والتزامن (قفلٌ استشاريّ على الفعاليّة).
 */
export async function runQueue(activityId: number, why = ''): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const aid = Math.trunc(Number(activityId));
  if (!aid || !(await capEnabled(aid))) return 0;
  const offered: any[] = [];
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7311, ${aid})`);
      const info = await capInfo(aid);
      let left = info.remaining;
      if (left <= 0) return;
      const mins = await holdMinutes();
      const q = rowsOf(await tx.execute(sql`
        SELECT r.id, r.people_count FROM reservations r JOIN activities a ON a.id = r.activity_id
         WHERE r.activity_id = ${aid} AND r.deleted_at IS NULL AND r.status = 'waitlist' AND a.date > NOW() - INTERVAL '6 hours'
           AND (r.wl_offer_until IS NULL OR r.wl_offer_until < NOW())
           -- من اعتذر أو فاتته المهلة لا يُعرض عليه ثانيةً قبل مرور مهلةٍ كاملة (وإلّا عاد إليه المقعد نفسه)
           AND NOT EXISTS (SELECT 1 FROM booking_events e WHERE e.reservation_id = r.id AND e.kind IN ('wl_skipped', 'wl_expired')
                            AND e.at > NOW() - make_interval(mins => ${mins}))
         ORDER BY COALESCE(r.wl_rank_at, r.created_at), r.id`));
      for (const x of q) {
        const n = Math.max(1, Number(x.people_count || 1));
        if (n > left) continue;                       // «معاً»: يُتخطّى ولا يُؤخَّر
        await tx.execute(sql`UPDATE reservations SET wl_offered_at = NOW(), wl_offer_until = NOW() + make_interval(mins => ${mins}), updated_at = NOW() WHERE id = ${x.id}`);
        offered.push({ id: Number(x.id), people: n, mins });
        left -= n;
        if (left <= 0) break;
      }
    });
  } catch (e: any) { console.warn('⚠️ runQueue:', e?.message); return 0; }
  for (const o of offered) {
    await logEvent(o.id, aid, 'wl_offered', { mins: o.mins, why }, null, { channel: 'system', actor: 'الدور' });
    await notifyOffer(o.id, o.mins).catch((e: any) => console.warn('⚠️ waitlist offer notify:', e?.message));
  }
  if (offered.length) console.log(`🪑 queue #${aid}${why ? ` (${why})` : ''}: offered ${offered.map((o) => `#${o.id}×${o.people}`).join(', ')}`);
  return offered.length;
}

async function logEvent(resId: number, activityId: number, kind: string, detail: any, reason: string | null, who: { channel: string; actor: string }) {
  const db = getDB(); if (!db) return;
  await db.execute(sql`INSERT INTO booking_events (reservation_id, activity_id, channel, actor, kind, detail, reason)
    VALUES (${resId}, ${activityId}, ${who.channel.slice(0, 12)}, ${who.actor.slice(0, 120)}, ${kind}, ${JSON.stringify(detail || {})}::jsonb, ${reason})`).catch(() => {});
}

/** إبلاغ صاحب الدور: أزرار في الدون إن وُجدت محادثة، وإلّا إشعارٌ له وللإدارة */
async function notifyOffer(resId: number, mins: number): Promise<void> {
  const db = getDB(); if (!db) return;
  const [r] = rowsOf(await db.execute(sql`
    SELECT r.id, r.phone, r.player_id, r.people_count, r.activity_id, r.contact_name, a.name, a.date,
           (SELECT c.id FROM wa_conversations c WHERE c.phone = r.phone ORDER BY c.last_inbound_at DESC NULLS LAST LIMIT 1) AS conv_id
      FROM reservations r JOIN activities a ON a.id = r.activity_id WHERE r.id = ${resId}`));
  if (!r) return;
  if (String(r.name || '').startsWith('🧪')) return;   // فعاليّات الفحص لا تُرسل لأحد
  const { fmtWhen } = await import('./early-price.service.js');
  const text = `🪑 خبر حلو: فضي مكان في «${r.name}» (${fmtWhen(new Date(r.date).getTime())}) يكفي حجزك لـ${r.people_count} ${Number(r.people_count) > 1 ? 'أشخاص' : 'شخص'}.\nمحجوزٌ إلك ${mins} دقيقة — بتحب أثبّته؟`;
  if (r.conv_id) {
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    await sendMessage({ conversationId: Number(r.conv_id), source: 'bot', lane: 'timely', interactive: {
      type: 'button', body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: `wl_take:${r.id}`, title: 'ثبّته لي ✓' } },
        { type: 'reply', reply: { id: `wl_skip:${r.id}`, title: 'لا، شكراً' } },
      ] },
    } }).catch(() => {});
  }
  try {
    const F = await import('./fcm.service.js');
    if (r.player_id) F.sendPushToPlayer(Number(r.player_id), '🪑 فضي مكان إلك', `«${r.name}» — محجوز إلك ${mins} دقيقة. ثبّته من الدون أو كلّم الإدارة`, 'reservation', { activityId: String(r.activity_id) }).catch(() => {});
    F.sendPushToStaffByPermission('bookings', '🪑 مقعدٌ معروض من قائمة الانتظار', `${r.contact_name || r.phone} — ${r.name} (مهلة ${mins} د)${r.conv_id ? '' : ' — بلا واتساب: اتّصل به'}`,
      'reservation', { route: `/admin/reservations?activityId=${r.activity_id}` }).catch(() => {});
  } catch { /* الإشعار خدمة */ }
}

/**
 * ✅ تثبيت منتظر: صاحب عرضٍ ساري المهلة يثبَّت دائماً (مقعده محجوزٌ له)، وغيره إن كفى المتاح.
 * overCap (ق٢٢): الإدارة تثبّت فوق السعة بسبب. who.channel يكتب القناة في السجلّ.
 */
export async function takeFromQueue(resId: number, who: { channel: string; actor: string }, opts: { overCap?: boolean; reason?: string } = {}):
  Promise<{ ok: boolean; error?: string; code?: string; remaining?: number; confirmScheduled?: boolean }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  const [r] = rowsOf(await db.execute(sql`SELECT id, activity_id, people_count, status, wl_offer_until, created_by FROM reservations WHERE id = ${resId} AND deleted_at IS NULL`));
  if (!r) return { ok: false, error: 'الحجز غير موجود' };
  if (r.status !== 'waitlist') return { ok: false, error: 'الحجز ليس في قائمة الانتظار' };
  const aid = Number(r.activity_id);
  const held = r.wl_offer_until && new Date(r.wl_offer_until).getTime() > Date.now();
  if (!held && !opts.overCap) {
    const f = await fits(aid, Number(r.people_count || 1), { exceptResId: resId });
    if (!f.ok) return { ok: false, code: 'CAP_FULL', remaining: f.info.remaining, error: `المتاح ${f.info.remaining} فقط من ${f.info.total}` };
  }
  const { withActor } = await import('./booking-commands.service.js');
  await withActor({ channel: who.channel as any, actor: who.actor }, (tx) => tx.execute(sql`
    UPDATE reservations SET status = 'confirmed', wl_offered_at = NULL, wl_offer_until = NULL, updated_at = NOW(),
           notes = COALESCE(notes, '') || ${` · ✅ ثُبّت من قائمة الانتظار (${who.actor})${opts.overCap ? ' فوق السعة' : ''}`}
     WHERE id = ${resId}`));
  if (opts.overCap) await logEvent(resId, aid, 'over_cap', {}, String(opts.reason || '').slice(0, 200) || null, who);
  let confirmScheduled = false;
  try {
    const [row] = rowsOf(await db.execute(sql`SELECT * FROM reservations WHERE id = ${resId}`));
    const camel = { id: row.id, activityId: row.activity_id, playerId: row.player_id, phone: row.phone, contactName: row.contact_name, peopleCount: row.people_count, status: row.status, createdBy: row.created_by };
    const { ensureBookingForReservation } = await import('./reservation-booking.service.js');
    await ensureBookingForReservation(db as any, camel as any);
    const { scheduleReservationConfirm } = await import('./reservation-confirm.service.js');
    confirmScheduled = !!(await scheduleReservationConfirm(resId, 'wl_take')).scheduled;
  } catch (e: any) { console.warn('⚠️ takeFromQueue mirror:', e?.message); }
  return { ok: true, confirmScheduled };
}

/** «لا، شكراً» أو انتهاء المهلة: يعود آخر الدور ويُعرض المقعد على التالي */
export async function releaseOffer(resId: number, why: 'skip' | 'expired', who = { channel: 'system', actor: 'الدور' }): Promise<void> {
  const db = getDB(); if (!db) return;
  const [r] = rowsOf(await db.execute(sql`UPDATE reservations SET wl_offered_at = NULL, wl_offer_until = NULL, wl_rank_at = NOW(), updated_at = NOW()
     WHERE id = ${resId} AND status = 'waitlist' AND deleted_at IS NULL RETURNING activity_id`));
  if (!r) return;
  await logEvent(resId, Number(r.activity_id), why === 'skip' ? 'wl_skipped' : 'wl_expired', {}, null, who);
  await runQueue(Number(r.activity_id), why === 'skip' ? 'اعتذر صاحب الدور' : 'انتهت المهلة');
}

/** ⏱️ المهل المنتهية ⟵ آخر الدور ثمّ التالي */
export async function expireOffers(): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const rows = rowsOf(await db.execute(sql`SELECT id FROM reservations WHERE status = 'waitlist' AND deleted_at IS NULL AND wl_offer_until IS NOT NULL AND wl_offer_until < NOW() LIMIT 50`));
  for (const x of rows) await releaseOffer(Number(x.id), 'expired');
  return rows.length;
}

let started = false;
export function startQueueJobs(): void {
  if (started) return; started = true;
  setInterval(() => { void expireOffers().catch(() => {}); }, MIN);
}

/** تشغيل/إطفاء السقف (ق١) — التشغيل يشغّل الدور فوراً */
export async function setCap(activityId: number, on: boolean, who: { channel: string; actor: string }): Promise<CapInfo> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  await db.execute(sql`UPDATE activities SET cap_enabled = ${on} WHERE id = ${Math.trunc(activityId)}`);
  console.log(`🪑 cap ${on ? 'ON' : 'OFF'} for activity #${activityId} by ${who.actor}`);
  if (on) await runQueue(activityId, 'شُغّل السقف');
  return capInfo(activityId);
}

/**
 * 🪑 مقعدٌ تحرّر من أيّ مسار (إلغاء، حذف، إنقاص العدد، فكّ تثبيت، رفع السعة) — ق٢٠.
 * السقف مشغَّل ⟵ الدور بمهلة. مطفأ ⟵ منتظرو ما قبل السقف (إن وُجدوا) يُعرض عليهم بالطريقة القديمة.
 */
export async function seatFreed(activityId: number, why = ''): Promise<void> {
  try {
    if (!activityId) return;
    if (await capEnabled(activityId)) { await runQueue(activityId, why); return; }
    const B = await import('./whatsapp-bot.service.js');
    await B.offerFreedSeatFor(Number(activityId));
  } catch (e: any) { console.warn('⚠️ seatFreed:', e?.message); }
}
