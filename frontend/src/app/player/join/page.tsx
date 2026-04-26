'use client';

import { useEffect, useState } from 'react';
import { usePlayer } from '@/context/PlayerContext';
import PlayerFlow from '@/components/PlayerFlow';

export default function JoinPage() {
  const { player } = usePlayer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // حفظ بيانات اللاعب في localStorage للـ PlayerFlow
    if (player) {
      localStorage.setItem('mafia_player_info', JSON.stringify({
        playerId: player.playerId,
        displayName: player.name,
        phone: player.phone,
      }));
      // ✅ مزامنة التوكن مع PlayerFlow — حتى ما يطلب من اللاعب إعادة تسجيل الدخول
      localStorage.setItem('mafia_player_token', player.token);
      localStorage.setItem('mafia_playerId', String(player.playerId));
    }
    setMounted(true);
  }, [player]);

  if (!mounted) return null;

  return <PlayerFlow />;
}
