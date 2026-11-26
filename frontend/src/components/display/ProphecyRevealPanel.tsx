'use client';
// 🔮 الكشف بعد اللعبة على شاشة القاعة (قرار المالك ٣١): ما فعلته كروت النبوءة — لوحةٌ جانبيّة ثابتة
import { motion } from 'framer-motion';
import { ledgerSentence, prophecyRevealLines } from '@/lib/prophecy-reveal';

export default function ProphecyRevealPanel({ rv, players, ledger }: { rv: any; players: any[]; ledger?: any }) {
  const lines = prophecyRevealLines(rv, (s) => players.find((p: any) => p.physicalId === s)?.name || '');
  const sentence = ledgerSentence(ledger);
  if (!lines.length && !sentence) return null;
  return (
    <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2 }}
      className="fixed bottom-6 left-6 z-[70] w-[34vw] max-w-[620px] rounded-3xl border border-[#C5A059]/40 bg-black/75 p-5 backdrop-blur-sm shadow-2xl" dir="rtl">
      <p className="mb-2 text-3xl font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>🔮 ما خطّته النبوءة</p>
      {sentence && <p className="mb-2 text-2xl font-bold text-[#efe8da]" style={{ fontFamily: 'Amiri, serif' }}>📜 {sentence}</p>}
      <div className="flex flex-col divide-y divide-white/10">
        {lines.map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 + i * 0.6 }} className="py-2">
            <p className="text-lg font-bold text-white/90" style={{ fontFamily: 'Amiri, serif' }}>{l.icon} {l.title}</p>
            <p className="text-base text-[#efe8da]/85">{l.text}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
