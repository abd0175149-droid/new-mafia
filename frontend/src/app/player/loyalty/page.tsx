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
import '@/components/DonSeal.css';

const TONE: Record<string, { bg: string; color: string; border: string }> = {
  ok: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
  bad: { bg: 'rgba(251,113,133,0.10)', color: '#fb7185', border: 'rgba(251,113,133,0.3)' },
  warn: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  muted: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
};
/** ما بقي من شهر البطاقة بتوقيت عمّان (UTC+3 بلا توقيتٍ صيفيّ منذ ٢٠٢٢) */
function daysLeftAr(period?: string): string {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  const endUtc = Date.UTC(y, m, 1) - 3 * 3600e3; // بداية الشهر التالي بتوقيت عمّان
  const d = Math.ceil((endUtc - Date.now()) / 86400e3);
  if (d <= 0) return 'انتهى الشهر';
  if (d === 1) return 'آخر يوم';
  if (d === 2) return 'يومان';
  return `${arNum(d)} أيّام`;
}

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
  // عند بلوغ حدّ الشهر تُعرض البطاقة كاملةً: الشهر انتهى ولاءً، لا بطاقة نصف فارغة
  const filled = data.card.capReached ? N : data.card.inCard;
  const statusLine = pending
    ? 'اكتملت البطاقة — مكافأتك بانتظار اختيارك'
    : data.card.capReached
    ? `بلغت حدّ الشهر (${arNum(cfg.maxRewardsPerMonth)} مكافآت) — بطاقة الشهر القادم تنتظرك`
    : data.card.inCard === 0
    ? `أوّل ختمٍ يفتح البطاقة · ${arNum(N)} أختام تجلب مكافأة`
    : `بقي ${data.card.needed === 1 ? 'ختم واحد' : `${arNum(data.card.needed)} أختام`} — وتختار مكافأتك${data.card.cardsCompleted > 0 ? ` · أكملت ${arNum(data.card.cardsCompleted)} هذا الشهر` : ''}`;

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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="don-card p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[22px] font-bold leading-tight" style={{ fontFamily: 'Amiri, serif', color: '#F6E7D6' }}>بطاقة {periodNameAr(data.period)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#B79295' }}>ختمٌ لكلّ ليلةٍ حجزتها مبكّراً ولعبتها</p>
            </div>
            <span className="text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full whitespace-nowrap"
              style={{ border: '1px solid rgba(201,164,92,0.34)', color: '#D4B77E', background: 'rgba(0,0,0,0.24)' }}>
              ⏳ {daysLeftAr(data.period)}
            </span>
          </div>

          <div className="flex justify-center my-5"><StampRow total={N} filled={filled} size={52} /></div>

          <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid rgba(201,164,92,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#C9A45C' }} />
            <p className="text-[12.5px] flex-1 min-w-0" style={{ color: '#F0E2E2' }}>{statusLine}</p>
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: '#BFA48F' }}>{arNum(filled)}/{arNum(N)}</span>
          </div>

          {!data.card.capReached && cfg.kinds.length > 0 && (
            <div className="mt-3 p-[10px] rounded-xl" style={{ background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(201,164,92,0.22)' }}>
              <p className="text-[10px] font-semibold mb-2" style={{ color: '#C9A45C' }}>
                {pending ? 'اختر واحدة — الاختيار نهائيّ' : 'مكافأتك عند الاكتمال — تختار واحدة'}
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {cfg.kinds.map(k => (
                  <span key={k} className="text-[10.5px] px-2.5 py-1 rounded-full" style={{ border: '1px solid rgba(201,164,92,0.24)', color: '#BFA48F' }}>
                    {KIND_LABEL[k].icon} {k === 'chips' ? `${arNum(cfg.chipsAmount)} تشبس` : KIND_LABEL[k].label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => (pending ? setChooseFor(pending) : router.push('/player/home'))}
            className="w-full mt-3 py-[11px] rounded-xl text-[13px] font-black"
            style={{ background: 'linear-gradient(180deg,#EBD6A4,#C9A45C 55%,#A8823E)', color: '#2A1208', border: '1px solid rgba(201,164,92,0.55)' }}>
            {pending ? `🎁 اختر مكافأتك — قبل ${fmtDateAr(pending.chooseBy)}` : 'احجز ليلتك القادمة'}
          </button>

          <p className="text-[10px] leading-relaxed text-center mt-2" style={{ color: '#9C8285' }}>
            الختم يحتاج حجزاً{cfg.channel === 'app' ? ' من التطبيق' : ' من التطبيق أو عبر «الدون» على واتساب'} قبل الفعاليّة بـ{arNum(cfg.minLeadHours)} ساعات ولعب مباراة
          </p>

          {available.map(r => (
            <div key={r.id} className="mt-2 p-3 rounded-xl text-right" style={{ background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(201,164,92,0.28)' }}>
              <p className="text-[12.5px] font-bold" style={{ color: '#F6E7D6' }}>{KIND_LABEL[r.kind || '']?.icon} {KIND_LABEL[r.kind || '']?.label} — جاهزة</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#BFA48F' }}>
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
            ✦ احجز من التطبيق{data.config.channel !== 'app' ? ' أو عبر «الدون» على واتساب' : ''} قبل الفعاليّة بـ{arNum(data.config.minLeadHours)} ساعات على الأقلّ<br />
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
