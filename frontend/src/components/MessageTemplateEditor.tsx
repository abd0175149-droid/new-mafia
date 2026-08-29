'use client';

// ══════════════════════════════════════════════════════
// 💬 محرّر قالب الرسالة — مشترك بين متابعة الحجوزات ومستكشف اللاعبين
// إدراج المتغيّرات يتمّ عند موضع المؤشّر لا في آخر النصّ، والمعاينة حيّة
// كي يرى المستخدِم أثر الأسطر الاختياريّة قبل أن يُرسل لا بعده.
// ══════════════════════════════════════════════════════

import { useRef } from 'react';
import type { TemplateVar } from '@/lib/whatsapp';

interface Props<T> {
  titleAr: string;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  vars: TemplateVar<T>[];
  /** نصّ المعاينة بعد ملء القالب — يُحسب في الصفحة من صفٍّ حقيقيّ */
  preview?: string;
  /** وصف مصدر المعاينة، مثل «معاينة على: أحمد — سهرة الخميس» */
  previewOfAr?: string;
  /** حقلٌ إضافيّ فوق النصّ (عنوان الإشعار مثلاً) */
  children?: React.ReactNode;
  accent?: 'green' | 'amber';
}

export default function MessageTemplateEditor<T>({
  titleAr, value, onChange, onReset, vars, preview, previewOfAr, children, accent = 'green',
}: Props<T>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const tone = accent === 'amber'
    ? { border: 'border-amber-500/20', text: 'text-amber-400', chip: 'bg-amber-500/10 border-amber-500/25 text-amber-300 hover:bg-amber-500/20', focus: 'focus:border-amber-500/50' }
    : { border: 'border-green-500/20', text: 'text-green-400', chip: 'bg-green-500/10 border-green-500/25 text-green-300 hover:bg-green-500/20', focus: 'focus:border-green-500/50' };

  // الإدراج عند المؤشّر: الإلحاق في الآخر يُفسد أيّ قالبٍ مكتوبٍ مسبقاً
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) { onChange(value + token); return; }
    const a = el.selectionStart ?? value.length, b = el.selectionEnd ?? a;
    onChange(value.slice(0, a) + token + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + token.length;
    });
  };

  const optional = vars.filter((v) => v.optional);

  return (
    <div className={`bg-gray-800/30 border ${tone.border} rounded-2xl p-4 space-y-2.5`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className={`text-sm font-bold ${tone.text}`}>{titleAr}</h3>
        <button type="button" onClick={onReset} className="text-[11px] text-gray-400 hover:text-white">
          استعادة النصّ الافتراضيّ
        </button>
      </div>

      {children}

      <textarea
        ref={ref}
        value={value}
        rows={7}
        onChange={(e) => onChange(e.target.value)}
        dir="rtl"
        className={`w-full bg-gray-900/60 border border-gray-700/50 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none ${tone.focus} leading-relaxed resize-y`}
        placeholder="اكتب نصّ الرسالة… واستخدم المتغيّرات أدناه"
      />

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] text-gray-500 self-center">أدرِج عند المؤشّر:</span>
        {vars.map((v) => (
          <button key={v.token} type="button" onClick={() => insert(v.token)} title={v.token}
            className={`text-[11px] px-2 py-1 rounded-lg border ${tone.chip} ${v.optional ? 'italic' : ''}`}>
            {v.label}{v.optional && <span className="opacity-60 mr-1">◦</span>}
          </button>
        ))}
      </div>

      {optional.length > 0 && (
        <p className="text-[10.5px] text-gray-500 leading-relaxed border-r-2 border-gray-600 pr-2.5">
          المتغيّرات المعلَّمة بـ<span className="opacity-70"> ◦ </span>اختياريّة
          ({optional.map((v) => v.label).join('، ')}):
          إن لم تتوفّر قيمتها <b className="text-gray-400">يسقط سطرها كاملاً</b> بدل أن تظهر لافتةٌ عارية.
        </p>
      )}

      {preview !== undefined && (
        <div>
          <p className="text-[11px] text-gray-500 mb-1.5">
            👁️ معاينة{previewOfAr ? <span className="text-gray-600"> — {previewOfAr}</span> : null}
          </p>
          <pre className="bg-gray-900/70 border border-gray-700/40 rounded-xl px-3.5 py-3 text-[12.5px]
                          text-gray-200 whitespace-pre-wrap font-sans leading-relaxed m-0" dir="rtl">
            {preview || <span className="text-gray-600">— لا شيء —</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
