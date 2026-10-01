// ══════════════════════════════════════════════════════
// 🔁 فحص صمود البوت أمام رفض جوجل + دليل تاريخ الميلاد
// ══════════════════════════════════════════════════════
// الحالات من ليلة 2026-10-01: خمسة رفوض «high demand» صارت «خلل تقني» وتحويلاً،
// وتاريخ ميلادٍ مخترع لليث (#529) حين أُعيد تشغيل التسجيل.
//
//   npx tsx test-wa-resilience.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isTransientGeminiError, withGeminiResilience, fallbackFor, GEMINI_FALLBACK_MODEL, GEMINI_FALLBACK_MODEL_ALT,
} from './src/services/gemini-resilience.js';
import { dobInCustomerText } from './src/services/wa-dob-evidence.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail: any = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`, detail); }
};
const code = (p: string) => fs.readFileSync(path.join(HERE, p), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const err = (message: string, status?: number, name?: string) => Object.assign(new Error(message), status ? { status } : {}, name ? { name } : {});
const HIGH_DEMAND = 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.';

console.log('\n🔎 ما العابر؟');
check(isTransientGeminiError(err(HIGH_DEMAND)), 'رسالة الليلة الحرفيّة («high demand») عابرة');
check(isTransientGeminiError(err('x', 503)) && isTransientGeminiError(err('x', 429)) && isTransientGeminiError(err('x', 500)), '503 و429 و500 عابرة');
check(isTransientGeminiError(err('The operation was aborted', undefined, 'AbortError')), 'مهلة النداء عابرة');
check(!isTransientGeminiError(err('API key not valid. Please pass a valid API key.', 400)), 'مفتاحٌ خاطئ ليس عابراً — لا تُخفى المشكلة بإعادة');
check(!isTransientGeminiError(err('Invalid JSON payload received.', 400)), 'طلبٌ معطوب ليس عابراً');

console.log('\n🔁 الخطّة');
async function run(script: Array<'ok' | 'busy' | 'bad'>, allowFallback = true, primary = 'gemini-3.5-flash-lite') {
  const calls: string[] = []; const sleeps: number[] = []; let i = 0;
  try {
    const r = await withGeminiResilience({
      primary, allowFallback, sleep: async (ms) => { sleeps.push(ms); },
      call: async (model) => {
        calls.push(model); const s = script[i++];
        if (s === 'busy') throw err(HIGH_DEMAND, 503);
        if (s === 'bad') throw err('API key not valid', 400);
        return 'ردّ';
      },
    });
    return { r, calls, sleeps, e: null as any };
  } catch (e: any) { return { r: null as any, calls, sleeps, e }; }
}
{
  const x = await run(['busy', 'ok']);
  check(x.r?.model === GEMINI_FALLBACK_MODEL && x.r.attempts === 2 && x.calls.join() === `gemini-3.5-flash-lite,${GEMINI_FALLBACK_MODEL}` && x.sleeps.join() === '1500',
    'رفضٌ ثمّ نجاح ⟵ النموذج الاحتياطيّ بعد 1.5ث (ما كان سيحدث ليلة الأربعاء)', x);
}
{
  const x = await run(['ok']);
  check(x.r?.attempts === 1 && x.sleeps.length === 0, 'النجاح الأوّل بلا انتظار ولا تغيير');
}
{
  const x = await run(['bad', 'ok']);
  check(x.e && !x.e.transient && x.calls.length === 1, 'غير العابر يُرمى فوراً دون إعادة', x);
}
{
  const x = await run(['busy', 'busy', 'busy', 'ok']);
  check(x.e?.transient === true && x.e.attempts === 3 && x.calls.length === 3 && x.calls[0] === x.calls[2] && x.calls[1] === GEMINI_FALLBACK_MODEL,
    'ثلاثة رفوض ⟵ يُرمى موسوماً transient بعد: أساسيّ ← احتياطيّ ← أساسيّ', x);
}
{
  const x = await run(['busy', 'busy', 'ok'], false);
  check(x.r?.attempts === 3 && x.calls.every(m => m === 'gemini-3.5-flash-lite') && x.sleeps.join() === '2000,5000',
    'بعد استدعاء أداة: الأساسيّ وحده (تواقيع الأفكار تخصّه) بانتظار 2ث ثمّ 5ث', x);
}
check(fallbackFor(GEMINI_FALLBACK_MODEL) === GEMINI_FALLBACK_MODEL_ALT, 'إن كان الأساسيّ هو الاحتياطيّ نفسه ⟵ البديل الثاني');

console.log('\n🎂 تاريخ الميلاد من فم العميل');
const D: Array<[string, string[], boolean, string]> = [
  ['1995-01-01', ['بدي اعمل حساب', 'ليث حسين حسن الجمل', 'ذكر', '!', 'بدي اعمل حساب'], false, 'ليث #529: لم يكتب تاريخاً قطّ ⟵ مرفوض'],
  ['1994-01-07', ['👍🏻', '07-01-1994', 'ذكر'], true, 'Aljamal #528: «07-01-1994»'],
  ['2001-11-04', ['4-11-2001'], true, 'قصي #530: «4-11-2001»'],
  ['2001-11-04', ['٤/١١/٢٠٠١'], true, 'أرقام عربيّة'],
  ['2001-11-04', ['2001/11/04'], true, 'سنة أوّلاً'],
  ['2001-11-04', ['4/11/01'], true, 'سنة بخانتين في صيغة تاريخ'],
  ['1994-01-07', ['7 كانون الثاني 1994'], true, 'اسم الشهر الشاميّ'],
  ['1998-10-15', ['15 اكتوبر 1998'], true, 'اسم الشهر المصريّ'],
  ['1994-01-07', ['7 كانون التاني', '1994'], true, 'على رسالتين متتاليتين'],
  ['1995-01-01', ['مواليد 1995'], false, 'السنة وحدها ⟵ مرفوض (لا يُخترع يومٌ وشهر)'],
  ['2001-11-11', ['11-11-2001'], true, 'اليوم = الشهر يحتاج الرقم مرّتين'],
  ['2001-11-11', ['مواليد 2001 شهر 11'], false, '…ومرّةً واحدة لا تكفي'],
  ['1990-05-20', ['بدي احجز ل 3 اشخاص', 'عمري 35'], false, 'أرقامٌ أخرى لا تصنع تاريخاً'],
];
for (const [dob, texts, want, why] of D) check(dobInCustomerText(dob, texts) === want, why, { dob, texts });

console.log('\n🔌 التركيب');
const bot = code('src/services/whatsapp-bot.service.ts');
check(/withGeminiResilience\(/.test(bot) && /e\.status = res\.status/.test(bot), 'نداء جوجل يمرّ من الصمود، والحالة HTTP محمولةٌ على الخطأ');
check(/allowFallback = !contents\.some\(/.test(bot) && /functionCall \|\| p\.functionResponse/.test(bot), 'الاحتياطيّ فقط قبل أيّ جزء أداة في السجلّ');
check(/e\.toolsRan = toolTrace\.filter/.test(bot), 'الخطأ يحمل عدد الأدوات المنفّذة قبله');
check(/const hold = !!err\?\.transient && !err\?\.toolsRan && !\(prevHold/.test(bot), 'التأجيل فقط: عابر + بلا أداة + ليس إعادةً لتأجيلٍ سابق');
check(/setTimeout\(\(\) => handleBotIncoming\(convId\), TRANSIENT_RETRY_MS\)/.test(bot) && /TRANSIENT_RETRY_MS = 60_000/.test(bot), 'إعادةٌ آليّة بعد دقيقة');
check(/meta: \{ transientHold: true \}/.test(bot), '«ثواني وبرجعلك» موسومة');
check(/if \(m\.payload\?\.transientHold\) return '';/.test(bot), '…ولا تدخل سجلّ النموذج');
check(/->>'transientHold', ''\) <> 'true'/.test(bot), '…ولا تُعدّ «آخر رسالة» فتمنع الإعادة');
check(/transientHoldAt\.delete\(convId\);\s*const failMsg = settings\.failMessage/.test(bot), 'فشلُ الإعادة يذهب للمسار القديم (اعتذار + تحويل)');
check(/flags\.recovered = true/.test(bot) && /flags\.fallback = resilience\.fallbackModel/.test(bot), 'قياس الجودة يسجّل الإعادة والاحتياطيّ والتعافي');
const ext = code('src/services/wa-bot-ext.service.ts');
check(/dobInCustomerText\(dob, inbound\.map/.test(ext), 'start_registration يطلب دليل التاريخ من رسائل العميل');
check(/if \(!dryRun\) \{\s*const \{ dobInCustomerText \}/.test(ext), '…خارج ساحة الاختبار وحدها (لا سجلّ حقيقيّ هناك)');

console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
