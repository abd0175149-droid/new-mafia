// ══════════════════════════════════════════════════════
// 🚫 فحص «لا حجز لفعاليّةٍ ملغاة أو منتهية» — البوت
// ══════════════════════════════════════════════════════
// علي #520 (2026-10-02): ضغط من قائمة الأمس فعاليّة الزرقاء ٢٦٤ — مُلغاةً ومنتهية —
// فأرسل البوت بطاقة تأكيد. قوائم واتساب تبقى قابلةً للضغط للأبد، فالفحص في الأدوات.
//
//   npx tsx test-wa-bookable.ts            (ثابت — محلّيّاً)
//   الفحص الحيّ: src/scripts/e2e-wa-bookable.ts على الخادم
// ══════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok: boolean, label: string) => { ok ? pass++ : fail++; console.log(`  ${ok ? '✅' : '❌'} ${label}`); };
const bot = fs.readFileSync(path.join(HERE, 'src/services/whatsapp-bot.service.ts'), 'utf8');
const caseBody = (name: string) => { const i = bot.indexOf(`case '${name}': {`); return i < 0 ? '' : bot.slice(i, i + 900); };
console.log('\n🔒 كلّ أداة حجز تفحص قابليّة الفعاليّة');
for (const t of ['get_booking_cost', 'check_seat_availability', 'ask_confirmation', 'set_group_members', 'create_reservation'])
  check(/const nb = await notBookable\(db, activityId\); if \(nb\) return nb;/.test(caseBody(t)), t);
check(/const nb = await notBookable\(db, actId\); if \(nb\) return nb;/.test(caseBody('admin_add_booking')), 'admin_add_booking (حجز الأدمن لغيره)');
check(/const nb = await notBookable\(db, toId\); if \(nb\) return nb;/.test(caseBody('admin_move_booking')), 'admin_move_booking — الوجهة');
console.log('\n📏 المعيار نفسه للقائمة وللأدوات');
check(/BOOKABLE_GRACE_MS = 6 \* 3600e3/.test(bot) && /Date\.now\(\) - 6 \* 3600e3/.test(bot), 'نافذة المتأخّرين ٦ ساعات في الموضعين');
check(/a\.status === 'cancelled'/.test(bot) && /\['planned', 'active'\]\.includes\(String\(a\.status\)\)/.test(bot), 'الملغاة والمنتهية/المكتملة مرفوضة');
check(/isNull\(activities\.deletedAt\), notTestActivity\)/.test(bot), 'القائمة لا تعرض فعاليّةً محذوفة');
console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
