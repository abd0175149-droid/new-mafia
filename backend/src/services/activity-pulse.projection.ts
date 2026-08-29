// ══════════════════════════════════════════════════════
// 🌙 إسقاط نبض الليلة — Activity pulse projection
//
// ⚠️ لماذا إسقاطٌ جديد ولا نُعيد استخدام projectDisplayState:
//    ذاك إسقاطُ **شاشة القاعة** التي تقف خلف الموجّه، ويحمل `role` لكلّ لاعب.
//    تمريرُه إلى هاتف لاعبٍ يكشف توزيع الأدوار كاملاً.
//
// 🔴 الضمانة بنيويّة لا شرطيّة: هذا الملفّ **لا يبني مصفوفة لاعبين إطلاقاً**.
//    أعدادٌ فقط. ما لا يُبنى لا يُسرَّب.
//
// 🔴 ثوابتُ مورَّثة من TeamBar.tsx تُحفظ كما هي:
//    • خانةُ المستقلّين تختفي عند الصفر — إظهار «مستقلّون ٠» يكشف أنّ الليلة
//      بلا مهرّج، والاختفاءُ يجعل «مات المهرّج» و«لا مهرّج أصلاً» غيرَ متمايزين.
//    • لا أعداد قبل rolesConfirmed — getTeamCounts يعود null حتّى يعتمد الموجّه.
//
// 🔴 الغرف عن بُعد: منطق «الشاشة تعرضها للحاضرين» يسقط في غرفةٍ is_remote —
//    لا قاعةَ لها ولا شاشة. يُحجب الميزان ويبقى التقدّم الزمنيّ.
// ══════════════════════════════════════════════════════

import { getTeamCounts } from '../game/roles.js';

export interface PulseTimer { totalSeconds: number; startedAt: number; expired: boolean }
export interface PulseCounts { mafiaAlive: number; citizenAlive: number; neutralAlive: number }
export interface PulseMe { inRoom: true; seat: number; isAlive: boolean }

export interface PulseLive {
  round: number;
  phase: string;
  rolesConfirmed: boolean;
  isRemote: boolean;
  timer: PulseTimer | null;
  teamCounts: PulseCounts | null;
  teamTotals: PulseCounts | null;
}

/**
 * كلّ ما يخرج من حالة اللعبة الحيّة إلى هاتف اللاعب يمرّ من هنا.
 * `requesterPhysicalId` يُمرَّر فقط ليُشتقّ منه `me` — ولا يُستعمل لكشف غيره.
 */
export function projectActivityPulse(
  state: any,
  requesterPhysicalId: number | null,
): { live: PulseLive; me: PulseMe | null } | null {
  if (!state) return null;

  const players = Array.isArray(state.players) ? state.players : [];
  const isRemote = state?.config?.isRemote === true;
  const rolesConfirmed = state.rolesConfirmed === true;

  // 🔒 الميزان: بعد اعتماد الأدوار، وفي غرف القاعة وحدها.
  let teamCounts: PulseCounts | null = null;
  let teamTotals: PulseCounts | null = null;
  if (rolesConfirmed && !isRemote) {
    const c = getTeamCounts(players as any);
    teamCounts = { mafiaAlive: c.mafiaAlive, citizenAlive: c.citizenAlive, neutralAlive: c.neutralAlive };
    teamTotals = { mafiaAlive: c.mafiaTotal, citizenAlive: c.citizenTotal, neutralAlive: c.neutralTotal };
  }

  const gt = state.gameTimer;
  const timer: PulseTimer | null = gt && typeof gt.totalSeconds === 'number'
    ? { totalSeconds: gt.totalSeconds, startedAt: gt.startedAt, expired: !!gt.expired }
    : null;

  let me: PulseMe | null = null;
  if (requesterPhysicalId != null) {
    const p = players.find((x: any) => x?.physicalId === requesterPhysicalId);
    // ⚠️ isAlive فقط — لا اسم ولا دور ولا عقوبات. اللاعب يعرف نفسه من شاشة اللعب.
    if (p) me = { inRoom: true, seat: p.physicalId, isAlive: p.isAlive !== false };
  }

  return {
    live: {
      round: Number(state.round) || 0,
      phase: String(state.phase || 'LOBBY'),
      rolesConfirmed,
      isRemote,
      timer,
      teamCounts,
      teamTotals,
    },
    me,
  };
}

/** هل لهذا اللاعب مقعدٌ في هذه الغرفة؟ يُشتقّ بلا كشفِ أيّ لاعبٍ آخر. */
export function findMySeat(
  state: any,
  playerId: number | null,
  phone: string | null,
): number | null {
  const players = Array.isArray(state?.players) ? state.players : [];
  const hit = players.find((p: any) =>
    (playerId != null && p?.playerId === playerId) ||
    (phone && p?.phone && String(p.phone) === String(phone)),
  );
  return hit ? hit.physicalId : null;
}
