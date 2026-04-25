'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

// ── سياق اللاعب ──
interface PlayerData {
  playerId: number;
  name: string;
  phone: string;
  token: string;
}

interface PlayerContextType {
  player: PlayerData | null;
  setPlayer: (p: PlayerData | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const PlayerContext = createContext<PlayerContextType>({
  player: null,
  setPlayer: () => {},
  logout: () => {},
  isLoading: true,
});

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<PlayerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // محاولة استرجاع الجلسة المحفوظة
    const saved = localStorage.getItem('mafia_player_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // التحقق من صلاحية الـ Token
        fetch('/api/player-auth/me', {
          headers: { 'Authorization': `Bearer ${parsed.token}` },
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setPlayerState({
                playerId: data.player.id,
                name: data.player.name,
                phone: data.player.phone,
                token: parsed.token,
              });
            } else {
              localStorage.removeItem('mafia_player_auth');
            }
          })
          .catch(() => localStorage.removeItem('mafia_player_auth'))
          .finally(() => setIsLoading(false));
      } catch {
        localStorage.removeItem('mafia_player_auth');
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const setPlayer = (p: PlayerData | null) => {
    setPlayerState(p);
    if (p) {
      localStorage.setItem('mafia_player_auth', JSON.stringify(p));
    } else {
      localStorage.removeItem('mafia_player_auth');
    }
  };

  const logout = () => {
    setPlayerState(null);
    localStorage.removeItem('mafia_player_auth');
  };

  return (
    <PlayerContext.Provider value={{ player, setPlayer, logout, isLoading }}>
      {children}
    </PlayerContext.Provider>
  );
}
