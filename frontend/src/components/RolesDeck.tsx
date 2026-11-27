'use client';

// ══════════════════════════════════════════════════════
// 🃏 دليلُ الأدوار — بلغة شاشة اللاعب الجديدة (2026-11-27، اعتمده المالك)
//
// 🔴 القراءةُ كانت الشكوى: النصّ الطويل كان تجوال ٣٠٠ بحجم ١٣٫٥ على الداكن فيذوب،
//    ونصفُ النصوص تحت ١٢٫٥، والنصّ محبوسٌ في صندوقٍ يُمرَّر داخل ورقةٍ تُمرَّر.
//    الآن: تجوال ٥٠٠ بحجم ١٦ والعناوين أميري، وتمريرٌ واحد للورقة كلّها، وكلُّ زرٍّ ٤٤.
//
// 🔴 وجهُ الكارت هو **الملفّ نفسه** الذي يراه اللاعب حين يقلب بطاقته في اللعبة.
//    ويُطلَب **المصغَّر** لا الأصل (٧٢٠بك ~٦٠ك.ب بدل ~٢م.ب)، والأصلُ للتكبير وحده.
//
// 🔴 قراراتُ المالك المقفلة باقية:
//    • يُفتح على **شيخ المافيا دائماً** لا على دور صاحب الجهاز — نظرةٌ عابرة تكشفه.
//    • لا علامةَ لدورك في أيّ مكان — ولا في شريط القفز.
//    • بعد بدء اللعبة تُعرض أدوارُ هذه الطاولة وحدها، والقائمةُ من الخادم.
//    • الكارتُ الحقيقيّ مع شريط قفزٍ (رقاقةٌ لكلّ دور بصورته).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './roles-deck.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const MEDIA_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_URL || '';

export interface RoleLimit { text: string; auto: boolean }
export interface GuideRole {
  id: string; nameAr: string; nameEn: string; team: 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
  genPriority: number;
  oneLiner: string | null;
  howItWorks: string | null;
  limits: RoleLimit[];
  tips: string[];
  interactsWith: string[];
  phaseNotes: Record<string, string>;
  actsIn: string[];
  winConditionDescription: string | null;
  face: { url: string; thumbUrl?: string; thumbSmUrl?: string } | null;
}

type Team = 'MAFIA' | 'CITIZEN' | 'NEUTRAL';
const TEAMS: Record<Team, { ar: string; one: string; c: string }> = {
  MAFIA: { ar: 'المافيا', one: 'فريق المافيا', c: '#d9636a' },
  CITIZEN: { ar: 'المواطنون', one: 'فريق المواطنين', c: '#5db98c' },
  NEUTRAL: { ar: 'المستقلّون', one: 'مستقلّ', c: '#d7a73f' },
};

const FALLBACK_ICON: Record<string, string> = {
  GODFATHER: '🎩', SILENCER: '🤫', CHAMELEON: '🦎', WITCH: '🧙‍♀️',
  OLDER_BROTHER: '👴', MAFIA_REGULAR: '🔪', SHERIFF: '🕵️', DOCTOR: '🩺',
  NURSE: '💉', SNIPER: '🎯', POLICEWOMAN: '👮‍♀️', MAYOR: '🏛️',
  YOUNGER_BROTHER: '👦', CITIZEN: '👤', JESTER: '🃏', ASSASSIN: '🗡️',
};

/** متى يعمل الدور — من `actsIn`. الوسمُ الكاذب أسوأ من غيابه، فلا شيء يُستنتج هنا. */
const ACT_AR: Record<string, string> = { night: 'ليلاً', voting: 'في التصويت', justification: 'في التبرير', dead: 'بعد إقصائه' };

/**
 * أسماءُ الأدوار كما تُكتب في نصوص «يتقاطع مع» — لتصير الإشارةُ رقاقةً تنقل إلى الدور.
 * 🔴 تُطابَق بعد نزع الحركات والشدّة («القنّاصُ» = «القناص»)، وبحدودِ كلمة: «مواطناً»
 *    لا تطابق «مواطن صالح».
 */
const ALIAS: Record<string, string[]> = {
  GODFATHER: ['شيخ المافيا', 'الشيخ'], SILENCER: ['قص المافيا', 'القص'], CHAMELEON: ['حرباية المافيا', 'الحرباية', 'الحرباء'],
  WITCH: ['الساحرة'], OLDER_BROTHER: ['الأخ الأكبر'], YOUNGER_BROTHER: ['الأخ الأصغر'], MAFIA_REGULAR: ['مافيا عادي'],
  SHERIFF: ['الشريف'], DOCTOR: ['الطبيب'], NURSE: ['الممرضة'], SNIPER: ['القناص'], POLICEWOMAN: ['الشرطية'],
  MAYOR: ['العمدة'], PHOENIX: ['العنقاء'], JESTER: ['المهرج'], ASSASSIN: ['السفاح'], CITIZEN: ['مواطن صالح', 'المواطن الصالح'],
};
const norm = (s: string) => s.replace(/[ً-ْـ]/g, '');
const isAr = (ch?: string) => !!ch && /[ء-ي]/.test(ch);
function firstMention(text: string, selfId: string): string | null {
  const t = norm(text);
  let best: { id: string; at: number } | null = null;
  for (const [id, names] of Object.entries(ALIAS)) {
    if (id === selfId) continue;
    for (const n of names) {
      let at = t.indexOf(n);
      while (at >= 0 && (isAr(t[at - 1]) || isAr(t[at + n.length]))) at = t.indexOf(n, at + 1);
      if (at >= 0 && (!best || at < best.at)) best = { id, at };
    }
  }
  return best?.id ?? null;
}

const abs = (rel?: string | null) =>
  !rel ? null : (/^https?:\/\//i.test(rel) ? rel : `${MEDIA_URL}${rel}`);
/** للعرض: المصغَّر، ويعود للأصل إن لم يُولَّد. */
const faceSrc = (f: GuideRole['face']) => abs(f?.thumbUrl || f?.url);
/** للرقائق: الأصغر (٢٥٦بك). */
const faceSm = (f: GuideRole['face']) => abs(f?.thumbSmUrl || f?.thumbUrl || f?.url);
/** للتكبير: **الأصل** — ضغطةٌ صريحة على صورةٍ واحدة، لا ستّةَ عشرَ تلقائيّاً. */
const faceFull = (f: GuideRole['face']) => abs(f?.url || f?.thumbUrl);

// ── أيقوناتٌ خطّيّة (لغة الشاشة الجديدة — لا إيموجي) ──
const P: Record<string, string> = {
  cards: 'M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM6 7 3.6 8a1.5 1.5 0 0 0-.8 2l3.2 7.6M12.5 9.5 14 12l-1.5 2.5L11 12z',
  x: 'M6 6l12 12M18 6 6 18', prev: 'M9 6l6 6-6 6', next: 'M15 6l-6 6 6 6', chevL: 'M15 6l-6 6 6 6',
  zoom: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.5-4.5M11 8.5v5M8.5 11h5',
  night: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', voting: 'M4 12l5 5L20 6', justification: 'M4 6h16v10H9l-5 4z',
  dead: 'M8 21V10a4 4 0 0 1 8 0v11M6 21h12M12 8v5M10 10.5h4',
  how: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01', lim: 'M12 3l8 4v5c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V7z',
  ix: 'M7 7h10l-3-3M17 17H7l3 3', tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
  win: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 21h6M10 17h4v4h-4z',
};
function Ic({ k }: { k: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[k]} />
    </svg>
  );
}

let _cache: GuideRole[] | null = null;
let _inflight: Promise<GuideRole[] | null> | null = null;

/** الدليلُ مرّةً للجلسة — يشترك فيه الدليلُ وزرُّ الدخول (مروحةُ الكروت). */
function loadGuide(): Promise<GuideRole[] | null> {
  if (_cache) return Promise.resolve(_cache);
  if (!_inflight) {
    _inflight = fetch(`${API_URL}/api/game-config/roles-guide`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d?.data) ? (_cache = d.data as GuideRole[]) : null))
      .catch(() => null)
      .finally(() => { _inflight = null; });
  }
  return _inflight;
}

export default function RolesDeck({ open, onClose, roleIds }: {
  open: boolean;
  onClose: () => void;
  /** أدوارُ هذه الطاولة — يُمرَّر بعد بدء اللعبة فقط. `null` ⇒ الكتالوج كاملاً. */
  roleIds?: string[] | null;
}) {
  const [all, setAll] = useState<GuideRole[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(false);
  const [team, setTeam] = useState<Team>('MAFIA');
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open || _cache) return;
    setLoading(true); setError(false);
    loadGuide().then((d) => { if (d) setAll(d); else setError(true); }).finally(() => setLoading(false));
  }, [open]);

  // أدوارُ الطاولة إن حُدِّدت — والترتيبُ ترتيبُ التوليد لا ترتيبُ الوصول
  const pool = useMemo(() => {
    const list = roleIds && roleIds.length ? all.filter((r) => roleIds.includes(r.id)) : all;
    return [...list].sort((a, b) => a.genPriority - b.genPriority);
  }, [all, roleIds]);
  const inPool = useMemo(() => new Set(pool.map((r) => r.id)), [pool]);
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const teamsPresent = useMemo(() => (['MAFIA', 'CITIZEN', 'NEUTRAL'] as Team[]).filter((t) => pool.some((r) => r.team === t)), [pool]);
  const list = useMemo(() => pool.filter((r) => r.team === team), [pool, team]);

  // 🔴 يُفتح على **شيخ المافيا دائماً** — ثمّ أوّلِ مافيويّ ثمّ أوّلِ ما في القائمة (قد لا يكون في الطاولة)
  const opened = useRef(false);
  useEffect(() => {
    if (!open) { opened.current = false; return; }
    if (opened.current || !pool.length) return;
    opened.current = true;
    const anchor = pool.find((r) => r.id === 'GODFATHER') ?? pool.find((r) => r.team === 'MAFIA') ?? pool[0];
    setTeam(anchor.team);
    setIdx(Math.max(0, pool.filter((r) => r.team === anchor.team).findIndex((r) => r.id === anchor.id)));
    requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
  }, [open, pool]);

  const go = useCallback((d: number) => {
    setIdx((i) => { const n = list.length; return n ? (i + d + n) % n : 0; });
  }, [list.length]);

  const jumpTo = useCallback((id: string) => {
    const r = pool.find((x) => x.id === id);
    if (!r) return;
    setTeam(r.team);
    setIdx(pool.filter((x) => x.team === r.team).findIndex((x) => x.id === id));
  }, [pool]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // 🔴 التكبيرُ يُغلق أوّلاً: Escape يُنهي الطبقة العليا لا الشاشة كلَّها
      if (e.key === 'Escape') { if (zoom) setZoom(null); else onClose(); return; }
      if (e.key === 'ArrowRight') go(-1);
      if (e.key === 'ArrowLeft') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, go, zoom]);

  // دورٌ جديد ⇒ رأسُ النصّ، والرقاقةُ الجارية في وسط الشريط
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const strip = stripRef.current;
    const on = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (strip && on) {
      // 🔴 بالمستطيلات لا بـ offsetLeft: اتّجاهُ RTL يقلب إشارة scrollLeft بين المتصفّحات
      const a = on.getBoundingClientRect(), s = strip.getBoundingClientRect();
      strip.scrollBy({ left: (a.left + a.width / 2) - (s.left + s.width / 2) });
    }
  }, [idx, team, open]);

  useEffect(() => { if (!open) setZoom(null); }, [open]);

  // ══════════════════════════════════════════════════
  // 🔒 قفلُ السكرول خلف اللوحة — `position: fixed` على الجسم يقفز بالصفحة إلى أعلاها ما لم
  //    نحفظ الموضع ونُعِده. و`modal-open` هو العرفُ القائم — يُطفئ «اسحب لتحديث» أيضاً.
  // ══════════════════════════════════════════════════
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${y}px`;
    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      window.scrollTo(0, y);
    };
  }, [open]);

  if (!open) return null;

  const i = Math.min(idx, Math.max(0, list.length - 1));
  const cur = list[i];
  const tc = cur ? TEAMS[cur.team] : null;

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    // 🔴 الأفقيُّ وحده يُبدّل: سحبةٌ مائلةٌ أثناء التمرير الرأسيّ كانت تقلب كارتاً
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx > 0 ? -1 : 1);
  };

  const Lines = ({ items }: { items: string[] }) => (
    <ul>{items.map((t, k) => <li key={k}><i /><span>{t}</span></li>)}</ul>
  );

  return (
    <div className="rd-root">
      <div className="rd-scrim" onClick={onClose} />
      <div className="rd-sheet" role="dialog" aria-modal="true" aria-labelledby="rd-title">
        <div className="rd-grab" />
        <div className="rd-hd">
          <Ic k="cards" />
          <div className="rd-tt">
            <h4 id="rd-title">دليل الأدوار</h4>
            {cur && tc && <small>{tc.ar} · <b>{i + 1}</b> من <b>{list.length}</b></small>}
          </div>
          {roleIds && roleIds.length ? <span className="rd-badge">أدوار هذه الطاولة</span> : null}
          <button ref={closeRef} type="button" className="rd-x" onClick={onClose} aria-label="إغلاق الدليل"><Ic k="x" /></button>
        </div>

        {teamsPresent.length > 1 && (
          <div className="rd-teams" role="tablist" aria-label="الفرق">
            {teamsPresent.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={team === t} onClick={() => { setTeam(t); setIdx(0); }}>
                <i style={{ background: TEAMS[t].c }} />{TEAMS[t].ar}<em>{pool.filter((r) => r.team === t).length}</em>
              </button>
            ))}
          </div>
        )}

        {loading && <div className="rd-state"><div className="rd-spin" /></div>}
        {!loading && error && <div className="rd-state"><p>تعذّر تحميل الأدوار. تحقّق من الاتّصال وأعد فتح الدليل.</p></div>}
        {!loading && !error && !cur && <div className="rd-state"><p>لا أدوارَ لعرضها.</p></div>}

        {!loading && !error && cur && tc && (
          <>
            <div className="rd-body" ref={bodyRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div className="rd-hero">
                <button type="button" className="rd-card" style={{ borderColor: `${tc.c}66`, cursor: cur.face ? 'zoom-in' : 'default' }}
                  aria-label={`تكبير كارت ${cur.nameAr}`}
                  onClick={() => { const z = faceFull(cur.face); if (z) setZoom(z); }}>
                  {faceSrc(cur.face)
                    ? <><img src={faceSrc(cur.face)!} alt={`كارت ${cur.nameAr}`} decoding="async" /><span className="rd-zm"><Ic k="zoom" /></span></>
                    : <span className="rd-fb">{FALLBACK_ICON[cur.id] || '🎭'}</span>}
                </button>
                <div className="rd-who">
                  <span className="rd-tpill" style={{ color: tc.c, borderColor: `${tc.c}55`, background: `${tc.c}14` }}>
                    <i style={{ background: tc.c }} />{tc.one}
                  </span>
                  <h3>{cur.nameAr}</h3>
                  {cur.actsIn?.some((k) => ACT_AR[k]) && (
                    <div className="rd-acts" aria-label="متى يعمل">
                      {cur.actsIn.filter((k) => ACT_AR[k]).map((k) => <span key={k}><Ic k={k} />{ACT_AR[k]}</span>)}
                    </div>
                  )}
                </div>
              </div>

              {cur.oneLiner && <p className="rd-one">{cur.oneLiner}</p>}
              {cur.winConditionDescription && (
                <div className="rd-blk rd-win"><h5><Ic k="win" />شرط الفوز</h5><p>{cur.winConditionDescription}</p></div>
              )}
              {cur.howItWorks && <div className="rd-blk"><h5><Ic k="how" />كيف يعمل</h5><p>{cur.howItWorks}</p></div>}
              {cur.limits.length > 0 && <div className="rd-blk"><h5><Ic k="lim" />القيود</h5><Lines items={cur.limits.map((l) => l.text)} /></div>}
              {cur.interactsWith.length > 0 && (
                <div className="rd-blk"><h5><Ic k="ix" />يتقاطع مع</h5>
                  <div className="rd-ix">
                    {cur.interactsWith.map((tx, k) => {
                      const mid = firstMention(tx, cur.id);
                      const m = mid ? byId.get(mid) : null;
                      const ok = !!m && inPool.has(m.id);
                      return (
                        <div key={k}>
                          {m && (
                            <button type="button" className="rd-men" disabled={!ok} onClick={() => jumpTo(m.id)}
                              title={ok ? undefined : 'ليس في هذه الطاولة'}>
                              {faceSm(m.face) && <img src={faceSm(m.face)!} alt="" loading="lazy" />}{m.nameAr}{ok && <Ic k="chevL" />}
                            </button>
                          )}
                          <p>{tx}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {cur.tips.length > 0 && <div className="rd-blk"><h5><Ic k="tip" />نصائح</h5><Lines items={cur.tips} /></div>}
            </div>

            <div className="rd-ft">
              <button type="button" className="rd-arrow" onClick={() => go(-1)} aria-label="الدور السابق"><Ic k="prev" /></button>
              <div className="rd-strip-w">
                {/* 🔴 لا وسمَ لدورك هنا — الرقاقاتُ متساويةٌ كلُّها */}
                <div className="rd-strip" ref={stripRef} aria-label="القفز إلى دور">
                  {list.map((r, k) => (
                    <button key={r.id} type="button" className="rd-chip" aria-current={k === i} onClick={() => setIdx(k)}>
                      {faceSm(r.face) && <img src={faceSm(r.face)!} alt="" loading="lazy" />}{r.nameAr}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="rd-arrow" onClick={() => go(1)} aria-label="الدور التالي"><Ic k="next" /></button>
            </div>
          </>
        )}
      </div>

      {/* 🔍 التكبير — الصورةُ كاملةً، ضغطةٌ تُغلقها */}
      {zoom && (
        <div className="rd-zoom" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
          <button type="button" className="rd-x" onClick={() => setZoom(null)} aria-label="إغلاق التكبير"><Ic k="x" /></button>
        </div>
      )}
    </div>
  );
}

/**
 * 🃏 زرُّ الدخول في «ملفّي» — بطاقةٌ داكنةٌ بخطٍّ ذهبيّ ومروحةٌ من ثلاثة كروتٍ حقيقيّة.
 * الكروتُ الثلاثة ثابتةٌ للجميع (الشيخ، الشريف، المهرّج) فلا تقول شيئاً عن أحد.
 */
export function RolesGuideEntry({ onOpen }: { onOpen: () => void }) {
  const [guide, setGuide] = useState<GuideRole[] | null>(_cache);
  useEffect(() => { if (!_cache) loadGuide().then((d) => { if (d) setGuide(d); }); }, []);
  const fan = ['GODFATHER', 'SHERIFF', 'JESTER']
    .map((id) => guide?.find((r) => r.id === id))
    .filter((r): r is GuideRole => !!r && !!faceSm(r.face));
  const n = guide?.length ?? 0;
  return (
    <button type="button" className="rd-entry" onClick={onOpen} aria-haspopup="dialog">
      <span className="rd-fan" aria-hidden>{fan.map((r) => <img key={r.id} src={faceSm(r.face)!} alt="" />)}</span>
      <span className="rd-etx">
        <b>دليل الأدوار</b>
        <small>{n ? `${n} دوراً: ` : ''}كيف يعمل كلٌّ منها، وقيوده، ومع من يتقاطع</small>
      </span>
      <Ic k="chevL" />
    </button>
  );
}
