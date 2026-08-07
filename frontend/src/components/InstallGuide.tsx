'use client';

// ══════════════════════════════════════════════════════
// 📲 مرشد التثبيت — «أيّ تطبيقٍ ستحصل عليه؟»
// 🔴 القاعدة التي تُربك الجميع: **الصفحة التي تقف عليها لحظة «أضف إلى الشاشة
//    الرئيسيّة» هي التي تحدّد التطبيق**. الجذر يعلن manifest بـstart_url=/player،
//    و/venue وحده يعلن manifest الكونسول. فمن يضيف من صفحة تسجيل الدخول
//    (وهي تحت الجذر) يخرج بأيقونة **تطبيق اللاعب** وإن كان موظّف مكان —
//    والأسوأ أنّ إشعارات iOS مرتبطة بنطاق التطبيق المثبَّت فلا تصله الطلبات.
// هذا المكوّن يظهر على السطح الصحيح فقط، ويقول صراحةً ماذا سيُثبَّت.
// يختفي تماماً حين يكون التطبيق مثبَّتاً (standalone) — لا يزعج من أنجز.
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

type App = 'player' | 'venue';

const COPY: Record<App, { icon: string; title: string; sub: string; key: string; accent: string; bg: string; border: string }> = {
  player: {
    icon: '🎭',
    title: 'ثبّت تطبيق اللاعب',
    sub: 'من هذه الصفحة تحديداً — لتصلك إشعارات الحجوزات وحالة طلبك',
    key: 'install_hint_player',
    accent: '#c4b5fd', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.30)',
  },
  venue: {
    icon: '🔥',
    title: 'ثبّت كونسول المكان',
    sub: 'من هذه الصفحة تحديداً — لتصلك إشعارات الطلبات وتذكير المتأخّر',
    key: 'install_hint_venue',
    accent: '#D98A2B', bg: 'rgba(217,138,43,0.10)', border: 'rgba(217,138,43,0.30)',
  },
};

export default function InstallGuide({ app }: { app: App }) {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const c = COPY[app];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // مثبَّتٌ فعلاً؟ لا شيء يُعرض. (iOS يستعمل navigator.standalone دون غيره)
    const standalone = (window.navigator as any).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
    if (standalone) return;
    if (localStorage.getItem(c.key) === '1') return;
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setShow(true);
  }, [c.key]);

  if (!show) return null;

  const dismiss = () => { localStorage.setItem(c.key, '1'); setShow(false); };

  return (
    <div className="rounded-2xl p-3.5 mb-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{c.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold" style={{ color: c.accent }}>📲 {c.title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{c.sub}</p>

          <div className="mt-2 text-[11px] text-gray-400 leading-relaxed">
            {ios ? (
              <>
                <b style={{ color: c.accent }}>على الآيفون:</b> اضغط زرّ المشاركة{' '}
                <span className="inline-block px-1">􀈂</span> في أسفل سفاري ← «إضافة إلى الشاشة الرئيسيّة»
                ← «إضافة». ثمّ افتح التطبيق <b>من الأيقونة</b> لا من سفاري.
              </>
            ) : (
              <>
                <b style={{ color: c.accent }}>على أندرويد:</b> افتح قائمة المتصفّح (⋮) ← «تثبيت التطبيق»
                أو «إضافة إلى الشاشة الرئيسيّة».
              </>
            )}
          </div>

          <p className="text-[10px] text-gray-500 mt-2 pt-2" style={{ borderTop: `1px solid ${c.border}` }}>
            ⚠️ الأيقونة تُنشأ من <b>الصفحة الحاليّة</b>. إن أضفتها من صفحةٍ أخرى فستفتح واجهةً غير هذه —
            احذفها وأعد الإضافة من هنا.
          </p>
        </div>
        <button onClick={dismiss} className="text-gray-500 hover:text-white shrink-0 text-sm" title="إخفاء">✕</button>
      </div>
    </div>
  );
}
