'use client';

// ══════════════════════════════════════════════════════
// 🪙 محفظتي — الرصيد وسجل الحركات
// من أين جاء كل تشبس وعلى ماذا صُرف — بلا غموض.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// وصف كل حركة بلغة اللاعب — لا مصطلحات نظام
const MOVE: Record<string, { icon: string; label: string }> = {
  drop_win: { icon: '🏆', label: 'فوز المباراة' },
  drop_top3: { icon: '🥉', label: 'ضمن أفضل ثلاثة' },
  drop_first_match: { icon: '🎉', label: 'هديّة أول مباراة' },
  admin_topup: { icon: '💵', label: 'شحن من الإدارة' },
  admin_adjust: { icon: '🎁', label: 'من النادي' },
  rent_item: { icon: '🛒', label: 'استئجار' },
  renew_item: { icon: '🔄', label: 'تجديد' },
  refund: { icon: '↩️', label: 'استرجاع' },
  gift_in: { icon: '🎀', label: 'هديّة وصلتك' },
  gift_out: { icon: '🎀', label: 'هديّة أرسلتها' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-JO', { day: 'numeric', month: 'long' })
    + ' · ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
}

export default function WalletPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
    if (!token) return;
    fetch(`${API_URL}/api/chips/me/wallet`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // تحديث فوري عند وصول تشبس والشاشة مفتوحة
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
    if (!token) return;
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on('chips:balance-updated', onUpdate);
    return () => { socket.off('chips:balance-updated', onUpdate); };
  }, []);

  const ledger: any[] = data?.ledger || [];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] pb-24">
      {/* الترويسة */}
      <div className="sticky top-0 z-30 px-4 py-3 backdrop-blur-xl bg-[#0a0a0f]/85 border-b border-amber-500/15">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => router.back()} className="text-gray-500 text-sm px-2 py-1">← رجوع</button>
          <h1 className="text-lg font-black text-amber-400" style={{ fontFamily: 'Amiri, serif' }}>🪙 محفظتي</h1>
          <button onClick={() => router.push('/player/store')} className="text-[11px] font-bold text-amber-400/90 px-2 py-1">
            الخزنة ←
          </button>
        </div>
      </div>

      {/* الرصيد */}
      <div className="flex flex-col items-center py-8">
        <motion.div
          key={data?.balance}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-6xl font-black tabular-nums"
          style={{ color: '#fbbf24', textShadow: '0 0 34px rgba(245,158,11,0.45)' }}
        >
          {loading ? '—' : Number(data?.balance || 0).toLocaleString('en-US')}
        </motion.div>
        <p className="text-gray-500 text-sm mt-1">🪙 رصيدك الحالي</p>
        <p className="text-[11px] text-gray-600 mt-2">الرصيد لا ينتهي أبداً — المزايا وحدها لها مدّة</p>
      </div>

      {/* الملخّص */}
      {!loading && (
        <div className="px-4 grid grid-cols-3 gap-2 mb-6">
          {[
            { v: data?.earnedFree, l: 'كسبته باللعب', c: '#34d399', i: '🏆' },
            { v: data?.toppedUp, l: 'وصلك شحناً وهدايا', c: '#fbbf24', i: '💵' },
            { v: data?.spent, l: 'صرفته', c: '#fb7185', i: '🛒' },
          ].map((s, i) => (
            <div key={i} className="rounded-2xl p-3 text-center border border-white/8 bg-white/[0.04]">
              <div className="text-lg">{s.i}</div>
              <div className="text-xl font-black tabular-nums mt-0.5" style={{ color: s.c }}>
                {Number(s.v || 0).toLocaleString('en-US')}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* السجل */}
      <div className="px-4">
        <h2 className="text-sm font-black text-gray-300 mb-3">📒 سجل الحركات</h2>

        {loading && <p className="text-center text-gray-600 text-sm py-10">جارٍ التحميل…</p>}

        {!loading && ledger.length === 0 && (
          <div className="text-center py-12 px-6 rounded-2xl border border-dashed border-white/10">
            <div className="text-4xl mb-3">🪙</div>
            <p className="text-gray-400 text-sm leading-relaxed">
              ما في حركات بعد.<br />
              اربح مباراتك الجاية وبتشوف أول <b className="text-amber-400">+2 🪙</b> هون.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {ledger.map((m, i) => {
            // 🔴 admin_adjust يحمل الإشارتين: المكافآت الموسميّة والعيديّة
            //    كُتبت تاريخياً بسببه فسُمّي «من النادي» 🎁 — لكنّ التصحيح
            //    السالب بالاسم نفسه يقول للاعب إن النادي أهداه… ثمّ خصم.
            const meta =
              m.reason === 'admin_adjust' && m.amount < 0
                ? { icon: '✏️', label: 'تصحيح' }
                : MOVE[m.reason] || { icon: '•', label: m.reason };
            const positive = m.amount > 0;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className="flex items-center gap-3 rounded-2xl p-3 border border-white/8 bg-white/[0.03]"
              >
                <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-lg shrink-0">
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm font-bold truncate">
                    {meta.label}
                    {m.note && !m.note.startsWith('اختبار') && (
                      <span className="text-gray-500 font-normal"> — {m.note}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{fmtDate(m.createdAt)}</p>
                </div>
                <div className="text-left shrink-0">
                  <p className={`text-base font-black tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {positive ? '+' : '−'}{Math.abs(m.amount)}
                  </p>
                  <p className="text-[10px] text-gray-600 tabular-nums">الرصيد {m.balanceAfter}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {ledger.length >= 60 && (
          <p className="text-center text-[11px] text-gray-600 mt-4">تُعرض آخر ٦٠ حركة</p>
        )}
      </div>

      {/* كيف أكسب المزيد */}
      {!loading && (
        <div className="px-4 mt-8">
          <div className="rounded-2xl p-4 border border-amber-500/20 bg-amber-500/[0.06]">
            <h3 className="text-sm font-black text-amber-400 mb-2">كيف تكسب أكثر؟</h3>
            <ul className="text-[12.5px] text-gray-400 space-y-1.5 leading-relaxed">
              <li>🏆 اربح المباراة — <b className="text-amber-400">+2</b></li>
              <li>🥉 اطلع ضمن أفضل ثلاثة — <b className="text-amber-400">+3</b></li>
              <li>🎂 عيد ميلادك — <b className="text-amber-400">عيديّة من النادي</b></li>
              <li>💵 أو اشحن من الإدارة بالحضور</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
