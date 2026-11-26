'use client';
// ══════════════════════════════════════════════════════
// 🔮 موسم النبوءة داخل «الظرف» (مهامّي) — لا يُرسم إلّا وهو مفتوح
//
// القاعدة المقفلة: الشاشة واحدةٌ لكلّ الأدوار، وما يخصّ الدور داخل الظرف وحده. هنا:
//   العرّاف   الصندوقان «أ» و«ب» ليلاً (ب٢)، وما رآه صباحاً، و«حقّ الشكّ» قبل التصويت
//   المُضلّل  أقنعته، وخبرُ «احترق قناعك» دون من قرأه (قرار ١٧)
//   القارئة  صدقُها وعتبتها، و«الفنجان المكشوف» مرّةً، وختمُ قدر الغد بعد رحيلها (ب٣)
//   المنقسم  الاختيار في الليلة الثانية بتأكيد — نهائيّ
//   الكفيل   تذكيرٌ: يقف ويقول «أكفله» بعد الفرز، والموجّه يسجّلها (ب٥)
// الحالة من room:get-my-state (حالةٌ لا حدث — تنجو من إعادة التحميل). وكلّ فعلٍ يرسل مقعدَه
// من المقبس لا من الطلب (الخادم يتحقّق)، ثمّ يُعاد الجلب.
// ══════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';

export interface ProphecyApi {
  fetchState: () => Promise<any>;
  send: (event: string, data: any) => Promise<any>;
}
interface Person { physicalId: number; name: string; isAlive?: boolean }

const BOX = (b: any) => (b === 'B' ? 'ب' : 'أ');
const OUTCOME: Record<string, string> = {
  TRUE: 'صدقت نبوءتك', FALSE: 'كذبت نبوءتك', WITHDRAWN: 'أحرقتها بحقّ الشكّ', VETOED: 'نقضها العمدة',
  GUARANTEED: 'كفل الكفيلُ صاحبها', BURNED_NIGHT: 'احترقت ليلاً', REMOVED: 'أُزيلت', NOT_PASSED: 'لم تمرّ',
};

function Btn({ children, onClick, on, danger, disabled }: { children: any; onClick: () => void; on?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`min-h-[46px] rounded-xl border px-2 text-[14px] font-bold disabled:opacity-40 ${on ? 'border-[#C5A059] bg-[#C5A059]/15 text-[#C5A059]' : danger ? 'border-[#d9636a]/60 bg-[#d9636a]/10 text-[#f2a6a9]' : 'border-[#2a241c] bg-black/40 text-[#efe8da]'}`}>
      {children}
    </button>
  );
}

export default function ProphecyTasks({ api, phase, roster, seat }: { api?: ProphecyApi; phase: string | null; roster: Person[]; seat: number }) {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [confirm, setConfirm] = useState<null | 'MAFIA' | 'CITY'>(null);
  const [sealPick, setSealPick] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try { const r = await api.fetchState(); if (r?.success !== false) setSt(r); } catch { /* يبقى ما عُرض */ }
  }, [api]);
  useEffect(() => { void load(); }, [load, phase]);

  const act = async (ev: string, data: any, ok: string) => {
    if (!api || busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.send(ev, data);
      setMsg(r?.success ? ok : (r?.error || 'لم يُقبل — حاول ثانيةً'));
      // 🔇 لا اهتزاز: فعلٌ يخصّ دوراً وحده لا يُسمع حول الطاولة
      await load();
    } catch (e: any) { setMsg(e?.message || 'الاتصال ضعيف — حاول ثانيةً'); }
    finally { setBusy(false); }
  };

  if (!st) return null;
  const o = st.oracleNotice, d = st.deceiverNotice, c = st.cupNotice, dv = st.dividedNotice, g = st.guarantorNotice;
  if (!o && !d && !c && !dv && !g) return null;
  const nameOf = (s: any) => roster.find(p => p.physicalId === Number(s))?.name || '';
  const night = phase === 'NIGHT';

  return (
    <>
      {o && (
        <div className="pr-blk"><h5>📜 النبوءة</h5>
          {!o.used && o.canOpenTonight && (
            <>
              <p>صندوقان الليلة: في أحدهما مافيا وفي الآخر بريء. اختر واحداً — ترى الاسم صباحاً، ويصير صفقةً أولى في النهار بلا اسمك.</p>
              <div className="grid grid-cols-3 gap-1.5">
                <Btn on={o.pendingBox === 'A'} disabled={busy} onClick={() => act('oracle:open', { box: 'A' }, 'اخترت الصندوق «أ»')}>الصندوق «أ»</Btn>
                <Btn on={o.pendingBox === 'B'} disabled={busy} onClick={() => act('oracle:open', { box: 'B' }, 'اخترت الصندوق «ب»')}>الصندوق «ب»</Btn>
                <Btn on={!o.pendingBox} disabled={busy} onClick={() => act('oracle:open', { box: null }, 'لا الليلة')}>لا الليلة</Btn>
              </div>
            </>
          )}
          {!o.used && !o.canOpenTonight && <p>نبوءتك مرّةً في اللعبة — تُفتح من الليلة الثانية.</p>}
          {o.used && o.seenPhysicalId != null && <p>فتحت الصندوق «{BOX(o.chosenBox)}»: <b>#{o.seenPhysicalId} {o.seenName}</b></p>}
          {o.outcome && <p>{OUTCOME[o.outcome] || o.outcome}</p>}
          {o.canWithdraw && (
            <>
              <p>حقّ الشكّ: إن شككت في نبوءتك فاحرقها قبل أن يُفتح التصويت.</p>
              <Btn danger disabled={busy} onClick={() => act('oracle:withdraw', {}, 'أُحرقت نبوءتك')}>احرق نبوءتي</Btn>
            </>
          )}
        </div>
      )}

      {d && (
        <div className="pr-blk"><h5>🎭 القناع</h5>
          <p>{d.masksLeft > 0 ? `بقي لك ${d.masksLeft === 2 ? 'قناعان' : 'قناعٌ واحد'} — تضعه من اختيار الليل على من ليس مافيا.` : 'وضعت أقنعتك.'}</p>
          {(d.masks || []).map((m: any, i: number) => (
            <p key={i}>#{m.targetPhysicalId} {nameOf(m.targetPhysicalId)} — {m.burned ? `احترق${m.burnedRound ? ` (الجولة ${m.burnedRound})` : ''}` : 'قائم'}</p>
          ))}
          {d.maskBurnedRound && <p>⚠️ احترق قناعك — قرأه أحدهم، ولا تعرف من.</p>}
        </div>
      )}

      {c && (
        <div className="pr-blk"><h5>☕ الفنجان</h5>
          <p>صدقت {c.hits} من {c.threshold}{c.hitSeats?.length ? ` (${c.hitSeats.join('، ')})` : ''}.{c.lastRead ? ` آخر قراءة: #${c.lastRead.targetPhysicalId} ${nameOf(c.lastRead.targetPhysicalId)}${c.lastRead.isPublic ? ' — مكشوفة' : ''}.` : ''}</p>
          {!c.departed && night && !c.publicUsed && (
            <>
              <p>الفنجان المكشوف مرّةً في اللعبة: قراءة الليلة تظهر صباحاً على الشاشة بلا اسمك.</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Btn on={!c.pendingPublic} disabled={busy} onClick={() => act('cup:public', { on: false }, 'قراءةٌ خفيّة')}>خفيّة</Btn>
                <Btn on={!!c.pendingPublic} disabled={busy} onClick={() => act('cup:public', { on: true }, 'الفنجان مكشوفٌ الليلة')}>🫖 اكشفها</Btn>
              </div>
            </>
          )}
          {c.departed && <p>رحلتِ فائزة. {c.sealOutcome === 'EXECUTED' ? 'نُفّذ ختمك.' : c.sealOutcome === 'BURNED' ? 'احترق ختمك.' : ''}</p>}
          {c.canSealTonight && (
            <>
              <p>قدر الغد: اختمي اسماً — يُعدم أوّل النهار بلا تصويت.</p>
              <div className="grid grid-cols-4 gap-1.5">
                {roster.filter(p => p.isAlive !== false && p.physicalId !== seat).map(p => (
                  <Btn key={p.physicalId} on={sealPick === p.physicalId || c.sealPhysicalId === p.physicalId} disabled={busy} onClick={() => setSealPick(p.physicalId)}>{p.physicalId}</Btn>
                ))}
              </div>
              {sealPick != null && sealPick !== c.sealPhysicalId && (
                <Btn danger disabled={busy} onClick={() => act('cup:seal', { target: sealPick }, `خُتم #${sealPick}`)}>أكّدي ختم #{sealPick} {nameOf(sealPick)}</Btn>
              )}
            </>
          )}
        </div>
      )}

      {dv && (
        <div className="pr-blk"><h5>⚖️ الانقسام</h5>
          {dv.canChooseNow ? (
            <>
              <p>الليلة تختار، والاختيار نهائيّ: تعبر إلى المافيا فتعرفهم ويعرفونك وتشارك اغتيال الليلة، أو تبقى مع المدينة لا تعرف أحداً.</p>
              {!confirm ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <Btn disabled={busy} onClick={() => setConfirm('MAFIA')}>أعبر إلى المافيا</Btn>
                  <Btn disabled={busy} onClick={() => setConfirm('CITY')}>أبقى مع المدينة</Btn>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <Btn danger disabled={busy} onClick={() => act('divided:choose', { side: confirm }, confirm === 'MAFIA' ? 'عبرت إلى المافيا' : 'بقيت مع المدينة')}>
                    أكّد: {confirm === 'MAFIA' ? 'المافيا' : 'المدينة'}
                  </Btn>
                  <Btn disabled={busy} onClick={() => setConfirm(null)}>تراجع</Btn>
                </div>
              )}
            </>
          ) : dv.choice ? (
            <p>{dv.choice === 'MAFIA' ? 'عبرتَ إلى المافيا.' : dv.defaulted ? 'لم تختر — بقيت مع المدينة.' : 'اخترتَ المدينة.'}</p>
          ) : <p>تختار جانبك في الليلة الثانية — حتّى ذلك أنت مع المدينة.</p>}
        </div>
      )}

      {g && (
        <div className="pr-blk"><h5>🤝 الكفالة</h5>
          <p>{g.used ? (g.outcome === 'SAVED' ? 'كفلتَ بريئاً فنجا.' : 'استُعملت كفالتك.') : 'مرّةً في اللعبة: بعد فرز التصويت وقبل الإعدام قف وقل «أكفله». إن كان بريئاً نجا، وإن لم يكن متَّ معه.'}</p>
        </div>
      )}

      {msg && <p className="text-center text-[13px] text-[#C5A059]">{msg}</p>}
    </>
  );
}
