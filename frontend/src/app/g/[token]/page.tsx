'use client';

// ══════════════════════════════════════════════════════
// 👥 دعوةُ مجموعة — عامّةٌ بلا تسجيل دخول (/g/<token>)
//
// صاحبُ مجموعةٍ في عرض حجز سجّل هذا الصديق باسمه ورقمه، فانحجز له مقعد.
// الرمزُ العشوائيّ في الرابط هو الصلاحيّة نفسها — يصل عبر إشعار التطبيق لصاحب
// الرقم وحده. الصفحة لا تكشف رقماً ولا حساباً: الاسم الأوّل لصاحب المجموعة
// والفعاليّة فقط. زرّان: «تمام، جاي» يثبّت · «مش أنا» يحذف الحجز ويُبلغ صاحبها.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Invite = {
  status: 'booked' | 'joined' | 'pending' | 'declined' | 'removed';
  memberName: string; ownerFirstName: string; past: boolean;
  activity: { name: string; when: string; location: string } | null;
};

export default function GroupInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [inv, setInv] = useState<Invite | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'joined' | 'declined' | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/booking-offers/invite/${encodeURIComponent(token)}`)
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'الرابط غير صالح'); return b; })
      .then(b => setInv(b.invite))
      .catch(e => setErr(e.message));
  }, [token]);

  async function act(kind: 'accept' | 'decline') {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_URL}/api/booking-offers/invite/${encodeURIComponent(token)}/${kind}`, { method: 'POST' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'صار خلل — جرّب بعد شوي');
      setDone(kind === 'accept' ? 'joined' : 'declined');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const status = done || inv?.status;
  const owner = inv?.ownerFirstName || 'صاحبك';

  return (
    <div className="min-h-screen bg-[#050505] px-4 py-10 flex items-start justify-center" dir="rtl">
      <div className="w-full max-w-md">
        <p className="text-[12px] font-bold" style={{ color: '#C5A059' }}>مافيا كلوب</p>
        <h1 className="text-[28px] font-bold text-white mt-1 leading-tight" style={{ fontFamily: 'Amiri, serif' }}>
          {inv ? `${owner} ضمّك لمجموعته` : 'دعوة مجموعة'}
        </h1>

        {!inv && !err && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}

        {inv && (
          <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: 'rgba(197,160,89,.28)', background: 'rgba(197,160,89,.05)' }}>
            {inv.activity ? (
              <>
                <div className="text-[13px] text-gray-400">الفعاليّة</div>
                <div className="text-lg font-bold text-white mt-0.5">{inv.activity.name}</div>
                <div className="text-sm text-gray-300 mt-1">🗓️ {inv.activity.when}</div>
                {inv.activity.location && <div className="text-sm text-gray-400 mt-0.5">📍 {inv.activity.location}</div>}
              </>
            ) : <div className="text-sm text-gray-400">الفعاليّة لم تعد متاحة</div>}
            <div className="mt-4 pt-4 text-[13px] text-gray-300 leading-relaxed" style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
              انحجزلك مقعد باسم <b className="text-white">{inv.memberName}</b> ضمن مجموعة {owner}. العرض بيتحسب على الحضور الفعليّ عند الباب.
            </div>
          </div>
        )}

        {inv && !inv.past && status === 'booked' && (
          <div className="mt-5 flex flex-col gap-2.5">
            <button disabled={busy} onClick={() => act('accept')}
              className="w-full py-3 rounded-xl font-bold text-black disabled:opacity-50" style={{ background: '#C5A059' }}>
              تمام، جاي ✓
            </button>
            <button disabled={busy} onClick={() => act('decline')}
              className="w-full py-3 rounded-xl font-bold text-gray-300 border border-gray-700 hover:border-gray-500 disabled:opacity-50">
              مش أنا
            </button>
            <p className="text-[11.5px] text-gray-500 text-center leading-relaxed">«مش أنا» يلغي الحجز اللي باسمك ويبلّغ {owner}.</p>
          </div>
        )}

        {status === 'joined' && (
          <p className="mt-5 text-emerald-300 text-sm font-bold text-center">✓ ثبّتنا إنك جاي مع {owner} — نشوفك هناك 🎭</p>
        )}
        {status === 'declined' && (
          <p className="mt-5 text-gray-300 text-sm text-center">تمام — شلناك من المجموعة، وما في حجز باسمك.</p>
        )}
        {(status === 'removed') && (
          <p className="mt-5 text-gray-400 text-sm text-center">هالحجز انلغى أو انشال من المجموعة.</p>
        )}
        {status === 'pending' && (
          <p className="mt-5 text-gray-300 text-sm text-center">احجز من التطبيق بنفس رقمك وبترتبط بالمجموعة تلقائيّاً.</p>
        )}
        {inv?.past && status === 'booked' && <p className="mt-5 text-gray-500 text-sm text-center">الفعاليّة انتهت.</p>}
        {err && <p className="mt-5 text-red-400 text-sm text-center">{err}</p>}

        <div className="mt-10 text-center">
          <Link href="/player/home" className="text-[13px] text-amber-400 hover:underline">افتح التطبيق ←</Link>
        </div>
      </div>
    </div>
  );
}
