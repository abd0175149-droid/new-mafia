'use client';

// ══════════════════════════════════════════════════════
// 📱 بوّابة رقم الواتساب (2026-10-30)
// لاعبٌ رقمه بلا واتساب (أو غير صالح، أو مشترك مع حسابٍ آخر) لا يتجاوزها حتّى يربط رقماً عليه
// واتساب: يكتب الرقم ⟵ الخادم يفحصه بصمت ⟵ رمز ٦ أرقام يصله على واتساب ⟵ يُعتمد رقماً للدخول.
// الخادم يقرّر متى تظهر (/me ⟵ waGate): المفتاح من الداشبورد، ولا تُقطع لعبةٌ جارية.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '@/context/PlayerContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
type Gate = { required: true; reason: 'none' | 'invalid' | 'shared'; phone: string } | null;

const REASON: Record<string, (p: string) => string> = {
  none: p => `الرقم المسجّل في حسابك ${p} ليس عليه واتساب.`,
  invalid: p => `الرقم المسجّل في حسابك «${p}» ليس رقم هاتفٍ صالحاً.`,
  shared: () => 'رقم حسابك مسجّلٌ أيضاً لحسابٍ آخر — كلّ حسابٍ يحتاج رقمه.',
};

export default function WaNumberGate() {
  const { player, setPlayer } = usePlayer();
  const [gate, setGate] = useState<Gate>(null);
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const token = () => (typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : null);

  const load = useCallback(() => {
    const t = token();
    if (!player?.playerId || !t) return;
    fetch(`${API_URL}/api/player-auth/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.success) setGate(d.waGate || null); })
      .catch(() => {});
  }, [player?.playerId]);

  // عند الدخول وعند العودة للتطبيق (قد تنتهي لعبته فتظهر البوّابة)
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const call = async (path: string, body: any) => {
    const r = await fetch(`${API_URL}/api/player-auth/wa-number/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.error || 'تعذّر الاتصال — حاول مجدداً');
    return d;
  };

  const finish = (newPhone: string) => {
    if (player) setPlayer({ ...player, phone: newPhone });
    setStep('done');
  };

  const start = async () => {
    setError(''); setBusy(true);
    try {
      const d = await call('start', { phone });
      if (d.sameNumber) { await call('confirm', { phone: d.phone }); finish(d.phone); }
      else { setSentTo(d.phone); setCode(''); setStep('code'); }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setError(''); setBusy(true);
    try { const d = await call('confirm', { phone: sentTo, code }); finish(d.phone); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!gate?.required) return null;

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-5" dir="rtl"
      style={{ background: 'rgba(5,5,10,0.94)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-sm rounded-3xl p-6"
        style={{ background: 'linear-gradient(160deg, #14141c, #0b0b10)', border: '1px solid rgba(37,211,102,0.3)' }}>
        <div className="mx-auto mb-3 w-14 h-14 rounded-2xl grid place-items-center" style={{ background: 'rgba(37,211,102,0.12)' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.6-4.6A8.5 8.5 0 1 1 7.7 19.6z" /></svg>
        </div>

        {step === 'done' ? (
          <>
            <h2 className="text-xl font-black text-center mb-2 text-emerald-400">تمّ ربط رقمك</h2>
            <p className="text-gray-300 text-sm leading-relaxed text-center mb-5">
              من الآن تدخل التطبيق بالرقم <b className="font-mono" dir="ltr">{sentTo || phone}</b> وكلمة مرورك نفسها. حجوزاتك ونقاطك كما هي.
            </p>
            <button onClick={() => setGate(null)} className="w-full py-3.5 rounded-xl font-black bg-emerald-500 text-black">متابعة</button>
          </>
        ) : step === 'code' ? (
          <>
            <h2 className="text-xl font-black text-center mb-2 text-white">أدخل رمز التأكيد</h2>
            <p className="text-gray-400 text-sm leading-relaxed text-center mb-4">
              أرسلنا رمزاً من ٦ أرقام إلى واتساب <b className="font-mono text-gray-200" dir="ltr">{sentTo}</b> — افتح واتساب على هاتفك.
            </p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/[^\d٠-٩]/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
              placeholder="______" dir="ltr" aria-label="رمز التأكيد"
              className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.4em] font-mono mb-3 focus:outline-none focus:border-emerald-500" />
            {error && <p role="alert" className="text-rose-400 text-sm mb-3 text-center">{error}</p>}
            <button onClick={confirm} disabled={busy || code.length < 6} className="w-full py-3.5 rounded-xl font-black bg-emerald-500 text-black disabled:opacity-40">
              {busy ? 'يتحقّق…' : 'تأكيد'}
            </button>
            <button onClick={() => { setStep('phone'); setError(''); }} className="w-full py-3 mt-2 rounded-xl font-bold text-gray-400 border border-white/10">رقمٌ آخر</button>
          </>
        ) : (
          <>
            <h2 className="text-xl font-black text-center mb-2 text-white">اربط حسابك برقم واتساب</h2>
            <p className="text-gray-400 text-sm leading-relaxed text-center mb-4">
              {(REASON[gate.reason] || REASON.none)(gate.phone)} حجوزاتك وفواتيرك وتنبيهاتك تصلك على واتساب — اكتب رقمك الذي عليه واتساب لتكمل.
            </p>
            <label className="block text-sm font-bold text-gray-300 mb-1.5" htmlFor="wa-gate-phone">رقم الواتساب</label>
            <input id="wa-gate-phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXX" dir="ltr"
              className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-white text-right text-lg font-mono mb-3 focus:outline-none focus:border-emerald-500" />
            {error && <p role="alert" className="text-rose-400 text-sm mb-3">{error}</p>}
            <button onClick={start} disabled={busy || phone.trim().length < 9} className="w-full py-3.5 rounded-xl font-black bg-emerald-500 text-black disabled:opacity-40">
              {busy ? 'نتحقّق من الرقم على واتساب…' : 'تحقّق واعتمد'}
            </button>
            <p className="text-[12px] text-gray-500 mt-3 text-center">لا نرسل شيئاً للرقم لنفحصه — بعد الفحص يصلك رمزٌ واحد للتأكيد.</p>
          </>
        )}
      </div>
    </div>
  );
}
