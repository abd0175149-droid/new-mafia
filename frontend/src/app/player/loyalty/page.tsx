'use client';

// ══════════════════════════════════════════════════════
// 🎟️ /player/loyalty — بطاقة الولاء (ختم الدون)
// عند إيقاف الميزة تُعيد الصفحة التوجيه إلى الرئيسيّة بلا أيّ محتوى.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLoyalty, arNum, periodNameAr, fmtDateAr, verdictLabel, KIND_LABEL, type LoyaltyReward } from '@/hooks/useLoyalty';
import { StampRow, ChooseRewardSheet } from '@/components/LoyaltyStamps';
import { ChipsBalancePill } from '@/components/ChipsBalancePill';

const TONE: Record<string, { bg: string; color: string; border: string }> = {
  ok: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  bad: { bg: 'rgba(251,113,133,0.10)', color: '#fb7185', border: 'rgba(251,113,133,0.3)' },
  warn: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  muted: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
};
const STATUS_AR: Record<string, string> = { pending_choice: 'بانتظار اختيارك', available: 'جاهزة للاستخدام', redeemed: 'استُخدمت', expired: 'انتهت', void: 'أُلغيت' };

export default function LoyaltyPage() {
  const router = useRouter();
  const { data, loading, refresh, choose } = useLoyalty();
  const [chooseFor, setChooseFor] = useState<LoyaltyReward | null>(null);

  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => { if (!loading && data && !data.enabled) router.replace('/player/home'); }, [loading, data, router]);

  if (loading || !data?.enabled || !data.card || !data.config) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;
  }
  const cfg = data.config;
  const N = cfg.stampsPerReward;
  const pending = data.pendingChoice;
  const available = data.available || [];
  const visits = data.visits || [];
  const stampsCount = visits.filter(v => v.verdict === 'stamped').length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#050505] pb-24">
      <div className="sticky top-0 z-30 px-4 py-3 backdrop-blur-xl bg-[#050505]/85 border-b border-amber-500/15">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="text-gray-500 text-sm px-2 py-1">← رجوع</button>
          <h1 className="text-lg font-black text-amber-400" style={{ fontFamily: 'Amiri, serif' }}>🎟️ بطاقة الولاء</h1>
          <ChipsBalancePill />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* البطاقة */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(5,5,5,0.9))', border: '1px solid rgba(251,191,36,0.22)' }}>
          <p className="text-amber-400 text-lg" style={{ fontFamily: 'Amiri, serif' }}>بطاقة {periodNameAr(data.period)}</p>
          <div className="flex justify-center my-3"><StampRow total={N} filled={data.card.inCard} size={52} /></div>
          <p className="text-3xl font-black text-amber-400 leading-none tabular-nums">
            {arNum(data.card.inCard)} <span className="text-sm text-gray-400 font-normal">/ {arNum(N)} أختام</span>
          </p>
          <p className="text-gray-400 text-[11.5px] mt-2 leading-relaxed">
            {data.card.capReached
              ? `بلغت حدّ الشهر (${arNum(data.config.maxRewardsPerMonth)} مكافآت) — بطاقة الشهر القادم تنتظرك`
              : data.card.cardsCompleted > 0
              ? `أكملت ${data.card.cardsCompleted === 1 ? 'بطاقة' : `${arNum(data.card.cardsCompleted)} بطاقات`} هذا الشهر · الحدّ ${arNum(data.config.maxRewardsPerMonth)} شهريّاً`
              : `${arNum(N)} أختام = مكافأة · تُصفَّر البطاقة أوّل كلّ شهر`}
          </p>
          {pending && (
            <div className="mt-3 p-3 rounded-xl flex items-center justify-between gap-2" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)' }}>
              <span className="text-[12px]" style={{ color: '#a7f3d0' }}>🎁 مكافأة جاهزة — اختر قبل {fmtDateAr(pending.chooseBy)}</span>
              <button onClick={() => setChooseFor(pending)} className="px-3 py-1.5 rounded-xl text-xs font-black text-black" style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}>اختر</button>
            </div>
          )}
          {available.map(r => (
            <div key={r.id} className="mt-2 p-3 rounded-xl text-right" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <p className="text-[12.5px] text-white font-bold">{KIND_LABEL[r.kind || '']?.icon} {KIND_LABEL[r.kind || '']?.label} — جاهزة</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {r.kind === 'free_visit' ? 'تُطبَّق تلقائيّاً على حجزك القادم من التطبيق' : `تُخصم من فاتورتك في المكان (حتى ${arNum(r.value?.capJod ?? cfg.drinkCapJod)} د.أ)`}
                {' · '}تنتهي {fmtDateAr(r.expiresAt)}
              </p>
            </div>
          ))}
        </motion.div>

        {/* الزيارات */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-1">
            <b className="text-[13px] text-white">زيارات {periodNameAr(data.period)}</b>
            <span className="text-[10.5px] text-gray-500">{arNum(visits.filter(v => v.played).length)} زيارات · {arNum(stampsCount)} أختام</span>
          </div>
          {visits.length === 0 && <p className="text-gray-500 text-xs py-4 text-center">لا زيارات بعد هذا الشهر — أوّل حجزٍ مبكّر يفتح البطاقة.</p>}
          {visits.map(v => {
            const d = new Date(v.date);
            const day = arNum(d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'Asia/Amman' }));
            const wd = d.toLocaleDateString('ar-JO', { weekday: 'long', timeZone: 'Asia/Amman' });
            const lb = verdictLabel(v); const t = TONE[lb.tone];
            return (
              <div key={v.activityId} className="grid items-center gap-2.5 py-2.5 border-b border-white/[0.06] last:border-b-0" style={{ gridTemplateColumns: '44px 1fr auto' }}>
                <div className="text-center border-l border-white/10 pl-2">
                  <b className="block text-xl font-black text-amber-400 leading-none">{day}</b>
                  <span className="text-[10px] text-gray-400">{wd}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[12.5px] text-white truncate">{v.activityName}</p>
                  <p className="text-[10.5px] text-gray-400 mt-0.5">{lb.why}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>{lb.text}</span>
              </div>
            );
          })}
        </div>

        {/* سجلّ المكافآت */}
        {(data.rewards || []).length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <b className="text-[13px] text-white block mb-1">سجلّ المكافآت</b>
            {(data.rewards || []).map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-b border-white/[0.06] last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[12.5px] text-white">{r.kind ? `${KIND_LABEL[r.kind].icon} ${KIND_LABEL[r.kind].label}` : '🎁 مكافأة'} — بطاقة {periodNameAr(r.period)}</p>
                  <p className="text-[10.5px] text-gray-500">{fmtDateAr(r.earnedAt)}{r.kind === 'chips' && r.value?.chips ? ` · +${arNum(r.value.chips)} 🪙` : ''}{r.kind !== 'chips' && r.value?.jod ? ` · ${arNum(r.value.jod)} د.أ` : ''}</p>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{STATUS_AR[r.status] || r.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* كيف */}
        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <b className="text-[12.5px] text-white">كيف تكسب ختماً؟</b>
          <p className="text-[11.5px] text-gray-400 mt-1 leading-relaxed">
            ✦ احجز من التطبيق قبل الفعاليّة بـ{arNum(data.config.minLeadHours)} ساعات على الأقلّ<br />
            ✦ والعب مباراةً واحدة على الأقلّ في تلك الليلة<br />
            ✦ {arNum(N)} أختام = مكافأة تختارها: {data.config.kinds.map(k => KIND_LABEL[k].label).join(' أو ')}<br />
            ✦ البطاقة تُصفَّر أوّل كلّ شهر · المكافأة صالحة {arNum(data.config.rewardValidityDays)} يوماً
          </p>
        </div>
      </div>

      {chooseFor && <ChooseRewardSheet me={data} reward={chooseFor} onClose={() => setChooseFor(null)} onChoose={choose} />}
    </div>
  );
}
