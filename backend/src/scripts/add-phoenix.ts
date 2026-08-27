// ══════════════════════════════════════════════════════
// 🔥 تركيبُ العنقاء على قاعدةٍ قائمة
//
//   npx tsx src/scripts/add-phoenix.ts          (يُركّب ولا يمسّ ما كُتب)
//   npx tsx src/scripts/add-phoenix.ts --force  (يكتب فوق القالب والدور والمحتوى)
//
// 🔴 سكربتٌ مستقلٌّ لا توسعةٌ لـseed-game-config: البذرةُ الكبرى مُطفأةٌ في
//    الإنتاج (NODE_ENV=production)، وتشغيلُها هناك يمسّ ستّةَ عشرَ دوراً وقوالبَها
//    كلَّها. هذا يمسّ صفّاً واحداً وقالباً واحداً ومحتوىً واحداً — لا غير.
//
// ⚠️ ملفُّ الوجه يعيش في volume الـuploads لا في المستودع: انسخه قبل التشغيل
//    وإلّا صار المسارُ في القاعدة يشير إلى لا شيء.
// ══════════════════════════════════════════════════════

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { connectDB, getDB } from '../config/db.js';
import { cardTemplates, roleDefinitions } from '../schemas/game-config.schema.js';

const FACE_URL = '/uploads/card-faces/phoenix_card-1756310000000.jpg';
const FORCE = process.argv.includes('--force');

const TEMPLATE = {
  id: 'phoenix_card',
  gradient: 'from-orange-800 via-red-950 to-stone-950',
  borderColor: '#f97316',
  textColor: '#fed7aa',
  glowEffect: '0 0 34px rgba(249,115,22,0.40)',
  teamBadge: { text: 'مواطنون', bgColor: '#064e3b', textColor: '#a7f3d0', borderColor: '#10b981' },
  icon: { type: 'EMOJI', value: '🔥' },
  secretFace: { type: 'custom', customImageUrl: FACE_URL },
  elements: { showPlayerNumber: true, showClubBranding: false, showDescription: false },
};

const ROLE = {
  id: 'PHOENIX',
  nameAr: 'العنقاء',
  nameEn: 'Phoenix',
  team: 'CITIZEN' as const,
  abilities: [] as string[],
  genPriority: 7,
  genMaxCount: 1,
  genMinPlayers: 10,
  genIsRequired: false,
  cardTemplateId: 'phoenix_card',
  description: 'لا يستيقظ ولا يختار. مَن حاول قتله ليلاً احترق معه، ونهض العنقاء من رماده. وإن أعدمته المدينة أخذ معه أحد مَن صوّتوا عليه',
  cardOverrides: { icon: { type: 'EMOJI', value: '🔥' } },
  oneLiner: 'مَن مدّ يدَه إليك ليلاً احترق — وقمتَ أنت من رمادك.',
  howItWorks: 'لا تستيقظ ولا يُطلب منك اختيار. إن حاول أحدٌ إخراجَك ليلاً — اغتيالَ مافيا أو قنصاً أو سفّاحاً — احترق هو وبقيتَ أنت. ولك رصيدٌ محدودٌ من مرّات النهوض يعرفه الموجّه وحده؛ فإذا نفد خرجتَ ومعك مَن أخرجك.',
  extraLimits: [
    'رصيدُ النهوض محدود — والموجّهُ وحده يعرف ما بقي منه',
    'ليلةٌ واحدةٌ تستهلك رصيداً واحداً مهما تعدّد مَن مدّوا أيديَهم',
    'حمايةُ الطبيب تُبطل الضربةَ قبل أن تبلغَك: لا يحترق أحد ولا يُستهلك رصيد',
    'تعطيلُ الساحرة يُطفئ القاعدةَ تلك الجولة — تموت كأيّ مواطن',
    'الإعدامُ بالتصويت والقنبلةُ وثأرُ الشرطيّة تُخرجك بلا بعث',
  ],
  interactsWith: [
    'الشريفُ يراك «مواطناً» — لا استثناءَ لك عنده',
    'القنّاصُ يحترق بك ولا يرتدّ عليه خطؤه مرّتين',
    'السفّاحُ يحترق ولا يُحتسب له عقدُه عليك',
    'ثأرُ الشرطيّة يُخرجك مباشرةً — فهي مُقصاةٌ سلفاً ولا تحترق',
    'ارتدادُ الصفقة يقع عليك كأيّ مواطنٍ صالح',
  ],
  tips: [
    'اصمتْ عن قاعدتك: قيمتُك في أنّ المافيا لا تعرف أين أنت',
    'إن احترق قاتلٌ في الصباح فقد كُشفتَ عمليّاً — العبْ على أنّك هدفٌ للإعدام لا للّيل',
  ],
  actsInPhases: [] as string[],
  phaseNotes: {
    night: 'لا تستيقظ ولا تختار. دورُك أن تكون هدفاً — والفخُّ يعمل وحده.',
    discussion: 'لا تُعلن قاعدتَك ما دام الرصيدُ فيك؛ إعلانُها يحوّل المافيا إلى التصويت.',
    voting: 'إن سِيقَ اسمُك إلى الإعدام فاعلمْ أنّك تأخذ معك أحدَ مَن صوّتوا عليك.',
    justification: 'دافعْ كمواطن. وإن سقطتَ فاختر مَن رفع يدَه عليك.',
    dead: 'إن أعدمتك المدينةُ همستَ للموجّه باسمِ واحدٍ ممّن صوّتوا عليك فيخرج معك.',
  },
};

async function main() {
  await connectDB();
  const db = getDB();
  if (!db) throw new Error('DB unavailable');

  // ── القالب ──
  const [tpl] = await db.select().from(cardTemplates).where(eq(cardTemplates.id, 'phoenix_card'));
  if (!tpl) {
    await db.insert(cardTemplates).values(TEMPLATE as any);
    console.log('✅ قالبُ البطاقة phoenix_card — أُنشئ');
  } else if (FORCE) {
    await db.update(cardTemplates).set({ ...TEMPLATE, updatedAt: new Date() } as any).where(eq(cardTemplates.id, 'phoenix_card'));
    console.log('♻️  قالبُ البطاقة phoenix_card — كُتب فوقه');
  } else {
    console.log('⏭️  قالبُ البطاقة phoenix_card موجودٌ — تُرك كما هو');
  }

  // ── الدور ──
  const [role] = await db.select().from(roleDefinitions).where(eq(roleDefinitions.id, 'PHOENIX'));
  if (!role) {
    await db.insert(roleDefinitions).values(ROLE as any);
    console.log('✅ الدور PHOENIX — أُنشئ');
  } else if (FORCE) {
    await db.update(roleDefinitions).set({ ...ROLE, updatedAt: new Date() } as any).where(eq(roleDefinitions.id, 'PHOENIX'));
    console.log('♻️  الدور PHOENIX — كُتب فوقه');
  } else {
    // 🔴 لا يُكتب فوق تحرير الأدمن: تُملأ الحقولُ الفارغة وحدها
    const patch: Record<string, any> = {};
    const empty = (v: any) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    for (const k of ['oneLiner', 'howItWorks', 'extraLimits', 'interactsWith', 'tips'] as const) {
      if (empty((role as any)[k])) patch[k] = (ROLE as any)[k];
    }
    if ((role as any).phaseNotes == null) patch.phaseNotes = ROLE.phaseNotes;
    if ((role as any).actsInPhases == null) patch.actsInPhases = ROLE.actsInPhases;
    if (Object.keys(patch).length) {
      await db.update(roleDefinitions).set({ ...patch, updatedAt: new Date() } as any).where(eq(roleDefinitions.id, 'PHOENIX'));
      console.log(`✅ الدور PHOENIX — مُلئ: ${Object.keys(patch).join(', ')}`);
    } else {
      console.log('⏭️  الدور PHOENIX مكتملٌ — تُرك كما هو');
    }
  }

  // ── المصغّران ──
  try {
    const { ensureThumbs } = await import('../services/card-face-thumbs.service.js');
    const ok = await ensureThumbs('phoenix_card-1756310000000.jpg');
    console.log(ok ? '🖼️  المصغّران جاهزان' : '⚠️  تعذّر توليدُ المصغّرين — هل نُسخ ملفُّ الوجه؟');
  } catch (e: any) {
    console.log(`⚠️  المصغّران: ${e.message}`);
  }

  console.log('\n🔥 تمّ.');
  process.exit(0);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
