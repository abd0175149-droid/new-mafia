// ══════════════════════════════════════════════════════
// 📣 تأكيد إلغاء فعاليّة — معاينة من ستصله رسالة الإلغاء قبل الضغط
// ══════════════════════════════════════════════════════
// الخادم يراسل الحاجزين آليّاً عند تحوّل الحالة إلى «ملغاة» (activity-cancel-notice.service)،
// فلا يُضغط الزرّ أعمى: يرى الموظّف كم حاجزاً، وكم ستصله الرسالة الآن، ونصّها.

import { swalConfirm, swalToast } from '@/lib/swal';

export async function confirmActivityCancel(activityId: number, get: (path: string) => Promise<any>): Promise<boolean> {
  let p: any = null;
  try { p = await get(`/api/activities/${activityId}/cancel-notice/preview`); } catch { /* نكمل بتأكيدٍ عامّ */ }
  if (!p) return swalConfirm('تحويل الفعاليّة إلى «ملغاة»؟ سيحاول البوت إشعار الحاجزين.', { title: 'إلغاء الفعاليّة؟', danger: true, confirmText: 'ألغِ الفعاليّة' });

  const name = `«${p.activity?.name}» (${p.activity?.when})`;
  let text: string;
  if (p.activity?.isTest) text = `${name}\n\n🧪 موقع اختبار — لن تُرسل أيّ رسالة واتساب (يُسجَّل التقرير فقط).`;
  else if (!p.beforeStart) text = `${name}\n\n⏰ موعد الفعاليّة فات — لن تُرسل رسائل إلغاء للحاجزين.`;
  else if (!p.total) text = `${name}\n\nلا حاجزين في هذه الفعاليّة — لن تُرسل رسائل.`;
  else {
    const closed = Number(p.windowClosed || 0) + Number(p.noConversation || 0);
    text = `سيُرسل البوت رسالة إلغاء لكلّ من حجز في ${name}:\n\n`
      + `👥 الحاجزون: ${p.total}\n`
      + `✅ ستصلهم الآن: ${p.reachable}\n`
      + `⛔ لن تصلهم (نافذة الـ٢٤ ساعة مغلقة): ${closed}`
      + (p.invalid ? `\n⚠️ أرقام غير صالحة: ${p.invalid}` : '')
      + (closed ? '\n\nمن لم تصله يظهر في «تقرير الإلغاء» بصفحة الفعاليّة لتتواصل معه يدويّاً.' : '')
      + `\n\nنصّ الرسالة:\n${p.message}`;
  }
  return swalConfirm(text, { title: 'إلغاء الفعاليّة؟', danger: true, confirmText: p.willSend && p.total ? 'ألغِ وأرسل' : 'ألغِ الفعاليّة' });
}

/** بعد الحفظ: سطرٌ يقول ما سيحدث، والتقرير الكامل في صفحة الفعاليّة */
export function toastCancelStarted(resp: any): void {
  const n = resp?.cancelNotice;
  if (!n?.started) return;
  swalToast(n.beforeStart ? 'أُلغيت الفعاليّة — جارٍ إرسال الإشعارات، والتقرير في صفحة الفعاليّة 📣' : 'أُلغيت الفعاليّة (بعد موعدها — بلا رسائل)', 'success');
}
