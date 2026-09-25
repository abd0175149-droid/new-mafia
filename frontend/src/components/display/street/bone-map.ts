// ══════════════════════════════════════════════════════
// 🦴 تعرّفٌ تلقائيّ على تسمية العظام — جسرٌ بين أيّ رِج وحركات Mixamo
// ══════════════════════════════════════════════════════
// حركاتُ المشهد كلّها Mixamo، وشخصيّاته قد تأتي من أدواتٍ شتّى بتسمياتٍ شتّى.
// كان الجسرُ جدولاً واحداً لـAdvanced Skeleton فقط، فأيّ شخصيّةٍ بتسميةٍ أخرى
// تُنتج صفرَ مساراتٍ وتقف متجمّدة **بلا خطأ في الطرفيّة** — أسوأ أنواع العطل.
//
// 🔴 حيلةُ النقطتين: ملفّات Mixamo تسمّي العظمة `mixamorig:Hips`، لكنّ
//    `PropertyBinding.sanitizeNodeName` في three تحذف `:` عند التحميل فتصير
//    `mixamorigHips`. ولهذا لا نبني اسم المصدر افتراضاً بل **نبحث عنه** في
//    أسماء الهيكل المحمَّل فعلاً (`resolveSourceName`).

/** الحدّ الأدنى للعظام المنطبقة كي تُعتبر الحركة صالحة */
export const MIN_BONE_MATCH = 15;

/** Advanced Skeleton (Al Capone / Dotty) → Mixamo — الجدول الأصليّ بأصابعه */
const AS_RAW: Record<string, string> = {
  Root_M: 'Hips', Spine1_M: 'Spine', Chest_M: 'Spine2', Neck_M: 'Neck', Head_M: 'Head',
  Scapula_R: 'RightShoulder', Shoulder_R: 'RightArm', Elbow_R: 'RightForeArm', Wrist_R: 'RightHand',
  Hip_R: 'RightUpLeg', Knee_R: 'RightLeg', Ankle_R: 'RightFoot', Toes_R: 'RightToeBase',
  Scapula_L: 'LeftShoulder', Shoulder_L: 'LeftArm', Elbow_L: 'LeftForeArm', Wrist_L: 'LeftHand',
  Hip_L: 'LeftUpLeg', Knee_L: 'LeftLeg', Ankle_L: 'LeftFoot', Toes_L: 'LeftToeBase',
  MiddleFinger1_R: 'RightHandMiddle1', MiddleFinger2_R: 'RightHandMiddle2',
  IndexFinger1_R: 'RightHandIndex1', IndexFinger2_R: 'RightHandIndex2',
  ThumbFinger1_R: 'RightHandThumb1', ThumbFinger2_R: 'RightHandThumb2',
  MiddleFinger1_L: 'LeftHandMiddle1', MiddleFinger2_L: 'LeftHandMiddle2',
  IndexFinger1_L: 'LeftHandIndex1', IndexFinger2_L: 'LeftHandIndex2',
  ThumbFinger1_L: 'LeftHandThumb1', ThumbFinger2_L: 'LeftHandThumb2',
};

/** أسماءٌ بلا جهة */
const SYN: Record<string, string> = {
  hips: 'Hips', pelvis: 'Hips', root: 'Hips',
  spine: 'Spine', spine01: 'Spine', spine001: 'Spine',
  spine1: 'Spine1', spine2: 'Spine2', spine02: 'Spine2', spine3: 'Spine2', spine03: 'Spine2',
  chest: 'Spine2', upperchest: 'Spine2',
  neck: 'Neck', neck01: 'Neck', head: 'Head',
};

/** جذعُ الاسم ذي الجهة → نظيره في Mixamo */
const SIDE_CORE: Record<string, string> = {
  shoulder: 'Shoulder', clavicle: 'Shoulder', collar: 'Shoulder', scapula: 'Shoulder',
  arm: 'Arm', upperarm: 'Arm', shldr: 'Arm',
  forearm: 'ForeArm', lowerarm: 'ForeArm', elbow: 'ForeArm',
  hand: 'Hand', wrist: 'Hand',
  upleg: 'UpLeg', thigh: 'UpLeg', hip: 'UpLeg', upperleg: 'UpLeg',
  leg: 'Leg', calf: 'Leg', shin: 'Leg', knee: 'Leg', lowerleg: 'Leg',
  foot: 'Foot', ankle: 'Foot',
  toebase: 'ToeBase', toe: 'ToeBase', toes: 'ToeBase', ball: 'ToeBase',
};

/** يجرّد الاسم من الفضاءات والبادئات ويوحّد حالته وشُرَطه */
export function normalizeBone(name: string): string {
  let s = String(name || '');
  s = s.split('|').pop()!.split(':').pop()!;                 // Armature|Hips · mixamorig:Hips
  s = s.replace(/^(bip\d*|b_|bn_|jnt_|jx_|def_|ctrl_|rig_)/i, '');
  s = s.replace(/[\s._-]+/g, '').replace(/\d+$/, '');
  return s.toLowerCase();
}
const AS: Record<string, string> = {};
for (const [k, v] of Object.entries(AS_RAW)) AS[normalizeBone(k)] = v;

function sideOf(raw: string): 'Left' | 'Right' | null {
  const s = String(raw).toLowerCase();
  if (/left|lft|(^|[^a-z])l[_.\d]|[_.]l$|^l[_.]/.test(s)) return 'Left';
  if (/right|rgt|(^|[^a-z])r[_.\d]|[_.]r$|^r[_.]/.test(s)) return 'Right';
  return null;
}

/**
 * اسمُ العظمة كما جاء → الاسم المعياريّ في Mixamo (بلا بادئة)، أو null.
 * الترتيب مقصود: Mixamo أوّلاً (هويّة كاملة تشمل الأصابع)، ثمّ Advanced
 * Skeleton (الشخصيّات القائمة)، ثمّ المرادفات العامّة.
 */
export function coreBoneName(raw: string): string | null {
  const s = String(raw || '');
  // ① Mixamo: ما بعد البادئة **هو** الاسم المعياريّ — يشمل الأصابع بلا جدول
  const mx = /^.*mixamorig[:_ ]?(.+)$/i.exec(s);
  if (mx && mx[1]) return mx[1].replace(/[\s._-]/g, '');
  const n = normalizeBone(s);
  // ② Advanced Skeleton — الشخصيّات القائمة
  if (AS[n]) return AS[n];
  // ③ مرادفاتٌ عامّة بلا جهة
  if (SYN[n]) return SYN[n];
  // ④ مرادفاتٌ بجهة
  const side = sideOf(s);
  if (side) {
    const bare = n.replace(/^(left|right|lft|rgt)/, '').replace(/(left|right)$/, '').replace(/^[lr](?=[a-z])/, '').replace(/[lr]$/, '');
    const hit = SIDE_CORE[bare] ?? SIDE_CORE[n];
    if (hit) return side + hit;
  }
  return null;
}

/**
 * يجد اسم عظمة المصدر الحقيقيّ المطابق للاسم المعياريّ.
 * 🔴 لا يُبنى افتراضاً: three تحذف `:` من أسماء العقد عند التحميل، فقد يكون
 *    الاسم `mixamorigHips` أو `mixamorig:Hips` أو `Hips` — نبحث لا نخمّن.
 */
function resolveSourceName(core: string, srcNames: Set<string>): string | null {
  for (const c of [`mixamorig${core}`, `mixamorig:${core}`, `mixamorig_${core}`, core]) {
    if (srcNames.has(c)) return c;
  }
  return null;
}

export interface BoneMapResult {
  /** اسمُ عظمة الهدف → اسمُ عظمة المصدر (كما هي محمَّلة) */
  names: Record<string, string>;
  matched: number;
  /**
   * كلُّ العظام المنطبقة جاءت من مسار Mixamo (هويّةً) ⇒ محاورُ العظام المحلّيّة
   * تطابق محاور ملفّات الحركة. هذا شرطُ صحّة صيغة «إطار الراحة» في إعادة
   * التوجيه: بدونه (هيكل Advanced Skeleton مثلاً) تُدار الحركةُ بفرق المحاور
   * فتبقى الذراعان مفرودتين جانباً.
   */
  mixamoRig: boolean;
  /** عظامُ الهدف التي لم تنطبق — للتشخيص */
  unmatched: string[];
  ok: boolean;
}

/**
 * يبني خريطة الهدف→المصدر لأيّ تسمية. `model` للرسائل فقط.
 * يُرجع `ok:false` إن قلّ المنطبق عن الحدّ — وعندها **لا يُركَّب mixer**
 * ويُفعَّل البديل الإجرائيّ، بدل mixerٍ يعمل على مقاطع بصفر مسارات.
 */
export function buildBoneMap(targetBoneNames: string[], sourceBoneNames: string[], model: string): BoneMapResult {
  const src = new Set(sourceBoneNames);
  const names: Record<string, string> = {};
  const unmatched: string[] = [];
  let viaMixamo = 0;
  for (const t of targetBoneNames) {
    const core = coreBoneName(t);
    const s = core ? resolveSourceName(core, src) : null;
    if (s) { names[t] = s; if (/mixamorig/i.test(t)) viaMixamo++; } else unmatched.push(t);
  }
  const matched = Object.keys(names).length;
  const mixamoRig = matched > 0 && viaMixamo === matched;
  const ok = matched >= MIN_BONE_MATCH;
  if (!ok) {
    console.error(
      `🦴 «${model}»: انطبقت ${matched} عظمة فقط من ${targetBoneNames.length} (الحدّ ${MIN_BONE_MATCH}) — لن تُركَّب حركات، والبديل الإجرائيّ يعمل.\n` +
      `   عظامٌ لم تنطبق: ${unmatched.slice(0, 40).join(' · ')}${unmatched.length > 40 ? ` … و${unmatched.length - 40}` : ''}\n` +
      `   افحص الملفّ: node scripts/inspect-character.mjs <path>`,
    );
  }
  return { names, matched, unmatched, ok, mixamoRig };
}
