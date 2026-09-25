// ══════════════════════════════════════════════════════
// 📝 أسئلة الاستبيان — مصدرٌ واحد للتطبيق وللواتساب
// ══════════════════════════════════════════════════════
// كانت الأسئلة ثابتةً في الشيفرة وأعمدةً في الجدول، فلا تُحرَّر إلّا بنشرة.
// صارت صفوفاً في `survey_questions`، وإجابتُها تُكتب:
//   • في عمودها القديم إن كان لها عمود (overall, venue…) — فلا يضيع تاريخٌ
//     ولا تُعاد كتابة التحليلات.
//   • وإلّا في `room_feedback.answers` (JSONB) — مكانُ الأسئلة الجديدة.
//
// 🔴 السؤال لا يُحذف إن أُجيب عنه، بل يُتقاعد (`retiredAt`): إجاباتُه محفوظة
//    وحذفُ نصّه يُفقدها معناها. وتعديلُ نصّ سؤالٍ قديم لا يُمنع لكنّه يخلط
//    سؤالين في متوسّطٍ واحد — واللوحة تحذّر منه.

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { roomFeedback, surveyQuestions } from '../schemas/feedback.schema.js';
import { FEEDBACK_QUESTIONS } from './feedback.service.js';

export type Channel = 'app' | 'wa' | 'both';
export interface SurveyQuestion {
  id: number; key: string; text: string;
  type: 'scale' | 'likert' | 'text';
  channel: Channel;
  options: Array<{ label: string; score: number }>;
  sortOrder: number; enabled: boolean;
  column: string | null;
  retiredAt: string | null;
}

// ══════════════════════════════════════════════════════
// ⚙️ إعدادات الإرسال (داخل إعدادات البوت بجانب followup/restyle)
// ══════════════════════════════════════════════════════
export interface SurveySettings {
  enabled: boolean;
  delayMin: number;      // بعد إغلاق الغرفة
  validHours: number;    // بعدها لا يُرسل
  onceHours: number;     // مرّة لكلّ لاعب كلّ كذا ساعة
  lowThreshold: number;  // تقييمٌ ≤ هذا يرسل تنبيهاً
  notePrompt: string;
  maxWaQuestions: number; // سقفُ أسئلة الواتساب — التسرّب حقيقيّ
}
export const SURVEY_DEFAULTS: SurveySettings = {
  enabled: true,
  delayMin: 15,
  validHours: 20,
  onceHours: 24,
  lowThreshold: 2,
  notePrompt: 'بتحب تضيف ملاحظة بكلمتين؟',
  maxWaQuestions: 2,
};

export function mergeSurvey(patch: any): SurveySettings {
  const p = patch && typeof patch === 'object' ? patch : {};
  const num = (v: any, d: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : d;
  };
  return {
    enabled: p.enabled !== false,
    delayMin: num(p.delayMin, SURVEY_DEFAULTS.delayMin, 0, 720),
    validHours: num(p.validHours, SURVEY_DEFAULTS.validHours, 1, 23),
    // 🔴 سقفُه ٢٤ ساعة لا اعتباطاً: مفتاحُ «أُرسل له» يعيش في Redis بمهلةٍ
    //    ثابتةٍ يوماً واحداً، فقيمةٌ أكبر تَعِد بما لا يقع.
    onceHours: num(p.onceHours, SURVEY_DEFAULTS.onceHours, 1, 24),
    lowThreshold: num(p.lowThreshold, SURVEY_DEFAULTS.lowThreshold, 1, 4),
    notePrompt: String(p.notePrompt ?? SURVEY_DEFAULTS.notePrompt).slice(0, 300).trim()
      || SURVEY_DEFAULTS.notePrompt,
    // 🔴 سقفٌ صلب: كلّ سؤالٍ إضافيّ رسالةٌ مستقلّة يتسرّب عندها جزءٌ من المجيبين
    maxWaQuestions: num(p.maxWaQuestions, SURVEY_DEFAULTS.maxWaQuestions, 1, 4),
  };
}

export function getSurveySettings(botSettings: any): SurveySettings {
  return mergeSurvey({ ...SURVEY_DEFAULTS, ...(botSettings?.survey || {}) });
}

// ══════════════════════════════════════════════════════
// 🌱 البذر — الأحد عشر سؤالاً تدخل الجدول كما هي بأعمدتها
// ══════════════════════════════════════════════════════
// يُنادى عند الإقلاع. لا يلمس صفّاً موجوداً: من عدّل سؤالاً من اللوحة
// لا يُعاد نصّه إلى الأصل عند كلّ إقلاع.
export async function seedSurveyQuestions(): Promise<void> {
  const db = getDB();
  if (!db) return;
  const existing = await db.select({ key: surveyQuestions.key }).from(surveyQuestions);
  const have = new Set(existing.map(r => r.key));
  let order = 10;
  for (const q of FEEDBACK_QUESTIONS) {
    order += 10;
    if (have.has(q.key)) continue;
    await db.insert(surveyQuestions).values({
      key: q.key,
      text: q.text,
      // «عام» وحده يصل الواتساب افتراضاً — وهو ما كان يفعله النظام فعلاً
      type: q.key === 'overall' ? 'scale' : 'likert',
      channel: q.key === 'overall' ? 'both' : 'app',
      options: q.key === 'overall' ? FIVE_SCALE : [],
      sortOrder: order,
      enabled: true,
      column: q.key,
    } as any).onConflictDoNothing();
  }
}

/** المقياس الخماسيّ الكامل — قائمةٌ تفاعليّة على واتساب (الأزرار ثلاثةٌ لا أكثر) */
export const FIVE_SCALE = [
  { label: '😍 ممتازة', score: 5 },
  { label: '🙂 جيّدة', score: 4 },
  { label: '😐 عاديّة', score: 3 },
  { label: '😕 مش قدّ التوقّع', score: 2 },
  { label: '😞 سيّئة', score: 1 },
];

// ══════════════════════════════════════════════════════
// 📖 القراءة
// ══════════════════════════════════════════════════════
export async function listQuestions(opts?: { channel?: 'app' | 'wa'; onlyEnabled?: boolean }): Promise<SurveyQuestion[]> {
  const db = getDB();
  if (!db) return [];
  const rows: any[] = await db.select().from(surveyQuestions)
    .where(isNull(surveyQuestions.retiredAt))
    .orderBy(asc(surveyQuestions.sortOrder), asc(surveyQuestions.id));
  return rows
    .filter(r => (opts?.onlyEnabled ? r.enabled : true))
    .filter(r => !opts?.channel || r.channel === 'both' || r.channel === opts.channel)
    .map(r => ({
      id: r.id, key: r.key, text: r.text, type: r.type, channel: r.channel,
      options: Array.isArray(r.options) ? r.options : [],
      sortOrder: r.sortOrder, enabled: r.enabled, column: r.column,
      retiredAt: r.retiredAt ? new Date(r.retiredAt).toISOString() : null,
    }));
}

/** أسئلة الواتساب المفعّلة، مقصوصةً على السقف */
export async function waQuestions(settings: SurveySettings): Promise<SurveyQuestion[]> {
  const list = await listQuestions({ channel: 'wa', onlyEnabled: true });
  return list.filter(q => q.type !== 'text').slice(0, settings.maxWaQuestions);
}

// ══════════════════════════════════════════════════════
// ✍️ الكتابة
// ══════════════════════════════════════════════════════
const COL_OK = /^[a-z_]{2,40}$/;   // حارسٌ على اسم العمود قبل أيّ تركيب نصّيّ

/**
 * يكتب إجابةَ سؤالٍ واحد في مكانها الصحيح.
 * يعيد false إن كان الصفّ غير موجودٍ أو لغير هذا اللاعب.
 */
export async function recordAnswer(
  rowId: number, playerId: number, q: SurveyQuestion, score: number, src: 'wa' | 'app' = 'wa',
): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const s = Math.min(Math.max(Math.round(score), 1), 5);
  // الوسمُ عند أوّل إجابة: `COALESCE` كي لا يُنتزع صفٌّ بدأه التطبيق
  if (q.column && COL_OK.test(q.column)) {
    const r: any = await db.execute(sql`
      UPDATE room_feedback SET ${sql.raw(`"${q.column}"`)} = ${s}, source = COALESCE(source, ${src})
       WHERE id = ${rowId} AND player_id = ${playerId} RETURNING id`);
    return (r.rows || r || []).length > 0;
  }
  const r: any = await db.execute(sql`
    UPDATE room_feedback
       SET answers = COALESCE(answers, '{}'::jsonb) || ${JSON.stringify({ [q.key]: s })}::jsonb,
           source = COALESCE(source, ${src})
     WHERE id = ${rowId} AND player_id = ${playerId} RETURNING id`);
  return (r.rows || r || []).length > 0;
}

/** يختم الاستبيان — يُنادى بعد آخر سؤال، أو عند انتهاء المهلة بإجابةٍ جزئيّة */
export async function closeSurvey(rowId: number, playerId: number): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const r: any = await db.execute(sql`
    UPDATE room_feedback SET submitted_at = NOW()
     WHERE id = ${rowId} AND player_id = ${playerId} AND submitted_at IS NULL RETURNING id`);
  return (r.rows || r || []).length > 0;
}

// ══════════════════════════════════════════════════════
// 🛠️ تحرير الأسئلة من اللوحة
// ══════════════════════════════════════════════════════
const TYPES = ['scale', 'likert', 'text'];
const CHANNELS = ['app', 'wa', 'both'];
const slug = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);

export async function upsertQuestion(input: any, byKeyId?: number): Promise<SurveyQuestion> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const text = String(input.text || '').trim().slice(0, 500);
  if (!text) throw new Error('نصّ السؤال مطلوب');
  const type = TYPES.includes(input.type) ? input.type : 'likert';
  const channel = CHANNELS.includes(input.channel) ? input.channel : 'app';
  const options = Array.isArray(input.options)
    ? input.options.slice(0, 10).map((o: any) => ({
        label: String(o.label || '').slice(0, 60).trim(),
        score: Math.min(Math.max(Math.round(Number(o.score) || 0), 1), 5),
      })).filter((o: any) => o.label)
    : [];
  if (type === 'scale' && options.length < 2) throw new Error('سؤال الخيارات يحتاج خيارين على الأقلّ');

  const values: any = {
    text, type, channel, options,
    sortOrder: Math.min(Math.max(Math.round(Number(input.sortOrder) || 100), 0), 9999),
    enabled: input.enabled !== false,
  };

  if (byKeyId) {
    // 🔴 لا يُغيَّر `column` ولا `key` بعد الإنشاء: الأوّل يوجّه الكتابة
    //    والثاني مفتاحُ الإجابات المحفوظة.
    const [row] = await db.update(surveyQuestions).set(values)
      .where(eq(surveyQuestions.id, byKeyId)).returning();
    if (!row) throw new Error('السؤال غير موجود');
    return (await listQuestions()).find(q => q.id === row.id)!;
  }

  let key = slug(input.key || text) || `q_${Date.now()}`;
  const clash = await db.select({ id: surveyQuestions.id }).from(surveyQuestions)
    .where(eq(surveyQuestions.key, key)).limit(1);
  if (clash.length) key = `${key}_${Date.now().toString(36).slice(-4)}`;
  const [row] = await db.insert(surveyQuestions)
    .values({ ...values, key, column: null } as any).returning();
  return (await listQuestions()).find(q => q.id === row.id)!;
}

/** التقاعد لا الحذف — إجاباتُ سؤالٍ محذوفٍ تصير أرقاماً بلا سؤال */
export async function retireQuestion(id: number): Promise<void> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  await db.update(surveyQuestions)
    .set({ retiredAt: new Date(), enabled: false } as any)
    .where(and(eq(surveyQuestions.id, id), isNull(surveyQuestions.retiredAt)));
}

/** متوسّطاتُ الأسئلة الجديدة (المخزَّنة في JSONB) — للوحة التحليلات */
export async function newQuestionAverages(days = 30): Promise<Array<{ key: string; avg: number; n: number }>> {
  const db = getDB();
  if (!db) return [];
  const qs = (await listQuestions()).filter(q => !q.column && q.type !== 'text');
  if (!qs.length) return [];
  const out: Array<{ key: string; avg: number; n: number }> = [];
  for (const q of qs) {
    const r: any = await db.execute(sql`
      SELECT AVG((answers->>${q.key})::numeric) AS avg, COUNT(answers->>${q.key}) AS n
        FROM room_feedback
       WHERE created_at > NOW() - (${days} || ' days')::interval
         AND answers ? ${q.key}`);
    const row = (r.rows || r || [])[0] || {};
    if (Number(row.n) > 0) out.push({ key: q.key, avg: Math.round(Number(row.avg) * 100) / 100, n: Number(row.n) });
  }
  return out;
}

export { roomFeedback };
