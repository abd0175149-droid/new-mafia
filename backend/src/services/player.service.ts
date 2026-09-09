// ══════════════════════════════════════════════════════
// 👤 خدمة اللاعبين — Player Service
// إنشاء حساب تلقائي، بحث، بروفايل، وحجز تلقائي
// + دعم المصادقة وهجرة الحسابات القديمة
// ══════════════════════════════════════════════════════

import { eq, sql, desc, and, isNull } from 'drizzle-orm';
import { normGender } from '../utils/gender.util.js';
import { teamOfRole } from '../game/roles.js';
import { getDB } from '../config/db.js';
import { players, bookingMembers, PLAYER_DEFAULT_PASSWORD } from '../schemas/player.schema.js';
import { hashPlayerPassword } from '../middleware/player-auth.middleware.js';

// ── البحث عن لاعب بالهاتف ──────────────────────────

export async function findPlayerByPhone(phone: string) {
  const db = getDB();
  if (!db) return null;

  const result = await db.select().from(players).where(eq(players.phone, phone)).limit(1);
  return result[0] || null;
}

// ── البحث عن لاعب بالـ ID ──────────────────────────

export async function findPlayerById(playerId: number) {
  const db = getDB();
  if (!db) return null;

  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return result[0] || null;
}

// ── إنشاء لاعب جديد (مع كلمة سر) ──────────────────

export async function createPlayer(data: {
  phone: string;
  name: string;
  password?: string;
  gender?: string;
  dob?: string;
}) {
  const db = getDB();
  if (!db) return null;

  // تحقق من عدم التكرار
  const existing = await findPlayerByPhone(data.phone);
  if (existing) return existing;

  const passwordHash = data.password
    ? await hashPlayerPassword(data.password)
    : null;

  const result = await db.insert(players).values({
    phone: data.phone,
    passwordHash,
    mustChangePassword: !data.password,
    name: data.name,
    gender: normGender(data.gender),
    dob: data.dob || null,
    // 🔴 لا `lastActiveAt` عند الإنشاء: هذا بالضبط ما بُني العمودُ لإصلاحه —
    //    كان الموظّفُ يُنشئ الحسابَ في القاعة فيُقرأ ذلك «نشاطاً على
    //    التطبيق»، فصار ٣٤٧ من ٧٥١ قيمةً كاذبةً. يبقى NULL حتّى أوّلِ تفاعلٍ
    //    حقيقيّ، و«لا نعرف» حالةٌ صريحةٌ أصدقُ من تاريخٍ مخترَع.
  } as any).returning();

  console.log(`👤 New player created → ID: ${result[0]?.id}`);
  return result[0] || null;
}

// 🔴 حُذفت `touchPlayerActivity`: كانت تكتب `last_active_at` مباشرةً متجاوزةً
//    `touchLastActive`، فتُقدّم الختمَ الزمنيَّ وتترك `last_active_source` على
//    قيمته القديمة — فيصير المصدرُ كذبةً لا يكشفها شيء، والعمودُ بُني ليكون
//    مراجَعاً بمصدره. ومستدعيها الوحيد كان مسارَ `/lookup` المجهول، وقد أُزيل.
//    كلُّ كتابةٍ لآخر نشاطٍ تمرّ من `lib/last-active.ts` وحدَها.


// ── إنشاء حجز تلقائي للاعب بدون حجز ────────────────

export async function autoCreateBookingMember(data: {
  bookingId: number;
  playerId: number;
  name: string;
  phone?: string;
  isGuest?: boolean;
}) {
  const db = getDB();
  if (!db) return null;

  const result = await db.insert(bookingMembers).values({
    bookingId: data.bookingId,
    playerId: data.playerId,
    name: data.name,
    phone: data.phone || null,
    isGuest: data.isGuest || false,
    checkedIn: true,
  } as any).returning();

  return result[0] || null;
}

// ── هجرة اللاعبين القدامى: تعيين كلمة سر افتراضية ──

export async function migratePlayersWithDefaultPassword(): Promise<number> {
  const db = getDB();
  if (!db) return 0;

  try {
    // البحث عن لاعبين بدون كلمة سر
    const playersWithoutPassword = await db.select({ id: players.id })
      .from(players)
      .where(isNull(players.passwordHash));

    if (playersWithoutPassword.length === 0) return 0;

    const defaultHash = await hashPlayerPassword(PLAYER_DEFAULT_PASSWORD);

    await db.update(players)
      .set({
        passwordHash: defaultHash,
        mustChangePassword: true,
      } as any)
      .where(isNull(players.passwordHash));


    console.log(`🔄 Migrated ${playersWithoutPassword.length} players to a temporary default password — they must change it on first login`);
    return playersWithoutPassword.length;
  } catch (err: any) {
    console.error('❌ Failed to migrate players:', err.message);
    return 0;
  }
}

// ── جلب بروفايل اللاعب الكامل ───────────────────────

export async function getPlayerProfile(playerId: number) {
  const db = getDB();
  if (!db) return null;

  // 1. بيانات اللاعب الأساسية
  const playerData = await findPlayerById(playerId);
  if (!playerData) return null;

  // 2. سجل المباريات (من match_players — بالـ playerId أولاً ثم fallback بالاسم)
  let matchHistory: any[] = [];
  try {
    const { matchPlayers, matches } = await import('../schemas/game.schema.js');

    // محاولة 1: البحث بـ playerId (الطريقة الدقيقة)
    matchHistory = await db
      .select({
        matchId: matchPlayers.matchId,
        role: matchPlayers.role,
        physicalId: matchPlayers.physicalId,
        survived: matchPlayers.survivedToEnd,
        survivedToEnd: matchPlayers.survivedToEnd,
        matchWinner: matches.winner,
        seasonId: matches.seasonId,
        cityId: matches.cityId,
        matchDate: matches.createdAt,
        matchDuration: matches.durationSeconds,
        matchPlayerCount: matches.playerCount,
        xpEarned: matchPlayers.xpEarned,
        rrChange: matchPlayers.rrChange,
        // ── حقول التفصيل (كانت ناقصة → لا يظهر تفصيل النقاط) ──
        roundsSurvived: matchPlayers.roundsSurvived,
        eliminatedAtRound: matchPlayers.eliminatedAtRound,
        eliminatedDuring: matchPlayers.eliminatedDuring,
        dealInitiated: matchPlayers.dealInitiated,
        dealSuccess: matchPlayers.dealSuccess,
        abilityUsed: matchPlayers.abilityUsed,
        abilityCorrect: matchPlayers.abilityCorrect,
        penaltyCount: matchPlayers.penaltyCount,
        penaltyRRDeduction: matchPlayers.penaltyRRDeduction,
        bombRRChange: matchPlayers.bombRRChange,
        rewardBreakdown: matchPlayers.rewardBreakdown,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(eq(matchPlayers.playerId, playerId))
      .orderBy(desc(matches.createdAt))
      .limit(50);

    // محاولة 2: Fallback بالاسم (للبيانات القديمة بدون playerId)
    if (matchHistory.length === 0) {
      matchHistory = await db
        .select({
          matchId: matchPlayers.matchId,
          role: matchPlayers.role,
          physicalId: matchPlayers.physicalId,
          survived: matchPlayers.survivedToEnd,
          survivedToEnd: matchPlayers.survivedToEnd,
          matchWinner: matches.winner,
          seasonId: matches.seasonId,
          cityId: matches.cityId,
          matchDate: matches.createdAt,
          matchDuration: matches.durationSeconds,
          matchPlayerCount: matches.playerCount,
          xpEarned: matchPlayers.xpEarned,
          rrChange: matchPlayers.rrChange,
          roundsSurvived: matchPlayers.roundsSurvived,
          eliminatedAtRound: matchPlayers.eliminatedAtRound,
          eliminatedDuring: matchPlayers.eliminatedDuring,
          dealInitiated: matchPlayers.dealInitiated,
          dealSuccess: matchPlayers.dealSuccess,
          abilityUsed: matchPlayers.abilityUsed,
          abilityCorrect: matchPlayers.abilityCorrect,
          penaltyCount: matchPlayers.penaltyCount,
          penaltyRRDeduction: matchPlayers.penaltyRRDeduction,
          bombRRChange: matchPlayers.bombRRChange,
          rewardBreakdown: matchPlayers.rewardBreakdown,
        })
        .from(matchPlayers)
        .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
        .where(eq(matchPlayers.playerName, playerData.name))
        .orderBy(desc(matches.createdAt))
        .limit(50);
    }
  } catch (err: any) {
    console.error('⚠️ Failed to fetch match history for profile:', err.message);
  }

  // 🧮 إرفاق تفصيل النقاط الدقيق لكل مباراة (موحّد مع نقطة /:id/matches، مع بند تسوية)
  try {
    const { buildDisplayBreakdown } = await import('./progression.service.js');
    const { getProgressionConfig } = await import('../routes/progression-settings.routes.js');
    let cfgB: any; try { cfgB = await getProgressionConfig(); } catch { cfgB = undefined; }
    matchHistory = matchHistory.map((m: any) => ({ ...m, breakdown: buildDisplayBreakdown(m, cfgB) }));
  } catch (e: any) {
    console.warn('⚠️ Failed to attach breakdown to profile matches:', e.message);
  }

  // 🏙️ اسم مدينة كلّ مباراة (من الختم المجمَّد matches.city_id)
  try {
    const { cityMap } = await import('./cities.service.js');
    const cm = await cityMap();
    matchHistory = matchHistory.map((m: any) => ({ ...m, cityName: m.cityId != null ? (cm.get(Number(m.cityId))?.name ?? null) : null }));
  } catch { /* الاسم للعرض فقط */ }

  // 3. حساب الإحصائيات التفصيلية — **للموسم النشط وحده**
  // سجلّ المباريات المعروض يبقى عابراً للمواسم (تاريخ اللاعب الكامل)، أمّا الإحصاءات
  // المشتقّة منه (نسبة الفوز/النجاة، توزيع الأدوار، أطول سلسلة) فتُحسب من مباريات الموسم
  // النشط فقط، وإلّا ناقضت عدّادات الموسم: بعد بدء موسم جديد كانت تُعرض «٠ مباراة» بجانب
  // «٦٠٪ نسبة فوز» و«٢٠ مباراة مافيا» من الموسم المنتهي.
  const { getActiveRegularSeasonId } = await import('./season.service.js');
  const activeSeasonId = await getActiveRegularSeasonId().catch(() => null);
  const seasonMatches = activeSeasonId != null
    ? matchHistory.filter((m: any) => m.seasonId === activeSeasonId)
    : matchHistory;

  const roleStats: Record<string, number> = {};
  let mafiaWins = 0, citizenWins = 0;
  let mafiaGames = 0, citizenGames = 0;
  let currentStreak = 0, maxStreak = 0;

  for (const m of seasonMatches) {
    if (m.role) {
      roleStats[m.role] = (roleStats[m.role] || 0) + 1;
    }

    // 🔴 المصدرُ الموحَّد لا قائمةٌ منسوخة: القائمةُ اليدويّة كانت رباعيّةً
    //    فتُسقط WITCH و OLDER_BROTHER — وهما مافيا في MAFIA_ROLES. النتيجةُ
    //    مقيسةٌ على الإنتاج: ٥٣ فوزَ مافيا حقيقيّاً يُقرأ خسارةً.
    const team = teamOfRole(m.role);
    const isMafia = team === 'MAFIA';

    if (isMafia) mafiaGames++;
    else citizenGames++;

    // 🔴 والفوزُ رباعيٌّ لا ثنائيّ: `matches.winner` في القاعدة له أربع قيم
    //    (MAFIA · CITIZEN · JESTER · ASSASSIN). المقارنةُ الثنائيّة كانت تقرأ
    //    كلَّ فائزٍ محايدٍ خاسراً — ٤٣ فوزاً محايداً لا يُحتسب أصلاً.
    const won = m.matchWinner === 'MAFIA' ? isMafia
      : m.matchWinner === 'CITIZEN' ? team === 'CITIZEN'
      : m.matchWinner === 'JESTER' ? m.role === 'JESTER'
      : m.matchWinner === 'ASSASSIN' ? m.role === 'ASSASSIN'
      : false;

    if (won) {
      if (isMafia) mafiaWins++;
      else citizenWins++;
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const favoriteRole = Object.entries(roleStats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const avgSurvival = seasonMatches.length > 0
    ? Math.round((seasonMatches.filter((m: any) => m.survived).length / seasonMatches.length) * 100)
    : 0;
  const winRate = seasonMatches.length > 0
    ? Math.round(((mafiaWins + citizenWins) / seasonMatches.length) * 100)
    : 0;
  const mafiaWinRate = mafiaGames > 0 ? Math.round((mafiaWins / mafiaGames) * 100) : 0;
  const citizenWinRate = citizenGames > 0 ? Math.round((citizenWins / citizenGames) * 100) : 0;

  // ── بيانات التقدم — من صفّ (الموسم النشط، المدينة الأساسيّة) في player_season_stats ──
  // 🏙️ المصدرُ الحقيقيّ صفوف المدن؛ مرآةُ players.* تُستعمل احتياطاً فقط (لاعبٌ بلا موسمٍ نشط).
  const { xpForNextLevel, rrRequiredForTier } = await import('./progression.service.js');
  let homeCityId: number | null = null;
  let homeCityName: string | null = null;
  let standings: any[] = [];
  let homeStanding: any = null;
  try {
    const { getOrInferHomeCity, getStandings, getStanding } = await import('./season.service.js');
    const { cityNameOf } = await import('./cities.service.js');
    if (activeSeasonId != null) {
      homeCityId = await getOrInferHomeCity(playerId, activeSeasonId);
      standings = await getStandings(playerId, activeSeasonId, homeCityId);
      if (homeCityId != null) {
        homeStanding = standings.find((s: any) => s.cityId === homeCityId) ?? await getStanding(playerId, activeSeasonId, homeCityId);
      }
    } else {
      const [p] = await db.select({ home: players.homeCityId }).from(players).where(eq(players.id, playerId)).limit(1);
      homeCityId = p?.home ?? null;
    }
    homeCityName = await cityNameOf(homeCityId);
  } catch (e: any) {
    console.warn('⚠️ standings lookup failed:', e?.message || e);
  }
  const src: any = homeStanding ?? playerData;
  const currentXP = src.xp || 0;
  const currentLevel = src.level || 1;
  const nextLevelXP = xpForNextLevel(currentLevel);
  // clamp 0..100 — بعد تعديل يدوي قد يتجاوز xp متطلب المستوى مؤقتاً؛ لا نعرض شريطاً >100%
  const xpProgress = nextLevelXP > 0 ? Math.min(100, Math.max(0, Math.round((currentXP / nextLevelXP) * 100))) : 0;
  const homeMatches = homeStanding ? homeStanding.totalMatches : (playerData.totalMatches ?? seasonMatches.length);
  const homeWins = homeStanding ? homeStanding.totalWins : (playerData.totalWins ?? (mafiaWins + citizenWins));

  // 🔒 تعقيم مخرجات البروفايل — هذا المصدر يخدم مساراً عاماً غير مصادق
  //    (GET /api/player/:id/profile) فيجب ألا يحمل أسراراً ولا بيانات مالية:
  //    • passwordHash: لا يخرج من الخادم أبداً.
  //    • chips_*: الرصيد والتجهيز يُقرآن من /api/chips/me خلف مصادقة اللاعب.
  const {
    passwordHash: _pwd,
    chipsBalance: _cb,
    chipsFrameItemId: _cf,
    chipsTitleItemId: _ct,
    chipsNameFxItemId: _cn,
    ...safePlayer
  } = playerData as any;

  return {
    player: safePlayer,
    // 🏙️ المدينة الأساسيّة + رتبةٌ لكلّ مدينةٍ لعب فيها هذا الموسم
    homeCityId,
    homeCityName,
    standings,
    stats: {
      // ?? لا || — الصفر قيمة صادقة بعد تصفير الموسم؛ السقوط على تاريخ المباريات
      // كان يُظهر عدّادات الموسم القديم بعد بدء موسم جديد.
      totalMatches: homeMatches,
      totalWins: homeWins,
      winRate,
      survivalRate: avgSurvival,
      favoriteRole,
      mafiaWins,
      citizenWins,
      mafiaGames,
      citizenGames,
      mafiaWinRate,
      citizenWinRate,
      longestWinStreak: maxStreak,
      roleDistribution: roleStats,
    },
    progression: {
      xp: currentXP,
      level: currentLevel,
      nextLevelXP,
      xpProgress,
      rankTier: src.rankTier || 'INFORMANT',
      rankRR: src.rankRR || 0,
      rrRequired: rrRequiredForTier(src.rankTier || 'INFORMANT'),
      totalDeals: src.totalDeals || 0,
      successfulDeals: src.successfulDeals || 0,
      dealSuccessRate: (src.totalDeals || 0) > 0
        ? Math.round(((src.successfulDeals || 0) / src.totalDeals) * 100)
        : 0,
      cityId: homeCityId,
      cityName: homeCityName,
    },
    matchHistory,
  };
}

// ── جلب آخر الأدوار التاريخية للاعب ──────────────────────
export async function getPlayerLastRoles(playerId: number, limit = 3): Promise<string[]> {
  const db = getDB();
  if (!db || limit <= 0) return [];
  try {
    const { matchPlayers } = await import('../schemas/game.schema.js');
    const records = await db
      .select({ role: matchPlayers.role })
      .from(matchPlayers)
      .where(eq(matchPlayers.playerId, playerId))
      .orderBy(desc(matchPlayers.id))
      .limit(limit);
    return records.map(r => r.role);
  } catch (err: any) {
    console.error(`⚠️ Failed to fetch last roles for player ${playerId}:`, err.message);
    return [];
  }
}

