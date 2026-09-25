// ══════════════════════════════════════════════════════
// 🤖➕ امتداد محرّك الدون — الدفعات ١–٣ من خارطة التطوير (2026-09-19)
//
// معزول عن whatsapp-bot.service حتى لا يكبر ذلك الملفّ أكثر. المحرّك يستدعي ثلاث نقاط:
//   • extToolDeclarations(t)      → إعلانات الأدوات الجديدة (t = مفاتيح مفعَّلة ومسموحة لهذا المتّصل)
//   • execExtTool(name,args,ctx,h) → تنفيذ الأداة (undefined = ليست من هنا)
//   • handleExtButton(...)        → مسارات الأزرار الحتميّة (true = عولجت)
//
// الثوابت الأمنيّة الموروثة: الهويّة من المحادثة لا من الوسائط · كلّ كتابة حسّاسة بزرّ تأكيد
// ينفّذه الكود مع إعادة فحص الصلاحيّة لحظة الضغط · حمولات التأكيد في aux بانتهاء ١٠ دقائق ·
// كلّ إجراء أدمن يُسجَّل في staff_action_log بمصدر whatsapp.
// قرار المالك: أدوات الإدارة للأدمن فقط · شحن التشبس مسموح مع بيانٍ صريح · التسجيل من الواتساب
// مسموح والموافقة على الشروط تبقى عند أوّل دخول فعليّ للتطبيق (بوّابة الموافقة القائمة).
// ══════════════════════════════════════════════════════

import { eq, and, isNull, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import { env } from '../config/env.js';
import { players, playerNotes } from '../schemas/player.schema.js';
import { activities, reservations, locations, staff, waConversations, waMessages } from '../schemas/admin.schema.js';
import { logStaffAction } from './staff-action-log.service.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
const GRAPH = 'https://graph.facebook.com/v20.0';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const APP_LOGIN_URL = 'https://club-mafia.grade.sbs/player/login';
const CHANGE_CUTOFF_MS = 3 * 3600e3;
const AUX_TTL_MS = 10 * 60e3;

export interface ExtHelpers {
  sendMessage: (i: any) => Promise<any>;
  isAdminConversation: (conv: any) => Promise<boolean>;
  notifyAdmins: (title: string, body: string, data?: Record<string, any>) => Promise<void>;
  fmtJo: (d: any, withTime?: boolean) => string;
  seatAvailability: (db: any, activityId: number) => Promise<{ total: number; booked: number; remaining: number }>;
  mirrorReservation: (db: any, saved: any, tag: string) => Promise<any>;
}
interface Ctx { conv: any; dryRun: boolean; interactives: any[]; settings: any }

// ══════════════════════════════════════════════════════
// 🧾 تدقيق إجراءات الأدمن عبر البوت
// ══════════════════════════════════════════════════════
export async function staffOfConversation(conv: any): Promise<{ id: number; username: string; role: string; displayName: string } | null> {
  try {
    if (!conv?.playerId) return null;
    const db = getDB(); if (!db) return null;
    const [r] = await db.select({ id: staff.id, username: staff.username, role: staff.role, displayName: staff.displayName })
      .from(players).innerJoin(staff, eq(players.linkedStaffId, staff.id)).where(eq(players.id, conv.playerId)).limit(1);
    return r ? { id: r.id, username: r.username, role: String(r.role), displayName: r.displayName } : null;
  } catch { return null; }
}
export async function auditBot(conv: any, action: string, details: any, extra?: { activityId?: number | null; targetName?: string | null; outcome?: string }) {
  try {
    const st = await staffOfConversation(conv);
    await logStaffAction({
      staffId: st?.id ?? null, staffUsername: st?.username ?? null, staffRole: st?.role ?? null,
      source: 'whatsapp', action, outcome: extra?.outcome ?? 'success', activityId: extra?.activityId ?? null,
      targetName: extra?.targetName ?? null, details: { convId: conv?.id, phone: conv?.phone, ...details },
    });
  } catch { /* التدقيق لا يحجب التنفيذ */ }
}

// ══════════════════════════════════════════════════════
// 🔔 تنبيهات الأدمن على الواتساب — داخل نافذتهم المفتوحة فقط، وبمفتاح منع تكرار
// ══════════════════════════════════════════════════════
export async function alertAdminsWA(key: string, text: string, opts?: { exceptConvId?: number }): Promise<number> {
  try {
    const db = getDB(); if (!db) return 0;
    const { getAux, setAux } = await import('../config/redis.js');
    if (await getAux(`wa-alert:${key}`)) return 0;
    await setAux(`wa-alert:${key}`, { at: Date.now() });
    const r: any = await db.execute(sql`
      SELECT c.id FROM wa_conversations c JOIN players p ON p.id = c.player_id JOIN staff s ON s.id = p.linked_staff_id
       WHERE s.role = 'admin' AND c.last_inbound_at > NOW() - INTERVAL '23 hours 50 minutes'
    `);
    const { sendMessage } = await import('./whatsapp-inbox.service.js');
    let n = 0;
    for (const row of rowsOf(r)) {
      if (opts?.exceptConvId && Number(row.id) === opts.exceptConvId) continue;
      try { await sendMessage({ conversationId: Number(row.id), text: `🔔 ${text}`, source: 'system' }); n++; } catch { /* نافذة أُغلقت أو قفل إرسال */ }
    }
    return n;
  } catch { return 0; }
}

// ══════════════════════════════════════════════════════
// 🎤 الرسائل الصوتيّة — تفريغٌ ثمّ تُعامَل كنصّ
// ══════════════════════════════════════════════════════
const MAX_AUDIO_BYTES = 1_500_000;   // ≈ دقيقتان opus
// ══════════════════════════════════════════════════════
// 🎧 حفظُ الصوت على القرص — ليُسمَع من اللوحة لاحقاً
// ══════════════════════════════════════════════════════
// ميتا تحتفظ بالوسائط ٣٠ يوماً ثمّ تختفي، ونحن ننزّل الملفّ أصلاً للتفريغ —
// فحفظُه هنا مجّانيّ ويجعل السماع ممكناً بعد انتهاء مدّة ميتا وبلا تنزيلٍ ثانٍ.
export const WA_MEDIA_DIR = process.env.WA_MEDIA_DIR || 'uploads/wa-media';

// خريطةُ امتدادٍ واحدة للحفظ والقراءة معاً — الترتيب مقصود: الصورة والفيديو
// قبل الصوت، وإلّا التقط `/mp4/` فيديوَ واتساب وحفظه بامتداد صوتيّ.
const MEDIA_EXT: Array<[RegExp, string, string]> = [
  [/jpeg|jpg/, 'jpg', 'image/jpeg'],
  [/png/, 'png', 'image/png'],
  [/webp/, 'webp', 'image/webp'],
  [/gif/, 'gif', 'image/gif'],
  [/video\/mp4/, 'mp4', 'video/mp4'],
  [/3gpp|3gp/, '3gp', 'video/3gpp'],
  [/pdf/, 'pdf', 'application/pdf'],
  [/ogg/, 'ogg', 'audio/ogg'],
  [/mpeg|mp3/, 'mp3', 'audio/mpeg'],
  [/mp4|m4a|aac/, 'm4a', 'audio/mp4'],
  [/amr/, 'amr', 'audio/amr'],
  [/wav/, 'wav', 'audio/wav'],
];
const EXT_MIME: Record<string, string> = Object.fromEntries(MEDIA_EXT.map(([, e, m]) => [e, m]));

export function waMediaPath(mediaId: string, mime = ''): string {
  const hit = MEDIA_EXT.find(([re]) => re.test(mime));
  return `${WA_MEDIA_DIR}/${String(mediaId).replace(/[^\w.-]/g, '')}.${hit ? hit[1] : 'bin'}`;
}

export async function saveWaMedia(mediaId: string, mime: string, bin: Buffer): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    await fs.mkdir(WA_MEDIA_DIR, { recursive: true });
    const p = waMediaPath(mediaId, mime);
    await fs.writeFile(p, bin);
    return p;
  } catch (e: any) {
    console.warn('⚠️ WA media save:', e?.message);
    return null;
  }
}

/** ينزّل وسائط رسالةٍ من ميتا (أو يقرؤها من القرص إن حُفظت) */
export async function fetchWaMedia(mediaId: string): Promise<{ bin: Buffer; mime: string } | null> {
  const fs = await import('fs/promises');
  const safe = String(mediaId).replace(/[^\w.-]/g, '');
  // القرص أوّلاً — لا تنزيل مكرّر، ويعمل بعد انتهاء مدّة ميتا
  for (const ext of [...Object.keys(EXT_MIME), 'bin']) {
    try {
      const bin = await fs.readFile(`${WA_MEDIA_DIR}/${safe}.${ext}`);
      return { bin, mime: EXT_MIME[ext] || 'application/octet-stream' };
    } catch { /* غير محفوظ بهذا الامتداد */ }
  }
  try {
    const meta: any = await (await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).json();
    if (!meta?.url) return null;
    const mime = String(meta.mime_type || 'application/octet-stream').split(';')[0].trim();
    const bin = Buffer.from(await (await fetch(meta.url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } })).arrayBuffer());
    await saveWaMedia(mediaId, mime, bin);
    return { bin, mime };
  } catch (e: any) {
    console.warn('⚠️ WA media fetch:', e?.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// 📥 حفظُ وسائط الوارد لحظةَ وصولها
// ══════════════════════════════════════════════════════
// ميتا تحذف الوسائط بعد ٣٠ يوماً. الصوت ينجو لأنّنا ننزّله للتفريغ، أمّا
// الصورة فلا ينزّلها شيء — فتضيع صامتةً ويبقى في السجلّ «📷 صورة» بلا صورة.
// نداءٌ لا يُنتظر: فشلُه لا يؤخّر ردّ الويبهوك ولا يُسقط الرسالة.
export function cacheInboundMedia(msg: any): void {
  const id = msg?.image?.id || msg?.sticker?.id || msg?.video?.id || msg?.document?.id;
  if (!id) return;
  void fetchWaMedia(String(id)).catch(() => { /* الوسيط ليس حرجاً */ });
}

/** تفريغ رسالةٍ صوتيّةٍ واحدة — النواة المشتركة بين التفريغ التلقائيّ وتفريغ الطلب */
async function transcribeOne(m: any, settings: any): Promise<{ text: string; usage: any }> {
  const usage = { calls: 0, promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0, cachedTokens: 0 };
  const p: any = m.payload || {};
  const mediaId = p?.audio?.id;
  if (!mediaId) return { text: '[لا يوجد ملفّ صوتيّ في هذه الرسالة]', usage };
  let text = '';
  try {
    const media = await fetchWaMedia(mediaId);
    if (!media) throw new Error('no media');
    if (media.bin.length > MAX_AUDIO_BYTES) {
      text = '[رسالة صوتيّة طويلة جدّاً — اطلب منه كتابتها أو تقصيرها]';
    } else {
      const res = await fetch(`${GEMINI}/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: media.mime, data: media.bin.toString('base64') } },
            { text: 'فرّغ هذه الرسالة الصوتيّة حرفيّاً كما قيلت (غالباً بالعربيّة المحكيّة الأردنيّة) بلا أيّ إضافة أو تعليق أو ترجمة. إن كانت غير مفهومة أو صامتة فاكتب فقط: [غير واضح]' },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 600 },
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
      text = (data?.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || '').join(' ').trim() || '[غير واضح]';
      const u = data?.usageMetadata || {};
      usage.calls++; usage.promptTokens += Number(u.promptTokenCount || 0); usage.candidatesTokens += Number(u.candidatesTokenCount || 0);
      usage.thoughtsTokens += Number(u.thoughtsTokenCount || 0); usage.totalTokens += Number(u.totalTokenCount || 0);
    }
  } catch (e: any) {
    console.warn('⚠️ WA audio transcribe:', e?.message);
    text = '[تعذّر فتح الرسالة الصوتيّة — اطلب منه كتابتها]';
  }
  const db = getDB();
  if (db) {
    await db.update(waMessages)
      .set({ body: `🎤 ${text}`.slice(0, 1500), payload: { ...p, transcribed: true, transcript: text } } as any)
      .where(eq(waMessages.id, m.id));
    try {
      const io = (global as any).io;
      if (io) io.to('wa:inbox').emit('wa:message:transcribed', { id: m.id, conversationId: m.conversationId, body: `🎤 ${text}`, transcript: text });
    } catch { /* غير حرج */ }
  }
  return { text, usage };
}

export async function transcribePendingAudio(convId: number, settings: any): Promise<{ done: number; usage: any }> {
  const usage = { calls: 0, promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0, cachedTokens: 0 };
  const db = getDB(); if (!db) return { done: 0, usage };
  const rows = await db.select().from(waMessages)
    .where(and(eq(waMessages.conversationId, convId), eq(waMessages.direction, 'in'), eq(waMessages.msgType, 'audio')))
    .orderBy(desc(waMessages.id)).limit(3);
  let done = 0;
  for (const m of rows) {
    const p: any = m.payload || {};
    if (p.transcribed || Date.now() - new Date(m.createdAt).getTime() > 15 * 60e3) continue;
    const r = await transcribeOne(m, settings);
    usage.calls += r.usage.calls; usage.promptTokens += r.usage.promptTokens;
    usage.candidatesTokens += r.usage.candidatesTokens; usage.thoughtsTokens += r.usage.thoughtsTokens;
    usage.totalTokens += r.usage.totalTokens;
    done++;
  }
  return { done, usage };
}

/**
 * تفريغٌ عند الطلب من اللوحة — بلا حدّ زمنيّ وبلا اشتراط أن يكون البوت قد عمل.
 * ضروريّ لأنّ التفريغ التلقائيّ لا يقع إن كان البوت مطفأً لتلك المحادثة أو مرّ وقتٌ طويل.
 */
export async function transcribeMessageOnDemand(messageId: number): Promise<{ ok: boolean; transcript?: string; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const [m] = await db.select().from(waMessages).where(eq(waMessages.id, messageId)).limit(1);
  if (!m) return { ok: false, error: 'الرسالة غير موجودة' };
  if (m.msgType !== 'audio') return { ok: false, error: 'هذه ليست رسالة صوتيّة' };
  const p: any = m.payload || {};
  if (p.transcript) return { ok: true, transcript: String(p.transcript) };
  const { getBotSettings } = await import('./whatsapp-bot.service.js');
  const settings: any = await getBotSettings();
  if (!settings?.geminiApiKey) return { ok: false, error: 'مفتاح Gemini غير مضبوط' };
  const r = await transcribeOne(m, settings);
  // الاستهلاك يُسجَّل كي لا يختفي تفريغٌ طلبتَه من حساب التكلفة
  try {
    const { recordBotUsageExternal } = await import('./whatsapp-bot.service.js') as any;
    if (recordBotUsageExternal) await recordBotUsageExternal(m.conversationId, settings.model || '', r.usage);
  } catch { /* تكميليّ */ }
  return { ok: true, transcript: r.text };
}


// ══════════════════════════════════════════════════════
// 📋 إعلانات الأدوات
// ══════════════════════════════════════════════════════
export const EXT_TOOLS_DEFAULTS = {
  invoice: true,          // «شو فاتورتي الليلة؟»
  chips: true,            // رصيد التشبس وحركاته
  changePeople: true,     // تعديل عدد الأشخاص بحجزٍ قائم
  schedule: true,         // جدول الليلة
  roleGuide: true,        // دليل الأدوار الحيّ من role_definitions
  register: true,         // تسجيل حساب لاعب من الواتساب
  voice: true,            // فهم الرسائل الصوتيّة (تفريغ)
  adminTonight: true,     // 🔒 لوحة الليلة
  adminChips: true,       // 🔒 شحن تشبس بباقة معتمدة
  adminActivities: true,  // 🔒 إنشاء فعاليّة
  adminReports: true,     // 🔒 تقارير سريعة
  adminPlayers: true,     // 🔒 قفل/فكّ حساب، إعفاء سياج، ملاحظة
  survey: true,           // استبيان ما بعد الأمسية بأزرار (داخل نافذة ٢٤ ساعة المفتوحة فقط)
  adminSeating: true,     // 🔒 الإجلاس عبر نقاط المحرّك نفسها (عرض، تعيين مقعد، منع تجاور، إعادة توزيع)
  adminKb: true,          // 🔒 قراءة قاعدة المعرفة وتعديلها من الواتساب (بلقطةٍ وتراجع)
};
export const EXT_ALWAYS_ADMIN_ONLY = ['adminTonight', 'adminChips', 'adminActivities', 'adminReports', 'adminPlayers', 'adminSeating', 'adminKb'];

export function extToolDeclarations(t: Record<string, any>): any[] {
  const d: any[] = [];
  const O = (properties: any, required: string[] = []) => ({ type: 'OBJECT', properties, required });
  if (t.loyalty) d.push({ name: 'offer_loyalty_reward_choice', description: 'عرض أزرار اختيار مكافأة بطاقة الولاء للعميل عندما تكون له مكافأة «بانتظار الاختيار» (تعرفها من get_my_loyalty_card). التنفيذ آليّ بعد ضغطه والاختيار نهائيّ — لا تكتب بعدها إلا جملة قصيرة.', parameters: O({}) });
  if (t.invoice) d.push({ name: 'get_my_invoice', description: 'فاتورة العميل نفسه في فعاليّة الليلة أو آخر فعاليّة (خلال 36 ساعة): طلباته من المنيو، الماء، تكملة الحدّ الأدنى، رسم اللعبة، خصم مشروب الولاء، الإجماليّ، وهل حُصّلت. «شو فاتورتي؟ كم عليّ؟».', parameters: O({}) });
  if (t.chips) d.push({ name: 'get_my_chips', description: 'رصيد تشبس العميل وآخر حركاته وما يكفيه رصيده من الخزنة. «كم تشبس معي؟». الشراء من التطبيق فقط.', parameters: O({}) });
  if (t.changePeople) d.push({ name: 'request_change_people', description: 'تعديل عدد الأشخاص في حجزٍ قائم للعميل بدل الإلغاء وإعادة الحجز. تعرض أزرار تأكيد والتنفيذ آليّ بعد ضغطه (قاعدة الـ3 ساعات نفسها، وفحص السعة عند الزيادة).', parameters: O({ activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة المحجوزة' }, new_count: { type: 'NUMBER', description: 'العدد الجديد (1–12)' } }, ['activity_id', 'new_count']) });
  if (t.schedule) d.push({ name: 'get_tonight_schedule', description: 'جدول الليلة المكتوب لفعاليّة (كم لعبة، متى تبدأ كلّ واحدة، الاستراحات) — لفعاليّة العميل المحجوزة القادمة إن لم يُحدَّد معرّف. الجدول تقديريّ وقد ينزاح.', parameters: O({ activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة (اختياريّ)' } }) });
  if (t.roleGuide) d.push({ name: 'get_role_guide', description: 'الدليل الحيّ للأدوار من النظام: بلا اسم يعيد قائمة الأدوار المفعَّلة بفريق كلٍّ منها؛ وباسم دورٍ يعيد شرحه الكامل ونصائحه وقيوده وشرط فوزه. استخدمه عند أيّ شرح مفصّل لدور — هو أحدث من قاعدة المعرفة. لا يعيد أعداد لاعبين ولا عتبات، ولا تذكرها أنت.', parameters: O({ role_name: { type: 'STRING', description: 'اسم الدور بالعربيّة كما ذكره العميل (اختياريّ)' } }) });
  if (t.register) d.push({ name: 'start_registration', description: 'إنشاء حساب لاعب جديد لرقم هذه المحادثة (للزائر غير المسجَّل حصراً). اجمع منه أوّلاً: الاسم الكامل، الجنس، تاريخ الميلاد — سؤالاً واحداً بكلّ رسالة — ثمّ استدعِها فتعرض ملخّصاً وأزرار تأكيد. الحساب يُنشأ آليّاً بعد ضغطه وتصله كلمة سرّ مؤقّتة. الموافقة على سياسة الخصوصيّة والشروط تتمّ داخل التطبيق عند أوّل دخول — لا تطلبها أنت.', parameters: O({ full_name: { type: 'STRING', description: 'الاسم كما يريده في حسابه' }, gender: { type: 'STRING', description: 'male أو female' }, dob: { type: 'STRING', description: 'تاريخ الميلاد بصيغة YYYY-MM-DD' } }, ['full_name', 'gender', 'dob']) });

  if (t.adminKb) {
    d.push({ name: 'admin_kb_show', description: 'قراءة ما تقوله قاعدة معرفة النادي عن موضوعٍ ما (أدمن فقط) — تعيد المقاطع المطابقة بنصّها الحرفيّ مع أرقام أسطرها. استعملها **قبل** أيّ تعديل ليرى الأدمن الصيغة القائمة، وبعده للتأكّد. وإن لم تجد شيئاً فأخبره أنّ البوت لا يملك معلومةً عن الموضوع وأنّ أيّ جوابٍ عنه تخمين.', parameters: O({ query: { type: 'STRING', description: 'كلمة أو عبارة للبحث عنها في المعرفة' } }, ['query']) });
    d.push({ name: 'admin_kb_add', description: 'إضافة معلومة جديدة إلى قاعدة معرفة النادي (أدمن فقط) — إضافةٌ محضة لا تمسّ حرفاً قائماً. صُغ المعلومة جملةً مكتملة مفهومة بلا سياق المحادثة (مثال: «عدد اللاعبين بالأمسية بين ٢٠ و٣٥ بحسب الفعاليّة»). تعرض معاينة وأزرار تأكيد ولا تُكتب إلا بضغط الأدمن. ⚠️ لتصحيح معلومة قائمة استعمل admin_kb_replace لا هذه.', parameters: O({ fact: { type: 'STRING', description: 'نصّ المعلومة كما ستُحفظ (10 أحرف فأكثر)' }, section: { type: 'STRING', description: 'عنوان البابّ الذي تُضاف تحته (اختياريّ — يُنشأ إن لم يوجد)' } }, ['fact']) });
    d.push({ name: 'admin_kb_replace', description: 'تصحيح نصٍّ قائم في قاعدة المعرفة (أدمن فقط): يستبدل find بـreplace. 🔴 لا يُنفَّذ إلا إن طابق find موضعاً واحداً بالضبط — وإلا رُفض وعُرضت المواضع ليختار الأدمن صيغةً أدقّ. استعمل admin_kb_show أوّلاً وانسخ النصّ القديم حرفيّاً. replace فارغ = حذف. تعرض معاينة وأزرار تأكيد.', parameters: O({ find: { type: 'STRING', description: 'النصّ القديم حرفيّاً (5 أحرف فأكثر)' }, replace: { type: 'STRING', description: 'النصّ الجديد — فارغ يعني حذف القديم' } }, ['find', 'replace']) });
  }
  if (t.adminTonight) d.push({ name: 'admin_tonight', description: 'لوحة الليلة (أدمن فقط): لكلّ فعاليّة اليوم — المحجوزون والأشخاص، الحاضرون، قائمة الانتظار، المدفوع وغير المدفوع والمجّانيّ، المباريات التي لُعبت، أختام الولاء المتوقّعة، وطلبات المنيو المفتوحة وأقدمها. «كيف الليلة؟».', parameters: O({}) });
  if (t.adminLoyalty) {
    d.push({ name: 'admin_loyalty_grant_stamp', description: 'منح ختم ولاء يدويّ للاعب عن فعاليّة (أدمن فقط) — برقم هاتفه ومعرّف الفعاليّة وسبب مكتوب. يعرض أزرار تأكيد قبل التنفيذ.', parameters: O({ phone: { type: 'STRING', description: 'رقم اللاعب أو اسمه' }, activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة' }, reason: { type: 'STRING', description: 'السبب (3 أحرف فأكثر)' } }, ['phone', 'activity_id', 'reason']) });
    d.push({ name: 'admin_loyalty_void_reward', description: 'إلغاء مكافأة ولاء (أدمن فقط) بمعرّفها (من admin_loyalty_player) وسبب مكتوب. يعرض أزرار تأكيد.', parameters: O({ reward_id: { type: 'NUMBER', description: 'معرّف المكافأة' }, reason: { type: 'STRING', description: 'السبب' } }, ['reward_id', 'reason']) });
  }
  if (t.adminChips) d.push({ name: 'admin_chips_topup', description: 'شحن رصيد تشبس للاعب بباقة معتمدة (أدمن فقط): p5 = 5 د.أ ← 55 تشبس · p10 = 10 د.أ ← 120 · p20 = 20 د.أ ← 260. برقم هاتف اللاعب. يعرض اسم اللاعب والباقة وأزرار تأكيد — حركة ماليّة موثَّقة باسم الأدمن ومصدرها واتساب، ويصل اللاعبَ إشعار.', parameters: O({ phone: { type: 'STRING', description: 'رقم اللاعب أو اسمه' }, pack: { type: 'STRING', description: 'p5 أو p10 أو p20' } }, ['phone', 'pack']) });
  if (t.adminActivities) d.push({ name: 'admin_create_activity', description: 'إنشاء فعاليّة جديدة (أدمن فقط) في مكانٍ معيّن بتاريخ ووقت. السعر والسعة والقالب والمنيو والجدول تُنسخ من آخر فعاليّة في المكان نفسه ما لم تُحدَّد. يعرض ملخّصاً وأزرار تأكيد. لا يرسل إشعاراً للاعبين (ذلك من الداشبورد).', parameters: O({ location_id: { type: 'NUMBER', description: 'معرّف المكان من get_locations' }, date: { type: 'STRING', description: 'YYYY-MM-DD' }, time: { type: 'STRING', description: 'HH:mm بتوقيت الأردن (الافتراضيّ 19:00)' }, price: { type: 'NUMBER', description: 'سعر الشخص (اختياريّ)' }, capacity: { type: 'NUMBER', description: 'السعة (اختياريّ)' }, name: { type: 'STRING', description: 'اسم الفعاليّة (اختياريّ)' } }, ['location_id', 'date']) });
  if (t.adminReports) d.push({ name: 'admin_quick_report', description: 'تقرير سريع (أدمن فقط) لفترة: today أو week أو month — الفعاليّات، الحضور (لاعبون لعبوا)، الحجوزات، إيراد رسوم اللعب المحصَّل، اللاعبون الجدد، الأكثر حضوراً، مع مقارنة بالفترة السابقة المماثلة.', parameters: O({ range: { type: 'STRING', description: 'today | week | month' } }, ['range']) });
  if (t.adminPlayers) d.push({ name: 'admin_find_player', description: 'بحث عن لاعب بالاسم أو الرقم (أدمن فقط): يعيد المطابقين مع أرقامهم ورتبهم وعدد مبارياتهم. كلّ أدوات الإدارة تقبل الاسم مباشرةً، فاستخدم هذه فقط عند الالتباس بين أكثر من لاعب.', parameters: O({ query: { type: 'STRING', description: 'اسم أو جزء منه أو رقم' } }, ['query']) });
  if (t.adminPlayers) d.push({ name: 'admin_player_manage', description: 'إدارة حساب لاعب برقم هاتفه (أدمن فقط): lock (قفل) · unlock (فكّ) · geofence_exempt (إعفاء من سياج الموقع) · geofence_unexempt · note (ملاحظة على اللاعب). القفل والإعفاء بزرّ تأكيد؛ الملاحظة تُحفظ مباشرة.', parameters: O({ phone: { type: 'STRING', description: 'رقم اللاعب أو اسمه' }, action: { type: 'STRING', description: 'lock | unlock | geofence_exempt | geofence_unexempt | note' }, reason: { type: 'STRING', description: 'السبب أو نصّ الملاحظة' } }, ['phone', 'action', 'reason']) });
  if (t.adminSeating) {
    d.push({ name: 'admin_seating_view', description: 'عرض إجلاس الغرفة الحيّة لفعاليّة (أدمن فقط): من يجلس في أيّ مقعد، المنتظرون، والمقاعد المثبَّتة لمن لم يصل. بلا أيّ أدوار. بلا معرّف ⟵ فعاليّة اليوم ذات الغرفة المفتوحة.', parameters: O({ activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة (اختياريّ)' } }) });
    d.push({ name: 'admin_seat_assign', description: 'تعيين مقعد لشخص قبل جلوسه (أدمن فقط) — **المحرّك** يختار الرقم وفق القيود والتقارب (كما يفعل وضع الباب)، ويُثبَّت له. لا يمكن اختيار رقم مقعد بعينه.', parameters: O({ phone: { type: 'STRING', description: 'رقم الشخص' }, name: { type: 'STRING', description: 'اسمه (اختياريّ)' }, activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة (اختياريّ)' } }, ['phone']) });
    d.push({ name: 'admin_block_pair', description: 'منع لاعبَين من التجاور دائماً (أدمن فقط) برقمَي هاتفيهما وسبب — قيد يحترمه المحرّك في كلّ توزيع لاحق. بزرّ تأكيد.', parameters: O({ phone1: { type: 'STRING', description: 'رقم الأوّل أو اسمه' }, phone2: { type: 'STRING', description: 'رقم الثاني أو اسمه' }, reason: { type: 'STRING', description: 'السبب' } }, ['phone1', 'phone2', 'reason']) });
    d.push({ name: 'admin_unblock_pair', description: 'إلغاء منع تجاور لاعبَين (أدمن فقط). بزرّ تأكيد.', parameters: O({ phone1: { type: 'STRING', description: 'رقم الأوّل أو اسمه' }, phone2: { type: 'STRING', description: 'رقم الثاني أو اسمه' } }, ['phone1', 'phone2']) });
    d.push({ name: 'admin_reshuffle', description: 'إعادة توزيع مقاعد الغرفة وفق قيود المحرّك (أدمن فقط) — **في اللوبي قبل توزيع الأدوار فقط**. تُجري معاينة أوّلاً (كم مخالفة تبقى، أيّ قيود أُرخيت) ثمّ تعرض زرّ «طبّق».', parameters: O({ activity_id: { type: 'NUMBER', description: 'معرّف الفعاليّة (اختياريّ)' } }) });
  }
  return d;
}

// ══════════════════════════════════════════════════════
// أدوات مساعدة
// ══════════════════════════════════════════════════════
// 🔎 لاعب برقمه **أو باسمه**. الأدمن يتكلّم بالأسماء («كم ختم عند راكان؟») — اشتراط الرقم كان يُفشل السؤال التالي مباشرةً.
//    اسم يطابق أكثر من لاعب ⟵ خطأ مع قائمة مرشّحين (اسم + آخر 4 أرقام) ليحدّد الأدمن، ولا تخمين أبداً في الإجراءات.
export async function findPlayer(db: any, raw: string): Promise<{ pl: { id: number; name: string; phone: string; isLocked: boolean; geofenceExempt: boolean; chips: number } } | { error: string; candidates?: any[] }> {
  const q = String(raw || '').trim();
  if (!q) return { error: 'حدّد اللاعب برقمه أو اسمه' };
  const cols = { id: players.id, name: players.name, phone: players.phone, isLocked: players.isLocked, geofenceExempt: players.geofenceExempt, chips: players.chipsBalance };
  if (/^[+\d\s()-]{7,}$/.test(q)) {
    const { normalizeLocalPhone } = await import('../utils/phone.util.js');
    const ph = normalizeLocalPhone(q); if (!ph) return { error: 'رقم غير صالح' };
    const [pl] = await db.select(cols).from(players).where(eq(players.phone, ph)).limit(1);
    return pl ? { pl: pl as any } : { error: 'لا يوجد لاعب مسجّل بهذا الرقم' };
  }
  const r: any = await db.execute(sql`
    SELECT id, name, phone, is_locked, geofence_exempt, chips_balance, COALESCE(lifetime_matches, 0) AS lm
      FROM players
     WHERE deleted_at IS NULL
       AND translate(lower(name), 'أإآةىؤئ', 'اااهيوي') LIKE '%' || translate(lower(${q}), 'أإآةىؤئ', 'اااهيوي') || '%'
     ORDER BY (translate(lower(name), 'أإآةىؤئ', 'اااهيوي') = translate(lower(${q}), 'أإآةىؤئ', 'اااهيوي')) DESC, lm DESC LIMIT 6`);
  const rows = rowsOf(r);
  if (!rows.length) return { error: `لا لاعب باسم يشبه «${q}» — اطلب رقمه أو جزءاً آخر من اسمه` };
  const exact = rows.filter((x: any) => String(x.name).trim().toLowerCase() === q.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : rows.length === 1 ? rows[0] : null;
  if (!pick) return { error: `أكثر من لاعب يطابق «${q}» — اسأل الأدمن أيّهم يقصد`, candidates: rows.map((x: any) => ({ name: x.name, phoneEndsWith: String(x.phone || '').slice(-4), matches: Number(x.lm) })) };
  // اسم مطابق حرفيّاً لكن غيره يحمل الاسم نفسه ضمن اسمه («محمد» وعشرات غيره): نُعيد المطابق ونُعلِم الأدمن بالبقيّة
  const others = rows.filter((x: any) => x.id !== pick.id).map((x: any) => `${x.name} (…${String(x.phone || '').slice(-4)})`);
  return { pl: { id: Number(pick.id), name: pick.name, phone: pick.phone, isLocked: !!pick.is_locked, geofenceExempt: !!pick.geofence_exempt, chips: Number(pick.chips_balance || 0) }, others } as any;
}
const playerByPhone = findPlayer;
async function stash(key: string, payload: any) { const { setAux } = await import('../config/redis.js'); await setAux(key, { ...payload, expiresAt: Date.now() + AUX_TTL_MS }); }
async function unstash(key: string): Promise<any | null> {
  const { getAux, deleteAux } = await import('../config/redis.js');
  const p = await getAux(key); await deleteAux(key).catch(() => {});
  return p && p.expiresAt > Date.now() ? p : null;
}
const confirmButtons = (body: string, okId: string, okTitle: string, cancelId = 'ext_cancel') => ({
  type: 'button', body: { text: body.slice(0, 1024) },
  action: { buttons: [{ type: 'reply', reply: { id: okId, title: okTitle.slice(0, 20) } }, { type: 'reply', reply: { id: cancelId, title: 'إلغاء' } }] },
});
const JO = 3 * 3600e3;
function jordanDayBounds(offsetDays = 0) {
  const j = new Date(Date.now() + JO); const start = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() + offsetDays) - JO);
  return { start, end: new Date(start.getTime() + 86400e3) };
}
// 🔁 استدعاء نقاط المحرّك القائمة من الداخل بهويّة الأدمن نفسه — نفس الحراسة ونفس القيود ونفس التدقيق،
//    بلا نسخ منطق الإجلاس إلى البوت (فلا يمكن أن «يتجاوز» البوت ما يسمح به المحرّك).
async function loopback(conv: any, method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const st = await staffOfConversation(conv);
  if (!st) return { status: 403, data: { error: 'المحادثة غير مربوطة بحساب موظّف' } };
  const { generateToken } = await import('../middleware/auth.js');
  const tok = generateToken({ id: st.id, username: st.username, role: st.role as any, displayName: st.displayName } as any);
  const res = await fetch(`http://127.0.0.1:${env.PORT}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function liveRoomOf(db: any, activityId?: number): Promise<{ state: any; activityId: number; activityName: string } | { error: string }> {
  let actId = Number(activityId);
  if (!Number.isFinite(actId) || actId <= 0) {
    const r: any = await db.execute(sql`SELECT s.activity_id FROM sessions s JOIN activities a ON a.id = s.activity_id
      WHERE s.is_active = true AND s.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date > NOW() - INTERVAL '18 hours' ORDER BY s.created_at DESC LIMIT 1`);
    actId = Number(rowsOf(r)[0]?.activity_id);
    if (!Number.isFinite(actId)) return { error: 'لا غرفة مفتوحة لأيّ فعاليّة الآن' };
  }
  const rooms: any = await db.execute(sql`SELECT s.session_code, a.name FROM sessions s JOIN activities a ON a.id = s.activity_id WHERE s.activity_id = ${actId} AND s.is_active = true AND s.deleted_at IS NULL ORDER BY s.created_at`);
  const { getRoomByCode } = await import('../game/state.js');
  for (const r of rowsOf(rooms)) {
    const st = await getRoomByCode(r.session_code).catch(() => null);
    if (st) return { state: st, activityId: actId, activityName: r.name };
  }
  return { error: 'لا غرفة مفتوحة لهذه الفعاليّة بعد' };
}
const REASON_AR: Record<string, string> = { drop_win: 'فوز مباراة', drop_top3: 'ضمن أفضل ثلاثة', drop_first_match: 'هديّة أوّل مباراة', admin_topup: 'شحن من الإدارة', admin_adjust: 'من النادي', rent_item: 'استئجار من الخزنة', renew_item: 'تجديد', refund: 'استرجاع', reward_top3: 'مكافأة الموسم', reward_birthday: 'عيديّة ميلاد', reward_loyalty: 'مكافأة بطاقة الولاء', gift_in: 'هديّة وصلتك', gift_out: 'هديّة أرسلتها' };
const KIND_AR: Record<string, string> = { free_visit: '🎟️ زيارة مجّانيّة', free_drink: '☕ مشروب مجّاني', chips: '🪙 تشبس' };

// ══════════════════════════════════════════════════════
// ⚙️ تنفيذ الأدوات
// ══════════════════════════════════════════════════════
export async function execExtTool(name: string, args: any, ctx: Ctx, h: ExtHelpers): Promise<any | undefined> {
  const db = getDB(); if (!db) return { error: 'DB unavailable' };
  const { conv, dryRun } = ctx;
  const adminGate = async () => (dryRun || await h.isAdminConversation(conv)) ? null : { error: 'هذه الأداة للأدمن فقط' };
  const show = async (interactive: any, preview: string) => { if (dryRun) ctx.interactives.push({ kind: 'buttons', preview }); else await h.sendMessage({ conversationId: conv.id, interactive, source: 'bot' }); };

  switch (name) {
    // ───────── اللاعب ─────────
    case 'offer_loyalty_reward_choice': {
      if (!conv.playerId) return { error: 'المحادثة غير مربوطة بحساب لاعب' };
      const L = await import('./loyalty.service.js');
      const me: any = await L.getMyLoyalty(conv.playerId);
      if (!me?.enabled) return { enabled: false, note: 'بطاقة الولاء غير متاحة حاليّاً' };
      const rw = me.pendingChoice; if (!rw) return { pending: false, note: 'لا مكافأة بانتظار الاختيار — أخبره بحالته من get_my_loyalty_card' };
      const kinds: string[] = (me.config.kinds || []).slice(0, 3);
      if (!kinds.length) return { error: 'لا أنواع مكافآت مفعَّلة' };
      const label: Record<string, string> = { free_visit: '🎟️ زيارة مجّانيّة', free_drink: '☕ مشروب مجّاني', chips: `🪙 ${me.config.chipsAmount} تشبس` };
      await show({
        type: 'button',
        body: { text: `🎁 اكتملت بطاقتك! اختر مكافأتك (الاختيار نهائيّ):\n• زيارة مجّانيّة: رسم اللعب على النادي، تُطبَّق على حجزك القادم من التطبيق\n• مشروب مجّاني: حتى ${me.config.drinkCapJod} د.أ يُخصم من فاتورتك بالمكان\n• ${me.config.chipsAmount} تشبس: تدخل رصيدك فوراً` },
        action: { buttons: kinds.map(k => ({ type: 'reply', reply: { id: `loy:${rw.id}:${k}`, title: label[k].slice(0, 20) } })) },
      }, 'أزرار اختيار مكافأة الولاء');
      return { sent: true, note: 'أُرسلت أزرار الاختيار — التنفيذ آليّ بعد ضغطه. اكتب جملة قصيرة فقط.' };
    }

    case 'get_my_invoice': {
      if (!conv.playerId) return { registered: false, note: 'الفاتورة مربوطة بحساب لاعب — المحادثة غير مربوطة' };
      const r: any = await db.execute(sql`
        SELECT o.activity_id, o.location_id FROM orders o WHERE o.player_id = ${conv.playerId} AND o.status <> 'cancelled' AND o.created_at > NOW() - INTERVAL '36 hours'
        UNION ALL
        SELECT a.id, a.location_id FROM bookings b JOIN activities a ON a.id = b.activity_id
         WHERE b.player_id = ${conv.playerId} AND b.deleted_at IS NULL AND a.date > NOW() - INTERVAL '36 hours' AND a.date < NOW() + INTERVAL '6 hours'
        LIMIT 1
      `);
      const hit = rowsOf(r)[0];
      if (!hit?.location_id) return { found: false, note: 'لا طلبات ولا فعاليّة له خلال آخر 36 ساعة — أخبره بذلك' };
      const { buildInvoiceData } = await import('./fnb-invoice.service.js');
      const inv: any = await buildInvoiceData(db as any, Number(hit.location_id), Number(hit.activity_id), conv.playerId);
      if (inv?.error) return { found: false, note: `لا فاتورة بعد: ${inv.error}` };
      const paid: any = await db.execute(sql`SELECT is_paid, invoice_no FROM order_invoices WHERE location_id = ${hit.location_id} AND activity_id = ${hit.activity_id} AND player_id = ${conv.playerId} LIMIT 1`);
      const pr = rowsOf(paid)[0];
      return {
        found: true, activity: inv.activityName, location: inv.locationName,
        lines: inv.lines.map((l: any) => ({ item: l.name, qty: l.quantity, total: l.lineTotal })),
        ordersTotalJOD: inv.ordersTotal, waterJOD: inv.waterCharge, minimumTopupJOD: inv.minTopup,
        gameFeeJOD: inv.gameFeeApplied ? inv.gameFeeAmount : 0, loyaltyDrinkDiscountJOD: inv.loyaltyDiscount || 0,
        grandTotalJOD: inv.grandTotal, paid: !!pr?.is_paid, invoiceNo: pr?.invoice_no ?? null,
        note: 'اعرضها له بنوداً قصيرة والإجماليّ بوضوح — الأرقام من النظام حرفيّاً بلا أيّ حساب منك. الدفع في المكان. «تكملة الحدّ الأدنى» تظهر فقط لمن لعب ولم تبلغ طلباته الحدّ.',
      };
    }

    case 'get_my_chips': {
      if (!conv.playerId) return { registered: false, note: 'التشبس مربوط بحساب لاعب' };
      const C = await import('./chips.service.js');
      const balance = await C.getChipsBalance(conv.playerId);
      const ledger: any[] = await C.getPlayerLedger(conv.playerId, 8) as any;
      let affordable = 0, cheapest: number | null = null;
      try {
        const { listCatalog } = await import('./chips-store.service.js');
        const items: any[] = (await listCatalog(false)).filter((i: any) => i.isPurchasable !== false && !i.closedAt && Number(i.priceChips) > 0);
        affordable = items.filter(i => Number(i.priceChips) <= balance).length;
        cheapest = items.length ? Math.min(...items.map(i => Number(i.priceChips))) : null;
      } catch { /* الكتالوج تكميليّ */ }
      return {
        balance, affordableItems: affordable, cheapestItemPrice: cheapest,
        lastMoves: (ledger || []).map((l: any) => ({ amount: l.amount, what: REASON_AR[l.reason] || l.reason, when: h.fmtJo(l.createdAt, false) })),
        note: 'الرصيد لا ينتهي؛ المزايا المستأجرة لها مدّة. الشراء والتجهيز من «خزنة الدون» في التطبيق فقط — لا بيع ولا شحن منك.',
      };
    }

    case 'request_change_people': {
      const actId = parseInt(args.activity_id); const n = Math.trunc(Number(args.new_count));
      if (!Number.isFinite(actId) || !(n >= 1 && n <= 12)) return { error: 'معرّف الفعاليّة والعدد (1–12) مطلوبان' };
      const [r] = await db.select({ id: reservations.id, people: reservations.peopleCount, status: reservations.status, name: activities.name, date: activities.date })
        .from(reservations).innerJoin(activities, eq(reservations.activityId, activities.id))
        .where(and(eq(reservations.activityId, actId), isNull(reservations.deletedAt), sql`(${reservations.phone} = ${conv.phone} ${conv.playerId ? sql`OR ${reservations.playerId} = ${conv.playerId}` : sql``})`)).limit(1);
      if (!r) return { found: false, note: 'لا حجز له في هذه الفعاليّة — اعرض حجزاً جديداً' };
      if (Number(r.people) === n) return { same: true, note: 'العدد هو نفسه — لا تغيير' };
      await show(confirmButtons(`✏️ تعديل حجزك في «${r.name}» (${h.fmtJo(r.date)})\nمن ${r.people} إلى ${n} أشخاص — أثبّت التعديل؟`, `chgp:${r.id}:${n}`, 'ثبّت التعديل ✓', 'chg_keep'), `تعديل العدد ${r.people}→${n}`);
      return { sent: true, note: 'أُرسلت أزرار التأكيد — التنفيذ آليّ بعد ضغطه.' };
    }

    case 'get_tonight_schedule': {
      let actId = parseInt(args.activity_id);
      if (!Number.isFinite(actId)) {
        const r: any = await db.execute(sql`
          SELECT a.id FROM reservations r JOIN activities a ON a.id = r.activity_id
           WHERE r.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date > NOW() - INTERVAL '6 hours'
             AND (r.phone = ${conv.phone} ${conv.playerId ? sql`OR r.player_id = ${conv.playerId}` : sql``})
           ORDER BY a.date ASC LIMIT 1`);
        actId = Number(rowsOf(r)[0]?.id);
        if (!Number.isFinite(actId)) {
          const n: any = await db.execute(sql`SELECT id FROM activities WHERE deleted_at IS NULL AND status IN ('planned','active') AND date > NOW() - INTERVAL '6 hours' ORDER BY date ASC LIMIT 1`);
          actId = Number(rowsOf(n)[0]?.id);
        }
      }
      if (!Number.isFinite(actId)) return { found: false, note: 'لا فعاليّة قادمة' };
      const [a] = await db.select({ name: activities.name, date: activities.date, sch: activities.gameSchedule }).from(activities).where(eq(activities.id, actId)).limit(1);
      if (!a) return { found: false };
      const items: any[] = Array.isArray(a.sch) ? a.sch as any[] : [];
      if (!items.length) return { found: true, activity: a.name, dateText: h.fmtJo(a.date), schedule: [], note: 'لا جدول مكتوب لهذه الفعاليّة — اذكر موعد البدء فقط' };
      return { found: true, activity: a.name, dateText: h.fmtJo(a.date), schedule: items.map(x => ({ what: x.label, kind: x.kind === 'break' ? 'استراحة' : 'لعبة', from: x.start, to: x.end })), note: 'الجدول تقديريّ وقد ينزاح حسب مجريات اللعب — قلها دائماً. المتأخّر ينضمّ للّعبة التالية.' };
    }

    case 'get_role_guide': {
      const all: any = await db.execute(sql`SELECT name_ar, team, gen_min_players, one_liner, how_it_works, tips, extra_limits, interacts_with, win_condition_description FROM role_definitions ORDER BY team, gen_min_players, id`);
      const roles = rowsOf(all);
      const TEAM: Record<string, string> = { MAFIA: 'المافيا', CITIZEN: 'المواطنون', NEUTRAL: 'محايد' };
      const norm = (s: string) => String(s || '').replace(/[أإآ]/g, 'ا').replace(/[ًٌٍَُِّْ]/g, '').replace(/ة/g, 'ه').replace(/^ال/, '').trim();
      const q = norm(args.role_name || '');
      if (!q) return { roles: roles.map(r => ({ name: r.name_ar, team: TEAM[r.team] || r.team, oneLine: r.one_liner })), note: 'اعرض القائمة مجمّعة بالفريق باختصار، واعرض شرح أيّ دور بالتفصيل. كلّ هذه الأدوار موجودة في كلّ لعبة — لا تذكر أيّ عتبة أو عدد لاعبين.' };
      const hit = roles.find(r => norm(r.name_ar) === q) || roles.find(r => norm(r.name_ar).includes(q) || q.includes(norm(r.name_ar)));
      if (!hit) return { found: false, available: roles.map(r => r.name_ar), note: 'لم أجد دوراً بهذا الاسم — اعرض الأسماء المتاحة' };
      return { found: true, name: hit.name_ar, team: TEAM[hit.team] || hit.team, oneLine: hit.one_liner, howItWorks: hit.how_it_works, tips: hit.tips, limits: hit.extra_limits, interactsWith: hit.interacts_with, winCondition: hit.win_condition_description, note: 'اشرح بوضوح: فريقه، قدرته بالضبط، قيوده، وشرط فوزه — هذا المصدر أحدث من قاعدة المعرفة. 🚫 لا تذكر «من أيّ عدد يظهر» ولا أيّ عتبة لاعبين: غرفنا لا تقلّ عن عشرين فكلّ الأدوار حاضرة دائماً.' };
    }

    case 'start_registration': {
      if (conv.playerId) return { already: true, note: 'هذا الرقم مربوط بحساب لاعب أصلاً — لا تسجيل جديد' };
      const { normalizeLocalPhone } = await import('../utils/phone.util.js');
      const ph = normalizeLocalPhone(conv.phone);
      if (!ph) return { error: 'التسجيل من الواتساب متاح للأرقام الأردنيّة فقط — وجّهه للتسجيل من الموقع (send_social_links)' };
      const [ex] = await db.select({ id: players.id }).from(players).where(eq(players.phone, ph)).limit(1);
      if (ex) return { already: true, note: 'يوجد حساب بهذا الرقم — اربط المحادثة به عبر request_account_link برقمه نفسه' };
      const nameIn = String(args.full_name || '').replace(/\s+/g, ' ').trim();
      if (nameIn.length < 3 || nameIn.length > 60) return { error: 'الاسم يجب أن يكون بين 3 و60 حرفاً' };
      const g = /^f|female|انث|أنث|بنت/i.test(String(args.gender || '')) ? 'FEMALE' : /^m|male|ذكر|شب/i.test(String(args.gender || '')) ? 'MALE' : null;
      if (!g) return { error: 'الجنس مطلوب: ذكر أو أنثى' };
      const dob = String(args.dob || '').trim();
      const { ageFromDob } = await import('./consent.service.js');
      const age = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? ageFromDob(dob) : null;
      if (age == null || age > 100) return { error: 'تاريخ الميلاد غير صالح — اطلبه بصيغة يوم/شهر/سنة وحوّله إلى YYYY-MM-DD' };
      if (age < 8) return { error: 'الحدّ الأدنى للعمر ثماني سنوات' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `تأكيد إنشاء حساب: ${nameIn}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`wa-reg:${conv.id}`, { name: nameIn, gender: g, dob, phone: ph });
      await h.sendMessage({ conversationId: conv.id, source: 'bot', interactive: confirmButtons(
        `📝 إنشاء حسابك في نادي المافيا:\nالاسم: ${nameIn}\nالجنس: ${g === 'FEMALE' ? 'أنثى' : 'ذكر'}\nتاريخ الميلاد: ${dob}\nرقم الدخول: ${ph}\n\n${age < 18 ? 'عمرك دون 18 — سيُطلب تأكيد وليّ أمرك داخل التطبيق عند أوّل دخول.\n' : ''}أنشئ الحساب؟`,
        'reg_ok', 'أنشئ حسابي ✓') });
      return { pendingConfirm: true, note: 'أُرسل الملخّص وأزرار التأكيد — الإنشاء آليّ بعد ضغطه وتصله كلمة سرّ مؤقّتة. لا تكتب شيئاً طويلاً.' };
    }

    // ───────── 📚 قاعدة المعرفة (أدمن) ─────────
    // 🔴 ثلاثة أفعالٍ محدودة لا «أرسل لي المعرفة الجديدة»: سبعة عشر ألف حرفٍ لا تمرّ في
    //    رسالة، وترك النموذج يُعيد كتابة الملفّ كلّه يعني حذفاً صامتاً لما لم يفهمه.
    //    والكتابة لا تقع هنا: هذه تتحقّق وتعاين، والتنفيذ في معالج الزرّ الحتميّ.
    case 'admin_kb_show': {
      const g = await adminGate(); if (g) return g;
      const q = String(args.query || '').trim();
      if (q.length < 2) return { error: 'اكتب كلمةً للبحث (حرفان فأكثر)' };
      const { getBotSettings } = await import('./whatsapp-bot.service.js');
      const st: any = await getBotSettings();
      const kb = String(st.knowledgeBase || '');
      const hits = kb.split('\n').map((t: string, i: number) => ({ line: i + 1, text: t }))
        .filter((x: any) => x.text.includes(q)).slice(0, 12);
      if (!hits.length) {
        return { found: 0, kbChars: kb.length,
          note: 'لا ذكر لهذه العبارة في المعرفة إطلاقاً. أخبر الأدمن صراحةً أنّ البوت لا يملك معلومةً عنها وأنّ أيّ جوابٍ عنها الآن تخمين — واعرض إضافتها بـadmin_kb_add.' };
      }
      return { found: hits.length, lines: hits, kbChars: kb.length,
        note: 'اعرض النصّ الحرفيّ كما هو بلا إعادة صياغة ليقرّر الأدمن. وللتصحيح انسخ النصّ القديم حرفيّاً إلى admin_kb_replace.' };
    }

    case 'admin_kb_add':
    case 'admin_kb_replace': {
      const g = await adminGate(); if (g) return g;
      const { getBotSettings } = await import('./whatsapp-bot.service.js');
      const st: any = await getBotSettings();
      const kb = String(st.knowledgeBase || '');
      const KB_MAX = 40000;
      let next = '', preview = '', kind: 'add' | 'replace' = 'add';

      if (name === 'admin_kb_add') {
        const fact = String(args.fact || '').trim();
        if (fact.length < 10) return { error: 'المعلومة قصيرة جدّاً — اكتبها جملةً مكتملة مفهومة بلا سياق المحادثة' };
        if (kb.includes(fact)) return { error: 'هذه المعلومة موجودة حرفيّاً في المعرفة أصلاً' };
        const section = String(args.section || '').trim();
        const bullet = fact.startsWith('-') ? fact : '- ' + fact;
        if (section && kb.includes(section)) {
          const at = kb.indexOf(section);
          const eol = kb.indexOf('\n', at);
          const cut = eol < 0 ? kb.length : eol + 1;
          next = kb.slice(0, cut) + bullet + '\n' + kb.slice(cut);
        } else if (section) {
          next = kb.replace(/\s+$/, '') + '\n\n═══ ' + section + ' ═══\n' + bullet + '\n';
        } else {
          next = kb.replace(/\s+$/, '') + '\n' + bullet + '\n';
        }
        preview = '📚 إضافة إلى المعرفة' + (section ? ' (باب: ' + section + ')' : '') + ':\n\n' + bullet;
      } else {
        kind = 'replace';
        const find = String(args.find || '').trim();
        const rep = String(args.replace ?? '');
        if (find.length < 5) return { error: 'النصّ القديم قصير جدّاً — انسخه حرفيّاً من admin_kb_show (٥ أحرف فأكثر)' };
        const parts = kb.split(find);
        const count = parts.length - 1;
        if (count === 0) return { error: 'لم أجد هذا النصّ حرفيّاً — استعمل admin_kb_show وانسخه كما هو بفواصله وتشكيله' };
        if (count > 1) {
          return {
            error: 'النصّ مكرّر في ' + count + ' مواضع — لا أعدّل بالتخمين',
            matches: kb.split('\n').filter((l: string) => l.includes(find)).slice(0, 6),
            note: 'اعرض المواضع على الأدمن واطلب نصّاً أطول يميّز الموضع المقصود.',
          };
        }
        next = parts[0] + rep + parts[1];
        preview = '📚 تصحيح في المعرفة:\n\n❌ القديم:\n' + find.slice(0, 280) + '\n\n✅ الجديد:\n' + (rep ? rep.slice(0, 280) : '(حذف)');
      }

      if (next.length > KB_MAX) return { error: 'المعرفة ستتجاوز الحدّ (' + KB_MAX + ' حرف) — احذف ما لم يعد صحيحاً قبل الإضافة' };
      const delta = next.length - kb.length;
      // 💸 كلّ حرفٍ يُضاف يُدفع ثمنه مع **كلّ ردّ** إلى الأبد (٩٨٪ من الكلفة إدخال)
      const sizeLine = '\n\n📏 المعرفة: ' + kb.length + ' ← ' + next.length + ' حرف (' + (delta >= 0 ? '+' : '') + delta + ')';
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: 'تأكيد تعديل المعرفة' }); return { pendingConfirm: true, dryRun: true, delta }; }

      await stash('adm-kb:' + conv.id, { kind, next, before: kb.length, after: next.length });
      await show(confirmButtons(preview + sizeLine + '\n\nأحفظ التعديل؟', 'admkb:' + conv.id, 'احفظ ✅'), 'تأكيد تعديل المعرفة');
      return { pendingConfirm: true, delta, note: 'أُرسلت المعاينة وأزرار التأكيد — لا تقل إنّ التعديل تمّ، ينتظر ضغط الأدمن.' };
    }

    // ───────── الأدمن ─────────
    case 'admin_tonight': {
      const g = await adminGate(); if (g) return g;
      const { start, end } = jordanDayBounds();
      const acts: any = await db.execute(sql`
        SELECT a.id, a.name, a.date, a.base_price, a.max_capacity, l.name AS loc FROM activities a LEFT JOIN locations l ON l.id = a.location_id
         WHERE a.deleted_at IS NULL AND a.date >= ${start} AND a.date < ${end} AND COALESCE(l.is_test_location,false) = false ORDER BY a.date`);
      const out: any[] = [];
      let lc: any = null; try { const L = await import('./loyalty.service.js'); const c = await L.getLoyaltyConfig(); lc = c.enabled ? c : null; } catch { /* بلا ولاء */ }
      for (const a of rowsOf(acts)) {
        const r: any = await db.execute(sql`
          SELECT (SELECT COUNT(*)::int FROM reservations r WHERE r.activity_id = ${a.id} AND r.deleted_at IS NULL AND r.status <> 'waitlist') AS res_rows,
                 (SELECT COALESCE(SUM(people_count),0)::int FROM reservations r WHERE r.activity_id = ${a.id} AND r.deleted_at IS NULL AND r.status <> 'waitlist') AS res_people,
                 (SELECT COUNT(*)::int FROM reservations r WHERE r.activity_id = ${a.id} AND r.deleted_at IS NULL AND r.status = 'waitlist') AS waitlist,
                 (SELECT COUNT(*)::int FROM reservations r WHERE r.activity_id = ${a.id} AND r.deleted_at IS NULL AND r.attended = true) AS attended,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL) AS bookings,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL AND b.is_free) AS free,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL AND b.is_paid AND NOT b.is_free) AS paid,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL AND NOT b.is_paid AND NOT b.is_free) AS unpaid,
                 (SELECT COALESCE(SUM(paid_amount),0) FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL) AS collected,
                 (SELECT COUNT(*)::int FROM matches m JOIN sessions s ON s.id = m.session_id WHERE s.activity_id = ${a.id} AND m.deleted_at IS NULL) AS matches,
                 (SELECT COUNT(DISTINCT mp.player_id)::int FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id WHERE s.activity_id = ${a.id} AND m.deleted_at IS NULL) AS played,
                 (SELECT COUNT(*)::int FROM orders o WHERE o.activity_id = ${a.id} AND o.status IN ('new','preparing')) AS open_orders,
                 (SELECT EXTRACT(EPOCH FROM (NOW() - MIN(o.created_at)))/60 FROM orders o WHERE o.activity_id = ${a.id} AND o.status IN ('new','preparing')) AS oldest_order_min,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL AND b.created_by = 'player-app'
                     AND EXTRACT(EPOCH FROM (${a.date}::timestamp - b.created_at))/3600 >= ${lc ? lc.minLeadHours : 9999}) AS early_bookings,
                 (SELECT COUNT(*)::int FROM loyalty_stamps st WHERE st.activity_id = ${a.id} AND st.voided_at IS NULL) AS stamps`);
        const x = rowsOf(r)[0] || {};
        out.push({
          id: a.id, name: a.name, location: a.loc, startsAt: h.fmtJo(a.date), capacity: a.max_capacity, pricePerPerson: a.base_price,
          reservations: { rows: x.res_rows, people: x.res_people, waitlist: x.waitlist, markedAttended: x.attended },
          bookings: { total: x.bookings, paid: x.paid, unpaid: x.unpaid, free: x.free, collectedJOD: Number(x.collected || 0), expectedFromUnpaidJOD: Math.round(Number(x.unpaid || 0) * Number(a.base_price || 0) * 100) / 100 },
          play: { matchesFinished: x.matches, playersPlayed: x.played },
          menu: { openOrders: x.open_orders, oldestOpenOrderMinutes: x.oldest_order_min != null ? Math.round(Number(x.oldest_order_min)) : null },
          loyalty: lc ? { earlyAppBookings: x.early_bookings, stampsGranted: x.stamps } : 'متوقّفة',
        });
      }
      if (!out.length) return { activities: [], note: 'لا فعاليّات اليوم — اذكر أقرب فعاليّة قادمة إن سُئلت (get_available_activities)' };
      return { day: h.fmtJo(new Date(), false), activities: out, note: 'لخّص للأدمن باختصار ما يحتاج تدخّلاً أوّلاً: غير المدفوعين، قائمة الانتظار، الطلبات المفتوحة المتأخّرة. الأرقام من النظام حرفيّاً.' };
    }

    case 'admin_loyalty_grant_stamp': {
      const g = await adminGate(); if (g) return g;
      const f = await playerByPhone(db, args.phone); if ('error' in f) return { error: f.error, candidates: (f as any).candidates };
      const actId = parseInt(args.activity_id); const reason = String(args.reason || '').trim();
      if (reason.length < 3) return { error: 'السبب مطلوب (3 أحرف فأكثر)' };
      const [a] = await db.select({ name: activities.name, date: activities.date }).from(activities).where(eq(activities.id, actId)).limit(1);
      if (!a) return { error: 'الفعاليّة غير موجودة' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `ختم يدويّ: ${f.pl!.name}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-stamp:${conv.id}`, { playerId: f.pl!.id, playerName: f.pl!.name, actId, actName: a.name, reason });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(`✦ منح ختم ولاء يدويّ؟\nاللاعب: ${f.pl!.name} (${f.pl!.phone})\nالفعاليّة: ${a.name} — ${h.fmtJo(a.date)}\nالسبب: ${reason}`, `admstamp:${conv.id}`, 'امنح الختم ✓') });
      return { pendingConfirm: true, note: 'أُرسلت أزرار التأكيد — ينتظر ضغط الأدمن.' };
    }

    case 'admin_loyalty_void_reward': {
      const g = await adminGate(); if (g) return g;
      const id = parseInt(args.reward_id); const reason = String(args.reason || '').trim();
      if (!Number.isFinite(id) || reason.length < 3) return { error: 'معرّف المكافأة والسبب مطلوبان' };
      const rr: any = await db.execute(sql`SELECT r.id, r.kind, r.status, r.period, p.name FROM loyalty_rewards r JOIN players p ON p.id = r.player_id WHERE r.id = ${id}`);
      const rw = rowsOf(rr)[0]; if (!rw) return { error: 'المكافأة غير موجودة' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `إلغاء مكافأة #${id}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-voidrw:${conv.id}`, { rewardId: id, reason, playerName: rw.name });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(`🚫 إلغاء مكافأة ولاء #${id}؟\nاللاعب: ${rw.name}\nالنوع: ${KIND_AR[rw.kind] || 'لم يُختر'} · الحالة: ${rw.status} · بطاقة ${rw.period}\nالسبب: ${reason}`, `admvoidrw:${conv.id}`, 'ألغِ المكافأة') });
      return { pendingConfirm: true };
    }

    case 'admin_chips_topup': {
      const g = await adminGate(); if (g) return g;
      const f = await playerByPhone(db, args.phone); if ('error' in f) return { error: f.error, candidates: (f as any).candidates };
      const { getChipsPack } = await import('../schemas/chips.schema.js');
      const pack = getChipsPack(String(args.pack || '').trim().toLowerCase());
      if (!pack) return { error: 'باقة غير معتمدة — المتاح: p5 (5 د.أ ← 55) · p10 (10 د.أ ← 120) · p20 (20 د.أ ← 260)' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `شحن ${pack.chips} تشبس لـ${f.pl!.name}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-chips:${conv.id}`, { playerId: f.pl!.id, playerName: f.pl!.name, phone: f.pl!.phone, packId: pack.id, requestId: `wa-${conv.id}-${Date.now().toString(36)}` });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(
        `🪙 شحن تشبس — حركة ماليّة\nاللاعب: ${f.pl!.name} (${f.pl!.phone})\nرصيده الآن: ${f.pl!.chips}\nالباقة: ${pack.labelAr}\n\nتُسجَّل باسمك ومصدرها «واتساب»، ويصل اللاعبَ إشعار. هل استلمت ${pack.jod} د.أ نقداً؟`,
        `admchips:${conv.id}`, 'نعم، اشحن ✓') });
      return { pendingConfirm: true, note: 'أُرسلت أزرار التأكيد — لا يُشحن شيء قبل ضغط الأدمن.' };
    }

    case 'admin_create_activity': {
      const g = await adminGate(); if (g) return g;
      const locId = parseInt(args.location_id);
      const [loc] = await db.select({ id: locations.id, name: locations.name, isTest: locations.isTestLocation }).from(locations).where(and(eq(locations.id, locId), isNull(locations.deletedAt))).limit(1);
      if (!loc) return { error: 'المكان غير موجود — استخدم get_locations' };
      const date = String(args.date || '').trim(); const time = /^\d{1,2}:\d{2}$/.test(String(args.time || '')) ? String(args.time).padStart(5, '0') : '19:00';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'التاريخ بصيغة YYYY-MM-DD' };
      const when = new Date(`${date}T${time}:00+03:00`);
      if (isNaN(when.getTime()) || when.getTime() < Date.now() - 3600e3) return { error: 'التاريخ غير صالح أو في الماضي' };
      const dupe: any = await db.execute(sql`SELECT id, name FROM activities WHERE location_id = ${locId} AND deleted_at IS NULL AND date = ${when} LIMIT 1`);
      if (rowsOf(dupe)[0]) return { duplicate: true, existing: rowsOf(dupe)[0], note: 'توجد فعاليّة في المكان نفسه والموعد نفسه — لا تُنشئ ثانية' };
      const tplR: any = await db.execute(sql`SELECT * FROM activities WHERE location_id = ${locId} AND deleted_at IS NULL ORDER BY date DESC LIMIT 1`);
      const tpl = rowsOf(tplR)[0] || {};
      const MON = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران', 'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];
      const j = new Date(when.getTime() + JO);
      const nm = String(args.name || '').trim() || `${loc.name} ${j.getUTCDate()} ${MON[j.getUTCMonth()]}`;
      const price = args.price != null && Number(args.price) >= 0 ? Number(args.price) : Number(tpl.base_price || 0);
      const cap = args.capacity != null && Number(args.capacity) >= 6 ? Math.min(60, Math.trunc(Number(args.capacity))) : Number(tpl.max_capacity || 20);
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `إنشاء فعاليّة: ${nm}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-newact:${conv.id}`, { locId, name: nm, whenISO: when.toISOString(), price, cap, tplId: tpl.id || null });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(
        `📅 إنشاء فعاليّة جديدة؟\nالاسم: ${nm}\nالمكان: ${loc.name}\nالموعد: ${h.fmtJo(when)}\nالسعر: ${price} د.أ · السعة: ${cap}\n${tpl.id ? `الإعدادات (قالب المقاعد، المنيو، الجدول، السياج) منسوخة من «${tpl.name}».` : 'بلا فعاليّة سابقة للنسخ — إعدادات افتراضيّة.'}\nلا يُرسل إشعار للاعبين من هنا.`,
        `admnewact:${conv.id}`, 'أنشئ الفعاليّة ✓') });
      return { pendingConfirm: true };
    }

    case 'admin_quick_report': {
      const g = await adminGate(); if (g) return g;
      const range = ['today', 'week', 'month'].includes(String(args.range)) ? String(args.range) : 'today';
      const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
      const { end } = jordanDayBounds(); const from = new Date(end.getTime() - days * 86400e3); const prevFrom = new Date(from.getTime() - days * 86400e3);
      const one = async (a: Date, b: Date) => {
        const r: any = await db.execute(sql`
          WITH acts AS (SELECT a.id FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.deleted_at IS NULL AND a.date >= ${a} AND a.date < ${b} AND COALESCE(l.is_test_location,false) = false)
          SELECT (SELECT COUNT(*)::int FROM acts) AS activities,
                 (SELECT COUNT(*)::int FROM (SELECT DISTINCT s.activity_id, mp.player_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id WHERE m.deleted_at IS NULL AND mp.player_id IS NOT NULL AND s.activity_id IN (SELECT id FROM acts)) v) AS visits,
                 (SELECT COUNT(DISTINCT mp.player_id)::int FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id WHERE m.deleted_at IS NULL AND s.activity_id IN (SELECT id FROM acts)) AS unique_players,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id IN (SELECT id FROM acts)) AS bookings,
                 (SELECT COALESCE(SUM(b.paid_amount),0) FROM bookings b WHERE b.deleted_at IS NULL AND b.activity_id IN (SELECT id FROM acts)) AS game_revenue,
                 (SELECT COUNT(*)::int FROM bookings b WHERE b.deleted_at IS NULL AND NOT b.is_paid AND NOT b.is_free AND b.activity_id IN (SELECT id FROM acts)) AS unpaid_bookings,
                 (SELECT COUNT(*)::int FROM players p WHERE p.created_at >= ${a} AND p.created_at < ${b} AND p.deleted_at IS NULL) AS new_players`);
        const x = rowsOf(r)[0] || {};
        return { activities: x.activities, visits: x.visits, uniquePlayers: x.unique_players, bookings: x.bookings, gameRevenueJOD: Number(x.game_revenue || 0), unpaidBookings: x.unpaid_bookings, newPlayers: x.new_players };
      };
      const cur = await one(from, end); const prev = await one(prevFrom, from);
      const top: any = await db.execute(sql`
        SELECT p.name, COUNT(DISTINCT s.activity_id)::int AS visits FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
          JOIN activities a ON a.id = s.activity_id JOIN players p ON p.id = mp.player_id
         WHERE m.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${end} GROUP BY p.id, p.name ORDER BY visits DESC LIMIT 5`);
      return { range, from: h.fmtJo(from, false), to: h.fmtJo(new Date(end.getTime() - 1), false), current: cur, previousSamePeriod: prev, topAttendees: rowsOf(top), note: 'اعرض الأرقام مع اتّجاهها مقابل الفترة السابقة (ارتفاع/انخفاض). إيراد رسوم اللعب = المحصَّل فعليّاً من الحجوزات فقط (لا يشمل المنيو ولا التشبس). التقارير التفصيليّة من الداشبورد.' };
    }

    case 'admin_find_player': {
      const g = await adminGate(); if (g) return g;
      const q = String(args.query || '').trim(); if (q.length < 2) return { error: 'اكتب حرفين على الأقلّ' };
      const r: any = await db.execute(sql`
        SELECT id, name, phone, rank_tier, COALESCE(lifetime_matches,0) AS lm FROM players WHERE deleted_at IS NULL
           AND (translate(lower(name), 'أإآةىؤئ', 'اااهيوي') LIKE '%' || translate(lower(${q}), 'أإآةىؤئ', 'اااهيوي') || '%' OR phone LIKE ${'%' + q.replace(/\D/g, '') + '%'})
         ORDER BY lm DESC LIMIT 8`);
      return { matches: rowsOf(r).map((x: any) => ({ id: x.id, name: x.name, phone: x.phone, rank: x.rank_tier, lifetimeMatches: Number(x.lm) })) };
    }

    case 'admin_player_manage': {
      const g = await adminGate(); if (g) return g;
      const f = await playerByPhone(db, args.phone); if ('error' in f) return { error: f.error, candidates: (f as any).candidates };
      const action = String(args.action || ''); const reason = String(args.reason || '').trim();
      if (reason.length < 3) return { error: 'السبب/النصّ مطلوب (3 أحرف فأكثر)' };
      if (action === 'note') {
        if (dryRun) return { saved: true, dryRun: true };
        const st = await staffOfConversation(conv);
        await db.insert(playerNotes).values({ playerId: f.pl!.id, staffId: st?.id ?? null, staffUsername: st?.username ?? 'whatsapp', text: `💬 (واتساب) ${reason}`.slice(0, 1000) } as any);
        await auditBot(conv, 'wa:player-note', { playerId: f.pl!.id }, { targetName: f.pl!.name });
        return { saved: true, player: f.pl!.name };
      }
      const LABEL: Record<string, string> = { lock: '🔒 قفل الحساب', unlock: '🔓 فكّ قفل الحساب', geofence_exempt: '📍 إعفاء من سياج الموقع', geofence_unexempt: '📍 إلغاء إعفاء السياج' };
      if (!LABEL[action]) return { error: 'إجراء غير معروف' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `${LABEL[action]}: ${f.pl!.name}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-pl:${conv.id}`, { playerId: f.pl!.id, playerName: f.pl!.name, action, reason });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(`${LABEL[action]}؟\nاللاعب: ${f.pl!.name} (${f.pl!.phone})\nالحالة الآن: ${f.pl!.isLocked ? 'مقفل' : 'غير مقفل'} · السياج: ${f.pl!.geofenceExempt ? 'مُعفى' : 'غير مُعفى'}\nالسبب: ${reason}`, `admpl:${conv.id}`, 'نفّذ ✓') });
      return { pendingConfirm: true };
    }
    // ───────── الإجلاس (عبر نقاط المحرّك نفسها) ─────────
    case 'admin_seating_view': {
      const g = await adminGate(); if (g) return g;
      const lr = await liveRoomOf(db, parseInt(args.activity_id)); if ('error' in lr) return { found: false, note: lr.error };
      const st = lr.state;
      return {
        found: true, activity: lr.activityName, roomCode: st.roomCode, phase: st.phase, maxSeats: st.config?.maxPlayers,
        seated: (st.players || []).filter((x: any) => !x.seatHeld).map((x: any) => ({ seat: x.physicalId, name: x.name, gender: x.gender === 'FEMALE' ? 'أنثى' : 'ذكر' })).sort((a: any, b: any) => a.seat - b.seat),
        waitingNextGame: (st.spectators || []).map((x: any) => ({ seat: x.physicalId, name: x.name })),
        pinnedForArrivals: (st.pinnedSeats || []).map((x: any) => ({ seat: Number(x.seatNumber), name: x.playerName || x.phone || '' })),
        note: 'اعرضها قائمة مرتّبة بالمقعد. لا أدوار هنا إطلاقاً. تغيير مقعد لاعب جالس أثناء اللعب يتمّ من واجهة القائد فقط.',
      };
    }

    case 'admin_seat_assign': {
      const g = await adminGate(); if (g) return g;
      if (dryRun) return { dryRun: true, note: '(ساحة اختبار — لا تعيين فعليّ)' };
      const lr = await liveRoomOf(db, parseInt(args.activity_id)); if ('error' in lr) return { error: lr.error };
      const f = await playerByPhone(db, args.phone);
      const { normalizeLocalPhone } = await import('../utils/phone.util.js');
      const pl = 'pl' in f ? f.pl : null;
      const ph = pl?.phone || normalizeLocalPhone(String(args.phone || ''));
      if (!ph) return { error: ('error' in f ? f.error : 'رقم غير صالح'), candidates: (f as any).candidates };
      const r = await loopback(conv, 'POST', '/api/seating/door-assign', { activityId: lr.activityId, phone: ph, name: pl?.name || String(args.name || '').trim() || ph, playerId: pl?.id ?? null });
      if (r.status !== 200 || !r.data?.success) return { error: r.data?.error || 'تعذّر التعيين' };
      await auditBot(conv, 'wa:seat-assign', { phone: ph, seat: r.data.seat, already: r.data.already ?? null }, { activityId: lr.activityId, targetName: pl?.name || args.name || ph });
      return { assigned: true, seat: r.data.seat, already: r.data.already || null, who: pl?.name || args.name || ph, note: r.data.already ? 'له مقعد أصلاً (جالس/منتظر/مثبَّت) — أعطه رقمه.' : 'المحرّك اختار المقعد وفق القيود وثبّته له حتى يصل.' };
    }

    case 'admin_block_pair':
    case 'admin_unblock_pair': {
      const g = await adminGate(); if (g) return g;
      const a = await playerByPhone(db, args.phone1); const b = await playerByPhone(db, args.phone2);
      if ('error' in a) return { error: `الأوّل: ${a.error}` }; if ('error' in b) return { error: `الثاني: ${b.error}` };
      if (a.pl!.id === b.pl!.id) return { error: 'الرقمان لنفس اللاعب' };
      const block = name === 'admin_block_pair'; const reason = String(args.reason || '').trim();
      if (block && reason.length < 3) return { error: 'السبب مطلوب' };
      if (dryRun) { ctx.interactives.push({ kind: 'buttons', preview: `${block ? 'منع' : 'إلغاء منع'} تجاور ${a.pl!.name} و${b.pl!.name}` }); return { pendingConfirm: true, dryRun: true }; }
      await stash(`adm-pair:${conv.id}`, { block, p1: a.pl!.id, p2: b.pl!.id, n1: a.pl!.name, n2: b.pl!.name, reason });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(`${block ? '🚫 منع تجاور دائم' : '✅ إلغاء منع التجاور'}؟\n${a.pl!.name} ↔ ${b.pl!.name}${block ? `\nالسبب: ${reason}\nالمحرّك سيُبعدهما في كلّ توزيع لاحق.` : ''}`, `admpair:${conv.id}`, 'نفّذ ✓') });
      return { pendingConfirm: true };
    }

    case 'admin_reshuffle': {
      const g = await adminGate(); if (g) return g;
      if (dryRun) return { dryRun: true, note: '(ساحة اختبار — لا معاينة فعليّة)' };
      const lr = await liveRoomOf(db, parseInt(args.activity_id)); if ('error' in lr) return { error: lr.error };
      if (lr.state.phase !== 'LOBBY') return { blocked: true, note: `إعادة التوزيع متاحة في اللوبي فقط — المرحلة الآن ${lr.state.phase}. أثناء اللعب يُنقل اللاعب من واجهة القائد.` };
      const r = await loopback(conv, 'POST', '/api/seating/reshuffle', { roomId: lr.state.roomId, dryRun: true });
      if (r.status !== 200) return { error: r.data?.error || 'تعذّرت المعاينة' };
      const moves = (r.data.arrangement || []).filter((x: any) => x.oldSeat != null && x.newSeat != null && x.oldSeat !== x.newSeat).length;
      await stash(`adm-resh:${conv.id}`, { roomId: lr.state.roomId, activityId: lr.activityId });
      await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: confirmButtons(`🔀 معاينة إعادة توزيع «${lr.activityName}»\nاللاعبون: ${(lr.state.players || []).length} · ينتقل: ${moves || 'غير محدَّد'}\nمخالفات متبقّية: ${(r.data.violations || []).length} · قيود أُرخيت: ${(r.data.relaxedConstraints || []).length}\n\nأطبّق التوزيع؟ (سيرى اللاعبون مقاعدهم الجديدة على هواتفهم)`, `admresh:${conv.id}`, 'طبّق التوزيع ✓') });
      return { previewed: true, violations: (r.data.violations || []).slice(0, 6), relaxed: r.data.relaxedConstraints || [], note: 'أُرسلت المعاينة وزرّ التطبيق — لا يُطبَّق شيء قبل ضغطه.' };
    }
  }
  return undefined;
}

// ══════════════════════════════════════════════════════
// 🔘 مسارات الأزرار الحتميّة
// ══════════════════════════════════════════════════════
export async function handleExtButton(conv: any, btnId: string, h: ExtHelpers): Promise<boolean> {
  const db = getDB(); if (!db || !btnId) return false;
  const say = (text: string, source: 'bot' | 'system' = 'system') => h.sendMessage({ conversationId: conv.id, text, source }).catch(() => {});
  const mustAdmin = async () => { if (await h.isAdminConversation(conv)) return true; await say('هذا الإجراء متاح للأدمن فقط 🔒'); return false; };

  if (btnId === 'ext_cancel') { await say('تمام، ألغيت العمليّة 👍'); return true; }
  if (btnId === 'chg_keep') { await say('تمام، حجزك زي ما هو 👌', 'bot'); return true; }
  if (btnId === 'wl_skip') { await say('تمام — بتضلّ على قائمة الانتظار، وبنخبّرك لو فضي مقعد تاني 🙏', 'bot'); return true; }

  // 📚 حفظ تعديل المعرفة — حتميّ: لقطةٌ قبل الكتابة، وفحصُ تغيّرٍ متزامن، وتراجعٌ بزرّ
  if (/^admkb:(\d+)$/.test(btnId)) {
    if (!await mustAdmin()) return true;
    const pend = await unstash('adm-kb:' + conv.id);
    if (!pend) { await say('انتهت صلاحيّة التعديل (10 دقائق) — أعد الطلب 🙏'); return true; }
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const st: any = await getBotSettings();
    const cur = String(st.knowledgeBase || '');
    // ⚠️ قد يكون أحدٌ عدّل المعرفة من الداشبورد بين المعاينة والضغط — الكتابة فوقها
    //    تمحو عمله بصمت. الحجم وحده كاشفٌ كافٍ ورخيص.
    if (cur.length !== Number(pend.before)) {
      await say('⚠️ المعرفة تغيّرت من مكانٍ آخر بعد المعاينة — ما حفظت شي. أعد الطلب لتراها بصيغتها الجديدة.');
      return true;
    }
    await db.execute(sql`INSERT INTO wa_bot_settings_history (reason, system_prompt, knowledge_base)
      VALUES (${'تعديل من واتساب — ' + (conv.displayName || conv.phone)}, ${st.systemPrompt || ''}, ${cur})`);
    await db.execute(sql`UPDATE wa_bot_settings SET knowledge_base = ${String(pend.next)},
      updated_by = ${'واتساب: ' + (conv.displayName || conv.phone)}, updated_at = NOW() WHERE id = ${st.id}`);
    await say('تمّ الحفظ ✅ المعرفة صارت ' + pend.after + ' حرف (كانت ' + pend.before + ').\nالتعديل ساري على الرسالة الجاية فوراً.');
    await h.sendMessage({ conversationId: conv.id, source: 'system', interactive: {
      type: 'button', body: { text: '📚 محفوظ. إذا بدك ترجع عن التعديل اضغط تراجع:' },
      action: { buttons: [{ type: 'reply', reply: { id: 'admkbundo:' + conv.id, title: '↩️ تراجع' } }] },
    } }).catch(() => {});
    void auditBot(conv, 'wa:kb-edit', { kind: pend.kind, before: pend.before, after: pend.after });
    void alertAdminsWA('kbedit:' + Date.now(), '📚 ' + (conv.displayName || conv.phone) + ' عدّل قاعدة معرفة الدون (' + pend.before + ' ← ' + pend.after + ' حرف).', { exceptConvId: conv.id });
    return true;
  }

  // ↩️ تراجع عن آخر تعديل معرفة — يستعيد آخر لقطة محفوظة
  if (/^admkbundo:(\d+)$/.test(btnId)) {
    if (!await mustAdmin()) return true;
    const hr: any = await db.execute(sql`SELECT id, knowledge_base FROM wa_bot_settings_history ORDER BY id DESC LIMIT 1`);
    const snap = rowsOf(hr)[0];
    if (!snap) { await say('ما في لقطة محفوظة للتراجع 🙏'); return true; }
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const st: any = await getBotSettings();
    const back = String(snap.knowledge_base || '');
    await db.execute(sql`UPDATE wa_bot_settings SET knowledge_base = ${back},
      updated_by = ${'تراجع من واتساب: ' + (conv.displayName || conv.phone)}, updated_at = NOW() WHERE id = ${st.id}`);
    await say('رجّعت المعرفة للنسخة السابقة ✅ (' + back.length + ' حرف).');
    void auditBot(conv, 'wa:kb-undo', { historyId: snap.id, restoredChars: back.length });
    return true;
  }

  // 🎁 اختيار مكافأة الولاء
  let m = /^loy:(\d+):(free_visit|free_drink|chips)$/.exec(btnId);
  if (m) {
    if (!conv.playerId) { await say('المحادثة غير مربوطة بحساب لاعب 🙏'); return true; }
    const L = await import('./loyalty.service.js');
    const r = await L.chooseReward(conv.playerId, parseInt(m[1]), m[2] as any);
    if (!r.ok) { await say(`ما قدرت أثبّت الاختيار: ${r.error} 🙏`); return true; }
    const msg = m[2] === 'chips' ? `تمّ ✅ دخل رصيدك ${r.reward?.value?.chips ?? ''} تشبس 🪙 — افتح خزنة الدون بالتطبيق واختار اللي بعجبك.`
      : m[2] === 'free_visit' ? 'تمّ ✅ زيارتك الجاية على النادي 🎟️ — بتنطبّق تلقائيّاً على أوّل حجز بتعمله من التطبيق.'
      : 'تمّ ✅ مشروبك على النادي ☕ — اطلبه من منيو التطبيق بزيارتك الجاية وبينخصم من فاتورتك تلقائيّاً.';
    await say(msg, 'bot'); return true;
  }

  // ✏️ تعديل عدد الأشخاص
  m = /^chgp:(\d+):(\d+)$/.exec(btnId);
  if (m) {
    const resId = parseInt(m[1]); const n = parseInt(m[2]);
    const [r] = await db.select({ id: reservations.id, people: reservations.peopleCount, actId: reservations.activityId, status: reservations.status, name: activities.name, date: activities.date })
      .from(reservations).innerJoin(activities, eq(reservations.activityId, activities.id))
      .where(and(eq(reservations.id, resId), isNull(reservations.deletedAt), sql`(${reservations.phone} = ${conv.phone} ${conv.playerId ? sql`OR ${reservations.playerId} = ${conv.playerId}` : sql``})`)).limit(1);
    if (!r) { await say('ما لقيت الحجز (يمكن أُلغي) 🙏'); return true; }
    const who = conv.displayName || conv.phone;
    if (new Date(r.date).getTime() - Date.now() < CHANGE_CUTOFF_MS) {
      await db.update(waConversations).set({ needsAttention: true, updatedAt: new Date() } as any).where(eq(waConversations.id, conv.id));
      await say('الفعاليّة بعد أقلّ من 3 ساعات فما بقدر أعدّل تلقائيّاً 🙏 حوّلت طلبك للإدارة.');
      h.notifyAdmins('⚠️ طلب تعديل عدد متأخّر (<3 ساعات)', `${who} — ${r.name}: ${r.people} → ${n}`, { conversationId: conv.id, url: `/admin/whatsapp?conv=${conv.id}` }).catch(() => {});
      void alertAdminsWA(`chg-late:${r.id}:${n}`, `طلب تعديل عدد متأخّر: ${who} — ${r.name} (${r.people} → ${n}). بحاجة قرارك.`, { exceptConvId: conv.id });
      return true;
    }
    const delta = n - Number(r.people || 1);
    if (delta > 0 && r.status !== 'waitlist') {
      const av = await h.seatAvailability(db, Number(r.actId));
      if (av.remaining < delta) { await say(`ما في متّسع للزيادة 🙏 المتبقّي ${av.remaining} مقعد بس. بتحب أحوّلك للإدارة؟`, 'bot'); return true; }
    }
    await db.update(reservations).set({ peopleCount: n, notes: sql`COALESCE(${reservations.notes}, '') || ${` · ✏️ عُدّل العدد ${r.people}→${n} عبر البوت`}`, updatedAt: new Date() } as any).where(eq(reservations.id, r.id));
    await say(`تمّ ✅ حجزك في «${r.name}» صار لـ${n} أشخاص — ${h.fmtJo(r.date)}.`, 'bot');
    h.notifyAdmins('✏️ تعديل عدد عبر البوت', `${who} — ${r.name}: ${r.people} → ${n}`, { conversationId: conv.id, url: '/admin/reservations' }).catch(() => {});
    return true;
  }

  // 📝 إنشاء حساب
  if (btnId === 'reg_ok') {
    const p = await unstash(`wa-reg:${conv.id}`);
    if (!p) { await say('انتهت صلاحيّة الطلب (10 دقائق) — احكيلي «بدي أسجّل» ونعيدها بسرعة 🙏', 'bot'); return true; }
    if (conv.playerId) { await say('رقمك مربوط بحساب أصلاً ✅'); return true; }
    const [ex] = await db.select({ id: players.id }).from(players).where(eq(players.phone, p.phone)).limit(1);
    if (ex) { await say('في حساب مسجَّل بهذا الرقم أصلاً — ادخل التطبيق برقمك، وإذا نسيت كلمة السرّ احكيلي 🙏', 'bot'); return true; }
    const pwd = String(crypto.randomInt(100000, 1000000));
    const [pl] = await db.insert(players).values({
      phone: p.phone, passwordHash: await bcrypt.hash(pwd, 10), mustChangePassword: true, name: p.name, gender: p.gender, dob: p.dob,
      xp: 200, welcomeBonusApplied: true,
    } as any).returning({ id: players.id, name: players.name });
    if (!pl) { await say('صار خلل بإنشاء الحساب 🙏 حوّلتك للإدارة.'); return true; }
    await db.update(waConversations).set({ playerId: pl.id, displayName: pl.name, updatedAt: new Date() } as any).where(eq(waConversations.id, conv.id));
    await say(`أهلاً فيك بالعيلة 🎭 حسابك جاهز ✅\n\n📱 رقم الدخول: ${p.phone}\n🔐 كلمة السرّ المؤقّتة: ${pwd}\n\nادخل من هون:\n${APP_LOGIN_URL}\n\nعند أوّل دخول رح يطلب منك التطبيق الموافقة على سياسة الخصوصيّة وشروط الاستخدام، وتغيير كلمة السرّ. ومعك 200 نقطة خبرة هديّة ترحيب 🎁`);
    h.notifyAdmins('🆕 لاعب جديد سجّل من واتساب', `${pl.name} — ${p.phone}`, { conversationId: conv.id, url: `/admin/players/${pl.id}` }).catch(() => {});
    void alertAdminsWA(`reg:${pl.id}`, `لاعب جديد سجّل حسابه من الواتساب: ${pl.name} (${p.phone}).`, { exceptConvId: conv.id });
    try { const io = (global as any).io; if (io) io.to('wa:inbox').emit('wa:conversation:update', { id: conv.id, playerId: pl.id }); } catch { /* غير حرج */ }
    // 🎁 نقاطٌ كانت محجوزةً له في عرضِ الحديث؟ تُصرف الآن — هذه هي اللحظة التي وُعد بها.
    //    (conv.playerId يُحدَّث في الكائن أيضاً كي لا يقرأ ما بعدُ قيمةً قديمة)
    conv.playerId = pl.id;
    try {
      const { settlePendingForConversation } = await import('./wa-reward.service.js');
      await settlePendingForConversation(conv.id, pl.id, 'registration');
    } catch { /* المكافأة تكميليّة — لا تُفشل التسجيل */ }
    console.log(`📝 WA bot: self-registration → player #${pl.id} (conv ${conv.id})`);
    return true;
  }

  // 🪑 مقعد توفّر لمن على قائمة الانتظار
  m = /^wl_take:(\d+)$/.exec(btnId);
  if (m) {
    const resId = parseInt(m[1]);
    const [r] = await db.select().from(reservations).where(and(eq(reservations.id, resId), isNull(reservations.deletedAt), sql`(${reservations.phone} = ${conv.phone} ${conv.playerId ? sql`OR ${reservations.playerId} = ${conv.playerId}` : sql``})`)).limit(1);
    if (!r) { await say('ما لقيت حجز الانتظار 🙏'); return true; }
    if (r.status !== 'waitlist') { await say('حجزك مثبَّت أصلاً ✅', 'bot'); return true; }
    const av = await h.seatAvailability(db, Number(r.activityId));
    if (av.remaining < Number(r.peopleCount || 1)) { await say('للأسف انحجز المقعد قبل لحظات 🙏 بتضلّ على قائمة الانتظار وبنخبّرك أوّل ما يفضى.', 'bot'); return true; }
    const [saved] = await db.update(reservations).set({ status: 'confirmed', notes: sql`COALESCE(${reservations.notes}, '') || ' · ✅ ثُبّت من قائمة الانتظار عبر البوت'`, updatedAt: new Date() } as any).where(eq(reservations.id, r.id)).returning();
    await h.mirrorReservation(db, saved, '🤖 بوت واتساب').catch(() => {});
    const [a] = await db.select({ name: activities.name, date: activities.date }).from(activities).where(eq(activities.id, Number(r.activityId))).limit(1);
    await say(`تمّ ✅ حجزك مؤكَّد في «${a?.name || ''}» — ${a ? h.fmtJo(a.date) : ''} لـ${r.peopleCount} أشخاص. الدفع بالمكان 🎭`, 'bot');
    h.notifyAdmins('✅ تثبيت من قائمة الانتظار عبر البوت', `${conv.displayName || conv.phone} — ${a?.name || ''}`, { conversationId: conv.id, url: '/admin/reservations' }).catch(() => {});
    return true;
  }

  // 📝 استبيان ما بعد الأمسية — `srv:<صفّ>:<سؤال>:<درجة>`
  // (الشكل القديم `srv:<صفّ>:<درجة>` يبقى مقبولاً: أزرارٌ أُرسلت قبل النشرة)
  m = /^srv:(\d+):(\d+):([1-5])$/.exec(btnId) || /^srv:(\d+):()([1-5])$/.exec(btnId);
  if (m) {
    const rowId = parseInt(m[1]); const qid = m[2] ? parseInt(m[2]) : 0; const score = parseInt(m[3]);
    const sv = await import('./survey.service.js');
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const botS: any = await getBotSettings();
    const cfg = sv.getSurveySettings(botS);
    const questions = await sv.waQuestions(cfg);
    const q = questions.find(x => x.id === qid) || questions[0];
    if (!q) { await say('شكراً إلك 🎭', 'bot'); return true; }

    const ok = await sv.recordAnswer(rowId, conv.playerId ?? -1, q, score);
    if (!ok) { await say('وصل تقييمك قبل هيك 🙏 شكراً إلك.', 'bot'); return true; }

    const { getAux, setAux } = await import('../config/redis.js');
    const posKey = `wa-survey-at:${conv.id}`;
    const pos: any = (await getAux(posKey)) || { rowId, idx: 0, total: questions.length };
    const nextIdx = Math.max(pos.idx ?? 0, questions.findIndex(x => x.id === q.id)) + 1;

    if (nextIdx < questions.length) {
      // 🔴 السؤال التالي فوراً — والإجابةُ الأولى محفوظةٌ أصلاً: من يصمت الآن
      //    يبقى جوابُه، فإجابةٌ واحدة خيرٌ من لا شيء.
      await setAux(posKey, { rowId, idx: nextIdx, total: questions.length });
      await sendSurveyQuestion(conv.id, rowId, questions[nextIdx], nextIdx, questions.length).catch(() => {});
      if (score <= cfg.lowThreshold) void lowScoreAlert(h, conv, rowId, score);
      return true;
    }

    await sv.closeSurvey(rowId, conv.playerId ?? -1);
    await h.sendMessage({ conversationId: conv.id, source: 'bot', interactive: { type: 'button',
      body: { text: score > cfg.lowThreshold ? `يسلمو 🎭 تقييمك وصل. ${cfg.notePrompt}` : `شكراً لصراحتك 🙏 رأيك بهمّنا. ${cfg.notePrompt}` },
      action: { buttons: [{ type: 'reply', reply: { id: `srvn:${rowId}`, title: 'أضيف ملاحظة ✍️' } }, { type: 'reply', reply: { id: 'srv_done', title: 'خلص، شكراً' } }] } } }).catch(() => {});
    if (score <= cfg.lowThreshold) void lowScoreAlert(h, conv, rowId, score);
    return true;
  }
  m = /^srvn:(\d+)$/.exec(btnId);
  if (m) {
    const { setAux } = await import('../config/redis.js');
    await setAux(`wa-survey-note:${conv.id}`, { rowId: parseInt(m[1]), expiresAt: Date.now() + 30 * 60e3 });
    await say('تفضّل، اكتب ملاحظتك برسالة واحدة ✍️', 'bot'); return true;
  }
  if (btnId === 'srv_done') { await say('شكراً إلك 🎭 منشوفك بالأمسية الجاية.', 'bot'); return true; }

  // ───────── إجراءات الأدمن ─────────
  if (/^admpair:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-pair:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب 🙏'); return true; }
    if (p.block) {
      const r = await loopback(conv, 'POST', '/api/seating/blocked-pairs', { player1Id: p.p1, player2Id: p.p2, reason: `(واتساب) ${p.reason}` });
      await auditBot(conv, 'wa:seating-block-pair', { p1: p.p1, p2: p.p2, reason: p.reason, status: r.status }, { targetName: `${p.n1} ↔ ${p.n2}`, outcome: r.status === 200 ? 'success' : 'blocked' });
      await say(r.status === 200 ? `تمّ ✅ «${p.n1}» و«${p.n2}» لن يتجاورا بعد اليوم.` : `ما تمّ: ${r.data?.error || 'خلل'}`);
    } else {
      const list = await loopback(conv, 'GET', '/api/seating/blocked-pairs');
      const rows: any[] = list.data?.pairs || list.data?.data || (Array.isArray(list.data) ? list.data : []);
      const hit = rows.find((x: any) => { const a = Number(x.player1Id ?? x.player1_id), b = Number(x.player2Id ?? x.player2_id); return (a === p.p1 && b === p.p2) || (a === p.p2 && b === p.p1); });
      if (!hit) { await say('هذا الزوج غير ممنوع أصلاً 🙏'); return true; }
      const r = await loopback(conv, 'DELETE', `/api/seating/blocked-pairs/${hit.id}`);
      await auditBot(conv, 'wa:seating-unblock-pair', { p1: p.p1, p2: p.p2, status: r.status }, { targetName: `${p.n1} ↔ ${p.n2}`, outcome: r.status === 200 ? 'success' : 'blocked' });
      await say(r.status === 200 ? `تمّ ✅ أُلغي منع التجاور بين «${p.n1}» و«${p.n2}».` : `ما تمّ: ${r.data?.error || 'خلل'}`);
    }
    return true;
  }
  if (/^admresh:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-resh:${conv.id}`); if (!p) { await say('انتهت صلاحيّة المعاينة (10 دقائق) — اطلبها من جديد 🙏'); return true; }
    const { getRoom } = await import('../game/state.js');
    const st: any = await getRoom(p.roomId).catch(() => null);
    if (!st) { await say('الغرفة لم تعد موجودة 🙏'); return true; }
    if (st.phase !== 'LOBBY') { await say(`فات الأوان — المرحلة صارت ${st.phase}. إعادة التوزيع في اللوبي فقط 🙏`); return true; }
    const r = await loopback(conv, 'POST', '/api/seating/reshuffle', { roomId: p.roomId, dryRun: false });
    await auditBot(conv, 'wa:seating-reshuffle', { roomId: p.roomId, success: !!r.data?.success, violations: (r.data?.violations || []).length }, { activityId: p.activityId, outcome: r.data?.success ? 'success' : 'blocked' });
    await say(r.status === 200 && r.data?.success ? `تمّ ✅ أُعيد توزيع المقاعد. مخالفات متبقّية: ${(r.data.violations || []).length}.` : `ما طُبّق: ${r.data?.error || 'المحرّك لم يجد توزيعاً صالحاً'}`);
    return true;
  }
  if (/^admstamp:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-stamp:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب (10 دقائق) 🙏'); return true; }
    const st = await staffOfConversation(conv); const L = await import('./loyalty.service.js');
    const r = await L.manualStamp(p.playerId, p.actId, st?.id ?? 0, `(واتساب) ${p.reason}`);
    await auditBot(conv, 'wa:loyalty-stamp-manual', { playerId: p.playerId, reason: p.reason, ok: r.ok, rewardId: r.rewardId ?? null }, { activityId: p.actId, targetName: p.playerName, outcome: r.ok ? 'success' : 'blocked' });
    await say(r.ok ? `تمّ ✅ خُتمت بطاقة «${p.playerName}» عن «${p.actName}».${r.rewardId ? ' 🎁 وبهذا الختم اكتملت بطاقته.' : ''}` : `ما تمّ: ${r.error}`);
    return true;
  }
  if (/^admvoidrw:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-voidrw:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب 🙏'); return true; }
    const st = await staffOfConversation(conv); const L = await import('./loyalty.service.js');
    const r = await L.voidReward(p.rewardId, st?.id ?? 0, `(واتساب) ${p.reason}`);
    await auditBot(conv, 'wa:loyalty-reward-void', { rewardId: p.rewardId, reason: p.reason, ok: r.ok }, { targetName: p.playerName, outcome: r.ok ? 'success' : 'blocked' });
    await say(r.ok ? `تمّ ✅ أُلغيت مكافأة #${p.rewardId} لـ«${p.playerName}».` : `ما تمّ: ${r.error}`);
    return true;
  }
  if (/^admchips:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-chips:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب (10 دقائق) — أعد الطلب 🙏'); return true; }
    const st = await staffOfConversation(conv); const C = await import('./chips.service.js');
    const r: any = await C.adminTopup({ playerId: p.playerId, packId: p.packId, staffId: st?.id ?? null, requestId: p.requestId, note: `شحن عبر واتساب — الأدمن ${st?.displayName || st?.username || conv.displayName || conv.phone}` });
    await auditBot(conv, 'wa:chips-topup', { playerId: p.playerId, packId: p.packId, jod: r?.pack?.jod, chips: r?.pack?.chips, ledgerId: r?.ledgerId ?? null, ok: !!r?.ok, duplicate: !!r?.duplicate }, { targetName: p.playerName, outcome: r?.ok ? 'success' : 'blocked' });
    if (!r?.ok) { await say(`ما تمّ الشحن: ${r?.message || 'خلل'} 🙏`); return true; }
    await say(`تمّ ✅ شُحن ${r.pack.chips} 🪙 لـ«${p.playerName}» (${r.pack.jod} د.أ) — رصيده الآن ${r.balance}.\nقيد الدفتر #${r.ledgerId}${r.duplicate ? ' (مُنفَّذة سابقاً — لم تتكرّر)' : ''} · مسجَّل باسمك ومصدره واتساب · وصل اللاعبَ إشعار.`);
    void alertAdminsWA(`chips:${r.ledgerId}`, `شحن تشبس عبر واتساب: ${r.pack.chips} 🪙 (${r.pack.jod} د.أ) لـ${p.playerName} — نفّذه ${st?.displayName || conv.displayName || conv.phone}.`, { exceptConvId: conv.id });
    return true;
  }
  if (/^admnewact:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-newact:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب 🙏'); return true; }
    const when = new Date(p.whenISO);
    const dupe: any = await db.execute(sql`SELECT id FROM activities WHERE location_id = ${p.locId} AND deleted_at IS NULL AND date = ${when} LIMIT 1`);
    if (rowsOf(dupe)[0]) { await say('أُنشئت فعاليّة بالموعد نفسه قبل ما تأكّد — ما كرّرتها 🙏'); return true; }
    const tplR: any = p.tplId ? await db.execute(sql`SELECT * FROM activities WHERE id = ${p.tplId}`) : null;
    const t = tplR ? (rowsOf(tplR)[0] || {}) : {};
    const st = await staffOfConversation(conv);
    const [a] = await db.insert(activities).values({
      name: p.name, date: when, description: t.description || '', basePrice: String(p.price), status: 'planned', locationId: p.locId, driveLink: '',
      enabledOfferIds: [], isLocked: false, maxCapacity: p.cap, difficulty: t.difficulty ?? undefined, requireTicket: t.require_ticket ?? false,
      seatConstraints: t.seat_constraints ?? null, seatTemplateId: t.seat_template_id ?? null, menuOrderingEnabled: t.menu_ordering_enabled === true,
      addGameFeeToBill: t.menu_ordering_enabled === true && t.add_game_fee_to_bill === true, geofenceEnabled: t.geofence_enabled === true,
      geofenceRadiusM: t.geofence_radius_m ?? null, gameSchedule: t.game_schedule ?? [], createdBy: st?.id ?? null,
    } as any).returning({ id: activities.id, name: activities.name });
    await auditBot(conv, 'wa:activity-create', { name: p.name, locationId: p.locId, when: p.whenISO, price: p.price, capacity: p.cap, copiedFrom: p.tplId }, { activityId: a?.id ?? null });
    await say(`تمّ ✅ أُنشئت «${a?.name}» (#${a?.id}) — ${h.fmtJo(when)}.\nتظهر الآن للاعبين في التطبيق وللبوت. لإرسال إشعار للاعبين أو تعديل التفاصيل: الداشبورد ← الأنشطة.`);
    return true;
  }
  if (/^admpl:\d+$/.test(btnId)) {
    if (!(await mustAdmin())) return true;
    const p = await unstash(`adm-pl:${conv.id}`); if (!p) { await say('انتهت صلاحيّة الطلب 🙏'); return true; }
    const st = await staffOfConversation(conv); const now = new Date();
    const patch: any = p.action === 'lock' ? { isLocked: true, lockedAt: now, lockedBy: st?.id ?? null, lockedReason: `(واتساب) ${p.reason}`.slice(0, 200) }
      : p.action === 'unlock' ? { isLocked: false, lockedAt: null, lockedBy: null, lockedReason: '' }
      : p.action === 'geofence_exempt' ? { geofenceExempt: true, geofenceExemptReason: `(واتساب) ${p.reason}`.slice(0, 200), geofenceExemptBy: st?.id ?? null, geofenceExemptAt: now }
      : { geofenceExempt: false, geofenceExemptReason: '', geofenceExemptBy: null, geofenceExemptAt: null };
    await db.update(players).set(patch).where(eq(players.id, p.playerId));
    await auditBot(conv, p.action.startsWith('geofence') ? 'rest:geofence-exempt' : 'rest:player-lock', { playerId: p.playerId, action: p.action, reason: p.reason, via: 'whatsapp' }, { targetName: p.playerName });
    const DONE: Record<string, string> = { lock: 'قُفل حساب', unlock: 'فُكّ قفل حساب', geofence_exempt: 'أُعفي من سياج الموقع', geofence_unexempt: 'أُلغي إعفاء السياج عن' };
    await say(`تمّ ✅ ${DONE[p.action]} «${p.playerName}».`);
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════
// 🪑 إشعار أوّل المنتظرين عند توفّر مقعد (داخل نافذته المفتوحة فقط)
// ══════════════════════════════════════════════════════
export async function offerFreedSeat(activityId: number, h: ExtHelpers): Promise<boolean> {
  try {
    const db = getDB(); if (!db) return false;
    const av = await h.seatAvailability(db, activityId);
    if (av.remaining <= 0) return false;
    const r: any = await db.execute(sql`
      SELECT r.id, r.people_count, c.id AS conv_id, a.name, a.date
        FROM reservations r JOIN activities a ON a.id = r.activity_id JOIN wa_conversations c ON c.phone = r.phone
       WHERE r.activity_id = ${activityId} AND r.deleted_at IS NULL AND r.status = 'waitlist' AND a.date > NOW()
         AND c.last_inbound_at > NOW() - INTERVAL '23 hours 50 minutes' AND r.people_count <= ${av.remaining}
       ORDER BY r.created_at ASC LIMIT 1`);
    const x = rowsOf(r)[0]; if (!x) return false;
    const { getAux, setAux } = await import('../config/redis.js');
    if (await getAux(`wl-offer:${x.id}`)) return false;
    await setAux(`wl-offer:${x.id}`, { at: Date.now() });
    await h.sendMessage({ conversationId: Number(x.conv_id), source: 'bot', interactive: {
      type: 'button', body: { text: `🪑 خبر حلو: فضي مكان في «${x.name}» (${h.fmtJo(x.date)}) يكفي حجزك لـ${x.people_count} أشخاص.\nبتحب أثبّته إلك؟ (الأسبقيّة لمن يؤكّد أوّلاً)` },
      action: { buttons: [{ type: 'reply', reply: { id: `wl_take:${x.id}`, title: 'ثبّته لي ✓' } }, { type: 'reply', reply: { id: 'wl_skip', title: 'لا، شكراً' } }] },
    } });
    return true;
  } catch (e: any) { console.warn('⚠️ WA waitlist offer:', e?.message); return false; }
}

// ══════════════════════════════════════════════════════
// 📝 استبيان ما بعد الأمسية — داخل نافذة ٢٤ ساعة المفتوحة فقط
// ══════════════════════════════════════════════════════
// المصدر هو صفّ room_feedback المعلَّق نفسه الذي يملؤه التطبيق (يُنشأ عند إغلاق الغرفة)، فتقييم الواتساب
// يُغلق استبيان التطبيق أيضاً (ولا يُسأل اللاعب مرّتين، ولا يُحجب عنه التطبيق بعد مهلة الساعة).
export async function captureSurveyNote(conv: any, text: string, h: ExtHelpers): Promise<boolean> {
  try {
    const { getAux, deleteAux } = await import('../config/redis.js');
    const key = `wa-survey-note:${conv.id}`; const p = await getAux(key);
    if (!p) return false;
    await deleteAux(key).catch(() => {});
    if (p.expiresAt < Date.now() || !text.trim()) return false;
    const db = getDB(); if (!db) return false;
    await db.execute(sql`UPDATE room_feedback SET notes = ${text.trim().slice(0, 1000)} WHERE id = ${p.rowId} AND player_id = ${conv.playerId ?? -1}`);
    await h.sendMessage({ conversationId: conv.id, text: 'وصلت ملاحظتك ✅ شكراً — بنقرأها كلّها 🎭', source: 'bot' }).catch(() => {});
    h.notifyAdmins('📝 ملاحظة استبيان من واتساب', `${conv.displayName || conv.phone}: ${text.trim().slice(0, 120)}`, { conversationId: conv.id, url: '/admin/feedback' }).catch(() => {});
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════════════
// 📝 إرسال سؤالٍ واحد من أسئلة الاستبيان
// ══════════════════════════════════════════════════════
// واتساب يسمح بثلاثة أزرارٍ لا أكثر، بعنوانٍ ≤٢٠ حرفاً. فما زاد على ثلاثة
// خياراتٍ يُرسل **قائمةً تفاعليّة** (تحتمل عشرة) — وهذا ما يجعل المقياس
// الخماسيّ الكامل ممكناً بعد أن كان ٥/٤/٢ بلا «متوسّط».
async function sendSurveyQuestion(convId: number, rowId: number, q: any, idx: number, total: number): Promise<void> {
  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  const { FIVE_SCALE } = await import('./survey.service.js');
  const opts: Array<{ label: string; score: number }> =
    (q.type === 'scale' && Array.isArray(q.options) && q.options.length ? q.options : FIVE_SCALE);
  const body = String(q.text || '').slice(0, 900);
  const tail = total > 1 ? ` (${idx + 1}/${total})` : '';

  if (opts.length <= 3) {
    await sendMessage({ conversationId: convId, source: 'bot', interactive: { type: 'button',
      body: { text: body + tail },
      action: { buttons: opts.map(o => ({ type: 'reply', reply: { id: `srv:${rowId}:${q.id}:${o.score}`, title: o.label.slice(0, 20) } })) } } });
    return;
  }
  await sendMessage({ conversationId: convId, source: 'bot', interactive: { type: 'list',
    body: { text: body + tail },
    action: {
      button: 'اختر تقييمك',
      sections: [{ rows: opts.slice(0, 10).map(o => ({ id: `srv:${rowId}:${q.id}:${o.score}`, title: o.label.slice(0, 24) })) }],
    } } });
}

/** تنبيهُ التقييم المنخفض — يُنادى من موضعين فلا يُكرَّر نصّه */
function lowScoreAlert(h: any, conv: any, rowId: number, score: number): void {
  h.notifyAdmins('😕 تقييم منخفض من واتساب', `${conv.displayName || conv.phone} قيّم الأمسية ${score}/5`,
    { conversationId: conv.id, url: '/admin/feedback' }).catch(() => {});
  void alertAdminsWA(`survey-low:${rowId}`, `تقييم منخفض (${score}/5) من ${conv.displayName || conv.phone} — يستحقّ متابعة.`, { exceptConvId: conv.id });
}

async function surveyTick() {
  const db = getDB(); if (!db || !env.WA_TOKEN) return;
  const { getBotSettings } = await import('./whatsapp-bot.service.js');
  const settings: any = await getBotSettings();
  if (!settings.enabled || (settings.toolsConfig?.survey ?? true) === false) return;
  const sv = await import('./survey.service.js');
  const cfg = sv.getSurveySettings(settings);
  if (!cfg.enabled) return;
  const questions = await sv.waQuestions(cfg);
  if (!questions.length) return;               // لا سؤال على هذه القناة ⇒ لا رسالة
  const { sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
  if (sendingSuspendedReason()) return;

  const r: any = await db.execute(sql`
    SELECT f.id, f.player_id, c.id AS conv_id, a.name AS activity
      FROM room_feedback f JOIN wa_conversations c ON c.player_id = f.player_id LEFT JOIN activities a ON a.id = f.activity_id
     WHERE f.submitted_at IS NULL
       AND f.created_at < NOW() - (${cfg.delayMin} || ' minutes')::interval
       AND f.created_at > NOW() - (${cfg.validHours} || ' hours')::interval
       AND c.bot_enabled = true AND c.last_inbound_at > NOW() - INTERVAL '23 hours 30 minutes'
     ORDER BY f.created_at DESC LIMIT 40`);
  const { getAux, setAux } = await import('../config/redis.js');
  const seenPlayer = new Set<number>();
  for (const x of rowsOf(r)) {
    if (seenPlayer.has(Number(x.player_id))) continue;           // أحدث غرفة فقط لكلّ لاعب
    seenPlayer.add(Number(x.player_id));
    // مرّة واحدة في الفترة لكلّ لاعب — المهلة داخل القيمة لأنّ `setAux` بـTTL ثابت
    const seen: any = await getAux(`wa-survey:${x.player_id}`);
    if (seen && Number(seen.until || 0) > Date.now()) continue;
    await setAux(`wa-survey:${x.player_id}`, { at: Date.now(), rowId: x.id, until: Date.now() + cfg.onceHours * 3600e3 });
    try {
      // موضعُ اللاعب من الأسئلة — النمطُ نفسه المستعمَل في زرّ «أضيف ملاحظة»
      await setAux(`wa-survey-at:${Number(x.conv_id)}`, { rowId: Number(x.id), idx: 0, total: questions.length });
      const first = { ...questions[0] };
      first.text = String(first.text).replace('{الفعاليّة}', x.activity || 'الأمسية');
      if (questions.length === 1 && !/[؟?]/.test(first.text)) first.text += ' 🎭';
      await sendSurveyQuestion(Number(x.conv_id), Number(x.id), first, 0, questions.length);
    } catch { /* نافذة أُغلقت */ }
  }
}
let surveyStarted = false;
export function startWaSurveyScheduler(): void {
  if (surveyStarted) return; surveyStarted = true;
  const tick = () => surveyTick().catch(e => console.warn('⚠️ WA survey tick:', e?.message));
  setTimeout(tick, 60_000); setInterval(tick, 10 * 60_000);
  console.log('📝 WA post-event survey scheduler started (every 10m)');
}

// ══════════════════════════════════════════════════════
// 📈 قياس جودة الدون — هل يؤدّي عمله؟ (الكلفة في getBotUsage)
// ══════════════════════════════════════════════════════
export async function getBotQuality(days = 30) {
  const db = getDB(); if (!db) return null;
  const d = Math.min(Math.max(Math.trunc(Number(days)) || 30, 1), 120);
  const since = new Date(Date.now() - d * 86400e3);
  // 1) قمع الحجز — من الرسائل نفسها (يعمل على التاريخ كلّه)
  const fr: any = await db.execute(sql`
    SELECT COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'in' AND source = 'customer')::int AS talked,
           COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'out' AND payload->'interactive'->>'type' = 'list' AND payload::text LIKE '%"act:%')::int AS listed,
           COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'out' AND payload::text LIKE '%res_confirm:%')::int AS asked,
           COUNT(DISTINCT conversation_id) FILTER (WHERE direction = 'in' AND payload->'interactive'->'button_reply'->>'id' LIKE 'res_confirm:%')::int AS confirmed
      FROM wa_messages WHERE created_at >= ${since}`);
  const f = rowsOf(fr)[0] || {};
  const br: any = await db.execute(sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(people_count),0)::int AS people, COUNT(*) FILTER (WHERE status = 'waitlist')::int AS waitlist FROM reservations WHERE contact_method = 'بوت واتساب' AND created_at >= ${since}`);
  const b = rowsOf(br)[0] || {};
  // 2) الردود: من يردّ، وكم بسرعة
  const mr: any = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE source = 'bot')::int AS bot, COUNT(*) FILTER (WHERE source = 'staff')::int AS staff,
           COUNT(*) FILTER (WHERE source = 'customer')::int AS customer, COUNT(*) FILTER (WHERE direction = 'in' AND msg_type = 'audio')::int AS audio_in
      FROM wa_messages WHERE created_at >= ${since}`);
  const m = rowsOf(mr)[0] || {};
  const ur: any = await db.execute(sql`
    SELECT COUNT(*)::int AS replies,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY reply_ms) FILTER (WHERE reply_ms IS NOT NULL) AS p50,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY reply_ms) FILTER (WHERE reply_ms IS NOT NULL) AS p90,
           COUNT(*) FILTER (WHERE flags ? 'unknown')::int AS unknown, COUNT(*) FILTER (WHERE flags ? 'handoff')::int AS handoff,
           COUNT(*) FILTER (WHERE flags ? 'fail')::int AS fail, COUNT(*) FILTER (WHERE flags ? 'leak')::int AS leak,
           COUNT(*) FILTER (WHERE flags->>'audio' = 'ok')::int AS audio_ok, COUNT(*) FILTER (WHERE flags->>'audio' = 'unclear')::int AS audio_unclear,
           COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(tools,'[]'::jsonb)) > 0)::int AS with_tools,
           MIN(created_at) FILTER (WHERE reply_ms IS NOT NULL) AS measured_since
      FROM wa_bot_usage WHERE source = 'live' AND created_at >= ${since}`);
  const u = rowsOf(ur)[0] || {};
  const tr: any = await db.execute(sql`SELECT t AS tool, COUNT(*)::int AS n FROM wa_bot_usage, jsonb_array_elements_text(COALESCE(tools,'[]'::jsonb)) t WHERE source = 'live' AND created_at >= ${since} GROUP BY t ORDER BY n DESC LIMIT 15`);
  const qr: any = await db.execute(sql`
    SELECT u.created_at, u.conversation_id, c.display_name, u.flags FROM wa_bot_usage u LEFT JOIN wa_conversations c ON c.id = u.conversation_id
     WHERE u.source = 'live' AND u.created_at >= ${since} AND (u.flags ? 'unknown' OR u.flags ? 'handoff' OR u.flags ? 'fail') ORDER BY u.id DESC LIMIT 40`);
  // 3) أثر بطاقة الولاء: الحجز المبكّر أسبوعيّاً بحسب القناة
  let minLead = 6; try { const L = await import('./loyalty.service.js'); minLead = (await L.getLoyaltyConfig()).minLeadHours; } catch { /* افتراضيّ */ }
  const lr: any = await db.execute(sql`
    SELECT to_char(date_trunc('week', a.date + INTERVAL '3 hours'), 'YYYY-MM-DD') AS week,
           COUNT(*)::int AS bookings,
           COUNT(*) FILTER (WHERE b.created_by = 'player-app' AND EXTRACT(EPOCH FROM (a.date - b.created_at))/3600 >= ${minLead})::int AS early_app,
           COUNT(*) FILTER (WHERE b.created_by = '🤖 بوت واتساب' AND EXTRACT(EPOCH FROM (a.date - b.created_at))/3600 >= ${minLead})::int AS early_bot
      FROM bookings b JOIN activities a ON a.id = b.activity_id LEFT JOIN locations l ON l.id = a.location_id
     WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL AND COALESCE(l.is_test_location,false) = false AND a.date >= ${new Date(Date.now() - 84 * 86400e3)} AND a.date < NOW()
     GROUP BY 1 ORDER BY 1`);
  const replies = Number(u.replies || 0);
  return {
    days: d, minLeadHours: minLead, measuredSince: u.measured_since || null,
    funnel: { talked: Number(f.talked || 0), listed: Number(f.listed || 0), askedToConfirm: Number(f.asked || 0), confirmed: Number(f.confirmed || 0), reservations: Number(b.n || 0), people: Number(b.people || 0), waitlist: Number(b.waitlist || 0) },
    messages: { bot: Number(m.bot || 0), staff: Number(m.staff || 0), customer: Number(m.customer || 0), audioIn: Number(m.audio_in || 0), automationRate: (Number(m.bot || 0) + Number(m.staff || 0)) ? Math.round((Number(m.bot || 0) / (Number(m.bot || 0) + Number(m.staff || 0))) * 1000) / 10 : 0 },
    replies: { total: replies, p50Ms: u.p50 != null ? Math.round(Number(u.p50)) : null, p90Ms: u.p90 != null ? Math.round(Number(u.p90)) : null, withTools: Number(u.with_tools || 0), unknown: Number(u.unknown || 0), handoff: Number(u.handoff || 0), fail: Number(u.fail || 0), leak: Number(u.leak || 0), audioOk: Number(u.audio_ok || 0), audioUnclear: Number(u.audio_unclear || 0) },
    tools: rowsOf(tr).map((x: any) => ({ tool: x.tool, n: Number(x.n) })),
    issues: rowsOf(qr).map((x: any) => ({ at: x.created_at, conversationId: x.conversation_id, who: x.display_name || '', kind: x.flags?.fail ? 'fail' : x.flags?.handoff ? 'handoff' : 'unknown', question: x.flags?.question || '', detail: x.flags?.fail || x.flags?.handoff || '' })),
    loyaltyWeekly: rowsOf(lr).map((x: any) => ({ week: x.week, bookings: Number(x.bookings), earlyApp: Number(x.early_app), earlyBot: Number(x.early_bot), earlyRate: Number(x.bookings) ? Math.round(((Number(x.early_app) + Number(x.early_bot)) / Number(x.bookings)) * 1000) / 10 : 0 })),
  };
}
