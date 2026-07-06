// ══════════════════════════════════════════════════════
// 🌐 بوّابتا الوصول للعب عن بُعد — المصدر الموحّد لقرار «مَن يستضيف» و«مَن ينضمّ»
//
// الاستضافة (canHostRemote): قائمة سماحٍ يديرها الأدمن الآن (players.can_host_remote)؛
//   لاحقاً تُستبدَل/تُضاف بوّابة اشتراك استضافةٍ مدفوع — دون تغيير نقاط الفرض.
// الانضمام (canJoinRemote): مجّانيّ أثناء فترة الإطلاق (REMOTE_JOIN_FREE≠false)؛
//   لاحقاً اشتراكٌ رمزيّ عبر players.remote_access_until.
//
// نقاط الفرض: canHostRemote عند room:create-remote، وcanJoinRemote عند room:auto-join
//   للغرف البعيدة فقط (غرف القاعة لا تتأثّر).
// ══════════════════════════════════════════════════════

import { getDB } from '../config/db.js';
import { players } from '../schemas/player.schema.js';
import { eq } from 'drizzle-orm';

export interface RemoteAccessFields {
  canHostRemote?: boolean | null;
  remoteAccessUntil?: Date | string | null;
}

/** أثناء فترة الإطلاق المجّانيّ، الانضمام مجّانيّ للجميع. يُضبط REMOTE_JOIN_FREE=false لتفعيل الاشتراك. */
function joinIsFreeNow(): boolean {
  return (process.env.REMOTE_JOIN_FREE ?? 'true') !== 'false';
}

/** هل يُسمح لهذا اللاعب بإنشاء/استضافة غرفة عن بُعد؟ (قائمة سماحٍ من الأدمن الآن؛ اشتراكٌ لاحقاً). */
export function canHostRemote(player: RemoteAccessFields | null | undefined): boolean {
  return !!(player && player.canHostRemote);
}

/** هل يُسمح لهذا اللاعب بالانضمام لغرفة عن بُعد؟ (مجّانيّ الآن؛ اشتراكٌ رمزيّ لاحقاً). */
export function canJoinRemote(player: RemoteAccessFields | null | undefined): boolean {
  if (joinIsFreeNow()) return true;
  if (!player || !player.remoteAccessUntil) return false;
  const until = player.remoteAccessUntil instanceof Date
    ? player.remoteAccessUntil
    : new Date(player.remoteAccessUntil);
  return until.getTime() > Date.now();
}

/** يجلب حقول صلاحيّات البُعد للاعب من قاعدة البيانات (null إن غير متاح/غير موجود). */
export async function getPlayerRemoteAccess(playerId: number): Promise<RemoteAccessFields | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const [row] = await db
      .select({ canHostRemote: players.canHostRemote, remoteAccessUntil: players.remoteAccessUntil })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}
