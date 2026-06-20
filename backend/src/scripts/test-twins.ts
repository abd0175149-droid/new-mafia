// ══════════════════════════════════════════════════════
// 🧪 اختبار منطق الأخوين (الأخ الأكبر/الأصغر) — لعبة افتراضية بكل السيناريوهات
// يستدعي دوال المحرك الحقيقية (twin-engine) ويحاكي بالضبط الكتل التي تنفّذها
// المُحلّلات (night-resolver / dynamic-night-resolver / vote-engine) + بيانات
// التعارف التي تستهلكها واجهة اللاعب، وأحداث الصباح التي يعرضها الليدر وشاشة العرض.
//
// تشغيل: npx tsx src/scripts/test-twins.ts   (نقي — بلا قاعدة بيانات أو Redis)
// ══════════════════════════════════════════════════════

import { Role, isMafiaRole } from '../game/roles.js';
import {
  initTwinState, getSiblingInfoFor, detectTwinDeaths,
  processTwinBond, applySuicide, applyTransform,
  resolveTransformRole, getTwinTransformNotification,
} from '../game/twin-engine.js';
import { checkWinCondition, WinResult } from '../game/win-checker.js';

// ── عدّادات ──
let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t: string) { console.log(`\n━━━ ${t} ━━━`); }

// ── بناء لاعب افتراضي ──
function P(physicalId: number, name: string, role: Role, isAlive = true): any {
  return { physicalId, name, phone: null, playerId: physicalId + 1000, role, isAlive, isSilenced: false, justificationCount: 0 };
}

// ── بناء حالة لعبة افتراضية كاملة (9 لاعبين فيهم الأخوان) ──
// #1 شيخ المافيا | #2 الأخ الأكبر (مافيا) | #3 مافيا عادي
// #4 الشريف | #5 الطبيب | #6 الأخ الأصغر (مواطن) | #7 مواطن | #8 القناص | #9 المهرج
function makeState(overrides: Partial<Record<number, boolean>> = {}): any {
  const players = [
    P(1, 'شيخ', Role.GODFATHER),
    P(2, 'الأكبر', Role.OLDER_BROTHER),
    P(3, 'مافيا', Role.MAFIA_REGULAR),
    P(4, 'الشريف', Role.SHERIFF),
    P(5, 'الطبيب', Role.DOCTOR),
    P(6, 'الأصغر', Role.YOUNGER_BROTHER),
    P(7, 'مواطن', Role.CITIZEN),
    P(8, 'القناص', Role.SNIPER),
    P(9, 'المهرج', Role.JESTER),
  ];
  for (const idStr of Object.keys(overrides)) {
    const p = players.find(x => x.physicalId === Number(idStr));
    if (p) p.isAlive = overrides[Number(idStr)] as boolean;
  }
  const state: any = {
    players,
    round: 2,
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    twinState: null,
  };
  state.twinState = initTwinState(state);
  return state;
}

// محاكاة كتلة معالجة التوأمين (نفس منطق detectTwinDeaths + الحلقة + break الموجود في
// night-resolver.ts / dynamic-night-resolver.ts بعد الإصلاح). ملاحظة: المُحلّلات الحقيقية
// تستدعي أيضاً checkPolicewomanTrigger(state, suicideId) و checkWinCondition(state) بعد هذه
// الكتلة — وهما تأثيران منفصلان عن منطق التوأمين نفسه (نفحص checkWinCondition في سيناريو 12).
function simulateTwinResolution(state: any, source = 'NIGHT'): any[] {
  const events: any[] = [];
  if (state.twinState) {
    const deaths = detectTwinDeaths(state);
    for (const deadId of deaths) {
      const r = processTwinBond(state, deadId, source);
      if (r.triggered) {
        if (r.type === 'SUICIDE') { const e = applySuicide(state, r); if (e) events.push(e); }
        else if (r.type === 'TRANSFORM') { const e = applyTransform(state, r); if (e) events.push(e); }
        break;
      }
    }
  }
  return events;
}

// بناء حالة بروستر مخصّص (لاختبارات الفوز/الوراثة بأعداد مضبوطة)
function customState(defs: Array<[number, string, Role, boolean?]>): any {
  const players = defs.map(([id, name, role, alive]) => P(id, name, role, alive === undefined ? true : alive));
  const s: any = { players, round: 2, performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] }, twinState: null };
  s.twinState = initTwinState(s);
  return s;
}

// محاكاة بيانات التعارف التي تُرسَل للاعب (نسخة طبق الأصل من setup:confirm-roles)
function recognitionFor(state: any, physicalId: number): any {
  const p = state.players.find((x: any) => x.physicalId === physicalId);
  const roleData: any = { physicalId, role: p.role };
  if (isMafiaRole(p.role)) {
    roleData.mafiaTeam = state.players
      .filter((m: any) => m.role && isMafiaRole(m.role) && m.isAlive !== false && m.physicalId !== physicalId)
      .map((m: any) => ({ physicalId: m.physicalId, name: m.name, role: m.role }));
  }
  const sibling = getSiblingInfoFor(state, physicalId);
  if (sibling) roleData.sibling = sibling;
  return roleData;
}

console.log('🧪 اختبار منطق الأخوين — لعبة افتراضية (9 لاعبين)\n');

// ══════════════════════════════════════════════════════
section('1) تهيئة حالة التوأمين (initTwinState)');
{
  const s = makeState();
  check('twinState يُهيَّأ عند وجود الأخوين', !!s.twinState);
  check('olderBrotherPhysicalId = 2', s.twinState.olderBrotherPhysicalId === 2);
  check('youngerBrotherPhysicalId = 6', s.twinState.youngerBrotherPhysicalId === 6);
  check('كلاهما حيّ في البداية', s.twinState.olderAlive === true && s.twinState.youngerAlive === true);
  check('لا انتحار/تحوّل مبدئياً', s.twinState.suicideTriggered === false && s.twinState.transformed === false);
}

// ══════════════════════════════════════════════════════
section('2) التعارف — واجهة اللاعب (كلٌّ يرى أخاه فقط، والأصغر مخفي عن المافيا)');
{
  const s = makeState();

  // الأخ الأكبر (مافيا)
  const older = recognitionFor(s, 2);
  check('الأكبر: عنده sibling', !!older.sibling);
  check('الأكبر: أخوه = الأصغر (#6)', older.sibling?.physicalId === 6 && older.sibling?.role === Role.YOUNGER_BROTHER);
  check('الأكبر: recipientIsMafia=true', older.sibling?.recipientIsMafia === true);
  check('الأكبر: عنده mafiaTeam (شيخ + مافيا عادي)', Array.isArray(older.mafiaTeam) && older.mafiaTeam.length === 2);
  check('🔒 الأكبر: mafiaTeam لا يحتوي الأخ الأصغر', !older.mafiaTeam.some((m: any) => m.physicalId === 6));

  // الأخ الأصغر (مواطن)
  const younger = recognitionFor(s, 6);
  check('الأصغر: عنده sibling', !!younger.sibling);
  check('الأصغر: أخوه = الأكبر (#2)', younger.sibling?.physicalId === 2 && younger.sibling?.role === Role.OLDER_BROTHER);
  check('الأصغر: recipientIsMafia=false', younger.sibling?.recipientIsMafia === false);
  check('🔒 الأصغر: لا يحصل mafiaTeam إطلاقاً (مواطن)', younger.mafiaTeam === undefined);

  // مافيا عادي (#3) — يرى المافيا لكن لا يرى الأصغر، وبلا sibling
  const reg = recognitionFor(s, 3);
  check('مافيا عادي: عنده mafiaTeam فيه الأخ الأكبر', reg.mafiaTeam.some((m: any) => m.physicalId === 2));
  check('🔒 مافيا عادي: mafiaTeam لا يحتوي الأخ الأصغر', !reg.mafiaTeam.some((m: any) => m.physicalId === 6));
  check('مافيا عادي: بلا sibling', reg.sibling === undefined);

  // مواطن عادي (#7) — لا mafiaTeam ولا sibling
  const cit = recognitionFor(s, 7);
  check('مواطن عادي: لا mafiaTeam ولا sibling', cit.mafiaTeam === undefined && cit.sibling === undefined);

  // الحقول التي تعرضها بطاقة "رابط الدم" موجودة كاملة
  check('payload الأخ يحوي كل الحقول للعرض', !!(older.sibling.name && older.sibling.role && typeof older.sibling.isAlive === 'boolean' && typeof older.sibling.physicalId === 'number'));
}

// ══════════════════════════════════════════════════════
section('3) اغتيال الأخ الأصغر ليلاً → انتحار الأخ الأكبر');
{
  const s = makeState({ 6: false }); // الأصغر قُتل
  const deaths = detectTwinDeaths(s);
  check('detectTwinDeaths يكتشف موت الأصغر (#6)', deaths.includes(6) && deaths.length === 1);

  const events = simulateTwinResolution(s);
  check('صدر حدث واحد', events.length === 1);
  check('نوع الحدث TWIN_SUICIDE', events[0]?.type === 'TWIN_SUICIDE');
  check('الحدث يستهدف الأخ الأكبر (#2)', events[0]?.targetPhysicalId === 2);
  check('الأخ الأكبر أُقصي فعلاً (isAlive=false)', s.players.find((p: any) => p.physicalId === 2).isAlive === false);
  check('twinState.suicideTriggered = true', s.twinState.suicideTriggered === true);
  // بيانات الليدر/شاشة العرض
  check('🖥️ الحدث يحمل اسم الهدف للعرض', !!events[0]?.targetName);
  check('🖥️ extra يحوي الدور والسبب للعرض', !!(events[0]?.extra?.roleName && events[0]?.extra?.reason));
  // تسجيل الإقصاء (لتتبع الأداء/النقاط)
  check('سُجّل في eliminationLog كـ TWIN_SUICIDE', s.performanceTracking.eliminationLog.some((e: any) => e.physicalId === 2 && e.eliminatedBy === 'TWIN_SUICIDE'));
}

// ══════════════════════════════════════════════════════
section('4أ) اغتيال الأخ الأكبر ليلاً → تحوّل الأصغر (وراثة دور مافيا ميت)');
{
  const s = makeState({ 2: false, 1: false }); // الأكبر + الشيخ ماتوا
  // ملاحظة: الشيخ ميت → الأصغر يرث GODFATHER حسب ترتيب الوراثة
  check('resolveTransformRole = GODFATHER (شيخ ميت)', resolveTransformRole(s) === Role.GODFATHER);

  const events = simulateTwinResolution(s);
  check('صدر حدث TWIN_TRANSFORM', events.length === 1 && events[0]?.type === 'TWIN_TRANSFORM');
  check('الحدث يستهدف الأخ الأصغر (#6)', events[0]?.targetPhysicalId === 6);
  const youngerNow = s.players.find((p: any) => p.physicalId === 6);
  check('دور الأصغر تحوّل إلى مافيا', isMafiaRole(youngerNow.role));
  check('الأصغر ورث GODFATHER', youngerNow.role === Role.GODFATHER);
  check('الأصغر ما زال حيّاً بعد التحوّل', youngerNow.isAlive === true);
  check('twinState.transformed = true', s.twinState.transformed === true);
  // إشعار المافيا/الأصغر بالعضو الجديد
  const notif = getTwinTransformNotification(s);
  check('🔔 إشعار التحوّل يُرجع العضو الجديد', !!notif && notif.transformedPhysicalId === 6 && isMafiaRole(notif.newRole as Role));
  // بيانات العرض
  check('🖥️ TWIN_TRANSFORM يحمل previousRole/newRole/roleName', !!(events[0]?.extra?.previousRole && events[0]?.extra?.newRole && events[0]?.extra?.newRoleName));
}

section('4ب) اغتيال الأخ الأكبر بلا مافيا ميت آخر → الأصغر يرث "مافيا عادي"');
{
  const s = makeState({ 2: false }); // الأكبر فقط مات، لا مافيا ميت آخر
  check('resolveTransformRole = MAFIA_REGULAR', resolveTransformRole(s) === Role.MAFIA_REGULAR);
  const events = simulateTwinResolution(s);
  const youngerNow = s.players.find((p: any) => p.physicalId === 6);
  check('الأصغر تحوّل إلى MAFIA_REGULAR', events[0]?.type === 'TWIN_TRANSFORM' && youngerNow.role === Role.MAFIA_REGULAR);
}

// ══════════════════════════════════════════════════════
section('5) الطبيب أنقذ الأخ الأصغر (بقي حيّاً) → لا انتحار');
{
  const s = makeState(); // لا أحد مات (الأصغر حيّ — كأن الطبيب حماه)
  const deaths = detectTwinDeaths(s);
  check('لا وفيات تُكتشف', deaths.length === 0);
  const events = simulateTwinResolution(s);
  check('لا حدث انتحار', events.length === 0);
  check('الأخ الأكبر ما زال حيّاً', s.players.find((p: any) => p.physicalId === 2).isAlive === true);
}

// ══════════════════════════════════════════════════════
section('6) موت الأخوين في نفس الليلة → لا انتحار ولا تحوّل (حارس الموت المزدوج)');
{
  const s = makeState({ 2: false, 6: false }); // كلاهما مات
  const events = simulateTwinResolution(s);
  check('لا أحداث توأم (كلاهما مات أصلاً)', events.length === 0);
  check('twinState لم يُفعّل انتحاراً', s.twinState.suicideTriggered === false);
  check('twinState لم يُفعّل تحوّلاً', s.twinState.transformed === false);
}

// ══════════════════════════════════════════════════════
section('7) الأخ الأكبر ميت مسبقاً ثم يموت الأصغر → لا انتحار');
{
  const s = makeState({ 2: false }); // الأكبر مات في جولة سابقة
  // نحاكي: التحوّل حدث للأصغر سابقاً؟ لا — هنا فقط الأكبر مات والأصغر حي (لكن لم نعالج)
  // أولاً نعالج موت الأكبر (تحوّل):
  simulateTwinResolution(s);
  // الآن نقتل الأصغر (المتحوّل) في جولة لاحقة:
  const youngerNow = s.players.find((p: any) => p.physicalId === 6);
  youngerNow.isAlive = false;
  const more = detectTwinDeaths(s);
  check('بعد التحوّل: لا اكتشاف وفاة توأم جديدة (transformed guard)', more.length === 0);
}

// ══════════════════════════════════════════════════════
section('8) حارس التكرار — لا انتحار مزدوج بعد أول انتحار');
{
  const s = makeState({ 6: false });
  simulateTwinResolution(s); // انتحار الأكبر يحدث
  const again = detectTwinDeaths(s);
  check('detectTwinDeaths فارغ بعد suicideTriggered', again.length === 0);
  const r = processTwinBond(s, 6, 'NIGHT');
  check('processTwinBond لا يُفعّل ثانية', r.triggered === false);
}

// ══════════════════════════════════════════════════════
section('9) إقصاء الأخ الأصغر بالتصويت نهاراً → انتحار الأكبر (نفس دوال المحرك)');
{
  // مسار vote-engine يستدعي نفس processTwinBond/applySuicide
  const s = makeState({ 6: false }); // الأصغر أُقصي بالتصويت
  const events = simulateTwinResolution(s, 'DAY_VOTE');
  check('انتحار الأكبر بعد إقصاء الأصغر بالتصويت', events[0]?.type === 'TWIN_SUICIDE' && events[0]?.targetPhysicalId === 2);
  check('الأخ الأكبر أُقصي', s.players.find((p: any) => p.physicalId === 2).isAlive === false);
}

// ══════════════════════════════════════════════════════
section('10) لعبة بلا أخوين → لا تهيئة ولا تعارف');
{
  const players = [P(1, 'شيخ', Role.GODFATHER), P(2, 'مافيا', Role.MAFIA_REGULAR), P(3, 'شريف', Role.SHERIFF), P(4, 'مواطن', Role.CITIZEN)];
  const s: any = { players, round: 1, performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] }, twinState: null };
  s.twinState = initTwinState(s);
  check('twinState = null (لا أخوين)', s.twinState === null);
  check('getSiblingInfoFor = null لأي لاعب', getSiblingInfoFor(s, 1) === null && getSiblingInfoFor(s, 3) === null);
  check('detectTwinDeaths = [] (لا twinState)', detectTwinDeaths(s).length === 0);
}

// ══════════════════════════════════════════════════════
section('11) لعبة فيها الأخ الأكبر فقط (بلا الأصغر) → لا رابط');
{
  const players = [P(1, 'شيخ', Role.GODFATHER), P(2, 'الأكبر', Role.OLDER_BROTHER), P(3, 'مواطن', Role.CITIZEN)];
  const s: any = { players, round: 1, performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] }, twinState: null };
  s.twinState = initTwinState(s);
  check('twinState = null (الأصغر غير موجود)', s.twinState === null);
  check('الأخ الأكبر بلا sibling', getSiblingInfoFor(s, 2) === null);
}

// ══════════════════════════════════════════════════════
section('12) فحص الفوز بعد موت متسلسل للتوأم (checkWinCondition)');
{
  // 12أ: قتل الأصغر → انتحار الأكبر يُسقِط المافيا للصفر → فوز المواطنين
  const sA = customState([[2, 'الأكبر', Role.OLDER_BROTHER], [6, 'الأصغر', Role.YOUNGER_BROTHER], [4, 'شريف', Role.SHERIFF], [7, 'مواطن', Role.CITIZEN]]);
  sA.players.find((p: any) => p.physicalId === 6).isAlive = false; // الأصغر قُتل
  simulateTwinResolution(sA);
  check('12أ: الأكبر انتحر', sA.players.find((p: any) => p.physicalId === 2).isAlive === false);
  check('12أ: النتيجة = فوز المواطنين (لا مافيا حيّة)', checkWinCondition(sA) === WinResult.CITIZEN_WIN);

  // 12ب: قتل الأكبر → تحوّل الأصغر لمافيا يحقّق أغلبية المافيا → فوز المافيا
  const sB = customState([[1, 'شيخ', Role.GODFATHER], [2, 'الأكبر', Role.OLDER_BROTHER], [6, 'الأصغر', Role.YOUNGER_BROTHER], [7, 'مواطن', Role.CITIZEN]]);
  sB.players.find((p: any) => p.physicalId === 2).isAlive = false; // الأكبر قُتل
  check('12ب: قبل التحوّل اللعبة مستمرة', checkWinCondition(sB) === WinResult.GAME_CONTINUES);
  simulateTwinResolution(sB);
  check('12ب: الأصغر تحوّل لمافيا', isMafiaRole(sB.players.find((p: any) => p.physicalId === 6).role));
  check('12ب: النتيجة = فوز المافيا (2 مافيا ضد 1 مواطن)', checkWinCondition(sB) === WinResult.MAFIA_WIN);
}

// ══════════════════════════════════════════════════════
section('13) التعارف بعد التحوّل — الأصغر المتحوّل يرى الأكبر (الميت) كأخ');
{
  const s = customState([[1, 'شيخ', Role.GODFATHER], [2, 'الأكبر', Role.OLDER_BROTHER], [6, 'الأصغر', Role.YOUNGER_BROTHER], [7, 'مواطن', Role.CITIZEN]]);
  s.players.find((p: any) => p.physicalId === 2).isAlive = false;
  simulateTwinResolution(s); // الأصغر يتحوّل
  const sib = getSiblingInfoFor(s, 6);
  check('13: لا يزال يُحلّ الأخ عبر twinState بعد التحوّل', !!sib && sib.physicalId === 2);
  check('13: الأخ المعروض = الأكبر وميت', sib?.role === Role.OLDER_BROTHER && sib?.isAlive === false);
  check('13: recipientIsMafia=false (مشتقّة من الرقم لا الدور الجديد)', sib?.recipientIsMafia === false);
}

// ══════════════════════════════════════════════════════
section('14) كسر التعادل (ELIMINATE_ALL) — الأخ الأكبر يظهر في ملخص الإقصاء');
{
  // محاكاة كتلة day.socket.ts في فرع ELIMINATE_ALL بعد الإصلاح
  const s = makeState();
  const eliminated: number[] = [6];                                  // الأصغر أُقصي بالتعادل
  const revealedRoles: any[] = [{ physicalId: 6, role: 'YOUNGER_BROTHER' }];
  s.players.find((p: any) => p.physicalId === 6).isAlive = false;
  if (s.twinState && eliminated.length > 0) {
    for (const elId of eliminated) {
      const r = processTwinBond(s, elId, 'DAY_VOTE');
      if (r.triggered) {
        if (r.type === 'SUICIDE') {
          const e = applySuicide(s, r);
          if (e) { eliminated.push(r.suicidePhysicalId!); revealedRoles.push({ physicalId: r.suicidePhysicalId!, role: 'OLDER_BROTHER' }); }
        }
        break;
      }
    }
  }
  check('14: الأخ الأكبر أُضيف لقائمة eliminated', eliminated.includes(2));
  check('14: revealedRoles يحوي الأكبر كـ OLDER_BROTHER', revealedRoles.some((x: any) => x.physicalId === 2 && x.role === 'OLDER_BROTHER'));
  check('14: الأخ الأكبر مُقصى فعلاً', s.players.find((p: any) => p.physicalId === 2).isAlive === false);
}

// ══════════════════════════════════════════════════════
section('15) ترتيب وراثة دور التحوّل (resolveTransformRole)');
{
  // قص (SILENCER) ميت فقط → يرث SILENCER
  const s1 = customState([[2, 'الأكبر', Role.OLDER_BROTHER, false], [22, 'قص', Role.SILENCER, false], [6, 'الأصغر', Role.YOUNGER_BROTHER], [7, 'مواطن', Role.CITIZEN]]);
  check('15أ: SILENCER ميت → يرث SILENCER', resolveTransformRole(s1) === Role.SILENCER);

  // حرباية (CHAMELEON) ميتة فقط → يرث CHAMELEON
  const s2 = customState([[2, 'الأكبر', Role.OLDER_BROTHER, false], [10, 'حرباية', Role.CHAMELEON, false], [6, 'الأصغر', Role.YOUNGER_BROTHER], [7, 'مواطن', Role.CITIZEN]]);
  check('15ب: CHAMELEON ميتة → يرث CHAMELEON', resolveTransformRole(s2) === Role.CHAMELEON);

  // قص + مافيا عادي ميتان → الأولوية للقص (SILENCER قبل MAFIA_REGULAR)
  const s3 = customState([[2, 'الأكبر', Role.OLDER_BROTHER, false], [22, 'قص', Role.SILENCER, false], [3, 'مافيا', Role.MAFIA_REGULAR, false], [6, 'الأصغر', Role.YOUNGER_BROTHER]]);
  check('15ج: SILENCER+MAFIA_REGULAR ميتان → الأولوية SILENCER', resolveTransformRole(s3) === Role.SILENCER);
}

// ══════════════════════════════════════════════════════
section('16) موت الأصغر بالقنص مع موت القناص نفسه → انتحار واحد فقط للأكبر');
{
  // detectTwinDeaths مبني على isAlive (مستقل عن مصدر القتل) — القناص (مواطن غير أخ) لا يُحتسب
  const s = makeState({ 6: false, 8: false }); // الأصغر + القناص ماتا (SNIPE_CITIZEN)
  const deaths = detectTwinDeaths(s);
  check('16: يُكتشف الأصغر فقط (القناص ليس أخاً)', deaths.length === 1 && deaths[0] === 6);
  const events = simulateTwinResolution(s);
  check('16: حدث انتحار واحد فقط', events.length === 1 && events[0].type === 'TWIN_SUICIDE');
  check('16: الانتحار للأخ الأكبر (#2) لا القناص', events[0].targetPhysicalId === 2);
}

// ══════════════════════════════════════════════════════
section('17) بوابة إعادة تسليم التعارف (قبل تأكيد الأدوار لا يُرسَل الأخ)');
{
  const s = makeState();
  // محاكاة بوابة room:get-my-role (مشروطة بـ rolesConfirmed)
  const getMyRoleSibling = (physicalId: number, rolesConfirmed: boolean) =>
    (rolesConfirmed ? getSiblingInfoFor(s, physicalId) : null);
  check('17: قبل تأكيد الأدوار → لا أخ', getMyRoleSibling(2, false) === null);
  check('17: بعد تأكيد الأدوار → الأخ يُسلَّم للأكبر', getMyRoleSibling(2, true)?.physicalId === 6);
  check('17: غير الأخوين يبقى null بعد التأكيد', getMyRoleSibling(7, true) === null);
}

// ══════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════`);
console.log(`النتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail > 0) {
  console.log(`\n❌ الفشل:`);
  failures.forEach(f => console.log(`   - ${f}`));
  process.exit(1);
} else {
  console.log(`\n🎉 كل سيناريوهات الأخوين تعمل بشكل مثالي.`);
  process.exit(0);
}
