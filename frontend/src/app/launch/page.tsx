'use client';
// 📱 صفحة الضيف في ليلة الإطلاق — ورقةٌ مختومة على الجوّال تنفتح لحظة كسر الختم،
// ثمّ الكروت كما تُكشف، ثمّ «اكتب نبوءتك». تعمل من رمز المسح، بلا تطبيق ولا دخول.
import { useEffect, useState } from 'react';
import { useLaunch, countdown, toAr, deviceId, API, type Line, type Card } from './useLaunch';

const RANK = ['idle', 'countdown', 'break', 'cards', 'lineup', 'predict', 'predict_closed', 'result', 'draw', 'end'];
const at = (s: string) => RANK.indexOf(s);

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }

function Poll({ s }: { s: any }) {
  const [mine, setMine] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setMine(load('launch_poll', null)); }, []);
  const total = Object.values(s.poll?.counts || {}).reduce((a: number, b: any) => a + Number(b || 0), 0) as number;
  async function pick(k: string) {
    setErr(''); setMine(k); save('launch_poll', k);
    try {
      const r = await fetch(`${API}/api/launch-show/poll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId(), choice: k }) });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || 'لم يصل صوتك'); }
    } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="card">
      <h2>{s.poll.question}</h2>
      <div className="choices">
        {(s.poll.options || []).map((o: any) => (
          <button key={o.key} className="btn" aria-pressed={mine === o.key} onClick={() => pick(o.key)}>{o.label}</button>
        ))}
      </div>
      {mine && (s.poll.options || []).map((o: any) => {
        const n = Number(s.poll.counts?.[o.key] || 0); const pct = total ? Math.round((n / total) * 100) : 0;
        return <div className="pbar" key={o.key}><div className="lab"><span>{o.label}</span><span>{toAr(pct)}٪</span></div><div className="trk"><div className="fill" style={{ width: `${pct}%` }} /></div></div>;
      })}
      {mine && !err && <div className="ok">وصل صوتك. النتيجة على شاشات القاعة.</div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

function Prophecy({ s, e }: { s: any; e: number }) {
  const lines: Line[] = s.prophecy?.lines || [];
  const lead = Number(s.prophecy?.lead ?? 4);
  const live = s.stage === 'break';
  const t = live ? e - lead : 1e9;
  const shown = lines.filter(l => l.t <= t);
  const done = !live || (lines.length > 0 && t > lines[lines.length - 1].t + 2);
  return (
    <>
      <img src="/launch/seal-broken.webp" alt="" style={{ width: 120, display: 'block', margin: '14px auto 0' }} />
      {s.title && <div className="wordmark ls-gold">{s.title}</div>}
      <div className="card">
        {shown.length === 0 && <div className="note" style={{ textAlign: 'center' }}>اسمع… الحكاية بدأت</div>}
        {groups(shown).map((g, i) => g.kind === 'verse'
          ? <div className="verse" key={i} style={{ margin: '10px 0' }}>{g.lines.map((l, j) => <span key={j}>{l.text}</span>)}</div>
          : <div className="narr" key={i}>{g.lines.map((l, j) => <span key={j}>{l.text}</span>)}</div>)}
        {done && s.motto && !String(lines[lines.length - 1]?.text || '').includes(String(s.motto).replace(/[.…]/g, '').slice(0, 8)) && <div className="motto">{s.motto}</div>}
      </div>
    </>
  );
}
function groups(ls: Line[]) {
  const out: { kind: string; lines: Line[] }[] = [];
  for (const l of ls) { const k = l.kind === 'verse' ? 'verse' : 'narr'; if (out.length && out[out.length - 1].kind === k) out[out.length - 1].lines.push(l); else out.push({ kind: k, lines: [l] }); }
  return out;
}

function Cards({ s }: { s: any }) {
  const cards: Card[] = s.cards || [];
  if (!cards.length) return s.stage === 'cards' ? <div className="card"><h2>{toAr(s.cardsTotal || 5)} كروت جديدة</h2><div className="note">{s.cardsIntro?.text || 'تابع الشاشة…'}</div></div> : null;
  return (
    <div className="card">
      <h2>كروت الموسم الجديد</h2>
      {[...cards].reverse().map(c => (
        <div className="crd" key={c.key}>
          <img src={c.image} alt={c.name} />
          <div><div className="n">{c.name}</div><div className="s">{c.slogan}</div><div className="t">{c.text}</div>{c.entry && <div className="e">{c.entry}</div>}</div>
        </div>
      ))}
    </div>
  );
}

function Predict({ s }: { s: any }) {
  const p = s.predict || {};
  const open = s.stage === 'predict';
  const [mine, setMine] = useState<{ name: string; phone: string; choice: string } | null>(null);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [edit, setEdit] = useState(false);
  useEffect(() => { const m = load<any>('launch_predict', null); if (m) { setMine(m); setName(m.name); setPhone(m.phone); setChoice(m.choice); } }, []);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); setErr('');
    if (!choice) return setErr('اختر نبوءتك');
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/launch-show/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, choice, deviceId: deviceId() }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'لم تُحفظ نبوءتك');
      const m = { name: name.trim(), phone: b.phone || phone, choice }; setMine(m); save('launch_predict', m); setEdit(false);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const label = (k: string) => (p.options || []).find((o: any) => o.key === k)?.label || k;
  const won = !!(s.winner?.tail && mine && String(mine.phone).endsWith(s.winner.tail) && s.winner.name === mine.name.split(/\s+/).slice(0, 2).join(' '));
  return (
    <div className="card">
      <h2>{open ? 'اكتب نبوءتك' : 'نبوءتك'}</h2>
      <div className="narr" style={{ fontWeight: 600 }}>{p.question}</div>
      {open && (!mine || edit) ? (
        <form onSubmit={submit}>
          <div className="choices" style={{ marginTop: 12 }}>
            {(p.options || []).map((o: any) => <button type="button" key={o.key} className="btn" aria-pressed={choice === o.key} onClick={() => setChoice(o.key)}>{o.label}</button>)}
          </div>
          <label htmlFor="ln">اسمك</label>
          <input id="ln" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={40} required />
          <label htmlFor="lp">رقم جوّالك (للتواصل مع الفائز)</label>
          <input id="lp" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="07XXXXXXXX" required />
          <button className="btn primary" disabled={busy}>{busy ? 'جارٍ الختم…' : 'اختم نبوءتي'}</button>
          {p.prize && <div className="note">{p.prize}</div>}
          {err && <div className="err">{err}</div>}
        </form>
      ) : mine ? (
        <>
          <div className="ok">نبوءتك مختومة: «{label(mine.choice)}»</div>
          {open && <button className="btn" style={{ marginTop: 10 }} onClick={() => setEdit(true)}>غيّر نبوءتي</button>}
          {p.answer && <div className={p.answer === mine.choice ? 'ok' : 'note'}>{p.answer === mine.choice ? 'صدقت نبوءتك! أنت في السحب.' : `النبوءة الصحيحة: «${label(p.answer)}».`}</div>}
          {s.winner?.name && <div className={won ? 'ok' : 'note'}>{won ? 'مبروك! اسمك ظهر على الشاشة.' : `صاحب النبوءة: ${s.winner.name}`}</div>}
        </>
      ) : (
        <div className="note">{open ? '' : 'أُغلق باب النبوءات.'}</div>
      )}
    </div>
  );
}

export default function LaunchGuest() {
  const { state: s, serverNow, error } = useLaunch<any>(1500);
  const now = serverNow();
  const e = s ? (now - s.stageAt) / 1000 : 0;
  if (!s) return <div className="ph"><img className="logo" src="/launch/logo-gold.svg" alt="" /><div className="club">نادي المافيا</div><div className="note">{error ? 'جارٍ الاتّصال…' : ''}</div></div>;
  const st = at(s.stage);
  const sealed = st < at('break');
  const left = s.breakAt ? new Date(s.breakAt).getTime() - now : null;
  return (
    <div className="ph">
      <img className="logo" src="/launch/logo-gold.svg" alt="" />
      <div className="club">نادي المافيا</div>
      {sealed ? (
        <>
          <div className="env"><img className="seal" src="/launch/seal-intact.webp" alt="" /></div>
          <div className="lock">لا تُفتح<br />قبل كسر الختم<small>ورقتك هنا. تنفتح وحدها حين يُكسر الختم أمام الجميع.</small></div>
          {left != null && <div className="clock ls-gold">{left > 0 ? countdown(left) : 'الآن'}</div>}
          {s.poll?.open && s.poll?.question && <Poll s={s} />}
        </>
      ) : (
        <>
          <Prophecy s={s} e={e} />
          {st >= at('predict') && <Predict s={s} />}
          {st >= at('cards') && <Cards s={s} />}
          {st >= at('end') && s.end?.text && <div className="card"><div className="narr">{s.end.text}</div></div>}
        </>
      )}
    </div>
  );
}
