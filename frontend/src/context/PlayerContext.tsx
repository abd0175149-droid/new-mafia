'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { reconnectSocketAuth } from '@/lib/socket';

// مسح كل مفاتيح جلسة اللاعب (المُهيكلة + المسطّحة) معاً — مصدر واحد لإبقائها متزامنة
function clearPlayerStorage() {
  localStorage.removeItem('mafia_player_auth');
  localStorage.removeItem('mafia_player_token');
  localStorage.removeItem('mafia_playerId');
}

// ── سياق اللاعب ──
interface PlayerData {
  playerId: number;
  name: string;
  phone: string;
  token: string;
}

interface StaffInfo {
  staffId: number;
  username: string;
  role: string;
  displayName: string;
  permissions: string[];
}

interface PlayerContextType {
  player: PlayerData | null;
  staffInfo: StaffInfo | null;
  setPlayer: (p: PlayerData | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const PlayerContext = createContext<PlayerContextType>({
  player: null,
  staffInfo: null,
  setPlayer: () => {},
  logout: () => {},
  isLoading: true,
});

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayerState] = useState<PlayerData | null>(null);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
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

              // توافق: مزامنة المفاتيح المسطّحة التي تقرأها صفحات أخرى (السجل، الهوم، السوكِت)
              localStorage.setItem('mafia_player_token', parsed.token);
              localStorage.setItem('mafia_playerId', String(data.player.id));

              // ── تخزين بيانات الموظف المرتبط (Auto-login) ──
              if (data.staffInfo && data.staffToken) {
                setStaffInfo(data.staffInfo);
                // حفظ staff token في localStorage (نفس المفاتيح المستخدمة في الداشبورد)
                localStorage.setItem('token', data.staffToken);
                localStorage.setItem('user', JSON.stringify({
                  id: data.staffInfo.staffId,
                  username: data.staffInfo.username,
                  displayName: data.staffInfo.displayName,
                  role: data.staffInfo.role,
                }));
                // حفظ leader token أيضاً (لواجهة الليدر)
                localStorage.setItem('leader_token', data.staffToken);
                localStorage.setItem('leader_name', data.staffInfo.displayName);
                // إعادة اتصال السوكيت ليحمل توكن الموظف (تفعيل صلاحية الليدر على السوكيت بلا إعادة تحميل)
                try { reconnectSocketAuth(); } catch {}
              }
            } else {
              clearPlayerStorage();
            }
          })
          .catch(() => clearPlayerStorage())
          .finally(() => setIsLoading(false));
      } catch {
        clearPlayerStorage();
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
      // توافق: صفحات أخرى تقرأ المفاتيح المسطّحة (mafia_player_token / mafia_playerId)
      localStorage.setItem('mafia_player_token', p.token);
      localStorage.setItem('mafia_playerId', String(p.playerId));
    } else {
      clearPlayerStorage();
    }
  };

  const logout = () => {
    setPlayerState(null);
    setStaffInfo(null);
    clearPlayerStorage();
    // لا نمسح staff tokens هنا — المستخدم قد يريد البقاء مسجلاً في الداشبورد
  };

  return (
    <PlayerContext.Provider value={{ player, staffInfo, setPlayer, logout, isLoading }}>
      {children}
    </PlayerContext.Provider>
  );
}

