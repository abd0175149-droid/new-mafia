// ══════════════════════════════════════════════════════
// 🔁 إعادة ربط أرقام المقاعد (physicalId) عبر كامل حالة اللعبة
// تُستخدم عند الترقيم/نقل المقاعد كي لا تبقى أي بنية مشيرة لرقم قديم
// (أصوات التصويت، التوائم، السفّاح، الشرطية، النقاش، القنبلة، أهداف الليل…).
//
// التصميم: جوّال عميق واحد على كائن الحالة يعتمد اتّساق التسمية في المشروع:
//   - حقول أرقام المقاعد تنتهي بـ "PhysicalId" أو اسمها "physicalId" أو ضمن قائمة صريحة
//     (أهداف الليل currentSpeakerId/autoNightPerformerId/godfatherTarget…)
//   - مصفوفات أرقام مقاعد بأسماء معروفة (speakingQueue/hasSpoken/winners/pool…)
//   - قواميس مفاتيحها أرقام مقاعد (playerVotes/leaderProxyVotes/submitted)
// ملاحظة أمان: "playerId" (معرّف قاعدة البيانات) لا يطابق أي قاعدة — لا يُمسّ.
// يغطي هذا تلقائياً البنى الديناميكية (nightStep/pendingResolution/justificationData…).
// ══════════════════════════════════════════════════════

// حقول رقمية قيمتها physicalId (بخلاف نمط *PhysicalId العام)
const ID_VALUE_FIELDS = new Set([
  'physicalId',
  'currentSpeakerId',
  'autoNightPerformerId',
  'godfatherTarget', 'silencerTarget', 'sheriffTarget', 'doctorTarget',
  'sniperTarget', 'nurseTarget', 'assassinTarget', 'witchTarget', 'lastProtectedTarget',
  // 🎙️ المواجهة الثنائية (اللعب عن بُعد) — رقما مقعدين باسمين لا يتبعان النمط
  'requesterId', 'targetId',
  // 🔥 مقعدُ العنقاء (phoenixState.seat) ومقعدُ فعلٍ في خطّة الليلة الواحدة (oneNight.plan[].seat).
  //    فاته الجوّالُ فبقي العنقاءُ على المقعد القديم بعد تبديلٍ نهاريّ (مباراة 798، 2026-10-04):
  //    اغتيل ليلاً فمات برصيدَين ولم يحترق قاتلُه. (seatLayout/pinnedSeats أرقامُ كراسٍ لا لاعبين،
  //    وأسماؤها pos/seatNumber — لا تمرّ من هنا.)
  'seat',
]);

// مصفوفات عناصرها physicalIds
const ID_ARRAY_FIELDS = new Set([
  'speakingQueue', 'hasSpoken', 'hiddenPlayersFromVoting',
  'winners', 'pool', 'witchPreviousTargets', 'eliminated',
  // 🗳️ سحب الأصوات: من سحب ومن هم المتهمون
  'withdrawn', 'accusedIds',
  // 🎁 سجلّ رابحي السحب عبر عمر الغرفة (يستمر بين الألعاب — لذا يجب ترقيمه)
  'luckyDrawHistory',
  // 🗳️ من صوّت صواباً في نبض الإقناع
  'correctVoters',
  // 🔥 مَن احترقوا بالعنقاء · 🗳️ مَن صوّتوا على المتّهم (عتبة السحب) · 💣 ضحايا قنبلةٍ محبوسة ومقاعدُ بطاقاتها
  'burned', 'votersForAccused', 'bombEliminated', 'revealSeats',
]);

// قواميس مفاتيحها physicalIds (Record<physicalId, ...>)
const ID_KEYED_RECORDS = new Set([
  'playerVotes', 'leaderProxyVotes', 'submitted',
  // 🤝 قفل تسجيل الديل: physicalId → آخر جولة سجّل فيها
  'dealRegisteredRound',
  // ⚔️ عدّاد مواجهات النهار: physicalId → عدد المقبولة في اللعبة
  'confrontationsUsed',
  // 🗳️ أصوات نبض الإقناع: physicalId → REQ|TGT
  'pulseVotes',
  // ⚖️ أوزانُ المصوّتين في التبرير (العمدة ×2): physicalId → الوزن
  'voterWeights',
]);

// قواميس مفاتيحُها **وقيمُها** أرقامُ مقاعد — 🌙 oneNight.idle: مقعدٌ خامل → اختيارُه
const ID_KEYED_ID_VALUED_RECORDS = new Set(['idle']);

// قواميس مفتاحُها مركّب «مقعد:قدرة» — dynamicNightState.actions وoneNight.choices (قيمتُها مقعدُ الهدف).
// يُعاد بناءُ المقعد في المفتاح؛ والقيمةُ رقمٌ ⟵ مقعد، أو كائنٌ ⟵ يُمشى كالعادة.
// lastTargets كذلك: مفتاحه «مقعد:قدرة» في المحرّك الديناميكيّ (وكان يُعاد ربطُ قيمه وحدها)،
// ومفتاحُ قدرةٍ مجرّد في البيانات القديمة — يبقى كما هو وتُربط قيمته.
const SEAT_PREFIXED_RECORDS = new Set(['actions', 'choices', 'lastTargets']);

// قواميس **قيمها** physicalIds ومفاتيحها شيء آخر (مثل معرّف القدرة)
// مثال: dynamicNightState.lastTargets = { SHERIFF_INVESTIGATE: 7, ... }
const ID_VALUED_RECORDS = new Set<string>([]);

// مفاتيح تُتجاهل كلياً (غير قابلة للتسلسل أو لا علاقة لها)
const SKIP_KEYS = new Set(['timerHandle']);

function mapId(mapping: Map<number, number>, v: unknown): unknown {
  return typeof v === 'number' && mapping.has(v) ? mapping.get(v) : v;
}

function walk(node: any, key: string | null, mapping: Map<number, number>): void {
  if (node === null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    // مصفوفة أرقام مقاعد معروفة بالاسم
    if (key && ID_ARRAY_FIELDS.has(key)) {
      for (let i = 0; i < node.length; i++) node[i] = mapId(mapping, node[i]);
      return;
    }
    for (const item of node) walk(item, key, mapping);
    return;
  }

  // قاموس مفاتيحه أرقام مقاعد — أعِد بناء المفاتيح
  if (key && ID_KEYED_RECORDS.has(key)) {
    const rebuilt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const n = Number(k);
      const nk = Number.isFinite(n) && mapping.has(n) ? String(mapping.get(n)) : k;
      rebuilt[nk] = v;
    }
    for (const k of Object.keys(node)) delete node[k];
    Object.assign(node, rebuilt);
    return;
  }

  // قاموس مفاتيحه وقيمه أرقام مقاعد
  if (key && ID_KEYED_ID_VALUED_RECORDS.has(key)) {
    const rebuilt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const n = Number(k);
      rebuilt[Number.isFinite(n) && mapping.has(n) ? String(mapping.get(n)) : k] = mapId(mapping, v);
    }
    for (const k of Object.keys(node)) delete node[k];
    Object.assign(node, rebuilt);
    return;
  }

  // قاموس مفتاحه «مقعد:قدرة»
  if (key && SEAT_PREFIXED_RECORDS.has(key)) {
    const rebuilt: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const m = /^(\d+):(.*)$/.exec(k);
      const seat = m ? Number(m[1]) : NaN;
      const nk = m && mapping.has(seat) ? `${mapping.get(seat)}:${m[2]}` : k;
      if (typeof v === 'number') rebuilt[nk] = mapId(mapping, v);
      else { walk(v, nk, mapping); rebuilt[nk] = v; }
    }
    for (const k of Object.keys(node)) delete node[k];
    Object.assign(node, rebuilt);
    return;
  }

  // قاموس قيَمه أرقام مقاعد (المفتاح شيء آخر) — أعِد ربط القيَم
  if (key && ID_VALUED_RECORDS.has(key)) {
    for (const [k, v] of Object.entries(node)) node[k] = mapId(mapping, v);
    return;
  }

  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) continue;
    if (typeof v === 'number') {
      if (ID_VALUE_FIELDS.has(k) || k.endsWith('PhysicalId')) {
        node[k] = mapId(mapping, v);
      }
    } else {
      walk(v, k, mapping);
    }
  }
}

/**
 * يعيد ربط كل أرقام المقاعد في حالة اللعبة حسب الخريطة (oldId → newId) — تعديل في المكان.
 * يشمل players[].physicalId نفسها وكل البنى المشتقة.
 */
export function remapPhysicalIds(state: any, mapping: Map<number, number>): void {
  if (!mapping.size) return;
  walk(state, null, mapping);
  // إعادة الترتيب حسب الرقم الجديد (إن وُجدت قائمة لاعبين)
  if (Array.isArray(state?.players)) {
    state.players.sort((a: any, b: any) => (a.physicalId ?? 0) - (b.physicalId ?? 0));
  }
}

/**
 * يتحقق أن التغييرات لا تُصادم لاعبين خارج قائمة التغيير.
 * يعيد رسالة خطأ عربية أو null إن كانت التغييرات سليمة.
 */
export function validateRenumberChanges(
  players: Array<{ physicalId: number; name?: string }>,
  changes: Array<{ oldPhysicalId: number; newPhysicalId: number }>,
): string | null {
  const oldIds = new Set(changes.map((c) => c.oldPhysicalId));
  for (const c of changes) {
    if (c.oldPhysicalId === c.newPhysicalId) continue;
    const occupant = players.find((p) => p.physicalId === c.newPhysicalId);
    // مشغول بلاعب لن يتغيّر رقمه ضمن هذه الدفعة → تصادم (سيَنتج رقمان متطابقان)
    if (occupant && !oldIds.has(occupant.physicalId)) {
      return `المقعد ${c.newPhysicalId} مشغول بـ«${occupant.name || 'لاعب'}» وغير مشمول بالتغييرات — عدّل رقمه أيضاً أو اختر رقماً آخر`;
    }
  }
  return null;
}

// ── ➕ إضافة مقاعد فارغة بعد مقعدٍ معيّن (2026-10-30) ──
// «أضف ٤ بعد ١٠»: كلّ رقمٍ بعد ١٠ (لاعبٌ أو متفرّج) يُزاح ٤ — ١١ ⟵ ١٥ وتبقى ١١–١٤ فارغة —
// والسعة تكبر بالقدر نفسه. التخطيط نقيّ (يسبق رصد القرار الجاري)، والتطبيق يعدّل الحالة.
export const MAX_ROOM_SEATS = 50;

export type SeatInsertPlan = {
  after: number; count: number; oldMax: number; newMax: number;
  changes: Array<{ oldPhysicalId: number; newPhysicalId: number }>;
};

export function planSeatInsert(state: any, afterSeat: unknown, countIn: unknown): SeatInsertPlan | { error: string } {
  const after = Math.floor(Number(afterSeat));
  const count = Math.floor(Number(countIn));
  const spectators: any[] = Array.isArray(state?.spectators) ? state.spectators : [];
  const taken = [...(state?.players || []), ...spectators]
    .map((p: any) => Number(p?.physicalId))
    .filter((n) => Number.isFinite(n) && n > 0);
  const oldMax = Number(state?.config?.maxPlayers) || 0;
  const top = Math.max(oldMax, ...taken);
  if (!Number.isFinite(after) || after < 0 || after > top) return { error: `رقم المقعد يجب أن يكون بين 0 و ${top}` };
  if (!Number.isFinite(count) || count < 1) return { error: 'عدد المقاعد يجب أن يكون 1 أو أكثر' };
  const newMax = top + count;
  if (newMax > MAX_ROOM_SEATS) {
    return { error: `أقصى سعة ${MAX_ROOM_SEATS} مقعداً — يمكن إضافة ${Math.max(0, MAX_ROOM_SEATS - top)} فقط` };
  }
  const changes = [...new Set(taken.filter((n) => n > after))]
    .sort((a, b) => a - b)
    .map((n) => ({ oldPhysicalId: n, newPhysicalId: n + count }));
  return { after, count, oldMax, newMax, changes };
}

/** يطبّق الخطّة: ربطٌ عميق للاعبين والمتفرّجين وكلّ البنى، ثمّ أرقام الكراسي (التثبيت والأبواب) التي لا
 *  يمرّ بها الجوّال — الكرسيّ الذي كان ١٢ صار ١٦ ومن ثُبّت عليه يبقى عليه — ثمّ السعة (يدويّة: لا يعيدها القالب). */
export function applySeatInsert(state: any, plan: SeatInsertPlan): Map<number, number> {
  const idMap = new Map<number, number>(plan.changes.map((c) => [c.oldPhysicalId, c.newPhysicalId]));
  remapPhysicalIds(state, idMap);
  if (Array.isArray(state.spectators)) {
    state.spectators.sort((a: any, b: any) => (a.physicalId ?? 0) - (b.physicalId ?? 0));
  }
  const shift = (n: number) => (n > plan.after ? n + plan.count : n);
  if (Array.isArray(state.pinnedSeats)) {
    state.pinnedSeats = state.pinnedSeats.map((pin: any) =>
      Number.isFinite(Number(pin?.seatNumber)) ? { ...pin, seatNumber: shift(Number(pin.seatNumber)) } : pin);
  }
  if (Array.isArray(state.doorSeats)) state.doorSeats = state.doorSeats.map((n: any) => shift(Number(n)));
  state.config.maxPlayers = plan.newMax;
  state.config.maxPlayersManual = true;
  return idMap;
}
