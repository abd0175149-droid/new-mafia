'use client';

// ══════════════════════════════════════════════════════
// 💬 مجموعاتُ الواتساب — منطقةٌ وجنسٌ ورابط
//
// 🔴 المنطقةُ نقطةٌ ونصفُ قطر لا اسمُ مدينة: حدودُ المدن الإداريّة متداخلة
//    ولا يعرفها الجهاز. والمالكُ يلصق إحداثيّاتٍ من خرائط جوجل أو يكتبها.
//
// 🔴 والمعاينةُ جزءٌ من الصفحة لا زينة: الدوائرُ تتداخل وقاعدةُ «الأخصُّ
//    يفوز» ليست بديهيّة — فيُجرَّب موقعٌ وجنسٌ ويُرى الجوابُ قبل الاعتماد.
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { swalConfirm } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...opts?.headers },
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || b?.success === false) throw new Error(b?.error || `خطأ ${res.status}`);
  return b;
}

const ar = (n: any) => String(n ?? '').replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
const GENDER_AR: Record<string, string> = { ANY: 'الجميع', MALE: 'ذكور', FEMALE: 'إناث' };

interface Grp {
  id?: number; name: string;
  latitude: number | null; longitude: number | null; radiusKm: number | null;
  gender: 'ANY' | 'MALE' | 'FEMALE'; url: string;
  isDefault: boolean; isActive: boolean;
}

const BLANK: Grp = {
  name: '', latitude: null, longitude: null, radiusKm: 20,
  gender: 'ANY', url: '', isDefault: false, isActive: true,
};

export default function WaGroupsPage() {
  const [groups, setGroups] = useState<Grp[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Grp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  // معاينة
  const [pv, setPv] = useState({ latitude: '', longitude: '', gender: 'MALE' });
  const [pvResult, setPvResult] = useState<any>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    try { setGroups((await api('/api/wa-groups')).groups || []); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true); setErr('');
    try {
      const body = JSON.stringify(edit);
      if (edit.id) await api(`/api/wa-groups/${edit.id}`, { method: 'PUT', body });
      else await api('/api/wa-groups', { method: 'POST', body });
      setEdit(null); await load(); say('حُفظت');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const del = async (g: Grp) => {
    if (!(await swalConfirm(`حذفُ «${g.name}»؟`))) return;
    try { await api(`/api/wa-groups/${g.id}`, { method: 'DELETE' }); await load(); say('حُذفت'); }
    catch (e: any) { say(e.message); }
  };

  const preview = async () => {
    setPvResult(null);
    try {
      setPvResult(await api('/api/wa-groups/preview', {
        method: 'POST',
        body: JSON.stringify({
          latitude: Number(pv.latitude), longitude: Number(pv.longitude), gender: pv.gender,
        }),
      }));
    } catch (e: any) { say(e.message); }
  };

  /** يلتقط الإحداثيّات من رابط خرائط جوجل الملصوق */
  const pasteCoords = (text: string, onGot: (la: number, ln: number) => void) => {
    // 🔴 يقبل «@31.95,35.91» من الرابط و«31.95, 35.91» المنسوخة من البطاقة:
    //    الأولى ما يُنسخ من شريط العنوان، والثانية ما يُنسخ من «نسخ الإحداثيّات».
    const m = /(-?\d{1,3}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/.exec(text);
    if (m) onGot(Number(m[1]), Number(m[2]));
  };

  if (loading) return <div className="p-8 text-center text-gray-500" dir="rtl">جارٍ التحميل…</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-20" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-white">مجموعات الواتساب</h1>
        <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
          زرُّ «مجموعة الواتساب» في تطبيق اللاعب يفتح المجموعةَ التي تطابق موقعَه وجنسَه.
          والمنطقةُ دائرةٌ حول نقطة — <b className="text-gray-400">الأصغرُ نصفَ قطرٍ يفوز</b> عند التداخل،
          ومجموعةُ الجنس المحدَّد تسبق «الجميع».
        </p>
      </div>

      {err && <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-4 py-2.5 text-[13px]">{err}</div>}

      {/* ═══ القائمة ═══ */}
      <div className="space-y-2">
        {groups.map(g => (
          <div key={g.id} className={`border rounded-2xl p-4 ${g.isActive ? 'bg-gray-800/50 border-gray-700/40' : 'bg-gray-900/40 border-gray-800 opacity-60'}`}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-white text-[15px]">{g.name}</b>
                  {g.isDefault && <Tag tone="amber">افتراضيّة</Tag>}
                  <Tag tone={g.gender === 'FEMALE' ? 'pink' : g.gender === 'MALE' ? 'blue' : 'gray'}>{GENDER_AR[g.gender]}</Tag>
                  {!g.isActive && <Tag tone="gray">معطَّلة</Tag>}
                </div>
                <p className="text-[11.5px] text-gray-500 mt-1" dir="ltr">
                  {g.isDefault
                    ? 'تُستعمل لمن لا تطابقه دائرة'
                    : `${g.latitude?.toFixed(4)}, ${g.longitude?.toFixed(4)} · ${ar(g.radiusKm)} كم`}
                </p>
                <a href={g.url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-emerald-400/70 hover:text-emerald-400 break-all block mt-1">{g.url}</a>
              </div>
              <div className="flex gap-2 shrink-0">
                <Btn onClick={() => { setEdit({ ...g }); setErr(''); }}>تعديل</Btn>
                {!g.isDefault && <Btn tone="rose" onClick={() => del(g)}>حذف</Btn>}
              </div>
            </div>
          </div>
        ))}
        <button onClick={() => { setEdit({ ...BLANK }); setErr(''); }}
          className="w-full border border-dashed border-gray-700 rounded-2xl py-3 text-[13px] text-gray-500 hover:text-amber-400 hover:border-amber-500/40 transition">
          + مجموعة جديدة
        </button>
      </div>

      {/* ═══ المعاينة ═══ */}
      <div className="bg-gray-800/40 border border-gray-700/40 rounded-2xl p-4">
        <p className="text-[10.5px] tracking-wider text-amber-500/80 font-bold mb-1">معاينة</p>
        <p className="text-[12px] text-gray-500 mb-3">أيَّ مجموعةٍ يفتح لاعبٌ في هذا الموقع؟</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <In placeholder="خط العرض" value={pv.latitude}
            onChange={v => setPv(s => ({ ...s, latitude: v }))}
            onPaste={t => pasteCoords(t, (la, ln) => setPv(s => ({ ...s, latitude: String(la), longitude: String(ln) })))} />
          <In placeholder="خط الطول" value={pv.longitude}
            onChange={v => setPv(s => ({ ...s, longitude: v }))}
            onPaste={t => pasteCoords(t, (la, ln) => setPv(s => ({ ...s, latitude: String(la), longitude: String(ln) })))} />
          <select value={pv.gender} onChange={e => setPv(s => ({ ...s, gender: e.target.value }))}
            className="bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white outline-none">
            <option value="MALE">ذكر</option><option value="FEMALE">أنثى</option>
          </select>
          <Btn onClick={preview}>جرّب</Btn>
        </div>
        {pvResult && (
          <div className="mt-3 bg-gray-900/60 rounded-xl px-4 py-3 text-[13px]">
            <b className="text-emerald-400">{pvResult.groupName || 'الاحتياطيّ الصلب'}</b>
            <span className="text-gray-600 text-[11px] block mt-0.5 break-all" dir="ltr">{pvResult.url}</span>
          </div>
        )}
      </div>

      {/* ═══ المحرّر ═══ */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !busy && setEdit(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-white">{edit.id ? 'تعديل مجموعة' : 'مجموعة جديدة'}</h2>

            <Field label="الاسم">
              <In value={edit.name} onChange={v => setEdit(s => s && ({ ...s, name: v }))} placeholder="مثلاً: الزرقاء — ذكور" />
            </Field>

            <Field label="رابط الدعوة">
              <In value={edit.url} onChange={v => setEdit(s => s && ({ ...s, url: v }))}
                placeholder="https://chat.whatsapp.com/…" dir="ltr" />
            </Field>

            <Field label="لمن">
              <div className="flex gap-2">
                {(['ANY', 'MALE', 'FEMALE'] as const).map(g => (
                  <button key={g} onClick={() => setEdit(s => s && ({ ...s, gender: g }))}
                    className={`flex-1 py-2 rounded-lg text-[12.5px] font-bold border transition ${edit.gender === g ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                    {GENDER_AR[g]}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2.5 text-[13px] text-gray-300 cursor-pointer py-1">
              <input type="checkbox" checked={edit.isDefault}
                onChange={e => setEdit(s => s && ({ ...s, isDefault: e.target.checked }))}
                className="w-4 h-4 accent-amber-500" />
              المجموعةُ الافتراضيّة — لمن لا تطابقه دائرة
            </label>

            {/* 🔴 الافتراضيّةُ بلا منطقة: هي ما يُستعمل حين لا تطابق دائرةٌ، فمنطقتُها لا معنى لها */}
            {!edit.isDefault && (
              <Field label="المنطقة — الصق رابطَ خرائط جوجل أو الإحداثيّات">
                <div className="grid grid-cols-3 gap-2">
                  <In placeholder="خط العرض" value={edit.latitude ?? ''} dir="ltr"
                    onChange={v => setEdit(s => s && ({ ...s, latitude: v === '' ? null : Number(v) }))}
                    onPaste={t => pasteCoords(t, (la, ln) => setEdit(s => s && ({ ...s, latitude: la, longitude: ln })))} />
                  <In placeholder="خط الطول" value={edit.longitude ?? ''} dir="ltr"
                    onChange={v => setEdit(s => s && ({ ...s, longitude: v === '' ? null : Number(v) }))}
                    onPaste={t => pasteCoords(t, (la, ln) => setEdit(s => s && ({ ...s, latitude: la, longitude: ln })))} />
                  <In placeholder="كم" value={edit.radiusKm ?? ''} dir="ltr"
                    onChange={v => setEdit(s => s && ({ ...s, radiusKm: v === '' ? null : Number(v) }))} />
                </div>
                {edit.latitude != null && edit.longitude != null && (
                  <a href={`https://www.google.com/maps?q=${edit.latitude},${edit.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-blue-400 hover:underline mt-1.5 inline-block">
                    افتح على الخريطة للتأكّد ↗
                  </a>
                )}
              </Field>
            )}

            <label className="flex items-center gap-2.5 text-[13px] text-gray-300 cursor-pointer py-1">
              <input type="checkbox" checked={edit.isActive}
                onChange={e => setEdit(s => s && ({ ...s, isActive: e.target.checked }))}
                className="w-4 h-4 accent-emerald-500" />
              مفعَّلة
            </label>

            {err && <p className="text-rose-400 text-[12.5px]">{err}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={busy}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold rounded-lg py-2.5 text-[13.5px] transition">
                {busy ? '…' : 'حفظ'}
              </button>
              <button onClick={() => setEdit(null)} disabled={busy}
                className="px-5 border border-gray-700 text-gray-400 rounded-lg py-2.5 text-[13.5px] hover:bg-gray-800 transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-1/2 translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-xl text-[13px] font-bold z-50 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── عناصرُ مساعدة ──
const Tag = ({ tone, children }: any) => {
  const c = { amber: 'bg-amber-500/15 text-amber-300', pink: 'bg-pink-500/15 text-pink-300',
    blue: 'bg-blue-500/15 text-blue-300', gray: 'bg-gray-600/25 text-gray-400' }[tone as string];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c}`}>{children}</span>;
};
const Btn = ({ onClick, tone, children }: any) => (
  <button onClick={onClick}
    className={`text-[12px] px-3.5 py-2 rounded-lg border transition ${tone === 'rose'
      ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
      : 'border-gray-600/40 text-gray-300 hover:bg-gray-700/40'}`}>{children}</button>
);
const Field = ({ label, children }: any) => (
  <div><p className="text-[11px] text-gray-500 mb-1.5">{label}</p>{children}</div>
);
const In = ({ value, onChange, onPaste, ...rest }: {
  value: any;
  onChange: (v: string) => void;
  onPaste?: (t: string) => void;
  [k: string]: any;
}) => (
  <input
    value={value} onChange={e => onChange(e.target.value)}
    onPaste={onPaste ? e => {
      const t = e.clipboardData.getData('text');
      if (/\d\.\d{3,}/.test(t)) { e.preventDefault(); onPaste(t); }
    } : undefined}
    className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-amber-500/50"
    {...rest}
  />
);
