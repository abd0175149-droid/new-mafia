'use client';

// ══════════════════════════════════════════════════════
// 🗑️ حذف الحساب — من داخل التطبيق (شرط آبل 5.1.1(v))
//
// 🔴 نعرض ما سيُفقَد بالاسم قبل التأكيد لا بعده.
// 🔴 ورصيدٌ اشتُري بمالٍ حقيقيّ لا يُصادَر بصمت: يُعرض، ويُطلب إقرارٌ صريح،
//    ويُدعى اللاعب إلى تسويته. القانون يمنع الضرر الماليّ من ممارسة الحقّ.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePlayer } from '@/context/PlayerContext';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ar = (v: any) => String(v ?? 0).replace(/[0-9]/g, d => AR[+d]);

export default function DeleteAccount() {
  const { player } = usePlayer();
  const router = useRouter();
  const token = player?.token;

  const [pv, setPv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ack, setAck] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/privacy/deletion/preview', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d?.success) setPv(d.preview); })
      .catch(() => setErr('تعذّر جلب التفاصيل'))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/privacy/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: 'user_request', acknowledgeBalance: ack }),
      });
      const d = await r.json();
      if (!d?.success) { setErr(d?.error || 'تعذّر الحذف'); return; }
      setDone(d.dueAt);
    } catch { setErr('تعذّر الاتّصال'); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    const days = Math.max(0, Math.ceil((new Date(done).getTime() - Date.now()) / 86400_000));
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 text-center" dir="rtl">
        <p className="text-5xl mb-4">🗑️</p>
        <h1 className="text-[24px] font-bold text-white" style={{ fontFamily: 'Amiri, serif' }}>
          سُجّل طلبُ الحذف
        </h1>
        <p className="text-[14px] text-gray-400 mt-3 leading-[1.9]">
          حسابُك معطّلٌ الآن ولا يظهر لأحد. يُمحى نهائيّاً بعد{' '}
          <b className="text-white">{ar(days)} {days === 1 ? 'يوم' : 'يوماً'}</b>،
          ويكفي دخولُك قبلها لاستعادته.
        </p>
        <button onClick={() => router.push('/player/privacy')}
          className="mt-6 w-full rounded-xl py-3 text-[15px] font-bold"
          style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', color: '#9C958A' }}>
          حسناً
        </button>
      </div>
    );
  }

  const chips = Number(pv?.chipsBalance ?? 0);
  const ready = (chips === 0 || ack) && confirmText.trim() === 'حذف';

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-10" dir="rtl">
      <Link href="/player/privacy" className="text-[12px] text-gray-500">← مركز الخصوصيّة</Link>
      <h1 className="text-[24px] font-bold text-white mt-3" style={{ fontFamily: 'Amiri, serif' }}>
        ما الذي ستفقده
      </h1>

      <div className="rounded-2xl p-4 mt-4"
        style={{ background: 'rgba(255,255,255,.028)', border: '1px solid rgba(255,255,255,.06)' }}>
        {[
          ['🪙', `رصيدُ رقائقك: ${ar(chips)}`, chips > 0 ? 'اشتُري بمالٍ حقيقيّ — تواصل معنا لتسويته' : 'لا رصيد'],
          ['🏆', `رتبتُك${pv?.level ? ` · المستوى ${ar(pv.level)}` : ''}`, 'تُفقد بالكامل'],
          ['📊', `سجلُّ ${ar(pv?.matches ?? 0)} مباراة`, 'يبقى بلا اسمك في تاريخ خصومك'],
          ['🎟️', `${ar(pv?.upcomingBookings ?? 0)} حجزٌ قادم`, 'يُلغى تلقائيّاً'],
        ].map(([i, t, s], k) => (
          <div key={k} className="flex items-center gap-2.5 py-2.5"
            style={{ borderBottom: k < 3 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
            <span className="w-6 text-center shrink-0">{i}</span>
            <span className="flex-1 min-w-0">
              <b className="block text-[13.5px] text-white font-bold">{t}</b>
              <span className="block text-[11px] text-gray-500 leading-relaxed">{s}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4 mt-3"
        style={{ border: '1px solid rgba(197,160,89,.28)', background: 'rgba(197,160,89,.05)' }}>
        <p className="text-[13px] text-gray-300 leading-[1.9]">
          لديك <b className="text-white">٣٠ يوماً</b> لتغيير رأيك. خلالها يختفي حسابُك من كلّ الشاشات،
          وتكفي عودتُك لتستعيده. وبعدها تُمحى بياناتُك الشخصيّة ولا رجوع.
        </p>
      </div>

      {chips > 0 && (
        <button onClick={() => setAck(v => !v)}
          className="w-full flex gap-2.5 items-start text-right rounded-2xl px-3 py-3 mt-3"
          style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
          <span className="w-[19px] h-[19px] rounded-md flex items-center justify-center text-[12px] shrink-0 mt-0.5"
            style={{ border: `1.5px solid ${ack ? '#C5A059' : '#474139'}`, background: ack ? '#C5A059' : 'transparent', color: '#100D08' }}>
            {ack ? '✓' : ''}
          </span>
          <span className="text-[13px] text-gray-300 leading-[1.7]">
            أقرّ بأنّ لديّ رصيداً قائماً ({ar(chips)} رقاقة) وأتنازل عنه، أو سأتواصل مع النادي لتسويته قبل انتهاء المهلة.
          </span>
        </button>
      )}

      <div className="mt-3">
        <p className="text-[12px] text-gray-500 mb-2">اكتب <b className="text-white">حذف</b> للتأكيد:</p>
        <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-[15px] text-white outline-none text-center"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }} />
      </div>

      {err && (
        <p className="text-[13px] leading-relaxed px-3 py-2 rounded-xl mt-3"
          style={{ color: '#F0A9A4', background: 'rgba(217,58,63,.1)', border: '1px solid rgba(217,58,63,.3)' }}>
          {err}
        </p>
      )}

      <button onClick={submit} disabled={!ready || busy}
        className="w-full rounded-2xl py-3 text-[15px] font-extrabold mt-4"
        style={{
          background: 'rgba(217,58,63,.12)', border: '1px solid rgba(217,58,63,.5)', color: '#F0A9A4',
          opacity: !ready || busy ? 0.45 : 1, cursor: !ready || busy ? 'not-allowed' : 'pointer',
        }}>
        {busy ? '…' : 'احذف حسابي'}
      </button>
      <Link href="/player/privacy"
        className="block w-full text-center rounded-2xl py-3 text-[15px] font-bold mt-2"
        style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#9C958A' }}>
        تراجع
      </Link>
    </div>
  );
}
