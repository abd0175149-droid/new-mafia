// ══════════════════════════════════════════════════════
// 👁 فحص تقرير القراءة لكلّ بثّ
// ══════════════════════════════════════════════════════
//   npx tsx test-wa-broadcast-read.ts        (ثابت — محلّيّاً)
//   الحيّ: src/scripts/e2e-wa-broadcast-read.ts على الخادم (قراءةٌ فقط)
// ══════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok: boolean, label: string) => { ok ? pass++ : fail++; console.log(`  ${ok ? '✅' : '❌'} ${label}`); };
const code = (p: string) => fs.readFileSync(path.join(HERE, p), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const svc = code('src/services/whatsapp-broadcast.service.ts');
const routes = code('src/routes/whatsapp-inbox.routes.ts');
const boot = code('src/index.ts');
const ui = fs.readFileSync(path.join(HERE, '..', 'frontend', 'src', 'app', 'admin', 'whatsapp', 'BroadcastTab.tsx'), 'utf8');

console.log('\n🔗 ربط المستلم برسالته');
check(/const sentRes: any = await sendMessage\(/.test(svc) && /wa_message_id\) VALUES \(\$\{row\.id\}, \$\{t\.id\}, \$\{sentRes\?\.message\?\.id \?\? null\}\)/.test(svc), 'الإرسال يحفظ معرّف الرسالة لكلّ مستلم');
check(/ADD COLUMN IF NOT EXISTS wa_message_id/.test(boot), 'العمود يُنشأ عند الإقلاع');
check(/r\.wa_message_id IS NULL AND m\.conversation_id = r\.conversation_id AND m\.direction = 'out' AND m\.source = 'broadcast'/.test(svc), 'البثوث القديمة: مطابقةٌ بالوقت في محادثته (رسائل البثّ وحدها)');
console.log('\n📊 الأرقام');
check(/COUNT\(\*\) FILTER \(WHERE m\.status = 'read'\)/.test(svc) && /m\.id IS NULL OR m\.status NOT IN \('read', 'delivered', 'failed'\)/.test(svc), 'قرأها / وصلت / لم تصل / رفض — ولا يضيع مستلمٌ بلا رسالة');
check(/readStats:/.test(svc), 'السجلّ يحمل الأرقام لكلّ بثّ');
check(/'\/open-window-broadcast\/:id\/report', authenticate, adminOnly/.test(routes), 'تقرير بثٍّ واحد للأدمن وحده');
check(/readAt: atOf\(r\.payload, 'read'\)/.test(svc), 'وقت القراءة من سجلّ الحالات');
console.log('\n🖥️ الواجهة');
check(/👁 قرأها \{h\.readStats\.read\}/.test(ui) && /من قرأ؟/.test(ui), 'سطر الأرقام وزرّ «من قرأ؟»');
check(/إيصالات القراءة/.test(ui), 'تنبيه: «وصلت ولم تُقرأ» تشمل من أطفأ إيصالات القراءة');
check(/href=\{`\/admin\/whatsapp\?conv=\$\{r\.conversationId\}`\}/.test(ui), 'كلّ اسمٍ يفتح محادثته');
console.log(`\n${fail ? '❌' : '✅'} ${pass} نجح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
