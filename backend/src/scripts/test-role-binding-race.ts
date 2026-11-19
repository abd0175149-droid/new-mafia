// ══════════════════════════════════════════════════════
// 🧪 سباقُ ربط الأدوار — حادثة 2026-11-19 (مباراة 941)
//
// موجّهان (admin وqais) فتحا شاشة الربط معاً فوزّع كلُّ جهازٍ توزيعاً عشوائيّاً تلقائيّاً
// في اللحظة نفسها (30 ملّي ثانية). كلُّ توزيعٍ يكتب لاعباً لاعباً، فتداخلت الكتابات وخرج
// خليطٌ من توزيعين: شيخان وساحرتان، ومواطنان أقلّ. لم يمنع الاعتمادَ ولا بدءَ اللعبة شيءٌ.
//
// يركّب معالجات lobby.socket الحقيقيّة على سوكِتاتٍ وهميّة — مخزن الذاكرة، بلا Redis ولا DB.
// تشغيل: npx tsx src/scripts/test-role-binding-race.ts
// ══════════════════════════════════════════════════════

import { registerLobbyEvents } from '../sockets/lobby.socket.js';
import { createRoom, getRoom, addPlayer, Phase } from '../game/state.js';
import { setGameState, deleteGameState } from '../config/redis.js';

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const all: any[] = [];
const emitted: Array<{ to: string; ev: string; payload: any }> = [];
let seq = 0;
function mkSocket(role?: string) {
  const handlers = new Map<string, Function>();
  const s: any = {
    id: `sk${++seq}`, data: role ? { role } : {}, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {}, query: {} },
    on: (ev: string, fn: Function) => { handlers.set(ev, fn); return s; },
    join: (r: string) => { s.rooms.add(r); }, leave: (r: string) => { s.rooms.delete(r); },
    emit: (ev: string, payload: any) => { emitted.push({ to: s.id, ev, payload }); return true; },
    to: () => ({ emit() { return true; } }), broadcast: { to: () => ({ emit() { return true; } }), emit() { return true; } },
    disconnect() {},
  };
  all.push(s);
  return {
    s,
    call: (ev: string, data: any): Promise<any> => new Promise((resolve, reject) => {
      const h = handlers.get(ev);
      if (!h) return reject(new Error(`no handler ${ev}`));
      const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 15000);
      Promise.resolve(h(data, (r: any) => { clearTimeout(t); resolve(r); })).catch((e) => { clearTimeout(t); reject(e); });
    }),
  };
}
const io: any = {
  to: (room: string) => ({ emit: (ev: string, payload: any) => { emitted.push({ to: room, ev, payload }); return true; } }),
  in: (room: string) => ({ fetchSockets: async () => all.filter((s) => s.rooms.has(room)), emit: () => true }),
  emit: () => true, sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};
io.of = () => io;

const leaderA = mkSocket('leader'); registerLobbyEvents(io, leaderA.s);
const leaderB = mkSocket('leader'); registerLobbyEvents(io, leaderB.s);
const display = mkSocket('display'); registerLobbyEvents(io, display.s);

// حوضُ مباراة 941 مصغّراً: شيخٌ وساحرةٌ واحدان، قنّاصان وسفّاحان مسموحان
const POOL = [
  'GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'MAFIA_REGULAR', 'MAFIA_REGULAR',
  'SHERIFF', 'DOCTOR', 'SNIPER', 'SNIPER', 'NURSE', 'MAYOR', 'JESTER', 'ASSASSIN', 'ASSASSIN',
  'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN',
];
const N = POOL.length;
const rooms: string[] = [];

const tally = (roles: any[]) => {
  const m: Record<string, number> = {};
  for (const r of roles) if (r) m[r] = (m[r] || 0) + 1;
  return m;
};
const sameAsPool = (st: any) => JSON.stringify(Object.entries(tally(st.players.map((p: any) => p.role))).sort())
  === JSON.stringify(Object.entries(tally(POOL)).sort());
const describe = (st: any) => {
  const want = tally(POOL), have = tally(st.players.map((p: any) => p.role));
  return Object.keys({ ...want, ...have }).filter((r) => want[r] !== have[r]).map((r) => `${r} ${have[r] || 0}/${want[r] || 0}`).join(' · ');
};

async function bindingRoom(name: string): Promise<string> {
  const st = await createRoom(name, N + 5);
  const roomId = st.roomId; rooms.push(roomId);
  for (let i = 1; i <= N; i++) await addPlayer(roomId, i, `لاعب ${i}`, null, null, 'leader');
  const s: any = await getRoom(roomId);
  s.phase = Phase.ROLE_BINDING;
  s.rolesPool = [...POOL];
  s.rolesConfirmed = false;
  // سجلّ «المافيا المتتالية» يقرأ القاعدة بانتظارٍ يُزامن الطلبين فيُخفي السباق — الإنتاجُ يقرؤه بزمنٍ متفاوت
  s.config.maxConsecutiveMafiaGames = 0;
  await setGameState(roomId, s);
  for (const l of [leaderA, leaderB, display]) { l.s.join(roomId); l.s.data.roomId = roomId; }
  return roomId;
}

async function main() {
  console.log('\n━━━ أ) موجّهان يوزّعان عشوائيّاً في اللحظة نفسها ━━━');
  {
    // مخزن الذاكرة بلا زمن شبكة: لو بدأ الطلبان معاً لسارا خطوةً بخطوة فكتب الثاني فوق الأوّل كاملاً.
    // في الإنتاج وصل الثاني بعد 30 ملّي ثانية فتداخلا — نُزيح بدء الثاني بعددٍ متزايد من الخطوات.
    // مخزنُ الذاكرة يُنهي كلَّ قراءةٍ وكتابة في «مهمّةٍ صغرى» — فالإزاحةُ بالمهامّ الصغرى لا بالدورات
    const ticks = async (n: number) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
    let bad = 0; let sample = '';
    const RUNS = 300;
    for (let k = 0; k < RUNS; k++) {
      const roomId = await bindingRoom(`سباق ${k}`);
      const [ra, rb] = await Promise.all([
        leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] }),
        ticks(k).then(() => leaderB.call('setup:random-assign', { roomId, lockedPhysicalIds: [] })),
      ]);
      const st: any = await getRoom(roomId);
      if (!sameAsPool(st)) { bad++; sample = describe(st); }
      if (k === 0) check('الطلبان يُجابان', !!ra && !!rb, JSON.stringify({ a: ra?.error, b: rb?.error }));
    }
    check(`${RUNS} سباقاً بإزاحاتٍ مختلفة: الأدوار المربوطة تطابق الحوض دائماً`, bad === 0, `${bad}/${RUNS} خليط — مثال: ${sample}`);
  }

  console.log('\n━━━ ب) التوزيع التلقائيّ عند فتح الشاشة لا يكتب فوق توزيعٍ قائم ━━━');
  {
    const roomId = await bindingRoom('تلقائيّ');
    const first = await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [], auto: true });
    const before = JSON.stringify(((await getRoom(roomId)) as any).players.map((p: any) => p.role));
    const second = await leaderB.call('setup:random-assign', { roomId, lockedPhysicalIds: [], auto: true });
    const after = JSON.stringify(((await getRoom(roomId)) as any).players.map((p: any) => p.role));
    check('الأوّل يوزّع', first?.success === true && first.skipped !== true, JSON.stringify(first?.error));
    check('الثاني (تلقائيّ) يُتخطّى ويعيد التوزيع القائم', second?.success === true && second.skipped === true, JSON.stringify({ ok: second?.success, skipped: second?.skipped }));
    check('…والتوزيع لم يتغيّر', before === after);
    check('…ويحمل رقمَ نسخة التوزيع', typeof second?.bindingRev === 'number' && second.bindingRev === first?.bindingRev, `${first?.bindingRev} / ${second?.bindingRev}`);
    const manual = await leaderB.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    check('الضغطُ اليدويّ على «وزّع» يعيد التوزيع فعلاً', manual?.success === true && manual.skipped !== true && manual.bindingRev > first.bindingRev);
  }

  console.log('\n━━━ ج) الربط اليدويّ لا يتجاوز عدد الكرت في الحوض ━━━');
  {
    const roomId = await bindingRoom('يدويّ');
    await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    const st: any = await getRoom(roomId);
    const gf = st.players.find((p: any) => p.role === 'GODFATHER');
    const cit = st.players.find((p: any) => p.role === 'CITIZEN');
    const dup = await leaderA.call('setup:bind-role', { roomId, physicalId: cit.physicalId, role: 'GODFATHER' });
    check('شيخٌ ثانٍ مرفوض', dup?.success === false && dup.code === 'ROLE_COUNT_EXCEEDED', JSON.stringify(dup));
    const ghost = await leaderA.call('setup:bind-role', { roomId, physicalId: cit.physicalId, role: 'POLICEWOMAN' });
    check('كرتٌ ليس في الحوض مرفوض', ghost?.success === false && ghost.code === 'ROLE_NOT_IN_POOL', JSON.stringify(ghost));
    const sniper = st.players.find((p: any) => p.role === 'SNIPER');
    await leaderA.call('setup:unbind-role', { roomId, physicalId: sniper.physicalId });
    const re = await leaderA.call('setup:bind-role', { roomId, physicalId: sniper.physicalId, role: 'SNIPER' });
    check('القنّاص الثاني (مسموحٌ في الحوض) يُربط بعد فكّه', re?.success === true, JSON.stringify(re));
    const self = await leaderA.call('setup:bind-role', { roomId, physicalId: gf.physicalId, role: 'GODFATHER' });
    check('إعادةُ ربط الكرت لصاحبه نفسه لا تُعدّ تكراراً', self?.success === true, JSON.stringify(self));
    check('الحالة النهائيّة تطابق الحوض', sameAsPool(await getRoom(roomId)), describe(await getRoom(roomId)));
  }

  console.log('\n━━━ د) الإرسال للهواتف يرفض توزيعاً لا يطابق الحوض ━━━');
  {
    const roomId = await bindingRoom('بوّابة الإرسال');
    await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    const st: any = await getRoom(roomId);
    st.players.find((p: any) => p.role === 'CITIZEN').role = 'GODFATHER';   // حقنُ تكرارٍ كما في الحادثة
    await setGameState(roomId, st);
    const r = await leaderA.call('setup:confirm-roles', { roomId });
    check('شيخان ⇒ رفض صريح', r?.success === false && r.code === 'ROLE_MISMATCH', JSON.stringify(r));
    check('…والرسالة تسمّي الكرت', typeof r?.error === 'string' && r.error.includes('شيخ'), r?.error);
    check('…ولم تُعتمد الأدوار', ((await getRoom(roomId)) as any).rolesConfirmed !== true);
  }

  console.log('\n━━━ هـ) نسخة التوزيع: جهازٌ يرسل ما لم يعد قائماً ━━━');
  {
    const roomId = await bindingRoom('نسخة');
    const a = await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    const b = await leaderB.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    const stale = await leaderA.call('setup:confirm-roles', { roomId, expectedRev: a.bindingRev });
    check('الموجّه أ يرسل نسخته القديمة ⇒ BINDING_CHANGED', stale?.success === false && stale.code === 'BINDING_CHANGED', JSON.stringify(stale?.code));
    check('…ومعه الحالة الحاليّة ليراجعها', Array.isArray(stale?.state?.players) && stale.bindingRev === b.bindingRev);
    const ok = await leaderA.call('setup:confirm-roles', { roomId, expectedRev: b.bindingRev });
    check('بالنسخة الحاليّة يُرسل', ok?.success === true, JSON.stringify(ok));
    const evs = emitted.filter((e) => e.ev === 'setup:binding-updated');
    check('تغييرُ التوزيع يُبلَّغ للموجّهين', evs.some((e) => e.to === leaderA.s.id) && evs.some((e) => e.to === leaderB.s.id));
    check('…ولا يصل شاشة العرض (فيه الأدوار)', !evs.some((e) => e.to === display.s.id));
  }

  console.log('\n━━━ و) ربطٌ أو فكٌّ بعد الإرسال يُسقط الاعتماد ━━━');
  {
    const roomId = await bindingRoom('بعد الإرسال');
    await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    await leaderA.call('setup:confirm-roles', { roomId });
    check('أُرسلت', ((await getRoom(roomId)) as any).rolesConfirmed === true);
    const st: any = await getRoom(roomId);
    await leaderB.call('setup:unbind-role', { roomId, physicalId: st.players[0].physicalId });
    check('فكٌّ بعد الإرسال ⇒ الاعتماد سقط', ((await getRoom(roomId)) as any).rolesConfirmed === false);
    const start = await leaderA.call('setup:binding-complete', { roomId });
    check('…فلا تبدأ اللعبة بأدوارٍ لم تصل الهواتف', start?.success === false, JSON.stringify(start));
  }

  console.log('\n━━━ ز) بدء اللعبة: بوّابةٌ أخيرة وضغطةٌ واحدة ━━━');
  {
    const roomId = await bindingRoom('بدء');
    await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    await leaderA.call('setup:confirm-roles', { roomId });
    const st: any = await getRoom(roomId);
    st.players.find((p: any) => p.role === 'CITIZEN').role = 'WITCH';   // تكرارٌ تسلّل بعد الاعتماد
    await setGameState(roomId, st);
    const bad = await leaderA.call('setup:binding-complete', { roomId });
    check('ساحرتان ⇒ لا تبدأ اللعبة', bad?.success === false && bad.code === 'ROLE_MISMATCH', JSON.stringify(bad));
    check('…والطور باقٍ على الربط', ((await getRoom(roomId)) as any).phase === Phase.ROLE_BINDING);

    const room2 = await bindingRoom('بدء مزدوج');
    await leaderA.call('setup:random-assign', { roomId: room2, lockedPhysicalIds: [] });
    await leaderA.call('setup:confirm-roles', { roomId: room2 });
    const [x, y] = await Promise.all([
      leaderA.call('setup:binding-complete', { roomId: room2 }),
      leaderB.call('setup:binding-complete', { roomId: room2 }),
    ]);
    check('موجّهان يضغطان «ابدأ» معاً ⇒ يبدأ مرّةً واحدة', [x, y].filter((r) => r?.success === true).length === 1, JSON.stringify([x?.success, x?.error, y?.success, y?.error]));
    check('…والطور نهار الجولة 1', ((await getRoom(room2)) as any).phase === Phase.DAY_DISCUSSION && ((await getRoom(room2)) as any).round === 1);
  }

  console.log('\n━━━ ح) لا ربط ولا حوضَ جديد أثناء لعبةٍ جارية ━━━');
  {
    const roomId = await bindingRoom('أثناء اللعب');
    await leaderA.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    await leaderA.call('setup:confirm-roles', { roomId });
    await leaderA.call('setup:binding-complete', { roomId });
    const st: any = await getRoom(roomId);
    const victim = st.players[0];
    const u = await leaderB.call('setup:unbind-role', { roomId, physicalId: victim.physicalId });
    check('فكّ ربطٍ من شاشةٍ قديمة أثناء اللعب مرفوض', u?.success === false, JSON.stringify(u));
    const b = await leaderB.call('setup:bind-role', { roomId, physicalId: victim.physicalId, role: 'CITIZEN' });
    check('ربطٌ أثناء اللعب مرفوض', b?.success === false, JSON.stringify(b));
    const ra = await leaderB.call('setup:random-assign', { roomId, lockedPhysicalIds: [] });
    check('توزيعٌ عشوائيّ أثناء اللعب مرفوض', ra?.success === false);
    const pool = await leaderB.call('setup:roles-confirmed', { roomId, roles: POOL, confirmDuplicates: true, supportsDuplicatePrompt: true });
    check('اعتمادُ حوضٍ جديد أثناء اللعب مرفوض (كان يعيد الطور إلى الربط)', pool?.success === false, JSON.stringify(pool));
    const end: any = await getRoom(roomId);
    check('…واللعبة كما هي', end.phase === Phase.DAY_DISCUSSION && end.players[0].role === victim.role);
  }

  for (const r of rooms) { try { await deleteGameState(r); } catch {} }
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} نجح · ${fail} فشل`);
  if (fail) { for (const f of failures) console.log('   • ' + f); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
