// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة — المرحلة ٠ (الأساس): الكروت الخمسة مسجّلة، ومحبوسة خلف مفتاح الموسم
//
// تشغيل: npx tsx src/scripts/test-prophecy-setup.ts
// بلا قاعدة بيانات ولا Redis.
//
// ما يقفله هذا الملفّ:
//   • الفرق: المُضلّل مافيا، والقارئة مستقلّة، والعرّاف والمنقسم والكفيل مواطنون.
//   • الخمسة نسخةٌ واحدة، وترتيب سلسلة الاغتيال القائم لم يتغيّر.
//   • الحوض: بلا محتوى الموسم يُرفض أيّ كرتٍ منها، والمطفأ بمفتاحه يُرفض، والغرف عن بُعد ترفضها،
//     ووجودُها يفرض المحرّك الديناميكيّ ويحوّل الآليّ إلى يدويّ (قرار البناء ب١).
//   • حوضٌ بلا كروت النبوءة لا يتغيّر فيه شيء (حماية موسم العنقاء).
//   • تغيير كرت مقعد يمرّ بالقواعد نفسها.
//   • المولّد التلقائيّ لا يختارها أبداً، حتّى لو وُجدت في جدول التعريفات.
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getRoleDefs } from '../game/definition-service.js';
import {
  Role, PROPHECY_ROLES, isProphecyRole, teamOfRole, MAFIA_KILL_PRIORITY, ROLE_NAMES_AR, getTeamCounts,
} from '../game/roles.js';
import { analyzeDuplicates } from '../game/role-duplicates.js';
import { applyPoolRules, changeSeatCard, prophecyPoolRules } from '../game/setup-deal.js';
import { generateRolesDynamic } from '../game/dynamic-role-generator.js';
import { SPECIAL_ROLES } from '../game/state.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

function room(roles: string[], config: any = {}): any {
  return {
    players: roles.map((r, i) => ({ physicalId: i + 1, name: `P${i + 1}`, role: r, isAlive: true })),
    rolesPool: [...roles],
    config: { nightMode: 'auto', useDynamicEngine: false, ...config },
  };
}
const base12 = ['GODFATHER', 'SILENCER', 'MAFIA_REGULAR', 'SHERIFF', 'DOCTOR', 'SNIPER', 'POLICEWOMAN', 'NURSE', 'MAYOR', 'PHOENIX', 'CITIZEN', 'JESTER'];

// ════════════════════════════════════════════
section('الفرق والأسماء');
check('المُضلّل مافيا', teamOfRole(Role.DECEIVER) === 'MAFIA');
check('قارئة الفنجان مستقلّة', teamOfRole(Role.CUP_READER) === 'NEUTRAL');
check('العرّاف مواطن', teamOfRole(Role.ORACLE) === 'CITIZEN');
check('المنقسم يبدأ مواطناً', teamOfRole(Role.DIVIDED) === 'CITIZEN');
check('الكفيل مواطن', teamOfRole(Role.GUARANTOR) === 'CITIZEN');
check('لكلّ كرتٍ اسمٌ عربيّ', PROPHECY_ROLES.every((r) => !!ROLE_NAMES_AR[r]));
check('الخمسة في مجمّع عقود السفّاح', PROPHECY_ROLES.every((r) => SPECIAL_ROLES.includes(r)));
check('isProphecyRole يميّزها وحدها', PROPHECY_ROLES.every(isProphecyRole) && !isProphecyRole('SHERIFF') && !isProphecyRole(null));
const counts = getTeamCounts([{ role: 'DECEIVER', isAlive: true }, { role: 'CUP_READER', isAlive: true }, { role: 'ORACLE', isAlive: true }] as any);
check('عدّ الفرق: مافيا ١ · مستقلّ ١ · مواطن ١', counts.mafiaAlive === 1 && counts.neutralAlive === 1 && counts.citizenAlive === 1, JSON.stringify(counts));

section('سلسلة الاغتيال والتكرار');
const oldOrder = ['GODFATHER', 'CHAMELEON', 'MAFIA_REGULAR', 'OLDER_BROTHER', 'SILENCER', 'WITCH'];
check('الترتيب القائم كما هو', JSON.stringify(MAFIA_KILL_PRIORITY.filter((r) => r !== Role.DECEIVER)) === JSON.stringify(oldOrder), MAFIA_KILL_PRIORITY.join(','));
check('المُضلّل بعد الأخ الأكبر وقبل القصّ', MAFIA_KILL_PRIORITY.indexOf(Role.DECEIVER) === MAFIA_KILL_PRIORITY.indexOf(Role.OLDER_BROTHER) + 1);
for (const r of PROPHECY_ROLES) {
  const d = analyzeDuplicates([r, r]);
  check(`«${ROLE_NAMES_AR[r]}» لا يتكرّر`, d.blocked.length === 1 && d.blocked[0].role === r);
}

// ════════════════════════════════════════════
section('حوضٌ بلا كروت النبوءة — لا يتغيّر شيء');
{
  const st = room(base12);
  const r: any = applyPoolRules(st, { roles: base12 });
  check('يُقبل', r.ok === true);
  check('النمط الآليّ يبقى آليّاً', st.config.nightMode === 'auto' && r.nightModeSwitched === false);
  check('المحرّك القديم يبقى', st.config.useDynamicEngine === false);
  check('prophecyCards = false', st.config.prophecyCards === false);
  check('إعدادات النبوءة لا تُكتب إن لم تُرسل', st.config.oracleTestament === undefined && st.config.cupThreshold === undefined && st.config.deceiverMasks === undefined);
}

section('حوضٌ فيه كرتٌ منها');
const withOracle = [...base12.slice(0, 10), 'ORACLE', 'JESTER'];
{
  const st = room(withOracle);
  const r: any = applyPoolRules(st, { roles: withOracle });
  check('بلا محتوى الموسم ⇒ PROPHECY_OFF', r.ok === false && r.code === 'PROPHECY_OFF', JSON.stringify(r));
  check('ولا يمسّ الإعدادات', st.config.nightMode === 'auto' && st.config.useDynamicEngine === false);
}
{
  const st = room(withOracle, { prophecy: true });
  const r: any = applyPoolRules(st, { roles: withOracle, oracleTestament: false });
  check('بالمحتوى ⇒ يُقبل', r.ok === true, JSON.stringify(r));
  check('يفرض المحرّك الديناميكيّ', st.config.useDynamicEngine === true);
  check('الآليّ صار يدويّاً، والإشارة تُعاد للموجّه', st.config.nightMode === 'manual' && r.nightModeSwitched === true);
  check('prophecyCards = true', st.config.prophecyCards === true);
  check('الوصيّة تُحفظ كما أُرسلت', st.config.oracleTestament === false);
}
{
  const st = room(withOracle, { prophecy: true, prophecyOff: ['ORACLE'] });
  const r: any = applyPoolRules(st, { roles: withOracle });
  check('كرتٌ مطفأٌ بمفتاحه ⇒ CARD_OFF', r.ok === false && r.code === 'CARD_OFF');
}
{
  const st = room(withOracle, { prophecy: true, isRemote: true });
  const r: any = applyPoolRules(st, { roles: withOracle });
  check('غرفة عن بُعد ⇒ PROPHECY_REMOTE', r.ok === false && r.code === 'PROPHECY_REMOTE');
}
{
  const two = [...withOracle.slice(0, 11), 'ORACLE'];
  const st = room(two, { prophecy: true });
  const r: any = applyPoolRules(st, { roles: two });
  check('عرّافان ⇒ يُرفضان كنسختين', r.ok === false && r.code === 'DUPLICATE_ROLES_BLOCKED');
}

section('الإعدادات: العتبة والأقنعة');
{
  const roles24 = [...Array(24)].map((_, i) => (i === 0 ? 'DECEIVER' : i === 1 ? 'CUP_READER' : i < 6 ? 'MAFIA_REGULAR' : 'CITIZEN'));
  const st = room(roles24, { prophecy: true });
  applyPoolRules(st, { roles: roles24, cupThreshold: 3, deceiverMasks: 2 });
  check('عتبة ٣ تُحفظ', st.config.cupThreshold === 3);
  check('قناعان من ٢٤ لاعباً', st.config.deceiverMasks === 2);
  applyPoolRules(st, { roles: roles24, cupThreshold: 0 });
  check('عتبة ٠ = تلقائيّ (تُمحى)', st.config.cupThreshold === undefined);
  const roles16 = roles24.slice(0, 16);
  const st2 = room(roles16, { prophecy: true });
  applyPoolRules(st2, { roles: roles16, deceiverMasks: 2 });
  check('تحت ٢٤ لاعباً: قناعٌ واحد مهما طُلب', st2.config.deceiverMasks === 1);
}

section('تغيير كرت مقعد في التوزيع');
{
  const st = room(base12);
  const r: any = changeSeatCard(st, 11, 'ORACLE');
  check('بلا محتوى الموسم ⇒ يُرفض', r.ok === false && r.code === 'PROPHECY_OFF');
  check('والمقعد لم يتغيّر', st.players[10].role === 'CITIZEN');
  const st2 = room(base12, { prophecy: true });
  const r2: any = changeSeatCard(st2, 11, 'ORACLE');
  check('بالمحتوى ⇒ يُقبل ويفرض الديناميكيّ', r2.ok === true && st2.config.useDynamicEngine === true && st2.config.nightMode === 'manual');
  const r3: any = changeSeatCard(st2, 11, 'CITIZEN');
  check('إرجاعه مواطناً ⇒ prophecyCards = false', r3.ok === true && st2.config.prophecyCards === false);
}

section('قاعدة النبوءة نفسها');
{
  const c: any = { nightMode: 'manual' };
  const r: any = prophecyPoolRules(c, ['CITIZEN', 'SHERIFF']);
  check('بلا كروتها ⇒ لا شيء', r.ok === true && r.nightModeSwitched === false && c.prophecyCards === false && c.useDynamicEngine === undefined);
}

// ════════════════════════════════════════════
section('المولّد التلقائيّ لا يختارها');
primeTestDefs();
(async () => {
  const defs = await getRoleDefs();
  const extra = PROPHECY_ROLES.map((id, i) => ({
    id, nameAr: ROLE_NAMES_AR[id], nameEn: id, team: teamOfRole(id), abilities: [],
    genPriority: 0, genMaxCount: 3, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'master',
  }));
  // أسوأ الحالات: صفوفٌ بأعلى أولويّة وإلزاميّة — يجب أن يستثنيها الكود نفسه
  __primeDefsForTest({ roles: [...defs, ...(extra as any)] });
  let leaked: string[] = [];
  for (const n of [6, 10, 16, 20, 30]) {
    const g = await generateRolesDynamic(n);
    leaked = leaked.concat([...g.mafiaRoles, ...g.citizenRoles, ...g.neutralRoles].filter(isProphecyRole));
  }
  check('لا كرت نبوءة في أيّ توليد (٦ إلى ٣٠)', leaked.length === 0, leaked.join(','));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
