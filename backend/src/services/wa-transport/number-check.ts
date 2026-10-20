// ══════════════════════════════════════════════════════
// 🔎 هل للرقم واتساب؟ — فحصٌ قبل الإرسال من الصفحات (طلب المالك 2026-10-20)
// ══════════════════════════════════════════════════════
// البثّ #23 من المستكشف: رسالةٌ فشلت لأنّ الرقم بلا واتساب أصلاً. المعاينة صارت تفحص الأرقام
// عبر البوّابة (contacts/check) وتستبعد من لا واتساب له قبل أن يُرسل شيء.
//
// الفحص بطيء عمداً (البوّابة تحدّ ~100 طلب/دقيقة، فالعميل يباعد 700ms): ١٣٣ رقماً ≈ دقيقة ونصف —
// أطول من حدّ Cloudflare (100ث) لطلبٍ واحد. لذلك: النتائج مخزّنة في القاعدة (له واتساب ٣٠ يوماً،
// بلا واتساب ٣ أيّام — قد يُنشئ حساباً)، وما لم يُفحص يُفحص في الخلفيّة والنافذة تسأل كلّ بضع ثوانٍ.
// ويتعلّم النظام أيضاً من الإرسال نفسه: رفضُ البوّابة «لا يمكن الوصول للمستلم» يُسجَّل «بلا واتساب».

import { sql } from 'drizzle-orm';
import { getDB } from '../../config/db.js';
import { normalizeAnyPhone } from '../../utils/phone.util.js';
import { isWebReady, webConfigured } from './router.js';
import * as gw from './openwa.client.js';

const TTL_YES_DAYS = 30;
const TTL_NO_DAYS = 3;
const inflight = new Set<string>();
let worker: Promise<void> | null = null;
const queue: string[] = [];

export interface NumberCheck { onWa: boolean; at: Date }

/** النتائج المخزّنة الصالحة لأرقامٍ محلّيّة (07… أو دوليّة لغير الأردنيّ) */
export async function cachedChecks(locals: string[]): Promise<Map<string, NumberCheck>> {
  const out = new Map<string, NumberCheck>();
  const db = getDB();
  if (!db || !locals.length) return out;
  const r: any = await db.execute(sql`SELECT phone, on_wa, checked_at FROM wa_number_checks
    WHERE phone IN (${sql.join(locals.map(p => sql`${p}`), sql`, `)})
      AND checked_at > NOW() - (CASE WHEN on_wa THEN ${TTL_YES_DAYS} ELSE ${TTL_NO_DAYS} END * INTERVAL '1 day')`);
  for (const x of (r?.rows ?? r ?? [])) out.set(String(x.phone), { onWa: !!x.on_wa, at: new Date(x.checked_at) });
  return out;
}

export async function recordCheck(local: string, onWa: boolean, waId: string | null = null): Promise<void> {
  const db = getDB(); if (!db || !local) return;
  await db.execute(sql`INSERT INTO wa_number_checks (phone, on_wa, wa_id, checked_at) VALUES (${local}, ${onWa}, ${waId}, NOW())
    ON CONFLICT (phone) DO UPDATE SET on_wa = EXCLUDED.on_wa, wa_id = COALESCE(EXCLUDED.wa_id, wa_number_checks.wa_id), checked_at = NOW()`).catch(() => {});
}

/** من معرّف محادثة البوّابة (9627…@c.us) إلى الرقم المحلّيّ */
export function localFromChatId(chatId: string): string | null {
  const d = String(chatId || '').split('@')[0].replace(/\D/g, '');
  return d ? (normalizeAnyPhone(d)?.local || null) : null;
}

/** يدخل الأرقام غير المفحوصة طابورَ الفحص في الخلفيّة (بلا انتظار) */
export function scheduleChecks(locals: string[]): void {
  if (!webConfigured()) return;
  for (const p of locals) if (!inflight.has(p)) { inflight.add(p); queue.push(p); }
  if (!worker) worker = run().finally(() => { worker = null; });
}

async function run(): Promise<void> {
  while (queue.length) {
    if (!isWebReady()) { await new Promise(r => setTimeout(r, 15000)); continue; }
    const local = queue.shift()!;
    try {
      const norm = normalizeAnyPhone(local);
      if (norm) {
        const r = await gw.checkNumber(norm.wa);   // متباعدٌ 700ms داخل العميل
        if (r && typeof r.exists === 'boolean') await recordCheck(local, r.exists, r.whatsappId || null);
      }
    } catch { /* يُعاد في معاينةٍ لاحقة */ }
    finally { inflight.delete(local); }
  }
}

/** كم رقماً ما زال قيد الفحص من هذه القائمة */
export function pendingOf(locals: string[]): number {
  return locals.filter(p => inflight.has(p)).length;
}
