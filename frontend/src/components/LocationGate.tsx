'use client';

// ══════════════════════════════════════════════════════
// 📍 بوّابة الموقع — التمهيد عند أوّل فتحة، والقراءة الصامتة في كلّ فتحةٍ بعدها
//
// 🔴 لماذا تمهيدٌ قبل نافذة النظام: نافذةُ إذنٍ تنبثق في وجه لاعبٍ فتح التطبيق
//    ليتصفّح رتبته تُرفَض غالباً — والرفض على الويب **لا يمكن إعادة السؤال بعده
//    برمجيّاً**؛ يحتاج فتح إعدادات الموقع يدويّاً. فرفضةٌ واحدة تُخرج اللاعب من
//    المنظومة عمليّاً إلى الأبد. شاشةٌ واحدة تشرح السبب تقلب هذا تماماً.
//
// 🔴 وبعد أوّل موافقة: لا نافذة بعدها أبداً — كلّ فتحةٍ تقرأ صامتةً وتُبلّغ.
//    ولا تبليغ في الخلفيّة: إذن الخلفيّة يستدعي مراجعة متجر ولا نطلبه.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGeolocation, reportFix, getCachedFix } from '@/hooks/useGeolocation';
import { usePlayer } from '@/context/PlayerContext';
import LocationHelp from './LocationHelp';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const SEEN_KEY = 'mafia_geo_intro_seen';
/** نبضةٌ خفيفةٌ ما دام التطبيق مفتوحاً — تُبقي نقطة الخريطة صادقة بلا استنزاف. */
const HEARTBEAT_MS = 4 * 60 * 1000;



export default function LocationGate() {
  const geo = useGeolocation();
  // 🔴 التوكن من سياق اللاعب لا من localStorage مباشرة: المفاتيح هنا
  //    mafia_player_auth / mafia_player_token وليست playerToken. قراءة مفتاحٍ
  //    خاطئ كانت تُرجِع null دائماً — فلا تمهيد يظهر ولا موقع يُرسَل،
  //    والمنظومة صامتة تماماً بلا خطأٍ يُرى.
  const { player } = usePlayer();
  const token = useCallback(() => player?.token || null, [player?.token]);
  const [showIntro, setShowIntro] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastSent = useRef(0);

  /** هل سبق أن قبِل اللاعب التمهيد على هذا الجهاز؟ */
  const introAccepted = () => {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
  };

  // ── التبليغ: قراءةٌ ثمّ إرسال ──
  const pulse = useCallback(async () => {
    if (!token()) return;
    if (Date.now() - lastSent.current < 30_000) return;   // لا إغراق

    let f = null;
    if (geo.permission === 'granted') {
      f = await geo.readIfGranted();          // صامتة تماماً
    } else if (geo.permission !== 'denied' && geo.permission !== 'unsupported' && introAccepted()) {
      // 🔴 الفخّ الذي يُصمِت المنظومة إلى الأبد: على iOS لا Permissions API، فالحالة
      //    تبقى 'unknown'. ولو قبِل اللاعب التمهيد ثمّ فشلت قراءته مرّةً (مهلة،
      //    داخل مبنى، شبكة) لم يُكتَب أثرُ القبول — فلا التمهيد يعود (SEEN_KEY
      //    مكتوب) ولا القراءة الصامتة تجري (الحالة ليست granted). صمتٌ أبديّ بلا
      //    خطأٍ يُرى. فمن قبِل التمهيد نقرأ له قراءةً حقيقيّة عند كلّ فتحة:
      //    إن كان الإذن ممنوحاً فلا نافذة تظهر أصلاً، وإن لم يكن فقد قبِل السؤال.
      f = await geo.read();
    }
    if (f) { lastSent.current = Date.now(); reportFix(f, API_URL, token()); }
  }, [geo, token]);

  // ── عند فتح التطبيق ──
  useEffect(() => {
    if (geo.permission === 'granted') { pulse(); return; }
    if (geo.permission === 'prompt' || geo.permission === 'unknown') {
      let seen = false;
      try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* تصفّح خاصّ */ }
      // من ضغط «ليس الآن» يُسأل في الفتحة التالية — لا في هذه
      if (!seen && token()) setShowIntro(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.permission, player?.token]);

  // ── العودة من الخلفيّة + النبضة ──
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') pulse(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const iv = setInterval(pulse, HEARTBEAT_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(iv);
    };
  }, [pulse]);

  const allow = async () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* تصفّح خاصّ */ }
    const f = await geo.read();
    setShowIntro(false);
    if (f) { lastSent.current = Date.now(); reportFix(f, API_URL, token()); }
  };

  const later = () => {
    // 🔴 لا نكتب SEEN_KEY هنا عمداً: «ليس الآن» تأجيلٌ لا رفضٌ دائم،
    //    فيُسأل في الفتحة التالية بدل أن يضيع منّا اللاعب إلى الأبد.
    setShowIntro(false);
    setDismissed(true);
  };

  // 🔴 المرفوض لا تمهيد له — وكان لا يرى شيئاً إطلاقاً: يُمنع عند البوّابة
  //    ولا يعرف لماذا ولا كيف يصلحه. لوحة المساعدة تظهر له مستقلّةً عن التمهيد.
  if (!showIntro || dismissed) return <LocationHelp />;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-3xl overflow-hidden border"
        style={{ background: '#0b0f0d', borderColor: 'rgba(16,185,129,0.28)' }}>

        <div className="px-5 pt-6 pb-4 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-3xl mb-4"
            style={{ background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)' }}>📍</div>
          <h2 className="text-white text-base font-black mb-2">نحتاج إذن موقعك</h2>
          <p className="text-[13px] leading-relaxed" style={{ color: '#9fb3a8' }}>
            نستخدمه لأمرين فقط: <b className="text-white">دخول غرفة الفعاليّة</b> و
            <b className="text-white"> الطلب من المنيو</b> — كي نتأكّد أنّك في المكان.
          </p>
        </div>

        <div className="px-5 pb-4 space-y-2">
          {[
            ['✅', 'الحجز يبقى متاحاً من أيّ مكان'],
            ['🔕', 'لا نتتبّعك في الخلفيّة — يُقرأ الموقع وأنت داخل التطبيق فقط'],
            ['📍', 'نحفظ آخر نقطةٍ فقط — لا سجلّ تحرّكات'],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-start gap-2.5 text-[12px] rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.03)', color: '#c8d6ce' }}>
              <span className="shrink-0">{icon}</span><span>{text}</span>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5 space-y-2">
          <button onClick={allow} disabled={geo.busy}
            className="w-full py-3 rounded-xl text-[14px] font-black text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
            {geo.busy ? 'يقرأ موقعك…' : 'تابع'}
          </button>
          <button onClick={later} className="w-full py-2 text-[12px]" style={{ color: '#6b7d74' }}>
            ليس الآن
          </button>
        </div>
      </div>
    </div>
  );
}

/** قراءةٌ طازجة للبوّابات — تُستدعى قبل الدخول والطلب مباشرةً. */
export async function freshFixForGate(): Promise<any | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
        capturedAt: pos.timestamp || Date.now(),
        source: 'web',
      }),
      // 🔴 الفشل لا يُسقط المحاولة: نرسل آخر قراءةٍ في الجلسة إن وُجدت، والخادم
      //    يحكم عليها بالقِدَم. إسقاط الطلب هنا يحرم لاعباً بسبب ثانيةٍ متأخّرة.
      () => resolve(getCachedFix()),
      { enableHighAccuracy: true, timeout: 9_000, maximumAge: 20_000 },
    );
  });
}
