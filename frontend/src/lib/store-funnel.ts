// ══════════════════════════════════════════════════════
// 📉 إرسال أحداث قمع المتجر
//
// 📐 ثلاثة قيود صاغت هذا الملف:
//
//  1) **لا طلب لكل حدث.** تمريرة واحدة في المتجر تُنتج عشرين ظهوراً؛
//     عشرون طلباً تُبطئ الصفحة التي جاء القياس ليحسّنها.
//
//  2) **لا يُفقد ما قبل الإغلاق.** اللاعب يفتح المتجر ثم يخرج — وهي
//     بالضبط اللحظة التي نريد قياسها. الدفعة الأخيرة تُرسل عبر
//     `sendBeacon` لأن `fetch` يُلغى عند تفريغ الصفحة.
//
//  3) **الفشل صامت تماماً.** خطأ في التحليلات لا يظهر للاعب ولا يُسجَّل
//     في الطرفية بضجيج — القياس خادم للبيع لا العكس.
// ══════════════════════════════════════════════════════

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const ENDPOINT = `${API_URL}/api/chips/store/events`;

export type FunnelEvent = 'open' | 'impression' | 'try_on' | 'shortfall';

interface Queued { event: FunnelEvent; itemId?: number }

let queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** الظهور يُرسل مرّة واحدة لكل عنصر في الجلسة — الخادم يُقيّده يومياً أيضاً */
const seenImpressions = new Set<number>();

function token(): string | null {
  try { return localStorage.getItem('mafia_player_token'); } catch { return null; }
}

function flush(useBeacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue;
  queue = [];

  const t = token();
  if (!t) return;
  const body = JSON.stringify({ events });

  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // ⚠️ sendBeacon لا يحمل ترويسات — الرمز يمرّ في المسار.
      //    مقبول هنا وحده: نقطة تحليلات لا تُرجع بيانات ولا تُغيّر حالة.
      navigator.sendBeacon(`${ENDPOINT}?t=${encodeURIComponent(t)}`, body);
      return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body,
      keepalive: true,
    }).catch(() => { /* صامت */ });
  } catch { /* صامت */ }
}

export function trackStore(event: FunnelEvent, itemId?: number) {
  if (typeof window === 'undefined') return;
  if (event === 'impression') {
    if (!itemId || seenImpressions.has(itemId)) return;
    seenImpressions.add(itemId);
  }
  queue.push(itemId ? { event, itemId } : { event });
  // دفعة كل ثانيتين، أو فوراً إن تجمّع الكثير
  if (queue.length >= 40) return flush();
  if (!timer) timer = setTimeout(() => flush(), 2000);
}

/** يُركَّب مرّة عند فتح المتجر */
export function installFunnelFlush(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => flush(true));
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    flush(true);
  };
}
