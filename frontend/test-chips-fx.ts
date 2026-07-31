// ══════════════════════════════════════════════════════
// 🧪 اختبار عقد تأثيرات البطاقة — بلا قاعدة بيانات وبلا متصفّح
//
// يثبت أن أي إعداد مشوَّه لا يمكن أن يصل المُصيّر ناقصاً. هذا هو الاختبار
// الذي يقف بين «حفظة أدمن واحدة» و«شاشة القاعة سوداء في منتصف الفعالية».
//
// التشغيل:  cd frontend && npx tsx test-chips-fx.ts
// ══════════════════════════════════════════════════════

import {
  normalizeFx, mergeFx, hasAnyEnabled, hasLayerVisuals,
  FX_DEFAULTS, FX_CHANNELS, type FxChannels,
} from './src/lib/chips-fx';
import { buildNameFxStyle } from './src/lib/name-fx';

let pass = 0, fail = 0;
function check(ok: boolean, label: string, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

/** يُحاكي ما يفعله المُصيّر: يقرأ كل قناة بلا حماية */
function renderProbe(fx: FxChannels) {
  const touched: any[] = [];
  touched.push(fx.border.enabled, fx.border.color, fx.border.width, fx.border.inset, fx.border.style, fx.border.gradientColors.join(','), fx.border.travelSpeed);
  touched.push(fx.glow.enabled, fx.glow.color, fx.glow.size, fx.glow.opacity, fx.glow.pulseEnabled, fx.glow.pulseDuration);
  touched.push(fx.shimmer.enabled, fx.shimmer.color, fx.shimmer.opacity, fx.shimmer.duration);
  touched.push(fx.particles.enabled, fx.particles.count, fx.particles.color, fx.particles.size, fx.particles.orbitRadius, fx.particles.baseDuration, fx.particles.originX, fx.particles.originY, fx.particles.animationType);
  touched.push(fx.corners.enabled, fx.corners.color, fx.corners.size, fx.corners.width, fx.corners.pulseEnabled);
  touched.push(fx.frame.enabled, fx.frame.type, fx.frame.color, fx.frame.opacity, fx.frame.strokeWidth, fx.frame.animate);
  touched.push(fx.gradientOverlay.enabled, fx.gradientOverlay.color, fx.gradientOverlay.opacity, fx.gradientOverlay.direction);
  touched.push(fx.floating.enabled, fx.floating.content, fx.floating.position, fx.floating.size, fx.floating.animation, fx.floating.glowColor);
  touched.push(fx.badge.enabled, fx.badge.emoji, fx.badge.label, fx.badge.bgColor, fx.badge.textColor, fx.badge.borderColor);
  touched.push(fx.nameEffect.enabled, fx.nameEffect.color, fx.nameEffect.glowColor, fx.nameEffect.glowSize);
  // أي NaN يُفسد اختصار CSS كاملاً بصمت — نعدّه فشلاً لا تسامح فيه
  return touched.filter(v => typeof v === 'number' && Number.isNaN(v)).length;
}

console.log('\n🎨 عقد تأثيرات البطاقة\n');

// ── ١) المدخلات المشوّهة لا تُسقط المُصيّر ──
console.log('١) مدخلات مشوّهة:');
const nasty: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['null', null],
  ['كائن فارغ {}', {}],
  ['مصفوفة []', []],
  ['نصّ', 'not-an-object'],
  ['رقم', 42],
  ['توهّج فقط (الحالة التي كانت تُسقط الشاشة)', { glow: { enabled: true } }],
  ['إطار بلا لون', { border: { enabled: true } }],
  ['لون غير سداسي', { border: { enabled: true, color: 'red' } }],
  ['قناة null', { border: null, badge: null }],
  ['قناة مصفوفة', { particles: [] }],
  ['اسم بلا حجم توهّج', { nameEffect: { enabled: true, color: '#fff000', glowColor: '#f59e0b' } }],
  ['اسم بلا لون توهّج', { nameEffect: { enabled: true } }],
  ['قيم لا نهائية', { glow: { size: Infinity }, particles: { count: NaN, baseDuration: -Infinity } }],
  ['مفاتيح مجهولة', { zzz: { enabled: true }, corners: { enabled: true }, badge: { position: 'top-left' } }],
];
for (const [label, input] of nasty) {
  let nans = -1, threw = '';
  try { nans = renderProbe(normalizeFx(input)); } catch (e: any) { threw = e?.message || 'throw'; }
  check(!threw && nans === 0, `«${label}» → كائن كامل بلا NaN`, threw || `NaN×${nans}`);
}

// ── ٢) القصّ والحدود ──
console.log('\n٢) القصّ:');
check(normalizeFx({ particles: { count: 99999 } }).particles.count === 12, 'عدد الجزيئات مقصوص عند ١٢ (حلقة غير محدودة تُجمّد الشاشة)');
check(normalizeFx({ particles: { count: -5 } }).particles.count === 0, 'عدد سالب يصير صفراً');
check(normalizeFx({ glow: { size: 9999 } }).glow.size === 60, 'حجم التوهّج مقصوص عند ٦٠');
check(normalizeFx({ border: { color: 'red' } }).border.color === FX_DEFAULTS.border.color, 'لون غير صالح يعود للافتراضي');
check(normalizeFx({ frame: { type: 'zzz' } }).frame.type === 'none', 'شكل إطار مجهول يصير none بدل رسم لا شيء بصمت');
check(normalizeFx({ border: { style: 'zzz' } }).border.style === 'solid', 'نمط حدود مجهول يعود لـ solid');
check(normalizeFx({ particles: { animationType: 'zzz' } }).particles.animationType === 'orbit', 'نوع حركة مجهول يعود لـ orbit');
check(normalizeFx({ particles: { orbitRadius: 'javascript:x' } }).particles.orbitRadius === FX_DEFAULTS.particles.orbitRadius, 'نصف قطر غير رقمي مرفوض');

// ── ٣) القيد الحقيقي: التوهّج لا يُرسم إلا داخل الإطار ──
console.log('\n٣) قيد التوهّج:');
check(normalizeFx({ glow: { enabled: true } }).glow.enabled === false, 'توهّج والإطار مطفأ ⇒ يُطفأ (المُصيّر لا يرسمه أصلاً)');
check(normalizeFx({ border: { enabled: true }, glow: { enabled: true } }).glow.enabled === true, 'توهّج مع إطار مفعّل ⇒ يبقى');

// ── ٤) الثبات (idempotence) ──
console.log('\n٤) الثبات:');
const samples: unknown[] = [{}, { border: { enabled: true, color: '#ff0000' } }, { badge: { enabled: true, emoji: '👑', label: 'أسطوري' } }, FX_DEFAULTS];
let stable = true;
for (const s of samples) {
  const once = normalizeFx(s);
  const twice = normalizeFx(once);
  if (JSON.stringify(once) !== JSON.stringify(twice)) stable = false;
}
check(stable, 'التطبيع ثابت: normalize(normalize(x)) === normalize(x)');
check(FX_CHANNELS.length === 10 && JSON.stringify(Object.keys(normalizeFx({}))) === JSON.stringify(FX_CHANNELS), 'الناتج يحمل القنوات العشر بالترتيب نفسه');

// ── ٥) الدمج الطبقيّ — قرار المالك (١٥) ──
console.log('\n٥) الدمج الطبقيّ (المشترى فوق المكتسَب):');
const godfather = {
  border: { enabled: true, color: '#f59e0b', style: 'traveling', gradientColors: ['#b45309', '#fcd34d'] },
  badge: { enabled: true, emoji: '👑', label: 'GODFATHER' },
  floating: { enabled: true, content: '👑' },
  nameEffect: { enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 },
};
const cheapFrame = { border: { enabled: true, color: '#eab308', style: 'solid' } };   // مسرح الجريمة ٢٠🪙

const merged = mergeFx(godfather, cheapFrame);
check(merged.border.color === '#eab308', 'الإطار المشترى يفوز في قناته');
check(merged.badge.enabled === true && merged.badge.label === 'GODFATHER', '⭐ شارة الرتبة المكتسَبة تبقى — لا نعاقب الشراء');
check(merged.floating.enabled === true && merged.floating.content === '👑', 'تاج الرتبة العائم يبقى');
check(merged.nameEffect.enabled === true, 'تأثير اسم الرتبة يبقى');

const paidBadge = { badge: { enabled: true, emoji: '🩸', label: 'ملحمي' } };
check(mergeFx(godfather, paidBadge).badge.label === 'ملحمي', 'حين يُفعّل المشترى القناة نفسها فهو يفوز');

const emptyPaid = mergeFx(godfather, {});
check(emptyPaid.badge.label === 'GODFATHER' && emptyPaid.border.color === '#f59e0b', 'إعداد مشترى فارغ لا يمحو شيئاً');

// ── ٥.٥) التدرّج يحتاج نقطتين على الأقل ──
console.log('\n٥.٥) صلاحية التدرّج:');
{
  // `linear-gradient(135deg, #f59e0b)` غير صالح في CSS: الخاصية كلها تسقط
  // ويختفي الإطار المدفوع بلا أي أثر. الافتراضي نفسه كان بلون واحد.
  const one = normalizeFx({ border: { enabled: true, style: 'traveling', gradientColors: ['#ff0000'] } });
  check(one.border.gradientColors.length >= 2, 'قائمة بلون واحد تُبطَّن إلى نقطتين', JSON.stringify(one.border.gradientColors));
  const none = normalizeFx({ border: { enabled: true, style: 'gradient' } });
  check(none.border.gradientColors.length >= 2, 'قائمة فارغة تُبطَّن إلى نقطتين', JSON.stringify(none.border.gradientColors));
  check(FX_DEFAULTS.border.gradientColors.length >= 1, 'الافتراضي موجود');
  const dflt = normalizeFx({});
  check(dflt.border.gradientColors.length >= 2, 'التطبيع الافتراضي نفسه لا يُنتج تدرّجاً غير صالح');
}

// ── ٦) حرّاس الرسم ──
console.log('\n٦) حرّاس الرسم:');
check(hasAnyEnabled(normalizeFx({})) === false, 'كائن فارغ ⇒ لا قناة مفعّلة');
check(hasAnyEnabled(normalizeFx({ nameEffect: { enabled: true } })) === true, 'تأثير الاسم يُحتسب في hasAnyEnabled');
check(hasLayerVisuals(normalizeFx({ nameEffect: { enabled: true } })) === false, 'تأثير الاسم وحده لا يستدعي طبقة تأثيرات (يُرسم على الاسم مباشرة)');
check(hasLayerVisuals(normalizeFx({ corners: { enabled: true } })) === true, 'الزوايا تستدعي الطبقة — القناة صارت حيّة');
check(hasLayerVisuals(normalizeFx({ glow: { enabled: true } })) === false, 'توهّج بلا إطار لا يستدعي طبقة (لأنه لن يُرسم)');


// ══════════════════════════════════════════════════════
// ٧) كتالوج تأثير الاسم
//
// القاعدة الحاكمة: صفٌّ مخزَّن بلا `style` هو المسار القديم — يجب أن
// يُنتج **نفس سلسلة textShadow بطبقتيها** التي كانت تُرسم، حرفياً.
// ══════════════════════════════════════════════════════
console.log('\n٧) كتالوج تأثير الاسم:');
{
  const b = (cfg: any) => buildNameFxStyle(cfg);

  // ٧.١ 🔒 المسار القديم بلا تغيير بكسل
  const legacy = b({ enabled: true, color: '#fcd34d', glowColor: '#f59e0b', glowSize: 10 });
  const expected = 'rgba(245, 158, 11, 0.45)';
  check(legacy.style.color === '#fcd34d', 'اللون كما هو');
  check(String(legacy.style.textShadow).includes('0 0 10px') && String(legacy.style.textShadow).includes('0 0 25px'),
    '🔒 التوهّج بطبقتيه (10px ثم 25px) كما كان حرفياً', String(legacy.style.textShadow));
  check(String(legacy.style.textShadow).includes(expected), 'شفافية الطبقة القريبة 0.45 كما كانت');
  check(legacy.className === '', 'المسار القديم بلا أي صنف — لا حركة مفروضة على من اشترى');

  // ٧.٢ التأثير المطفأ لا يُنتج شيئاً
  const off = b({ enabled: false, color: '#fff' });
  check(Object.keys(off.style).length === 0 && off.className === '', 'المطفأ لا يُنتج أنماطاً');

  // ٧.٣ التدرّج يقصّ الخلفية على الحروف — ولا يستعمل ظلّ النصّ
  const grad = b({ enabled: true, style: 'gradient', color: '#ff0000', color2: '#0000ff', angle: 45, glowSize: 8 });
  check(String(grad.style.backgroundImage).includes('linear-gradient(45deg'), 'التدرّج بزاويته');
  check((grad.style as any).WebkitBackgroundClip === 'text' && (grad.style as any).WebkitTextFillColor === 'transparent',
    'الخلفية مقصوصة على الحروف');
  check(!grad.style.textShadow && String(grad.style.filter).includes('drop-shadow'),
    '⚠️ التوهّج مرشّح لا ظلّ نصّ — ظلّ النصّ لا يُرسم إطلاقاً مع الحروف الشفّافة');

  // ٧.٤ التوهّج في التدرّج مقصوص حفاظاً على قراءة الحرف من بعيد
  const grad2 = b({ enabled: true, style: 'gradient', glowSize: 30 });
  check(String(grad2.style.filter).includes('12px'), 'توهّج التدرّج مقصوص عند ١٢px', String(grad2.style.filter));

  // ٧.٥ الحدّ الخارجي
  const out = b({ enabled: true, style: 'outline', outlineColor: '#000000', outlineWidth: 2 });
  check((out.style as any).WebkitTextStrokeWidth === '2px' && (out.style as any).WebkitTextStrokeColor === '#000000',
    'الحدّ الخارجي بسماكته ولونه');
  check(out.style.paintOrder === 'stroke fill', 'ترتيب الرسم يضع الحدّ خلف الحرف فلا يأكله');

  // ٧.٦ النقش
  const eng = b({ enabled: true, style: 'engraved' });
  check(String(eng.style.textShadow).includes('0 1px 0') && String(eng.style.textShadow).includes('0 -1px 1px'),
    'النقش: ضوء من فوق وظلّ من تحت');

  // ٧.٧ الحركة تُنتج صنفاً ومتغيّرات لا صنفاً لكل قيمة
  const anim = b({ enabled: true, anim: 'pulse', animDuration: 3.5 });
  check(anim.className.includes('namefx-pulse'), 'الحركة تُنتج صنفها');
  check((anim.style as any)['--namefx-dur'] === '3.5s', 'المدّة تصل عبر متغيّر CSS', String((anim.style as any)['--namefx-dur']));

  // ٧.٨ اللمعة مع التدرّج تستعمل حركة الخلفية لا صنف النبض
  const sweep = b({ enabled: true, style: 'gradient', anim: 'sweep' });
  check(sweep.className.includes('namefx-sweep') && String(sweep.style.backgroundSize).includes('250%'),
    'اللمعة تمرّ عبر خلفية أعرض من النص');

  // ٧.٩ الدخول
  const enter = b({ enabled: true, enter: 'rise' });
  check(enter.className.includes('namefx-enter-rise'), 'حركة الدخول تُنتج صنفها');

  // ٧.١٠ القصّ والمدخلات الفاسدة
  const wild = b({
    enabled: true, style: 'nope', anim: 'explode', enter: 'boom',
    color: 'not-a-color', glowSize: 999, outlineWidth: 99, angle: -50, animDuration: 0.0001,
  });
  check(wild.style.color === '#ffffff', 'لون فاسد ⇒ الافتراضي', String(wild.style.color));
  check(String(wild.style.textShadow).includes('30px'), 'حجم التوهّج مقصوص عند ٣٠');
  check(wild.className === '', 'نمط وحركة ودخول مجهولة ⇒ الافتراضي الصامت (لا صنف)');

  for (const bad of [null, undefined, [], 'x', 42]) {
    const r = b(bad);
    check(typeof r.style === 'object' && typeof r.className === 'string',
      `مُدخل من نوع ${typeof bad} لا يُسقط البناء`);
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} النتيجة: ${pass} ناجح · ${fail} فاشل\n`);
process.exit(fail === 0 ? 0 : 1);
