'use client';

// ══════════════════════════════════════════════════════
// 🎟️ عناصر بطاقة الولاء المشتركة: صفّ الأختام + لافتة الرئيسيّة + نافذة اختيار المكافأة
// لا يُرسم شيءٌ منها إلا و`enabled === true` عند المستدعي.
// ══════════════════════════════════════════════════════

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { arNum, periodNameAr, fmtDateAr, KIND_LABEL, type LoyaltyMe, type LoyaltyReward } from '@/hooks/useLoyalty';
import { DonSeal, DonSlot, sealTilt } from '@/components/DonSeal';

export function StampRow({ total, filled, gift, size = 40 }: { total: number; filled: number; gift?: boolean; size?: number }) {
  return (
    <div className="flex gap-2 flex-wrap" dir="rtl">
      {Array.from({ length: total }).map((_, i) => {
        const on = i < filled;
        return (
          <motion.span
            key={i}
            initial={on ? { scale: 0.55, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: on ? i * 0.07 : 0, type: 'spring', damping: 11 }}
            className="inline-grid place-items-center"
          >
            {on
              ? <DonSeal size={size} tilt={sealTilt(i)} />
              : <DonSlot size={size} label={arNum(i + 1)} last={i === total - 1} />}
          </motion.span>
        );
      })}
      {gift && (
        <span className="rounded-full grid place-items-center" style={{ width: size, height: size, fontSize: size * 0.42, border: '1px solid rgba(235,214,164,0.6)', background: 'rgba(0,0,0,0.26)' }}>🎁</span>
      )}
    </div>
  );
}

/** لافتة الرئيسيّة — البطاقة نفسها مصغّرةً: عنّابيّ، إطارٌ نحاسيّ، أختام شمع */
export function LoyaltyHomeBanner({ me }: { me: LoyaltyMe }) {
  const router = useRouter();
  if (!me.enabled || !me.card || !me.config) return null;
  const N = me.config.stampsPerReward;
  const pending = me.pendingChoice;
  const avail = me.available || [];
  const filled = me.card.capReached ? N : me.card.inCard;
  const status = pending
    ? 'اكتملت! مكافأتك بانتظار اختيارك'
    : me.card.capReached
    ? 'بلغت حدّ الشهر — بطاقة الشهر القادم تنتظرك'
    : me.card.inCard === 0
    ? `احجز${me.config.channel === 'app' ? ' من التطبيق' : ''} قبل الفعاليّة بـ${arNum(me.config.minLeadHours)} ساعات والعب — ختمك الأوّل`
    : `بقي ${me.card.needed === 1 ? 'ختم واحد' : `${arNum(me.card.needed)} أختام`} للمكافأة`;
  return (
    <button onClick={() => router.push('/player/loyalty')} className="don-card don-card--mini w-full p-4 text-right transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[17px] font-bold" style={{ fontFamily: 'Amiri, serif', color: '#F6E7D6' }}>بطاقة {periodNameAr(me.period)}</span>
          <p className="text-[12px] mt-0.5" style={{ color: pending ? '#EBD6A4' : '#C4A9A2' }}>{status}</p>
        </div>
        <span className="px-3.5 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap" style={{ background: 'linear-gradient(180deg,#EBD6A4,#C9A45C 55%,#A8823E)', color: '#2A1208', border: '1px solid rgba(201,164,92,0.55)' }}>
          {pending ? 'اختر →' : 'افتح →'}
        </span>
      </div>
      <div className="mt-3 flex justify-center">
        <StampRow total={N} filled={filled} gift={!!pending || avail.length > 0} size={34} />
      </div>
      {avail.length > 0 && !pending && (
        <p className="text-[11px] mt-3 pt-2.5" style={{ color: '#D4B77E', borderTop: '1px solid rgba(201,164,92,0.2)' }}>
          🎁 {avail.map(r => `${KIND_LABEL[r.kind || '']?.icon || ''} ${KIND_LABEL[r.kind || '']?.label || ''}`).join(' · ')} — جاهزة للاستخدام
        </p>
      )}
    </button>
  );
}

/** نافذة اختيار المكافأة (سفليّة) */
export function ChooseRewardSheet({ me, reward, onClose, onChoose }: {
  me: LoyaltyMe; reward: LoyaltyReward; onClose: () => void;
  onChoose: (rewardId: number, kind: 'free_visit' | 'free_drink' | 'chips') => Promise<{ ok: boolean; error?: string }>;
}) {
  const kinds = me.config?.kinds || [];
  const [sel, setSel] = useState<'free_visit' | 'free_drink' | 'chips'>(kinds[0] || 'chips');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const desc: Record<string, string> = {
    free_visit: 'رسم اللعبة على النادي — تُطبَّق تلقائيّاً على حجزك القادم في أيّ مكان',
    free_drink: `أيّ مشروب حتى ${arNum(me.config?.drinkCapJod ?? 3)} د.أ يُخصم من فاتورتك في المكان`,
    chips: 'تُضاف فوراً لرصيدك — تكفي إطاراً أو لقباً من الخزنة',
  };
  const title: Record<string, string> = { free_visit: 'زيارة مجّانيّة', free_drink: 'مشروب مجّاني', chips: `${arNum(me.config?.chipsAmount ?? 0)} تشبس` };
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-lg rounded-t-3xl p-6 pb-10" dir="rtl"
          style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)', borderTop: '1px solid rgba(251,191,36,0.2)' }}
          onClick={e => e.stopPropagation()}>
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
          <div className="text-center text-2xl">🎁</div>
          <h3 className="text-center text-lg font-bold" style={{ fontFamily: 'Amiri, serif', color: '#fbbf24' }}>اكتملت بطاقة {periodNameAr(reward.period)}</h3>
          <p className="text-center text-gray-400 text-xs mb-4">اختر مكافأتك — الاختيار نهائيّ ولا يُبدَّل</p>
          <div className="space-y-2">
            {kinds.map(k => {
              const on = sel === k;
              return (
                <button key={k} onClick={() => setSel(k)} className="w-full text-right rounded-2xl p-3 flex items-center gap-3 transition-all"
                  style={on ? { background: 'rgba(251,191,36,0.10)', border: '1px solid #fbbf24', boxShadow: '0 0 15px rgba(245,158,11,0.15)' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="text-2xl w-9 text-center">{KIND_LABEL[k].icon}</span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-white text-sm">{title[k]}</b>
                    <small className="block text-gray-400 text-[11px] leading-snug">{desc[k]}</small>
                  </span>
                  <span style={{ color: on ? '#fbbf24' : '#4b5563' }}>{on ? '●' : '○'}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10.5px] text-gray-500 mt-3">
            صالحة حتى {fmtDateAr(reward.expiresAt)}{reward.chooseBy ? ` · إن لم تختر قبل ${fmtDateAr(reward.chooseBy)} نختار لك التشبس` : ''}.
          </p>
          {err && <p className="text-rose-400 text-xs text-center mt-2 font-bold">⚠️ {err}</p>}
          <button disabled={busy} onClick={async () => { setBusy(true); setErr(null); const r = await onChoose(reward.id, sel); setBusy(false); if (r.ok) onClose(); else setErr(r.error || 'تعذّر'); }}
            className="w-full mt-4 py-3 rounded-xl text-sm font-black text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}>
            {busy ? '⏳ جاري التثبيت...' : `تثبيت: ${title[sel]} ${KIND_LABEL[sel].icon}`}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
