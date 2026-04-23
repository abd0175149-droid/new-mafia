'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSocket } from './useSocket';
import type { Player, Candidate, MorningEvent } from '@/lib/constants';
import { Phase } from '@/lib/constants';

export interface GameConfig {
  gameName: string;
  maxPlayers: number;
  maxJustifications: number;
  currentJustification: number;
  displayPin: string;
}

export interface GameState {
  roomId: string;
  roomCode: string;
  phase: Phase;
  round: number;
  config: GameConfig;
  players: Player[];
  votingState: {
    totalVotesCast: number;
    candidates: Candidate[];
    hiddenPlayersFromVoting: number[];
    tieBreakerLevel: number;
  };
  morningEvents: MorningEvent[];
  winner: 'MAFIA' | 'CITIZEN' | null;
}

/**
 * Hook لإدارة حالة اللعبة المحلية
 */
export function useGameState() {
  const { emit, on, isConnected } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── الاستماع لتحديثات الحالة ──────────────
  useEffect(() => {
    const cleanups = [
      on('room:player-joined', (data: { physicalId: number; name: string; totalPlayers: number }) => {
        setGameState(prev => {
          if (!prev) return prev;
          const exists = prev.players.some(p => p.physicalId === data.physicalId);
          if (exists) return prev;
          return {
            ...prev,
            players: [...prev.players, {
              physicalId: data.physicalId,
              name: data.name,
              phone: null,
              playerId: null,
              role: null,
              isAlive: true,
              isSilenced: false,
            }].sort((a, b) => a.physicalId - b.physicalId),
          };
        });
      }),

      on('day:vote-update', (data: { candidates: Candidate[]; totalVotesCast: number }) => {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            votingState: {
              ...prev.votingState,
              candidates: data.candidates,
              totalVotesCast: data.totalVotesCast,
            },
          };
        });
      }),

      on('game:phase-changed', (data: { phase: Phase }) => {
        setGameState(prev => prev ? { ...prev, phase: data.phase } : prev);
      }),

      on('day:elimination', (data: { eliminated: number[] }) => {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map(p =>
              data.eliminated.includes(p.physicalId) ? { ...p, isAlive: false } : p
            ),
          };
        });
      }),

      on('game:over', (data: { winner: 'MAFIA' | 'CITIZEN'; players: Player[] }) => {
        setGameState(prev => prev ? {
          ...prev,
          phase: Phase.GAME_OVER,
          winner: data.winner,
          players: data.players,
        } : prev);
      }),

      on('day:justification-started', (data: { resultType: string; accused: any[]; topVotes: number; candidates: Candidate[] }) => {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            phase: 'DAY_JUSTIFICATION' as Phase,
            justificationData: {
              resultType: data.resultType,
              accused: data.accused,
              topVotes: data.topVotes,
            },
            votingState: {
              ...prev.votingState,
              candidates: data.candidates,
            },
          } as any;
        });
      }),

      on('day:elimination-pending', (data: { eliminated: number[]; type: string }) => {
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            phase: 'DAY_RESOLUTION_PENDING' as Phase,
            pendingResolution: data,
          } as any;
        });
      }),
    ];

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [on]);

  // ── إنشاء غرفة ──────────────────────────────
  const createRoom = useCallback(async (
    gameName: string,
    maxPlayers: number = 10,
    maxJustifications: number = 2,
    displayPin?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const response = await emit('room:create', {
        gameName,
        maxPlayers,
        maxJustifications,
        displayPin,
      });
      setGameState({
        roomId: response.roomId,
        roomCode: response.roomCode,
        phase: Phase.LOBBY,
        round: 0,
        config: {
          gameName: response.gameName || gameName,
          maxPlayers,
          maxJustifications,
          currentJustification: 0,
          displayPin: response.displayPin || '',
        },
        players: [],
        votingState: { totalVotesCast: 0, candidates: [], hiddenPlayersFromVoting: [], tieBreakerLevel: 0 },
        morningEvents: [],
        winner: null,
      });
      return response;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [emit]);

  // ── الانضمام لغرفة ──────────────────────────
  const joinRoom = useCallback(async (
    roomId: string,
    physicalId: number,
    name: string,
    phone?: string,
    playerId?: number,
    gender?: string,
    dob?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await emit('room:join', { roomId, physicalId, name, phone, playerId, gender, dob });
      return res; // يحتوي على linkedSeat إذا تم الربط بمقعد ليدر
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [emit]);

  // ── طلب حالة اللعبة ──────────────────────────
  const fetchState = useCallback(async (roomId: string) => {
    try {
      const response = await emit('game:get-state', { roomId });
      setGameState(response.state);
    } catch (err: any) {
      setError(err.message);
    }
  }, [emit]);

  return {
    gameState,
    setGameState,
    loading,
    error,
    isConnected,
    createRoom,
    joinRoom,
    fetchState,
    emit,
    on,
  };
}
