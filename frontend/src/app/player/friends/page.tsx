'use client';

// ══════════════════════════════════════════════════════
// 👥 «أصحابي» و«مجموعاتي» (خطّة التوحيد م٥ب)
//   القائمة تبدأ ممتلئة باقتراحاتٍ ممّن لعب معك ٣ ليالٍ فأكثر في ٩٠ يوماً، ومن تتابعه، ومن حجزت لهم.
//   أرقام أصحاب الحسابات لا تُعرض — ورقم صديقٍ بلا حساب يبقى في قائمتك وحدك (ق١٦).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayer } from '@/context/PlayerContext';

const ar = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const SRC: Record<string, string> = { coplay: 'لعب معك', follow: 'تتابعه', booked: 'حجزت له', manual: 'أضفته', contact: 'من جهة اتصال' };

export default function FriendsPage() {
  const { player } = usePlayer();
  const [d, setD] = useState<{ friends: any[]; suggestions: any[]; groups: any[] } | null>(null);
  const [nf, setNf] = useState({ name: '', phone: '' });
  const [sel, setSel] = useState<string[]>([]);
  const [gName, setGName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    if (!player) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/player-app${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${player.token}` } });
      const j = await r.json();
      if (!r.ok || !j.success) { setErr(j.error || 'تعذّر'); return; }
      setD({ friends: j.friends || [], suggestions: j.suggestions || [], groups: j.groups || [] });
    } catch { setErr('تعذّر الاتصال'); } finally { setBusy(false); }
  }, [player]);
  useEffect(() => { void call('/friends'); }, [call]);

  if (!player) return <div className="p-6 text-center text-gray-400">سجّل الدخول أوّلاً</div>;
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const nameOf = (k: string) => [...(d?.friends || []), ...(d?.suggestions || [])].find((f) => f.key === k)?.name || '—';

  return (
    <div dir="rtl" className="min-h-screen pb-28 px-4 pt-6 max-w-lg mx-auto text-white">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black">👥 أصحابي</h1>
        <Link href="/player/games" className="text-[12px] text-amber-400">احجز معهم ←</Link>
      </div>
      <p className="text-[12px] text-gray-400 mb-4 leading-relaxed">احجز لأصحابك بلمسة من صفحة الألعاب («مين جاي معك؟»). من له حساب يصله «تمام · مش أنا»، ومن لا حساب له يرتبط تلقائيّاً أوّل ما يحجز برقمه.</p>
      {err && <p className="mb-3 text-[13px] text-rose-300">{err}</p>}
      {!d ? <p className="text-gray-500">يُحمَّل…</p> : (
        <div className="space-y-6">
          <section>
            <h2 className="text-[13px] font-bold text-gray-300 mb-2">أصحابي <span className="text-gray-500">{ar(d.friends.length)}</span></h2>
            {d.friends.length === 0 && <p className="text-[12px] text-gray-500">لا أحد بعد — أضف من الاقتراحات أو برقم.</p>}
            <div className="space-y-1.5">
              {d.friends.map((f) => (
                <div key={f.key} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${sel.includes(f.key) ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                  <button type="button" onClick={() => toggle(f.key)} className="flex-1 text-right text-[14px]">
                    {sel.includes(f.key) ? '✓ ' : ''}{f.name}
                    <span className="text-[11px] text-gray-500"> · {f.hasAccount ? 'له حساب' : 'بلا حساب'}{f.phoneHint ? ` ${f.phoneHint}` : ''} · {SRC[f.source] || f.source}</span>
                  </button>
                  <button type="button" disabled={busy} onClick={() => call(`/friends/${f.id}`, { method: 'DELETE' })} className="text-[11px] text-gray-500 px-2">حذف</button>
                </div>
              ))}
            </div>
          </section>

          {sel.length > 0 && (
            <section className="p-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <p className="text-[12px] text-gray-300 mb-2">احفظ {sel.map(nameOf).join('، ')} كمجموعة</p>
              <div className="flex gap-2">
                <input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="اسم المجموعة (مثلاً: شلّة الأحد)" className="flex-1 rounded-lg px-3 py-2 text-[13px] bg-white/5 border border-white/10" />
                <button type="button" disabled={busy || !gName.trim()} onClick={async () => { await call('/friends/groups', { method: 'POST', body: JSON.stringify({ name: gName, keys: sel }) }); setSel([]); setGName(''); }}
                  className="px-4 rounded-lg font-bold text-black disabled:opacity-40" style={{ background: '#fbbf24' }}>احفظ</button>
              </div>
            </section>
          )}

          {d.groups.length > 0 && (
            <section>
              <h2 className="text-[13px] font-bold text-gray-300 mb-2">مجموعاتي</h2>
              <div className="space-y-1.5">
                {d.groups.map((g) => (
                  <div key={g.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="flex-1 text-[14px]">👥 {g.name} <span className="text-[11px] text-gray-500">· {(g.friendIds || []).map(nameOf).join('، ')}</span></span>
                    <button type="button" disabled={busy} onClick={() => call(`/friends/groups/${g.id}`, { method: 'DELETE' })} className="text-[11px] text-gray-500 px-2">حذف</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-[13px] font-bold text-gray-300 mb-2">أضف برقم</h2>
            <div className="flex gap-2">
              <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="الاسم" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-[13px] bg-white/5 border border-white/10" />
              <input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} placeholder="07XXXXXXXX" dir="ltr" inputMode="tel" className="w-32 rounded-lg px-3 py-2 text-[13px] bg-white/5 border border-white/10" />
              <button type="button" disabled={busy} onClick={async () => { await call('/friends', { method: 'POST', body: JSON.stringify(nf) }); setNf({ name: '', phone: '' }); }}
                className="px-4 rounded-lg font-bold text-black disabled:opacity-40" style={{ background: '#fbbf24' }}>+</button>
            </div>
            <p className="text-[10.5px] text-gray-500 mt-1">الرقم في قائمتك وحدك، لا يُستعمل لأيّ رسالة تسويق، ويخرج منها إن ضغط صاحبه «مش أنا».</p>
          </section>

          {d.suggestions.length > 0 && (
            <section>
              <h2 className="text-[13px] font-bold text-gray-300 mb-2">اقتراحات</h2>
              <div className="flex flex-wrap gap-1.5">
                {d.suggestions.map((f) => (
                  <button key={f.key} type="button" disabled={busy} onClick={() => call('/friends', { method: 'POST', body: JSON.stringify({ playerId: f.playerId, source: f.source }) })}
                    className="text-[12px] px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db' }}>
                    + {f.name}<span className="opacity-60"> · {f.nights ? `${ar(f.nights)} ليالي معك` : SRC[f.source] || ''}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
