// ══════════════════════════════════════════════════════
// 🔒 بثّ الحالة مع إخفاء الأسرار عن اللاعبين في الغرف البعيدة
// ══════════════════════════════════════════════════════
// في الوضع المحلي (شاشة عرض فعليّة يشرف عليها الليدر) لا يتغيّر أي شيء:
// السلوك مطابقٌ تماماً لـ io.to(roomId).emit — بايت ببايت.
// في الغرف البعيدة (isRemote) يستقبل الليدر/شاشة العرض الحالة الكاملة،
// بينما يستقبل اللاعبون نسخةً منزوعة الأسرار (الأدوار = null، بلا أحداث ليل/اختيارات).
// السبب: مقبس اللاعب في الغرفة نفسها، ويمكن قراءة الحمولة الخام عبر devtools.

import type { Server } from 'socket.io';
import { notifyPulseForRoom } from './activity-pulse.socket.js';

// إزالة كل ما يكشف الأدوار أو نيّات الليل من نسخة اللاعب
// ⚰️ دور الميت يُكشف: أُعلن للجميع لحظة الإقصاء/الصباح أصلاً — إبقاؤه في الروستر
// يجعل الكارد المقلوب على الحلقة يصمد لتحديث الصفحة والمنضمّين الجدد.
/**
 * 👁️ غرفة المتفرّجين المعقّمة.
 *
 * المتفرّج لا ينضمّ إلى `roomId` إطلاقاً: البثّ المحلّيّ هناك خامٌّ بالأدوار
 * (`io.to(roomId).emit(event, state)` بلا تعقيم)، فمن يفتح أدوات المتصفّح
 * يقرأ أدوار الجميع. بدلاً منها غرفةٌ فرعيّة لا يصلها إلّا ما مرّ بـstripSecrets.
 */
export function spectatorRoom(roomId: string): string {
  return `${roomId}:spectators`;
}

export function stripSecrets(state: any): any {
  if (!state || !Array.isArray(state.players)) return state;
  return {
    ...state,
    players: state.players.map((p: any) => ({ ...p, role: p.isAlive === false ? (p.role ?? null) : null })),
    nightActions: undefined,
    autoNightChoices: undefined,
    // 🎩 هويّة العمدة سرّ حتى يكشف نفسه؛ وبعد الكشف تُمرَّر الهويّة بلا النافذة السرّية
    mayorState: state.mayorState?.revealed
      ? { mayorPhysicalId: state.mayorState.mayorPhysicalId, revealed: true, vetoUsed: state.mayorState.vetoUsed, decision: state.mayorState.decision, revealedAtRound: state.mayorState.revealedAtRound }
      : undefined,
    // 🔥 مقعدُ العنقاء ورصيدُه سرٌّ مطلق: لا يُكشف حتى بعد بعثٍ ظاهرٍ للجميع —
    //    فالمدينةُ ترى مَن احترق ولا تعرف لماذا. والرصيدُ للموجّه وحده.
    phoenixState: undefined,
    // 🜂 وقائمةُ مؤهَّلي اللعنة تفضح مَن صوّت على مَن — سرٌّ حتى عن شاشة العرض.
    pendingAshCurse: undefined,
  };
}

/**
 * 🎬 أسرارُ ما قبل الكشف (2026-09-13): بين «بانتظار القرار» و«كشف الأدوار» تحمل الحالةُ
 *    أدوارَ المُقصَين (pendingResolution.revealedRoles) وأدوارَ جيران القنبلة — بل وجودُ
 *    pendingBomb نفسُه يفضح أنّ المُقصى شيخُ المافيا. تُحذف من كلّ ما يصل غيرَ الموثوقين.
 */
export function stripEliminationSecrets(state: any): any {
  if (!state) return state;
  const out: any = { ...state };
  if (out.pendingResolution) out.pendingResolution = { ...out.pendingResolution, revealedRoles: [], causes: undefined, deal: undefined };
  if (out.pendingBomb) out.pendingBomb = null;
  if (out.heldBombResult) out.heldBombResult = null;
  return out;
}

/**
 * 🎬 «بانتظار القرار» بلا أسرار: الغرفةُ تعرف مَن خرج (الأرقام) لا أدوارَهم ولا القنبلة؛
 *    الموجّه وشاشةُ القاعة يستلمان الحمولةَ كاملةً (الموجّه يحتاج pendingBomb لشاشة القرار).
 *    كان بثّاً عامّاً يحمل revealedRoles وأدوار الجيران قبل الكشف — يُقرأ من أدوات المطوّر على أيّ هاتف.
 */
export async function emitEliminationPending(io: Server, roomId: string, payload: any): Promise<void> {
  const publicPayload = { ...payload, revealedRoles: [], pendingBomb: null, causes: undefined, deal: undefined };
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) s.emit('day:elimination-pending', isTrusted(s) ? payload : publicPayload);
  io.to(spectatorRoom(roomId)).emit('day:elimination-pending', publicPayload);
}

function isTrusted(sock: any): boolean {
  const role = sock?.data?.role;
  return role === 'leader' || role === 'display';
}

/**
 * بثٌّ للموجّه وشاشة العرض **حصراً** — في كلّ الغرف، محلّيّةً كانت أو بعيدة.
 *
 * 🔴 يختلف عن emitLeaderOnly التي تُقيّد في الغرف البعيدة وحدها وتبثّ للجميع
 *    محلّيّاً. ما يُبَثّ للغرفة يصل **كلَّ جهاز لاعب** ولو لم تعرضه الواجهة —
 *    والترشيحُ في العميل ليس أماناً: مَن يفتح أدوات المتصفّح يقرأ الحمولة كاملةً.
 *    كلُّ ما يحمل دوراً أو هدفاً ليليّاً يمرّ من هنا.
 */
export async function emitTrustedOnly(
  io: Server,
  roomId: string,
  event: string,
  payload: any,
): Promise<void> {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) if (isTrusted(s)) s.emit(event, payload);
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
    io.to(spectatorRoom(roomId)).emit(event, stripSecrets(state)); // 👁️ نسخة معقّمة
    return;
  }
  const stripped = stripSecrets(state);
  io.to(spectatorRoom(roomId)).emit(event, stripped);
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
  // 🌙 مِشبكُ نبض الليلة — مكانٌ واحد بدل عشرين نداءً متفرّقاً.
  //    إشارةٌ مكبوحة لا حمولة؛ الحاجزون خارج الغرفة يسحبون لقطتهم.
  void notifyPulseForRoom(io, roomId, state);
  const spectatorPayload = state ? { ...payload, state: stripSecrets(state) } : payload;
  io.to(spectatorRoom(roomId)).emit('game:phase-changed', spectatorPayload); // 👁️ معقّمة دائماً
  if (!state?.config?.isRemote) {
    // 🎬 محلّيّاً كما كان — إلّا أسرارَ ما قبل الكشف فتُحذف عن غير الموثوقين (2026-09-13)
    if (state && (state.pendingResolution || state.pendingBomb || state.heldBombResult)) {
      const localStripped = { ...payload, state: stripEliminationSecrets(state) };
      const socks = await io.in(roomId).fetchSockets();
      for (const s of socks) s.emit('game:phase-changed', isTrusted(s) ? payload : localStripped);
      return;
    }
    io.to(roomId).emit('game:phase-changed', payload); // بلا state أو محلي: بلا تغيير
    return;
  }
  const strippedPayload = { ...payload, state: stripEliminationSecrets(stripSecrets(state)) };
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
      ? payload.players.map((p: any) => ({ ...p, role: p.isAlive === false ? (p.role ?? null) : null }))
      : payload?.players,
    assassinState: null,
  };
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    s.emit('night:morning-recap', isTrusted(s) ? payload : playerPayload);
  }
}
