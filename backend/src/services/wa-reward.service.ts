// ══════════════════════════════════════════════════════
// 🎁 عروض الحديث مع البوت — WhatsApp Chat Reward Events
// «شغّل عرضاً لساعات، وكلّ من يحادث الدون خلاله يأخذ نقاطاً هديّة».
// ══════════════════════════════════════════════════════
//
// 🔴 أربعة مبادئ تحكم هذا الملفّ — مخالفتها تُنتج نقاطاً تظهر ثمّ تختفي:
//
// (١) **المنح عبر الدفتر ثمّ المصالحة، لا بنداء applyRR.**
//     `reconcileSeasonProgression` تُعيد اشتقاق players.* و player_season_stats من الصفر
//     من `match_players` بعد كلّ مباراة وعند إنهاء كلّ فعاليّة؛ الناجي الوحيد هو
//     `rank_bonuses`. فالمنح المباشر رقمٌ يُمحى خلال ساعات. (نفس درس activity-bonus.service)
//
// (٢) **بلا موسمٍ نشط وبلا مدينة لا منح.** المصالحة تتخطّى صفوف الدفتر التي
//     `season_id IS NULL`، وتتخطّى — في الموسم العادي — كلّ صفٍّ بلا `city_id`
//     (reconcile.service.ts: `if (targetIsRegular && cityId == null) continue`).
//     ولذلك يسأل البوت عن المدينة بزرّين قبل الصرف لمن لا مدينة أساسيّة له.
//
// (٣) **المصالحة مجمَّعة لا فوريّة.** حدثٌ ناجح = عشرات الممنوحين في الدقيقة، ونداءٌ
//     لكلّ واحد يُثقل القاعدة بلا داعٍ. الدفتر هو الحقيقة والإدراج تمّ؛ المصالحة
//     مجرّد «إظهار» — تُجمَّع كلّ ١٥ ثانية، ويحرسها مسحٌ دوريّ ومسحٌ عند الإقلاع.
//
// (٤) **النموذج لا يمنح شيئاً.** كلّ المنح كودٌ حتميّ خارج مسار Gemini؛ الموجّه
//     يُخبَر بالعرض ليروّج له فقط (إن فُعّل)، ولا يملك أداةً تمنح نقطة واحدة.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

// ── الأنواع ─────────────────────────────────────────
export type RewardKind = 'RR' | 'XP' | 'CHIPS';
export type EventStatus = 'scheduled' | 'running' | 'paused' | 'ended' | 'cancelled';
export type ClaimState = 'counting' | 'pending_link' | 'pending_city' | 'awarded' | 'expired' | 'rejected';

export interface RewardConfig {
  /** مفتاح الميزة كلّها — إطفاؤه يوقف كلّ عرضٍ نشط فوراً */
  enabled: boolean;
  /** القيمة الافتراضيّة لكلّ نوع (تُقترح في شاشة الإنشاء) */
  defaultAmount: Record<RewardKind, number>;
  /** الحدّ الأقصى لكلّ نوع — سقفٌ صلب لا تتجاوزه شاشة الإنشاء */
  maxAmount: Record<RewardKind, number>;
  defaultMinMessages: number;
  defaultGraceHours: number;
  defaultCooldownDays: number;
  defaultExcludeStaff: boolean;
  defaultSkipActivityHours: boolean;
  /** ± ساعات حول موعد الفعاليّة تُعدّ «ساعات فعاليّة» */
  activityHoursWindow: number;
  defaultPromoteInBot: boolean;
  defaultMaxPlayers: number;
  defaultMaxTotalPoints: number;
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  enabled: true,
  defaultAmount: { RR: 10, XP: 25, CHIPS: 50 },
  maxAmount: { RR: 30, XP: 100, CHIPS: 500 },
  defaultMinMessages: 1,
  defaultGraceHours: 24,
  defaultCooldownDays: 7,
  defaultExcludeStaff: true,
  defaultSkipActivityHours: false,
  activityHoursWindow: 2,
  defaultPromoteInBot: true,
  defaultMaxPlayers: 0,
  defaultMaxTotalPoints: 0,
};

export const KIND_AR: Record<RewardKind, string> = {
  RR: 'نقطة رانك',
  XP: 'نقطة خبرة',
  CHIPS: 'تشبس',
};

// ── أدوات ───────────────────────────────────────────
function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** مفتاح الدفعة — الفهرس الفريد (player_id, reason) في rank_bonuses يمنع الازدواج على مستوى القاعدة */
export const rewardReason = (eventId: number) => `wa-chat-reward:${eventId}`;

// ══════════════════════════════════════════════════════
// الإعدادات — صفٌّ واحد jsonb (نفس نمط loyalty_config)
// ══════════════════════════════════════════════════════

let cfgCache: { v: RewardConfig; at: number } | null = null;
const CFG_TTL = 60_000;
export function invalidateRewardConfig() { cfgCache = null; }

function mergeCfg(raw: any): RewardConfig {
  const d = DEFAULT_REWARD_CONFIG;
  const v = raw && typeof raw === 'object' ? raw : {};
  const amt = (src: any, def: Record<RewardKind, number>, max: number): Record<RewardKind, number> => ({
    RR: clampInt(src?.RR, 1, max, def.RR),
    XP: clampInt(src?.XP, 1, max, def.XP),
    CHIPS: clampInt(src?.CHIPS, 1, max, def.CHIPS),
  });
  const maxAmount = amt(v.maxAmount, d.maxAmount, 5000);
  return {
    enabled: v.enabled != null ? !!v.enabled : d.enabled,
    maxAmount,
    // الافتراضيّ لا يتجاوز الأقصى أبداً — وإلّا فتحت الشاشة قيمةً مرفوضة
    defaultAmount: {
      RR: clampInt(v.defaultAmount?.RR, 1, maxAmount.RR, Math.min(d.defaultAmount.RR, maxAmount.RR)),
      XP: clampInt(v.defaultAmount?.XP, 1, maxAmount.XP, Math.min(d.defaultAmount.XP, maxAmount.XP)),
      CHIPS: clampInt(v.defaultAmount?.CHIPS, 1, maxAmount.CHIPS, Math.min(d.defaultAmount.CHIPS, maxAmount.CHIPS)),
    },
    defaultMinMessages: clampInt(v.defaultMinMessages, 1, 10, d.defaultMinMessages),
    defaultGraceHours: clampInt(v.defaultGraceHours, 0, 168, d.defaultGraceHours),
    defaultCooldownDays: clampInt(v.defaultCooldownDays, 0, 365, d.defaultCooldownDays),
    defaultExcludeStaff: v.defaultExcludeStaff != null ? !!v.defaultExcludeStaff : d.defaultExcludeStaff,
    defaultSkipActivityHours: v.defaultSkipActivityHours != null ? !!v.defaultSkipActivityHours : d.defaultSkipActivityHours,
    activityHoursWindow: clampInt(v.activityHoursWindow, 0, 12, d.activityHoursWindow),
    defaultPromoteInBot: v.defaultPromoteInBot != null ? !!v.defaultPromoteInBot : d.defaultPromoteInBot,
    defaultMaxPlayers: clampInt(v.defaultMaxPlayers, 0, 100000, d.defaultMaxPlayers),
    defaultMaxTotalPoints: clampInt(v.defaultMaxTotalPoints, 0, 1000000, d.defaultMaxTotalPoints),
  };
}

export async function getRewardConfig(): Promise<RewardConfig> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL) return cfgCache.v;
  const db = getDB();
  if (!db) return DEFAULT_REWARD_CONFIG;
  try {
    const r = await db.execute(sql`SELECT value FROM wa_reward_config WHERE key = 'wa_reward' LIMIT 1`);
    const v = mergeCfg(rowsOf(r)[0]?.value);
    cfgCache = { v, at: Date.now() };
    return v;
  } catch {
    return DEFAULT_REWARD_CONFIG;
  }
}

export async function updateRewardConfig(patch: any): Promise<RewardConfig> {
  const db = getDB();
  if (!db) return DEFAULT_REWARD_CONFIG;
  const cur = await getRewardConfig();
  const next = mergeCfg({ ...cur, ...(patch || {}) });
  await db.execute(sql`
    INSERT INTO wa_reward_config (key, value, updated_at)
    VALUES ('wa_reward', ${JSON.stringify(next)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
  invalidateRewardConfig();
  invalidateLiveEvent();
  return next;
}

// ══════════════════════════════════════════════════════
// الأحداث
// ══════════════════════════════════════════════════════

let liveCache: { ev: any | null; at: number } | null = null;
const LIVE_TTL = 30_000;
export function invalidateLiveEvent() { liveCache = null; }

/** الحدث العامل الآن (كاش ٣٠ ثانية — يُستدعى مع كلّ رسالة واردة) */
export async function getLiveEvent(): Promise<any | null> {
  if (liveCache && Date.now() - liveCache.at < LIVE_TTL) return liveCache.ev;
  const db = getDB();
  if (!db) return null;
  let ev: any = null;
  try {
    const r = await db.execute(sql`
      SELECT * FROM wa_reward_events
       WHERE status = 'running' AND starts_at <= NOW() AND ends_at > NOW()
       ORDER BY id DESC LIMIT 1`);
    ev = rowsOf(r)[0] ?? null;
  } catch { ev = null; }
  liveCache = { ev, at: Date.now() };
  return ev;
}

export async function getEvent(id: number): Promise<any | null> {
  const db = getDB();
  if (!db) return null;
  const r = await db.execute(sql`SELECT * FROM wa_reward_events WHERE id = ${id} LIMIT 1`);
  return rowsOf(r)[0] ?? null;
}

export async function listEvents(limit = 30): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  const r = await db.execute(sql`
    SELECT e.*,
           (SELECT COUNT(*)::int FROM wa_reward_claims c WHERE c.event_id = e.id AND c.state = 'pending_link') AS pending_link,
           (SELECT COUNT(*)::int FROM wa_reward_claims c WHERE c.event_id = e.id AND c.state = 'pending_city') AS pending_city
      FROM wa_reward_events e ORDER BY e.id DESC LIMIT ${Math.min(100, Math.max(1, limit))}`);
  return rowsOf(r);
}

export interface CreateEventInput {
  name: string;
  kind: RewardKind;
  amount: number;
  hours?: number;                 // المدّة من لحظة البدء
  startsAt?: string | Date;       // أو بدءٌ مجدول
  endsAt?: string | Date;
  minMessages?: number;
  maxPlayers?: number;
  maxTotalPoints?: number;
  graceHours?: number;
  cooldownDays?: number;
  excludeStaff?: boolean;
  skipActivityHours?: boolean;
  promoteInBot?: boolean;
  onlyCityId?: number | null;
  announce?: any;
  startNow?: boolean;
  createdBy?: string;
}

/**
 * فحصٌ سابق للإنشاء — يُرجع ما يجب أن يراه المالك قبل الضغط.
 * يُستعمل للمعاينة ولحراسة الإنشاء معاً (نفس المصدر، فلا يفترقان).
 */
export async function previewEvent(input: CreateEventInput): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const cfg = await getRewardConfig();
  const kind: RewardKind = (['RR', 'XP', 'CHIPS'] as const).includes(input.kind as any) ? input.kind : 'RR';
  const amount = clampInt(input.amount, 1, cfg.maxAmount[kind], cfg.defaultAmount[kind]);
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!cfg.enabled) blockers.push('⛔ ميزة العروض مطفأة من الإعدادات — فعّلها أوّلاً.');

  // ── الموسم والمدن (لا تلزم التشبس) ──
  let seasonId: number | null = null;
  let seasonName: string | null = null;
  if (kind !== 'CHIPS') {
    const { getActiveRegularSeasonId } = await import('./season.service.js');
    seasonId = await getActiveRegularSeasonId();
    if (!seasonId) {
      blockers.push('⛔ لا يوجد موسمٌ عاديّ نشط — نقاطُ الرانك والخبرة تختفي عند أوّل إعادة احتساب بلا موسم.');
    } else {
      const sr = await db.execute(sql`SELECT name FROM seasons WHERE id = ${seasonId}`);
      seasonName = rowsOf(sr)[0]?.name ?? null;
    }
  }

  // ── حالة قناة واتساب: عرضٌ لا يستطيع أحدٌ الوصول إليه ليس عرضاً ──
  try {
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const s: any = await getBotSettings();
    if (!s?.enabled) warnings.push('⚠️ البوت مطفأ حاليّاً — لن يردّ على أحد. شغّله قبل بدء العرض.');
  } catch { /* تكميليّ */ }
  try {
    const { sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
    const blocked = sendingSuspendedReason();
    if (blocked) blockers.push(`⛔ إرسال واتساب مقفل حاليّاً (${blocked}) — لا أحد سيرى نتيجة العرض.`);
  } catch { /* تكميليّ */ }

  // ── تداخل مع حدثٍ آخر ──
  const { startsAt, endsAt } = resolveWindow(input, cfg);
  const ov = await db.execute(sql`
    SELECT id, name FROM wa_reward_events
     WHERE status IN ('scheduled','running','paused')
       AND starts_at < ${endsAt} AND ends_at > ${startsAt} LIMIT 1`);
  const overlap = rowsOf(ov)[0];
  if (overlap) blockers.push(`⛔ يتداخل مع العرض «${overlap.name}» (#${overlap.id}) — لا يعمل عرضان في وقتٍ واحد.`);

  // ── أثر القيمة: النسبة من الترقية التالية (الحاجز أمام رقمٍ كارثيّ) ──
  let impact: string | null = null;
  if (kind === 'RR') {
    const { RANK_RR_REQUIRED } = await import('./progression.service.js');
    const need = Number((RANK_RR_REQUIRED as any).INFORMANT || 100);
    const pct = Math.round((amount / need) * 100);
    impact = `${amount} نقطة رانك = ${pct}٪ من الترقية من «مُخبر» إلى «جندي» (${need} RR).`;
    if (pct >= 50) warnings.push(`⚠️ ${pct}٪ من ترقيةٍ كاملة في رسالةٍ واحدة — قيمةٌ مرتفعة جدّاً.`);
    else if (pct >= 25) warnings.push(`⚠️ ${pct}٪ من ترقيةٍ كاملة — تأكّد أنّها مقصودة.`);
  }

  // ── كم لاعباً سيمرّ بخطوة المدينة؟ ──
  let noCityPlayers = 0;
  if (kind !== 'CHIPS') {
    const nc = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM players
       WHERE deleted_at IS NULL AND home_city_id IS NULL AND COALESCE(is_test_account,false) = false`);
    noCityPlayers = Number(rowsOf(nc)[0]?.n || 0);
    if (noCityPlayers > 0) {
      warnings.push(`🏙️ ${noCityPlayers} لاعباً بلا مدينة أساسيّة — سيُسألون بزرّين قبل صرف نقاطهم (ولن تضيع نقطة).`);
    }
  }

  // ── المحادثات التي راسلتنا في آخر ٣٠ يوماً: تقديرٌ خشن للوصول ──
  const reach = await db.execute(sql`
    SELECT COUNT(*)::int AS convs,
           COUNT(*) FILTER (WHERE player_id IS NOT NULL)::int AS linked
      FROM wa_conversations WHERE last_inbound_at >= NOW() - INTERVAL '30 days'`);
  const rch = rowsOf(reach)[0] || {};

  const cities = kind === 'CHIPS' ? [] : await (async () => {
    const { listCities } = await import('./cities.service.js');
    return (await listCities({ activeOnly: true })).map(c => ({ id: c.id, name: c.name }));
  })();

  return {
    ok: blockers.length === 0,
    kind, amount, startsAt, endsAt,
    hours: Math.round(((+endsAt - +startsAt) / 3600e3) * 10) / 10,
    seasonId, seasonName, impact, noCityPlayers, cities,
    reach: { conversations30d: Number(rch.convs || 0), linked30d: Number(rch.linked || 0) },
    estimatedAiCostUsd: Math.round(Number(rch.convs || 0) * 4 * 0.0024 * 100) / 100,
    maxAmount: cfg.maxAmount[kind],
    warnings, blockers,
  };
}

function resolveWindow(input: CreateEventInput, cfg: RewardConfig): { startsAt: Date; endsAt: Date } {
  const now = new Date();
  const startsAt = input.startsAt ? new Date(input.startsAt) : now;
  let endsAt: Date;
  if (input.endsAt) endsAt = new Date(input.endsAt);
  else {
    const hours = Number(input.hours);
    const h = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 720) : 3;
    endsAt = new Date(startsAt.getTime() + h * 3600e3);
  }
  if (!(endsAt > startsAt)) endsAt = new Date(startsAt.getTime() + 3600e3);
  return { startsAt, endsAt };
}

export async function createEvent(input: CreateEventInput): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const cfg = await getRewardConfig();
  const pv = await previewEvent(input);
  if (!pv.ok) return { ok: false, error: pv.blockers[0] || 'تعذّر الإنشاء', preview: pv };

  const kind: RewardKind = pv.kind;
  const amount: number = pv.amount;
  const { startsAt, endsAt } = resolveWindow(input, cfg);
  const name = String(input.name || '').trim().slice(0, 120) || `عرض ${KIND_AR[kind]}`;
  const startNow = input.startNow !== false && startsAt.getTime() <= Date.now() + 5000;

  let r: any;
  try {
  r = await db.execute(sql`
    INSERT INTO wa_reward_events (
      name, status, starts_at, ends_at, kind, amount, season_id, only_city_id,
      min_messages, max_players, max_total_points, grace_hours, cooldown_days,
      exclude_staff, skip_activity_hours, promote_in_bot, announce, created_by
    ) VALUES (
      ${name}, ${startNow ? 'running' : 'scheduled'}, ${startsAt}, ${endsAt}, ${kind}, ${amount},
      ${pv.seasonId ?? null}, ${input.onlyCityId ?? null},
      ${clampInt(input.minMessages, 1, 10, cfg.defaultMinMessages)},
      ${clampInt(input.maxPlayers, 0, 100000, cfg.defaultMaxPlayers)},
      ${clampInt(input.maxTotalPoints, 0, 1000000, cfg.defaultMaxTotalPoints)},
      ${clampInt(input.graceHours, 0, 168, cfg.defaultGraceHours)},
      ${clampInt(input.cooldownDays, 0, 365, cfg.defaultCooldownDays)},
      ${input.excludeStaff != null ? !!input.excludeStaff : cfg.defaultExcludeStaff},
      ${input.skipActivityHours != null ? !!input.skipActivityHours : cfg.defaultSkipActivityHours},
      ${input.promoteInBot != null ? !!input.promoteInBot : cfg.defaultPromoteInBot},
      ${JSON.stringify(input.announce || {})}::jsonb, ${String(input.createdBy || '')}
    ) RETURNING *`);
  } catch (e: any) {
    if (isUniqueViolation(e)) return { ok: false, error: 'هناك عرضٌ يعمل الآن — أنهِه أوّلاً أو اجعل هذا مجدولاً بعده.' };
    throw e;
  }
  const ev = rowsOf(r)[0];
  invalidateLiveEvent();
  await invalidateBotFacts();
  if (ev?.status === 'running') void announceEvent(ev).catch(() => {});
  return { ok: true, event: ev, preview: pv };
}

export async function setEventStatus(id: number, status: EventStatus, by = ''): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const ev = await getEvent(id);
  if (!ev) return { ok: false, error: 'العرض غير موجود' };
  if (ev.status === 'ended' || ev.status === 'cancelled') {
    return { ok: false, error: 'العرض منتهٍ — أنشئ عرضاً جديداً' };
  }
  const ended = status === 'ended' || status === 'cancelled';
  let r: any;
  try {
  r = await db.execute(sql`
    UPDATE wa_reward_events
       SET status = ${status}, updated_at = NOW(),
           ended_at = ${ended ? sql`NOW()` : sql`ended_at`},
           meta = COALESCE(meta,'{}'::jsonb) || ${JSON.stringify({ lastStatusBy: by, lastStatusAt: new Date().toISOString() })}::jsonb
     WHERE id = ${id} RETURNING *`);
  } catch (e: any) {
    if (isUniqueViolation(e)) return { ok: false, error: 'هناك عرضٌ آخر يعمل الآن — أوقفه أوّلاً.' };
    throw e;
  }
  invalidateLiveEvent();
  await invalidateBotFacts();
  const next = rowsOf(r)[0];
  // إنهاءٌ صريح ⟵ مصالحةٌ ختاميّة تضمن ظهور كلّ ما مُنح
  if (ended) void sweepReconcile(id).catch(() => {});
  if (status === 'running') void announceEvent(next).catch(() => {});
  return { ok: true, event: next };
}

async function invalidateBotFacts() {
  try {
    const { invalidateLiveFacts } = await import('./whatsapp-bot.service.js');
    invalidateLiveFacts();
  } catch { /* تكميليّ */ }
}

// ══════════════════════════════════════════════════════
// ساعات الفعاليّات — استثناءٌ اختياريّ
// ══════════════════════════════════════════════════════

let actHourCache: { v: boolean; at: number } | null = null;
async function isActivityHourNow(windowHours: number): Promise<boolean> {
  if (windowHours <= 0) return false;
  if (actHourCache && Date.now() - actHourCache.at < 60_000) return actHourCache.v;
  const db = getDB();
  if (!db) return false;
  let v = false;
  try {
    const r = await db.execute(sql`
      SELECT 1 FROM activities a LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.deleted_at IS NULL AND COALESCE(l.is_test_location,false) = false
         AND a.date BETWEEN NOW() - (${windowHours} * INTERVAL '1 hour') AND NOW() + (${windowHours} * INTERVAL '1 hour')
       LIMIT 1`);
    v = rowsOf(r).length > 0;
  } catch { v = false; }
  actHourCache = { v, at: Date.now() };
  return v;
}

// ══════════════════════════════════════════════════════
// الخطّاف: كلّ رسالة واردة
// ══════════════════════════════════════════════════════

/**
 * يُستدعى من خدمة الإنبوكس مع كلّ رسالة عميلٍ واردة — fire-and-forget.
 * صامتٌ تماماً حين لا عرضَ نشطاً (نداءُ كاشٍ واحد).
 */
export async function onInboundMessage(conv: { id: number; phone: string; playerId: number | null }): Promise<void> {
  const cfg = await getRewardConfig();
  if (!cfg.enabled) return;
  const ev = await getLiveEvent();
  if (!ev) return;

  // مفتاحُ البوت العامّ مطفأ ⟵ لم يحادث أحدٌ بوتاً. (الإيقافُ المؤقّت لمحادثةٍ بعينها
  // لأنّ موظّفاً يردّ لا يمنع الاستحقاق — العميل لا يعرف من يردّ عليه.)
  try {
    const { getBotSettings } = await import('./whatsapp-bot.service.js');
    const s: any = await getBotSettings();
    if (!s?.enabled) return;
  } catch { /* عند تعذّر القراءة لا نحرم أحداً */ }

  const db = getDB();
  if (!db) return;

  // ── صفّ المطالبة: واحدٌ لكلّ (عرض، محادثة) ──
  // ⚠️ فهرسان فريدان على هذا الجدول: (عرض، محادثة) و(عرض، لاعب). واللاعبُ الواحد قد
  //    يملك محادثتين (رقمان مربوطان بحسابه) — فيصطدم الإدراجُ الثاني بالفهرس الثاني
  //    الذي **ليس** هدفَ ON CONFLICT، فيرمي بوستجرس. وهذا هو السلوك المطلوب (منحةٌ
  //    واحدة لكلّ لاعب) لكنّه يجب أن يكون صمتاً لا استثناءً يملأ السجلّ.
  let claim: any;
  try {
    const cr = await db.execute(sql`
      INSERT INTO wa_reward_claims (event_id, conversation_id, phone, player_id, messages_counted, first_message_at, last_message_at, state, expires_at)
      VALUES (${ev.id}, ${conv.id}, ${conv.phone || ''}, ${conv.playerId ?? null}, 1, NOW(), NOW(), 'counting',
              ${new Date(new Date(ev.ends_at).getTime() + Number(ev.grace_hours || 0) * 3600e3)})
      ON CONFLICT (event_id, conversation_id) DO UPDATE
        SET messages_counted = wa_reward_claims.messages_counted + 1,
            last_message_at = NOW(),
            player_id = COALESCE(wa_reward_claims.player_id, EXCLUDED.player_id)
      RETURNING *`);
    claim = rowsOf(cr)[0];
  } catch (e: any) {
    if (isUniqueViolation(e)) return;     // لهذا اللاعب مطالبةٌ في محادثةٍ أخرى — منحةٌ واحدة تكفي
    throw e;
  }
  if (!claim) return;
  if (claim.state === 'awarded' || claim.state === 'rejected' || claim.state === 'expired') return;
  if (Number(claim.messages_counted || 0) < Number(ev.min_messages || 1)) return;

  // ساعات الفعاليّة: لا نحسم الآن ولا نرفض — يبقى مؤهّلاً إن راسلنا لاحقاً داخل النافذة
  if (ev.skip_activity_hours && await isActivityHourNow(cfg.activityHoursWindow)) return;

  await tryAward(ev, claim, conv.playerId ?? claim.player_id ?? null).catch((e: any) =>
    console.warn('⚠️ [wa-reward] tryAward:', e?.message || e));
}

// ══════════════════════════════════════════════════════
// المنح
// ══════════════════════════════════════════════════════

interface AwardOutcome {
  state: ClaimState;
  code?: string;
  amount?: number;
  cityId?: number | null;
}

async function setClaim(claimId: number, patch: Record<string, any>): Promise<void> {
  const db = getDB();
  if (!db) return;
  const sets: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    // `meta` عمودُ jsonb: تمريرُ نصٍّ إليه بلا cast يرفضه بوستجرس، والدمجُ
    // (لا الاستبدال) يحفظ ما كُتب سابقاً مثل وقت سؤال المدينة.
    if (k === 'meta') sets.push(sql`meta = COALESCE(meta,'{}'::jsonb) || ${v as any}::jsonb`);
    else sets.push(sql`${sql.raw(k)} = ${v as any}`);
  }
  if (!sets.length) return;
  await db.execute(sql`UPDATE wa_reward_claims SET ${sql.join(sets, sql`, `)} WHERE id = ${claimId}`);
}

/** خطأُ تعارضٍ فريد من بوستجرس (23505) */
function isUniqueViolation(err: any): boolean {
  const code = err?.code || err?.cause?.code || err?.originalError?.code;
  return code === '23505';
}

/**
 * محاولة الصرف. تُستدعى من الخطّاف، ومن مسارات الربط/التسجيل، ومن زرّ المدينة.
 * تحترم مهلة المعلَّق فتعمل بعد انتهاء الحدث ما دام `expires_at` لم يمضِ.
 */
export async function tryAward(ev: any, claim: any, playerId: number | null): Promise<AwardOutcome> {
  const db = getDB();
  if (!db) return { state: 'counting' };

  // ── النافذة: داخل الحدث، أو داخل مهلة المعلَّق ──
  const now = Date.now();
  const withinEvent = new Date(ev.starts_at).getTime() <= now && new Date(ev.ends_at).getTime() > now && ev.status === 'running';
  const withinGrace = claim.expires_at ? new Date(claim.expires_at).getTime() > now : false;
  if (!withinEvent && !withinGrace) {
    await setClaim(claim.id, { state: 'expired' });
    return { state: 'expired', code: 'WINDOW' };
  }

  // ── لا حساب: نحجز المطالبة ونترك الباب مفتوحاً للتسجيل/الربط ──
  if (!playerId) {
    if (claim.state !== 'pending_link') await setClaim(claim.id, { state: 'pending_link' });
    return { state: 'pending_link', code: 'NO_ACCOUNT' };
  }

  // ── بيانات اللاعب والاستبعادات ──
  const pr = await db.execute(sql`
    SELECT id, name, COALESCE(is_locked,false) AS is_locked, COALESCE(is_test_account,false) AS is_test,
           linked_staff_id, home_city_id, deleted_at
      FROM players WHERE id = ${playerId} LIMIT 1`);
  const pl = rowsOf(pr)[0];
  if (!pl || pl.deleted_at) return reject(claim.id, 'NO_PLAYER');

  // ── مطالبةٌ أخرى لنفس اللاعب في هذا العرض (رقمان مربوطان بحسابه) ──
  //    تُفحص هنا قبل أيّ كتابة: بدونها يرمي الفهرسُ الفريد (event_id, player_id)
  //    عند تحديث هذا الصفّ، فيضيع السياق ويظهر الخطأ كعطلٍ لا كقرار.
  const other = await db.execute(sql`
    SELECT id, state FROM wa_reward_claims
     WHERE event_id = ${ev.id} AND player_id = ${playerId} AND id <> ${claim.id} LIMIT 1`);
  if (rowsOf(other).length) {
    return reject(claim.id, rowsOf(other)[0].state === 'awarded' ? 'ALREADY_AWARDED' : 'OTHER_CLAIM');
  }
  if (pl.is_test) return reject(claim.id, 'TEST_ACCOUNT');
  if (pl.is_locked) return reject(claim.id, 'LOCKED');
  if (ev.exclude_staff && pl.linked_staff_id != null) return reject(claim.id, 'STAFF');

  // ── التهدئة بين الأحداث ──
  const cooldown = Number(ev.cooldown_days || 0);
  if (cooldown > 0) {
    const cd = await db.execute(sql`
      SELECT 1 FROM wa_reward_claims
       WHERE player_id = ${playerId} AND state = 'awarded' AND event_id <> ${ev.id}
         AND awarded_at >= NOW() - (${cooldown} * INTERVAL '1 day') LIMIT 1`);
    if (rowsOf(cd).length) return reject(claim.id, 'COOLDOWN');
  }

  const kind: RewardKind = ev.kind;
  const amount = Number(ev.amount || 0);
  let cityId: number | null = null;

  // ── الموسم والمدينة (لا تلزمان التشبس) ──
  if (kind !== 'CHIPS') {
    const seasonId = Number(ev.season_id || 0) || null;
    if (!seasonId) {
      await alertOwner('⛔ عرض بلا موسم', `العرض «${ev.name}» بلا موسمٍ مسجَّل — أُوقف المنح.`);
      await setEventStatus(ev.id, 'paused', 'system');
      return { state: 'counting', code: 'NO_SEASON' };
    }
    // الموسم ما زال نشطاً؟ (انتهاؤه أثناء الحدث يجعل المنح يختفي)
    const sr = await db.execute(sql`SELECT status FROM seasons WHERE id = ${seasonId} LIMIT 1`);
    if (String(rowsOf(sr)[0]?.status || '') !== 'ACTIVE') {
      await alertOwner('⛔ الموسم انتهى', `موسم العرض «${ev.name}» لم يعد نشطاً — أُوقف العرض تلقائيّاً.`);
      await setEventStatus(ev.id, 'paused', 'system');
      return { state: 'counting', code: 'SEASON_ENDED' };
    }

    const { getOrInferHomeCity } = await import('./season.service.js');
    cityId = await getOrInferHomeCity(playerId, seasonId);
    if (!cityId) {
      // خطوة المدينة — زرّان، مرّةً كلّ ٦ ساعات فلا نُلحّ
      await setClaim(claim.id, { state: 'pending_city', player_id: playerId });
      await askHomeCity(ev, claim, playerId).catch(() => {});
      return { state: 'pending_city', code: 'NO_CITY' };
    }
    if (ev.only_city_id != null && Number(ev.only_city_id) !== Number(cityId)) {
      return reject(claim.id, 'OTHER_CITY');
    }
  }

  // ── حجز مقعدٍ من السقف **قبل** الدفتر (ذرّيّاً) ──
  const cap = await db.execute(sql`
    UPDATE wa_reward_events
       SET awarded_count = awarded_count + 1, awarded_points = awarded_points + ${amount}, updated_at = NOW()
     WHERE id = ${ev.id}
       AND (max_players = 0 OR awarded_count < max_players)
       AND (max_total_points = 0 OR awarded_points + ${amount} <= max_total_points)
     RETURNING awarded_count, awarded_points`);
  if (!rowsOf(cap).length) {
    await notifyCapReached(ev);
    return { state: 'counting', code: 'CAP_REACHED' };
  }
  const releaseSeat = async () => {
    await db.execute(sql`
      UPDATE wa_reward_events SET awarded_count = GREATEST(0, awarded_count - 1),
             awarded_points = GREATEST(0, awarded_points - ${amount}) WHERE id = ${ev.id}`);
  };

  // ── الصرف ──
  let ledgerRef = '';
  let beforeSnap: any = null;
  try {
    if (kind === 'CHIPS') {
      const { applyChipsTx } = await import('./chips.service.js');
      const res = await applyChipsTx({
        playerId,
        amount,
        reason: 'reward_chat' as any,
        idempotencyKey: `${rewardReason(ev.id)}:${playerId}`,
        refType: 'wa_reward',
        refId: String(ev.id),
        note: `مكافأة عرض «${ev.name}» — حديث مع الدون`,
      });
      if (!res.ok && !res.duplicate) { await releaseSeat(); return { state: 'counting', code: res.code || 'CHIPS_FAIL' }; }
      if (res.duplicate) { await releaseSeat(); await setClaim(claim.id, { state: 'awarded', player_id: playerId }); return { state: 'awarded', code: 'DUPLICATE' }; }
      ledgerRef = String(res.ledgerId || '');
    } else {
      // لقطة «قبل» — بها وحدها نعرف لاحقاً من تُرقّي بعد المصالحة
      beforeSnap = await readStanding(playerId, Number(ev.season_id), cityId);
      const meta = { event: ev.name, eventId: ev.id, kind, amount, source: 'wa-chat' };
      const ins = await db.execute(sql`
        INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, activity_id, granted_by, meta, city_id)
        SELECT ${playerId}::int, ${kind === 'RR' ? amount : 0}::int, ${kind === 'XP' ? amount : 0}::int,
               ${rewardReason(ev.id)}::varchar, ${Number(ev.season_id)}::int, NULL::int, NULL::int,
               ${JSON.stringify(meta)}::jsonb, ${cityId}::int
        WHERE NOT EXISTS (
          SELECT 1 FROM rank_bonuses WHERE player_id = ${playerId} AND reason = ${rewardReason(ev.id)}
        )
        ON CONFLICT DO NOTHING
        RETURNING id`);
      const row = rowsOf(ins)[0];
      if (!row) {
        // نالها سابقاً — نُعيد المقعد ونُثبّت الحالة
        await releaseSeat();
        await setClaim(claim.id, { state: 'awarded', player_id: playerId });
        return { state: 'awarded', code: 'DUPLICATE' };
      }
      ledgerRef = String(row.id);
      queueReconcile(Number(ev.season_id), playerId, ev.id, claim.id);
    }
  } catch (e: any) {
    await releaseSeat();
    console.error('❌ [wa-reward] صرف فاشل:', e?.message || e);
    return { state: 'counting', code: 'ERROR' };
  }

  await setClaim(claim.id, {
    state: 'awarded', player_id: playerId, city_id: cityId, amount, kind,
    awarded_at: new Date(), ledger_ref: ledgerRef,
    meta: JSON.stringify({ before: beforeSnap }),
  });

  void announceAward(ev, playerId, amount, kind, cityId).catch(() => {});
  return { state: 'awarded', amount, cityId };
}

async function reject(claimId: number, code: string): Promise<AwardOutcome> {
  await setClaim(claimId, { state: 'rejected', reject_code: code });
  return { state: 'rejected', code };
}

async function readStanding(playerId: number, seasonId: number, cityId: number | null): Promise<any> {
  const db = getDB();
  if (!db) return null;
  const r = await db.execute(sql`
    SELECT COALESCE(rank_tier,'INFORMANT') AS rank_tier, COALESCE(rank_rr,0)::int AS rank_rr, COALESCE(level,1)::int AS level
      FROM player_season_stats
     WHERE player_id = ${playerId} AND season_id = ${seasonId}
       AND ${cityId == null ? sql`city_id IS NULL` : sql`city_id = ${cityId}`} LIMIT 1`);
  return rowsOf(r)[0] ?? { rank_tier: 'INFORMANT', rank_rr: 0, level: 1 };
}

// ══════════════════════════════════════════════════════
// المصالحة المجمَّعة — «الإظهار» لا «الحقيقة»
// ══════════════════════════════════════════════════════

const pendingRec = new Map<number, Set<number>>();          // seasonId → playerIds
const pendingClaims = new Map<number, { eventId: number; claimId: number; playerId: number }[]>();
let recTimer: ReturnType<typeof setTimeout> | null = null;
const RECONCILE_DEBOUNCE_MS = 15_000;

function queueReconcile(seasonId: number, playerId: number, eventId: number, claimId: number) {
  if (!seasonId) return;
  const set = pendingRec.get(seasonId) || new Set<number>();
  set.add(playerId);
  pendingRec.set(seasonId, set);
  const arr = pendingClaims.get(seasonId) || [];
  arr.push({ eventId, claimId, playerId });
  pendingClaims.set(seasonId, arr);
  if (recTimer) return;
  recTimer = setTimeout(() => { recTimer = null; void flushReconcile(); }, RECONCILE_DEBOUNCE_MS);
}

async function flushReconcile(): Promise<void> {
  const batches = [...pendingRec.entries()];
  pendingRec.clear();
  const claims = new Map(pendingClaims);
  pendingClaims.clear();
  for (const [seasonId, ids] of batches) {
    const playerIds = [...ids];
    if (!playerIds.length) continue;
    try {
      const { reconcileSeasonProgression } = await import('./reconcile.service.js');
      await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: playerIds });
      await notePromotions(seasonId, claims.get(seasonId) || []);
    } catch (e: any) {
      console.warn('⚠️ [wa-reward] مصالحة مجمَّعة فشلت:', e?.message || e);
    }
  }
}

/** بعد المصالحة: من ترقّى فعلاً؟ — بشرى واحدة لا ثلاث */
async function notePromotions(seasonId: number, list: { eventId: number; claimId: number; playerId: number }[]) {
  const db = getDB();
  if (!db || !list.length) return;
  const { RANK_NAMES_AR, RANK_ORDER } = await import('./progression.service.js');
  for (const it of list) {
    try {
      const cr = await db.execute(sql`SELECT city_id, meta FROM wa_reward_claims WHERE id = ${it.claimId} LIMIT 1`);
      const c = rowsOf(cr)[0];
      const before = c?.meta?.before;
      if (!before) continue;
      const after = await readStanding(it.playerId, seasonId, c.city_id ?? null);
      const up = (RANK_ORDER as any)[after.rank_tier] > (RANK_ORDER as any)[before.rank_tier];
      if (!up) continue;
      const tierAr = (RANK_NAMES_AR as any)[after.rank_tier] || after.rank_tier;
      const { sendPushToPlayer } = await import('./fcm.service.js');
      await sendPushToPlayer(it.playerId, '🏆 ترقية!', `وصلت رتبة «${tierAr}» — مبروك!`, 'rank_promotion', {
        source: 'wa-reward', eventId: String(it.eventId),
      });
      await db.execute(sql`
        UPDATE wa_reward_claims SET meta = COALESCE(meta,'{}'::jsonb) || ${JSON.stringify({ promotedTo: after.rank_tier })}::jsonb
         WHERE id = ${it.claimId}`);
    } catch { /* البشرى تكميليّة */ }
  }
}

/**
 * مسحٌ احتياطيّ: يصالح كلّ من مُنح ولم تظهر نقاطه (سقوط الخادم بين الإدراج والمصالحة).
 * يُستدعى دوريّاً وعند إنهاء الحدث وعند الإقلاع.
 */
export async function sweepReconcile(eventId?: number): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const r = await db.execute(sql`
    SELECT DISTINCT c.player_id, e.season_id
      FROM wa_reward_claims c JOIN wa_reward_events e ON e.id = c.event_id
     WHERE c.state = 'awarded' AND c.player_id IS NOT NULL AND e.kind <> 'CHIPS' AND e.season_id IS NOT NULL
       AND c.awarded_at >= NOW() - INTERVAL '3 days'
       ${eventId ? sql`AND c.event_id = ${eventId}` : sql``}`);
  const rows = rowsOf(r);
  if (!rows.length) return 0;
  const bySeason = new Map<number, number[]>();
  for (const x of rows) {
    const s = Number(x.season_id);
    const arr = bySeason.get(s) || [];
    arr.push(Number(x.player_id));
    bySeason.set(s, arr);
  }
  let n = 0;
  const { reconcileSeasonProgression } = await import('./reconcile.service.js');
  for (const [seasonId, ids] of bySeason) {
    try {
      await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: ids });
      n += ids.length;
    } catch (e: any) {
      console.warn('⚠️ [wa-reward] مسح المصالحة:', e?.message || e);
    }
  }
  return n;
}

// ══════════════════════════════════════════════════════
// خطوة المدينة — زرّان حتميّان (لا يقرّرها النموذج)
// ══════════════════════════════════════════════════════

const ASK_CITY_COOLDOWN_MS = 6 * 3600e3;

async function askHomeCity(ev: any, claim: any, playerId: number): Promise<void> {
  const db = getDB();
  if (!db) return;
  const askedAt = claim?.meta?.cityAskedAt ? new Date(claim.meta.cityAskedAt).getTime() : 0;
  if (Date.now() - askedAt < ASK_CITY_COOLDOWN_MS) return;   // لا نُلحّ

  const { listCities } = await import('./cities.service.js');
  const cities = (await listCities({ activeOnly: true })).slice(0, 3);   // واتساب: ٣ أزرار كحدّ أقصى
  if (!cities.length) return;

  const { sendMessage } = await import('./whatsapp-inbox.service.js');
  await sendMessage({
    conversationId: claim.conversation_id,
    source: 'system',
    interactive: {
      type: 'button',
      body: { text: `🎖️ نقاطك من «${ev.name}» محجوزة إلك (${ev.amount} ${KIND_AR[ev.kind as RewardKind]})\nبس محتاج أعرف: من أيّ مدينة بتلعب عادةً؟` },
      action: {
        buttons: cities.map(c => ({
          type: 'reply',
          reply: { id: `rwcity:${ev.id}:${c.id}`, title: c.name.slice(0, 20) },
        })),
      },
    },
  });
  await db.execute(sql`
    UPDATE wa_reward_claims SET meta = COALESCE(meta,'{}'::jsonb) || ${JSON.stringify({ cityAskedAt: new Date().toISOString() })}::jsonb
     WHERE id = ${claim.id}`);
}

/**
 * ضغطة زرّ المدينة: `rwcity:{eventId}:{cityId}`.
 * تكتب المدينة الأساسيّة (اختيارُ اللاعب — نفس ما يفعله تطبيق اللاعب) ثمّ تصرف.
 * تُرجع true إن عالجت الضغطة.
 */
export async function handleCityButton(conv: any, btnId: string): Promise<boolean> {
  const m = /^rwcity:(\d+):(\d+)$/.exec(btnId || '');
  if (!m) return false;
  const db = getDB();
  if (!db) return true;
  const eventId = parseInt(m[1]);
  const cityId = parseInt(m[2]);
  const { sendMessage } = await import('./whatsapp-inbox.service.js');

  if (!conv.playerId) {
    await sendMessage({ conversationId: conv.id, source: 'system', text: 'لازم نربط حسابك أوّلاً 🙏 احكيلي وبساعدك بدقيقة.' });
    return true;
  }
  const { getCity } = await import('./cities.service.js');
  const city = await getCity(cityId);
  if (!city || !city.isActive) return true;

  await db.execute(sql`
    UPDATE players SET home_city_id = ${cityId}, home_city_source = 'chosen'
     WHERE id = ${conv.playerId} AND deleted_at IS NULL`);

  const ev = await getEvent(eventId);
  const cr = await db.execute(sql`
    SELECT * FROM wa_reward_claims WHERE event_id = ${eventId} AND conversation_id = ${conv.id} LIMIT 1`);
  const claim = rowsOf(cr)[0];
  if (!ev || !claim) {
    await sendMessage({ conversationId: conv.id, source: 'system', text: `تمام ✅ سجّلت إنّك بتلعب في ${city.name}.` });
    return true;
  }
  if (claim.state === 'awarded') {
    await sendMessage({ conversationId: conv.id, source: 'system', text: `تمام ✅ مدينتك صارت ${city.name}.` });
    return true;
  }
  const out = await tryAward(ev, claim, conv.playerId);
  if (out.state !== 'awarded') {
    await sendMessage({
      conversationId: conv.id, source: 'system',
      text: `سجّلت مدينتك ${city.name} ✅ — بس ما قدرت أحسبلك النقاط الآن. الإدارة بتتابع الموضوع 🙏`,
    });
  }
  return true;
}

// ══════════════════════════════════════════════════════
// صرف المعلَّق عند الربط/التسجيل — الوصل الثلاثيّ
// ══════════════════════════════════════════════════════

/**
 * تُستدعى من **ثلاثة** مواضع: confirm_account_link · زرّ إنشاء الحساب (reg_ok) ·
 * الربط اليدويّ من الإنبوكس. نسيانُ أحدها يُنتج شكوى «وين نقاطي» بلا سبب ظاهر.
 */
export async function settlePendingForConversation(convId: number, playerId: number, source = ''): Promise<AwardOutcome | null> {
  const db = getDB();
  if (!db || !convId || !playerId) return null;
  try {
    const r = await db.execute(sql`
      SELECT c.*, e.id AS ev_id FROM wa_reward_claims c JOIN wa_reward_events e ON e.id = c.event_id
       WHERE c.conversation_id = ${convId}
         AND c.state IN ('pending_link','counting','pending_city')
         AND (c.expires_at IS NULL OR c.expires_at > NOW())
       ORDER BY c.id DESC LIMIT 1`);
    const claim = rowsOf(r)[0];
    if (!claim) return null;
    const ev = await getEvent(Number(claim.event_id));
    if (!ev) return null;
    // شرطُ الاستحقاق نفسه: عددُ الرسائل المطلوب تحقّق أثناء النافذة
    if (Number(claim.messages_counted || 0) < Number(ev.min_messages || 1)) {
      await setClaim(claim.id, { player_id: playerId });
      return null;
    }
    const out = await tryAward(ev, { ...claim, player_id: playerId }, playerId);
    if (out.state === 'awarded') {
      console.log(`🎁 [wa-reward] صُرفت مطالبة معلَّقة #${claim.id} بعد ${source || 'ربط'}`);
    }
    return out;
  } catch (e: any) {
    console.warn('⚠️ [wa-reward] settlePending:', e?.message || e);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// الرسائل والإشعارات
// ══════════════════════════════════════════════════════

async function announceAward(ev: any, playerId: number, amount: number, kind: RewardKind, cityId: number | null) {
  const db = getDB();
  if (!db) return;
  let cityTail = '';
  if (cityId != null) {
    try {
      const { cityNameOf } = await import('./cities.service.js');
      const n = await cityNameOf(cityId);
      if (n) cityTail = ` في ${n}`;
    } catch { /* تكميليّ */ }
  }
  const unit = KIND_AR[kind];
  const icon = kind === 'CHIPS' ? '🪙' : '🎖️';
  const text = `${icon} +${amount} ${unit}${cityTail} هديّة من «${ev.name}» — شكراً إنّك حكيت معي 🎭`;

  // رسالة واتساب حتميّة (لا يكتبها النموذج فلا يُخطئ فيها)
  try {
    const cr = await db.execute(sql`
      SELECT conversation_id FROM wa_reward_claims WHERE event_id = ${ev.id} AND player_id = ${playerId} LIMIT 1`);
    const convId = rowsOf(cr)[0]?.conversation_id;
    if (convId) {
      const { sendMessage } = await import('./whatsapp-inbox.service.js');
      await sendMessage({ conversationId: Number(convId), source: 'system', text });
    }
  } catch (e: any) {
    console.warn('⚠️ [wa-reward] رسالة البشرى:', e?.message || e);
  }

  // إشعار التطبيق
  try {
    const { sendPushToPlayer } = await import('./fcm.service.js');
    await sendPushToPlayer(playerId, '🎁 نقاط هديّة', `+${amount} ${unit}${cityTail} من «${ev.name}»`, 'rank_bonus', {
      source: 'wa-reward', eventId: String(ev.id), kind, amount: String(amount),
    });
  } catch { /* تكميليّ */ }
}

async function alertOwner(title: string, body: string) {
  try {
    const { notifyAdmins } = await import('./whatsapp-inbox.service.js');
    await notifyAdmins(title, body, { url: '/admin/whatsapp?tab=rewards', tag: 'wa-reward-alert' });
  } catch { /* تكميليّ */ }
}

let capNotified = new Set<number>();
async function notifyCapReached(ev: any) {
  if (capNotified.has(ev.id)) return;
  capNotified.add(ev.id);
  await alertOwner('🎁 بلغ العرض سقفه', `«${ev.name}» وصل الحدّ المحدَّد — لا مزيد من المنح.`);
}

/** إعلانٌ عند بدء العرض — Push لكلّ اللاعبين (أو لمدينةٍ بعينها) */
async function announceEvent(ev: any) {
  if (!ev) return;
  const ann = ev.announce || {};
  if (ann.push === false) return;
  try {
    const { sendPushToAllPlayers, sendPushToCityPlayers } = await import('./fcm.service.js');
    const unit = KIND_AR[ev.kind as RewardKind];
    const title = `🎁 ${ev.name}`;
    const ends = new Date(ev.ends_at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
    const body = `احكي مع الدون على واتساب وخُد ${ev.amount} ${unit} هديّة — العرض لين ${ends} ⏳`;
    const data = { type: 'wa_reward', eventId: String(ev.id) };
    if (ev.only_city_id) await sendPushToCityPlayers(Number(ev.only_city_id), title, body, 'wa_reward', data);
    else await sendPushToAllPlayers(title, body, 'wa_reward', data);
  } catch (e: any) {
    console.warn('⚠️ [wa-reward] إعلان العرض:', e?.message || e);
  }
}

// ══════════════════════════════════════════════════════
// حقائق البوت — ليروّج للعرض (إن فُعّل) ولا يَعِد بما انتهى
// ══════════════════════════════════════════════════════

export async function liveEventFactLine(): Promise<string | null> {
  const cfg = await getRewardConfig();
  if (!cfg.enabled) return null;
  const ev = await getLiveEvent();
  if (!ev || !ev.promote_in_bot) return null;
  const ends = new Date(ev.ends_at).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
  const unit = KIND_AR[ev.kind as RewardKind];
  return `- 🎁 عرضٌ نشط الآن: «${ev.name}» — كلّ من يحادثك اليوم حتّى الساعة ${ends} يأخذ ${ev.amount} ${unit} هديّة. `
    + `النقاط تُمنح **آليّاً** من النظام (لا تمنحها أنت ولا تَعِد بها لمن لا يستحقّ)، وشرطها أن يكون رقمه مربوطاً بحساب لاعب — `
    + `فمن ليس له حساب اعرض عليه فتحه الآن عبر start_registration ليأخذها، ومن حسابه برقمٍ آخر اربطه عبر request_account_link. `
    + `وإن سألك أحدٌ بعد انتهاء الوقت فاعتذر بلطف ولا تَعِد بشيء.`;
}

/** سطرٌ لبطاقة العميل — حالة هذا الشخص من العرض تحديداً */
export async function customerCardLine(convId: number, playerId: number | null): Promise<string | null> {
  const cfg = await getRewardConfig();
  if (!cfg.enabled) return null;
  const ev = await getLiveEvent();
  if (!ev) return null;
  const db = getDB();
  if (!db) return null;
  try {
    const r = await db.execute(sql`
      SELECT state FROM wa_reward_claims WHERE event_id = ${ev.id} AND conversation_id = ${convId} LIMIT 1`);
    const st = rowsOf(r)[0]?.state as ClaimState | undefined;
    if (st === 'awarded') return `🎁 أخذ نقاط العرض «${ev.name}» بالفعل — هنّئه بلا تكرار الوعد.`;
    if (st === 'pending_city') return `🎁 نقاطه محجوزة وينتظر اختيار مدينته من الأزرار المرسلة — ذكّره بلطف أن يضغط زرّ مدينته.`;
    if (!playerId) return `🎁 نقاط العرض «${ev.name}» (${ev.amount} ${KIND_AR[ev.kind as RewardKind]}) **محجوزة له** وتُصرف فور فتح حسابه — اعرض عليه التسجيل الآن، هذه أفضل فرصة.`;
    return `🎁 عرضٌ نشط وسيأخذ نقاطه آليّاً — لا تَعِده برقمٍ ولا تمنح شيئاً بنفسك.`;
  } catch { return null; }
}

// ══════════════════════════════════════════════════════
// المجدوِل: بدءٌ وإنهاءٌ وانتهاء مهلٍ ومسحٌ احتياطيّ
// ══════════════════════════════════════════════════════

let tickTimer: ReturnType<typeof setInterval> | null = null;

export async function tickRewardEvents(): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    // مجدولٌ حان وقته ⟵ يعمل. الشرطُ الأخير يحمي الفهرسَ الفريد «عرضٌ واحد يعمل»:
    // بدونه يرمي التحديثُ كلّه فلا يبدأ شيء ولا ينتهي شيء في هذه الدورة.
    const started = await db.execute(sql`
      UPDATE wa_reward_events SET status = 'running', updated_at = NOW()
       WHERE id = (
         SELECT id FROM wa_reward_events
          WHERE status = 'scheduled' AND starts_at <= NOW() AND ends_at > NOW()
          ORDER BY starts_at ASC LIMIT 1
       )
       AND NOT EXISTS (SELECT 1 FROM wa_reward_events WHERE status = 'running')
       RETURNING *`);
    for (const ev of rowsOf(started)) void announceEvent(ev).catch(() => {});

    // انتهى وقته ⟵ ينتهي
    const ended = await db.execute(sql`
      UPDATE wa_reward_events SET status = 'ended', ended_at = NOW(), updated_at = NOW()
       WHERE status IN ('running','paused','scheduled') AND ends_at <= NOW() RETURNING id`);
    const endedRows = rowsOf(ended);

    // مطالباتٌ مضت مهلتها
    await db.execute(sql`
      UPDATE wa_reward_claims SET state = 'expired'
       WHERE state IN ('counting','pending_link','pending_city') AND expires_at IS NOT NULL AND expires_at <= NOW()`);

    if (rowsOf(started).length || endedRows.length) {
      invalidateLiveEvent();
      await invalidateBotFacts();
    }
    for (const e of endedRows) void sweepReconcile(Number(e.id)).catch(() => {});

    // حارسٌ تشغيليّ: عرضٌ يعمل والإرسال مقفل ⟵ إيقافٌ تلقائيّ
    const live = await getLiveEvent();
    if (live) {
      const { sendingSuspendedReason } = await import('./whatsapp-inbox.service.js');
      const blocked = sendingSuspendedReason();
      if (blocked) {
        await setEventStatus(Number(live.id), 'paused', 'system');
        await alertOwner('🎁 أُوقف العرض تلقائيّاً', `إرسال واتساب مقفل (${blocked}) — «${live.name}» متوقّف حتّى يعود.`);
      }
    }
  } catch (e: any) {
    console.warn('⚠️ [wa-reward] tick:', e?.message || e);
  }
}

export function startRewardScheduler(): void {
  if (tickTimer) return;
  // عند الإقلاع: مسحٌ لما مُنح ولم يظهر (سقوطٌ بين الإدراج والمصالحة)
  setTimeout(() => { void sweepReconcile().catch(() => {}); }, 20_000);
  setTimeout(() => { void tickRewardEvents(); }, 5_000);
  tickTimer = setInterval(() => { void tickRewardEvents(); }, 60_000);
  // مسحٌ احتياطيّ كلّ ١٠ دقائق ما دام هناك عرضٌ نشط
  setInterval(() => { void (async () => { if (await getLiveEvent()) await sweepReconcile(); })().catch(() => {}); }, 10 * 60_000);
  console.log('🎁 WA reward scheduler started (every 60s)');
}

// ══════════════════════════════════════════════════════
// التقرير
// ══════════════════════════════════════════════════════

export async function getEventReport(eventId: number): Promise<any> {
  const db = getDB();
  if (!db) return null;
  const ev = await getEvent(eventId);
  if (!ev) return null;

  const st = await db.execute(sql`
    SELECT state, COUNT(*)::int AS n, COALESCE(SUM(amount),0)::int AS pts
      FROM wa_reward_claims WHERE event_id = ${eventId} GROUP BY state`);
  const byState: Record<string, { n: number; points: number }> = {};
  for (const r of rowsOf(st)) byState[r.state] = { n: Number(r.n), points: Number(r.pts) };

  const rj = await db.execute(sql`
    SELECT reject_code, COUNT(*)::int AS n FROM wa_reward_claims
     WHERE event_id = ${eventId} AND state = 'rejected' GROUP BY reject_code ORDER BY n DESC`);

  // الحسابات التي فُتحت أثناء العرض — الأثر الحقيقيّ + قائمة المراجعة اليدويّة
  const newAcc = await db.execute(sql`
    SELECT p.id, p.name, p.phone, p.created_at
      FROM players p
     WHERE p.deleted_at IS NULL AND p.created_at BETWEEN ${ev.starts_at} AND ${new Date(new Date(ev.ends_at).getTime() + Number(ev.grace_hours || 0) * 3600e3)}
     ORDER BY p.created_at DESC LIMIT 50`);

  // التحويل: من أخذ النقاط ثمّ حجز خلال ٤٨ ساعة
  const conv = await db.execute(sql`
    SELECT COUNT(DISTINCT c.player_id)::int AS n
      FROM wa_reward_claims c
      JOIN bookings b ON b.player_id = c.player_id AND b.deleted_at IS NULL
       AND b.created_at BETWEEN c.awarded_at AND c.awarded_at + INTERVAL '48 hours'
     WHERE c.event_id = ${eventId} AND c.state = 'awarded'`);

  // الكلفة الفعليّة للنماذج خلال نافذة العرض
  const cost = await db.execute(sql`
    SELECT COALESCE(SUM(prompt_tokens),0)::bigint AS prompt, COALESCE(SUM(output_tokens),0)::bigint AS output,
           COUNT(*)::int AS replies
      FROM wa_bot_usage WHERE source = 'live' AND created_at BETWEEN ${ev.starts_at} AND ${ev.ended_at || ev.ends_at}`);

  const top = await db.execute(sql`
    SELECT c.player_id, c.amount, c.awarded_at, c.city_id, p.name, c.phone
      FROM wa_reward_claims c LEFT JOIN players p ON p.id = c.player_id
     WHERE c.event_id = ${eventId} AND c.state = 'awarded' ORDER BY c.awarded_at DESC LIMIT 50`);

  return {
    event: ev,
    byState,
    rejects: rowsOf(rj).map((r: any) => ({ code: r.reject_code, n: Number(r.n) })),
    newAccounts: rowsOf(newAcc),
    bookedWithin48h: Number(rowsOf(conv)[0]?.n || 0),
    aiUsage: rowsOf(cost)[0] || null,
    awarded: rowsOf(top),
  };
}

/** سحبُ مكافأةٍ مُنحت خطأً: حذفٌ من الدفتر ثمّ مصالحة (كما في activity-bonus) */
export async function revokeAward(eventId: number, playerId: number): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };
  const ev = await getEvent(eventId);
  if (!ev) return { ok: false, error: 'العرض غير موجود' };
  if (ev.kind === 'CHIPS') {
    return { ok: false, error: 'دفتر التشبس لا يُحذف منه — استعمل الاسترجاع من شاشة التشبس' };
  }
  await db.execute(sql`DELETE FROM rank_bonuses WHERE player_id = ${playerId} AND reason = ${rewardReason(eventId)}`);
  await db.execute(sql`
    UPDATE wa_reward_claims SET state = 'rejected', reject_code = 'REVOKED'
     WHERE event_id = ${eventId} AND player_id = ${playerId}`);
  await db.execute(sql`
    UPDATE wa_reward_events SET awarded_count = GREATEST(0, awarded_count - 1),
           awarded_points = GREATEST(0, awarded_points - ${Number(ev.amount || 0)}) WHERE id = ${eventId}`);
  if (ev.season_id) {
    const { reconcileSeasonProgression } = await import('./reconcile.service.js');
    await reconcileSeasonProgression(Number(ev.season_id), true, () => {}, { onlyPlayerIds: [playerId] });
  }
  return { ok: true };
}
