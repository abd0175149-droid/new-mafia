// ══════════════════════════════════════════════════════
// 🎁 مكافآت النادي بالتشبس — أفضل ثلاثة + عيدية الميلاد
//
// مبدآن:
//  • كل منح يمرّ من applyChipsTx (البوابة الوحيدة) فيُوثَّق بالدفتر ويصل إشعاره.
//  • كل القيم قابلة للتعديل من لوحة الإدارة — لا رقم مدفون في الكود.
// ══════════════════════════════════════════════════════

import { sql, eq, and, desc, asc, inArray } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { playerSeasonStats, seasons } from '../schemas/season.schema.js';
import { chipsConfig } from '../schemas/chips.schema.js';
import { applyChipsTx } from './chips.service.js';

function rowsOf(res: any): any[] { return res?.rows ?? (Array.isArray(res) ? res : []); }

// ══════════════════════════════════════════════════════
// ⚙️ الإعدادات
// ══════════════════════════════════════════════════════

export interface ChipsRewardsConfig {
  top3: {
    /** المبلغ الافتراضي لكل مركز (الأول، الثاني، الثالث) — قابل للتعديل عند كل منح */
    amounts: [number, number, number];
    /** استبعاد حسابات الاختبار (افتراضياً نعم — وإلا تسرّب المكافآت لحسابات وهمية) */
    excludeTestAccounts: boolean;
    /** حدّ أدنى من المباريات ليُحتسب اللاعب ضمن الترتيب */
    minMatches: number;
  };
  birthday: {
    enabled: boolean;
    amount: number;
    excludeTestAccounts: boolean;
    /** رسالة الإشعار — {الاسم} و{العدد} يُستبدلان */
    messageTitle: string;
    messageBody: string;
  };
  /**
   * 💧 قطرات نهاية المباراة — أكبر صنبور إصدار في الاقتصاد.
   * ⚠️ كانت ثوابت مُصرَّفة في الكود بينما كل رقم اقتصادي آخر قابل للتعديل
   *    من اللوحة، فضبط التضخّم أو إيقاف الصنبور كان يحتاج نشرةَ كود.
   */
  drops: {
    enabled: boolean;
    win: number;
    top3: number;
    firstMatch: number;
  };
}

export const DEFAULT_REWARDS_CONFIG: ChipsRewardsConfig = {
  // مطابقة صفحة التصنيف افتراضياً: لا استبعاد ولا حدّ أدنى — من يظهر في الصدارة هو من يستلم.
  // (الخياران متاحان للتعديل من اللوحة إن أردت لاحقاً استبعاد حسابات الاختبار.)
  top3: { amounts: [100, 100, 100], excludeTestAccounts: false, minMatches: 0 },
  birthday: {
    enabled: true,
    amount: 50,
    excludeTestAccounts: false,
    messageTitle: '🎂 كل عام وأنت بخير!',
    messageBody: 'عيديّة النادي {العدد} 🪙 — افتح خزنة الدون واختر ما يعجبك',
  },
  // القيم المقفلة (أرتفاكت v4) — تبقى الافتراضي فلا يتغيّر شيء بمجرّد النقل
  drops: { enabled: true, win: 2, top3: 3, firstMatch: 10 },
};

let cfgCache: { v: ChipsRewardsConfig; at: number } | null = null;
const CFG_TTL = 60_000;

export function invalidateRewardsConfig() { cfgCache = null; }

export async function getRewardsConfig(): Promise<ChipsRewardsConfig> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL) return cfgCache.v;
  const db = getDB();
  if (!db) return DEFAULT_REWARDS_CONFIG;
  try {
    const [row] = await db.select().from(chipsConfig).where(eq(chipsConfig.key, 'rewards')).limit(1);
    const v = (row?.value as any) || {};
    const merged: ChipsRewardsConfig = {
      top3: { ...DEFAULT_REWARDS_CONFIG.top3, ...(v.top3 || {}) },
      birthday: { ...DEFAULT_REWARDS_CONFIG.birthday, ...(v.birthday || {}) },
      drops: { ...DEFAULT_REWARDS_CONFIG.drops, ...(v.drops || {}) },
    };
    cfgCache = { v: merged, at: Date.now() };
    return merged;
  } catch {
    return DEFAULT_REWARDS_CONFIG;
  }
}

export async function saveRewardsConfig(patch: any): Promise<ChipsRewardsConfig> {
  const db = getDB();
  if (!db) return DEFAULT_REWARDS_CONFIG;
  const current = await getRewardsConfig();

  const next: ChipsRewardsConfig = {
    top3: {
      amounts: Array.isArray(patch?.top3?.amounts) && patch.top3.amounts.length === 3
        ? patch.top3.amounts.map((n: any) => Math.max(0, Math.min(100000, Math.trunc(Number(n) || 0)))) as [number, number, number]
        : current.top3.amounts,
      excludeTestAccounts: patch?.top3?.excludeTestAccounts != null ? !!patch.top3.excludeTestAccounts : current.top3.excludeTestAccounts,
      minMatches: patch?.top3?.minMatches != null ? Math.max(0, Math.trunc(Number(patch.top3.minMatches) || 0)) : current.top3.minMatches,
    },
    birthday: {
      enabled: patch?.birthday?.enabled != null ? !!patch.birthday.enabled : current.birthday.enabled,
      amount: patch?.birthday?.amount != null ? Math.max(0, Math.min(100000, Math.trunc(Number(patch.birthday.amount) || 0))) : current.birthday.amount,
      excludeTestAccounts: patch?.birthday?.excludeTestAccounts != null ? !!patch.birthday.excludeTestAccounts : current.birthday.excludeTestAccounts,
      messageTitle: patch?.birthday?.messageTitle != null ? String(patch.birthday.messageTitle).slice(0, 120) : current.birthday.messageTitle,
      messageBody: patch?.birthday?.messageBody != null ? String(patch.birthday.messageBody).slice(0, 300) : current.birthday.messageBody,
    },
    drops: {
      enabled: patch?.drops?.enabled != null ? !!patch.drops.enabled : current.drops.enabled,
      // سقف ١٠٠ لكل قطرة: خطأ مطبعي في خانة واحدة لا يجوز أن يُغرق الاقتصاد
      win: patch?.drops?.win != null ? Math.max(0, Math.min(100, Math.trunc(Number(patch.drops.win) || 0))) : current.drops.win,
      top3: patch?.drops?.top3 != null ? Math.max(0, Math.min(100, Math.trunc(Number(patch.drops.top3) || 0))) : current.drops.top3,
      firstMatch: patch?.drops?.firstMatch != null ? Math.max(0, Math.min(100, Math.trunc(Number(patch.drops.firstMatch) || 0))) : current.drops.firstMatch,
    },
  };

  await db.execute(sql`
    INSERT INTO chips_config (key, value, updated_at)
    VALUES ('rewards', ${JSON.stringify(next)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
  invalidateRewardsConfig();
  return next;
}

// ══════════════════════════════════════════════════════
// 🏆 أفضل ثلاثة في الموسم
// ══════════════════════════════════════════════════════

export interface TopPlayerRow {
  rank: number;
  playerId: number;
  name: string;
  avatarUrl: string | null;
  rankTier: string;
  rankRR: number;
  xp: number;
  level: number;
  totalMatches: number;
  totalWins: number;
  isTestAccount: boolean;
}

/**
 * ترتيب أفضل اللاعبين في موسم — **بنفس معادلة صفحة التصنيف حرفياً**
 * (وزن الرتبة DESC ← الرانك DESC ← المستوى DESC) كما في getSeasonLeaderboard،
 * فلا يختلف من يستلم المكافأة عمّن يراه اللاعبون في الصدارة.
 *
 * الإضافة الوحيدة: كاسر تعادل نهائي بالأقدم تسجيلاً — لا يغيّر الترتيب المعروض،
 * لكنه يجعل نتيجة «المركز الثالث» ثابتة بدل أن تتبدّل بين نداء وآخر عند التساوي.
 */
export async function getSeasonTopPlayers(seasonId: number, limit = 3): Promise<TopPlayerRow[]> {
  const db = getDB();
  if (!db) return [];
  const cfg = await getRewardsConfig();

  const conds: any[] = [eq(playerSeasonStats.seasonId, seasonId)];
  if (cfg.top3.excludeTestAccounts) conds.push(sql`COALESCE(${players.isTestAccount}, false) = false`);
  if (cfg.top3.minMatches > 0) conds.push(sql`COALESCE(${playerSeasonStats.totalMatches}, 0) >= ${cfg.top3.minMatches}`);

  const rows = await db.select({
    playerId: playerSeasonStats.playerId,
    name: players.name,
    avatarUrl: players.avatarUrl,
    rankTier: playerSeasonStats.rankTier,
    rankRR: playerSeasonStats.rankRR,
    xp: playerSeasonStats.xp,
    level: playerSeasonStats.level,
    totalMatches: playerSeasonStats.totalMatches,
    totalWins: playerSeasonStats.totalWins,
    isTestAccount: players.isTestAccount,
  }).from(playerSeasonStats)
    .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
    .where(and(...conds))
    .orderBy(
      // ↓↓ مطابق حرفياً لـ getSeasonLeaderboard (صفحة التصنيف) ↓↓
      sql`CASE ${playerSeasonStats.rankTier} WHEN 'GODFATHER' THEN 5 WHEN 'UNDERBOSS' THEN 4 WHEN 'CAPO' THEN 3 WHEN 'SOLDIER' THEN 2 ELSE 1 END DESC`,
      desc(playerSeasonStats.rankRR),
      desc(playerSeasonStats.level),
      // ↑↑ نهاية المعادلة المشتركة ↑↑
      asc(playerSeasonStats.playerId),   // كاسر تعادل نهائي — لا يغيّر الترتيب، يثبّته فقط
    )
    .limit(Math.max(1, Math.min(limit, 50)));

  return rows.map((r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    name: r.name,
    avatarUrl: r.avatarUrl,
    rankTier: r.rankTier || 'INFORMANT',
    rankRR: Number(r.rankRR || 0),
    xp: Number(r.xp || 0),
    level: Number(r.level || 1),
    totalMatches: Number(r.totalMatches || 0),
    totalWins: Number(r.totalWins || 0),
    isTestAccount: !!r.isTestAccount,
  }));
}

/** كل المواسم (عادي/أونلاين/بطولة) — لاختيار الموسم قبل المنح */
export async function listSeasonsForRewards() {
  const db = getDB();
  if (!db) return [];
  const rows = await db.select({
    id: seasons.id, name: seasons.name, seasonNumber: seasons.seasonNumber,
    type: seasons.type, status: seasons.status, startedAt: seasons.startedAt, endedAt: seasons.endedAt,
  }).from(seasons).orderBy(desc(seasons.status), desc(seasons.id));
  return rows;
}

/**
 * 🔎 من استلم مكافأة هذا الموسم فعلاً؟
 *
 * ⚠️ يفحص **صيغتَي المفتاح**: الجديدة الحتميّة `top3:{موسم}:{لاعب}`
 *    والقديمة التي كانت تحمل معرّف طلب `top3:{موسم}:{لاعب}:{rid}`.
 *    بدون فحص الصيغة القديمة سيدفع أول منح بعد النشر لموسم مدفوع أصلاً
 *    مرة ثانية — لأن المفتاح الجديد لا يتعارض مع القديم.
 *    (منح متعمّد ثانٍ يحمل لاحقة `:regrant:` ولا يُحسب هنا.)
 */
async function top3GrantedPlayerIds(seasonId: number, playerIds: number[]): Promise<Set<number> | null> {
  const db = getDB();
  const out = new Set<number>();
  const ids = playerIds.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return out;
  // ⚠️ **يفشل مغلقاً لا مفتوحاً.** هذا الفحص هو الحارس **الوحيد** للمواسم
  //    المدفوعة قبل النشر (مفاتيحها بالصيغة القديمة ولا تتعارض مع الجديدة).
  //    ابتلاع الخطأ وإرجاع مجموعة فارغة يعني «لم يُدفع لأحد» — أي دفعٌ ثانٍ
  //    للمنصّة كلها. نُعيد null = «تعذّر التحقّق» ويتوقّف المنح.
  if (!db) return null;
  const sid = Number(seasonId);
  try {
    const res: any = await db.execute(sql.raw(`
      SELECT DISTINCT player_id FROM chips_ledger
       WHERE player_id IN (${ids.join(',')})
         AND (
              idempotency_key = 'top3:${sid}:' || player_id
           OR (idempotency_key LIKE 'top3:${sid}:' || player_id || ':%'
               AND idempotency_key NOT LIKE '%:regrant:%')
         )
    `));
    for (const r of rowsOf(res)) out.add(Number(r.player_id));
    return out;
  } catch (e: any) {
    console.error('❌ top3GrantedPlayerIds — تعذّر فحص «مُنح سابقاً»:', e?.message);
    return null;
  }
}

/**
 * معاينة أفضل ثلاثة في موسم محدّد (أو الموسم العادي النشط افتراضياً).
 * المالك يختار الموسم — عادي أو أونلاين — قبل الضغط على زر المنح.
 * كل صفّ يحمل `alreadyGranted` كي لا يُدفع الموسم مرتين بلا قصد.
 */
export async function previewTop3(seasonId?: number | null) {
  const db = getDB();
  const config = await getRewardsConfig();
  if (!db) return { season: null, top: [] as TopPlayerRow[], config, seasons: [] as any[], alreadyGrantedCount: 0 };

  const allSeasons = await listSeasonsForRewards();

  let season: any = null;
  if (seasonId) {
    season = allSeasons.find((s: any) => s.id === Number(seasonId)) || null;
  } else {
    season = allSeasons.find((s: any) => s.type === 'REGULAR' && s.status === 'ACTIVE')
      || allSeasons.find((s: any) => s.status === 'ACTIVE') || null;
  }

  if (!season) return { season: null, top: [], config, seasons: allSeasons, alreadyGrantedCount: 0 };
  const rows = await getSeasonTopPlayers(season.id, 3);
  const grantedIds = await top3GrantedPlayerIds(season.id, rows.map(r => r.playerId));
  // null = تعذّر التحقّق. نُعلنها للواجهة كي تمتنع عن عرض زرّ المنح بدل أن
  // تعرض «لم يُمنح لأحد» وهي لا تعرف.
  const guardUnavailable = grantedIds === null;
  const top = rows.map(r => ({ ...r, alreadyGranted: guardUnavailable ? null : grantedIds!.has(r.playerId) }));
  return {
    season, top, config, seasons: allSeasons,
    alreadyGrantedCount: guardUnavailable ? null : grantedIds!.size,
    guardUnavailable,
  };
}

/**
 * منح أفضل ثلاثة.
 * • المبالغ تأتي من الطلب (وإلا من الإعدادات) — المالك يقرّر عند كل منح.
 *
 * 🔑 المفتاح **حتميّ**: `top3:{موسم}:{لاعب}` بلا معرّف طلب.
 *    كان المفتاح يحمل `rid` يتجدّد بعد كل منح ناجح، فالنقرة الثانية تُنتج
 *    مفتاحاً جديداً وسطر دفتر حقيقياً ثانياً — أي دفع مزدوج للمنصّة بلا تحذير.
 *    الآن التكرار يصطدم بالقيد الفريد ويُعاد كـ«مكرّر» بلا خصم.
 *
 * ♻️ المنح المتعمّد مرة أخرى ما زال مسموحاً (قرار المالك) لكنه يحتاج
 *    `allowRepeat` صريحاً من الواجهة بعد تأكيد مكتوب، ويُوسم بلاحقة
 *    `:regrant:` كي يبقى مميَّزاً في الدفتر وفي فحص «مُنح سابقاً».
 */
export async function grantTop3(opts: {
  seasonId?: number | null; amounts?: number[]; staffId?: number | null; requestId?: string | null; note?: string | null;
  /** منح متعمّد ثانٍ — لا يُمرَّر إلا بعد تأكيد مكتوب في الواجهة */
  allowRepeat?: boolean;
}) {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };

  const { season, top, config } = await previewTop3(opts.seasonId);
  if (!season) return { ok: false, error: 'اختر موسماً أولاً' };
  if (top.length === 0) return { ok: false, error: 'لا يوجد لاعبون مؤهّلون في هذا الموسم' };

  const amounts = (opts.amounts && opts.amounts.length ? opts.amounts : config.top3.amounts)
    .map(n => Math.max(0, Math.min(100000, Math.trunc(Number(n) || 0))));

  const rid = String(opts.requestId || '').trim().slice(0, 60)
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  /** المبلغ الفعلي لهذا المركز — نفس منطق الحلقة أدناه حرفياً */
  const amountFor = (rank: number) => amounts[rank - 1] ?? amounts[amounts.length - 1] ?? 0;

  // حارس الدفع المزدوج: من استلم سابقاً (بأي من صيغتَي المفتاح) لا يُدفع له
  // ثانيةً إلا بطلب متعمّد صريح.
  //
  // ⚠️ يُشترط وجود مستحقّ واحد على الأقل قبل الحكم: لو كانت كل المبالغ صفراً
  //    لصار «لا أحد مستحقّ» مساوياً لـ«الكل استلم»، فيُرفض موسم جديد برسالة
  //    مضلّلة تماماً.
  const alreadyIds = await top3GrantedPlayerIds(season.id, top.map(p => p.playerId));
  if (alreadyIds === null) {
    // «لا أعرف» لا يجوز أن تتحوّل إلى «ادفع». نتوقّف ونطلب إعادة المحاولة.
    return {
      ok: false, code: 'GUARD_UNAVAILABLE',
      error: 'تعذّر التحقّق من المنح السابق لهذا الموسم — لم يُمنح شيء. أعد المحاولة.',
      season,
    };
  }
  const eligible = top.filter(p => amountFor(p.rank) > 0);
  const allAlreadyPaid = eligible.length > 0 && eligible.every(p => alreadyIds.has(p.playerId));
  if (!opts.allowRepeat && allAlreadyPaid) {
    return {
      ok: false,
      code: 'ALREADY_GRANTED',
      error: `مكافأة «${season.name}» مُنحت سابقاً لكل الفائزين — للمنح مرة أخرى فعّل التأكيد المتعمّد`,
      season,
    };
  }

  const results: Array<{ playerId: number; name: string; rank: number; amount: number; ok: boolean; duplicate: boolean; skipped?: boolean; balance?: number }> = [];

  for (const p of top) {
    const amount = amountFor(p.rank);
    if (amount <= 0) continue;

    // مُنح سابقاً ولا طلب متعمّد ⇒ تخطٍّ صريح (لا نداء دفتر أصلاً)
    if (alreadyIds.has(p.playerId) && !opts.allowRepeat) {
      results.push({ playerId: p.playerId, name: p.name, rank: p.rank, amount, ok: true, duplicate: true, skipped: true });
      continue;
    }

    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉';
    const res = await applyChipsTx({
      playerId: p.playerId,
      amount,
      reason: 'admin_adjust',
      idempotencyKey: opts.allowRepeat
        ? `top3:${season.id}:${p.playerId}:regrant:${rid}`
        : `top3:${season.id}:${p.playerId}`,
      refType: 'manual',
      refId: `season:${season.id}:rank:${p.rank}`,
      staffId: opts.staffId ?? null,
      note: opts.note || `مكافأة المركز ${p.rank} — ${season.name}`,
      notify: {
        title: `${medal} مكافأة المركز ${p.rank} في ${season.name}`,
        body: `+${amount} 🪙 من النادي — استحققتها`,
      },
    });
    results.push({
      playerId: p.playerId, name: p.name, rank: p.rank, amount,
      ok: !!res.ok, duplicate: !!res.duplicate, balance: res.balance,
    });
  }

  const totalGranted = results.filter(r => r.ok && !r.duplicate).reduce((s, r) => s + r.amount, 0);
  return { ok: true, season, results, totalGranted };
}

// ══════════════════════════════════════════════════════
// 🎂 عيديّة الميلاد
// ══════════════════════════════════════════════════════

const JO_OFFSET_MS = 3 * 3600e3;   // الأردن UTC+3 ثابت (أُلغي التوقيت الصيفي 2022)

/** تاريخ اليوم بتوقيت الأردن — الحاوية تعمل بـUTC فلا يصح استخدام التاريخ المحلي */
export function jordanToday(): { year: number; monthDay: string; iso: string } {
  const d = new Date(Date.now() + JO_OFFSET_MS);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return { year: d.getUTCFullYear(), monthDay: `${mm}-${dd}`, iso: `${d.getUTCFullYear()}-${mm}-${dd}` };
}

/** أصحاب عيد الميلاد اليوم (تواريخ الميلاد مخزّنة YYYY-MM-DD) */
export async function getTodaysBirthdays(includeTest = false) {
  const db = getDB();
  if (!db) return [];
  const { monthDay, year } = jordanToday();

  const res: any = await db.execute(sql`
    SELECT p.id, p.name, p.avatar_url, p.dob, COALESCE(p.is_test_account, false) AS is_test,
           COALESCE(p.chips_balance, 0)::int AS balance,
           EXISTS (
             SELECT 1 FROM chips_ledger l
              WHERE l.player_id = p.id AND l.idempotency_key = 'birthday:' || p.id || ':' || ${String(year)}
           ) AS already_granted
      FROM players p
     WHERE p.dob IS NOT NULL AND p.dob <> ''
       AND substring(p.dob from 6 for 5) = ${monthDay}
       ${includeTest ? sql`` : sql`AND COALESCE(p.is_test_account, false) = false`}
     ORDER BY p.id
  `);

  return rowsOf(res).map((r: any) => ({
    playerId: Number(r.id),
    name: String(r.name),
    avatarUrl: r.avatar_url || null,
    dob: String(r.dob),
    isTestAccount: !!r.is_test,
    balance: Number(r.balance || 0),
    alreadyGranted: !!r.already_granted,
  }));
}

/**
 * منح عيديّة الميلاد لمن يستحقّها اليوم.
 * 🔑 المفتاح `birthday:{playerId}:{السنة}` يضمن هديّة واحدة في السنة
 *    مهما تكرّر الفحص أو أُعيد تشغيل الخادم — بلا جدول تتبّع إضافي.
 */
export async function runBirthdayGifts(opts?: {
  force?: boolean; staffId?: number | null;
  /** لاعب واحد (يُبقى للتوافق مع النداءات القديمة) */
  onlyPlayerId?: number;
  /**
   * ⚠️ قصر المنح على هؤلاء حصراً.
   * كان الاقتصار مدعوماً للاعب واحد فقط، فإن اختار القائد اثنين أو أكثر
   * سقط القيد كلياً ومُنح **كل** من عيد ميلاده اليوم في النادي — أي أن
   * واجهة الاختيار كانت تكذب. مصفوفة فارغة = لا قيد (سلوك الجدولة التلقائية).
   */
  onlyPlayerIds?: number[];
}) {
  const cfg = await getRewardsConfig();
  if (!cfg.birthday.enabled && !opts?.force) return { skipped: 'disabled', granted: [] as any[] };
  if (cfg.birthday.amount <= 0) return { skipped: 'zero-amount', granted: [] as any[] };

  const { year } = jordanToday();
  let list = await getTodaysBirthdays(!cfg.birthday.excludeTestAccounts);

  const only = new Set<number>([
    ...(opts?.onlyPlayerIds || []),
    ...(opts?.onlyPlayerId ? [opts.onlyPlayerId] : []),
  ]);
  if (only.size) list = list.filter(b => only.has(b.playerId));

  const granted: Array<{ playerId: number; name: string; amount: number; duplicate: boolean }> = [];

  for (const b of list) {
    const body = cfg.birthday.messageBody
      .replace(/\{الاسم\}/g, b.name)
      .replace(/\{العدد\}/g, String(cfg.birthday.amount));

    const res = await applyChipsTx({
      playerId: b.playerId,
      amount: cfg.birthday.amount,
      reason: 'admin_adjust',
      idempotencyKey: `birthday:${b.playerId}:${year}`,
      refType: 'manual',
      refId: `birthday:${year}`,
      staffId: opts?.staffId ?? null,
      note: `عيديّة ميلاد ${year}`,
      notify: { title: cfg.birthday.messageTitle.replace(/\{الاسم\}/g, b.name), body },
    });

    if (res.ok) {
      granted.push({ playerId: b.playerId, name: b.name, amount: cfg.birthday.amount, duplicate: !!res.duplicate });
      if (!res.duplicate) console.log(`🎂 عيديّة ميلاد: ${b.name} (#${b.playerId}) +${cfg.birthday.amount} 🪙`);
    }
  }

  return { skipped: null, granted, date: jordanToday().iso };
}

// ══════════════════════════════════════════════════════
// 🎉 احتفالية عيد الميلاد على شاشة العرض (يطلقها القائد)
// ══════════════════════════════════════════════════════

/** مفتاح صوت أغنية عيد الميلاد — يربطه المالك بملف من لوحة المؤثرات */
export const BIRTHDAY_SONG_KEY = 'birthday_song';

export interface BirthdayCelebrant {
  playerId: number;
  name: string;
  avatarUrl: string | null;
  /** مقعده في الغرفة إن كان حاضراً الآن */
  physicalId?: number | null;
  rankTier?: string | null;
}

/**
 * بثّ احتفالية عيد الميلاد لغرفة عرض.
 * الصوت مسؤولية جهاز القائد (المصدر الحصري) — هنا نبثّ الصورة فقط،
 * والقائد يعزف الأغنية فتصل الشاشة عبر مرآة الصوت القائمة.
 */
export function emitBirthdayCelebration(roomId: string, celebrants: BirthdayCelebrant[], durationMs = 12000) {
  try {
    const io = (global as any).io;
    if (!io || !roomId || celebrants.length === 0) return false;
    io.to(roomId).emit('display:birthday-celebration', { celebrants, durationMs });
    return true;
  } catch { return false; }
}

/** إيقاف الاحتفالية فوراً (زر الإغلاق عند القائد) */
export function clearBirthdayCelebration(roomId: string) {
  try {
    const io = (global as any).io;
    if (io && roomId) io.to(roomId).emit('display:birthday-celebration-clear', {});
    return true;
  } catch { return false; }
}

/**
 * أصحاب عيد الميلاد اليوم مُثرَون بحضورهم في غرفة القائد.
 * الترتيب: الحاضرون في الغرفة أولاً (هم من سنحتفل بهم أمام الجميع).
 */
export async function getBirthdaysForRoom(roomId?: string | null) {
  const list = await getTodaysBirthdays(true);
  if (!roomId) return list.map(b => ({ ...b, physicalId: null as number | null, inRoom: false }));

  let seatByPlayer = new Map<number, number>();
  try {
    const { getGameState } = await import('../config/redis.js');
    const st: any = await getGameState(roomId);
    for (const p of (st?.players || [])) {
      if (p?.playerId) seatByPlayer.set(Number(p.playerId), Number(p.physicalId));
    }
  } catch { /* الغرفة قد لا تكون موجودة */ }

  return list
    .map(b => ({ ...b, physicalId: seatByPlayer.get(b.playerId) ?? null, inRoom: seatByPlayer.has(b.playerId) }))
    .sort((a, b) => Number(b.inRoom) - Number(a.inRoom) || a.playerId - b.playerId);
}

// ── الماسح اليومي (بنمط ماسح تذكيرات الواتساب: يقرأ من القاعدة، يصمد عبر إعادة التشغيل) ──
let birthdayStarted = false;

export function startBirthdayScheduler(): void {
  if (birthdayStarted) return;
  birthdayStarted = true;

  const tick = () => {
    runBirthdayGifts()
      .then(r => {
        const fresh = (r.granted || []).filter((g: any) => !g.duplicate);
        if (fresh.length) console.log(`🎂 عيديّات اليوم: ${fresh.length} لاعب`);
      })
      .catch(e => console.warn('⚠️ birthday scan:', e?.message));
  };

  // فحص كل 30 دقيقة: المنح مضمون مرة واحدة بالسنة عبر مفتاح الدفتر،
  // فتكرار الفحص بلا ضرر ويضمن التغطية مهما كان وقت الإقلاع.
  setTimeout(tick, 20_000);          // بعد استقرار الإقلاع
  setInterval(tick, 30 * 60_000);
  console.log('🎂 Birthday gift scheduler started (every 30m)');
}
