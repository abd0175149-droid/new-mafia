// ══════════════════════════════════════════════════════
// 🆔 معرّف جهاز ثابت وفريد لكل تثبيت (PWA/متصفح)
// يُخزَّن في localStorage فيبقى ثابتاً عبر الجلسات وبين اللاعبين على نفس الجهاز،
// وفريداً لكل جهاز فعلي (حتى لو تطابق User-Agent مع جهاز آخر).
// يُستخدم لإزالة تكرار توكنات الإشعارات حسب الجهاز الفعلي بدقّة.
// ══════════════════════════════════════════════════════

const DEVICE_ID_KEY = 'mafia_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}
