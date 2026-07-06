// ══════════════════════════════════════════════════════
// 🎙️ محمّل مكتبة Cloudflare RealtimeKit (Core SDK — headless)
// ══════════════════════════════════════════════════════
// نحمّل نفس نسخة المتصفّح المُتحقَّق منها في الـ spike. تحميلٌ كسول لمرّة واحدة.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit@latest/dist/browser.js';

let sdkPromise: Promise<any> | null = null;

export function loadRealtimeKit(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as any;
  if (w.RealtimeKitClient) return Promise.resolve(w.RealtimeKitClient);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-rtk]`);
    const onReady = () => (w.RealtimeKitClient ? resolve(w.RealtimeKitClient) : reject(new Error('RealtimeKit missing on window')));
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => reject(new Error('RealtimeKit SDK failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.dataset.rtk = '1';
    s.onload = onReady;
    s.onerror = () => { sdkPromise = null; reject(new Error('RealtimeKit SDK failed to load')); };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// أداة تحويل مجموعات RealtimeKit إلى مصفوفة (toArray أو values)
export function rtkArray(coll: any): any[] {
  try { if (coll && typeof coll.toArray === 'function') return coll.toArray(); } catch { /* noop */ }
  try { return Array.from(coll.values()); } catch { /* noop */ }
  return [];
}

// physicalId من custom_participant_id ("p5" → 5، "host" → null)
export function physicalIdFromCustom(customId: string | null | undefined): number | null {
  if (!customId) return null;
  if (customId === 'host') return null;
  if (customId[0] === 'p') {
    const n = parseInt(customId.slice(1), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
