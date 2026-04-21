'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers } });
  if (!res.ok) throw new Error('API error');
  return res.json();
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() { try { setSettings(await apiFetch('/api/settings')); } catch {} finally { setLoading(false); } }

  async function save() {
    setSaving(true);
    try { await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }); } catch {} finally { setSaving(false); }
  }

  if (loading || !settings) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-3xl font-bold text-white">⚙️ الإعدادات</h1><p className="text-gray-400 mt-1">تخصيص لوحة التحكم والإشعارات</p></div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-6 space-y-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">🔔 الإشعارات</h3>
        {[
          { key: 'newBooking', label: 'حجز جديد', desc: 'إشعار عند إضافة حجز جديد' },
          { key: 'upcomingActivity', label: 'نشاط قادم', desc: 'تذكير بالأنشطة القادمة' },
          { key: 'costAlert', label: 'تنبيه مصروفات', desc: 'إشعار عند إضافة مصروف' },
        ].map(item => (
          <label key={item.key} className="flex items-center justify-between p-3 bg-gray-900/40 rounded-xl cursor-pointer hover:bg-gray-900/60 transition">
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.notifications?.[item.key] ?? true}
                onChange={e => setSettings({ ...settings, notifications: { ...settings.notifications, [item.key]: e.target.checked } })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 rounded-full peer-checked:bg-amber-500 peer-focus:ring-2 peer-focus:ring-amber-500/30 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
            </div>
          </label>
        ))}
      </motion.div>

      <button onClick={save} disabled={saving} className="w-full py-3 bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50">
        {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
      </button>
    </div>
  );
}
