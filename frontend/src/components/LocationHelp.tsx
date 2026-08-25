'use client';

// ══════════════════════════════════════════════════════
// 🔧 استرجاع إذن الموقع بعد الرفض
//
// 🔴 لا يوجد على الويب أيّ سبيلٍ برمجيّ لإعادة سؤال المستخدم بعد رفضه:
//    getCurrentPosition تفشل فوراً برمز 1 بلا أن تُظهر نافذة. فلا زرّ «اطلب
//    الإذن ثانيةً» ممكنٌ أصلاً — من يَعِد به يَعِد بما لا يملك.
//
//    الممكن شيئان فقط، وهما ما تفعله هذه اللوحة:
//    ١) إرشادٌ **دقيقٌ لمنصّة اللاعب بعينها** — «الإعدادات» وحدها لا تكفي:
//       مسار iOS يختلف عن أندرويد، وتطبيق الشاشة الرئيسية له مدخلٌ ثالث.
//    ٢) زرّ إعادة محاولة يعمل **فور** تصحيحه من الإعدادات، فلا يحتاج إعادة
//       تحميلٍ ولا يبقى شاكّاً هل نجح.
//
// 🔴 وليست حاجبة: اللعبة تعمل بلا موقع، والسياج وحده يتأثّر — ومخرجه أنّ
//    الليدر يضيف اللاعب يدويّاً. الحجب هنا عقوبةٌ على خطأِ لمسة.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { useGeolocation } from '@/hooks/useGeolocation';

const HIDE_KEY = 'mafia_geo_help_hidden';

type Platform = 'ios-pwa' | 'ios-safari' | 'android' | 'desktop';

function detect(): Platform {
  // 🔴 الحارس على window لا navigator: Node 21+ يعرّف globalThis.navigator،
  //    فيمرّ الفحص ثمّ ينفجر window.matchMedia في التصيير المسبق.
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
  const standalone = (window.matchMedia?.('(display-mode: standalone)').matches)
    || (navigator as any).standalone === true;
  if (isIOS) return standalone ? 'ios-pwa' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  'ios-pwa': {
    title: 'على آيفون — تطبيق الشاشة الرئيسية',
    steps: [
      'افتح «الإعدادات» في الآيفون',
      'الخصوصية والأمان ← خدمات الموقع',
      'ابحث عن «نادي المافيا» في القائمة',
      'اختر «أثناء استخدام التطبيق»',
      'ارجع هنا واضغط «أعد المحاولة»',
    ],
  },
  'ios-safari': {
    title: 'على آيفون — متصفّح Safari',
    steps: [
      'اضغط «أﺍ» في يسار شريط العنوان',
      'اختر «إعدادات الموقع»',
      'الموقع ← «اسأل» أو «السماح»',
      'إن لم تجدها: الإعدادات ← الخصوصية ← خدمات الموقع ← Safari',
      'ارجع هنا واضغط «أعد المحاولة»',
    ],
  },
  android: {
    title: 'على أندرويد — متصفّح كروم',
    steps: [
      'اضغط 🔒 بجوار عنوان الموقع في الأعلى',
      'الأذونات ← الموقع',
      'بدّلها إلى «السماح»',
      'ارجع هنا واضغط «أعد المحاولة»',
    ],
  },
  desktop: {
    title: 'على الحاسوب',
    steps: [
      'اضغط 🔒 يسار عنوان الموقع',
      'الموقع ← السماح',
      'حدّث الصفحة',
    ],
  },
};

export default function LocationHelp() {
  const geo = useGeolocation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [retried, setRetried] = useState<'idle' | 'ok' | 'fail'>('idle');
  const platform = useMemo(detect, []);

  // إخفاءٌ لهذه الجلسة فقط — يعود في الفتحة التالية، فالمشكلة لم تُحلّ بعد
  useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDE_KEY) === '1'); } catch { /* تصفّح خاصّ */ }
  }, []);

  const blocked = geo.permission === 'denied';
  if (!blocked || hidden) return null;

  const retry = async () => {
    setRetried('idle');
    const f = await geo.read();
    setRetried(f ? 'ok' : 'fail');
    if (f) setTimeout(() => setOpen(false), 1200);
  };

  const hide = () => {
    try { sessionStorage.setItem(HIDE_KEY, '1'); } catch { /* تصفّح خاصّ */ }
    setHidden(true);
  };

  const guide = STEPS[platform];

  return (
    <>
      {/* شريطٌ فوق شريط التنقّل — لا يغطّيه ولا يحجب اللعب */}
      <div className="fixed left-0 right-0 z-[95] px-3"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }} dir="rtl">
        <div className="max-w-lg mx-auto rounded-2xl border px-3 py-2.5 flex items-center gap-2.5 backdrop-blur"
          style={{ background: 'rgba(28,14,14,0.96)', borderColor: 'rgba(239,68,68,0.4)' }}>
          <span className="text-base shrink-0">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold" style={{ color: '#fca5a5' }}>إذن الموقع مرفوض</p>
            <p className="text-[10.5px] leading-snug" style={{ color: '#b09090' }}>
              لن تستطيع دخول الغرفة ولا الطلب من المنيو
            </p>
          </div>
          <button onClick={() => setOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-xl text-[11.5px] font-black text-white"
            style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)' }}>
            كيف أُصلحها؟
          </button>
          <button onClick={hide} aria-label="إخفاء"
            className="shrink-0 w-6 h-6 rounded-full text-[11px]"
            style={{ color: '#8a6a6a' }}>✕</button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          dir="rtl" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden border"
            style={{ background: '#0b0f0d', borderColor: 'rgba(239,68,68,0.3)' }}
            onClick={e => e.stopPropagation()}>

            <div className="px-5 pt-6 pb-3 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center text-2xl mb-3"
                style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.3)' }}>🔧</div>
              <h2 className="text-white text-base font-black mb-1.5">أعِد تفعيل إذن الموقع</h2>
              <p className="text-[12px] leading-relaxed" style={{ color: '#9fb3a8' }}>
                المتصفّح لا يسمح لنا بسؤالك مرّةً ثانية بعد الرفض — تُفعَّل من إعداداته أنت.
              </p>
            </div>

            <div className="px-5 pb-3">
              <p className="text-[11px] font-bold mb-2" style={{ color: '#6ee7b7' }}>{guide.title}</p>
              <ol className="space-y-1.5">
                {guide.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5 text-[12px] rounded-xl px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.03)', color: '#c8d6ce' }}>
                    <span className="shrink-0 w-5 h-5 rounded-md grid place-items-center text-[10px] font-mono"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>{i + 1}</span>
                    <span className="leading-snug">{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            {retried === 'fail' && (
              <p className="px-5 pb-2 text-[11.5px] text-center" style={{ color: '#fca5a5' }}>
                ما زال مرفوضاً — تأكّد من إتمام الخطوات، وبعضها يحتاج إغلاق التطبيق وفتحه.
              </p>
            )}
            {retried === 'ok' && (
              <p className="px-5 pb-2 text-[11.5px] text-center" style={{ color: '#6ee7b7' }}>
                ✓ تمّ — موقعك يعمل الآن
              </p>
            )}

            <div className="px-5 pb-5 pt-1 space-y-2">
              <button onClick={retry} disabled={geo.busy}
                className="w-full py-3 rounded-xl text-[14px] font-black text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                {geo.busy ? 'يتحقّق…' : 'أعد المحاولة'}
              </button>
              <p className="text-[10.5px] text-center leading-relaxed" style={{ color: '#6b7d74' }}>
                لا وقت لديك؟ اطلب من موجّه اللعبة إضافتك يدويّاً — يستطيع ذلك دائماً.
              </p>
              <button onClick={() => setOpen(false)} className="w-full py-2 text-[12px]" style={{ color: '#6b7d74' }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
