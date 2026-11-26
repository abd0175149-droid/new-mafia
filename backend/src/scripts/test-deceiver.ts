// ══════════════════════════════════════════════════════
// 🧪 موسم النبوءة · المرحلة ١ — المُضلّل وقناعه
//
// تشغيل: npx tsx src/scripts/test-deceiver.ts
// بلا قاعدة بيانات ولا Redis — المحرّك الحقيقيّ (resolveNightDynamic + buildNightPlan + buildNightQueue)
// بتعريفات الإنتاج مع قدرة القناع ودور المُضلّل.
//
// قرارات المالك التي يقفلها: ٧ (حتّى أوّل قراءة) · ٨ (قناعٌ، واثنان من ٢٤) · ٩ (تلفيقٌ على غير
// المافيا ولا النفس) · ١٧ (يعرف حين يحترق) · ٣٢ (يبقى بعد خروج صاحبه).
// ══════════════════════════════════════════════════════

import { primeTestDefs } from './_game-fixtures.js';
import { __primeDefsForTest, getAbilityDefs, getRoleDefs } from '../game/definition-service.js';
import { resolveNightDynamic, buildNightQueue, getAvailableTargets, createDynamicNightState, actionKey } from '../game/dynamic-night-resolver.js';
import { buildNightPlan } from '../game/night-plan.js';
import { initDeceiverState, canSeatMask, placeMask, activeMaskOn } from '../game/deceiver-engine.js';
import { projectStateFor, stripSecrets } from '../sockets/broadcast.util.js';
import { remapPhysicalIds } from '../game/seat-remap.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const section = (t: string) => console.log(`\n━━━ ${t} ━━━`);

function P(seat: number, role: string, alive = true): any {
  return { physicalId: seat, name: role + '#' + seat, phone: null, playerId: seat + 1000, role, isAlive: alive, isSilenced: false, justificationCount: 0 };
}
function mkState(players: any[], opts: any = {}): any {
  const s: any = {
    players, round: opts.round ?? 1,
    config: { witchDisableRounds: 3, useDynamicEngine: true, jesterSurviveRounds: 2, ...(opts.config || {}) },
    performanceTracking: { dealOutcomes: [], abilityResults: [], eliminationLog: [] },
    witchPreviousTargets: [], twinState: null, assassinState: null, assassinRivals: null,
    nurseActivated: false, winner: null, dynamicNightState: { actions: {}, lastTargets: {} },
  };
  s.deceiverState = initDeceiverState(s);
  return s;
}
function bag(list: Array<{ by: number; ab: string; t: number | null }>) {
  const n = createDynamicNightState();
  for (const a of list) {
    const action = { abilityId: a.ab, performerPhysicalId: a.by, targetPhysicalId: a.t, skipped: a.t == null };
    n.actions[actionKey(action)] = action;
  }
  return n;
}
const sheriffRes = (ev: any[]) => ev.find((e) => e.type === 'SHERIFF_RESULT')?.extra?.result;
const has = (ev: any[], t: string) => ev.some((e) => e.type === t);

// الطاولة: ١ الشيخ · ٢ المُضلّل · ٣ مافيا · ٤ الشريف · ٥ الطبيب · ٦ القنّاص · ٧ مواطن · ٨ مواطن · ٩ المهرّج · ١٠ مواطن
const table = () => [P(1, 'GODFATHER'), P(2, 'DECEIVER'), P(3, 'MAFIA_REGULAR'), P(4, 'SHERIFF'), P(5, 'DOCTOR'), P(6, 'SNIPER'), P(7, 'CITIZEN'), P(8, 'CITIZEN'), P(9, 'JESTER'), P(10, 'CITIZEN')];

(async () => {
  primeTestDefs();
  const abilities = await getAbilityDefs();
  const roles = await getRoleDefs();
  __primeDefsForTest({
    abilities: [...abilities, { id: 'MASK', nameAr: 'القناع', phase: 'NIGHT', priority: 2, targetType: 'ENEMY', excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'PASSIVE' } as any],
    roles: [...roles, { id: 'DECEIVER', team: 'MAFIA', abilities: ['MASK'], genPriority: 90, nameAr: 'المُضلّل' } as any],
  });

  section('الحالة الابتدائيّة');
  {
    const s = mkState(table());
    check('قناعٌ واحد في طاولة ١٠', s.deceiverState?.masksLeft === 1 && s.deceiverState.deceiverPhysicalId === 2);
    const s2 = mkState(table(), { config: { deceiverMasks: 2 } });
    check('قناعان مطلوبان تحت ٢٤ ⇒ واحد', s2.deceiverState.masksLeft === 1);
    const big = [...table(), ...Array.from({ length: 14 }, (_, i) => P(11 + i, 'CITIZEN'))];
    const s3 = mkState(big, { config: { deceiverMasks: 2 } });
    check('قناعان في طاولة ٢٤', s3.deceiverState.masksLeft === 2);
    check('بلا مُضلّل ⇒ null', initDeceiverState(mkState([P(1, 'GODFATHER'), P(4, 'SHERIFF')])) === null);
  }

  section('خطّة الليل والطابور');
  {
    const s = mkState(table());
    const plan = await buildNightPlan(s);
    const mask = plan.find((x) => x.abilityId === 'MASK');
    check('للمُضلّل خطوةُ قناع', !!mask && mask.seat === 2);
    check('القناعُ لا يُرمى له نرد', mask?.noRandom === true);
    const q = await buildNightQueue(s);
    check('والطابور اليدويّ يعطيه القناع', q.some((x) => x.abilityId === 'MASK' && x.performerPhysicalId === 2));
    const targets = (await getAvailableTargets(s, 'MASK', 2, s.dynamicNightState)).map((p: any) => p.physicalId);
    check('أهدافه: غير المافيا وغير نفسه', !targets.includes(1) && !targets.includes(2) && !targets.includes(3) && targets.includes(4) && targets.includes(9), targets.join(','));
    placeMask(s, 2, 7);
    check('بعد وضعه لا خطوةَ قناعٍ ثانية', !(await buildNightPlan(s)).some((x) => x.abilityId === 'MASK'));
    check('ولا في الطابور', !(await buildNightQueue(s)).some((x) => x.abilityId === 'MASK'));
  }
  {
    const pl = table(); pl[0].isAlive = false; pl[2].isAlive = false; // الشيخ والعاديّ ماتا
    const s = mkState(pl);
    const plan = await buildNightPlan(s);
    const mine = plan.filter((x) => x.seat === 2).map((x) => x.abilityId);
    check('وارثُ الاغتيال: الاغتيالُ أوّلاً ثمّ القناع', JSON.stringify(mine) === JSON.stringify(['KILL', 'MASK']), mine.join(','));
  }

  section('القراءة تنقلب في الليلة نفسها');
  {
    const s = mkState(table(), { round: 2 });
    const ev = await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 7 }, { by: 4, ab: 'INVESTIGATE', t: 7 }]));
    check('الشريف يرى المواطن ٧ «مافيا»', sheriffRes(ev) === 'MAFIA', JSON.stringify(ev.map((e: any) => e.type)));
    check('حدثا القناع للموجّه', has(ev, 'MASK_PLACED') && has(ev, 'MASK_BURNED'));
    check('القناع احترق ومعه إشعار المُضلّل', !activeMaskOn(s, 7) && s.deceiverState.burnNoticeRound === 2);
    check('حدثُ الاحتراق يحمل مقعد المُضلّل', ev.find((e: any) => e.type === 'MASK_BURNED')?.performerPhysicalId === 2);
  }

  section('يبقى حتّى أوّل قراءة');
  {
    const s = mkState(table(), { round: 1 });
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 8 }, { by: 4, ab: 'INVESTIGATE', t: 10 }]));
    check('قراءةُ غيره لا تلمسه', !!activeMaskOn(s, 8) && s.deceiverState.burnNoticeRound == null);
    s.round = 2;
    const ev2 = await resolveNightDynamic(s, bag([{ by: 4, ab: 'INVESTIGATE', t: 8 }]));
    check('ليلةٌ لاحقة: يُقرأ «مافيا» ويحترق', sheriffRes(ev2) === 'MAFIA' && !activeMaskOn(s, 8));
    s.round = 3;
    const ev3 = await resolveNightDynamic(s, bag([{ by: 4, ab: 'INVESTIGATE', t: 8 }]));
    check('القراءةُ التالية تقول الحقيقة: مواطن', sheriffRes(ev3) === 'CITIZEN');
  }

  section('على المستقلّ');
  {
    const s = mkState(table(), { round: 2 });
    const ev = await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 9 }, { by: 4, ab: 'INVESTIGATE', t: 9 }]));
    check('المهرّج المقنَّع يُقرأ «مافيا»', sheriffRes(ev) === 'MAFIA');
  }

  section('لا يقلب إلّا القراءة');
  {
    const s = mkState(table(), { round: 2 });
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 7 }]));
    s.round = 3;
    const ev = await resolveNightDynamic(s, bag([{ by: 6, ab: 'SNIPE', t: 7 }]));
    check('قنصُ المقنَّع: القنّاص يموت معه (الحقيقة)', has(ev, 'SNIPE_CITIZEN') && s.players[5].isAlive === false);
    check('والقنصُ لا يحرق القناع', s.deceiverState.masks[0].burned === false);
  }
  {
    // الشريف يقرأ المقنَّع ويُقتل في الليلة نفسها: الثأرُ بالحقيقة — المواطن لا يخرج معه
    const s = mkState(table(), { round: 2 });
    const ev = await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 7 }, { by: 4, ab: 'INVESTIGATE', t: 7 }, { by: 1, ab: 'KILL', t: 4 }]));
    check('ثأرُ الشريف لا يُخرج المواطن المقنَّع', !has(ev, 'SHERIFF_REVENGE') && s.players[6].isAlive === true, JSON.stringify(ev.map((e: any) => e.type)));
  }

  section('يبقى بعد خروج صاحبه');
  {
    const s = mkState(table(), { round: 1 });
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 10 }]));
    s.round = 2;
    await resolveNightDynamic(s, bag([{ by: 6, ab: 'SNIPE', t: 2 }]));
    check('المُضلّل خرج بالقنص', s.players[1].isAlive === false);
    s.round = 3;
    const ev = await resolveNightDynamic(s, bag([{ by: 4, ab: 'INVESTIGATE', t: 10 }]));
    check('قناعُه ما زال يعمل', sheriffRes(ev) === 'MAFIA');
    check('ولا خطوةَ قناعٍ لميّت', !canSeatMask(s, 2));
  }

  section('قيود الوضع');
  {
    const s = mkState(table());
    check('لا على مافيا', placeMask(s, 2, 3) === null && s.deceiverState.masksLeft === 1);
    check('لا على نفسه', placeMask(s, 2, 2) === null);
    check('لا من غير المُضلّل', placeMask(s, 1, 7) === null);
    const pl = table(); pl[6].isAlive = false;
    const s2 = mkState(pl);
    check('لا على ميّت', placeMask(s2, 2, 7) === null);
  }
  {
    const big = [...table(), ...Array.from({ length: 14 }, (_, i) => P(11 + i, 'CITIZEN'))];
    const s = mkState(big, { config: { deceiverMasks: 2 }, round: 1 });
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 7 }]));
    check('بعد الأوّل: خطوةُ قناعٍ ثانية', (await buildNightPlan(s)).some((x) => x.abilityId === 'MASK'));
    s.round = 2;
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 7 }]));
    check('لا قناعان على المقعد نفسه', s.deceiverState.masks.length === 1 && s.deceiverState.masksLeft === 1);
    await resolveNightDynamic(s, bag([{ by: 2, ab: 'MASK', t: 8 }]));
    check('الثاني على غيره ⇒ نفدت الأقنعة', s.deceiverState.masks.length === 2 && s.deceiverState.masksLeft === 0);
    check('ولا خطوةَ قناعٍ بعدها', !(await buildNightPlan(s)).some((x) => x.abilityId === 'MASK'));
  }

  section('السرّيّة ونقل المقاعد');
  {
    const s = mkState(table(), { round: 2 });
    placeMask(s, 2, 7);
    s.phase = 'DAY_DISCUSSION';
    for (const seat of [2, 4, 7]) {
      const view = projectStateFor(s, seat);
      check(`هاتف المقعد ${seat} لا يرى القناع`, view.deceiverState === undefined && !JSON.stringify(view).includes('masksLeft'));
    }
    check('المتفرّجون لا يرونه', stripSecrets(s).deceiverState === undefined);
    remapPhysicalIds(s, new Map([[2, 12], [7, 17]]));
    check('نقل المقاعد ينقل المُضلّل والمقنَّع', s.deceiverState.deceiverPhysicalId === 12 && s.deceiverState.masks[0].targetPhysicalId === 17, JSON.stringify(s.deceiverState));
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { console.log(failures.map((f) => '   • ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})();
