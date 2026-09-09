// ══════════════════════════════════════════════════════
// 🧪 فحص «مدينتان، لاعبٌ واحد» — عزلُ التصنيف بالمدينة داخل الموسم الواحد
// ══════════════════════════════════════════════════════
// يجري على القاعدة الحقيقيّة (الخادم) معزولاً: مدينةٌ مؤقّتة + مكانان + فعاليّتان
// + غرفتان + مباراتان مسجّلتان مباشرةً في match_players، ثمّ تُختبر:
//   1. المباراة في المدينة أ تكتب صفّ (الموسم، أ) فقط.
//   2. المباراة في المدينة ب لا تغيّر رقماً واحداً في صفّ أ.
//   3. لوحة أ لا تُظهر لاعباً مبارياتُه كلّها في ب، والعكس.
//   4. المصالحة مرّتين = نفس النتيجة (idempotent).
//   5. مكافأةٌ في ب لا تمسّ أ.
//   6. غرفةٌ بلا مكان ⇒ نطاقٌ غير محتسب (seasonId = null).
//   7. المرآة players.* = صفّ المدينة الأساسيّة.
// التنظيف كاملٌ في النهاية (وفي البداية دفاعاً من تشغيلةٍ سابقة فاشلة).
// التشغيل: docker compose exec -T backend npx tsx src/scripts/e2e-city-scope.ts
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';

const TAG = 'E2E-CITY-SCOPE';
let pass = 0, fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ''}`); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function section(t: string) { console.log(`\n═══ ${t} ═══`); }

async function main() {
  await connectDB();
  const db = getDB()!;
  const q = async (s: any) => ((await db.execute(s)) as any).rows as any[];

  const { getActiveRegularSeasonId, resolveSeasonForGame, resolveScopeForLocation, applySeasonStats, getSeasonLeaderboard, getStanding, syncPlayerMirror, invalidateSeasonCache } = await import('../services/season.service.js');
  const { reconcileSeasonProgression } = await import('../services/reconcile.service.js');
  const { invalidateCitiesCache } = await import('../services/cities.service.js');

  const seasonId = await getActiveRegularSeasonId();
  if (!seasonId) { console.error('❌ لا موسمَ عاديّاً نشطاً — الفحص يحتاج موسماً'); process.exit(1); }

  // ── تنظيف بقايا تشغيلةٍ سابقة ──
  async function cleanup() {
    const ps = await q(sql`SELECT id FROM players WHERE phone IN ('0700000771','0700000772')`);
    const pids = ps.map(p => Number(p.id));
    if (pids.length) {
      await q(sql`DELETE FROM match_players WHERE player_id = ANY(${sql.raw(`ARRAY[${pids.join(',')}]::int[]`)})`);
      await q(sql`DELETE FROM player_season_stats WHERE player_id = ANY(${sql.raw(`ARRAY[${pids.join(',')}]::int[]`)})`);
      await q(sql`DELETE FROM rank_bonuses WHERE player_id = ANY(${sql.raw(`ARRAY[${pids.join(',')}]::int[]`)})`);
      await q(sql`DELETE FROM player_notifications WHERE player_id = ANY(${sql.raw(`ARRAY[${pids.join(',')}]::int[]`)})`);
    }
    const ms = await q(sql`SELECT id FROM matches WHERE game_name LIKE ${'%' + TAG + '%'}`);
    for (const m of ms) await q(sql`DELETE FROM match_players WHERE match_id = ${m.id}`);
    await q(sql`DELETE FROM matches WHERE game_name LIKE ${'%' + TAG + '%'}`);
    const ss = await q(sql`SELECT id FROM sessions WHERE session_name LIKE ${'%' + TAG + '%'}`);
    for (const s of ss) await q(sql`DELETE FROM session_players WHERE session_id = ${s.id}`);
    await q(sql`UPDATE activities SET session_id = NULL WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM sessions WHERE session_name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM bookings WHERE activity_id IN (SELECT id FROM activities WHERE name LIKE ${'%' + TAG + '%'})`);
    await q(sql`DELETE FROM activities WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM staff WHERE location_id IN (SELECT id FROM locations WHERE name LIKE ${'%' + TAG + '%'})`);
    await q(sql`DELETE FROM locations WHERE name LIKE ${'%' + TAG + '%'}`);
    await q(sql`DELETE FROM players WHERE phone IN ('0700000771','0700000772')`);
    await q(sql`DELETE FROM cities WHERE slug = 'e2e-city-b'`);
    invalidateCitiesCache(); invalidateSeasonCache();
  }
  await cleanup();

  // ── التجهيز ──
  section('التجهيز');
  const [cityA] = await q(sql`SELECT id, name FROM cities WHERE is_active = true ORDER BY sort_order, id LIMIT 1`);
  const [cityB] = await q(sql`INSERT INTO cities (name, slug, is_active, sort_order) VALUES ('مدينة الفحص', 'e2e-city-b', true, 99) RETURNING id, name`);
  invalidateCitiesCache();
  const [locA] = await q(sql`INSERT INTO locations (name, city_id, region) VALUES (${TAG + ' مكان أ'}, ${cityA.id}, '') RETURNING id`);
  const [locB] = await q(sql`INSERT INTO locations (name, city_id, region) VALUES (${TAG + ' مكان ب'}, ${cityB.id}, '') RETURNING id`);
  const [actA] = await q(sql`INSERT INTO activities (name, date, status, location_id) VALUES (${TAG + ' فعاليّة أ'}, NOW(), 'active', ${locA.id}) RETURNING id`);
  const [actB] = await q(sql`INSERT INTO activities (name, date, status, location_id) VALUES (${TAG + ' فعاليّة ب'}, NOW(), 'active', ${locB.id}) RETURNING id`);
  const [p1] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES ('0700000771', ${TAG + ' لاعب المدينتين'}, 'x') RETURNING id`);
  const [p2] = await q(sql`INSERT INTO players (phone, name, password_hash) VALUES ('0700000772', ${TAG + ' لاعب ب فقط'}, 'x') RETURNING id`);
  ok('جُهّزت مدينةٌ ومكانان وفعاليّتان ولاعبان', !!(cityB?.id && locA?.id && locB?.id && actA?.id && actB?.id && p1?.id && p2?.id));

  // ── 1) حلّ النطاق ──
  section('حلّ النطاق');
  const sA = await resolveSeasonForGame(actA.id, false, null);
  const sB = await resolveSeasonForGame(actB.id, false, null);
  const sNone = await resolveSeasonForGame(undefined, false, null);
  const sVenueOnly = await resolveScopeForLocation(locB.id);
  ok('فعاليّة أ → الموسم النشط بمدينة أ', sA.seasonId === seasonId && sA.cityId === Number(cityA.id) && sA.isRegular && sA.counted);
  ok('فعاليّة ب → نفس الموسم بمدينة ب', sB.seasonId === seasonId && sB.cityId === Number(cityB.id) && sB.counted);
  ok('غرفة بلا نشاط ولا مكان → غير محتسبة', sNone.seasonId === null && sNone.counted === false);
  ok('غرفة بلا نشاط بمكانٍ صريح → محتسبة بمدينة المكان', sVenueOnly.seasonId === seasonId && sVenueOnly.cityId === Number(cityB.id));

  // ── 2) مباراةٌ في أ ثمّ في ب — صفوفٌ في match_players (مصدر الحقيقة) ──
  section('المباريات');
  async function makeMatch(actId: number, locId: number, cityId: number, rows: Array<{ pid: number; xp: number; rr: number; won: boolean }>) {
    const [sess] = await q(sql`INSERT INTO sessions (session_code, session_name, max_players, is_active, status, activity_id, location_id)
      VALUES (${'E' + Math.random().toString(36).slice(2, 7).toUpperCase()}, ${TAG + ' غرفة'}, 10, false, 'closed', ${actId}, ${locId}) RETURNING id`);
    const [m] = await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count, is_active, winner, season_id, city_id, created_at, ended_at)
      VALUES (${sess.id}, ${'e2e' + Math.random().toString(36).slice(2, 6)}, 'E2E001', ${TAG + ' مباراة'}, ${rows.length}, false, 'CITIZEN', ${seasonId}, ${cityId}, NOW(), NOW()) RETURNING id`);
    let phys = 1;
    for (const r of rows) {
      await q(sql`INSERT INTO match_players (match_id, player_id, physical_id, player_name, role, survived_to_end, xp_earned, rr_change)
        VALUES (${m.id}, ${r.pid}, ${phys++}, 'x', ${r.won ? 'CITIZEN' : 'MAFIA_REGULAR'}, true, ${r.xp}, ${r.rr})`);
    }
    return Number(m.id);
  }
  const mA = await makeMatch(actA.id, locA.id, Number(cityA.id), [{ pid: p1.id, xp: 70, rr: 25, won: true }]);
  // تطبيقٌ حيّ كما يفعل finalizeMatch
  await applySeasonStats(p1.id, seasonId, Number(cityA.id), 70, 25, { won: true, survived: true, dealInitiated: false, dealSuccess: false });
  await syncPlayerMirror(p1.id, seasonId);
  const a1 = await getStanding(p1.id, seasonId, Number(cityA.id));
  ok('بعد مباراة أ: صفّ (الموسم، أ) للاعب 1 = مباراة واحدة و25 RR', a1.totalMatches === 1 && a1.rankRR === 25, JSON.stringify(a1));
  const b0 = await getStanding(p1.id, seasonId, Number(cityB.id));
  ok('ولا صفَّ له في ب بعد', b0.totalMatches === 0 && b0.rankRR === 0);

  const mB = await makeMatch(actB.id, locB.id, Number(cityB.id), [{ pid: p1.id, xp: 70, rr: 20, won: true }, { pid: p2.id, xp: 20, rr: -20, won: false }]);
  await applySeasonStats(p1.id, seasonId, Number(cityB.id), 70, 20, { won: true, survived: true, dealInitiated: false, dealSuccess: false });
  await applySeasonStats(p2.id, seasonId, Number(cityB.id), 20, -20, { won: false, survived: true, dealInitiated: false, dealSuccess: false });
  await syncPlayerMirror(p1.id, seasonId); await syncPlayerMirror(p2.id, seasonId);
  const a2 = await getStanding(p1.id, seasonId, Number(cityA.id));
  const b2 = await getStanding(p1.id, seasonId, Number(cityB.id));
  ok('مباراة ب لم تغيّر صفّ أ للاعب 1 (25 RR · مباراة واحدة)', a2.totalMatches === 1 && a2.rankRR === 25 && a2.xp === a1.xp, JSON.stringify(a2));
  ok('صفّ ب للاعب 1 مستقلّ (20 RR · مباراة واحدة)', b2.totalMatches === 1 && b2.rankRR === 20, JSON.stringify(b2));

  // ── 3) لوحتا الترتيب ──
  section('لوحات الترتيب');
  const lbA = await getSeasonLeaderboard(seasonId, Number(cityA.id), 500);
  const lbB = await getSeasonLeaderboard(seasonId, Number(cityB.id), 500);
  ok('لوحة أ لا تُظهر لاعب ب فقط', !lbA.some((r: any) => r.playerId === p2.id));
  ok('لوحة ب تُظهر اللاعبَين', lbB.some((r: any) => r.playerId === p1.id) && lbB.some((r: any) => r.playerId === p2.id));
  ok('لوحة أ تُظهر لاعب المدينتين برقم أ (25)', (lbA.find((r: any) => r.playerId === p1.id) as any)?.rankRR === 25);

  // ── 4) المصالحة: تطابقٌ مع التطبيق الحيّ + idempotent ──
  section('المصالحة');
  const before = await q(sql`SELECT city_id, xp, level, rank_tier, rank_rr, total_matches FROM player_season_stats WHERE player_id = ${p1.id} AND season_id = ${seasonId} ORDER BY city_id`);
  const r1 = await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [p1.id, p2.id] });
  const after1 = await q(sql`SELECT city_id, xp, level, rank_tier, rank_rr, total_matches FROM player_season_stats WHERE player_id = ${p1.id} AND season_id = ${seasonId} ORDER BY city_id`);
  const r2 = await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [p1.id, p2.id] });
  const after2 = await q(sql`SELECT city_id, xp, level, rank_tier, rank_rr, total_matches FROM player_season_stats WHERE player_id = ${p1.id} AND season_id = ${seasonId} ORDER BY city_id`);
  ok('المصالحة طُبّقت', r1.applied && r2.applied, `${r1.reason}/${r2.reason}`);
  ok('المصالحة تطابق التطبيق الحيّ (صفّان بالقيم نفسها)', JSON.stringify(before) === JSON.stringify(after1), `${JSON.stringify(before)} vs ${JSON.stringify(after1)}`);
  ok('المصالحة مرّتين = نفس النتيجة', JSON.stringify(after1) === JSON.stringify(after2));

  // ── 5) مكافأةٌ في ب لا تمسّ أ ──
  section('المكافآت');
  await q(sql`INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, activity_id, city_id) VALUES (${p1.id}, 30, 0, ${TAG + ' bonus'}, ${seasonId}, ${actB.id}, ${cityB.id})`);
  await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [p1.id] });
  const a3 = await getStanding(p1.id, seasonId, Number(cityA.id));
  const b3 = await getStanding(p1.id, seasonId, Number(cityB.id));
  ok('مكافأة ب أضافت 30 RR في ب فقط', b3.rankRR === 50 && a3.rankRR === 25, `A=${a3.rankRR} B=${b3.rankRR}`);

  // ── 6) المرآة = المدينة الأساسيّة ──
  section('المرآة');
  await q(sql`UPDATE players SET home_city_id = ${cityA.id}, home_city_source = 'chosen' WHERE id = ${p1.id}`);
  await syncPlayerMirror(p1.id, seasonId);
  const [mirA] = await q(sql`SELECT rank_rr, total_matches FROM players WHERE id = ${p1.id}`);
  ok('players.* تعكس مدينة أ حين هي الأساسيّة', Number(mirA.rank_rr) === 25 && Number(mirA.total_matches) === 1, JSON.stringify(mirA));
  await q(sql`UPDATE players SET home_city_id = ${cityB.id} WHERE id = ${p1.id}`);
  await syncPlayerMirror(p1.id, seasonId);
  const [mirB] = await q(sql`SELECT rank_rr, total_matches FROM players WHERE id = ${p1.id}`);
  ok('وتعكس مدينة ب بعد تغيير الأساسيّة', Number(mirB.rank_rr) === 50 && Number(mirB.total_matches) === 1, JSON.stringify(mirB));
  const [inf] = await q(sql`SELECT home_city_id FROM players WHERE id = ${p2.id}`);
  ok('لاعب ب فقط استُنتجت مدينته ب تلقائيّاً', Number(inf?.home_city_id) === Number(cityB.id), String(inf?.home_city_id));

  // ── 7) مباراةٌ بلا مدينة في موسمٍ عاديّ لا تُحتسب ──
  section('بلا مدينة');
  const [sessN] = await q(sql`INSERT INTO sessions (session_code, session_name, max_players, is_active, status) VALUES ('E2E999', ${TAG + ' غرفة بلا مكان'}, 10, false, 'closed') RETURNING id`);
  const [mN] = await q(sql`INSERT INTO matches (session_id, room_id, room_code, game_name, player_count, is_active, winner, season_id, city_id)
    VALUES (${sessN.id}, 'e2enone', 'E2E999', ${TAG + ' مباراة بلا مكان'}, 1, false, 'CITIZEN', ${seasonId}, NULL) RETURNING id`);
  await q(sql`INSERT INTO match_players (match_id, player_id, physical_id, player_name, role, survived_to_end, xp_earned, rr_change) VALUES (${mN.id}, ${p2.id}, 1, 'x', 'CITIZEN', true, 500, 500)`);
  const rN = await reconcileSeasonProgression(seasonId, true, () => {}, { onlyPlayerIds: [p2.id] });
  const bN = await getStanding(p2.id, seasonId, Number(cityB.id));
  ok('صفٌّ بلا مدينة لا يُحتسب في أيّ ترتيب (noCity>0 والرصيد كما هو)', rN.noCity >= 1 && bN.rankRR === 0 && bN.totalMatches === 1, `noCity=${rN.noCity} B=${JSON.stringify(bN)}`);

  void mA; void mB;

  // ── التنظيف ──
  section('التنظيف');
  await cleanup();
  ok('نُظّفت كلّ آثار الفحص', (await q(sql`SELECT COUNT(*)::int AS n FROM players WHERE phone IN ('0700000771','0700000772')`))[0].n === 0);

  console.log(`\n🏁 النتيجة: ${pass} نجح · ${fail} فشل`);
  if (failures.length) { console.log('الفاشلة:'); for (const f of failures) console.log('  • ' + f); }
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error('FAIL:', e); process.exit(1); });
