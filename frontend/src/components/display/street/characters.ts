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
  constructor(private readonly items: readonly T[], private readonly rnd: () => number) {}
  private refill() { this.pool = this.items.slice(); for (let i = this.pool.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [this.pool[i], this.pool[j]] = [this.pool[j], this.pool[i]]; } }
  get remaining() { return this.pool.length; }
  peekHas(pred: (t: T) => boolean) { return this.pool.some(pred); }
  /** يسحب أوّل عنصرٍ يحقّق الشرط (أو أوّل عنصر)؛ يُعيد التعبئة عند النفاد */
  next(pred?: (t: T) => boolean): T {
    if (!this.pool.length) this.refill();
    let k = pred ? this.pool.findIndex(pred) : 0;
    if (k < 0) k = 0;
    return this.pool.splice(k, 1)[0];
  }
}

/**
 * يسحب `n` شخصيّةً للحشد:
 *  • كيسٌ واحد لكلّ العشرة ⇒ لا تكرار قبل نفاده.
 *  • التوازن: إن مال الفرق بين الجنسين عن 1 يُسحب من الكيس أوّلُ بطاقةٍ من الجنس
 *    الناقص (خروجٌ عن الترتيب لا عن الكيس). بعد نفاد النساء الأربع يبقى الرجال
 *    وحدهم — «قدر الإمكان».
 *  • لا جارَين متطابقَين: التكرار يقع فقط عند حدّ إعادة التعبئة، فتُؤجَّل
 *    البطاقةُ المطابقة لسابقتها.
 * `pool` يحصر السحب فيما حُمِّل فعلاً (تحميلٌ كسول) — الكيس يُبنى منه لا من الكلّ.
 */
export function drawCrowd(n: number, rnd: () => number, pool: readonly CharacterDef[] = CHARACTERS): CharacterDef[] {
  if (!pool.length || n <= 0) return [];
  const bag = new ShuffleBag(pool, rnd); const out: CharacterDef[] = []; let m = 0, f = 0;
  for (let i = 0; i < n; i++) {
    const need: Gender | null = m - f > 1 ? 'F' : f - m > 1 ? 'M' : null;
    const prev = out[out.length - 1];
    let pick: CharacterDef;
    if (need && bag.peekHas(c => c.gender === need && c !== prev)) pick = bag.next(c => c.gender === need && c !== prev);
    else if (bag.peekHas(c => c !== prev)) pick = bag.next(c => c !== prev);
    else pick = bag.next();                              // كيسٌ من عنصرٍ واحد
    out.push(pick); if (pick.gender === 'M') m++; else f++;
  }
  return out;
}

/**
 * محايدٌ للضحيّة: من جنسها أوّلاً، وإلّا أيُّ محايد، وإلّا null (لا شخصيّةَ دورٍ أبداً).
 * `loaded` يحصر الاختيار فيما حُمِّل — البديلُ عند فشل التحميل محايدٌ أيضاً.
 */
export function pickNeutral(gender: Gender, rnd: () => number, loaded?: ReadonlySet<string>): CharacterDef | null {
  const ok = NEUTRAL.filter(c => !loaded || loaded.has(c.id));
  const same = ok.filter(c => c.gender === gender);
  const from = same.length ? same : ok;
  return from.length ? from[Math.floor(rnd() * from.length)] : null;
}
