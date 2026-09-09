// ── Rank Constants ──
// 🔴 المصدرُ الوحيد لأسماء الرتب وشاراتها وألوانها: لوحةُ الإدارة وتطبيقُ اللاعب
//    يستوردان من هنا — لا نسخَ محلّيّةً (كانت إحداها تحمل رتبةً سادسةً لا وجودَ لها).

export const RANK_TIERS = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'] as const;
export type RankTier = typeof RANK_TIERS[number];

export const RANK_NAMES_AR: Record<string, string> = {
  INFORMANT: 'مُخبر',
  SOLDIER: 'جندي',
  CAPO: 'كابو',
  UNDERBOSS: 'أندربوس',
  GODFATHER: 'الأب الروحي',
};

export const RANK_BADGES: Record<string, string> = {
  INFORMANT: '🕵️',
  SOLDIER: '⚔️',
  CAPO: '🎖️',
  UNDERBOSS: '💎',
  GODFATHER: '👑',
};

export const RANK_COLORS: Record<string, string> = {
  INFORMANT: '#6b7280',
  SOLDIER: '#3b82f6',
  CAPO: '#a855f7',
  UNDERBOSS: '#f59e0b',
  GODFATHER: '#ef4444',
};

/** ترتيبُ التقدّم (١ = الأدنى) — للفرز، لا للعرض */
export const RANK_ORDER: Record<string, number> = RANK_TIERS.reduce<Record<string, number>>((acc, t, i) => {
  acc[t] = i + 1;
  return acc;
}, {});

export const rankName = (tier?: string | null): string => RANK_NAMES_AR[tier || ''] || RANK_NAMES_AR.INFORMANT;
export const rankBadge = (tier?: string | null): string => RANK_BADGES[tier || ''] || RANK_BADGES.INFORMANT;
export const rankColor = (tier?: string | null): string => RANK_COLORS[tier || ''] || RANK_COLORS.INFORMANT;
