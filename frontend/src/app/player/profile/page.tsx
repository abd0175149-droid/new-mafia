'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// ── أسماء الأدوار بالعربي ──
const ROLE_NAMES_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', CITIZEN: 'مواطن صالح',
};

const MAFIA_ROLES = ['GODFATHER', 'SILENCER', 'CHAMELEON', 'MAFIA_REGULAR'];

interface PlayerProfile {
  player: {
    id: number; phone: string; name: string; gender: string;
    totalMatches: number; totalWins: number; totalSurvived: number;
    createdAt: string; email?: string; avatarUrl?: string;
  };
  stats: {
    totalMatches: number; totalWins: number; survivalRate: number;
    favoriteRole: string | null; mafiaWins: number; citizenWins: number;
  };
  matchHistory: Array<{
    matchId: number; role: string; survived: boolean;
    matchWinner: string; matchDate: string; matchDuration: number;
    matchPlayerCount: number;
  }>;
  activeGame: {
    roomId: string; roomCode: string; gameName: string;
    physicalId: number; role: string | null; isAlive: boolean; phase: string;
  } | null;
}

// ── تقليص الصورة قبل الرفع (400x400 كحد أقصى) ──
function resizeImage(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('فشل في قراءة الصورة'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('فشل في قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export default function PlayerProfilePage() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // تعديل الاسم
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // تعديل الإيميل
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  // رفع الصورة
  const fileInputRef = useRef<HTMLInputElement>(null);

  // جلب التوكن للتحقق
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('mafia_player_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, []);

  useEffect(() => {
    const playerId = localStorage.getItem('mafia_playerId');
    if (!playerId) {
      setError('لم يتم العثور على حساب. سجّل في لعبة أولاً');
      setLoading(false);
      return;
    }

    fetch(`/api/player/${playerId}/profile`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setProfile(data);
          setNameInput(data.player.name);
          setEmailInput(data.player.email || '');
        } else {
          setError(data.error || 'خطأ في جلب البروفايل');
        }
      })
      .catch(() => setError('خطأ في الاتصال'))
      .finally(() => setLoading(false));
  }, [getAuthHeaders]);

  // ── حفظ الاسم (يُنفذ عند onBlur أو Enter) ──
  const handleSaveName = useCallback(async () => {
    if (!profile) return;
    const trimmed = nameInput.trim();

    // إذا ما تغيّر → أغلق بدون حفظ
    if (!trimmed || trimmed === profile.player.name) {
      setEditingName(false);
      setNameInput(profile.player.name);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/player/${profile.player.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(prev => prev ? { ...prev, player: { ...prev.player, name: trimmed } } : prev);
        setSaveMsg('✓ تم حفظ الاسم');
        setTimeout(() => setSaveMsg(''), 2000);
      } else {
        setSaveMsg(data.error || 'خطأ في الحفظ');
        setNameInput(profile.player.name);
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch {
      setSaveMsg('خطأ في الاتصال');
      setNameInput(profile.player.name);
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setSaving(false);
    setEditingName(false);
  }, [profile, nameInput, getAuthHeaders]);

  // ── حفظ الإيميل (يُنفذ عند onBlur أو Enter) ──
  const handleSaveEmail = useCallback(async () => {
    if (!profile) return;
    const trimmed = emailInput.trim();

    // إذا ما تغيّر → أغلق بدون حفظ
    if (trimmed === (profile.player.email || '')) {
      setEditingEmail(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/player/${profile.player.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ email: trimmed || null }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(prev => prev ? { ...prev, player: { ...prev.player, email: trimmed || undefined } } : prev);
        setSaveMsg('✓ تم حفظ الإيميل');
        setTimeout(() => setSaveMsg(''), 2000);
      } else {
        setSaveMsg(data.error || 'خطأ في الحفظ');
        setEmailInput(profile.player.email || '');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch {
      setSaveMsg('خطأ في الاتصال');
      setEmailInput(profile.player.email || '');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setSaving(false);
    setEditingEmail(false);
  }, [profile, emailInput, getAuthHeaders]);

  // ── رفع الصورة (مع تقليص تلقائي) ──
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 10 * 1024 * 1024) {
      setSaveMsg('الصورة كبيرة جداً (حد أقصى 10MB)');
      setTimeout(() => setSaveMsg(''), 3000);
      return;
    }

    setSaving(true);
    try {
      // تقليص الصورة إلى 400x400 كحد أقصى
      const resizedBase64 = await resizeImage(file, 400);

      const res = await fetch(`/api/player/${profile.player.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ image: resizedBase64 }),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(prev => prev ? {
          ...prev,
          player: { ...prev.player, avatarUrl: data.avatarUrl + '?t=' + Date.now() },
        } : prev);
        setSaveMsg('✓ تم تحديث الصورة');
        setTimeout(() => setSaveMsg(''), 2000);
      } else {
        setSaveMsg(data.error || 'خطأ في رفع الصورة');
        setTimeout(() => setSaveMsg(''), 3000);
      }
    } catch {
      setSaveMsg('خطأ في رفع الصورة');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setSaving(false);
    // مسح قيمة الـ input عشان يقدر يختار نفس الصورة مرة ثانية
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#C5A059" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </motion.div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-center p-8">
        <div>
          <p className="text-[#C5A059] text-xl font-bold mb-4" style={{ fontFamily: 'Amiri, serif' }}>
            {error || 'لم يتم العثور على البروفايل'}
          </p>
          <Link href="/player" className="px-6 py-2 bg-[#1a1a1a] border border-[#C5A059]/30 text-[#C5A059] rounded-lg text-sm hover:bg-[#C5A059]/10 transition inline-block">
            العودة
          </Link>
        </div>
      </div>
    );
  }

  const { player, stats, matchHistory, activeGame } = profile;
  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';
  const avatarSrc = player.avatarUrl ? `${SOCKET_URL}${player.avatarUrl}` : null;

  return (
    <div className="min-h-screen bg-black text-white" dir="rtl" style={{ fontFamily: 'Amiri, serif' }}>
      {/* ── Header ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1a1500 0%, #000 100%)' }}>
        <div className="max-w-lg mx-auto px-6 py-8 text-center relative z-10">
          {/* Avatar — مع أيقونة الكاميرا */}
          <div className="relative inline-block mb-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15 }}
              className="w-24 h-24 mx-auto rounded-full border-2 border-[#C5A059]/50 flex items-center justify-center text-4xl overflow-hidden cursor-pointer"
              style={{ background: 'linear-gradient(145deg, #1a1a1a, #2a2a2a)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                player.gender === 'FEMALE' ? '👩' : '👤'
              )}
              {saving && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    ⏳
                  </motion.div>
                </div>
              )}
            </motion.div>
            {/* أيقونة الكاميرا */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 left-0 w-8 h-8 bg-[#C5A059] rounded-full flex items-center justify-center text-black text-sm shadow-lg hover:bg-[#d4b06a] transition-colors border-2 border-black"
            >
              📷
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* الاسم — حفظ تلقائي عند blur */}
          <div className="flex items-center justify-center gap-2 mb-1 min-h-[44px]">
            {editingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); }
                  if (e.key === 'Escape') { setEditingName(false); setNameInput(player.name); }
                }}
                onBlur={handleSaveName}
                autoFocus
                disabled={saving}
                className="bg-[#111] border border-[#C5A059]/40 text-[#C5A059] text-2xl font-black text-center px-4 py-1 rounded-lg focus:outline-none focus:border-[#C5A059] w-56 disabled:opacity-50"
                maxLength={30}
              />
            ) : (
              <>
                <h1 className="text-3xl font-black text-[#C5A059]">{player.name}</h1>
                <button onClick={() => { setEditingName(true); setNameInput(player.name); }}
                  className="text-[#555] hover:text-[#C5A059] transition text-lg">✏️</button>
              </>
            )}
          </div>

          {/* رقم الهاتف */}
          <p className="text-[#808080] text-[10px] font-mono tracking-widest mb-1">
            {player.phone}
          </p>

          {/* الإيميل — حفظ تلقائي عند blur */}
          <div className="flex items-center justify-center gap-2 mb-1 min-h-[28px]">
            {editingEmail ? (
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveEmail(); }
                  if (e.key === 'Escape') { setEditingEmail(false); setEmailInput(player.email || ''); }
                }}
                onBlur={handleSaveEmail}
                placeholder="البريد الإلكتروني..."
                autoFocus
                disabled={saving}
                className="bg-[#111] border border-[#C5A059]/40 text-[#C5A059] text-xs text-center px-3 py-1 rounded-lg focus:outline-none focus:border-[#C5A059] w-56 font-mono disabled:opacity-50"
              />
            ) : (
              <button onClick={() => { setEditingEmail(true); setEmailInput(player.email || ''); }}
                className="text-[#555] text-[10px] font-mono tracking-widest hover:text-[#C5A059] transition flex items-center gap-1">
                {player.email ? (
                  <><span>📧 {player.email}</span><span className="text-[8px]">✏️</span></>
                ) : (
                  <span>+ إضافة بريد إلكتروني</span>
                )}
              </button>
            )}
          </div>

          <p className="text-[#555] text-[9px] font-mono">
            عضو منذ {new Date(player.createdAt).toLocaleDateString('ar-JO')}
          </p>

          {/* رسالة الحفظ */}
          <AnimatePresence>
            {saveMsg && (
              <motion.p
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`text-xs mt-2 font-mono ${saveMsg.includes('خطأ') || saveMsg.includes('كبيرة') ? 'text-red-400' : 'text-green-400'}`}
              >
                {saveMsg}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-12 -mt-2">
        {/* ── Active Game Banner ── */}
        {activeGame && (
          <motion.div
            initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="mb-6 p-4 rounded-2xl border"
            style={{
              background: 'linear-gradient(135deg, rgba(139,0,0,0.15), rgba(0,0,0,0.8))',
              borderColor: activeGame.isAlive ? 'rgba(0,200,0,0.3)' : 'rgba(139,0,0,0.3)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-red-400 animate-pulse">
                🔴 لعبة نشطة
              </span>
              <span className="text-[10px] font-mono text-[#808080]">{activeGame.gameName}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">مقعد #{activeGame.physicalId}</p>
                <p className="text-[10px] text-[#808080] font-mono">
                  {activeGame.isAlive ? '✅ ALIVE' : '☠️ ELIMINATED'}
                  {activeGame.role && ` — ${ROLE_NAMES_AR[activeGame.role] || activeGame.role}`}
                </p>
              </div>
              <Link
                href={`/player?code=${activeGame.roomCode}`}
                className="px-4 py-2 bg-[#C5A059]/20 border border-[#C5A059]/40 text-[#C5A059] rounded-lg text-xs hover:bg-[#C5A059]/30 transition"
              >
                العودة للعبة
              </Link>
            </div>
          </motion.div>
        )}

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'المباريات', value: stats.totalMatches, icon: '🎮' },
            { label: 'الانتصارات', value: stats.totalWins, icon: '🏆' },
            { label: 'نسبة البقاء', value: `${stats.survivalRate}%`, icon: '🛡️' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="p-4 rounded-xl text-center"
              style={{
                background: 'linear-gradient(145deg, #111, #0a0a0a)',
                border: '1px solid rgba(197,160,89,0.15)',
              }}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-black text-[#C5A059]">{stat.value}</div>
              <div className="text-[9px] text-[#808080] font-mono uppercase tracking-widest">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Detailed Stats ── */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: '#0a0a0a', border: '1px solid rgba(197,160,89,0.1)' }}>
          <h3 className="text-sm font-bold text-[#C5A059] mb-3 tracking-wide">إحصائيات تفصيلية</h3>
          <div className="space-y-2 text-[12px]">
            {stats.favoriteRole && (
              <div className="flex justify-between">
                <span className="text-[#808080]">الدور الأكثر</span>
                <span className="text-white">{ROLE_NAMES_AR[stats.favoriteRole] || stats.favoriteRole}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[#808080]">فوز كمافيا</span>
              <span className="text-red-400">{stats.mafiaWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#808080]">فوز كمواطن</span>
              <span className="text-blue-400">{stats.citizenWins}</span>
            </div>
          </div>
        </div>

        {/* ── Match History ── */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-[#C5A059] mb-3 tracking-wide">سجل المباريات</h3>
          {matchHistory.length === 0 ? (
            <p className="text-[#555] text-center text-sm py-8">لا توجد مباريات سابقة بعد</p>
          ) : (
            <div className="space-y-2">
              {matchHistory.slice(0, 20).map((m, i) => {
                const isMafia = MAFIA_ROLES.includes(m.role || '');
                return (
                  <motion.div
                    key={m.matchId}
                    initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{
                      background: 'linear-gradient(145deg, #111, #0a0a0a)',
                      border: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isMafia ? 'bg-red-900/30 text-red-400' : 'bg-blue-900/30 text-blue-400'}`}>
                        {isMafia ? '🎭' : '🛡️'}
                      </div>
                      <div>
                        <p className="text-xs text-white/70">{ROLE_NAMES_AR[m.role] || m.role}</p>
                        <p className="text-[9px] text-[#555] font-mono">
                          {new Date(m.matchDate).toLocaleDateString('ar-JO')} • {m.matchPlayerCount} لاعب
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-mono px-2 py-1 rounded-md ${m.survived ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                        {m.survived ? 'بقي' : 'أُقصي'}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Back Button ── */}
        <div className="text-center">
          <Link href="/player"
            className="px-8 py-3 bg-[#1a1a1a] border border-[#C5A059]/30 text-[#C5A059] rounded-xl text-sm hover:bg-[#C5A059]/10 transition inline-block">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
