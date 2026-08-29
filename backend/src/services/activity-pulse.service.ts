// ══════════════════════════════════════════════════════
// 🌙 نبض الليلة — اشتقاق حالة الفعاليّة للّاعب
//
// 🔴 الربط بالترتيب لا بالوقت: المباراة i من **هذه الغرفة** تُربط بالشريحة i
//    من شرائح `kind:'game'`. الربط الزمنيّ ينكسر في اللحظة التي بُنيت الميزة
//    من أجلها: حين تتأخّر الليلة أربعين دقيقة تنزلق المباراة الثانية داخل
//    نافذة الشريحة الثالثة، فيقول التطبيق «اللعبة الثالثة» واللاعب ينظر إلى الثانية.
//
// 🔴 العدّ يخصّ الغرفة لا الفعاليّة: غرفتان تلعبان الليلة نفسها بإيقاعين
//    مختلفين. ترتيبٌ عامٌّ عبر الغرف يُنتج «اللعبة الرابعة» في ليلةٍ لعب فيها
//    كلُّ لاعبٍ لعبتين — رقمٌ لا يطابق تجربة أحد.
//
// 🔴 الترتيب مُشتقٌّ لا مخزَّن: لا عمود `slot_ordinal`. يُحسب من `created_at`
//    داخل كلّ غرفة عند كلّ نداء. ثمنُه المقبول أنّ حذف مباراةٍ من الوسط يُزحزح
//    أرقام ما بعدها — وذلك يقع في التاريخ لا في ليلةٍ جارية.
//
// ⚠️ هذا الملفّ لا يبنّي شيئاً يخرج للّاعب مباشرةً؛ الإسقاط في
//    activity-pulse.projection.ts هو البوّابة الأخيرة.
// ══════════════════════════════════════════════════════

// ── الوقت: نصٌّ `HH:MM` لا طابعٌ زمنيّ ──
// هذه ساعاتُ ليلةٍ لا لحظاتٌ مطلقة (نفس عرف ScheduleEditor).
// المقارنة تجري بدقائقَ منذ منتصف الليل، مع لفٍّ للّيالي التي تعبر الثانية عشرة.

export type SlotKind = 'game' | 'break';
export interface RawSlot { kind: SlotKind; label: string; start: string; end: string }

export interface RoomMatchRow {
  id: number;
  createdAt: Date | string;
  endedAt: Date | string | null;
  isActive: boolean | null;
  winner: string | null;
  totalRounds: number | null;
}

export type SlotState = 'done' | 'live' | 'future';

export interface BoundSlot {
  ordinal: number;              // رقمُ اللعبة في هذه الغرفة (1-based)
  label: string;
  planStart: string | null;     // 'HH:MM' — null = لعبةٌ خارج الجدول المكتوب
  planEnd: string | null;
  outsidePlan: boolean;
  state: SlotState;
  matchId: number | null;
  actualStart: number | null;   // epoch-ms
  actualEnd: number | null;     // epoch-ms
  projectedStart: number;       // epoch-ms
  projectedEnd: number;         // epoch-ms
  driftMin: number | null;      // موجبٌ = تأخّر · null بلا شريحة
  winner: string | null;
}

const ORD = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
const MIN = 60_000;
const DAY_MIN = 1440;

export const ordinalLabel = (i: number) => `اللعبة ${ORD[i] || i + 1}`;

/** 'HH:MM' → دقائقُ منذ منتصف الليل، أو null إن كان النصّ فاسداً */
export function toMinutes(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** مدّةُ الشريحة عابرةً منتصف الليل — ليلةُ النادي تمتدّ بعد الثانية عشرة */
export function slotDuration(s: RawSlot): number {
  const a = toMinutes(s.start), b = toMinutes(s.end);
  if (a == null || b == null) return 0;
  const d = b - a;
  return d < 0 ? d + DAY_MIN : d;
}

// 🔴 ساعاتُ الجدول بتوقيت عمّان لا بتوقيت الخادم.
//    `setHours` كانت تُرسي «19:00» على منتصف ليل الخادم — وحاويةُ الإنتاج على
//    UTC — فظهر انحرافُ ١٨٠ دقيقة على بياناتٍ حقيقيّة (لعبةٌ بدأت 19:49 قُرئت
//    كأنّها سبقت خطّتها بساعتين). الإرساء يجب أن يكون على اليوم المدنيّ في عمّان.
const TZ = 'Asia/Amman';
const TZ_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function tzFields(d: Date) {
  const p: Record<string, string> = {};
  for (const x of TZ_FMT.formatToParts(d)) if (x.type !== 'literal') p[x.type] = x.value;
  return {
    y: Number(p.year), mo: Number(p.month), d: Number(p.day),
    h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second),
  };
}

/** إزاحةُ عمّان عن UTC عند لحظةٍ بعينها — تُحسب ولا تُفترض */
function tzOffsetMs(d: Date): number {
  const f = tzFields(d);
  return Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * تحويل ساعةِ ليلةٍ (`HH:MM`) إلى لحظةٍ مطلقة، مرتكزةً على **اليوم المدنيّ
 * للفعاليّة في عمّان**. ساعةٌ أبكرُ من بداية الليلة بكثير تُفهم على أنّها بعد
 * منتصف الليل.
 */
export function slotToEpoch(hhmm: string, activityDate: Date, anchorMin: number): number {
  const mins = toMinutes(hhmm);
  if (mins == null) return activityDate.getTime();
  const { y, mo, d } = tzFields(activityDate);
  const shifted = mins < anchorMin - 720 ? mins + DAY_MIN : mins;
  const civil = Date.UTC(y, mo - 1, d, 0, 0, 0) + shifted * MIN;
  // تخمينٌ بإزاحة لحظة الفعاليّة ثمّ تصحيحٌ بإزاحة اللحظة الهدف نفسها،
  // فلا تنكسر ليلةٌ تعبر تغييراً في التوقيت.
  const guess = civil - tzOffsetMs(activityDate);
  return civil - tzOffsetMs(new Date(guess));
}

/** ترتيبُ شرائح اللعب زمنيّاً مع لفّ منتصف الليل، والاستراحات تُطوى */
export function orderedGameSlots(gameSchedule: unknown): RawSlot[] {
  const raw = Array.isArray(gameSchedule) ? (gameSchedule as RawSlot[]) : [];
  const games = raw.filter(s => s && s.kind === 'game' && toMinutes(s.start) != null);
  if (!games.length) return [];
  const anchor = toMinutes(games[0].start)!;
  const key = (s: RawSlot) => {
    const m = toMinutes(s.start)!;
    return m < anchor - 720 ? m + DAY_MIN : m;
  };
  return [...games].sort((a, b) => key(a) - key(b));
}

/** مجموعُ الاستراحات المخطّطة بين اللعبة i-1 واللعبة i (بالدقائق) */
export function plannedBreakBefore(gameSchedule: unknown, i: number): number {
  const raw = Array.isArray(gameSchedule) ? (gameSchedule as RawSlot[]) : [];
  const gameIdx = raw.map((s, j) => [s, j] as const).filter(x => x[0]?.kind === 'game').map(x => x[1]);
  if (i <= 0) return 0;
  if (i >= gameIdx.length) return 15;         // لعبةٌ خارج الجدول: استراحةٌ افتراضيّة
  let g = 0;
  for (let k = gameIdx[i - 1] + 1; k < gameIdx[i]; k++) g += slotDuration(raw[k]);
  return g;
}

/**
 * الربط الترتيبيّ + التقدير.
 *
 * `Math.max(slots, matches)` يلتقط الحالتين الشاذّتين معاً:
 *  • غرفةٌ سريعة تلعب رابعةً في جدولٍ من ثلاث ⇒ outsidePlan، بلا انحرافٍ يُحسب لها.
 *  • غرفةٌ بطيئة تترك شريحةً بلا مباراة ⇒ تبقى `future` حتّى يحذفها الموجّه.
 */
export function bindRoomSchedule(
  gameSchedule: unknown,
  matches: RoomMatchRow[],
  activityDate: Date,
  now: number,
): BoundSlot[] {
  const slots = orderedGameSlots(gameSchedule);
  const anchor = slots.length ? toMinutes(slots[0].start)! : 19 * 60;

  const played = [...matches].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const n = Math.max(slots.length, played.length);
  const out: BoundSlot[] = [];
  let lastEnd: number | null = null;
  // هل السلسلة مرتكزةٌ على لعبةٍ بدأت فعلاً؟ ما دامت الليلة لم تبدأ فالورقة هي
  // كلّ ما نملك، فلا نَعِد ببدايةٍ أبكر منها. وحين تبدأ، يصير الواقع هو المرجع
  // في الاتجاهين: تأخّرُ لعبةٍ يؤخّر ما بعدها، وتبكيرُها يُقدّمه بالمقدار نفسه.
  let chainIsReal = false;

  for (let i = 0; i < n; i++) {
    const slot = slots[i] ?? null;
    const m = played[i] ?? null;

    // المدّة المقدّرة: متوسّط ما انتهى من ليلتك أنت، لا متوسّطٌ تاريخيّ.
    const finished = played.slice(0, i)
      .filter(x => x.endedAt)
      .map(x => new Date(x.endedAt as any).getTime() - new Date(x.createdAt).getTime())
      .filter(d => d > 0);
    const estMs = finished.length
      ? finished.reduce((a, b) => a + b, 0) / finished.length
      : (slot ? Math.max(slotDuration(slot), 15) * MIN : 65 * MIN);

    const planStart = slot ? slotToEpoch(slot.start, activityDate, anchor) : null;
    const planEnd = slot ? slotToEpoch(slot.end, activityDate, anchor) : null;
    const label = slot?.label?.trim() || ordinalLabel(i);

    if (m) {
      const started = new Date(m.createdAt).getTime();
      const ended = m.endedAt ? new Date(m.endedAt).getTime() : null;
      const isLive = !ended && m.isActive !== false;
      const projectedEnd = ended ?? started + estMs;

      out.push({
        ordinal: i + 1, label,
        planStart: slot?.start ?? null, planEnd: slot?.end ?? null,
        outsidePlan: !slot,
        state: isLive ? 'live' : 'done',
        matchId: m.id,
        actualStart: started, actualEnd: ended,
        projectedStart: started, projectedEnd,
        driftMin: planStart == null ? null : Math.round((started - planStart) / MIN),
        winner: ended ? m.winner : null,
      });
      lastEnd = projectedEnd;
      chainIsReal = true;
    } else {
      const chained = lastEnd == null
        ? (planStart ?? now)
        : lastEnd + plannedBreakBefore(gameSchedule, i) * MIN;
      // سلسلةٌ مرتكزةٌ على واقعٍ تُتَّبع كما هي؛ وإلّا فالورقة أرضيّةٌ لا نُبكّر عنها.
      const ps = planStart == null || chainIsReal ? chained : Math.max(planStart, chained);

      out.push({
        ordinal: i + 1, label,
        planStart: slot?.start ?? null, planEnd: slot?.end ?? null,
        outsidePlan: !slot,
        state: 'future',
        matchId: null,
        actualStart: null, actualEnd: null,
        projectedStart: ps, projectedEnd: ps + estMs,
        driftMin: planStart == null ? null : Math.round((ps - planStart) / MIN),
        winner: null,
      });
      lastEnd = ps + estMs;
    }
  }

  return out;
}

/** حالةُ الغرفة إجمالاً — تُشتقّ من الشرائح لا تُخزَّن */
export function roomStatus(slots: BoundSlot[]): 'pre' | 'live' | 'break' | 'ended' {
  if (slots.some(s => s.state === 'live')) return 'live';
  const anyDone = slots.some(s => s.state === 'done');
  const anyFuture = slots.some(s => s.state === 'future');
  if (anyDone && !anyFuture) return 'ended';
  if (anyDone) return 'break';
  return 'pre';
}
