// ══════════════════════════════════════════════════════
// 🔀 دمج تخصيص النشاط المؤقّت فوق تثبيت القالب — منطق نقيّ قابل للاختبار
// تخصيص النشاط (activities.seat_assignments) يتفوّق عند تعارض نفس المقعد أو نفس الشخص،
// فيبقى تثبيت القالب (seat_templates.pinned_seats) أساساً لأي مقعد/شخص لم يخصّصه النشاط.
// لا يمسّ القالب المشترك. يُستخدم في lobby.socket عند تحميل/تحديث مقاعد الروم.
// ══════════════════════════════════════════════════════

export interface PinLike {
  seatNumber: number | string;
  playerId?: number | null;
  phone?: string;
  playerName?: string;
}

export function normPinPhone(p?: string): string {
  if (!p) return '';
  let c = String(p).replace(/[\s\-()+]/g, '');
  if (c.startsWith('00962')) c = c.slice(5); else if (c.startsWith('962')) c = c.slice(3);
  return c.startsWith('0') ? c : '0' + c;
}

export function samePinPerson(a: any, b: any): boolean {
  return (a.playerId && b.playerId && Number(a.playerId) === Number(b.playerId)) ||
    (!!normPinPhone(a.phone) && normPinPhone(a.phone) === normPinPhone(b.phone)) ||
    (!!a.playerName && !!b.playerName && String(a.playerName).trim().toLowerCase() === String(b.playerName).trim().toLowerCase());
}

/**
 * يدمج تثبيت القالب مع تخصيص النشاط. النشاط يتفوّق:
 *  - أي مقعد خصّصه النشاط يُلغي تثبيت القالب لنفس المقعد.
 *  - أي شخص خصّصه النشاط (بمقعد مختلف) يُلغي تثبيت القالب لنفس الشخص.
 *  - ما تبقّى من تثبيت القالب يبقى كما هو.
 */
export function mergeActivityPins(templatePins: any[], activityPins: any[]): any[] {
  const act = (Array.isArray(activityPins) ? activityPins : []).filter((p: any) => Number.isFinite(Number(p?.seatNumber)));
  const usedSeats = new Set(act.map((p: any) => Number(p.seatNumber)));
  const out: any[] = [...act];
  for (const tp of (Array.isArray(templatePins) ? templatePins : [])) {
    const seat = Number(tp?.seatNumber);
    if (!Number.isFinite(seat)) continue;
    if (usedSeats.has(seat)) continue;                         // النشاط خصّص هذا المقعد → تجاهل تثبيت القالب
    if (act.some((ap: any) => samePinPerson(ap, tp))) continue; // الشخص مخصَّص بمقعد آخر بالنشاط
    out.push(tp);
  }
  return out;
}
