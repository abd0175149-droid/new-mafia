'use client';
// 📺 شاشة التلفاز في ليلة الإطلاق — تتبع حالة السيرفر، والتوقيت كلّه من stageAt بساعة السيرفر
import { useMemo } from 'react';
import { useLaunch, countdown, toAr, cardSrc, type Line, type Card } from '../useLaunch';

const SPIN_S = 7;

function Frame() { return <div className="frame" aria-hidden />; }

function Countdown({ s, now }: { s: any; now: number }) {
  const left = s.breakAt ? new Date(s.breakAt).getTime() - now : null;
  const total = Object.values(s.poll?.counts || {}).reduce((a: number, b: any) => a + Number(b || 0), 0) as number;
  return (
    <>
      <div className="center" style={{ paddingBottom: '17vh' }}>
        <img className="seal breath" src="/launch/seal-intact.webp" alt="" style={{ width: '16vw' }} />
        <div className="tonight">الليلة</div>
        <div className="big ls-gold">الختم يُكسر</div>
        <div className="clock">{left == null ? 'الساعة ٨' : left > 0 ? countdown(left) : 'الآن'}</div>
      </div>
      <div className="qr">
        <img src="/launch/qr-launch.svg" alt="" />
        <div><div className="t1">امسح… واستلم ورقتك المختومة</div><div className="t2">تُفتح على جوّالك لحظة كسر الختم</div></div>
      </div>
      {s.poll?.open && s.poll?.question && (
        <div className="poll">
          <div className="q">{s.poll.question}</div>
          {(s.poll.options || []).map((o: any) => {
            const n = Number(s.poll.counts?.[o.key] || 0); const pct = total ? Math.round((n / total) * 100) : 0;
            return (
              <div className="bar" key={o.key}>
                <div className="lab"><span>{o.label}</span><span>{toAr(pct)}٪</span></div>
                <div className="trk"><div className="fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <div className="tonight" style={{ fontSize: '1.3vw' }}>{toAr(total)} صوتاً · صوّت من الرمز</div>
        </div>
      )}
    </>
  );
}

function Break({ s, e }: { s: any; e: number }) {
  const lines: Line[] = s.prophecy?.lines || [];
  const lead = Number(s.prophecy?.lead ?? 4);
  const t = e - lead;
  const shown = lines.filter(l => l.t <= t);
  const verse = shown.filter(l => l.kind === 'verse');
  const last = shown[shown.length - 1];
  const endT = lines.length ? lines[lines.length - 1].t + 7 : 9999;
  const cracked = e >= 1.3;
  const big = verse.length === 0;
  return (
    <>
      {e >= 1.3 && e < 3.2 && <div className="flash" />}
      <div className="center" style={{ justifyContent: big ? 'center' : 'flex-start', paddingTop: big ? 0 : '5vh' }}>
        {!cracked
          ? <img className={`seal ${e >= 0.6 ? 'crack' : ''}`} src="/launch/seal-intact.webp" alt="" />
          : <img className="seal fadein" src="/launch/seal-broken.webp" alt="" style={{ width: big ? '23vw' : '7vw', transition: 'width 1.2s ease' }} />}
        {e >= 2 && s.title && <div className="wordmark ls-gold fadein" style={{ fontSize: big ? '9vw' : '3.8vw', transition: 'font-size 1.2s ease' }}>{s.title}</div>}
        {verse.length > 0 && <div className="verse" style={{ marginTop: '1.5vh' }}>{verse.map((l, i) => <span key={i}>{l.text}</span>)}</div>}
        {t > endT && s.motto && <div className="motto fadein" style={{ marginTop: '2.5vh' }}>{s.motto}</div>}
      </div>
      {last && last.kind !== 'verse' && t <= endT && <div className="caption" key={last.t}>{last.text}</div>}
    </>
  );
}

function Cards({ s, e }: { s: any; e: number }) {
  const cards: Card[] = s.cards || [];
  const total = Number(s.cardsTotal || 5);
  const cur = s.cardIndex >= 0 ? cards[s.cardIndex] : null;
  const row = (
    <div className="row">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`mini ${cards[i] ? '' : ''}`} style={i === s.cardIndex ? { outline: '.2vw solid #E7CD86', outlineOffset: '.3vw' } : undefined}>
          {cards[i] ? <img src={cardSrc(cards[i].image)} alt="" /> : <div className="cardback" style={{ position: 'absolute', inset: 0, borderRadius: '.6vw' }}><img src="/launch/logo-gold.svg" alt="" /></div>}
        </div>
      ))}
    </div>
  );
  if (!cur) {
    return (
      <>
        <div className="center" style={{ paddingBottom: '18vh' }}>
          <div className="big ls-gold fadein" style={{ fontSize: '6vw' }}>{toAr(total)} كروت جديدة</div>
          {s.cardsIntro?.text && <div className="caption" style={{ position: 'static', marginTop: '4vh', maxWidth: '70vw' }}>{s.cardsIntro.text}</div>}
        </div>
        {row}
      </>
    );
  }
  return (
    <>
      <div className="cardstage">
        <div className="flip" key={cur.key}>
          <div className="in">
            <div className="face"><img src={cardSrc(cur.image)} alt={cur.name} /></div>
            <div className="back cardback"><img src="/launch/logo-gold.svg" alt="" /></div>
          </div>
        </div>
        <div className="cinfo" key={cur.key + '-i'}>
          <div className="nm ls-gold fadein" style={{ animationDelay: '.6s' }}>{cur.name}</div>
          <div className="sl fadein" style={{ animationDelay: '1.1s' }}>{cur.slogan}</div>
          <div className="tx fadein" style={{ animationDelay: '1.8s' }}>{cur.text}</div>
          {cur.entry && <div className="en fadein" style={{ animationDelay: '2.4s' }}>{cur.entry}</div>}
        </div>
      </div>
      {row}
    </>
  );
}

function Lineup({ s }: { s: any }) {
  const cards: Card[] = s.cards || [];
  return (
    <div className="lineup">
      <div className="big ls-gold" style={{ fontSize: '4.6vw' }}>كروت الموسم الجديد</div>
      <div className="cards">
        {cards.map((c, i) => (
          <div className="c" key={c.key} style={{ animationDelay: `${i * 0.18}s` }}>
            <img src={cardSrc(c.image)} alt={c.name} />
            <div className="n">{c.name}</div>
            {c.entry && <div className="e">{c.entry}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Predict({ s, e }: { s: any; e: number }) {
  const p = s.predict || {};
  const closed = s.stage !== 'predict';
  const answer = p.answer;
  return (
    <>
      <div className="center" style={{ paddingBottom: closed ? 0 : '10vh' }}>
        <div className="tonight">{closed ? (answer ? 'وتحقّقت النبوءة' : 'أُغلق باب النبوءات') : 'اكتب نبوءتك'}</div>
        <div className="pq ls-gold" style={{ marginTop: '2vh' }}>{p.question}</div>
        <div className="opts">
          {(p.options || []).map((o: any) => (
            <div key={o.key} className={`opt ${answer ? (answer === o.key ? 'win' : 'lose') : ''}`}>{o.label}</div>
          ))}
        </div>
        <div className="count">
          {answer ? <>صدقت نبوءة <b>{toAr(p.correct || 0)}</b> من <b>{toAr(p.count || 0)}</b></> : <><b>{toAr(p.count || 0)}</b> نبوءة مختومة</>}
        </div>
      </div>
      {!closed && (
        <div className="qr">
          <img src="/launch/qr-launch.svg" alt="" />
          <div><div className="t1">امسح… واكتب نبوءتك</div><div className="t2">من صدقت نبوءته يدخل السحب</div></div>
        </div>
      )}
    </>
  );
}

function Draw({ s, e }: { s: any; e: number }) {
  const names: string[] = s.drawNames?.length ? s.drawNames : [s.winner?.name || ''];
  const done = e >= SPIN_S;
  const N = 46; const k = Math.min(N, Math.floor(N * (1 - Math.pow(1 - Math.min(1, e / SPIN_S), 2.4))));
  const name = done ? s.winner?.name : names[(k * 7) % names.length];
  return (
    <div className="center">
      <div className="tonight">{done ? 'صاحب النبوءة' : 'السحب بين من صدقت نبوءتهم'}</div>
      <div className={`spin ${done ? 'ls-gold fadein' : ''}`} style={{ marginTop: '3vh' }} key={done ? 'w' : 's'}>{name}</div>
      {done && <div className="prize fadein">{s.predict?.prize || 'مبروك'}</div>}
    </div>
  );
}

export default function LaunchTV() {
  const { state: s, serverNow, error } = useLaunch<any>(600);
  const now = serverNow();
  const e = s ? (now - s.stageAt) / 1000 : 0;
  const view = useMemo(() => s?.stage, [s?.stage]);
  if (!s) return <div className="tv"><Frame /><div className="center"><div className="club">{error ? 'جارٍ الاتّصال…' : ''}</div></div></div>;
  return (
    <div className="tv" key={view}>
      <Frame />
      {s.stage === 'idle' && <div className="center"><img className="logo" src="/launch/logo-gold.svg" alt="" /><div className="club" style={{ marginTop: '2vh' }}>نادي المافيا</div></div>}
      {s.stage === 'countdown' && <Countdown s={s} now={now} />}
      {s.stage === 'break' && <Break s={s} e={e} />}
      {s.stage === 'cards' && <Cards s={s} e={e} />}
      {s.stage === 'lineup' && <Lineup s={s} />}
      {(s.stage === 'predict' || s.stage === 'predict_closed' || s.stage === 'result') && <Predict s={s} e={e} />}
      {s.stage === 'draw' && <Draw s={s} e={e} />}
      {s.stage === 'end' && (
        <div className="center">
          <img className="seal" src="/launch/seal-broken.webp" alt="" style={{ width: '14vw' }} />
          {s.title && <div className="wordmark ls-gold">{s.title}</div>}
          {s.motto && <div className="motto">{s.motto}</div>}
          {s.end?.text && <div className="caption" style={{ position: 'static', marginTop: '4vh' }}>{s.end.text}</div>}
        </div>
      )}
    </div>
  );
}
