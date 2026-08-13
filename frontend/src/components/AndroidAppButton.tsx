'use client';

// ══════════════════════════════════════════════════════
// 📱 زرّ تحميل تطبيق أندرويد — يظهر على أجهزة أندرويد وحدها
// ══════════════════════════════════════════════════════
// ثلاثة شروطٍ مجتمعة كي يظهر، وإلّا فلا شيء إطلاقاً:
//   ١. الجهاز أندرويد (لا iOS ولا حاسوب — لا معنى لـAPK عليهما).
//   ٢. لسنا **داخل** التطبيق أصلاً (WebView) — تحميله من داخله عبث.
//   ٣. الحزمة متاحةٌ فعلاً على الخادم (تُسأل نقطةُ المعلومات قبل العرض).
// وهكذا لا يرى أحدٌ زرّاً يقوده إلى ٤٠٤.

import { useEffect, useState } from 'react';

interface ApkInfo { available: boolean; sizeBytes: number; version: string; updatedAt: string | null; url: string; }

/** أندرويد حقيقيّ لا مُحاكى — ونستثني WebView التطبيق نفسه. */
function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return false;
  // داخل تطبيقنا (Flutter WebView) أو أيّ WebView: لا نعرض التحميل
  if (/wv\)|; wv|MafiaClub/i.test(ua)) return false;
  return true;
}

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(0)} م.ب` : `${Math.max(1, Math.round(b / 1024))} ك.ب`);

export default function AndroidAppButton({ className = '' }: { className?: string }) {
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!isAndroidBrowser()) return;
    let cancelled = false;
    fetch('/api/app/android/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.available) setInfo(d); })
      .catch(() => { /* الزرّ إضافةٌ — غيابه لا يُعطّل الدخول */ });
    return () => { cancelled = true; };
  }, []);

  if (!info?.available) return null;

  return (
    <div className={`w-full ${className}`} dir="rtl">
      <a
        href={info.url}
        download
        onClick={() => setShowHelp(true)}
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-colors"
        style={{ background: 'rgba(197,160,89,0.10)', border: '1px solid rgba(197,160,89,0.35)', color: '#C5A059' }}
      >
        <span className="text-lg leading-none">📱</span>
        <span>حمّل تطبيق النادي لأندرويد</span>
        <span className="text-[10px] opacity-60 font-normal">
          {info.version ? `v${info.version} · ` : ''}{fmtSize(info.sizeBytes)}
        </span>
      </a>

      {/* أندرويد يمنع تثبيت ما هو خارج المتجر حتى يأذن المستخدم — بلا هذه
          السطور يظنّ اللاعب أن التحميل فشل. تظهر بعد الضغط لا قبله. */}
      {showHelp && (
        <p className="mt-2 text-[11px] leading-relaxed text-center text-gray-500">
          بعد التحميل: افتح الملف من الإشعارات، وإن ظهرت رسالة «تثبيت تطبيقات غير معروفة»
          فاسمح للمتصفّح بذلك ثم أعد الفتح.
        </p>
      )}
    </div>
  );
}
