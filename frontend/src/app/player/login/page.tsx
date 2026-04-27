'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import Image from 'next/image';

type Mode = 'welcome' | 'login' | 'register' | 'change_password';

export default function LoginPage() {
  const { setPlayer } = usePlayer();
  const [mode, setMode] = useState<Mode>('welcome');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [tempPlayer, setTempPlayer] = useState<any>(null);
  const [welcomeBonus, setWelcomeBonus] = useState<{ show: boolean; amount: number; playerData: any; token: string }>({ show: false, amount: 0, playerData: null, token: '' });

  const handleLogin = async () => {
    if (!phone || !password) return setError('أدخل رقم الهاتف وكلمة المرور');
    setLoading(true); setError('');

    try {
      const res = await fetch('/api/player-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'خطأ في تسجيل الدخول');
        setLoading(false);
        return;
      }

      // هل يحتاج تغيير كلمة المرور؟
      if (data.mustChangePassword) {
        setTempToken(data.token);
        setTempPlayer(data.player);
        setMode('change_password');
        setLoading(false);
        return;
      }

      setPlayer({
        playerId: data.player.id,
        name: data.player.name,
        phone: data.player.phone,
        token: data.token,
      });
    } catch {
      setError('خطأ في الاتصال بالخادم');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!phone || !password || !name) return setError('جميع الحقول مطلوبة');
    if (password.length < 4) return setError('كلمة المرور 4 أحرف على الأقل');
    setLoading(true); setError('');

    try {
      const res = await fetch('/api/player-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, name, gender }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'خطأ في إنشاء الحساب');
        setLoading(false);
        return;
      }

      // عرض تنبيه المكافأة الترحيبية قبل الدخول
      if (data.welcomeBonus) {
        setWelcomeBonus({
          show: true,
          amount: data.welcomeBonus,
          playerData: data.player,
          token: data.token,
        });
      } else {
        setPlayer({
          playerId: data.player.id,
          name: data.player.name,
          phone: data.player.phone,
          token: data.token,
        });
      }
    } catch {
      setError('خطأ في الاتصال بالخادم');
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 4) return setError('كلمة المرور الجديدة 4 أحرف على الأقل');
    setLoading(true); setError('');

    try {
      const res = await fetch('/api/player-auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tempToken}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'خطأ');
        setLoading(false);
        return;
      }

      setPlayer({
        playerId: tempPlayer.id,
        name: tempPlayer.name,
        phone: tempPlayer.phone,
        token: tempToken,
      });
    } catch {
      setError('خطأ في الاتصال');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center px-4">
      {/* خلفية */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #fbbf24, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, #ef4444, transparent)' }} />
      </div>

      <AnimatePresence mode="wait">
        {/* ── Welcome ── */}
        {mode === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-6 relative z-10 w-full max-w-sm"
          >
            <Image src="/mafia_logo.png" alt="Mafia Club" width={120} height={120} className="rounded-2xl" />
            <h1 className="text-2xl font-bold text-white">نادي المافيا</h1>
            <p className="text-gray-500 text-center text-sm">مرحباً بك في عالم المافيا — سجّل دخولك أو أنشئ حساباً جديداً</p>

            <button
              onClick={() => setMode('login')}
              className="w-full py-3.5 rounded-xl font-semibold text-black text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
            >
              تسجيل الدخول
            </button>

            <button
              onClick={() => setMode('register')}
              className="w-full py-3.5 rounded-xl font-semibold text-amber-400 text-sm transition-all border border-amber-500/30 hover:bg-amber-500/10"
            >
              حساب جديد
            </button>
          </motion.div>
        )}

        {/* ── Login ── */}
        {mode === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex flex-col gap-4 relative z-10 w-full max-w-sm"
          >
            <button onClick={() => { setMode('welcome'); setError(''); }} className="text-gray-500 text-sm self-start mb-2">→ رجوع</button>
            <h2 className="text-xl font-bold text-white">تسجيل الدخول</h2>

            <input
              type="tel"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
              dir="ltr"
            />
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
              dir="ltr"
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-black text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
            >
              {loading ? 'جاري الدخول...' : 'دخول'}
            </button>
          </motion.div>
        )}

        {/* ── Register ── */}
        {mode === 'register' && (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex flex-col gap-3 relative z-10 w-full max-w-sm"
          >
            <button onClick={() => { setMode('welcome'); setError(''); }} className="text-gray-500 text-sm self-start mb-1">→ رجوع</button>
            <h2 className="text-xl font-bold text-white">حساب جديد</h2>

            <input
              type="text"
              placeholder="الاسم الكامل"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
            />
            <input
              type="tel"
              placeholder="رقم الهاتف"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
              dir="ltr"
            />
            <input
              type="password"
              placeholder="كلمة المرور (4 أحرف على الأقل)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
              dir="ltr"
            />

            {/* اختيار الجنس */}
            <div className="flex gap-3">
              <button
                onClick={() => setGender('MALE')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  gender === 'MALE'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                    : 'bg-white/5 border-white/10 text-gray-500'
                }`}
              >
                ♂ ذكر
              </button>
              <button
                onClick={() => setGender('FEMALE')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  gender === 'FEMALE'
                    ? 'bg-pink-500/20 border-pink-500/50 text-pink-400'
                    : 'bg-white/5 border-white/10 text-gray-500'
                }`}
              >
                ♀ أنثى
              </button>
            </div>

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-black text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
            >
              {loading ? 'جاري الإنشاء...' : 'إنشاء حساب'}
            </button>
          </motion.div>
        )}

        {/* ── Change Password ── */}
        {mode === 'change_password' && (
          <motion.div
            key="change"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-4 relative z-10 w-full max-w-sm"
          >
            <h2 className="text-xl font-bold text-white">تغيير كلمة المرور</h2>
            <p className="text-gray-500 text-sm">يجب تغيير كلمة المرور الافتراضية قبل المتابعة</p>

            <input
              type="password"
              placeholder="كلمة المرور الجديدة"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-600 text-sm focus:border-amber-500/50 outline-none"
              dir="ltr"
              onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <button
              onClick={handleChangePassword}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-black text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
            >
              {loading ? 'جاري التحديث...' : 'تحديث وإدخال'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── تنبيه المكافأة الترحيبية ── */}
      <AnimatePresence>
        {welcomeBonus.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 z-[200] flex items-center justify-center px-4"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: 'spring', damping: 15, stiffness: 200 }}
              className="w-full max-w-sm rounded-2xl p-8 text-center relative overflow-hidden"
              style={{ background: '#111', border: '1px solid rgba(251,191,36,0.3)' }}
            >
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fbbf24, transparent)' }} />
              </div>
              <div className="relative z-10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="text-6xl mb-4"
                >
                  🎁
                </motion.div>
                <h3 className="text-xl font-bold text-white mb-2">مكافأة ترحيبية!</h3>
                <p className="text-gray-400 text-sm mb-1">مرحباً بك في نادي المافيا</p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-3xl font-bold mb-4"
                  style={{ color: '#fbbf24' }}
                >
                  +{welcomeBonus.amount} XP ✨
                </motion.p>
                <p className="text-gray-500 text-xs mb-6">حصلت على نقاط ترحيبية — استمتع باللعب!</p>
                <button
                  onClick={() => {
                    setWelcomeBonus({ show: false, amount: 0, playerData: null, token: '' });
                    setPlayer({
                      playerId: welcomeBonus.playerData.id,
                      name: welcomeBonus.playerData.name,
                      phone: welcomeBonus.playerData.phone,
                      token: welcomeBonus.token,
                    });
                  }}
                  className="w-full py-3 rounded-xl font-semibold text-black text-sm"
                  style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                >
                  يلا نبدأ! 🎮
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
