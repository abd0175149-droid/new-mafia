// ══════════════════════════════════════════════════════
// 🔥 العنقاء — مَن مدّ يدَه احترق، وقام هو من رماده
//
// قاعدةٌ سلبيّة بلا قدرةٍ ليليّة: لا يستيقظ ولا يُسأل ولا يُختار له هدف — كحرباية
// المافيا تماماً. وهذه هي الطريقةُ الوحيدة لضمان ألّا يُكشف صاحبُه في وضعٍ يُرصد
// فيه المستيقظُ من طول الصمت أو حركة الموجّه.
//
// 🔴 قاعدتان لا واحدة (قرارُ المالك، وهو يفصل ما كانت المواصفةُ تجمعه):
//      🔥 الاحتراقُ **غيرُ مشروط** — مَن مدّ يدَه احترق، رصيدٌ أو لا رصيد.
//      ♻️ والرصيدُ يحكم **النجاةَ وحدها** — أيقوم من رماده أم يخرج معه؟
//    وأثرُه على اللعب أكبرُ من أثره على الشيفرة: المافيا لا تربح شيئاً بإحراق
//    الرصيد أوّلاً ثمّ الضرب ثانياً — الضربةُ الثانية تقتل قاتلَها أيضاً.
//
// 🔴 ورصيدٌ واحدٌ للّيلة مهما بلغ عددُ المُنفّذين: البعثةُ حدثٌ لا عدد. «ليلةُ
//    الانهيار» (اغتيالٌ وقنصٌ وسفّاحٌ على الرأس نفسه) تُخرج ثلاثةً وتستهلك واحداً.
//
// 🔴 وموضعُ النداء بعد استقرار وفيات الليل كلِّها وقبل الشرطيّة والتوأمين — للسبب
//    نفسِه الذي وُضع لأجله ثأرُ الشريف: الحكمُ قبل الاستقرار حكمٌ على حالةٍ عابرة،
//    والمحترقُ يجب أن يُحسب في العتبة والرابط. ولو حُكم داخل حلقة الآثار لاحترق
//    أوّلُ مُنفّذٍ وحده ونجا الباقيان لأنّ الهدفَ صار ميّتاً.
// ══════════════════════════════════════════════════════

import type { GameState, MorningEvent } from './state.js';
import { Role } from './roles.js';

/** حالةُ العنقاء — تُهيَّأ عند ربط الأدوار، ولا تُبَثّ للاعبين إطلاقاً. */
export interface PhoenixState {
  seat: number;
  /** ما بقي من مرّات النهوض. يراه الموجّه وحده. */
  rebirthsLeft: number;
  /** مقاعدُ مَن احترقوا — للتدقيق ولوحة الموجّه. */
  burned: number[];
}

/** القدراتُ التي يقع بها إخراجٌ ليليٌّ مستهدَف — وهي وحدها ما يُشعل البعث. */
export const BURNING_ABILITIES = new Set(['KILL', 'SNIPE', 'ASSASSINATE']);

/**
 * أحداثُ إخراجٍ تقع على العنقاء ويُلغيها نهوضُه — تُحذف ويحلّ محلَّها PHOENIX_REBIRTH.
 *
 * 🔴 ولا يدخلها `ASSASSINATION_BLOCKED`: الحمايةُ تُبطل الضربةَ قبل أن تبلغه فلا
 *    نهوضَ أصلاً، وحدثُها صادقٌ يجب أن يبقى.
 */
export const PHOENIX_SUPERSEDED = new Set([
  'ASSASSINATION', 'ASSASSIN_KILL', 'SNIPE_MAFIA', 'SNIPE_CITIZEN',
]);

/** الافتراضيّ حين لا يضبطه الموجّه. */
export const DEFAULT_REBIRTHS = 1;

/** مقعدُ العنقاء الحيّ — أو null. */
export function phoenixSeat(state: GameState): number | null {
  return state.players.find(p => p.role === Role.PHOENIX && p.isAlive)?.physicalId ?? null;
}

/**
 * يُهيّئ الحالة عند ربط الأدوار — **ولا يُنادى في غيره**.
 *
 * 🔴 يُعيد الحسابَ دائماً ولا يحرس بـ«إن كانت موجودة»: الغرفةُ الواحدة تُعاد
 *    لعبةً بعد لعبة، وقد يقع العنقاءُ الجديد على المقعد نفسِه فيرث رصيداً
 *    منفوذاً من اللعبة السابقة — وهو عيبُ التوأمين نفسُه الذي عولج هناك.
 *    ولهذا لا يُنادى أثناء اللعب: نداءٌ في منتصف اللعبة يُعيد الرصيد.
 */
export function initPhoenixState(state: GameState): PhoenixState | null {
  const p = state.players.find(x => x.role === Role.PHOENIX);
  if (!p) { state.phoenixState = null; return null; }
  const cfg = Number((state.config as any)?.phoenixRebirths);
  const st: PhoenixState = {
    seat: p.physicalId,
    rebirthsLeft: Number.isFinite(cfg) && cfg > 0 ? Math.min(3, Math.floor(cfg)) : DEFAULT_REBIRTHS,
    burned: [],
  };
  state.phoenixState = st;
  console.log(`🔥 العنقاء: مقعد #${st.seat} — رصيدُ البعث ${st.rebirthsLeft}`);
  return st;
}

/** هل العنقاءُ معطَّلٌ بالساحرة هذه الجولة؟ التعطيلُ يكسر سلبيّتَه كما يكسر الحرباية. */
export function isPhoenixDisabled(state: GameState): boolean {
  const seat = state.phoenixState?.seat;
  if (seat == null) return false;
  const p = state.players.find(x => x.physicalId === seat);
  return p?.disabledUntilRound != null && p.disabledUntilRound >= (state.round || 1);
}

/** محاولةٌ واقعةٌ على العنقاء: مَن نفّذها وبأيّ قدرة. */
export interface PhoenixAttempt {
  performerSeat: number;
  abilityId: string;
}

export interface PhoenixOutcome {
  /** هل نجا العنقاء بالبعث؟ */
  survived: boolean;
  /** المقاعدُ التي احترقت فعلاً في هذه التسوية. */
  burned: number[];
  events: MorningEvent[];
}

/**
 * يُطبّق البعثَ والاحتراق.
 *
 * ⚠️ يُنادى **مرّةً واحدةً** بعد استقرار وفيات الليل، بكلّ المحاولات التي وقعت على
 * العنقاء في تلك الليلة مجتمعةً — لا محاولةً محاولة.
 *
 * @param attempts كلُّ محاولةٍ لم تُلغَ (الحمايةُ تُلغي الاغتيال قبل أن يبلغه، فلا
 *                 تصل هنا أصلاً ⇒ لا احتراق ولا استهلاكُ رصيد — وهي «أجملُ خسارة»).
 */
export function applyPhoenix(state: GameState, attempts: PhoenixAttempt[]): PhoenixOutcome {
  const empty: PhoenixOutcome = { survived: false, burned: [], events: [] };
  const st = state.phoenixState as PhoenixState | undefined;
  if (!st || attempts.length === 0) return empty;

  const phoenix = state.players.find(p => p.physicalId === st.seat);
  if (!phoenix) return empty;

  // 🔴 مُعطَّلٌ بالساحرة ⇒ لا بعثَ ولا احتراق. يموت قتلاً عاديّاً، والمافيا لا تعرف
  //    أنّها أحرقت ليلتَها على تعطيلٍ صامت. هذا هو التوازن: مضادٌّ موجودٌ لكنّه أعمى.
  if (isPhoenixDisabled(state)) return empty;

  const events: MorningEvent[] = [];
  const burned: number[] = [];

  // 🔥 الاحتراقُ أوّلاً وغيرُ مشروط — على المُنفّذ **الحيّ وقتَ التسوية** لا على فريقه.
  //    ومَن مات في هذه الليلة بيدٍ أخرى لا يُخرَج مرّتين.
  for (const a of attempts) {
    const performer = state.players.find(p => p.physicalId === a.performerSeat);
    if (!performer || performer.isAlive === false) continue;
    if (burned.includes(performer.physicalId)) continue;
    performer.isAlive = false;
    burned.push(performer.physicalId);
    events.push({
      type: 'PHOENIX_BURN',
      targetPhysicalId: performer.physicalId,
      targetName: performer.name,
      revealed: false,
      extra: { targetRole: performer.role, abilityId: a.abilityId },
    });
  }

  // ♻️ والنجاةُ مشروطةٌ بالرصيد وحدها
  const survived = st.rebirthsLeft > 0;
  if (survived) {
    phoenix.isAlive = true;                 // يُردّ الإخراجُ بكامل حالته
    st.rebirthsLeft -= 1;                   // رصيدٌ واحدٌ للّيلة مهما تعدّد المُنفّذون
    // 🔴 حدثُ النهوض ليس زينةً: مَن يستدعي هذه الدالّة عليه أن **يحذف** أحداثَ
    //    الإخراج التي وقعت على العنقاء ويضع هذا مكانَها. وإلّا بقي في ملخّص
    //    الصباح «اغتيالٌ ناجح» على مقعدٍ يقف حيّاً أمام الطاولة.
    events.push({
      type: 'PHOENIX_REBIRTH',
      targetPhysicalId: phoenix.physicalId,
      targetName: phoenix.name,
      revealed: false,
      extra: { burnedCount: burned.length, rebirthsLeft: st.rebirthsLeft },
    });
  }
  st.burned.push(...burned);

  console.log(
    `🔥 العنقاء #${st.seat}: ${survived ? 'نهض من رماده' : 'خرج — لا رصيد'}` +
    ` · احترق ${burned.length} · بقي ${st.rebirthsLeft}`,
  );

  return { survived, burned, events };
}

/**
 * ثأرُ الشرطيّة على العنقاء — استثناءٌ صريح.
 *
 * 🔴 يخرج مهما كان الرصيد، **ولا رصيدَ يُستهلك**، ولا يحترق أحد: الشرطيّةُ مُقصاةٌ
 *    سلفاً فلا يُخرَج ميّتٌ مرّتين. (قرارُ المالك، وهو أنظفُ من المواصفة الأولى
 *    التي كانت تحرق رصيداً بلا مقابلٍ لأحد.)
 */
export function phoenixImmuneTo(source: 'POLICEWOMAN' | 'VOTE' | 'DEAL' | 'BOMB'): boolean {
  return false;   // لا مناعةَ من أيٍّ منها — البعثُ ضدّ النار والرصاص لا ضدّ حبل المدينة
}

// ══════════════════════════════════════════════════════
// 🜂 لعنةُ الرماد — إن أعدمته المدينة أخذ معه واحداً ممّن رفعوا أيديهم
// ══════════════════════════════════════════════════════

/**
 * المؤهَّلون للعنة: مَن صوّت على العنقاء **في جولة الفرز النافذة** وحدها.
 * لا الممتنعُ ولا مَن صوّت على غيره. وصوتُ العمدة المضاعف صوتٌ واحدٌ في الأهليّة.
 *
 * 🔴 وإعادةُ تصويت العمدة تُعيد بناء `playerVotes`، فالمؤهَّلون يصيرون مصوّتي
 *    الجولة الثانية تلقائيّاً — بلا عملٍ إضافيّ.
 */
export function ashCurseEligible(state: GameState, phoenixCandidateIndex: number): number[] {
  const votes = state.votingState?.playerVotes || {};
  const out: number[] = [];
  for (const [seatStr, idx] of Object.entries(votes)) {
    if (Number(idx) !== phoenixCandidateIndex) continue;
    const seat = Number(seatStr);
    const p = state.players.find(x => x.physicalId === seat);
    if (!p || !p.isAlive) continue;
    if (seat === state.phoenixState?.seat) continue;   // لا يختار نفسَه
    out.push(seat);
  }
  return out.sort((a, b) => a - b);
}

/**
 * يُسلّح اللعنةَ بعد إعدامٍ بالتصويت: يجد مرشَّح العنقاء ويُودِع المؤهَّلين في
 * `state.pendingAshCurse`. يُرجِع false إن لم يبقَ مؤهَّلٌ حيّ — فتسقط اللعنةُ صامتةً.
 *
 * 🔴 البحثُ بالمقعد لا بمرجع المرشَّح: مسارُ «إقصاء المتعادلين جميعاً» لا يمرّ
 *    بـ`resolveVoting` فلا مرشَّحَ فائزٌ في يده. والمقعدُ لا يتكرّر مرشَّحاً.
 */
export function armAshCurse(state: GameState, phoenixPhysicalId: number): boolean {
  state.pendingAshCurse = null;
  const cands: any[] = (state.votingState?.candidates as any[]) || [];
  const idx = cands.findIndex(c => c?.type === 'PLAYER' && c?.targetPhysicalId === phoenixPhysicalId);
  if (idx < 0) return false;

  const seats = ashCurseEligible(state, idx);
  if (seats.length === 0) {
    console.log(`🜂 لعنةُ الرماد سقطت — لا مصوّتَ حيّاً على العنقاء #${phoenixPhysicalId}`);
    return false;
  }
  const ph = state.players.find(p => p.physicalId === phoenixPhysicalId);
  state.pendingAshCurse = {
    phoenixPhysicalId,
    phoenixName: ph?.name || '',
    eligible: seats.map(seat => {
      const e = state.players.find(x => x.physicalId === seat)!;
      return { physicalId: e.physicalId, name: e.name };
    }),
  };
  console.log(`🜂 لعنةُ الرماد مُسلَّحة للعنقاء #${phoenixPhysicalId} — ${seats.length} مؤهَّل`);
  return true;
}

/**
 * يُنفّذ اللعنة على مقعدٍ مؤهَّل. إخراجٌ مباشرٌ لا يُبطله شيء — لا حمايةٌ ولا فيتو
 * ولا صفقة — على قالب انتحار الأخ الأكبر.
 *
 * يُرجِع الحدثَ أو null إن كان المقعدُ غيرَ مؤهَّل (عميلٌ معدَّل، أو سقطت المهلة).
 */
export function applyAshCurse(
  state: GameState, targetSeat: number, eligible: number[],
): MorningEvent | null {
  if (!eligible.includes(targetSeat)) return null;
  const target = state.players.find(p => p.physicalId === targetSeat);
  if (!target || target.isAlive === false) return null;

  target.isAlive = false;
  const ph = state.players.find(p => p.physicalId === state.phoenixState?.seat);

  console.log(`🜂 لعنةُ الرماد: خرج ${target.name} مع العنقاء`);

  return {
    type: 'PHOENIX_ASH',
    targetPhysicalId: target.physicalId,
    targetName: target.name,
    performerPhysicalId: ph?.physicalId,
    performerName: ph?.name,
    revealed: false,
    extra: {
      targetRole: target.role,
      // 🔴 الإعلانُ لا يميّز أيّهما العنقاء: «خرج [أ] و[ب]، احترق أحدهما بالآخر»
      pairNames: [ph?.name || '', target.name].filter(Boolean),
    },
  };
}

/** هل هذا الدورُ هو العنقاء؟ — مصدرٌ واحدٌ بدل مقارنة النصّ في كلّ موضع. */
export const isPhoenixRole = (role: string | null | undefined) => role === Role.PHOENIX;
export const PHOENIX_ROLE = Role.PHOENIX;
