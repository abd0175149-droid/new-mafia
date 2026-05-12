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
  elements: { showPlayerNumber: boolean; showClubBranding: boolean; showDescription: boolean; customFooterText?: string } | null;
}

export interface AbilityDef {
  id: string;
  nameAr: string;
  nameEn: string;
  phase: 'NIGHT' | 'DAY' | 'BOTH';
  effectType: string;
}

// ── Cache عالمي (يُشارك بين كل الـ instances) ──

let _roleCache: RoleDef[] | null = null;
let _cardCache: CardTemplateDef[] | null = null;
let _abilityCache: AbilityDef[] | null = null;
let _lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

async function fetchFromAPI(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/game-config${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data || data;
}

// ── Hook الرئيسي ─────────────────────────────

export function useGameConfig() {
  const [roles, setRoles] = useState<RoleDef[]>(_roleCache || []);
  const [cards, setCards] = useState<CardTemplateDef[]>(_cardCache || []);
  const [abilities, setAbilities] = useState<AbilityDef[]>(_abilityCache || []);
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
      const [rolesData, cardsData, abilitiesData] = await Promise.all([
        fetchFromAPI('/roles'),
        fetchFromAPI('/card-templates'),
        fetchFromAPI('/abilities'),
      ]);

      _roleCache = rolesData || [];
      _cardCache = cardsData || [];
      _abilityCache = abilitiesData || [];
      _lastFetch = now;

      setRoles(_roleCache || []);
      setCards(_cardCache || []);
      setAbilities(_abilityCache || []);
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

  // ── Helper: جلب card template لدور معين ──
  const getCardForRole = useCallback((roleId: string | null): CardTemplateDef | null => {
    if (!roleId) return null;
    const role = roles.find(r => r.id === roleId);
    if (!role?.cardTemplateId) return null;
    return cards.find(c => c.id === role.cardTemplateId) || null;
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

  return {
    roles,
    cards,
    abilities,
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
  };
}

// ── إعادة تصفير الـ Cache (يُستدعى عند تعديل الإعدادات) ──
export function invalidateGameConfigCache() {
  _roleCache = null;
  _cardCache = null;
  _abilityCache = null;
  _lastFetch = 0;
}
