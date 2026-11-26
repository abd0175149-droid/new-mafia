'use client';
// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة على شاشة القاعة — بطاقات الصباح الثلاث
//
//   DIVIDED_SIDE  «انقسم المنقسم… إلى المافيا» / «…وبقي مع المدينة» — بلا رقمه (قرار ٣٧)
//   CUP_PUBLIC    الفنجان المكشوف: قراءة الليلة برقمها، بلا اسم القارئة (قرار ٢٧)
//   CUP_SEAL      قدر الغد: فُتح الختم، والمختوم يُعدم أوّل النهار بلا تصويت (قرار ١١)
// ══════════════════════════════════════════════════════
import { motion } from 'framer-motion';
import { ROLE_NAMES } from '@/lib/constants';

export const PROPHECY_MORNING = new Set(['DIVIDED_SIDE', 'CUP_PUBLIC', 'CUP_SEAL']);
export const isProphecyMorning = (t: any) => PROPHECY_MORNING.has(String(t || ''));
export const PROPHECY_HEADLINES: Record<string, { title: string; tone: 'blood' | 'gold' | 'ash'; icon: string }> = {
  DIVIDED_SIDE: { title: 'انقسمت المدينة', tone: 'ash', icon: '⚖️' },
  CUP_PUBLIC: { title: 'الفنجان المكشوف', tone: 'gold', icon: '☕' },
  CUP_SEAL: { title: 'قدر الغد', tone: 'blood', icon: '☕' },
};

const AMIRI = { fontFamily: 'Amiri, serif' } as const;

export function ProphecyMorningCard({ ev, players }: { ev: any; players: any[] }) {
  const t = ev?.type;
  const seat = ev?.targetPhysicalId;
  const name = ev?.targetName || players.find((p: any) => p.physicalId === seat)?.name || '';
  if (t === 'DIVIDED_SIDE') {
    const mafia = ev?.extra?.side === 'MAFIA';
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center" dir="rtl">
        <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[110px] leading-none">⚖️</motion.span>
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="text-5xl font-black text-white" style={AMIRI}>انقسم المنقسم…</motion.p>
        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}
          className="text-6xl font-black" style={{ ...AMIRI, color: mafia ? '#ff6b6b' : '#7fb0d6' }}>{mafia ? 'إلى المافيا' : 'وبقي مع المدينة'}</motion.p>
        <p className="text-[#ffe7a8]/60 text-lg" style={AMIRI}>«ستنقسم المدينة على نفسها»</p>
      </div>
    );
  }
  if (t === 'CUP_PUBLIC') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 text-center" dir="rtl">
        <motion.span initial={{ rotate: -20, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} className="text-[110px] leading-none">☕</motion.span>
        <p className="text-4xl font-black text-white" style={AMIRI}>قُرئ في الفنجان الليلة:</p>
        <motion.b initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }} className="text-[120px] font-black leading-none text-[#C5A059] tabular-nums">{seat}</motion.b>
        {name && <p className="text-4xl text-white/90" style={AMIRI}>{name}</p>}
        <p className="text-[#ffe7a8]/70 text-xl" style={AMIRI}>هل تعدمه المدينة اليوم؟</p>
      </div>
    );
  }
  // CUP_SEAL
  const role = ev?.extra?.targetRole;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center" dir="rtl">
      <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[100px] leading-none">📜</motion.span>
      <p className="text-4xl font-black text-white" style={AMIRI}>فُتح ختمُ قدر الغد</p>
      <motion.b initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }} className="text-[110px] font-black leading-none text-[#ff6b6b] tabular-nums">{seat}</motion.b>
      {name && <p className="text-4xl text-white/90" style={AMIRI}>{name}</p>}
      {role && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 }} className="text-3xl font-black text-[#C5A059]" style={AMIRI}>{(ROLE_NAMES as any)[role] || role}</motion.p>}
      <p className="text-[#ffe7a8]/70 text-xl" style={AMIRI}>يُعدم أوّل النهار — بلا تصويت</p>
    </div>
  );
}
