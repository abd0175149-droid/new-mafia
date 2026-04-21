'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
function getCurrentUserId() { try { return JSON.parse(localStorage.getItem('user') || '{}')?.id; } catch { return null; } }

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error ${res.status}`);
  }
  return res.json();
}

function fmtDate(d: any) { 
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(d: any) {
  if (!d) return 'لم يسجل الدخول';
  const dt = new Date(d);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
  const timeStr = dt.toLocaleTimeString('en-US', timeOpts);
  return `${fmtDate(d)} - ${timeStr}`;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'activities', label: 'إدارة الأنشطة' },
  { id: 'bookings', label: 'إدارة الحجوزات' },
  { id: 'locations', label: 'أماكن الفعاليات' },
  { id: 'finances', label: 'الصلاحيات المالية' },
];

export default function StaffManagementPage() {
  const currentUserId = useMemo(() => getCurrentUserId(), []);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Dialog State ──
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Form State ──
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [isPartner, setIsPartner] = useState(false);
  const [permissions, setPermissions] = useState<string[]>(['activities', 'bookings', 'finances', 'locations']);

  // ══ Load Staff ══
  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await apiFetch('/api/staff'));
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء جلب الموظفين');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadUsers(); }, []);

  // ══ Open Dialogs ══
  function handleOpenNew() {
    setEditingUser(null);
    setDisplayName('');
    setUsername('');
    setPassword('');
    setRole('manager');
    setIsPartner(false);
    setPermissions(['activities', 'bookings', 'finances', 'locations']);
    setIsDialogOpen(true);
  }

  function handleOpenEdit(userItem: any) {
    setEditingUser(userItem);
    setDisplayName(userItem.displayName || '');
    setUsername(userItem.username || '');
    setPassword(''); // فارغ ليختار التحديث أم لا
    setRole(userItem.role || 'manager');
    setIsPartner(!!userItem.isPartner);
    try {
      const parsedPerms = typeof userItem.permissions === 'string' 
        ? JSON.parse(userItem.permissions) 
        : userItem.permissions || [];
      setPermissions(parsedPerms);
    } catch {
      setPermissions([]);
    }
    setIsDialogOpen(true);
  }

  // ══ Toggle Permission ══
  function togglePermission(permId: string) {
    setPermissions(prev => 
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  }

  // ══ Save User ══
  async function handleSave() {
    if (!displayName.trim() || (!editingUser && !username.trim())) {
      alert('الرجاء تعبئة الحقول المطلوبة.');
      return;
    }
    
    setSaving(true);
    try {
      if (editingUser) {
        // تحديث
        await apiFetch(`/api/staff/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({ displayName, role, isPartner, permissions }),
        });
        // تحديث كلمة المرور إن وُجدت
        if (password.trim() !== '') {
          await apiFetch(`/api/staff/${editingUser.id}/password`, {
            method: 'PUT',
            body: JSON.stringify({ password }),
          });
        }
      } else {
        // إنشاء جديد
        if (!password.trim()) {
          alert('كلمة المرور مطلوبة للمستخدم الجديد.');
          setSaving(false);
          return;
        }
        await apiFetch('/api/staff', {
          method: 'POST',
          body: JSON.stringify({ displayName, username, password, role, isPartner, permissions }),
        });
      }
      setIsDialogOpen(false);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  // ══ Delete User ══
  async function handleDelete(id: number, currentUserIdCheck: number) {
    if (id === currentUserIdCheck) {
      alert('لا يمكنك حذف حسابك الخاص');
      return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا الحساب نهائياً؟')) return;
    try {
      await apiFetch(`/api/staff/${id}`, { method: 'DELETE' });
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'فشل الحذف');
    }
  }

  // ══ Role Visuals ══
  const roleDisplay: Record<string, { label: string; badge: string }> = {
    admin: { label: 'مسؤول', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    manager: { label: 'مدير', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    leader: { label: 'قائد لعبة', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    location_owner: { label: 'صاحب مكان', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  };

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6" dir="rtl">
      {/* ══ HEADER ══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>👥</span> إدارة الموظفين والصلاحيات
          </h1>
          <p className="text-gray-400 text-sm mt-1">تحكم كامل بحسابات الدخول والصلاحيات المخصصة لكل مستخدم</p>
        </div>
        <button onClick={handleOpenNew} className="px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition flex items-center gap-2">
          <span>+ إضافة موظف جديد</span>
        </button>
      </div>

      {/* ══ TABLE ══ */}
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-2xl overflow-hidden">
        {users.length === 0 ? (
          <div className="text-center py-16 text-gray-500 font-medium">لا يوجد موظفين</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/50 text-gray-500 text-xs border-b border-gray-700/30">
                  <th className="text-right px-4 py-3 font-medium">الاسم</th>
                  <th className="text-left px-4 py-3 font-medium" dir="ltr">اسم المستخدم</th>
                  <th className="text-center px-4 py-3 font-medium">الدور</th>
                  <th className="text-center px-4 py-3 font-medium">الانضمام</th>
                  <th className="text-center px-4 py-3 font-medium">تاريخ الدخول</th>
                  <th className="text-center px-4 py-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const roleData = roleDisplay[u.role] || { label: u.role, badge: 'bg-gray-500/10 text-gray-400' };
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className="border-b border-gray-700/15 hover:bg-gray-700/10 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg overflow-hidden shrink-0">
                            {u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover"/> : (u.displayName?.[0] || '👤')}
                          </div>
                          <div>
                            <p className="font-bold text-white capitalize">{u.displayName}</p>
                            {u.isPartner ? <span className="text-[10px] text-amber-400">شريك</span> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left font-mono text-gray-300" dir="ltr">
                        @{u.username}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${roleData.badge}`}>
                          {roleData.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-center text-gray-500 text-xs font-mono" dir="ltr">{fmtDateTime(u.lastLogin)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleOpenEdit(u)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition" title="إعدادات">
                            ⚙️
                          </button>
                          <button 
                            onClick={() => handleDelete(u.id, currentUserId)} 
                            disabled={isSelf} 
                            className={`p-1.5 rounded-lg transition ${isSelf ? 'opacity-30 cursor-not-allowed text-gray-500' : 'text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10'}`} 
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ ADD/EDIT DIALOG ══ */}
      <AnimatePresence>
        {isDialogOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setIsDialogOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{editingUser ? 'تعديل إعدادات الموظف' : 'إضافة موظف جديد'}</h3>
                <button onClick={() => setIsDialogOpen(false)} className="text-gray-500 hover:text-white transition">✕</button>
              </div>

              {/* Form Content */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">الاسم الكامل <span className="text-rose-400">*</span></label>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="اسم الموظف" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">الدور <span className="text-rose-400">*</span></label>
                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30">
                      <option value="manager">مدير (Manager)</option>
                      <option value="leader">قائد لعبة (Leader)</option>
                      <option value="admin">مسؤول (Admin)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="isPartnerCheck" checked={isPartner} onChange={e => setIsPartner(e.target.checked)} className="accent-amber-500 w-4 h-4 cursor-pointer" />
                  <label htmlFor="isPartnerCheck" className="text-sm text-gray-300 cursor-pointer">هذا المستخدم شريك بالمشروع (مالياً)</label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">اسم المستخدم {editingUser && '(مغلق)'}</label>
                    <input 
                      type="text" 
                      value={username} 
                      onChange={e => setUsername(e.target.value)} 
                      disabled={!!editingUser} 
                      dir="ltr" 
                      placeholder="username" 
                      className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed font-mono" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">{editingUser ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-600/50 rounded-xl text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30 font-mono" />
                  </div>
                </div>

                <hr className="border-gray-700/30" />

                {/* ── Permissions Grid ── */}
                <div>
                  <p className="text-sm font-bold text-white mb-3">🛡️ الصلاحيات المخصصة</p>
                  
                  {role === 'admin' ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 text-sm">
                      <p>يمتلك دور **المسؤول (Admin)** وصولاً كاملاً لكل أقسام ومزايا النظام، ويتجاوز تخصيص الصلاحيات هنا.</p>
                    </div>
                  ) : role === 'leader' ? (
                     <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-purple-400 text-sm">
                      <p>يمتلك **قائد اللعبة (Leader)** وصولاً لمحرك تشغيل اللعبة والواجهات التشغيلية المرتبطة بجلسة اللعب فقط.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {AVAILABLE_PERMISSIONS.map(perm => (
                        <label key={perm.id} className="flex items-center gap-2 cursor-pointer bg-gray-900/40 p-2.5 rounded-lg border border-gray-700/30 hover:border-gray-600/50 transition">
                          <input 
                            type="checkbox" 
                            checked={permissions.includes(perm.id)} 
                            onChange={() => togglePermission(perm.id)} 
                            className="accent-emerald-500 w-4 h-4" 
                          />
                          <span className="text-sm text-gray-300">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition disabled:opacity-50 text-sm">
                  {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
                <button onClick={() => setIsDialogOpen(false)} className="px-5 py-3 bg-gray-700/50 text-gray-300 rounded-xl hover:bg-gray-700/70 transition text-sm">
                  إلغاء
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
