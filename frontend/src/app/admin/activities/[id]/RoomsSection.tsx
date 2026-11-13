'use client';

// ══════════════════════════════════════════════════════
// غرف اللعبة المرتبطة بالنشاط (مع ملخّص الألعاب) + «حضروا بدون حجز»
// ══════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, Flag, Gamepad2, Minus, Play, Plus, Trash2, Tv, UserPlus } from 'lucide-react';
import WhatsAppButton from '@/components/WhatsAppButton';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Badge, Banner, Card, Empty, Field, Pop, Seg, Skel, Tile, type Tone } from '../../whatsapp/wa-ui';
import { apiFetch, enterRoom, fmtTime } from '../components/acts-shared';

// نتيجة المباراة للعرض — تدعم كل الفائزين (مافيا/مواطن/مهرج/سفّاح)؛ "جارية" فقط حين لا فائز
function matchResult(winner: string | null | undefined): { label: string; tone?: Tone } {
  switch (winner) {
    case 'MAFIA':    return { label: 'فازت المافيا', tone: 'danger' };
    case 'CITIZEN':  return { label: 'فاز المواطنون', tone: 'ok' };
    case 'JESTER':   return { label: 'فاز المهرّج', tone: 'gold' };
    case 'ASSASSIN': return { label: 'فاز السفّاح', tone: 'violet' };
    default:         return { label: 'جارية' };
  }
}

const fmtDuration = (s: number) => s > 0 ? `${Math.floor(s / 60)}د ${s % 60}ث` : '—';

export default function RoomsSection({ activityId }: { activityId: number }) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  const [unbookedPlayers, setUnbookedPlayers] = useState<any[]>([]);
  const [showUnbooked, setShowUnbooked] = useState(false);
  const [loadingUnbooked, setLoadingUnbooked] = useState(false);

  const fetchRooms = async () => {
    try {
      const [roomsData, summaryData] = await Promise.all([
        apiFetch(`/api/activities/${activityId}/rooms`),
        apiFetch(`/api/activities/${activityId}/rooms-summary`).catch(() => ({ rooms: [] })),
      ]);
      setRooms(roomsData);
      setSummary(summaryData.rooms || []);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRooms(); }, [activityId]);

  const fetchUnbooked = async () => {
    setLoadingUnbooked(true);
    setShowUnbooked(true);
    try {
      const res = await apiFetch(`/api/activities/${activityId}/unbooked-players`);
      setUnbookedPlayers(res.unbooked || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUnbooked(false);
    }
  };

  const [bookingInProgress, setBookingInProgress] = useState<number[] | 'all' | null>(null);

  const handleAutoBook = async (playersToBook: any[]) => {
    if (!(await swalConfirm(`إنشاء حجز تلقائيّ لـ ${playersToBook.length} لاعب؟`))) return;

    setBookingInProgress(playersToBook.length > 1 ? 'all' : [playersToBook[0].player_id || playersToBook[0].player_name]);
    try {
      await apiFetch(`/api/activities/${activityId}/auto-book`, {
        method: 'POST',
        body: JSON.stringify({ players: playersToBook })
      });
      swalToast('تم التسجيل بنجاح', 'success');
      fetchUnbooked(); // إعادة التحديث
    } catch (err: any) {
      swalToast('فشل التسجيل: ' + err.message, 'error');
    } finally {
      setBookingInProgress(null);
    }
  };

  const [showAddRoomForm, setShowAddRoomForm] = useState(false);
  const [newRoomMaxPenalties, setNewRoomMaxPenalties] = useState(3);
  const [newRoomPenaltyScope, setNewRoomPenaltyScope] = useState<'room' | 'game'>('room');

  const handleAddRoom = async () => {
    setAdding(true);
    try {
      // ⚠️ الخادم يتجاهل maxPenalties/penaltyScope حاليّاً — تبقيان في الكائن المحلّيّ
      //    وتنتقلان إلى غرفة القائد عبر sessionStorage (سلوك قائم لم يتغيّر).
      const newRoom = await apiFetch(`/api/activities/${activityId}/add-room`, {
        method: 'POST',
        body: JSON.stringify({
          maxPenalties: newRoomMaxPenalties,
          penaltyScope: newRoomPenaltyScope,
        }),
      });
      // إضافة إعدادات العقوبات للكائن المحلي (لتمريرها لـ enterRoom)
      newRoom.maxPenalties = newRoomMaxPenalties;
      newRoom.penaltyScope = newRoomPenaltyScope;
      setRooms(prev => [newRoom, ...prev]);
      setShowAddRoomForm(false);
      fetchRooms();
    } catch (err: any) {
      swalToast('فشل إنشاء الغرفة: ' + err.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRoom = async (sessionId: number) => {
    if (!(await swalConfirm('حذف هذه الغرفة نهائيّاً؟', { danger: true, confirmText: 'احذف' }))) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}`, { method: 'DELETE' });
      setRooms(prev => prev.filter(r => r.id !== sessionId));
      setSummary(prev => prev.filter(r => r.id !== sessionId));
    } catch (err: any) {
      swalToast('فشل الحذف: ' + err.message, 'error');
    }
  };

  const handleCloseRoom = async (sessionId: number) => {
    if (!(await swalConfirm('انتهت الفعاليّة؟ سيتمّ إغلاق هذه الغرفة ولن تظهر للقائد بعد الآن.', { confirmText: 'أغلق الغرفة' }))) return;
    try {
      await apiFetch(`/api/activities/${activityId}/rooms/${sessionId}/close`, { method: 'PATCH' });
      setRooms(prev => prev.map(r => r.id === sessionId ? { ...r, isActive: false, status: 'closed' } : r));
      setSummary(prev => prev.map(r => r.id === sessionId ? { ...r, isActive: false, status: 'closed' } : r));
    } catch (err: any) {
      swalToast('فشل الإغلاق: ' + err.message, 'error');
    }
  };

  const copyCode = (code: string, id: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // دمج بيانات الغرف مع الملخص
  const mergedRooms = rooms.map(r => ({
    ...r,
    ...(summary.find(s => s.id === r.id) || {}),
  }));
  const anyLive = mergedRooms.some(r => r.isActive);

  return (
    <>
      <Card
        title={<><Gamepad2 />غرف اللعبة <Badge>{rooms.length}</Badge></>}
        style={anyLive ? { borderColor: 'var(--ok)' } : undefined}
      >
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          <button type="button" className="wa-btn sm" onClick={() => setShowAddRoomForm(true)}><Plus />غرفة</button>
          <button type="button" className="wa-btn sm" onClick={fetchUnbooked}><AlertTriangle />حضروا بدون حجز</button>
        </div>

        {loading ? (
          <div className="stack"><Skel h={84} /><Skel h={84} /></div>
        ) : mergedRooms.length > 0 ? (
          <div className="stack">
            {mergedRooms.map(room => {
              const stats = room.stats || { totalMatches: 0, mafiaWins: 0, citizenWins: 0, totalDuration: 0 };
              const isExpanded = expandedRoom === room.id;
              return (
                <div key={room.id} className={`acts-room${room.isActive ? ' live' : ''}`}>
                  <div className="acts-roomhead">
                    {room.isActive && <i className="acts-pulse" aria-hidden="true" />}
                    <div className="grow">
                      <b>{room.sessionName}</b>
                      <div className="acts-sub">
                        <span>الرمز <span className="ltr">{room.sessionCode}</span></span>
                        <span>رمز العرض <span className="ltr">{room.displayPin || '—'}</span></span>
                        <Badge tone={room.isActive ? 'ok' : undefined}>{room.isActive ? 'نشطة' : 'مغلقة'}</Badge>
                        {stats.totalMatches > 0 && <span><span className="ltr">{stats.totalMatches}</span> مباراة</span>}
                      </div>
                    </div>
                    <button type="button" className="wa-iconbtn" aria-label="نسخ رمز الغرفة" title="نسخ الرمز" onClick={() => copyCode(room.sessionCode, room.id)}>
                      {copiedId === room.id ? <Check /> : <Copy />}
                    </button>
                  </div>

                  {stats.totalMatches > 0 && (
                    <div className="acts-sub">
                      <span>مافيا <b className="ltr acts-neg">{stats.mafiaWins}</b></span>
                      <span>مواطنون <b className="ltr acts-pos">{stats.citizenWins}</b></span>
                      {stats.totalDuration > 0 && <span>المدّة <span className="ltr">{fmtDuration(stats.totalDuration)}</span></span>}
                    </div>
                  )}

                  <div className="acts-roomacts">
                    {room.isActive && (
                      <button type="button" className="wa-btn send" onClick={() => enterRoom(room, activityId)}><Play />ادخل</button>
                    )}
                    <a className="wa-btn" href={`/display?sessionCode=${room.sessionCode}&pin=${room.displayPin}`} target="_blank" rel="noopener noreferrer"><Tv />العرض</a>
                    {stats.totalMatches > 0 && (
                      <button type="button" className="wa-btn" aria-expanded={isExpanded} onClick={() => setExpandedRoom(isExpanded ? null : room.id)}>
                        الألعاب<ChevronDown className={isExpanded ? 'acts-flip' : undefined} />
                      </button>
                    )}
                    <span className="grow" />
                    {room.isActive && (
                      <button type="button" className="wa-btn danger" title="إغلاق الغرفة نهائيّاً" onClick={() => handleCloseRoom(room.id)}><Flag />انتهت الفعاليّة</button>
                    )}
                    <button type="button" className="wa-iconbtn" aria-label="حذف الغرفة" title="حذف" onClick={() => handleDeleteRoom(room.id)}><Trash2 /></button>
                  </div>

                  {isExpanded && room.matches && room.matches.length > 0 && (
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      {room.matches.map((match: any, mi: number) => {
                        const r = matchResult(match.winner);
                        return (
                          <button key={match.id} type="button" className="acts-match" onClick={() => setSelectedMatch(match)}>
                            <span className="grow">
                              لعبة <span className="ltr">{mi + 1}</span>
                              <small><span className="ltr">{match.playerCount}</span> لاعب · <span className="ltr">{match.totalRounds}</span> جولة · {fmtDuration(match.durationSeconds)}</small>
                            </span>
                            <Badge tone={r.tone}>{r.label}</Badge>
                            {match.endedAt && <span className="ltr muted">{fmtTime(match.endedAt)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={<Gamepad2 />} title="لا غرف لهذا النشاط بعد">أنشئ غرفة ليدخلها القائد ويبدأ اللعب.</Empty>
        )}
      </Card>

      {/* ── غرفة جديدة: إعدادات العقوبات ── */}
      {showAddRoomForm && (
        <Pop title="غرفة جديدة" onClose={() => setShowAddRoomForm(false)}>
          <Field label="الحدّ الأقصى للعقوبات">
            <div className="acts-stepper">
              <button type="button" className="wa-btn" aria-label="أنقص" onClick={() => setNewRoomMaxPenalties(Math.max(1, newRoomMaxPenalties - 1))}><Minus /></button>
              <b>{newRoomMaxPenalties}</b>
              <button type="button" className="wa-btn" aria-label="زِد" onClick={() => setNewRoomMaxPenalties(Math.min(10, newRoomMaxPenalties + 1))}><Plus /></button>
            </div>
          </Field>
          <Field
            label="نطاق العقوبات"
            hint={newRoomPenaltyScope === 'game' ? 'العقوبات تُصفَّر تلقائيّاً عند بدء لعبة جديدة.' : 'العقوبات تستمرّ طوال جلسة الغرفة.'}
          >
            <Seg block label="نطاق العقوبات" value={newRoomPenaltyScope} onChange={setNewRoomPenaltyScope}
              options={[['room', 'كامل الغرفة'], ['game', 'كلّ لعبة']] as const} />
          </Field>
          <div className="acts">
            <button type="button" className="wa-btn" onClick={() => setShowAddRoomForm(false)}>إلغاء</button>
            <button type="button" className="wa-btn primary" disabled={adding} onClick={handleAddRoom}>{adding ? 'جارٍ الإنشاء…' : 'أنشئ الغرفة'}</button>
          </div>
        </Pop>
      )}

      {/* ── تفاصيل مباراة ── */}
      {selectedMatch && (
        <Pop title="تفاصيل اللعبة" onClose={() => setSelectedMatch(null)}>
          <Banner tone={(() => { const t = matchResult(selectedMatch.winner).tone; return t === 'gold' ? 'warn' : t === 'ok' || t === 'danger' || t === 'violet' ? t : undefined; })()}>
            <b>{matchResult(selectedMatch.winner).label}</b>
          </Banner>
          <div className="wa-grid3">
            <Tile k="لاعب" v={selectedMatch.playerCount} />
            <Tile k="جولة" v={selectedMatch.totalRounds} />
            <Tile k="المدّة" v={<span style={{ fontSize: 16 }}>{fmtDuration(selectedMatch.durationSeconds)}</span>} />
          </div>
        </Pop>
      )}

      {/* ── حضروا بدون حجز ── */}
      {showUnbooked && (
        <Pop title="حضروا بدون حجز" onClose={() => setShowUnbooked(false)}>
          {loadingUnbooked ? (
            <div className="stack"><Skel h={56} /><Skel h={56} /></div>
          ) : unbookedPlayers.length === 0 ? (
            <Empty icon={<Check />} title="لا أحد بلا حجز">كلّ اللاعبين الموجودين في الغرف لهم حجوزات مطابقة.</Empty>
          ) : (
            <>
              <p>هؤلاء اللاعبون مسجَّلون في غرف اللعب لكنّ النظام لم يجد حجوزات تطابقهم.</p>
              <button type="button" className="wa-btn send" disabled={bookingInProgress === 'all'} onClick={() => handleAutoBook(unbookedPlayers)}>
                <UserPlus />{bookingInProgress === 'all' ? 'جارٍ التسجيل…' : `سجّل الكلّ حجزاً (${unbookedPlayers.length})`}
              </button>
              <div className="wa-list">
                {unbookedPlayers.map((p, i) => {
                  const idKey = p.player_id || p.player_name;
                  const isLoad = Array.isArray(bookingInProgress) && bookingInProgress.includes(idKey);
                  return (
                    <div key={i}>
                      <div className="t">
                        <b>{p.player_name}</b>
                        <span className="row"><span className="ltr">{p.phone || '—'}</span><WhatsAppButton phone={p.phone} size={13} /></span>
                      </div>
                      <button type="button" className="wa-btn" disabled={bookingInProgress !== null} onClick={() => handleAutoBook([p])}>
                        {isLoad ? 'جارٍ…' : 'سجّل حجزاً'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Pop>
      )}
    </>
  );
}
