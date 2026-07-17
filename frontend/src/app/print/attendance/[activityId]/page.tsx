'use client';

// ══════════════════════════════════════════════════════
// 🖼️ كشف الحضور المصوّر (بطاقات) — صفحة عرض/طباعة مستقلّة
// منفصلة تماماً عن نظام التقارير/Puppeteer. تُفتح لأيّ فعاليّة، بالصور الحقيقيّة،
// عدّاد الأشخاص + نداء الحجز، صفحات A4 داكنة كاملة، طباعة/حفظ PDF من المتصفّح.
// ══════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const RANK: Record<string, { ar: string; b: string; c: string }> = {
  INFORMANT: { ar: 'مُخبر', b: '🕵️', c: '#9aa3b2' },
  SOLDIER: { ar: 'جندي', b: '⚔️', c: '#5b95f0' },
  CAPO: { ar: 'كابو', b: '🎖️', c: '#a463e0' },
  UNDERBOSS: { ar: 'أندربوس', b: '💎', c: '#f2a12a' },
  GODFATHER: { ar: 'الأب الروحي', b: '👑', c: '#ee4a44' },
};
const ar = (n: number) => Number(n).toLocaleString('ar-EG');
const initial = (s: string) => (s || '?').trim().replace(/[^؀-ۿ\w]/g, '')[0] || '★';
const chunk = <T,>(a: T[], n: number): T[][] => { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

type Member = { name: string; avatarUrl: string | null; rankTier: string; level: number };
type Guest = { name: string; peopleCount: number };
type Block = { type: 'label'; variant: 'members' | 'guests' } | { type: 'row'; cards: (Member | Guest)[]; guest: boolean };
type Page = { first: boolean; footer: boolean; blocks: Block[] };

// ترقيم يدويّ: كل صفحة A4 مستقلّة بحاشيتها؛ الصفحة ١ تحمل الترويسة+العدّاد فتسع صفوفاً أقلّ
function paginate(members: Member[], guests: Guest[]): Page[] {
  const memRows = chunk(members, 4), guestRows = chunk(guests, 4);
  const pages: Page[] = [];
  let cur: Page & { slots: number; cap: number } = { first: true, footer: false, blocks: members.length ? [{ type: 'label', variant: 'members' }] : [], slots: 0, cap: 2 };
  const flush = (cap = 4) => { pages.push({ first: cur.first, footer: false, blocks: cur.blocks }); cur = { first: false, footer: false, blocks: [], slots: 0, cap }; };
  const addRow = (row: (Member | Guest)[], guest = false) => { if (cur.slots >= cur.cap) flush(); cur.blocks.push({ type: 'row', cards: row, guest }); cur.slots++; };
  const addLabel = (variant: 'guests') => { if (cur.slots >= cur.cap) flush(); cur.blocks.push({ type: 'label', variant }); };
  for (const row of memRows) addRow(row);
  if (guests.length) { addLabel('guests'); for (const row of guestRows) addRow(row, true); }
  pages.push({ first: cur.first, footer: true, blocks: cur.blocks });
  return pages;
}

export default function AttendancePrintPage() {
  const params = useParams();
  const actId = params?.activityId as string;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [light, setLight] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // 📷 تصدير الكشف كصورة PNG واحدة — نلتقط «اللوحة المدمجة» (تصميمٌ مخصّصٌ للصورة،
  // متدفّقٌ بلا ارتفاع صفحاتٍ زائد) بأعلى كثافةٍ آمنةٍ ضمن حدود canvas في المتصفّح.
  const saveImage = async () => {
    const el = imgRef.current;
    if (!el || capturing) return;
    const baseName = `كشف الحضور - ${data?.activity?.name || 'الفعاليّة'}`;
    setCapturing(true);
    try {
      const { toCanvas } = await import('html-to-image');
      await new Promise(r => setTimeout(r, 60)); // ترك اللمسات الأخيرة تستقرّ
      const rect = el.getBoundingClientRect();
      const W = Math.round(rect.width), H = Math.round(rect.height);
      // أعلى كثافةٍ ممكنة (4× ← 3× ← 2×) تبقى ضمن حدود canvas — لتفادي خروج صورةٍ
      // فارغة على بعض الهواتف (خاصّة آيفون) بسبب تجاوز حدّ المساحة/البُعد.
      const SAFE_AREA = 16_000_000, SAFE_DIM = 16000;
      let pr = 4;
      while (pr > 2 && (W * pr > SAFE_DIM || H * pr > SAFE_DIM || W * H * pr * pr > SAFE_AREA)) pr--;
      const canvas = await toCanvas(el, {
        pixelRatio: pr, cacheBust: true,
        backgroundColor: light ? '#f4efe2' : '#0a0805',
        width: W, height: H,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${baseName}.png`;
      a.click();
    } catch {
      alert('تعذّر إنشاء الصورة — يمكنك استخدام «طباعة / حفظ PDF» بدلاً منها');
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { setErr('يجب تسجيل الدخول كمشرف أولاً'); return; }
    fetch(`${API_URL}/api/reservations/attendance/${actId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); else setErr(d.error || 'تعذّر التحميل'); })
      .catch(() => setErr('خطأ في الاتصال بالخادم'));
  }, [actId]);

  if (err) return <div className="att" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}><style dangerouslySetInnerHTML={{ __html: CSS }} /><div style={{ fontSize: 44 }}>🎭</div><div style={{ color: '#d1554a', fontSize: 15 }}>{err}</div><a href="/admin/login" style={{ color: '#c9a457', fontSize: 13 }}>تسجيل الدخول ←</a></div>;
  if (!data) return <div className="att" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="spin" /></div>;

  const { activity, stats, members, guests } = data;
  const d = new Date(activity.date);
  const day = d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const cap = activity.maxCapacity || 0;
  const pct = cap > 0 ? Math.min(100, Math.round((stats.persons / cap) * 100)) : 0;
  const remaining = stats.remaining;
  const pages = paginate(members, guests);

  const memberCard = (m: Member, i: number) => {
    const rk = RANK[m.rankTier] || RANK.INFORMANT;
    return (
      <div className="card" key={'m' + i}>
        <span className="cn a" /><span className="cn b" /><span className="cn c" /><span className="cn d" />
        <span className="num">№ {ar(i + 1)}</span>
        <div className="port">
          <div className="in">{m.avatarUrl ? <img src={`${API_URL}${m.avatarUrl}`} alt="" /> : <div className="mono">{initial(m.name)}</div>}</div>
          <div className="gem" style={{ background: `radial-gradient(circle at 35% 28%, #ffffffcc, ${rk.c} 42%, ${rk.c}99)` }}>{rk.b}</div>
        </div>
        <div className="name">{m.name}</div>
        <div className="rname" style={{ color: rk.c }}>{rk.ar}</div>
        <div className="pips">{Array.from({ length: 5 }, (_, k) => <b key={k} className={k < m.level ? '' : 'o'} />)}</div>
        <div className="lvlt">المستوى {ar(m.level)}</div>
      </div>
    );
  };
  const guestCard = (g: Guest, i: number) => (
    <div className="card guest" key={'g' + i}>
      <span className="cn a" /><span className="cn b" /><span className="cn c" /><span className="cn d" />
      <span className="num">№ {ar(members.length + i + 1)}</span>
      {g.peopleCount > 1 && <span className="gbadge">{ar(g.peopleCount)} أشخاص</span>}
      <div className="port"><div className="in"><div className="mono">{initial(g.name)}</div></div></div>
      <div className="name">{g.name}</div>
      <div className="gtag">ضيف / حجز جديد</div>
      {g.peopleCount > 1 && <><div className="party">{Array.from({ length: Math.min(g.peopleCount, 6) }, (_, k) => <b key={k} className={k < g.peopleCount ? '' : 'o'} />)}</div><div className="partyline">مجموعة من {ar(g.peopleCount)} أشخاص</div></>}
    </div>
  );

  let memCursor = 0, guestCursor = 0;
  return (
    <div className={`att${light ? ' light' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="toolbar">
        <button className="btn gold" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
        <button className="btn" onClick={saveImage} disabled={capturing}>{capturing ? '⏳ يُنشئ الصورة…' : '📷 حفظ كصورة'}</button>
        <button className="btn" onClick={() => setLight(v => !v)}>{light ? '🌙 داكن (فاخر)' : '☀️ فاتح (للطباعة)'}</button>
        <span className="hint">{activity.name} · {stats.persons} شخصاً</span>
      </div>

      {/* ===== اللوحة المدمجة: تصميم الصورة (معاينة الشاشة = الملفّ المُصدَّر) ===== */}
      {/* .imgsheet غلافٌ بعرض اللوحة تماماً؛ نلتقط .isheet فتكون إزاحتها صفراً (يمنع انزياح RTL) */}
      <div className="imgsheet">
        <div className="isheet" ref={imgRef}>
        <div className="head">
          <svg className="crest" viewBox="0 0 100 100" fill="none">
            <defs><linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7e9be" /><stop offset="1" stopColor="#9a7b3a" /></linearGradient></defs>
            <path d="M50 3 L94 25 V60 Q94 84 50 97 Q6 84 6 60 V25 Z" stroke="url(#ig)" strokeWidth="2.5" fill="rgba(201,164,87,.06)" />
            <path d="M50 11 L86 29 V58 Q86 78 50 89 Q14 78 14 58 V29 Z" stroke="rgba(201,164,87,.45)" strokeWidth="1" />
            <text x="50" y="60" textAnchor="middle" fontSize="30" fill="url(#ig)">🎭</text>
          </svg>
          <div className="kicker">قائمة الحضور</div>
          <div className="wm serif">نادي المافيا</div>
          <h1 className="serif">{activity.name}</h1>
          <div className="cbband"><span>🗓️ <b>{day}</b> — {time}</span>{activity.locationName && <span>📍 <b>{activity.locationName}</b></span>}</div>
        </div>
        <div className="hero">
          <div className="count"><span className="big">{ar(stats.persons)}</span>{cap > 0 && <span className="of">/ {ar(cap)}</span>}</div>
          <div className="clabel"><b>شخصاً</b> حجزوا مكانهم حتى الآن</div>
          {cap > 0 && <div className="prog"><span style={{ width: pct + '%' }} /></div>}
          {cap > 0 && (remaining > 0
            ? <div className="cta">🔥 بقيت <b>&nbsp;{ar(remaining)}&nbsp;</b> مقعداً — سارِع بالحجز قبل اكتمال العدد</div>
            : <div className="cta">🔴 اكتمل العدد — انضمّ لقائمة الانتظار</div>)}
        </div>
        {members.length > 0 && (
          <>
            <div className="seclabel"><span className="di">❖</span><h2>العائلة — الأعضاء</h2><i /><span className="c">مرتبطون بحساباتهم</span></div>
            <div className="grid">{members.map((m: Member, i: number) => memberCard(m, i))}</div>
          </>
        )}
        {guests.length > 0 && (
          <>
            <div className="seclabel gsep"><span className="di">❖</span><h2>ضيوف وحجوزات جديدة</h2><i /><span className="c">تشمل الجماعيّة</span></div>
            <div className="grid">{guests.map((g: Guest, i: number) => guestCard(g, i))}</div>
          </>
        )}
        <div className="ifoot"><i /><b>نادي المافيا</b> 🎭 — كشف حضورٍ رسميّ · أُعدّ آليّاً من متابعة الحجوزات</div>
        </div>
      </div>

      <div className="sheetwrap">
      {pages.map((pg, pi) => (
        <div className="page" key={pi}>
          {pg.first && (
            <>
              <div className="head">
                <svg className="crest" viewBox="0 0 100 100" fill="none">
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7e9be" /><stop offset="1" stopColor="#9a7b3a" /></linearGradient></defs>
                  <path d="M50 3 L94 25 V60 Q94 84 50 97 Q6 84 6 60 V25 Z" stroke="url(#g)" strokeWidth="2.5" fill="rgba(201,164,87,.06)" />
                  <path d="M50 11 L86 29 V58 Q86 78 50 89 Q14 78 14 58 V29 Z" stroke="rgba(201,164,87,.45)" strokeWidth="1" />
                  <text x="50" y="60" textAnchor="middle" fontSize="30" fill="url(#g)">🎭</text>
                </svg>
                <div className="kicker">قائمة الحضور</div>
                <div className="wm serif">نادي المافيا</div>
                <h1 className="serif">{activity.name}</h1>
                <div className="cbband"><span>🗓️ <b>{day}</b> — {time}</span>{activity.locationName && <span>📍 <b>{activity.locationName}</b></span>}</div>
              </div>
              <div className="hero">
                <div className="count"><span className="big">{ar(stats.persons)}</span>{cap > 0 && <span className="of">/ {ar(cap)}</span>}</div>
                <div className="clabel"><b>شخصاً</b> حجزوا مكانهم حتى الآن</div>
                {cap > 0 && <div className="prog"><span style={{ width: pct + '%' }} /></div>}
                {cap > 0 && (remaining > 0
                  ? <div className="cta">🔥 بقيت <b>&nbsp;{ar(remaining)}&nbsp;</b> مقعداً — سارِع بالحجز قبل اكتمال العدد</div>
                  : <div className="cta">🔴 اكتمل العدد — انضمّ لقائمة الانتظار</div>)}
              </div>
            </>
          )}
          {pg.blocks.map((b, bi) => {
            if (b.type === 'label') {
              return b.variant === 'members'
                ? <div className="seclabel" key={bi}><span className="di">❖</span><h2>العائلة — الأعضاء</h2><i /><span className="c">مرتبطون بحساباتهم</span></div>
                : <div className="seclabel" key={bi} style={{ marginTop: '5mm' }}><span className="di">❖</span><h2>ضيوف وحجوزات جديدة</h2><i /><span className="c">تشمل الجماعيّة</span></div>;
            }
            const cards = b.guest
              ? b.cards.map(() => guestCard(guests[guestCursor], guestCursor++))
              : b.cards.map(() => memberCard(members[memCursor], memCursor++));
            return <div className="grid" key={bi}>{cards}</div>;
          })}
          <div className="spacer" />
          {pg.footer
            ? <div className="foot"><i /><b>نادي المافيا</b> 🎭 — كشف حضورٍ رسميّ · أُعدّ آليّاً من متابعة الحجوزات</div>
            : <div className="pgn">نادي المافيا 🎭 — صفحة {ar(pi + 1)}</div>}
        </div>
      ))}
      </div>
    </div>
  );
}

const CSS = `
  .att{--obs:#0a0805;--obs2:#120d07;--panel:#181109;--panel2:#211710;--f-hi:#f5e6b8;--gold:#c9a457;--f-mid:#b0873c;--f-dim:#7c5f2c;--cream:#f0e6cf;--mut:#b7a279;--faint:#7d6c4c;--line:#3a2c17;--red:#8a0303;--red-hi:#d1554a;
    background:#2a251c;min-height:100vh;color:var(--cream);direction:rtl;line-height:1.5;font-family:"Segoe UI","Tahoma",sans-serif;font-size:13px;padding:0 0 50px}
  .att *{box-sizing:border-box}
  .att .serif{font-family:"Amiri","Arabic Typesetting","Traditional Arabic","Segoe UI",serif}
  .att .spin{width:38px;height:38px;border:3px solid rgba(201,164,87,.3);border-top-color:#c9a457;border-radius:50%;animation:asp 1s linear infinite}
  @keyframes asp{to{transform:rotate(360deg)}}

  /* غلاف صفحات A4 — للطباعة/الـPDF فقط (مخفيّ على الشاشة) */
  .att .sheetwrap{width:210mm;margin:0 auto}
  @media screen{.att .sheetwrap{display:none}}

  /* ===== اللوحة المدمجة: تصميم الصورة (متدفّق بلا ارتفاع زائد، يُلتقط بالكامل) ===== */
  /* .imgsheet = غلافٌ بعرض اللوحة تماماً يمنع انزياح RTL في الالتقاط؛ .isheet = اللوحة المُصوَّرة */
  .att .imgsheet{width:820px;margin:22px auto}
  .att .isheet{position:relative;overflow:hidden;padding:30px 28px 26px;border-radius:6px;
    background:radial-gradient(120% 30% at 50% -4%, rgba(201,164,87,.10), transparent 60%),radial-gradient(70% 40% at 100% 0%, rgba(138,3,3,.07), transparent 55%),linear-gradient(180deg,var(--obs2),var(--obs));
    box-shadow:0 30px 90px -30px #000}
  .att .isheet::before{content:"";position:absolute;inset:11px;border:1px solid rgba(201,164,87,.22);pointer-events:none;z-index:2;border-radius:3px}
  .att .isheet::after{content:"";position:absolute;inset:14px;border:1px solid rgba(201,164,87,.08);pointer-events:none;z-index:2}
  .att .isheet .gsep{margin-top:6mm}
  .att .isheet .ifoot{text-align:center;color:var(--faint);font-size:10.5px;padding-top:15px;position:relative}
  .att .isheet .ifoot i{display:block;max-width:220px;margin:0 auto 8px;height:1px;background:linear-gradient(90deg,transparent,var(--f-dim),transparent)}
  .att .isheet .ifoot b{color:var(--gold)}
  .att.light .isheet{background:linear-gradient(180deg,#fbf6ea,#f4efe2)}
  .att.light .isheet::before{border-color:rgba(160,120,50,.4)}
  .att.light .isheet::after{border-color:rgba(160,120,50,.16)}

  .att .page{width:210mm;height:calc(297mm - 1px);margin:0 auto 22px;position:relative;overflow:hidden;padding:13mm 12mm;display:flex;flex-direction:column;
    break-inside:avoid;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;
    background:radial-gradient(120% 34% at 50% -6%, rgba(201,164,87,.10), transparent 60%),radial-gradient(80% 46% at 100% 0%, rgba(138,3,3,.07), transparent 55%),linear-gradient(180deg,var(--obs2),var(--obs));box-shadow:0 26px 80px -24px #000}
  .att .page::before{content:"";position:absolute;inset:6mm;border:1px solid rgba(201,164,87,.22);pointer-events:none;z-index:2}
  .att .page::after{content:"";position:absolute;inset:7.2mm;border:1px solid rgba(201,164,87,.08);pointer-events:none;z-index:2}

  .att .head{position:relative;text-align:center;padding:2mm 0 3mm}
  .att .crest{width:66px;height:66px;margin:0 auto 8px;filter:drop-shadow(0 4px 14px rgba(201,164,87,.45))}
  .att .kicker{font-size:9.5px;letter-spacing:8px;color:var(--gold);font-weight:700}
  .att .wm{font-size:12px;letter-spacing:4px;color:var(--mut);margin-top:3px}
  .att h1{font-size:38px;line-height:1.04;margin:5px 0 4px;font-weight:700;color:transparent;background:linear-gradient(180deg,#f7e9be 8%,#d4af61 52%,#9a7b3a);-webkit-background-clip:text;background-clip:text;filter:drop-shadow(0 2px 14px rgba(201,164,87,.22))}
  .att .cbband{display:inline-flex;gap:8px 18px;flex-wrap:wrap;justify-content:center;margin-top:8px;padding:6px 18px;border:1px solid rgba(201,164,87,.3);border-radius:99px;background:rgba(0,0,0,.28);color:var(--mut);font-size:11.5px}
  .att .cbband b{color:var(--cream);font-weight:600}

  .att .hero{margin:5mm auto 5mm;max-width:150mm;text-align:center;border-radius:16px;position:relative;overflow:hidden;padding:11px 18px 13px;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line)}
  .att .hero::before{content:"";position:absolute;inset:4px;border:1px solid rgba(201,164,87,.14);border-radius:11px;pointer-events:none}
  .att .count{position:relative;display:flex;align-items:baseline;justify-content:center;gap:8px}
  .att .count .big{font-size:50px;font-weight:800;line-height:.9;color:transparent;background:linear-gradient(180deg,#f7e9be,#c9a457 60%,#9a7b3a);-webkit-background-clip:text;background-clip:text}
  .att .count .of{font-size:22px;color:var(--faint);font-weight:700}
  .att .clabel{position:relative;font-size:12.5px;color:var(--mut);margin-top:2px}
  .att .clabel b{color:var(--cream)}
  .att .prog{position:relative;height:8px;border-radius:99px;background:#2c2114;margin:10px auto 0;max-width:120mm;overflow:hidden;border:1px solid var(--line)}
  .att .prog span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#8a6d31,#f5e6b8)}
  .att .cta{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:11px;padding:8px 20px;border-radius:99px;font-size:14px;font-weight:800;color:#fff4e2;background:linear-gradient(180deg,#a5231b,#6f0f0a);border:1px solid #cf5a4e;box-shadow:0 6px 18px -8px rgba(165,35,27,.8)}
  .att .cta b{color:#ffe08a}

  .att .seclabel{display:flex;align-items:center;gap:12px;margin:0 0 4mm;position:relative}
  .att .seclabel h2{font-size:12px;color:var(--gold);font-weight:800;letter-spacing:2.5px;white-space:nowrap}
  .att .seclabel .di{color:var(--f-dim);font-size:8px}
  .att .seclabel i{height:1px;flex:1;background:linear-gradient(90deg,var(--f-dim),transparent)}
  .att .seclabel .c{font-size:10.5px;color:var(--faint)}

  .att .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;position:relative;margin-bottom:5mm}

  .att .card{position:relative;border-radius:14px;padding:13px 8px 11px;text-align:center;break-inside:avoid;isolation:isolate;background:linear-gradient(158deg,#1b130a 0%,#0e0a05 62%);border:1px solid var(--f-dim);box-shadow:0 8px 22px -12px #000, inset 0 1px 0 rgba(255,255,255,.03), inset 0 0 34px rgba(0,0,0,.5)}
  .att .card::before{content:"";position:absolute;inset:0;border-radius:14px;pointer-events:none;z-index:-1;opacity:.5;background:repeating-linear-gradient(45deg,transparent 0 7px,rgba(201,164,87,.035) 7px 8px),repeating-linear-gradient(-45deg,transparent 0 7px,rgba(201,164,87,.022) 7px 8px)}
  .att .card::after{content:"";position:absolute;inset:5px;border:1px solid rgba(201,164,87,.26);border-radius:10px;pointer-events:none}
  .att .cn{position:absolute;width:11px;height:11px;border:1.4px solid rgba(201,164,87,.5);z-index:4}
  .att .cn.a{top:8px;right:8px;border-left:0;border-bottom:0}.att .cn.b{top:8px;left:8px;border-right:0;border-bottom:0}
  .att .cn.c{bottom:8px;right:8px;border-left:0;border-top:0}.att .cn.d{bottom:8px;left:8px;border-right:0;border-top:0}
  .att .num{position:absolute;top:10px;right:13px;font-size:9px;color:var(--faint);font-variant-numeric:tabular-nums;z-index:5}
  .att .port{position:relative;width:66px;height:66px;margin:3px auto 9px;border-radius:50%;padding:3px;z-index:1;background:conic-gradient(from 40deg,#f5e6b8,#8a6d31,#f5e6b8,#8a6d31,#f5e6b8,#8a6d31,#f5e6b8);box-shadow:0 4px 11px -4px rgba(0,0,0,.6),0 0 0 1px rgba(0,0,0,.5)}
  .att .port .in{width:100%;height:100%;border-radius:50%;overflow:hidden;background:#241c10;border:2px solid #0e0a05}
  .att .port img{width:100%;height:100%;object-fit:cover;display:block}
  .att .port .mono{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#f0dca6;background:linear-gradient(160deg,#2a2013,#171009)}
  .att .gem{position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:27px;height:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #0e0a05;z-index:2;box-shadow:0 3px 7px -2px rgba(0,0,0,.7)}
  .att .name{position:relative;font-size:14px;font-weight:700;color:var(--cream);line-height:1.18;min-height:2.25em;display:flex;align-items:center;justify-content:center;padding:0 3px;z-index:1}
  .att .rname{font-size:10px;font-weight:700;letter-spacing:1px;margin-top:2px}
  .att .pips{display:flex;justify-content:center;gap:3.5px;margin-top:7px}
  .att .pips b{width:5.5px;height:5.5px;border-radius:50%;background:linear-gradient(180deg,#f5e6b8,#b0873c);box-shadow:0 0 4px rgba(201,164,87,.5)}
  .att .pips b.o{background:#2c2214;box-shadow:none}
  .att .lvlt{font-size:9px;color:var(--faint);margin-top:5px;letter-spacing:1px}

  .att .card.guest{background:linear-gradient(158deg,#17110a,#0b0804)}
  .att .card.guest::after{border-style:dashed;border-color:rgba(209,85,74,.32)}
  .att .card.guest .port{background:conic-gradient(from 40deg,#caa96f,#6f5730,#caa96f,#6f5730,#caa96f)}
  .att .card.guest .mono{color:#d8c39a;background:linear-gradient(160deg,#241a12,#140d07)}
  .att .gtag{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:1px;color:var(--red-hi);margin-top:4px;border:1px solid rgba(209,85,74,.5);background:rgba(138,3,3,.14);border-radius:99px;padding:2px 12px}
  .att .party{display:flex;justify-content:center;gap:4px;margin-top:8px}
  .att .party b{width:6.5px;height:6.5px;border-radius:50%;background:linear-gradient(180deg,#f5e6b8,#b0873c)}
  .att .party b.o{background:#2c2214}
  .att .partyline{font-size:9.5px;color:var(--mut);margin-top:5px}
  .att .gbadge{position:absolute;top:9px;left:11px;background:linear-gradient(180deg,#f2a12a,#c07d18);color:#160f04;font-weight:800;font-size:9.5px;border-radius:7px;padding:2px 8px;z-index:5;box-shadow:0 3px 7px -3px rgba(242,161,42,.6)}

  .att .spacer{flex:1}
  .att .foot{text-align:center;color:var(--faint);font-size:10px;padding-top:5mm;position:relative}
  .att .foot i{display:block;max-width:200px;margin:0 auto 8px;height:1px;background:linear-gradient(90deg,transparent,var(--f-dim),transparent)}
  .att .foot b{color:var(--gold)}
  .att .pgn{position:absolute;bottom:8mm;left:50%;transform:translateX(-50%);font-size:9px;color:var(--faint);letter-spacing:1px;z-index:3}

  .att .toolbar{position:sticky;top:0;z-index:40;display:flex;gap:9px;justify-content:center;align-items:center;flex-wrap:wrap;padding:11px;margin-bottom:20px;background:rgba(10,8,5,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
  .att .btn{font:inherit;font-size:12.5px;font-weight:700;color:var(--cream);background:#211710;border:1px solid var(--line);border-radius:9px;padding:8px 15px;cursor:pointer}
  .att .btn:hover{border-color:var(--gold);color:var(--f-hi)}
  .att .btn.gold{background:linear-gradient(180deg,#e6cf87,#b0873c);color:#160f04;border:none}
  .att .hint{color:#8f7f5c;font-size:11.5px}

  .att.light .page{background:linear-gradient(180deg,#fbf6ea,#f4efe2)}
  .att.light .page::before{border-color:rgba(160,120,50,.4)}.att.light .page::after{border-color:rgba(160,120,50,.16)}
  .att.light .kicker{color:#9a7423}.att.light .wm,.att.light .cbband,.att.light .clabel,.att.light .seclabel .c,.att.light .partyline{color:#6b5a38}
  .att.light h1{background:linear-gradient(180deg,#a5772e,#7c5a1f);-webkit-background-clip:text;background-clip:text}
  .att.light .cbband{background:#fff;border-color:#d8c9a3}.att.light .cbband b{color:#241d12}
  .att.light .hero{background:#fffdf7;border-color:#d8c9a3}.att.light .count .big{background:linear-gradient(180deg,#b0873c,#7c5f2c);-webkit-background-clip:text;background-clip:text}
  .att.light .clabel b{color:#241d12}.att.light .prog{background:#e7dcc0}
  .att.light .card{background:#fffdf7;border-color:#d8c9a3;box-shadow:0 8px 18px -12px rgba(120,90,30,.4)}
  .att.light .card.guest{background:#faf3e4}.att.light .card::after{border-color:rgba(160,120,50,.3)}
  .att.light .name{color:#241d12}.att.light .port .in{background:#efe7d4;border-color:#fffdf7}
  .att.light .port .mono{color:#8a6f3c;background:linear-gradient(160deg,#efe4c8,#d8c9a3)}
  .att.light .pips b.o{background:#e2d6b6}.att.light .num,.att.light .lvlt,.att.light .foot,.att.light .pgn{color:#a58a52}
  .att.light .cn{border-color:rgba(160,120,50,.5)}

  @media print{
    html,body{background:#0a0805 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .att{background:#0a0805;padding:0}
    .att .toolbar{display:none}
    .att .imgsheet{display:none}
    .att .page{margin:0;box-shadow:none}
    .att .page + .page{break-before:page;page-break-before:always}
  }
  @page{size:A4;margin:0}
`;
