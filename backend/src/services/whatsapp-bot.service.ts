// ══════════════════════════════════════════════════════
// 🤖 WhatsApp Bot Engine — محرك البوت الذكي (Gemini)
// ══════════════════════════════════════════════════════
// المعمارية المعتمدة: محرك أصلي داخل الباكند — كل الإعدادات من
// جدول wa_bot_settings (تُدار من الداشبورد وتسري فوراً)، والأدوات
// استدعاءات مباشرة لقاعدة البيانات، والردود عبر أنبوب الإرسال الموحد.
//
// القرارات المعتمدة من المالك:
//   • حجوزات البوت → «متابعة الحجوزات» بحالة confirmed موسومة «بوت واتساب»
//   • يُنشر مطفأً (enabled=false) والتفعيل من الواجهة
//   • مدة إيقاف البوت بعد رد بشري قابلة للتعديل (افتراضي 30 دقيقة)

import { eq, and, desc, asc, gte, sql, isNull, or, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import {
  waBotSettings, waConversations, waMessages, waCustomerNotes,
  reservations, bookings, activities, locations,
} from '../schemas/admin.schema.js';
import { players } from '../schemas/player.schema.js';
import { sendMessage, isBotActive, isFreeWindowOpen, notifyAdmins } from './whatsapp-inbox.service.js';
import { sendPushToStaffByPermission } from './fcm.service.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const BOT_RESERVATION_TAG = 'بوت واتساب';
const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};

// ══════════════════════════════════════════════════════
// الإعدادات الافتراضية (تُزرع مرة واحدة عند أول تشغيل)
// ══════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `أنت المساعد الرسمي لنادي المافيا (Mafia Club) على واتساب.

الشخصية: ودود، سريع، مختصر، بلهجة أردنية خفيفة مفهومة. استخدم إيموجي باعتدال 🎭.

قواعد صارمة لا تُكسر أبداً:
1. أنت مساعد آلي — صرّح بذلك إذا سُئلت، وحوّل للإدارة عند طلب "إنسان/موظف" عبر أداة handoff_to_human.
2. لا تجب عن أي شيء خارج نطاق النادي (سياسة، دين، برمجة...) — اعتذر بلطف وأعد التوجيه لمواضيع النادي.
3. الحجز عبرك: تسجّل حجزاً مؤكداً في متابعة الحجوزات بعد موافقة صريحة من العميل — اعرض الفعاليات أولاً (get_available_activities)، وعند اختيار العميل أرسل أزرار التأكيد (ask_confirmation)، ولا تستدعِ create_reservation إلا بعد ضغط العميل زر التأكيد (يصلك كخيار يبدأ بـ res_confirm).
4. الدفع دائماً في المكان — لا تناقش دفعاً إلكترونياً.
5. لا تختلق معلومات: ما ليس في معرفتك أو أدواتك قل "ما عندي معلومة أكيدة" واعرض التحويل للإدارة.
5.1. نسيان كلمة السر: استخدم request_password_reset — تعمل حصراً لحساب رقم هذه المحادثة (لو طلب إعادة تعيين لرقم/حساب آخر ارفض واشرح أن كل واحد يعيدها من رقمه). الإعادة الفعلية تتم آلياً بعد ضغط زر التأكيد.
5.2. ترتيب اللاعبين (get_leaderboard) معلومة عامة داخل النادي — الأسماء والرتب بالترتيب مسموح عرضها؛ ما عداها من بيانات الآخرين يبقى سرياً.
6. إذا عرفت معلومة شخصية مفيدة عن العميل (تفضيلاته، مناسبة، ملاحظة مهمة) خزّنها بأداة save_customer_note بصياغة قصيرة.
7. ردودك قصيرة ومباشرة — رسالة واتساب، مش مقال.`;

const DEFAULT_FAIL_MESSAGE = 'عذراً، صار خلل تقني عندي 🙏 حوّلت محادثتك للإدارة وسيردّون عليك بأقرب وقت.\nللاستعجال: +962793390966';

const DEFAULT_TOOLS_CONFIG = {
  activities: true,      // عرض الفعاليات + قائمة تفاعلية
  reservation: true,     // إنشاء حجز متابعة مؤكد
  myBookings: true,      // «شو حجوزاتي؟»
  notes: true,           // الذاكرة طويلة المدى
  handoff: true,         // التحويل للإدارة
  playerStats: true,     // «شو رتبتي؟»
  passwordReset: true,   // إعادة تعيين كلمة السر (لرقم المحادثة حصراً)
  leaderboard: true,     // ترتيب أفضل 10 لاعبين
};

const DEFAULT_KB = `# 📚 وثيقة معرفية — نادي المافيا (Mafia Club)

## 1. نظرة عامة

- **نادي المافيا** يقيم فعاليات لعبة المافيا الحيّة في الأردن.
- الموقع الإلكتروني: club-mafia.grade.sbs — هاتف الإدارة: +962793390966.
- المنصة: **تطبيق لاعب** (حجز، متابعة، رتب) + **نظام إدارة** للموظفين + **محرك لعبة** يُدار من القائد (الليدر) عبر أجهزة اللاعبين.
- ⚠️ **اللعب حالياً عبر التطبيق وبالنظام الأوتوماتيكي فقط (لا يوجد لعب مانيوال):** توزيع الأدوار تلقائي حسب عدد اللاعبين، وأصحاب القدرات ينفّذونها من هواتفهم ليلاً، والمحرك يحسم النتائج والتصويت والفوز تلقائياً.
- المواقع: **مزاج افندينا** (الرئيسي)، **Brio**، **بيت راكان**، **online** (فعاليات أونلاين).

## 2. الحجز

### عبر بوت الواتساب (أنت)
- تستطيع تسجيل **حجز مؤكد** لأي عدد أشخاص في «متابعة الحجوزات»: تعرض الفعاليات المتاحة، العميل يختار، يؤكد بالأزرار، وتسجّل الحجز فوراً ويصل الإدارة إشعار مباشر.
- الدفع دائماً **في المكان**.

### عبر تطبيق اللاعب
- اللاعب يسجّل دخوله (رقم الهاتف + كلمة السر)، يرى الفعاليات القادمة، ويحجز لنفسه بضغطة.
- كل حجز بالتطبيق = شخص واحد، ويُنشأ غير مدفوع والدفع بالمكان.
- الحجز بالتطبيق يربط الحضور بحساب اللاعب مباشرة (نقاط، رتب، سجل) — فالأفضل للاعبين المسجلين.
- بعض اللاعبين لديهم صفة "مجاني" — حجزهم يُعتمد مجاناً تلقائياً.
- الفعالية لها سعة قصوى — عند الامتلاء يُغلق الحجز.
- عند الوصول يُسجَّل حضور (check-in)، وبعض الفعاليات بنظام تذاكر (عادية/VIP/مجانية).
- نسي كلمة السر؟ → التواصل مع الإدارة لإعادة تعيينها.

## 3. سير الفعالية واللعب

1. اللاعبون يحجزون → يحضرون ويدفعون بالمكان.
2. الليدر ينشئ **غرفة**؛ اللاعبون ينضمون من التطبيق برمز الغرفة.
3. **توزيع المقاعد تلقائي** بمحرك قيود ذكي.
4. الأدوار تُوزَّع تلقائياً (6 لاعبين حداً أدنى) — كل لاعب يرى دوره على هاتفه فقط.
5. الليل: القدرات من الهواتف والمحرك يحسم. النهار: نقاش وتصويت. حتى يتحقق شرط فوز.
6. النقاط تُحتسب تلقائياً فور انتهاء المباراة، واللاعبون يقيّمون الليدر وأفضل لاعب.

## 4. الفرق والأدوار (15 دوراً)

### فريق المافيا 🕵️ (يفوز بإبادة/معادلة المواطنين)
| الدور | الحد الأدنى | الوصف |
|---|---|---|
| شيخ المافيا (GODFATHER) | 6 | الزعيم، ينفّذ الاغتيال كل ليلة. قدرة القنبلة 💣: إذا أُقصي بالتصويت يفجّر قنبلة تصيب لاعباً (مواطن +10 RR، مافيا −10 RR) |
| قص المافيا (SILENCER) | 7+ | يُسكت لاعباً فلا يتكلم بالنهار |
| حرباية المافيا (CHAMELEON) | 8+ | يظهر «مواطناً» أمام تحقيق الشريف، ويرث الاغتيال |
| الساحرة (WITCH) | 8+ | تعطّل قدرة لاعب لعدة جولات |
| الأخ الأكبر (OLDER_BROTHER) | 10+ | توأم المافيا — يرث الاغتيال قبل المافيا العادي |
| مافيا عادي | 6 | نقاش وتصويت |

### فريق المواطنين 🛡️ (يفوز بإقصاء كل المافيا)
| الدور | الحد الأدنى | الوصف |
|---|---|---|
| الشريف (SHERIFF) | 6 | يحقق بهوية لاعب كل ليلة |
| الطبيب (DOCTOR) | 6 | يحمي لاعباً من الاغتيال (لا يكرر نفس الهدف) |
| القناص (SNIPER) | 7+ | يقنص — إن كان مافيا قتله وإلا مات معه |
| الشرطية (POLICEWOMAN) | 8+ | عند إقصائها تكشف هوية قاتلها لاحقاً |
| الممرضة (NURSE) | 9+ | تتفعّل بعد موت الطبيب بنفس الحماية |
| الأخ الأصغر (YOUNGER_BROTHER) | 10+ | توأم — إذا مات الأكبر يتحوّل فوراً للمافيا |
| مواطن صالح | 6 | نقاش وتصويت |

### المحايدون 🎭
| الدور | الحد الأدنى | شرط الفوز |
|---|---|---|
| المهرج (JESTER) | 8+ | يفوز وحده إذا صوّتوا ضده نهاراً (+30 RR)؛ قُتل ليلاً يخسر (−10) |
| السفّاح (ASSASSIN) | 10+ | عقود اغتيال — يفوز بإكمالها (+10 لكل عقد، +30 للفوز) |

### قاعدة التوائم 👀
التعارف باتجاه واحد: الأكبر يعرف الأصغر؛ **الأصغر يلعب أعمى** (منعاً للاستغلال).

## 5. الاتفاقيات (Deals) 🤝
- تُعقد نهاراً — هدفها يصبح مرشّحاً مباشراً للتصويت.
- ممنوعة بالجولة الأولى · حد 3 بالجولة · اللاعب يبدأ واحدة فقط · لا يُستهدف لاعب باتفاقيتين.
- مواطن يصطاد مافيا = +50 XP، +20 RR · فاشلة = −10 XP، −30 RR · مافيا على مافيا = −10/−10.

## 6. نظام التقدم والرتب 🏆

### XP
مشاركة +20 · فوز الفريق +50 · بقاء (لكل جولة) +5 · قدرة صحيحة +10 · خاطئة −5 · صفقة ناجحة +50 · إقصاء مافيا +15 · فوز مهرج/سفّاح +50.
المستوى يحتاج 500 × (المستوى^1.2) خبرة.

### RR
فوز +20 · خسارة −20 · نجاة +5 · قدرة صحيحة +5 · خاطئة −5 · صفقة ناجحة +20 · فاشلة −30 · فوز المهرج +30 · فوز السفّاح +30 · عقد سفّاح +10 · قنبلة بمواطن +10 · قنبلة بمافيا −10 · عقوبة ليدر −10 · طرد −30.

### الرتب (بالـ RR التراكمي)
مُخبر ← 100 ← جندي ← 200 ← كابو ← 300 ← ساعد الزعيم ← 400 ← **العرّاب** (القمة).
عند الهبوط يعود اللاعب بـ80% من رصيد الرتبة.

### المواسم
الموسم يُصفّر الإحصاءات عند بدايته (عدّاد «مباريات مدى الحياة» لا يُصفَّر). الموسم الحالي: الثاني (بدأ 19-06-2026).

## 7. أسئلة شائعة
| السؤال | الجواب |
|---|---|
| كيف أحجز؟ | معي هنا مباشرة (اعرض الفعاليات واحجز) أو من تطبيق اللاعب. الدفع بالمكان. |
| كم أقل عدد للعب؟ | 6 لاعبين، والأدوار تزداد مع العدد (التوائم والسفّاح من 10+). |
| ليش دوري بس على هاتفي؟ | النظام أوتوماتيكي — الدور سرّي على شاشتك، والقدرات تُستخدم من الهاتف ليلاً. |
| متى تنزل نقاطي؟ | فور انتهاء المباراة تلقائياً بتفصيل كامل بسجل مبارياتك. |
| نسيت كلمة السر؟ | حوّل للإدارة لإعادة تعيينها. |`;

// ══════════════════════════════════════════════════════
// إدارة الإعدادات
// ══════════════════════════════════════════════════════

export async function getBotSettings() {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  let [row] = await db.select().from(waBotSettings).limit(1);
  if (!row) {
    [row] = await db.insert(waBotSettings).values({
      enabled: false,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      knowledgeBase: DEFAULT_KB,
      failMessage: DEFAULT_FAIL_MESSAGE,
      toolsConfig: DEFAULT_TOOLS_CONFIG,
    } as any).returning();
  }
  return row;
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export async function updateBotSettings(patch: Record<string, any>, updatedBy: string) {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  await getBotSettings(); // ضمان وجود الصف
  const allowed = ['enabled', 'geminiApiKey', 'model', 'systemPrompt', 'knowledgeBase',
    'contextMessages', 'pauseMinutes', 'maxToolLoops', 'failMessage', 'failHandoff', 'toolsConfig'];
  const clean: any = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
  // مفتاح فارغ أو مقنّع = لا تغيير عليه
  if (clean.geminiApiKey !== undefined && (!clean.geminiApiKey || String(clean.geminiApiKey).includes('••'))) {
    delete clean.geminiApiKey;
  }
  if (clean.contextMessages !== undefined) clean.contextMessages = Math.min(Math.max(parseInt(clean.contextMessages) || 20, 4), 60);
  if (clean.pauseMinutes !== undefined) clean.pauseMinutes = Math.min(Math.max(parseInt(clean.pauseMinutes) || 30, 1), 24 * 60);
  if (clean.maxToolLoops !== undefined) clean.maxToolLoops = Math.min(Math.max(parseInt(clean.maxToolLoops) || 4, 1), 8);
  clean.updatedBy = updatedBy;
  clean.updatedAt = new Date();
  const current = await getBotSettings();
  const [updated] = await db.update(waBotSettings).set(clean).where(eq(waBotSettings.id, current.id)).returning();
  return updated;
}

// اختبار مفتاح + جلب قائمة النماذج المتاحة حياً
export async function testGeminiKey(apiKeyInput?: string) {
  const settings = await getBotSettings();
  const key = apiKeyInput && !apiKeyInput.includes('••') ? apiKeyInput : settings.geminiApiKey;
  if (!key) throw new Error('لا يوجد مفتاح API — أدخل المفتاح أولاً');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}&pageSize=50`, { signal: ctrl.signal });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    const models = (data.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
      .map((m: any) => String(m.name).replace('models/', ''));
    return { ok: true, models };
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════
// استدعاء Gemini
// ══════════════════════════════════════════════════════

async function geminiGenerate(settings: any, systemText: string, contents: any[], toolDecls: any[]) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const body: any = {
      system_instruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
    };
    if (toolDecls.length > 0) body.tools = [{ function_declarations: toolDecls }];
    const res = await fetch(`${GEMINI_BASE}/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts;
  } finally {
    clearTimeout(timer);
  }
}

// ══════════════════════════════════════════════════════
// تعريفات الأدوات (function declarations)
// ══════════════════════════════════════════════════════

function buildToolDeclarations(toolsConfig: any) {
  const t = { ...DEFAULT_TOOLS_CONFIG, ...(toolsConfig || {}) };
  const decls: any[] = [];
  if (t.activities) decls.push({
    name: 'get_available_activities',
    description: 'جلب الفعاليات القادمة المتاحة للحجز (الاسم، التاريخ، الموقع، السعر، المقاعد). استدعها عندما يسأل العميل عن الفعاليات أو يريد الحجز — سترسل تلقائياً قائمة تفاعلية للعميل يختار منها.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  if (t.reservation) {
    decls.push({
      name: 'ask_confirmation',
      description: 'إرسال أزرار تأكيد الحجز للعميل بعد اختياره فعالية وعدد أشخاص. لا تنشئ الحجز مباشرة أبداً — استدعِ هذه أولاً وانتظر ضغط العميل زر التأكيد.',
      parameters: {
        type: 'OBJECT',
        properties: {
          activity_id: { type: 'NUMBER', description: 'معرّف الفعالية من get_available_activities' },
          people_count: { type: 'NUMBER', description: 'عدد الأشخاص' },
          summary: { type: 'STRING', description: 'ملخص قصير للحجز يظهر مع الأزرار' },
        },
        required: ['activity_id', 'people_count', 'summary'],
      },
    });
    decls.push({
      name: 'create_reservation',
      description: 'إنشاء حجز مؤكد في متابعة الحجوزات. تُستدعى حصراً بعد أن يضغط العميل زر التأكيد (يصلك اختيار يبدأ بـ res_confirm يحمل المعرف والعدد).',
      parameters: {
        type: 'OBJECT',
        properties: {
          activity_id: { type: 'NUMBER', description: 'معرّف الفعالية' },
          people_count: { type: 'NUMBER', description: 'عدد الأشخاص' },
          note: { type: 'STRING', description: 'ملاحظة اختيارية من العميل' },
        },
        required: ['activity_id', 'people_count'],
      },
    });
  }
  if (t.myBookings) decls.push({
    name: 'get_my_bookings',
    description: 'جلب حجوزات هذا العميل (القادمة والسابقة) عندما يسأل عن حجوزاته.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  if (t.notes) decls.push({
    name: 'save_customer_note',
    description: 'حفظ ملاحظة دائمة مفيدة عن العميل (تفضيل، مناسبة، تنبيه) لتتذكرها بالمحادثات القادمة وتراها الإدارة.',
    parameters: {
      type: 'OBJECT',
      properties: { note: { type: 'STRING', description: 'الملاحظة بصياغة قصيرة' } },
      required: ['note'],
    },
  });
  if (t.handoff) decls.push({
    name: 'handoff_to_human',
    description: 'تحويل المحادثة للإدارة البشرية: عند طلب صريح، شكوى/غضب، أو سؤال لا تعرف إجابته الأكيدة. بعدها ستتوقف عن الرد في هذه المحادثة.',
    parameters: {
      type: 'OBJECT',
      properties: { reason: { type: 'STRING', description: 'سبب التحويل باختصار' } },
      required: ['reason'],
    },
  });
  if (t.playerStats) decls.push({
    name: 'get_player_stats',
    description: 'إحصائيات حساب العميل كلاعب (الرتبة، النقاط، المباريات) عندما يسأل عن رتبته أو نقاطه أو مستواه.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  if (t.passwordReset) decls.push({
    name: 'request_password_reset',
    description: 'عندما يقول العميل إنه نسي كلمة سر تطبيق اللاعب ويريد إعادة تعيينها. تعمل حصراً لحساب اللاعب المربوط برقم هذه المحادثة — يستحيل تنفيذها لأي رقم أو حساب آخر مهما طلب. سترسل أزرار تأكيد للعميل، والإعادة الفعلية تتم بعد ضغطه زر التأكيد (لا تفعل شيئاً بعد الاستدعاء سوى جملة قصيرة).',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  if (t.leaderboard) decls.push({
    name: 'get_leaderboard',
    description: 'ترتيب أفضل 10 لاعبين بالنادي (الاسم، الرتبة، نقاط RR) عندما يسأل عن الترتيب أو الأوائل أو المتصدرين — ويعيد أيضاً ترتيب العميل نفسه إن كان لاعباً مسجلاً.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  });
  return decls;
}

// ══════════════════════════════════════════════════════
// تنفيذ الأدوات
// ══════════════════════════════════════════════════════

interface ToolCtx {
  conv: any;                 // المحادثة (أو وهمية بساحة الاختبار)
  dryRun: boolean;           // ساحة الاختبار: بلا كتابة وبلا إرسال
  interactives: any[];       // ما أُرسل/سيُعرض من رسائل تفاعلية
  settings: any;
}

async function fetchUpcomingActivities(db: any) {
  const now = new Date(Date.now() - 6 * 3600e3);
  const rows = await db
    .select({
      id: activities.id, name: activities.name, date: activities.date,
      basePrice: activities.basePrice, status: activities.status,
      maxCapacity: activities.maxCapacity, locationId: activities.locationId,
      locationName: locations.name,
    })
    .from(activities)
    .leftJoin(locations, eq(activities.locationId, locations.id))
    .where(and(inArray(activities.status, ['planned', 'active'] as any), gte(activities.date, now as any)))
    .orderBy(asc(activities.date))
    .limit(8);
  // المقاعد المحجوزة لكل فعالية
  const out: any[] = [];
  for (const a of rows) {
    const [bk] = await db
      .select({ total: sql<number>`COALESCE(SUM(${bookings.count}), 0)` })
      .from(bookings)
      .where(and(eq(bookings.activityId, a.id), isNull(bookings.deletedAt)));
    const booked = Number(bk?.total || 0);
    out.push({
      id: a.id,
      name: a.name,
      date: a.date,
      dateText: new Date(a.date).toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }),
      price: a.basePrice,
      location: a.locationName || '',
      seatsLeft: a.maxCapacity ? Math.max(0, a.maxCapacity - booked) : null,
    });
  }
  return out;
}

async function execTool(name: string, args: any, ctx: ToolCtx): Promise<any> {
  const db = getDB();
  if (!db) return { error: 'DB unavailable' };
  const { conv, dryRun } = ctx;

  switch (name) {
    case 'get_available_activities': {
      const acts = await fetchUpcomingActivities(db);
      if (acts.length === 0) return { activities: [], note: 'لا فعاليات قادمة متاحة حالياً — انصح العميل بمتابعة الإعلانات' };
      // إرسال قائمة تفاعلية للعميل تلقائياً
      const rows = acts.slice(0, 10).map(a => ({
        id: `act:${a.id}`,
        title: a.name.slice(0, 24),
        description: `${a.dateText}${a.location ? ' · ' + a.location : ''}${a.seatsLeft !== null ? ` · ${a.seatsLeft} مقعد` : ''}`.slice(0, 72),
      }));
      const interactive = {
        type: 'list',
        header: { type: 'text', text: '🎭 الفعاليات القادمة' },
        body: { text: 'اختر الفعالية المناسبة:' },
        action: { button: 'عرض الفعاليات', sections: [{ title: 'الفعاليات المتاحة', rows }] },
      };
      if (dryRun) {
        ctx.interactives.push({ kind: 'list', preview: rows });
      } else {
        await sendMessage({ conversationId: conv.id, interactive, source: 'bot' });
      }
      return {
        activities: acts,
        note: 'أُرسلت قائمة تفاعلية للعميل — اكتب جملة قصيرة واحدة تدعوه للاختيار من القائمة، بدون تكرار تفاصيل الفعاليات.',
      };
    }

    case 'ask_confirmation': {
      const activityId = parseInt(args.activity_id);
      const people = Math.max(1, parseInt(args.people_count) || 1);
      const interactive = {
        type: 'button',
        body: { text: `📋 تأكيد الحجز:\n${args.summary || ''}\n\nهل أثبّت الحجز؟` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `res_confirm:${activityId}:${people}`, title: 'تأكيد الحجز ✓' } },
            { type: 'reply', reply: { id: 'res_cancel', title: 'إلغاء' } },
          ],
        },
      };
      if (dryRun) {
        ctx.interactives.push({ kind: 'buttons', preview: interactive.body.text });
      } else {
        await sendMessage({ conversationId: conv.id, interactive, source: 'bot' });
      }
      return { sent: true, note: 'أُرسلت أزرار التأكيد للعميل — لا تنشئ الحجز الآن. اكتب جملة قصيرة جداً أو لا شيء، وانتظر رده.' };
    }

    case 'create_reservation': {
      const activityId = parseInt(args.activity_id);
      const people = Math.max(1, parseInt(args.people_count) || 1);
      const [act] = await db.select({ id: activities.id, name: activities.name, date: activities.date })
        .from(activities).where(eq(activities.id, activityId)).limit(1);
      if (!act) return { error: 'الفعالية غير موجودة — أعد عرض الفعاليات' };
      if (dryRun) {
        return { success: true, dryRun: true, reservation: { activity: act.name, people }, note: '(ساحة اختبار — لم يُسجّل حجز حقيقي)' };
      }
      const [saved] = await db.insert(reservations).values({
        activityId,
        contactName: conv.displayName || conv.phone,
        contactMethod: BOT_RESERVATION_TAG,
        phone: conv.phone,
        peopleCount: people,
        playerId: conv.playerId || null,
        status: 'confirmed',              // قرار المالك: حجز البوت مؤكد مباشرة
        notes: args.note ? `🤖 ${args.note}` : '',
        createdBy: `🤖 ${BOT_RESERVATION_TAG}`,
      } as any).returning();
      // إشعار الإدارة فوراً
      sendPushToStaffByPermission(
        'bookings',
        '🤖 حجز جديد من بوت واتساب',
        `${conv.displayName || conv.phone} — ${people} أشخاص — ${act.name}`,
        'reservation',
        { route: '/admin/reservations' },
      ).catch(() => {});
      notifyAdmins('🤖 حجز مؤكد من البوت', `${conv.displayName || conv.phone} — ${people} أشخاص — ${act.name}`, { conversationId: conv.id, url: '/admin/reservations', tag: `wa-res-${conv.id}` }).catch(() => {});
      return {
        success: true,
        reservation: { id: saved.id, activity: act.name, dateText: new Date(act.date).toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }), people },
        note: 'الحجز مؤكد ومسجّل — أبلغ العميل بالتفاصيل وذكّره أن الدفع في المكان.',
      };
    }

    case 'get_my_bookings': {
      const resList = await db
        .select({
          id: reservations.id, peopleCount: reservations.peopleCount, status: reservations.status,
          createdAt: reservations.createdAt, activityName: activities.name, activityDate: activities.date,
        })
        .from(reservations)
        .leftJoin(activities, eq(reservations.activityId, activities.id))
        .where(and(
          or(eq(reservations.phone, conv.phone), conv.playerId ? eq(reservations.playerId, conv.playerId) : sql`false`),
          isNull(reservations.deletedAt),
        ))
        .orderBy(desc(reservations.createdAt))
        .limit(5);
      const bkConds = conv.playerId
        ? or(eq(bookings.playerId, conv.playerId), eq(bookings.phone, conv.phone))
        : eq(bookings.phone, conv.phone);
      const bkList = await db
        .select({ id: bookings.id, count: bookings.count, isPaid: bookings.isPaid, isFree: bookings.isFree, activityName: activities.name, activityDate: activities.date })
        .from(bookings)
        .leftJoin(activities, eq(bookings.activityId, activities.id))
        .where(and(bkConds, isNull(bookings.deletedAt)))
        .orderBy(desc(bookings.createdAt))
        .limit(5);
      return {
        reservations: resList.map((r: any) => ({ activity: r.activityName, date: r.activityDate, people: r.peopleCount, status: r.status === 'confirmed' ? 'مؤكد' : 'قيد المتابعة' })),
        appBookings: bkList.map((b: any) => ({ activity: b.activityName, date: b.activityDate, people: b.count, paid: b.isFree ? 'مجاني' : b.isPaid ? 'مدفوع' : 'غير مدفوع' })),
      };
    }

    case 'save_customer_note': {
      const note = String(args.note || '').trim().slice(0, 500);
      if (!note) return { error: 'ملاحظة فارغة' };
      if (dryRun) return { saved: true, dryRun: true };
      await db.insert(waCustomerNotes).values({ phone: conv.phone, playerId: conv.playerId || null, note, source: 'bot' } as any);
      return { saved: true };
    }

    case 'handoff_to_human': {
      if (dryRun) return { done: true, dryRun: true, note: '(ساحة اختبار — لم يتم تحويل فعلي)' };
      await db.update(waConversations).set({
        botEnabled: false,
        needsAttention: true,
        updatedAt: new Date(),
      } as any).where(eq(waConversations.id, conv.id));
      const who = conv.displayName || conv.phone;
      const reason = String(args.reason || '').slice(0, 200);
      notifyAdmins('⚠️ عميل بحاجة تدخل بشري', `${who}: ${reason}`, { conversationId: conv.id, url: `/admin/whatsapp?conv=${conv.id}`, tag: `wa-conv-${conv.id}` }).catch(() => {});
      sendPushToStaffByPermission('bookings', '⚠️ واتساب: تحويل من البوت', `${who} — ${reason}`, 'whatsapp', { route: '/admin/whatsapp' }).catch(() => {});
      try {
        const io = (global as any).io;
        if (io) io.to('wa:inbox').emit('wa:conversation:update', { id: conv.id, needsAttention: true, botEnabled: false });
      } catch { /* غير حرج */ }
      return { done: true, note: 'تم التحويل — اكتب للعميل رسالة قصيرة مهذبة تخبره أن الإدارة ستتواصل معه.' };
    }

    case 'get_player_stats': {
      if (!conv.playerId) return { registered: false, note: 'العميل غير مسجّل كلاعب — انصحه بإنشاء حساب من تطبيق اللاعب ليجمع نقاطاً ورتباً' };
      // أرقام الموسم = أعمدة players الخام — نفس مصدر صفحة التصنيف بواجهة اللاعب
      // بالضبط، ونسبة الفوز تُحسب منهما لتبقى متسقة. (نسب سجل المباريات عابرة
      // للمواسم فلا تُستخدم — فقط الدور الأكثر لعباً يؤخذ منها كمعلومة تاريخية)
      const { getPlayerProfile } = await import('./player.service.js');
      const profile: any = await getPlayerProfile(conv.playerId);
      if (!profile?.player) return { registered: false };
      const pp = profile.player;
      const pg = profile.progression || {};
      const seasonMatches = pp.totalMatches || 0;
      const seasonWins = pp.totalWins || 0;
      return {
        registered: true,
        name: pp.name,
        rank: RANK_AR[pg.rankTier || 'INFORMANT'] || pg.rankTier,
        rankRR: pg.rankRR || 0,
        rrRequiredForNext: pg.rrRequired || null,
        level: pg.level || 1,
        xp: pg.xp || 0,
        nextLevelXP: pg.nextLevelXP || null,
        seasonMatches,
        seasonWins,
        seasonWinRate: seasonMatches > 0 ? Math.round((seasonWins / seasonMatches) * 100) : 0,
        favoriteRoleAllTime: profile.stats?.favoriteRole || null,
        lifetimeMatches: pp.lifetimeMatches || 0,
        note: 'الأرقام الموسمية مطابقة لصفحة التصنيف بالتطبيق؛ lifetimeMatches كل المباريات منذ الانضمام؛ favoriteRoleAllTime تاريخي عبر المواسم',
      };
    }

    case 'request_password_reset': {
      if (!conv.playerId) {
        return { linked: false, note: 'رقم هذه المحادثة غير مربوط بأي حساب لاعب — اعرض على العميل التحويل للإدارة أو إنشاء حساب من التطبيق' };
      }
      if (dryRun) {
        ctx.interactives.push({ kind: 'buttons', preview: 'أزرار تأكيد إعادة تعيين كلمة السر (تجريبي)' });
        return { sent: true, dryRun: true, note: '(ساحة اختبار — لا إعادة تعيين حقيقية)' };
      }
      const interactive = {
        type: 'button',
        body: { text: '🔐 إعادة تعيين كلمة سر حسابك المربوط بهذا الرقم؟\nسيتم إنشاء كلمة سر جديدة وإلغاء القديمة فوراً.' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'pwd_confirm', title: 'نعم، أعد التعيين 🔐' } },
            { type: 'reply', reply: { id: 'pwd_cancel', title: 'إلغاء' } },
          ],
        },
      };
      await sendMessage({ conversationId: conv.id, interactive, source: 'bot' });
      return { sent: true, note: 'أُرسلت أزرار التأكيد — الإعادة الفعلية تتم آلياً بعد ضغط العميل الزر. اكتب جملة قصيرة جداً فقط.' };
    }

    case 'get_leaderboard': {
      // مطابقة حرفية لترتيب صفحة التصنيف بواجهة اللاعب (/api/player-app/leaderboard):
      // الرتبة أولاً (CASE) ثم نقاط RR ثم المستوى — ونفس الحقول المعروضة هناك
      const tierOrder = sql`CASE ${players.rankTier}
        WHEN 'GODFATHER' THEN 5
        WHEN 'UNDERBOSS' THEN 4
        WHEN 'CAPO' THEN 3
        WHEN 'SOLDIER' THEN 2
        ELSE 1 END`;
      const top = await db
        .select({
          id: players.id, name: players.name, rankTier: players.rankTier,
          rankRR: players.rankRR, level: players.level,
          totalMatches: players.totalMatches, totalWins: players.totalWins,
        })
        .from(players)
        .orderBy(sql`${tierOrder} DESC`, desc(players.rankRR), desc(players.level))
        .limit(10);
      let you: any = null;
      if (conv.playerId) {
        const [me] = await db
          .select({ rankTier: players.rankTier, rankRR: players.rankRR, level: players.level, totalMatches: players.totalMatches, totalWins: players.totalWins })
          .from(players).where(eq(players.id, conv.playerId)).limit(1);
        if (me) {
          const myTier = sql`CASE ${me.rankTier || 'INFORMANT'}
            WHEN 'GODFATHER' THEN 5 WHEN 'UNDERBOSS' THEN 4
            WHEN 'CAPO' THEN 3 WHEN 'SOLDIER' THEN 2 ELSE 1 END`;
          const [ahead] = await db
            .select({ n: sql<number>`COUNT(*)` })
            .from(players)
            .where(sql`(${tierOrder} > ${myTier})
              OR (${tierOrder} = ${myTier} AND ${players.rankRR} > ${me.rankRR || 0})
              OR (${tierOrder} = ${myTier} AND ${players.rankRR} = ${me.rankRR || 0} AND ${players.level} > ${me.level || 1})`);
          you = {
            position: Number(ahead?.n || 0) + 1,
            rank: RANK_AR[me.rankTier || 'INFORMANT'] || me.rankTier,
            rankRR: me.rankRR || 0,
            seasonMatches: me.totalMatches || 0,
            seasonWins: me.totalWins || 0,
          };
        }
      }
      return {
        top: top.map((p: any, i: number) => ({
          position: i + 1,
          name: p.name,
          rank: RANK_AR[p.rankTier || 'INFORMANT'] || p.rankTier,
          rankRR: p.rankRR || 0,
          level: p.level || 1,
          seasonMatches: p.totalMatches || 0,
          seasonWins: p.totalWins || 0,
        })),
        you,
        note: 'الترتيب مطابق لصفحة التصنيف بالتطبيق (الرتبة ثم RR ثم المستوى). اعرضها كقائمة أنيقة (🥇🥈🥉 للأوائل) بصيغة: الاسم — الرتبة · RR، وإن وُجد you اذكر ترتيب العميل بجملة مشجعة',
      };
    }

    default:
      return { error: `أداة غير معروفة: ${name}` };
  }
}

// ══════════════════════════════════════════════════════
// بناء السياق
// ══════════════════════════════════════════════════════

async function buildCustomerCard(db: any, conv: any): Promise<string> {
  const lines: string[] = [];
  lines.push(`رقم العميل: ${conv.phone}`);
  if (conv.playerId) {
    const [p] = await db.select().from(players).where(eq(players.id, conv.playerId)).limit(1);
    if (p) {
      lines.push(`الاسم: ${p.name} (لاعب مسجّل #${p.id})`);
      lines.push(`الرتبة: ${RANK_AR[p.rankTier || 'INFORMANT'] || p.rankTier} · ${p.rankRR} RR · مستوى ${p.level}`);
      lines.push(`المباريات: ${p.totalMatches} (فوز ${p.totalWins})`);
    }
  } else {
    lines.push(`الاسم: ${conv.displayName || 'غير معروف'} — زائر غير مسجّل كلاعب`);
  }
  const notes = await db.select().from(waCustomerNotes)
    .where(eq(waCustomerNotes.phone, conv.phone))
    .orderBy(desc(waCustomerNotes.createdAt)).limit(6);
  if (notes.length) {
    lines.push('ملاحظات محفوظة عن العميل:');
    for (const n of notes) lines.push(`- ${n.note}`);
  }
  return lines.join('\n');
}

function msgToHistoryText(m: any): string {
  let body = m.body || '';
  // ضغطات القوائم والأزرار: نلحق المعرّف حتى يفهم النموذج الاختيار بدقة
  try {
    const p: any = m.payload;
    const reply = p?.interactive?.list_reply || p?.interactive?.button_reply || (p?.button ? { id: p.button?.payload } : null);
    if (m.direction === 'in' && reply?.id) body = `${body} [اختيار:${reply.id}]`;
  } catch { /* تجاهل */ }
  return body;
}

async function buildHistory(db: any, conv: any, limit: number) {
  const rows = await db.select().from(waMessages)
    .where(eq(waMessages.conversationId, conv.id))
    .orderBy(desc(waMessages.id)).limit(limit);
  rows.reverse();
  const contents: any[] = [];
  for (const m of rows) {
    const text = msgToHistoryText(m);
    if (!text) continue;
    contents.push({ role: m.direction === 'in' ? 'user' : 'model', parts: [{ text }] });
  }
  // Gemini يشترط أن يبدأ السجل برسالة user
  while (contents.length && contents[0].role !== 'user') contents.shift();
  return contents;
}

// ══════════════════════════════════════════════════════
// نواة الوكيل (تُستخدم للحي ولساحة الاختبار)
// ══════════════════════════════════════════════════════

export async function runAgent(opts: {
  settings: any;
  conv: any;
  history: any[];            // contents بصيغة Gemini
  customerCard: string;
  dryRun: boolean;
}): Promise<{ text: string; toolTrace: Array<{ name: string; args: any; result: any }>; interactives: any[] }> {
  const { settings, conv, dryRun } = opts;
  const toolDecls = buildToolDeclarations(settings.toolsConfig);
  const systemText = [
    settings.systemPrompt,
    '\n───── بطاقة العميل الحالي ─────\n' + opts.customerCard,
    '\n───── قاعدة معرفة النادي ─────\n' + settings.knowledgeBase,
  ].join('\n');

  const ctx: ToolCtx = { conv, dryRun, interactives: [], settings };
  const contents = [...opts.history];
  const toolTrace: Array<{ name: string; args: any; result: any }> = [];
  let finalText = '';

  for (let loop = 0; loop <= (settings.maxToolLoops || 4); loop++) {
    const parts = await geminiGenerate(settings, systemText, contents, toolDecls);
    const fnCalls = parts.filter((p: any) => p.functionCall);
    const textPart = parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('\n').trim();

    if (fnCalls.length === 0) { finalText = textPart; break; }

    // ⚠️ Gemini 3.x: أجزاء رد النموذج تُعاد للسجل كما وصلت حرفياً —
    // تجريد functionCall من thoughtSignature المرافق له يرفضه الـ API.
    contents.push({ role: 'model', parts });

    // تنفيذ كل الأدوات المطلوبة بهذه الدورة (يدعم الاستدعاءات المتوازية)
    // وإرجاع نتائجها كلها في رسالة واحدة بنفس ترتيبها
    const responseParts: any[] = [];
    for (const fc of fnCalls) {
      const { name, args } = fc.functionCall;
      const result = await execTool(name, args || {}, ctx);
      toolTrace.push({ name, args: args || {}, result });
      responseParts.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responseParts });

    if (loop === (settings.maxToolLoops || 4)) {
      finalText = textPart || 'تمام ✅';
    }
  }

  return { text: finalText, toolTrace, interactives: ctx.interactives };
}

// ══════════════════════════════════════════════════════
// المعالجة الحية — تُستدعى من خدمة الإنبوكس عند كل رسالة واردة
// ══════════════════════════════════════════════════════

// دمج الرسائل المتتالية: مؤقّت لكل محادثة + قفل معالجة
const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();
const processing = new Set<number>();
const rerunAfter = new Set<number>();
const DEBOUNCE_MS = 2000;

export function handleBotIncoming(convId: number) {
  const prev = debounceTimers.get(convId);
  if (prev) clearTimeout(prev);
  debounceTimers.set(convId, setTimeout(() => {
    debounceTimers.delete(convId);
    processConversation(convId).catch(err => console.error('❌ WA bot process:', err.message));
  }, DEBOUNCE_MS));
}

async function processConversation(convId: number) {
  if (processing.has(convId)) { rerunAfter.add(convId); return; }
  processing.add(convId);
  try {
    const db = getDB();
    if (!db) return;
    const settings = await getBotSettings();
    if (!settings.enabled || !settings.geminiApiKey) return;

    const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, convId)).limit(1);
    if (!conv) return;
    if (!isBotActive(conv)) return;              // مطفأ أو موقوف مؤقتاً أو محوّل
    if (!isFreeWindowOpen(conv)) return;         // خارج نافذة الرد المجانية

    // آخر رسالة يجب أن تكون من العميل (وإلا لا داعي للرد)
    const [lastMsg] = await db.select().from(waMessages)
      .where(eq(waMessages.conversationId, convId))
      .orderBy(desc(waMessages.id)).limit(1);
    if (!lastMsg || lastMsg.direction !== 'in') return;
    // ضغطات الأزرار الحساسة/البسيطة — مسارات حتمية بدون نموذج
    try {
      const p: any = lastMsg.payload;
      const btnId = p?.interactive?.button_reply?.id;
      if (btnId === 'res_cancel') {
        await sendMessage({ conversationId: convId, text: 'تمام، ألغيت العملية 👍 إذا حابب تشوف الفعاليات بأي وقت أنا جاهز.', source: 'bot' });
        return;
      }
      if (btnId === 'pwd_cancel') {
        await sendMessage({ conversationId: convId, text: 'تمام، ما غيّرنا شي 👍 كلمة سرك القديمة زي ما هي.', source: 'bot' });
        return;
      }
      if (btnId === 'pwd_confirm') {
        // 🔐 الإعادة الفعلية: كود حتمي — النموذج لا يشارك ولا يرى كلمة السر،
        // ومستحيل تنفيذها لغير حساب اللاعب المربوط برقم هذه المحادثة
        await performPasswordReset(convId);
        return;
      }
    } catch { /* تجاهل */ }

    const history = await buildHistory(db, conv, settings.contextMessages || 20);
    if (history.length === 0) return;
    const customerCard = await buildCustomerCard(db, conv);

    try {
      const { text } = await runAgent({ settings, conv, history, customerCard, dryRun: false });
      if (text && text.trim()) {
        await sendMessage({ conversationId: convId, text: text.trim(), source: 'bot' });
      }
    } catch (err: any) {
      console.error('❌ WA bot engine:', err.message);
      // الفشل الآمن: اعتذار + تحويل حسب الإعدادات
      const failMsg = settings.failMessage || DEFAULT_FAIL_MESSAGE;
      try { await sendMessage({ conversationId: convId, text: failMsg, source: 'system' }); } catch { /* تجاهل */ }
      if (settings.failHandoff) {
        await db.update(waConversations).set({ needsAttention: true, botPausedUntil: new Date(Date.now() + 3600e3), updatedAt: new Date() } as any)
          .where(eq(waConversations.id, convId));
        notifyAdmins('⚠️ خلل بالبوت — عميل بانتظار رد', conv.displayName || conv.phone, { conversationId: convId, url: `/admin/whatsapp?conv=${convId}`, tag: `wa-conv-${convId}` }).catch(() => {});
      }
    }
  } finally {
    processing.delete(convId);
    if (rerunAfter.has(convId)) {
      rerunAfter.delete(convId);
      handleBotIncoming(convId);
    }
  }
}

// ══════════════════════════════════════════════════════
// 🔐 إعادة تعيين كلمة السر — تنفيذ حتمي بعد ضغط زر التأكيد
// ══════════════════════════════════════════════════════
// قيود صلبة: حساب اللاعب المربوط برقم المحادثة حصراً (امتلاك رقم
// الواتساب = إثبات الهوية، بنفس منطق OTP)، كلمة سر عشوائية تولّد
// server-side، ويُفرض تغييرها بعد أول دخول (must_change_password).

async function performPasswordReset(convId: number) {
  const db = getDB();
  if (!db) return;
  const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, convId)).limit(1);
  if (!conv) return;

  if (!conv.playerId) {
    await sendMessage({
      conversationId: convId,
      text: 'ما لقيت حساب لاعب مربوط بهذا الرقم 🙏 حوّلتك للإدارة ليساعدوك.',
      source: 'system',
    }).catch(() => {});
    await db.update(waConversations).set({ needsAttention: true, updatedAt: new Date() } as any).where(eq(waConversations.id, convId));
    notifyAdmins('⚠️ طلب إعادة كلمة سر لرقم غير مربوط', conv.displayName || conv.phone, { conversationId: convId, url: `/admin/whatsapp?conv=${convId}`, tag: `wa-conv-${convId}` }).catch(() => {});
    return;
  }

  // كلمة سر رقمية من 6 خانات — سهلة الإدخال، وتُستبدل إلزامياً بعد أول دخول
  const newPassword = String(crypto.randomInt(100000, 1000000));
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const [updated] = await db
    .update(players)
    .set({ passwordHash, mustChangePassword: true } as any)
    .where(eq(players.id, conv.playerId))
    .returning({ id: players.id, name: players.name });

  if (!updated) {
    await sendMessage({ conversationId: convId, text: 'صار خلل بالإعادة 🙏 حوّلتك للإدارة.', source: 'system' }).catch(() => {});
    return;
  }

  await sendMessage({
    conversationId: convId,
    text: `تم إعادة تعيين كلمة السر ✅\n\n🔐 كلمة السر الجديدة: ${newPassword}\n\nادخل للتطبيق برقمك + هذه الكلمة، ورح يطلب منك تغييرها فوراً بعد الدخول لأمان حسابك.`,
    source: 'system',
  });
  console.log(`🔐 WA bot: password reset for player #${updated.id} (conv ${convId})`);
}

// ══════════════════════════════════════════════════════
// ساحة الاختبار (Playground) — نفس المحرك بلا إرسال ولا كتابة
// ══════════════════════════════════════════════════════

export async function runPlayground(history: Array<{ role: 'user' | 'model'; text: string }>) {
  const settings = await getBotSettings();
  if (!settings.geminiApiKey) throw new Error('أدخل مفتاح Gemini واحفظه أولاً');
  const contents = history
    .filter(h => h.text && h.text.trim())
    .map(h => ({ role: h.role, parts: [{ text: h.text.trim() }] }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (contents.length === 0) throw new Error('اكتب رسالة أولاً');

  const fakeConv = { id: 0, phone: '0790000000', waPhone: '962790000000', playerId: null, displayName: 'عميل تجريبي' };
  const customerCard = 'رقم العميل: 0790000000\nالاسم: عميل تجريبي (ساحة اختبار) — زائر غير مسجّل';
  return runAgent({ settings, conv: fakeConv, history: contents, customerCard, dryRun: true });
}

// ══════════════════════════════════════════════════════
// نبض البوت — إحصاءات سريعة
// ══════════════════════════════════════════════════════

export async function getBotStats() {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const day = new Date(Date.now() - 24 * 3600e3);
  const week = new Date(Date.now() - 7 * 24 * 3600e3);

  const [r24] = await db.select({ n: sql<number>`COUNT(*)` }).from(waMessages)
    .where(and(eq(waMessages.source, 'bot'), gte(waMessages.createdAt, day)));
  const [r7] = await db.select({ n: sql<number>`COUNT(*)` }).from(waMessages)
    .where(and(eq(waMessages.source, 'bot'), gte(waMessages.createdAt, week)));
  const [res7] = await db.select({ n: sql<number>`COUNT(*)` }).from(reservations)
    .where(and(eq(reservations.contactMethod, BOT_RESERVATION_TAG), gte(reservations.createdAt, week)));
  const [attn] = await db.select({ n: sql<number>`COUNT(*)` }).from(waConversations)
    .where(eq(waConversations.needsAttention, true));

  return {
    replies24h: Number(r24?.n || 0),
    replies7d: Number(r7?.n || 0),
    reservations7d: Number(res7?.n || 0),
    attentionNow: Number(attn?.n || 0),
  };
}
