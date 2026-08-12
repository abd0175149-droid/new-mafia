// ══════════════════════════════════════════════════════
// 🕵️ محرّك الكشف الإحصائيّ عن الغشّ — Anti-cheat Analytics
// ══════════════════════════════════════════════════════
// الغشّ المتكرّر (تسريب أدوار المافيا) يترك بصمةً إحصائيّة عبر المباريات،
// مهما كانت وسيلة الالتقاط — حتى الهاتف الثاني أو التسريب الشفهيّ. يعمل على
// البيانات الموجودة (match_players + matches + cheat_signals) بلا أيّ اقتحامٍ
// للهاتف.
//
// 🔴 مبدأٌ حاكم: هذا **يُظهر الاشتباه بأدلّته** ولا يُدين. الإيجابيّة الكاذبة
//    التي تحظر لاعباً مخلصاً أسوأ من تفويت غشّاش — فالقرار النهائيّ بشريّ،
//    والعتبات مشدودةٌ ومحروسةٌ بحدٍّ أدنى من العيّنة.
//
// الكواشف الثلاثة:
//   ① تواطؤ زوجيّ: حين يكون «أ» مافيا و«ب» مواطناً، هل ينجو «ب» بنسبةٍ شاذّة
//      فوق خطّ أساسه؟ توقيعُ «المافيا لا يقتل مُخبِره» (المسرِّب←المستقبِل).
//   ② معرفةٌ مستحيلة: مواطنٌ دقّة اتفاقيّاته ضدّ المافيا تفوق الصدفة بانحرافاتٍ
//      معياريّة عبر مبارياتٍ كثيرة — «مواطنٌ يعرف دائماً».
//   ③ سلوكيّ: مجموع أوزان cheat_signals (غياب/لقطة/تسجيل) لكلّ لاعب.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';

const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'];
const MIN_PAIR_MATCHES = 5;    // حدٌّ أدنى للعيّنة الزوجيّة كي تُحسب
const MIN_CITIZEN_DEALS = 6;   // حدٌّ أدنى لاتفاقيّات المواطن كي تُحسب دقّتها

export type RiskBand = 'green' | 'amber' | 'red';

export interface PlayerRisk {
  playerId: number;
  name: string;
  matches: number;
  survivalRate: number;
  citizenDeals: number;
  citizenDealSuccess: number;   // نسبة النجاح
  dealZ: number | null;         // انحراف دقّة الاتفاقيّات عن خطّ الأساس
  behavioralWeight: number;     // مجموع أوزان الإشارات السلوكيّة
  behavioralCount: number;
  pairZMax: number | null;      // أقوى إشارة تواطؤ زوجيّ يشارك فيها
  band: RiskBand;
  evidence: string[];           // أسطر أدلّةٍ بشريّة القراءة
}

export interface CollusionPair {
  aId: number; aName: string;   // المافيويّ المشتبه أنّه المسرِّب
  bId: number; bName: string;   // المواطن المشتبه أنّه المستقبِل
  coMatches: number;            // مبارياتٌ كان فيها أ مافيا وب مواطناً
  bSurvivalWhenAMafia: number;  // نجاة ب في تلك المباريات
  bBaselineSurvival: number;    // نجاة ب عموماً
  lift: number;                 // الفرق (موجبٌ = أ يحمي ب)
  z: number;                    // معياريّة الفرق
  band: RiskBand;
}

export interface AnticheatOverview {
  generatedAt: string;
  totalMatches: number;
  analyzedPlayers: number;
  populationDealBaseline: number;
  players: PlayerRisk[];
  pairs: CollusionPair[];
}

// z ثنائيّ الحدّ: كم انحرافاً معياريّاً تبعد النسبة المرصودة عن الأساس.
function binomZ(observed: number, baseline: number, n: number): number {
  if (n <= 0 || baseline <= 0 || baseline >= 1) return 0;
  const se = Math.sqrt((baseline * (1 - baseline)) / n);
  if (se === 0) return 0;
  return (observed - baseline) / se;
}

const rows = (r: any): any[] => r?.rows ?? r ?? [];

export async function computeAnticheatOverview(opts: { sinceDays?: number } = {}): Promise<AnticheatOverview> {
  const db = getDB();
  if (!db) throw new Error('قاعدة البيانات غير متوفرة');
  const mafiaArr = sql`ARRAY[${sql.join(MAFIA_ROLES.map(r => sql`${r}`), sql`, `)}]::text[]`;
  const sinceFilter = opts.sinceDays
    ? sql`AND m.ended_at > NOW() - (${opts.sinceDays} || ' days')::interval`
    : sql``;

  // ── ① إحصاءات الفرد ──
  const perPlayer = rows(await db.execute(sql`
    WITH mp AS (
      SELECT mp.player_id, mp.player_name, mp.role, mp.survived_to_end, mp.deal_initiated, mp.deal_success, m.winner
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id IS NOT NULL AND m.ended_at IS NOT NULL ${sinceFilter}
    )
    SELECT player_id,
      MAX(player_name) AS name,
      COUNT(*)::int AS matches,
      AVG(CASE WHEN survived_to_end THEN 1.0 ELSE 0.0 END)::float AS surv_rate,
      COUNT(*) FILTER (WHERE deal_initiated AND NOT (role = ANY(${mafiaArr})))::int AS citizen_deals,
      COUNT(*) FILTER (WHERE deal_initiated AND deal_success AND NOT (role = ANY(${mafiaArr})))::int AS citizen_deals_ok
    FROM mp GROUP BY player_id
  `));

  // خطّ أساس دقّة اتفاقيّات المواطنين (المجتمع كلّه)
  let totDeals = 0, totOk = 0;
  for (const p of perPlayer) { totDeals += Number(p.citizen_deals); totOk += Number(p.citizen_deals_ok); }
  const dealBaseline = totDeals > 0 ? totOk / totDeals : 0;

  // خرائط سريعة
  const baseSurv = new Map<number, number>();
  for (const p of perPlayer) baseSurv.set(Number(p.player_id), Number(p.surv_rate));

  // ── ③ الإشارات السلوكيّة ──
  const behav = rows(await db.execute(sql`
    SELECT player_id, SUM(weight)::int AS w, COUNT(*)::int AS n
    FROM cheat_signals WHERE player_id IS NOT NULL GROUP BY player_id
  `));
  const behavMap = new Map<number, { w: number; n: number }>();
  for (const b of behav) behavMap.set(Number(b.player_id), { w: Number(b.w), n: Number(b.n) });

  // ── ② التواطؤ الزوجيّ: أ مافيا، ب مواطن ──
  const pairRows = rows(await db.execute(sql`
    SELECT a.player_id AS a, b.player_id AS b,
      COUNT(*)::int AS co,
      AVG(CASE WHEN b.survived_to_end THEN 1.0 ELSE 0.0 END)::float AS b_surv
    FROM match_players a
    JOIN match_players b ON b.match_id = a.match_id AND b.player_id <> a.player_id
    JOIN matches m ON m.id = a.match_id
    WHERE a.player_id IS NOT NULL AND b.player_id IS NOT NULL
      AND m.ended_at IS NOT NULL ${sinceFilter}
      AND a.role = ANY(${mafiaArr})
      AND NOT (b.role = ANY(${mafiaArr}))
    GROUP BY a.player_id, b.player_id
    HAVING COUNT(*) >= ${MIN_PAIR_MATCHES}
  `));

  const nameOf = new Map<number, string>();
  for (const p of perPlayer) nameOf.set(Number(p.player_id), p.name || `لاعب #${p.player_id}`);

  const pairs: CollusionPair[] = [];
  const pairZByPlayer = new Map<number, number>();     // أقوى z لكلّ لاعب (كـأ أو ب)
  for (const r of pairRows) {
    const aId = Number(r.a), bId = Number(r.b);
    const co = Number(r.co), bSurv = Number(r.b_surv);
    const base = baseSurv.get(bId) ?? 0;
    if (base <= 0 || base >= 1) continue;
    const z = binomZ(bSurv, base, co);
    if (z < 1.5) continue;                              // نتجاهل ما دون إشارةٍ خفيفة
    const band: RiskBand = z >= 3 ? 'red' : z >= 2 ? 'amber' : 'green';
    pairs.push({
      aId, aName: nameOf.get(aId) || `لاعب #${aId}`,
      bId, bName: nameOf.get(bId) || `لاعب #${bId}`,
      coMatches: co, bSurvivalWhenAMafia: bSurv, bBaselineSurvival: base,
      lift: bSurv - base, z, band,
    });
    for (const pid of [aId, bId]) {
      pairZByPlayer.set(pid, Math.max(pairZByPlayer.get(pid) ?? 0, z));
    }
  }
  pairs.sort((x, y) => y.z - x.z);

  // ── دمج مخاطر الفرد ──
  const players: PlayerRisk[] = [];
  for (const p of perPlayer) {
    const pid = Number(p.player_id);
    const matches = Number(p.matches);
    const citizenDeals = Number(p.citizen_deals);
    const citizenOk = Number(p.citizen_deals_ok);
    const dealSuccess = citizenDeals > 0 ? citizenOk / citizenDeals : 0;
    const dealZ = citizenDeals >= MIN_CITIZEN_DEALS ? binomZ(dealSuccess, dealBaseline, citizenDeals) : null;
    const bh = behavMap.get(pid);
    const behavioralWeight = bh?.w ?? 0;
    const pairZ = pairZByPlayer.get(pid) ?? null;

    const evidence: string[] = [];
    if (dealZ != null && dealZ >= 2) {
      evidence.push(`دقّة اتفاقيّاته كمواطن ${(dealSuccess * 100).toFixed(0)}% مقابل خطّ أساسٍ ${(dealBaseline * 100).toFixed(0)}% (z=${dealZ.toFixed(1)}) على ${citizenDeals} اتفاقيّة`);
    }
    if (pairZ != null && pairZ >= 2) {
      const top = pairs.find(pr => (pr.aId === pid || pr.bId === pid));
      if (top) evidence.push(`تواطؤ زوجيّ مع ${top.aId === pid ? top.bName : top.aName} (z=${top.z.toFixed(1)}, نجاةٌ شاذّة على ${top.coMatches} مباراة)`);
    }
    if (behavioralWeight >= 6) {
      evidence.push(`إشاراتٌ سلوكيّة بوزن ${behavioralWeight} (${bh?.n ?? 0} حدثاً: غياب/لقطة/تسجيل)`);
    }

    // النطاق: أعلى الكواشف الثلاثة
    let band: RiskBand = 'green';
    const red = (dealZ != null && dealZ >= 3) || (pairZ != null && pairZ >= 3) || behavioralWeight >= 15;
    const amber = (dealZ != null && dealZ >= 2) || (pairZ != null && pairZ >= 2) || behavioralWeight >= 6;
    if (red) band = 'red'; else if (amber) band = 'amber';

    players.push({
      playerId: pid, name: p.name || `لاعب #${pid}`,
      matches, survivalRate: Number(p.surv_rate),
      citizenDeals, citizenDealSuccess: dealSuccess, dealZ,
      behavioralWeight, behavioralCount: bh?.n ?? 0,
      pairZMax: pairZ, band, evidence,
    });
  }

  // الترتيب: الأحمر ثمّ الأصفر، وبأقوى إشارةٍ داخل كلٍّ
  const bandRank = { red: 0, amber: 1, green: 2 };
  const score = (pr: PlayerRisk) => Math.max(pr.dealZ ?? 0, pr.pairZMax ?? 0, pr.behavioralWeight / 5);
  players.sort((x, y) => bandRank[x.band] - bandRank[y.band] || score(y) - score(x));

  return {
    generatedAt: new Date().toISOString(),
    totalMatches: (rows(await db.execute(sql`SELECT COUNT(*)::int AS c FROM matches WHERE ended_at IS NOT NULL`))[0]?.c) ?? 0,
    analyzedPlayers: players.length,
    populationDealBaseline: dealBaseline,
    players,
    pairs: pairs.slice(0, 40),
  };
}
