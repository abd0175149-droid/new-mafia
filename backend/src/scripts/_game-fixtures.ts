// ══════════════════════════════════════════════════════
// 🧪 fixtures مشتركة للاختبارات — تعريفات الإنتاج (أدوار/قدرات/تفاعلات)
// تُحقن في كاش definition-service عبر __primeDefsForTest فيعمل المحرك الديناميكي بلا DB.
// ══════════════════════════════════════════════════════
import { __primeDefsForTest } from '../game/definition-service.js';

const ABILITIES_RAW = [
  { id: 'KILL', phase: 'NIGHT', priority: 1, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSINATION', effect_on_fail: null, is_inheritable: true, inheritance_order: ['GODFATHER', 'CHAMELEON', 'SILENCER', 'MAFIA_REGULAR'] },
  { id: 'SILENCE', phase: 'NIGHT', priority: 2, target_type: 'ANY', exclude_self: false, exclude_last_target: false, max_targets: 1, effect_type: 'SILENCE', effect_on_success: 'SILENCED', effect_on_fail: null },
  { id: 'INVESTIGATE', phase: 'NIGHT', priority: 3, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'REVEAL_TEAM', effect_on_success: 'SHERIFF_RESULT', effect_on_fail: null },
  { id: 'PROTECT', phase: 'NIGHT', priority: 4, target_type: 'ANY', exclude_self: true, exclude_last_target: true, max_targets: 1, effect_type: 'BLOCK_ELIMINATE', effect_on_success: 'ASSASSINATION_BLOCKED', effect_on_fail: 'PROTECTION_FAILED' },
  { id: 'SNIPE', phase: 'NIGHT', priority: 5, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'CONDITIONAL_ELIMINATE', effect_on_success: 'SNIPE_MAFIA', effect_on_fail: 'SNIPE_CITIZEN' },
  { id: 'ASSASSINATE', phase: 'NIGHT', priority: 6, target_type: 'ANY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'ELIMINATE', effect_on_success: 'ASSASSIN_KILL', effect_on_fail: null },
  { id: 'DISABLE_ABILITY', phase: 'NIGHT', priority: 2, target_type: 'ENEMY', exclude_self: true, exclude_last_target: false, max_targets: 1, effect_type: 'DISABLE', effect_on_success: null, effect_on_fail: null },
];
const ROLES_RAW = [
  { id: 'GODFATHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 1, name_ar: 'شيخ المافيا' },
  { id: 'SILENCER', team: 'MAFIA', abilities: ['SILENCE'], gen_priority: 2, name_ar: 'قص المافيا' },
  { id: 'CHAMELEON', team: 'MAFIA', abilities: [], gen_priority: 3, name_ar: 'حرباية المافيا' },
  { id: 'WITCH', team: 'MAFIA', abilities: ['DISABLE_ABILITY'], gen_priority: 3, name_ar: 'الساحرة' },
  { id: 'OLDER_BROTHER', team: 'MAFIA', abilities: ['KILL'], gen_priority: 15, name_ar: 'الأخ الأكبر' },
  { id: 'MAFIA_REGULAR', team: 'MAFIA', abilities: [], gen_priority: 99, name_ar: 'مافيا عادي' },
  { id: 'SHERIFF', team: 'CITIZEN', abilities: ['INVESTIGATE'], gen_priority: 1, name_ar: 'الشريف' },
  { id: 'DOCTOR', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 2, name_ar: 'الطبيب' },
  { id: 'SNIPER', team: 'CITIZEN', abilities: ['SNIPE'], gen_priority: 3, name_ar: 'القناص' },
  { id: 'POLICEWOMAN', team: 'CITIZEN', abilities: [], gen_priority: 4, name_ar: 'الشرطية' },
  { id: 'NURSE', team: 'CITIZEN', abilities: ['PROTECT'], gen_priority: 5, name_ar: 'الممرضة' },
  { id: 'CITIZEN', team: 'CITIZEN', abilities: [], gen_priority: 99, name_ar: 'مواطن صالح' },
  { id: 'YOUNGER_BROTHER', team: 'CITIZEN', abilities: [], gen_priority: 15, name_ar: 'الأخ الأصغر' },
  { id: 'JESTER', team: 'NEUTRAL', abilities: [], gen_priority: 10, win_condition_type: 'VOTED_OUT', win_condition_description: 'يفوز إذا أُقصي بالتصويت', name_ar: 'المهرج' },
  { id: 'ASSASSIN', team: 'NEUTRAL', abilities: ['ASSASSINATE'], gen_priority: 20, win_condition_type: 'COMPLETE_CONTRACTS', win_condition_description: 'يفوز بإكمال العقود', name_ar: 'السفّاح' },
];
const INTERACTIONS_RAW = [
  { id: 5, ability_a: 'KILL', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSINATION_BLOCKED', priority: 1 },
  { id: 6, ability_a: 'ASSASSINATE', ability_b: 'PROTECT', condition: 'SAME_TARGET', resolution: 'B_CANCELS_A', result_event: 'ASSASSIN_BLOCKED', priority: 2 },
];

const camelKey = (k: string) => k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
const camelize = (o: any) => { const r: any = {}; for (const k of Object.keys(o)) r[camelKey(k)] = o[k]; return r; };

export function primeTestDefs(): void {
  __primeDefsForTest({
    abilities: ABILITIES_RAW.map(camelize) as any,
    roles: ROLES_RAW.map(camelize) as any,
    interactions: INTERACTIONS_RAW.map(camelize) as any,
  });
}
