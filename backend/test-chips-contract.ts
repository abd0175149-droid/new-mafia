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

  // 🔗 الربط صار بمعرّف الملف لا بمفتاح الحدث — فحقل الرفض تغيّر معه.
  //    المفتاح الفاسد لم يعد يُرفض بذاته، بل يسقط الطلب كلّه لغياب نغمة مختارة.
  const s = normalizeItemConfig('victory_sting', { soundKey: 'Bad Key!' });
  check(!s.ok && s.field === 'config.soundId', 'نغمة بلا ملف مربوط مرفوضة', JSON.stringify(s));

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


// ══════════════════════════════════════════════════════
// ٧) لوحة اللقب — التخصيص الكامل
//
// القاعدة الحاكمة: من اشترى لقباً بأحد الأنماط الثلاثة يجب أن يراه
// **كما كان بالضبط**. لذلك تلك الأنماط لا تحمل حقل `plaque` إطلاقاً،
// فتمرّ من مسار CSS القديم بلا أي أنماط سطرية.
// ══════════════════════════════════════════════════════
console.log('\n٧) لوحة اللقب:');
{
  const t = (cfg: any) => normalizeItemConfig('title', cfg) as any;

  // ٧.١ الأنماط الثلاثة تُخزَّن كما كانت — بلا حقل زائد
  for (const style of ['gold', 'blood', 'ghost']) {
    const r = t({ text: 'سفّاح', style });
    const keys = JSON.stringify(Object.keys(r.config).sort());
    check(keys === JSON.stringify(['style', 'text']) && r.config.style === style,
      `النمط «${style}» يُخزَّن بحقلين فقط (لا plaque) — لا يتغيّر شيء لمن اشترى`, keys);
  }

  // ٧.٢ النمط المخصّص يحمل لوحة كاملة
  const custom = t({ text: 'العرّاب', style: 'custom' });
  check(custom.ok && custom.config.style === 'custom' && !!custom.config.plaque,
    'المخصّص يُقبل ويحمل لوحة');
  check(JSON.stringify(Object.keys(custom.config.plaque).sort())
    === JSON.stringify(['anim', 'bg', 'border', 'glow', 'layout', 'shadow', 'text']),
    'اللوحة تحمل قنواتها السبع كاملةً مهما كان المُدخل ناقصاً',
    JSON.stringify(Object.keys(custom.config.plaque || {})));

  // ٧.٣ القصّ يحمي المُصيّر من أي قيمة خارجة
  const wild = t({
    text: 'x', style: 'custom',
    plaque: {
      bg: { type: 'nope', angle: 9999, blur: -5 },
      text: { size: 999, weight: 12345, letterSpacing: 99 },
      border: { width: 99, style: 'zigzag', radius: -3 },
      glow: { size: 999 }, shadow: { size: 999 },
      anim: { type: 'explode', duration: 0.001, intensity: 42 },
      layout: { paddingX: 999, maxWidth: 5 },
    },
  }).config.plaque;
  check(wild.bg.type === 'solid', 'نوع خلفية مجهول ⇒ الافتراضي', wild.bg.type);
  check(wild.bg.angle === 360 && wild.bg.blur === 0, 'الزاوية والضبابية تُقصّان', `${wild.bg.angle}/${wild.bg.blur}`);
  check(wild.text.size === 20 && wild.text.weight === 900, 'حجم النص وسماكته يُقصّان', `${wild.text.size}/${wild.text.weight}`);
  check(wild.border.style === 'solid' && wild.border.radius === 0, 'نمط الحدود واستدارتها يُقصّان');
  check(wild.glow.size === 24 && wild.shadow.size === 30, 'التوهّج والظلّ يُقصّان', `${wild.glow.size}/${wild.shadow.size}`);
  check(wild.anim.type === 'none' && wild.anim.duration === 0.4 && wild.anim.intensity === 1,
    'الحركة: نوع مجهول ⇒ بلا حركة، والمدّة والشدّة تُقصّان');
  check(wild.layout.maxWidth === 40 && wild.layout.paddingX === 24, 'التخطيط يُقصّ');

  // ٧.٤ مصفوفة أو قيمة عبثية مكان اللوحة لا تُسقط شيئاً
  let survived = true;
  for (const bad of [[], 'nope', 42, null, undefined, { bg: null }]) {
    const r = t({ text: 'x', style: 'custom', plaque: bad });
    if (!r.ok || !r.config?.plaque?.bg?.color) survived = false;
  }
  check(survived, 'لوحة من أي نوع فاسد ⇒ افتراضي كامل، لا انهيار ولا رفض');

  // ٧.٥ نمط غير معروف ما زال يُرفض صراحةً (لا تحويل صامت)
  const unknown = t({ text: 'x', style: 'neon' });
  check(!unknown.ok && unknown.field === 'config.style',
    'نمط غير معروف ⇒ رفض صريح لا تحويل صامت');

  // ٧.٦ الثبات: التطبيع مرّتين = مرّة
  const once = t({ text: 'x', style: 'custom', plaque: { anim: { type: 'shimmer' } } }).config.plaque;
  const twice = t({ text: 'x', style: 'custom', plaque: once }).config.plaque;
  check(JSON.stringify(twice) === JSON.stringify(once),
    'التطبيع ثابت: normalize(normalize(x)) === normalize(x)');

  // ٧.٧ النص إلزامي وما زال يُقصّ
  check(!t({ style: 'custom' }).ok, 'اللقب بلا نص مرفوض');
  check(t({ text: 'ط'.repeat(60), style: 'custom' }).config.text.length === 40, 'النص يُقصّ إلى ٤٠ حرفاً');
}


// ══════════════════════════════════════════════════════
// ٨) تصاميم الإقصاء
//
// 🔒 الفخّ المُسلَّح: البوّابة الحيّة كانت `design === 'burn'` — مساواة لا
//    صدق قيمة. أي استخراج يُبدّلها إلى `!!design` يجعل كل تصميم قادم
//    يرسم ناراً. الفحص أدناه يثبت أن التوزيع لكل تصميم على حدة.
// ══════════════════════════════════════════════════════
console.log('\n٨) تصاميم الإقصاء:');
{
  const e = (cfg: any) => normalizeItemConfig('elimination', cfg) as any;

  // ٨.١ التصاميم الخمسة كلها مقبولة
  const designs = ['burn', 'ash', 'drain', 'shatter', 'static'];
  const allOk = designs.every(d => e({ design: d }).ok);
  check(allOk, `التصاميم الخمسة مقبولة (${designs.join(' · ')})`);

  // ٨.٢ 🔒 المجهول ما زال مرفوضاً — لا يُخزَّن معرّف لا يعرف المُصيّر رسمه
  const bad = e({ design: 'explode' });
  check(!bad.ok && bad.field === 'config.design', 'تصميم مجهول مرفوض صراحةً');

  // ٨.٣ كل تصميم يحمل معاملاته الافتراضية الخاصة به
  const burn = e({ design: 'burn' }).config;
  const ash = e({ design: 'ash' }).config;
  check(burn.particles === 7 && burn.color === '#f97316', 'النار بمعاملاتها الأصلية', JSON.stringify(burn));
  check(ash.particles === 12 && ash.color === '#a8a29e', 'الرماد بمعاملاته الخاصة لا بمعاملات النار', JSON.stringify(ash));

  // ٨.٤ 🔒 عنصر مباع اليوم (design فقط) يبقى مطابقاً لما كان يُرسم
  const legacy = e({ design: 'burn' }).config;
  check(legacy.particles === 7, '🔒 عنصر النار المباع سابقاً يُرسم بسبعة ألسنة كما كان');
  check(legacy.speed === 1 && legacy.intensity === 0.85, 'سرعته وشدّته الافتراضيتان تُطابقان المخبوز سابقاً');

  // ٨.٥ القصّ — سقف الجسيمات يحمي معدّل إطارات شاشة القاعة
  const wild = e({
    design: 'burn', particles: 999, speed: 99, intensity: 42,
    color: 'nope', color2: 123,
  }).config;
  check(wild.particles === 16, 'عدد الجسيمات مقصوص عند ١٦ (عشرة مُقصين على شاشة واحدة)', String(wild.particles));
  check(wild.speed === 3 && wild.intensity === 1, 'السرعة والشدّة مقصوصتان');
  check(wild.color === '#f97316' && wild.color2 === '#dc2626', 'ألوان فاسدة ⇒ افتراضي التصميم');

  const wild2 = e({ design: 'burn', particles: -5, speed: 0.001 }).config;
  check(wild2.particles === 0 && wild2.speed === 0.25, 'القيم دون الحدّ تُرفع إليه');

  // ٨.٦ showInRecap ما زال مطفأً افتراضياً (قرار المالك ٥)
  check(e({ design: 'burn' }).config.showInRecap === false,
    'الإقصاء مطفأ في شبكة النتائج افتراضياً (قرار المالك ٥)');
  check(e({ design: 'burn', showInRecap: true }).config.showInRecap === true, 'ويمكن تفعيله صراحةً');

  // ٨.٧ الثبات
  const once = e({ design: 'shatter', particles: 5 }).config;
  const twice = e(once).config;
  check(JSON.stringify(twice) === JSON.stringify(once), 'التطبيع ثابت');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
