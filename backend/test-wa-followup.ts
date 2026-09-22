// ══════════════════════════════════════════════════════
// ⏱️ فحص حرّاس متابعة المحادثات الصامتة
// ══════════════════════════════════════════════════════
// المتابعة رسالةٌ **لم يطلبها الزبون** — أخطر نوعٍ من الرسائل على تقييم الرقم.
// كلّ فحصٍ هنا يحرس قيداً يمنع تحوّلها من خدمةٍ إلى ملاحقة.
//
//   npx tsx test-wa-followup.ts
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
let pass = 0, fail = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
const code = (p: string) => read(p).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const fu = code('services/wa-followup.service.ts');
const bot = code('services/whatsapp-bot.service.ts');
const inbox = code('services/whatsapp-inbox.service.ts');
const boot = code('index.ts');

console.log('\n⏱️ فحص حرّاس المتابعة\n');

console.log('١) التعليمة الداخليّة لا رسالةٌ مزوَّرة');
check(/runFollowUp/.test(bot), 'runFollowUp موجودة في المحرّك');
check(!/injectCustomerMessage/.test(fu),
  'المتابعة لا تمرّ بحقن رسالة عميل', 'الحقن يكتب صفّاً بدور العميل فيُلوَّث السجلّ والسياق');
check(/history\.push\(\{ role: 'user'/.test(bot),
  'التعليمة تُمرَّر كدور user للنموذج وحده (ولا تُخزَّن)');
check(!/insert\(waMessages\)/.test(fu), 'خدمة المتابعة لا تكتب رسائل بنفسها');

console.log('\n٢) الصمت هو المُشغِّل، والسقف متابعتان');
check(/last_message_at < NOW\(\) - \(\$\{firstMin\}/.test(fu) || /last_message_at < NOW\(\)/.test(fu),
  'المتابعة تنطلق بعد صمتٍ متّصل لا بعد وقتٍ من أوّل رسالة');
check(/followup_stage\,0\) = 1/.test(fu) && !/stage\s*=\s*3/.test(fu),
  'مرحلتان على الأكثر ثمّ صمتٌ نهائيّ');
check(/maxSilenceHours/.test(fu),
  'لا متابعة لصمتٍ قديم', 'وإلّا أرسل أوّلُ تشغيلٍ متابعاتٍ لمحادثاتٍ ماتت من الصباح');
check(/followup_stage = \$\{stage\}, followup_last_at = NOW\(\)[\s\S]{0,120}COALESCE\(followup_stage,0\) = \$\{stage - 1\}/.test(fu),
  'حجزُ الدور بتحديثٍ مشروط قبل الإرسال (لا تكرار عند تداخل التكّات)');

console.log('\n٣) مَن لا يُتابَع أبداً');
for (const [re, label] of [
  [/FROM reservations r JOIN activities a/, 'من ثبّت حجزاً قادماً'],
  [/FROM bookings b JOIN activities a2/, 'من حجز من التطبيق'],
  [/wa_optouts/, 'من أوقف الرسائل'],
  [/needs_attention = false/, 'المحوَّلون لموظّف'],
  [/bot_paused_until IS NULL OR c\.bot_paused_until < NOW\(\)/, 'المحادثات الموقوفة بعد ردّ بشريّ'],
  [/bot_enabled = true/, 'من أُطفئ البوت لمحادثته'],
  [/last_inbound_at > NOW\(\) - INTERVAL '23 hours/, 'من أُغلقت نافذته (٢٤ ساعة)'],
] as const) {
  check(re.test(fu), `يُستبعد: ${label}`);
}

console.log('\n٤) حرّاس الإزعاج');
check(/REFUSAL_RE/.test(fu) && /noteInboundForFollowup/.test(inbox),
  'رفضٌ صريح من العميل يوقف المتابعة فوراً');
check(/inQuietHours/.test(fu), 'ساعات هدوء — لا متابعة ليلاً');
check(/maxPerDay/.test(fu), 'سقف يوميّ لكلّ المتابعات (صمّام أمان)');
check(/sendingSuspendedReason/.test(fu), 'قفلُ الإرسال يمنع المتابعات');
check(/LIMIT 10/.test(fu), 'دفعةٌ محدودة في التكّة الواحدة');

console.log('\n٥) التشغيل والحالة');
check(/startFollowupScheduler/.test(boot), 'المجدوِل يعمل عند الإقلاع');
check(/followup_stage/.test(boot) && /followup_last_at/.test(boot), 'أعمدة الحالة تُنشأ في الإقلاع');
check(/enabled: false/.test(fu), 'يُنشر مطفأً — التفعيل قرارٌ واعٍ من الشاشة');
check(/'followup'\]/.test(bot) && /mergeFollowup/.test(bot),
  'الإعدادات تُحفظ عبر القائمة البيضاء وتُنقَّح في الخادم');
check(!/setTimeout\([^)]*followup/i.test(bot), 'لا مؤقّتات متابعة في ذاكرة المحرّك');

console.log(`\n${'═'.repeat(48)}`);
console.log(fail === 0 ? `✅ كلّ الحرّاس سليمة (${pass})` : `❌ ${fail} حارساً ساقطاً من ${pass + fail}`);
console.log('═'.repeat(48));
console.log(`
📋 سيناريوهات الحياة (على الخادم بعد التفعيل):
   ١. راسل البوت واسأل عن الفعاليّات ثمّ اسكت ⟵ بعد ١٠ دقائق تصل متابعةٌ واحدة تُكمل من حيث وقفت.
   ٢. اسكت ثانيةً ⟵ بعد ١٢ ساعة تصل الأخيرة، ثمّ لا شيء أبداً.
   ٣. ثبّت حجزاً ⟵ لا متابعة إطلاقاً.
   ٤. ردّ بـ«مش مهتمّ» ⟵ لا متابعة بعدها.
   ٥. ردّ موظّف على المحادثة ⟵ لا متابعة (البوت موقوف ٣٠ دقيقة).
   ٦. جرّب في ساعات الهدوء ⟵ لا تُرسل، وتُرسل بعد انتهائها إن كان الصمت ما زال حديثاً.
`);
process.exit(fail === 0 ? 0 : 1);
