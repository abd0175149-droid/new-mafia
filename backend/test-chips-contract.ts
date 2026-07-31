// ══════════════════════════════════════════════════════
// 🧪 عقد تصاميم الخزنة — اختبار بلا قاعدة بيانات
//
// يثبت أن جانب **الكتابة** لا يقبل تخزين إعداد يستحيل رسمه، وأن الأنواع
// السبعة كلها صارت قابلة للتأليف — وهي شكوى المالك الأصلية: «لا أستطيع
// إضافة عناصر بتصاميم جديدة».
//
// التشغيل:  cd backend && npx tsx test-chips-contract.ts
// ══════════════════════════════════════════════════════

import {
  normalizeFx, normalizeItemConfig, normalizeEmblemId, designRegistry,
  FX_CHANNELS, FX_DEFAULTS, DEFAULT_DAYS_BY_KIND, KEY_PREFIX_BY_KIND,
  EMBLEM_IDS, FRAME_SVG_TYPES,
} from './src/shared/chips-design.contract.js';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const KINDS = ['frame', 'title', 'name_fx', 'entrance', 'elimination', 'victory_sting', 'xp_boost'];

console.log('\n🎨 عقد تصاميم الخزنة\n');

// ── ١) الأنواع السبعة كلها قابلة للتأليف ──
console.log('١) تغطية الأنواع:');
const valid: Record<string, any> = {
  frame: { border: { enabled: true, color: '#ff0000' } },
  title: { text: '☠️ سفّاح الليل', style: 'blood' },
  name_fx: { nameEffect: { color: '#fcd34d', glowColor: '#f59e0b', glowSize: 12 } },
  entrance: { design: 'seal', durationMs: 4200 },
  elimination: { design: 'burn' },
  victory_sting: { soundKey: 'chips_sting_gunshot' },
  xp_boost: { multiplier: 2 },
};
for (const k of KINDS) {
  const r = normalizeItemConfig(k, valid[k]);
  check(r.ok, `«${k}» يُقبل بإعداد صالح`, r.message || '');
  check(!!KEY_PREFIX_BY_KIND[k], `«${k}» له بادئة مفتاح`, KEY_PREFIX_BY_KIND[k] || 'مفقودة');
  check(typeof DEFAULT_DAYS_BY_KIND[k] === 'number', `«${k}» له مدّة افتراضية`, String(DEFAULT_DAYS_BY_KIND[k]));
}
check(DEFAULT_DAYS_BY_KIND.xp_boost === 7, 'معزّز الخبرة ٧ أيام (الاستثناء المعتمد)');
check(normalizeItemConfig('zzz', {}).ok === false, 'نوع مجهول مرفوض');

// ── ٢) الرفض الصريح حيث كان التصحيح الصامت مضلِّلاً ──
console.log('\n٢) الرفض الصريح:');
{
  const t = normalizeItemConfig('title', { text: 'x', style: 'رمادي' });
  check(!t.ok && t.field === 'config.style', 'نمط لقب مجهول **يُرفض** ولا يُبدَّل بصمت إلى الذهبي', JSON.stringify(t));

  const t2 = normalizeItemConfig('title', { text: '   ' });
  check(!t2.ok && t2.field === 'config.text', 'لقب بلا نصّ مرفوض');

  const e = normalizeItemConfig('entrance', { design: 'zzz' });
  check(!e.ok && e.field === 'config.design', 'تشريفة بتخطيط مجهول مرفوضة (كانت تسقط صامتةً على «الملف السري»)');

  const el = normalizeItemConfig('elimination', { design: 'freeze' });
  check(!el.ok, 'نمط إقصاء مجهول مرفوض (كان يُخزَّن ولا يُرسم شيء)');

  const s = normalizeItemConfig('victory_sting', { soundKey: 'Bad Key!' });
  check(!s.ok && s.field === 'config.soundKey', 'مفتاح صوت غير صالح مرفوض');

  const f = normalizeItemConfig('frame', {});
  check(!f.ok, 'إطار بلا أي قناة مفعّلة مرفوض — لا يُباع ما لا يُرى');
  const f2 = normalizeItemConfig('frame', { glow: { enabled: true } });
  check(!f2.ok, 'إطار بتوهّج فقط مرفوض (التوهّج لا يُرسم بلا حدود)');
}

// ── ٣) القصّ يمنع تخزين ما يُسقط المُصيّر ──
console.log('\n٣) القصّ عند الكتابة:');
{
  const r = normalizeItemConfig('frame', {
    border: { enabled: true, color: 'red', style: 'zzz' },
    particles: { enabled: true, count: 99999, orbitRadius: '50%' },
    glow: { enabled: true, size: 1e9 },
    frame: { enabled: true, type: 'hexagon' },
  });
  check(r.ok, 'إطار بقيم فاسدة يُقبل بعد القصّ (لا يُرفض بلا داعٍ)');
  const c = r.config;
  check(c.border.color === FX_DEFAULTS.border.color, 'لون غير سداسي → الافتراضي');
  check(c.border.style === 'solid', 'نمط حدود مجهول → solid');
  check(c.particles.count === 12, 'عدد الجزيئات مقصوص عند ١٢');
  check(c.particles.orbitRadius === FX_DEFAULTS.particles.orbitRadius, 'نصف قطر بنسبة مئوية مرفوض');
  check(c.glow.size === 60, 'حجم التوهّج مقصوص عند ٦٠');
  check(c.frame.type === 'none', 'شكل إطار مجهول → none');
  check(c.border.gradientColors.length >= 2, 'التدرّج لا يقلّ عن نقطتين (بلون واحد يسقط CSS كلياً)');
  check(Object.keys(c).length === FX_CHANNELS.length, 'الناتج يحمل القنوات العشر كاملة');
  check((r.coerced || []).length > 0, 'الحقول المُصحَّحة تُبلَّغ (تُسجَّل في سجلّ الموظفين)', JSON.stringify(r.coerced));
}
{
  const arr = normalizeItemConfig('frame', ['not', 'an', 'object'] as any);
  check(!arr.ok, 'مصفوفة كإعداد إطار مرفوضة');
  const fx = normalizeFx([] as any);
  check(Object.keys(fx).length === FX_CHANNELS.length, 'normalizeFx على مصفوفة يُنتج كائناً كاملاً');
}

// ── ٤) المدّة والمضاعِف يُحترمان ويُقصّان ──
console.log('\n٤) القيم الرقمية:');
{
  const e = normalizeItemConfig('entrance', { design: 'don', durationMs: 999999 });
  check(e.ok && e.config.durationMs === 6000, 'مدّة التشريفة مقصوصة عند ٦ ثوانٍ (كانت تُهمَل تماماً)');
  const e2 = normalizeItemConfig('entrance', { design: 'don', durationMs: 4200 });
  check(e2.ok && e2.config.durationMs === 4200, 'مدّة التشريفة تُحترم فعلاً الآن');
  const x = normalizeItemConfig('xp_boost', { multiplier: 99 });
  check(x.ok && x.config.multiplier === 3, 'المضاعِف مقصوص عند ٣ (سقف التوازن)');
  check(x.config.applies === 'xp_only', 'المعزّز خبرة فقط — لا يمسّ الرانك');
}

// ── ٥) الشعار والسجلّ ──
console.log('\n٥) السجلّ:');
{
  check(normalizeEmblemId('don') === 'don', 'شعار معروف يُقبل');
  check(normalizeEmblemId('zzz') === null, 'شعار مجهول → null (لا يُخزَّن معرّف لا يُرسم)');
  check(normalizeEmblemId(undefined) === null, 'غياب الشعار → null');
  const reg = designRegistry();
  check(reg.emblems.length === EMBLEM_IDS.length && reg.emblems.length === 8, 'السجلّ يحمل الشعارات الثمانية');
  check(reg.frameSvgTypes.length === FRAME_SVG_TYPES.length, 'السجلّ يحمل أشكال الإطار');
  check(!!reg.fxDefaults && !!reg.defaultDaysByKind, 'السجلّ يحمل الافتراضيات والمُدد');
  // كل معرّف في السجلّ يجب أن يقبله المُطبِّع — وإلا عرضت اللوحة خياراً يُرفض
  const badTitle = reg.titleStyles.filter(st => !normalizeItemConfig('title', { text: 'x', style: st }).ok);
  check(badTitle.length === 0, 'كل نمط لقب في السجلّ يقبله المُطبِّع', badTitle.join(','));
  const badEnt = reg.entranceDesigns.filter(d => !normalizeItemConfig('entrance', { design: d }).ok);
  check(badEnt.length === 0, 'كل تخطيط تشريفة في السجلّ يقبله المُطبِّع', badEnt.join(','));
  const badElim = reg.eliminationDesigns.filter(d => !normalizeItemConfig('elimination', { design: d }).ok);
  check(badElim.length === 0, 'كل نمط إقصاء في السجلّ يقبله المُطبِّع', badElim.join(','));
}

// ── ٦) الثبات ──
console.log('\n٦) الثبات:');
{
  let stable = true;
  for (const k of KINDS) {
    const once = normalizeItemConfig(k, valid[k]);
    const twice = normalizeItemConfig(k, once.config);
    if (!twice.ok || JSON.stringify(once.config) !== JSON.stringify(twice.config)) stable = false;
  }
  check(stable, 'التطبيع ثابت لكل نوع: normalize(normalize(x)) === normalize(x)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
