'use client';
// ══════════════════════════════════════════════════════
// 🔮 الموسم القادم — قسمٌ في «إدارة المواسم»
// المسودّة تعيش في جدولٍ مستقلّ (لا رقم ولا مباريات قبل التفعيل)، فلا تظهر في قائمة المواسم.
// هذا القسم يعرضها كاملة: الحالة، والكروت بوجوهها ومفاتيحها، والقصّة، والجاهزيّة، والتفعيل.
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { swalConfirm } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const ar = (x: number | null | undefined) => (x ?? 0).toLocaleString('ar-EG');
const dateAr = (d?: string | null) => (d ? new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

type Team = 'CITIZEN' | 'MAFIA' | 'NEUTRAL';
interface Card {
  role: string; nameAr: string; character: string | null; team: Team; teamLabel: string; entry: string;
  slogan: string; pitch: string; ability: string[]; flipLine: string | null; face: string | null;
  registered: boolean; off: boolean; offBy: string | null; offAt: string | null;
}
interface Chapter { week: number; act: string; title: string; text: string; hall?: string }
interface Overview {
  draft: { id: number; name: string; contentPack: string; createdAt: string; activatedSeasonId: number | null; activatedAt: string | null } | null;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  season: { id: number; name: string; seasonNumber: number; startedAt: string; endedAt: string | null; matches: number } | null;
  current: { id: number; name: string; seasonNumber: number; startedAt: string; matches: number; contentPack: string | null } | null;
  runsIn: 'TEST' | 'EMERGENCY' | 'ALL';
  testLocations: { id: number; name: string }[];
  emergency: boolean;
  week: number | null; weekLine: string | null; weekLines: string[];
  cards: Card[];
  ledger: { total: number; test: number; real: number; truth: number; mask: number; lastAt: string | null };
  checks: { key: string; label: string; ok: boolean; note: string }[];
  trackerUrl: string | null;
  story: {
    motto: string; question: string; teaser: string[];
    characters: { name: string; role: string; slogan: string; text: string; journey: string }[];
    existingCards: { name: string; text: string }[];
    secret: string[]; clues: { week: number; clue: string; meaning: string }[];
    ledgerRules: string[]; endings: { title: string; text: string }[]; chapters: Chapter[];
  } | null;
}

const TEAM_STYLE: Record<Team, string> = {
  CITIZEN: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
  MAFIA: 'border-[#8A0303]/60 text-[#ff6b6b] bg-[#8A0303]/15',
  NEUTRAL: 'border-purple-500/40 text-purple-300 bg-purple-500/10',
};

type Tab = 'cards' | 'story' | 'status' | 'activate';

export default function SeasonDraftPanel({ apiFetch, onChanged }: {
  apiFetch: (path: string, opts?: RequestInit) => Promise<any>;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('cards');
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch('/api/seasons/drafts/overview');
      setData(r); setError('');
    } catch (e: any) { setError(e.data?.error || e.message); } finally { setLoading(false); }
  }, [apiFetch]);
  useEffect(() => { load(); }, [load]);

  async function toggleCard(c: Card) {
    const turnOff = !c.off;
    if (turnOff && !(await swalConfirm(`إطفاء «${c.nameAr}»؟ لن يدخل أيّ توزيعٍ جديد في أيّ غرفة حتّى تعيده. اللعبة الجارية لا تتأثّر.`))) return;
    setBusyRole(c.role); setError('');
    try { await apiFetch(`/api/seasons/drafts/cards/${c.role}`, { method: 'PUT', body: JSON.stringify({ off: turnOff }) }); await load(); }
    catch (e: any) { setError(e.data?.error || e.message); } finally { setBusyRole(null); }
  }

  if (loading && !data) return <div className="mb-6 p-6 rounded-2xl border border-[#2a2a2a] text-center text-[#555] text-sm">جارٍ تحميل الموسم القادم…</div>;
  if (!data?.draft) return error ? <div className="mb-6 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div> : null;

  const d = data.draft;
  const faces = data.cards.filter(c => c.face).length;
  const okChecks = data.checks.filter(c => c.ok).length;
  const tabs: [Tab, string][] = [
    ['cards', `الكروت (${ar(data.cards.length)})`],
    ['story', 'القصّة'],
    ['status', `الجاهزيّة (${ar(okChecks)}/${ar(data.checks.length)})`],
    ...(data.status === 'DRAFT' ? [['activate', 'التفعيل'] as [Tab, string]] : []),
  ];

  return (
    <section id="season-draft" className="mb-6 rounded-2xl border border-[#C5A059]/40 overflow-hidden bg-gradient-to-b from-[#16120a] via-[#0e0c08] to-[#0a0a0a]">
      {/* الرأس: الاسم والحالة وأين يعمل */}
      <div className="p-5 md:p-6 border-b border-[#C5A059]/20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] tracking-widest text-[#9a8a66] mb-1">🔮 {data.status === 'DRAFT' ? 'الموسم القادم' : data.status === 'ACTIVE' ? 'الموسم الحاليّ بمحتواه' : 'موسمٌ سابق بمحتوى'}</p>
            <h2 className="text-3xl md:text-4xl font-black text-[#C5A059] leading-tight" style={{ fontFamily: 'Amiri, serif' }}>{d.name}</h2>
            {data.story?.motto && <p className="text-sm text-[#d8c9a3] mt-1" style={{ fontFamily: 'Amiri, serif' }}>{data.story.motto}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusChip data={data} />
            <button onClick={load} disabled={loading} className="text-[11px] text-[#C5A059] border border-[#C5A059]/40 rounded px-2.5 py-1 hover:bg-[#C5A059]/10 disabled:opacity-50">↻ تحديث</button>
          </div>
        </div>

        <RunsIn data={data} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <Stat label="كروتٌ جديدة" value={ar(data.cards.length)} />
          <Stat label="وجوه الكروت" value={`${ar(faces)} / ${ar(data.cards.length)}`} warn={faces < data.cards.length} />
          <Stat label="مباريات تجربة" value={ar(data.ledger.test)} warn={data.ledger.test === 0} />
          {data.status === 'DRAFT'
            ? <Stat label="سيُنهي عند تفعيله" value={data.current ? `${data.current.name} · ${ar(data.current.matches)} مباراة` : '—'} />
            : <Stat label="مباريات الموسم" value={ar(data.season?.matches)} />}
        </div>
        <p className="text-[11px] text-[#777] mt-3">المسودّة رقم {ar(d.id)} · أُنشئت {dateAr(d.createdAt)}{d.activatedAt ? ` · فُعّلت ${dateAr(d.activatedAt)}` : ''}</p>
      </div>

      {error && <div className="mx-5 mt-4 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      {/* الألسنة */}
      <div className="flex gap-1 px-3 md:px-5 pt-3 overflow-x-auto border-b border-[#2a2a2a]">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 px-3.5 py-2 text-sm rounded-t-lg border-b-2 -mb-px ${tab === k ? 'border-[#C5A059] text-[#C5A059] font-bold' : 'border-transparent text-[#888] hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6">
        {tab === 'cards' && <CardsTab cards={data.cards} busyRole={busyRole} onToggle={toggleCard} />}
        {tab === 'story' && <StoryTab story={data.story} weekLines={data.weekLines} currentWeek={data.week} />}
        {tab === 'status' && <StatusTab data={data} />}
        {tab === 'activate' && data.status === 'DRAFT' && <ActivateTab data={data} apiFetch={apiFetch} onDone={async () => { await load(); onChanged?.(); }} />}
      </div>
    </section>
  );
}

function StatusChip({ data }: { data: Overview }) {
  if (data.status === 'ACTIVE') return <span className="text-xs px-3 py-1 rounded-full border border-green-500/40 bg-green-500/10 text-green-300">● نشط · الأسبوع {ar(data.week)} من ١٣</span>;
  if (data.status === 'ENDED') return <span className="text-xs px-3 py-1 rounded-full border border-[#444] text-[#888]">منتهٍ</span>;
  return <span className="text-xs px-3 py-1 rounded-full border border-amber-500/50 bg-amber-500/10 text-amber-300">◐ مسودّة · لم يُفعَّل</span>;
}

function RunsIn({ data }: { data: Overview }) {
  if (data.runsIn === 'ALL') return (
    <div className="mt-3 text-xs text-green-300/90">الكروت الخمسة تعمل في كلّ الغرف.{data.weekLine && <span className="text-[#d8c9a3]"> سطر افتتاح هذا الأسبوع: {data.weekLine}</span>}</div>
  );
  if (data.runsIn === 'EMERGENCY') return (
    <div className="mt-3 p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-300">⚠️ مفتاح الطوارئ مفتوح: الكروت تعمل في كلّ الغرف رغم أنّ الموسم لم يُفعَّل.</div>
  );
  return (
    <div className="mt-3 text-xs text-[#aaa] leading-relaxed">
      يعمل الآن في <b className="text-[#d8c9a3]">موقع الاختبار وحده</b>{data.testLocations.length ? ` (${data.testLocations.map(l => l.name).join('، ')})` : ''}: افتح غرفةً من القمرة في هذا الموقع لتجربته. الغرف الحقيقيّة لا ترى شيئاً منه حتّى التفعيل.
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${warn ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#2a2a2a] bg-black/30'}`}>
      <p className="text-[10px] text-[#888]">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

// ── الكروت ──
function CardsTab({ cards, busyRole, onToggle }: { cards: Card[]; busyRole: string | null; onToggle: (c: Card) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map(c => (
        <article key={c.role} className={`rounded-2xl border overflow-hidden flex flex-col ${c.off ? 'border-[#333] opacity-70' : 'border-[#2a2a2a]'} bg-[#0f0f14]`}>
          <div className="relative aspect-[2/3] max-h-72 bg-gradient-to-b from-[#1a1712] to-[#0a0a0a] flex items-center justify-center overflow-hidden">
            {c.face
              ? <img src={`${API_URL}${c.face}`} alt={c.nameAr} className="w-full h-full object-cover" loading="lazy" />
              : <div className="text-center px-4"><div className="text-4xl mb-2 opacity-60">🔮</div><p className="text-[11px] text-[#777]">الوجه بانتظار الرسم</p></div>}
            <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border backdrop-blur ${TEAM_STYLE[c.team]}`}>{c.teamLabel}</span>
            {c.off && <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-red-500/50 bg-black/70 text-red-300">مطفأ</span>}
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <h3 className="text-lg font-black text-[#C5A059]" style={{ fontFamily: 'Amiri, serif' }}>
              {c.character ? `${c.character} · ${c.nameAr}` : c.nameAr}
            </h3>
            <p className="text-sm text-[#d8c9a3] mt-0.5" style={{ fontFamily: 'Amiri, serif' }}>{c.slogan}</p>
            <p className="text-[11px] text-[#888] mt-2">🎴 {c.entry}</p>
            <p className="text-xs text-[#bbb] mt-3 leading-relaxed">{c.pitch}</p>
            <ul className="mt-3 space-y-1.5">
              {c.ability.map((a, i) => <li key={i} className="text-xs text-[#ddd] leading-relaxed flex gap-2"><span className="text-[#C5A059] shrink-0">◆</span><span>{a}</span></li>)}
            </ul>
            {c.flipLine && <p className="text-[11px] text-[#999] mt-3 pt-3 border-t border-[#222]">سطر القلب على الشاشة: <span className="text-[#d8c9a3]">{c.flipLine}</span></p>}
            <div className="mt-auto pt-4 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#666]">{c.off && c.offBy ? `أطفأه ${c.offBy}` : c.registered ? '' : '⚠️ غير مسجّل'}</span>
              <button onClick={() => onToggle(c)} disabled={busyRole === c.role}
                className={`text-[11px] rounded-lg px-3 py-1.5 border disabled:opacity-50 ${c.off ? 'border-green-500/50 text-green-300 hover:bg-green-500/10' : 'border-[#8A0303]/50 text-[#ff6b6b] hover:bg-[#8A0303]/10'}`}>
                {busyRole === c.role ? '…' : c.off ? '↺ إعادته للتوزيع' : '⏻ إطفاء هذا الكرت'}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// ── القصّة ──
function StoryTab({ story, weekLines, currentWeek }: { story: Overview['story']; weekLines: string[]; currentWeek: number | null }) {
  const [showSecret, setShowSecret] = useState(false);
  if (!story) return <p className="text-sm text-[#888]">لم تُحفظ قصّة هذا الموسم في القاعدة بعد.</p>;
  const acts: { act: string; chapters: Chapter[] }[] = [];
  for (const ch of story.chapters) {
    const last = acts[acts.length - 1];
    if (last && last.act === ch.act) last.chapters.push(ch); else acts.push({ act: ch.act, chapters: [ch] });
  }
  return (
    <div className="space-y-8">
      {/* النبذة المنشورة */}
      <div className="max-w-3xl">
        <SectionTitle>النبذة · كما تُنشر للّاعبين</SectionTitle>
        <div className="space-y-3 text-[15px] leading-loose text-[#e6dcc4]" style={{ fontFamily: 'Amiri, serif' }}>
          {story.teaser.map((p, i) => <p key={i}>{p}</p>)}
          <p className="text-lg text-[#C5A059] font-bold">{story.question}</p>
        </div>
      </div>

      {/* الشخصيّات */}
      <div>
        <SectionTitle>الشخصيّات</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {story.characters.map(ch => (
            <div key={ch.name} className="p-4 rounded-xl border border-[#2a2a2a] bg-black/30">
              <p className="font-black text-[#C5A059] text-lg" style={{ fontFamily: 'Amiri, serif' }}>{ch.name} <span className="text-xs text-[#888] font-normal" style={{ fontFamily: 'inherit' }}>· {ch.role}</span></p>
              <p className="text-sm text-[#d8c9a3] mt-0.5" style={{ fontFamily: 'Amiri, serif' }}>{ch.slogan}</p>
              <p className="text-xs text-[#bbb] mt-2 leading-relaxed">{ch.text}</p>
              <p className="text-[11px] text-[#888] mt-2">رحلته في الموسم: {ch.journey}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {story.existingCards.map(c => <span key={c.name} className="text-[11px] text-[#aaa] border border-[#2a2a2a] rounded-full px-3 py-1"><b className="text-[#ddd]">{c.name}</b>: {c.text}</span>)}
        </div>
      </div>

      {/* الفصول */}
      <div>
        <SectionTitle>الفصول · ثلاثة عشر أسبوعاً</SectionTitle>
        <p className="text-[11px] text-[#777] mb-4">فصلٌ لكلّ أسبوع، وسطر الافتتاح الذي يقرؤه الموجّه أوّل كلّ لعبة. ما بين معقوفين يُكتب من أحداث الطاولات الحقيقيّة.</p>
        <div className="space-y-6">
          {acts.map(a => (
            <div key={a.act}>
              <p className="text-sm font-bold text-[#C5A059] mb-2">{a.act}</p>
              <div className="space-y-2 border-r-2 border-[#C5A059]/25 pr-4">
                {a.chapters.map(ch => <ChapterRow key={ch.week} ch={ch} line={ch.week >= 1 ? weekLines[ch.week - 1] : null} current={currentWeek === ch.week} />)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* سجلّ المخطوطتين */}
      <div className="max-w-3xl">
        <SectionTitle>سجلّ المخطوطتين · النهاية تكتبها الطاولات</SectionTitle>
        <ul className="space-y-1.5">
          {story.ledgerRules.map((r, i) => <li key={i} className="text-xs text-[#ccc] leading-relaxed flex gap-2"><span className="text-[#C5A059]">◆</span>{r}</li>)}
        </ul>
      </div>

      {/* السرّ والنهايتان — مخفيّان حتّى يُطلبا */}
      <div className="rounded-xl border border-[#8A0303]/40 bg-[#8A0303]/5">
        <button onClick={() => setShowSecret(v => !v)} className="w-full text-right p-4 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-[#ff8a8a]">🤫 سرّ الموسم والنهايتان · لا يُعرض على اللاعبين ولا يُنشر قبل الختام</span>
          <span className="text-xs text-[#888]">{showSecret ? 'إخفاء' : 'إظهار'}</span>
        </button>
        {showSecret && (
          <div className="px-4 pb-5 space-y-5">
            <div className="space-y-2">{story.secret.map((s, i) => <p key={i} className="text-sm text-[#e6dcc4] leading-loose" style={{ fontFamily: 'Amiri, serif' }}>{s}</p>)}</div>
            <div>
              <p className="text-xs font-bold text-[#ddd] mb-2">الخيوط المزروعة على طول الموسم</p>
              <div className="space-y-1.5">
                {story.clues.map(c => (
                  <div key={c.week} className="text-xs grid grid-cols-[auto,1fr] md:grid-cols-[auto,1fr,1fr] gap-x-3 gap-y-0.5 p-2 rounded-lg bg-black/30">
                    <span className="text-[#C5A059] font-bold">الأسبوع {ar(c.week)}</span>
                    <span className="text-[#ccc]">{c.clue}</span>
                    {c.meaning && <span className="text-[#888] col-start-2 md:col-start-3">في الختام: {c.meaning}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {story.endings.map(e => (
                <div key={e.title} className="p-3 rounded-lg border border-[#2a2a2a] bg-black/30">
                  <p className="text-xs font-bold text-[#C5A059] mb-1">{e.title}</p>
                  <p className="text-xs text-[#ccc] leading-relaxed">{e.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChapterRow({ ch, line, current }: { ch: Chapter; line: string | null; current: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border ${current ? 'border-green-500/50 bg-green-500/5' : 'border-[#222] bg-black/20'}`}>
      <button onClick={() => setOpen(v => !v)} className="w-full text-right p-3 flex items-center gap-3">
        <span className="shrink-0 w-14 text-[11px] text-[#888]">الأسبوع {ar(ch.week)}</span>
        <span className="font-bold text-[#e6dcc4]" style={{ fontFamily: 'Amiri, serif' }}>{ch.title}</span>
        {current && <span className="text-[10px] text-green-300">· هذا الأسبوع</span>}
        <span className="flex-1 text-[11px] text-[#9a8a66] truncate hidden md:inline" style={{ fontFamily: 'Amiri, serif' }}>{line}</span>
        <span className="text-[#666] text-xs">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="px-3 pb-4 md:pr-[4.25rem] space-y-2">
          {line && <p className="text-sm text-[#C5A059] md:hidden" style={{ fontFamily: 'Amiri, serif' }}>{line}</p>}
          <p className="text-[15px] text-[#e6dcc4] leading-loose" style={{ fontFamily: 'Amiri, serif' }}>{ch.text}</p>
          {ch.hall && <p className="text-[11px] text-[#999]">في القاعة: {ch.hall}</p>}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-black text-white mb-3" style={{ fontFamily: 'Amiri, serif' }}>{children}</h3>;
}

// ── الجاهزيّة ──
function StatusTab({ data }: { data: Overview }) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <SectionTitle>فحوص الجاهزيّة · محسوبة الآن من القاعدة</SectionTitle>
        <div className="space-y-2">
          {data.checks.map(c => (
            <div key={c.key} className={`flex items-start gap-3 p-3 rounded-xl border ${c.ok ? 'border-green-500/25 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <span className={`text-base ${c.ok ? 'text-green-400' : 'text-amber-300'}`}>{c.ok ? '✓' : '◌'}</span>
              <div className="min-w-0">
                <p className="text-sm text-[#ddd]">{c.label}</p>
                <p className="text-[11px] text-[#888] mt-0.5">{c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>مباريات النبوءة</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="مباريات تجربة" value={ar(data.ledger.test)} />
          <Stat label="مباريات حقيقيّة" value={ar(data.ledger.real)} />
          <Stat label="سطور الصدق" value={ar(data.ledger.truth)} />
          <Stat label="سطور الكذب" value={ar(data.ledger.mask)} />
        </div>
        <p className="text-[11px] text-[#777] mt-2">{data.ledger.lastAt ? `آخر مباراة: ${dateAr(data.ledger.lastAt)}` : 'لم تُسجَّل مباراة نبوءة بعد.'} المقاييس التفصيليّة لكلّ كرت في <a href="/admin/prophecy" className="text-[#C5A059] underline">مقاييس النبوءة</a>.</p>
      </div>

      <div className="p-4 rounded-xl border border-[#2a2a2a] bg-black/30">
        <p className="text-sm text-[#ddd] font-bold mb-1">ما لا تقيسه القاعدة</p>
        <ul className="text-xs text-[#aaa] space-y-1 leading-relaxed list-disc pr-4">
          <li>نسخة أندرويد الواحدة: تُبنى وتُرفع قبل ليلة التجربة.</li>
          <li>ليلة تجربةٍ كاملة مع الموجّه في موقع الاختبار.</li>
          <li>التفعيل نفسه: بكلمة المالك وحده.</li>
        </ul>
        {data.trackerUrl?.startsWith('https://') && <a href={data.trackerUrl} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[11px] text-[#C5A059] border border-[#C5A059]/40 rounded px-3 py-1.5 hover:bg-[#C5A059]/10">↗ صفحة متابعة البناء (للمالك)</a>}
      </div>
    </div>
  );
}

// ── التفعيل: فحصٌ بلا كتابة، ثمّ اسم الموسم للتأكيد ──
function ActivateTab({ data, apiFetch, onDone }: { data: Overview; apiFetch: (p: string, o?: RequestInit) => Promise<any>; onDone: () => void }) {
  const d = data.draft!;
  const [dry, setDry] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const failing = data.checks.filter(c => !c.ok);

  async function check() {
    setChecking(true); setErr(''); setDry(null);
    try { setDry(await apiFetch(`/api/seasons/drafts/${d.id}/activate`, { method: 'POST', body: JSON.stringify({ dryRun: true }) })); }
    catch (e: any) { setErr(e.data?.error || e.message); } finally { setChecking(false); }
  }
  async function activate() {
    if (!(await swalConfirm(`تفعيل «${d.name}» الآن؟ سيُنهى «${data.current?.name || 'الموسم الحاليّ'}» ويُصفَّر ترتيب الجميع. لا رجوع عن هذه الخطوة.`))) return;
    setRunning(true); setErr('');
    try {
      const r = await apiFetch(`/api/seasons/drafts/${d.id}/activate`, { method: 'POST', body: JSON.stringify({ dryRun: false, confirmName: confirmName.trim() }) });
      setDone(r.message || 'بدأ الموسم'); onDone();
    } catch (e: any) {
      setErr(e.data?.error || e.message);
      if (e.data?.activeRooms) setDry((x: any) => ({ ...(x || {}), ok: false, activeRooms: e.data.activeRooms }));
    } finally { setRunning(false); }
  }

  if (done) return <div className="p-4 rounded-xl border border-green-500/40 bg-green-500/10 text-green-300 text-sm">🎉 {done}</div>;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="p-4 rounded-xl border border-[#8A0303]/40 bg-[#8A0303]/5 text-xs text-[#ddd] leading-relaxed space-y-1.5">
        <p className="font-bold text-[#ff8a8a] text-sm">ماذا يحدث عند التفعيل</p>
        <p>• يُثبَّت أرشيف «{data.current?.name || 'الموسم الحاليّ'}» ثمّ يُنهى{data.current ? `، وفيه ${ar(data.current.matches)} مباراة` : ''}.</p>
        <p>• يبدأ «{d.name}» موسماً عاديّاً جديداً، ويُصفَّر ترتيب ونقاط كلّ اللاعبين (تبقى محفوظة في الموسم المنتهي).</p>
        <p>• تظهر الكروت الخمسة في كلّ الغرف وفي دليل الأدوار، ويبدأ عدّ الأسابيع والسجلّ من اليوم.</p>
        <p>• لا يُسمح به وفي أيّ غرفةٍ لعبةٌ جارية.</p>
      </div>

      {failing.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200">
          <p className="font-bold mb-1">لم يكتمل بعد ({ar(failing.length)}):</p>
          {failing.map(c => <p key={c.key}>◌ {c.label}: {c.note}</p>)}
        </div>
      )}

      <div>
        <button onClick={check} disabled={checking}
          className="w-full py-2.5 rounded-xl border border-[#C5A059]/60 text-[#C5A059] font-bold text-sm hover:bg-[#C5A059]/10 disabled:opacity-50">
          {checking ? 'جارٍ الفحص…' : '١) فحصٌ بلا كتابة'}
        </button>
        {dry && (
          <div className={`mt-3 p-3 rounded-xl border text-xs ${dry.ok ? 'border-green-500/30 bg-green-500/5 text-green-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
            {dry.ok ? <p className="font-bold">✓ كلّ الحرّاس تسمح بالتفعيل الآن.</p> : <p className="font-bold">✕ لا يمكن التفعيل الآن.</p>}
            {!!dry.activeRooms?.length && (
              <div className="mt-1">
                <p>أنهِ هذه الغرف من القمرة أوّلاً:</p>
                {dry.activeRooms.map((g: any, i: number) => <p key={i}>• {g.gameName || g.roomCode} ({g.phase})</p>)}
              </div>
            )}
            {dry.current?.cities?.length > 0 && (
              <p className="mt-1 text-[#aaa]">سيُجمَّد أرشيف «{dry.current.name}»: {dry.current.cities.map((c: any) => `${c.name} ${ar(c.players)} لاعباً`).join('، ')}.</p>
            )}
          </div>
        )}
      </div>

      {dry?.ok && (
        <div className="p-4 rounded-xl border border-[#2a2a2a] bg-black/30">
          <p className="text-xs text-[#aaa] mb-2">٢) للتأكيد اكتب اسم الموسم كما هو: <b className="text-[#C5A059]">{d.name}</b></p>
          <input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={d.name}
            className="w-full p-3 rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] text-sm mb-3 focus:border-[#8A0303] outline-none" />
          <button onClick={activate} disabled={running || confirmName.trim() !== d.name}
            className="w-full py-2.5 rounded-xl bg-[#8A0303] text-white font-bold text-sm hover:brightness-110 disabled:opacity-40">
            {running ? '…' : `تفعيل «${d.name}» الآن`}
          </button>
        </div>
      )}

      {err && <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{err}</div>}
    </div>
  );
}
