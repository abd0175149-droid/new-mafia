// ══════════════════════════════════════════════════════
// 📅 قالبُ الأسبوع — تعريفٌ واحد
//
// مستخرَجٌ من ستّة أسابيعَ فعليّة (٢٦/٧ — ٤/٩ ٢٠٢٦): أربعُ ليالٍ ثابتة،
// ونفسُ الإعدادات في كلٍّ منها حرفيّاً. والسعةُ وحدها تختلف باليوم، مضبوطةً
// على متوسّط الحجوزات الحقيقيّ لا على التخمين.
//
// 🔴 الأسبوعُ يبدأ الأحد وينتهي الجمعة (قرار المالك) — لا الاثنين ولا السبت.
//    وجافاسكربت تعدّ الأحد صفراً، فبدايةُ الأسبوع = اليوم ناقص getDay().
//
// 🔴 والأوقاتُ تُخزَّن UTC: `activities.date` بتوقيت UTC، وعمّان +٣ صيفاً.
//    ١٩:٠٠ عمّان = ١٦:٠٠ UTC. أمّا `game_schedule` فبتوقيت عمّان الجداريّ —
//    مرجعان مختلفان في صفٍّ واحد، وخلطُهما يُزيح الليلةَ ثلاثَ ساعات.
// ══════════════════════════════════════════════════════

export interface WeeklyDay {
  /** 0=الأحد … 6=السبت */
  dow: number;
  labelAr: string;
  /** ساعةُ فتح الأبواب بتوقيت عمّان */
  doorsAmman: string;
  maxCapacity: number;
}

/** أربعُ ليالٍ — الأحد · الثلاثاء · الخميس · الجمعة */
export const WEEKLY_DAYS: WeeklyDay[] = [
  { dow: 0, labelAr: 'الأحد',    doorsAmman: '19:00', maxCapacity: 30 },
  { dow: 2, labelAr: 'الثلاثاء', doorsAmman: '19:00', maxCapacity: 30 },
  { dow: 4, labelAr: 'الخميس',   doorsAmman: '19:00', maxCapacity: 45 },
  { dow: 5, labelAr: 'الجمعة',   doorsAmman: '19:00', maxCapacity: 45 },
];

/**
 * برنامجُ الليلة — أربعُ ألعابٍ واستراحاتٌ ١٥ دقيقة.
 *
 * 🔴 الاستراحةُ ١٥ لا ١٠: الوسيطُ المقيس من خمسَ عشرةَ مباراةً فعليّة كان ١٥
 *    (المدى ٥–٣٠). و١٠ المكتوبةُ سابقاً لم تتحقّق ولا مرّة.
 *
 * 🔴 والبدايةُ تبقى ١٩:٣٠ رغم أنّ الواقعَ ١٩:٤٥–٢٠:٢٢: الجدولُ هدفٌ يشدّ الناس،
 *    و«نبض الليلة» يُزيح الخطّةَ على شاشة اللاعب بمقدار التأخّر الفعليّ —
 *    فلا يكذب عليه أحد. وإزاحةُ الهدف تُزيح التأخّرَ معه لا تُلغيه.
 */
export const WEEKLY_SCHEDULE = [
  { kind: 'game',  label: 'اللعبة الأولى',  start: '19:30', end: '20:30' },
  { kind: 'break', label: 'استراحة',        start: '20:30', end: '20:45' },
  { kind: 'game',  label: 'اللعبة الثانية', start: '20:45', end: '21:45' },
  { kind: 'break', label: 'استراحة',        start: '21:45', end: '22:00' },
  { kind: 'game',  label: 'اللعبة الثالثة', start: '22:00', end: '23:00' },
  { kind: 'break', label: 'استراحة',        start: '23:00', end: '23:15' },
  { kind: 'game',  label: 'اللعبة الرابعة', start: '23:15', end: '00:15' },
] as const;

/** قيودُ الجلوس — فصلُ الجنسين معطّلٌ افتراضيّاً (قرار المالك). */
export const WEEKLY_SEAT_CONSTRAINTS = {
  strictness: 'relaxed',
  engineEnabled: true,
  constraints: [
    { type: 'NO_ADJACENT_PAIRS',          params: {}, enabled: true,  priority: 1 },
    { type: 'PENALTY_NEIGHBOR_AVOIDANCE', params: {}, enabled: true,  priority: 2 },
    { type: 'NEW_PLAYER_SEPARATION',      params: {}, enabled: true,  priority: 3 },
    { type: 'HIGH_RANK_SEPARATION',       params: {}, enabled: false, priority: 4 },
    { type: 'GENDER_SEPARATION',          params: {}, enabled: false, priority: 8 },
  ],
};

/** بقيّةُ الإعدادات — منقولةٌ حرفيّاً عن فعاليّات الأسبوع الماضي. */
export const WEEKLY_DEFAULTS = {
  basePrice: '3.00',
  difficulty: 'medium',
  requireTicket: false,
  menuOrderingEnabled: true,
  addGameFeeToBill: true,
  geofenceEnabled: true,
  status: 'planned' as const,
};

const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيّار', 'حزيران',
  'تمّوز', 'آب', 'أيلول', 'تشرين الأوّل', 'تشرين الثاني', 'كانون الأوّل'];

/** «مزاج افندينا ٣ أيلول» — اسمُ المكان واليومُ والشهر، كما جرت العادة. */
export function weeklyActivityName(locationName: string, d: Date): string {
  return `${locationName} ${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}`;
}

/**
 * بدايةُ الأسبوع الذي **يُجهَّز له** الآن — أحدٌ عند منتصف ليله بتوقيت عمّان.
 *
 * 🔴 السبتُ يومٌ خارج الأسبوع لا آخرُه: الأسبوعُ عندنا الأحد ← الجمعة، فالسبتُ
 *    يومُ التجهيز. مَن يفتح النافذةَ يومَ السبت يريد أسبوعاً لم يبدأ بعد، لا
 *    أسبوعاً انتهى أمس — فيُقفز به إلى أحدِ الغد.
 *    (كان يرجع إلى أحدِ الأسبوع المنقضي فيرى أربعةَ أيّامٍ «موجودةٌ سلفاً»
 *     ولا شيءَ لإنشائه — أداةٌ لا تعمل في اليوم الوحيد الذي تُستعمل فيه.)
 *
 * 🔴 ويُحسب على التقويم المدنيّ لعمّان لا على UTC: ليلةُ الجمعة تمتدّ إلى ما بعد
 *    منتصف الليل، فـ٠٠:٣٠ عمّان يوم السبت هي ٢١:٣٠ UTC يوم الجمعة — ولو حُسب
 *    اليومُ من UTC لعُدّت تلك اللحظةُ يومَ جمعةٍ فيُزاح الأسبوعُ كلُّه.
 */
export function weekStartAmman(ref: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(ref);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const [y, m, d] = [Number(get('year')), Number(get('month')), Number(get('day'))];
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[get('weekday')] ?? 0;
  const civil = Date.UTC(y, m - 1, d);
  // السبت (٦) ⇒ أحدُ الغد · وإلّا ⇒ أحدُ هذا الأسبوع
  return new Date(dow === 6 ? civil + 86_400_000 : civil - dow * 86_400_000);
}

/** لحظةُ فتح الأبواب بـUTC ليومٍ مدنيٍّ في عمّان وساعةٍ جداريّة. */
export function ammanWallToUtc(civilDayUtcMidnight: Date, hhmm: string): Date {
  const [h, mi] = hhmm.split(':').map(Number);
  // عمّان +٣ طوال العام منذ إلغاء التوقيت الصيفيّ (٢٠٢٢)
  return new Date(civilDayUtcMidnight.getTime() + (h - 3) * 3_600_000 + mi * 60_000);
}
