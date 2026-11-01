// ══════════════════════════════════════════════════════
// 📸 زاوية بلا تصوير — نسخة الواجهة من الهندسة المحضة (2026-11-01)
//
// ⚠️ نسخةٌ حرفيّة من backend/src/game/seating/photo-zone.ts بدءاً من PhotoZoneCtx —
//    الفحص (test-photo-zone.ts) يفشل إن اختلفتا. عدّل الخادم ثمّ انسخ.
//    الليدر يحسب منها حالة الكتلة وتظليل الخريطة وتنبيه النقل قبل التنفيذ.
// ══════════════════════════════════════════════════════

export interface PhotoZoneCtx {
  /** أوّل كرسيّ في الزاوية (١..N) */
  anchor: number;
  /** رافضون محجوزون لهذه الغرفة لم يصلوا بعد */
  pending: number;
}

/** شاغل مقعدٍ كما تراه الزاوية */
export interface ZoneOccupant { noPhoto?: boolean; locked?: boolean; name?: string }

const norm = (seat: number, n: number) => ((((seat - 1) % n) + n) % n) + 1;
export const nextSeat = (seat: number, n: number) => norm(seat + 1, n);
export const prevSeat = (seat: number, n: number) => norm(seat - 1, n);

/** كم خطوةً للأمام من المرساة حتى المقعد (٠ = المرساة نفسها) */
export function forwardOffset(seat: number, anchor: number, n: number): number {
  return (((seat - anchor) % n) + n) % n;
}

export function clampAnchor(anchor: unknown, n: number): number {
  const a = Math.floor(Number(anchor));
  return Number.isFinite(a) && a >= 1 && a <= n ? a : 1;
}

/**
 * القطع المتّصلة دائريّاً من مجموعة مقاعد — كلّ قطعة مرتّبة للأمام.
 * طاولةٌ كلّها رافضون = قطعة واحدة تبدأ بأصغر رقم.
 */
export function segmentsOf(seats: Iterable<number>, n: number): number[][] {
  const set = new Set<number>();
  // forEach لا for-of: نسخة الواجهة تُبنى لـES5 (لا تكرار على Map/Set/Iterable)
  Array.from(seats).forEach(s => { if (s >= 1 && s <= n) set.add(s); });
  if (set.size === 0) return [];
  if (set.size === n) return [Array.from({ length: n }, (_, i) => i + 1)];
  const out: number[][] = [];
  for (const s of Array.from(set).sort((a, b) => a - b)) {
    if (set.has(prevSeat(s, n))) continue;          // ليس بداية قطعة
    const seg = [s];
    let cur = nextSeat(s, n);
    while (set.has(cur) && cur !== s) { seg.push(cur); cur = nextSeat(cur, n); }
    out.push(seg);
  }
  return out;
}

/**
 * الكتلة الرئيسيّة: الأطول، وعند التساوي الأقرب للمرساة (التي تحويها أوّلاً).
 * هي «الزاوية» الفعليّة التي يلتصق بها كلّ رافضٍ جديد.
 */
export function mainSegment(segs: number[][], anchor: number, n: number): number[] | null {
  if (segs.length === 0) return null;
  const score = (seg: number[]) => (seg.includes(anchor) ? -1 : forwardOffset(seg[0], anchor, n));
  return segs.slice().sort((a, b) => (b.length - a.length) || (score(a) - score(b)))[0];
}

/** المقاعد المشغولة برافضين (لاعبون ومتفرّجون معاً — كلّهم على كراسي الحلقة) */
export function noPhotoSeatsOf(occupied: Map<number, ZoneOccupant>): number[] {
  const out: number[] = [];
  occupied.forEach((o, seat) => { if (o?.noPhoto === true) out.push(seat); });
  return out;
}

/**
 * الزاوية المتوقَّعة: من بداية الكتلة الرئيسيّة (أو المرساة إن لم يجلس رافضٌ بعد)
 * للأمام، بحجم الجالسين الرافضين + المنتظرين + مقعد احتياط.
 */
export function expectedZone(occupied: Map<number, ZoneOccupant>, ctx: PhotoZoneCtx, n: number): Set<number> {
  const np = noPhotoSeatsOf(occupied);
  const main = mainSegment(segmentsOf(np, n), ctx.anchor, n);
  const start = main ? main[0] : ctx.anchor;
  const size = Math.min(n, np.length + Math.max(0, ctx.pending | 0) + 1);
  const z = new Set<number>();
  for (let i = 0; i < size; i++) z.add(norm(start + i, n));
  return z;
}

/** نسبة الرافضين المتوقَّعة: المرصودة بين الجالسين مُلطَّفةً بأولويّة ٢٥٪ (وزن ٤ مقاعد) */
const PRIOR_RATIO = 0.25, PRIOR_WEIGHT = 4;
export function expectedRatio(occupied: Map<number, ZoneOccupant>): number {
  let np = 0;
  occupied.forEach(o => { if (o?.noPhoto === true) np++; });
  return (np + PRIOR_RATIO * PRIOR_WEIGHT) / (occupied.size + PRIOR_WEIGHT);
}

/**
 * ممرّ النموّ: مقاعد بعد نهاية الزاوية المتوقَّعة (وقليلٌ قبلها) تتّسع لمن يُتوقَّع وصوله
 * من الرافضين. بدونه يجلس قابلان على جانبَي أوّل رافض فتنكسر الكتلة عند الثاني.
 *
 * الحجم = المتوقَّع + هامش ١٫٥ انحراف (عدد الرافضين القادمين متغيّر عشوائيّ لا رقم)،
 * والقيمة لكلّ مقعد «قربه» من الكتلة (٠..١]: القابل المضطرّ يأخذ الأبعد أوّلاً،
 * فيُملأ الممرّ من طرفه البعيد نحو الزاوية لا العكس.
 */
export function growthCorridor(occupied: Map<number, ZoneOccupant>, ctx: PhotoZoneCtx, n: number): Map<number, number> {
  const zone = expectedZone(occupied, ctx, n);
  const free = n - occupied.size;
  const rest = Math.max(0, free - zone.size);
  const r = expectedRatio(occupied);
  const mu = rest * r, sd = Math.sqrt(rest * r * (1 - r));
  const b = Math.min(rest, Math.max(1, Math.ceil(mu + 1.5 * sd)));
  const back = Math.min(rest, Math.max(1, Math.ceil(b / 4)));
  // الزاوية تبدأ من رأس الكتلة (أو المرساة) — كما في expectedZone — فنهايتها بعدها بحجمها
  const main = mainSegment(segmentsOf(noPhotoSeatsOf(occupied), n), ctx.anchor, n);
  const head = main ? main[0] : ctx.anchor;
  const end = norm(head + zone.size - 1, n);
  const c = new Map<number, number>();
  for (let i = 1; i <= b; i++) { const s = norm(end + i, n); if (!zone.has(s) && !c.has(s)) c.set(s, (b - i + 1) / (b + 1)); }
  for (let i = 1; i <= back; i++) { const s = norm(head - i, n); if (!zone.has(s) && !c.has(s)) c.set(s, (back - i + 1) / (back + 1)); }
  return c;
}

/**
 * رتبة المقعد في الزاوية — **أصغر = أفضل**، وتسبق كلّ نقاط القواعد الليّنة.
 *
 * للرافض: عدد قطع الكتلة بعد جلوسه أوّلاً (الملتصق لا يزيدها، والجسر بين قطعتين
 * ينقصها)، ثمّ تفضيل الامتداد للأمام على الخلف، ثمّ القرب من الكتلة.
 * للقابل: ٠ خارج الزاوية وممرّ نموّها · (١..٢] في الممرّ (الأقرب للكتلة أسوأ) · ٣ داخل الزاوية.
 * القواعد الليّنة (الأصحاب، الجدد…) تعمل كاملةً داخل الطبقة ٠ — وهي أغلب الطاولة.
 */
export function zoneRank(
  seat: number,
  joinerNoPhoto: boolean,
  occupied: Map<number, ZoneOccupant>,
  ctx: PhotoZoneCtx,
  n: number,
): number {
  if (!joinerNoPhoto) {
    if (expectedZone(occupied, ctx, n).has(seat)) return 3;
    const near = growthCorridor(occupied, ctx, n).get(seat);
    return near === undefined ? 0 : 1 + near;
  }

  const np = noPhotoSeatsOf(occupied);
  const segs = segmentsOf(np, n);
  if (segs.length === 0) return forwardOffset(seat, ctx.anchor, n);   // أوّل رافض: المرساة فما بعدها

  const after = segmentsOf([...np, seat], n).length;
  const main = mainSegment(segs, ctx.anchor, n)!;
  const head = main[0], tail = main[main.length - 1];
  const touch = seat === nextSeat(tail, n) ? 0 : seat === prevSeat(head, n) ? 1 : 2;
  let dist = n;
  for (const m of main) dist = Math.min(dist, Math.abs(seat - m), n - Math.abs(seat - m));
  // segs(after) يحسم أوّلاً، ثمّ الالتصاق بالكتلة الرئيسيّة، ثمّ المسافة
  return (after - 1) * (n * 4) + touch * n + dist;
}

// ══════════════════════════════════════════════════════
// 📋 التقرير — لليدر والتنبيهات والفحص
// ══════════════════════════════════════════════════════

export interface ZoneFix {
  /** مقعد الرافض الخارج عن الكتلة */
  from: number;
  /** المقعد الملاصق للكتلة الذي ينتقل إليه */
  to: number;
  /** القابل الذي يُبادَل معه (null = المقعد فارغ: نقلٌ بسيط) */
  swapWith: string | null;
}

export interface ZoneReport {
  count: number;
  /** كلّ القطع، والرئيسيّة أوّلاً */
  segments: number[][];
  contiguous: boolean;
  /** «١–٤» أو «١٥–٢» عند الالتفاف، وقطعٌ متعدّدة بـ« · » */
  label: string;
  /** رافضون خارج الكتلة الرئيسيّة */
  outside: number[];
  /** اقتراح إصلاحٍ لأوّل خارج (يُعاد الحساب بعد كلّ إصلاح) */
  fix: ZoneFix | null;
  /** الزاوية المتوقَّعة — لتظليل الخريطة */
  zone: number[];
}

const segLabel = (seg: number[]) => (seg.length === 1 ? `${seg[0]}` : `${seg[0]}–${seg[seg.length - 1]}`);

/**
 * يقترح لمقعدٍ خارج الكتلة مقعداً ملاصقاً لها: الأمام أوّلاً ثمّ الخلف.
 * المقعد الفارغ نقلٌ بسيط، والقابل غير المقفل تبديل؛ الرافض أو المقفل لا يُمسّ.
 */
export function suggestFix(
  from: number,
  occupied: Map<number, ZoneOccupant>,
  ctx: PhotoZoneCtx,
  n: number,
  isFree: (seat: number) => boolean = () => true,
): ZoneFix | null {
  const rest = new Map(occupied); rest.delete(from);
  const main = mainSegment(segmentsOf(noPhotoSeatsOf(rest), n), ctx.anchor, n);
  if (!main) return null;
  const cands = [nextSeat(main[main.length - 1], n), prevSeat(main[0], n)];
  for (const to of cands) {
    if (to === from) return null;                     // ملاصقٌ أصلاً
    const o = rest.get(to);
    if (!o) { if (isFree(to)) return { from, to, swapWith: null }; continue; }
    if (o.noPhoto === true || o.locked) continue;
    return { from, to, swapWith: o.name || `#${to}` };
  }
  return null;
}

export function zoneReport(
  occupied: Map<number, ZoneOccupant>,
  ctx: PhotoZoneCtx,
  n: number,
  isFree?: (seat: number) => boolean,
): ZoneReport {
  const np = noPhotoSeatsOf(occupied);
  const segs = segmentsOf(np, n);
  const main = mainSegment(segs, ctx.anchor, n);
  const ordered = main ? [main, ...segs.filter(s => s !== main)] : [];
  const outside = main ? np.filter(s => !main.includes(s)).sort((a, b) => a - b) : [];
  // أصغر قطعةٍ خارجة أوّلاً — نقل الفرد أسهل من تفكيك ثنائيّ
  let fix: ZoneFix | null = null;
  if (outside.length) {
    const bySize = ordered.slice(1).sort((a, b) => a.length - b.length);
    for (const seg of bySize) {
      for (const s of seg) { fix = suggestFix(s, occupied, ctx, n, isFree); if (fix) break; }
      if (fix) break;
    }
  }
  return {
    count: np.length,
    segments: ordered,
    contiguous: segs.length <= 1,
    label: ordered.map(segLabel).join(' · '),
    outside,
    fix,
    zone: Array.from(expectedZone(occupied, ctx, n)),
  };
}

/**
 * هل يكسر تغييرُ مقاعد مقترح الكتلة؟ (للنقل والإدراج قبل التنفيذ)
 * `map`: المقعد القديم ← الجديد لمن يتحرّك.
 */
export function breaksZone(
  occupied: Map<number, ZoneOccupant>,
  map: Map<number, number>,
  ctx: PhotoZoneCtx,
  n: number,
): { before: number; after: number; broken: boolean } {
  const before = segmentsOf(noPhotoSeatsOf(occupied), n).length;
  const moved = new Map<number, ZoneOccupant>();
  occupied.forEach((o, seat) => { moved.set(map.get(seat) ?? seat, o); });
  const after = segmentsOf(noPhotoSeatsOf(moved), n).length;
  return { before, after, broken: after > Math.max(1, before) };
}
