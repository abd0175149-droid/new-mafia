'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

export default function LeaderLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/leader/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('leader_token', data.token);
        localStorage.setItem('leader_name', data.displayName);
        router.push('/');
      } else {
        setError(data.error || 'فشل تسجيل الدخول');
      }
    } catch (err) {
      setError('خطأ في الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="display-bg flex items-center justify-center p-8 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="noir-card p-12 max-w-lg w-full border-[#C5A059]/20 relative"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#C5A059] to-transparent opacity-50" />

        <div className="text-center mb-10 border-b border-[#2a2a2a] pb-8">
          <div className="text-6xl mb-4 grayscale opacity-80">⚖️</div>
          <h1 className="text-3xl font-black mb-2 text-white" style={{ fontFamily: 'Amiri, serif' }}>وصول القائد</h1>
          <p className="text-[#808080] text-xs font-mono tracking-[0.2em] uppercase">RESTRICTED ACCESS AREA</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase">Admin ID</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="DIRECTOR"
              className="w-full p-4 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono text-xl tracking-widest focus:border-[#C5A059] focus:outline-none transition-colors placeholder-dark-800"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#808080] mb-2 tracking-widest uppercase">Clearance Code</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-4 bg-[#050505] border border-[#2a2a2a] text-white text-center font-mono text-xl focus:border-[#C5A059] focus:outline-none transition-colors placeholder-dark-800"
              required
            />
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[#8A0303] text-xs font-mono text-center tracking-widest uppercase bg-[#8A0303]/10 p-3"
            >
              ACCESS DENIED: {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn-premium w-full mt-4 disabled:opacity-50 !border-[#C5A059]/40"
          >
            <span className="text-white">{loading ? 'AUTHENTICATING...' : 'AUTHORIZE'}</span>
          </button>
        </form>

        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/')}
            className="text-[#555] text-xs font-mono uppercase tracking-widest hover:text-[#C5A059] transition-colors"
          >
            [ ABORT LOG_IN ]
          </button>
        </div>
      </motion.div>
    </div>
  );
}
