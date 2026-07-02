// ══════════════════════════════════════════════════════
// 📡 عميل تخطيط الطباعة — Print Layout API client
// ══════════════════════════════════════════════════════

import type { LayoutConfig } from './printLayoutContract';

const API = process.env.NEXT_PUBLIC_API_URL || '';

function authHeaders(json = true): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export interface Letterhead { id: number; name: string; url: string; widthPx: number; heightPx: number; createdAt: string; }

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

export function assetUrl(path?: string | null): string {
  if (!path) return '';
  return path.startsWith('http') ? path : `${API}${path}`;
}

export async function getLayout(reportKey: string): Promise<{ layout: LayoutConfig; letterheadId: number | null; letterheadUrl: string | null; exists: boolean }> {
  const res = await fetch(`${API}/api/print-layouts/${encodeURIComponent(reportKey)}`, { headers: authHeaders(false) });
  const data = await jsonOrThrow(res);
  return { layout: data.layout, letterheadId: data.letterheadId, letterheadUrl: data.letterheadUrl, exists: data.exists };
}

export async function saveLayout(reportKey: string, layout: LayoutConfig, letterheadId: number | null): Promise<void> {
  const res = await fetch(`${API}/api/print-layouts/${encodeURIComponent(reportKey)}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ layout, letterheadId }),
  });
  await jsonOrThrow(res);
}

export async function listLetterheads(): Promise<Letterhead[]> {
  const res = await fetch(`${API}/api/print-layouts/letterheads`, { headers: authHeaders(false) });
  const data = await jsonOrThrow(res);
  return data.letterheads as Letterhead[];
}

export async function uploadLetterhead(pngBlob: Blob, name: string, widthPx: number, heightPx: number, pdf?: File): Promise<Letterhead> {
  const fd = new FormData();
  fd.append('image', pngBlob, 'letterhead.png');
  fd.append('name', name);
  fd.append('widthPx', String(widthPx));
  fd.append('heightPx', String(heightPx));
  if (pdf) fd.append('pdf', pdf);
  const res = await fetch(`${API}/api/print-layouts/letterheads`, {
    method: 'POST', headers: authHeaders(false), body: fd,
  });
  const data = await jsonOrThrow(res);
  return data.letterhead as Letterhead;
}

export async function deleteLetterhead(id: number): Promise<void> {
  const res = await fetch(`${API}/api/print-layouts/letterheads/${id}`, { method: 'DELETE', headers: authHeaders(false) });
  await jsonOrThrow(res);
}

// معاينة PDF بتخطيط غير محفوظ → يفتح في تبويب جديد
export async function previewPdf(key: string, params: Record<string, unknown>, layout: LayoutConfig, letterheadId: number | null): Promise<void> {
  const res = await fetch(`${API}/api/reports/preview-pdf`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ key, params, layout, letterheadId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'تعذّرت المعاينة');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
