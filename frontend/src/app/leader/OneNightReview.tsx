'use client';

// ══════════════════════════════════════════════════════
// 🌙 مراجعةُ الليلة الواحدة — كلُّ لاعبٍ ودورُه ومَن اختار
//
// تحلّ محلّ ستِّ شاشاتِ موافقةٍ متتابعة. الترتيبُ كما طلبه المالك: أصحابُ الأدوار
// الفعليّة أوّلاً بترتيب الطابور القديم (الاغتيالُ ثمّ الأولويّة)، ثمّ مَن لا دورَ
// له — يُعرض اختيارُهم للسياق ولا يُحسب.
//
// 🔴 والقيمةُ التي يعتمدها الموجّه هي المعتمَدة: تعديلُه يعلو اختيارَ اللاعب.
//    ولا يُعدَّل ما لا أثرَ له — تعديلُ اختيارِ عديمِ الدور يوهم بأنّ له أثراً.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';

export interface ReviewRow {
  seat: number;
  seatName: string;
  role: string | null;
  abilityId: string | null;
  abilityAr: string;
  disabled: boolean;
  targetPhysicalId: number | null;
  targetName: string | null;
  editable: boolean;
}

const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا',
  WITCH: 'الساحرة', OLDER_BROTHER: 'الأخ الأكبر', MAFIA_REGULAR: 'مافيا عاديّ',
  SHERIFF: 'الشريف', DOCTOR: 'الطبيب', NURSE: 'الممرّضة', SNIPER: 'القنّاص',
  POLICEWOMAN: 'الشرطيّة', MAYOR: 'العمدة', CITIZEN: 'مواطنٌ صالح',
  YOUNGER_BROTHER: 'الأخ الأصغر', JESTER: 'المهرّج', ASSASSIN: 'السفّاح',
};
const MAFIA = new Set(['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR']);
const NEUTRAL = new Set(['JESTER', 'ASSASSIN']);
const teamColor = (r: string | null) =>
  !r ? '#8d8271' : MAFIA.has(r) ? '#d9636a' : NEUTRAL.has(r) ? '#d7a73f' : '#5db98c';

export default function OneNightReview({ acting, idle, alivePlayers, onApply, busy }: {
  acting: ReviewRow[];
  idle: ReviewRow[];
  alivePlayers: { physicalId: number; name: string }[];
  onApply: (overrides: { seat: number; abilityId: string; targetPhysicalId: number | null }[]) => void;
  busy?: boolean;
}) {
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const sig = acting.map(r => `${r.seat}:${r.abilityId}`).join('|');
  useEffect(() => { setEdits({}); }, [sig]);

  const valueOf = (r: ReviewRow) => {
    const k = `${r.seat}:${r.abilityId}`;
    return k in edits ? edits[k] : r.targetPhysicalId;
  };
  const changed = useMemo(
    () => acting.filter(r => { const k = `${r.seat}:${r.abilityId}`; return k in edits && edits[k] !== r.targetPhysicalId; }).length,
    [acting, edits],
  );

  // 🔴 حاملُ قدرتين يظهر في صفّين — يُعلَّم كي لا يُقرأ صفّاه لاعبَين
  const twice = useMemo(() => {
    const c: Record<number, number> = {};
    for (const r of acting) c[r.seat] = (c[r.seat] || 0) + 1;
    return new Set(Object.entries(c).filter(([, n]) => n > 1).map(([s]) => Number(s)));
  }, [acting]);

  const row = (r: ReviewRow, i: number) => {
    const c = teamColor(r.role);
    const k = `${r.seat}:${r.abilityId}`;
    return (
      <div key={`${k}:${i}`} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border"
        style={{ borderColor: r.editable ? '#333' : '#262626', background: r.editable ? '#1a1a1a' : '#141414' }}>
        <span className="text-[11px] font-mono font-bold w-6 text-center rounded px-1 py-0.5"
          style={{ background: '#222', color: c }}>{r.seat}</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[12.5px] text-white truncate">{r.seatName}</b>
          <small className="block text-[10.5px]" style={{ color: c }}>
            {r.role ? ROLE_AR[r.role] || r.role : '—'}
            {twice.has(r.seat) && r.editable && <span className="text-[#C5A059]"> ✦</span>}
          </small>
        </span>
        <span className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap shrink-0"
          style={r.editable
            ? { background: 'rgba(197,160,89,.14)', color: '#C5A059', border: '1px solid rgba(197,160,89,.3)' }
            : { background: '#1f1f1f', color: '#666', border: '1px solid #2b2b2b' }}>
          {r.abilityAr}
        </span>
        {r.disabled && (
          <span className="text-[9.5px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap shrink-0"
            style={{ background: 'rgba(147,51,234,.16)', color: '#c084fc', border: '1px solid rgba(147,51,234,.3)' }}>
            معطَّل
          </span>
        )}
        <select
          value={valueOf(r) ?? ''}
          disabled={!r.editable}
          title={r.editable ? undefined : 'اختيارٌ بلا أثر — يُعرض للسياق ولا يُعدَّل'}
          onChange={e => setEdits(p => ({ ...p, [k]: e.target.value ? Number(e.target.value) : null }))}
          className="text-[11px] bg-black border rounded p-1 text-white w-[120px] shrink-0 disabled:opacity-50"
          style={{ borderColor: r.editable ? '#444' : '#2b2b2b' }}>
          <option value="">— لا أحد —</option>
          {alivePlayers.map(p => (
            <option key={p.physicalId} value={p.physicalId}>#{p.physicalId} {p.name}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center gap-2 flex-wrap">
        <b className="text-[13px] text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>مراجعةُ الليلة</b>
        <span className="text-[10.5px] text-[#777]">{acting.length} فعلاً · {idle.length} بلا دور</span>
        {changed > 0 && (
          <span className="text-[10px] font-bold rounded px-2 py-0.5 mr-auto"
            style={{ background: 'rgba(197,160,89,.15)', color: '#C5A059' }}>
            عدّلتَ {changed}
          </span>
        )}
      </div>

      <div>
        <p className="text-[10.5px] text-[#888] mb-1.5">أصحابُ الأدوار — بترتيب الحساب</p>
        <div className="space-y-1.5">{acting.map(row)}</div>
      </div>

      {idle.length > 0 && (
        <div>
          <p className="text-[10.5px] text-[#666] mb-1.5">بلا دورٍ هذه الليلة — تُعرض ولا تُحسب</p>
          <div className="space-y-1.5">{idle.map(row)}</div>
        </div>
      )}

      {twice.size > 0 && (
        <p className="text-[10.5px] text-[#C5A059] leading-relaxed">
          ✦ مقعدٌ يحمل قدرتين — يظهر في صفّين، صفٌّ لكلّ قدرة.
        </p>
      )}

      <button
        disabled={busy}
        onClick={() => onApply(
          acting.filter(r => r.abilityId)
            .map(r => ({ seat: r.seat, abilityId: r.abilityId as string, targetPhysicalId: valueOf(r) })),
        )}
        className="w-full py-2.5 bg-[#C5A059] text-black font-bold text-sm rounded hover:bg-[#d4af63] transition disabled:opacity-50">
        {busy ? 'يُحسب…' : 'اعتمِدْ واحسبِ الليلة'}
      </button>
    </div>
  );
}
