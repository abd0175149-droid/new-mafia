'use client';

// ══════════════════════════════════════════════════════
// 💰 ضبط حصّة النادي على دفعةٍ من الأصناف
// المشكلة التي يحلّها: الحصّة رقمُ عملٍ يُتّفق عليه مع المكان ويتغيّر بالتفاوض.
// ضبطه صنفاً صنفاً على منيو سبعين صنفاً عملٌ يُؤجَّل فلا يُنجَز — فتُشغَّل ليلةٌ
// كاملة بحصّةٍ صفر ويأخذ المكان كلّ شيء. هنا يُضبط لكلّ المنيو أو لقسمٍ بضغطة.
//
// 🔍 المعاينة قبل الحفظ ليست تجميلاً: نسبةٌ ٢٠٪ على منيوٍ فيه صنفٌ بـ٠٫٣٥
// تعطي ٠٫٠٧ — رقمٌ لا معنى له في الجيب. تُرى النتيجة على أرخص صنفٍ وأغلاه
// قبل أن تُكتب.
// ══════════════════════════════════════════════════════

import { useMemo, useState } from 'react';

export interface ShareItem {
  id: number; name: string; price: string; clubShare: string; categoryId: number | null;
}
export interface ShareCat { id: number; name: string; parentId: number | null }

export default function ClubShareModal({
  items, cats, onClose, onApply,
}: {
  items: ShareItem[];
  cats: ShareCat[];
  onClose: () => void;
  onApply: (body: { mode: 'fixed' | 'percent'; value: number; categoryId: number | null }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // القسم الأب يشمل فروعه — وإلّا أصاب اختيار «المأكولات» صفر صنف
  const targets = useMemo(() => {
    if (catId === null) return items;
    const ids = [catId, ...cats.filter(c => c.parentId === catId).map(c => c.id)];
    return items.filter(i => i.categoryId !== null && ids.includes(i.categoryId));
  }, [items, cats, catId]);

  const num = parseFloat(value);
  const valid = Number.isFinite(num) && num >= 0 && (mode === 'fixed' || num <= 100);

  const shareOf = (price: number) => {
    if (!valid) return 0;
    const raw = mode === 'percent' ? (price * num) / 100 : num;
    return Math.min(price, Math.round(raw * 100) / 100);
  };

  // أرخص وأغلى صنفٍ في النطاق — طرفا الأثر
  const sorted = [...targets].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const cheapest = sorted[0], dearest = sorted[sorted.length - 1];
  const totalShare = targets.reduce((s, i) => s + shareOf(parseFloat(i.price)), 0);
  const cappedCount = valid ? targets.filter(i => shareOf(parseFloat(i.price)) >= parseFloat(i.price)).length : 0;

  const currentSet = items.filter(i => parseFloat(i.clubShare || '0') > 0).length;

  const apply = async () => {
    if (!valid || busy || targets.length === 0) return;
    const label = catId === null ? 'كامل المنيو' : cats.find(c => c.id === catId)?.name || 'القسم';
    if (!window.confirm(`ضبط حصّة النادي على ${targets.length} صنفاً في «${label}»؟\n\nستُستبدل الحصّة الحاليّة لكلّ صنفٍ في النطاق.`)) return;
    setBusy(true); setErr('');
    try {
      await onApply({ mode, value: num, categoryId: catId });
      onClose();
    } catch (e: any) { setErr(e.message || 'فشل التطبيق'); setBusy(false); }
  };

  const roots = cats.filter(c => !c.parentId);

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/75 backdrop-blur-sm" onClick={onClose} dir="rtl">
      <div className="w-full max-w-md overflow-y-auto rounded-t-3xl p-5 bg-[#161B18] border border-[#2E3833] border-b-0 text-[#E8EFEA] relative" style={{ height: '90%', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold">💰 حصّة النادي</h3>
          <button onClick={onClose} className="text-[#8B9A92] hover:text-white">✕</button>
        </div>
        <p className="text-[11px] text-[#8B9A92] mb-4">
          مبلغٌ ثابت على كلّ صنفٍ يُقتطع للنادي من سعره. الباقي للمكان.
          {' '}{currentSet} من {items.length} صنفاً عليها حصّةٌ الآن.
        </p>

        {/* ── النطاق ── */}
        <label className="block text-[11px] text-[#8B9A92] mb-1.5">النطاق</label>
        <select
          value={catId ?? ''}
          onChange={e => setCatId(e.target.value === '' ? null : parseInt(e.target.value))}
          className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-[#D98A2B]/50"
        >
          <option value="">كامل المنيو ({items.length} صنفاً)</option>
          {roots.map(r => {
            const kids = cats.filter(c => c.parentId === r.id);
            const n = items.filter(i => i.categoryId === r.id || kids.some(k => k.id === i.categoryId)).length;
            return (
              <optgroup key={r.id} label={r.name}>
                <option value={r.id}>{r.name} — كامل القسم ({n})</option>
                {kids.map(k => (
                  <option key={k.id} value={k.id}>
                    ↳ {k.name} ({items.filter(i => i.categoryId === k.id).length})
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>

        {/* ── الوضع ── */}
        <label className="block text-[11px] text-[#8B9A92] mb-1.5">طريقة الاحتساب</label>
        <div className="flex gap-1 p-1 rounded-lg bg-[#1B211D] border border-[#232B27] mb-3">
          <button onClick={() => setMode('fixed')}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors ${mode === 'fixed' ? 'bg-amber-500/20 text-amber-300' : 'text-[#8B9A92]'}`}>
            مبلغ ثابت (د.أ)
          </button>
          <button onClick={() => setMode('percent')}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors ${mode === 'percent' ? 'bg-amber-500/20 text-amber-300' : 'text-[#8B9A92]'}`}>
            نسبة من السعر (٪)
          </button>
        </div>

        <input
          type="number" step={mode === 'percent' ? '1' : '0.05'} min="0" max={mode === 'percent' ? 100 : undefined}
          value={value} onChange={e => setValue(e.target.value)} autoFocus
          placeholder={mode === 'percent' ? 'مثال: 20' : 'مثال: 0.50'}
          className="w-full bg-[#1B211D] border border-[#232B27] rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-[#D98A2B]/50"
        />

        {/* ── المعاينة ── */}
        {valid && targets.length > 0 && (
          <div className="rounded-xl p-3 mb-3 bg-[#1B211D] border border-[#232B27]">
            <p className="text-[10px] text-[#8B9A92] mb-2">أثرها على {targets.length} صنفاً:</p>
            {[cheapest, dearest].filter((v, i, a) => v && a.indexOf(v) === i).map(it => {
              const p = parseFloat(it!.price), s = shareOf(p);
              return (
                <div key={it!.id} className="flex items-center justify-between text-[11px] py-1">
                  <span className="truncate ml-2">{it!.name}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="text-[#8B9A92]">{p.toFixed(2)}</span>
                    <span className="text-[#5A6862]"> ← </span>
                    <span className="text-amber-400">النادي {s.toFixed(2)}</span>
                    <span className="text-[#5A6862]"> · </span>
                    <span className="text-emerald-400">المكان {(p - s).toFixed(2)}</span>
                  </span>
                </div>
              );
            })}
            <p className="text-[10px] text-[#8B9A92] mt-2 pt-2 border-t border-[#232B27]">
              حصّة النادي على طلبٍ من كلّ صنفٍ مرّة: <span className="text-amber-400 tabular-nums">{totalShare.toFixed(2)} د.أ</span>
            </p>
          </div>
        )}

        {cappedCount > 0 && (
          <p className="text-[11px] rounded-lg px-3 py-2 mb-3 bg-rose-500/10 border border-rose-500/25 text-rose-300">
            ⚠️ {cappedCount} صنفاً سعره أقلّ من هذا المبلغ — ستُقصّ حصّته إلى كامل سعره ولا يبقى للمكان شيء منه.
          </p>
        )}
        {valid && targets.length === 0 && (
          <p className="text-[11px] text-[#8B9A92] mb-3">لا أصناف في هذا النطاق.</p>
        )}
        {err && <p className="text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 mb-3">{err}</p>}

        <div className="flex gap-2">
          <button onClick={apply} disabled={!valid || busy || targets.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-[#D98A2B] to-[#C2751F] disabled:opacity-40">
            {busy ? '… جارٍ التطبيق' : `تطبيق على ${targets.length} صنفاً`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-[#8B9A92]">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
