// تسجيل الـ service worker وزر "تثبيت التطبيق" (Android/Chrome) أو تلميح الإضافة للشاشة الرئيسية (iPhone).
let deferred = null;
const listeners = new Set();
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());
export function onInstallChange(fn) { listeners.add(fn); }
const notify = () => listeners.forEach((fn) => fn());

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
addEventListener('appinstalled', () => { deferred = null; notify(); });

/** يعيد 'installed' | 'dismissed' | 'ios' (يجب أن يعرض المستدعي تعليمات iPhone). */
export async function install() {
  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; notify();
    return outcome === 'accepted' ? 'installed' : 'dismissed';
  }
  return isIOS() ? 'ios' : 'dismissed';
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
