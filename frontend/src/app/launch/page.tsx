'use client';
// 📱 صفحة الضيف في ليلة الإطلاق — «رسائل نجوى»: محادثة تصل رسائلها مع كلّ مرحلة من الليلة.
// قبل الكسر ورقة مختومة وعدّ تنازليّ، ثمّ الحكاية سطراً سطراً مع صوت نجوى، ثمّ الكروت، ثمّ نبوءة الضيف
// (نجوى تسأله عن اسمه ورقمه داخل المحادثة). بلا تطبيق ولا دخول، وبلا صوت على الجوّال.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLaunch, countdown, toAr, deviceId, API, cardSrc, type Line, type Card } from './useLaunch';

const RANK = ['idle', 'countdown', 'break', 'cards', 'lineup', 'predict', 'predict_closed', 'result', 'draw', 'end'];
const at = (s: string) => RANK.indexOf(s);
const SPIN_S = 7;

type Msg = { id: string; me?: boolean; cls?: string; body: React.ReactNode };
type Pred = { choice: string; name: string; phone: string };

function load<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k: string, v: any) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }
const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

export default function LaunchGuest() {
  const { state: s, serverNow, error } = useLaunch<any>(1500, false, 'guest');
  const [poll, setPoll] = useState<string | null>(null);
  const [pred, setPred] = useState<Pred | null>(null);
  const [draft, setDraft] = useState<{ choice?: string; name?: string }>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const buzzed = useRef<Record<string, boolean>>({});

  useEffect(() => { setPoll(load('launch_poll', null)); setPred(load('launch_predict', null)); }, []);
  // الشاشة لا تنطفئ أثناء الليلة (حين يسمح المتصفّح)
  useEffect(() => {
    let lock: any = null;
    const ask = async () => { try { if (document.visibilityState === 'visible') lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* */ } };
    ask(); document.addEventListener('visibilitychange', ask);
    return () => { document.removeEventListener('visibilitychange', ask); try { lock?.release(); } catch { /* */ } };
  }, []);

  const now = serverNow();
  const e = s ? (now - s.stageAt) / 1000 : 0;
  const st = s ? at(s.stage) : -1;
  const label = (k?: string | null) => (s?.predict?.options || []).find((o: any) => o.key === k)?.label || k || '';
  const won = !!(s?.winner?.tail && pred && String(pred.phone).endsWith(s.winner.tail));
  const drawDone = !!s && (s.stage !== 'draw' || e >= SPIN_S);

  // الاهتزاز: لحظة كسر الختم، ولحظة فوز صاحب الجوّال
  useEffect(() => {
    if (!s) return;
    const buzz = (k: string, p: number[]) => { if (buzzed.current[k]) return; buzzed.current[k] = true; try { navigator.vibrate?.(p); } catch { /* */ } };
    if (s.stage === 'break' && e >= 0.6 && e < 6) buzz('break' + s.seq, [220, 90, 220]);
    if (won && drawDone) buzz('win' + s.seq, [300, 120, 300, 120, 500]);
  });

  async function vote(k: string) {
    setPoll(k); save('launch_poll', k);
    try { await fetch(`${API}/api/launch-show/poll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: deviceId(), choice: k }) }); } catch { /* */ }
  }
  async function submit(phone: string) {
    if (!draft.choice || !draft.name) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/launch-show/predict`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: draft.name, phone, choice: draft.choice, deviceId: deviceId() }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'ما وصلتني نبوءتك، جرّب مرّة ثانية');
      const p = { choice: draft.choice, name: draft.name, phone: b.phone || phone }; setPred(p); save('launch_predict', p); setInput('');
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }

  // ── الرسائل: تُبنى من المرحلة والوقت، بمعرّفات ثابتة فلا تتحرّك القديمة ──
  const view = useMemo(() => {
    const m: Msg[] = []; let typing = false;
    if (!s) return { m, typing };
    const n = (id: string, body: React.ReactNode, cls = '') => m.push({ id, body, cls });
    const me = (id: string, body: React.ReactNode) => m.push({ id, body, me: true });
    const left = s.breakAt ? new Date(s.breakAt).getTime() - now : null;

    n('hi', 'أهلاً فيك… أنا نجوى. الليلة أنا اللي بحكيلك.');
    n('env', <div className="env-b"><img src="/launch/seal-intact.webp" alt="" /><span>ورقتك المختومة</span></div>, 'media');
    n('wait', 'لا تفتحها قبل ما ينكسر الختم.');
    if (st < at('break')) {
      n('clock', left == null ? 'الختم يُكسر الساعة ٨' : left > 0 ? <>الختم يُكسر بعد <b className="num">{countdown(left)}</b></> : 'الآن…');
      if (s.poll?.open && s.poll?.question) {
        n('pq', s.poll.question);
        if (poll) {
          me('pme', (s.poll.options || []).find((o: any) => o.key === poll)?.label || poll);
          const total = Object.values(s.poll.counts || {}).reduce((a: number, b: any) => a + Number(b || 0), 0) as number;
          n('pres', <div className="bars">{(s.poll.options || []).map((o: any) => { const pct = total ? Math.round((Number(s.poll.counts?.[o.key] || 0) / total) * 100) : 0; return <div key={o.key}><span>{o.label}</span><i><b style={{ width: `${pct}%` }} /></i><em>{toAr(pct)}٪</em></div>; })}</div>);
        }
      }
      return { m, typing };
    }

    // كسر الختم والحكاية
    n('broken', <div className="env-b"><img src="/launch/seal-broken.webp" alt="" /><span>انكسر الختم</span></div>, 'media');
    if (s.title) n('title', <span className="ttl">{s.title}</span>, 'gold');
    const lines: Line[] = s.prophecy?.lines || [];
    const live = s.stage === 'break';
    const t = live ? e - Number(s.prophecy?.lead ?? 4) : 1e9;
    const shown = lines.filter(l => l.t <= t);
    shown.forEach((l, i) => n('l' + i, l.text, l.kind === 'verse' ? 'verse' : ''));
    if (live && shown.length < lines.length && t > -1.5) typing = true;
    if (st < at('cards')) return { m, typing };

    // الكروت
    n('ci', s.cardsIntro?.text || 'خمسة كروت جديدة تدخل المدينة…');
    (s.cards || []).forEach((c: Card) => n('c' + c.key, <div className="crd"><img src={cardSrc(c.image)} alt={c.name} /><b>{c.name}</b><q>{c.slogan}</q><p>{c.text}</p></div>, 'card'));
    if (s.stage === 'cards' && (s.cards || []).length < (s.cardsTotal || 5) && e > 0.5) typing = true;
    if (st < at('predict')) return { m, typing };

    // النبوءة
    const p = s.predict || {};
    n('pp', 'والآن… نبوءتك أنت.');
    n('pq2', <b>{p.question}</b>);
    if (pred) {
      me('mc', label(pred.choice)); me('mn', pred.name);
      n('ok', <>ختمتها عندي: «{label(pred.choice)}».{p.prize ? <span className="sub">{p.prize}</span> : null}</>);
    } else if (s.stage === 'predict') {
      if (draft.choice) { me('mc', label(draft.choice)); n('askn', 'وقبل ما أختمها… شو اسمك؟'); }
      if (draft.name) { me('mn', draft.name); n('askp', 'ورقمك؟ عشان نوصلك إذا فزت.'); }
    } else n('late', 'أُغلق باب النبوءات قبل ما توصلني نبوءتك… الليلة الجاية إلك.');
    if (st < at('result')) return { m, typing };

    if (p.answer) {
      n('ans', <>النبوءة الصحيحة: «{label(p.answer)}». صدقت نبوءة <b className="num">{toAr(p.correct || 0)}</b> من <b className="num">{toAr(p.count || 0)}</b>.</>);
      if (pred) n('mine', pred.choice === p.answer ? `صدقت يا ${first(pred.name)}! أنت في السحب.` : `ما صدقت هالمرّة يا ${first(pred.name)}… بس الحكاية لسّا بأوّلها.`);
    }
    if (st < at('draw')) return { m, typing };

    n('dr', 'السحب الآن… عينك على الشاشة.');
    if (drawDone && s.winner?.name) {
      n('win', <>صاحب النبوءة: <b>{s.winner.name}</b></>, 'gold');
      if (won) n('mewin', 'مبروك! هذا أنت. تعال على المسرح.', 'gold');
    } else typing = true;
    if (st >= at('end') && s.end?.text) n('end', s.end.text);
    return { m, typing };
  }, [s, now, e, st, poll, pred, draft, won, drawDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = view.m.length + (view.typing ? 1 : 0);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [count]);

  // ── أسفل الشاشة: أزرار ردّ جاهزة، أو خانة كتابة ──
  let composer: React.ReactNode = <div className="cmp-quiet">{s ? 'نجوى تحكي… تابع الشاشة' : ''}</div>;
  if (s && st < at('break') && s.poll?.open && !poll) composer = <div className="qr-btns">{(s.poll.options || []).map((o: any) => <button key={o.key} type="button" onClick={() => vote(o.key)}>{o.label}</button>)}</div>;
  if (s && s.stage === 'predict' && !pred) {
    if (!draft.choice) composer = <div className="qr-btns">{(s.predict?.options || []).map((o: any) => <button key={o.key} type="button" onClick={() => setDraft({ choice: o.key })}>{o.label}</button>)}</div>;
    else {
      const asking = !draft.name ? 'name' : 'phone';
      composer = (
        <form className="cmp-form" onSubmit={ev => { ev.preventDefault(); const v = input.trim(); if (!v) return; if (asking === 'name') { if (v.length < 2) { setErr('اكتب اسمك'); return; } setErr(''); setDraft(d => ({ ...d, name: v.slice(0, 40) })); setInput(''); } else submit(v); }}>
          <input id="launch-input" value={input} onChange={x => setInput(x.target.value)} placeholder={asking === 'name' ? 'اسمك' : '07XXXXXXXX'} inputMode={asking === 'phone' ? 'tel' : 'text'} autoComplete={asking === 'phone' ? 'tel' : 'given-name'} dir={asking === 'phone' ? 'ltr' : 'rtl'} maxLength={40} autoFocus />
          <button type="submit" disabled={busy} aria-label="إرسال">{busy ? '…' : 'إرسال'}</button>
        </form>
      );
    }
  }

  return (
    <div className="ch">
      <header className="ch-top">
        <span className="ava" aria-hidden>ن</span>
        <div><b>نجوى</b><small>{error && !s ? 'جارٍ الاتّصال…' : view.typing ? 'تكتب…' : 'متّصلة الآن'}</small></div>
        <img src="/launch/logo-gold.svg" alt="نادي المافيا" className="ch-logo" />
      </header>
      <div className="ch-list" ref={scroller}>
        {view.m.map(x => <div key={x.id} className={`ch-m ${x.me ? 'me' : ''} ${x.cls || ''}`}>{x.body}</div>)}
        {view.typing && <div className="ch-m typing" aria-label="نجوى تكتب"><i /><i /><i /></div>}
        {err && <div className="ch-err">{err}</div>}
      </div>
      <footer className="ch-cmp">{composer}</footer>
    </div>
  );
}
