// ══════════════════════════════════════════════════════
// 🧩 مخططات نظام Data-Driven — Game Config Schema
// يشمل: ability_definitions, card_templates,
//        role_definitions, interaction_rules
// ══════════════════════════════════════════════════════

import {
  pgTable, pgEnum, serial, text, timestamp, integer,
  boolean, varchar, jsonb,
} from 'drizzle-orm/pg-core';

// ── Enums ─────────────────────────────────────────────

export const abilityPhaseEnum = pgEnum('ability_phase', ['NIGHT', 'DAY', 'BOTH']);

export const targetTypeEnum = pgEnum('target_type', ['ENEMY', 'ALLY', 'ANY', 'SELF', 'NONE']);

export const effectTypeEnum = pgEnum('effect_type', [
  'ELIMINATE', 'BLOCK_ELIMINATE', 'REVEAL_TEAM',
  'SILENCE', 'CONDITIONAL_ELIMINATE', 'PASSIVE',
]);

export const teamTypeEnum = pgEnum('team_type', ['MAFIA', 'CITIZEN', 'NEUTRAL']);

export const interactionConditionEnum = pgEnum('interaction_condition', [
  'SAME_TARGET', 'ALWAYS', 'SPECIFIC_TARGET',
]);

export const interactionResolutionEnum = pgEnum('interaction_resolution', [
  'B_CANCELS_A', 'A_CANCELS_B', 'BOTH_CANCEL',
]);

// ── Ability Definitions (تعريفات القدرات) ─────────────

export const abilityDefinitions = pgTable('ability_definitions', {
  id: varchar('id', { length: 50 }).primaryKey(),           // "KILL", "PROTECT", "INVESTIGATE"
  nameAr: varchar('name_ar', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),

  // متى تعمل
  phase: abilityPhaseEnum('phase').notNull(),
  priority: integer('priority').notNull(),                   // ترتيب التنفيذ (1 = أول)

  // على من تعمل
  targetType: targetTypeEnum('target_type').notNull(),
  excludeSelf: boolean('exclude_self').default(true),
  excludeLastTarget: boolean('exclude_last_target').default(false),
  maxTargets: integer('max_targets').default(1),

  // ماذا تفعل
  effectType: effectTypeEnum('effect_type').notNull(),
  effectOnSuccess: varchar('effect_on_success', { length: 100 }),  // event key
  effectOnFail: varchar('effect_on_fail', { length: 100 }),

  // قواعد خاصة
  canSkip: boolean('can_skip').default(false),
  isInheritable: boolean('is_inheritable').default(false),
  inheritanceOrder: jsonb('inheritance_order'),               // string[] — ترتيب الوراثة
  deceptionRule: varchar('deception_rule', { length: 200 }),  // خداع الحرباية

  // الصوت والأنيميشن
  soundEvent: varchar('sound_event', { length: 100 }),
  animationType: varchar('animation_type', { length: 100 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Card Templates (قوالب تصميم البطاقات) ─────────────

export const cardTemplates = pgTable('card_templates', {
  id: varchar('id', { length: 50 }).primaryKey(),            // "mafia_dark", "citizen_blue"

  // الألوان
  gradient: varchar('gradient', { length: 200 }).notNull(),  // "from-amber-800 via-amber-900 to-yellow-950"
  borderColor: varchar('border_color', { length: 100 }).notNull(),
  textColor: varchar('text_color', { length: 100 }).notNull(),
  glowEffect: varchar('glow_effect', { length: 200 }),

  // شارة الفريق
  teamBadge: jsonb('team_badge').notNull(),                  // {text, bgColor, textColor, borderColor}

  // أيقونة الدور
  icon: jsonb('icon').notNull(),                             // {type: 'LUCIDE'|'CUSTOM_IMAGE'|'EMOJI', value: string}

  // الوجه السري
  secretFace: jsonb('secret_face'),                          // {type: 'GENERATED'|'CUSTOM_IMAGE', customImageUrl?, overlayGradient?}

  // العناصر الإضافية
  elements: jsonb('elements'),                               // {showPlayerNumber, showClubBranding, showDescription, customFooterText?}

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Role Definitions (تعريفات الأدوار) ────────────────

export const roleDefinitions = pgTable('role_definitions', {
  id: varchar('id', { length: 50 }).primaryKey(),            // "GODFATHER", "DOCTOR"
  nameAr: varchar('name_ar', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  team: teamTypeEnum('team').notNull(),

  // القدرات المركبة — مراجع لـ ability_definitions.id
  abilities: jsonb('abilities').notNull(),                    // string[]

  // التوليد
  genPriority: integer('gen_priority').notNull(),             // 1 = يُضاف أولاً
  genMaxCount: integer('gen_max_count').default(1),
  genMinPlayers: integer('gen_min_players').default(6),
  genIsRequired: boolean('gen_is_required').default(false),

  // شروط الفوز (للمحايدين)
  winConditionType: varchar('win_condition_type', { length: 50 }),
  winConditionDescription: varchar('win_condition_description', { length: 255 }),
  winConditionRevealTarget: boolean('win_condition_reveal_target').default(false),

  // تصميم البطاقة
  cardTemplateId: varchar('card_template_id', { length: 50 }),
  cardOverrides: jsonb('card_overrides'),                     // Partial<CardTemplate>

  // الوصف
  description: text('description'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Interaction Rules (قواعد التفاعل) ─────────────────

export const interactionRules = pgTable('interaction_rules', {
  id: serial('id').primaryKey(),
  abilityA: varchar('ability_a', { length: 50 }).notNull(),  // FK → ability_definitions.id
  abilityB: varchar('ability_b', { length: 50 }).notNull(),  // FK → ability_definitions.id
  condition: interactionConditionEnum('condition').notNull(),
  resolution: interactionResolutionEnum('resolution').notNull(),
  resultEvent: varchar('result_event', { length: 100 }).notNull(),
  priority: integer('priority').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
