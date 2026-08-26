'use client';

// ══════════════════════════════════════════════════════
// 📋 «مهامّي» — ماذا عليّ في كلّ مرحلة، ومتى يجيء دوري
//
// 🔴 بلا كارتٍ ولا زخرفة (قرارُ المالك): الكارتُ مكانُه زرّ «الأدوار»، وتكرارُه
//    هنا يسرق المساحةَ من السبب الذي فُتحت الشاشةُ لأجله.
//
// 🔴 والفتحُ يُطلَب من الخادم لا يُقرَّر هنا: المُقصى يُردّ من هناك، وكلُّ فتحةٍ
//    تُنبّه الموجّه. إخفاءُ زرٍّ ليس أماناً.
//
// 🔴 و«لك دور» يأتي من `actsIn` لا من وجود نصّ: للطبيب نصٌّ في النقاش وليس له
//    فيه فعل — ووسمٌ كاذب يجعل لاعباً ينتظر دوراً لا يجيء.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { GuideRole } from './RolesDeck';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const TASK_PHASES = [
  { k: 'night', ar: 'الليل', ic: '🌙' },
  { k: 'discussion', ar: 'النقاش', ic: '💬' },
  { k: 'voting', ar: 'التصويت', ic: '🗳️' },
  { k: 'justification', ar: 'التبرير', ic: '⚖️' },
  { k: 'dead', ar: 'إن مِتّ', ic: '☠️' },
] as const;

const TEAMS = {
  MAFIA: { ar: 'المافيا', c: '#d9636a' },
  CITIZEN: { ar: 'المواطنون', c: '#5db98c' },
  NEUTRAL: { ar: 'المستقلّون', c: '#d7a73f' },
} as const;

/** طورُ اللعبة ⇐ مفتاحُ المرحلة في المحتوى. ما لا يُطابِق يسقط على الليل. */
export function phaseKeyOf(gamePhase?: string | null): string {
  switch (gamePhase) {
    case 'NIGHT': return 'night';
    case 'DAY_DISCUSSION': case 'MORNING_RECAP': return 'discussion';
    case 'DAY_VOTING': case 'DAY_TIEBREAKER': case 'DAY_ELIMINATION': return 'voting';
    case 'DAY_JUSTIFICATION': return 'justification';
    default: return 'night';
  }
}

let _cache: GuideRole[] | null = null;

export default function MyTasksPanel({ open, onClose, roleId, gamePhase, isDead, onRequestOpen }: {
  open: boolean;
  onClose: () => void;
  roleId: string | null;
  gamePhase?: string | null;
  isDead?: boolean;
  /**
   * يسأل الخادمَ الإذنَ ويُطلق تنبيهَ الموجّه. يُرجِع رسالةَ منعٍ أو null.
   * 🔴 يُنادى مرّةً عند الفتح لا مع كلّ رسم.
   */
  onRequestOpen?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [roles, setRoles] = useState<GuideRole[]>(_cache || []);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [sel, setSel] = useState<string>(() => phaseKeyOf(gamePhase));

  // المرحلةُ الجارية تتبع اللعبة ما لم يبدّلها اللاعب في هذه الجلسة
  const [pinned, setPinned] = useState(false);
  useEffect(() => { if (!pinned) setSel(phaseKeyOf(gamePhase)); }, [gamePhase, pinned]);
  useEffect(() => { if (!open) { setPinned(false); setBlocked(null); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (_cache) { setRoles(_cache); return; }
    fetch(`${API_URL}/api/game-config/roles-guide`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.data)) { _cache = d.data; setRoles(d.data); } })
      .catch(() => { /* الشاشةُ تعرض ما تملك */ });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setChecking(true);
    (async () => {
      if (!onRequestOpen) { if (alive) { setBlocked(null); setChecking(false); } return; }
      try {
        const r = await onRequestOpen();
        if (!alive) return;
        setBlocked(r.ok ? null : (r.error || 'تعذّر الفتح'));
      } catch {
        if (alive) setBlocked(null);   // فشلُ الشبكة لا يقفل شاشةً على لاعبٍ حيّ
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const role = useMemo(() => roles.find(r => r.id === roleId) || null, [roles, roleId]);

  if (!open) return null;

  const c = role ? TEAMS[role.team].c : '#c5a059';
  const cur = TASK_PHASES.find(p => p.k === sel) || TASK_PHASES[0];
  const curText = role?.phaseNotes?.[cur.k] || '';
  const curActs = !!role?.actsIn?.includes(cur.k);

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" dir="rtl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onClose} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="relative w-full sm:max-w-md h-[92dvh] sm:h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden border border-[#2b2621]"
        style={{ background: '#0a0a0b' }}>

        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#221f1a] shrink-0" style={{ background: '#0d0c0b' }}>
          <span className="text-base">📋</span>
          <b className="text-[15px] flex-1" style={{ fontFamily: 'Amiri, serif', color: '#c5a059' }}>مهامّي</b>
          <button onClick={onClose} aria-label="إغلاق"
            className="w-8 h-8 rounded-lg border border-[#2b2621] text-[#7e7466] hover:text-white grid place-items-center text-sm">✕</button>
        </div>

        {checking ? (
          <div className="flex-1 grid place-items-center">
            <div className="w-8 h-8 border-4 border-[#c5a059] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : blocked || isDead ? (
          <div className="flex-1 grid place-items-center text-center px-8">
            <div>
              <div className="text-4xl mb-3">☠️</div>
              <p className="text-[14px] text-[#cdc3af] leading-relaxed">{blocked || 'انتهت جولتُك — لا تُفتح المهامّ بعد الإقصاء.'}</p>
              <p className="text-[11px] text-[#645c50] mt-3">أُبلِغ الموجّه بمحاولة الفتح.</p>
            </div>
          </div>
        ) : !role ? (
          <div className="flex-1 grid place-items-center text-center px-8">
            <p className="text-[13px] text-[#8d8271]">لم تُوزَّع الأدوار بعد.</p>
          </div>
        ) : (
          <>
            {/* شريطُ الهويّة — بلا كارت */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#221f1a] shrink-0 flex-wrap">
              <span className="text-[10.5px] tracking-[0.12em] font-bold text-[#7e7466]">دورك</span>
              <b className="text-[20px]" style={{ fontFamily: 'Amiri, serif', color: c }}>{role.nameAr}</b>
              <span className="text-[10.5px] font-bold rounded-md px-2 py-0.5 mr-auto"
                style={{ color: c, border: `1px solid ${c}55`, background: `${c}18` }}>
                فريق {TEAMS[role.team].ar}
              </span>
            </div>

            {/* الآن */}
            <div className="mx-4 mt-3 rounded-xl p-3 shrink-0"
              style={{ border: '1px solid rgba(197,160,89,.28)', background: 'rgba(197,160,89,.06)' }}>
              <div className="text-[10px] tracking-[0.12em] font-bold mb-1.5" style={{ color: '#c5a059' }}>
                {cur.ic} {cur.ar} — الآن
              </div>
              <p className="text-[13.5px] leading-[1.8] text-[#efe9dc] font-light">
                {curText || (curActs ? 'لك دورٌ في هذه المرحلة.' : 'لا فعلَ مطلوبٌ منك في هذه المرحلة — راقبْ وأنصت.')}
              </p>
            </div>

            {/* شريطُ المراحل */}
            <div className="flex gap-1.5 px-4 mt-3 overflow-x-auto pb-1 shrink-0">
              {TASK_PHASES.map(p => {
                const on = sel === p.k;
                return (
                  <button key={p.k} onClick={() => { setSel(p.k); setPinned(true); }}
                    className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition"
                    style={on
                      ? { background: '#efe9dc', color: '#0a0a0b', borderColor: '#efe9dc', fontWeight: 700 }
                      : { borderColor: '#2b2621', color: '#8d8271' }}>
                    {p.ic} {p.ar}
                  </button>
                );
              })}
            </div>

            {/* المهامُّ كلُّها */}
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
              <div className="text-[10px] tracking-[0.12em] font-bold text-[#645c50] mb-2">مهامُّك في كلّ مرحلة</div>
              {TASK_PHASES.map(p => {
                const acts = !!role.actsIn?.includes(p.k);
                const txt = role.phaseNotes?.[p.k] || '';
                const on = sel === p.k;
                return (
                  <div key={p.k} className="rounded-xl p-3 mb-2 border"
                    style={on
                      ? { borderColor: 'rgba(197,160,89,.4)', background: 'rgba(197,160,89,.05)' }
                      : { borderColor: '#1f1c18', background: '#111010' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm">{p.ic}</span>
                      <b className="text-[13.5px] text-[#efe9dc]">{p.ar}</b>
                      <span className="text-[9.5px] font-bold rounded-md px-1.5 py-0.5 mr-auto whitespace-nowrap"
                        style={acts
                          ? { background: 'rgba(93,185,140,.14)', color: '#5db98c', border: '1px solid rgba(93,185,140,.3)' }
                          : { background: '#191713', color: '#645c50', border: '1px solid #2b2621' }}>
                        {acts ? 'لك دور' : 'بلا دور'}
                      </span>
                    </div>
                    <p className="text-[12px] leading-[1.8] text-[#b3a996] font-light">
                      {txt || (acts ? 'لك دورٌ في هذه المرحلة.' : 'لا فعلَ مطلوبٌ منك — راقبْ وأنصت.')}
                    </p>
                  </div>
                );
              })}

              {role.limits?.length > 0 && (
                <div className="rounded-xl p-3 border mt-3" style={{ borderColor: '#1f1c18', background: '#111010' }}>
                  <div className="text-[10.5px] tracking-[0.1em] font-bold mb-1.5" style={{ color: '#c5a059' }}>قيودُ قدرتك</div>
                  <ul className="space-y-1">
                    {role.limits.map((l, i) => (
                      <li key={i} className="text-[12px] leading-[1.75] text-[#b3a996] font-light flex gap-1.5">
                        <span className="shrink-0" style={{ color: '#c5a059' }}>—</span><span>{l.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
