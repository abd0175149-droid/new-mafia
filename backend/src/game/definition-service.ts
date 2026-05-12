// ══════════════════════════════════════════════════════
// 📚 خدمة قراءة التعريفات — Definition Service
// يقرأ القدرات والأدوار والبطاقات من DB مع Cache
// ══════════════════════════════════════════════════════

import { getDB } from '../config/db.js';
import {
  abilityDefinitions,
  roleDefinitions,
  cardTemplates,
  interactionRules,
} from '../schemas/game-config.schema.js';

// ── أنواع البيانات ──────────────────────────────────

export interface AbilityDef {
  id: string;
  nameAr: string;
  nameEn: string;
  phase: 'NIGHT' | 'DAY' | 'BOTH';
  priority: number;
  targetType: 'ENEMY' | 'ALLY' | 'ANY' | 'SELF' | 'NONE';
  excludeSelf: boolean;
  excludeLastTarget: boolean;
  maxTargets: number;
  effectType: 'ELIMINATE' | 'BLOCK_ELIMINATE' | 'REVEAL_TEAM' | 'SILENCE' | 'CONDITIONAL_ELIMINATE' | 'PASSIVE';
  effectOnSuccess: string | null;
  effectOnFail: string | null;
  canSkip: boolean;
  isInheritable: boolean;
  inheritanceOrder: string[] | null;
  deceptionRule: string | null;
  soundEvent: string | null;
  animationType: string | null;
}

export interface CardTemplateDef {
  id: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  glowEffect: string | null;
  teamBadge: { text: string; bgColor: string; textColor: string; borderColor: string };
  icon: { type: 'LUCIDE' | 'CUSTOM_IMAGE' | 'EMOJI'; value: string };
  secretFace: { type: 'GENERATED' | 'CUSTOM_IMAGE'; customImageUrl?: string; overlayGradient?: string } | null;
  elements: {
    showPlayerNumber: boolean;
    showClubBranding: boolean;
    showDescription: boolean;
    customFooterText?: string;
    fontFamily?: string;
    nameSize?: number;
    badgeSize?: number;
    iconSize?: number;
    positions?: {
      badge?: { x: number; y: number; s?: number };
      icon?: { x: number; y: number; s?: number };
      title?: { x: number; y: number; s?: number };
      number?: { x: number; y: number; s?: number };
      footer?: { x: number; y: number; s?: number };
      playerName?: { x: number; y: number; s?: number };
      coverNumber?: { x: number; y: number; s?: number };
      coverName?: { x: number; y: number; s?: number };
      coverBranding?: { x: number; y: number; s?: number };
      coverFooter?: { x: number; y: number; s?: number };
      coverPhoto?: { x: number; y: number; s?: number; w?: number; h?: number };
    };
    shapes?: {
      id: string;
      face: 'role' | 'cover';
      type: 'rect' | 'circle';
      x: number; y: number; w: number; h: number;
      bg: string; opacity: number; zIndex: number;
      radius: number;
    }[];
  } | null;
}

export interface RoleDef {
  id: string;
  nameAr: string;
  nameEn: string;
  team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  abilities: string[];
  genPriority: number;
  genMaxCount: number;
  genMinPlayers: number;
  genIsRequired: boolean;
  winConditionType: string | null;
  winConditionDescription: string | null;
  winConditionRevealTarget: boolean;
  cardTemplateId: string | null;
  cardOverrides: Partial<CardTemplateDef> | null;
  description: string | null;
}

export interface InteractionRuleDef {
  id: number;
  abilityA: string;
  abilityB: string;
  condition: 'SAME_TARGET' | 'ALWAYS' | 'SPECIFIC_TARGET';
  resolution: 'B_CANCELS_A' | 'A_CANCELS_B' | 'BOTH_CANCEL';
  resultEvent: string;
  priority: number;
}

// ── Cache ────────────────────────────────────────────

let _abilities: AbilityDef[] | null = null;
let _roles: RoleDef[] | null = null;
let _cards: CardTemplateDef[] | null = null;
let _interactions: InteractionRuleDef[] | null = null;
let _lastLoad = 0;
const CACHE_TTL = 60_000; // 1 دقيقة

function isCacheValid(): boolean {
  return Date.now() - _lastLoad < CACHE_TTL;
}

export function invalidateCache(): void {
  _abilities = null;
  _roles = null;
  _cards = null;
  _interactions = null;
  _lastLoad = 0;
  console.log('🔄 Definition cache invalidated');
}

// ── قراءة البيانات ───────────────────────────────────

export async function getAbilityDefs(): Promise<AbilityDef[]> {
  if (_abilities && isCacheValid()) return _abilities;
  const db = getDB();
  if (!db) return [];
  const rows = await db.select().from(abilityDefinitions).orderBy(abilityDefinitions.priority);
  _abilities = rows as unknown as AbilityDef[];
  _lastLoad = Date.now();
  return _abilities;
}

export async function getRoleDefs(): Promise<RoleDef[]> {
  if (_roles && isCacheValid()) return _roles;
  const db = getDB();
  if (!db) return [];
  const rows = await db.select().from(roleDefinitions).orderBy(roleDefinitions.genPriority);
  _roles = rows as unknown as RoleDef[];
  _lastLoad = Date.now();
  return _roles;
}

export async function getCardTemplateDefs(): Promise<CardTemplateDef[]> {
  if (_cards && isCacheValid()) return _cards;
  const db = getDB();
  if (!db) return [];
  const rows = await db.select().from(cardTemplates);
  _cards = rows as unknown as CardTemplateDef[];
  _lastLoad = Date.now();
  return _cards;
}

export async function getInteractionRuleDefs(): Promise<InteractionRuleDef[]> {
  if (_interactions && isCacheValid()) return _interactions;
  const db = getDB();
  if (!db) return [];
  const rows = await db.select().from(interactionRules).orderBy(interactionRules.priority);
  _interactions = rows as unknown as InteractionRuleDef[];
  _lastLoad = Date.now();
  return _interactions;
}

// ── استعلامات مساعدة ─────────────────────────────────

export async function getRoleById(id: string): Promise<RoleDef | undefined> {
  const roles = await getRoleDefs();
  return roles.find(r => r.id === id);
}

export async function getAbilitiesForRole(roleId: string): Promise<AbilityDef[]> {
  const role = await getRoleById(roleId);
  if (!role) return [];
  const allAbilities = await getAbilityDefs();
  return allAbilities.filter(a => role.abilities.includes(a.id));
}

export async function getCardForRole(roleId: string): Promise<CardTemplateDef | null> {
  const role = await getRoleById(roleId);
  if (!role?.cardTemplateId) return null;
  const cards = await getCardTemplateDefs();
  const base = cards.find(c => c.id === role.cardTemplateId);
  if (!base) return null;
  // تطبيق التجاوزات إن وُجدت
  if (role.cardOverrides) {
    return { ...base, ...role.cardOverrides } as CardTemplateDef;
  }
  return base;
}

export async function getAbilityById(id: string): Promise<AbilityDef | undefined> {
  const abilities = await getAbilityDefs();
  return abilities.find(a => a.id === id);
}
