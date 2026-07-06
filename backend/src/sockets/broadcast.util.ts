// ══════════════════════════════════════════════════════
// 🔒 بثّ الحالة مع إخفاء الأسرار عن اللاعبين في الغرف البعيدة
// ══════════════════════════════════════════════════════
// في الوضع المحلي (شاشة عرض فعليّة يشرف عليها الليدر) لا يتغيّر أي شيء:
// السلوك مطابقٌ تماماً لـ io.to(roomId).emit — بايت ببايت.
// في الغرف البعيدة (isRemote) يستقبل الليدر/شاشة العرض الحالة الكاملة،
// بينما يستقبل اللاعبون نسخةً منزوعة الأسرار (الأدوار = null، بلا أحداث ليل/اختيارات).
// السبب: مقبس اللاعب في الغرفة نفسها، ويمكن قراءة الحمولة الخام عبر devtools.

import type { Server } from 'socket.io';

// إزالة كل ما يكشف الأدوار أو نيّات الليل من نسخة اللاعب
function stripSecrets(state: any): any {
  if (!state || !Array.isArray(state.players)) return state;
  return {
    ...state,
    players: state.players.map((p: any) => ({ ...p, role: null })),
    nightActions: undefined,
    autoNightChoices: undefined,
  };
}

function isTrusted(sock: any): boolean {
  const role = sock?.data?.role;
  return role === 'leader' || role === 'display';
}

// بثّ حدثٍ حمولتُه هي كائن الحالة كاملاً (game:state-sync / game:state-updated …)
export async function emitStateSanitized(
  io: Server,
  roomId: string,
  event: string,
  state: any,
): Promise<void> {
  if (!state?.config?.isRemote) {
    io.to(roomId).emit(event, state); // محلي: بلا تغيير
    return;
  }
  const stripped = stripSecrets(state);
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.emit(event, isTrusted(s) ? state : stripped);
  }
}

// بثّ game:phase-changed حيث قد تحتوي الحمولة على حقل state يجب تعقيمه.
// الحمولات التي لا تحمل state (مثل { phase, teamCounts }) تمرّ كما هي دون تغيير.
export async function emitPhaseChangedSanitized(
  io: Server,
  roomId: string,
  payload: any,
): Promise<void> {
  const state = payload?.state;
  if (!state?.config?.isRemote) {
    io.to(roomId).emit('game:phase-changed', payload); // بلا state أو محلي: بلا تغيير
    return;
  }
  const strippedPayload = { ...payload, state: stripSecrets(state) };
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.emit('game:phase-changed', isTrusted(s) ? payload : strippedPayload);
  }
}

// أحداث لوحة الليدر في الليل الآلي (auto-step-ready/approval/started/progress) تكشف
// هويّة الفاعل ودوره واختياره الحقيقي. في الغرف البعيدة تُرسَل للليدر/العرض فقط،
// ويُحجَب استقبالها الخام عن اللاعبين. محليّاً: بثٌّ كامل للغرفة كما كان (بلا تغيير).
export async function emitLeaderOnly(
  io: Server,
  roomId: string,
  event: string,
  payload: any,
  isRemote: boolean | undefined,
): Promise<void> {
  if (!isRemote) {
    io.to(roomId).emit(event, payload);
    return;
  }
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    if (isTrusted(s)) s.emit(event, payload);
  }
}

// ملخّص الصباح يحمل مصفوفة اللاعبين كاملةً بأدوارهم. للليدر تُرسَل كاملةً، وللاعبين
// تُنزَع الأدوار وحالة القاتل (تبقى الأحداث العامّة: من مات، الفائز المعلّق).
// محليّاً: بلا تغيير.
export async function emitMorningRecapSanitized(
  io: Server,
  roomId: string,
  payload: any,
  isRemote: boolean | undefined,
): Promise<void> {
  if (!isRemote) {
    io.to(roomId).emit('night:morning-recap', payload);
    return;
  }
  const playerPayload = {
    ...payload,
    players: Array.isArray(payload?.players)
      ? payload.players.map((p: any) => ({ ...p, role: null }))
      : payload?.players,
    assassinState: null,
  };
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.emit('night:morning-recap', isTrusted(s) ? payload : playerPayload);
  }
}
