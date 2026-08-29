// ══════════════════════════════════════════════════════
// 🌙 سوكِت نبض الليلة — activity:{id}
//
// غرفةٌ لكلّ فعاليّة، يشترك فيها الحاجزون وحدهم فيصلهم تقدّم الليلة لحظيّاً
// وهم خارج غرف اللعب.
//
// 🔴 الحارس يُعاد فحصه عند كلّ انضمام — لا مرّةً واحدة عند إصدار التوكن.
//    الحجز قد يُلغى بعد إصدار التوكن، وإعادة الاتّصال تمرّ من هنا أيضاً.
//
// 🔴 الحمولة لا تُبنى مرّةً واحدةً للغرفة: النبض شخصيٌّ (me · الغرفة المختارة)،
//    فالبثّ إشارةُ «تغيّر شيء» والعميل يسحب لقطتَه. هذا يمنع تسريب مقعد
//    لاعبٍ إلى آخر، ويُبقي الكبح رخيصاً.
//
// 🔴 الكبح: غرفةٌ بثمانية عشر لاعباً تولّد عشرات الأحداث في الدقيقة أثناء
//    التصويت. تُجمَّع بنافذة ثانيتين لكلّ فعاليّة — إلّا بدءَ مباراةٍ وانتهاءَها،
//    فلحظتان يُنتظران وتُرسلان فوراً.
// ══════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import { hasBooking, activityIdForRoom } from '../services/activity-pulse.query.js';

const COALESCE_MS = 2000;
const pending = new Map<number, NodeJS.Timeout>();

/** إشارةُ «تغيّر شيء في هذه الفعاليّة» — العميل يسحب لقطته الشخصيّة */
export function notifyActivityPulse(io: Server, activityId: number | null | undefined, immediate = false) {
  if (activityId == null) return;
  const id = Number(activityId);
  if (!Number.isFinite(id) || id <= 0) return;

  const fire = () => {
    pending.delete(id);
    io.to(`activity:${id}`).emit('activity:pulse', { activityId: id, at: Date.now() });
  };

  if (immediate) {
    const t = pending.get(id);
    if (t) { clearTimeout(t); pending.delete(id); }
    return fire();
  }
  // أوّلُ حدثٍ يفتح المؤقّت، وما يليه يُطوى فيه — لا يُمدَّد ولا يُكرَّر.
  if (pending.has(id)) return;
  pending.set(id, setTimeout(fire, COALESCE_MS));
}

/** نفس الإشارة، مُشتقّةً من غرفة لعبٍ حيّة */
export async function notifyPulseForRoom(io: Server, roomId: string, state?: any, immediate = false) {
  try {
    const activityId = await activityIdForRoom(roomId, state);
    notifyActivityPulse(io, activityId, immediate);
  } catch { /* النبض رفاهيّة: لا يُسقط مسار اللعب أبداً */ }
}

export function registerActivityPulseEvents(_io: Server, socket: Socket) {
  socket.on('activity:subscribe', async (data: { activityId?: number } | undefined, cb?: (r: any) => void) => {
    const respond = (r: any) => { if (typeof cb === 'function') cb(r); };
    try {
      const acc = socket.data?.authPlayer;
      if (!acc) return respond({ success: false, error: 'غير مصادق' });

      const id = Number(data?.activityId);
      if (!Number.isFinite(id) || id <= 0) return respond({ success: false, error: 'فعاليّة غير صالحة' });

      // 🔒 يُعاد الفحص في كلّ انضمام — الحجز قد يُلغى بعد إصدار التوكن
      const ok = await hasBooking(id, acc.playerId ?? null, acc.phone ?? null);
      if (!ok) return respond({ success: false, error: 'لا حجز لك على هذه الفعاليّة' });

      // مغادرة أيّ فعاليّةٍ سابقة — تبديل اللاعب بين حجزيه
      for (const room of socket.rooms) {
        if (typeof room === 'string' && room.startsWith('activity:')) socket.leave(room);
      }
      socket.join(`activity:${id}`);
      respond({ success: true, activityId: id });
    } catch (err: any) {
      respond({ success: false, error: err.message });
    }
  });

  socket.on('activity:unsubscribe', () => {
    for (const room of socket.rooms) {
      if (typeof room === 'string' && room.startsWith('activity:')) socket.leave(room);
    }
  });
}
