'use client';

import React, { useEffect, useMemo, useState } from 'react';
import FxEditor from '@/components/effects/FxEditor';
import TitleEditor from '@/components/effects/TitleEditor';
import NameFxEditor from '@/components/effects/NameFxEditor';
import ElimEditor from '@/components/effects/ElimEditor';
import EntranceEditor from '@/components/effects/EntranceEditor';
import DynamicMafiaCard from '@/components/DynamicMafiaCard';
import { TITLE_PLAQUE_DEFAULTS } from '@/components/TitlePlaque';

// ══════════════════════════════════════════════════════
// ✏️ تعديل تصميم عنصر قائم
//
// ⚠️ الفجوة التي يغلقها: الكتالوج كان يحرّر السعر والمدّة والإظهار فقط —
//    **تصميم عنصر موجود لا يمكن تغييره إطلاقاً**. عنصر خرج بلون خاطئ
//    كان يُغلق ويُعاد إنشاؤه، فيخسر مشتروه ما دفعوا.
//
// 🔁 نفس المحرّرات التي يستعملها الإنشاء، بلا نسخة ثانية — فلا يفترق
//    ما يراه المؤلّف عند الإضافة عمّا يراه عند التعديل.
// ══════════════════════════════════════════════════════

const KIND_LABEL: Record<string, string> = {
  frame: '🃏 إطار', title: '🏷️ لقب', name_fx: '✨ تأثير اسم', entrance: '🚪 تشريفة',
  elimination: '🔥 إقصاء', victory_sting: '🔊 نغمة نصر', xp_boost: '⚡ معزّز',
};

export default function EditDesignModal({ item, onClose, onSaved, apiPut, toast }: {
  item: any;
  onClose: () => void;
  onSaved: () => void;
  apiPut: (path: string, body: any) => Promise<any>;
  toast: (k: 'ok' | 'err', t: string) => void;
}) {
  const [cfg, setCfg] = useState<any>(item?.config || {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setCfg(item?.config || {}); }, [item?.id]);

  const kind = item?.kind;

  // معاينة على البطاقة الحقيقية — نفس مُصيّر القاعة
  const previewCosmetics = useMemo(() => {
    if (kind === 'frame') return { frame: { config: cfg, emblemId: item?.emblemId || null } };
    if (kind === 'title') return { title: { config: cfg } };
    if (kind === 'name_fx') return { nameFx: { config: cfg } };
    return null;
  }, [kind, cfg, item?.emblemId]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await apiPut(`/api/chips/items/${item.id}`, { config: cfg });
      toast('ok', '✅ حُفظ التصميم — يسري فوراً على من يملك العنصر');
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.body?.field ? `${e.message} (${e.body.field})` : e.message || 'تعذّر الحفظ');
    } finally { setBusy(false); }
  };

  const editor = (() => {
    switch (kind) {
      case 'frame': return <FxEditor value={cfg} onChange={setCfg} />;
      case 'title':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">نصّ اللقب</label>
              <input value={cfg?.text || ''} onChange={e => setCfg({ ...cfg, text: e.target.value })}
                className="w-full bg-gray-900/70 border border-gray-700/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">النمط</label>
              <div className="flex flex-wrap gap-2">
                {['gold', 'blood', 'ghost', 'custom'].map(st => (
                  <button key={st} type="button"
                    onClick={() => setCfg({
                      ...cfg, style: st,
                      ...(st === 'custom' ? { plaque: cfg?.plaque || TITLE_PLAQUE_DEFAULTS } : {}),
                    })}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${
                      (cfg?.style || 'gold') === st ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-gray-900/50 border-gray-700/40 text-gray-400'
                    }`}>
                    {st === 'custom' ? '✨ مخصّص' : st === 'gold' ? 'ذهبي' : st === 'blood' ? 'دموي' : 'شبحي'}
                  </button>
                ))}
              </div>
            </div>
            {cfg?.style === 'custom' && (
              <TitleEditor value={cfg?.plaque} onChange={p => setCfg({ ...cfg, plaque: p })} />
            )}
          </div>
        );
      case 'name_fx':
        return (
          <NameFxEditor value={cfg?.nameEffect} onChange={ne => setCfg({ nameEffect: ne })} />
        );
      case 'elimination': return <ElimEditor value={cfg} onChange={setCfg} />;
      case 'entrance':
        return (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500">
              التصميم الحالي: <b className="text-gray-300">{cfg?.design || 'don'}</b>
            </p>
            {cfg?.design === 'custom' ? (
              <EntranceEditor value={cfg?.elements} onChange={els => setCfg({ ...cfg, elements: els })} />
            ) : (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-3 text-[11px] text-amber-300/90 leading-relaxed">
                هذه تشريفة جاهزة — شكلها مثبَّت ولا يُعدَّل، وهذا مقصود: من اشتراها يجب أن يراها كما اشتراها.
                <br />لتشريفة قابلة للتصميم، أنشئ عنصراً جديداً واختر «تصميم حرّ».
              </div>
            )}
          </div>
        );
      default:
        return (
          <p className="text-[11px] text-gray-500">
            هذا النوع ({KIND_LABEL[kind] || kind}) لا يحمل تصميماً بصرياً قابلاً للتعديل هنا.
          </p>
        );
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-5 w-full max-w-3xl my-8"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black text-white">✏️ تعديل تصميم «{item?.nameAr}»</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 px-2">✕</button>
        </div>
        <p className="text-[11px] text-gray-500 mb-4">{KIND_LABEL[kind] || kind}</p>

        {/* ⚠️ التحذير الذي يجب أن يقرأه المؤلّف قبل أن يضغط حفظ */}
        <div className="mb-4 text-[11px] text-rose-300 bg-rose-900/20 border border-rose-700/40 rounded-lg px-3 py-2.5 leading-relaxed">
          ⚠️ التعديل يسري <b>فوراً</b> على كل من يملك هذا العنصر الآن — الإعداد يُقرأ من الصفّ الحيّ.
          لا تعدّله أثناء لعبة جارية: من دفع ثمن شكلٍ بعينه سيراه يتغيّر أمام القاعة في منتصف المباراة.
          <br />لتغيير جذري، الأنظف إغلاق العنصر وإنشاء غيره.
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
          <div className="min-w-0">{editor}</div>

          {previewCosmetics && (
            <div className="lg:sticky lg:top-4 self-start">
              <p className="text-[11px] text-gray-500 mb-2">المعاينة على البطاقة الحقيقية</p>
              <DynamicMafiaCard
                playerNumber={7}
                playerName="محمّد"
                role={null}
                isFlipped={false}
                flippable={false}
                isAlive
                size="md"
                rankTier="INFORMANT"
                cosmetics={previewCosmetics as any}
              />
            </div>
          )}
        </div>

        {err && (
          <div className="mt-4 text-xs text-rose-300 bg-rose-900/25 border border-rose-700/40 rounded-lg px-3 py-2">{err}</div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 text-black transition-all disabled:opacity-40">
            {busy ? '…' : 'حفظ التصميم'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gray-800 border border-gray-700/40 text-gray-400 hover:text-gray-200 transition-all">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
