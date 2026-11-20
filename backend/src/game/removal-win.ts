// ══════════════════════════════════════════════════════
// 🏁 فحص الفوز بعد خروجٍ خارج المسار العاديّ
// ══════════════════════════════════════════════════════
// الطرد والإقصاء بالعقوبات وأداة الكروت تُخرج لاعباً حيّاً من اللعبة بلا تصويت
// ولا ليل، فلا يمرّ أحدٌ بفحص الفوز. فتبقى لعبةٌ محسومة (مافيا ≥ مواطنين) مفتوحة
// حتّى يلاحظ الموجّه. هذه الدالّة تُستدعى بعد كلّ خروجٍ كهذا، وتضع pendingWinner
// كما يفعل التصويت، فيعرض الموجّه النتيجة من مكانها المعتاد.

import { Phase, type GameState } from './state.js';
import { checkWinCondition, WinResult } from './win-checker.js';

/** المراحل التي تكون فيها اللعبة جارية فعلاً (الأدوار موزّعة واللعب بدأ) */
export function isGameRunning(state: GameState): boolean {
  const ph = state.phase as string;
  return ph !== Phase.LOBBY && ph !== Phase.ROLE_GENERATION && ph !== Phase.ROLE_BINDING && ph !== Phase.GAME_OVER;
}

/**
 * يفحص الفوز ويكتب `winner` و`pendingWinner` إن حُسمت. لا يحفظ الحالة — المستدعي يحفظ.
 * يعيد الفائز أو null. لا يكتب فوق فائزٍ قائم.
 */
export async function winAfterRemoval(state: GameState): Promise<string | null> {
  if (!isGameRunning(state)) return null;
  if ((state as any).winner || (state as any).pendingWinner) return null;
  if (!state.players.some(p => !!p.role)) return null;
  let w: string | null = null;
  if (state.config?.useDynamicEngine) {
    const { checkWinConditionDynamic } = await import('./dynamic-win-checker.js');
    const dyn = await checkWinConditionDynamic(state);
    w = dyn.mainWinner || null;
  } else {
    const wc = checkWinCondition(state);
    w = wc === WinResult.MAFIA_WIN ? 'MAFIA' : wc === WinResult.CITIZEN_WIN ? 'CITIZEN' : null;
  }
  if (w) {
    (state as any).winner = w;
    (state as any).pendingWinner = w;
  }
  return w;
}
