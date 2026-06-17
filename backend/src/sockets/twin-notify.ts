// ══════════════════════════════════════════════════════
// 👥 إشعارات التوأمين — Twin Notifications (طبقة السوكِت)
// تُكمّل twin-engine (المنطق) بطبقة الإظهار/الإشعار التي تحتاج io.
// تُستدعى بعد أي معالجة موت قد تُحفّز التحوّل — وهي idempotent عبر transformNotified.
// ══════════════════════════════════════════════════════

import type { Server } from 'socket.io';
import { Role, isMafiaRole } from '../game/roles.js';
import { Phase, ROLE_NAMES_AR } from '../game/state.js';

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

  t.transformNotified = true;

  const reveal = state.config?.allowMafiaReveal !== false;
  const newRole = t.transformedToRole || Role.MAFIA_REGULAR;
  const newRoleName = ROLE_NAMES_AR[newRole as keyof typeof ROLE_NAMES_AR] || newRole;

  const mafiaPlayers = state.players
    .filter((p: any) => p.role && isMafiaRole(p.role as Role) && p.isAlive !== false)
    .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: p.role, avatarUrl: p.avatarUrl || null }));

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
    io.to(roomId).emit('display:morning-event', {
      type: 'TWIN_TRANSFORM',
      targetPhysicalId: younger.physicalId,
      targetName: younger.name,
      extra: { newRole, newRoleName },
    });
  }

  console.log(`👥 Twin transform notified: Younger #${younger.physicalId} → ${newRole} (mafia team updated)`);
}
