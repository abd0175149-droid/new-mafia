// ══════════════════════════════════════════════════════
// 🎁 فحص حرّاس عرض الحديث مع البوت — Chat Reward Guards
// ══════════════════════════════════════════════════════
// كلّ فحصٍ هنا يحرس قاعدةً كسرُها لا يُنتج خطأً ظاهراً بل **نقاطاً تختفي**
// أو **منحاً مزدوجاً** — أي أعطالاً تُكتشف بعد أيّام من شكوى لاعب.
//
// يعمل بلا قاعدة بيانات وبلا شبكة — قراءة مصادر فقط:
//   npx tsx test-wa-reward.ts
//
// سيناريوهات الحياة (بعد النشر على الخادم) في ذيل الملفّ.
// ══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = ''): void {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');
/** الأسطر غير المعلَّقة فقط — تعليقٌ يشرح قاعدةً ليس تطبيقاً لها */
const code = (p: string) => read(p).split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const svc = code('services/wa-reward.service.ts');
const inbox = code('services/whatsapp-inbox.service.ts');
const bot = code('services/whatsapp-bot.service.ts');
const ext = code('services/wa-bot-ext.service.ts');
const routes = code('routes/wa-reward.routes.ts');
const inboxRoutes = code('routes/whatsapp-inbox.routes.ts');
const boot = code('index.ts');

console.log('\n🎁 فحص حرّاس عرض الحديث\n');

// ── ١) الدفتر ثمّ المصالحة — لا منح مباشر ──────────────
console.log('١) المنح يمرّ بالدفتر لا بالتطبيق المباشر');
check(/INSERT INTO rank_bonuses/.test(svc), 'المنح يُدرج في rank_bonuses');
check(!/applyRR\s*\(|applyXPAndLevel\s*\(/.test(svc),
  'لا نداء مباشر لـapplyRR/applyXPAndLevel', 'المصالحة تمحو ما يُكتب مباشرةً خلال ساعات');
check(/WHERE NOT EXISTS\s*\(/.test(svc) && /ON CONFLICT DO NOTHING/.test(svc),
  'حارسا الازدواج معاً: NOT EXISTS + ON CONFLICT DO NOTHING');
check(!/ON CONFLICT\s*\(\s*player_id\s*,\s*reason\s*\)/.test(svc),
  'لا ON CONFLICT بهدفٍ على (player_id, reason)', 'الفهرس جزئيّ فلا يُستنتج بهدف');
check(/reconcileSeasonProgression/.test(svc), 'المصالحة المستهدفة تُستدعى بعد الإدراج');
check(/onlyPlayerIds/.test(svc), 'المصالحة مقصورةٌ على الممنوحين (لا مصالحة موسمٍ كامل)');

// ── ٢) الموسم والمدينة — بدونهما تختفي النقاط ──────────
console.log('\n٢) بلا موسمٍ وبلا مدينة لا منح');
check(/NO_SEASON/.test(svc) && /season_id/.test(svc), 'غياب الموسم يوقف المنح');
check(/SELECT status FROM seasons/.test(svc), 'انتهاء الموسم أثناء العرض يُفحص عند كلّ منح');
check(/getOrInferHomeCity/.test(svc), 'المدينة = المدينة الأساسيّة للاعب (قرار المالك)');
check(/pending_city/.test(svc), 'من لا مدينة له يدخل حالة pending_city لا يُرفض');
check(/rwcity:/.test(svc) && /home_city_id\s*=/.test(svc),
  'زرّا المدينة يكتبان home_city_id فعليّاً');
check(/home_city_source/.test(svc), 'مصدر المدينة يُوسم chosen (اختيارُ اللاعب)');

// ── ٣) الوصل الثلاثيّ لصرف المعلَّق ────────────────────
console.log('\n٣) صرف المطالبة المعلَّقة من ثلاثة مواضع');
check(/settlePendingForConversation/.test(bot), 'ربطٌ برمز التحقّق (confirm_account_link)');
check(/settlePendingForConversation/.test(ext), 'إنشاءُ حساب من البوت (reg_ok)');
check(/settlePendingForConversation/.test(inboxRoutes), 'ربطٌ يدويّ من الإنبوكس');
check(/expires_at/.test(svc), 'المهلة محفوظة في الصفّ لا في الذاكرة');

// ── ٤) الخطّاف والحياد ────────────────────────────────
console.log('\n٤) خطّاف الرسائل الواردة');
check(/wa-reward\.service/.test(inbox), 'الخطّاف مركَّب في خدمة الإنبوكس');
check(/\.catch\(/.test(inbox.split('wa-reward.service')[1]?.slice(0, 400) || ''),
  'الخطّاف لا يُفشل استقبال الرسالة (fire-and-forget)');
check(/rwcity:/.test(bot) && bot.indexOf('rwcity:') < bot.indexOf('handleExtButton(conv, btnId'),
  'زرّ المدينة يُعالَج قبل تمرير الأزرار للامتداد');

// ── ٥) السقوف والازدواج ───────────────────────────────
console.log('\n٥) السقوف ومنعُ الازدواج');
const capIdx = svc.indexOf('max_players = 0 OR awarded_count < max_players');
const ledgerIdx = svc.indexOf('INSERT INTO rank_bonuses');
check(capIdx > 0 && capIdx < ledgerIdx, 'حجزُ المقعد من السقف **قبل** الإدراج في الدفتر');
check(/releaseSeat/.test(svc), 'المقعد يُعاد عند فشل الإدراج أو التكرار');
check(/uq_wa_reward_claim_player/.test(boot), 'فهرس فريد: منحةٌ واحدة لكلّ لاعب في العرض');
check(/uq_wa_reward_claim_conv/.test(boot), 'فهرس فريد: مطالبةٌ واحدة لكلّ محادثة');
check(/uq_wa_reward_one_running/.test(boot), 'فهرس فريد: عرضٌ واحد يعمل في اللحظة');
check(/isUniqueViolation/.test(svc), 'تعارضُ الفهارس يُترجَم قراراً لا عطلاً');
check(/COOLDOWN/.test(svc), 'التهدئة بين العروض مطبَّقة');

// ── ٦) الاستبعادات ────────────────────────────────────
console.log('\n٦) الاستبعادات');
for (const [k, label] of [
  ['is_test', 'الحسابات الاختباريّة'], ['is_locked', 'الحسابات الموقوفة'],
  ['linked_staff_id', 'الموظّفون والأدمن'], ['only_city_id', 'قصر العرض على مدينة'],
] as const) {
  check(new RegExp(k).test(svc), `يُستبعد: ${label}`);
}

// ── ٧) النموذج لا يمنح شيئاً ──────────────────────────
console.log('\n٧) النموذج خارج مسار المنح');
check(!/functionDeclarations|tools:|name: 'grant/.test(svc), 'لا أداة Gemini تمنح نقاطاً');
check(!/rank_bonuses/.test(routes), 'لا مسار API يمنح لشخصٍ بعينه');
check(/liveEventFactLine/.test(svc) && /لا تمنحها أنت/.test(read('services/wa-reward.service.ts')),
  'حقائقُ البوت تنصّ صراحةً أنّ المنح آليّ');

// ── ٨) الكاش والتوقيت ─────────────────────────────────
console.log('\n٨) الكاش والحرّاس التشغيليّة');
check(/invalidateLiveFacts/.test(svc) || /invalidateBotFacts/.test(svc),
  'تغيّرُ حالة العرض يُبطل كاش حقائق البوت', 'وإلّا وعد البوت بعرضٍ انتهى');
check(/sendingSuspendedReason/.test(svc), 'قفلُ الإرسال يوقف العرض تلقائيّاً');
check(/sweepReconcile/.test(boot) || /startRewardScheduler/.test(boot),
  'المجدوِل يعمل عند الإقلاع (مسحٌ لما مُنح ولم يظهر)');
check(/meta = COALESCE\(meta,'\{\}'::jsonb\) \|\| /.test(svc),
  'عمود meta يُدمج بـcast صريح إلى jsonb');

// ── النتيجة ───────────────────────────────────────────
console.log(`\n${'═'.repeat(48)}`);
console.log(fail === 0 ? `✅ كلّ الحرّاس سليمة (${pass})` : `❌ ${fail} حارساً ساقطاً من ${pass + fail}`);
console.log('═'.repeat(48));

console.log(`
📋 سيناريوهات الحياة — تُنفَّذ على الخادم بعد النشر:
   ١. أنشئ عرضاً ٥ دقائق بقيمة ١ RR ⟵ راسل البوت من رقمك المربوط ⟵ تصل رسالة
      «+1 نقطة رانك في <مدينتك>» وتظهر في تطبيق اللاعب خلال ≤ ٣٠ ثانية.
   ٢. راسله ثانيةً ⟵ لا منح ثانٍ ولا رسالة ثانية.
   ٣. رقمٌ غير مربوط ⟵ لا منح، والبوت يعرض فتح الحساب؛ أنشئ الحساب من نفس المحادثة
      ⟵ تُصرف النقاط فوراً (هذا اختبار الوصل الثلاثيّ).
   ٤. لاعبٌ بلا مدينة أساسيّة ⟵ تصل أزرار المدن؛ اضغط ⟵ تُصرف النقاط وتُكتب مدينته.
   ٥. اضبط سقف المستفيدين = ١ ⟵ الثاني لا يأخذ ويصلك إشعار «بلغ العرض سقفه».
   ٦. أوقف العرض ⟵ راسل البوت ⟵ لا منح، ولا يَعِد البوت بشيء (تحقّق أنّه لا يذكر العرض).
   ٧. أعد تشغيل الحاوية أثناء عرضٍ نشط ⟵ يستأنف، ونقاطُ من مُنح قبل السقوط تظهر بعد المسح.
   ٨. جرّب عرض تشبس ⟵ يعمل بلا موسمٍ ولا مدينة (دفترٌ مستقلّ).
`);

process.exit(fail === 0 ? 0 : 1);
