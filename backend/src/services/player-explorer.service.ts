// ══════════════════════════════════════════════════════
// 🔎 مستكشف اللاعبين — Player Explorer Service
// استعلامٌ حيٌّ واحد يجيب: من أتى، من عاد، من حجز ولم يحضر، كم دفع، وهل رضي.
//
// لا كاش هنا عمداً — الجداول صغيرة (٧١٣ لاعباً · ٦١٠٢ صفّ مشاركة) واستعلام
// ثمانية أبعاد لكلّ اللاعبين قِيس بـ٥.٥ مللي ثانية على الإنتاج. الكاش الليليّ في
// analytics.service هو سببُ جمود تلك الصفحة لا حلٌّ لها.
//
// 🔑 نافذتان زمنيّتان **مستقلّتان**:
//   signupFrom/To  = نافذة إنشاء الحساب  → أيُّ فوجٍ ننظر إليه
//   windowFrom/To  = نافذة القياس        → على أيّ مدى نقيس حضوره ومالَه
// حين تُترك نافذة القياس فارغة يُقاس كلُّ لاعبٍ **من تاريخ تسجيله هو** — وحين
// تُملأ تصير مطلقةً للجميع (فترة النادي لا فترة اللاعب). بلا هذا الفصل لا يمكن
// السؤال «ماذا فعل فوجُ تمّوز في آب؟».
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { Database } from '../config/db.js';

// ── العدسة ────────────────────────────────────────────
export interface ExplorerLens {
  signupFrom?: string | null;      // YYYY-MM-DD
  signupTo?: string | null;
  windowFrom?: string | null;
  windowTo?: string | null;
  locationIds?: number[];
  seasonIds?: number[];
  gender?: 'MALE' | 'FEMALE' | null;
  minActivities?: number | null;
  maxActivities?: number | null;
  includeTestLocations?: boolean;  // افتراضي false
  includeTestAccounts?: boolean;   // افتراضي true — حسابٌ حقيقيّ له وصولٌ لمواقع الاختبار، ليس حساباً وهميّاً
}

export interface ExplorerActivity {
  id: number; name: string; date: string | null; location: string | null;
  matches: number; wins: number; spend: number;
}

export interface ExplorerPlayer {
  // الهويّة
  id: number; name: string; phone: string; gender: string | null;
  dob: string | null; email: string | null;
  createdAt: string; lastActiveAt: string | null;
  rankTier: string | null; level: number; isTestAccount: boolean; hasPush: boolean;
  // الحضور
  activities: number; matches: number; wins: number; losses: number; survived: number;
  matchesWithoutActivity: number;
  firstActivityAt: string | null; lastActivityAt: string | null;
  daysToFirstActivity: number | null; daysSinceLastActivity: number | null;
  longestGapDays: number; locationsCount: number; activitiesMissedSince: number;
  // التحويل
  bookings: number; bookedActivities: number; attendedOfBooked: number;
  noShows: number; walkIns: number;
  // المال
  paidTotal: number; unpaidTotal: number; fnbTotal: number;
  chipsEarned: number; chipsSpent: number; chipsTopupJod: number;
  // الجودة والمخاطر
  feedbackCount: number; feedbackAvg: number | null; lastFeedbackAt: string | null;
  cheatSignals: number; cheatWeight: number; penalties: number;
  followers: number; following: number;
  // التفصيل
  acts: ExplorerActivity[];
}

export interface ExplorerTotals {
  players: number; attended: number; returned: number; regular: number; neverAttended: number;
  activities: number; matches: number; wins: number;
  bookings: number; noShows: number; walkIns: number;
  paidTotal: number; unpaidTotal: number; fnbTotal: number;
  chipsEarned: number; chipsSpent: number; chipsTopupJod: number;
  feedbackCount: number; feedbackAvg: number | null; withPush: number;
  avgActivities: number; returnRate: number; noShowRate: number; winRate: number;
}

export interface ExplorerResult {
  generatedAt: string;
  tookMs: number;
  lens: Required<Omit<ExplorerLens, 'gender'>> & { gender: string | null };
  totals: ExplorerTotals;
  funnel: { key: string; labelAr: string; count: number; pct: number }[];
  distribution: { activities: number; players: number }[];
  players: ExplorerPlayer[];
}

// ── تطبيع العدسة ──────────────────────────────────────
const asDate = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const asIdList = (v: unknown): number[] => {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(',');
  return [...new Set(raw.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0))];
};
const asCount = (v: unknown): number | null => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const asBool = (v: unknown, dflt: boolean): boolean => {
  if (v === undefined || v === null || v === '') return dflt;
  return v === true || v === 'true' || v === '1' || v === 1;
};

export function normalizeLens(raw: any): ExplorerResult['lens'] {
  const gender = raw?.gender === 'MALE' || raw?.gender === 'FEMALE' ? raw.gender : null;
  return {
    signupFrom: asDate(raw?.signupFrom),
    signupTo: asDate(raw?.signupTo),
    windowFrom: asDate(raw?.windowFrom),
    windowTo: asDate(raw?.windowTo),
    locationIds: asIdList(raw?.locationIds),
    seasonIds: asIdList(raw?.seasonIds),
    gender,
    minActivities: asCount(raw?.minActivities),
    maxActivities: asCount(raw?.maxActivities),
    includeTestLocations: asBool(raw?.includeTestLocations, false),
    includeTestAccounts: asBool(raw?.includeTestAccounts, true),
  };
}

/** ملخّصٌ عربيٌّ للعدسة — يُستخدم في رأس التقرير المُصدَّر. */
export function lensSummaryAr(l: ExplorerResult['lens'], locNames?: Map<number, string>): string[] {
  const out: string[] = [];
  out.push(l.signupFrom || l.signupTo
    ? `أُنشئ الحساب ${l.signupFrom ? `من ${l.signupFrom}` : ''}${l.signupTo ? ` إلى ${l.signupTo}` : ''}`.trim()
    : 'كلّ الحسابات');
  out.push(l.windowFrom || l.windowTo
    ? `القياس ${l.windowFrom ? `من ${l.windowFrom}` : ''}${l.windowTo ? ` إلى ${l.windowTo}` : ''}`.trim()
    : 'القياس منذ تسجيل كلّ لاعب');
  if (l.locationIds.length) out.push(`المواقع: ${l.locationIds.map((i) => locNames?.get(i) || i).join('، ')}`);
  if (l.seasonIds.length) out.push(`المواسم: ${l.seasonIds.join('، ')}`);
  if (l.gender) out.push(`الجنس: ${l.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}`);
  if (l.minActivities != null || l.maxActivities != null) {
    out.push(`عدد الفعاليّات ${l.minActivities != null ? `≥ ${l.minActivities}` : ''}${l.minActivities != null && l.maxActivities != null ? ' و' : ''}${l.maxActivities != null ? `≤ ${l.maxActivities}` : ''}`);
  }
  if (l.includeTestLocations) out.push('يشمل مواقع الاختبار');
  if (!l.includeTestAccounts) out.push('يستثني الحسابات التجريبيّة');
  return out;
}

// ── الاستعلام ─────────────────────────────────────────
export async function explore(db: Database, rawLens: any): Promise<ExplorerResult> {
  const t0 = Date.now();
  const l = normalizeLens(rawLens);

  // قوائم المعرّفات تُمرَّر نصّاً ثمّ تُفكَّك في SQL — أمتنُ من تمرير المصفوفات عبر السائق
  const locCsv = l.locationIds.length ? l.locationIds.join(',') : null;
  const seaCsv = l.seasonIds.length ? l.seasonIds.join(',') : null;

  const res: any = await db.execute(sql`
    WITH cohort AS (
      SELECT p.id, BTRIM(p.name) AS name, p.phone, p.gender, NULLIF(p.dob,'') AS dob,
             NULLIF(p.email,'') AS email, p.created_at, p.last_active_at,
             p.rank_tier, p.level, COALESCE(p.is_test_account,false) AS is_test,
             -- 🔑 حدّا القياس لكلّ لاعب: نافذةٌ مطلقةٌ إن حُدّدت، وإلّا فمنذ تسجيله هو.
             -- 🔴 بدقّة **اليوم** لا الطابع الزمنيّ: اللاعب يُنشئ حسابه في المكان بعد أن
             --    تكون الفعاليّة قد بدأت (فعاليّة ١٧:٣٣ · تسجيل ١٩:٢٠)، فالمقارنة بالطابع
             --    الزمنيّ كانت تُسقط ٢٤٤ حجزاً من ٥١٠ لفوج تمّوز وتصنع «حضوراً بلا حجز» وهميّاً.
             COALESCE(${l.windowFrom}::date, p.created_at::date) AS w_from,
             COALESCE(${l.windowTo}::date, CURRENT_DATE)         AS w_to
      FROM players p
      WHERE (${l.signupFrom}::date IS NULL OR p.created_at >= ${l.signupFrom}::date)
        AND (${l.signupTo}::date   IS NULL OR p.created_at <  ${l.signupTo}::date + 1)
        AND (${l.gender}::text     IS NULL OR p.gender = ${l.gender}::text)
        AND (${l.includeTestAccounts} OR COALESCE(p.is_test_account,false) = false)
    ),
    -- الفعاليّات المحتسَبة على مستوى النادي (لقياس «كم فاته منذ آخر حضور»)
    club_acts AS (
      SELECT a.id, a.date::date AS adate
      FROM activities a LEFT JOIN locations lo ON lo.id = a.location_id
      WHERE a.deleted_at IS NULL
        AND (${l.includeTestLocations} OR lo.is_test_location IS NOT TRUE)
        AND (${locCsv}::text IS NULL OR a.location_id = ANY(string_to_array(${locCsv}::text, ',')::int[]))
    ),
    -- صفٌّ لكلّ (لاعب، مباراة) داخل نافذة القياس
    plays AS (
      SELECT c.id AS pid, m.id AS mid, m.created_at AS played_at, m.season_id,
             s.activity_id AS aid, a.name AS aname, a.date::date AS adate,
             a.location_id AS lid, lo.name AS lname,
             mp.survived_to_end, COALESCE(mp.penalty_count,0) AS penalty_count,
             CASE
               WHEN m.winner IS NULL THEN false
               WHEN m.winner::text = 'CITIZEN'  AND rd.team::text = 'CITIZEN' THEN true
               WHEN m.winner::text = 'MAFIA'    AND rd.team::text = 'MAFIA'   THEN true
               WHEN m.winner::text = 'JESTER'   AND mp.role = 'JESTER'        THEN true
               WHEN m.winner::text = 'ASSASSIN' AND mp.role = 'ASSASSIN'      THEN true
               ELSE false
             END AS is_win
      FROM cohort c
      JOIN match_players mp ON mp.player_id = c.id
      JOIN matches m  ON m.id = mp.match_id AND m.deleted_at IS NULL
      LEFT JOIN sessions s   ON s.id = m.session_id
      LEFT JOIN activities a ON a.id = s.activity_id AND a.deleted_at IS NULL
      LEFT JOIN locations lo ON lo.id = a.location_id
      LEFT JOIN role_definitions rd ON rd.id = mp.role
      WHERE m.created_at::date BETWEEN c.w_from AND c.w_to
        AND (${l.includeTestLocations} OR lo.is_test_location IS NOT TRUE)
        AND (${locCsv}::text IS NULL OR a.location_id = ANY(string_to_array(${locCsv}::text, ',')::int[]))
        AND (${seaCsv}::text IS NULL OR m.season_id   = ANY(string_to_array(${seaCsv}::text, ',')::int[]))
    ),
    per_act AS (
      SELECT pid, aid, MAX(aname) AS aname, MAX(adate) AS adate, MAX(lname) AS lname,
             COUNT(DISTINCT mid) AS matches, COUNT(*) FILTER (WHERE is_win) AS wins
      FROM plays WHERE aid IS NOT NULL GROUP BY pid, aid
    ),
    agg_play AS (
      SELECT pid,
        COUNT(DISTINCT mid) AS matches,
        COUNT(*) FILTER (WHERE is_win)      AS wins,
        COUNT(*) FILTER (WHERE NOT is_win)  AS losses,
        COUNT(*) FILTER (WHERE survived_to_end) AS survived,
        COUNT(*) FILTER (WHERE aid IS NULL) AS matches_no_activity,
        SUM(penalty_count)::int             AS penalties
      FROM plays GROUP BY pid
    ),
    -- أطول انقطاع: مسحةٌ واحدة بـLAG على كلّ الصفوف بدل استعلامٍ مرتبطٍ لكلّ لاعب
    gaps AS (
      SELECT pid, MAX(gap)::int AS longest FROM (
        SELECT pid, (adate - LAG(adate) OVER (PARTITION BY pid ORDER BY adate)) AS gap
        FROM per_act
      ) g GROUP BY pid
    ),
    agg_act AS (
      SELECT pid, COUNT(*)::int AS activities,
             MIN(adate) AS first_at, MAX(adate) AS last_at,
             COUNT(DISTINCT lname)::int AS locations
      FROM per_act GROUP BY pid
    ),
    -- الحجوزات داخل النافذة، منسوبةً بتاريخ الفعاليّة (نفس أساس نظام التقارير)
    bk AS (
      SELECT c.id AS pid,
        COUNT(*)::int AS bookings,
        COUNT(DISTINCT b.activity_id)::int AS booked_activities,
        COALESCE(SUM(CASE WHEN b.is_paid AND NOT b.is_free THEN b.paid_amount::numeric ELSE 0 END),0) AS paid,
        COALESCE(SUM(CASE WHEN NOT b.is_paid AND NOT b.is_free THEN b.paid_amount::numeric ELSE 0 END),0) AS unpaid,
        -- 🐞 لا يُستعمل b.checked_in: الحقل ميّت (١٢ صفّاً من ٢٠٨٠ على الإنتاج).
        --    عدم الحضور يُشتقّ من الحضور الفعليّ: حجزٌ بلا صفّ مشاركةٍ في فعاليّته.
        COUNT(DISTINCT b.activity_id) FILTER (
          WHERE NOT EXISTS (SELECT 1 FROM per_act pa WHERE pa.pid = c.id AND pa.aid = b.activity_id)
        )::int AS no_shows
      FROM cohort c
      JOIN bookings b ON b.player_id = c.id AND b.deleted_at IS NULL
      JOIN activities a ON a.id = b.activity_id AND a.deleted_at IS NULL
      LEFT JOIN locations lo ON lo.id = a.location_id
      WHERE a.date::date BETWEEN c.w_from AND c.w_to
        AND (${l.includeTestLocations} OR lo.is_test_location IS NOT TRUE)
        AND (${locCsv}::text IS NULL OR a.location_id = ANY(string_to_array(${locCsv}::text, ',')::int[]))
      GROUP BY c.id
    ),
    -- طلبات المنيو (غير الملغاة) منسوبةً بتاريخ الفعاليّة أيضاً
    fnb AS (
      SELECT c.id AS pid, COALESCE(SUM(o.total::numeric),0) AS fnb_total,
             COALESCE(SUM(o.total::numeric) FILTER (WHERE o.activity_id IS NOT NULL),0) AS fnb_in_act
      FROM cohort c
      JOIN orders o ON o.player_id = c.id AND o.status <> 'cancelled'
      JOIN activities a ON a.id = o.activity_id AND a.deleted_at IS NULL
      LEFT JOIN locations lo ON lo.id = a.location_id
      WHERE a.date::date BETWEEN c.w_from AND c.w_to
        AND (${l.includeTestLocations} OR lo.is_test_location IS NOT TRUE)
        AND (${locCsv}::text IS NULL OR a.location_id = ANY(string_to_array(${locCsv}::text, ',')::int[]))
      GROUP BY c.id
    ),
    fnb_per_act AS (
      SELECT c.id AS pid, o.activity_id AS aid, SUM(o.total::numeric) AS spend
      FROM cohort c JOIN orders o ON o.player_id = c.id AND o.status <> 'cancelled'
      GROUP BY c.id, o.activity_id
    ),
    -- التشبس: مؤشّرُ تفاعلٍ لا إيراد (jod_amount مملوءٌ في صفٍّ واحدٍ على الإنتاج)
    chips AS (
      SELECT c.id AS pid,
        COALESCE(SUM(cl.amount) FILTER (WHERE cl.amount > 0),0)::int AS earned,
        COALESCE(-SUM(cl.amount) FILTER (WHERE cl.amount < 0),0)::int AS spent,
        COALESCE(SUM(cl.jod_amount::numeric) FILTER (WHERE cl.reason = 'admin_topup'),0) AS topup_jod
      FROM cohort c JOIN chips_ledger cl ON cl.player_id = c.id
      WHERE cl.created_at::date BETWEEN c.w_from AND c.w_to
      GROUP BY c.id
    ),
    fb AS (
      SELECT c.id AS pid, COUNT(*)::int AS n, ROUND(AVG(f.overall)::numeric,2) AS avg_overall,
             MAX(COALESCE(f.played_at, f.created_at))::date AS last_at
      FROM cohort c JOIN room_feedback f ON f.player_id = c.id
      WHERE f.submitted_at IS NOT NULL AND f.overall IS NOT NULL
        AND COALESCE(f.played_at, f.created_at)::date BETWEEN c.w_from AND c.w_to
      GROUP BY c.id
    ),
    risk AS (
      SELECT c.id AS pid, COUNT(*)::int AS signals, COALESCE(SUM(cs.weight),0)::int AS weight
      FROM cohort c JOIN cheat_signals cs ON cs.player_id = c.id
      WHERE cs.created_at::date BETWEEN c.w_from AND c.w_to
      GROUP BY c.id
    ),
    social AS (
      SELECT c.id AS pid,
        (SELECT COUNT(*)::int FROM player_follows f1 WHERE f1.following_id = c.id) AS followers,
        (SELECT COUNT(*)::int FROM player_follows f2 WHERE f2.follower_id  = c.id) AS following
      FROM cohort c
    )
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) AS payload FROM (
      SELECT
        c.id, c.name, c.phone, c.gender, c.dob, c.email,
        to_char(c.created_at,'YYYY-MM-DD"T"HH24:MI:SS')      AS "createdAt",
        to_char(c.last_active_at,'YYYY-MM-DD"T"HH24:MI:SS')  AS "lastActiveAt",
        c.rank_tier AS "rankTier", COALESCE(c.level,1) AS level, c.is_test AS "isTestAccount",
        EXISTS (SELECT 1 FROM player_fcm_tokens tk WHERE tk.player_id = c.id AND tk.is_active) AS "hasPush",

        COALESCE(aa.activities,0) AS activities,
        COALESCE(ap.matches,0) AS matches, COALESCE(ap.wins,0) AS wins,
        COALESCE(ap.losses,0) AS losses, COALESCE(ap.survived,0) AS survived,
        COALESCE(ap.matches_no_activity,0) AS "matchesWithoutActivity",
        to_char(aa.first_at,'YYYY-MM-DD') AS "firstActivityAt",
        to_char(aa.last_at,'YYYY-MM-DD')  AS "lastActivityAt",
        (aa.first_at - c.created_at::date) AS "daysToFirstActivity",
        (CURRENT_DATE - aa.last_at)        AS "daysSinceLastActivity",
        COALESCE(gp.longest,0) AS "longestGapDays",
        COALESCE(aa.locations,0) AS "locationsCount",
        (SELECT COUNT(*)::int FROM club_acts ca
          WHERE ca.adate > COALESCE(aa.last_at, c.created_at::date)) AS "activitiesMissedSince",

        COALESCE(bk.bookings,0) AS bookings,
        COALESCE(bk.booked_activities,0) AS "bookedActivities",
        GREATEST(COALESCE(bk.booked_activities,0) - COALESCE(bk.no_shows,0), 0) AS "attendedOfBooked",
        COALESCE(bk.no_shows,0) AS "noShows",
        GREATEST(COALESCE(aa.activities,0) - (COALESCE(bk.booked_activities,0) - COALESCE(bk.no_shows,0)), 0) AS "walkIns",

        COALESCE(bk.paid,0)::float8   AS "paidTotal",
        COALESCE(bk.unpaid,0)::float8 AS "unpaidTotal",
        COALESCE(fn.fnb_total,0)::float8 AS "fnbTotal",
        COALESCE(ch.earned,0) AS "chipsEarned", COALESCE(ch.spent,0) AS "chipsSpent",
        COALESCE(ch.topup_jod,0)::float8 AS "chipsTopupJod",

        COALESCE(fb.n,0) AS "feedbackCount", fb.avg_overall::float8 AS "feedbackAvg",
        to_char(fb.last_at,'YYYY-MM-DD') AS "lastFeedbackAt",
        COALESCE(rk.signals,0) AS "cheatSignals", COALESCE(rk.weight,0) AS "cheatWeight",
        COALESCE(ap.penalties,0) AS penalties,
        COALESCE(so.followers,0) AS followers, COALESCE(so.following,0) AS following,

        COALESCE((
          SELECT json_agg(json_build_object(
            'id', pa.aid, 'name', pa.aname, 'date', to_char(pa.adate,'YYYY-MM-DD'),
            'location', pa.lname, 'matches', pa.matches, 'wins', pa.wins,
            'spend', COALESCE((SELECT fp.spend::float8 FROM fnb_per_act fp
                                WHERE fp.pid = c.id AND fp.aid = pa.aid), 0)
          ) ORDER BY pa.adate)
          FROM per_act pa WHERE pa.pid = c.id), '[]'::json) AS acts
      FROM cohort c
      LEFT JOIN agg_act  aa ON aa.pid = c.id
      LEFT JOIN agg_play ap ON ap.pid = c.id
      LEFT JOIN gaps     gp ON gp.pid = c.id
      LEFT JOIN bk          ON bk.pid = c.id
      LEFT JOIN fnb      fn ON fn.pid = c.id
      LEFT JOIN chips    ch ON ch.pid = c.id
      LEFT JOIN fb          ON fb.pid = c.id
      LEFT JOIN risk     rk ON rk.pid = c.id
      LEFT JOIN social   so ON so.pid = c.id
      ORDER BY COALESCE(aa.activities,0) DESC, COALESCE(ap.matches,0) DESC, c.id
    ) t
  `);

  const rows: ExplorerPlayer[] = ((res.rows ? res.rows[0]?.payload : res[0]?.payload) || []) as any;

  // فلترة عدد الفعاليّات تُطبَّق هنا لا في SQL — كي يبقى الفلتر متطابقاً بين الشاشة
  // والملفّ المُصدَّر مهما تغيّرت بقيّة العدسة، وكي يظلّ الاستعلام كتلةً واحدة.
  const players = rows.filter((p) =>
    (l.minActivities == null || p.activities >= l.minActivities) &&
    (l.maxActivities == null || p.activities <= l.maxActivities));

  return {
    generatedAt: new Date().toISOString(),
    tookMs: Date.now() - t0,
    lens: l,
    totals: computeTotals(players),
    funnel: computeFunnel(players),
    distribution: computeDistribution(players),
    players,
  };
}

// ── التجميعات (تُحسب من نفس الصفوف كي تتطابق الشاشة والتصدير حرفيّاً) ──
const sum = (a: ExplorerPlayer[], f: (p: ExplorerPlayer) => number) => a.reduce((s, p) => s + (f(p) || 0), 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
/** نسبةٌ مئويّة: صحيحةٌ فوق ١٪، وبخانةٍ عشريّةٍ تحتها — «٠٪» فوق حالاتٍ فعليّةٍ كذبٌ صغير. */
const rate = (part: number, whole: number): number => {
  if (!whole) return 0;
  const v = (part / whole) * 100;
  return v > 0 && v < 1 ? Math.round(v * 10) / 10 : Math.round(v);
};

export function computeTotals(a: ExplorerPlayer[]): ExplorerTotals {
  const players = a.length;
  const attended = a.filter((p) => p.activities > 0).length;
  const returned = a.filter((p) => p.activities >= 2).length;
  const regular = a.filter((p) => p.activities >= 3).length;
  const activities = sum(a, (p) => p.activities);
  const matches = sum(a, (p) => p.matches);
  const wins = sum(a, (p) => p.wins);
  const bookings = sum(a, (p) => p.bookedActivities);
  const noShows = sum(a, (p) => p.noShows);
  const fbCount = sum(a, (p) => p.feedbackCount);
  const fbSum = a.reduce((s, p) => s + (p.feedbackAvg || 0) * p.feedbackCount, 0);

  return {
    players, attended, returned, regular, neverAttended: players - attended,
    activities, matches, wins,
    bookings, noShows, walkIns: sum(a, (p) => p.walkIns),
    paidTotal: round2(sum(a, (p) => p.paidTotal)),
    unpaidTotal: round2(sum(a, (p) => p.unpaidTotal)),
    fnbTotal: round2(sum(a, (p) => p.fnbTotal)),
    chipsEarned: sum(a, (p) => p.chipsEarned),
    chipsSpent: sum(a, (p) => p.chipsSpent),
    chipsTopupJod: round2(sum(a, (p) => p.chipsTopupJod)),
    feedbackCount: fbCount,
    feedbackAvg: fbCount ? round2(fbSum / fbCount) : null,
    withPush: a.filter((p) => p.hasPush).length,
    avgActivities: attended ? round2(activities / attended) : 0,
    returnRate: rate(returned, attended),
    noShowRate: rate(noShows, bookings),
    winRate: rate(wins, matches),
  };
}

// 🔴 لا خطوةَ «حجزوا» هنا رغم أنّها كانت في التصميم: الحجز ليس مرحلةً سابقةً
//    للحضور بل مسارٌ موازٍ له. على بيانات الإنتاج ٢٦٩ حجزوا مقابل ٢٧١ حضروا،
//    فكان القمع **يرتفع** — وقمعٌ يرتفع ليس قمعاً. تحليل الحجز مقابل الحضور
//    يعيش في ConversionStrip حيث المقارنة بين المسارَين هي المقصودة أصلاً.
export function computeFunnel(a: ExplorerPlayer[]): ExplorerResult['funnel'] {
  const n = a.length || 1;
  const steps: [string, string, number][] = [
    ['signed',   'أنشأوا حساباً',        a.length],
    ['attended', 'حضروا فعاليّةً واحدة',  a.filter((p) => p.activities >= 1).length],
    ['returned', 'عادوا لفعاليّةٍ ثانية', a.filter((p) => p.activities >= 2).length],
    ['regular',  'انتظموا (٣ فأكثر)',    a.filter((p) => p.activities >= 3).length],
  ];
  return steps.map(([key, labelAr, count]) => ({ key, labelAr, count, pct: Math.round((count / n) * 100) }));
}

export function computeDistribution(a: ExplorerPlayer[]): ExplorerResult['distribution'] {
  const m = new Map<number, number>();
  a.forEach((p) => m.set(p.activities, (m.get(p.activities) || 0) + 1));
  return [...m.entries()].sort((x, y) => x[0] - y[0]).map(([activities, players]) => ({ activities, players }));
}

// ── العدسات المحفوظة ──────────────────────────────────
// تُخزَّن في analytics_config الموجود (key VARCHAR(40) PRIMARY KEY, value JSONB)
// تحت المفتاح 'explorer_views' — فلا هجرةَ ولا جدولَ جديد.

export interface SavedView { id: string; name: string; lens: ExplorerResult['lens']; createdAt: string; createdBy?: string; }

const VIEWS_KEY = 'explorer_views';
const MAX_VIEWS = 40;

export async function listViews(db: Database): Promise<SavedView[]> {
  const res: any = await db.execute(
    sql`SELECT value FROM analytics_config WHERE key = ${VIEWS_KEY} LIMIT 1`);
  const row = res.rows ? res.rows[0] : res[0];
  const v = row?.value;
  return Array.isArray(v) ? v : [];
}

async function writeViews(db: Database, views: SavedView[]): Promise<void> {
  await db.execute(sql`
    INSERT INTO analytics_config (key, value, updated_at)
    VALUES (${VIEWS_KEY}, ${JSON.stringify(views)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
}

export async function addView(db: Database, name: string, rawLens: any, createdBy?: string): Promise<SavedView[]> {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) throw new Error('اسم العدسة مطلوب');
  const views = await listViews(db);
  if (views.length >= MAX_VIEWS) throw new Error(`الحدّ الأقصى ${MAX_VIEWS} عدسة محفوظة — احذف واحدة أولاً`);
  // الاسم نفسه يستبدل العدسة القديمة بدل أن يضيف نسخةً ثانية
  const next = views.filter((v) => v.name !== clean);
  next.unshift({
    id: `v${Date.now().toString(36)}`, name: clean,
    lens: normalizeLens(rawLens), createdAt: new Date().toISOString(), createdBy,
  });
  await writeViews(db, next);
  return next;
}

export async function deleteView(db: Database, id: string): Promise<SavedView[]> {
  const next = (await listViews(db)).filter((v) => v.id !== id);
  await writeViews(db, next);
  return next;
}
