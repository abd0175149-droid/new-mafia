// ══════════════════════════════════════════════════════
// 🔗 ربطُ الأدوار — الثابتُ الذي لا يُعبر: الكروتُ المربوطة = الحوضُ المعتمد
//
// حادثة 2026-11-19 (مباراة 941): موجّهان فتحا شاشة الربط معاً، فوزّع كلُّ جهازٍ
// توزيعاً عشوائيّاً تلقائيّاً في اللحظة نفسها. كان التوزيعُ يكتب لاعباً لاعباً (قراءةٌ
// ثمّ كتابةٌ لكلّ مقعد)، فتداخل التوزيعان وخرج خليطٌ: شيخان وساحرتان ومواطنان أقلّ —
// ثمانيةُ مافيا بدل ستّة. ولم يكن بين الربط والإرسال وبدء اللعبة أيُّ فحصٍ للعدد.
//
// الحمايةُ طبقات، وكلٌّ منها تكفي وحدها لمنع ما حدث:
//   ١. كلُّ تعديلٍ على الربط يجري تحت قفل الغرفة (withRoomLock) ويُكتب مرّةً واحدة.
//   ٢. ربطٌ يدويّ يتجاوز عددَ الكرت في الحوض يُرفض لحظتَه.
//   ٣. الإرسالُ للهواتف وبدءُ اللعبة يرفضان أيَّ توزيعٍ لا يطابق الحوض (هنا).
//   ٤. رقمُ نسخةٍ للتوزيع (bindingRev): جهازٌ يرسل توزيعاً تغيّر من جهازٍ آخر يُرفض.
// ══════════════════════════════════════════════════════

import { ROLE_NAMES_AR } from './roles.js';

export interface RoleCountGap { role: string; have: number; want: number }

export interface BindingDiff {
  /** كروتٌ مربوطة أكثر ممّا في الحوض — التكرار الذي لا يجوز */
  over: RoleCountGap[];
  /** كروتٌ في الحوض لم تُربط كلّها */
  under: RoleCountGap[];
  /** لاعبون أحياءٌ بلا دور */
  unbound: number;
}

const nameOf = (r: string) => (ROLE_NAMES_AR as Record<string, string>)[r] || r;

/** اللاعبون الذين يأخذون كروت الحوض — كما يعدّهم التوزيع العشوائيّ */
export function bindingSeats(state: any): any[] {
  return (state?.players || []).filter((p: any) => p.isAlive !== false);
}

export function tally(roles: Array<string | null | undefined>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of roles) if (r) m.set(r, (m.get(r) || 0) + 1);
  return m;
}

/** يقارن ما رُبط فعلاً بالحوض المعتمد. */
export function bindingDiff(state: any): BindingDiff {
  const seats = bindingSeats(state);
  const want = tally(state?.rolesPool || []);
  const have = tally(seats.map((p: any) => p.role));
  const over: RoleCountGap[] = [];
  const under: RoleCountGap[] = [];
  for (const role of new Set([...want.keys(), ...have.keys()])) {
    const h = have.get(role) || 0, w = want.get(role) || 0;
    if (h > w) over.push({ role, have: h, want: w });
    else if (h < w) under.push({ role, have: h, want: w });
  }
  return { over, under, unbound: seats.filter((p: any) => !p.role).length };
}

/** صالحٌ للإرسال للهواتف: لا تكرارَ زائد، وكلُّ كرتٍ غير «مواطن» مربوط (المواطنون يُكملهم البدء). */
export function sendableIssues(d: BindingDiff): string | null {
  if (d.over.length) return overMessage(d.over);
  const missing = d.under.filter((g) => g.role !== 'CITIZEN');
  if (missing.length) return `كروتٌ لم تُربط بعد: ${missing.map((g) => `${nameOf(g.role)} (${g.want - g.have})`).join(' · ')}`;
  return null;
}

/** صالحٌ لبدء اللعبة: مطابقةٌ تامّة للحوض. */
export function exactIssues(d: BindingDiff): string | null {
  if (d.over.length) return overMessage(d.over);
  if (d.under.length || d.unbound) {
    return `التوزيع ناقص: ${d.under.map((g) => `${nameOf(g.role)} ${g.have}/${g.want}`).join(' · ') || `${d.unbound} بلا دور`}`;
  }
  return null;
}

function overMessage(over: RoleCountGap[]): string {
  return `التوزيع لا يطابق الكروت المعتمدة — مكرّرٌ زائد: ${over.map((g) => `${nameOf(g.role)} ${g.have} بدل ${g.want}`).join(' · ')}. أعد التوزيع ثمّ أرسل`;
}

/** هل يجوز ربطُ `role` بالمقعد `seat`؟ (دورُ المقعد الحاليّ يُستبدل فلا يُعدّ) */
export function canBindRole(state: any, seat: number, role: string): { ok: true } | { ok: false; code: string; error: string } {
  const want = tally(state?.rolesPool || []).get(role) || 0;
  if (want === 0) return { ok: false, code: 'ROLE_NOT_IN_POOL', error: `«${nameOf(role)}» ليس من الكروت المعتمدة لهذه اللعبة` };
  const taken = bindingSeats(state).filter((p: any) => p.role === role && Number(p.physicalId) !== Number(seat)).length;
  if (taken >= want) {
    return {
      ok: false, code: 'ROLE_COUNT_EXCEEDED',
      error: want === 1
        ? `«${nameOf(role)}» مربوطٌ بمقعدٍ آخر — فُكّه أوّلاً`
        : `كروت «${nameOf(role)}» (${want}) كلّها مربوطة — فُكّ واحداً أوّلاً`,
    };
  }
  return { ok: true };
}

/** يرفع رقم نسخة التوزيع — كلُّ تغييرٍ في الربط يُسقط ما رآه جهازٌ آخر قبله. */
export function bumpBindingRev(state: any): number {
  state.bindingRev = (Number(state.bindingRev) || 0) + 1;
  return state.bindingRev;
}

/** ما يحتاجه الموجّه ليعيد رسم شاشة الربط — للموجّهين وحدهم (فيه الأدوار). */
export function bindingSnapshot(state: any) {
  return {
    bindingRev: Number(state?.bindingRev) || 0,
    rolesConfirmed: state?.rolesConfirmed === true,
    rolesPool: state?.rolesPool || [],
    assignments: (state?.players || []).map((p: any) => ({ physicalId: p.physicalId, role: p.role ?? null })),
  };
}
