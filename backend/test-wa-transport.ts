// ══════════════════════════════════════════════════════
// 🧪 الموجِّه بين القناتين — اختبار بلا قاعدة
//   npx tsx test-wa-transport.ts
// يغطّي: الأوضاع الأربعة × المسارات الثلاثة × (نافذة ميتا، اللصوق، التثبيت، القفل، البديل،
// غياب الجلسة) + قاعدة المالك: لا شرط على الجلسة (لا نافذة ولا محادثة سابقة).
// ══════════════════════════════════════════════════════

process.env.WA_TOKEN = 'test-token';
process.env.WA_PHONE_NUMBER_ID = '123';
process.env.OPENWA_URL = 'http://gw:2785';
process.env.OPENWA_API_KEY = 'k';
process.env.OPENWA_SESSION_ID = 's';

let pass = 0, fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; } else { fail++; console.log('  ✗', name); }
}

const H = 3600e3;
const ago = (h: number) => new Date(Date.now() - h * H);
const conv = (o: any = {}) => ({ id: 1, phone: '0790000000', waPhone: '962790000000', channel: 'cloud', channelPin: null, cloudLastInboundAt: null, webLastInboundAt: null, lastInboundAt: null, ...o });

(async () => {
  const { pickChannel, setWebReady, cloudWindowOpen } = await import('./src/services/wa-transport/router.js');
  const { __setTransportSettingsForTest } = await import('./src/services/wa-transport/settings.js');
  const { suspendSending, resumeSending, sendingSuspendedReason } = await import('./src/services/wa-transport/locks.js');
  const { isUnreachable } = await import('./src/services/wa-transport/types.js');
  const mode = (m: any, extra: any = {}) => __setTransportSettingsForTest({ mode: m, ...extra });

  console.log('— cloud_only (الوضع الحاليّ تماماً)');
  mode('cloud_only');
  ok(pickChannel(conv({ cloudLastInboundAt: ago(2) }), 'reply').channel === 'cloud', 'نافذة مفتوحة ⇒ ميتا');
  const closed = pickChannel(conv({ cloudLastInboundAt: ago(30) }), 'reply');
  ok(closed.channel === null && closed.code === 'WINDOW_EXPIRED', 'نافذة مغلقة ⇒ WINDOW_EXPIRED كما كان');
  ok(pickChannel(conv({ channel: 'web', webLastInboundAt: ago(1) }), 'reply').channel === null, 'لا إرسال عبر الجلسة في cloud_only');
  ok(pickChannel(conv({ cloudLastInboundAt: ago(23.9) }), 'bulk').channel === 'cloud', 'قبل نهاية النافذة بدقائق ⇒ ميتا');
  ok(cloudWindowOpen({ lastInboundAt: ago(2) } as any) === true, 'صفّ جزئيّ {lastInboundAt} يُقرأ كنافذة ميتا');
  ok(cloudWindowOpen({ lastInboundAt: ago(2), channel: 'web' } as any) === false, 'صفّ جزئيّ وارده من الجلسة لا يفتح نافذة ميتا');

  console.log('— dual');
  mode('dual');
  ok(pickChannel(conv({ channel: 'web', webLastInboundAt: ago(1), cloudLastInboundAt: ago(1) }), 'reply').channel === 'web', 'لاصق: راسل الجلسة ⇒ الردّ منها');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'reply').channel === 'cloud', 'لاصق: راسل ميتا ⇒ الردّ منها');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(40) }), 'timely').channel === 'web', 'نافذة ميتا مغلقة ⇒ رقم الأعمال');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: null }), 'bulk').channel === 'web', 'لا محادثة سابقة أصلاً ⇒ رقم الأعمال (لا شرط)');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1), channelPin: 'web' }), 'reply').channel === 'web', 'التثبيت اليدويّ يغلب اللصوق');
  ok(pickChannel(conv({ channel: 'web', channelPin: 'cloud', cloudLastInboundAt: ago(40) }), 'reply').channel === 'web', 'تثبيت ميتا ونافذتها مغلقة ⇒ الجلسة');

  console.log('— web_primary');
  mode('web_primary');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'bulk').channel === 'web', 'الجماعيّ يفضّل رقم الأعمال');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'timely').channel === 'web', 'المقيّد بوقت يفضّل رقم الأعمال');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'reply').channel === 'cloud', 'الردّ يبقى لاصقاً بميتا');

  console.log('— web_final (الجلسة + ميتا للتحويل)');
  mode('web_final');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'reply').channel === 'cloud', 'من راسل ميتا: البوت يردّ منها');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'bulk').channel === 'web', 'لا جماعيّ من ميتا');
  ok(pickChannel(conv({ channel: 'cloud', cloudLastInboundAt: ago(1) }), 'timely').channel === 'web', 'لا مقيّد بوقت من ميتا');
  ok(pickChannel(conv({ channel: 'web' }), 'reply').channel === 'web', 'من راسل الجلسة ⇒ الجلسة');

  console.log('— الأقفال والبديل');
  mode('dual');
  suspendSending('اختبار', 'web');
  const tf = pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(1) }), 'timely');
  ok(tf.channel === 'cloud' && tf.failover === true, 'الجلسة مقفلة + timely ⇒ بديل ميتا (نافذتها مفتوحة)');
  ok(pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(1) }), 'bulk').channel === 'web', 'الجماعيّ بلا بديل ⇒ القناة نفسها (فيُرمى «مقفل»)');
  ok(pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(1) }), 'reply').channel === 'web', 'الردّ بلا بديل');
  ok(pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(30) }), 'timely').channel === 'web', 'لا بديل حين نافذة ميتا مغلقة');
  ok(sendingSuspendedReason() === null, 'قناةٌ واحدة مقفلة في dual ⇒ الإرسال غير متوقّف كلّيّاً');
  suspendSending('اختبار', 'cloud');
  ok(!!sendingSuspendedReason(), 'القناتان مقفلتان ⇒ متوقّف كلّيّاً');
  mode('web_final', { failover: { reply: false, timely: true, bulk: false } });
  await resumeSending('cloud');
  const wf = pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(1) }), 'timely');
  ok(wf.channel === 'cloud' && wf.failover === true, 'web_final: تذكير يخرج من ميتا بديلاً حين الجلسة مقفلة');
  await resumeSending('web');
  setWebReady(false);
  mode('dual');
  const nr = pickChannel(conv({ channel: 'web', cloudLastInboundAt: ago(1) }), 'timely');
  ok(nr.channel === 'cloud' && nr.failover === true, 'الجلسة غير جاهزة ⇒ بديل للمسار المقيّد بوقت');
  setWebReady(true);
  mode('cloud_only');
  suspendSending('اختبار', 'web');
  ok(sendingSuspendedReason() === null, 'cloud_only: قفل الجلسة لا يوقف شيئاً');
  await resumeSending('web');

  console.log('— بلا جلسة مهيّأة');
  delete process.env.OPENWA_URL;
  // env مقروءٌ عند الاستيراد؛ نحاكي «غير مهيّأة» بإعادة الاستيراد في عمليّة منفصلة لاحقاً — هنا نكتفي بالرموز
  ok(isUnreachable({ code: 'WINDOW_EXPIRED' }) && isUnreachable({ code: 'CHANNEL_UNAVAILABLE' }) && !isUnreachable({ code: 'SENDING_SUSPENDED' }), 'تصنيف «تعذّر الوصول»');

  console.log(`\n${fail ? '❌' : '✅'} wa-transport: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
