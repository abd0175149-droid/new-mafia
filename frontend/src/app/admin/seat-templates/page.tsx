'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

interface SeatTemplate {
  id: number; name: string; layoutType: string; totalSeats: number; reservedTailCount: number;
  pinnedSeats: any[]; layoutConfig: any | null; isDefault: boolean;
}

export default function SeatTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<SeatTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch('/api/seat-templates'); setTemplates(res.templates || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (id: number) => {
    if (!confirm('⚠️ حذف هذا القالب نهائياً؟')) return;
    try { await apiFetch(`/api/seat-templates/${id}`, { method: 'DELETE' }); fetchTemplates(); }
    catch (e: any) { alert('فشل الحذف: ' + e.message); }
  };

  const icon = (l: string) => l === 'circle' ? '⭕' : l === 'rows' ? '📊' : '🔳';
  const label = (l: string) => l === 'circle' ? 'دائري' : l === 'rows' ? 'صفوف' : 'مستطيل';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-10" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">📐 قوالب المقاعد</h1>
          <p className="text-sm text-gray-500 mt-1">صمّم القاعة ثلاثية الأبعاد: أضلاع، أبواب، ترقيم، وتثبيت لاعبين</p>
        </div>
        <button onClick={() => router.push('/admin/seat-templates/editor')}
          className="px-4 py-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition flex items-center gap-2">✨ قالب جديد</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-16 text-center">
          <span className="text-5xl block mb-4 opacity-30">📐</span>
          <p className="text-gray-500 text-sm mb-4">لا توجد قوالب حتى الآن</p>
          <button onClick={() => router.push('/admin/seat-templates/editor')} className="px-4 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-bold hover:bg-amber-500/25 transition">✨ إنشاء أول قالب</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-5 hover:border-amber-500/20 transition group">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold flex items-center gap-2">{t.name}
                    {t.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">افتراضي</span>}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t.totalSeats} مقعد • {icon(t.layoutType)} {label(t.layoutType)}</p>
                </div>
                <span className="text-2xl opacity-20 group-hover:opacity-40 transition">{icon(t.layoutType)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-white">{t.totalSeats}</p><p className="text-[10px] text-gray-600">مقعد</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-amber-400">{(t.pinnedSeats || []).length}</p><p className="text-[10px] text-gray-600">مثبت</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-rose-400">{(t.layoutConfig?.doors || []).length}</p><p className="text-[10px] text-gray-600">باب</p></div>
                <div className="bg-gray-900/50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-gray-400">{t.reservedTailCount}</p><p className="text-[10px] text-gray-600">مؤخر</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => router.push(`/admin/seat-templates/editor?id=${t.id}`)} className="flex-1 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition">✏️ تعديل</button>
                <button onClick={() => handleDelete(t.id)} className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs hover:bg-rose-500/20 transition">🗑️</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
