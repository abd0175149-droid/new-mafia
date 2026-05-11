// ══════════════════════════════════════════════════════
// 🌱 بذر البيانات الأولية — Game Config Seed
// يحوّل الأدوار والقدرات الحالية (Hardcoded) إلى صفوف DB
// التشغيل: npx tsx src/scripts/seed-game-config.ts
// ══════════════════════════════════════════════════════

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../schemas/game-config.schema.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mafia_user:mafia_pass@localhost:5435/mafia_db_staging';

async function seed() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('🌱 بدء بذر بيانات نظام Data-Driven...\n');

  // ══════════════════════════════════════════════
  // 1. القدرات (Ability Definitions)
  // ══════════════════════════════════════════════

  const abilities = [
    {
      id: 'KILL',
      nameAr: 'اغتيال',
      nameEn: 'Kill',
      phase: 'NIGHT' as const,
      priority: 1,
      targetType: 'ENEMY' as const,
      excludeSelf: true,
      excludeLastTarget: false,
      maxTargets: 1,
      effectType: 'ELIMINATE' as const,
      effectOnSuccess: 'ASSASSINATION',
      effectOnFail: null,
      canSkip: false,
      isInheritable: true,
      inheritanceOrder: ['GODFATHER', 'CHAMELEON', 'SILENCER', 'MAFIA_REGULAR'],
      deceptionRule: null,
      soundEvent: 'night_assassination',
      animationType: 'ASSASSINATION_ATTEMPT',
    },
    {
      id: 'SILENCE',
      nameAr: 'إسكات',
      nameEn: 'Silence',
      phase: 'NIGHT' as const,
      priority: 2,
      targetType: 'ANY' as const,
      excludeSelf: false,
      excludeLastTarget: false,
      maxTargets: 1,
      effectType: 'SILENCE' as const,
      effectOnSuccess: 'SILENCED',
      effectOnFail: null,
      canSkip: true,
      isInheritable: false,
      inheritanceOrder: null,
      deceptionRule: null,
      soundEvent: null,
      animationType: 'SILENCE',
    },
    {
      id: 'INVESTIGATE',
      nameAr: 'تحقيق',
      nameEn: 'Investigate',
      phase: 'NIGHT' as const,
      priority: 3,
      targetType: 'ANY' as const,
      excludeSelf: true,
      excludeLastTarget: false,
      maxTargets: 1,
      effectType: 'REVEAL_TEAM' as const,
      effectOnSuccess: 'SHERIFF_RESULT',
      effectOnFail: null,
      canSkip: false,
      isInheritable: false,
      inheritanceOrder: null,
      deceptionRule: null,
      soundEvent: null,
      animationType: 'INVESTIGATION',
    },
    {
      id: 'PROTECT',
      nameAr: 'حماية',
      nameEn: 'Protect',
      phase: 'NIGHT' as const,
      priority: 4,
      targetType: 'ANY' as const,
      excludeSelf: true,
      excludeLastTarget: true,
      maxTargets: 1,
      effectType: 'BLOCK_ELIMINATE' as const,
      effectOnSuccess: 'ASSASSINATION_BLOCKED',
      effectOnFail: 'PROTECTION_FAILED',
      canSkip: false,
      isInheritable: false,
      inheritanceOrder: null,
      deceptionRule: null,
      soundEvent: null,
      animationType: 'PROTECTION',
    },
    {
      id: 'SNIPE',
      nameAr: 'قنص',
      nameEn: 'Snipe',
      phase: 'NIGHT' as const,
      priority: 5,
      targetType: 'ANY' as const,
      excludeSelf: true,
      excludeLastTarget: false,
      maxTargets: 1,
      effectType: 'CONDITIONAL_ELIMINATE' as const,
      effectOnSuccess: 'SNIPE_MAFIA',
      effectOnFail: 'SNIPE_CITIZEN',
      canSkip: true,
      isInheritable: false,
      inheritanceOrder: null,
      deceptionRule: null,
      soundEvent: null,
      animationType: 'SNIPE',
    },
  ];

  for (const ability of abilities) {
    await db.insert(schema.abilityDefinitions).values(ability).onConflictDoNothing();
  }
  console.log(`✅ تم بذر ${abilities.length} قدرة`);

  // ══════════════════════════════════════════════
  // 2. قوالب البطاقات (Card Templates)
  // ══════════════════════════════════════════════

  const cards = [
    {
      id: 'godfather_card',
      gradient: 'from-amber-800 via-amber-900 to-yellow-950',
      borderColor: 'border-amber-400/60',
      textColor: 'text-amber-300',
      glowEffect: 'shadow-[0_0_40px_rgba(251,191,36,0.25)]',
      teamBadge: { text: 'فريق المافيا 🔴', bgColor: 'bg-red-900/60', textColor: 'text-red-300', borderColor: 'border-red-500/30' },
      icon: { type: 'LUCIDE', value: 'Crown' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'silencer_card',
      gradient: 'from-rose-800 via-rose-900 to-rose-950',
      borderColor: 'border-rose-500/60',
      textColor: 'text-rose-300',
      glowEffect: 'shadow-[0_0_30px_rgba(251,113,133,0.2)]',
      teamBadge: { text: 'فريق المافيا 🔴', bgColor: 'bg-red-900/60', textColor: 'text-red-300', borderColor: 'border-red-500/30' },
      icon: { type: 'LUCIDE', value: 'Scissors' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'chameleon_card',
      gradient: 'from-fuchsia-800 via-fuchsia-900 to-fuchsia-950',
      borderColor: 'border-fuchsia-500/60',
      textColor: 'text-fuchsia-300',
      glowEffect: 'shadow-[0_0_30px_rgba(232,121,249,0.2)]',
      teamBadge: { text: 'فريق المافيا 🔴', bgColor: 'bg-red-900/60', textColor: 'text-red-300', borderColor: 'border-red-500/30' },
      icon: { type: 'LUCIDE', value: 'Drama' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'mafia_regular_card',
      gradient: 'from-red-800 via-red-900 to-red-950',
      borderColor: 'border-red-500/60',
      textColor: 'text-red-300',
      glowEffect: 'shadow-[0_0_30px_rgba(248,113,113,0.25)]',
      teamBadge: { text: 'فريق المافيا 🔴', bgColor: 'bg-red-900/60', textColor: 'text-red-300', borderColor: 'border-red-500/30' },
      icon: { type: 'LUCIDE', value: 'Skull' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'sheriff_card',
      gradient: 'from-blue-800 via-blue-900 to-blue-950',
      borderColor: 'border-blue-500/60',
      textColor: 'text-blue-300',
      glowEffect: 'shadow-[0_0_30px_rgba(96,165,250,0.2)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'Shield' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'doctor_card',
      gradient: 'from-emerald-800 via-emerald-900 to-green-950',
      borderColor: 'border-emerald-500/60',
      textColor: 'text-emerald-300',
      glowEffect: 'shadow-[0_0_30px_rgba(52,211,153,0.2)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'HeartPulse' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'sniper_card',
      gradient: 'from-cyan-800 via-cyan-900 to-cyan-950',
      borderColor: 'border-cyan-500/60',
      textColor: 'text-cyan-300',
      glowEffect: 'shadow-[0_0_30px_rgba(103,232,249,0.2)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'Crosshair' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'policewoman_card',
      gradient: 'from-indigo-800 via-indigo-900 to-indigo-950',
      borderColor: 'border-indigo-500/60',
      textColor: 'text-indigo-300',
      glowEffect: 'shadow-[0_0_30px_rgba(129,140,248,0.2)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'BadgeAlert' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'nurse_card',
      gradient: 'from-teal-800 via-teal-900 to-teal-950',
      borderColor: 'border-teal-500/60',
      textColor: 'text-teal-300',
      glowEffect: 'shadow-[0_0_30px_rgba(94,234,212,0.2)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'Syringe' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
    {
      id: 'citizen_card',
      gradient: 'from-zinc-700 via-zinc-800 to-zinc-900',
      borderColor: 'border-zinc-500/60',
      textColor: 'text-zinc-300',
      glowEffect: 'shadow-[0_0_30px_rgba(161,161,170,0.15)]',
      teamBadge: { text: 'فريق المدينة 🔵', bgColor: 'bg-blue-900/60', textColor: 'text-blue-300', borderColor: 'border-blue-500/30' },
      icon: { type: 'LUCIDE', value: 'User' },
      secretFace: { type: 'GENERATED' },
      elements: { showPlayerNumber: true, showClubBranding: true, showDescription: false },
    },
  ];

  for (const card of cards) {
    await db.insert(schema.cardTemplates).values(card).onConflictDoNothing();
  }
  console.log(`✅ تم بذر ${cards.length} قالب بطاقة`);

  // ══════════════════════════════════════════════
  // 3. الأدوار (Role Definitions)
  // ══════════════════════════════════════════════

  const roles = [
    // ── المافيا ──
    { id: 'GODFATHER', nameAr: 'شيخ المافيا', nameEn: 'Godfather', team: 'MAFIA' as const, abilities: ['KILL'], genPriority: 1, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'godfather_card', description: 'زعيم المافيا — ينفذ عملية الاغتيال كل ليلة' },
    { id: 'SILENCER', nameAr: 'قص المافيا', nameEn: 'Silencer', team: 'MAFIA' as const, abilities: ['SILENCE'], genPriority: 2, genMaxCount: 1, genMinPlayers: 7, genIsRequired: false, cardTemplateId: 'silencer_card', description: 'يُسكت لاعباً واحداً فلا يستطيع التحدث في النهار' },
    { id: 'CHAMELEON', nameAr: 'حرباية المافيا', nameEn: 'Chameleon', team: 'MAFIA' as const, abilities: [], genPriority: 3, genMaxCount: 1, genMinPlayers: 8, genIsRequired: false, cardTemplateId: 'chameleon_card', description: 'يظهر كمواطن عند تحقيق الشريف — ويرث الاغتيال', winConditionType: null, deceptionRule: 'APPEARS_CITIZEN' },
    { id: 'MAFIA_REGULAR', nameAr: 'مافيا عادي', nameEn: 'Mafia Regular', team: 'MAFIA' as const, abilities: [], genPriority: 99, genMaxCount: 10, genMinPlayers: 6, genIsRequired: false, cardTemplateId: 'mafia_regular_card', description: 'عضو مافيا عادي — يشارك في النقاش والتصويت' },

    // ── المواطنون ──
    { id: 'SHERIFF', nameAr: 'الشريف', nameEn: 'Sheriff', team: 'CITIZEN' as const, abilities: ['INVESTIGATE'], genPriority: 1, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'sheriff_card', description: 'يحقق في هوية لاعب واحد كل ليلة' },
    { id: 'DOCTOR', nameAr: 'الطبيب', nameEn: 'Doctor', team: 'CITIZEN' as const, abilities: ['PROTECT'], genPriority: 2, genMaxCount: 1, genMinPlayers: 6, genIsRequired: true, cardTemplateId: 'doctor_card', description: 'يحمي لاعباً واحداً من الاغتيال (لا يكرر نفس الهدف)' },
    { id: 'SNIPER', nameAr: 'القناص', nameEn: 'Sniper', team: 'CITIZEN' as const, abilities: ['SNIPE'], genPriority: 3, genMaxCount: 1, genMinPlayers: 7, genIsRequired: false, cardTemplateId: 'sniper_card', description: 'يقنص لاعباً — إذا أصاب مافيا يقتله وإلا يموت معه' },
    { id: 'POLICEWOMAN', nameAr: 'الشرطية', nameEn: 'Policewoman', team: 'CITIZEN' as const, abilities: [], genPriority: 4, genMaxCount: 1, genMinPlayers: 8, genIsRequired: false, cardTemplateId: 'policewoman_card', description: 'عند إقصائها تكشف هوية قاتلها لاحقاً' },
    { id: 'NURSE', nameAr: 'الممرضة', nameEn: 'Nurse', team: 'CITIZEN' as const, abilities: ['PROTECT'], genPriority: 5, genMaxCount: 1, genMinPlayers: 9, genIsRequired: false, cardTemplateId: 'nurse_card', description: 'تُفعّل بعد موت الطبيب — نفس قدرة الحماية' },
    { id: 'CITIZEN', nameAr: 'مواطن صالح', nameEn: 'Citizen', team: 'CITIZEN' as const, abilities: [], genPriority: 99, genMaxCount: 10, genMinPlayers: 6, genIsRequired: false, cardTemplateId: 'citizen_card', description: 'مواطن عادي — يشارك بالنقاش والتصويت فقط' },
  ];

  for (const role of roles) {
    const { deceptionRule, ...rest } = role as any;
    await db.insert(schema.roleDefinitions).values(rest).onConflictDoNothing();
  }
  console.log(`✅ تم بذر ${roles.length} دور`);

  // ══════════════════════════════════════════════
  // 4. قواعد التفاعل (Interaction Rules)
  // ══════════════════════════════════════════════

  const interactions = [
    {
      abilityA: 'KILL',
      abilityB: 'PROTECT',
      condition: 'SAME_TARGET' as const,
      resolution: 'B_CANCELS_A' as const,
      resultEvent: 'ASSASSINATION_BLOCKED',
      priority: 1,
    },
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
