// ══════════════════════════════════════════════════════
// 🌱 بذر البيانات الأولية — Game Config Seed
// يحوّل الأدوار والقدرات الحالية (Hardcoded) إلى صفوف DB
// التشغيل: npx tsx src/scripts/seed-game-config.ts
// ══════════════════════════════════════════════════════

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql as rawSql } from 'drizzle-orm';
import * as schema from '../schemas/game-config.schema.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5435/mafia_db_staging';

// 🔥 وجهُ بطاقة العنقاء — الملفُّ يُنسَخ إلى volume الـuploads مع النشر.
//    مصدرٌ واحدٌ يشاركه سكربتُ التركيب add-phoenix.ts.
export const PHOENIX_FACE_URL = '/uploads/card-faces/phoenix_card-1756310000000.jpg';

async function seed() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('🌱 بدء بذر بيانات نظام Data-Driven...\n');

  // ══════════════════════════════════════════════
  // 0. حذف البيانات القديمة (إعادة بذر نظيفة)
  // ══════════════════════════════════════════════
  await db.execute(rawSql`DELETE FROM interaction_rules`);
  await db.execute(rawSql`DELETE FROM role_definitions`);
  await db.execute(rawSql`DELETE FROM card_templates`);
  await db.execute(rawSql`DELETE FROM ability_definitions`);
  console.log('🗑️ تم حذف البيانات القديمة');

  // ══════════════════════════════════════════════
  // 1. القدرات (Ability Definitions)
  // ══════════════════════════════════════════════

  const abilities = [
    { id: 'KILL', nameAr: 'اغتيال', nameEn: 'Kill', phase: 'NIGHT' as const, priority: 1, targetType: 'ENEMY' as const, excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'ELIMINATE' as const, effectOnSuccess: 'ASSASSINATION', effectOnFail: null, canSkip: false, isInheritable: true, inheritanceOrder: ['GODFATHER', 'CHAMELEON', 'SILENCER', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'], deceptionRule: null, soundEvent: 'night_assassination', animationType: 'ASSASSINATION_ATTEMPT' },
    { id: 'SILENCE', nameAr: 'إسكات', nameEn: 'Silence', phase: 'NIGHT' as const, priority: 2, targetType: 'ANY' as const, excludeSelf: false, excludeLastTarget: false, maxTargets: 1, effectType: 'SILENCE' as const, effectOnSuccess: 'SILENCED', effectOnFail: null, canSkip: true, isInheritable: false, inheritanceOrder: null, deceptionRule: null, soundEvent: null, animationType: 'SILENCE' },
    { id: 'INVESTIGATE', nameAr: 'تحقيق', nameEn: 'Investigate', phase: 'NIGHT' as const, priority: 3, targetType: 'ANY' as const, excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'REVEAL_TEAM' as const, effectOnSuccess: 'SHERIFF_RESULT', effectOnFail: null, canSkip: false, isInheritable: false, inheritanceOrder: null, deceptionRule: null, soundEvent: null, animationType: 'INVESTIGATION' },
    // 🩺 الطبيبُ يحمي نفسَه — والنفسُ هدفٌ كأيّ هدفٍ يسري عليه «لا تكرار جولتين» (قرار المالك 2026-08-28).
    //    كان excludeSelf=true مزروعاً هنا ونائماً لأنّ النمط اليدويّ لا يقرؤه؛ أيقظته الليلةُ الواحدة.
    { id: 'PROTECT', nameAr: 'حماية', nameEn: 'Protect', phase: 'NIGHT' as const, priority: 4, targetType: 'ANY' as const, excludeSelf: false, excludeLastTarget: true, maxTargets: 1, effectType: 'BLOCK_ELIMINATE' as const, effectOnSuccess: 'ASSASSINATION_BLOCKED', effectOnFail: 'PROTECTION_FAILED', canSkip: false, isInheritable: false, inheritanceOrder: null, deceptionRule: null, soundEvent: null, animationType: 'PROTECTION' },
    { id: 'SNIPE', nameAr: 'قنص', nameEn: 'Snipe', phase: 'NIGHT' as const, priority: 5, targetType: 'ANY' as const, excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'CONDITIONAL_ELIMINATE' as const, effectOnSuccess: 'SNIPE_MAFIA', effectOnFail: 'SNIPE_CITIZEN', canSkip: true, isInheritable: false, inheritanceOrder: null, deceptionRule: null, soundEvent: null, animationType: 'SNIPE' },
    { id: 'DISABLE_ABILITY', nameAr: 'تعطيل القدرة', nameEn: 'Disable Ability', phase: 'NIGHT' as const, priority: 2, targetType: 'ENEMY' as const, excludeSelf: true, excludeLastTarget: false, maxTargets: 1, effectType: 'DISABLE' as const, effectOnSuccess: 'ABILITY_DISABLED', effectOnFail: null, canSkip: true, isInheritable: false, inheritanceOrder: null, deceptionRule: null, soundEvent: 'night_witch', animationType: 'DISABLE_ABILITY' },
  ];

  for (const ability of abilities) {
    await db.insert(schema.abilityDefinitions).values(ability).onConflictDoNothing();
  }
  console.log(`✅ تم بذر ${abilities.length} قدرة`);

  // ══════════════════════════════════════════════
  // 2. قالب البطاقة الرئيسي (Master Card Template) — CSS values
  // ══════════════════════════════════════════════

  const masterTemplate = {
    id: 'master',
    gradient: 'linear-gradient(to bottom, #991b1b, #1a0000)',
    borderColor: 'rgba(239, 68, 68, 0.6)',
    textColor: '#fca5a5',
    glowEffect: '0 0 40px rgba(239, 68, 68, 0.2)',
    teamBadge: { text: 'فريق المافيا 🔴', bgColor: 'rgba(127,29,29,0.6)', textColor: '#fca5a5', borderColor: 'rgba(239,68,68,0.3)' },
    icon: { type: 'lucide', value: 'Crown' },
    secretFace: { type: 'GENERATED' },
    elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
  };

  await db.insert(schema.cardTemplates).values(masterTemplate).onConflictDoNothing();
  console.log(`✅ تم بذر القالب الرئيسي (master)`);

  const witchTemplate = {
    id: 'witch_card',
    gradient: 'from-purple-900 via-violet-950 to-indigo-950',
    borderColor: '#9333ea',
    textColor: '#e9d5ff',
    glowEffect: '0 0 30px rgba(147,51,234,0.4)',
    teamBadge: { text: 'مافيا', bgColor: '#7c2d12', textColor: '#fed7aa', borderColor: '#ea580c' },
    icon: { type: 'EMOJI', value: '🧙‍♀️' },
    secretFace: { type: 'GENERATED' },
    elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
  };

  await db.insert(schema.cardTemplates).values(witchTemplate).onConflictDoNothing();
  console.log(`✅ تم بذر قالب بطاقة الساحرة (witch_card)`);

  // 🎩 قالب بطاقة العمدة — ذهبيّ ملكيّ يليق بالنفوذ
  const mayorTemplate = {
    id: 'mayor_card',
    gradient: 'from-amber-700 via-yellow-900 to-stone-950',
    borderColor: '#eab308',
    textColor: '#fde68a',
    glowEffect: '0 0 30px rgba(234,179,8,0.35)',
    teamBadge: { text: 'مواطنون', bgColor: '#064e3b', textColor: '#a7f3d0', borderColor: '#10b981' },
    icon: { type: 'EMOJI', value: '🎩' },
    secretFace: { type: 'GENERATED' },
    elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
  };
  await db.insert(schema.cardTemplates).values(mayorTemplate).onConflictDoNothing();
  console.log(`✅ تم بذر قالب بطاقة العمدة (mayor_card)`);

  // 🔥 قالب بطاقة العنقاء — جمرٌ على فحم. الوجهُ صورةٌ مرسومة كاملةً (اسمٌ وشارةٌ
  //    ووصف)، فالعناصرُ المولَّدة فوقها مُطفأة إلّا رقمَ اللاعب.
  const phoenixTemplate = {
    id: 'phoenix_card',
    gradient: 'from-orange-800 via-red-950 to-stone-950',
    borderColor: '#f97316',
    textColor: '#fed7aa',
    glowEffect: '0 0 34px rgba(249,115,22,0.40)',
    teamBadge: { text: 'مواطنون', bgColor: '#064e3b', textColor: '#a7f3d0', borderColor: '#10b981' },
    icon: { type: 'EMOJI', value: '🔥' },
    secretFace: { type: 'custom', customImageUrl: PHOENIX_FACE_URL },
    elements: { showPlayerNumber: true, showClubBranding: false, showDescription: false },
  };
  await db.insert(schema.cardTemplates).values(phoenixTemplate).onConflictDoNothing();
  console.log(`✅ تم بذر قالب بطاقة العنقاء (phoenix_card)`);

  // ══════════════════════════════════════════════
  // 3. الأدوار — جميعها تشير للقالب الرئيسي
  // ══════════════════════════════════════════════

  const roles = [
    // ── المافيا ──
    { id: 'GODFATHER', nameAr: 'شيخ المافيا', nameEn: 'Godfather', team: 'MAFIA' as const, abilities: ['KILL'], genPriority: 1, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'master', description: 'زعيم المافيا — ينفذ عملية الاغتيال كل ليلة', cardOverrides: { icon: { type: 'lucide', value: 'Crown' } } },
    { id: 'SILENCER', nameAr: 'قص المافيا', nameEn: 'Silencer', team: 'MAFIA' as const, abilities: ['SILENCE'], genPriority: 2, genMaxCount: 1, genMinPlayers: 7, genIsRequired: false, cardTemplateId: 'master', description: 'يُسكت لاعباً واحداً فلا يستطيع التحدث في النهار', cardOverrides: { icon: { type: 'lucide', value: 'Scissors' } } },
    { id: 'CHAMELEON', nameAr: 'حرباية المافيا', nameEn: 'Chameleon', team: 'MAFIA' as const, abilities: [], genPriority: 3, genMaxCount: 1, genMinPlayers: 8, genIsRequired: false, cardTemplateId: 'master', description: 'يظهر كمواطن عند تحقيق الشريف — ويرث الاغتيال', cardOverrides: { icon: { type: 'lucide', value: 'Drama' } } },
    { id: 'WITCH', nameAr: 'الساحرة', nameEn: 'Witch', team: 'MAFIA' as const, abilities: ['DISABLE_ABILITY'], genPriority: 3, genMaxCount: 1, genMinPlayers: 8, genIsRequired: false, cardTemplateId: 'witch_card', description: 'تعطّل قدرة لاعب من المواطنين أو المحايدين لعدة راوندات', cardOverrides: { icon: { type: 'EMOJI', value: '🧙‍♀️' } } },
    { id: 'MAFIA_REGULAR', nameAr: 'مافيا عادي', nameEn: 'Mafia Regular', team: 'MAFIA' as const, abilities: [], genPriority: 99, genMaxCount: 10, genMinPlayers: 6, genIsRequired: false, cardTemplateId: 'master', description: 'عضو مافيا عادي — يشارك في النقاش والتصويت', cardOverrides: { icon: { type: 'lucide', value: 'Skull' } } },
    // ── المواطنون ──
    { id: 'SHERIFF', nameAr: 'الشريف', nameEn: 'Sheriff', team: 'CITIZEN' as const, abilities: ['INVESTIGATE'], genPriority: 1, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'master', description: 'يحقق في هوية لاعب واحد كل ليلة', cardOverrides: { icon: { type: 'lucide', value: 'Shield' } } },
    { id: 'DOCTOR', nameAr: 'الطبيب', nameEn: 'Doctor', team: 'CITIZEN' as const, abilities: ['PROTECT'], genPriority: 2, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'master', description: 'يحمي لاعباً واحداً من الاغتيال (لا يكرر نفس الهدف)', cardOverrides: { icon: { type: 'lucide', value: 'HeartPulse' } } },
    { id: 'SNIPER', nameAr: 'القناص', nameEn: 'Sniper', team: 'CITIZEN' as const, abilities: ['SNIPE'], genPriority: 3, genMaxCount: 1, genMinPlayers: 7, genIsRequired: false, cardTemplateId: 'master', description: 'يقنص لاعباً — إذا أصاب مافيا يقتله وإلا يموت معه', cardOverrides: { icon: { type: 'lucide', value: 'Crosshair' } } },
    { id: 'POLICEWOMAN', nameAr: 'الشرطية', nameEn: 'Policewoman', team: 'CITIZEN' as const, abilities: [], genPriority: 4, genMaxCount: 1, genMinPlayers: 8, genIsRequired: false, cardTemplateId: 'master', description: 'عند إقصائها تكشف هوية قاتلها لاحقاً', cardOverrides: { icon: { type: 'lucide', value: 'BadgeAlert' } } },
    { id: 'NURSE', nameAr: 'الممرضة', nameEn: 'Nurse', team: 'CITIZEN' as const, abilities: ['PROTECT'], genPriority: 5, genMaxCount: 1, genMinPlayers: 9, genIsRequired: false, cardTemplateId: 'master', description: 'تُفعّل بعد موت الطبيب — نفس قدرة الحماية', cardOverrides: { icon: { type: 'lucide', value: 'Syringe' } } },
    { id: 'MAYOR', nameAr: 'العمدة', nameEn: 'Mayor', team: 'CITIZEN' as const, abilities: [], genPriority: 6, genMaxCount: 1, genMinPlayers: 9, genIsRequired: false, cardTemplateId: 'mayor_card', description: 'مرّة واحدة بعد فرز التصويت: يكشف نفسه ويلغي الإعدام — تصويت جديد على الجميع أو تأجيل بلا موت. بعد الكشف صوته ×2', cardOverrides: { icon: { type: 'EMOJI', value: '🎩' } } },
    { id: 'PHOENIX', nameAr: 'العنقاء', nameEn: 'Phoenix', team: 'CITIZEN' as const, abilities: [], genPriority: 7, genMaxCount: 1, genMinPlayers: 10, genIsRequired: false, cardTemplateId: 'phoenix_card', description: 'لا يستيقظ ولا يختار. مَن حاول قتله ليلاً احترق معه، ونهض العنقاء من رماده. وإن أعدمته المدينة أخذ معه أحد مَن صوّتوا عليه', cardOverrides: { icon: { type: 'EMOJI', value: '🔥' } } },
    { id: 'CITIZEN', nameAr: 'مواطن صالح', nameEn: 'Citizen', team: 'CITIZEN' as const, abilities: [], genPriority: 99, genMaxCount: 10, genMinPlayers: 6, genIsRequired: false, cardTemplateId: 'master', description: 'مواطن عادي — يشارك بالنقاش والتصويت فقط', cardOverrides: { icon: { type: 'lucide', value: 'User' } } },
  ];

  for (const role of roles) {
    await db.insert(schema.roleDefinitions).values(role as any).onConflictDoNothing();
  }
  console.log(`✅ تم بذر ${roles.length} دور (كلها تشير للقالب الرئيسي master)`);

  // ══════════════════════════════════════════════
  // 4. قواعد التفاعل
  // ══════════════════════════════════════════════

  const interactions = [
    { abilityA: 'KILL', abilityB: 'PROTECT', condition: 'SAME_TARGET' as const, resolution: 'B_CANCELS_A' as const, resultEvent: 'ASSASSINATION_BLOCKED', priority: 1 },
  ];

  for (const rule of interactions) {
    await db.insert(schema.interactionRules).values(rule);
  }
  console.log(`✅ تم بذر ${interactions.length} قاعدة تفاعل`);

  // ══════════════════════════════════════════════
  console.log('\n🎉 اكتمل البذر بنجاح!');
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ خطأ في البذر:', err);
  process.exit(1);
});
