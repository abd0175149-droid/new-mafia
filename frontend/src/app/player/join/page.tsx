'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePlayer } from '@/context/PlayerContext';
import PlayerFlow from '@/components/PlayerFlow';

function JoinContent() {
  const { player } = usePlayer();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  // قراءة كود الغرفة من URL: /player/join?code=XXXX
  const roomCode = searchParams.get('code') || '';

  useEffect(() => {
    // حفظ بيانات اللاعب في localStorage للـ PlayerFlow
    if (player) {
      localStorage.setItem('mafia_player_info', JSON.stringify({
        playerId: player.playerId,
        displayName: player.name,
        phone: player.phone,
      }));
      localStorage.setItem('mafia_player_token', player.token);
      localStorage.setItem('mafia_playerId', String(player.playerId));
    }
    setMounted(true);
  }, [player]);

  if (!mounted) return null;

  return <PlayerFlow initialRoomCode={roomCode} />;
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
