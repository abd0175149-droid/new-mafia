'use client';

// ══════════════════════════════════════════════════════
// 📖 محرّر محتوى الدور — ما يقرأه اللاعب في «الأدوار» و«مهامّي»
//
// 🔴 القيودُ المولَّدة تُعرض ولا تُحرَّر: تأتي من حقول القدرة عبر الخادم نفسِه
//    الذي سيولّدها للاعب. حسابُها هنا يعني منطقين يفترقان — فيرى الأدمنُ قيداً
//    ويرى اللاعبُ غيرَه. وعرضُها ضرورةٌ لا زينة: من لا يراها يكرّرها بيده.
//
// 🔴 و«لك دور» وسمٌ مستقلٌّ عن وجود النصّ: للطبيب نصٌّ في النقاش وليس له فيه
//    فعل. الوسمُ الكاذب أسوأ من غيابه — لاعبٌ ينتظر دوراً لا يجيء.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { gcFetch } from './helpers';

export const PHASES = [
  { k: 'night', ar: 'الليل', ic: '🌙' },
  { k: 'discussion', ar: 'النقاش', ic: '💬' },
  { k: 'voting', ar: 'التصويت', ic: '🗳️' },
  { k: 'justification', ar: 'التبرير', ic: '⚖️' },
  { k: 'dead', ar: 'إن مِتّ', ic: '☠️' },
] as const;

export interface RoleContent {
  oneLiner?: string | null;
  howItWorks?: string | null;
  tips?: string[] | null;
  extraLimits?: string[] | null;
  interactsWith?: string[] | null;
  phaseNotes?: Record<string, string> | null;
  actsInPhases?: string[] | null;
}

const box = 'w-full px-3 py-2 bg-gray-800/80 border border-gray-700/50 rounded-lg text-white text-sm focus:border-amber-500/50 focus:outline-none';

/** محرّرُ قائمةِ نصوصٍ — سطرٌ لكلّ عنصر، والفارغُ يسقط عند الحفظ. */
function ListEditor({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <textarea
        rows={Math.min(6, Math.max(2, value.length + 1))}
        value={value.join('\n')}
        onChange={e => onChange(e.target.value.split('\n'))}
        placeholder={hint}
        className={`${box} resize-none leading-relaxed`}
      />
      <span className="text-[10px] text-gray-600 mt-1 block">سطرٌ لكلّ عنصر</span>
    </div>
  );
}

export default function RoleContentEditor({ value, abilities, onChange }: {
  value: RoleContent;
  /** معرّفات القدرات المختارة الآن في المحرّر — تتغيّر المعاينةُ معها فوراً. */
  abilities: string[];
  onChange: (patch: Partial<RoleContent>) => void;
}) {
  const [auto, setAuto] = useState<{ text: string; auto: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const extra = value.extraLimits || [];
  const acts = value.actsInPhases || [];
  const notes = value.phaseNotes || {};

  const abilKey = abilities.join(',');
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const d = await gcFetch('/preview-limits', {
        method: 'POST',
        body: JSON.stringify({ abilities, extraLimits: [] }),
      });
      setAuto(Array.isArray(d?.data) ? d.data : []);
    } catch { setAuto([]); }
    finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abilKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const togglePhase = (k: string) =>
    onChange({ actsInPhases: acts.includes(k) ? acts.filter(x => x !== k) : [...acts, k] });

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 space-y-3">
      <label className="text-xs text-indigo-300 font-bold block">📖 محتوى الشرح للاعب</label>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">سطرٌ واحد <span className="text-gray-600">(يظهر تحت اسم الدور)</span></label>
        <input value={value.oneLiner || ''} maxLength={160}
          onChange={e => onChange({ oneLiner: e.target.value })}
          placeholder="مثلاً: تختار مَن يُغتال كلَّ ليلة."
          className={box} />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">كيف يعمل</label>
        <textarea value={value.howItWorks || ''} rows={3}
          onChange={e => onChange({ howItWorks: e.target.value })}
          placeholder="فقرةٌ تشرح آليّة الدور بلغةِ اللاعب."
          className={`${box} resize-none leading-relaxed`} />
      </div>

      {/* القيودُ المولَّدة — تُعرض ولا تُحرَّر */}
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-bold text-emerald-400">قيودٌ مولَّدة من القدرات</span>
          <span className="text-[10px] text-gray-600">لا تُكتب — تتبع البيانات</span>
          <button type="button" onClick={refresh}
            className="mr-auto text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white">
            {busy ? '…' : '↻'}
          </button>
        </div>
        {auto.length ? (
          <ul className="space-y-0.5">
            {auto.map((l, i) => (
              <li key={i} className="text-[11.5px] text-gray-400 flex gap-1.5">
                <span className="text-emerald-500/70">—</span><span>{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-gray-600">لا قدراتٍ مختارة — لا قيودَ مولَّدة. اكتبْ ما يلزم في الحقل التالي.</p>
        )}
      </div>

      <ListEditor label="قيودٌ إضافيّة" hint="ما لا تعرفه حقولُ القدرة — مثل: حمايةُ الطبيب تُبطل ضربتَك"
        value={extra} onChange={v => onChange({ extraLimits: v })} />

      <ListEditor label="يتقاطع مع" hint="مثل: الحرباية أوّلُ مَن يرث اغتيالَك"
        value={value.interactsWith || []} onChange={v => onChange({ interactsWith: v })} />

      <ListEditor label="نصائح" hint="مثل: وزّع الضربات — قتلُ الصامتين نمطٌ يُقرأ"
        value={value.tips || []} onChange={v => onChange({ tips: v })} />

      {/* المراحل */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500 block">المهامُّ في كلّ مرحلة</label>
        {PHASES.map(p => {
          const on = acts.includes(p.k);
          return (
            <div key={p.k} className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">{p.ic}</span>
                <span className="text-xs font-bold text-gray-300">{p.ar}</span>
                <button type="button" onClick={() => togglePhase(p.k)}
                  className={`mr-auto text-[10px] px-2 py-0.5 rounded-md border transition ${
                    on ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                       : 'bg-gray-800/60 text-gray-500 border-gray-700/50'}`}>
                  {on ? '✓ لك دور' : 'بلا دور'}
                </button>
              </div>
              <textarea rows={2} value={notes[p.k] || ''}
                onChange={e => onChange({ phaseNotes: { ...notes, [p.k]: e.target.value } })}
                placeholder={`ماذا يفعل في ${p.ar}؟`}
                className={`${box} resize-none text-[13px] leading-relaxed`} />
            </div>
          );
        })}
        <p className="text-[10px] text-gray-600 leading-relaxed">
          «لك دور» وسمٌ مستقلٌّ عن وجود النصّ: قد يكون للدور نصيحةٌ في مرحلةٍ بلا فعلٍ فيها.
          والمرحلةُ بلا نصٍّ تظهر للاعب بجملةٍ افتراضيّة.
        </p>
      </div>
    </div>
  );
}
