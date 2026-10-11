// ══════════════════════════════════════════════════════
// 🌟 رأيك بتجربتك — تقييمٌ عامّ لنادي المافيا لا لفعاليّةٍ بعينها (2026-10-11)
// ══════════════════════════════════════════════════════
// حملة (experience_campaigns): رسالةٌ وصورةٌ وأسئلةٌ كبيانات (JSONB) وحالة draft|open|closed.
// إجابة (experience_responses): صفٌّ واحد لكلّ (حملة، لاعب) — يُعدَّل ما دامت الحملة مفتوحة.
// الإشعار: يكتب صفّاً في صندوق كلّ لاعب (النصّ كاملاً) ويدفع لمن له جهاز (مقصوصاً — fcm.service).
//
// منفصلٌ عن استبيان الأمسية (room_feedback/survey_questions) عمداً: ذاك مربوطٌ بجلسةٍ ولاعبٍ
// وأسئلته قائمةٌ واحدة عامّة، وإجاباته أرقامٌ فقط — والنصوص هنا جوهر الطلب.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);

export type ExpQuestionType = 'stars' | 'nps' | 'choice' | 'multi' | 'text';
export interface ExpQuestion {
  key: string;
  type: ExpQuestionType;
  label: string;
  hint?: string;
  section?: string;
  required?: boolean;
  options?: string[];
  maxSelect?: number;
  placeholder?: string;
  enabled?: boolean;
}

export const EXP_TEXT_MAX = 2000;

/** الأسئلة الافتراضيّة — تُنسخ في كلّ حملةٍ جديدة ثمّ تُحرَّر من اللوحة */
export const DEFAULT_EXP_QUESTIONS: ExpQuestion[] = [
  { key: 'overall', type: 'stars', section: 'تجربتك بشكل عام', required: true,
    label: 'بشكل عام، قدّيش مبسوط من تجربتك مع Mafia Club؟' },
  { key: 'nps', type: 'nps', section: 'تجربتك بشكل عام',
    label: 'قدّيش ممكن تنصح صاحبك أو صاحبتك يجرّبوا Mafia Club؟', hint: '٠ = أبداً · ١٠ = أكيد' },
  { key: 'atmosphere', type: 'stars', section: 'قيّم كلّ جانب', label: 'الأجواء والمجتمع', hint: 'الاحترام والراحة والأمان' },
  { key: 'leaders', type: 'stars', section: 'قيّم كلّ جانب', label: 'إدارة اللعب والموجّهين' },
  { key: 'venues', type: 'stars', section: 'قيّم كلّ جانب', label: 'الأماكن والتنظيم والمواعيد' },
  { key: 'app', type: 'stars', section: 'قيّم كلّ جانب', label: 'التطبيق والحجز' },
  { key: 'value', type: 'stars', section: 'قيّم كلّ جانب', label: 'السعر مقابل التجربة' },
  { key: 'likes', type: 'multi', section: 'رأيك بكلماتك', label: 'شو أكثر إشي بيعجبك فينا؟', hint: 'اختر كلّ ما ينطبق',
    options: ['الأجواء والناس', 'اللعب والتحدّي', 'الموجّهين', 'التعرّف على ناس جديدة', 'الأماكن', 'المسابقات والجوائز', 'التطبيق'] },
  { key: 'improve', type: 'text', section: 'رأيك بكلماتك', label: 'شو أكثر إشي بتحب نحسّنه؟' },
  { key: 'ideas', type: 'text', section: 'رأيك بكلماتك', label: 'عندك فكرة أو إشي بتتمنى تشوفه في Mafia Club؟',
    placeholder: 'أدوار جديدة، أنواع فعاليّات، أماكن، أوقات…' },
  { key: 'concerns', type: 'text', section: 'رأيك بكلماتك', label: 'صار معك موقف أو إشي ضايقك بتحب نعرف عنه؟',
    hint: 'بيوصل للإدارة فقط، وبنتعامل معه بسرّيّة' },
  { key: 'contact', type: 'choice', section: 'رأيك بكلماتك', label: 'إذا احتجنا نستفسر عن ملاحظتك، بتسمحلنا نتواصل معك؟',
    options: ['نعم', 'لا'] },
];

/** رسالةُ الحملة الأولى كما كتبها المالك (2026-10-11) */
const FIRST_TITLE = 'mafia club بالنسبة إلنا أكبر من مجرد لعبة! ❤️';
const FIRST_INTRO = `mafia club بالنسبة إلنا أكبر من مجرد لعبة!
من أول يوم، كان هدفنا نبني مجتمع حلو يجمع ناس محترمة، ببيئة آمنة ومريحة نقدر ننبسط فيها، نتعرّف على ناس جديدة، ونصنع ذكريات حلوة مع بعض. 🫶🏻

ومع الوقت، كبر مجتمعنا، ووصل لأكثر من ألف شخص جرّبوا اللعبة معنا. وهذا إنجاز بنفتخر فيه كثير، والأجمل إن كل واحد منكم كان جزءًا من هالرحلة. ❤️

وبنفس الوقت، تعلّمنا إن الحفاظ على جودة الأجواء يحتاج اختيارات واعية، حتى تظل mafia club مساحة مريحة وممتعة للأشخاص اللي بيشاركونا نفس الروح والاحترام.

وإحنا مؤمنين إن التجربة الحلوة ما بتنبنى لحالها، بل بتكبر بملاحظاتكم وأفكاركم واقتراحاتكم. وعشان هيك، بعد ما وصلنا لأكثر من ألف شخص جرّبوا اللعبة معنا، حسّينا إن هذا الوقت المناسب نسمع منكم ونشارككم الرأي.

إذا عندك أي نصيحة، ملاحظة، أو إشي بتتمنى نشوفه في mafia club، سواء بتجربة اللعب أو بأجواء المجتمع بشكل عام، بنحب نسمع منك، ورح نكون مبسوطين بكل كلمة بتساعدنا نتطور للأفضل. ❤️

لأنه بالنهاية، هذا المجتمع إلكم، وإحنا بدنا نبنيه معكم، ونحافظ سوا على الروح الحلوة اللي خلت mafia club مكانًا مميزًا. 🫶🏻`;

export async function ensureExperienceTables(): Promise<void> {
  const db = getDB(); if (!db) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS experience_campaigns (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    intro TEXT NOT NULL DEFAULT '',
    image_url TEXT,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(10) NOT NULL DEFAULT 'draft',
    push_title VARCHAR(200),
    push_body TEXT,
    sent_at TIMESTAMP,
    sent_by VARCHAR(100),
    sent_count INTEGER DEFAULT 0,
    created_by VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS experience_responses (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES experience_campaigns(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    overall SMALLINT,
    nps SMALLINT,
    allow_contact BOOLEAN,
    source VARCHAR(16),
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT experience_responses_uniq UNIQUE (campaign_id, player_id)
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS experience_responses_campaign_idx ON experience_responses (campaign_id, submitted_at DESC)`);
  // الحملةُ الأولى برسالة المالك — مسوّدة: تُفتح عند إرسال إشعارها من اللوحة
  const any = rowsOf(await db.execute(sql`SELECT 1 FROM experience_campaigns LIMIT 1`));
  if (!any.length) {
    await db.execute(sql`INSERT INTO experience_campaigns (title, intro, questions, status, push_title, push_body, created_by)
      VALUES (${FIRST_TITLE}, ${FIRST_INTRO}, ${JSON.stringify(DEFAULT_EXP_QUESTIONS)}::jsonb, 'draft', ${FIRST_TITLE}, ${FIRST_INTRO.split('
').slice(1).join('
').trim()}, 'system')`);   // نصُّ الإشعار بلا سطره الأوّل: هو العنوان
    console.log('🌟 experience: أُنشئت الحملة الأولى (مسوّدة)');
  }
}

// ══════════════════════════════════════════════════════
// الحملات
// ══════════════════════════════════════════════════════
export interface ExpCampaign {
  id: number; title: string; intro: string; imageUrl: string | null; questions: ExpQuestion[];
  status: 'draft' | 'open' | 'closed'; pushTitle: string | null; pushBody: string | null;
  sentAt: string | null; sentBy: string | null; sentCount: number; createdAt: string; updatedAt: string;
}
const iso = (v: any) => (v ? new Date(v).toISOString() : null);
function mapCampaign(r: any): ExpCampaign {
  return {
    id: Number(r.id), title: r.title, intro: r.intro || '', imageUrl: r.image_url || null,
    questions: Array.isArray(r.questions) ? r.questions : [], status: r.status,
    pushTitle: r.push_title ?? null, pushBody: r.push_body ?? null,
    sentAt: iso(r.sent_at), sentBy: r.sent_by ?? null, sentCount: Number(r.sent_count || 0),
    createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
  };
}

export async function listCampaigns(): Promise<Array<ExpCampaign & { responses: number }>> {
  const db = getDB(); if (!db) return [];
  const rows = rowsOf(await db.execute(sql`
    SELECT c.*, (SELECT COUNT(*)::int FROM experience_responses r WHERE r.campaign_id = c.id) AS responses
      FROM experience_campaigns c ORDER BY c.id DESC`));
  return rows.map(r => ({ ...mapCampaign(r), responses: Number(r.responses || 0) }));
}

export async function getCampaign(id: number): Promise<ExpCampaign | null> {
  const db = getDB(); if (!db) return null;
  const [r] = rowsOf(await db.execute(sql`SELECT * FROM experience_campaigns WHERE id = ${id}`));
  return r ? mapCampaign(r) : null;
}

/** ما يراه اللاعب: الحملة المطلوبة إن لم تكن مسوّدة، وإلّا أحدثُ حملةٍ مفتوحة */
export async function playerCampaign(id: number | null): Promise<ExpCampaign | null> {
  const db = getDB(); if (!db) return null;
  if (id) {
    const c = await getCampaign(id);
    return c && c.status !== 'draft' ? c : null;
  }
  const [r] = rowsOf(await db.execute(sql`SELECT * FROM experience_campaigns WHERE status = 'open' ORDER BY id DESC LIMIT 1`));
  return r ? mapCampaign(r) : null;
}

const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
const TYPES: ExpQuestionType[] = ['stars', 'nps', 'choice', 'multi', 'text'];
/** تنظيف أسئلةٍ قادمةٍ من اللوحة — مفاتيحُ فريدة، أنواعٌ معروفة، خياراتٌ لما يحتاجها */
export function sanitizeQuestions(input: any): { ok: boolean; error?: string; questions?: ExpQuestion[] } {
  if (!Array.isArray(input) || !input.length) return { ok: false, error: 'لا أسئلة' };
  if (input.length > 30) return { ok: false, error: 'الحدّ ٣٠ سؤالاً' };
  const seen = new Set<string>();
  const out: ExpQuestion[] = [];
  for (const q of input) {
    const key = String(q?.key || '').trim();
    if (!KEY_RE.test(key)) return { ok: false, error: `مفتاحٌ غير صالح: «${key}»` };
    if (seen.has(key)) return { ok: false, error: `مفتاحٌ مكرّر: «${key}»` };
    seen.add(key);
    const type = String(q?.type) as ExpQuestionType;
    if (!TYPES.includes(type)) return { ok: false, error: `نوعٌ غير معروف في «${key}»` };
    const label = String(q?.label || '').trim().slice(0, 300);
    if (!label) return { ok: false, error: `سؤالٌ بلا نصّ: «${key}»` };
    const options = (type === 'choice' || type === 'multi')
      ? (Array.isArray(q.options) ? q.options.map((o: any) => String(o || '').trim().slice(0, 60)).filter(Boolean) : [])
      : undefined;
    if (options && (options.length < 2 || options.length > 12)) return { ok: false, error: `«${key}»: من خيارين إلى ١٢ خياراً` };
    out.push({
      key, type, label,
      ...(q.hint ? { hint: String(q.hint).trim().slice(0, 200) } : {}),
      ...(q.section ? { section: String(q.section).trim().slice(0, 80) } : {}),
      ...(q.placeholder ? { placeholder: String(q.placeholder).trim().slice(0, 120) } : {}),
      ...(options ? { options } : {}),
      ...(type === 'multi' && Number(q.maxSelect) > 0 ? { maxSelect: Math.min(options!.length, Math.trunc(Number(q.maxSelect))) } : {}),
      required: !!q.required,
      enabled: q.enabled !== false,
    });
  }
  if (!out.some(q => q.enabled !== false)) return { ok: false, error: 'كلّ الأسئلة مطفأة' };
  return { ok: true, questions: out };
}

export async function updateCampaign(id: number, patch: Partial<{ title: string; intro: string; imageUrl: string | null; questions: ExpQuestion[]; status: string; pushTitle: string; pushBody: string }>): Promise<ExpCampaign | null> {
  const db = getDB(); if (!db) return null;
  const cur = await getCampaign(id); if (!cur) return null;
  const next = {
    title: patch.title !== undefined ? String(patch.title).trim().slice(0, 200) || cur.title : cur.title,
    intro: patch.intro !== undefined ? String(patch.intro).slice(0, 6000) : cur.intro,
    imageUrl: patch.imageUrl !== undefined ? (patch.imageUrl ? String(patch.imageUrl).trim() : null) : cur.imageUrl,
    questions: patch.questions ?? cur.questions,
    status: patch.status && ['draft', 'open', 'closed'].includes(patch.status) ? patch.status : cur.status,
    pushTitle: patch.pushTitle !== undefined ? String(patch.pushTitle).trim().slice(0, 200) : cur.pushTitle,
    pushBody: patch.pushBody !== undefined ? String(patch.pushBody).slice(0, 6000) : cur.pushBody,
  };
  await db.execute(sql`UPDATE experience_campaigns SET title = ${next.title}, intro = ${next.intro}, image_url = ${next.imageUrl},
    questions = ${JSON.stringify(next.questions)}::jsonb, status = ${next.status}, push_title = ${next.pushTitle}, push_body = ${next.pushBody},
    updated_at = NOW() WHERE id = ${id}`);
  return getCampaign(id);
}

export async function createCampaign(createdBy: string): Promise<ExpCampaign | null> {
  const db = getDB(); if (!db) return null;
  const [r] = rowsOf(await db.execute(sql`INSERT INTO experience_campaigns (title, intro, questions, status, created_by)
    VALUES ('رأيك بتجربتك مع Mafia Club', '', ${JSON.stringify(DEFAULT_EXP_QUESTIONS)}::jsonb, 'draft', ${createdBy}) RETURNING *`));
  return r ? mapCampaign(r) : null;
}

// ══════════════════════════════════════════════════════
// الإجابات
// ══════════════════════════════════════════════════════
/** يتحقّق من الإجابات على أسئلة الحملة المفعّلة ويطبّعها — لا يُحفظ مفتاحٌ ليس سؤالاً */
export function validateAnswers(questions: ExpQuestion[], raw: any): { ok: boolean; error?: string; answers?: Record<string, any> } {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out: Record<string, any> = {};
  for (const q of questions.filter(x => x.enabled !== false)) {
    const v = src[q.key];
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required) return { ok: false, error: `«${q.label}» مطلوب` };
      continue;
    }
    switch (q.type) {
      case 'stars': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `«${q.label}»: من ١ إلى ٥` };
        out[q.key] = n; break;
      }
      case 'nps': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 10) return { ok: false, error: `«${q.label}»: من ٠ إلى ١٠` };
        out[q.key] = n; break;
      }
      case 'choice': {
        const s = String(v);
        if (!(q.options || []).includes(s)) return { ok: false, error: `«${q.label}»: خيارٌ غير معروف` };
        out[q.key] = s; break;
      }
      case 'multi': {
        const arr = (Array.isArray(v) ? v : [v]).map(String);
        if (arr.some(s => !(q.options || []).includes(s))) return { ok: false, error: `«${q.label}»: خيارٌ غير معروف` };
        const uniq = Array.from(new Set(arr));
        if (q.maxSelect && uniq.length > q.maxSelect) return { ok: false, error: `«${q.label}»: الحدّ ${q.maxSelect}` };
        out[q.key] = uniq; break;
      }
      case 'text': {
        const s = String(v).trim().slice(0, EXP_TEXT_MAX);
        if (s) out[q.key] = s;
        else if (q.required) return { ok: false, error: `«${q.label}» مطلوب` };
        break;
      }
    }
  }
  if (!Object.keys(out).length) return { ok: false, error: 'لا إجابات' };
  return { ok: true, answers: out };
}

export async function myResponse(campaignId: number, playerId: number): Promise<{ answers: Record<string, any>; submittedAt: string; updatedAt: string } | null> {
  const db = getDB(); if (!db) return null;
  const [r] = rowsOf(await db.execute(sql`SELECT answers, submitted_at, updated_at FROM experience_responses WHERE campaign_id = ${campaignId} AND player_id = ${playerId}`));
  return r ? { answers: r.answers || {}, submittedAt: iso(r.submitted_at)!, updatedAt: iso(r.updated_at)! } : null;
}

export async function saveResponse(c: ExpCampaign, playerId: number, answers: Record<string, any>, source: string): Promise<{ created: boolean }> {
  const db = getDB(); if (!db) throw new Error('DB unavailable');
  const overall = Number.isInteger(answers.overall) ? answers.overall : null;
  const nps = Number.isInteger(answers.nps) ? answers.nps : null;
  const allowContact = answers.contact === 'نعم' ? true : answers.contact === 'لا' ? false : null;
  const src = ['push', 'inbox', 'home', 'link', 'app', 'web'].includes(source) ? source : 'link';
  const [r] = rowsOf(await db.execute(sql`
    INSERT INTO experience_responses (campaign_id, player_id, answers, overall, nps, allow_contact, source)
    VALUES (${c.id}, ${playerId}, ${JSON.stringify(answers)}::jsonb, ${overall}, ${nps}, ${allowContact}, ${src})
    ON CONFLICT (campaign_id, player_id) DO UPDATE SET answers = EXCLUDED.answers, overall = EXCLUDED.overall, nps = EXCLUDED.nps,
      allow_contact = EXCLUDED.allow_contact, updated_at = NOW()
    RETURNING (xmax = 0) AS created`));
  return { created: !!r?.created };
}

// ══════════════════════════════════════════════════════
// النتائج
// ══════════════════════════════════════════════════════
export async function campaignSummary(c: ExpCampaign) {
  const db = getDB(); if (!db) return null;
  const rows = rowsOf(await db.execute(sql`SELECT answers, overall, nps FROM experience_responses WHERE campaign_id = ${c.id}`));
  const n = rows.length;
  const qs = c.questions.filter(q => q.enabled !== false);
  const stars = qs.filter(q => q.type === 'stars').map(q => {
    const vals = rows.map(r => Number(r.answers?.[q.key])).filter(v => Number.isInteger(v) && v >= 1 && v <= 5);
    const dist = [1, 2, 3, 4, 5].map(s => vals.filter(v => v === s).length);
    return { key: q.key, label: q.label, n: vals.length, avg: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null, dist };
  });
  const npsQ = qs.find(q => q.type === 'nps');
  let nps: any = null;
  if (npsQ) {
    const vals = rows.map(r => Number(r.answers?.[npsQ.key])).filter(v => Number.isInteger(v) && v >= 0 && v <= 10);
    const promoters = vals.filter(v => v >= 9).length, detractors = vals.filter(v => v <= 6).length;
    nps = { key: npsQ.key, label: npsQ.label, n: vals.length, promoters, passives: vals.length - promoters - detractors, detractors,
      score: vals.length ? Math.round(((promoters - detractors) / vals.length) * 100) : null,
      dist: Array.from({ length: 11 }, (_, i) => vals.filter(v => v === i).length) };
  }
  const choices = qs.filter(q => q.type === 'choice' || q.type === 'multi').map(q => {
    const counts = (q.options || []).map(o => ({ label: o, count: 0 }));
    let answered = 0;
    for (const r of rows) {
      const v = r.answers?.[q.key];
      const arr = Array.isArray(v) ? v : v != null ? [v] : [];
      if (arr.length) answered++;
      for (const s of arr) { const c2 = counts.find(x => x.label === s); if (c2) c2.count++; }
    }
    return { key: q.key, label: q.label, type: q.type, answered, options: counts };
  });
  const texts = qs.filter(q => q.type === 'text').map(q => ({ key: q.key, label: q.label, count: rows.filter(r => String(r.answers?.[q.key] || '').trim()).length }));
  const [aud] = rowsOf(await db.execute(sql`
    SELECT COUNT(*)::int AS notified, COUNT(*) FILTER (WHERE is_push_sent)::int AS pushed, COUNT(*) FILTER (WHERE is_read)::int AS opened
      FROM player_notifications WHERE type = 'experience_review' AND (data->>'campaignId') = ${String(c.id)}`));
  return {
    responses: n,
    notified: Number(aud?.notified || 0), pushed: Number(aud?.pushed || 0), opened: Number(aud?.opened || 0),
    contactYes: rows.filter(r => r.answers?.contact === 'نعم').length,
    stars, nps, choices, texts,
  };
}

const RESP_FILTERS: Record<string, any> = {
  low: sql`AND r.overall <= 2`,
  high: sql`AND r.overall >= 4`,
  text: sql`AND (COALESCE(r.answers->>'improve','') <> '' OR COALESCE(r.answers->>'ideas','') <> '' OR COALESCE(r.answers->>'concerns','') <> '')`,
  concerns: sql`AND COALESCE(r.answers->>'concerns','') <> ''`,
  contact: sql`AND r.allow_contact = true`,
};
export async function campaignResponses(campaignId: number, o: { page?: unknown; pageSize?: unknown; filter?: unknown; q?: unknown }) {
  const db = getDB(); if (!db) return { rows: [], total: 0, page: 1, pageSize: 20 };
  const pageSize = Math.min(100, Math.max(5, Math.trunc(Number(o.pageSize) || 20)));
  const page = Math.max(1, Math.trunc(Number(o.page) || 1));
  const f = RESP_FILTERS[String(o.filter)] || sql``;
  const q = String(o.q ?? '').trim().slice(0, 80);
  const qf = q ? sql`AND (p.name ILIKE ${'%' + q + '%'} OR p.phone ILIKE ${'%' + q + '%'} OR r.answers::text ILIKE ${'%' + q + '%'})` : sql``;
  const [t] = rowsOf(await db.execute(sql`SELECT COUNT(*)::int AS n FROM experience_responses r JOIN players p ON p.id = r.player_id
    WHERE r.campaign_id = ${campaignId} ${f} ${qf}`));
  const rows = rowsOf(await db.execute(sql`
    SELECT r.id, r.player_id, p.name, p.phone, p.avatar_url, r.answers, r.overall, r.nps, r.allow_contact, r.source, r.submitted_at, r.updated_at
      FROM experience_responses r JOIN players p ON p.id = r.player_id
     WHERE r.campaign_id = ${campaignId} ${f} ${qf}
     ORDER BY r.submitted_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`));
  return {
    total: Number(t?.n || 0), page, pageSize,
    rows: rows.map(r => ({
      id: Number(r.id), playerId: Number(r.player_id), name: r.name, phone: r.phone, avatarUrl: r.avatar_url || null,
      answers: r.answers || {}, overall: r.overall, nps: r.nps, allowContact: r.allow_contact, source: r.source,
      submittedAt: iso(r.submitted_at), updatedAt: iso(r.updated_at),
    })),
  };
}

/** CSV — عمودٌ لكلّ سؤال، بترتيب الحملة */
export async function campaignCsv(c: ExpCampaign): Promise<string> {
  const db = getDB(); if (!db) return '';
  const rows = rowsOf(await db.execute(sql`
    SELECT r.player_id, p.name, p.phone, r.answers, r.source, r.submitted_at, r.updated_at
      FROM experience_responses r JOIN players p ON p.id = r.player_id WHERE r.campaign_id = ${c.id} ORDER BY r.submitted_at`));
  const qs = c.questions;
  const esc = (v: any) => { const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['player_id', 'name', 'phone', ...qs.map(q => q.label), 'source', 'submitted_at', 'updated_at'];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) lines.push([r.player_id, r.name, r.phone, ...qs.map(q => r.answers?.[q.key]), r.source, iso(r.submitted_at), iso(r.updated_at)].map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}

// ══════════════════════════════════════════════════════
// الجمهور والإرسال
// ══════════════════════════════════════════════════════
export async function audience(): Promise<{ players: number; withPush: number; devices: number }> {
  const db = getDB(); if (!db) return { players: 0, withPush: 0, devices: 0 };
  const [r] = rowsOf(await db.execute(sql`
    SELECT (SELECT COUNT(*)::int FROM players WHERE deleted_at IS NULL AND anonymized_at IS NULL) AS players,
           COUNT(DISTINCT t.player_id)::int AS with_push, COUNT(*)::int AS devices
      FROM player_fcm_tokens t JOIN players p ON p.id = t.player_id
     WHERE t.is_active = true AND p.deleted_at IS NULL AND p.anonymized_at IS NULL`));
  return { players: Number(r?.players || 0), withPush: Number(r?.with_push || 0), devices: Number(r?.devices || 0) };
}

export function notificationContent(c: ExpCampaign) {
  return {
    title: (c.pushTitle || c.title || 'رأيك يهمّنا').trim().slice(0, 200),
    body: (c.pushBody || c.intro || '').trim(),
    data: {
      url: `/player/experience?c=${c.id}&src=push`,
      campaignId: c.id,
      ctaLabel: '✍️ اكتب رأيك',
      ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
    },
  };
}
