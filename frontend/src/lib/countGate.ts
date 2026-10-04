// ══════════════════════════════════════════════════════
// 👁️ بوّابةُ عدّاد الفرق على شاشة العرض — الرقمُ يتغيّر مع قلب البطاقة لا قبله
//
// الخادمُ يرسل مع كلّ كشف (حدثُ صباح، كشفُ الإقصاء، القنبلة، الرماد، الشرطيّة) العدّادَ
// كما يصير بعده، ومقاعدَ البطاقات التي يكشفها. البوّابةُ تحبسه حتّى تُبلغها مكوّناتُ
// العرض أنّ تلك البطاقات قُلبت فعلاً (`teamCardRevealed`)، ثمّ تطبّقه.
//
// 🔴 بالترتيب: كشفان متتاليان (الإقصاءُ ثمّ القنبلة) لا يقفز ثانيهما فوق أوّلهما.
//    ولكلّ حبسٍ مؤقّتُ أمان — إن لم يُرسم المشهد (شاشةٌ أُعيد تحميلها، محرّكٌ ثلاثيّ
//    غير جاهز) يُطبَّق العدّادُ بعد المهلة بدل أن يبقى عالقاً.
// ══════════════════════════════════════════════════════

export interface TeamCountsLike { citizenAlive: number; mafiaAlive: number; neutralAlive?: number }

interface Hold {
  counts: TeamCountsLike;
  waiting: Set<number>;
  timer: ReturnType<typeof setTimeout>;
}

let queue: Hold[] = [];
let applyFn: ((c: TeamCountsLike) => void) | null = null;

/** يربط البوّابة بمُطبِّق العدّاد (setTeamCounts في صفحة العرض). */
export function bindCountGate(apply: (c: TeamCountsLike) => void): () => void {
  applyFn = apply;
  return () => { if (applyFn === apply) applyFn = null; cancelHeldCounts(); };
}

/** يحبس عدّاداً حتّى تُقلب بطاقاتُ `seats` كلّها (أو تنقضي `fallbackMs`). بلا مقاعد ⇒ يُطبَّق فوراً بالترتيب. */
export function holdTeamCounts(counts: TeamCountsLike | null | undefined, seats: Array<number | string> | null | undefined, fallbackMs = 8000): void {
  if (!counts) return;
  const waiting = new Set((seats || []).map(Number).filter(n => Number.isFinite(n)));
  const hold: Hold = { counts, waiting, timer: setTimeout(() => releaseThrough(hold), fallbackMs) };
  queue.push(hold);
  drain();
}

/** تُبلغها المكوّناتُ لحظةَ ظهور الدور على البطاقة. */
export function teamCardRevealed(seat: number | string | null | undefined): void {
  if (seat == null) return;
  const n = Number(seat);
  for (const h of queue) h.waiting.delete(n);
  drain();
}

/** عدّادٌ موثوقٌ جديد وصل (تغيّر الطور): يُلغي كلَّ حبسٍ معلّق — هو الحقيقة الأحدث. */
export function cancelHeldCounts(): void {
  for (const h of queue) clearTimeout(h.timer);
  queue = [];
}

/** هل يوجد عدّادٌ محبوس ينتظر قلب بطاقة؟ */
export function hasHeldCounts(): boolean {
  return queue.length > 0;
}

function apply(h: Hold) {
  clearTimeout(h.timer);
  applyFn?.(h.counts);
}

// يطبّق من رأس الطابور كلَّ حبسٍ اكتملت بطاقاتُه — ولا يتجاوز حبساً لم يكتمل
function drain() {
  while (queue.length && queue[0].waiting.size === 0) apply(queue.shift()!);
}

// مهلةُ حبسٍ انقضت: يُطبَّق هو وكلُّ ما قبله (لا يُطبَّق رقمٌ أحدث قبل أقدم)
function releaseThrough(h: Hold) {
  const i = queue.indexOf(h);
  if (i < 0) return;
  const done = queue.splice(0, i + 1);
  for (const x of done) apply(x);
  drain();
}
