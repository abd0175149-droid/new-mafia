// ══════════════════════════════════════════════════════
// 📋 حالةُ الحجز — تعريفٌ واحدٌ يستعمله الجميع
//
// 🔴 كانت في المشروع **خمسةُ تعريفاتٍ متناقضة** لـ«مثبَّت»، و`waitlist` تُعدّ:
//    غيرَ مثبّتةٍ في بطاقة الإحصاء · لا هذا ولا ذاك في لافتة «غير المثبَّت» ·
//    مثبّتةً في كشف PDF وفي استعلام «تحديث الحضور من الألعاب».
//    فالرقمان على الشاشة كانا يختلفان بعدد صفوف الانتظار.
//
// 🔴 قائمةُ الانتظار حالةٌ ثالثةٌ ظاهرة (قرار المالك): مَن فيها **رُفض لامتلاء
//    المقاعد** لا لأنّه لم يُثبَّت بعد. طيُّها تحت «غير مثبّت» يُخفي ذلك.
//    ولا تُحسب مثبَّتةً في أيّ عدّ.
//
// ⚠️ أيُّ حسابٍ جديدٍ لحالة الحجز يمرّ من هنا. ولا تُقارَن `status` نصّاً في
//    أيّ ملفٍّ آخر — النظيرُ الخلفيّ في backend/src/lib/reservation-status.ts.
// ══════════════════════════════════════════════════════

export type ResStatus = 'pending' | 'confirmed' | 'waitlist';

/** ألوانُ الحالات — مُصادَقة على سطح لوحة الإدارة #111827:
 *  فصلُ عمى الألوان ΔE 10.2 (deutan) · الرؤية الطبيعيّة 20.6 · التباين ≥3:1.
 *  الأخضرُ الحاليّ (#34d399) والأحمر (#fb7185) كان فرقُهما 4.6 — أيْ متطابقَين
 *  عمليّاً لنحو ٨٪ من الذكور، وهما أخطرُ حالتين على الشاشة. */
export const RES_COLORS = {
  pending: '#DCA83C',
  waitlist: '#A78BFA',
  attended: '#2FA88C',
  noShow: '#D9453F',
  waSent: '#25D366',   // أخضرُ واتساب — يُقرأ فوراً بلا تعلُّم
  neutral: 'rgba(255,255,255,.14)',
} as const;

/** الحالةُ المعياريّة — `paid_all` إرثٌ قديم يُعامَل مثبّتاً */
export function resStatus(r: { status?: string | null } | null | undefined): ResStatus {
  const s = String(r?.status ?? 'pending');
  if (s === 'confirmed' || s === 'paid_all') return 'confirmed';
  if (s === 'waitlist') return 'waitlist';
  return 'pending';
}

/** مثبَّتٌ فعلاً — قائمةُ الانتظار ليست مثبّتة */
export const isConfirmed = (r: any) => resStatus(r) === 'confirmed';
/** بانتظار التثبيت — لا يشمل قائمة الانتظار */
export const isPending = (r: any) => resStatus(r) === 'pending';
export const isWaitlist = (r: any) => resStatus(r) === 'waitlist';

// ══════════════════════════════════════════════════════
// 💬 رسالةُ الواتساب اليدويّة — يرسلها الموظّفُ من حسابه هو
//
// لا علاقةَ لها بالبوت: طبقةُ الإرسال الرسميّة ترفض أيَّ رسالةٍ خارج نافذة
// الـ٢٤ ساعة («لا نراسل إلا مَن راسلنا أوّلاً»)، فالمراسلةُ الاستباقيّة تبقى
// يدويّةً من هاتف الموظّف. وهذا العمودُ يسجّل فعلَه هو.
// ══════════════════════════════════════════════════════

/** أُرسلت له رسالةٌ يدويّة */
export const isWaSent = (r: any) => !!r?.waSentAt;

/** يحتاج رسالةً: له رقمٌ ولم تُرسل بعد. مَن لا رقمَ له لا يُحتسب — لا سبيل إليه. */
export const needsWa = (r: any) => !!String(r?.phone || '').trim() && !r?.waSentAt;

/** «قبل ٥ د» — بالأرقام العربيّة، ومختصرةٌ لتسع في شارةِ صفّ */
export function waAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'الآن';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'الآن';
  const arNum = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
  if (m < 60) return `قبل ${arNum(m)} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${arNum(h)} س`;
  return `قبل ${arNum(Math.floor(h / 24))} ي`;
}

export interface StatusMeta { label: string; short: string; color: string; emoji: string }

export function statusMeta(r: any): StatusMeta {
  switch (resStatus(r)) {
    case 'confirmed': return { label: 'مثبّت', short: 'مثبّت', color: RES_COLORS.attended, emoji: '✅' };
    case 'waitlist': return { label: 'قائمة انتظار', short: 'انتظار', color: RES_COLORS.waitlist, emoji: '📋' };
    default: return { label: 'غير مثبّت', short: 'غير مثبّت', color: RES_COLORS.pending, emoji: '⏳' };
  }
}

/** لونُ الشريط الجانبيّ للصفّ: الحضورُ يسبق التثبيت — هو القرار الأحدث */
export function rowAccent(r: any): string {
  if (r?.attended === true) return RES_COLORS.attended;
  if (r?.attended === false) return RES_COLORS.noShow;
  const s = resStatus(r);
  if (s === 'pending') return RES_COLORS.pending;
  if (s === 'waitlist') return RES_COLORS.waitlist;
  return RES_COLORS.neutral;
}

// ── الهاتف ──
/** أرقامٌ فقط بلا صفرٍ بادئ — للمقارنة بصرف النظر عن التنسيق */
export const normPhoneKey = (p: unknown) =>
  String(p ?? '').replace(/\D/g, '').replace(/^0+/, '');

/**
 * مطابقةُ البحث. 🔴 كان البحثُ نصّاً خاماً على `r.phone`، فلا يجد
 * `+962 79 123 4567` بكتابة `0791234567` — والدالّةُ المطبِّعة موجودةٌ في
 * الملفّ نفسه وتُستعمل لكشف التكرار وحده.
 */
export function matchesSearch(r: any, term: string): boolean {
  const t = String(term ?? '').trim().toLowerCase();
  if (!t) return true;
  if (String(r?.contactName ?? '').toLowerCase().includes(t)) return true;
  if (String(r?.notes ?? '').toLowerCase().includes(t)) return true;
  const d = t.replace(/\D/g, '');
  if (d.length >= 3 && normPhoneKey(r?.phone).includes(normPhoneKey(d))) return true;
  return false;
}

/** ترتيبُ العمل: ما يحتاج قراراً أوّلاً */
export const attendOrder = (r: any) => (r?.attended == null ? 0 : r.attended ? 1 : 2);

export interface ResCounts {
  total: number; people: number;
  confirmed: number; pending: number; waitlist: number;
  attended: number; noShow: number; unmarked: number;
  /** له رقمٌ ولم تُرسل له رسالةٌ يدويّة بعد */
  needsWa: number;
}

/** عدٌّ واحدٌ لكلّ الأرقام المعروضة — فلا يختلف رقمان على شاشةٍ واحدة */
export function countRows(rows: any[]): ResCounts {
  const c: ResCounts = {
    total: 0, people: 0, confirmed: 0, pending: 0, waitlist: 0,
    attended: 0, noShow: 0, unmarked: 0, needsWa: 0,
  };
  for (const r of rows) {
    c.total++;
    c.people += Number(r?.peopleCount) || 1;
    const s = resStatus(r);
    if (s === 'confirmed') c.confirmed++; else if (s === 'waitlist') c.waitlist++; else c.pending++;
    if (r?.attended === true) c.attended++; else if (r?.attended === false) c.noShow++; else c.unmarked++;
    if (needsWa(r)) c.needsWa++;
  }
  return c;
}
