'use client';
// 🎛️ أزرار الليدر في ليلة الإطلاق — زرّ «التالي» كبير، وتحته التحكّم الكامل
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLaunch, staffToken, toAr, API } from '../useLaunch';

const STAGE_AR: Record<string, string> = {
  idle: 'قبل البداية', countdown: 'العدّ التنازليّ', break: 'كسر الختم والنبوءة', cards: 'كشف الكروت', lineup: 'الكروت معاً',
  predict: 'باب النبوءات مفتوح', predict_closed: 'باب النبوءات مغلق', result: 'إعلان النبوءة الصحيحة', draw: 'السحب', end: 'ختام الليلة',
};

export default function LaunchControl() {
  const { state: s, error, refresh } = useLaunch<any>(1000, true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const armT = useRef<any>(null);
  const [wipe, setWipe] = useState(false);

  useEffect(() => () => clearTimeout(armT.current), []);

  async function send(action: string, extra: any = {}, confirmKey?: string) {
    if (confirmKey && armed !== confirmKey) {
      setArmed(confirmKey); clearTimeout(armT.current); armT.current = setTimeout(() => setArmed(null), 3500); return;
    }
    setArmed(null); setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/launch-show/control`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken()}` },
        body: JSON.stringify({ action, ...extra }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'لم يُنفَّذ الأمر');
      await refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (error === 'auth') {
    return <div className="ctl"><h1>أزرار الليلة</h1><div className="now">هذه الصفحة لحساب الأدمن في لوحة التحكّم فقط. سجّل دخولك به، وترجع لهنا وحدها.</div>
      <Link className="b" style={{ display: 'block', textAlign: 'center', marginTop: 12 }} href="/admin/login?next=/launch/control">دخول الأدمن</Link></div>;
  }
  if (!s) return <div className="ctl"><h1>أزرار الليلة</h1><div className="now">{error || 'جارٍ التحميل…'}</div></div>;

  const c = s.content || {};
  const cards: any[] = c.cards || [];
  const opts: any[] = c.predict?.options || [];
  const k = s.counts || {};
  let next: { label: string; run: () => void; confirm?: string } | null = null;
  switch (s.stage) {
    case 'idle': next = { label: 'ابدأ العدّ التنازليّ', run: () => send('goto', { stage: 'countdown' }) }; break;
    case 'countdown': next = { label: 'اكسر الختم', run: () => send('goto', { stage: 'break' }, 'break'), confirm: 'break' }; break;
    case 'break': next = { label: 'ابدأ كشف الكروت', run: () => send('card_next') }; break;
    case 'cards': {
      const i = s.cardIndex + 1;
      next = i < cards.length ? { label: `اكشف: ${cards[i]?.name || `الكرت ${toAr(i + 1)}`}`, run: () => send('card_next') }
        : { label: 'اعرض الكروت كلّها معاً', run: () => send('card_next') };
      break;
    }
    case 'lineup': next = { label: 'افتح باب النبوءات', run: () => send('goto', { stage: 'predict' }) }; break;
    case 'predict': next = { label: 'أغلق باب النبوءات', run: () => send('goto', { stage: 'predict_closed' }, 'close'), confirm: 'close' }; break;
    case 'result': next = { label: 'اسحب الفائز', run: () => send('draw', {}, 'draw'), confirm: 'draw' }; break;
    case 'draw': next = { label: 'اختم الليلة', run: () => send('goto', { stage: 'end' }) }; break;
  }

  return (
    <div className="ctl">
      <h1>أزرار الليلة</h1>
      {!s.hasContent && <div className="err">المحتوى غير محمّل بعد على السيرفر.</div>}
      <div className="now">
        الآن: <b>{STAGE_AR[s.stage] || s.stage}</b>
        {s.stage === 'cards' && <> · {s.cardIndex < 0 ? 'المقدّمة' : `${cards[s.cardIndex]?.name || ''} (${toAr(s.cardIndex + 1)} من ${toAr(cards.length)})`}</>}
        <div className="stat">النبوءات: {toAr(k.predictions || 0)}{opts.map(o => ` · ${o.label}: ${toAr(k.byChoice?.[o.key] || 0)}`).join('')}</div>
        {s.winner && <div className="stat">الفائز: <b>{s.winner.name}</b> · <span dir="ltr">{s.winner.phone}</span></div>}
      </div>

      {next && (
        <button className="next" disabled={busy} onClick={next.run}>
          {next.confirm && armed === next.confirm ? 'اضغط مرّة ثانية للتأكيد' : next.label}
        </button>
      )}
      {s.stage === 'predict_closed' && (
        <>
          <h2>ما النبوءة الصحيحة؟</h2>
          <div className="grid">{opts.map(o => <button key={o.key} className="b" disabled={busy} onClick={() => send('answer', { answer: o.key }, 'ans-' + o.key)}>{armed === 'ans-' + o.key ? 'اضغط للتأكيد' : o.label}</button>)}</div>
        </>
      )}
      {err && <div className="err">{err}</div>}

      {s.stage === 'countdown' && (
        <>
          <h2>سؤال الانتظار</h2>
          <div className="grid">
            <button className={`b ${s.pollOpen ? 'on' : ''}`} disabled={busy} onClick={() => send('poll', { open: !s.pollOpen })}>{s.pollOpen ? 'أغلق التصويت' : 'افتح التصويت'}</button>
            <div className="stat" style={{ alignSelf: 'center' }}>{(c.poll?.options || []).map((o: any) => `${o.label}: ${toAr(k.poll?.[o.key] || 0)}`).join(' · ')}</div>
          </div>
        </>
      )}

      <h2>رجوع وتصحيح</h2>
      <div className="grid">
        {(s.stage === 'cards' || s.stage === 'lineup') && <button className="b" disabled={busy} onClick={() => send('card_prev')}>الكرت السابق</button>}
        {s.stage === 'draw' && <button className="b" disabled={busy} onClick={() => send('draw', { redraw: true }, 'redraw')}>{armed === 'redraw' ? 'اضغط للتأكيد' : 'أعد السحب (استبعد الفائز)'}</button>}
        {(s.stages || []).map((st: string) => (
          <button key={st} className={`b ${st === s.stage ? 'on' : ''}`} disabled={busy || st === s.stage || st === 'result' || st === 'draw'}
            onClick={() => send('goto', { stage: st }, 'go-' + st)}>{armed === 'go-' + st ? 'اضغط للتأكيد' : STAGE_AR[st]}</button>
        ))}
      </div>

      <h2>تجربة</h2>
      <label className="stat" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} /> امسح الأصوات والنبوءات أيضاً
      </label>
      <button className="b warn" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={() => send('reset', { wipe }, 'reset')}>
        {armed === 'reset' ? 'اضغط مرّة ثانية: يرجع كلّ شيء للبداية' : 'ارجع للبداية'}
      </button>
      <div className="stat" style={{ marginTop: 14 }}>الشاشات: <span dir="ltr">club.masaros.net/launch/tv</span> · الصوت: <span dir="ltr">/launch/sound</span> · الضيوف: <span dir="ltr">/launch</span></div>
    </div>
  );
}
