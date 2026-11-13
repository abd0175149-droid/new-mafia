'use client';

// ══════════════════════════════════════════════════════
// 📨 «تابع من لم يصل» — معاينةٌ ثمّ إرسال
//
// الخادم يقرّر من يُراسَل ومن لا سبيل إليه (GET /followup/preview)، والنافذة تعرض قراره
// قبل أن تخرج رسالةٌ واحدة: من سيستلم، من يحتاج اتّصالاً ولماذا، والنصّ كما يصل.
//
// 🔴 «في الطريق ووقتهم لم يحن» مطفأةٌ افتراضاً: من قال «ربع ساعة» ولم تمضِ لا يُزعَج.
// 🔴 الإرسال لا يعلّم أحداً «وصل» ولا «لن يحضر» — هو سؤالٌ فقط، والدون يسجّل الوقت من الردّ.
// ══════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import { Bot, ChevronDown, Pencil, Send, TriangleAlert } from 'lucide-react';
import { apiFetch } from '@/hooks/useReservations';
import { swalAlert, swalToast } from '@/lib/swal';
import { Badge, Banner, Pop, Setting, Skel, Toggle } from '@/app/admin/whatsapp/wa-ui';
import { hm, num } from './arrival';

type Grp = 'silent' | 'late' | 'onway';
interface Recipient {
  reservationId: number; name: string | null; phone: string | null; people?: number | null;
  group: Grp; etaAt?: string | null; reachable: boolean; channel?: 'cloud' | 'web' | null; reason?: string | null;
}
interface Preview {
  text: string;
  activity?: { id: number; name: string; date?: string | null } | null;
  recipients: Recipient[];
}

/** أسباب التعذّر: الخادم قد يرسل جملةً جاهزة أو رمزاً — الرمز المعروف يُترجم والباقي يُعرض كما هو */
const REASONS: Record<string, string> = {
  no_phone: 'بلا رقم', invalid_phone: 'رقم غير صالح', no_chat: 'بلا محادثة واتساب', no_conversation: 'بلا محادثة واتساب',
  outside_window: 'خارج نافذة 24 ساعة', window_closed: 'خارج نافذة 24 ساعة', opt_out: 'طلب عدم المراسلة',
  opted_out: 'طلب عدم المراسلة', already_sent: 'أُرسلت له قبل قليل', no_channel: 'لا قناة إرسال متاحة',
  not_found: 'الحجز غير موجود', arrived: 'وصل', declined: 'اعتذر',
};
export const reasonAr = (r: string | null | undefined) => (r ? (REASONS[r] || r) : 'تعذّر الوصول إليه');

const who = (r: Recipient) => r.name || r.phone || `#${r.reservationId}`;
const fill = (text: string, name: string, act: string) =>
  text.replace(/\{الاسم\}/g, name).replace(/\{الفعالي[ّ]?ة\}/g, act);

export default function FollowupPop({ activityId, onClose, onSent, onUnavailable }: {
  activityId: number;
  onClose: () => void;
  /** بعد إرسالٍ ناجح — الصفحة تعيد الجلب */
  onSent: () => void;
  /** الخادم لا يعرف النقطة بعد (404) — الصفحة تُخفي الزرّ */
  onUnavailable: () => void;
}) {
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState('');
  const [on, setOn] = useState<Record<Grp, boolean>>({ silent: true, late: true, onway: false });
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await apiFetch(`/api/reservations/followup/preview?activityId=${activityId}`);
        if (!alive) return;
        setPv({ text: String(d?.text || ''), activity: d?.activity ?? null, recipients: Array.isArray(d?.recipients) ? d.recipients : [] });
        setText(String(d?.text || ''));
      } catch (e: any) {
        if (!alive) return;
        if (e?.status === 404) { onUnavailable(); swalToast('المتابعة غير متاحة على الخادم بعد', 'info'); onClose(); return; }
        setErr(e?.message || 'تعذّر تجهيز المعاينة');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  const by = useMemo(() => {
    const g: Record<Grp, Recipient[]> = { silent: [], late: [], onway: [] };
    for (const r of pv?.recipients || []) (g[r.group] || g.silent).push(r);
    return g;
  }, [pv]);

  const chosen = useMemo(() => (pv?.recipients || []).filter(r => on[r.group] ?? true), [pv, on]);
  const targets = chosen.filter(r => r.reachable);
  const unreachable = chosen.filter(r => !r.reachable);
  const cloud = targets.filter(r => r.channel === 'cloud').length;
  const web = targets.filter(r => r.channel === 'web').length;
  const edited = !!pv && text.trim() !== pv.text.trim();
  const sample = targets[0];

  const send = async () => {
    if (!targets.length || sending || !text.trim()) return;
    setSending(true);
    try {
      const d = await apiFetch('/api/reservations/followup', {
        method: 'POST',
        body: JSON.stringify({
          activityId, reservationIds: targets.map(r => r.reservationId), ...(edited ? { text: text.trim() } : {}),
        }),
      });
      const skipped: { reservationId: number; reason?: string }[] = Array.isArray(d?.skipped) ? d.skipped : [];
      const sent = Number(d?.sent) || 0;
      if (skipped.length) {
        const names = skipped.slice(0, 6).map(s => {
          const r = pv?.recipients.find(x => x.reservationId === s.reservationId);
          return `${r ? who(r) : '#' + s.reservationId} — ${reasonAr(s.reason)}`;
        });
        swalAlert(`أُرسلت المتابعة إلى ${num(sent)}، وتُخطّي ${num(skipped.length)}:\n${names.join('\n')}`, sent ? 'warning' : 'error');
      } else {
        swalToast(`أُرسلت المتابعة إلى ${num(sent)} — لم يُتخطَّ أحد`, 'success');
      }
      onSent();
      onClose();
    } catch (e: any) {
      swalAlert('تعذّر إرسال المتابعة: ' + (e?.message || ''), 'error');
    } finally { setSending(false); }
  };

  const total = pv?.recipients.length || 0;

  return (
    <Pop title="تابع من لم يصل" onClose={onClose} label="تابع من لم يصل">
      {pv?.activity?.name && <p className="res-fine">{pv.activity.name}</p>}

      {err ? (
        <Banner tone="danger" icon={<TriangleAlert />}>{err}</Banner>
      ) : !pv ? (
        <><Skel h={60} /><Skel h={60} /><Skel h={120} /></>
      ) : total === 0 ? (
        <Banner tone="ok">لا أحد يحتاج متابعة الآن — كلّ المثبَّتين وصلوا أو اعتذروا.</Banner>
      ) : (
        <>
          <div className="wa-card" style={{ paddingBlock: 4 }}>
            <Setting title={<><span className="res-count">{num(targets.length)}</span> من {num(total)} لم يصلوا</>} hint="يُرسل إلى" />
            <Setting title={<>لم يردّوا (<span className="ltr">{num(by.silent.length)}</span>)</>} hint="لم يحدّدوا وقتاً بعد">
              <Toggle on={on.silent} onChange={v => setOn(o => ({ ...o, silent: v }))} label="لم يردّوا" disabled={!by.silent.length} />
            </Setting>
            <Setting title={<>تجاوزوا وقتهم (<span className="ltr">{num(by.late.length)}</span>)</>}
              hint={by.late.length
                ? by.late.slice(0, 3).map(r => `${who(r)}${r.etaAt ? ' — قال ' + hm(r.etaAt) : ''}`).join(' · ')
                : 'لا أحد تجاوز وقته'}>
              <Toggle on={on.late} onChange={v => setOn(o => ({ ...o, late: v }))} label="تجاوزوا وقتهم" disabled={!by.late.length} />
            </Setting>
            <Setting title={<>في الطريق ووقتهم لم يحن (<span className="ltr">{num(by.onway.length)}</span>)</>} hint="لا داعي لإزعاجهم">
              <Toggle on={on.onway} onChange={v => setOn(o => ({ ...o, onway: v }))} label="في الطريق ووقتهم لم يحن" disabled={!by.onway.length} />
            </Setting>
          </div>

          {unreachable.length > 0 && (
            <Banner tone="warn" icon={<TriangleAlert />}>
              <b>يحتاجون اتّصالاً (<span className="ltr">{num(unreachable.length)}</span>):</b>{' '}
              {unreachable.map((r, i) => (
                <span key={r.reservationId}>{i > 0 && ' · '}<b>{who(r)}</b> {reasonAr(r.reason)}</span>
              ))}
            </Banner>
          )}

          <div className="wa-field">
            <label htmlFor="res-fu-text">الرسالة</label>
            {editing ? (
              <>
                <textarea id="res-fu-text" className="wa-textarea" rows={7} value={text} onChange={e => setText(e.target.value)} />
                <span className="hint">{'المتغيّرات: {الاسم}، {الفعاليّة} — تُملأ لكلّ مستلم.'}</span>
              </>
            ) : (
              <div className="wa-wamock">
                <div className="b">
                  {fill(text, sample?.name || 'الاسم', pv.activity?.name || 'الفعاليّة')}
                  <small>{sample ? `كما تصل إلى ${who(sample)}` : 'معاينة'}</small>
                </div>
              </div>
            )}
            <div className="row">
              <button type="button" className="wa-btn sm ghost" onClick={() => setEditing(v => !v)}>
                <Pencil className="s" />{editing ? 'عاين النصّ' : 'عدّل النصّ'}
              </button>
              {edited && (
                <button type="button" className="wa-btn sm ghost" onClick={() => setText(pv.text)}>أعد النصّ الأصليّ</button>
              )}
            </div>
          </div>

          <Banner tone="info" icon={<Bot />}>
            الدون يقرأ الردود: الوقت يُضبط في القائمة، وما لا يفهمه يرفعه لك. «وصل» يبقى للباب والغرفة والموظّف.
          </Banner>

          <button type="button" className="wa-acc" aria-expanded={openList} onClick={() => setOpenList(v => !v)}>
            من سيستلم
            <span className="end">
              {num(targets.length)}{cloud > 0 && ` · ميتا ${num(cloud)}`}{web > 0 && ` · الأعمال ${num(web)}`}
              <ChevronDown style={openList ? { transform: 'rotate(180deg)' } : undefined} />
            </span>
          </button>
          {openList && (
            <div className="res-recips">
              {chosen.map(r => (
                <div key={r.reservationId}>
                  <span className="n">
                    <b>{who(r)}</b>
                    <span>
                      {r.group === 'silent' ? 'لم يردّ' : r.group === 'late' ? 'تجاوز وقته' : 'في الطريق'}
                      {r.etaAt ? <> · <span className="ltr">{hm(r.etaAt)}</span></> : null}
                    </span>
                  </span>
                  {r.reachable
                    ? <Badge tone={r.channel === 'cloud' ? 'meta' : r.channel === 'web' ? 'web' : undefined}>
                        {r.channel === 'cloud' ? 'ميتا' : r.channel === 'web' ? 'الأعمال' : 'واتساب'}
                      </Badge>
                    : <Badge tone="warn">{reasonAr(r.reason)}</Badge>}
                </div>
              ))}
              {!chosen.length && <div className="muted">لم تُختر أيّ مجموعة.</div>}
            </div>
          )}
        </>
      )}

      <div className="wa-actionbar res-popbar">
        <div className="sum">
          <b><span className="ltr">{num(targets.length)}</span> مستلمين</b>
          <span>{unreachable.length ? `${num(unreachable.length)} يحتاجون اتّصالاً` : 'تخرج فوراً'}</span>
        </div>
        <button type="button" className="wa-btn send" disabled={!targets.length || sending || !text.trim()} onClick={send}>
          <Send />{sending ? 'يُرسل…' : 'أرسل'}
        </button>
      </div>
    </Pop>
  );
}
