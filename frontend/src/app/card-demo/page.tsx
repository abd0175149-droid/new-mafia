'use client';

import React, { useState } from 'react';
import MafiaCard from '@/components/MafiaCard';
import { Role, ROLE_NAMES } from '@/lib/constants';

// ══════════════════════════════════════════════════════
// 🎴 معرض كروت المافيا — صفحة عرض تفاعلية
// ══════════════════════════════════════════════════════

const ALL_ROLES = Object.values(Role);

const DEMO_PLAYERS = [
  { number: 1, name: 'عبدالله', role: Role.GODFATHER, gender: 'MALE' as const },
  { number: 2, name: 'فاطمة', role: Role.SHERIFF, gender: 'FEMALE' as const },
  { number: 3, name: 'خالد', role: Role.DOCTOR, gender: 'MALE' as const },
  { number: 4, name: 'نورة', role: Role.CHAMELEON, gender: 'FEMALE' as const },
  { number: 5, name: 'أحمد', role: Role.SNIPER, gender: 'MALE' as const },
  { number: 6, name: 'سارة', role: Role.NURSE, gender: 'FEMALE' as const },
  { number: 7, name: 'محمد', role: Role.MAFIA_REGULAR, gender: 'MALE' as const },
  { number: 8, name: 'ريم', role: Role.POLICEWOMAN, gender: 'FEMALE' as const },
  { number: 9, name: 'عمر', role: Role.SILENCER, gender: 'MALE' as const },
  { number: 10, name: 'لينا', role: Role.CITIZEN, gender: 'FEMALE' as const },
];

export default function CardDemoPage() {
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [showVoting, setShowVoting] = useState(true);
  const [cardSize, setCardSize] = useState<'sm' | 'md' | 'lg'>('md');

  const handleVote = (playerNumber: number) => {
    setVotes(prev => ({
      ...prev,
      [playerNumber]: (prev[playerNumber] || 0) + 1,
    }));
  };

  const toggleFlip = (playerNumber: number) => {
    setFlippedCards(prev => ({
      ...prev,
      [playerNumber]: !prev[playerNumber],
    }));
  };

  const flipAll = () => {
    const allFlipped = DEMO_PLAYERS.every(p => flippedCards[p.number]);
    const newState: Record<number, boolean> = {};
    DEMO_PLAYERS.forEach(p => { newState[p.number] = !allFlipped; });
    setFlippedCards(newState);
  };

  const resetVotes = () => setVotes({});

  return (
    <div className="min-h-screen bg-[#050505] p-8" dir="rtl">
      {/* الهيدر */}
      <div className="max-w-7xl mx-auto mb-12 text-center">
        <h1 className="text-5xl font-black text-[#C5A059] mb-4" style={{ fontFamily: 'Amiri, serif' }}>
          🎴 معرض الكروت
        </h1>
        <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase mb-8">
          MAFIA CARD GALLERY — ALL ROLES & STATES
        </p>

        {/* أزرار التحكم */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <button
            onClick={flipAll}
            className="px-6 py-2 bg-[#111] border border-[#C5A059]/40 text-[#C5A059] font-mono text-sm tracking-widest uppercase hover:bg-[#C5A059]/10 transition-all"
          >
            {DEMO_PLAYERS.every(p => flippedCards[p.number]) ? '🂠 إخفاء الكل' : '🂡 كشف الكل'}
          </button>
          <button
            onClick={() => setShowVoting(!showVoting)}
            className="px-6 py-2 bg-[#111] border border-zinc-700 text-zinc-400 font-mono text-sm tracking-widest uppercase hover:bg-zinc-800 transition-all"
          >
            {showVoting ? '🔒 إخفاء التصويت' : '🗳️ إظهار التصويت'}
          </button>
          <button
            onClick={resetVotes}
            className="px-6 py-2 bg-[#111] border border-red-900/40 text-red-400 font-mono text-sm tracking-widest uppercase hover:bg-red-900/20 transition-all"
          >
            🔄 تصفير الأصوات
          </button>

          {/* اختيار الحجم */}
          <div className="flex border border-zinc-800 rounded overflow-hidden">
            {(['sm', 'md', 'lg'] as const).map(s => (
              <button
                key={s}
                onClick={() => setCardSize(s)}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider transition-all ${
                  cardSize === s
                    ? 'bg-[#C5A059] text-black font-bold'
                    : 'bg-[#111] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* شبكة الكروت */}
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-center gap-6">
          {DEMO_PLAYERS.map(player => (
            <MafiaCard
              key={player.number}
              playerNumber={player.number}
              playerName={player.name}
              role={player.role}
              gender={player.gender}
              votes={votes[player.number] || 0}
              onVote={() => handleVote(player.number)}
              showVoting={showVoting}
              isFlipped={flippedCards[player.number] || false}
              onFlip={() => toggleFlip(player.number)}
              isAlive={true}
              isSilenced={player.number === 9}
              size={cardSize}
            />
          ))}
        </div>
      </div>

      {/* كارد ميت للعرض */}
      <div className="max-w-7xl mx-auto mt-16 text-center">
        <h2 className="text-2xl font-bold text-zinc-600 mb-6 font-mono tracking-widest uppercase">
          ☠️ حالة اللاعب الميت
        </h2>
        <div className="flex justify-center gap-6">
          <MafiaCard
            playerNumber={99}
            playerName="ضحية"
            role={Role.CITIZEN}
            isAlive={false}
            size={cardSize}
          />
          <MafiaCard
            playerNumber={98}
            playerName="مُقصى"
            role={Role.GODFATHER}
            isAlive={false}
            isFlipped={true}
            flippable={false}
            size={cardSize}
          />
        </div>
      </div>
    </div>
  );
}
