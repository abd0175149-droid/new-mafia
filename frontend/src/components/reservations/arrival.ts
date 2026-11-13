// ══════════════════════════════════════════════════════
// ⏱ مجموعات الوصول — تُحسب في المتصفّح من حقول الصفّ
//
// 🔴 «وصل» يقرّره ما كان يقرّره دائماً: دخول الغرفة، الباب، الموظّف. الدون لا يعلّم
//    وصولاً أبداً — هو يسجّل «متى سيصل» فقط، وهذا الملفّ يقرأ ولا يكتب.
//
// 🔴 غير المثبَّت وقائمة الانتظار خارج المجموعات الأربع: لم يُحسم حجزهم أصلاً،
//    فسؤالهم «متى تصل؟» سابق لأوانه. يبقون تحت مرشِّحاتهم كما كانوا.
// ══════════════════════════════════════════════════════

import { isConfirmed } from '@/lib/reservation-status';
import type { Reservation } from '@/hooks/useReservations';

export type ArrivalGroup = 'onway' | 'silent' | 'arrived' | 'declined' | 'other';

export function arrivalGroup(r: Reservation): ArrivalGroup {
  if (r.attended === true) return 'arrived';
  if (r.attended === false) return 'declined';
  if (!isConfirmed(r)) return 'other';
  return r.etaAt ? 'onway' : 'silent';
}

const ms = (iso: string | null | undefined) => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
};

/** في الطريق وتجاوز وقته */
export const isLate = (r: Reservation, now: number) =>
  arrivalGroup(r) === 'onway' && ms(r.etaAt) < now;

/** أرقام لاتينيّة دائماً */
export const num = (v: unknown) => new Intl.NumberFormat('ar-JO-u-nu-latn', { useGrouping: false }).format(Number(v) || 0);

/** «8:50» — ساعة ١٢ بلا «ص/م»: الليلة واحدة والسياق يكفي */
export function hm(iso: string | null | undefined): string {
  const t = ms(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function span(mins: number): string {
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} س ${m} د` : `${h} س`;
}

/** «8:50 · 10 د» · متأخّراً «8:25 · +15 د» */
export function etaLabel(iso: string | null | undefined, now: number): { text: string; late: boolean } | null {
  const t = ms(iso);
  if (Number.isNaN(t)) return null;
  const diff = Math.round((t - now) / 60000);
  if (diff < 0) return { text: `${hm(iso)} · +${span(-diff)}`, late: true };
  if (diff === 0) return { text: `${hm(iso)} · الآن`, late: false };
  return { text: `${hm(iso)} · ${span(diff)}`, late: false };
}

export const peopleLabel = (n: number | null | undefined) => {
  const c = Math.max(1, Number(n) || 1);
  return c === 1 ? 'شخص واحد' : c === 2 ? 'شخصان' : `${num(c)} أشخاص`;
};

/** حالة رسالة المتابعة لمن لم يردّ — null: لا شيء يُقال */
export function followupState(r: Reservation): { text: string; short: string; tone?: 'warn' | 'danger' | 'info' } | null {
  const st = r.followupStatus ?? null;
  if (!r.followupSentAt && !st) return null;
  if (st === 'failed') return { text: 'تعذّر إرسال المتابعة — اتّصل به', short: 'اتّصال', tone: 'danger' };
  if (st === 'read') return { text: 'قرأ المتابعة ولم يردّ', short: 'قرأ' };
  if (st === 'delivered') return { text: 'وصلته المتابعة ولم يقرأها', short: 'لم يقرأ', tone: 'warn' };
  if (st === 'queued') return { text: 'المتابعة في الطابور', short: 'في الطابور', tone: 'info' };
  return { text: `أُرسلت له المتابعة ${hm(r.followupSentAt)}`.trim(), short: 'أُرسلت', tone: 'info' };
}

/** ترتيب مجموعة «في الطريق»: المتأخّر أوّلاً ثمّ الأقرب وصولاً */
export function sortOnway(rows: Reservation[], now: number): Reservation[] {
  return [...rows].sort((a, b) => {
    const la = isLate(a, now) ? 0 : 1, lb = isLate(b, now) ? 0 : 1;
    return la - lb || ms(a.etaAt) - ms(b.etaAt);
  });
}

/** «وقت محدّد» من حقل الوقت (HH:MM) ⟵ ISO. الليلة تعبر منتصف الليل، فأقرب يوم للّحظة هو المقصود. */
export function timeToIso(hhmm: string, now = Date.now()): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let t = d.getTime();
  const H12 = 12 * 3600_000;
  if (t < now - H12) t += 2 * H12; else if (t > now + H12) t -= 2 * H12;
  return new Date(t).toISOString();
}

// ── سجلّ «الدون يتابع» ──
export interface ResEvent {
  id: number;
  at: string;
  actor: 'bot' | 'staff' | 'system';
  actorName?: string | null;
  reservationId?: number | null;
  name?: string | null;
  kind: 'eta_set' | 'eta_cleared' | 'declined' | 'followup_sent' | 'needs_review' | 'late_reminder' | 'undo' | string;
  text?: string | null;
  quote?: string | null;
  undoable?: boolean;
  undone?: boolean;
}
