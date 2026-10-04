// ══════════════════════════════════════════════════════
// 📉 خصمُ الغياب — قرارُ المالك (2026-10-04)
// ══════════════════════════════════════════════════════
// كلُّ فعاليّةٍ يغيب عنها لاعبٌ **بعد أوّل مشاركةٍ له** في مدينتها هذا الموسم = −10 RR من
// ترتيبه في تلك المدينة. القواعد المقفلة:
//   • لكلّ فعاليّة لا لكلّ غرفة: الحكمُ حين تُغلق **آخر** غرفها، ومفتاحُ السطر بالفعاليّة.
//   • لا دَين: يُؤخذ ما عند اللاعب فقط، وعند «مُخبر 0» يُلغى الباقي. والسطرُ يُكتب في
//     الدفتر بالمقدار الفعليّ ويقع في زمنه بين المباريات (reconcile.service)، فلا يعود
//     يأكل مكاسبَ لاحقة.
//   • فعاليّةٌ مُعفاة (activities.absence_exempt، مثل المناسبات الخاصّة) لا تُعدّ غياباً
//     ولا بدايةَ مشاركة. ولا تُعدّ: الملغاة، مواقعُ الاختبار، فعاليّةٌ بلا مباراة.
//   • إشعارٌ لكلّ من خُصم منه شيءٌ فعلاً.
//
// الحاضر = لعب مباراةً واحدة على الأقلّ في الفعاليّة (match_players) — الحجزُ بلا لعب غياب.
// التطبيق: سطورٌ في rank_bonuses بسبب `absence:s{موسم}:a{فعاليّة}` (القيدُ الفريد لاعب+سبب
// يجعل كلَّ تشغيلٍ مكرّرٍ بلا أثر) ← مصالحة ← إشعار.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { advanceRR, applyProgressionConfig, RANK_TIERS, RANK_NAMES_AR, RANK_ORDER, type RankTier } from './progression.service.js';

export const ABSENCE_RR = 10;
export const absenceReason = (seasonId: number, activityId: number) => `absence:s${seasonId}:a${activityId}`;
const rowsOf = (r: any): any[] => r?.rows ?? (Array.isArray(r) ? r : []);
/** العددُ مع معدوده بقاعدة العربيّة: 1 · 2 · 3–10 جمع · 11+ مفرد */
const countAr = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
const pointsAr = (n: number) => countAr(n, 'نقطة واحدة', 'نقطتان', 'نقاط', 'نقطة');
const eventsAr = (n: number) => countAr(n, 'فعاليّة واحدة', 'فعاليّتين', 'فعاليّات', 'فعاليّة');

/**
 * خطواتُ الخصم بلا دَين، من حالة اللاعب الآن: 10 عن كلّ غياب ما دام عنده ما يُؤخذ،
 * وجزءٌ أخير إن بقي أقلّ من 10 في «مُخبر»، ثمّ أصفار. النزولُ من رتبةٍ لا يوقف الخصم
 * (عنده ما يُؤخذ) ويجري بقاعدة النزول نفسها (advanceRR).
 */
export function absenceSteps(rr: number, tier: string, count: number, per = ABSENCE_RR): { steps: number[]; tier: string; rr: number } {
  let cur = Math.max(0, Number(rr) || 0);
  let idx = Math.max(0, RANK_TIERS.indexOf((tier || 'INFORMANT') as RankTier));
  const steps: number[] = [];
  for (let i = 0; i < count; i++) {
    const take = idx === 0 ? Math.min(per, cur) : per;
    steps.push(take);
    if (take > 0) { const r = advanceRR(cur, idx, -take); cur = r.rr; idx = r.tierIdx; }
  }
  return { steps, tier: RANK_TIERS[idx], rr: cur };
}

interface ActRow { id: number; name: string; date: Date; cityId: number }

/** الفعاليّات التي تُعدّ في مدينةٍ وموسم: جرت (فيها مباراة)، غير ملغاة ولا محذوفة ولا تجريبيّة ولا مُعفاة */
async function countedActivities(seasonStart: Date, cityId: number, until: Date, finishedOnly: boolean): Promise<ActRow[]> {
  const db = getDB(); if (!db) return [];
  // finishedOnly (الأثر الرجعيّ): فعاليّةٌ ما زالت تلعب لا يُحكم غيابُها ولا تُعدّ بدايةَ مشاركة
  const r = await db.execute(sql`
    SELECT a.id, a.name, a.date, l.city_id FROM activities a JOIN locations l ON l.id = a.location_id
     WHERE l.city_id = ${cityId} AND NOT COALESCE(l.is_test_location, false)
       AND a.deleted_at IS NULL AND a.status <> 'cancelled' AND NOT COALESCE(a.absence_exempt, false)
       AND a.date >= ${seasonStart} AND a.date <= ${until}
       ${finishedOnly ? sql`AND (a.status = 'completed' OR a.date < NOW() - INTERVAL '8 hours')
       AND NOT EXISTS (SELECT 1 FROM sessions so WHERE so.activity_id = a.id AND so.deleted_at IS NULL AND so.is_active = TRUE)` : sql``}
       AND EXISTS (SELECT 1 FROM sessions s JOIN matches m ON m.session_id = s.id WHERE s.activity_id = a.id)
     ORDER BY a.date, a.id`);
  return rowsOf(r).map((x: any) => ({ id: Number(x.id), name: String(x.name || ''), date: new Date(x.date), cityId: Number(x.city_id) }));
}

/** مَن لعب في أيٍّ من هذه الفعاليّات: لاعب ⟵ مجموعة الفعاليّات */
async function attendanceOf(activityIds: number[]): Promise<Map<number, Set<number>>> {
  const out = new Map<number, Set<number>>();
  const db = getDB(); if (!db || !activityIds.length) return out;
  const r = await db.execute(sql`
    SELECT DISTINCT mp.player_id, s.activity_id FROM match_players mp
      JOIN matches m ON m.id = mp.match_id JOIN sessions s ON s.id = m.session_id
     WHERE s.activity_id = ANY(${'{' + activityIds.join(',') + '}'}::int[]) AND mp.player_id IS NOT NULL`);
  for (const x of rowsOf(r)) {
    const p = Number(x.player_id);
    if (!out.has(p)) out.set(p, new Set());
    out.get(p)!.add(Number(x.activity_id));
  }
  return out;
}

/** ترتيبُ الموسم في المدينة الآن (مَن له مباراة) */
async function standingsOf(seasonId: number, cityId: number): Promise<Map<number, { tier: string; rr: number; name: string }>> {
  const out = new Map<number, { tier: string; rr: number; name: string }>();
  const db = getDB(); if (!db) return out;
  const r = await db.execute(sql`
    SELECT pss.player_id, pss.rank_tier, pss.rank_rr, p.name FROM player_season_stats pss JOIN players p ON p.id = pss.player_id
     WHERE pss.season_id = ${seasonId} AND pss.city_id = ${cityId} AND COALESCE(pss.total_matches, 0) > 0`);
  for (const x of rowsOf(r)) out.set(Number(x.player_id), { tier: String(x.rank_tier || 'INFORMANT'), rr: Number(x.rank_rr) || 0, name: String(x.name || '') });
  return out;
}

export interface AbsenceLine { playerId: number; name: string; cityId: number; activityId: number; amount: number }
export interface AbsencePlan {
  seasonId: number;
  lines: AbsenceLine[];
  perPlayer: Array<{ playerId: number; name: string; cityId: number; missed: number; taken: number; before: { tier: string; rr: number }; after: { tier: string; rr: number }; activityIds: number[] }>;
  activities: ActRow[];
}

async function activeRegularSeason(): Promise<{ id: number; startedAt: Date } | null> {
  const db = getDB(); if (!db) return null;
  const r = rowsOf(await db.execute(sql`SELECT id, started_at FROM seasons WHERE type = 'REGULAR' AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`))[0];
  return r ? { id: Number(r.id), startedAt: new Date(r.started_at) } : null;
}

async function loadConfig() {
  const { getProgressionConfig } = await import('../routes/progression-settings.routes.js');
  applyProgressionConfig(await getProgressionConfig());
}

/** يبني الخطّة دون كتابة: `activityId` لفعاليّةٍ واحدة انتهت، أو بلا ⟵ كلّ ما فات منذ بداية الموسم (بأثرٍ رجعيّ) */
async function buildPlan(opts: { activityId?: number }): Promise<AbsencePlan | { skip: string }> {
  const db = getDB(); if (!db) return { skip: 'no-db' };
  await loadConfig();
  const season = await activeRegularSeason();
  if (!season) return { skip: 'no-active-regular-season' };

  let cities: number[];
  let target: ActRow | null = null;
  if (opts.activityId) {
    const a = rowsOf(await db.execute(sql`
      SELECT a.id, a.name, a.date, a.status, a.deleted_at, COALESCE(a.absence_exempt, false) AS exempt,
             l.city_id, COALESCE(l.is_test_location, false) AS is_test
        FROM activities a LEFT JOIN locations l ON l.id = a.location_id WHERE a.id = ${opts.activityId}`))[0];
    if (!a) return { skip: 'activity-not-found' };
    if (a.deleted_at || a.status === 'cancelled') return { skip: 'cancelled' };
    if (a.is_test) return { skip: 'test-location' };
    if (a.exempt) return { skip: 'exempt' };
    if (a.city_id == null) return { skip: 'no-city' };
    if (new Date(a.date) < season.startedAt) return { skip: 'before-season' };
    const { resolveSeasonForActivity } = await import('./season.service.js');
    const scope = await resolveSeasonForActivity(opts.activityId);
    if (!scope.isRegular || scope.seasonId !== season.id) return { skip: `not-regular-season(${scope.kind})` };
    target = { id: Number(a.id), name: String(a.name || ''), date: new Date(a.date), cityId: Number(a.city_id) };
    cities = [target.cityId];
  } else {
    cities = rowsOf(await db.execute(sql`SELECT DISTINCT city_id FROM player_season_stats WHERE season_id = ${season.id} AND city_id IS NOT NULL`)).map((x: any) => Number(x.city_id));
  }

  const plan: AbsencePlan = { seasonId: season.id, lines: [], perPlayer: [], activities: [] };
  for (const cityId of cities) {
    const acts = await countedActivities(season.startedAt, cityId, target ? target.date : new Date(), !target);
    if (target && !acts.some(a => a.id === target!.id)) continue;   // بلا مباراة ⟵ لم تجرِ
    plan.activities.push(...(target ? acts.filter(a => a.id === target!.id) : acts));
    const att = await attendanceOf(acts.map(a => a.id));
    const stand = await standingsOf(season.id, cityId);
    const already = new Set(rowsOf(await db.execute(sql`
      SELECT player_id, reason FROM rank_bonuses WHERE season_id = ${season.id} AND reason LIKE ${`absence:s${season.id}:a%`}`))
      .map((x: any) => `${x.player_id}|${x.reason}`));

    for (const [pid, st] of stand) {
      const mine = att.get(pid) || new Set<number>();
      const first = acts.find(a => mine.has(a.id));          // أوّل مشاركةٍ له في المدينة هذا الموسم
      if (!first) continue;
      const candidates = target ? [target] : acts;
      const missed = candidates.filter(a => a.date > first.date && !mine.has(a.id)
        && !already.has(`${pid}|${absenceReason(season.id, a.id)}`));
      if (!missed.length) continue;
      const { steps, tier, rr } = absenceSteps(st.rr, st.tier, missed.length);
      missed.forEach((a, i) => plan.lines.push({ playerId: pid, name: st.name, cityId, activityId: a.id, amount: steps[i] }));
      plan.perPlayer.push({ playerId: pid, name: st.name, cityId, missed: missed.length, taken: steps.reduce((s, x) => s + x, 0),
        before: { tier: st.tier, rr: st.rr }, after: { tier, rr }, activityIds: missed.map(a => a.id) });
    }
  }
  return plan;
}

export async function previewAbsence(opts: { activityId?: number } = {}) { return buildPlan(opts); }

/** نصُّ الإشعار — واحدٌ للمعاينة والإرسال، فما يُعرض في المعاينة هو ما يصل حرفيّاً */
export function absenceMessage(p: AbsencePlan['perPlayer'][number], mode: 'auto' | 'retro', cityName: string | null, act?: ActRow): string {
  const inCity = cityName ? ` في ${cityName}` : '';
  let body: string;
  if (mode === 'retro') {
    body = `خُصم من رانكك${inCity} ${pointsAr(p.taken)} لغيابك عن ${eventsAr(p.missed)} منذ أوّل مشاركةٍ لك هذا الموسم.`
      + (p.taken < p.missed * ABSENCE_RR ? ' توقّف الخصم عند الصفر.' : '')
      + `\nمن الآن: كلّ فعاليّة تغيب عنها يُخصم بها ${pointsAr(ABSENCE_RR)} من رانكك. احضر لتحافظ على رتبتك.`;
  } else {
    const day = act ? act.date.toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', weekday: 'long', day: 'numeric', month: 'long' }) : '';
    body = `خُصم من رانكك${inCity} ${pointsAr(p.taken)} لغيابك عن فعاليّة «${act?.name || ''}»${day ? ` يوم ${day}` : ''}. احضر الفعاليّة القادمة لتحافظ على رتبتك.`;
  }
  if ((RANK_ORDER[p.after.tier as RankTier] ?? 0) < (RANK_ORDER[p.before.tier as RankTier] ?? 0)) {
    body += `\n⬇️ ونزلت إلى رتبة ${RANK_NAMES_AR[p.after.tier as RankTier] || p.after.tier}.`;
  }
  return body;
}

/**
 * يطبّق الخطّة: يكتب السطور (المقدار الفعليّ، ومنها الأصفار كي لا يُعاد الحكم)، يصالح
 * المتأثّرين، ثمّ يُشعر مَن خُصم منه شيءٌ فعلاً. `notify=false` للاختبار.
 */
export async function applyAbsence(opts: { activityId?: number; notify?: boolean; mode: 'auto' | 'retro' }): Promise<{ skip?: string; written: number; affected: number; notified: number; plan?: AbsencePlan }> {
  const db = getDB(); if (!db) return { skip: 'no-db', written: 0, affected: 0, notified: 0 };
  const plan = await buildPlan({ activityId: opts.activityId });
  if ('skip' in plan) return { skip: plan.skip, written: 0, affected: 0, notified: 0 };
  if (!plan.lines.length) return { written: 0, affected: 0, notified: 0, plan };

  let written = 0;
  const writtenPlayers = new Set<number>();
  for (const l of plan.lines) {
    const ins = rowsOf(await db.execute(sql`
      INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, city_id, activity_id, meta)
      VALUES (${l.playerId}, ${-l.amount}, 0, ${absenceReason(plan.seasonId, l.activityId)}, ${plan.seasonId}, ${l.cityId}, ${l.activityId},
              ${JSON.stringify({ type: 'absence', mode: opts.mode, nominal: ABSENCE_RR, taken: l.amount, clamped: l.amount < ABSENCE_RR })}::jsonb)
      ON CONFLICT (player_id, reason) WHERE reason <> '' DO NOTHING RETURNING id`));
    if (ins.length) { written++; writtenPlayers.add(l.playerId); }
  }

  const { reconcileSeasonProgression } = await import('./reconcile.service.js');
  if (opts.mode === 'retro') await reconcileSeasonProgression(plan.seasonId, true);
  else if (writtenPlayers.size) await reconcileSeasonProgression(plan.seasonId, true, () => {}, { onlyPlayerIds: [...writtenPlayers] });

  // الإشعار: لمن كُتب له سطرٌ وخُصم منه شيءٌ فعلاً
  let notified = 0;
  const affected = plan.perPlayer.filter(p => p.taken > 0 && writtenPlayers.has(p.playerId));
  if (opts.notify !== false && affected.length) {
    const { sendPushToPlayer } = await import('./fcm.service.js');
    const { cityNameOf } = await import('./cities.service.js');
    const actName = new Map(plan.activities.map(a => [a.id, a]));
    for (const p of affected) {
      const city = await cityNameOf(p.cityId);
      const body = absenceMessage(p, opts.mode, city, actName.get(p.activityIds[0]));
      try {
        await sendPushToPlayer(p.playerId, '📉 خصم الغياب', body, 'rank_down', {
          kind: 'absence', amount: String(p.taken), missed: String(p.missed),
          cityId: String(p.cityId), cityName: city || '', url: '/player/rank',
        });
        notified++;
      } catch (e: any) { console.warn(`⚠️ [absence] إشعار اللاعب #${p.playerId} فشل:`, e?.message || e); }
    }
  }
  return { written, affected: affected.length, notified, plan };
}

/**
 * الحكمُ عند انتهاء فعاليّة: يُستدعى عند إغلاق كلّ غرفة، ولا يعمل إلّا حين تكون آخرَ غرفها
 * (`force` من المجدول الاحتياطيّ يتجاوز ذلك). مرّةً واحدة لكلّ فعاليّة (absence_judged_at).
 */
export async function judgeAbsences(activityId: number, opts?: { force?: boolean }): Promise<void> {
  const db = getDB(); if (!db) return;
  try {
    const a = rowsOf(await db.execute(sql`SELECT absence_judged_at FROM activities WHERE id = ${activityId}`))[0];
    if (!a || a.absence_judged_at) return;
    if (!opts?.force) {
      const open = rowsOf(await db.execute(sql`SELECT 1 FROM sessions WHERE activity_id = ${activityId} AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`));
      if (open.length) return;   // غرفةٌ أخرى للفعاليّة ما زالت تلعب — الحكمُ عند آخرها
    }
    // يُوسم قبل التطبيق: نداءان متزامنان (غرفتان أُغلقتا معاً) لا يحكمان مرّتين — والسطرُ نفسه فريدٌ احتياطاً
    const claim = rowsOf(await db.execute(sql`UPDATE activities SET absence_judged_at = NOW() WHERE id = ${activityId} AND absence_judged_at IS NULL RETURNING id`));
    if (!claim.length) return;
    const res = await applyAbsence({ activityId, mode: 'auto' });
    console.log(`📉 absence: activity #${activityId} — ${res.skip ? `skip (${res.skip})` : `${res.written} line(s), ${res.affected} deducted, ${res.notified} notified`}`);
  } catch (e: any) {
    console.warn('⚠️ judgeAbsences:', e?.message || e);
    // فشلٌ قبل الكتابة يُعيد الفعاليّة للمجدول
    await db.execute(sql`UPDATE activities SET absence_judged_at = NULL WHERE id = ${activityId}
      AND NOT EXISTS (SELECT 1 FROM rank_bonuses WHERE activity_id = ${activityId} AND reason LIKE 'absence:%')`).catch(() => {});
  }
}

/** مجدولٌ احتياطيّ: فعاليّةٌ جرت ولم تُغلق غرفها ⟵ يُحكم بعد ٨ ساعات من موعدها */
let jobs = false;
export function startAbsenceJobs(): void {
  if (jobs) return; jobs = true;
  const tick = async () => {
    const db = getDB(); if (!db) return;
    try {
      const r = await db.execute(sql`
        SELECT a.id FROM activities a LEFT JOIN locations l ON l.id = a.location_id
         WHERE a.absence_judged_at IS NULL AND a.deleted_at IS NULL AND a.status <> 'cancelled'
           AND a.date < NOW() - INTERVAL '8 hours' AND a.date > NOW() - INTERVAL '4 days'
           AND COALESCE(l.is_test_location, false) = false
         ORDER BY a.date`);
      for (const x of rowsOf(r)) await judgeAbsences(Number(x.id), { force: true });
    } catch (e: any) { console.warn('⚠️ absence job:', e?.message); }
  };
  setTimeout(() => { void tick(); }, 120e3);
  setInterval(() => { void tick(); }, 30 * 60e3);
}
