// ══════════════════════════════════════════════════════
// 👁️ ما تعرفه القاعة — عدّادُ الفرق العلنيّ وأدوارُ الموتى المكشوفة
//
// 🔴 الحالةُ تُعلّم الميّت لحظةَ الفعل (حسمُ الليل، فرزُ التصويت)، والقاعةُ لا تعرف
//    شيئاً حتّى يُكشف الكرت. كان العدّادُ (مواطنون/مافيا/مستقلّون) يُحسب من الحالة
//    مباشرةً فينقص على شاشة العرض وفي كلّ هاتف قبل الكشف — فيعرف الجميعُ فريقَ
//    الضحيّة قبل أن تُقلب بطاقتها. هنا الحسابُ كما تراه القاعة: كلُّ ميّتٍ لم يُكشف
//    يُعدّ حيّاً بدوره السابق، ويتغيّر العدّادُ مع الكشف نفسه.
//
// مصدرٌ واحد يخدم إسقاطَ الحالة للهواتف (أدوار الموتى) وعدّادَ الفرق في كلّ بثّ.
// ══════════════════════════════════════════════════════

import { getTeamCounts, isMafiaRole, type Role, type TeamCounts } from './roles.js';

export interface RevealOptions {
  /** احسبْ كأنّ نتيجة الإقصاء النهاريّ كُشفت (لحظة «كشف الأدوار» قبل حفظ العلم). */
  revealElimination?: boolean;
  /** احسبْ كأنّ ضحايا القنبلة المحبوسة كُشفوا. */
  revealHeldBomb?: boolean;
  /**
   * 📱 للهواتف والمتفرّجين: ما أعلنه الموجّه ولم تقلب شاشةُ القاعة بطاقتَه بعد يبقى محجوباً
   *    (`state.phoneHold` — sockets/phone-hold.ts). الشاشةُ والموجّه لا يمرّران هذا الخيار.
   */
  forPhones?: boolean;
}

/**
 * 📱 مقاعدُ أُعلنت على الشاشة وتنتظر قلبَ بطاقاتها — محجوبةٌ عن الهواتف حتّى تُبلغ الشاشةُ
 *    بالقلب أو تنقضي المهلة (`deadline`). المهلةُ هنا أيضاً: حبسٌ ضاع مؤقّتُه لا يبقى أبداً.
 */
export function phoneHeldSeats(state: any, now = Date.now()): Set<number> {
  const out = new Set<number>();
  for (const g of state?.phoneHold || []) {
    if (!(Number(g?.deadline) > now)) continue;
    for (const s of g.seats || []) out.add(Number(s));
  }
  return out;
}

/** خرج أمام الجميع (طردٌ بالعقوبات أو إقصاءٌ إداريّ) — موتُه علنيّ ودورُه وحده سرّ حتّى يُقلب كرتُه */
const publiclyOut = (p: any) => p?.isAlive === false && (p.penaltyKicked || p.adminEliminated);

/** المقاعدُ الميّتة التي لم يُكشف دورُها بعد — موتُها في الحالة يسبق إعلانَه. */
export function unrevealedDeadSeats(state: any, opts: RevealOptions = {}): Set<number> {
  const out = new Set<number>();
  if (!state) return out;
  // إقصاءُ النهار: يُعلَّم الميّتُ قبل «كشف الأدوار»
  if (!opts.revealElimination && state.phase === 'DAY_ELIMINATION' && !state.eliminationRevealed) {
    for (const id of state.pendingResolution?.eliminated || []) out.add(Number(id));
  }
  // ضحايا القنبلة المحبوسة — في طور الإقصاء وحده: نتيجةٌ عالقة بعده لا تُخفي موتى الليل التالي
  //    (ومعهم الأخُ الأكبر إن انتحر بالقنبلة: كان موتُه يظهر فوراً فيكشف أنّ المُقصى شيخُ المافيا)
  if (!opts.revealHeldBomb && state.phase === 'DAY_ELIMINATION') {
    for (const id of state.heldBombResult?.bombEliminated || []) out.add(Number(id));
    for (const id of state.heldBombResult?.twinSuicideSeats || []) out.add(Number(id));
  }
  // الليل: كلُّ حدثٍ لم يعرضه الموجّه بعد
  for (const ev of state.morningEvents || []) {
    if (ev?.revealed) continue;
    if (ev?.targetPhysicalId != null) out.add(Number(ev.targetPhysicalId));
    const sniper = ev?.extra?.sniperPhysicalId;
    if (sniper != null) out.add(Number(sniper));
  }
  if (opts.forPhones) for (const s of phoneHeldSeats(state)) out.add(s);
  // مَن خرج أمام الجميع لا يُعاد «حيّاً» — سرُّه دورُه وحده (roleHiddenSeats)
  for (const p of state.players || []) if (publiclyOut(p)) out.delete(Number(p.physicalId));
  return out;
}

/** 🃏 خرجوا أمام الجميع ولم يُقلب كرتُهم بعد: لا دورَ لهم في أيّ هاتف، ولا يتحرّك العدّادُ بهم */
export function roleHiddenSeats(state: any, opts: RevealOptions = {}): Set<number> {
  const out = new Set<number>();
  const held = opts.forPhones ? phoneHeldSeats(state) : new Set<number>();
  for (const p of state?.players || []) {
    if (!publiclyOut(p)) continue;
    if (!p.cardRevealed || held.has(Number(p.physicalId))) out.add(Number(p.physicalId));
  }
  return out;
}

/**
 * 📱 الدورُ كما يجوز أن يعرفه الهاتف: الأخُ الأصغر المتحوّل يبقى «الأخ الأصغر» — عند نفسه
 *    وعند المافيا — حتّى يُعلن موتُ أخيه ويُخطَر بالتحوّل (twin-notify). دورُه الجديد قبل ذلك
 *    يكشف أنّ الأكبر مات.
 */
export function announcedRoleOf(state: any, p: any): string | null {
  const t = state?.twinState;
  if (t?.transformed && !t.transformNotified && Number(p?.physicalId) === Number(t.youngerBrotherPhysicalId)) return 'YOUNGER_BROTHER';
  return p?.role ?? null;
}

/** 📱 حيٌّ في نظر الهواتف: ميّتٌ لم يُعلن موتُه حيّ */
export function phoneAlive(state: any, p: any, hidden?: Set<number>): boolean {
  if (!p) return false;
  if (p.isAlive !== false) return true;
  return (hidden ?? unrevealedDeadSeats(state, { forPhones: true })).has(Number(p.physicalId));
}

/** 📱 زملاءُ المافيا كما يراهم هاتفُ أحدهم — بلا موتٍ لم يُعلن ولا تحوّلٍ لم يُعلن */
export function phoneMafiaTeam(state: any, viewerSeat: number | null): Array<{ physicalId: number; name: string; role: string; avatarUrl: string | null }> {
  const hidden = unrevealedDeadSeats(state, { forPhones: true });
  return (state?.players || [])
    .filter((p: any) => {
      const r = announcedRoleOf(state, p);
      return r && isMafiaRole(r as Role) && phoneAlive(state, p, hidden) && p.physicalId !== viewerSeat;
    })
    .map((p: any) => ({ physicalId: p.physicalId, name: p.name, role: announcedRoleOf(state, p) as string, avatarUrl: p.avatarUrl || null }));
}

/**
 * عدّادُ الفرق كما تعرفه القاعة: الميّتُ غيرُ المكشوف حيٌّ، والأخُ الأصغر الذي تحوّل
 * ليلاً ولم يُعرض تحوّلُه بعد يُعدّ بدوره السابق.
 */
export function publicTeamCounts(state: any, opts: RevealOptions = {}): TeamCounts {
  const hidden = unrevealedDeadSeats(state, opts);
  const roleHidden = roleHiddenSeats(state, opts);
  const pendingTransform = new Map<number, string>();
  for (const ev of state?.morningEvents || []) {
    if (!ev?.revealed && ev?.type === 'TWIN_TRANSFORM' && ev?.targetPhysicalId != null && ev?.extra?.previousRole) {
      pendingTransform.set(Number(ev.targetPhysicalId), String(ev.extra.previousRole));
    }
  }
  // 👥 تحوّلُ النهار (تصويت/قنبلة/رماد/تعادل) لا حدثَ صباحٍ له: ما دام موتُ الأكبر محجوباً
  //    يُعدّ الأصغرُ بدوره السابق — وإلّا قفز عدّادُ المافيا فكشف أنّ المُقصى مافيا
  const t = state?.twinState;
  if (t?.transformed && t.olderBrotherPhysicalId != null
      && (hidden.has(Number(t.olderBrotherPhysicalId)) || roleHidden.has(Number(t.olderBrotherPhysicalId)))) {
    pendingTransform.set(Number(t.youngerBrotherPhysicalId), 'YOUNGER_BROTHER');
  }
  const players = (state?.players || []).map((p: any) => {
    const seat = Number(p.physicalId);
    let q = p;
    if ((hidden.has(seat) || roleHidden.has(seat)) && p.isAlive === false) q = { ...q, isAlive: true };
    if (pendingTransform.has(seat)) q = { ...q, role: pendingTransform.get(seat) };
    return q;
  });
  return getTeamCounts(players);
}

/** المقاعدُ التي يكشفها حدثُ صباحٍ واحد — تنتظر شاشةُ العرض قلبَ بطاقاتها قبل تحديث العدّاد. */
export function seatsRevealedBy(state: any, ev: any): number[] {
  const seats: number[] = [];
  const dead = (id: any) => id != null && state?.players?.some((p: any) => Number(p.physicalId) === Number(id) && p.isAlive === false);
  if (dead(ev?.targetPhysicalId)) seats.push(Number(ev.targetPhysicalId));
  if (dead(ev?.extra?.sniperPhysicalId)) seats.push(Number(ev.extra.sniperPhysicalId));
  return seats;
}
