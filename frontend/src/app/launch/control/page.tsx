'use client';
// 🎛️ جهاز التحكّم في ليلة الإطلاق (حساب الأدمن فقط):
// أضواء الحالة (التلفازات، لابتوب الصوت، الضيوف) · زرّ «التالي» الكبير يُقفل أثناء كلام نجوى والراوي
// ويُفتح بالضغط المطوّل · ضغطتان للّحظات الحسّاسة · رجوع وإعادة المقطع · المتقدّم مطويّ في الأسفل.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLaunch, staffToken, toAr, API } from '../useLaunch';

const STAGE_AR: Record<string, string> = {
  idle: 'قبل البداية', countdown: 'العدّ التنازليّ', break: 'كسر الختم والنبوءة', cards: 'كشف الكروت', lineup: 'الكروت معاً',
  predict: 'باب النبوءات مفتوح', predict_closed: 'باب النبوءات مغلق', result: 'النبوءة الصحيحة', draw: 'السحب', end: 'ختام الليلة',
};
const HOLD_MS = 2000;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return toAr(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); };

/** نافذة المقطع الذي يشتغل الآن (يُقفل فيها «التالي») */
function clipLock(s: any): { until: number; label: string } | null {
  if (!s || s.lastAction === 'back') return null;
  const c = s.content || {}; const T = s.stageAt;
  if (s.stage === 'break') return { until: T + (Number(c.prophecy?.lead ?? 4) + Number(c.prophecy?.dur || 74) + 1) * 1000, label: 'نجوى تتكلّم' };
  if (s.stage === 'cards') {
    if (s.cardIndex < 0) return { until: T + (0.8 + Number(c.cardsIntro?.dur || 10)) * 1000, label: 'الراوي يقدّم الكروت' };
    return { until: T + (1 + Number(c.cards?.[s.cardIndex]?.dur || 18)) * 1000, label: 'الراوي يشرح الكرت' };
  }
  if (s.stage === 'draw') return { until: T + 7500, label: 'الأسماء تدور' };
  return null;
}

export default function LaunchControl() {
  const { state: s, error, refresh, serverNow } = useLaunch<any>(900, true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const armT = useRef<any>(null);
  const [hold, setHold] = useState(0);
  const holdT = useRef<any>(null);
  const [wipe, setWipe] = useState(false);
  useEffect(() => () => { clearTimeout(armT.current); clearInterval(holdT.current); }, []);

  async function send(action: string, extra: any = {}) {
    setArmed(null); setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/launch-show/control`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken()}` }, body: JSON.stringify({ action, ...extra }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'لم يُنفَّذ الأمر');
      await refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  /** ضغطتان: الأولى تسلّح الزرّ ٣٫٥ ثانية، والثانية تنفّذ */
  function twice(key: string, run: () => void) {
    if (armed !== key) { setArmed(key); clearTimeout(armT.current); armT.current = setTimeout(() => setArmed(null), 3500); return; }
    run();
  }

  if (error === 'auth') {
    return <div className="ctl"><h1>جهاز التحكّم</h1><div className="now">هذه الصفحة لحساب الأدمن في لوحة التحكّم فقط. سجّل دخولك به، وترجع لهنا وحدها.</div>
      <Link className="b" style={{ display: 'block', textAlign: 'center', marginTop: 12 }} href="/admin/login?next=/launch/control">دخول الأدمن</Link></div>;
  }
  if (!s) return <div className="ctl"><h1>جهاز التحكّم</h1><div className="now">{error || 'جارٍ الاتّصال…'}</div></div>;

  const c = s.content || {};
  const cards: any[] = c.cards || [];
  const opts: any[] = c.predict?.options || [];
  const k = s.counts || {};
  const pr = s.presence || {};
  const now = serverNow();
  const lock = clipLock(s);
  const locked = !!lock && now < lock.until;

  // الخطوة التالية
  let next: { key: string; label: string; run: () => void; confirm?: boolean } | null = null;
  switch (s.stage) {
    case 'idle': next = { key: 'cd', label: 'ابدأ العدّ التنازليّ', run: () => send('goto', { stage: 'countdown' }) }; break;
    case 'countdown': next = { key: 'break', label: 'اكسر الختم', run: () => send('goto', { stage: 'break' }), confirm: true }; break;
    case 'break': next = { key: 'cards', label: 'ابدأ كشف الكروت', run: () => send('card_next') }; break;
    case 'cards': { const i = s.cardIndex + 1; next = i < cards.length ? { key: 'c' + i, label: `اكشف: ${cards[i]?.name || `الكرت ${toAr(i + 1)}`}`, run: () => send('card_next') } : { key: 'lu', label: 'اعرض الكروت معاً', run: () => send('card_next') }; break; }
    case 'lineup': next = { key: 'po', label: 'افتح باب النبوءات', run: () => send('goto', { stage: 'predict' }) }; break;
    case 'predict': next = { key: 'pc', label: 'أغلق باب النبوءات', run: () => send('goto', { stage: 'predict_closed' }), confirm: true }; break;
    case 'result': next = { key: 'dr', label: 'اسحب الفائز', run: () => send('draw'), confirm: true }; break;
    case 'draw': next = { key: 'end', label: 'اختم الليلة', run: () => send('goto', { stage: 'end' }) }; break;
  }
  const hasClip = ['break', 'cards', 'draw'].includes(s.stage);

  function press() {
    if (!next || busy) return;
    if (locked) return;
    if (next.confirm) twice(next.key, next.run); else next.run();
  }
  function holdStart() {
    if (!next || !locked) return;
    const t0 = Date.now(); clearInterval(holdT.current);
    holdT.current = setInterval(() => { const p = (Date.now() - t0) / HOLD_MS; setHold(Math.min(1, p)); if (p >= 1) { clearInterval(holdT.current); setHold(0); next?.run(); } }, 50);
  }
  function holdEnd() { clearInterval(holdT.current); setHold(0); }

  const sub = s.stage === 'cards' ? (s.cardIndex < 0 ? 'المقدّمة' : `${cards[s.cardIndex]?.name || ''} · ${toAr(s.cardIndex + 1)} من ${toAr(cards.length)}`) : '';
  const soundTxt = !pr.sound?.alive ? 'غير متّصل' : pr.sound.playing ? `يشغّل ${pr.sound.playing}` : 'جاهز';

  return (
    <div className="ctl rc">
      <div className="lights">
        <div className={`lt ${pr.tvs ? 'ok' : 'off'}`}><i />التلفازات: <b>{toAr(pr.tvs || 0)}</b> متّصلة</div>
        <div className={`lt ${!pr.sound?.alive ? 'bad' : pr.sound.playing ? 'busy' : 'ok'}`}><i />الصوت: <b>{soundTxt}</b></div>
        <div className={`lt ${pr.guests ? 'ok' : 'off'}`}><i />الضيوف: <b>{toAr(pr.guests || 0)}</b> فاتحين الصفحة</div>
      </div>

      <div className="stg"><b>{STAGE_AR[s.stage] || s.stage}</b>{sub && <span>{sub}</span>}</div>
      {!s.hasContent && <div className="err">المحتوى غير محمّل بعد على السيرفر.</div>}

      {s.stage === 'predict_closed' ? (
        <div className="answers">
          <div className="hint">بعد انتهاء أوّل لعبة: من فاز؟ (ضغطتان)</div>
          <div className="two">{opts.map(o => <button key={o.key} type="button" className={`gob sm ${armed === 'a-' + o.key ? 'armed' : ''}`} disabled={busy} onClick={() => twice('a-' + o.key, () => send('answer', { answer: o.key }))}>{armed === 'a-' + o.key ? 'مرّة ثانية' : o.label}</button>)}</div>
        </div>
      ) : next ? (
        <div className="gowrap">
          <button type="button" className={`gob ${locked ? 'lock' : ''} ${armed === next.key ? 'armed' : ''}`} disabled={busy}
            style={locked ? { background: `conic-gradient(rgba(231,205,134,.85) 0 ${hold * 100}%, transparent ${hold * 100}% 100%), radial-gradient(circle at 50% 35%,#3a2c1c,#1a130c)` } : undefined}
            onClick={press} onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={ev => ev.preventDefault()}>
            {locked ? <><span className="l1">مقفل</span><span className="l2">{lock!.label}</span><span className="l3">{mmss(lock!.until - now)}</span></>
              : <span className="l1">{armed === next.key ? 'اضغط مرّة ثانية' : 'التالي'}</span>}
          </button>
          <div className="nxl">{locked ? 'اضغط مطوّلاً ثانيتين للتجاوز' : next.label}{!locked && next.confirm ? ' · ضغطتان' : ''}</div>
        </div>
      ) : <div className="gowrap"><div className="gob lock"><span className="l1">انتهت الليلة</span></div></div>}

      <div className="row2">
        <button type="button" className="b" disabled={busy || s.stage === 'idle'} onClick={() => twice('back', () => send('back'))}>{armed === 'back' ? 'اضغط للتأكيد' : 'رجوع'}</button>
        <button type="button" className="b" disabled={busy || !hasClip} onClick={() => twice('replay', () => send('replay'))}>{armed === 'replay' ? 'اضغط للتأكيد' : 'إعادة المقطع'}</button>
      </div>
      {err && <div className="err">{err}</div>}

      {s.stage === 'countdown' && (
        <div className="panel">
          <div className="pt">سؤال الانتظار</div>
          <button type="button" className={`b ${s.pollOpen ? 'on' : ''}`} disabled={busy} onClick={() => send('poll', { open: !s.pollOpen })}>{s.pollOpen ? 'أغلق التصويت' : 'افتح التصويت'}</button>
          <div className="stat">{(c.poll?.options || []).map((o: any) => `${o.label}: ${toAr(k.poll?.[o.key] || 0)}`).join(' · ')}</div>
        </div>
      )}
      {['predict', 'predict_closed', 'result', 'draw'].includes(s.stage) && (
        <div className="panel">
          <div className="pt">النبوءات: {toAr(k.predictions || 0)}</div>
          <div className="stat">{opts.map(o => `${o.label}: ${toAr(k.byChoice?.[o.key] || 0)}`).join(' · ')}</div>
          {s.winner && <div className="stat">الفائز: <b>{s.winner.name}</b> · <span dir="ltr">{s.winner.phone}</span></div>}
          {s.stage === 'draw' && <button type="button" className="b" disabled={busy} onClick={() => twice('redraw', () => send('draw', { redraw: true }))}>{armed === 'redraw' ? 'اضغط للتأكيد' : 'أعد السحب (يستبعد الفائز)'}</button>}
        </div>
      )}

      <details className="adv">
        <summary>متقدّم</summary>
        <div className="grid">
          {(s.stages || []).map((st: string) => (
            <button key={st} type="button" className={`b ${st === s.stage ? 'on' : ''}`} disabled={busy || st === s.stage || st === 'result' || st === 'draw'}
              onClick={() => twice('go-' + st, () => send('goto', { stage: st }))}>{armed === 'go-' + st ? 'اضغط للتأكيد' : STAGE_AR[st]}</button>
          ))}
        </div>
        <label className="stat" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" checked={wipe} onChange={ev => setWipe(ev.target.checked)} /> امسح الأصوات والنبوءات أيضاً
        </label>
        <button type="button" className="b warn" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={() => twice('reset', () => send('reset', { wipe }))}>
          {armed === 'reset' ? 'اضغط مرّة ثانية: يرجع كلّ شيء للبداية' : 'ارجع للبداية (للتجارب)'}
        </button>
        <div className="stat" style={{ marginTop: 10 }}>التلفازات: <span dir="ltr">/launch/tv</span> · الصوت: <span dir="ltr">/launch/sound</span> · الضيوف: <span dir="ltr">/launch</span></div>
      </details>
    </div>
  );
}
