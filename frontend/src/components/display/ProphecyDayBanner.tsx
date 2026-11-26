'use client';
// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة على شاشة القاعة — شريطٌ نهاريّ أعلى الشاشة
//
//   day:kafala                  «🤝 كفله رقم ١٢» لحظةَ يقف الكفيل (الحكم يأتي مع قلب الكرت)
//   day:elimination-revealed    حكمُ الكفالة إن فشلت (مات الكفيل معه)، ورحيلُ القارئة وفناجينها
//   display:prophecy-withdrawn  «📜 أُحرقت صفقة النبوءة» (حقّ الشكّ) — بلا اسم صاحبها
//   صفقة النبوءة حين تمرّ: صدقت، أو كذبت والوصيّة (الاسم الآخر في الصندوقين)
// يُمحى مع بدء الليل. لا يحمل دوراً ولا شيئاً لم تعرفه القاعة.
// ══════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSocket } from '@/lib/socket';
import { isMafiaRole, type Role } from '@/lib/constants';

interface Line { key: string; icon: string; text: string; tone: 'gold' | 'blood' | 'sky' }

export default function ProphecyDayBanner() {
  const [lines, setLines] = useState<Line[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const socket = getSocket();
    const push = (l: Line, ms: number) => {
      setLines(prev => [...prev.filter(x => x.key !== l.key), l]);
      if (timers.current[l.key]) clearTimeout(timers.current[l.key]);
      timers.current[l.key] = setTimeout(() => setLines(prev => prev.filter(x => x.key !== l.key)), ms);
    };
    const onKafala = (d: any) => {
      if (d?.guarantorPhysicalId == null) return;
      push({ key: 'kafala', icon: '🤝', text: `كفله رقم ${d.guarantorPhysicalId} — يراهن بحياته على براءة ${d.targetPhysicalId}`, tone: 'gold' }, 20000);
    };
    const onRevealed = (d: any) => {
      const k = d?.kafala;
      if (k?.outcome === 'FAILED') push({ key: 'kafala', icon: '🤝', text: `لم يكن بريئاً — مات الكفيل ${k.guarantorPhysicalId} معه`, tone: 'blood' }, 15000);
      if (k?.outcome === 'SAVED') push({ key: 'kafala', icon: '🤝', text: `كان بريئاً — نجا ${k.targetPhysicalId} بكفالة ${k.guarantorPhysicalId}`, tone: 'sky' }, 15000);
      // 📜 صفقة النبوءة مرّت: صدقت أم كذبت — والوصيّة إن كذبت (قرار ٦)
      const deal = d?.deal;
      if (deal?.kind === 'PROPHECY') {
        const role = (d.revealedRoles || []).find((r: any) => r.physicalId === deal.targetPhysicalId)?.role;
        const trueP = role ? isMafiaRole(role as Role) : false;
        push({ key: 'prophecy', icon: '📜', tone: trueP ? 'gold' : 'blood',
          text: trueP ? 'صدقت النبوءة' : `كذبت النبوءة${deal.testamentPhysicalId != null ? ` — الوصيّة: رقم ${deal.testamentPhysicalId}` : ''}` }, 20000);
      }
      // 📜 سطرُ كلّ دورٍ حين يُقلب (قرار ٣٣) — بعد أن يُقلب الكرت بلحظة
      for (const [seat, line] of Object.entries(d?.flipLines || {})) {
        setTimeout(() => push({ key: `flip-${seat}`, icon: '📜', text: `${seat} — ${line}`, tone: 'gold' }, 12000), 4000);
      }
      const c = d?.cup;
      if (c?.departed) push({ key: 'cup', icon: '☕', text: `رحلت قارئة الفنجان فائزة — صدق فنجانها في: ${(c.hits || []).join('، ')}`, tone: 'gold' }, 20000);
    };
    const onWithdrawn = () => push({ key: 'withdrawn', icon: '📜', text: 'أُحرقت صفقة النبوءة — شكّ العرّاف في نبوءته', tone: 'gold' }, 12000);
    const onPhase = (d: any) => { if (d?.phase === 'NIGHT') setLines([]); };
    socket.on('day:kafala', onKafala);
    socket.on('day:elimination-revealed', onRevealed);
    socket.on('display:prophecy-withdrawn', onWithdrawn);
    socket.on('game:phase-changed', onPhase);
    const ts = timers.current;
    return () => {
      socket.off('day:kafala', onKafala);
      socket.off('day:elimination-revealed', onRevealed);
      socket.off('display:prophecy-withdrawn', onWithdrawn);
      socket.off('game:phase-changed', onPhase);
      Object.values(ts).forEach(clearTimeout);
    };
  }, []);

  const color = { gold: '#C5A059', blood: '#ff6b6b', sky: '#7fb0d6' };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[96px] z-[60] flex flex-col items-center gap-2" dir="rtl">
      <AnimatePresence>
        {lines.map(l => (
          <motion.div key={l.key} initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="rounded-2xl border bg-black/75 px-8 py-3 backdrop-blur-sm shadow-2xl"
            style={{ borderColor: `${color[l.tone]}88` }}>
            <p className="text-3xl font-black" style={{ fontFamily: 'Amiri, serif', color: color[l.tone] }}>{l.icon} {l.text}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
