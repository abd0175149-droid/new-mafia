// ══════════════════════════════════════════════════════
// 👥 إشعارات التوأمين — Twin Notifications (طبقة السوكِت)
// تُكمّل twin-engine (المنطق) بطبقة الإظهار/الإشعار التي تحتاج io.
// تُستدعى بعد أي معالجة موت قد تُحفّز التحوّل — وهي idempotent عبر transformNotified.
// ══════════════════════════════════════════════════════

import type { Server } from 'socket.io';
import { Role } from '../game/roles.js';
import { Phase, ROLE_NAMES_AR } from '../game/state.js';
import { emitTrustedOnly } from './broadcast.util.js';
import { unrevealedDeadSeats, roleHiddenSeats, phoneMafiaTeam } from '../game/public-counts.js';

// إرسال حدث لكل اتصالات لاعب محدّد عبر physicalId
function emitToPlayer(io: Server, roomId: string, physicalId: number, event: string, payload: any) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock?.data.physicalId === physicalId && sock?.data.role === 'player') {
      sock.emit(event, payload);
    }
  }
}

// ── إشعار + إظهار تحوّل الأخ الأصغر (idempotent) ──
// - الأصغر المتحوّل: كشف كامل لدوره الجديد (player:role-assigned).
// - بقية المافيا الأحياء: تحديث قائمة الفريق فقط (mafia:team-updated) دون لمس بطاقاتهم/تنبيهاتهم.
// - الإظهار على الشاشة: فوري في النهار؛ في الليل يُكشف من morningEvents بزر الليدر (تفادي الازدواج).
export function notifyTwinTransform(io: Server, roomId: string, state: any) {
  const t = state.twinState;
  if (!t || !t.transformed || t.transformNotified) return;

  const younger = state.players.find((p: any) => p.physicalId === t.youngerBrotherPhysicalId);
  if (!younger || younger.isAlive === false) return;

  // 🔒 موتُ الأكبر لم يُعلن بعد (لم يُقلب كرتُه على الشاشة، أو الهواتف محبوسةٌ عنه):
  //    دورٌ جديدٌ للأصغر الآن يُعلن أنّ أخاه مات — قبل القاعة. يُؤجَّل، ويُستدعى ثانيةً
  //    عند الإطلاق (phone-hold) وعند كشف حدث الصباح ونهاية الملخّص (قرار المالك 2026-10-09).
  const older = Number(t.olderBrotherPhysicalId);
  if (unrevealedDeadSeats(state, { forPhones: true }).has(older) || roleHiddenSeats(state, { forPhones: true }).has(older)) return;

  t.transformNotified = true;

  const reveal = state.config?.allowMafiaReveal !== false;
  const newRole = t.transformedToRole || Role.MAFIA_REGULAR;
  const newRoleName = ROLE_NAMES_AR[newRole as keyof typeof ROLE_NAMES_AR] || newRole;

  // 📱 بلا موتٍ لم يُعلن بعد (ضحايا ليلٍ لم يُعرضوا) — نفسُ ما تراه الهواتف في كلّ مسار
  const mafiaPlayers = phoneMafiaTeam(state, null);

  // 1) الأصغر: كشف دوره الجديد + فريقه (إن سُمح الكشف)
  emitToPlayer(io, roomId, younger.physicalId, 'player:role-assigned', {
    physicalId: younger.physicalId,
    role: newRole,
    mafiaTeam: reveal ? mafiaPlayers.filter((m: any) => m.physicalId !== younger.physicalId) : undefined,
  });

  // 2) بقية المافيا: تحديث قائمة الفريق بالعضو الجديد (حدث خفيف لا يقلب البطاقة)
  if (reveal) {
    for (const m of mafiaPlayers) {
      if (m.physicalId === younger.physicalId) continue;
      emitToPlayer(io, roomId, m.physicalId, 'mafia:team-updated', {
        mafiaTeam: mafiaPlayers.filter((x: any) => x.physicalId !== m.physicalId),
      });
    }
  }

  // 3) الإظهار على شاشة العرض (النهار فقط — الليل يُكشف من الملخص)
  if (state.phase !== Phase.MORNING_RECAP) {
    // 🔒 دورٌ جديد في الحمولة — للموجّه وشاشة القاعة فقط (2026-09-13)
    void emitTrustedOnly(io, roomId, 'display:morning-event', {
      type: 'TWIN_TRANSFORM',
      targetPhysicalId: younger.physicalId,
      targetName: younger.name,
      extra: { newRole, newRoleName },
    });
  }

  console.log(`👥 Twin transform notified: Younger #${younger.physicalId} → ${newRole} (mafia team updated)`);
}
