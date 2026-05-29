// ══════════════════════════════════════════════════════
// 📋 سجل القيود — Constraint Registry
// تسجيل وإدارة القيود المودولية
// ══════════════════════════════════════════════════════

import type { SeatingConstraint, ConstraintConfig } from './types.js';
import { NewPlayerConstraint } from './constraints/new-player.constraint.js';
import { PenaltyNeighborConstraint } from './constraints/penalty-neighbor.constraint.js';
import { HighRankSeparationConstraint } from './constraints/high-rank-separation.constraint.js';
import { GenderSeparationConstraint } from './constraints/gender-separation.constraint.js';
import { NoAdjacentPairsConstraint } from './constraints/no-adjacent-pairs.constraint.js';

// ── نوع مصنع القيد ──────────────────────────────
type ConstraintFactory = (config: { enabled?: boolean; priority?: number; params?: Record<string, any> }) => SeatingConstraint;

// ── المصانع المسجلة ──────────────────────────────
const FACTORIES: Record<string, ConstraintFactory> = {
  NEW_PLAYER_SEPARATION: (c) => new NewPlayerConstraint(c),
  PENALTY_NEIGHBOR_AVOIDANCE: (c) => new PenaltyNeighborConstraint(c),
  HIGH_RANK_SEPARATION: (c) => new HighRankSeparationConstraint(c),
  GENDER_SEPARATION: (c) => new GenderSeparationConstraint(c),
  NO_ADJACENT_PAIRS: (c) => new NoAdjacentPairsConstraint(c),
};

// ── وصف القيود المتاحة (للعرض في الواجهة) ──────
export const CONSTRAINT_TYPES = [
  {
    type: 'NO_ADJACENT_PAIRS',
    nameAr: 'أزواج ممنوعة',
    icon: '🚫',
    description: 'تحديد لاعبين لا يجلسون بجانب بعض يدوياً',
    defaultPriority: 1,
    defaultEnabled: true,
    paramsSchema: { pairs: 'array' },
  },
  {
    type: 'PENALTY_NEIGHBOR_AVOIDANCE',
    nameAr: 'تجنب جيران المعاقب',
    icon: '⚠️',
    description: 'اللاعب المعاقب لا يجلس بجانب نفس الجيران مرة أخرى',
    defaultPriority: 2,
    defaultEnabled: true,
    paramsSchema: {},
  },
  {
    type: 'NEW_PLAYER_SEPARATION',
    nameAr: 'فصل اللاعبين الجدد',
    icon: '👶',
    description: 'لاعب جديد لا يجلس بين لاعبَين جديدَين',
    defaultPriority: 3,
    defaultEnabled: true,
    paramsSchema: { threshold: 'number' },
  },
  {
    type: 'HIGH_RANK_SEPARATION',
    nameAr: 'فصل الرتب العالية',
    icon: '⚔️',
    description: 'لاعبان بتصنيف عالي لا يجلسان بجانب بعض',
    defaultPriority: 4,
    defaultEnabled: false,
    paramsSchema: { rankThreshold: 'number' },
  },
  {
    type: 'GENDER_SEPARATION',
    nameAr: 'فصل الجنسين',
    icon: '🚹',
    description: 'ذكر لا يجلس بجانب أنثى (أضعف قيد)',
    defaultPriority: 8,
    defaultEnabled: false,
    paramsSchema: {},
  },
];

/**
 * إنشاء قيود من مصفوفة إعدادات (من DB أو API)
 */
export function buildConstraints(configs: ConstraintConfig[]): SeatingConstraint[] {
  const constraints: SeatingConstraint[] = [];

  for (const config of configs) {
    const factory = FACTORIES[config.type];
    if (!factory) {
      console.warn(`⚠️ Unknown constraint type: ${config.type}`);
      continue;
    }
    constraints.push(factory({
      enabled: config.enabled,
      priority: config.priority,
      params: config.params,
    }));
  }

  // ترتيب حسب الأولوية (الأعلى أولاً)
  return constraints.sort((a, b) => a.priority - b.priority);
}

/**
 * إنشاء القيود الافتراضية
 */
export function buildDefaultConstraints(): SeatingConstraint[] {
  return buildConstraints(
    CONSTRAINT_TYPES.map(ct => ({
      type: ct.type,
      enabled: ct.defaultEnabled,
      priority: ct.defaultPriority,
      params: {},
    }))
  );
}

/**
 * تحويل القيود القديمة (SeatConstraints) إلى النظام الجديد
 */
export function migrateOldConstraints(old: {
  genderSeparation?: boolean;
  noAdjacentPairs?: any[];
}): ConstraintConfig[] {
  const configs: ConstraintConfig[] = [];

  // فصل الجنسين
  if (old.genderSeparation) {
    configs.push({
      type: 'GENDER_SEPARATION',
      enabled: true,
      priority: 8,
      params: {},
    });
  }

  // أزواج ممنوعة
  if (old.noAdjacentPairs && old.noAdjacentPairs.length > 0) {
    configs.push({
      type: 'NO_ADJACENT_PAIRS',
      enabled: true,
      priority: 1,
      params: { pairs: old.noAdjacentPairs },
    });
  }

  // إضافة القيود الجديدة بالافتراضي
  configs.push({ type: 'PENALTY_NEIGHBOR_AVOIDANCE', enabled: true, priority: 2, params: {} });
  configs.push({ type: 'NEW_PLAYER_SEPARATION', enabled: true, priority: 3, params: { threshold: 3 } });
  configs.push({ type: 'HIGH_RANK_SEPARATION', enabled: false, priority: 4, params: { rankThreshold: 500 } });

  return configs;
}
