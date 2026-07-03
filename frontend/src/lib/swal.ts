// ══════════════════════════════════════════════════════
// 🔔 تنبيهات موحّدة عبر SweetAlert2 (ثيم داكن RTL يطابق النادي)
// - swalConfirm: بديل confirm() — يُرجِع Promise<boolean>
// - swalAlert:   بديل alert() — أيقونة تلقائية حسب النص
// - swalToast:   إشعار زاوية سريع
// - installGlobalSwal: يوجّه window.alert إلى SweetAlert2 تلقائياً
// ══════════════════════════════════════════════════════

import Swal from 'sweetalert2';

const themed = Swal.mixin({
  background: '#141210',
  color: '#e7e2d6',
  confirmButtonColor: '#C5A059',
  cancelButtonColor: '#2f2a24',
  buttonsStyling: true,
  customClass: {
    popup: 'swal-mafia rounded-2xl',
    title: 'swal-mafia-title',
    htmlContainer: 'swal-mafia-text',
  },
});

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (s: string) => esc(s).replace(/\n/g, '<br>');

/** بديل confirm() — يُرجِع true إن أكّد المستخدم. */
export async function swalConfirm(
  text: string,
  opts?: { title?: string; confirmText?: string; cancelText?: string; icon?: 'warning' | 'question' | 'error' | 'info'; danger?: boolean },
): Promise<boolean> {
  const r = await themed.fire({
    title: opts?.title ?? 'تأكيد',
    html: toHtml(text),
    icon: opts?.icon ?? 'warning',
    showCancelButton: true,
    confirmButtonText: opts?.confirmText ?? 'نعم',
    cancelButtonText: opts?.cancelText ?? 'إلغاء',
    reverseButtons: true,
    focusCancel: true,
    ...(opts?.danger ? { confirmButtonColor: '#b91c1c' } : {}),
  });
  return r.isConfirmed;
}

function iconFor(msg: string): 'success' | 'error' | 'info' | 'warning' {
  if (/✅|تمّ|تم |تمت|بنجاح|نجح|أُرسل|أضيف|حُفظ/.test(msg)) return 'success';
  if (/❌|فشل|خطأ|تعذّر|غير صالح|مطلوب|لا يمكن/i.test(msg)) return 'error';
  if (/⚠️|تنبيه|تحذير/.test(msg)) return 'warning';
  return 'info';
}

/** بديل alert() — أيقونة تلقائية حسب النص. */
export function swalAlert(text: string, icon?: 'success' | 'error' | 'info' | 'warning'): void {
  void themed.fire({ html: toHtml(text), icon: icon ?? iconFor(String(text)), confirmButtonText: 'حسناً' });
}

/** تأكيد بمحتوى HTML خام (على المستدعي تهريب أي نص مستخدم) — للتنبيهات الغنية. */
export async function swalHtmlConfirm(
  title: string,
  html: string,
  opts?: { confirmText?: string; cancelText?: string; danger?: boolean },
): Promise<boolean> {
  const r = await themed.fire({
    title,
    html,
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    confirmButtonText: opts?.confirmText ?? 'نعم',
    cancelButtonText: opts?.cancelText ?? 'إغلاق',
    ...(opts?.danger ? { confirmButtonColor: '#b91c1c' } : {}),
  });
  return r.isConfirmed;
}

/** إشعار زاوية سريع. */
export function swalToast(text: string, icon: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
  void Swal.fire({
    toast: true, position: 'top-end', timer: 3000, timerProgressBar: true, showConfirmButton: false,
    icon, title: text, background: '#141210', color: '#e7e2d6',
  });
}

/** يوجّه window.alert إلى SweetAlert2 (يشمل كل نداءات alert القائمة تلقائياً). */
export function installGlobalSwal(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__swalInstalled) return;
  (window as any).__swalInstalled = true;
  window.alert = (msg?: any) => { swalAlert(String(msg ?? '')); };
}
