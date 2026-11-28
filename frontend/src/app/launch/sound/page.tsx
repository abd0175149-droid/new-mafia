'use client';
// 🔊 لابتوب الصوت في ليلة الإطلاق — المصدر الوحيد للصوت (التلفازات صامتة حتّى لا يصير صدى).
// يحمّل المقاطع مسبقاً بصلاحيّة الأدمن، ويشغّل كلّ مقطع في موعده من stageAt بساعة السيرفر،
// ويبلّغ جهاز التحكّم أنّه حيّ وماذا يشغّل الآن. الرجوع لا يشغّل شيئاً، وإعادة المقطع تعيده.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLaunch, staffToken, API } from '../useLaunch';

type Cue = { key: string; at: number; label: string };

export default function LaunchSound() {
  const clips = useRef<Record<string, HTMLAudioElement>>({});
  const nowPlaying = useRef<{ key: string; label: string } | null>(null);
  const playingLabel = useCallback(() => nowPlaying.current?.label || '', []);
  const { state: s, serverNow, error } = useLaunch<any>(300, true, 'sound', playingLabel);
  const [loaded, setLoaded] = useState<Record<string, 'ok' | 'missing'>>({});
  const [armed, setArmed] = useState(false);
  const [vol, setVol] = useState(1);
  const [log, setLog] = useState<string[]>([]);
  const lastSeq = useRef<number | null>(null);
  const timers = useRef<any[]>([]);
  const add = (m: string) => setLog(l => [`${new Date().toLocaleTimeString('ar-JO')} · ${m}`, ...l].slice(0, 40));

  const c = s?.content || {};
  const keys: { key: string; label: string }[] = [];
  if (c.sfx?.crack) keys.push({ key: c.sfx.crack, label: 'انكسار الختم' });
  if (c.prophecy?.audio) keys.push({ key: c.prophecy.audio, label: 'نجوى' });
  if (c.cardsIntro?.audio) keys.push({ key: c.cardsIntro.audio, label: 'الراوي: المقدّمة' });
  for (const x of c.cards || []) if (x.audio) keys.push({ key: x.audio, label: `الراوي: ${x.name}` });
  if (c.sfx?.draw) keys.push({ key: c.sfx.draw, label: 'السحب' });
  if (c.sfx?.win) keys.push({ key: c.sfx.win, label: 'الفوز' });
  const keySig = keys.map(k => k.key).join('|');

  useEffect(() => {
    if (!keySig) return;
    let stop = false;
    (async () => {
      for (const { key } of keys) {
        if (clips.current[key] || stop) continue;
        try {
          const r = await fetch(`${API}/api/launch-show/audio/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${staffToken()}` } });
          if (!r.ok) throw new Error();
          const a = new Audio(URL.createObjectURL(await r.blob())); a.preload = 'auto';
          a.addEventListener('ended', () => { if (nowPlaying.current?.key === key) nowPlaying.current = null; });
          clips.current[key] = a; setLoaded(m => ({ ...m, [key]: 'ok' }));
        } catch { setLoaded(m => ({ ...m, [key]: 'missing' })); }
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  useEffect(() => { for (const a of Object.values(clips.current)) a.volume = vol; }, [vol, loaded]);

  const stopAll = () => { for (const a of Object.values(clips.current)) { a.pause(); a.currentTime = 0; } timers.current.forEach(clearTimeout); timers.current = []; nowPlaying.current = null; };
  const play = (key: string, label: string) => {
    const a = clips.current[key]; if (!a) { add(`غير محمّل: ${label}`); return; }
    a.currentTime = 0; a.volume = vol;
    a.play().then(() => { nowPlaying.current = { key, label }; add(`▶ ${label}`); }).catch(() => add(`لم يبدأ (اضغط «تفعيل الصوت»): ${label}`));
  };
  const tone = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 523; g.gain.value = 0.2 * vol;
      o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9); o.stop(ctx.currentTime + 0.95);
      add('نغمة تجربة');
    } catch { add('تعذّرت نغمة التجربة'); }
  };

  // كلّ تغيير seq ⇒ جدولة مقاطع المرحلة (إلّا الرجوع)
  useEffect(() => {
    if (!s || !armed) return;
    if (lastSeq.current === s.seq) return;
    const first = lastSeq.current === null; lastSeq.current = s.seq;
    stopAll();
    if (s.lastAction === 'back') { add('رجوع: بلا صوت'); return; }
    const cues: Cue[] = []; const T = s.stageAt;
    if (s.stage === 'break') {
      if (c.sfx?.crack) cues.push({ key: c.sfx.crack, at: T + 600, label: 'انكسار الختم' });
      if (c.prophecy?.audio) cues.push({ key: c.prophecy.audio, at: T + Number(c.prophecy.lead ?? 4) * 1000, label: 'نجوى' });
    }
    if (s.stage === 'cards') {
      if (s.cardIndex === -1 && c.cardsIntro?.audio) cues.push({ key: c.cardsIntro.audio, at: T + 800, label: 'الراوي: المقدّمة' });
      else if (s.cardIndex >= 0 && c.cards?.[s.cardIndex]?.audio) cues.push({ key: c.cards[s.cardIndex].audio, at: T + 1000, label: `الراوي: ${c.cards[s.cardIndex].name}` });
    }
    if (s.stage === 'draw') {
      if (c.sfx?.draw) cues.push({ key: c.sfx.draw, at: T, label: 'السحب' });
      if (c.sfx?.win) cues.push({ key: c.sfx.win, at: T + 7000, label: 'الفوز' });
    }
    for (const q of cues) {
      const wait = q.at - serverNow();
      if (wait < -2500 || (first && wait < 0)) { add(`فات موعده (شغّله يدويّاً إن لزم): ${q.label}`); continue; }
      timers.current.push(setTimeout(() => play(q.key, q.label), Math.max(0, wait)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.seq, armed]);

  if (error === 'auth') return <div className="ctl"><h1>لابتوب الصوت</h1><div className="now">هذه الصفحة لحساب الأدمن في لوحة التحكّم فقط. سجّل دخولك به، وترجع لهنا وحدها.</div><Link className="b" style={{ display: 'block', textAlign: 'center', marginTop: 12 }} href="/admin/login?next=/launch/sound">دخول الأدمن</Link></div>;
  const np = nowPlaying.current; const a = np ? clips.current[np.key] : null;
  const pct = a && a.duration ? Math.min(100, (a.currentTime / a.duration) * 100) : 0;
  return (
    <div className="ctl snd">
      <h1>لابتوب الصوت</h1>
      <div className="now">وصّل هذا اللابتوب بسمّاعات القاعة، واترك الصفحة مفتوحة طول الليلة ولا تحدّثها. التلفازات صامتة.</div>
      {!armed
        ? <button className="next" onClick={() => { for (const x of Object.values(clips.current)) { x.muted = true; x.play().then(() => { x.pause(); x.currentTime = 0; x.muted = false; }).catch(() => { x.muted = false; }); } setArmed(true); lastSeq.current = s?.seq ?? null; add('الصوت مفعّل: ينتظر ضغطات الليدر'); }}>تفعيل الصوت</button>
        : <div className={`bigstate ${np ? 'on' : ''}`}><b>{np ? `يشغّل: ${np.label}` : 'جاهز · ينتظر'}</b><i><span style={{ width: `${pct}%` }} /></i></div>}
      <h2>مستوى الصوت</h2>
      <input type="range" min={0} max={1} step={0.05} value={vol} onChange={e => setVol(Number(e.target.value))} style={{ width: '100%' }} aria-label="مستوى الصوت" />
      <div className="grid"><button className="b" type="button" onClick={tone}>نغمة تجربة (بلا محتوى)</button><button className="b warn" type="button" onClick={() => { stopAll(); add('■ أوقفت كلّ الأصوات'); }}>أوقف كلّ الأصوات</button></div>
      <h2>المقاطع (للطوارئ فقط: فيها المحتوى السرّيّ)</h2>
      <div className="grid">
        {keys.map(k => (
          <button key={k.key} className="b" type="button" disabled={loaded[k.key] !== 'ok'} onClick={() => play(k.key, k.label)}>
            {k.label}{loaded[k.key] === 'missing' ? ' (غير موجود)' : loaded[k.key] ? '' : ' (يُحمّل…)'}
          </button>
        ))}
      </div>
      <div className="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}
