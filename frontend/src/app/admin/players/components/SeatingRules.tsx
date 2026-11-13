'use client';

// ══════════════════════════════════════════════════════
// قيود الجلوس — «إدارة قيود اللاعبين (الجلوس الذكي)»
// كانت لوحةً مطويّةً أسفل القائمة؛ صارت تبويباً. المنطقُ والمسارات كما هي:
//   GET/POST/DELETE /api/seating/blocked-pairs · PUT /api/player/:id/profile { genderConstraint }
// ══════════════════════════════════════════════════════

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Armchair, Search, Trash2, X } from 'lucide-react';
import { swalConfirm } from '@/lib/swal';
import { Banner, Empty, Field, Skel } from '../../whatsapp/wa-ui';
import { Avatar } from './PlayerBits';
import { apiFetch } from './shared';

const GENDER_OPTIONS = [
  { value: 'NONE', label: 'لا قيود' },
  { value: 'FORBID_SAME', label: 'ممنوع نفس الجنس' },
  { value: 'FORBID_OPPOSITE', label: 'ممنوع جنس آخر' },
] as const;

export default function SeatingRules({ players, setPlayers, showToast, onLoadPlayers }: {
  players: any[];
  setPlayers: Dispatch<SetStateAction<any[]>>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  onLoadPlayers: (background?: boolean) => void;
}) {
  const [pairs, setPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingGenderId, setUpdatingGenderId] = useState<number | null>(null);

  // ── إضافة لاعب جديد لتهيئة قيوده ──
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalDropdownOpen, setGlobalDropdownOpen] = useState(false);
  const [manuallySelectedPlayerIds, setManuallySelectedPlayerIds] = useState<number[]>([]);

  // ── إضافة أزواج ممنوعة لكل بطاقة ──
  const [partnerSearchMap, setPartnerSearchMap] = useState<Record<number, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  useEffect(() => { loadPairs(); }, []);

  // إغلاق القوائم عند الضغط خارجها
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.pl-ddwrap')) {
        setGlobalDropdownOpen(false);
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadPairs() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/seating/blocked-pairs');
      setPairs(data.pairs || []);
    } catch (err: any) {
      console.warn('Failed to load blocked pairs:', err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── تحديث قيد الجنس ──
  async function handleUpdateGenderConstraint(playerId: number, value: string) {
    setUpdatingGenderId(playerId);
    // تحديث الحالة المحلّيّة فوراً لتفادي الوميض
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: value } : p));
    try {
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: value }),
      });
      showToast('تم تحديث شرط الجنس للاعب بنجاح', 'success');
      onLoadPlayers(true); // تحديث صامت في الخلفيّة للمزامنة
    } catch (err: any) {
      showToast(err.message || 'فشل التحديث', 'error');
      onLoadPlayers(true); // تراجع صامت
    } finally {
      setUpdatingGenderId(null);
    }
  }

  // ── إضافة قيد زوج ممنوع للاعب ──
  async function handleAddPartner(player1Id: number, player2Id: number) {
    try {
      await apiFetch('/api/seating/blocked-pairs', {
        method: 'POST',
        body: JSON.stringify({ player1Id, player2Id, reason: 'قيد مخصص للجلوس متجاورين' }),
      });
      showToast('تم إضافة القيد بنجاح', 'success');
      setPartnerSearchMap(prev => ({ ...prev, [player1Id]: '' }));
      setOpenDropdownId(null);
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل الإضافة', 'error');
    }
  }

  // ── حذف قيد زوج ممنوع ──
  async function handleDeletePair(pairId: number) {
    if (!(await swalConfirm('هل تريد إزالة هذا القيد؟'))) return;
    try {
      await apiFetch(`/api/seating/blocked-pairs/${pairId}`, { method: 'DELETE' });
      setPairs(prev => prev.filter(p => p.id !== pairId));
      showToast('تم إزالة قيد المجاورة', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل الحذف', 'error');
    }
  }

  // ── إزالة كل القيود للاعب ──
  async function handleRemoveAllConstraints(playerId: number) {
    if (!(await swalConfirm('هل تريد إزالة كافة قيود الجوار والجنس لهذا اللاعب؟', { danger: true }))) return;
    try {
      // 1. إزالة قيد الجنس
      await apiFetch(`/api/player/${playerId}/profile`, {
        method: 'PUT',
        body: JSON.stringify({ genderConstraint: 'NONE' }),
      });

      // 2. إزالة كل الأزواج المرتبطة به
      const relatedPairs = pairs.filter(p => p.player1_id === playerId || p.player2_id === playerId);
      for (const pair of relatedPairs) {
        await apiFetch(`/api/seating/blocked-pairs/${pair.id}`, { method: 'DELETE' });
      }

      showToast('تم تنظيف كافة قيود اللاعب', 'success');
      setManuallySelectedPlayerIds(prev => prev.filter(id => id !== playerId));
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, genderConstraint: 'NONE' } : p));
      onLoadPlayers(true);
      loadPairs();
    } catch (err: any) {
      showToast(err.message || 'فشل تنظيف القيود', 'error');
    }
  }

  // ── فلترة اللاعبين ──
  function filterPlayers(query: string, excludeId?: number) {
    const q = query.toLowerCase().trim();
    return players
      .filter(p => {
        if (excludeId && p.id === excludeId) return false;
        if (!q) return true;
        return p.name?.toLowerCase().includes(q) || p.phone?.includes(q);
      })
      .slice(0, 8);
  }

  // ── تجميع البيانات للاعبين الحاصلين على قيود ──
  const playerConstraintsMap = new Map<number, { player: any; blockedPartners: any[]; genderConstraint: string }>();

  // مَن لديه قيد جنس
  players.forEach(p => {
    if (p.genderConstraint && p.genderConstraint !== 'NONE') {
      playerConstraintsMap.set(p.id, { player: p, blockedPartners: [], genderConstraint: p.genderConstraint });
    }
  });

  // مَن لديه أزواج ممنوعة
  pairs.forEach(pair => {
    const p1 = players.find(p => p.id === pair.player1_id) || { id: pair.player1_id, name: pair.player1_name, phone: pair.player1_phone, gender: 'MALE', genderConstraint: 'NONE' };
    const p2 = players.find(p => p.id === pair.player2_id) || { id: pair.player2_id, name: pair.player2_name, phone: pair.player2_phone, gender: 'MALE', genderConstraint: 'NONE' };

    if (!playerConstraintsMap.has(pair.player1_id)) {
      playerConstraintsMap.set(pair.player1_id, { player: p1, blockedPartners: [], genderConstraint: p1.genderConstraint || 'NONE' });
    }
    playerConstraintsMap.get(pair.player1_id)!.blockedPartners.push({
      pairId: pair.id, partnerId: pair.player2_id, partnerName: p2.name, partnerPhone: p2.phone,
    });

    if (!playerConstraintsMap.has(pair.player2_id)) {
      playerConstraintsMap.set(pair.player2_id, { player: p2, blockedPartners: [], genderConstraint: p2.genderConstraint || 'NONE' });
    }
    playerConstraintsMap.get(pair.player2_id)!.blockedPartners.push({
      pairId: pair.id, partnerId: pair.player1_id, partnerName: p1.name, partnerPhone: p1.phone,
    });
  });

  // مَن اختير يدويّاً لبدء التعديل
  manuallySelectedPlayerIds.forEach(id => {
    if (!playerConstraintsMap.has(id)) {
      const p = players.find(x => x.id === id);
      if (p) playerConstraintsMap.set(id, { player: p, blockedPartners: [], genderConstraint: p.genderConstraint || 'NONE' });
    }
  });

  const constrainedPlayers = Array.from(playerConstraintsMap.values());
  const globalResults = filterPlayers(globalSearch);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className={`wa-card pl-seatadd${globalDropdownOpen ? ' open' : ''}`}>
        <div className="grow">
          <b className="pl-seat-title">قيود الجلوس الذكيّ</b>
          <span className="pl-sub">
            قيود الجنس الفرديّة واللاعبون الممنوعة مجاورتهم — <span className="ltr">{constrainedPlayers.length}</span> لاعباً عليهم قيود
          </span>
        </div>
        <div className="pl-ddwrap pl-seatsearch">
          <Field label="أضف لاعباً لتهيئة قيوده" htmlFor="pl-seat-q">
            <div className="wa-search">
              <Search />
              <input
                id="pl-seat-q" className="wa-input" type="text" autoComplete="off"
                value={globalSearch}
                onChange={e => { setGlobalSearch(e.target.value); setGlobalDropdownOpen(true); }}
                onFocus={() => setGlobalDropdownOpen(true)}
                placeholder="اسم أو رقم هاتف"
              />
            </div>
          </Field>
          {globalDropdownOpen && (
            <div className="pl-dd">
              {globalResults.length === 0 ? (
                <p className="pl-dd-empty">لا توجد نتائج</p>
              ) : globalResults.map(p => (
                <button
                  type="button" key={p.id}
                  onClick={() => {
                    if (!manuallySelectedPlayerIds.includes(p.id)) setManuallySelectedPlayerIds(prev => [...prev, p.id]);
                    setGlobalSearch('');
                    setGlobalDropdownOpen(false);
                  }}
                >
                  <span className="grow trunc">{p.name}</span>
                  <span className="ltr muted">{p.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="pl-seatgrid"><Skel h={220} /><Skel h={220} /><Skel h={220} /></div>
      ) : constrainedPlayers.length === 0 ? (
        <div className="wa-card">
          <Empty icon={<Armchair />} title="لا قيود مخصّصة لأيّ لاعب بعد">ابحث عن لاعب في الأعلى لتعيين قيوده.</Empty>
        </div>
      ) : (
        <div className="pl-seatgrid">
          {constrainedPlayers.map(({ player, blockedPartners, genderConstraint }) => {
            const candidates = filterPlayers(partnerSearchMap[player.id] || '', player.id)
              .filter(p => !blockedPartners.some((bp: any) => bp.partnerId === p.id));
            return (
              <section key={player.id} className={`wa-card pl-seatcard${openDropdownId === player.id ? ' open' : ''}`}>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar p={player} size="sm" />
                  <div className="grow">
                    <b className="pl-seat-name trunc">{player.name}</b>
                    <span className="pl-sub"><span className="ltr">{player.phone}</span> · {player.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}</span>
                  </div>
                  <button type="button" className="wa-iconbtn pl-danger" onClick={() => handleRemoveAllConstraints(player.id)}
                    title="امسح كلّ قيود هذا اللاعب" aria-label={`امسح كلّ قيود ${player.name}`}>
                    <Trash2 />
                  </button>
                </div>

                <div className="wa-field">
                  <label>شرط الجوار مع الجنس</label>
                  <div className="wa-seg block pl-seg3" role="group" aria-label="شرط الجوار مع الجنس">
                    {GENDER_OPTIONS.map(opt => (
                      <button type="button" key={opt.value} aria-pressed={genderConstraint === opt.value}
                        disabled={updatingGenderId === player.id}
                        onClick={() => handleUpdateGenderConstraint(player.id, opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="wa-field grow">
                  <label>ممنوع الجلوس بجانبهم (<span className="ltr">{blockedPartners.length}</span>)</label>
                  {blockedPartners.length === 0 ? (
                    <span className="hint">لا أحد</span>
                  ) : (
                    <div className="pl-partners">
                      {blockedPartners.map((bp: any) => (
                        <div key={bp.pairId} className="pl-partner">
                          <span className="grow trunc">{bp.partnerName}</span>
                          <span className="ltr muted">{bp.partnerPhone}</span>
                          <button type="button" className="wa-iconbtn" onClick={() => handleDeletePair(bp.pairId)}
                            title="احذف هذا القيد" aria-label={`احذف قيد ${bp.partnerName}`}><X /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pl-ddwrap">
                  <div className="wa-search">
                    <Search />
                    <input
                      className="wa-input" type="text" autoComplete="off"
                      aria-label={`امنع جلوس لاعب بجانب ${player.name}`}
                      placeholder="امنع الجلوس بجانب لاعب…"
                      value={partnerSearchMap[player.id] || ''}
                      onChange={e => {
                        setPartnerSearchMap(prev => ({ ...prev, [player.id]: e.target.value }));
                        setOpenDropdownId(player.id);
                      }}
                      onFocus={() => setOpenDropdownId(player.id)}
                    />
                  </div>
                  {openDropdownId === player.id && (
                    <div className="pl-dd">
                      {candidates.length === 0 ? (
                        <p className="pl-dd-empty">لا توجد نتائج</p>
                      ) : candidates.map(p => (
                        <button type="button" key={p.id} onClick={() => handleAddPartner(player.id, p.id)}>
                          <span className="grow trunc">{p.name}</span>
                          <span className="ltr muted">{p.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Banner tone="info">هذه القيود مخصّصة لكلّ لاعب وتُطبَّق تلقائيّاً على كلّ الأنشطة والألعاب عند توزيع المقاعد.</Banner>
    </div>
  );
}
