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
]);

// مصفوفات عناصرها physicalIds
const ID_ARRAY_FIELDS = new Set([
  'speakingQueue', 'hasSpoken', 'hiddenPlayersFromVoting',
  'winners', 'pool', 'witchPreviousTargets', 'eliminated',
]);

// قواميس مفاتيحها physicalIds (Record<physicalId, ...>)
const ID_KEYED_RECORDS = new Set(['playerVotes', 'leaderProxyVotes', 'submitted']);

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
