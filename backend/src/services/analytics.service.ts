// ══════════════════════════════════════════════════════
// 📊 خدمة تحليلات اللاعبين — Player Analytics Service
// تحسب مقاييس سلوك كل لاعب (عبر كل المواسم) وتخزّنها في كاش (تحديث ليليّ + يدويّ).
// التصنيف نفسه يُطبَّق في الواجهة عبر قواعد قابلة للتخصيص (analytics_config).
// الفلاتر الثابتة: حسابات مسجّلة فقط (بلا ضيوف) · استبعاد مواقع الاختبار و«Auto Seeded».
// حسابات الاختبار مُبقاة ومُميّزة (isTest) — تُظهَر/تُخفى في الواجهة.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { analyticsCache, analyticsConfig } from '../schemas/admin.schema.js';
import { eq } from 'drizzle-orm';

const WINDOW_DAYS = 30; // نافذة عدّادات المشاركة الحديثة

// ── قواعد التصنيف الافتراضيّة (قابلة للتعديل من الواجهة) ──
export const DEFAULT_CONFIG = {
  version: 2,
  window: WINDOW_DAYS,
  includeTestAccounts: false,
  segments: [
    // 🔴 أوّلاً قبل «جديد» و«مرّة/مرّتين»: من لم يحضر قطّ يطابق شروطهما
    //    (activitiesAll ≤ 2) فيُوصَف كذباً بـ«نشط» أو «حضر ثمّ اختفى».
    { id: 'signed_no_show', name: 'سجّل ولم يحضر', color: '#94a3b8', match: 'all',
      // الشرط gamesAll لا activitiesAll: من ١٣٣ لاعباً بـactivitiesAll=0
      // هنالك ٤٦ **لعبوا فعلاً** لكنّ مبارياتهم قديمة بلا فعاليّة مرتبطة —
      // ووصفهم بـ«لم يحضر» كذب. الصادقون هم gamesAll=0 وعددهم ٨٧.
      conditions: [ { metric: 'gamesAll', op: '==', value: 0 } ] },
    { id: 'loyal',   name: 'وفيّ نشط',            color: '#34d399', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '>=', value: 5 }, { metric: 'daysSince', op: '<=', value: 21 } ] },
    { id: 'regular', name: 'منتظم نشط',           color: '#38bdf8', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '>=', value: 3 }, { metric: 'activitiesAll', op: '<=', value: 4 }, { metric: 'daysSince', op: '<=', value: 21 } ] },
    { id: 'at_risk', name: 'معرّض للفقدان',        color: '#f5a524', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '>=', value: 3 }, { metric: 'daysSince', op: '>', value: 21 }, { metric: 'daysSince', op: '<=', value: 45 } ] },
    { id: 'churned', name: 'منقطع (كان منتظماً)',  color: '#e5484d', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '>=', value: 3 }, { metric: 'daysSince', op: '>', value: 45 } ] },
    { id: 'new',     name: 'جديد/متردّد نشط',      color: '#a78bfa', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '<=', value: 2 }, { metric: 'daysSince', op: '<=', value: 21 } ] },
    { id: 'oneoff',  name: 'مرّة/مرّتين ثمّ اختفى',  color: '#8a837a', match: 'all',
      conditions: [ { metric: 'activitiesAll', op: '<=', value: 2 }, { metric: 'daysSince', op: '>', value: 21 } ] },
  ],
  fallback: { id: 'other', name: 'غير مصنّف', color: '#6b6660' },
};

// وصف المقاييس المتاحة للقواعد (تُعرَض في بنّاء القواعد بالواجهة)
export const METRIC_DEFS = [
  { key: 'activitiesAll', label: 'عدد الفعاليّات (كلّيّاً)', unit: '' },
  { key: 'actsAfterSignup', label: 'فعاليّات بعد التسجيل', unit: '' },
  { key: 'gamesAll', label: 'عدد الألعاب (كلّيّاً)', unit: '' },
  { key: 'activities30', label: 'فعاليّات (آخر ٣٠ي)', unit: '' },
  { key: 'games30', label: 'ألعاب (آخر ٣٠ي)', unit: '' },
  { key: 'daysSince', label: 'أيّام منذ آخر لعبة', unit: 'يوم' },
  { key: 'activitiesSince', label: 'فعاليّات النادي منذ آخر حضور له', unit: 'فعاليّة' },
  { key: 'tenureDays', label: 'مدّة النشاط', unit: 'يوم' },
  { key: 'avgGpa', label: 'متوسّط الألعاب/فعاليّة', unit: '' },
  { key: 'freqPerMonth', label: 'فعاليّات/شهر (تكرار)', unit: '' },
  { key: 'longestGapDays', label: 'أطول انقطاع', unit: 'يوم' },
  { key: 'survivalPct', label: 'نسبة النجاة', unit: '%' },
  { key: 'seasonsCount', label: 'عدد المواسم', unit: '' },
  { key: 'remotePct', label: 'حصّة اللعب عن بُعد', unit: '%' },
  { key: 'accountAgeDays', label: 'أيّام منذ إنشاء الحساب', unit: 'يوم' },
  // 📅 تاريخ مطلق على هيئة عدد YYYYMMDD (مثلاً 20260601). ترتيب هذه الأعداد
  //    يطابق الترتيب الزمنيّ تماماً، فتعمل ـ ≥ ≤ = عبر محرّك القواعد الرقميّ بلا تعديل.
  //    وأهمّ من ذلك أنّها **ثابتة لا تنزلق**: شريحة مكتوبة بـaccountAgeDays ≤ 21
  //    تعني شيئاً مختلفاً كلّ يوم، وهذه تعني تاريخاً واحداً للأبد.
  { key: 'acctCreatedNum', label: 'تاريخ إنشاء الحساب', unit: '', type: 'date' },
  { key: 'level', label: 'المستوى', unit: '' },
];

const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 864e5);

// ── حساب المقاييس الخام لكل اللاعبين (SQL + إثراء JS) ──
export async function computeMetrics(): Promise<any> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  const res: any = await db.execute(sql`
    WITH base AS (
      SELECT mp.player_id AS pid, m.id AS match_id, m.created_at AS played_at, m.season_id,
             s.activity_id, a.name AS activity_name, a.date AS activity_date, s.is_remote, mp.survived_to_end
      FROM match_players mp
      JOIN matches m ON m.id = mp.match_id AND m.deleted_at IS NULL
      LEFT JOIN sessions s ON s.id = m.session_id
      LEFT JOIN activities a ON a.id = s.activity_id
      LEFT JOIN locations l ON l.id = a.location_id
      WHERE mp.player_id IS NOT NULL AND (l.is_test_location IS NOT TRUE) AND m.game_name NOT ILIKE '%auto seeded%'
    ),
    all_activities AS (
      -- كون فعاليّات النادي المحتسَبة — كلّ فعاليّة = وحدة واحدة مهما كثُرت غرفها ومبارياتها
      SELECT DISTINCT activity_id, activity_date::date AS adate
      FROM base WHERE activity_id IS NOT NULL
    ),
    per_pa AS (
      SELECT pid, activity_id, MAX(activity_name) AS activity_name, activity_date::date AS activity_date,
             MIN(season_id) AS season, COUNT(DISTINCT match_id) AS games
      FROM base WHERE activity_id IS NOT NULL
      GROUP BY pid, activity_id, activity_date::date
    ),
    pagg AS (
      SELECT b.pid,
        COUNT(DISTINCT b.match_id) AS games_all,
        COUNT(DISTINCT b.activity_id) FILTER (WHERE b.activity_id IS NOT NULL) AS activities_all,
        COUNT(DISTINCT b.match_id) FILTER (WHERE b.played_at >= now()-interval '30 days') AS games_30,
        COUNT(DISTINCT b.activity_id) FILTER (WHERE b.played_at >= now()-interval '30 days' AND b.activity_id IS NOT NULL) AS activities_30,
        MIN(b.played_at)::date AS first_seen, MAX(b.played_at)::date AS last_seen,
        MAX(b.activity_date) FILTER (WHERE b.activity_id IS NOT NULL)::date AS last_act_date,
        (now()::date - MAX(b.played_at)::date) AS days_since,
        COUNT(*) FILTER (WHERE b.survived_to_end) AS survived,
        COUNT(*) AS parts,
        COUNT(*) FILTER (WHERE b.is_remote) AS remote_parts
      FROM base b GROUP BY b.pid
    )
    SELECT json_build_object(
      'generatedAt', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
      'today', now()::date,
      'players', COALESCE((
        SELECT json_agg(json_build_object(
            'id', p.id, 'name', p.name, 'phone', p.phone, 'rank', p.rank_tier, 'level', p.level,
            'isTest', p.is_test_account, 'acctCreated', p.created_at::date,
            'gamesAll', COALESCE(pa.games_all,0), 'activitiesAll', COALESCE(pa.activities_all,0),
            'games30', COALESCE(pa.games_30,0), 'activities30', COALESCE(pa.activities_30,0),
            -- 🆕 فعاليّات لعبها **بعد** إنشاء حسابه — ليست مرادفاً لـactivitiesAll:
            --    من لعب ضيفاً ثمّ رُبط له حساب تُسنَد له مبارياتٌ أقدم من تسجيله
            --    (حدث فعلاً مع لاعبٍ واحد). وهي المقياس الصادق لـ«هل تحوّل بعد أن سجّل؟».
            'actsAfterSignup', COALESCE((SELECT count(DISTINCT b4.activity_id)::int FROM base b4
                WHERE b4.pid = p.id AND b4.activity_id IS NOT NULL AND b4.played_at >= p.created_at), 0),
            'firstSeen', pa.first_seen, 'lastSeen', pa.last_seen,
            -- 🔴 من لم يلعب قطّ: أيّامه تُقاس من تسجيله لا صفراً — الصفر يعني
            --    «لعب اليوم»، فيسقط في «جديد/متردّد نشط» ويلوّث كلّ الشرائح.
            'daysSince', COALESCE(pa.days_since, (now()::date - p.created_at::date)),
            -- ومرجع «فعاليّات النادي منذ آخر حضور» لمن لم يحضر قطّ هو تاريخ تسجيله
            'activitiesSince', COALESCE((SELECT count(*)::int FROM all_activities aa
                WHERE aa.adate > COALESCE(pa.last_act_date, p.created_at::date)), 0),
            'hasPush', EXISTS (SELECT 1 FROM player_fcm_tokens t WHERE t.player_id = p.id AND t.is_active = true),
            'survived', COALESCE(pa.survived,0), 'parts', COALESCE(pa.parts,0), 'remoteParts', COALESCE(pa.remote_parts,0),
            'seasons', COALESCE((SELECT json_agg(DISTINCT b2.season_id) FROM base b2 WHERE b2.pid=p.id AND b2.season_id IS NOT NULL), '[]'::json),
            'acts', COALESCE((
              SELECT json_agg(json_build_object('n',pp.activity_name,'d',pp.activity_date,'g',pp.games,'s',pp.season) ORDER BY pp.activity_date)
              FROM per_pa pp WHERE pp.pid=p.id), '[]'::json)
          ) ORDER BY COALESCE(pa.games_all,0) DESC)
        -- 🔴 الاتّجاه مقلوبٌ عمداً: كان FROM pagg JOIN players فيبني من match_players
        --    صعوداً — فمن سجّل ولم يلعب لا صفّ له فلا يظهر في الصفحة إطلاقاً.
        --    كانوا ٨٧ من ٦٧٧ لاعباً، منهم ٢٧ من ٢٨ في فئة «سجّل ولم يحضر» الحديثة.
        FROM players p LEFT JOIN pagg pa ON pa.pid = p.id), '[]'::json)
    ) AS payload
  `);

  const payload = (res.rows ? res.rows[0]?.payload : res[0]?.payload) || { players: [] };
  const today: string = payload.today;

  // إثراء بالمقاييس المشتقّة
  for (const p of payload.players) {
    p.tenureDays = (p.firstSeen && p.lastSeen) ? daysBetween(p.firstSeen, p.lastSeen) : 0;
    p.avgGpa = p.activitiesAll ? +(p.gamesAll / p.activitiesAll).toFixed(2) : 0;
    const months = Math.max(1, (p.tenureDays || 0) / 30);
    p.freqPerMonth = +(p.activitiesAll / months).toFixed(2);
    p.survivalPct = p.parts ? Math.round((p.survived / p.parts) * 100) : 0;
    p.remotePct = p.parts ? Math.round((p.remoteParts / p.parts) * 100) : 0;
    p.accountAgeDays = p.acctCreated ? daysBetween(p.acctCreated, today) : 0;
    // YYYY-MM-DD → YYYYMMDD (عدد) — انظر تعليق acctCreatedNum في METRIC_DEFS
    p.acctCreatedNum = p.acctCreated ? Number(String(p.acctCreated).slice(0, 10).replace(/-/g, '')) : 0;
    p.seasonsCount = Array.isArray(p.seasons) ? p.seasons.length : 0;
    // أطول انقطاع بين الفعاليّات المتتالية
    let longest = 0;
    const dates = (p.acts || []).map((a: any) => a.d).sort();
    for (let i = 1; i < dates.length; i++) {
      const gap = daysBetween(dates[i - 1], dates[i]);
      if (gap > longest) longest = gap;
    }
    p.longestGapDays = longest;
  }
  return payload;
}

// ── الكاش ──
export async function refreshCache(): Promise<{ refreshedAt: string; count: number }> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  const payload = await computeMetrics();
  await db.insert(analyticsCache)
    .values({ key: 'players', payload, refreshedAt: new Date() } as any)
    .onConflictDoUpdate({ target: analyticsCache.key, set: { payload, refreshedAt: new Date() } as any });
  return { refreshedAt: new Date().toISOString(), count: payload.players.length };
}

export async function getCache(): Promise<{ payload: any; refreshedAt: string | null }> {
  const db = getDB();
  if (!db) return { payload: { players: [] }, refreshedAt: null };
  const [row] = await db.select().from(analyticsCache).where(eq(analyticsCache.key, 'players')).limit(1);
  if (!row) {
    const fresh = await refreshCache();
    const [r2] = await db.select().from(analyticsCache).where(eq(analyticsCache.key, 'players')).limit(1);
    return { payload: r2?.payload || { players: [] }, refreshedAt: fresh.refreshedAt };
  }
  return { payload: row.payload, refreshedAt: (row.refreshedAt as any)?.toISOString?.() || String(row.refreshedAt) };
}

export async function isCacheStale(maxAgeHours = 26): Promise<boolean> {
  const db = getDB();
  if (!db) return false;
  const [row] = await db.select().from(analyticsCache).where(eq(analyticsCache.key, 'players')).limit(1);
  if (!row) return true;
  const age = Date.now() - new Date(row.refreshedAt as any).getTime();
  return age > maxAgeHours * 3600_000;
}

// ── الإعدادات (قواعد الشرائح) ──
export async function getConfig(): Promise<any> {
  const db = getDB();
  if (!db) return DEFAULT_CONFIG;
  const [row] = await db.select().from(analyticsConfig).where(eq(analyticsConfig.key, 'segments')).limit(1);
  if (!row) {
    await db.insert(analyticsConfig).values({ key: 'segments', value: DEFAULT_CONFIG } as any).onConflictDoNothing();
    return DEFAULT_CONFIG;
  }
  return await migrateConfig(db, row.value);
}

// إدماج شريحة «سجّل ولم يحضر» في إعدادٍ محفوظ من قبل.
// 🔴 غير مُتلِف عمداً: لا يمسّ شرائح المستخدِم ولا يرتّبها — يدرج واحدةً فقط،
//    ويضعها **قبل** أوّل شريحة تبتلع من لم يحضر (أي ذات شرط activitiesAll ≤/<)،
//    لأنّ segmentOf يُرجِع **أوّل** مطابقة لا أدقّها. تبقى قابلةً للنقل أو الحذف من الواجهة.
async function migrateConfig(db: any, cfg: any): Promise<any> {
  if (!cfg || !Array.isArray(cfg.segments)) return cfg;
  if (cfg.segments.some((s: any) => s?.id === 'signed_no_show')) return cfg;

  const seg = DEFAULT_CONFIG.segments.find(s => s.id === 'signed_no_show');
  if (!seg) return cfg;

  const swallowsZero = (s: any) => (s?.conditions || []).some((c: any) =>
    c?.metric === 'activitiesAll' && (c.op === '<=' || c.op === '<'));
  const at = cfg.segments.findIndex(swallowsZero);
  const segments = cfg.segments.slice();
  segments.splice(at < 0 ? segments.length : at, 0, JSON.parse(JSON.stringify(seg)));

  const next = { ...cfg, segments, version: 2 };
  await saveConfig(next);
  console.log('✅ analytics: أُدرجت شريحة «سجّل ولم يحضر» عند الموضع', at < 0 ? segments.length - 1 : at);
  return next;
}

export async function saveConfig(config: any): Promise<void> {
  const db = getDB();
  if (!db) throw new Error('DB unavailable');
  await db.insert(analyticsConfig)
    .values({ key: 'segments', value: config, updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: analyticsConfig.key, set: { value: config, updatedAt: new Date() } as any });
}
