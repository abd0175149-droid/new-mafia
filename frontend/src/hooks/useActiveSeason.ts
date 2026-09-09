'use client';

// 🏆 الموسمُ العاديُّ النشط — اسمُه ومدنُه (لاعبون ومباريات لكلّ مدينة).
//    يُستعمل في نموذج الفعاليّة («مبارياتها تُحتسب لتصنيف X — موسم Y») وتحذير نقل المكان.

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface ActiveSeasonCity { id: number; name: string; players: number; matches: number }
export interface ActiveSeason { id: number; name: string; seasonNumber: number; cities: ActiveSeasonCity[] }

let cache: ActiveSeason | null | undefined;
let inflight: Promise<ActiveSeason | null> | null = null;

export async function fetchActiveSeason(force = false): Promise<ActiveSeason | null> {
  if (!force && cache !== undefined) return cache;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/seasons/public/active`);
      if (!res.ok) throw new Error(`season ${res.status}`);
      const d = await res.json();
      const s = d?.season;
      cache = s
        ? {
            id: Number(s.id), name: String(s.name || ''), seasonNumber: Number(s.seasonNumber ?? 0),
            cities: (Array.isArray(s.cities) ? s.cities : []).map((c: any) => ({
              id: Number(c.id), name: String(c.name || ''), players: Number(c.players ?? 0), matches: Number(c.matches ?? 0),
            })),
          }
        : null;
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useActiveSeason() {
  const [season, setSeason] = useState<ActiveSeason | null>(cache ?? null);
  const [loading, setLoading] = useState(cache === undefined);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try { setSeason(await fetchActiveSeason(force)); }
    catch { setSeason(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { season, loading, reload: () => load(true) };
}
