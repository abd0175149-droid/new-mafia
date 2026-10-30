// ══════════════════════════════════════════════════════
// 🧾 فواتير واتساب — ملفّ اللاعب صورةً على واتساب (2026-10-30، التصوّر المعتمد)
//   https://claude.ai/artifact/HUGZbxLhTWNPvinynEQSh2
//
// متى يُرسل شيء:
//   • «وُصِّل» على طلب ⟵ ملفٌّ «مطلوب» محدّث بعد دقيقة (طلبان متقاربان = صورة واحدة)
//   • لم يطلب ولعب جولة ومرّت ٩٠ دقيقة على دخوله الغرفة ⟵ ملفٌّ تلقائيّ (دخوليّة + تكملة الحدّ)
//   • «حصّل» ⟵ ختم «القضيّة مُغلقة» بعد مهلة التراجع؛ التراجع خلالها يلغيه
//   • البوت: «شو حسابي؟» ⟵ آخر ملفّ فوراً · الكونسول: «أعد الإرسال»
//   • صورة حوالة كليك من لاعبٍ عليه ملفٌّ مفتوح ⟵ تُقرأ بالذكاء، والحوالة وحدها تُحوَّل لرقم المكان
//
// قرارات المالك المقفلة: القناة = آخر رقم حكى منه اللاعب (والآخر بديلاً) · مسار «invoice» بلا أيّ
// سقفٍ ولا ساعاتٍ ولا فاصل ولا يُحسب مع غيره · الدخوليّة مرّة واحدة · الحدّ الأدنى تكملة كما هو ·
// الملفّ التلقائيّ ينتظر حتّى يلعب · الصورة لا PDF · مفتاحٌ واحد في الداشبورد يوقف كلّ هذا.
//
// السجلّ: invoice_wa_jobs — صفٌّ لكلّ إرسال (pending ⟵ sending ⟵ sent|failed|skipped|cancelled).
// الطابور في القاعدة لا في الذاكرة: إعادة التشغيل لا تُضيّع ختماً ولا تُكرّر فاتورة.
// ══════════════════════════════════════════════════════

import fs from 'fs';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { getDB, type Database } from '../config/db.js';
import { locations } from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { buildInvoiceData, issueInvoiceNumber, invoiceImageHtml, nightRecordOf, type InvoiceData, type PaymentInfo } from './fnb-invoice.service.js';
import { UNDO_WINDOW_MS } from './fnb-ledger.service.js';
import { normalizeLocalPhone } from '../utils/phone.util.js';

const FLAG = 'invoice_wa';
/** «وُصِّل» ثمّ دقيقة هدوء ثمّ صورة واحدة (القرار ٣) */
export const OPEN_DEBOUNCE_MS = 60_000;
/** الختم بعد مهلة التراجع وهامشٍ صغير — فلا يصل ختمٌ لتحصيلٍ تُراجع عنه */
export const PAID_DELAY_MS = UNDO_WINDOW_MS + 5_000;
/** الملفّ التلقائيّ: ساعة ونصف من دخول الغرفة */
export const AUTO_AFTER_MIN = 90;
const DIR = 'uploads/private/wa-invoices';
const rows = (r: any): any[] => r?.rows ?? r ?? [];
const n = (x: unknown) => { const v = parseFloat(String(x ?? '0')); return Number.isFinite(v) ? v : 0; };
const f2 = (x: number) => (Math.round((Number(x) || 0) * 100) / 100).toFixed(2);

let io: any = null;

/** 🧪 للفحوص وحدها (e2e-invoice-wa): مفتاحٌ مفروض بلا لمس علم القاعدة، والسماح بموقع الاختبار */
export const testHooks: { forceEnabled: boolean | null; allowTestLocation: boolean } = { forceEnabled: null, allowTestLocation: false };

// ── المفتاح (الداشبورد) ───────────────────────────────
let flagCache: { on: boolean; at: number } | null = null;
export async function invoiceWaEnabled(): Promise<boolean> {
  if (testHooks.forceEnabled !== null) return testHooks.forceEnabled;
  if (flagCache && Date.now() - flagCache.at < 15_000) return flagCache.on;
  const db = getDB(); if (!db) return false;
  try {
    const [r] = rows(await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG} LIMIT 1`));
    flagCache = { on: r?.value?.enabled === true, at: Date.now() };
  } catch { flagCache = { on: false, at: Date.now() }; }
  return flagCache.on;
}
export async function setInvoiceWaEnabled(on: boolean, by: string): Promise<void> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at)
    VALUES (${FLAG}, ${JSON.stringify({ enabled: on, by, at: new Date().toISOString() })}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  flagCache = { on, at: Date.now() };
  // الإطفاء يُسقط المنتظر — لا تخرج رسائل متراكمة لحظة إعادة التشغيل لاحقاً
  if (!on) await db.execute(sql`UPDATE invoice_wa_jobs SET status = 'cancelled', reason = 'أُطفئ الإرسال من الداشبورد'
    WHERE status = 'pending'`);
}

/** حالة البطاقة في الداشبورد: المفتاح + القناتان + عدّاد الليلة */
export async function invoiceWaStatus(): Promise<any> {
  const db = getDB();
  const on = await invoiceWaEnabled();
  let web = false, cloud = false;
  try { const r = await import('./wa-transport/router.js'); web = r.isWebReady(); } catch { /* */ }
  try { const c = await import('./wa-transport/cloud.transport.js'); cloud = c.cloudConfigured(); } catch { /* */ }
  const raw: any = db ? (await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = ${FLAG}`)) : null;
  const meta = rows(raw)[0]?.value || {};
  const [t] = db ? rows(await db.execute(sql`SELECT
      COUNT(*) FILTER (WHERE kind IN ('open','auto','bot','manual') AND status = 'sent')::int AS invoices,
      COUNT(*) FILTER (WHERE kind = 'paid' AND status = 'sent')::int AS stamps,
      COUNT(*) FILTER (WHERE kind = 'transfer' AND status = 'sent')::int AS transfers,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM invoice_wa_jobs WHERE created_at >= NOW() - INTERVAL '14 hours'`)) : [{}];
  return { enabled: on, by: meta.by || '', at: meta.at || null, channels: { web, cloud }, tonight: t || {}, testLocationAlwaysOn: true };
}

// ── التجدول ───────────────────────────────────────────
async function isTestLocation(db: Database, locId: number): Promise<boolean> {
  if (testHooks.allowTestLocation) return false;
  const [l] = await db.select({ t: locations.isTestLocation }).from(locations).where(eq(locations.id, locId)).limit(1);
  return l?.t === true;
}

/**
 * وضع المكان:
 *   live — مكانٌ حقيقيّ والمفتاح شغّال · off — المفتاح مطفأ
 *   test — موقع اختبار: يعمل **دائماً** ولو كان المفتاح مطفأً (قرار المالك 2026-10-30: «الاختبار على
 *          مكان الاختبار، لا ننتظر لعبةً حقيقيّة»)، ويصل **حسابات الموظّفين وحدها** (players.linked_staff_id)
 *          — استثناءٌ ضيّق من قاعدة «موقع الاختبار لا يصل واتساب» التي وُضعت كي لا يُراسَل عميلٌ حقيقيّ منه.
 */
export async function locMode(locId: number): Promise<'live' | 'test' | 'off'> {
  const db = getDB(); if (!db) return 'off';
  if (await isTestLocation(db, locId)) return 'test';
  return (await invoiceWaEnabled()) ? 'live' : 'off';
}
/** للمسارات والكونسول: هل يُرسل شيءٌ من هذا المكان الآن؟ */
export async function invoiceWaActiveFor(locId: number): Promise<boolean> {
  return (await locMode(locId)) !== 'off';
}

function emit(locId: number, payload: any): void {
  try { io?.to(`location:${locId}`).emit('fnb:invoice-wa', payload); } catch { /* تكميليّ */ }
}

/**
 * ملفٌّ مفتوح ينتظر الإرسال: «وُصِّل» يؤجّل موعد الصفّ المنتظر نفسه (لا رسالة ثانية)،
 * و«الآن» (البوت/أعد الإرسال) يُلغي المنتظر ويُرسل فوراً.
 */
export async function scheduleOpen(locId: number, activityId: number, playerId: number,
  opts: { kind?: 'open' | 'auto' | 'bot' | 'manual'; delayMs?: number; staffId?: number | null; invoiceId?: number | null; claim?: boolean } = {}): Promise<number | null> {
  const db = getDB(); if (!db) return null;
  if ((await locMode(locId)) === 'off') return null;
  const kind = opts.kind || 'open';
  const due = new Date(Date.now() + (opts.delayMs ?? (kind === 'open' ? OPEN_DEBOUNCE_MS : 0)));
  if (kind === 'open' || kind === 'auto') {
    const r = rows(await db.execute(sql`INSERT INTO invoice_wa_jobs (location_id, activity_id, player_id, kind, due_at, staff_id)
      VALUES (${locId}, ${activityId}, ${playerId}, ${kind}, ${due.toISOString()}::timestamptz, ${opts.staffId ?? null})
      ON CONFLICT (activity_id, player_id) WHERE status = 'pending' AND kind IN ('open', 'auto')
      DO UPDATE SET due_at = GREATEST(invoice_wa_jobs.due_at, EXCLUDED.due_at), kind = EXCLUDED.kind
      RETURNING id`));
    kick();
    return r[0]?.id ?? null;
  }
  // فوريّ: ما كان منتظراً صار هذا
  await db.execute(sql`UPDATE invoice_wa_jobs SET status = 'cancelled', reason = 'أُرسل فوراً بطلب'
    WHERE activity_id = ${activityId} AND player_id = ${playerId} AND status = 'pending' AND kind IN ('open', 'auto')`);
  // claim: من يطلبه يعالجه بنفسه الآن (البوت ينتظر النتيجة) — لا يلتقطه العامل قبله
  const r = rows(await db.execute(sql`INSERT INTO invoice_wa_jobs (location_id, activity_id, player_id, kind, invoice_id, due_at, staff_id, status)
    VALUES (${locId}, ${activityId}, ${playerId}, ${kind}, ${opts.invoiceId ?? null}, NOW(), ${opts.staffId ?? null}, ${opts.claim ? 'sending' : 'pending'}) RETURNING id`));
  if (!opts.claim) kick();
  return r[0]?.id ?? null;
}

/** «حصّل» ⟵ الختم بعد مهلة التراجع */
export async function schedulePaidStamp(locId: number, activityId: number, playerId: number, invoiceId: number, staffId: number | null): Promise<void> {
  const db = getDB(); if (!db) return;
  if ((await locMode(locId)) === 'off') return;
  // ما كان ينتظر من «مطلوب» لهذه الفاتورة لم يعد صحيحاً — المحصَّل لا يُطالَب به
  await db.execute(sql`UPDATE invoice_wa_jobs SET status = 'cancelled', reason = 'حُصّلت قبل الإرسال'
    WHERE activity_id = ${activityId} AND player_id = ${playerId} AND status = 'pending' AND kind IN ('open', 'auto')`);
  await db.execute(sql`INSERT INTO invoice_wa_jobs (location_id, activity_id, player_id, kind, invoice_id, due_at, staff_id)
    VALUES (${locId}, ${activityId}, ${playerId}, 'paid', ${invoiceId}, ${new Date(Date.now() + PAID_DELAY_MS).toISOString()}::timestamptz, ${staffId})`);
}

/** «تراجع» خلال المهلة ⟵ لا ختم */
export async function cancelPaidStamp(invoiceId: number): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r = rows(await db.execute(sql`UPDATE invoice_wa_jobs SET status = 'cancelled', reason = 'تراجع الكاشير عن التحصيل'
    WHERE invoice_id = ${invoiceId} AND kind = 'paid' AND status = 'pending' RETURNING id`));
  return r.length;
}

// ── النصوص ────────────────────────────────────────────
const firstName = (s: string) => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim().split(/\s+/)[0] || '';

/** طرق الدفع كما تُكتب في الرسالة — نقدٌ وبطاقة سطرٌ واحد، وكليك بتفاصيله */
export function paymentText(p: PaymentInfo): string {
  const lines: string[] = [];
  const over = [p.cash ? 'نقداً' : '', p.card ? 'بطاقة (فيزا)' : ''].filter(Boolean).join(' أو ');
  if (over) lines.push(`• ${over} عند الكاشير`);
  if (p.cliq) {
    lines.push(`• كليك — ${p.cliq.method === 'phone' ? 'رقم الهاتف' : 'اسم المستخدم'}: ${p.cliq.value}`);
    const d = [p.cliq.bank ? `البنك: ${p.cliq.bank}` : '', p.cliq.name ? `يظهر باسم: ${p.cliq.name}` : ''].filter(Boolean).join(' · ');
    if (d) lines.push(`  ${d}`);
  }
  if (!lines.length) return '';
  let t = `طرق الدفع:\n${lines.join('\n')}`;
  if (p.cliq) t += '\n\nإذا حوّلت عبر كليك ردّ على هذه الرسالة بصورة الحوالة ليؤكّدها الموظّف.';
  return t;
}

export function openCaption(kind: string, d: InvoiceData, no: number, opts: { updated?: boolean; name?: string; paidBefore?: { no: number; total: number }[] } = {}): string {
  const first = firstName(opts.name || d.playerName);
  const file = `#${String(no).padStart(4, '0')}`;
  const total = f2(d.grandTotal);
  let head: string;
  if (kind === 'auto') {
    head = `🕵️ ${first}، هذا ملفّك الليلة ${file} — المطلوب ${total} د.أ.`;
    if (d.minTopup > 0) head += `\nفيه ${f2(d.minTopup)} د.أ تكملةُ حدٍّ أدنى يفرضه المكان على كلّ لاعب. اطلب الآن من التطبيق وتُستبدل بطلبك.`;
  } else if (kind === 'bot' || kind === 'manual') {
    const paid = (opts.paidBefore || []).map(p => `• حصّلنا منك ${f2(p.total)} د.أ — ملفّ #${String(p.no).padStart(4, '0')} (مغلق)`);
    head = paid.length
      ? `حسابك الليلة يا ${first}:\n${paid.join('\n')}\n• الباقي ${total} د.أ — ملفّ ${file}`
      : `ملفّك الليلة ${file} — المطلوب ${total} د.أ.`;
  } else if (opts.updated) {
    head = `حدّثنا ملفّك ${file} بعد طلبك الجديد.\nالمطلوب الآن ${total} د.أ${d.gameFeeApplied ? ' (الدخوليّة محسوبة مرّة واحدة)' : ''}.`;
  } else {
    head = `🕵️ ${first}، طلبك وصل الطاولة.\nملفّك ${file} — المطلوب ${total} د.أ`;
  }
  const pay = paymentText(d.payment);
  return pay ? `${head}\n\n${pay}` : head;
}

export function paidCaption(d: InvoiceData, no: number, name?: string): string {
  return `✅ تمّ تحصيل ${f2(d.grandTotal)} د.أ — أُغلقت القضيّة #${String(no).padStart(4, '0')}.\nشكراً ${firstName(name || d.playerName)}، نراك في الليلة القادمة.`;
}

// ── الإرسال ───────────────────────────────────────────
/** يُستبدل في الفحوص — الإرسال الحقيقيّ عبر sendMessage (المسار invoice) */
export const sender = {
  async image(phone: string, localPath: string, caption: string, meta: any): Promise<{ channel: string | null }> {
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    const r: any = await sendMessage({ phone, image: { localPath, caption }, source: 'system', lane: 'invoice', meta });
    return { channel: r?.message?.channel ?? null };
  },
  async text(phone: string, text: string, meta: any): Promise<void> {
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    await sendMessage({ phone, text, source: 'system', lane: 'invoice', meta });
  },
  async render(html: string): Promise<Buffer> {
    const { renderRawHtmlImage } = await import('../reports/render/pdf.js');
    return renderRawHtmlImage(html, { selector: '.doc' });
  },
};

async function finish(id: number, status: string, patch: { reason?: string; channel?: string | null; invoiceNo?: number | null; total?: number | null; details?: any } = {}): Promise<any> {
  const db = getDB(); if (!db) return null;
  const [r] = rows(await db.execute(sql`UPDATE invoice_wa_jobs SET status = ${status}, reason = ${patch.reason ?? ''},
      channel = COALESCE(${patch.channel ?? null}, channel), invoice_no = COALESCE(${patch.invoiceNo ?? null}, invoice_no),
      total = COALESCE(${patch.total ?? null}, total), details = details || ${JSON.stringify(patch.details || {})}::jsonb,
      sent_at = CASE WHEN ${status} = 'sent' THEN NOW() ELSE sent_at END
    WHERE id = ${id} RETURNING *`));
  if (r) emit(Number(r.location_id), { activityId: Number(r.activity_id), playerId: Number(r.player_id), kind: r.kind, status });
  return r;
}

async function saveImage(buf: Buffer): Promise<string> {
  await fs.promises.mkdir(DIR, { recursive: true });
  const p = `${DIR}/${crypto.randomBytes(12).toString('hex')}.jpg`;
  await fs.promises.writeFile(p, buf);
  return p;
}

/** يعالج صفّاً واحداً — ثابتٌ أمام الإعادة: كلّ مسارٍ ينتهي بحالةٍ نهائيّة */
export async function processJob(job: any): Promise<any> {
  const db = getDB(); if (!db) return null;
  const id = Number(job.id);
  const locId = Number(job.location_id), activityId = Number(job.activity_id), playerId = Number(job.player_id);
  try {
    const mode = await locMode(locId);
    if (mode === 'off') return finish(id, 'skipped', { reason: 'الإرسال مطفأ من الداشبورد' });
    const [pl] = await db.select({ phone: players.phone, name: players.name, staff: players.linkedStaffId }).from(players).where(eq(players.id, playerId)).limit(1);
    if (mode === 'test' && !pl?.staff) return finish(id, 'skipped', { reason: 'موقع اختبار — يصل حسابات الموظّفين فقط' });
    const phone = normalizeLocalPhone(pl?.phone || '');
    if (!phone) return finish(id, 'failed', { reason: 'لا رقم هاتف صالح للّاعب' });

    const record = await nightRecordOf(db, activityId, playerId).catch(() => null);
    const paidMode = job.kind === 'paid' || (job.kind === 'bot' && job.invoice_id) || (job.kind === 'manual' && job.invoice_id);

    if (paidMode) {
      const data = await buildInvoiceData(db, locId, activityId, playerId, { invoiceId: Number(job.invoice_id) });
      if ('error' in data) return finish(id, 'cancelled', { reason: data.error });
      if (!data.paidAt) return finish(id, 'cancelled', { reason: 'لم تعد محصَّلة' });
      const [inv] = rows(await db.execute(sql`SELECT invoice_no FROM order_invoices WHERE id = ${job.invoice_id}`));
      const no = Number(inv?.invoice_no) || 0;
      const file = await saveImage(await sender.render(invoiceImageHtml(data, no, '', record)));
      let cap = paidCaption(data, no, pl?.name || '');
      if (job.kind === 'bot') {
        const paid = rows(await db.execute(sql`SELECT invoice_no AS no, grand_total AS total FROM order_invoices
          WHERE location_id = ${locId} AND activity_id = ${activityId} AND player_id = ${playerId} AND is_paid ORDER BY paid_at`));
        cap = `حسابك الليلة يا ${firstName(pl?.name || data.playerName)}:\n${paid.map((p: any) => `• حصّلنا منك ${f2(n(p.total))} د.أ — ملفّ #${String(p.no).padStart(4, '0')} (مغلق)`).join('\n')}\n\n✅ لا شيء عليك الآن.`;
      }
      const sent = await sender.image(phone, file, cap, { invoiceWa: id });
      return finish(id, 'sent', { channel: sent.channel, invoiceNo: no, total: data.grandTotal });
    }

    const data = await buildInvoiceData(db, locId, activityId, playerId);
    if ('error' in data) return finish(id, 'skipped', { reason: data.error });
    if (data.grandTotal <= 0) return finish(id, 'skipped', { reason: 'لا مبلغ مطلوب' });
    if (job.kind === 'auto') {
      // طلب في الأثناء ⟵ «وُصِّل» يرسل ملفّه بنفسه
      const [o] = rows(await db.execute(sql`SELECT 1 FROM orders WHERE activity_id = ${activityId} AND player_id = ${playerId} AND status <> 'cancelled' LIMIT 1`));
      if (o) return finish(id, 'skipped', { reason: 'طلب في الأثناء' });
    }
    const no = await issueInvoiceNumber(db, data, (job.staff_id ?? null) as any);
    const [prev] = rows(await db.execute(sql`SELECT 1 FROM invoice_wa_jobs WHERE activity_id = ${activityId} AND player_id = ${playerId}
      AND invoice_no = ${no} AND status = 'sent' AND kind IN ('open', 'auto', 'bot', 'manual') AND id <> ${id} LIMIT 1`));
    const paidBefore = rows(await db.execute(sql`SELECT invoice_no AS no, grand_total AS total FROM order_invoices
      WHERE location_id = ${locId} AND activity_id = ${activityId} AND player_id = ${playerId} AND is_paid ORDER BY paid_at`))
      .map((x: any) => ({ no: Number(x.no), total: n(x.total) }));
    const caption = openCaption(job.kind, data, no, { updated: !!prev, name: pl?.name || '', paidBefore });
    const file = await saveImage(await sender.render(invoiceImageHtml(data, no, '', record)));
    const sent = await sender.image(phone, file, caption, { invoiceWa: id });
    // 📋 القيمة وحدها في رسالة — ضغطةٌ مطوّلة تنسخها بلا نصٍّ زائد
    if (data.payment.cliq) await sender.text(phone, data.payment.cliq.value, { invoiceWa: id, cliqCopy: true }).catch(() => {});
    return finish(id, 'sent', { channel: sent.channel, invoiceNo: no, total: data.grandTotal });
  } catch (e: any) {
    const reason = e?.code === 'CHANNEL_UNAVAILABLE' || e?.code === 'WINDOW_EXPIRED' ? 'بانتظار القناة — رقم الأعمال غير متّصل ونافذة ميتا مغلقة'
      : e?.code === 'SENDING_SUSPENDED' ? `الإرسال مقفل: ${e.message}` : (e?.message || 'فشل');
    console.warn(`⚠️ invoice-wa job ${id}:`, reason);
    return finish(id, 'failed', { reason: String(reason).slice(0, 300) });
  }
}

// ── العامل ────────────────────────────────────────────
let busy = false;
function kick(): void { setTimeout(() => { void tick(); }, 50); }

export async function tick(): Promise<number> {
  if (busy) return 0;
  busy = true;
  let done = 0;
  try {
    const db = getDB(); if (!db) return 0;
    for (;;) {
      const [job] = rows(await db.execute(sql`UPDATE invoice_wa_jobs SET status = 'sending'
        WHERE id = (SELECT id FROM invoice_wa_jobs WHERE status = 'pending' AND due_at <= NOW() AND kind <> 'transfer'
                     ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`));
      if (!job) break;
      await processJob(job);
      done++;
    }
  } catch (e: any) { console.warn('⚠️ invoice-wa tick:', e?.message); }
  finally { busy = false; }
  return done;
}

/**
 * ⏱ الملفّ التلقائيّ: لعب جولة على الأقلّ (القرار ٢: ينتظر حتّى يلعب)، ومرّت ٩٠ دقيقة على دخوله الغرفة،
 * ولا طلبات له، ولا ملفّ أُرسل له الليلة. يُرسل مرّةً واحدة في الليلة.
 */
export async function sweepAuto(delayMs = 0, onlyActivityId: number | null = null): Promise<number> {
  const db = getDB(); if (!db) return 0;
  // المفتاح مطفأ ⟵ مواقع الاختبار وحدها (تعمل دائماً لحسابات الموظّفين)
  const on = await invoiceWaEnabled();
  const cands = rows(await db.execute(sql`
    SELECT a.id AS activity_id, a.location_id, sp.player_id
    FROM session_players sp
    JOIN sessions s ON s.id = sp.session_id
    JOIN activities a ON a.id = s.activity_id
    JOIN locations l ON l.id = a.location_id
    WHERE sp.player_id IS NOT NULL AND a.deleted_at IS NULL
      AND (${testHooks.allowTestLocation} OR COALESCE(l.is_test_location, false) = true OR ${on})
      AND (${onlyActivityId}::int IS NULL OR a.id = ${onlyActivityId}::int)
      AND sp.joined_at > NOW() - INTERVAL '12 hours'
    GROUP BY a.id, a.location_id, sp.player_id
    HAVING MIN(sp.joined_at) <= NOW() - (${AUTO_AFTER_MIN} * INTERVAL '1 minute')
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.activity_id = a.id AND o.player_id = sp.player_id AND o.status <> 'cancelled')
       AND NOT EXISTS (SELECT 1 FROM invoice_wa_jobs j WHERE j.activity_id = a.id AND j.player_id = sp.player_id
                        AND j.kind IN ('open', 'auto', 'bot', 'manual') AND j.status <> 'cancelled')
       AND EXISTS (SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s2 ON s2.id = m.session_id
                    WHERE s2.activity_id = a.id AND mp.player_id = sp.player_id)
    LIMIT 50`));
  for (const c of cands) await scheduleOpen(Number(c.location_id), Number(c.activity_id), Number(c.player_id), { kind: 'auto', delayMs });
  return cands.length;
}

export function startInvoiceWa(ioRef: any): void {
  io = ioRef;
  const db = getDB();
  // ما بقي «sending» من تشغيلٍ انقطع ⟵ يعود منتظراً (الإرسال قبل الانقطاع غير مؤكَّد — الأسلم إعادته)
  if (db) db.execute(sql`UPDATE invoice_wa_jobs SET status = 'pending' WHERE status = 'sending' AND created_at > NOW() - INTERVAL '1 day'`).catch(() => {});
  const t1 = setInterval(() => { void tick(); }, 5_000); t1.unref?.();
  const t2 = setInterval(() => { void sweepAuto().catch(e => console.warn('⚠️ invoice-wa auto:', e?.message)); }, 60_000); t2.unref?.();
  console.log('🧾 invoice-wa worker started');
}

// ══════════════════════════════════════════════════════
// 🤖 البوت: «شو حسابي؟» — آخر ملفّ صورةً + ما حُصّل وما بقي
// ══════════════════════════════════════════════════════
export async function invoiceForBot(locId: number, activityId: number, playerId: number): Promise<any> {
  const db = getDB(); if (!db) return { imageSent: false };
  const paid = rows(await db.execute(sql`SELECT id, invoice_no AS no, grand_total AS total FROM order_invoices
    WHERE location_id = ${locId} AND activity_id = ${activityId} AND player_id = ${playerId} AND is_paid ORDER BY paid_at`))
    .map((x: any) => ({ id: Number(x.id), no: Number(x.no), total: n(x.total) }));
  const open = await buildInvoiceData(db, locId, activityId, playerId);
  const hasOpen = !('error' in open) && open.grandTotal > 0;
  const summary: any = {
    paidInvoices: paid.map(p => ({ invoiceNo: p.no, totalJOD: p.total })),
    paidTotalJOD: Math.round(paid.reduce((s, p) => s + p.total, 0) * 100) / 100,
    remainingJOD: hasOpen ? (open as InvoiceData).grandTotal : 0,
  };
  if ((await locMode(locId)) === 'off') return { ...summary, imageSent: false, imageNote: 'إرسال الصور مطفأ — أجبه نصّاً بالأرقام' };
  const last = paid[paid.length - 1];
  if (!hasOpen && !last) return { ...summary, imageSent: false };
  const jobId = await scheduleOpen(locId, activityId, playerId, hasOpen ? { kind: 'bot', claim: true } : { kind: 'bot', invoiceId: last.id, claim: true });
  if (!jobId) return { ...summary, imageSent: false };
  const [job] = rows(await db.execute(sql`SELECT * FROM invoice_wa_jobs WHERE id = ${jobId}`));
  const r = job ? await processJob(job) : null;
  return { ...summary, imageSent: r?.status === 'sent', imageNote: r?.status === 'sent' ? 'أُرسلت له صورة ملفّه الآن مع طرق الدفع — لا تكرّر الأرقام كلّها، لخّص ما حُصّل وما بقي فقط' : `لم تُرسل الصورة: ${r?.reason || ''}` };
}

// ══════════════════════════════════════════════════════
// 💳 صورة حوالة من اللاعب — تُقرأ قبل البوت (القرار ٤: الحوالة وحدها تُحوَّل)
// ══════════════════════════════════════════════════════
export interface TransferRead { ok: boolean; isTransfer: boolean; amount: number | null; payee: string; method: string }

/** يُستبدل في الفحوص — قراءةٌ بـGemini بالمفتاح والنموذج نفسيهما للبوت */
export const reader = {
  async read(bin: Buffer, mime: string): Promise<TransferRead> {
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const st: any = await getBotSettings();
    if (!st?.geminiApiKey) return { ok: false, isTransfer: false, amount: null, payee: '', method: '' };
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${st.model || 'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(st.geminiApiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: mime, data: bin.toString('base64') } },
            { text: 'هل هذه الصورة لقطةُ شاشةٍ أو إيصالٌ لتحويلٍ ماليّ ناجح (كليك CliQ، تحويل بنكيّ، محفظة إلكترونيّة)؟ أجب JSON فقط: {"is_transfer": true|false, "amount": رقم أو null, "currency": "JOD" أو غيره, "payee": "اسم المستفيد أو المستلم كما يظهر" أو "", "method": "cliq|bank|wallet|other"}. صورةٌ لطاولة أو أشخاص أو طلبٍ أو فاتورتنا نفسها ليست تحويلاً.' },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
      });
      const j: any = await res.json().catch(() => ({}));
      const txt = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
      const o = JSON.parse(txt.replace(/^```json|```$/g, '').trim());
      const amt = o?.amount == null ? null : parseFloat(String(o.amount).replace(/[^\d.]/g, ''));
      return { ok: true, isTransfer: o?.is_transfer === true, amount: Number.isFinite(amt) ? amt : null, payee: String(o?.payee || '').slice(0, 100), method: String(o?.method || '') };
    } catch {
      return { ok: false, isTransfer: false, amount: null, payee: '', method: '' };
    } finally { clearTimeout(t); }
  },
};

/** الاسم المقروء من الحوالة مقابل اسم كليك المكان: يكفي جزءٌ مشترك (القراءة تقصّ أحرفاً)؛ ونصّان بخطّين
 *  مختلفين (عربيّ/لاتينيّ) لا يُحكم عليهما — لا إنذار كاذب لاسمٍ صحيحٍ مكتوبٍ بالإنجليزيّة */
export function payeeDiffers(read: string, expected: string): boolean {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^a-z\u0621-\u064A\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3);
  const a = norm(read), b = norm(expected);
  if (!a.length || !b.length) return false;
  const latin = (t: string[]) => t.some(x => /[a-z]/.test(x));
  if (latin(a) !== latin(b)) return false;
  return !a.some(x => b.some(y => x.includes(y) || y.includes(x)));
}

const TRANSFER_ACK = 'وصلتنا صورة الحوالة 👍 حوّلناها للمكان، وأوّل ما يتأكّد الموظّف بيوصلك ختم «القضيّة مُغلقة».';

/**
 * true = عولجت (لا تمرّ للبوت). شروطها: المفتاح شغّال، صورة، لاعبٌ معروف، وصله ملفّ مطلوب الليلة
 * ولا يزال عليه مبلغ، والمكان يقبل كليك. غير الحوالة تعود للبوت؛ وتعطّل القراءة يُحوِّل احتياطاً.
 */
export async function handleTransferImage(conv: any, msg: any): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  if (msg?.type !== 'image' || !msg?.image?.id) return false;
  let playerId: number | null = conv?.playerId ?? null;
  if (!playerId) {
    const local = normalizeLocalPhone(conv?.phone || '');
    if (local) { const [p] = await db.select({ id: players.id }).from(players).where(eq(players.phone, local)).limit(1); playerId = p?.id ?? null; }
  }
  if (!playerId) return false;
  const [ctx] = rows(await db.execute(sql`SELECT location_id, activity_id FROM invoice_wa_jobs
    WHERE player_id = ${playerId} AND kind IN ('open', 'auto', 'bot', 'manual') AND status = 'sent'
      AND created_at > NOW() - INTERVAL '16 hours' ORDER BY id DESC LIMIT 1`));
  if (!ctx) return false;
  const locId = Number(ctx.location_id), activityId = Number(ctx.activity_id);
  if ((await locMode(locId)) === 'off') return false;
  const data = await buildInvoiceData(db, locId, activityId, playerId);
  if ('error' in data || data.grandTotal <= 0 || !data.payment.cliq) return false;

  const { fetchWaMedia, waMediaPath } = await import('./wa-bot-ext.service.js');
  const media = await fetchWaMedia(String(msg.image.id));
  const read: TransferRead = media ? await reader.read(media.bin, media.mime) : { ok: false, isTransfer: false, amount: null, payee: '', method: '' };
  if (read.ok && !read.isTransfer) return false;

  const [loc] = await db.select({ waPhone: locations.waPhone, name: locations.name }).from(locations).where(eq(locations.id, locId)).limit(1);
  const [pl] = await db.select({ name: players.name, phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
  const [inv] = rows(await db.execute(sql`SELECT invoice_no FROM order_invoices WHERE location_id = ${locId} AND activity_id = ${activityId}
    AND player_id = ${playerId} AND NOT is_paid ORDER BY id DESC LIMIT 1`));
  const no = Number(inv?.invoice_no) || null;
  const due = data.grandTotal;
  const short = read.amount != null && read.amount < due - 0.005;
  const over = read.amount != null && read.amount > due + 0.005;
  const amountLine = read.amount != null
    ? (!short && !over ? `في الصورة ${f2(read.amount)} = المطلوب ✓` : short ? `⚠️ في الصورة ${f2(read.amount)} أقلّ من المطلوب ${f2(due)}` : `⚠️ في الصورة ${f2(read.amount)} أكثر من المطلوب ${f2(due)} — قد تكون حوالةً قديمة أو لشيءٍ آخر`)
    : `المطلوب ${f2(due)} — لم يُقرأ مبلغٌ من الصورة`;
  // 🔎 حوالةٌ لاسمٍ غير حساب المكان = أخطر ما يفوت الكاشير (أوّل حوالةٍ حقيقيّة في الاختبار كانت لغيره)
  const payeeMismatch = !!read.payee && payeeDiffers(read.payee, data.payment.cliq.name);
  const caption = [
    `💳 ${read.ok ? 'حوالة كليك' : 'صورة قد تكون حوالة'} من ${pl?.name || 'لاعب'} · ${normalizeLocalPhone(pl?.phone || '') || conv?.phone || ''}`,
    `${data.seat != null ? `مقعد ${data.seat} · ` : ''}${no ? `ملفّ #${String(no).padStart(4, '0')} · ` : ''}${amountLine}`,
    read.payee ? (payeeMismatch ? `⚠️ المستفيد في الصورة «${read.payee}» لا يطابق اسم كليك المكان «${data.payment.cliq.name}»` : `المستفيد في الصورة: ${read.payee} ✓`) : '',
    'تحقّق من حسابك ثمّ اضغط «حصّل» في الكونسول.',
  ].filter(Boolean).join('\n');

  const venuePhone = normalizeLocalPhone(loc?.waPhone || '');
  let forwarded = false, fwdErr = '';
  if (venuePhone && media) {
    try { await sender.image(venuePhone, waMediaPath(String(msg.image.id), media.mime), caption, { invoiceWaTransfer: true }); forwarded = true; }
    catch (e: any) { fwdErr = e?.message || 'فشل'; }
  } else fwdErr = venuePhone ? 'تعذّر قراءة الصورة' : 'لا رقم واتساب للمكان';

  await db.execute(sql`INSERT INTO invoice_wa_jobs (location_id, activity_id, player_id, kind, invoice_no, total, status, reason, due_at, sent_at, details)
    VALUES (${locId}, ${activityId}, ${playerId}, 'transfer', ${no}, ${due}, ${forwarded ? 'sent' : 'failed'}, ${fwdErr},
      NOW(), NOW(), ${JSON.stringify({ amountRead: read.amount, payee: read.payee, aiOk: read.ok, method: read.method, short, over, payeeMismatch })}::jsonb)`);
  emit(locId, { activityId, playerId, kind: 'transfer', status: forwarded ? 'sent' : 'failed' });
  try { await sender.text(conv.phone, TRANSFER_ACK, { invoiceWaAck: true }); } catch { /* الردّ تكميليّ */ }
  return true;
}

// ══════════════════════════════════════════════════════
// 🖥️ الكونسول: آخر حالة إرسال لكلّ لاعب في الليلة
// ══════════════════════════════════════════════════════
export async function nightWaStatus(activityId: number): Promise<Record<number, any>> {
  const db = getDB(); if (!db) return {};
  const r = rows(await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id, kind, status, reason, channel, invoice_no, created_at, sent_at, due_at
      FROM invoice_wa_jobs WHERE activity_id = ${activityId} AND kind <> 'transfer' AND status <> 'cancelled'
     ORDER BY player_id, id DESC`));
  const t = rows(await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id, status, details, created_at
      FROM invoice_wa_jobs WHERE activity_id = ${activityId} AND kind = 'transfer'
     ORDER BY player_id, id DESC`));
  const out: Record<number, any> = {};
  for (const x of r) out[Number(x.player_id)] = { kind: x.kind, status: x.status, reason: x.reason || '', channel: x.channel, invoiceNo: x.invoice_no, at: x.sent_at || x.due_at };
  for (const x of t) {
    const o = out[Number(x.player_id)] || (out[Number(x.player_id)] = {});
    o.transfer = { at: x.created_at, forwarded: x.status === 'sent', amountRead: x.details?.amountRead ?? null, short: x.details?.short === true,
      over: x.details?.over === true, payeeMismatch: x.details?.payeeMismatch === true };
  }
  return out;
}

// ══════════════════════════════════════════════════════
// 🧾 «شو حسابي؟» — حتميّ قبل البوت (2026-10-30)
// «حسابي» تعني الفاتورة وتعني حساب اللاعب (نقاطه ورتبته): البوت اختار النقاط للمالك في الاختبار الحيّ.
// من له ليلةٌ فيها طلبٌ أو حجزٌ اليوم يُجاب بملفّه مباشرةً بلا نموذج؛ وسؤالٌ فيه نقاط/رتبة يبقى للبوت.
// ══════════════════════════════════════════════════════
const AR = (s: string) => String(s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
export function isBillQuestion(text: string): boolean {
  const t = AR(text);
  if (!t || t.length > 80) return false;
  if (/نقاط|نقطه|رتب|رانك|rank|xp|خبره|مستوا|مستوي|تصنيف|موسم|ترتيب|احصا|تشبس|chips|ختم|ختوم|بطاقه الولاء/i.test(t)) return false;
  if (/فاتور/.test(t)) return true;
  if (/(قديش|قداش|كم|شو)\s*(صار\s*)?(علي|عليا|عليي|عليه)(\s|$|\?|؟)/.test(t)) return true;
  if (/(بدي|ابي|بدنا)\s*(ادفع|احاسب)|(كيف|وين)\s*(ادفع|بدفع)/.test(t)) return true;
  if (/حسابي|الحساب|حساب الليله/.test(t) && /^(شو|قديش|كم|بدي|ابعث|ابعت|ابعتلي|ابعثلي|اعرف|ممكن|وين|حسابي|الحساب)|(\?|؟)$|حسابي$/.test(t)) return true;
  return false;
}

/** true = أُجيب بملفّه (لا يمرّ للبوت). شرطه: سؤال حساب، ولاعبٌ له ليلةٌ اليوم في مكانٍ يعمل فيه الإرسال */
export async function handleBillQuestion(conv: any, text: string): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  if (!isBillQuestion(text)) return false;
  let playerId: number | null = conv?.playerId ?? null;
  if (!playerId) {
    const local = normalizeLocalPhone(conv?.phone || '');
    if (local) { const [p] = await db.select({ id: players.id }).from(players).where(eq(players.phone, local)).limit(1); playerId = p?.id ?? null; }
  }
  if (!playerId) return false;
  const [hit] = rows(await db.execute(sql`
    SELECT activity_id, location_id FROM (
      SELECT o.activity_id, o.location_id, o.created_at AS t FROM orders o
       WHERE o.player_id = ${playerId} AND o.status <> 'cancelled' AND o.created_at > NOW() - INTERVAL '16 hours'
      UNION ALL
      SELECT a.id, a.location_id, a.date AS t FROM bookings b JOIN activities a ON a.id = b.activity_id
       WHERE b.player_id = ${playerId} AND b.deleted_at IS NULL AND a.deleted_at IS NULL
         AND a.date > NOW() - INTERVAL '16 hours' AND a.date < NOW() + INTERVAL '3 hours'
    ) x ORDER BY t DESC LIMIT 1`));
  if (!hit) return false;
  const r = await invoiceForBot(Number(hit.location_id), Number(hit.activity_id), playerId);
  return r?.imageSent === true;
}
