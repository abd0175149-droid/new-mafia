'use client';

import { useParams } from 'next/navigation';
import PlayerFlow from '@/components/PlayerFlow';

export default function JoinByCodePage() {
  const params = useParams();
  const roomCode = params.roomCode as string;

  return <PlayerFlow initialRoomCode={roomCode} />;
}
