// ══════════════════════════════════════════════════════
// 🧪 استردادُ المقعد — الهويّةُ من التوكن لا من الحمولة
//
// تشغيل: JWT_SECRET=test npx tsx src/scripts/test-seat-claim.ts   (نقي — بلا قاعدة ولا Redis)
// ══════════════════════════════════════════════════════

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-seat-claim';
const { resolveSeatClaim } = await import('../sockets/seat-claim.js');
const { generatePlayerToken } = await import('../middleware/player-auth.middleware.js') as any;

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const state = {
  roomId: 'r1',
  players: [
    { physicalId: 1, name: 'حساب', phone: '0790000001', playerId: 501 },
    { physicalId: 2, name: 'ضيف', phone: '0790000002', playerId: null },
    { physicalId: 3, name: 'ضيف بلا هاتف', phone: null, playerId: null },
    { physicalId: 4, name: 'حساب ثانٍ', phone: '0790000004', playerId: 504 },
  ],
};
const sock = (data: any = {}) => ({ data });

console.log('\n━━━ بتوكن المصافحة ━━━');
{
  const r = resolveSeatClaim(state, sock({ authPlayer: { playerId: 501, phone: '0790000001' } }), { playerId: 501 });
  check('صاحب الحساب يستردّ مقعده', r.player?.physicalId === 1 && !r.error);
  const m = resolveSeatClaim(state, sock({ authPlayer: { playerId: 501 } }), { playerId: 504 });
  check('توكنٌ يدّعي حساباً آخر ⇒ IDENTITY_MISMATCH', m.error === 'IDENTITY_MISMATCH' && !m.player);
  const ph = resolveSeatClaim(state, sock({ authPlayer: { playerId: 501 } }), { phone: '0790000004' });
  check('توكنٌ + هاتفُ مقعدِ حسابٍ آخر ⇒ مقعدُه هو لا ذاك', ph.player?.physicalId === 1, JSON.stringify(ph));
  const ph2 = resolveSeatClaim(state, sock({ authPlayer: { playerId: 777 } }), { phone: '0790000004' });
  check('توكنٌ غيرُ جالس + هاتفُ مقعدِ حساب ⇒ لا مقعد', !ph2.player, JSON.stringify(ph2));
  const g = resolveSeatClaim(state, sock({ authPlayer: { playerId: 777, phone: '0790000002' } }), {});
  check('صاحب توكنٍ جالسٌ بهاتفه في مقعد ضيف ⇒ يستردّه', g.player?.physicalId === 2);
  const n = resolveSeatClaim(state, sock({ authPlayer: { playerId: 777 } }), { phone: '0799999999' });
  check('صاحب توكنٍ غير جالس ⇒ لا مقعد ولا خطأ', !n.player && !n.error);
}

console.log('\n━━━ بلا توكن ━━━');
{
  const a = resolveSeatClaim(state, sock({}), { playerId: 501 });
  check('ادّعاءُ مقعدٍ مربوطٍ بحساب بالمعرّف ⇒ LOGIN_REQUIRED', a.error === 'LOGIN_REQUIRED' && !a.player);
  const b = resolveSeatClaim(state, sock({}), { phone: '0790000001' });
  check('ادّعاؤه بهاتفه ⇒ LOGIN_REQUIRED', b.error === 'LOGIN_REQUIRED' && !b.player);
  const c = resolveSeatClaim(state, sock({}), { phone: '0790000002' });
  check('الضيف بهاتفه ⇒ مقعده', c.player?.physicalId === 2 && !c.error);
  const d = resolveSeatClaim(state, sock({}), { phone: '962790000002' });
  check('الضيف بصيغة 962 ⇒ مقعده (تطبيع)', d.player?.physicalId === 2, JSON.stringify(d));
  const e = resolveSeatClaim(state, sock({}), {});
  check('بلا شيء ⇒ لا مقعد', !e.player && !e.error);
}

console.log('\n━━━ التوكن في الحمولة (مقبسٌ فُتح قبل تسجيل الدخول) ━━━');
{
  const tok = generatePlayerToken({ playerId: 501, phone: '0790000001', name: 'حساب' });
  const r = resolveSeatClaim(state, sock({}), { playerId: 501, playerToken: tok });
  check('توكنٌ صالح في الحمولة ⇒ مقعده', r.player?.physicalId === 1 && !r.error, JSON.stringify(r));
  const bad = resolveSeatClaim(state, sock({}), { playerId: 501, playerToken: tok + 'x' });
  check('توكنٌ مزوّر ⇒ LOGIN_REQUIRED', bad.error === 'LOGIN_REQUIRED');
  const other = resolveSeatClaim(state, sock({}), { playerId: 504, playerToken: tok });
  check('توكنُ حسابٍ وادّعاءُ غيره ⇒ IDENTITY_MISMATCH', other.error === 'IDENTITY_MISMATCH');
}

console.log('\n━━━ مقبسٌ مربوطٌ أصلاً بمقعده ━━━');
{
  const bound = sock({ role: 'player', roomId: 'r1', physicalId: 1 });
  const r = resolveSeatClaim(state, bound, { playerId: 501 });
  check('المربوط بمقعده (بلا توكن) يبقى له', r.player?.physicalId === 1 && !r.error);
  const r2 = resolveSeatClaim(state, bound, { playerId: 504 });
  check('المربوط بمقعدٍ يدّعي غيره ⇒ LOGIN_REQUIRED', r2.error === 'LOGIN_REQUIRED');
  const elsewhere = sock({ role: 'player', roomId: 'r2', physicalId: 1 });
  check('مربوطٌ في غرفةٍ أخرى لا ينفعه', resolveSeatClaim(state, elsewhere, { playerId: 501 }).error === 'LOGIN_REQUIRED');
}

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل  (المجموع ${pass + fail})`);
if (fail) { console.log('\nالفاشلة:'); failures.forEach(f => console.log('  • ' + f)); process.exit(1); }
