'use client';

// ══════════════════════════════════════════════════════
// 📨 مودال دعوة اللاعبين لغرفةٍ بعيدة — تبويبان: الأصدقاء (المتابَعون) و الجميع (بحث).
// «الجميع» يبحث بالاسم جزئيّاً أو برقم الهاتف تامّاً (لا تخمين). الإرسال عبر room:invite-player.
// ══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlayer } from '@/context/PlayerContext';

interface InviteModalProps {
  roomId: string;
  emit: (event: string, data?: any) => Promise<any>;
  onClose: () => void;
}

interface PlayerRow { id: number; name: string; avatarUrl?: string | null; }

export default function InviteModal({ roomId, emit, onClose }: InviteModalProps) {
  const { player } = usePlayer();
  const token = player?.token || (typeof window !== 'undefined' ? localStorage.getItem('mafia_player_token') : '') || '';
  const myId = player?.playerId;
  const authHeaders: Record<string, string> | undefined = token ? { Authorization: `Bearer ${token}` } : undefined;

  const [tab, setTab] = useState<'friends' | 'all'>('friends');
  const [friends, setFriends] = useState<PlayerRow[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [allResults, setAllResults] = useState<PlayerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Record<number, 'sending' | 'sent' | 'error'>>({});
  const [toast, setToast] = useState('');

  // ── منع تمرير الخلفية أثناء فتح المودال ──
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── جلب المتابَعين (تبويب الأصدقاء) مرّة واحدة ──
  useEffect(() => {
    if (friendsLoaded) return;
    if (!myId) { setFriendsLoaded(true); return; } // غير مسجَّل → لا تعليق على «جارٍ التحميل»
    (async () => {
      try {
        const res = await fetch(`/api/player-app/${myId}/following`, { headers: authHeaders });
        const data = await res.json();
        if (data?.success) setFriends((data.following || []).map((f: any) => ({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })));
      } catch { /* تجاهل */ }
      finally { setFriendsLoaded(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, friendsLoaded]);

  // ── بحث «الجميع» — منقّط (بالاسم جزئيّاً أو رقم الهاتف تامّاً؛ الخادم يفرض التمييز) ──
  const debRef = useRef<any>(null);
  useEffect(() => {
    if (tab !== 'all') return;
    const term = q.trim();
    if (term.length < 2) { setAllResults([]); setSearching(false); return; }
    setSearching(true);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/player-app/search?q=${encodeURIComponent(term)}`, { headers: authHeaders });
        const data = await res.json();
        setAllResults(data?.success ? (data.results || []) : []);
      } catch { setAllResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(debRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab]);

  const invite = useCallback(async (p: PlayerRow) => {
    setSentIds(prev => ({ ...prev, [p.id]: 'sending' }));
    try {
      const res = await emit('room:invite-player', { roomId, inviteePlayerId: p.id });
      if (res?.success) {
        setSentIds(prev => ({ ...prev, [p.id]: 'sent' }));
        setToast(`تم إرسال الدعوة إلى ${p.name}`);
      } else {
        setSentIds(prev => ({ ...prev, [p.id]: 'error' }));
        setToast(res?.error || 'تعذّر إرسال الدعوة');
      }
    } catch (e: any) {
      setSentIds(prev => ({ ...prev, [p.id]: 'error' }));
      setToast(e?.message || 'تعذّر إرسال الدعوة');
    }
    setTimeout(() => setToast(''), 2500);
  }, [emit, roomId]);

  const friendsFiltered = q.trim() ? friends.filter(f => f.name.includes(q.trim())) : friends;
  const rows = tab === 'friends' ? friendsFiltered : allResults;

  return (
    <div dir="rtl" className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0a0a0a] border border-sky-500/30 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* الرأس */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div className="text-sky-300 font-black text-lg" style={{ fontFamily: 'Amiri, serif' }}>📨 إرسال دعوة</div>
          <button onClick={onClose} className="text-[#888] hover:text-white text-xl w-8 h-8 leading-none">✕</button>
        </div>
        {/* التبويبات */}
        <div className="flex gap-2 p-3">
          <button onClick={() => setTab('friends')} className={`flex-1 py-2 rounded-lg text-sm border transition ${tab === 'friends' ? 'bg-sky-500/15 border-sky-600 text-sky-300' : 'border-[#222] text-[#888]'}`}>الأصدقاء</button>
          <button onClick={() => setTab('all')} className={`flex-1 py-2 rounded-lg text-sm border transition ${tab === 'all' ? 'bg-sky-500/15 border-sky-600 text-sky-300' : 'border-[#222] text-[#888]'}`}>الجميع</button>
        </div>
        {/* البحث */}
        <div className="px-3 pb-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={tab === 'all' ? 'ابحث بالاسم أو برقم الهاتف كاملاً' : 'ابحث في أصدقائك بالاسم'}
            className="w-full bg-[#050505] border border-[#222] rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-sky-500"
          />
          {tab === 'all' && <div className="text-[9px] text-[#666] mt-1">رقم الهاتف يُظهر اللاعب فقط عند كتابته كاملاً وصحيحاً.</div>}
        </div>
        {/* النتائج */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {tab === 'all' && q.trim().length < 2 ? (
            <div className="text-center text-[#666] text-xs py-8">اكتب اسماً أو رقم هاتف للبحث…</div>
          ) : searching ? (
            <div className="text-center text-[#666] text-xs py-8">جارٍ البحث…</div>
          ) : rows.length === 0 ? (
            <div className="text-center text-[#666] text-xs py-8">{tab === 'friends' ? (friendsLoaded ? 'لا أصدقاء بعد' : 'جارٍ التحميل…') : 'لا نتائج'}</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows.map(p => {
                const st = sentIds[p.id];
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl bg-[#111] border border-[#1a1a1a]">
                    <img
                      src={p.avatarUrl || '/avatars/male.png'}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover bg-[#222] shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/avatars/male.png'; }}
                    />
                    <div className="flex-1 text-white text-sm truncate">{p.name}</div>
                    <button
                      onClick={() => invite(p)}
                      disabled={st === 'sending' || st === 'sent'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${st === 'sent' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-600' : st === 'sending' ? 'bg-[#222] text-[#888]' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
                    >
                      {st === 'sent' ? '✓ أُرسلت' : st === 'sending' ? '…' : 'دعوة'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {toast && <div className="mx-3 mb-3 text-center text-xs text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-lg py-2">{toast}</div>}
      </div>
    </div>
  );
}
