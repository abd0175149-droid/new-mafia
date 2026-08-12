// ── Rank Constants ──

export const RANK_TIERS = ['INFORMANT', 'SOLDIER', 'CAPO', 'UNDERBOSS', 'GODFATHER'] as const;

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
