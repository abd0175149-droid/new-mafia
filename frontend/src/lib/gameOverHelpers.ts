/**
 * 🏆 GameOverHelpers — منطق تحديد الفرق الفائزة والمحايدين
 * يُستخدم من display/page.tsx و leader/page.tsx و PlayerFlow.tsx
 */

import { Role, isMafiaRole } from '@/lib/constants';

export interface GameOverPlayer {
  physicalId: number;
  name: string;
  role: string | null;
  isAlive: boolean;
  avatarUrl?: string | null;
  gender?: string;
}

export interface NeutralResult {
  roleId: string;
  roleName: string;
  won: boolean;
  reason: string;
  playerPhysicalId: number;
  playerName: string;
}

/**
 * تصنيف اللاعبين للفريق الفائز
 * - يدعم الأدوار القديمة (MAFIA/CITIZEN من constants.ts)
 * - يدعم المحايدين (NEUTRAL)
 */
export function getWinningTeamPlayers(
  players: GameOverPlayer[],
  winner: string,
  dynamicRoles?: { id: string; team: string }[]
): GameOverPlayer[] {
  return players.filter(p => {
    if (!p.role) return false;

    // إذا عندنا dynamic roles → نستخدمها
    if (dynamicRoles && dynamicRoles.length > 0) {
      const roleDef = dynamicRoles.find(r => r.id === p.role);
      if (roleDef) {
        return winner === 'MAFIA' ? roleDef.team === 'MAFIA' : roleDef.team === 'CITIZEN';
      }
    }

    // Fallback للأدوار القديمة
    const playerIsMafia = isMafiaRole(p.role as Role);
    return winner === 'MAFIA' ? playerIsMafia : !playerIsMafia;
  });
}

/**
 * ترتيب الفريق الفائز: الأحياء أولاً
 */
export function sortWinningTeam(players: GameOverPlayer[]): GameOverPlayer[] {
  return [...players].sort((a, b) => (b.isAlive ? 1 : 0) - (a.isAlive ? 1 : 0));
}

/**
 * تحديد اسم الفائز للعرض
 */
export function getWinnerDisplayName(winner: string): { title: string; subtitle: string; isMafia: boolean } {
  if (winner === 'MAFIA') {
    return { title: 'انتصار المافيا', subtitle: 'THE FAMILY PREVAILS', isMafia: true };
  }
  if (winner === 'CITIZEN') {
    return { title: 'تطهير المدينة', subtitle: 'JUSTICE HAS BEEN SERVED', isMafia: false };
  }
  // محايد
  return { title: `فوز: ${winner}`, subtitle: 'NEUTRAL VICTORY', isMafia: false };
}
