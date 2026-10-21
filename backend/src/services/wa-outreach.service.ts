// ══════════════════════════════════════════════════════
// 📤 الإرسال المباشر من صفحات النظام — الحجوزات · تحليلات اللاعبين · المستكشف
// ══════════════════════════════════════════════════════
// كانت الصفحات الثلاث تفتح تطبيق واتساب برسالةٍ جاهزة والموظّف يضغط «إرسال» بيده لكلّ شخص.
// صارت ترسل من النظام عبر رقم الأعمال (قرار المالك 2026-10-20): لشخصٍ أو لفئةٍ كاملة.
//
//   • الواجهة تملأ القالب لكلّ مستلم كما كانت (fillTemplate نفسه) وترسل [{phone, text, …}].
//   • معاينةٌ إلزاميّة: مؤهّلون، طلبوا الإيقاف، أرقام غير صالحة، مكرّرة، تلقّوا رسالة فئةٍ قريباً —
//     و«أوّل رسالة من رقم الأعمال» للعلم فقط (لا شرط محادثة سابقة — قرار المالك).
//   • الحجوزات رسائل خدميّة: مسار timely، لا يمنعها إيقاف التسويق، سقفها الخدميّ مستقلّ.
//   • الفئات تسويقيّة: مسار bulk (٢٥٠/يوم، ١٥–٤٥ث)، يمنعها الإيقاف، يُذيَّل سطر الإيقاف،
//     واللاعب لا يتلقّى رسالة فئةٍ أكثر من مرّة كلّ cohortFreqDays.
//   • كلّ دفعة صفٌّ في wa_broadcasts (origin) ⟵ تظهر في سجلّ البثّ بتقرير القراءة نفسه.

import { sql, eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { waBroadcasts, waConversations, reservations } from '../schemas/admin.schema.js';
import { normalizeAnyPhone } from '../utils/phone.util.js';
import { pickChannel, webConfigured } from './wa-transport/router.js';
import { transportSettings } from './wa-transport/settings.js';
import type { Lane, LineFilter } from './wa-transport/types.js';
import { lineStatusOf } from './wa-transport/line-roster.js';

export type OutreachOrigin = 'reservations' | 'analytics' | 'explorer';
export const OUTREACH_ORIGINS: OutreachOrigin[] = ['reservations', 'analytics', 'explorer'];
export interface OutreachItem { phone: string; text: string; playerId?: number | null; reservationId?: number | null; name?: string }

const OPTOUT_FOOTER = '\n\n— لإيقاف هذه الرسائل أرسل: إيقاف';
const MAX_ITEMS = 1000;
const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const isCohort = (o: OutreachOrigin) => o !== 'reservations';
export const laneOf = (o: OutreachOrigin): Lane => (isCohort(o) ? 'bulk' : 'timely');

/** هل تعمل الصفحات بالإرسال المباشر الآن؟ (وإلّا تفتح الرابط كما كانت) */
export function directEnabled(): boolean {
  const s = transportSettings();
  return webConfigured() && s.mode !== 'cloud_only' && s.outreach.direct;
}

export interface PreviewRow { phone: string; local: string; name: string; text: string; playerId: number | null; reservationId: number | null; conversationId: number | null; via: 'cloud' | 'web' | null; firstContact: boolean }

export async function previewOutreach(origin: OutreachOrigin, items: OutreachItem[], lineFilter?: LineFilter) {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  if (!OUTREACH_ORIGINS.includes(origin)) throw new Error('مصدرٌ غير معروف');
  if (!Array.isArray(items) || !items.length) throw new Error('لا مستلمين');
  if (items.length > MAX_ITEMS) throw new Error(`الحدّ ${MAX_ITEMS} مستلماً للدفعة الواحدة`);
  const s = transportSettings();
  const lf: LineFilter = lineFilter || s.lineDefault;
  const lane = laneOf(origin);
  const skipped = { invalid: [] as string[], duplicate: [] as string[], optout: [] as string[], recent: [] as string[], unreachable: [] as string[], emptyText: [] as string[], notOnWhatsapp: [] as string[], noChat: [] as string[] };
  const seen = new Set<string>();
  const cand: Array<OutreachItem & { local: string }> = [];
  for (const it of items) {
    const norm = normalizeAnyPhone(String(it.phone || ''));
    if (!norm) { skipped.invalid.push(String(it.phone || '')); continue; }
    if (seen.has(norm.local)) { skipped.duplicate.push(norm.local); continue; }
    const text = String(it.text || '').trim().slice(0, 4000);
    if (!text) { skipped.emptyText.push(norm.local); continue; }
    seen.add(norm.local);
    cand.push({ ...it, text, local: norm.local });
  }
  const locals = cand.map(c => c.local);
  const inList = locals.length ? sql.join(locals.map(p => sql`${p}`), sql`, `) : sql`NULL`;

  // إيقاف التسويق: يمنع الفئات، ولا يمنع رسائل الحجز الخدميّة
  const opted = new Set<string>(isCohort(origin) && locals.length
    ? rowsOf(await db.execute(sql`SELECT phone FROM wa_optouts WHERE phone IN (${inList})`)).map((r: any) => String(r.phone))
    : []);
  // حدّ تكرار الفئات: رسالة فئةٍ للرقم نفسه خلال آخر N أيّام
  const recent = new Set<string>(isCohort(origin) && s.outreach.cohortFreqDays > 0 && locals.length
    ? rowsOf(await db.execute(sql`SELECT DISTINCT c.phone FROM wa_messages m JOIN wa_conversations c ON c.id = m.conversation_id
        WHERE c.phone IN (${inList}) AND m.source = 'outreach' AND m.payload->>'origin' IN ('analytics', 'explorer')
          AND m.status <> 'failed' AND m.created_at > NOW() - (${s.outreach.cohortFreqDays} * INTERVAL '1 day')`)).map((r: any) => String(r.phone))
    : []);
  const convs = new Map<string, any>();
  if (locals.length) for (const c of await db.select().from(waConversations).where(sql`${waConversations.phone} IN (${inList})`)) convs.set(String((c as any).phone), c);

  const eligible: PreviewRow[] = [];
  for (const c of cand) {
    if (opted.has(c.local)) { skipped.optout.push(c.local); continue; }
    if (recent.has(c.local)) { skipped.recent.push(c.local); continue; }
    const conv = convs.get(c.local);
    const norm = normalizeAnyPhone(c.local)!;
    const via = conv
      ? pickChannel(conv, lane).channel
      : pickChannel({ id: 0, phone: c.local, waPhone: norm.wa, channel: 'web', cloudLastInboundAt: null, lastInboundAt: null }, lane).channel;
    if (!via) { skipped.unreachable.push(c.local); continue; }
    const text = isCohort(origin) && !c.text.includes('إيقاف') ? c.text + OPTOUT_FOOTER : c.text;
    eligible.push({
      phone: c.phone, local: c.local, name: String(c.name || conv?.displayName || ''), text,
      playerId: c.playerId ?? conv?.playerId ?? null, reservationId: c.reservationId ?? null,
      conversationId: conv?.id ?? null, via,
      firstContact: via === 'web' && !conv?.webFirstContactAt && !conv?.webLastInboundAt,
    });
  }
  // 🔎 هل لهم واتساب؟ — من يخرج عبر رقم الأعمال يُفحص (ميتا: من راسلنا خلال ٢٤ ساعة له واتساب حتماً).
  //    المخزَّن يُستعمل فوراً، وما لم يُفحص يُفحص في الخلفيّة والنافذة تعيد المعاينة حتّى يكتمل.
  const { cachedChecks, scheduleChecks, pendingOf } = await import('./wa-transport/number-check.js');
  const webLocals = eligible.filter(e => e.via === 'web').map(e => e.local);
  const checks = await cachedChecks(webLocals);
  const notOnWa: Array<{ name: string; phone: string }> = [];
  for (let i = eligible.length - 1; i >= 0; i--) {
    const e = eligible[i];
    if (e.via !== 'web') continue;
    const c = checks.get(e.local);
    if (c && !c.onWa) { skipped.notOnWhatsapp.push(e.local); notOnWa.push({ name: e.name, phone: e.local }); eligible.splice(i, 1); }
  }
  // 📇 فلتر خطّ الأعمال: استبعد من ليس له محادثة (warm) أو من لم يراسلنا (two_way) — حسب الاختيار/الافتراض العامّ
  const lineMap = await lineStatusOf(eligible.filter(e => e.via === 'web').map(e => e.local));
  const isWarm = (st?: string) => st === 'two_way' || st === 'has_chat';
  for (let i = eligible.length - 1; i >= 0; i--) {
    const e = eligible[i];
    if (e.via !== 'web') continue;
    const st = lineMap.get(e.local);
    (e as any).lineStatus = st || 'unknown';
    const pass = lf === 'all' ? true : lf === 'two_way' ? st === 'two_way' : isWarm(st);
    if (!pass) { skipped.noChat.push(e.local); eligible.splice(i, 1); }
  }
  const unchecked = webLocals.filter(p => !checks.has(p));
  if (unchecked.length) scheduleChecks(unchecked);
  const check = { total: webLocals.length, done: webLocals.length - unchecked.length, pending: unchecked.length, inProgress: pendingOf(unchecked) };
  const webN = eligible.filter(e => e.via === 'web').length;
  const byLine = {
    two_way: eligible.filter(e => (e as any).lineStatus === 'two_way').length,
    has_chat: eligible.filter(e => (e as any).lineStatus === 'has_chat').length,
    cold: eligible.filter(e => e.via === 'web' && !isWarm((e as any).lineStatus)).length,
  };
  // ❄️ البارد (أوّل رسالة منّا) يُنثر بسقفه الصغير على أيّام؛ فالتقدير يميّزه عن الدافئ
  const coldN = eligible.filter(e => e.via === 'web' && e.firstContact).length;
  const warmN = webN - coldN;
  // عملٌ تقديريّ: لا يُحسب تدرّج التسخين (يحتاج عمر الجلسة) — يُعطي الحدّ الأعلى المضبوط
  let estimate: any = null;
  if (lane === 'bulk' && webN) {
    const warmDays = Math.ceil(warmN / Math.max(1, s.bulk.dailyCap));
    const coldDays = Math.ceil(coldN / Math.max(1, s.cold.dailyCap));
    estimate = { perDay: s.bulk.dailyCap, coldPerDay: s.cold.dailyCap, warm: warmN, cold: coldN, days: Math.max(warmDays, coldDays, 1) };
  } else if (lane === 'timely' && webN) {
    estimate = { perDay: s.timely.serviceDailyCap, days: Math.ceil(webN / Math.max(1, s.timely.serviceDailyCap)) };
  }
  return {
    origin, lane, direct: directEnabled(),
    total: items.length,
    eligible: eligible.length,
    byChannel: { cloud: eligible.length - webN, web: webN },
    firstContact: coldN,     // «أوّل رسالة منّا» = باردة
    skipped: Object.fromEntries(Object.entries(skipped).map(([k, v]) => [k, v.length])),
    estimate,
    samples: eligible.slice(0, 3).map(e => ({ name: e.name, phone: e.local, text: e.text, via: e.via })),
    check,
    lineFilter: lf,
    byLine,
    notOnWhatsapp: notOnWa.reverse(),
    rows: eligible,
  };
}

/** يضبط «أُرسلت» على الحجز عند خروج الرسالة فعلاً (لا عند النقر كما كان) */
export async function markReservationSent(reservationId: number, by: string): Promise<void> {
  const db = getDB(); if (!db || !reservationId) return;
  await db.update(reservations).set({ waSentAt: new Date(), waSentBy: by || '' } as any).where(eq(reservations.id, reservationId)).catch(() => {});
}

const running = new Set<number>();

export async function startOutreach(input: {
  origin: OutreachOrigin; items: OutreachItem[]; staffId?: number; staffName: string; label?: string; excludePhones?: string[]; lineFilter?: LineFilter;
}): Promise<{ ok: boolean; id?: number; queued?: number; error?: string; preview?: any }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB unavailable' };
  if (!directEnabled()) return { ok: false, error: 'الإرسال المباشر غير مفعّل — فعّل رقم الأعمال ووضعاً غير «ميتا وحدها» من القنوات' };
  const pv = await previewOutreach(input.origin, input.items, input.lineFilter);
  const ex = new Set((input.excludePhones || []).map(p => normalizeAnyPhone(p)?.local).filter(Boolean) as string[]);
  const rows = pv.rows.filter(r => !ex.has(r.local));
  if (!rows.length) return { ok: false, error: 'لا مستلم مؤهّل بعد الاستبعاد', preview: pv };
  const lane = laneOf(input.origin);
  const [b] = await db.insert(waBroadcasts).values({
    body: rows[0].text.slice(0, 2000), totalTargets: rows.length, status: 'running', createdBy: input.staffName,
    origin: input.origin, lane, audienceLabel: String(input.label || '').slice(0, 300),
  } as any).returning();
  const id = Number((b as any).id);
  running.add(id);
  const { sendMessage, isUnreachable } = await import('./whatsapp-inbox.service.js');

  (async () => {
    let sent = 0, skipped = 0, failed = 0, status = 'done';
    for (const r of rows) {
      if (!running.has(id)) { status = 'stopped'; break; }
      try {
        const res: any = await sendMessage({
          ...(r.conversationId ? { conversationId: r.conversationId } : { phone: r.local }),
          text: r.text, source: 'outreach', lane, priority: lane === 'timely' ? 2 : 5,
          staffId: input.staffId, staffName: input.staffName,
          meta: { origin: input.origin, staffName: input.staffName, outreachId: id, ...(r.reservationId ? { reservationId: r.reservationId } : {}) },
        });
        const mid = res?.message?.id ?? null;
        await db.execute(sql`INSERT INTO wa_broadcast_recipients (broadcast_id, conversation_id, wa_message_id, body, player_id, reservation_id)
          VALUES (${id}, ${res?.conversation?.id ?? r.conversationId}, ${mid}, ${r.text}, ${r.playerId}, ${r.reservationId})
          ON CONFLICT DO NOTHING`).catch(() => {});
        if (r.reservationId) {
          await db.update(reservations).set({ waMessageId: mid } as any).where(eq(reservations.id, r.reservationId)).catch(() => {});
          // ميتا ترسل فوراً ⟵ «أُرسلت» الآن · رقم الأعمال ⟵ عند خروجها من الطابور (web.transport)
          if (res?.message?.channel === 'cloud') await markReservationSent(r.reservationId, input.staffName);
        }
        sent++;
        if (res?.message?.channel === 'cloud') await new Promise(x => setTimeout(x, 1300 + Math.random() * 500));
      } catch (e: any) {
        if (isUnreachable(e)) skipped++;
        else if (e?.code === 'SENDING_SUSPENDED') { status = 'stopped'; break; }
        else failed++;
      }
    }
    const { hasQueued } = await import('./whatsapp-broadcast.service.js');
    const finalStatus = status === 'done' && await hasQueued(id) ? 'sending' : status;
    await db.update(waBroadcasts).set({ sentCount: sent, skippedCount: skipped, failedCount: failed, status: finalStatus, finishedAt: finalStatus === 'sending' ? null : new Date() } as any)
      .where(eq(waBroadcasts.id, id)).catch(() => {});
    running.delete(id);
    try { const io = (global as any).io; if (io) io.to('wa:inbox').emit('wa:outreach:done', { id, origin: input.origin, sent, skipped, failed, status }); } catch { /* غير حرج */ }
    console.log(`📤 WA outreach #${id} (${input.origin}) ${status}: queued=${sent} skipped=${skipped} failed=${failed} by ${input.staffName}`);
  })().catch(e => { running.delete(id); console.error('❌ WA outreach loop:', e?.message); });

  return { ok: true, id, queued: rows.length, preview: { ...pv, rows: undefined } };
}

export async function stopOutreach(id: number): Promise<void> {
  running.delete(Number(id));
  const { stopBroadcast } = await import('./whatsapp-broadcast.service.js');
  await stopBroadcast(Number(id));
}

/** تقدّم دفعة: من حالات رسائلها */
export async function outreachProgress(id: number) {
  const db = getDB(); if (!db) return null;
  const [b] = rowsOf(await db.execute(sql`SELECT id, origin, lane, status, total_targets, sent_count, skipped_count, failed_count, created_at, finished_at, created_by, audience_label
    FROM wa_broadcasts WHERE id = ${Number(id)}`));
  if (!b) return null;
  const [st] = rowsOf(await db.execute(sql`SELECT
      COUNT(*) FILTER (WHERE m.status IN ('queued', 'sending'))::int AS queued,
      COUNT(*) FILTER (WHERE m.status = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE m.status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE m.status = 'read')::int AS read,
      COUNT(*) FILTER (WHERE m.status = 'failed')::int AS failed
    FROM wa_broadcast_recipients r JOIN wa_messages m ON m.id = r.wa_message_id WHERE r.broadcast_id = ${Number(id)}`));
  return { ...b, messages: st || null, running: running.has(Number(id)) };
}

/** حالة رسائل الحجوزات (للعلامات بجانب كلّ حجز) */
export async function reservationWaStatuses(messageIds: number[]): Promise<Map<number, string>> {
  const db = getDB(); const out = new Map<number, string>();
  if (!db || !messageIds.length) return out;
  const r = rowsOf(await db.execute(sql`SELECT id, status FROM wa_messages WHERE id IN (${sql.join(messageIds.map(i => sql`${i}`), sql`, `)})`));
  for (const x of r) out.set(Number(x.id), String(x.status || ''));
  return out;
}
