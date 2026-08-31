// ══════════════════════════════════════════════════════
// 📋 حالةُ الحجز — تعريفٌ واحدٌ للخلفيّة
//
// 🔴 كانت في المشروع خمسةُ تعريفاتٍ متناقضة لـ«مثبَّت». أخطرُها هنا:
//    كشفُ PDF واستعلامُ «تحديث الحضور من الألعاب» كانا يعتبران `waitlist`
//    **مثبَّتةً** (`status !== 'pending'`) بينما الشاشةُ تعدّها غيرَ مثبّتة —
//    فالرقمُ على الورق يخالف الرقمَ على الشاشة، ومَن رُفض لامتلاء المقاعد
//    كان يُحوَّل إلى «حاضر» تلقائيّاً.
//
// ⚠️ النظيرُ الأماميّ في frontend/src/lib/reservation-status.ts — يُغيَّران معاً.
// ══════════════════════════════════════════════════════

export type ResStatus = 'pending' | 'confirmed' | 'waitlist';

/** الحالاتُ المقبولة في الكتابة. `paid_all` إرثٌ يُقرأ ولا يُكتب. */
export const WRITABLE_STATUSES: ResStatus[] = ['pending', 'confirmed', 'waitlist'];

export function resStatus(status: unknown): ResStatus {
  const s = String(status ?? 'pending');
  if (s === 'confirmed' || s === 'paid_all') return 'confirmed';
  if (s === 'waitlist') return 'waitlist';
  return 'pending';
}

/** مثبَّتٌ فعلاً — قائمةُ الانتظار ليست مثبّتة */
export const isConfirmedStatus = (status: unknown) => resStatus(status) === 'confirmed';
export const isWaitlistStatus = (status: unknown) => resStatus(status) === 'waitlist';

export function statusLabelAr(status: unknown): string {
  switch (resStatus(status)) {
    case 'confirmed': return 'مثبّت';
    case 'waitlist': return 'قائمة انتظار';
    default: return 'غير مثبّت';
  }
}

/** شرطُ SQL لـ«مثبَّت» — يُستعمل في الاستعلامات الخام فلا تتفرّق التعاريف */
export const SQL_CONFIRMED = `status IN ('confirmed','paid_all')`;
