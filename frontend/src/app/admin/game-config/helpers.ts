const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

export async function gcFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/game-config${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

// ── Enums ────────────────────────────
export const PHASE_OPTIONS = [
  { value: 'NIGHT', label: 'ليلي' },
  { value: 'DAY', label: 'نهاري' },
  { value: 'BOTH', label: 'كلاهما' },
];

export const TARGET_TYPE_OPTIONS = [
  { value: 'ENEMY', label: 'عدو' },
  { value: 'ALLY', label: 'حليف' },
  { value: 'ANY', label: 'أي لاعب' },
  { value: 'SELF', label: 'النفس' },
  { value: 'NONE', label: 'بدون هدف' },
];

export const EFFECT_TYPE_OPTIONS = [
  { value: 'ELIMINATE', label: 'إقصاء' },
  { value: 'BLOCK_ELIMINATE', label: 'منع إقصاء' },
  { value: 'REVEAL_TEAM', label: 'كشف فريق' },
  { value: 'SILENCE', label: 'إسكات' },
  { value: 'CONDITIONAL_ELIMINATE', label: 'إقصاء مشروط' },
  { value: 'PASSIVE', label: 'سلبي' },
];

export const TEAM_OPTIONS = [
  { value: 'MAFIA', label: 'مافيا', color: 'text-rose-400' },
  { value: 'CITIZEN', label: 'مواطن', color: 'text-blue-400' },
  { value: 'NEUTRAL', label: 'محايد', color: 'text-amber-400' },
];

export const CONDITION_OPTIONS = [
  { value: 'SAME_TARGET', label: 'نفس الهدف' },
  { value: 'ALWAYS', label: 'دائماً' },
  { value: 'SPECIFIC_TARGET', label: 'هدف محدد' },
];

export const RESOLUTION_OPTIONS = [
  { value: 'B_CANCELS_A', label: 'B يلغي A' },
  { value: 'A_CANCELS_B', label: 'A يلغي B' },
  { value: 'BOTH_CANCEL', label: 'كلاهما يُلغى' },
];
