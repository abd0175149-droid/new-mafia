// ══════════════════════════════════════════════════════
// 🎁 مكافأة الحجز المبكر — Activity Booking Bonus Service
// منح نقاط رانك (RR) أو خبرة (XP) لمن حجز في فعاليّة قبل موعدٍ محدَّد.
// ══════════════════════════════════════════════════════
//
// 🔴 ثلاثة مبادئ تحكم هذا الملفّ — مخالفتها تُنتج أخطاءً صامتة:
//
// (١) **الحاجز = صفّ `bookings`** — أي ما تعرضه «قائمة الحجوزات» في صفحة تفاصيل
//     الفعاليّة حرفيّاً (قرار المالك 2026-08-26). لا نبني السكّان من `reservations`.
//     ولأنّ صفّ الحجز لا يُولد إلّا بتثبيتٍ أو حجزٍ من التطبيق أو إدخالٍ يدويّ،
//     فشرط «المثبَّت فقط» متحقّقٌ ببنية الجدول — لا حاجة لمفتاح تثبيتٍ في الواجهة.
//
// (٢) **زمن الحجز = أقدم الطابعين** بين `bookings.created_at` وأقدم صفّ `reservations`
//     مطابقٍ لنفس اللاعب في نفس الفعاليّة. السبب: من حجز عبر الواتساب مبكّراً لا
//     يُنشأ له صفّ `bookings` إلّا لحظة تثبيت الموظّف (`ensureBookingForReservation`)،
//     فاعتماد طابع `bookings` وحده يحرمه من مكافأةٍ استحقّها.
//
// (٣) **التطبيق عبر الدفتر ثمّ المصالحة، لا عبر applyRR/applyXPAndLevel مباشرةً.**
//     `reconcileSeasonProgression` تُعيد اشتقاق players.* و player_season_stats من
//     الصفر من `match_players` بعد كلّ مباراة وعند إنهاء كلّ فعاليّة؛ الناجي الوحيد
//     هو `rank_bonuses`. فالنداء المباشر يُنتج رقماً يُمحى خلال ساعات، بينما
//     «أدرِج في الدفتر ثمّ صالِح المستهدفين» يكتب الجدولين معاً بقيمةٍ مطلقة صحيحة —
//     وهو أيضاً ما يجعل التراجع مجرّد حذفٍ من الدفتر ثمّ مصالحة.
// ══════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { RANK_NAMES_AR, RANK_ORDER, type RankTier } from './progression.service.js';

// ── الأنواع ─────────────────────────────────────────
export type BonusKind = 'RR' | 'XP';
export type TimeBasis = 'earliest' | 'booking' | 'reservation';

export const BONUS_MIN = 1;
export const BONUS_MAX = 500;

/** سبب الاستبعاد — الواجهة تترجمه إلى سلال ظاهرة */
export type ExclusionCode =
  | 'ok' | 'no-account' | 'after-cutoff' | 'already-granted' | 'duplicate-row';

export interface PreviewRow {
  bookingId: number;
  name: string;
  phone: string;
  playerId: number | null;
  linkedBy: 'id' | 'phone' | null;
  bookedAt: string | null;          // الطابع المعتمَد وفق الأساس المختار
  bookingCreatedAt: string;
  reservationCreatedAt: string | null;
  sourceKind: 'app' | 'whatsapp' | 'reservation-confirm' | 'manual';
  createdBy: string;
  code: ExclusionCode;
  eligible: boolean;
  current: { rankTier: string; rankRR: number; level: number; xp: number } | null;
  previousGrant: { rr: number; xp: number; at: string } | null;
}

export interface PreviewResult {
  ok: true;
  reason: string;                    // مفتاح الدفعة التي ستُمنح
  isRepeat: boolean;
  seasonId: number | null;
  seasonName: string | null;
  activity: {
    id: number; name: string; date: string | null;
    locationName: string | null; isTestLocation: boolean;
  };
  rows: PreviewRow[];
  counts: { eligible: number; noAccount: number; afterCutoff: number; alreadyGranted: number; duplicateRow: number };
  warnings: string[];
}

export interface GrantOptions {
  activityId: number;
  kind: BonusKind;
  amount: number;
  cutoffAt: Date;
  basis: TimeBasis;
  allowRepeat?: boolean;
  note?: string | null;
  staffId?: number | null;
  staffName?: string | null;
}

// ── تطبيع رقم الهاتف (نسخة محرّك الجلوس — الأشمل) ──
// نحتاجه لربط صفّ حجزٍ بلا player_id بحساب لاعبٍ عبر الرقم: `players.phone` فريد
// فالمطابقة التامّة بعد التطبيع لا لبس فيها.
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-()+]/g, '');
  if (cleaned.startsWith('00962')) cleaned = cleaned.substring(5);
  else if (cleaned.startsWith('962')) cleaned = cleaned.substring(3);
  return cleaned.startsWith('0') ? cleaned : '0' + cleaned;
}

function rowsOf(res: any): any[] {
  return res?.rows ?? (Array.isArray(res) ? res : []);
}

/** تصنيف مصدر صفّ الحجز من وسم `created_by` — للعرض وتفسير فجوة الطابعين */
function classifySource(createdBy: string): PreviewRow['sourceKind'] {
  const c = (createdBy || '').trim();
  if (c === 'player-app') return 'app';
  if (c === 'reservation-confirm') return 'reservation-confirm';
  if (c.startsWith('🤖') || c.startsWith('🔒') || /بوت|واتساب|whatsapp/i.test(c)) return 'whatsapp';
  return 'manual';
}

/** مفتاح الدفعة: حتميّ افتراضاً كي تمنع القاعدةُ الازدواج، ومرقَّمٌ عند التكرار المتعمَّد */
export const bonusReasonBase = (activityId: number) => `activity-bonus:${activityId}`;

async function resolveBatchReason(
  activityId: number, allowRepeat: boolean,
): Promise<{ reason: string; isRepeat: boolean }> {
  const base = bonusReasonBase(activityId);
  if (!allowRepeat) return { reason: base, isRepeat: false };
  const db = getDB()!;
  const res = await db.execute(sql`
    SELECT COUNT(DISTINCT reason)::int AS n FROM rank_bonuses
    WHERE activity_id = ${activityId} AND reason LIKE ${base + '%'}`);
  const n = Number(rowsOf(res)[0]?.n || 0);
  return { reason: `${base}:r${n}`, isRepeat: true };
}

// ══════════════════════════════════════════════════════
// 🔍 المعاينة — مرآةٌ لقائمة الحجوزات صفّاً بصفّ
// ══════════════════════════════════════════════════════
// تُرجع **كلّ** صفّ حجزٍ في الفعاليّة (لا المؤهّلين وحدهم) مع حكمه وسببه، كي يقارنها
// المالك بعينه بالجدول المعروض فوقها في الصفحة. إخفاء المستبعدين يجعل الفارق بين
// «١٤ مؤهّلاً» و«٢٣ حجزاً» لغزاً يُخمَّن بدل أن يُقرأ.
export async function previewBookingBonus(opts: {
  activityId: number; kind: BonusKind; amount: number;
  cutoffAt: Date; basis: TimeBasis; allowRepeat?: boolean;
}): Promise<PreviewResult | { ok: false; error: string; code?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };

  const { activityId, cutoffAt, basis } = opts;

  // ── الفعاليّة + موقعها ──
  const actRes = await db.execute(sql`
    SELECT a.id, a.name, a.date, l.name AS location_name, COALESCE(l.is_test_location, false) AS is_test
    FROM activities a LEFT JOIN locations l ON l.id = a.location_id
    WHERE a.id = ${activityId} AND a.deleted_at IS NULL`);
  const act = rowsOf(actRes)[0];
  if (!act) return { ok: false, error: 'الفعاليّة غير موجودة' };

  // ── الموسم الذي ستُسجَّل فيه المكافأة ──
  const { resolveSeasonForActivity } = await import('./season.service.js');
  const { seasonId } = await resolveSeasonForActivity(activityId);
  let seasonName: string | null = null;
  if (seasonId) {
    const sres = await db.execute(sql`SELECT name FROM seasons WHERE id = ${seasonId}`);
    seasonName = rowsOf(sres)[0]?.name ?? null;
  }

  const { reason, isRepeat } = await resolveBatchReason(activityId, !!opts.allowRepeat);

  // ── (١) السكّان: صفوف الحجوزات كما تعرضها الصفحة ──
  const bRes = await db.execute(sql`
    SELECT b.id, b.name, b.phone, b.player_id, b.created_at, COALESCE(b.created_by, '') AS created_by
    FROM bookings b
    WHERE b.activity_id = ${activityId} AND b.deleted_at IS NULL
    ORDER BY b.created_at ASC, b.id ASC`);
  const bookingRows = rowsOf(bRes);

  // ── (٢) أقدم طابع متابعة لكلّ لاعب/رقم في هذه الفعاليّة ──
  const rRes = await db.execute(sql`
    SELECT player_id, phone, MIN(created_at) AS first_at
    FROM reservations
    WHERE activity_id = ${activityId} AND deleted_at IS NULL
    GROUP BY player_id, phone`);
  const resByPlayer = new Map<number, Date>();
  const resByPhone = new Map<string, Date>();
  for (const r of rowsOf(rRes)) {
    const at = r.first_at ? new Date(r.first_at) : null;
    if (!at) continue;
    const pid = r.player_id != null ? Number(r.player_id) : null;
    if (pid) {
      const prev = resByPlayer.get(pid);
      if (!prev || at < prev) resByPlayer.set(pid, at);
    }
    const ph = normalizePhone(r.phone || '');
    if (ph) {
      const prev = resByPhone.get(ph);
      if (!prev || at < prev) resByPhone.set(ph, at);
    }
  }

  // ── (٣) حلّ اللاعب لصفوف بلا player_id: مطابقة الهاتف (players.phone فريد) ──
  const unlinkedPhones = [...new Set(
    bookingRows.filter(b => b.player_id == null)
      .map(b => normalizePhone(b.phone || '')).filter(Boolean),
  )];
  const phoneToPlayer = new Map<string, number>();
  if (unlinkedPhones.length) {
    const pres = await db.execute(
      sql`SELECT id, phone FROM players WHERE phone IN ${unlinkedPhones}`);
    for (const p of rowsOf(pres)) phoneToPlayer.set(normalizePhone(p.phone || ''), Number(p.id));
  }

  const playerIdOf = (b: any): number | null => {
    if (b.player_id != null) return Number(b.player_id);
    return phoneToPlayer.get(normalizePhone(b.phone || '')) ?? null;
  };

  // ── (٤) أرصدة اللاعبين المعنيّين + المنح السابق لهذه الدفعة ──
  const playerIds = [...new Set(
    bookingRows.map(playerIdOf).filter((x): x is number => !!x),
  )];
  const cur = new Map<number, PreviewRow['current']>();
  const granted = new Map<number, { rr: number; xp: number; at: string }>();
  if (playerIds.length) {
    const cres = await db.execute(sql`
      SELECT id, COALESCE(rank_tier,'INFORMANT') AS rank_tier, COALESCE(rank_rr,0) AS rank_rr,
             COALESCE(level,1) AS level, COALESCE(xp,0) AS xp
      FROM players WHERE id IN ${playerIds}`);
    for (const p of rowsOf(cres)) {
      cur.set(Number(p.id), {
        rankTier: p.rank_tier, rankRR: Number(p.rank_rr),
        level: Number(p.level), xp: Number(p.xp),
      });
    }
    const gres = await db.execute(sql`
      SELECT player_id, rr, COALESCE(xp,0) AS xp, created_at FROM rank_bonuses
      WHERE reason = ${reason} AND player_id IN ${playerIds}`);
    for (const g of rowsOf(gres)) {
      granted.set(Number(g.player_id), {
        rr: Number(g.rr) || 0, xp: Number(g.xp) || 0,
        at: new Date(g.created_at).toISOString(),
      });
    }
  }

  // ── (٥) الحكم على كلّ صفّ ──
  // لاعبٌ بصفَّي حجزٍ يُمنح مرّة واحدة — والأقدم يفوز (الترتيب تصاعديّ بالطابع).
  const seenPlayer = new Set<number>();
  const rows: PreviewRow[] = [];
  for (const b of bookingRows) {
    const phoneNorm = normalizePhone(b.phone || '');
    const directId = b.player_id != null ? Number(b.player_id) : null;
    const byPhoneId = directId ? null : (phoneToPlayer.get(phoneNorm) ?? null);
    const playerId = directId ?? byPhoneId;
    const linkedBy: PreviewRow['linkedBy'] = directId ? 'id' : (byPhoneId ? 'phone' : null);

    const bookingAt = new Date(b.created_at);
    const resAt = (playerId ? resByPlayer.get(playerId) : undefined)
      ?? (phoneNorm ? resByPhone.get(phoneNorm) : undefined);

    // الأساس الزمنيّ — 'earliest' هو الافتراضيّ المُقرَّر
    let bookedAt: Date;
    if (basis === 'booking') bookedAt = bookingAt;
    else if (basis === 'reservation') bookedAt = resAt ?? bookingAt;
    else bookedAt = resAt && resAt < bookingAt ? resAt : bookingAt;

    let code: ExclusionCode = 'ok';
    if (!playerId) code = 'no-account';
    else if (seenPlayer.has(playerId)) code = 'duplicate-row';
    else if (bookedAt.getTime() > cutoffAt.getTime()) code = 'after-cutoff';
    else if (granted.has(playerId)) code = 'already-granted';

    if (code === 'ok' && playerId) seenPlayer.add(playerId);

    rows.push({
      bookingId: Number(b.id),
      name: b.name || '',
      phone: b.phone || '',
      playerId,
      linkedBy,
      bookedAt: bookedAt.toISOString(),
      bookingCreatedAt: bookingAt.toISOString(),
      reservationCreatedAt: resAt ? resAt.toISOString() : null,
      sourceKind: classifySource(b.created_by),
      createdBy: b.created_by || '',
      code,
      eligible: code === 'ok',
      current: playerId ? (cur.get(playerId) ?? null) : null,
      previousGrant: playerId ? (granted.get(playerId) ?? null) : null,
    });
  }

  const counts = {
    eligible: rows.filter(r => r.code === 'ok').length,
    noAccount: rows.filter(r => r.code === 'no-account').length,
    afterCutoff: rows.filter(r => r.code === 'after-cutoff').length,
    alreadyGranted: rows.filter(r => r.code === 'already-granted').length,
    duplicateRow: rows.filter(r => r.code === 'duplicate-row').length,
  };

  // ── (٦) التحذيرات — ما يجب أن يراه المالك قبل الضغط ──
  const warnings: string[] = [];
  if (!seasonId) {
    warnings.push('⛔ لا يوجد موسمٌ نشط — المنح متوقّف. مكافأةٌ بلا موسمٍ تختفي عند أوّل إعادة احتساب.');
  }
  if (act.is_test) {
    warnings.push('🧪 هذه الفعاليّة في موقعٍ اختباريّ — مبارياته لا تُحتسب في الرانك، لكنّ هذه المكافأة ستُحتسب.');
  }
  if (act.date && cutoffAt.getTime() > new Date(act.date).getTime()) {
    warnings.push('⏰ موعد القطع بعد موعد الفعاليّة نفسها — سيشمل من حجز في آخر لحظة.');
  }
  if (opts.amount > 100) {
    warnings.push(`⚠️ القيمة ${opts.amount} مرتفعة — تأكّد أنّها مقصودة قبل تطبيقها على ${counts.eligible} لاعباً.`);
  }
  if (counts.noAccount > 0) {
    warnings.push(`👤 ${counts.noAccount} حجزاً بلا حساب لاعب (ضيوف أو أرقام غير مربوطة) — لا يمكن منحهم نقاطاً.`);
  }
  const byPhoneCount = rows.filter(r => r.linkedBy === 'phone' && r.eligible).length;
  if (byPhoneCount > 0) {
    warnings.push(`🔗 ${byPhoneCount} صفّاً رُبط بحسابٍ عبر مطابقة الهاتف لا عبر ربطٍ صريح — راجعها.`);
  }

  return {
    ok: true, reason, isRepeat, seasonId, seasonName,
    activity: {
      id: Number(act.id), name: act.name,
      date: act.date ? new Date(act.date).toISOString() : null,
      locationName: act.location_name ?? null, isTestLocation: !!act.is_test,
    },
    rows, counts, warnings,
  };
}

// ══════════════════════════════════════════════════════
// 🎁 المنح
// ══════════════════════════════════════════════════════
export async function grantBookingBonus(opts: GrantOptions): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };

  const amount = Math.trunc(Number(opts.amount) || 0);
  if (!Number.isFinite(amount) || amount < BONUS_MIN || amount > BONUS_MAX) {
    return { ok: false, error: `القيمة يجب أن تكون بين ${BONUS_MIN} و ${BONUS_MAX}` };
  }
  if (opts.kind !== 'RR' && opts.kind !== 'XP') {
    return { ok: false, error: 'نوع المكافأة غير صالح' };
  }

  const pv = await previewBookingBonus({
    activityId: opts.activityId, kind: opts.kind, amount,
    cutoffAt: opts.cutoffAt, basis: opts.basis, allowRepeat: opts.allowRepeat,
  });
  if (pv.ok !== true) return pv;

  // 🛡️ بلا موسمٍ لا منح: صفّ دفترٍ بـ season_id=NULL تتخطّاه المصالحة المستهدفة
  //    (شرطها `season_id = X`) فيصير المنح رقماً يظهر ثمّ يختفي بلا أثر.
  if (!pv.seasonId) {
    return { ok: false, code: 'NO_ACTIVE_SEASON', error: 'لا يوجد موسمٌ نشط — ابدأ موسماً قبل منح النقاط' };
  }

  const eligible = pv.rows.filter(r => r.eligible && r.playerId);
  if (eligible.length === 0) {
    const dup = pv.counts.alreadyGranted > 0;
    return {
      ok: false,
      code: dup ? 'ALREADY_GRANTED' : 'NO_ELIGIBLE',
      error: dup
        ? 'كلّ المؤهّلين نالوا هذه المكافأة سابقاً — للمنح مرّة أخرى فعّل التكرار المتعمّد'
        : 'لا يوجد حاجزٌ مؤهّل بهذه الشروط',
      preview: pv,
    };
  }

  const playerIds = eligible.map(r => r.playerId!) as number[];
  const rr = opts.kind === 'RR' ? amount : 0;
  const xp = opts.kind === 'XP' ? amount : 0;
  const meta = {
    kind: opts.kind, amount, basis: opts.basis,
    cutoffAt: opts.cutoffAt.toISOString(),
    activityName: pv.activity.name,
    staffName: opts.staffName ?? null,
    note: opts.note ?? null,
  };

  // ── لقطة «قبل» — بها وحدها نعرف من تُرقّي ومن رفع مستواه ──
  const beforeRes = await db.execute(sql`
    SELECT id, COALESCE(rank_tier,'INFORMANT') AS rank_tier, COALESCE(rank_rr,0) AS rank_rr,
           COALESCE(level,1) AS level, COALESCE(xp,0) AS xp
    FROM players WHERE id IN ${playerIds}`);
  const before = new Map<number, any>();
  for (const p of rowsOf(beforeRes)) before.set(Number(p.id), p);

  // ── (١) الدفتر — حارسا ازدواجٍ متعاضدان في عبارةٍ واحدة ──
  // `WHERE NOT EXISTS` يعمل دائماً حتى لو تعذّر إنشاء الفهرس الفريد عند الإقلاع
  // (صفوفٌ قديمة مكرّرة تُسقطه)، و`ON CONFLICT DO NOTHING` **بلا هدف** يمتصّ سباق
  // النقرة المزدوجة إن كان الفهرس موجوداً. وتُرِك بلا هدفٍ عمداً: الفهرس **جزئيّ**
  // (`WHERE reason <> ''`) و`ON CONFLICT (player_id, reason)` لا يستنتج فهرساً
  // جزئيّاً بلا تكرار شرطه — فيرمي «no unique or exclusion constraint matching».
  let inserted = 0;
  for (const r of eligible) {
    const ins = await db.execute(sql`
      INSERT INTO rank_bonuses (player_id, rr, xp, reason, season_id, activity_id, granted_by, meta)
      SELECT ${r.playerId}::int, ${rr}::int, ${xp}::int, ${pv.reason}::varchar,
             ${pv.seasonId}::int, ${opts.activityId}::int,
             ${opts.staffId ?? null}::int, ${JSON.stringify(meta)}::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM rank_bonuses WHERE player_id = ${r.playerId} AND reason = ${pv.reason}
      )
      ON CONFLICT DO NOTHING
      RETURNING id`);
    if (rowsOf(ins).length) inserted++;
  }

  if (inserted === 0) {
    return {
      ok: false, code: 'ALREADY_GRANTED',
      error: 'لم يُدرَج شيء — كلّهم نالوا هذه المكافأة سابقاً', preview: pv,
    };
  }

  // ── (٢) المصالحة المستهدفة: تكتب players.* و player_season_stats بقيمةٍ مطلقة ──
  const { reconcileSeasonProgression } = await import('./reconcile.service.js');
  const rec = await reconcileSeasonProgression(pv.seasonId, true, () => {}, { onlyPlayerIds: playerIds });

  // ── لقطة «بعد» ──
  const afterRes = await db.execute(sql`
    SELECT id, COALESCE(rank_tier,'INFORMANT') AS rank_tier, COALESCE(rank_rr,0) AS rank_rr,
           COALESCE(level,1) AS level, COALESCE(xp,0) AS xp
    FROM players WHERE id IN ${playerIds}`);
  const after = new Map<number, any>();
  for (const p of rowsOf(afterRes)) after.set(Number(p.id), p);

  // ── (٣) الإشعارات — مكافأةٌ لا يعلم بها صاحبها نصفُ مكافأة ──
  const { sendPushToPlayer } = await import('./fcm.service.js');
  const results: any[] = [];
  let notified = 0;
  for (const r of eligible) {
    const pid = r.playerId!;
    const b = before.get(pid);
    const a = after.get(pid);
    const promoted = !!(b && a)
      && (RANK_ORDER[a.rank_tier as RankTier] ?? 0) > (RANK_ORDER[b.rank_tier as RankTier] ?? 0);
    const leveledUp = !!(b && a) && Number(a.level) > Number(b.level);

    let body = opts.kind === 'RR'
      ? `+${amount} نقطة رانك لحجزك المبكّر في «${pv.activity.name}» — شكراً لالتزامك! 🎉`
      : `+${amount} نقطة خبرة لحجزك المبكّر في «${pv.activity.name}» — شكراً لالتزامك! 🎉`;
    if (promoted) body += `\n🏆 وترقّيت إلى ${RANK_NAMES_AR[a.rank_tier as RankTier] || a.rank_tier}!`;
    if (leveledUp) body += `\n⬆️ ووصلت المستوى ${a.level}!`;

    try {
      await sendPushToPlayer(pid, '🎁 مكافأة الحجز المبكّر', body, 'rank_bonus', {
        activityId: String(opts.activityId), kind: opts.kind,
        amount: String(amount), grantReason: pv.reason,
      });
      notified++;
    } catch (e: any) {
      console.warn(`⚠️ [activity-bonus] إشعار اللاعب #${pid} فشل:`, e?.message || e);
    }

    results.push({
      playerId: pid, name: r.name, amount, kind: opts.kind, promoted, leveledUp,
      before: b ? { tier: b.rank_tier, rr: Number(b.rank_rr), level: Number(b.level), xp: Number(b.xp) } : null,
      after: a ? { tier: a.rank_tier, rr: Number(a.rank_rr), level: Number(a.level), xp: Number(a.xp) } : null,
    });
  }

  console.log(
    `🎁 [activity-bonus] الفعاليّة #${opts.activityId} — ${opts.kind} ${amount} × ${inserted} لاعب | ` +
    `دفعة=${pv.reason} | موسم=${pv.seasonId} | مصالحة=${rec.applied}/${rec.reason} | إشعارات=${notified}`,
  );

  return {
    ok: true, reason: pv.reason, isRepeat: pv.isRepeat, kind: opts.kind, amount,
    granted: inserted, notified, seasonId: pv.seasonId, seasonName: pv.seasonName,
    reconcile: { applied: rec.applied, reason: rec.reason, players: rec.players },
    results, warnings: pv.warnings,
  };
}

// ══════════════════════════════════════════════════════
// 📜 السجلّ — دفعات هذه الفعاليّة
// ══════════════════════════════════════════════════════
export async function listBonusHistory(activityId: number): Promise<any[]> {
  const db = getDB();
  if (!db) return [];
  try {
    const res = await db.execute(sql`
      SELECT rb.reason,
             MIN(rb.created_at)          AS granted_at,
             COUNT(*)::int               AS players,
             SUM(rb.rr)::int             AS total_rr,
             SUM(COALESCE(rb.xp,0))::int AS total_xp,
             MAX(rb.season_id)           AS season_id,
             (ARRAY_AGG(rb.meta ORDER BY rb.id))[1]        AS meta,
             (ARRAY_AGG(s.display_name ORDER BY rb.id))[1] AS granted_by_name
      FROM rank_bonuses rb
      LEFT JOIN staff s ON s.id = rb.granted_by
      WHERE rb.activity_id = ${activityId}
      GROUP BY rb.reason
      ORDER BY MIN(rb.created_at) DESC`);
    return rowsOf(res).map(r => ({
      reason: r.reason,
      grantedAt: new Date(r.granted_at).toISOString(),
      players: Number(r.players),
      totalRR: Number(r.total_rr) || 0,
      totalXP: Number(r.total_xp) || 0,
      seasonId: r.season_id != null ? Number(r.season_id) : null,
      grantedByName: r.granted_by_name ?? null,
      meta: r.meta ?? null,
    }));
  } catch (e: any) {
    // الأعمدة الجديدة تُضاف عند الإقلاع؛ خادمٌ لم يُعَد تشغيله بعد لا يجب أن يُسقط الصفحة
    console.warn('⚠️ [activity-bonus] سجلّ الدفعات غير متاح:', e?.message || e);
    return [];
  }
}

// ══════════════════════════════════════════════════════
// ↩️ التراجع — حذفٌ من الدفتر ثمّ مصالحة
// ══════════════════════════════════════════════════════
// لا نطرح القيمة بـapplyXPAndLevel/applyRR بقيمةٍ سالبة: حلقة المستوى تصعد فقط ولا
// تعرف كيف تنزل مستوىً واحداً، فطرحُ خبرةٍ يترك xp سالباً أو مستوىً كاذباً. المصالحة
// تُعيد الاشتقاق من الصفر فتعود القيم إلى ما قبل المنح بالضبط.
export async function revokeBonusBatch(activityId: number, reason: string): Promise<any> {
  const db = getDB();
  if (!db) return { ok: false, error: 'قاعدة البيانات غير متاحة' };

  const del = await db.execute(sql`
    DELETE FROM rank_bonuses WHERE activity_id = ${activityId} AND reason = ${reason}
    RETURNING player_id, season_id`);
  const removed = rowsOf(del);
  if (removed.length === 0) return { ok: false, code: 'NOT_FOUND', error: 'لا توجد دفعةٌ بهذا المفتاح' };

  const playerIds = [...new Set(removed.map(r => Number(r.player_id)).filter(Boolean))];
  const seasonIds = [...new Set(removed.map(r => (r.season_id != null ? Number(r.season_id) : null)))];

  const { reconcileSeasonProgression } = await import('./reconcile.service.js');
  for (const sid of seasonIds) {
    await reconcileSeasonProgression(sid, true, () => {}, { onlyPlayerIds: playerIds });
  }

  // 🔕 سحبُ الإشعار المرافق: تركُ «حصلت على ٢٠ نقطة» في صندوق لاعبٍ لا يملكها
  //    سجلٌّ كاذب. نحذف صفوف هذه الدفعة وحدها (المفتاح في data.grantReason).
  let notifRemoved = 0;
  try {
    const nd = await db.execute(sql`
      DELETE FROM player_notifications
      WHERE type = 'rank_bonus' AND data->>'grantReason' = ${reason}
      RETURNING id`);
    notifRemoved = rowsOf(nd).length;
  } catch (e: any) {
    console.warn('⚠️ [activity-bonus] حذف إشعارات الدفعة فشل:', e?.message || e);
  }

  console.log(`↩️ [activity-bonus] تراجع عن الدفعة ${reason} — ${removed.length} صفّ، ${playerIds.length} لاعب، ${notifRemoved} إشعار`);
  return { ok: true, removed: removed.length, players: playerIds.length, notifRemoved };
}
