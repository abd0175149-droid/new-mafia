// ══════════════════════════════════════════════════════
// 🪑 خوارزمية التوزيع التلقائي للمقاعد (Seat Allocator)
// المقاعد مرتبة على شكل مربع دائري: N مجاور لـ 1
// يدعم: النظام القديم + المحرك الذكي الجديد
// ══════════════════════════════════════════════════════

import { allocateSeatWithConstraints } from './seating/engine.js';
import type { PlayerSeatData, SeatingConfig, EvaluationContext, PinnedSeat } from './seating/types.js';

// ── الواجهات القديمة (Backward-compatible) ──────────
export interface SeatConstraints {
  genderSeparation: boolean;       // فصل الجنسين (ذكر لا يجلس بجانب أنثى)
  noAdjacentPairs: Array<{         // أزواج لا يجلسون بجانب بعض
    player1Phone: string;
    player1Name: string;
    player2Phone: string;
    player2Name: string;
  }>;
  // ── إعدادات المحرك الذكي (اختياري) ──
  engineEnabled?: boolean;
  strictness?: 'strict' | 'relaxed';
  constraints?: Array<{
    type: string;
    enabled: boolean;
    priority: number;
    params: Record<string, any>;
  }>;
}

export interface SeatPlayer {
  physicalId: number;
  phone: string | null;
  gender: string | null;
  seatHeld?: boolean;
  // ── بيانات إضافية للمحرك الذكي ──
  playerId?: number | null;
  name?: string;
  totalMatches?: number;
  activityCount?: number;
  rankRR?: number;
  rankTier?: string;
  hasPenalty?: boolean;
}

export interface AllocateParams {
  maxPlayers: number;
  players: SeatPlayer[];
  constraints: SeatConstraints | null;
  newPlayer: { phone: string; gender: string; playerId?: number | null; name?: string; totalMatches?: number; activityCount?: number; rankRR?: number; rankTier?: string };
  preferredSeat?: number;
  // ── سياق المحرك الذكي ──
  penaltyNeighborHistory?: Map<string, number>;
  sessionId?: number;
  // ── بيانات القالب ──
  pinnedSeats?: PinnedSeat[];
  reservedTailSeats?: number;
}

// ── دالة الجوار الدائري (مربع) ──
function getAdjacentSeats(seat: number, maxPlayers: number): number[] {
  if (maxPlayers <= 1) return [];
  const left = seat === 1 ? maxPlayers : seat - 1;
  const right = seat === maxPlayers ? 1 : seat + 1;
  return [left, right];
}

// ── خلط عشوائي (Fisher-Yates) ──
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * تخصيص مقعد للاعب بشكل تلقائي مع مراعاة القيود.
 * يدعم: الوضع القديم + المحرك الذكي الجديد
 */
export function allocateSeat(params: AllocateParams): { seat: number; constraintViolation: boolean } {
  const { maxPlayers, players, constraints, newPlayer, preferredSeat } = params;

  // ═══ المحرك الذكي الجديد ═══
  // يُفعَّل إذا: engineEnabled = true أو توفرت بيانات إضافية
  const useNewEngine = constraints?.engineEnabled || 
    (constraints?.constraints && constraints.constraints.length > 0) ||
    params.penaltyNeighborHistory;

  if (useNewEngine) {
    // تحويل بيانات اللاعبين للصيغة الجديدة
    const occupiedSeats = new Map<number, PlayerSeatData>();
    for (const p of players) {
      occupiedSeats.set(p.physicalId, {
        playerId: p.playerId ?? null,
        phone: p.phone || '',
        name: p.name || `لاعب #${p.physicalId}`,
        gender: p.gender || 'MALE',
        totalMatches: p.totalMatches ?? 0,
        activityCount: p.activityCount ?? 0,
        rankRR: p.rankRR ?? 0,
        rankTier: p.rankTier || 'INFORMANT',
        hasPenalty: p.hasPenalty,
        physicalId: p.physicalId,
        seatHeld: p.seatHeld,
      });
    }

    const newPlayerData: PlayerSeatData = {
      playerId: newPlayer.playerId ?? null,
      phone: newPlayer.phone || '',
      name: newPlayer.name || 'لاعب جديد',
      gender: newPlayer.gender || 'MALE',
      totalMatches: newPlayer.totalMatches ?? 0,
      activityCount: newPlayer.activityCount ?? 0,
      rankRR: newPlayer.rankRR ?? 0,
      rankTier: newPlayer.rankTier || 'INFORMANT',
    };

    const seatingConfig: SeatingConfig = {
      engineEnabled: constraints?.engineEnabled,
      strictness: constraints?.strictness || 'relaxed',
      constraints: constraints?.constraints,
      genderSeparation: constraints?.genderSeparation,
      noAdjacentPairs: constraints?.noAdjacentPairs,
    };

    const context: EvaluationContext = {
      maxPlayers,
      sessionId: params.sessionId,
      penaltyNeighborHistory: params.penaltyNeighborHistory || new Map(),
      constraintParams: {},
      pinnedSeats: params.pinnedSeats || [],
      reservedTailSeats: params.reservedTailSeats ?? 0,
    };

    const result = allocateSeatWithConstraints({
      maxPlayers,
      occupiedSeats,
      newPlayer: newPlayerData,
      seatingConfig,
      context,
      preferredSeat,
    });

    return { seat: result.seat, constraintViolation: result.constraintViolation };
  }

  // ═══ الوضع القديم (Legacy) ═══
  const occupiedSet = new Set(players.map(p => p.physicalId));
  const allEmpty: number[] = [];
  for (let i = 1; i <= maxPlayers; i++) {
    if (!occupiedSet.has(i)) allEmpty.push(i);
  }

  if (allEmpty.length === 0) {
    throw new Error(`الغرفة ممتلئة (${maxPlayers} لاعب كحد أقصى)`);
  }

  // 1. المقعد المفضل (rejoin)
  if (preferredSeat && allEmpty.includes(preferredSeat)) {
    if (!constraints || isSeatValid(preferredSeat, players, constraints, newPlayer, maxPlayers)) {
      return { seat: preferredSeat, constraintViolation: false };
    }
  }

  // 2. فلترة حسب القيود
  if (constraints) {
    const validSeats = allEmpty.filter(seat =>
      isSeatValid(seat, players, constraints, newPlayer, maxPlayers)
    );

    if (validSeats.length > 0) {
      const shuffled = shuffle(validSeats);
      return { seat: shuffled[0], constraintViolation: false };
    }

    console.warn(`⚠️ Seat constraints couldn't be fully satisfied — assigning random seat`);
  }

  const shuffled = shuffle(allEmpty);
  return { seat: shuffled[0], constraintViolation: !!constraints };
}

/**
 * فحص صلاحية مقعد معين حسب القيود (الوضع القديم)
 */
function isSeatValid(
  seat: number,
  players: SeatPlayer[],
  constraints: SeatConstraints,
  newPlayer: { phone: string; gender: string },
  maxPlayers: number,
): boolean {
  const adjacent = getAdjacentSeats(seat, maxPlayers);
  const neighbors = players.filter(p => adjacent.includes(p.physicalId));

  // ── قيد 1: فصل الجنسين ──
  if (constraints.genderSeparation) {
    const newGender = (newPlayer.gender || 'MALE').toUpperCase();
    for (const neighbor of neighbors) {
      const neighborGender = (neighbor.gender || 'MALE').toUpperCase();
      if (newGender !== neighborGender) {
        return false;
      }
    }
  }

  // ── قيد 2: أزواج ممنوعة ──
  if (constraints.noAdjacentPairs && constraints.noAdjacentPairs.length > 0) {
    const normalizedNewPhone = normalizePhone(newPlayer.phone);

    for (const pair of constraints.noAdjacentPairs) {
      const p1 = normalizePhone(pair.player1Phone);
      const p2 = normalizePhone(pair.player2Phone);

      if (normalizedNewPhone === p1) {
        if (neighbors.some(n => normalizePhone(n.phone || '') === p2)) {
          return false;
        }
      } else if (normalizedNewPhone === p2) {
        if (neighbors.some(n => normalizePhone(n.phone || '') === p1)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * توحيد صيغة رقم الهاتف للمقارنة
 */
function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.startsWith('0') ? phone : '0' + phone;
}
