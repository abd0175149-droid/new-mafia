// ══════════════════════════════════════════════════════
// 🧹 ما يلي إزالة صفّ حجز — من أيّ مسار
// ══════════════════════════════════════════════════════
// خطّة توحيد الحجز، م١ (الثغرة ٢): خمسةُ مساراتٍ تحذف صفّ الحجز — إلغاء التطبيق،
// وإلغاء الدون، وحذف الموظّف من «الحجوزات»، وحذف المتابعة، وفكّ التثبيت — وكان كلٌّ
// منها يتذكّر أثراً وينسى آخر:
//   • الزيارة المجّانيّة من بطاقة الولاء كانت تعود عند إلغاء التطبيق وحده، فتبقى
//     «مستهلكة» على حجزٍ محذوف في المسارات الأربعة الأخرى.
//   • عضوُ مجموعة العرض كان يخرج منها عند إلغاء التطبيق وحذف «الحجوزات» فقط،
//     فتبقى المجموعة أكبر من حاضريها بعد إلغاء الدون أو فكّ التثبيت.
// الآن كلّ مسارٍ يحذف صفّ حجز ينادي هذه الدالّة بعد الحذف، فلا يُنسى أثر.
//
// كلّ خطوةٍ هنا آمنةٌ للتكرار: إعادة الزيارة تشترط أنّها مستهلكة على هذا الحجز بعينه،
// وخروج العضو يشترط أنّه ما زال في المجموعة. فنداؤها مرّتين لا يضرّ.

/** تُنادى بعد وضع deleted_at على صفّ الحجز. لا ترمي: كلّ خطوةٍ خدمةٌ لا شرط. */
export async function afterBookingRemoved(bookingId: number): Promise<void> {
  const id = Math.trunc(Number(bookingId));
  if (!Number.isFinite(id) || id <= 0) return;
  // 👥 عضوٌ في مجموعة عرض ⟵ يخرج منها وتصغر ويُبلَّغ صاحبها
  try {
    const { onBookingDeleted } = await import('./booking-offers.service.js');
    await onBookingDeleted(id);
  } catch (e: any) { console.warn(`⚠️ lifecycle #${id} group exit:`, e?.message); }
  // 🎟️ زيارة مجّانيّة كانت مطبَّقة على هذا الحجز ⟵ تعود متاحة في بطاقته
  try {
    const { releaseFreeVisit } = await import('./loyalty.service.js');
    await releaseFreeVisit(id);
  } catch (e: any) { console.warn(`⚠️ lifecycle #${id} free visit:`, e?.message); }
}

/** رابط «متابعة الحجوزات» على الفعاليّة نفسها — كلّ إشعار حجزٍ أو إلغاءٍ يفتحه */
export function followUpUrl(activityId: number | string | null | undefined): string {
  const id = Math.trunc(Number(activityId));
  return Number.isFinite(id) && id > 0 ? `/admin/reservations?activityId=${id}` : '/admin/reservations';
}
