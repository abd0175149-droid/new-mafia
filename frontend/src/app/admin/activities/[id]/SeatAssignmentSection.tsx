'use client';

// ══════════════════════════════════════════════════════
// توزيع مقاعد النشاط — القالب المرتبط + شرائح الحاجزين + ربط مؤقّت لهذا النشاط
// (نقر شريحة ثم نقر مقعد). يُدمج فوق تثبيت القالب عند إنشاء الروم — لا يمسّ القالب المشترك.
// المنطق كما كان؛ تغيّر الإطار المحيط بالمحرّر وحده.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Hand, Rotate3d, Save, X } from 'lucide-react';
import SeatMap2D from '@/components/SeatMap2D';
import { computeRectLayout, type Numbering, type RectDoor } from '@/lib/rectLayout';
import { checkSeatConflicts, normPhone as normSeatPhone, type PinRef } from '@/lib/seatConflicts';
import { swalConfirm, swalToast } from '@/lib/swal';
import { Badge, Banner, Empty, Skel } from '../../whatsapp/wa-ui';
import { API_URL, apiFetch } from '../components/acts-shared';

// محرّر القاعة ثلاثيّ الأبعاد (نفس مكوّن القالب) — تحميل كسول بلا SSR
const SeatEditor3D = dynamic(() => import('@/components/SeatTemplate3DEditor'), {
  ssr: false,
  loading: () => <div className="acts-loading3d">جارٍ تحميل المشهد ثلاثيّ الأبعاد…</div>,
});

export default function SeatAssignmentSection({ activityId, seatTemplateId, bookings, initialAssignments }: {
  activityId: number; seatTemplateId: number; bookings: any[]; initialAssignments: any[];
}) {
  const [template, setTemplate] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [blockedPairs, setBlockedPairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // تهيئة مرّة وحدة عند التركيب (النشاط محمَّل مسبقاً) — تجنّباً لإعادة التصفير عند إعادة رندر الأب
  const [assignments, setAssignments] = useState<Record<number, PinRef>>(() => {
    const m: Record<number, PinRef> = {};
    (initialAssignments || []).forEach((a: any) => { if (a?.seatNumber != null) m[Number(a.seatNumber)] = { playerId: a.playerId, phone: a.phone, playerName: a.playerName }; });
    return m;
  });
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState(false); // 3D: true=دوران · false=اختيار/تعديل
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [tplRes, pls, bp] = await Promise.all([
          apiFetch(`/api/seat-templates/${seatTemplateId}`),
          apiFetch('/api/player/all').catch(() => []),
          apiFetch('/api/seating/blocked-pairs').catch(() => ({ pairs: [] })),
        ]);
        setTemplate(tplRes.template || tplRes);
        setPlayers(Array.isArray(pls) ? pls : pls.players || []);
        setBlockedPairs(bp.pairs || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [seatTemplateId]);

  const samePerson = (a: any, b: any) =>
    (a?.playerId && (b?.playerId ?? b?.id) && Number(a.playerId) === Number(b.playerId ?? b.id)) ||
    (!!normSeatPhone(a?.phone) && normSeatPhone(a?.phone) === normSeatPhone(b?.phone)) ||
    (!!(a?.playerName) && !!(b?.name || b?.playerName) && String(a.playerName).trim().toLowerCase() === String(b.name || b.playerName).trim().toLowerCase());

  // إثراء الحاجزين بصورة/جنس من قائمة اللاعبين
  const chips = useMemo(() => (bookings || []).map((b: any) => {
    const pl = players.find((p: any) => (b.playerId && p.id === b.playerId) || (b.phone && normSeatPhone(p.phone) === normSeatPhone(b.phone)));
    return {
      key: String(b.id),
      playerId: (b.playerId ?? pl?.id) || undefined,
      phone: b.phone || pl?.phone || '',
      name: b.name || pl?.name || 'ضيف',
      avatarUrl: pl?.avatarUrl || null,
      gender: pl?.gender,
      genderConstraint: pl?.genderConstraint,
      linked: !!(b.playerId || pl),
    };
  }), [bookings, players]);

  const isRect = template?.layoutType === 'rectangle' && template?.layoutConfig?.shape === 'rectangle';
  const layout = useMemo(() => {
    if (!isRect || !template?.layoutConfig) return null;
    const lc = template.layoutConfig;
    const numbering: Numbering = { start: lc.numbering?.start ?? null, direction: lc.numbering?.direction || 'cw' };
    const dz: RectDoor[] = (lc.doors || []).filter((d: any) => d && d.side && typeof d.pos === 'number')
      .map((d: any, i: number) => ({ id: d.id || `d${i}`, side: d.side, pos: d.pos, type: d.type || 'entry' }));
    try { return computeRectLayout(lc.sides, numbering, dz); } catch { return null; }
  }, [isRect, template]);

  const total = isRect ? (layout?.totalChairs || 0) : (template?.totalSeats || 0);
  const reservedTail = Number(template?.reservedTailCount || 0);

  const templatePinBySeat = useMemo(() => {
    const m: Record<number, PinRef> = {};
    (template?.pinnedSeats || []).forEach((p: any) => { if (p?.seatNumber != null) m[Number(p.seatNumber)] = { playerId: p.playerId, phone: p.phone, playerName: p.playerName }; });
    return m;
  }, [template]);

  const seatNumToChairKey = (n: number): string | null => {
    const s = layout?.seats.find((x: any) => x.seatNum === n); return s ? `${s.side}:${s.sideIndex}` : null;
  };
  const assignedByChair = useMemo(() => {
    const m: Record<string, string> = {}; if (!layout) return m;
    Object.entries(assignments).forEach(([seat, v]) => { const k = seatNumToChairKey(Number(seat)); if (k) m[k] = v.playerName || '؟'; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, layout]);
  const pinnedByChair = useMemo(() => {
    const m: Record<string, string> = {}; if (!layout) return m;
    Object.entries(templatePinBySeat).forEach(([seat, v]) => { const k = seatNumToChairKey(Number(seat)); if (k) m[k] = v.playerName || '؟'; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatePinBySeat, layout]);
  const assignedSet = useMemo(() => new Set(Object.keys(assignments).map(Number)), [assignments]);
  const pinnedSet = useMemo(() => new Set(Object.keys(templatePinBySeat).map(Number)), [templatePinBySeat]);

  const seatOfChip = (chip: any): number | null => {
    for (const [seat, v] of Object.entries(assignments)) { if (samePerson(v, chip)) return Number(seat); }
    return null;
  };

  const doAssign = async (seat: number, chip: any) => {
    const occ = new Map<number, PinRef>();
    for (let s = 1; s <= total; s++) { if (s === seat) continue; const eff = assignments[s] || templatePinBySeat[s]; if (eff) occ.set(s, eff); }
    const occupant = assignments[seat];
    if (occupant && !samePerson(occupant, chip)) {
      if (!(await swalConfirm(`المقعد ${seat} مخصَّص لـ«${occupant.playerName}» — استبداله بـ«${chip.name}»؟`))) return;
    }
    const conflicts = checkSeatConflicts({ targetSeat: seat, cand: { playerId: chip.playerId, phone: chip.phone, name: chip.name, gender: chip.gender, genderConstraint: chip.genderConstraint }, occupiedBySeat: occ, players, blockedPairs, total });
    if (conflicts.length > 0) {
      if (!(await swalConfirm(`تعارض مع شروط الجلوس:\n\n${conflicts.map(c => '• ' + c).join('\n')}\n\nتخصيص «${chip.name}» للمقعد ${seat} رغم ذلك؟`))) return;
    }
    setAssignments(prev => {
      const next = { ...prev };
      for (const [s, v] of Object.entries(next)) { if (samePerson(v, chip)) delete next[Number(s)]; } // انقل الشخص من مقعده السابق
      next[seat] = { playerId: chip.playerId, phone: chip.phone || undefined, playerName: chip.name };
      return next;
    });
    setDirty(true); setSelectedChip(null); setSelectedSeat(null);
  };

  const onSeatClick = (n: number | null) => {
    if (n == null) { setSelectedSeat(null); return; }
    if (selectedChip) { const chip = chips.find(c => c.key === selectedChip); if (chip) doAssign(n, chip); return; }
    setSelectedSeat(prev => prev === n ? null : n);
  };
  const unassignSeat = (seat: number) => { setAssignments(prev => { const n = { ...prev }; delete n[seat]; return n; }); setDirty(true); setSelectedSeat(null); };
  const clearAll = async () => { if (!(await swalConfirm('إزالة كل التخصيصات المؤقّتة لهذا النشاط؟'))) return; setAssignments({}); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const arr = Object.entries(assignments).map(([seat, v]) => ({ seatNumber: Number(seat), playerId: v.playerId, phone: v.phone, playerName: v.playerName }));
      await apiFetch(`/api/activities/${activityId}/seat-assignments`, { method: 'PUT', body: JSON.stringify({ seatAssignments: arr }) });
      setDirty(false);
      swalToast('حُفظ توزيع المقاعد — يُطبَّق على الغرف الجديدة', 'success');
    } catch (e: any) { swalToast('فشل الحفظ: ' + (e.message || ''), 'error'); }
    finally { setSaving(false); }
  };

  const selectedSeatOccupant = selectedSeat != null ? (assignments[selectedSeat] || templatePinBySeat[selectedSeat]) : null;
  const selectedSeatIsAssigned = selectedSeat != null && !!assignments[selectedSeat];
  const assignedCount = Object.keys(assignments).length;

  if (loading) return <div className="stack"><Skel h={48} /><Skel h={320} /></div>;
  if (!template) return <div className="wa-card"><Empty title="تعذّر تحميل القالب المرتبط" /></div>;

  return (
    <div className="wa-card stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <b>{template.name}</b>
        <Badge><span className="ltr">{total}</span> مقعد</Badge>
        {assignedCount > 0 && <Badge tone="violet"><span className="ltr">{assignedCount}</span> مخصَّص</Badge>}
        {dirty && <Badge tone="warn">غير محفوظ</Badge>}
      </div>
      <Banner>
        اختر حاجزاً من القائمة ثمّ انقر مقعداً لتثبيته مؤقّتاً لهذا النشاط. الذهبيّ تثبيت القالب الدائم، والبنفسجيّ تخصيص هذا النشاط. يُطبَّق قبل دخول اللاعبين (أو عبر «تحديث المقاعد من القالب» لغرفة مفتوحة فارغة).
      </Banner>

      <div className="acts-seatgrid">
        {/* شرائح الحاجزين */}
        <div className="acts-chips">
          {chips.length === 0 && <p className="muted">لا حجوزات لهذا النشاط بعد.</p>}
          {chips.map(chip => {
            const seat = seatOfChip(chip);
            const sel = selectedChip === chip.key;
            return (
              <div key={chip.key} className={`acts-seatchip${sel ? ' on' : ''}`}>
                <button type="button" className="pick" aria-pressed={sel} onClick={() => setSelectedChip(sel ? null : chip.key)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chip.avatarUrl ? `${API_URL}${chip.avatarUrl}` : '/avatars/male.png'} alt="" onError={e => { (e.target as HTMLImageElement).src = '/avatars/male.png'; }} />
                  <span className="grow">
                    <span className="nm">{chip.name}</span>
                    <span className="ph">{chip.phone || (chip.linked ? '' : 'ضيف')}</span>
                  </span>
                </button>
                {seat != null ? (
                  <>
                    <Badge tone="violet">مقعد <span className="ltr">{seat}</span></Badge>
                    <button type="button" className="wa-iconbtn" aria-label={`إلغاء تخصيص ${chip.name}`} title="إلغاء التخصيص" onClick={() => unassignSeat(seat)}><X /></button>
                  </>
                ) : sel ? (
                  <Badge tone="violet">انقر مقعداً…</Badge>
                ) : null}
              </div>
            );
          })}
          {assignedCount > 0 && (
            <button type="button" className="wa-btn danger" onClick={clearAll}>إزالة كلّ التخصيصات</button>
          )}
        </div>

        {/* النموذج */}
        <div className="stack">
          {isRect && layout ? (
            <div className="acts-stage">
              <button type="button" className="wa-btn sm acts-mode" onClick={() => { setViewMode(v => !v); setSelectedSeat(null); }}>
                {viewMode ? <><Rotate3d />وضع الدوران — اضغط للتعديل</> : <><Hand />وضع التعديل — اضغط للدوران</>}
              </button>
              <div className="acts-legend">
                <span><i style={{ background: 'var(--ok)' }} />فارغ</span>
                <span><i style={{ background: 'var(--gold)' }} />قالب</span>
                <span><i style={{ background: 'var(--violet)' }} />هذا النشاط</span>
                <span><i style={{ background: 'var(--ink-3)' }} />مؤخَّر</span>
                <span><i style={{ background: 'var(--info)' }} />محدَّد</span>
                <span>{viewMode ? 'اسحب للدوران' : 'انقر مقعداً'}</span>
              </div>
              <SeatEditor3D dims={layout.dims} seats={layout.seats} doorNodes={layout.doorNodes}
                pinnedByChair={pinnedByChair} assignedByChair={assignedByChair}
                reservedTailCount={reservedTail} viewMode={viewMode}
                selectedSeat={selectedSeat} selectedDoorId={null}
                onSelectSeat={(n) => onSeatClick(n)} onSelectDoor={() => {}} />
            </div>
          ) : (
            <SeatMap2D total={total} layout={template.layoutType || 'circle'} reservedTailCount={reservedTail}
              pinnedSet={pinnedSet} assignedSet={assignedSet} selectedSeat={selectedSeat} onSelect={onSeatClick} />
          )}

          {/* لوحة المقعد المحدَّد */}
          {selectedSeat != null && !selectedChip && (
            <Banner
              tone="info"
              action={selectedSeatIsAssigned ? 'إلغاء التخصيص' : undefined}
              onAction={() => unassignSeat(selectedSeat)}
            >
              المقعد <span className="ltr">{selectedSeat}</span>
              {selectedSeatOccupant
                ? <> — {selectedSeatIsAssigned ? 'مخصَّص لهذا النشاط' : 'مثبَّت في القالب'}: <b>{selectedSeatOccupant.playerName}</b></>
                : ' — فارغ'}
            </Banner>
          )}

          <button type="button" className="wa-btn send block" onClick={save} disabled={saving || !dirty}>
            <Save />{saving ? 'جارٍ الحفظ…' : dirty ? 'احفظ توزيع المقاعد' : 'محفوظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
