// ══════════════════════════════════════════════════════
// 👥 سجلّ الشخصيّات + الكيسُ المخلوط + قاعدةُ الحياد (قرارات المالك 2026-09-25)
// ══════════════════════════════════════════════════════
// عشرُ شخصيّات (Meshy + Mixamo). الحشدُ يُسحب من «كيسٍ مخلوط»: لا تتكرّر شخصيّةٌ
// قبل نفاد الكيس، والجنسان متوازنان قدر الإمكان، ولا جارَين متطابقَين.
// الشكلُ لا يرتبط بلاعب: يُخلط من جديد في كلّ مشهد (سياسة engine.ts: الهويّة
// في البطاقة لا في المشهد).
//
// 🔴 الحياد: مَن يُقصى أو يسقط (المحكوم، ضحايا الحشد، أيّ fall/react_death) لا
//    يكون إلّا من المحايدين — شخصيّةٌ تدلّ على دور (شرطيّة، طبيب…) تظهر في
//    الحشد والشارع فقط ولا تُطلب للإقصاء أبداً. `pickNeutral` هو البابُ الوحيد
//    لاختيار الضحيّة، و`assertNeutral` في المحرّك يصرخ ويُصحّح إن خُرقت.

export type Gender = 'M' | 'F';
export interface CharacterDef {
  id: string; gender: Gender;
  /** الطول في المشهد (قرار المالك) */
  h: number;
  /** محايدٌ ⇒ يجوز أن يُقصى */
  neutral: boolean;
  label: string;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'citizen_f', gender: 'F', h: 1.70, neutral: true, label: 'مواطنة' },
  { id: 'jazz_singer', gender: 'F', h: 1.70, neutral: true, label: 'مغنّية الجاز' },
  { id: 'newsboy', gender: 'M', h: 1.80, neutral: true, label: 'بائع الصحف' },
  { id: 'worker', gender: 'M', h: 1.85, neutral: true, label: 'العامل' },
  { id: 'policewoman', gender: 'F', h: 1.70, neutral: false, label: 'الشرطيّة' },
  { id: 'detective', gender: 'M', h: 1.85, neutral: false, label: 'المحقّق' },
  { id: 'doctor', gender: 'M', h: 1.80, neutral: false, label: 'الطبيب' },
  { id: 'hitman', gender: 'M', h: 1.85, neutral: false, label: 'القاتل المأجور' },
  { id: 'consigliere', gender: 'M', h: 1.80, neutral: false, label: 'المستشار' },
  { id: 'mafia_boss', gender: 'M', h: 1.85, neutral: false, label: 'زعيم المافيا' },
];
const BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));
export const NEUTRAL: readonly CharacterDef[] = CHARACTERS.filter(c => c.neutral);
export const charOf = (id: string): CharacterDef | undefined => BY_ID.get(id);
export const isNeutral = (id: string): boolean => !!BY_ID.get(id)?.neutral;
/** مسار الملفّ: الكامل للقطات القريبة، والمخفَّف (≤ ~9k مثلّث) للحشد والمشاة */
export const charPath = (id: string, lite: boolean) => `/3d/sketchfab/${id}/scene${lite ? '.lite' : ''}.glb`;

/** كيسٌ مخلوط: كلُّ عنصرٍ يخرج مرّةً قبل أن يتكرّر أيٌّ منها */
export class ShuffleBag<T> {
  private pool: T[] = [];
  private readonly items: readonly T[]; private readonly rnd: () => number;
  // بلا «خصائص معاملات» في المُنشئ: Node يجرّد أنواع TS لكنّه لا يدعمها، وهذا الملفّ يُختبر من Node
  constructor(items: readonly T[], rnd: () => number) { this.items = items; this.rnd = rnd; }
  private refill() { this.pool = this.items.slice(); for (let i = this.pool.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [this.pool[i], this.pool[j]] = [this.pool[j], this.pool[i]]; } }
  get remaining() { return this.pool.length; }
  /** عددُ عناصر الكيس الأصليّة — صفرٌ يعني لا شيء من هذا الجنس محمَّلاً */
  get size() { return this.items.length; }
  /** هل في الكيس (أو بعد إعادة تعبئته إن نفد) عنصرٌ يحقّق الشرط؟ */
  peekHas(pred: (t: T) => boolean) { return (this.pool.length ? this.pool : this.items).some(pred); }
  /** يسحب أوّل عنصرٍ يحقّق الشرط (أو أوّل عنصر)؛ يُعيد التعبئة عند النفاد */
  next(pred?: (t: T) => boolean): T {
    if (!this.pool.length) this.refill();
    if (pred && !this.pool.some(pred) && this.pool.length < this.items.length) { /* الشرطُ يخيب في بقيّة الكيس: أعِد التعبئة كي لا يُفرض تكرارٌ لجارٍ متطابق */ const rest = this.pool; this.refill(); this.pool = this.pool.filter(t => !rest.includes(t)).concat(rest); }
    let k = pred ? this.pool.findIndex(pred) : 0;
    if (k < 0) k = 0;
    return this.pool.splice(k, 1)[0];
  }
}

/** طلبُ بطاقةٍ لموضعٍ في الحشد: جنسُ اللاعب، وهل يجب أن تكون محايدة (سيُقصى) */
export interface CrowdSlot { gender: Gender; neutral?: boolean }

/**
 * يسحب بطاقةً لكلّ موضع بترتيب الحشد:
 *  • كيسان بحسب جنس اللاعب (النساء يدرن على الأربع، والرجال على الستّ) ⇒ الشكلُ من
 *    جنس اللاعب دائماً، والتوازنُ يتبع اللاعبين الحقيقيّين لا افتراضاً.
 *  • داخل كلّ كيس لا تتكرّر بطاقةٌ قبل نفاده؛ وعند إعادة التعبئة تُؤجَّل البطاقةُ
 *    المطابقة للجار السابق فلا جارَين متطابقَين.
 *  • موضعٌ سيُقصى (`neutral`) يأخذ أوّلَ محايدٍ من جنسه في الكيس؛ فإن خلا الكيس منه
 *    يُسحب محايدٌ من جنسه خارج الكيس (تكرارٌ مقبول — الحيادُ أولى)، وإن لم يوجد
 *    محايدٌ من جنسه فمن الجنس الآخر، وإن لم يوجد محايدٌ أصلاً فـnull (لا شخصيّةَ دور).
 * `pool` يحصر السحب فيما حُمِّل فعلاً (تحميلٌ كسول).
 */
export function drawCrowd(slots: readonly CrowdSlot[], rnd: () => number, pool: readonly CharacterDef[] = CHARACTERS): (CharacterDef | null)[] {
  const bags: Record<Gender, ShuffleBag<CharacterDef>> = {
    M: new ShuffleBag(pool.filter(c => c.gender === 'M'), rnd), F: new ShuffleBag(pool.filter(c => c.gender === 'F'), rnd),
  };
  const out: (CharacterDef | null)[] = []; let prev: CharacterDef | null = null;
  for (const sl of slots) {
    const bag = bags[sl.gender].size ? bags[sl.gender] : bags[sl.gender === 'M' ? 'F' : 'M'];
    let pick: CharacterDef | null = null;
    if (sl.neutral) {
      const okN = (c: CharacterDef) => c.neutral && c !== prev;
      if (bag.peekHas(okN)) pick = bag.next(okN);
      else { const n = pool.filter(c => c.neutral && c !== prev); const same = n.filter(c => c.gender === sl.gender); const from = same.length ? same : n; pick = from.length ? from[Math.floor(rnd() * from.length)] : null; }
    } else if (bag.size) {
      pick = bag.peekHas(c => c !== prev) ? bag.next(c => c !== prev) : bag.next();
    }
    out.push(pick); if (pick) prev = pick;
  }
  return out;
}

/**
 * محايدٌ للضحيّة: من جنسها أوّلاً، وإلّا أيُّ محايد، وإلّا null (لا شخصيّةَ دورٍ أبداً).
 * `loaded` يحصر الاختيار فيما حُمِّل — البديلُ عند فشل التحميل محايدٌ أيضاً.
 */
export function pickNeutral(gender: Gender, rnd: () => number, loaded?: ReadonlySet<string>, exclude?: ReadonlySet<string>): CharacterDef | null {
  const all = NEUTRAL.filter(c => !loaded || loaded.has(c.id));
  const ok = exclude && all.some(c => !exclude.has(c.id)) ? all.filter(c => !exclude.has(c.id)) : all;   // تجنّبُ الجيران إن أمكن
  const same = ok.filter(c => c.gender === gender);
  const from = same.length ? same : ok;
  return from.length ? from[Math.floor(rnd() * from.length)] : null;
}
