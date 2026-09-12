'use client';
// ══════════════════════════════════════════════════════
// 👁️ معاينة مشاهد شاشة القاعة بلا غرفة — /display/preview?scene=night|dawn&step=SHERIFF
//    للمراجعة البصريّة السريعة (المالك والمطوّر) ولاختبار الاحتواء الآليّ.
// ══════════════════════════════════════════════════════
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NightScene from '@/components/display/NightScene';
import MorningReport from '@/components/display/MorningReport';

const MOCK_PLAYERS = Array.from({ length: 12 }, (_, i) => ({ physicalId: i + 1, name: `لاعب ${i + 1}`, isAlive: true, gender: i % 3 ? 'MALE' : 'FEMALE' }));
const MOCK_EVENTS = [
  { type: 'ASSASSINATION', targetPhysicalId: 4, targetName: 'لاعب 4', extra: { targetRole: 'CITIZEN' } },
  { type: 'SILENCED', targetPhysicalId: 7, targetName: 'لاعب 7' },
  { type: 'ABILITY_DISABLED', targetPhysicalId: 2, extra: { disabledRole: 'SHERIFF' } },
];

function Preview() {
  const q = useSearchParams();
  const scene = q.get('scene') || 'night';
  const step = q.get('step');
  const evt = Number(q.get('event') ?? -1);
  return (
    <div className="display-bg h-[100dvh] w-full overflow-hidden px-8 py-6 text-white">
      <div className="relative w-full h-full">
        {scene === 'dawn' ? (
          <MorningReport events={MOCK_EVENTS.slice(0, evt >= 0 ? evt + 1 : MOCK_EVENTS.length)} current={evt >= 0 ? MOCK_EVENTS[evt] : null} players={MOCK_PLAYERS} teamCounts={{ citizenAlive: 8, mafiaAlive: 3, neutralAlive: 1 }} round={2} />
        ) : (
          <NightScene animation={evt >= 0 ? { type: 'ASSASSINATION_ATTEMPT' } : null} stepType={step} players={MOCK_PLAYERS} oneNight={q.get('one') === '1'} />
        )}
      </div>
    </div>
  );
}

export default function DisplayPreviewPage() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
