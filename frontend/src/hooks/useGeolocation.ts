'use client';

// ══════════════════════════════════════════════════════
// 📍 خطّاف الموقع — الإذن والقراءة وحالات الفشل الأربع
//
// 🔴 «إذنٌ دائم» لا وجود له على الويب: الإذن مِلكُ الأصل (origin) لا الحساب،
//    ويُسحَب من إعدادات الموقع، وسفاري iOS قد يعرض «السماح مرّة واحدة» فيسأل
//    كلّ جلسة، وتطبيق PWA المثبَّت له مخزنُ أذوناتٍ منفصل. فالتصميم هنا يفترض
//    سقوط الإذن لا دوامه — وكلّ مسارٍ يحرسه السياج له مخرجٌ عبر الليدر.
//
// 🔴 والرفض لاصق: لا يمكن إعادة سؤال المتصفّح برمجيّاً بعده. لذلك لا يُطلب
//    الإذن هنا تلقائيّاً — الطلب يجري بعد تمهيدٍ داخل الواجهة، مرّةً واحدة.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  capturedAt: number;
  source: 'web';
}

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

const PREF_KEY = 'mafia_geo_asked';   // للتجربة فقط — ليس إثباتاً على شيء

/** آخر قراءةٍ في هذه الجلسة — تُشارَك بين كلّ مستهلكي الخطّاف. */
let lastFix: GeoFix | null = null;
export const getCachedFix = () => lastFix;

function readOnce(timeoutMs = 12_000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported')); return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const fix: GeoFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          // 🔴 زمن القراءة على الجهاز لا زمن وصولها — الخادم يفحص القِدَم به
          capturedAt: pos.timestamp || Date.now(),
          source: 'web',
        };
        lastFix = fix;
        resolve(fix);
      },
      err => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function useGeolocation() {
  const [permission, setPermission] = useState<GeoPermission>('unknown');
  const [fix, setFix] = useState<GeoFix | null>(lastFix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // ── قراءة الحالة بلا إطلاق نافذة ──
  // Permissions API تخبرنا granted/prompt/denied بلا أن تسأل المستخدم شيئاً،
  // فنعرف هل نعرض التمهيد أم نقرأ صامتين.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!cancelled) setPermission('unsupported');
        return;
      }
      // 🔴 سفاري على iOS لا يدعم Permissions API للموقع — لا يرمي بالضرورة، قد
      //    يُرجِع undefined. فالاعتماد عليه وحده يُبقي الحالة 'unknown' إلى الأبد،
      //    فلا قراءةَ صامتة تجري ولو كان الإذن ممنوحاً منذ أسبوع. وهذا يعطّل
      //    المنظومة كلّها على iOS وهو أكثر ما يستعمله لاعبونا (PWA على الشاشة).
      //    الحلّ: أثرُنا المحلّيّ — إن سبق أن نجحت قراءةٌ على هذا الجهاز فالإذن ممنوح.
      const fallback = () => {
        if (cancelled) return;
        let asked = false;
        try { asked = localStorage.getItem(PREF_KEY) === '1'; } catch { /* تصفّح خاصّ */ }
        setPermission(asked ? 'granted' : 'unknown');
      };
      try {
        const st = await (navigator as any).permissions?.query({ name: 'geolocation' });
        if (!st) { fallback(); return; }
        const apply = () => { if (!cancelled) setPermission(st.state as GeoPermission); };
        apply();
        st.onchange = apply;
      } catch {
        fallback();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** قراءةٌ فعليّة — تُطلق نافذة الإذن إن لم يكن ممنوحاً. */
  const read = useCallback(async (): Promise<GeoFix | null> => {
    setBusy(true); setError('');
    try {
      const f = await readOnce();
      if (mounted.current) { setFix(f); setPermission('granted'); }
      try { localStorage.setItem(PREF_KEY, '1'); } catch { /* وضع التصفّح الخاصّ */ }
      return f;
    } catch (e: any) {
      const code = e?.code;
      let msg = 'تعذّر تحديد موقعك';
      if (code === 1) {           // PERMISSION_DENIED
        if (mounted.current) setPermission('denied');
        msg = 'رُفض إذن الموقع — فعّله من إعدادات الموقع في المتصفّح';
      } else if (code === 2) {    // POSITION_UNAVAILABLE
        msg = 'خدمة الموقع غير متاحة الآن — تأكّد من تفعيلها في جهازك';
      } else if (code === 3) {    // TIMEOUT
        msg = 'تأخّرت قراءة الموقع — أعد المحاولة قرب نافذة أو في الخارج';
      } else if (e?.message === 'unsupported') {
        if (mounted.current) setPermission('unsupported');
        msg = 'متصفّحك لا يدعم تحديد الموقع';
      }
      if (mounted.current) setError(msg);
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  /** قراءةٌ صامتة: لا تُطلق نافذةً أبداً — تُستعمل عند فتح التطبيق. */
  const readIfGranted = useCallback(async (): Promise<GeoFix | null> => {
    if (permission !== 'granted') return null;
    try {
      const f = await readOnce(8_000);
      if (mounted.current) setFix(f);
      return f;
    } catch (e: any) {
      // سُحب الإذن من الإعدادات ⇒ امسح أثرنا كي يعود التمهيد بدل صمتٍ أبديّ
      if (e?.code === 1) {
        try { localStorage.removeItem(PREF_KEY); } catch { /* تصفّح خاصّ */ }
        if (mounted.current) setPermission('denied');
      }
      return null;
    }
  }, [permission]);

  /** هل سبق أن مُنِح الإذن على هذا الجهاز؟ (لتخطّي التمهيد) */
  const askedBefore = (() => {
    try { return localStorage.getItem(PREF_KEY) === '1'; } catch { return false; }
  })();

  return { permission, fix, busy, error, read, readIfGranted, askedBefore };
}

// ══════════════════════════════════════════════════════
// 📤 التبليغ — يُنادى عند فتح التطبيق وعند العودة من الخلفيّة
// 🔴 لا يمنع شيئاً ولا يُظهر خطأً: وظيفته تحديث النقطة على خريطة الليدر.
//    الحراسة تجري عند البوّابات بقراءةٍ طازجة، لا بهذا.
// ══════════════════════════════════════════════════════
export async function reportFix(fix: GeoFix | null, apiUrl: string, token: string | null): Promise<void> {
  if (!fix || !token) return;
  try {
    await fetch(`${apiUrl}/api/fnb/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fix }),
    });
  } catch { /* الشبكة تتقطّع — لا شيء يتوقّف بسبب نقطةٍ على خريطة */ }
}
