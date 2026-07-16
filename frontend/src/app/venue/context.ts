'use client';

// 🏪 سياق كونسول المكان — يوفّره venue/layout.tsx وتستهلكه صفحات /venue/*
import { createContext, useContext } from 'react';

export interface VenueMe {
  id: number;
  role: string;
  displayName: string;
  permissions: string[];
  location: { id: number; name: string } | null;
}

export interface VenueCtx {
  me: VenueMe;
  locationId: number | null;          // مكان الحساب، أو اختيار الأدمن
  locationName: string;
  setLocation: (id: number, name: string) => void;
  isHQ: boolean;                       // admin/manager يخدم أيّ مكان
  authHeaders: Record<string, string>;
  can: (perm: string) => boolean;
}

export const VenueContext = createContext<VenueCtx | null>(null);

export const useVenue = () => {
  const ctx = useContext(VenueContext);
  if (!ctx) throw new Error('useVenue خارج VenueLayout');
  return ctx;
};
