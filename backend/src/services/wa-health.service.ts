// ══════════════════════════════════════════════════════
// 🩺 مراقب صحّة واتساب — يسأل ميتا كلّ 10 دقائق ويُنبّه الأدمن بإشعار Push
// ══════════════════════════════════════════════════════
// لماذا Push لا واتساب: يوم 2026-09-20 حظرت ميتا وصول التطبيق للـAPI مرّتين (حساب المطوّر احتاج توثيقاً)،
// فتوقّف الإرسال والاستقبال ساعاتٍ ولم يعلم أحد — لأنّ تنبيهات البوت نفسها تمرّ من واتساب فتموت مع الحظر.
// المراقب قراءة فقط (GET). لا يرسل لعميل شيئاً. ينبّه عند **تغيّر** الحالة لا عند كلّ فحص.
//
// الرفع التلقائيّ للقفل: فقط للقفل الذي سببه «ميتا ترفض الطلبات» (حظر وصول عابر) وبعد فحصين سليمين متتاليين.
// قفل مخالفة الحساب (account_update من webhook) يبقى يدويّاً — ذاك قرار بشريّ.

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { suspendSending, resumeSending, sendingSuspendedReason } from './whatsapp-inbox.service.js';

const GRAPH = 'https://graph.facebook.com/v23.0';
const INTERVAL_MS = 10 * 60e3;
const AUTO_LOCK_PREFIX = 'ميتا ترفض الطلبات';
// معروفة ومقبولة — لا تُعدّ خللاً: النشاط غير موثَّق (يحدّ السقف فقط) · SIP للمكالمات غير مفعَّل (لا نستعمله)
const IGNORED_CODES = new Set([141010, 138024]);

export type HealthLevel = 'ok' | 'degraded' | 'blocked' | 'unreachable' | 'unconfigured';
export interface WaHealth {
  level: HealthLevel; checkedAt: string; summary: string; issues: string[]; notes: string[];
  phone?: { status?: string; quality?: string; tier?: string; nameStatus?: string };
  waba?: { review?: string; businessVerification?: string };
  sendingLocked: string | null;
  links: Array<{ label: string; url: string; hint: string }>;
}

let last: WaHealth | null = null;
let lastSig = '';
let okStreak = 0, netFailStreak = 0;
let timer: NodeJS.Timeout | null = null;

const QUALITY_AR: Record<string, string> = { GREEN: 'خضراء', YELLOW: 'صفراء ⚠️', RED: 'حمراء ⛔', UNKNOWN: 'غير معروفة' };

function links() {
  const waba = env.WA_WABA_ID || '';
  return [
    { label: 'جودة الحساب والمخالفات', url: 'https://business.facebook.com/business-support-home', hint: 'الأهمّ: أيّ قيد أو مخالفة + زرّ التظلّم. السليم: بلا تحذيرات.' },
    { label: 'تنبيهات التطبيق (المطوّرين)', url: 'https://developers.facebook.com/apps/2094649958603928/alerts/', hint: 'أيّ «Action required» أو تقييد على التطبيق.' },
    { label: 'توثيق حساب المطوّر', url: 'https://developers.facebook.com/settings/developer/contact/', hint: 'البريد والهاتف — سبب حظر 2026-09-20.' },
    { label: 'مدير واتساب — الأرقام', url: `https://business.facebook.com/wa/manage/phone-numbers/${waba ? `?waba_id=${waba}` : ''}`, hint: 'جودة الرقم، السقف اليوميّ، حالة اسم العرض.' },
    { label: 'مركز الأمان — توثيق النشاط', url: 'https://business.facebook.com/settings/security', hint: 'توثيق النشاط التجاريّ + فرض التحقّق بخطوتين + مدير ثانٍ.' },
    { label: 'التحقّق بخطوتين (حسابك)', url: 'https://accountscenter.facebook.com/password_and_security/two_factor', hint: 'فعّله بتطبيق مصادقة لا SMS.' },
  ];
}

async function g(path: string): Promise<{ ok: boolean; data: any; net?: boolean }> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` }, signal: ctrl.signal });
    const data: any = await res.json().catch(() => ({}));
    return { ok: res.ok && !data?.error, data };
  } catch (e: any) { return { ok: false, data: { error: { message: e?.message || 'network' } }, net: true }; }
  finally { clearTimeout(t); }
}

function collectErrors(hs: any, issues: string[], notes: string[]) {
  for (const e of hs?.entities || []) {
    if (e.can_send_message === 'BLOCKED') issues.push(`${e.entity_type}: الإرسال محظور`);
    for (const er of e.errors || []) {
      const line = `${e.entity_type} ${er.error_code}: ${er.error_description || ''}`.trim();
      (IGNORED_CODES.has(Number(er.error_code)) ? notes : issues).push(line);
    }
  }
}

export async function checkWaHealth(): Promise<WaHealth> {
  const base = { checkedAt: new Date().toISOString(), issues: [] as string[], notes: [] as string[], links: links() };
  if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID) {
    last = { ...base, level: 'unconfigured', summary: 'واتساب غير مهيّأ في البيئة', sendingLocked: sendingSuspendedReason() };
    return last;
  }
  const p = await g(`${env.WA_PHONE_NUMBER_ID}?fields=status,quality_rating,messaging_limit_tier,name_status,health_status`);
  let h: WaHealth;
  if (!p.ok) {
    const msg = String(p.data?.error?.message || 'خطأ غير معروف'); const code = Number(p.data?.error?.code);
    if (p.net) {
      netFailStreak++; okStreak = 0;
      h = { ...base, level: 'unreachable', summary: `تعذّر الوصول إلى ميتا (${msg})`, issues: [msg], sendingLocked: sendingSuspendedReason() };
    } else {
      netFailStreak = 0; okStreak = 0;
      const blocked = (code === 200 && /access blocked/i.test(msg)) || code === 190 || code === 368 || code === 131031;
      h = { ...base, level: blocked ? 'blocked' : 'degraded', summary: blocked ? `⛔ ميتا ترفض طلباتنا: ${msg} (code ${code})` : `ميتا أعادت خطأ: ${msg} (code ${code})`, issues: [`${msg} (code ${code})`], sendingLocked: sendingSuspendedReason() };
      if (blocked && !sendingSuspendedReason()) suspendSending(`${AUTO_LOCK_PREFIX}: ${msg} (code ${code})`);
      h.sendingLocked = sendingSuspendedReason();
    }
  } else {
    netFailStreak = 0; okStreak++;
    const d = p.data; const issues: string[] = []; const notes: string[] = [];
    collectErrors(d.health_status, issues, notes);
    if (d.status && d.status !== 'CONNECTED') issues.push(`حالة الرقم: ${d.status}`);
    if (d.quality_rating === 'RED') issues.push('جودة الرقم حمراء — خطر تقييد وشيك');
    else if (d.quality_rating === 'YELLOW') issues.push('جودة الرقم صفراء — الناس يبلّغون أو يحظرون');
    if (['DECLINED', 'EXPIRED', 'NON_EXISTS'].includes(d.name_status)) issues.push(`اسم العرض: ${d.name_status}`);
    let waba: WaHealth['waba'];
    if (env.WA_WABA_ID) {
      const w = await g(`${env.WA_WABA_ID}?fields=account_review_status,business_verification_status,health_status`);
      if (w.ok) {
        waba = { review: w.data.account_review_status, businessVerification: w.data.business_verification_status };
        collectErrors(w.data.health_status, issues, notes);
        if (w.data.account_review_status && w.data.account_review_status !== 'APPROVED') issues.push(`مراجعة حساب واتساب: ${w.data.account_review_status}`);
      }
    }
    const uniq = (a: string[]) => Array.from(new Set(a));
    h = {
      ...base, issues: uniq(issues), notes: uniq(notes), level: issues.length ? 'degraded' : 'ok',
      summary: issues.length ? `⚠️ ${uniq(issues)[0]}${issues.length > 1 ? ` (+${uniq(issues).length - 1})` : ''}` : `سليم — الرقم متّصل، الجودة ${QUALITY_AR[d.quality_rating] || d.quality_rating}، السقف ${String(d.messaging_limit_tier || '').replace('TIER_', '')}/يوم`,
      phone: { status: d.status, quality: d.quality_rating, tier: d.messaging_limit_tier, nameStatus: d.name_status }, waba,
      sendingLocked: sendingSuspendedReason(),
    };
    // رفع تلقائيّ للقفل العابر فقط، وبعد فحصين سليمين
    const lock = sendingSuspendedReason();
    if (lock && lock.startsWith(AUTO_LOCK_PREFIX) && okStreak >= 2 && !env.WA_SUSPENDED) {
      await resumeSending(); h.sendingLocked = null;
      h.notes.push('رُفع قفل الإرسال تلقائيّاً بعد عودة ميتا (فحصان سليمان متتاليان)');
      console.log('✅ WA health: sending lock lifted automatically (Meta access restored)');
      await notify('✅ واتساب عاد للعمل', 'ميتا تقبل طلباتنا من جديد ورُفع قفل الإرسال تلقائيّاً. الرسائل التي وصلت أثناء الانقطاع قد لا تصل.');
    }
  }
  last = h;
  await onChange(h);
  return h;
}

async function notify(title: string, body: string) {
  try { const { sendPushToAdmins } = await import('./fcm.service.js'); await sendPushToAdmins(title, body, 'wa_health', { url: '/admin/whatsapp' }); }
  catch (e: any) { console.warn('⚠️ WA health push:', e?.message); }
}

async function onChange(h: WaHealth) {
  // انقطاع شبكة عابر لا يُنبَّه عنه إلا بعد 3 فحوص متتالية (نصف ساعة)
  if (h.level === 'unreachable' && netFailStreak < 3) return;
  const sig = [h.level, h.phone?.quality, h.phone?.tier, h.phone?.status, h.waba?.review, h.issues.join('¦')].join('|');
  if (sig === lastSig) return;
  const first = !lastSig; const prev = lastSig.split('|')[0];
  lastSig = sig;
  try { const db = getDB(); if (db) await db.execute(sql`INSERT INTO wa_runtime_flags (key, value, updated_at) VALUES ('health', ${JSON.stringify({ sig, h })}::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`); } catch { /* غير حرج */ }
  if (first && h.level === 'ok') return;                       // إقلاع سليم: لا إزعاج
  console.warn(`🩺 WA health changed → ${h.level}: ${h.summary}`);
  if (h.level === 'blocked') await notify('⛔ واتساب متوقّف — ميتا تحظر الوصول', `${h.issues[0] || ''}\nلا إرسال ولا استقبال الآن. افتح صفحة الواتساب لروابط ميتا المباشرة.`);
  else if (h.level === 'unreachable') await notify('⚠️ تعذّر الوصول إلى ميتا', 'ثلاثة فحوص متتالية فشلت — تحقّق من اتّصال الخادم.');
  else if (h.level === 'degraded') await notify('⚠️ تحذير على حساب واتساب', h.issues.slice(0, 3).join('\n'));
  else if (h.level === 'ok' && prev && prev !== 'ok') await notify('✅ واتساب سليم من جديد', h.summary);
}

export function getWaHealth(): WaHealth | null { return last ? { ...last, sendingLocked: sendingSuspendedReason() } : null; }

export async function startWaHealthMonitor() {
  if (timer) return;
  try {   // استعادة آخر بصمة كي لا يُعاد التنبيه نفسه بعد كلّ إعادة تشغيل
    const db = getDB();
    if (db) { const r: any = await db.execute(sql`SELECT value FROM wa_runtime_flags WHERE key = 'health' LIMIT 1`); const v = (r?.rows ?? r ?? [])[0]?.value; if (v?.sig) lastSig = String(v.sig); }
  } catch { /* الجدول قد لا يكون موجوداً */ }
  setTimeout(() => { checkWaHealth().catch(() => {}); }, 20e3);
  timer = setInterval(() => { checkWaHealth().catch(() => {}); }, INTERVAL_MS);
  console.log('🩺 WA health monitor started (every 10 min)');
}
