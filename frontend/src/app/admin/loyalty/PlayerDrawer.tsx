'use client';

// ══════════════════════════════════════════════════════
// 🎟️ بطاقة الولاء — المشتركات + لوح تفاصيل اللاعب
// - api / تسميات الحالات والأنواع / نقاط الأختام / الصورة الرمزيّة
// - PlayerDrawer: لوحٌ جانبيّ يعرض سجلّ زيارات اللاعب وأختامه ومكافآته
//   مع الإجراءات اليدويّة (منح ختم، إلغاء ختم، إلغاء/استخدام/اختيار مكافأة).
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { swalPick } from '@/lib/swal';
import { RANK_BADGES, RANK_NAMES_AR } from '@/lib/ranks';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
export function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

export async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `خطأ ${res.status}`), { status: res.status, body: data });
  return data;
}

// ── تسميات ───────────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  pending_choice: 'بانتظار الاختيار', available: 'متاحة', redeemed: 'استُخدمت', expired: 'انتهت', void: 'ملغاة',
};
export const STATUS_COLOR: Record<string, string> = {
  pending_choice: '#a78bfa', available: '#2dd4bf', redeemed: '#34d399', expired: '#9ca3af', void: '#9ca3af',
};
export const KIND_LABEL: Record<string, string> = {
  free_visit: '🎟️ زيارة مجّانيّة', free_drink: '☕ مشروب', chips: '🪙 تشبس',
};

export type Reward = {
  id: number; period: string; seq: number; kind: string | null; status: string; value: any;
  earnedAt: string; chooseBy: string | null; expiresAt: string | null; redeemedAt: string | null;
  redeemedRefType: string | null; redeemedRefId: number | null; note: string | null;
  playerId?: number; playerName?: string; avatarUrl?: string | null; staffName?: string | null;
};

/** نصّ المكافأة: النوع + قيمتها إن عُرفت */
export function rewardText(r: Reward): string {
  const v = r.value || {};
  if (!r.kind) return 'لم يُختر بعد';
  if (r.kind === 'free_visit') return `🎟️ زيارة مجّانيّة${v.jod != null ? ` ${Number(v.jod).toFixed(2)} د.أ` : ''}`;
  if (r.kind === 'free_drink') {
    const name = v.menuItemName ? ` ${v.menuItemName}` : '';
    const jod = v.jod != null ? ` ${Number(v.jod).toFixed(2)} د.أ` : v.capJod != null ? ` حتى ${Number(v.capJod).toFixed(2)} د.أ` : '';
    return `☕ مشروب${name}${jod}`;
  }
  if (r.kind === 'chips') return `🪙 ${v.chips ?? '—'} تشبس`;
  return r.kind;
}

/** المرجع الذي استُخدمت به المكافأة (أو تاريخ انتهائها إن كانت متاحة) */
export function rewardRef(r: Reward): string {
  if (r.status === 'redeemed') {
    if (r.redeemedRefType === 'booking') return `حجز #${r.redeemedRefId ?? '—'}`;
    if (r.redeemedRefType === 'invoice') return `فاتورة #${r.redeemedRefId ?? '—'}`;
    if (r.redeemedRefType === 'ledger') return `دفتر #${r.redeemedRefId ?? '—'}`;
    if (r.redeemedRefType === 'manual') return `يدويّ${r.note ? ` — ${r.note}` : ''}`;
    return '—';
  }
  if (r.status === 'available' && r.expiresAt) return `تنتهي ${fmtDate(r.expiresAt)}`;
  if (r.status === 'pending_choice' && r.chooseBy) return `الاختيار قبل ${fmtDate(r.chooseBy)}`;
  if (r.status === 'void' && r.note) return r.note;
  return '—';
}

export function fmtDate(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return '—';
  return dt.toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', year: 'numeric', month: 'short', day: 'numeric' });
}
export function fmtDateTime(d: any) {
  if (!d) return '—';
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return '—';
  return `${dt.toLocaleDateString('ar-JO', { timeZone: 'Asia/Amman', month: 'short', day: 'numeric' })} · ${dt.toLocaleTimeString('ar-JO', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit' })}`;
}

export function avatarSrc(url?: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;
}

// ── مكوّنات صغيرة مشتركة ─────────────────────────────
export function Avatar({ url, name, size = 28 }: { url?: string | null; name?: string; size?: number }) {
  const src = avatarSrc(url);
  return (
    <span className="rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center font-black overflow-hidden shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (name?.trim()?.[0] || '؟')}
    </span>
  );
}

/** نقاط الأختام: N نقطة، الممتلئ منها كهرمانيّ */
export function StampDots({ filled, total, size = 10 }: { filled: number; total: number; size?: number }) {
  const n = Math.max(1, Math.min(20, total || 5));
  const f = Math.max(0, Math.min(n, filled));
  return (
    <span className="inline-flex items-center gap-1" dir="ltr" title={`${f}/${n}`}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="rounded-full inline-block"
          style={{
            width: size, height: size,
            background: i < f ? '#f59e0b' : 'rgba(148,163,184,.15)',
            border: i < f ? '1px solid #fbbf24' : '1px solid rgba(148,163,184,.3)',
            boxShadow: i < f ? '0 0 6px rgba(245,158,11,.45)' : 'none',
          }} />
      ))}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || '#9ca3af';
  return (
    <span className="text-[11px] font-bold px-2 py-px rounded-full border whitespace-nowrap"
      style={{ color: c, borderColor: `${c}66`, background: `${c}14` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function RankBadge({ tier }: { tier?: string | null }) {
  if (!tier) return null;
  return (
    <span className="text-[10.5px] text-gray-400 whitespace-nowrap">
      {RANK_BADGES[tier] || ''} {RANK_NAMES_AR[tier] || tier}
    </span>
  );
}

/** إدخال نصّ قصير عبر SweetAlert (لا يوجد مساعد إدخال في lib/swal) */
export async function swalInput(title: string, opts?: { placeholder?: string; min?: number; confirmText?: string; danger?: boolean }): Promise<string | null> {
  const min = opts?.min ?? 3;
  const r = await Swal.fire({
    title,
    input: 'text',
    inputPlaceholder: opts?.placeholder || '',
    inputAttributes: { dir: 'rtl', autocomplete: 'off' },
    background: '#141210', color: '#e7e2d6',
    confirmButtonColor: opts?.danger ? '#b91c1c' : '#C5A059', cancelButtonColor: '#2f2a24',
    showCancelButton: true, reverseButtons: true,
    confirmButtonText: opts?.confirmText || 'تأكيد', cancelButtonText: 'إلغاء',
    customClass: { popup: 'swal-mafia rounded-2xl', title: 'swal-mafia-title' },
    inputValidator: (v) => (String(v || '').trim().length < min ? `اكتب ${min} أحرف على الأقلّ` : null),
  });
  if (!r.isConfirmed) return null;
  const v = String(r.value || '').trim();
  return v.length >= min ? v : null;
}

// ── حكم الزيارة ──────────────────────────────────────
export type VisitRow = {
  activityId: number; activityName: string; date: string; locationName?: string | null;
  played: boolean; verdict: string; leadHours: number | null; bookingCreatedBy: string | null;
  stampNo: number | null; stampId: number | null;
};

export function verdictPill(v: VisitRow): { text: string; color: string } {
  switch (v.verdict) {
    case 'stamped': return { text: `✦ ختم ${v.stampNo ?? ''}`.trim(), color: '#34d399' };
    case 'late': {
      const lh = v.leadHours;
      const why = lh == null ? '' : lh <= 0 ? ' — بعد البدء' : ` — حجز قبل ${Number(lh).toFixed(1).replace(/\.0$/, '')}س فقط`;
      return { text: `بلا ختم${why}`, color: '#fb7185' };
    }
    case 'channel': {
      const ch = v.bookingCreatedBy === 'whatsapp' ? 'واتساب' : v.bookingCreatedBy === 'player-app' ? 'التطبيق' : v.bookingCreatedBy ? 'يدويّ' : '—';
      return { text: `خارج القناة (${ch})`, color: '#9ca3af' };
    }
    case 'no_booking': return { text: 'لعب بلا حجز', color: '#fb7185' };
    case 'no_show': return { text: 'حجز ولم يلعب', color: '#fbbf24' };
    case 'voided': return { text: 'ختم ملغى', color: '#9ca3af' };
    case 'location': return { text: 'مكان خارج البرنامج', color: '#9ca3af' };
    default: return { text: v.verdict, color: '#9ca3af' };
  }
}

// ══════════════════════════════════════════════════════
// 👁 لوح تفاصيل اللاعب
// ══════════════════════════════════════════════════════
type Detail = {
  player: { id: number; name: string; phone: string; avatarUrl: string | null; rankTier: string | null; rankRR: number; chips: number; isFree: boolean; isTest: boolean };
  period: string;
  cfg: { stampsPerReward: number; minLeadHours: number; maxRewardsPerMonth: number; [k: string]: any };
  card: { stamps: number; inCard: number; cardsCompleted: number };
  visits: VisitRow[];
  stamps: { id: number; activityId: number; activityName: string; date: string; leadHours: number | null; source: string; note: string | null; voidedAt: string | null; voidReason: string | null; grantedBy: string | null }[];
  rewards: Reward[];
  totals: { stampsAll: number; rewardsAll: number };
};

export function PlayerDrawer({ playerId, period, onClose, onChanged, toast }: {
  playerId: number; period: string; onClose: () => void; onChanged: () => void;
  toast: (kind: 'ok' | 'err', text: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [activities, setActivities] = useState<{ id: number; name: string; date: string; locationName?: string | null }[]>([]);
  const [grantAct, setGrantAct] = useState<string>('');
  const [grantNote, setGrantNote] = useState('');

  const load = useCallback(async () => {
    try {
      setErr(null);
      const d = await api(`/api/loyalty/admin/players/${playerId}?period=${period}`);
      setData(d);
    } catch (e: any) { setErr(e.message || 'تعذّر الجلب'); }
  }, [playerId, period]);

  useEffect(() => { setData(null); load(); }, [load]);

  // إغلاق بـ Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // الفعاليّات (لنموذج المنح اليدويّ) — تُجلب عند فتح النموذج فقط
  useEffect(() => {
    if (!grantOpen || activities.length) return;
    api('/api/activities').then((rows: any) => {
      const list = (Array.isArray(rows) ? rows : []).map((a: any) => ({ id: a.id, name: a.name, date: a.date, locationName: a.locationName }));
      setActivities(list);
    }).catch(() => setActivities([]));
  }, [grantOpen, activities.length]);

  const periodActivities = useMemo(() => {
    const inPeriod = activities.filter(a => {
      const p = new Date(a.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' }).slice(0, 7);
      return p === period;
    });
    return inPeriod.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, period]);

  const stampsById = useMemo(() => new Map((data?.stamps || []).map(s => [s.id, s])), [data]);

  const run = async (fn: () => Promise<any>, okText: string) => {
    setBusy(true);
    try { await fn(); toast('ok', okText); await load(); onChanged(); }
    catch (e: any) { toast('err', e.message || 'فشل الإجراء'); }
    finally { setBusy(false); }
  };

  const voidStamp = async (stampId: number) => {
    const reason = await swalInput('سبب إلغاء الختم', { placeholder: 'مثال: حجز مكرَّر / خطأ إداريّ', danger: true, confirmText: 'إلغاء الختم' });
    if (!reason) return;
    await run(() => api(`/api/loyalty/admin/stamps/${stampId}/void`, { method: 'POST', body: JSON.stringify({ reason }) }), 'أُلغي الختم');
  };
  const voidReward = async (id: number) => {
    const reason = await swalInput('سبب إلغاء المكافأة', { placeholder: 'السبب…', danger: true, confirmText: 'إلغاء المكافأة' });
    if (!reason) return;
    await run(() => api(`/api/loyalty/admin/rewards/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }), 'أُلغيت المكافأة');
  };
  const redeemReward = async (id: number) => {
    const note = await swalInput('استخدام المكافأة يدويّاً', { placeholder: 'ملاحظة: أين ومتى استُخدمت', confirmText: 'تسجيل الاستخدام' });
    if (!note) return;
    await run(() => api(`/api/loyalty/admin/rewards/${id}/redeem`, { method: 'POST', body: JSON.stringify({ note }) }), 'سُجّل استخدام المكافأة');
  };
  const chooseReward = async (id: number) => {
    const kinds = (data?.cfg?.kinds as string[] | undefined) || ['free_visit', 'free_drink', 'chips'];
    const kind = await swalPick<string>('اختيار المكافأة نيابةً عن اللاعب', '<p style="font-size:13px;color:#9ca3af">سيُثبَّت النوع ولا يمكن تغييره لاحقاً</p>',
      kinds.map(k => ({ value: k, label: KIND_LABEL[k] || k })));
    if (!kind) return;
    await run(() => api(`/api/loyalty/admin/rewards/${id}/choose`, { method: 'POST', body: JSON.stringify({ playerId, kind }) }), 'اختيرت المكافأة');
  };
  const grantStamp = async () => {
    const activityId = Number(grantAct);
    if (!Number.isInteger(activityId) || activityId <= 0) return toast('err', 'اختر فعاليّة');
    if (grantNote.trim().length < 3) return toast('err', 'الملاحظة مطلوبة (٣ أحرف على الأقلّ)');
    await run(async () => {
      const r = await api(`/api/loyalty/admin/players/${playerId}/stamps`, { method: 'POST', body: JSON.stringify({ activityId, note: grantNote.trim() }) });
      if (r?.rewardId) toast('ok', `🎁 اكتملت البطاقة — مكافأة #${r.rewardId}`);
    }, '✦ مُنح الختم');
    setGrantOpen(false); setGrantAct(''); setGrantNote('');
  };

  const N = data?.cfg?.stampsPerReward || 5;
  const p = data?.player;

  return (
    <div className="fixed inset-0 z-[400] bg-black/70 backdrop-blur-sm flex justify-start" onClick={onClose} dir="rtl">
      <div onClick={e => e.stopPropagation()}
        className="h-full w-full sm:w-[520px] max-w-full bg-[#0c0c0e] border-l border-gray-800 shadow-2xl flex flex-col"
        style={{ animation: 'loyaltyDrawerIn .18s ease-out' }}>
        <style>{`@keyframes loyaltyDrawerIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}`}</style>

        {/* رأس */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
          <Avatar url={p?.avatarUrl} name={p?.name} size={44} />
          <div className="flex-1 min-w-0">
            <b className="block text-[15px] text-white truncate">{p?.name || '…'}</b>
            <span className="block text-[11px] text-gray-500 truncate" dir="ltr">
              {p ? `#${p.id} · ${p.phone || '—'}` : ''}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <RankBadge tier={p?.rankTier} />
              {p?.isFree && <span className="text-[10px] text-amber-400">مجّانيّ</span>}
              {p?.isTest && <span className="text-[10px] text-gray-500">اختبار</span>}
            </div>
          </div>
          <a href={`/admin/players/${playerId}`} className="text-[11px] text-gray-500 hover:text-amber-400 whitespace-nowrap">🪪 الملفّ</a>
          <button onClick={onClose} className="w-9 h-9 rounded-lg text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {err && <p className="text-rose-400 text-sm text-center py-8">{err}</p>}
          {!data && !err && <p className="text-gray-500 text-sm text-center py-8">جارٍ التحميل…</p>}

          {data && (<>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-2">
              <Mini label="بطاقة الشهر" value={`${data.card.inCard}/${N}`} sub={data.card.cardsCompleted ? `${data.card.cardsCompleted} مكتملة` : `${data.card.stamps} ختماً`} tone="#f59e0b" />
              <Mini label="زيارات الشهر" value={String(data.visits.length)} tone="#38bdf8" />
              <Mini label="مكافآت (الكلّ)" value={String(data.totals.rewardsAll)} sub={`${data.totals.stampsAll} ختماً`} tone="#a78bfa" />
              <Mini label="رصيد التشبس" value={String(data.player.chips ?? 0)} sub="🪙" tone="#fbbf24" />
            </div>

            <div className="flex items-center justify-between gap-2">
              <StampDots filled={data.card.inCard} total={N} size={14} />
              <button onClick={() => setGrantOpen(o => !o)} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-900/40 border border-amber-600/40 text-amber-300 hover:bg-amber-900/60 transition-all disabled:opacity-50">
                ✦ منح ختم يدويّ
              </button>
            </div>

            {grantOpen && (
              <div className="bg-gray-800/40 border border-amber-500/30 rounded-2xl p-3 space-y-2">
                <p className="text-[12px] text-gray-400">الختم اليدويّ يُحتسب ضمن بطاقة شهر الفعاليّة، ويُسجَّل باسم من منحه.</p>
                <label className="block text-[11px] text-gray-500">الفعاليّة</label>
                <select value={grantAct} onChange={e => setGrantAct(e.target.value)}
                  className="w-full bg-gray-900/60 border border-gray-600/50 rounded-xl px-3 py-2 text-sm text-white">
                  <option value="">— اختر فعاليّة {period} —</option>
                  {periodActivities.map(a => (
                    <option key={a.id} value={a.id}>#{a.id} · {a.name} · {fmtDate(a.date)}{a.locationName ? ` · ${a.locationName}` : ''}</option>
                  ))}
                </select>
                {data.visits.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {data.visits.map(v => (
                      <button key={v.activityId} type="button" onClick={() => setGrantAct(String(v.activityId))}
                        className={`text-[10.5px] px-2 py-0.5 rounded-full border transition ${String(v.activityId) === grantAct ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        #{v.activityId} {v.activityName}
                      </button>
                    ))}
                  </div>
                )}
                <input value={grantAct} onChange={e => setGrantAct(e.target.value.replace(/\D/g, ''))} placeholder="أو رقم الفعاليّة"
                  className="w-full bg-gray-900/60 border border-gray-600/50 rounded-xl px-3 py-2 text-sm text-white tabular-nums" dir="ltr" />
                <input value={grantNote} onChange={e => setGrantNote(e.target.value)} placeholder="الملاحظة (مطلوبة، ٣ أحرف فأكثر)"
                  className="w-full bg-gray-900/60 border border-gray-600/50 rounded-xl px-3 py-2 text-sm text-white" />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setGrantOpen(false)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white">إلغاء</button>
                  <button onClick={grantStamp} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-rose-600 text-white disabled:opacity-50">
                    {busy ? '…' : '✦ منح'}
                  </button>
                </div>
              </div>
            )}

            {/* سجلّ الزيارات */}
            <section>
              <h4 className="text-sm font-bold text-gray-200 mb-2">🗓️ سجلّ الزيارات <span className="text-gray-600 font-normal text-[11px]">({period})</span></h4>
              {data.visits.length === 0 ? (
                <p className="text-[12px] text-gray-600 py-3 text-center">لا زيارات في هذا الشهر</p>
              ) : (
                <div className="relative pr-3">
                  <div className="absolute right-[5px] top-2 bottom-2 w-px bg-gray-800" />
                  <div className="space-y-2">
                    {data.visits.map(v => {
                      const pill = verdictPill(v);
                      const st = v.stampId ? stampsById.get(v.stampId) : null;
                      return (
                        <div key={`${v.activityId}-${v.stampId ?? 'x'}`} className="relative rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2">
                          <span className="absolute -right-3 top-3.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0e]" style={{ background: pill.color }} />
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold px-2 py-px rounded-full border whitespace-nowrap"
                              style={{ color: pill.color, borderColor: `${pill.color}66`, background: `${pill.color}14` }}>{pill.text}</span>
                            {st?.source === 'manual' && <span className="text-[10px] px-1.5 rounded-full border border-sky-500/40 text-sky-300">يدويّ</span>}
                            <span className="flex-1" />
                            <span className="text-[11px] text-gray-500">{fmtDate(v.date)}</span>
                            {v.verdict === 'stamped' && v.stampId && (
                              <button onClick={() => voidStamp(v.stampId!)} disabled={busy} title="إلغاء الختم"
                                className="w-6 h-6 rounded-md text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 text-xs">✕</button>
                            )}
                          </div>
                          <p className="text-[12.5px] text-gray-200 mt-1 truncate">#{v.activityId} · {v.activityName}{v.locationName ? <span className="text-gray-500"> · {v.locationName}</span> : null}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {v.played ? 'لعب' : 'لم يلعب'}
                            {v.leadHours != null && <> · الحجز قبل {Number(v.leadHours).toFixed(1).replace(/\.0$/, '')}س</>}
                            {v.bookingCreatedBy && <> · {v.bookingCreatedBy === 'player-app' ? 'التطبيق' : v.bookingCreatedBy}</>}
                            {st?.note && <> · <span className="text-gray-400">{st.note}</span></>}
                            {st?.voidedAt && <> · <span className="text-rose-400/80">أُلغي: {st.voidReason || '—'}</span></>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* الأختام الملغاة / اليدويّة خارج قائمة الزيارات */}
            {data.stamps.some(s => s.voidedAt || !data.visits.some(v => v.stampId === s.id)) && (
              <section>
                <h4 className="text-sm font-bold text-gray-200 mb-2">✦ الأختام <span className="text-gray-600 font-normal text-[11px]">(الشهر)</span></h4>
                <div className="space-y-1.5">
                  {data.stamps.map(s => (
                    <div key={s.id} className={`rounded-xl border px-3 py-2 text-[12px] flex items-center gap-2 ${s.voidedAt ? 'border-gray-800 bg-gray-900/30 text-gray-500' : 'border-gray-800 bg-gray-900/40 text-gray-200'}`}>
                      <span className="tabular-nums text-gray-500">#{s.id}</span>
                      <span className="flex-1 truncate">{s.activityName} · {fmtDate(s.date)}</span>
                      <span className="text-[10px] px-1.5 rounded-full border border-gray-700 text-gray-400">{s.source === 'manual' ? `يدويّ${s.grantedBy ? ` · ${s.grantedBy}` : ''}` : 'تلقائيّ'}</span>
                      {s.voidedAt ? <span className="text-[10px] text-rose-400/80">ملغى</span> : (
                        <button onClick={() => voidStamp(s.id)} disabled={busy} className="w-6 h-6 rounded-md text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 text-xs">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* المكافآت */}
            <section>
              <h4 className="text-sm font-bold text-gray-200 mb-2">🎁 المكافآت</h4>
              {data.rewards.length === 0 ? (
                <p className="text-[12px] text-gray-600 py-3 text-center">لا مكافآت بعد</p>
              ) : (
                <div className="space-y-2">
                  {data.rewards.map(r => (
                    <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-gray-500 tabular-nums">#{r.id}</span>
                        <span className="text-[13px] text-white font-bold">{rewardText(r)}</span>
                        <StatusPill status={r.status} />
                        <span className="flex-1" />
                        <span className="text-[11px] text-gray-500">{r.period} · {fmtDate(r.earnedAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-500 flex-1">{rewardRef(r)}</span>
                        {r.status === 'pending_choice' && (
                          <button onClick={() => chooseReward(r.id)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-500/10">اختيار نيابةً عنه</button>
                        )}
                        {r.status === 'available' && (
                          <button onClick={() => redeemReward(r.id)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">✔ استخدام يدويّ</button>
                        )}
                        {(r.status === 'pending_choice' || r.status === 'available') && (
                          <button onClick={() => voidReward(r.id)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10">🚫 إلغاء</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>)}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="bg-gray-800/40 border border-gray-700/30 rounded-xl px-2 py-2 text-center">
      <p className="text-[10px] text-gray-500 truncate">{label}</p>
      <p className="text-lg font-black tabular-nums leading-tight" style={{ color: tone }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 truncate">{sub}</p>}
    </div>
  );
}
