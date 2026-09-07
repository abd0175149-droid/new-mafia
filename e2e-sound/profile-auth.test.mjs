// 🧪 حراسةُ بروفايل اللاعب — الثغرةُ مغلقةٌ والميزاتُ حيّة
//
// 🔴 يُشغَّل على خادمٍ حقيقيّ: `node profile-auth.test.mjs <BASE>`
//    فالمقصودُ إثباتُ سلوكِ الشبكة لا سلوكِ دالّة.
const BASE = process.argv[2] || 'http://localhost:5000';
const NL = String.fromCharCode(10);

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  ← ' + extra : '')); }
};

const get = async (path, token) => {
  const res = await fetch(BASE + path, token ? { headers: { Authorization: 'Bearer ' + token } } : undefined);
  let body = null;
  try { body = await res.json(); } catch { /* غيرُ JSON */ }
  return { status: res.status, body };
};

// معرِّفٌ موجودٌ يقيناً: أوّلُ صفٍّ في القاعدة
const ID = Number(process.argv[3] || 2);

console.log(NL + '🧪 المجهولُ لا يمرّ');
{
  const r = await get(`/api/player/${ID}/profile`);
  ok('‏/profile يردّ ٤٠١ بلا توكن', r.status === 401, 'جاء ' + r.status);
  ok('ولا يسرّب حقلاً واحداً', !r.body?.player, JSON.stringify(r.body || {}).slice(0, 90));

  const p = await get(`/api/player/${ID}/public`);
  ok('‏/public يردّ ٤٠١ بلا توكن', p.status === 401, 'جاء ' + p.status);
}

console.log(NL + '🧪 التوكنُ الفاسد لا يمرّ');
{
  const r = await get(`/api/player/${ID}/profile`, 'not-a-real-token');
  ok('‏/profile يردّ ٤٠١ بتوكنٍ فاسد', r.status === 401, 'جاء ' + r.status);
}

console.log(NL + '🧪 البطاقةُ العامّة لا تحمل بياناتٍ شخصيّة');
{
  // 🔴 يُفحص الشكلُ لا المحتوى: الحقلُ الحسّاس إمّا غائبٌ عن العقد أو مسرَّب.
  //    فحصُ قيمةٍ بعينها كان سينجح على لاعبٍ حقلُه فارغٌ أصلاً ويخفي التسريب.
  const BANNED = ['phone', 'dob', 'email', 'passwordHash', 'isLocked', 'lockedReason',
    'lockedBy', 'linkedStaffId', 'geofenceExemptReason', 'chipsBalance'];
  const tk = process.env.STAFF_TOKEN || process.env.PLAYER_TOKEN;
  if (!tk) {
    console.log('  ⏭️  تُخطّى — لا توكن في STAFF_TOKEN/PLAYER_TOKEN');
  } else {
    const r = await get(`/api/player/${ID}/public`, tk);
    ok('‏/public يردّ ٢٠٠ بتوكنٍ صالح', r.status === 200, 'جاء ' + r.status);
    const leaked = BANNED.filter(k => r.body?.player && k in r.body.player);
    ok('لا حقلَ حسّاسٍ في البطاقة', leaked.length === 0, 'تسرّب: ' + leaked.join(', '));
    ok('ولا activeGame — سرُّ اللعبة', !('activeGame' in (r.body || {})));
    ok('وفيها ما تحتاجه الواجهة', !!r.body?.player?.name && !!r.body?.progression);
    ok('وسجلُّ المباريات مسقوفٌ بخمسة',
      !r.body?.matchHistory || r.body.matchHistory.length <= 5,
      'جاء ' + (r.body?.matchHistory?.length ?? '—'));
  }
}

console.log(NL + '🧪 لا عدَّ للمعرّفات');
{
  // 🔴 الاختبارُ الحقيقيّ للثغرة: مسحُ مدىً من المعرّفات كما يفعل المهاجم.
  const ids = [1, 2, 50, 200, 400, 814];
  const codes = [];
  for (const id of ids) codes.push((await get(`/api/player/${id}/profile`)).status);
  ok('كلُّ المدى يردّ ٤٠١ — لا ٢٠٠ ولا ٤٠٤',
    codes.every(c => c === 401), 'الرموز: ' + codes.join(','));
}

console.log(NL + (fail === 0 ? '🎉' : '⚠️') + ' النتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);
