// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — «ختم الدون» (خدمة)
//
// الختم: حجزٌ من التطبيق قبل الفعاليّة بـ minLeadHours على الأقلّ + مباراةٌ واحدة
// مكتملة. يُمنح من finalizeMatch حصراً (الخادم، لا موظّف)، بقيدٍ فريد
// (لاعب، فعاليّة). N أختام في الشهر = مكافأة يختارها اللاعب.
//
// المفتاح الرئيسيّ `enabled`: عند الإيقاف لا يُمنح ختم، ولا تُطبَّق مكافأة، ولا
// يُرسل إشعار، ولا يُبثّ احتفال، وكلّ مسارات اللاعب تعيد {enabled:false} فيُخفي
// العميل كلّ أثرٍ للميزة. المكافآت المفتوحة تُجمَّد (تُمدَّد آجالها بمدّة الإيقاف).
// ══════════════════════════════════════════════════════

import { sql, eq, and, isNull, inArray, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { activities, bookings, locations } from '../schemas/admin.schema.js';
import { loyaltyConfig, loyaltyStamps, loyaltyRewards, type LoyaltyRewardKind } from '../schemas/loyalty.schema.js';
import { playerNotifications } from '../schemas/notification.schema.js';

function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }
const JO_OFFSET_MS = 3 * 3600e3;   // الأردن UTC+3 ثابت

// ══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ══════════════════════════════════════════════════════

export interface LoyaltyConfig {
  enabled: boolean;
  /** فارغة = كلّ الأماكن غير الاختباريّة */
  locationIds: number[];
  stampsPerReward: number;
  minLeadHours: number;
  /** 'app' = حجز التطبيق فقط · 'any' = أيّ حجزٍ مرتبطٍ بحساب اللاعب (واتساب مثبَّت أيضاً) */
  channel: 'app' | 'any';
  maxRewardsPerMonth: number;
  rewardValidityDays: number;
  chooseWindowDays: number;
  rewards: {
    freeVisit: { enabled: boolean };
    freeDrink: { enabled: boolean; capJod: number; categories: string[] };
    chips: { enabled: boolean; amount: number };
  };
  excludeTestAccounts: boolean;
  celebration: { enabled: boolean; durationMs: number };
  reminders: {
    preCutoff: { enabled: boolean; hourLocal: number };
    missed: { enabled: boolean };
    monthly: { enabled: boolean };
    expiring: { enabled: boolean; daysBefore: number };
  };
  /** متى فُعِّل أوّل مرّة (للعرض) */
  startedAt: string | null;
  /** متى أُوقف آخر مرّة — لتمديد آجال المكافآت عند إعادة التشغيل */
  disabledAt: string | null;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: false,
  locationIds: [],
  stampsPerReward: 5,
  minLeadHours: 6,
  channel: 'app',
  maxRewardsPerMonth: 3,
  rewardValidityDays: 45,
  chooseWindowDays: 3,
  rewards: {
    freeVisit: { enabled: true },
    freeDrink: { enabled: true, capJod: 3, categories: ['ساخنة', 'قهوة باردة', 'عصائر ومخفوقات', 'مشروبات', 'باردة'] },
    chips: { enabled: true, amount: 40 },
  },
  excludeTestAccounts: true,
  celebration: { enabled: true, durationMs: 8000 },
  reminders: {
    preCutoff: { enabled: true, hourLocal: 10 },
    missed: { enabled: true },
    monthly: { enabled: true },
    expiring: { enabled: true, daysBefore: 3 },
  },
  startedAt: null,
  disabledAt: null,
};

let cfgCache: { v: LoyaltyConfig; at: number } | null = null;
const CFG_TTL = 30_000;
export function invalidateLoyaltyConfig() { cfgCache = null; }

function mergeCfg(v: any): LoyaltyConfig {
  const d = DEFAULT_LOYALTY_CONFIG;
  return {
    ...d, ...(v || {}),
    locationIds: Array.isArray(v?.locationIds) ? v.locationIds.map(Number).filter(Number.isFinite) : d.locationIds,
    rewards: {
      freeVisit: { ...d.rewards.freeVisit, ...(v?.rewards?.freeVisit || {}) },
      freeDrink: { ...d.rewards.freeDrink, ...(v?.rewards?.freeDrink || {}), categories: Array.isArray(v?.rewards?.freeDrink?.categories) ? v.rewards.freeDrink.categories : d.rewards.freeDrink.categories },
      chips: { ...d.rewards.chips, ...(v?.rewards?.chips || {}) },
    },
    celebration: { ...d.celebration, ...(v?.celebration || {}) },
    reminders: {
      preCutoff: { ...d.reminders.preCutoff, ...(v?.reminders?.preCutoff || {}) },
      missed: { ...d.reminders.missed, ...(v?.reminders?.missed || {}) },
      monthly: { ...d.reminders.monthly, ...(v?.reminders?.monthly || {}) },
      expiring: { ...d.reminders.expiring, ...(v?.reminders?.expiring || {}) },
    },
  };
}

export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL) return cfgCache.v;
  const db = getDB();
  if (!db) return DEFAULT_LOYALTY_CONFIG;
  try {
    const [row] = await db.select().from(loyaltyConfig).where(eq(loyaltyConfig.key, 'loyalty')).limit(1);
    const v = mergeCfg(row?.value);
    cfgCache = { v, at: Date.now() };
    return v;
  } catch { return DEFAULT_LOYALTY_CONFIG; }
}

const clampInt = (v: any, lo: number, hi: number, dflt: number) => {
  const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const clampNum = (v: any, lo: number, hi: number, dflt: number) => {
  const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 100) / 100)) : dflt;
};

/** حفظ الإعدادات (دمجٌ جزئيّ + تحقّق). الإيقاف/التشغيل يُدير تجميد آجال المكافآت. */
export async function saveLoyaltyConfig(patch: any): Promise<LoyaltyConfig> {
  const db = getDB();
  if (!db) return DEFAULT_LOYALTY_CONFIG;
  const cur = await getLoyaltyConfig();
  const p = patch || {};
  const next: LoyaltyConfig = {
    enabled: p.enabled != null ? !!p.enabled : cur.enabled,
    locationIds: Array.isArray(p.locationIds) ? p.locationIds.map(Number).filter(Number.isFinite) : cur.locationIds,
    stampsPerReward: p.stampsPerReward != null ? clampInt(p.stampsPerReward, 1, 30, cur.stampsPerReward) : cur.stampsPerReward,
    minLeadHours: p.minLeadHours != null ? clampNum(p.minLeadHours, 0, 168, cur.minLeadHours) : cur.minLeadHours,
    channel: p.channel === 'any' || p.channel === 'app' ? p.channel : cur.channel,
    maxRewardsPerMonth: p.maxRewardsPerMonth != null ? clampInt(p.maxRewardsPerMonth, 1, 20, cur.maxRewardsPerMonth) : cur.maxRewardsPerMonth,
    rewardValidityDays: p.rewardValidityDays != null ? clampInt(p.rewardValidityDays, 1, 365, cur.rewardValidityDays) : cur.rewardValidityDays,
    chooseWindowDays: p.chooseWindowDays != null ? clampInt(p.chooseWindowDays, 1, 60, cur.chooseWindowDays) : cur.chooseWindowDays,
    rewards: {
      freeVisit: { enabled: p.rewards?.freeVisit?.enabled != null ? !!p.rewards.freeVisit.enabled : cur.rewards.freeVisit.enabled },
      freeDrink: {
        enabled: p.rewards?.freeDrink?.enabled != null ? !!p.rewards.freeDrink.enabled : cur.rewards.freeDrink.enabled,
        capJod: p.rewards?.freeDrink?.capJod != null ? clampNum(p.rewards.freeDrink.capJod, 0, 50, cur.rewards.freeDrink.capJod) : cur.rewards.freeDrink.capJod,
        categories: Array.isArray(p.rewards?.freeDrink?.categories) ? p.rewards.freeDrink.categories.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 30) : cur.rewards.freeDrink.categories,
      },
      chips: {
        enabled: p.rewards?.chips?.enabled != null ? !!p.rewards.chips.enabled : cur.rewards.chips.enabled,
        amount: p.rewards?.chips?.amount != null ? clampInt(p.rewards.chips.amount, 1, 1000, cur.rewards.chips.amount) : cur.rewards.chips.amount,
      },
    },
    excludeTestAccounts: p.excludeTestAccounts != null ? !!p.excludeTestAccounts : cur.excludeTestAccounts,
    celebration: {
      enabled: p.celebration?.enabled != null ? !!p.celebration.enabled : cur.celebration.enabled,
      durationMs: p.celebration?.durationMs != null ? clampInt(p.celebration.durationMs, 3000, 30000, cur.celebration.durationMs) : cur.celebration.durationMs,
    },
    reminders: {
      preCutoff: {
        enabled: p.reminders?.preCutoff?.enabled != null ? !!p.reminders.preCutoff.enabled : cur.reminders.preCutoff.enabled,
        hourLocal: p.reminders?.preCutoff?.hourLocal != null ? clampInt(p.reminders.preCutoff.hourLocal, 6, 18, cur.reminders.preCutoff.hourLocal) : cur.reminders.preCutoff.hourLocal,
      },
      missed: { enabled: p.reminders?.missed?.enabled != null ? !!p.reminders.missed.enabled : cur.reminders.missed.enabled },
      monthly: { enabled: p.reminders?.monthly?.enabled != null ? !!p.reminders.monthly.enabled : cur.reminders.monthly.enabled },
      expiring: {
        enabled: p.reminders?.expiring?.enabled != null ? !!p.reminders.expiring.enabled : cur.reminders.expiring.enabled,
        daysBefore: p.reminders?.expiring?.daysBefore != null ? clampInt(p.reminders.expiring.daysBefore, 1, 14, cur.reminders.expiring.daysBefore) : cur.reminders.expiring.daysBefore,
      },
    },
    startedAt: cur.startedAt,
    disabledAt: cur.disabledAt,
  };
  if (!next.rewards.freeVisit.enabled && !next.rewards.freeDrink.enabled && !next.rewards.chips.enabled) {
    throw new Error('يجب تفعيل نوع مكافأة واحد على الأقلّ');
  }

  const now = new Date();
  if (next.enabled && !cur.enabled) {
    if (!next.startedAt) next.startedAt = now.toISOString();
    // ❄️ إعادة التشغيل: تمديد آجال المكافآت المفتوحة بمدّة الإيقاف كي لا تنتهي في غياب الميزة
    if (cur.disabledAt) {
      const off = Math.max(0, now.getTime() - new Date(cur.disabledAt).getTime());
      if (off > 60_000) {
        await db.execute(sql`
          UPDATE loyalty_rewards
             SET expires_at = expires_at + (${Math.round(off / 1000)} || ' seconds')::interval,
                 choose_by  = CASE WHEN choose_by IS NULL THEN NULL ELSE choose_by + (${Math.round(off / 1000)} || ' seconds')::interval END
           WHERE status IN ('pending_choice','available')
        `);
      }
    }
    next.disabledAt = null;
  } else if (!next.enabled && cur.enabled) {
    next.disabledAt = now.toISOString();
  }

  await db.execute(sql`
    INSERT INTO loyalty_config (key, value, updated_at)
    VALUES ('loyalty', ${JSON.stringify(next)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
  invalidateLoyaltyConfig();
  return next;
}

// ══════════════════════════════════════════════════════
// 🗓️ الفترات والتوقيت
// ══════════════════════════════════════════════════════

/** 'YYYY-MM' بتوقيت الأردن */
export function periodOf(d: Date): string {
  const j = new Date(d.getTime() + JO_OFFSET_MS);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function currentPeriod(): string { return periodOf(new Date()); }
export function previousPeriod(p = currentPeriod()): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** حدود الفترة بتوقيت UTC (لمقارنة activities.date المخزَّن UTC) */
export function periodBounds(p: string): { from: Date; to: Date } {
  const [y, m] = p.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - JO_OFFSET_MS), to: new Date(Date.UTC(y, m, 1) - JO_OFFSET_MS) };
}
export function cutoffFor(cfg: LoyaltyConfig, activityDate: Date | string): Date {
  return new Date(new Date(activityDate).getTime() - cfg.minLeadHours * 3600e3);
}
const jordanNow = () => new Date(Date.now() + JO_OFFSET_MS);

export function isLocationEnabled(cfg: LoyaltyConfig, locationId: number | null | undefined): boolean {
  if (!locationId) return false;
  if (!cfg.locationIds.length) return true;
  return cfg.locationIds.includes(Number(locationId));
}

// ══════════════════════════════════════════════════════
// 🔔 إشعارات (بمنع تكرار على مفتاح)
// ══════════════════════════════════════════════════════

async function alreadyNotified(playerId: number, type: string, key: string): Promise<boolean> {
  const db = getDB(); if (!db) return true;
  const r: any = await db.execute(sql`
    SELECT 1 FROM player_notifications WHERE player_id = ${playerId} AND type = ${type} AND data->>'key' = ${key} LIMIT 1
  `);
  return rowsOf(r).length > 0;
}

async function notify(playerId: number, type: string, title: string, body: string, key: string, extra: Record<string, any> = {}) {
  try {
    if (await alreadyNotified(playerId, type, key)) return false;
    const { sendPushToPlayer } = await import('./fcm.service.js');
    await sendPushToPlayer(playerId, title, body, type, { key, url: '/player/loyalty', tag: 'loyalty', ...extra });
    return true;
  } catch (e: any) { console.warn('⚠️ loyalty notify:', e?.message); return false; }
}

// ══════════════════════════════════════════════════════
// 🧮 تقييم الزيارة
// ══════════════════════════════════════════════════════

export type VisitVerdict = 'stamped' | 'late' | 'channel' | 'no_booking' | 'voided' | 'no_show' | 'location' | 'test';

interface BookingLead { bookingId: number; createdAt: Date; createdBy: string; leadHours: number; isApp: boolean }

/** حجز اللاعب في فعاليّة (غير محذوف) بحسابه أو هاتفه — الأقدم إنشاءً */
export async function bookingFor(activityId: number, playerId: number, phone?: string | null): Promise<BookingLead | null> {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`
    SELECT b.id, b.created_at, b.created_by, a.date
      FROM bookings b JOIN activities a ON a.id = b.activity_id
     WHERE b.activity_id = ${activityId} AND b.deleted_at IS NULL
       AND (b.player_id = ${playerId} ${phone ? sql`OR b.phone = ${phone}` : sql``})
     ORDER BY (b.created_by = 'player-app') DESC, b.created_at ASC LIMIT 1
  `);
  const row = rowsOf(r)[0];
  if (!row) return null;
  const lead = (new Date(row.date).getTime() - new Date(row.created_at).getTime()) / 3600e3;
  return { bookingId: Number(row.id), createdAt: new Date(row.created_at), createdBy: String(row.created_by || ''), leadHours: Math.round(lead * 10) / 10, isApp: row.created_by === 'player-app' };
}

export function judgeBooking(cfg: LoyaltyConfig, bk: BookingLead | null): { ok: boolean; verdict: VisitVerdict; leadHours: number | null } {
  if (!bk) return { ok: false, verdict: 'no_booking', leadHours: null };
  if (cfg.channel === 'app' && !bk.isApp) return { ok: false, verdict: 'channel', leadHours: bk.leadHours };
  if (bk.leadHours < cfg.minLeadHours) return { ok: false, verdict: 'late', leadHours: bk.leadHours };
  return { ok: true, verdict: 'stamped', leadHours: bk.leadHours };
}

// ══════════════════════════════════════════════════════
// ✦ منح الأختام (من finalizeMatch)
// ══════════════════════════════════════════════════════

export async function grantStampsForMatch(opts: {
  matchId: number; activityId: number | null | undefined; locationId: number | null | undefined;
  isTestMatch: boolean;
  players: { playerId: number | null | undefined; name?: string }[];
}): Promise<{ stamped: number[]; rewards: number[] }> {
  const out = { stamped: [] as number[], rewards: [] as number[] };
  const db = getDB(); if (!db) return out;
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled || opts.isTestMatch || !opts.activityId) return out;

  const [act] = await db.select({ id: activities.id, name: activities.name, date: activities.date, locationId: activities.locationId, basePrice: activities.basePrice })
    .from(activities).where(eq(activities.id, opts.activityId)).limit(1);
  if (!act) return out;
  const locationId = act.locationId ?? opts.locationId ?? null;
  if (!isLocationEnabled(cfg, locationId)) return out;
  const period = periodOf(new Date(act.date));

  const ids = [...new Set(opts.players.map(p => Number(p.playerId)).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return out;
  const prow = await db.select({ id: players.id, name: players.name, phone: players.phone, isTest: players.isTestAccount })
    .from(players).where(inArray(players.id, ids));

  for (const p of prow) {
    try {
      if (cfg.excludeTestAccounts && p.isTest) continue;
      // ختمٌ سابق لهذه الفعاليّة؟ (مباراة ثانية في الليلة نفسها)
      const ex: any = await db.execute(sql`SELECT 1 FROM loyalty_stamps WHERE player_id = ${p.id} AND activity_id = ${act.id} LIMIT 1`);
      if (rowsOf(ex).length) continue;
      const bk = await bookingFor(act.id, p.id, p.phone);
      const j = judgeBooking(cfg, bk);
      if (!j.ok) {
        if (cfg.reminders.missed.enabled) {
          const why = j.verdict === 'late'
            ? `حجزت ${bk!.leadHours < 0 ? 'بعد بدء الفعاليّة' : `قبل ${fmtH(bk!.leadHours)} فقط`}`
            : j.verdict === 'channel' ? 'حجزك لم يكن من التطبيق' : 'لم تحجز من التطبيق';
          const cut = cutoffFor(cfg, act.date);
          void notify(p.id, 'loyalty_missed', 'زيارة بلا ختم', `لعبت في ${act.name} لكن ${why}. المرّة الجاية احجز قبل ${fmtTimeJo(cut)} لتكسب الختم.`, `missed:${act.id}`, { activityId: String(act.id) });
        }
        continue;
      }
      const ins: any = await db.execute(sql`
        INSERT INTO loyalty_stamps (player_id, activity_id, booking_id, location_id, period, lead_hours, match_id, source)
        VALUES (${p.id}, ${act.id}, ${bk!.bookingId}, ${locationId}, ${period}, ${j.leadHours}, ${opts.matchId}, 'auto')
        ON CONFLICT (player_id, activity_id) DO NOTHING RETURNING id
      `);
      if (!rowsOf(ins).length) continue;
      out.stamped.push(p.id);
      const count = await stampCount(p.id, period);
      const rewardId = await maybeCreateReward(cfg, p.id, period, count);
      if (rewardId) {
        out.rewards.push(rewardId);
        void notify(p.id, 'loyalty_reward', '🎁 اكتملت بطاقتك!', `${count} أختام ✦ في ${act.name} — اختر مكافأتك: ${rewardChoicesText(cfg)}.`, `reward:${rewardId}`, { rewardId: String(rewardId) });
      } else {
        const inCard = ((count - 1) % cfg.stampsPerReward) + 1;
        const left = cfg.stampsPerReward - inCard;
        void notify(p.id, 'loyalty_stamp', `ختمك ${ordinalAr(inCard)} ✦`, `حجزت قبل ${fmtH(j.leadHours!)} ولعبت في ${act.name}. ${left > 0 ? `بقي ${left === 1 ? 'ختم واحد' : `${left} أختام`} للمكافأة.` : ''}`, `stamp:${act.id}`, { activityId: String(act.id) });
      }
    } catch (e: any) { console.warn(`⚠️ loyalty stamp #${p.id}:`, e?.message); }
  }
  if (out.stamped.length) console.log(`🎟️ loyalty: ${out.stamped.length} stamp(s) for activity #${act.id}${out.rewards.length ? ` · ${out.rewards.length} card(s) completed` : ''}`);
  return out;
}

async function stampCount(playerId: number, period: string): Promise<number> {
  const db = getDB(); if (!db) return 0;
  const r: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM loyalty_stamps WHERE player_id = ${playerId} AND period = ${period} AND voided_at IS NULL`);
  return Number(rowsOf(r)[0]?.n || 0);
}

/** عند بلوغ مضاعفٍ لـ N وضمن الحدّ الشهريّ: مكافأة بانتظار الاختيار (أو مختارة تلقائيّاً إن كان نوعٌ واحد مفعَّلاً) */
async function maybeCreateReward(cfg: LoyaltyConfig, playerId: number, period: string, count: number): Promise<number | null> {
  const db = getDB(); if (!db) return null;
  if (count <= 0 || count % cfg.stampsPerReward !== 0) return null;
  const seq = count / cfg.stampsPerReward;
  if (seq > cfg.maxRewardsPerMonth) return null;
  const now = new Date();
  const ins: any = await db.execute(sql`
    INSERT INTO loyalty_rewards (player_id, period, seq, status, earned_at, choose_by, expires_at)
    VALUES (${playerId}, ${period}, ${seq}, 'pending_choice', NOW(),
            ${new Date(now.getTime() + cfg.chooseWindowDays * 86400e3)}, ${new Date(now.getTime() + cfg.rewardValidityDays * 86400e3)})
    ON CONFLICT (player_id, period, seq) DO NOTHING RETURNING id
  `);
  const id = rowsOf(ins)[0]?.id; if (!id) return null;
  const kinds = enabledKinds(cfg);
  if (kinds.length === 1) await chooseReward(playerId, Number(id), kinds[0], { auto: true });
  return Number(id);
}

export function enabledKinds(cfg: LoyaltyConfig, opts?: { isFreeAccount?: boolean }): LoyaltyRewardKind[] {
  const k: LoyaltyRewardKind[] = [];
  if (cfg.rewards.freeVisit.enabled && !opts?.isFreeAccount) k.push('free_visit');
  if (cfg.rewards.freeDrink.enabled) k.push('free_drink');
  if (cfg.rewards.chips.enabled) k.push('chips');
  return k;
}
function rewardChoicesText(cfg: LoyaltyConfig): string {
  const t: string[] = [];
  if (cfg.rewards.freeVisit.enabled) t.push('زيارة مجّانيّة');
  if (cfg.rewards.freeDrink.enabled) t.push('مشروب مجّاني');
  if (cfg.rewards.chips.enabled) t.push(`${cfg.rewards.chips.amount} تشبس`);
  return t.join(' أو ');
}
const ORD = ['', 'الأوّل', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const ordinalAr = (n: number) => ORD[n] || `رقم ${n}`;
export function fmtH(h: number): string {
  if (h >= 48) return `${Math.round(h / 24)} أيّام`;
  if (h >= 24) return 'يوم';
  const whole = Math.floor(h); const m = Math.round((h - whole) * 60);
  if (whole <= 0) return `${m} دقيقة`;
  return m ? `${whole} س ${m} د` : `${whole} ساعات`;
}
export function fmtTimeJo(d: Date): string {
  const j = new Date(d.getTime() + JO_OFFSET_MS);
  let h = j.getUTCHours(); const m = j.getUTCMinutes(); const pm = h >= 12; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${pm ? 'مساءً' : 'صباحاً'}`;
}

// ══════════════════════════════════════════════════════
// 🎁 المكافآت — اختيار، تطبيق، تحرير
// ══════════════════════════════════════════════════════

export async function chooseReward(playerId: number, rewardId: number, kind: LoyaltyRewardKind, opts?: { auto?: boolean; staffId?: number }):
  Promise<{ ok: boolean; error?: string; reward?: any }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB' };
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled && !opts?.staffId) return { ok: false, error: 'الميزة متوقّفة' };
  const [rw] = await db.select().from(loyaltyRewards).where(and(eq(loyaltyRewards.id, rewardId), eq(loyaltyRewards.playerId, playerId))).limit(1);
  if (!rw) return { ok: false, error: 'المكافأة غير موجودة' };
  if (rw.status !== 'pending_choice') return { ok: false, error: 'اختيرت هذه المكافأة مسبقاً' };
  const [p] = await db.select({ isFree: players.isFreeAccount, name: players.name }).from(players).where(eq(players.id, playerId)).limit(1);
  const kinds = enabledKinds(cfg, { isFreeAccount: !!p?.isFree });
  if (!kinds.includes(kind)) return { ok: false, error: 'هذا الخيار غير متاح' };

  if (kind === 'chips') {
    const amount = cfg.rewards.chips.amount;
    const { applyChipsTx } = await import('./chips.service.js');
    const r = await applyChipsTx({
      playerId, amount, reason: 'reward_loyalty', idempotencyKey: `loyalty-reward:${rewardId}`,
      refType: 'manual', refId: `loyalty:${rw.period}:${rw.seq}`, staffId: opts?.staffId ?? null,
      note: `مكافأة بطاقة الولاء — ${rw.period} #${rw.seq}`,
      notify: { title: '🪙 مكافأة الولاء وصلت', body: `+${amount} تشبس من بطاقة ${rw.period} — افتح خزنة الدون` },
    });
    if (!r.ok && !r.duplicate) return { ok: false, error: r.message || 'تعذّر قيد التشبس' };
    await db.update(loyaltyRewards).set({
      kind, status: 'redeemed', value: { chips: amount }, redeemedAt: new Date(), redeemedRefType: 'ledger', redeemedRefId: r.ledgerId ?? null,
      note: opts?.auto ? 'اختيار تلقائيّ (انتهت مهلة الاختيار)' : null,
    } as any).where(eq(loyaltyRewards.id, rewardId));
  } else {
    await db.update(loyaltyRewards).set({
      kind, status: 'available',
      value: kind === 'free_drink' ? { capJod: cfg.rewards.freeDrink.capJod } : {},
      note: opts?.auto ? 'اختيار تلقائيّ (انتهت مهلة الاختيار)' : null,
    } as any).where(eq(loyaltyRewards.id, rewardId));
  }
  const [after] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId)).limit(1);
  return { ok: true, reward: after };
}

/** مكافأة متاحة من نوعٍ معيّن (غير منتهية) — الأقدم أوّلاً */
export async function availableReward(playerId: number, kind: LoyaltyRewardKind) {
  const db = getDB(); if (!db) return null;
  const r: any = await db.execute(sql`
    SELECT * FROM loyalty_rewards WHERE player_id = ${playerId} AND kind = ${kind} AND status = 'available'
       AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY earned_at ASC LIMIT 1
  `);
  return rowsOf(r)[0] || null;
}

/** 🎟️ تطبيق زيارة مجّانيّة على حجزٍ للتوّ — يُستدعى من مسار الحجز بعد الإدراج */
export async function applyFreeVisit(playerId: number, bookingId: number, activity: { id: number; name: string; basePrice: string | null }):
  Promise<{ applied: boolean; rewardId?: number; jod?: number }> {
  const db = getDB(); if (!db) return { applied: false };
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled || !cfg.rewards.freeVisit.enabled) return { applied: false };
  const rw = await availableReward(playerId, 'free_visit');
  if (!rw) return { applied: false };
  const jod = parseFloat(activity.basePrice || '0') || 0;
  await db.transaction(async (tx) => {
    const upd: any = await tx.execute(sql`
      UPDATE loyalty_rewards SET status = 'redeemed', redeemed_at = NOW(), redeemed_ref_type = 'booking', redeemed_ref_id = ${bookingId},
             value = COALESCE(value, '{}'::jsonb) || ${JSON.stringify({ jod, activityId: activity.id, activityName: activity.name })}::jsonb
       WHERE id = ${rw.id} AND status = 'available' RETURNING id
    `);
    if (!rowsOf(upd).length) throw new Error('reward taken');
    await tx.execute(sql`
      UPDATE bookings SET is_free = true, is_paid = true, paid_amount = '0', received_by = 'بطاقة الولاء',
             notes = CASE WHEN COALESCE(notes,'') = '' THEN ${`🎟️ زيارة مجّانيّة — بطاقة الولاء #${rw.id}`} ELSE notes || ' · ' || ${`🎟️ زيارة مجّانيّة — بطاقة الولاء #${rw.id}`} END,
             loyalty_reward_id = ${rw.id}
       WHERE id = ${bookingId}
    `);
  }).catch(() => { /* أخذها حجزٌ آخر في اللحظة نفسها */ });
  const [chk] = await db.select({ lr: bookings.loyaltyRewardId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (chk?.lr !== Number(rw.id)) return { applied: false };
  return { applied: true, rewardId: Number(rw.id), jod };
}

/** إلغاء الحجز يعيد المكافأة إلى «متاحة» */
export async function releaseFreeVisit(bookingId: number): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const [bk] = await db.select({ lr: bookings.loyaltyRewardId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!bk?.lr) return false;
  await db.execute(sql`
    UPDATE loyalty_rewards SET status = 'available', redeemed_at = NULL, redeemed_ref_type = NULL, redeemed_ref_id = NULL
     WHERE id = ${bk.lr} AND status = 'redeemed' AND redeemed_ref_type = 'booking' AND redeemed_ref_id = ${bookingId}
  `);
  await db.execute(sql`UPDATE bookings SET loyalty_reward_id = NULL, is_free = false, is_paid = false, received_by = '' WHERE id = ${bookingId} AND loyalty_reward_id = ${bk.lr}`);
  return true;
}

/**
 * ☕ خصم المشروب المجّانيّ لفاتورة (لاعب، مكان، فعاليّة) — حسابٌ بلا أثر جانبيّ.
 * الخصم = أغلى صنفٍ مؤهَّل في طلباته (غير الملغاة) حتى السقف.
 */
export async function drinkDiscountFor(db: any, playerId: number, locationId: number, activityId: number):
  Promise<{ discount: number; rewardId: number | null; itemName: string | null }> {
  const none = { discount: 0, rewardId: null, itemName: null };
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled || !cfg.rewards.freeDrink.enabled) return none;
  // فاتورةٌ سبق أن استُخدمت عليها مكافأة (محصَّلة) — تُعاد من لقطتها في المسار المنادي
  const rw = await availableReward(playerId, 'free_drink');
  if (!rw) return none;
  const cats = cfg.rewards.freeDrink.categories;
  if (!cats.length) return none;
  const r: any = await db.execute(sql`
    SELECT oi.name_snapshot AS name, oi.unit_price_snapshot::numeric AS price
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE o.player_id = ${playerId} AND o.location_id = ${locationId} AND o.activity_id = ${activityId} AND o.status <> 'cancelled'
       AND COALESCE(mi.is_bundle, false) = false
       AND (mi.category = ANY(${cats}::text[]) OR mc.name = ANY(${cats}::text[]))
     ORDER BY oi.unit_price_snapshot::numeric DESC LIMIT 1
  `);
  const row = rowsOf(r)[0];
  if (!row) return none;
  const cap = Number(rw.value?.capJod ?? cfg.rewards.freeDrink.capJod) || 0;
  const discount = Math.min(Number(row.price) || 0, cap);
  if (discount <= 0) return none;
  return { discount: Math.round(discount * 100) / 100, rewardId: Number(rw.id), itemName: String(row.name) };
}

/** عند تحصيل الفاتورة: تثبيت استخدام مكافأة المشروب */
export async function redeemDrinkOnInvoice(rewardId: number, invoiceId: number, amount: number, itemName: string | null, staffId?: number | null): Promise<boolean> {
  const db = getDB(); if (!db) return false;
  const r: any = await db.execute(sql`
    UPDATE loyalty_rewards SET status = 'redeemed', redeemed_at = NOW(), redeemed_ref_type = 'invoice', redeemed_ref_id = ${invoiceId},
           redeemed_by = ${staffId ?? null}, value = COALESCE(value, '{}'::jsonb) || ${JSON.stringify({ jod: amount, menuItemName: itemName })}::jsonb
     WHERE id = ${rewardId} AND status = 'available' RETURNING id
  `);
  return rowsOf(r).length > 0;
}

// ══════════════════════════════════════════════════════
// 📱 حمولة اللاعب
// ══════════════════════════════════════════════════════

export interface VisitRow {
  activityId: number; activityName: string; date: Date; locationName: string | null;
  played: boolean; verdict: VisitVerdict; leadHours: number | null; bookingCreatedBy: string | null; stampNo: number | null; stampId: number | null;
}

/** زيارات الفترة: كلّ فعاليّة لعب فيها اللاعب أو حجز فيها (بالمكان المفعَّل) مع حكم كلّ زيارة */
export async function visitsInPeriod(playerId: number, period: string, cfg?: LoyaltyConfig): Promise<VisitRow[]> {
  const db = getDB(); if (!db) return [];
  cfg = cfg || await getLoyaltyConfig();
  const { from, to } = periodBounds(period);
  const [p] = await db.select({ phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
  const phone = p?.phone || null;
  const r: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
       WHERE mp.player_id = ${playerId} AND m.deleted_at IS NULL AND s.activity_id IS NOT NULL
    ), booked AS (
      SELECT DISTINCT ON (b.activity_id) b.activity_id, b.created_at, b.created_by
        FROM bookings b WHERE b.deleted_at IS NULL AND (b.player_id = ${playerId} ${phone ? sql`OR b.phone = ${phone}` : sql``})
       ORDER BY b.activity_id, (b.created_by = 'player-app') DESC, b.created_at ASC
    )
    SELECT a.id, a.name, a.date, a.location_id, l.name AS location_name, l.is_test_location,
           (pl.activity_id IS NOT NULL) AS played, bk.created_at AS booked_at, bk.created_by,
           st.id AS stamp_id, st.voided_at, st.lead_hours AS stamp_lead
      FROM activities a
      LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN played pl ON pl.activity_id = a.id
      LEFT JOIN booked bk ON bk.activity_id = a.id
      LEFT JOIN loyalty_stamps st ON st.player_id = ${playerId} AND st.activity_id = a.id
     WHERE a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to}
       AND (pl.activity_id IS NOT NULL OR bk.activity_id IS NOT NULL OR st.id IS NOT NULL)
     ORDER BY a.date DESC
  `);
  const rows = rowsOf(r);
  const out: VisitRow[] = [];
  for (const row of rows) {
    const date = new Date(row.date);
    const played = !!row.played;
    const lead = row.booked_at ? Math.round(((date.getTime() - new Date(row.booked_at).getTime()) / 3600e3) * 10) / 10 : null;
    let verdict: VisitVerdict;
    if (row.stamp_id && !row.voided_at) verdict = 'stamped';
    else if (row.stamp_id && row.voided_at) verdict = 'voided';
    else if (!isLocationEnabled(cfg, row.location_id) || row.is_test_location) verdict = 'location';
    else if (!played) verdict = date.getTime() < Date.now() ? 'no_show' : 'no_booking';
    else if (!row.booked_at) verdict = 'no_booking';
    else if (cfg.channel === 'app' && row.created_by !== 'player-app') verdict = 'channel';
    else if (lead !== null && lead < cfg.minLeadHours) verdict = 'late';
    else verdict = 'no_booking';
    out.push({ activityId: Number(row.id), activityName: String(row.name), date, locationName: row.location_name || null, played, verdict, leadHours: lead, bookingCreatedBy: row.created_by || null, stampNo: null, stampId: row.stamp_id ? Number(row.stamp_id) : null });
  }
  // ترقيم الأختام تصاعديّاً بتاريخ الفعاليّة
  let n = 0;
  for (const v of [...out].reverse()) if (v.verdict === 'stamped') v.stampNo = ++n;
  return out;
}

export async function getMyLoyalty(playerId: number) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return { enabled: false };
  const db = getDB(); if (!db) return { enabled: false };
  const period = currentPeriod();
  const [p] = await db.select({ isFree: players.isFreeAccount, isTest: players.isTestAccount }).from(players).where(eq(players.id, playerId)).limit(1);
  if (cfg.excludeTestAccounts && p?.isTest) return { enabled: false };
  const count = await stampCount(playerId, period);
  const visits = await visitsInPeriod(playerId, period, cfg);
  const rewardsRows: any = await db.execute(sql`
    SELECT * FROM loyalty_rewards WHERE player_id = ${playerId} AND status IN ('pending_choice','available','redeemed','expired')
     ORDER BY earned_at DESC LIMIT 12
  `);
  const rewards = rowsOf(rewardsRows).map(mapReward);
  const rewardsThisPeriod = rewards.filter(r => r.period === period && r.status !== 'void').length;
  const capReached = rewardsThisPeriod >= cfg.maxRewardsPerMonth;
  const inCard = count === 0 ? 0 : ((count - 1) % cfg.stampsPerReward) + 1;
  return {
    enabled: true,
    period,
    config: {
      stampsPerReward: cfg.stampsPerReward, minLeadHours: cfg.minLeadHours, maxRewardsPerMonth: cfg.maxRewardsPerMonth,
      rewardValidityDays: cfg.rewardValidityDays, chooseWindowDays: cfg.chooseWindowDays,
      kinds: enabledKinds(cfg, { isFreeAccount: !!p?.isFree }),
      chipsAmount: cfg.rewards.chips.amount, drinkCapJod: cfg.rewards.freeDrink.capJod, channel: cfg.channel,
    },
    card: {
      stamps: count,
      inCard: capReached ? cfg.stampsPerReward : inCard,   // بعد بلوغ الحدّ تبقى البطاقة ممتلئة
      needed: capReached ? 0 : cfg.stampsPerReward - inCard,
      cardsCompleted: Math.floor(count / cfg.stampsPerReward),
      capReached,
    },
    visits,
    rewards,
    pendingChoice: rewards.find(r => r.status === 'pending_choice') || null,
    available: rewards.filter(r => r.status === 'available'),
  };
}

export function mapReward(r: any) {
  return {
    id: Number(r.id), playerId: Number(r.player_id ?? r.playerId), period: String(r.period), seq: Number(r.seq), kind: r.kind || null, status: String(r.status),
    value: r.value || {}, earnedAt: r.earned_at ?? r.earnedAt, chooseBy: r.choose_by ?? r.chooseBy ?? null, expiresAt: r.expires_at ?? r.expiresAt ?? null,
    redeemedAt: r.redeemed_at ?? r.redeemedAt ?? null, redeemedRefType: r.redeemed_ref_type ?? r.redeemedRefType ?? null, redeemedRefId: r.redeemed_ref_id ?? r.redeemedRefId ?? null,
    celebratedAt: r.celebrated_at ?? r.celebratedAt ?? null, note: r.note || null, voidReason: r.void_reason ?? r.voidReason ?? null,
  };
}

/** للتعليق على قائمة الفعاليّات القادمة: ساعة القطع وهل الحجز الآن يُحتسب */
export async function activityHints(): Promise<{ enabled: boolean; cfg?: LoyaltyConfig }> {
  const cfg = await getLoyaltyConfig();
  return cfg.enabled ? { enabled: true, cfg } : { enabled: false };
}

/** ملخّص سريع للحجز الذي تمّ للتوّ */
export async function bookingOutcome(playerId: number, activity: { id: number; date: Date; locationId: number | null }, bookingCreatedAt: Date) {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled || !isLocationEnabled(cfg, activity.locationId)) return null;
  const lead = Math.round(((new Date(activity.date).getTime() - bookingCreatedAt.getTime()) / 3600e3) * 10) / 10;
  return { qualifies: lead >= cfg.minLeadHours, leadHours: lead, cutoffAt: cutoffFor(cfg, activity.date).toISOString(), minLeadHours: cfg.minLeadHours };
}

// ══════════════════════════════════════════════════════
// 🎭 احتفال شاشة القاعة عند دخول صاحب بطاقة مكتملة
// ══════════════════════════════════════════════════════

export async function celebrateOnJoin(io: any, roomId: string, player: { playerId: number; physicalId: number; name: string; avatarUrl?: string | null }, locationId?: number | null) {
  try {
    const cfg = await getLoyaltyConfig();
    if (!cfg.enabled || !cfg.celebration.enabled) return false;
    if (locationId && !isLocationEnabled(cfg, locationId)) return false;
    const db = getDB(); if (!db) return false;
    const r: any = await db.execute(sql`
      UPDATE loyalty_rewards SET celebrated_at = NOW()
       WHERE id = (SELECT id FROM loyalty_rewards WHERE player_id = ${player.playerId} AND celebrated_at IS NULL AND status <> 'void'
                     AND earned_at > NOW() - INTERVAL '60 days' ORDER BY earned_at ASC LIMIT 1)
       RETURNING id, period, seq, kind
    `);
    const rw = rowsOf(r)[0];
    if (!rw) return false;
    const { emitTrustedOnly } = await import('../sockets/broadcast.util.js');
    await emitTrustedOnly(io, roomId, 'display:loyalty-celebration', {
      playerId: player.playerId, physicalId: player.physicalId, name: player.name, avatarUrl: player.avatarUrl || null,
      stamps: cfg.stampsPerReward, period: rw.period, seq: Number(rw.seq), kind: rw.kind || null, durationMs: cfg.celebration.durationMs,
    });
    console.log(`🎟️ loyalty celebration → ${player.name} (#${player.physicalId}) room ${roomId}`);
    return true;
  } catch (e: any) { console.warn('⚠️ loyalty celebration:', e?.message); return false; }
}

// ══════════════════════════════════════════════════════
// 🛠️ الإدارة
// ══════════════════════════════════════════════════════

function locFilter(cfg: LoyaltyConfig, locationId?: number | null) {
  if (locationId) return sql`AND a.location_id = ${locationId}`;
  if (cfg.locationIds.length) return sql`AND a.location_id = ANY(${cfg.locationIds}::int[])`;
  return sql`AND COALESCE(l.is_test_location, false) = false`;
}

export async function adminOverview(period: string, locationId?: number | null) {
  const db = getDB(); if (!db) return null;
  const cfg = await getLoyaltyConfig();
  const { from, to } = periodBounds(period);
  const lf = locFilter(cfg, locationId);
  const testF = cfg.excludeTestAccounts ? sql`AND COALESCE(p.is_test_account,false) = false` : sql``;
  const perAct: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id, mp.player_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
       WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL
    )
    SELECT a.id, a.name, a.date, l.name AS location_name,
           COUNT(DISTINCT pl.player_id)::int AS visits,
           COUNT(DISTINCT st.player_id) FILTER (WHERE st.voided_at IS NULL)::int AS stamps
      FROM activities a LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN played pl ON pl.activity_id = a.id
      LEFT JOIN players p ON p.id = pl.player_id
      LEFT JOIN loyalty_stamps st ON st.activity_id = a.id
     WHERE a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to} ${lf} ${testF}
     GROUP BY a.id, a.name, a.date, l.name ORDER BY a.date
  `);
  const acts = rowsOf(perAct).map((r: any) => ({ activityId: Number(r.id), name: r.name, date: r.date, locationName: r.location_name, visits: Number(r.visits), stamps: Number(r.stamps) }));
  const tot: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id, mp.player_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
        JOIN activities a ON a.id = s.activity_id LEFT JOIN locations l ON l.id = a.location_id JOIN players p ON p.id = mp.player_id
       WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to} ${lf} ${testF}
    )
    SELECT (SELECT COUNT(*)::int FROM played) AS visits,
           (SELECT COUNT(DISTINCT player_id)::int FROM played) AS players,
           (SELECT COUNT(*)::int FROM loyalty_stamps st WHERE st.period = ${period} AND st.voided_at IS NULL) AS stamps,
           (SELECT COUNT(DISTINCT st.player_id)::int FROM loyalty_stamps st WHERE st.period = ${period} AND st.voided_at IS NULL) AS stamped_players,
           (SELECT COUNT(*)::int FROM loyalty_stamps st WHERE st.period = ${period} AND st.voided_at IS NULL AND st.source = 'manual') AS manual_stamps
  `);
  const t = rowsOf(tot)[0] || {};
  const rw: any = await db.execute(sql`
    SELECT status, kind, COUNT(*)::int AS n,
           COALESCE(SUM(CASE WHEN kind IN ('free_visit','free_drink') THEN (value->>'jod')::numeric ELSE 0 END), 0) AS jod,
           COALESCE(SUM(CASE WHEN kind = 'chips' THEN (value->>'chips')::int ELSE 0 END), 0)::int AS chips
      FROM loyalty_rewards WHERE period = ${period} GROUP BY status, kind
  `);
  const rewardRows = rowsOf(rw).map((r: any) => ({ status: r.status, kind: r.kind, n: Number(r.n), jod: Number(r.jod), chips: Number(r.chips) }));
  const top: any = await db.execute(sql`
    SELECT p.id, p.name, p.avatar_url, COUNT(*)::int AS stamps,
           (SELECT COUNT(*)::int FROM loyalty_rewards r WHERE r.player_id = p.id AND r.period = ${period} AND r.status <> 'void') AS rewards
      FROM loyalty_stamps st JOIN players p ON p.id = st.player_id
     WHERE st.period = ${period} AND st.voided_at IS NULL GROUP BY p.id ORDER BY stamps DESC, p.id LIMIT 8
  `);
  const frequentNoStamp: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id, mp.player_id FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
        JOIN activities a ON a.id = s.activity_id LEFT JOIN locations l ON l.id = a.location_id
       WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to} ${lf}
    )
    SELECT p.id, p.name, p.avatar_url, COUNT(*)::int AS visits FROM played pl JOIN players p ON p.id = pl.player_id
     WHERE NOT EXISTS (SELECT 1 FROM loyalty_stamps st WHERE st.player_id = p.id AND st.period = ${period} AND st.voided_at IS NULL) ${testF}
     GROUP BY p.id HAVING COUNT(*) >= 3 ORDER BY visits DESC LIMIT 8
  `);
  const visits = Number(t.visits || 0); const stamps = Number(t.stamps || 0);
  return {
    period, config: { enabled: cfg.enabled, stampsPerReward: cfg.stampsPerReward, minLeadHours: cfg.minLeadHours, maxRewardsPerMonth: cfg.maxRewardsPerMonth, startedAt: cfg.startedAt },
    totals: { visits, players: Number(t.players || 0), stamps, stampedPlayers: Number(t.stamped_players || 0), manualStamps: Number(t.manual_stamps || 0), earlyRate: visits ? Math.round((stamps / visits) * 1000) / 10 : 0 },
    rewards: rewardRows,
    rewardTotals: {
      completed: rewardRows.filter(r => r.status !== 'void').reduce((s, r) => s + r.n, 0),
      redeemedJod: rewardRows.filter(r => r.status === 'redeemed').reduce((s, r) => s + r.jod, 0),
      redeemedChips: rewardRows.filter(r => r.status === 'redeemed').reduce((s, r) => s + r.chips, 0),
      pending: rewardRows.filter(r => r.status === 'pending_choice').reduce((s, r) => s + r.n, 0),
      available: rewardRows.filter(r => r.status === 'available').reduce((s, r) => s + r.n, 0),
    },
    activities: acts,
    topPlayers: rowsOf(top).map((r: any) => ({ playerId: Number(r.id), name: r.name, avatarUrl: r.avatar_url, stamps: Number(r.stamps), rewards: Number(r.rewards) })),
    frequentNoStamp: rowsOf(frequentNoStamp).map((r: any) => ({ playerId: Number(r.id), name: r.name, avatarUrl: r.avatar_url, visits: Number(r.visits) })),
  };
}

export async function adminPlayers(period: string, opts: { q?: string; filter?: string; locationId?: number | null; page?: number; size?: number }) {
  const db = getDB(); if (!db) return { rows: [], total: 0 };
  const cfg = await getLoyaltyConfig();
  const { from, to } = periodBounds(period);
  const lf = locFilter(cfg, opts.locationId);
  const testF = cfg.excludeTestAccounts ? sql`AND COALESCE(p.is_test_account,false) = false` : sql``;
  const q = (opts.q || '').trim();
  const qF = q ? sql`AND (p.name ILIKE ${'%' + q + '%'} OR p.phone LIKE ${'%' + q + '%'})` : sql``;
  const page = Math.max(1, Number(opts.page) || 1); const size = Math.min(100, Math.max(5, Number(opts.size) || 20));
  const N = cfg.stampsPerReward;
  const having = opts.filter === 'on_card' ? sql`HAVING COUNT(DISTINCT st.id) FILTER (WHERE st.voided_at IS NULL) > 0`
    : opts.filter === 'completed' ? sql`HAVING COUNT(DISTINCT rw.id) > 0`
    : opts.filter === 'no_stamp' ? sql`HAVING COUNT(DISTINCT pl.activity_id) >= 3 AND COUNT(DISTINCT st.id) FILTER (WHERE st.voided_at IS NULL) = 0`
    : sql``;
  const r: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id, mp.player_id, a.date FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
        JOIN activities a ON a.id = s.activity_id LEFT JOIN locations l ON l.id = a.location_id
       WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to} ${lf}
    ), appbk AS (
      SELECT DISTINCT b.activity_id, b.player_id FROM bookings b JOIN activities a ON a.id = b.activity_id
       WHERE b.deleted_at IS NULL AND b.created_by = 'player-app' AND a.date >= ${from} AND a.date < ${to}
    ), base AS (
      SELECT p.id, p.name, p.phone, p.avatar_url, p.rank_tier,
             COUNT(DISTINCT pl.activity_id)::int AS visits,
             COUNT(DISTINCT st.id) FILTER (WHERE st.voided_at IS NULL)::int AS stamps,
             COUNT(DISTINCT st.id) FILTER (WHERE st.voided_at IS NULL AND st.source = 'manual')::int AS manual,
             COUNT(DISTINCT ab.activity_id)::int AS app_booked,
             COUNT(DISTINCT rw.id)::int AS rewards,
             MAX(pl.date) AS last_visit,
             COUNT(*) OVER() AS total
        FROM players p
        LEFT JOIN played pl ON pl.player_id = p.id
        LEFT JOIN appbk ab ON ab.player_id = p.id AND ab.activity_id = pl.activity_id
        LEFT JOIN loyalty_stamps st ON st.player_id = p.id AND st.period = ${period}
        LEFT JOIN loyalty_rewards rw ON rw.player_id = p.id AND rw.period = ${period} AND rw.status <> 'void'
       WHERE p.deleted_at IS NULL ${testF} ${qF}
         AND (pl.activity_id IS NOT NULL OR st.id IS NOT NULL)
       GROUP BY p.id ${having}
    )
    SELECT * FROM base ORDER BY stamps DESC, visits DESC, last_visit DESC NULLS LAST, id LIMIT ${size} OFFSET ${(page - 1) * size}
  `);
  const rows = rowsOf(r);
  const ids = rows.map((x: any) => Number(x.id));
  const rwRows: any = ids.length ? await db.execute(sql`SELECT id, player_id, status, kind, expires_at FROM loyalty_rewards WHERE period = ${period} AND player_id = ANY(${ids}::int[]) AND status <> 'void' ORDER BY seq`) : { rows: [] };
  const byP = new Map<number, any[]>();
  for (const x of rowsOf(rwRows)) { const a = byP.get(Number(x.player_id)) || []; a.push({ id: Number(x.id), status: x.status, kind: x.kind, expiresAt: x.expires_at }); byP.set(Number(x.player_id), a); }
  return {
    total: Number(rows[0]?.total || 0), page, size, stampsPerReward: N,
    rows: rows.map((x: any) => ({
      playerId: Number(x.id), name: x.name, phone: x.phone, avatarUrl: x.avatar_url, rankTier: x.rank_tier,
      visits: Number(x.visits), stamps: Number(x.stamps), manualStamps: Number(x.manual), appBooked: Number(x.app_booked), rewards: Number(x.rewards),
      lastVisit: x.last_visit, rewardsList: byP.get(Number(x.id)) || [],
    })),
  };
}

export async function adminPlayerDetail(playerId: number, period: string) {
  const db = getDB(); if (!db) return null;
  const cfg = await getLoyaltyConfig();
  const [p] = await db.select({ id: players.id, name: players.name, phone: players.phone, avatarUrl: players.avatarUrl, rankTier: players.rankTier, rankRR: players.rankRR, chips: players.chipsBalance, isFree: players.isFreeAccount, isTest: players.isTestAccount })
    .from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return null;
  const visits = await visitsInPeriod(playerId, period, cfg);
  const stampsR: any = await db.execute(sql`
    SELECT st.*, a.name AS activity_name, a.date AS activity_date FROM loyalty_stamps st JOIN activities a ON a.id = st.activity_id
     WHERE st.player_id = ${playerId} AND st.period = ${period} ORDER BY a.date
  `);
  const rewardsR: any = await db.execute(sql`SELECT * FROM loyalty_rewards WHERE player_id = ${playerId} ORDER BY earned_at DESC LIMIT 24`);
  const totalsR: any = await db.execute(sql`
    SELECT (SELECT COUNT(*)::int FROM loyalty_stamps WHERE player_id = ${playerId} AND voided_at IS NULL) AS stamps_all,
           (SELECT COUNT(*)::int FROM loyalty_rewards WHERE player_id = ${playerId} AND status <> 'void') AS rewards_all
  `);
  const t = rowsOf(totalsR)[0] || {};
  const count = await stampCount(playerId, period);
  return {
    player: p, period, cfg: { stampsPerReward: cfg.stampsPerReward, minLeadHours: cfg.minLeadHours, maxRewardsPerMonth: cfg.maxRewardsPerMonth },
    card: { stamps: count, inCard: count === 0 ? 0 : ((count - 1) % cfg.stampsPerReward) + 1, cardsCompleted: Math.floor(count / cfg.stampsPerReward) },
    visits,
    stamps: rowsOf(stampsR).map((s: any) => ({ id: Number(s.id), activityId: Number(s.activity_id), activityName: s.activity_name, date: s.activity_date, leadHours: s.lead_hours != null ? Number(s.lead_hours) : null, source: s.source, note: s.note, voidedAt: s.voided_at, voidReason: s.void_reason, grantedBy: s.granted_by })),
    rewards: rowsOf(rewardsR).map(mapReward),
    totals: { stampsAll: Number(t.stamps_all || 0), rewardsAll: Number(t.rewards_all || 0) },
  };
}

export async function manualStamp(playerId: number, activityId: number, staffId: number, note: string): Promise<{ ok: boolean; error?: string; stampId?: number; rewardId?: number | null }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB' };
  const cfg = await getLoyaltyConfig();
  if (!note || note.trim().length < 3) return { ok: false, error: 'السبب مطلوب (٣ أحرف على الأقلّ)' };
  const [act] = await db.select({ id: activities.id, name: activities.name, date: activities.date, locationId: activities.locationId }).from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!act) return { ok: false, error: 'الفعاليّة غير موجودة' };
  const period = periodOf(new Date(act.date));
  const [p] = await db.select({ phone: players.phone }).from(players).where(eq(players.id, playerId)).limit(1);
  const bk = await bookingFor(activityId, playerId, p?.phone);
  const ins: any = await db.execute(sql`
    INSERT INTO loyalty_stamps (player_id, activity_id, booking_id, location_id, period, lead_hours, source, granted_by, note)
    VALUES (${playerId}, ${activityId}, ${bk?.bookingId ?? null}, ${act.locationId ?? null}, ${period}, ${bk?.leadHours ?? null}, 'manual', ${staffId}, ${note.trim()})
    ON CONFLICT (player_id, activity_id) DO UPDATE SET voided_at = NULL, voided_by = NULL, void_reason = NULL, source = 'manual', granted_by = EXCLUDED.granted_by, note = EXCLUDED.note
      WHERE loyalty_stamps.voided_at IS NOT NULL
    RETURNING id
  `);
  const id = rowsOf(ins)[0]?.id;
  if (!id) return { ok: false, error: 'للاعب ختمٌ فعّال في هذه الفعاليّة أصلاً' };
  const count = await stampCount(playerId, period);
  const rewardId = await maybeCreateReward(cfg, playerId, period, count);
  if (cfg.enabled) {
    if (rewardId) void notify(playerId, 'loyalty_reward', '🎁 اكتملت بطاقتك!', `${count} أختام ✦ — اختر مكافأتك: ${rewardChoicesText(cfg)}.`, `reward:${rewardId}`, { rewardId: String(rewardId) });
    else void notify(playerId, 'loyalty_stamp', 'ختم من النادي ✦', `أُضيف ختمٌ لبطاقتك عن ${act.name}.`, `stamp:${activityId}:manual`, { activityId: String(activityId) });
  }
  return { ok: true, stampId: Number(id), rewardId };
}

export async function voidStamp(stampId: number, staffId: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB' };
  if (!reason || reason.trim().length < 3) return { ok: false, error: 'السبب مطلوب (٣ أحرف على الأقلّ)' };
  const r: any = await db.execute(sql`UPDATE loyalty_stamps SET voided_at = NOW(), voided_by = ${staffId}, void_reason = ${reason.trim()} WHERE id = ${stampId} AND voided_at IS NULL RETURNING id`);
  if (!rowsOf(r).length) return { ok: false, error: 'الختم غير موجود أو ملغى' };
  return { ok: true };
}

export async function adminRewards(opts: { period?: string; status?: string; kind?: string; page?: number; size?: number }) {
  const db = getDB(); if (!db) return { rows: [], total: 0 };
  const page = Math.max(1, Number(opts.page) || 1); const size = Math.min(100, Math.max(5, Number(opts.size) || 30));
  const pF = opts.period ? sql`AND r.period = ${opts.period}` : sql``;
  const sF = opts.status && opts.status !== 'all' ? sql`AND r.status = ${opts.status}` : sql``;
  const kF = opts.kind && opts.kind !== 'all' ? sql`AND r.kind = ${opts.kind}` : sql``;
  const r: any = await db.execute(sql`
    SELECT r.*, p.name AS player_name, p.avatar_url, s.display_name AS staff_name, COUNT(*) OVER() AS total
      FROM loyalty_rewards r JOIN players p ON p.id = r.player_id LEFT JOIN staff s ON s.id = r.redeemed_by
     WHERE 1=1 ${pF} ${sF} ${kF}
     ORDER BY r.earned_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}
  `);
  const rows = rowsOf(r);
  return { total: Number(rows[0]?.total || 0), page, size, rows: rows.map((x: any) => ({ ...mapReward(x), playerName: x.player_name, avatarUrl: x.avatar_url, staffName: x.staff_name })) };
}

export async function voidReward(rewardId: number, staffId: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB' };
  if (!reason || reason.trim().length < 3) return { ok: false, error: 'السبب مطلوب (٣ أحرف على الأقلّ)' };
  const [rw] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId)).limit(1);
  if (!rw) return { ok: false, error: 'المكافأة غير موجودة' };
  if (rw.status === 'redeemed' && rw.kind === 'chips') return { ok: false, error: 'التشبس قُيّد في الدفتر — استرجعه من صفحة اقتصاد التشبس' };
  if (rw.status === 'redeemed' && rw.redeemedRefType === 'booking' && rw.redeemedRefId) {
    await db.execute(sql`UPDATE bookings SET loyalty_reward_id = NULL, is_free = false, is_paid = false, received_by = '' WHERE id = ${rw.redeemedRefId} AND loyalty_reward_id = ${rewardId}`);
  }
  await db.update(loyaltyRewards).set({ status: 'void', voidReason: reason.trim(), redeemedBy: staffId } as any).where(eq(loyaltyRewards.id, rewardId));
  return { ok: true };
}

/** استخدام يدويّ من الموظّف (مثلاً مشروبٌ سُلّم بلا فاتورة) */
export async function manualRedeem(rewardId: number, staffId: number, note: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDB(); if (!db) return { ok: false, error: 'DB' };
  const r: any = await db.execute(sql`
    UPDATE loyalty_rewards SET status = 'redeemed', redeemed_at = NOW(), redeemed_ref_type = 'manual', redeemed_by = ${staffId}, note = ${note || 'استخدام يدويّ'}
     WHERE id = ${rewardId} AND status = 'available' RETURNING id
  `);
  if (!rowsOf(r).length) return { ok: false, error: 'المكافأة ليست متاحة' };
  return { ok: true };
}

/** محاكاة: كم ختماً وبطاقة لو كانت العتبة X ساعة في فترةٍ ما (على القناة والأماكن الحاليّة) */
export async function simulate(period: string, hours: number, locationId?: number | null) {
  const db = getDB(); if (!db) return null;
  const cfg = await getLoyaltyConfig();
  const { from, to } = periodBounds(period);
  const lf = locFilter(cfg, locationId);
  const chan = cfg.channel === 'app' ? sql`AND b.created_by = 'player-app'` : sql``;
  const testF = cfg.excludeTestAccounts ? sql`AND COALESCE(p.is_test_account,false) = false` : sql``;
  const r: any = await db.execute(sql`
    WITH played AS (
      SELECT DISTINCT s.activity_id, mp.player_id, a.date FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
        JOIN activities a ON a.id = s.activity_id LEFT JOIN locations l ON l.id = a.location_id JOIN players p ON p.id = mp.player_id
       WHERE mp.player_id IS NOT NULL AND m.deleted_at IS NULL AND a.deleted_at IS NULL AND a.date >= ${from} AND a.date < ${to} ${lf} ${testF}
    ), bk AS (
      SELECT b.activity_id, b.player_id, MIN(b.created_at) AS created_at FROM bookings b WHERE b.deleted_at IS NULL AND b.player_id IS NOT NULL ${chan} GROUP BY 1, 2
    ), q AS (
      SELECT pl.player_id, COUNT(*)::int AS stamps FROM played pl JOIN bk ON bk.activity_id = pl.activity_id AND bk.player_id = pl.player_id
       WHERE EXTRACT(EPOCH FROM (pl.date - bk.created_at)) / 3600 >= ${hours} GROUP BY pl.player_id
    )
    SELECT (SELECT COUNT(*)::int FROM played) AS visits, (SELECT COUNT(DISTINCT player_id)::int FROM played) AS players,
           COALESCE(SUM(stamps), 0)::int AS stamps, COUNT(*)::int AS stamped_players,
           COALESCE(SUM(LEAST(${cfg.maxRewardsPerMonth}, stamps / ${cfg.stampsPerReward})), 0)::int AS cards FROM q
  `);
  const t = rowsOf(r)[0] || {};
  return { period, hours, visits: Number(t.visits || 0), players: Number(t.players || 0), stamps: Number(t.stamps || 0), stampedPlayers: Number(t.stamped_players || 0), cards: Number(t.cards || 0) };
}

/** حالة الولاء لمجموعة لاعبين (شارات في وضع الباب / شاشة المكان) */
export async function statusForPlayers(playerIds: number[]): Promise<Map<number, { stamps: number; completed: boolean; freeVisit: boolean; freeDrink: boolean }>> {
  const out = new Map<number, { stamps: number; completed: boolean; freeVisit: boolean; freeDrink: boolean }>();
  const db = getDB(); if (!db || !playerIds.length) return out;
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return out;
  const period = currentPeriod();
  const r: any = await db.execute(sql`
    SELECT p.id,
           (SELECT COUNT(*)::int FROM loyalty_stamps s WHERE s.player_id = p.id AND s.period = ${period} AND s.voided_at IS NULL) AS stamps,
           EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.player_id = p.id AND r.kind = 'free_visit' AND r.status = 'available' AND (r.expires_at IS NULL OR r.expires_at > NOW())) AS free_visit,
           EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.player_id = p.id AND r.kind = 'free_drink' AND r.status = 'available' AND (r.expires_at IS NULL OR r.expires_at > NOW())) AS free_drink,
           EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.player_id = p.id AND r.period = ${period} AND r.status <> 'void') AS completed
      FROM players p WHERE p.id = ANY(${playerIds}::int[])
  `);
  for (const x of rowsOf(r)) out.set(Number(x.id), { stamps: Number(x.stamps), completed: !!x.completed, freeVisit: !!x.free_visit, freeDrink: !!x.free_drink });
  return out;
}

// ══════════════════════════════════════════════════════
// ⏰ المجدول (كلّ ١٥ دقيقة) — كلّ مهمّة محروسة بمفتاح إشعار أو حالة صفّ
// ══════════════════════════════════════════════════════

async function tickLoyalty() {
  const cfg = await getLoyaltyConfig();
  if (!cfg.enabled) return;
  const db = getDB(); if (!db) return;

  // 1) مهلة الاختيار انتهت → اختيار تلقائيّ (تشبس إن كان مفعَّلاً، وإلا أوّل نوعٍ مفعَّل)
  const pend: any = await db.execute(sql`SELECT id, player_id FROM loyalty_rewards WHERE status = 'pending_choice' AND choose_by IS NOT NULL AND choose_by < NOW() LIMIT 50`);
  for (const r of rowsOf(pend)) {
    const [p] = await db.select({ isFree: players.isFreeAccount }).from(players).where(eq(players.id, Number(r.player_id))).limit(1);
    const kinds = enabledKinds(cfg, { isFreeAccount: !!p?.isFree });
    const kind = kinds.includes('chips') ? 'chips' : kinds[0];
    if (kind) await chooseReward(Number(r.player_id), Number(r.id), kind, { auto: true }).catch(() => {});
  }

  // 2) انتهاء الصلاحيّة
  const exp: any = await db.execute(sql`UPDATE loyalty_rewards SET status = 'expired' WHERE status = 'available' AND expires_at IS NOT NULL AND expires_at < NOW() RETURNING id, player_id, kind`);
  for (const r of rowsOf(exp)) {
    void notify(Number(r.player_id), 'loyalty_expiring', 'انتهت مكافأة الولاء', 'انتهت صلاحيّة مكافأتك دون استخدام. بطاقة هذا الشهر ما زالت مفتوحة.', `expired:${r.id}`);
  }

  // 3) تنبيه قبل الانتهاء
  if (cfg.reminders.expiring.enabled) {
    const soon: any = await db.execute(sql`
      SELECT id, player_id, kind, expires_at FROM loyalty_rewards WHERE status = 'available' AND expires_at IS NOT NULL
         AND expires_at < NOW() + (${cfg.reminders.expiring.daysBefore} || ' days')::interval LIMIT 100
    `);
    for (const r of rowsOf(soon)) {
      const label = r.kind === 'free_visit' ? 'زيارتك المجّانيّة' : r.kind === 'free_drink' ? 'مشروبك المجّانيّ' : 'مكافأتك';
      void notify(Number(r.player_id), 'loyalty_expiring', `⏳ ${label} تنتهي قريباً`, `استخدمها قبل ${fmtDateJo(new Date(r.expires_at))} وإلا سقطت.`, `expiring:${r.id}`, { rewardId: String(r.id) });
    }
  }

  const jn = jordanNow();
  const hour = jn.getUTCHours();

  // 4) تذكير صباح يوم الفعاليّة لمن له ختمٌ هذا الشهر ولم يحجز
  if (cfg.reminders.preCutoff.enabled && hour >= cfg.reminders.preCutoff.hourLocal && hour < cfg.reminders.preCutoff.hourLocal + 3) {
    const dayStart = new Date(Date.UTC(jn.getUTCFullYear(), jn.getUTCMonth(), jn.getUTCDate()) - JO_OFFSET_MS);
    const dayEnd = new Date(dayStart.getTime() + 86400e3);
    const period = currentPeriod();
    const acts: any = await db.execute(sql`
      SELECT a.id, a.name, a.date, a.location_id FROM activities a LEFT JOIN locations l ON l.id = a.location_id
       WHERE a.deleted_at IS NULL AND a.status IN ('planned','active') AND a.date >= ${dayStart} AND a.date < ${dayEnd}
         AND COALESCE(l.is_test_location, false) = false
    `);
    for (const a of rowsOf(acts)) {
      if (!isLocationEnabled(cfg, a.location_id)) continue;
      const cut = cutoffFor(cfg, a.date);
      if (cut.getTime() <= Date.now()) continue;
      const targets: any = await db.execute(sql`
        SELECT DISTINCT st.player_id, (SELECT COUNT(*)::int FROM loyalty_stamps s2 WHERE s2.player_id = st.player_id AND s2.period = ${period} AND s2.voided_at IS NULL) AS n
          FROM loyalty_stamps st JOIN players p ON p.id = st.player_id
         WHERE st.period = ${period} AND st.voided_at IS NULL AND p.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.activity_id = ${a.id} AND b.deleted_at IS NULL AND (b.player_id = st.player_id OR b.phone = p.phone))
      `);
      for (const t of rowsOf(targets)) {
        const inCard = ((Number(t.n)) % cfg.stampsPerReward) + 1;
        void notify(Number(t.player_id), 'loyalty_reminder', `⏰ احجز قبل ${fmtTimeJo(cut)}`, `${a.name} الليلة. حجزك قبل الموعد بـ${cfg.minLeadHours} ساعات = ختمك ${ordinalAr(inCard)}.`, `remind:${a.id}`, { activityId: String(a.id), url: '/player/games' });
      }
    }
  }

  // 5) ملخّص أوّل الشهر
  if (cfg.reminders.monthly.enabled && jn.getUTCDate() === 1 && hour >= 10 && hour < 14) {
    const prev = previousPeriod();
    const cur = currentPeriod();
    const list: any = await db.execute(sql`
      SELECT st.player_id, COUNT(*)::int AS n, (SELECT COUNT(*)::int FROM loyalty_rewards r WHERE r.player_id = st.player_id AND r.period = ${prev} AND r.status <> 'void') AS cards
        FROM loyalty_stamps st JOIN players p ON p.id = st.player_id WHERE st.period = ${prev} AND st.voided_at IS NULL AND p.deleted_at IS NULL GROUP BY st.player_id
    `);
    for (const r of rowsOf(list)) {
      void notify(Number(r.player_id), 'loyalty_reset', '🗓️ بطاقة شهر جديد', `بطاقة الشهر الماضي أُغلقت على ${r.n} ${Number(r.n) === 1 ? 'ختم' : 'أختام'}${Number(r.cards) ? ` و${r.cards} ${Number(r.cards) === 1 ? 'مكافأة' : 'مكافآت'}` : ''}. بطاقتك الجديدة فارغة — أوّل حجزٍ مبكّر يفتحها.`, `reset:${cur}`);
    }
  }
}

function fmtDateJo(d: Date): string {
  return new Date(d.getTime() + JO_OFFSET_MS).toLocaleDateString('ar-JO', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

let started = false;
export function startLoyaltyScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => tickLoyalty().catch(e => console.warn('⚠️ loyalty tick:', e?.message));
  setTimeout(tick, 40_000);
  setInterval(tick, 15 * 60_000);
  console.log('🎟️ Loyalty scheduler started (every 15m)');
}
