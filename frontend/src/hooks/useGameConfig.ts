'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── أنواع البيانات ─────────────────────────────

export interface RoleDef {
  id: string;
  nameAr: string;
  nameEn: string;
  team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  abilities: string[];
  description: string;
  cardTemplateId: string | null;
  cardOverrides: Record<string, any> | null;
}

export interface CardTemplateDef {
  id: string;
  gradient: string;
  borderColor: string;
  textColor: string;
  glowEffect: string;
  teamBadge: { text: string; bgColor: string; textColor: string; borderColor: string } | null;
  icon: { type: 'lucide' | 'emoji' | 'image'; value: string } | null;
  secretFace: { type: 'default' | 'custom'; customImageUrl?: string; overlayGradient?: string } | null;
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

export interface AbilityDef {
  id: string;
  nameAr: string;
  nameEn: string;
  phase: 'NIGHT' | 'DAY' | 'BOTH';
  effectType: string;
}

export interface RankEffectsDef {
  id: string;
  nameAr: string;
  sortOrder: number;
  effects: {
    border: { enabled: boolean; color: string; width: number; inset: number; style: 'solid' | 'gradient' | 'traveling'; gradientColors: string[]; travelSpeed: number };
    glow: { enabled: boolean; color: string; size: number; opacity: number; pulseEnabled: boolean; pulseDuration: number };
    shimmer: { enabled: boolean; color: string; opacity: number; duration: number };
    particles: { enabled: boolean; count: number; color: string; size: number; orbitRadius: string; baseDuration: number };
    corners: { enabled: boolean; color: string; size: number; width: number; pulseEnabled: boolean };
    gradientOverlay: { enabled: boolean; color: string; opacity: number; direction: string };
    floating: { enabled: boolean; content: string; position: 'top' | 'bottom'; size: number; animation: 'float' | 'bounce' | 'spin'; glowColor: string; offsetX?: number; offsetY?: number };
    badge: { enabled: boolean; emoji: string; label: string; bgColor: string; textColor: string; borderColor: string; position: string; offsetX?: number; offsetY?: number };
    nameEffect: { enabled: boolean; color: string; glowColor: string; glowSize: number };
  };
}

// ── Cache عالمي (يُشارك بين كل الـ instances) ──

let _roleCache: RoleDef[] | null = null;
let _cardCache: CardTemplateDef[] | null = null;
let _abilityCache: AbilityDef[] | null = null;
let _rankCache: RankEffectsDef[] | null = null;
let _lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function fetchFromAPI(path: string) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/game-config${path}`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data || data;
}

// ── Hook الرئيسي ─────────────────────────────

export function useGameConfig() {
  const [roles, setRoles] = useState<RoleDef[]>(_roleCache || []);
  const [cards, setCards] = useState<CardTemplateDef[]>(_cardCache || []);
  const [abilities, setAbilities] = useState<AbilityDef[]>(_abilityCache || []);
  const [rankEffects, setRankEffects] = useState<RankEffectsDef[]>(_rankCache || []);
  const [loading, setLoading] = useState(!_roleCache);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && _roleCache && _cardCache && (now - _lastFetch < CACHE_TTL)) {
      setRoles(_roleCache);
      setCards(_cardCache);
      setAbilities(_abilityCache || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [rolesData, cardsData, abilitiesData, rankData] = await Promise.all([
        fetchFromAPI('/roles'),
        fetchFromAPI('/card-templates'),
        fetchFromAPI('/abilities'),
        fetchFromAPI('/rank-effects'),
      ]);

      _roleCache = rolesData || [];
      _cardCache = cardsData || [];
      _abilityCache = abilitiesData || [];
      _rankCache = rankData || [];
      _lastFetch = now;

      setRoles(_roleCache || []);
      setCards(_cardCache || []);
      setAbilities(_abilityCache || []);
      setRankEffects(_rankCache || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.warn('⚠️ Failed to load game config:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Helper: جلب role بـ id ──
  const getRoleById = useCallback((roleId: string | null): RoleDef | null => {
    if (!roleId) return null;
    return roles.find(r => r.id === roleId) || null;
  }, [roles]);

  // ── Helper: جلب اسم الدور بالعربي ──
  const getRoleName = useCallback((roleId: string | null): string => {
    if (!roleId) return 'مجهول';
    const role = roles.find(r => r.id === roleId);
    return role?.nameAr || roleId;
  }, [roles]);

  // ── Helper: جلب card template لدور معين (يرجع master دائماً كـ fallback) ──
  const getCardForRole = useCallback((roleId: string | null): CardTemplateDef | null => {
    // إذا الدور مرتبط بقالب محدد → نستخدمه
    if (roleId) {
      const role = roles.find(r => r.id === roleId);
      if (role?.cardTemplateId) {
        const found = cards.find(c => c.id === role.cardTemplateId);
        if (found) return found;
      }
    }
    // fallback → القالب الرئيسي (master) — حتى لو الدور فارغ
    return cards.find(c => c.id === 'master') || cards[0] || null;
  }, [roles, cards]);

  // ── Helper: هل الدور مافيا ──
  const isDynamicMafia = useCallback((roleId: string | null): boolean => {
    if (!roleId) return false;
    const role = roles.find(r => r.id === roleId);
    return role?.team === 'MAFIA';
  }, [roles]);

  // ── Helper: هل الدور محايد ──
  const isDynamicNeutral = useCallback((roleId: string | null): boolean => {
    if (!roleId) return false;
    const role = roles.find(r => r.id === roleId);
    return role?.team === 'NEUTRAL';
  }, [roles]);

  // ── Helper: بناء map للأسماء (بديل لـ ROLE_NAMES الثابت) ──
  const getRoleNameMap = useCallback((): Record<string, string> => {
    const map: Record<string, string> = {};
    roles.forEach(r => { map[r.id] = r.nameAr; });
    return map;
  }, [roles]);

  // ── Helper: جلب فريق الدور ──
  const getTeamForRole = useCallback((roleId: string | null): string | null => {
    if (!roleId) return null;
    const role = roles.find(r => r.id === roleId);
    return role?.team || null;
  }, [roles]);

  // ── Helper: جلب تأثيرات الرتبة ──
  const getRankEffectsForTier = useCallback((tier: string): RankEffectsDef | null => {
    if (!tier) return null;
    return rankEffects.find(r => r.id === tier) || null;
  }, [rankEffects]);

  return {
    roles,
    cards,
    abilities,
    rankEffects,
    loading,
    error,
    reload: () => loadAll(true),
    getRoleById,
    getRoleName,
    getRoleNameMap,
    getCardForRole,
    getTeamForRole,
    isDynamicMafia,
    isDynamicNeutral,
    getRankEffectsForTier,
  };
}

// ── إعادة تصفير الـ Cache (يُستدعى عند تعديل الإعدادات) ──
export function invalidateGameConfigCache() {
  _roleCache = null;
  _cardCache = null;
  _abilityCache = null;
  _rankCache = null;
  _lastFetch = 0;
}
