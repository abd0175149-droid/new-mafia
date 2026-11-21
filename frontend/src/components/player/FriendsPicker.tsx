'use client';

// ══════════════════════════════════════════════════════
// 👥 «مين جاي معك؟» — الحجز للأصحاب من قائمة محفوظة (خطّة التوحيد م٥ب · ق١٥–ق١٨، ق٢٥)
//   مجموعاتي ⟵ أصحابي ⟵ اقتراحاتٌ ممّن لعب معك ⟵ صديقٌ جديد ⟵ مرافقٌ بلا اسم.
//   المعاينة من الخادم: السعر والعرض («اللمة احلا: ٢ بسعر ١») ومن محجوزٌ أصلاً — قبل الضغط.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';

export interface FriendsValue { keys: string[]; newFriends: Array<{ name: string; phone: string }>; companions: number; payer: 'each' | 'owner' }
export const emptyFriends = (): FriendsValue => ({ keys: [], newFriends: [], companions: 0, payer: 'each' });
export const hasFriends = (v: FriendsValue) => v.keys.length > 0 || v.newFriends.length > 0 || v.companions > 0;

const ar = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const chip = (on: boolean) => ({
  background: on ? 'rgba(251,191,36,0.16)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${on ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.1)'}`,
  color: on ? '#fcd34d' : '#d1d5db',
});

export default function FriendsPicker({ activityId, token, value, onChange, groupOffer }: {
  activityId: number; token: string; value: FriendsValue; onChange: (v: FriendsValue) => void;
  groupOffer?: { name: string; rule: string; tag: string } | null;
}) {
  const [data, setData] = useState<{ friends: any[]; suggestions: any[]; groups: any[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [nf, setNf] = useState({ name: '', phone: '' });
  const [preview, setPreview] = useState<any>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!open || data) return;
    fetch('/api/player-app/friends', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setData({ friends: d.friends || [], suggestions: d.suggestions || [], groups: d.groups || [] }))
      .catch(() => setData({ friends: [], suggestions: [], groups: [] }));
  }, [open, data, token]);

  // معاينة السعر والعرض من الخادم (بعد توقّفٍ قصير)
  useEffect(() => {
    if (!hasFriends(value)) { setPreview(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/player-app/book/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ activityId, keys: value.keys, newFriends: value.newFriends, companions: value.companions }) })
        .then((r) => r.json()).then((d) => setPreview(d.success ? d : { error: d.error })).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [value, activityId, token]);

  const all = useMemo(() => [...(data?.friends || []), ...(data?.suggestions || [])], [data]);
  const toggle = (k: string) => onChange({ ...value, keys: value.keys.includes(k) ? value.keys.filter((x) => x !== k) : [...value.keys, k] });
  const pickGroup = (g: any) => onChange({ ...value, keys: Array.from(new Set([...value.keys, ...(g.friendIds || [])])) });
  const addNew = () => {
    const name = nf.name.trim(); const phone = nf.phone.replace(/[^\d+]/g, '');
    if (name.length < 2 || phone.length < 9) return;
    onChange({ ...value, newFriends: [...value.newFriends, { name, phone }] }); setNf({ name: '', phone: '' });
  };
  const count = value.keys.length + value.newFriends.length + value.companions;

  return (
    <div className="mb-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right">
        <span className="text-[13px] font-bold text-gray-100">👥 مين جاي معك؟{count ? <span className="text-amber-400"> · {ar(count)}</span> : null}</span>
        <span className="text-[11px] text-gray-400">{open ? 'إخفاء' : count ? 'تعديل' : 'أضف أصحابك'}</span>
      </button>
      {groupOffer && (
        <p className="px-3 pb-2 text-[11.5px] leading-snug" style={{ color: '#fcd34d' }}>🎁 عرض «{groupOffer.name}»: {groupOffer.rule} — أضف أصحابك لتأخذه</p>
      )}
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <a href="/player/friends" className="block text-[11px] text-amber-400/80">إدارة أصحابي ومجموعاتي ←</a>
          {!data ? <p className="text-[12px] text-gray-500">يُحمَّل…</p> : (
            <>
              {data.groups.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5">مجموعاتي</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.groups.map((g) => <button key={g.id} type="button" onClick={() => pickGroup(g)} className="text-[12px] px-2.5 py-1.5 rounded-full" style={chip(false)}>👥 {g.name}</button>)}
                  </div>
                </div>
              )}
              {all.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-500 mb-1.5">أصحابي ومن لعب معك</p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {all.map((f) => {
                      const on = value.keys.includes(f.key);
                      return (
                        <button key={f.key} type="button" onClick={() => toggle(f.key)} className="text-[12px] px-2.5 py-1.5 rounded-full flex items-center gap-1" style={chip(on)}>
                          {on ? '✓ ' : ''}{f.name}{!f.saved && f.nights ? <span className="opacity-60"> · {ar(f.nights)} ليالي</span> : null}{f.phoneHint ? <span className="opacity-60" dir="ltr"> {f.phoneHint}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {value.newFriends.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {value.newFriends.map((f, i) => (
                    <button key={i} type="button" onClick={() => onChange({ ...value, newFriends: value.newFriends.filter((_, j) => j !== i) })} className="text-[12px] px-2.5 py-1.5 rounded-full" style={chip(true)}>✓ {f.name} ✕</button>
                  ))}
                </div>
              )}
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">صديقٌ جديد</p>
                <div className="flex gap-1.5">
                  <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="الاسم" className="flex-1 min-w-0 rounded-lg px-2.5 py-2 text-[13px] text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} placeholder="07XXXXXXXX" inputMode="tel" dir="ltr" className="w-32 rounded-lg px-2.5 py-2 text-[13px] text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <button type="button" onClick={addNew} className="px-3 rounded-lg text-[13px] font-bold text-black" style={{ background: '#fbbf24' }}>+</button>
                </div>
                <p className="text-[10.5px] text-gray-500 mt-1">يُحفظ في قائمتك وحدك، ولا يُستعمل لأيّ رسالة تسويق. يصله تأكيد «تمام · مش أنا» إن كان له حساب.</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-300">مرافقون بلا اسم <span className="text-gray-500">(يأخذون مقاعدهم برمز انضمام)</span></span>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => onChange({ ...value, companions: Math.max(0, value.companions - 1) })} className="w-7 h-7 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>−</button>
                  <b className="text-amber-400 tabular-nums w-4 text-center">{ar(value.companions)}</b>
                  <button type="button" onClick={() => onChange({ ...value, companions: Math.min(10, value.companions + 1) })} className="w-7 h-7 rounded-full text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>+</button>
                </span>
              </div>
              {count > 0 && (
                <div className="flex gap-1.5">
                  {(['each', 'owner'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => onChange({ ...value, payer: p })} className="flex-1 text-[12px] py-1.5 rounded-lg" style={chip(value.payer === p)}>
                      {p === 'each' ? 'كلّ واحد عن نفسه' : 'أنا بدفع عن الكلّ'}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {preview && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-lg text-[12px]" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
          {preview.error ? <span className="text-rose-300">{preview.error}</span> : (
            <>
              <div className="flex justify-between"><span className="text-gray-300">{ar(preview.people)} أشخاص</span><b className="text-amber-300">{ar(preview.total)} د.أ{preview.offer ? <span className="text-gray-500 line-through font-normal"> {ar(preview.full)}</span> : null}</b></div>
              {preview.offer && <p className="text-emerald-300 mt-1">🎁 عرض «{preview.offer.name}»: {ar(preview.offer.free)} ببلاش — على الحضور الفعليّ عند الباب</p>}
              {!preview.offer && preview.nudge && <p className="text-amber-200/80 mt-1">💡 أضف {ar(preview.nudge.need)} ويصير {ar(preview.nudge.free)} منكم ببلاش (عرض «{preview.nudge.name}»)</p>}
              {preview.nameHint && <p className="text-amber-200/80 mt-1">💡 سمِّ مرافقيك (اسم ورقم) ليأخذوا عرض «{preview.nameHint.name}» — {ar(preview.nameHint.free)} ببلاش</p>}
              {(preview.members || []).filter((m: any) => !m.ok || m.already).map((m: any, i: number) => (
                <p key={i} className="text-gray-400 mt-0.5">• {m.name}: {m.already ? 'محجوزٌ أصلاً — يُربط بحجزك' : m.reason}</p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
