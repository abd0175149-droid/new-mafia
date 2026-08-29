// ══════════════════════════════════════════════════════
// 🗑️ حذف الحساب — مهلةٌ ثمّ تجهيل
//
// ثلاثةُ شروطٍ تلتقي هنا:
//  • المالك: حذفٌ قابلٌ للتراجع، فمَن ضغط خطأً يستعيد.
//  • آبل 5.1.1(v): لا يكفي تعطيلُ الحساب — يجب أن يكتمل الحذف فعلاً.
//  • قانون ٢٤/٢٠٢٣: لا تبقى البياناتُ معرِّفةً بعد انتهاء غرضها.
// الحلُّ: تعطيلٌ فوريّ ← ثلاثون يوماً ← تجهيلٌ لا محو.
//
// 🔴 لماذا تجهيلٌ لا حذفُ صفوف: حذفُ `match_players` يُفسد تاريخ خصومك —
//    مبارياتٌ بلا لاعبين وإحصاءاتٌ تنكسر لأناسٍ لم يطلبوا شيئاً. والقانون يجيز
//    الحجب كما يجيز المحو. فتبقى الصفوف بلا هويّة.
//
// 🔴 ولماذا قائمةُ الجداول مكتوبةٌ صراحةً: نحو خمسةٍ وعشرين جدولاً تحمل اسماً أو
//    هاتفاً بلا مفتاحٍ أجنبيّ يربطها بـ`players`. الاعتمادُ على CASCADE يترك
//    أكثرَها يتيماً — وهو ما يفعله الحذف القائم اليوم.
// ══════════════════════════════════════════════════════

import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { deletionRequests } from '../schemas/consent.schema.js';
import fs from 'fs';
import path from 'path';

/** مهلةُ التراجع — قرار المالك */
export const GRACE_DAYS = 30;

export type DeletionReason = 'refused_consent' | 'withdrew_consent' | 'user_request' | 'admin';

export interface DeletionPreview {
  chipsBalance: number;
  matches: number;
  rankTier: string | null;
  level: number | null;
  upcomingBookings: number;
  /** 🔴 رصيدٌ اشتُري بمالٍ حقيقيّ يجب أن يُسوّى لا أن يُصادَر */
  needsSettlement: boolean;
}

/** ما الذي سيفقده اللاعب — يُعرض قبل التأكيد، لا بعده */
export async function previewDeletion(playerId: number): Promise<DeletionPreview | null> {
  const db = getDB();
  if (!db) return null;

  const [p] = await db.select({
    chips: players.chipsBalance, matches: players.totalMatches,
    tier: players.rankTier, level: players.level,
  }).from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return null;

  const [{ n }] = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM bookings b
    JOIN activities a ON a.id = b.activity_id
    WHERE b.deleted_at IS NULL AND a.deleted_at IS NULL
      AND a.date > NOW() AND b.player_id = ${playerId}
  `).then((r: any) => r.rows ?? r);

  const chips = Number(p.chips) || 0;
  return {
    chipsBalance: chips,
    matches: Number(p.matches) || 0,
    rankTier: p.tier ?? null,
    level: p.level ?? null,
    upcomingBookings: Number(n) || 0,
    needsSettlement: chips > 0,
  };
}

/**
 * طلبُ الحذف — المرحلة الأولى.
 * الحسابُ يُعطَّل فوراً ويختفي، والبياناتُ تبقى مقفلةً حتّى `dueAt`.
 */
export async function requestDeletion(
  playerId: number, reason: DeletionReason, platform = 'web', note = '',
): Promise<{ ok: boolean; dueAt?: Date; error?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'DB unavailable' };

  const [p] = await db.select({ id: players.id, chips: players.chipsBalance, deletedAt: players.deletedAt })
    .from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return { ok: false, error: 'الحساب غير موجود' };
  if (p.deletedAt) return { ok: false, error: 'الحساب مجدولٌ للحذف أصلاً' };

  const now = new Date();
  const dueAt = new Date(now.getTime() + GRACE_DAYS * 86400_000);

  await db.update(players).set({
    deletedAt: now, deletionDueAt: dueAt, deletionReason: reason,
  } as any).where(eq(players.id, playerId));

  await db.insert(deletionRequests).values({
    playerId, reason, requestedAt: now, dueAt, status: 'pending',
    chipsAtRequest: Number(p.chips) || 0, note: String(note).slice(0, 300), platform,
  } as any);

  // إبطالُ الأجهزة: إشعارٌ يصل حساباً محذوفاً خطأٌ ظاهرٌ للمستخدم
  await db.execute(sql`UPDATE player_fcm_tokens SET is_active = false WHERE player_id = ${playerId}`);
  // إلغاءُ الحجوزات القادمة — مقعدٌ محجوزٌ لغائبٍ يحرم غيره
  await db.execute(sql`
    UPDATE bookings SET deleted_at = NOW()
    WHERE player_id = ${playerId} AND deleted_at IS NULL
      AND activity_id IN (SELECT id FROM activities WHERE date > NOW() AND deleted_at IS NULL)
  `);

  console.log(`🗑️ طلبُ حذفٍ للاعب ${playerId} (${reason}) — يكتمل ${dueAt.toISOString()}`);
  return { ok: true, dueAt };
}

/** الاستعادة — بالدخول نفسه خلال المهلة، بلا مراسلةِ دعم */
export async function restoreAccount(playerId: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDB();
  if (!db) return { ok: false, error: 'DB unavailable' };

  const [p] = await db.select({ deletedAt: players.deletedAt, anonymizedAt: players.anonymizedAt })
    .from(players).where(eq(players.id, playerId)).limit(1);
  if (!p) return { ok: false, error: 'الحساب غير موجود' };
  if (p.anonymizedAt) return { ok: false, error: 'انتهت المهلة ولا يمكن الاستعادة' };
  if (!p.deletedAt) return { ok: true };

  await db.update(players).set({
    deletedAt: null, deletionDueAt: null, deletionReason: null,
  } as any).where(eq(players.id, playerId));

  await db.update(deletionRequests).set({ status: 'restored', restoredAt: new Date() } as any)
    .where(and(eq(deletionRequests.playerId, playerId), eq(deletionRequests.status, 'pending')));

  console.log(`♻️ استُعيد الحساب ${playerId}`);
  return { ok: true };
}

// ══════════════════════════════════════════════════════
// التجهيل — المرحلة الثالثة
// ══════════════════════════════════════════════════════

/** نصٌّ يحلّ محلّ الاسم: يبقى الصفُّ مفهوماً بلا أن يدلّ على أحد */
const TOMB = 'لاعب محذوف';

/**
 * تجهيلُ كلّ أثرٍ معرِّفٍ للاعب.
 *
 * ⚠️ كلُّ جملةٍ هنا مكتوبةٌ لأنّ الجدول لا مفتاحَ أجنبيّ له. حذفُ جملةٍ يترك
 *    اسماً أو هاتفاً في الإنتاج. أضِف الجدولَ هنا كلّما أضفتَ عموداً يحمل هويّة.
 */
export async function anonymizePlayer(playerId: number): Promise<void> {
  const db = getDB();
  if (!db) return;
  const id = playerId;

  // 1) الصورة على القرص — ملفٌّ لا صفّ، فلا استعلامَ يطاله
  try {
    const [p] = await db.select({ avatar: players.avatarUrl }).from(players).where(eq(players.id, id)).limit(1);
    const url = String(p?.avatar || '');
    if (url.startsWith('/uploads/avatars/')) {
      const f = path.join(process.cwd(), 'uploads', 'avatars', path.basename(url));
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  } catch { /* ملفٌّ مفقود لا يوقف التجهيل */ }

  // 2) الحساب نفسه — الهاتف يُستبدل بمفتاحٍ فريدٍ لا يدلّ (العمود UNIQUE)
  await db.execute(sql`
    UPDATE players SET
      name = ${TOMB},
      phone = ${'deleted:' + id},
      email = NULL,
      dob = NULL,
      gender = NULL,
      avatar_url = NULL,
      password_hash = NULL,
      geofence_exempt_reason = NULL,
      anonymized_at = NOW()
    WHERE id = ${id}
  `);

  // 3) نسخُ الاسم والهاتف داخل اللعب
  await db.execute(sql`UPDATE session_players SET player_name = ${TOMB}, phone = NULL, gender = NULL, date_of_birth = NULL WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE match_players SET player_name = ${TOMB} WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE bookings SET name = ${TOMB}, phone = '' WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE booking_members SET name = ${TOMB}, phone = NULL WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE reservations SET contact_name = ${TOMB}, phone = NULL, contact_method = NULL, notes = '' WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE tickets SET used_by_name = ${TOMB}, used_by_phone = NULL WHERE used_by_player_id = ${id}`);
  await db.execute(sql`UPDATE orders SET player_name = ${TOMB}, note = '' WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE service_requests SET player_name = ${TOMB}, note = '' WHERE player_id = ${id}`);

  // 4) الموقع — يُحذف حذفاً: لا قيمةَ إحصائيّةً لموقعٍ بلا صاحب
  await db.execute(sql`DELETE FROM player_last_fix WHERE player_id = ${id}`);
  await db.execute(sql`DELETE FROM presence_checks WHERE player_id = ${id}`);

  // 5) الاشتباه والمراقبة — تُحذف: رأيٌ عن شخصٍ لم يعد له حساب
  await db.execute(sql`DELETE FROM cheat_signals WHERE player_id = ${id}`);
  await db.execute(sql`DELETE FROM cheat_reviews WHERE player_id = ${id}`);
  await db.execute(sql`DELETE FROM blocked_pairs WHERE player1_id = ${id} OR player2_id = ${id}`);

  // 6) الأجهزة والإشعارات
  await db.execute(sql`DELETE FROM player_fcm_tokens WHERE player_id = ${id}`);
  await db.execute(sql`DELETE FROM player_notifications WHERE player_id = ${id}`);

  // 7) واتساب — المحادثةُ مراسلاتٌ خاصّة
  await db.execute(sql`DELETE FROM wa_messages WHERE conversation_id IN (SELECT id FROM wa_conversations WHERE player_id = ${id})`);
  await db.execute(sql`DELETE FROM wa_conversations WHERE player_id = ${id}`);
  await db.execute(sql`DELETE FROM wa_customer_notes WHERE player_id = ${id}`);
  await db.execute(sql`UPDATE wa_campaign_recipients SET name = ${TOMB}, phone = '' WHERE player_id = ${id}`);

  // 8) الآراء الحرّة المنسوبة
  await db.execute(sql`UPDATE room_feedback SET notes = NULL WHERE player_id = ${id}`);

  // 9) سجلُّ الموظّفين — يبقى الحدثُ ويسقط الاسم
  await db.execute(sql`UPDATE staff_action_log SET target_name = ${TOMB} WHERE target_player_id = ${id}`)
    .catch(async () => { await db.execute(sql`UPDATE staff_action_log SET target_name = ${TOMB} WHERE details->>'playerId' = ${String(id)}`).catch(() => {}); });

  // 10) الأسماءُ والهواتفُ داخل JSONB — أخفى المواضع وأسهلُها إغفالاً
  await db.execute(sql`
    UPDATE activities SET seat_assignments = (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN (e->>'playerId')::int = ${id}
             THEN jsonb_set(jsonb_set(e - 'phone', '{playerName}', to_jsonb(${TOMB}::text)), '{playerId}', 'null'::jsonb)
             ELSE e END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(seat_assignments) e
    )
    WHERE seat_assignments @> ${JSON.stringify([{ playerId: id }])}::jsonb
  `).catch(() => {});
  await db.execute(sql`
    UPDATE seat_templates SET pinned_seats = (
      SELECT COALESCE(jsonb_agg(
        CASE WHEN (e->>'playerId')::int = ${id}
             THEN jsonb_set(jsonb_set(e - 'phone', '{playerName}', to_jsonb(${TOMB}::text)), '{playerId}', 'null'::jsonb)
             ELSE e END
      ), '[]'::jsonb)
      FROM jsonb_array_elements(pinned_seats) e
    )
    WHERE pinned_seats @> ${JSON.stringify([{ playerId: id }])}::jsonb
  `).catch(() => {});

  // 11) الموافقاتُ تبقى — سندُ المعالجة يُثبَت بعد الحذف كما قبله، وهي بلا اسم.
  //     والقيدُ الماليّ (chips_ledger) يبقى بالمدّة القانونيّة، مجهَّلاً بتجهيل الحساب.

  await db.update(deletionRequests).set({ status: 'completed', completedAt: new Date() } as any)
    .where(and(eq(deletionRequests.playerId, id), eq(deletionRequests.status, 'pending')));

  console.log(`🧹 جُهّل الحساب ${id} نهائيّاً`);
}

/** المهمّة اليوميّة: تجهيلُ ما انتهت مهلتُه */
export async function runDeletionSweep(): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const due = await db.select({ id: players.id })
    .from(players)
    .where(and(
      sql`${players.deletedAt} IS NOT NULL`,
      isNull(players.anonymizedAt),
      lte(players.deletionDueAt, new Date()),
    ));
  for (const p of due) {
    try { await anonymizePlayer(p.id); }
    catch (e: any) { console.error(`⚠️ تعذّر تجهيل ${p.id}:`, e.message); }
  }
  if (due.length) console.log(`🧹 اكتمل حذفُ ${due.length} حساباً`);
  return due.length;
}
