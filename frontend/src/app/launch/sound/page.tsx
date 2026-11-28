'use client';
// 🔊 لابتوب الصوت في ليلة الإطلاق — المصدر الوحيد للصوت (التلفازات صامتة حتّى لا يصير صدى).
// يحمّل المقاطع مسبقاً بصلاحيّة الطاقم، ويشغّل كلّ مقطع في موعده من stageAt بساعة السيرفر.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLaunch, staffToken, API } from '../useLaunch';

type Cue = { id: string; key: string; at: number; label: string };

export default function LaunchSound() {
  const { state: s, serverNow, error } = useLaunch<any>(300, true);
  const clips = useRef<Record<string, HTMLAudioElement>>({});
  const [loaded, setLoaded] = useState<Record<string, 'ok' | 'missing'>>({});
  const [armed, setArmed] = useState(false);
  const [vol, setVol] = useState(1);
  const [log, setLog] = useState<string[]>([]);
  const lastSeq = useRef<number | null>(null);
  const lastCard = useRef<number>(-2);
  const timers = useRef<any[]>([]);
  const add = (m: string) => setLog(l => [`${new Date().toLocaleTimeString('ar-JO')} · ${m}`, ...l].slice(0, 40));

  const c = s?.content || {};
  const keys: { key: string; label: string }[] = [];
  if (c.sfx?.crack) keys.push({ key: c.sfx.crack, label: 'صوت انكسار الختم' });
  if (c.prophecy?.audio) keys.push({ key: c.prophecy.audio, label: 'نجوى: الحكاية والنبوءة' });
  if (c.cardsIntro?.audio) keys.push({ key: c.cardsIntro.audio, label: 'الراوي: مقدّمة الكروت' });
  for (const x of c.cards || []) if (x.audio) keys.push({ key: x.audio, label: `الراوي: ${x.name}` });
  if (c.sfx?.draw) keys.push({ key: c.sfx.draw, label: 'صوت السحب' });
  if (c.sfx?.win) keys.push({ key: c.sfx.win, label: 'صوت الفوز' });
  const keySig = keys.map(k => k.key).join('|');

  // تحميل المقاطع مسبقاً (بصلاحيّة الطاقم)
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
          clips.current[key] = a; setLoaded(m => ({ ...m, [key]: 'ok' }));
        } catch { setLoaded(m => ({ ...m, [key]: 'missing' })); }
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);

  useEffect(() => { for (const a of Object.values(clips.current)) a.volume = vol; }, [vol, loaded]);

  const stopAll = () => { for (const a of Object.values(clips.current)) { a.pause(); a.currentTime = 0; } timers.current.forEach(clearTimeout); timers.current = []; };
  const play = (key: string, label: string) => {
    const a = clips.current[key]; if (!a) { add(`غير محمّل: ${label}`); return; }
    a.currentTime = 0; a.volume = vol; a.play().then(() => add(`▶ ${label}`)).catch(() => add(`لم يبدأ (اضغط «تفعيل الصوت»): ${label}`));
  };

  // كلّ تغيير seq ⇒ جدولة مقاطع المرحلة الجديدة
  useEffect(() => {
    if (!s || !armed) return;
    if (lastSeq.current === s.seq) return;
    const first = lastSeq.current === null; lastSeq.current = s.seq;
    const cues: Cue[] = [];
    const T = s.stageAt;
    if (s.stage === 'break') {
      if (c.sfx?.crack) cues.push({ id: 'crack', key: c.sfx.crack, at: T + 600, label: 'انكسار الختم' });
      if (c.prophecy?.audio) cues.push({ id: 'najwa', key: c.prophecy.audio, at: T + Number(c.prophecy.lead ?? 4) * 1000, label: 'نجوى' });
    }
    if (s.stage === 'cards') {
      if (s.cardIndex === -1 && c.cardsIntro?.audio) cues.push({ id: 'intro', key: c.cardsIntro.audio, at: T + 800, label: 'مقدّمة الكروت' });
      else if (s.cardIndex >= 0 && s.cardIndex > lastCard.current && c.cards?.[s.cardIndex]?.audio)
        cues.push({ id: 'card' + s.cardIndex, key: c.cards[s.cardIndex].audio, at: T + 1000, label: c.cards[s.cardIndex].name });
    }
    if (s.stage === 'draw') {
      if (c.sfx?.draw) cues.push({ id: 'draw', key: c.sfx.draw, at: T, label: 'السحب' });
      if (c.sfx?.win) cues.push({ id: 'win', key: c.sfx.win, at: T + 7000, label: 'الفوز' });
    }
    lastCard.current = s.stage === 'cards' ? s.cardIndex : -2;
    stopAll();
    for (const q of cues) {
      const wait = q.at - serverNow();
      if (wait < -2500) { add(`فات موعده (شغّله يدويّاً إن لزم): ${q.label}`); continue; }
      if (first && wait < 0) { add(`الصفحة فُتحت بعد موعده: ${q.label}`); continue; }
      timers.current.push(setTimeout(() => play(q.key, q.label), Math.max(0, wait)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.seq, armed]);

  if (error === 'auth') return <div className="ctl"><h1>لابتوب الصوت</h1><div className="now">سجّل دخولك بحساب الليدر أوّلاً.</div><Link className="b" style={{ display: 'block', textAlign: 'center', marginTop: 12 }} href="/leader/login">دخول الليدر</Link></div>;
  return (
    <div className="ctl">
      <h1>لابتوب الصوت</h1>
      <div className="now">وصّل هذا اللابتوب بسمّاعات القاعة، واترك الصفحة مفتوحة طول الليلة. التلفازات صامتة.</div>
      {!armed
        ? <button className="next" onClick={() => { for (const a of Object.values(clips.current)) { a.muted = true; a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); } setArmed(true); lastSeq.current = s?.seq ?? null; add('الصوت مفعّل: ينتظر ضغطات الليدر'); }}>تفعيل الصوت</button>
        : <div className="now" style={{ marginTop: 12 }}>✅ الصوت مفعّل · المرحلة الآن: <b>{s?.stage}</b></div>}
      <h2>مستوى الصوت</h2>
      <input type="range" min={0} max={1} step={0.05} value={vol} onChange={e => setVol(Number(e.target.value))} style={{ width: '100%' }} aria-label="مستوى الصوت" />
      <h2>المقاطع</h2>
      <div className="grid">
        {keys.map(k => (
          <button key={k.key} className="b" disabled={loaded[k.key] !== 'ok'} onClick={() => play(k.key, k.label)}>
            {k.label}{loaded[k.key] === 'missing' ? ' (غير موجود)' : loaded[k.key] ? '' : ' (يُحمّل…)'}
          </button>
        ))}
        <button className="b warn" onClick={() => { stopAll(); add('■ أوقفت كلّ الأصوات'); }}>أوقف كلّ الأصوات</button>
      </div>
      <div className="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}
