'use client';

// ══════════════════════════════════════════════════════
// 🎂 بوابة تاريخ الميلاد
// أي لاعب بلا تاريخ ميلاد يُطالَب بإدخاله عند أول دخول للتطبيق،
// ولا يُغلق الحاجز حتى يُحفظ (النادي يعطي عيديّة ولا يعرف متى!).
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const MIN_YEAR = 1940;
const MAX_AGE_YEARS = 8;   // أصغر عمر مقبول

export default function BirthdayGate() {
  const { player } = usePlayer();
  const [needed, setNeeded] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // فحص: هل عند اللاعب تاريخ ميلاد؟
  useEffect(() => {
    if (!player?.playerId) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null;
    if (!token) return;
    let cancelled = false;

    fetch(`${API_URL}/api/player-auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d?.player) return;
        const dob = String(d.player.dob || '').trim();
        if (!dob) setNeeded(true);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [player?.playerId]);

  const save = async () => {
    setError('');
    const v = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { setError('اختر تاريخاً صحيحاً'); return; }

    const d = new Date(v);
    if (isNaN(d.getTime())) { setError('تاريخ غير صالح'); return; }
    const year = Number(v.slice(0, 4));
    const now = new Date();
    const age = now.getFullYear() - year;
    if (year < MIN_YEAR || d.getTime() > now.getTime()) { setError('تاريخ غير منطقي'); return; }
    if (age < MAX_AGE_YEARS) { setError('التاريخ المُدخل يبدو غير صحيح'); return; }

    setBusy(true);
    try {
      const token = localStorage.getItem('mafia_player_token');
      const res = await fetch(`${API_URL}/api/player/${player!.playerId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dob: v }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'تعذّر الحفظ');
      setNeeded(false);
    } catch (e: any) {
      setError(e.message || 'تعذّر الحفظ — حاول مجدداً');
    } finally { setBusy(false); }
  };

  return (
    <AnimatePresence>
      {needed && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-5"
          style={{ background: 'rgba(5,5,10,0.92)', backdropFilter: 'blur(8px)' }}
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 18 }}
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{ background: 'linear-gradient(160deg, #14141c, #0b0b10)', border: '1px solid rgba(245,158,11,0.28)' }}
          >
            <div className="text-5xl mb-3">🎂</div>
            <h2 className="text-xl font-black text-amber-400 mb-2" style={{ fontFamily: 'Amiri, serif' }}>
              متى عيد ميلادك؟
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">
              النادي يعطي <b className="text-amber-400">عيديّة تشبس</b> لكل من يوافق عيد ميلاده — ولا نريد أن يفوتك.
              أدخل تاريخك مرة واحدة فقط.
            </p>

            <input
              type="date"
              value={value}
              onChange={e => setValue(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-lg mb-3 focus:outline-none focus:border-amber-500"
              style={{ colorScheme: 'dark' }}
            />

            {error && <p className="text-rose-400 text-xs mb-3">{error}</p>}

            <button
              onClick={save}
              disabled={busy || !value}
              className="w-full py-3 rounded-xl font-black text-sm bg-amber-500 text-black disabled:opacity-40 transition-all"
            >
              {busy ? 'جارٍ الحفظ…' : '🎁 احفظ واستلم عيديّتك في يومك'}
            </button>

            <p className="text-[10px] text-gray-600 mt-3">يظهر لأصدقائك يوم ميلادك فقط — لا نعرض عمرك في أي مكان.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
