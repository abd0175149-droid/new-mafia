// ══════════════════════════════════════════════════════
// 🏆 مَن فاز بعينه — الفوزُ المحايد بالمقعد لا بالدور
//
// `matches.winner` يحمل الفريق الفائز: MAFIA · CITIZEN · JESTER · ASSASSIN. للفريقين
// يكفي الدور (كلُّ مافيا يفوز بفوز المافيا). أمّا المحايد فكان يُحسب بالدور أيضاً —
// «فاز المهرّج» ⇒ كلُّ مهرّجٍ فائز. وحين تكرّر الكرت (قرار المالك 2026-11-06) صار
// هذا خطأً: المهرّجُ الذي لم تطرده المدينة خاسر، والسفّاحُ المتنافسُ الذي لم يُكمل
// عقودَه خاسر.
//
// 🔴 الحكمُ مرّةً واحدة عند ختم المباراة ويُخزَّن في `match_players.won`. القرّاءُ
//    يقرؤون المخزَّن، وما قبله (null) يُشتقّ بالقاعدة القديمة — وهي صحيحةٌ لكلّ
//    مباراةٍ سابقة لأنّ المحايد لم يتكرّر فيها.
// ══════════════════════════════════════════════════════

import type { GameState } from './state.js';
import type { RoleDef } from './definition-service.js';
import { isMafiaRole, type Role } from './roles.js';
import { evaluateNeutralWins } from './dynamic-win-checker.js';
import { assassinWinnerSeats } from './assassin-engine.js';

/**
 * مقاعدُ الفائزين من المحايدين حين يكون الفائز محايداً — أو null إن فاز فريق.
 * إن لم يُعثر على صاحب الفوز (لعبةٌ قديمة بلا سجلّ) سقط على كلّ حاملي الدور، كما كان.
 */
export function neutralWinnerSeats(state: GameState, roleDefs: RoleDef[]): Set<number> | null {
  const winner = state.winner;
  if (winner !== 'JESTER' && winner !== 'ASSASSIN') return null;

  const holders = state.players.filter(p => p.role === winner).map(p => p.physicalId);
  let seats: number[];
  if (winner === 'ASSASSIN') {
    seats = assassinWinnerSeats(state);
  } else {
    seats = evaluateNeutralWins(state, roleDefs)
      .filter(r => r.roleId === 'JESTER' && r.won)
      .map(r => r.physicalId);
  }
  return new Set(seats.length ? seats : holders);
}

/** فوزُ لاعبٍ في مباراةٍ منتهية — بالمقعد للمحايد، وبالفريق لغيره. */
export function didPlayerWin(
  state: GameState,
  p: { physicalId: number; role: string | null | undefined },
  neutralSeats: Set<number> | null,
): boolean {
  const w = state.winner;
  if (p.role === 'JESTER' || p.role === 'ASSASSIN') {
    return w === p.role && (neutralSeats ? neutralSeats.has(p.physicalId) : true);
  }
  if (w === 'JESTER' || w === 'ASSASSIN' || !w) return false;
  const mafia = isMafiaRole(p.role as Role);
  return (w === 'MAFIA' && mafia) || (w === 'CITIZEN' && !mafia);
}

/**
 * القاعدةُ للقرّاء: المخزَّن إن وُجد، وإلّا الاشتقاقُ القديم من الفريق الفائز والدور.
 * `team` اختياريّ — يمرّره مَن يعرف فريق الدور من role_definitions.
 */
export function wonFromRow(row: { role: string; winner: string | null; won?: boolean | null; team?: string | null }): boolean {
  if (row.won === true || row.won === false) return row.won;
  const w = row.winner;
  if (!w) return false;
  if (row.role === 'JESTER' || row.role === 'ASSASSIN') return w === row.role;
  if (w === 'JESTER' || w === 'ASSASSIN') return false;
  const team = row.team ?? (isMafiaRole(row.role as Role) ? 'MAFIA' : 'CITIZEN');
  return (w === 'MAFIA' && team === 'MAFIA') || (w === 'CITIZEN' && team === 'CITIZEN');
}
