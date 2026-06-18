'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PlayerProvider, usePlayer } from '@/context/PlayerContext';
import BottomNav from '@/components/BottomNav';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// ── الصفحات التي لا تحتاج تسجيل دخول ──
const PUBLIC_PATHS = ['/player/login', '/player/debug-push'];

// ── iOS Pull-to-Refresh Hook ──
function usePullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const startY = useRef(0);
  const pullDistance = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // ⚠️ تجاهل إذا موديل مفتوح أو الصفحة مجمّدة أو داخل اللعبة
    if (document.body.classList.contains('modal-open')) return;
    if (document.body.classList.contains('in-game')) return;
    if (document.body.style.position === 'fixed') return;
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    // ⚠️ تجاهل إذا موديل مفتوح أو الصفحة مجمّدة أو داخل اللعبة
    if (document.body.classList.contains('modal-open')) return;
    if (document.body.classList.contains('in-game')) return;
    if (document.body.style.position === 'fixed') return;
    if (window.scrollY > 0) return;
    const currentY = e.touches[0].clientY;
    pullDistance.current = currentY - startY.current;
    if (pullDistance.current > 60) {
      setPulling(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // ⚠️ تجاهل إذا موديل مفتوح أو داخل اللعبة
    if (document.body.classList.contains('modal-open') || document.body.classList.contains('in-game')) {
      setPulling(false);
      pullDistance.current = 0;
      return;
    }
    if (pulling && pullDistance.current > 80) {
      window.location.reload();
    }
    setPulling(false);
    pullDistance.current = 0;
  }, [pulling]);

  useEffect(() => {
    // فقط على iOS PWA
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (!isIOS && !isStandalone) return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return pulling;
}

function PlayerLayoutInner({ children }: { children: React.ReactNode }) {
  const { player, isLoading } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();
  const pulling = usePullToRefresh();
  
  // 🔔 استدعاء هوك الإشعارات الفوري
  const { permissionState, needsInstall, requestPermission } = usePushNotifications();
  const [isRequesting, setIsRequesting] = useState(false);

  const isPublic = PUBLIC_PATHS.includes(pathname);
  // صفحة join تحتاج layout مختلف (بدون بار أثناء اللعب)
  const isGamePage = pathname === '/player/join';

  useEffect(() => {
    if (isLoading) return;
    // صفحة اللعبة تدير الجلسة بنفسها — لا نوجّهها أبداً
    if (isGamePage) return;

    if (!player && !isPublic) {
      router.replace('/player/login');
    }

    if (player && isPublic && pathname === '/player/login') {
      router.replace('/player/home');
    }
  }, [player, isLoading, isPublic, isGamePage, router]);

  // ── توجيه دقيق عند فتح التطبيق من إشعار في حالة الفتح البارد ──
  // الـ SW يخزّن وجهة الإشعار في الكاش (لأن iOS قد يفتح start_url متجاهلاً الرابط)،
  // وهنا نستهلكها بعد جاهزية اللاعب ونوجّه إليها عبر راوتر التطبيق بدقّة.
  useEffect(() => {
    if (isLoading || !player) return;
    if (typeof window === 'undefined' || typeof caches === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const cache = await caches.open('mafia-auth');
        const res = await cache.match('/__pending_nav');
        if (!res || cancelled) return;
        const dest = (await res.text()).trim();
        await cache.delete('/__pending_nav');
        if (!dest || cancelled) return;
        const target = new URL(dest, window.location.origin);
        const path = target.pathname + target.search;
        if (path !== window.location.pathname + window.location.search) {
          router.replace(path);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isLoading, player, router]);

  // دالة طلب الإذن الفورية
  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      await requestPermission();
    } catch (err) {
      console.error('Permission request failed:', err);
    } finally {
      setIsRequesting(false);
    }
  };

  // شاشة التحميل (بس مش لصفحة اللعبة — هي تدير حالها)
  if (isLoading && !isGamePage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-amber-500/60 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // صفحات عامة (login) — بدون بار أو قيود إشعارات
  if (isPublic) {
    return <>{children}</>;
  }

  // 🛡️ حجب لوحة اللاعب إذا لم يتم تفعيل الإشعارات (لغير الصفحات العامة)
  // أُعيد تفعيله بعد إصلاح نظام الإشعارات (VAPID الثابت + توحيد مصدر العرض + إعادة التسجيل)
  if (player && !isPublic) {
    // 1. حالة هواتف آيفون (Safari) التي لم تقم بتثبيت التطبيق كـ PWA
    if (needsInstall) {
      return (
        <div className="min-h-screen fixed inset-0 z-[99999] flex items-center justify-center bg-[#050505] p-4 overflow-y-auto" dir="rtl">
          <div className="max-w-md w-full my-8 bg-[#0c0c0c]/90 border border-amber-500/10 backdrop-blur-xl rounded-3xl p-6 md:p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(245,158,11,0.1)] text-center animate-fade-in-up">
            
            {/* أيقونة التطبيق العائمة */}
            <div className="relative w-20 h-20 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse-slow">
              <span className="text-3xl">🕵️‍♂️</span>
              <div className="absolute -inset-2 rounded-3xl border border-amber-500/30 animate-ping opacity-40" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold font-arabic text-amber-500 tracking-wide">خطوة أخيرة للعب! 📱</h1>
              <p className="text-gray-400 text-sm leading-relaxed font-arabic">
                لتلقي إشعارات دورك الفورية واللعب بسلاسة، يجب تثبيت اللعبة على الشاشة الرئيسية لهاتف الآيفون الخاص بك (قيود نظام iOS).
              </p>
            </div>

            {/* خطوات التثبيت البصرية المذهلة */}
            <div className="w-full space-y-4 text-right font-arabic">
              <div className="bg-[#121212]/80 border border-white/5 p-4 rounded-2xl flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold">1</span>
                <div>
                  <h3 className="font-semibold text-white text-sm">اضغط زر المشاركة</h3>
                  <p className="text-gray-400 text-xs mt-1">انقر على أيقونة المشاركة <span className="inline-block p-1 bg-white/10 rounded mx-1 text-sm">📤</span> في شريط Safari السفلي.</p>
                </div>
              </div>

              <div className="bg-[#121212]/80 border border-white/5 p-4 rounded-2xl flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold">2</span>
                <div>
                  <h3 className="font-semibold text-white text-sm">إضافة للشاشة الرئيسية</h3>
                  <p className="text-gray-400 text-xs mt-1">اسحب القائمة للأعلى ثم اختر <span className="text-amber-500 font-semibold">"إضافة إلى الشاشة الرئيسية ➕"</span> (Add to Home Screen).</p>
                </div>
              </div>

              <div className="bg-[#121212]/80 border border-white/5 p-4 rounded-2xl flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold">3</span>
                <div>
                  <h3 className="font-semibold text-white text-sm">افتح التطبيق وابدأ اللعب</h3>
                  <p className="text-gray-400 text-xs mt-1">افتح اللعبة من شاشتك الرئيسية وسجل دخولك لتفعيل الإشعارات فوراً.</p>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 mt-2 font-arabic">
              ⚠️ نظام Apple يمنع تفعيل الإشعارات إلا من خلال التطبيق المضاف للشاشة الرئيسية.
            </div>

            <a href="/player/debug-push" className="text-[10px] text-gray-600 hover:text-amber-500 mt-2 underline font-arabic">🔧 صفحة تشخيص الإشعارات</a>
          </div>
        </div>
      );
    }

    // 2. حالة طلب إذن الإشعارات لأول مرة (Prompt)
    if (permissionState === 'prompt') {
      return (
        <div className="min-h-screen fixed inset-0 z-[99999] flex items-center justify-center bg-[#050505] p-4" dir="rtl">
          <div className="max-w-md w-full bg-[#0c0c0c]/90 border border-amber-500/20 backdrop-blur-xl rounded-3xl p-6 md:p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(245,158,11,0.15)] text-center animate-fade-in-up">
            
            {/* الجرس المشع والمنبض */}
            <div className="relative w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-500 shadow-[inset_0_0_20px_rgba(245,158,11,0.1)]">
              <svg className="w-10 h-10 animate-bounce" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <div className="absolute inset-0 rounded-full border border-amber-500/20 animate-ping opacity-30" />
            </div>

            <div className="space-y-2 font-arabic">
              <h1 className="text-2xl font-bold text-white tracking-wide">تفعيل الإشعارات الفورية 🔔</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                تتطلب لعبة مافيا تفعيل الإشعارات الفورية لتنبيهك بدورك الفوري أثناء اللعب. لن تتمكن من المتابعة بدون تفعيلها لضمان سرعة اللعبة وحماسها للجميع.
              </p>
            </div>

            <button
              onClick={handleRequestPermission}
              disabled={isRequesting}
              className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-black font-bold rounded-2xl transition-all duration-300 transform active:scale-95 shadow-[0_4px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_4px_30px_rgba(245,158,11,0.5)] flex items-center justify-center gap-2 font-arabic disabled:opacity-50"
            >
              {isRequesting ? (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>جاري التفعيل...</span>
                </>
              ) : (
                <>
                  <span>تفعيل الآن وسماح ⚡</span>
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 font-arabic">
              عند الضغط، سيظهر لك طلب المتصفح النظامي، يرجى اختيار <span className="text-amber-500 font-semibold">"سماح" (Allow)</span>.
            </p>

            <a href="/player/debug-push" className="text-[10px] text-gray-600 hover:text-amber-500 mt-1 underline font-arabic">🔧 صفحة تشخيص الإشعارات</a>
          </div>
        </div>
      );
    }

    // 3. حالة تم رفض الإشعارات مسبقاً (Denied)
    if (permissionState === 'denied') {
      return (
        <div className="min-h-screen fixed inset-0 z-[99999] flex items-center justify-center bg-[#050505] p-4" dir="rtl">
          <div className="max-w-md w-full bg-[#0c0c0c]/90 border border-red-500/20 backdrop-blur-xl rounded-3xl p-6 md:p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(239,68,68,0.1)] text-center animate-fade-in-up">
            
            {/* علامة التحذير */}
            <div className="relative w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-500">
              <svg className="w-10 h-10 animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z" />
              </svg>
            </div>

            <div className="space-y-2 font-arabic">
              <h1 className="text-2xl font-bold text-red-500 tracking-wide">الإشعارات محظورة بالخطأ! ⚠️</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                لقد قمت برفض إذن الإشعارات مسبقاً. لا يمكنك اللعب أو تلقي دورك الفوري بدونها. يرجى إعادة تفعيلها باتباع الخطوات التالية:
              </p>
            </div>

            {/* دليل التفعيل اليدوي */}
            <div className="w-full text-right bg-[#121212]/80 border border-white/5 p-5 rounded-2xl space-y-3 text-xs leading-relaxed text-gray-300 font-arabic">
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 font-bold">1</span>
                <span>انقر على رمز القفل <span className="inline-block p-0.5 bg-white/10 rounded">🔒</span> أو الإعدادات في شريط عنوان المتصفح بالأعلى.</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 font-bold">2</span>
                <span>ابحث عن خيار <span className="text-red-500 font-semibold">"الإشعارات"</span> (Notifications).</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 font-bold">3</span>
                <span>قم بتغيير الإذن إلى <span className="text-green-500 font-semibold">"سماح"</span> (Allow).</span>
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl transition-all duration-300 border border-white/10 font-arabic flex items-center justify-center gap-2"
            >
              <span>تحديث الصفحة وإعادة التحقق 🔄</span>
            </button>

            <a href="/player/debug-push" className="text-[10px] text-gray-600 hover:text-amber-500 mt-1 underline font-arabic">🔧 صفحة تشخيص الإشعارات</a>
          </div>
        </div>
      );
    }

    // 4. حالة غير مدعوم على متصفحات قديمة أو نادرة جداً
    if (permissionState === 'unsupported') {
      return (
        <div className="min-h-screen fixed inset-0 z-[99999] flex items-center justify-center bg-[#050505] p-4" dir="rtl">
          <div className="max-w-md w-full bg-[#0c0c0c]/90 border border-blue-500/20 backdrop-blur-xl rounded-3xl p-6 md:p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(59,130,246,0.1)] text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-blue-500/10 border border-blue-500/30 rounded-full flex items-center justify-center text-blue-500">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
              </svg>
            </div>

            <div className="space-y-2 font-arabic">
              <h1 className="text-2xl font-bold text-white tracking-wide">المتصفح غير مدعوم 🌐</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                متصفحك الحالي لا يدعم إشعارات الويب المطلوبة لتنبيهك بدورك الفوري أثناء اللعب.
              </p>
            </div>

            <div className="bg-[#121212]/80 border border-white/5 p-4 rounded-2xl text-xs text-gray-300 font-arabic text-right leading-relaxed">
              يرجى فتح اللعبة باستخدام متصفح حديث ومدعوم بالكامل مثل <span className="text-amber-500 font-semibold">Google Chrome</span> أو متصفح <span className="text-amber-500 font-semibold">Safari</span> الرسمي (لهواتف آيفون بعد إضافته للشاشة الرئيسية) لتتمكن من اللعب بسلاسة.
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 px-6 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl transition-all duration-300 font-arabic flex items-center justify-center gap-2"
            >
              <span>تحديث الصفحة 🔄</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // صفحات عادية — مع بار
  return (
    <div className="min-h-screen bg-[#050505] pb-20" style={{ overscrollBehavior: 'none' }}>
      {/* مؤشر السحب للتحديث */}
      {pulling && (
        <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pt-4">
          <div className="w-8 h-8 border-2 border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
        </div>
      )}
      {children}
      <BottomNav />
    </div>
  );
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <PlayerLayoutInner>{children}</PlayerLayoutInner>
    </PlayerProvider>
  );
}

