'use client';

// ══════════════════════════════════════════════════════
// 🔑 RoomCodeCard — بطاقة رمز الغرفة القابلة للنسخ
// تُعرض أعلى جسم اللوبي في واجهتَي المضيف واللاعب (الغرفة عن بُعد)
// ══════════════════════════════════════════════════════

import { useState } from 'react';

export default function RoomCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // متصفّح قديم أو سياق غير آمن — fallback عبر textarea مؤقّت
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!code) return null;
  return (
    <button
      onClick={copy}
      className="w-full rounded-xl border border-[#C5A059]/40 bg-[#C5A059]/5 py-3 text-center active:scale-[0.99] transition-transform"
    >
      <span className="block text-[10px] text-[#9a9a9a] mb-0.5">{copied ? '✓ تم النسخ' : 'رمز الغرفة — اضغط للنسخ'}</span>
      <b className="font-mono text-3xl font-black text-[#C5A059] tracking-[0.3em]" dir="ltr">{code}</b>
    </button>
  );
}
