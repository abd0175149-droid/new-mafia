'use client';

// ══════════════════════════════════════════════════════
// 📣 تقرير إشعار الإلغاء — قسمٌ في صفحة الفعاليّة الملغاة
// ══════════════════════════════════════════════════════
// حين تتحوّل الفعاليّة إلى «ملغاة» قبل موعدها يراسل الخادم كلّ حاجز آليّاً
// (activity-cancel-notice.service). هنا: كم حاجزاً، من وصلته (ووصلت/قُرئت)، ومن لا
// ولماذا — نافذة الـ٢٤ ساعة مغلقة أو لا محادثة واتساب أصلاً. لمن لم تصله: زرٌّ يفتح
// واتساب هاتفك برسالته جاهزة، ونسخُ أرقامهم، و«أعد الإرسال» لمن راسلنا بعد الإلغاء.

import { useCallback, useEffect, useState } from 'react';
import { swalAlert, swalToast } from '@/lib/swal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
async function cnFetch(path: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  let body: any = null; try { body = await res.json(); } catch { /* بلا جسم */ }
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

const SOURCE: Record<string, string> = { booking: 'حجز', reservation: 'متابعة', waitlist: 'انتظار' };
const OUTCOME: Record<string, { label: string; cls: string }> = {
  sent: { label: '✅ أُرسلت', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  window_closed: { label: '⛔ النافذة مغلقة', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  no_conversation: { label: '⛔ لا محادثة واتساب', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  failed: { label: '❌ فشل الإرسال', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/25' },
  invalid_phone: { label: '⚠️ رقم غير صالح', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/25' },
  test_location: { label: '🧪 موقع اختبار', cls: 'bg-gray-500/15 text-gray-300 border-gray-500/25' },
};
const DELIVERY: Record<string, string> = { sent: '✓ أُرسلت', delivered: '✓✓ وصلت', read: '👁 قُرئت', failed: '❌ رفضها واتساب' };
const NOT_REACHED = new Set(['window_closed', 'no_conversation', 'failed']);

function render(tpl: string, name: string, act: { name: string; when: string }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'ضيفنا';
  return String(tpl || '').replace(/\{الاسم\}/g, first).replace(/\{الفعالية\}/g, act.name).replace(/\{الموعد\}/g, act.when);
}
/** api.whatsapp.com لا wa.me — الأخيرة تكسر الإيموجي في النصّ */
function waLink(phone: string, text: string) {
  const intl = phone.startsWith('0') ? `962${phone.slice(1)}` : phone;
  return `https://api.whatsapp.com/send?phone=${intl}&text=${encodeURIComponent(text)}`;
}

export default function CancelNoticeSection({ activityId }: { activityId: number }) {
  const [rep, setRep] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try { const d = await cnFetch(`/api/activities/${activityId}/cancel-notice`); setRep(d.report || null); } catch { setRep(null); }
  }, [activityId]);
  useEffect(() => { load(); }, [load]);
  // الإرسال يجري في الخلفية بعد الإلغاء — نتابعه دقيقتين ثمّ نكفّ
  useEffect(() => {
    if (!rep?.notice?.lastRunAt) return;
    if (Date.now() - new Date(rep.notice.lastRunAt).getTime() > 2 * 60e3) return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [rep, load]);

  if (!rep) return null;
  const { notice, totals, recipients, activity } = rep;
  const notReached = recipients.filter((r: any) => NOT_REACHED.has(r.outcome));

  async function resend() {
    setBusy(true);
    try {
      const r = await cnFetch(`/api/activities/${activityId}/cancel-notice/resend`, { method: 'POST' });
      swalAlert(r.sent ? `✅ أُرسل لـ${r.sent} انفتحت نوافذهم${r.stillClosed ? ` · ما زال ${r.stillClosed} بنافذةٍ مغلقة` : ''}` : `لا جديد — ${r.stillClosed} ما زالت نوافذهم مغلقة`);
      await load();
    } catch (e: any) { swalAlert(`❌ ${e.message}`); }
    setBusy(false);
  }
  async function copyPhones() {
    const list = notReached.map((r: any) => `${r.name || '—'} ${r.phone}`).join('\n');
    try { await navigator.clipboard.writeText(list); swalToast(`نُسخ ${notReached.length} رقماً`, 'success'); }
    catch { swalAlert(list); }
  }

  const skipped = notice.skippedReason === 'after_start' ? '⏰ أُلغيت بعد موعدها — لم تُرسل رسائل'
    : notice.skippedReason === 'test_location' ? '🧪 موقع اختبار — لا يصل واتساب' : null;

  return (
    <div className="bg-gray-800/50 border border-rose-500/25 rounded-2xl overflow-hidden" dir="rtl">
      <button onClick={() => setOpen(o => !o)} className="w-full px-5 py-4 flex items-center justify-between gap-2 flex-wrap text-right">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg">📣</span>
          <span className="font-bold text-white">إشعار الإلغاء</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-200 border border-gray-600/40">{totals.bookers} حاجزاً</span>
          {!skipped && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">وصلت {totals.sent}</span>}
          {!skipped && notReached.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">لم تصل {notReached.length}</span>}
          {skipped && <span className="text-xs text-gray-400">{skipped}</span>}
        </div>
        <span className="text-[11px] text-gray-500">
          {notice.createdBy ? `ألغاها ${notice.createdBy} · ` : ''}{new Date(notice.createdAt).toLocaleString('ar-EG', { timeZone: 'Asia/Amman', dateStyle: 'short', timeStyle: 'short' })} {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {!skipped && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { k: 'أُرسلت', v: totals.sent, sub: totals.sent ? `وصلت ${totals.delivered} · قُرئت ${totals.read}` : '', c: 'text-emerald-300' },
                { k: 'النافذة مغلقة', v: totals.windowClosed, sub: 'لم يراسلنا خلال ٢٤ ساعة', c: 'text-amber-300' },
                { k: 'لا محادثة واتساب', v: totals.noConversation, sub: 'لم يراسلنا قطّ', c: 'text-amber-300' },
                { k: 'فشل / رقم غير صالح', v: totals.failed + totals.invalidPhone, sub: '', c: 'text-rose-300' },
              ].map(x => (
                <div key={x.k} className="bg-gray-900/50 border border-gray-700/40 rounded-xl px-3 py-2">
                  <div className={`text-xl font-bold tabular-nums ${x.c}`}>{x.v}</div>
                  <div className="text-xs text-gray-300">{x.k}</div>
                  {x.sub && <div className="text-[10px] text-gray-500 mt-0.5">{x.sub}</div>}
                </div>
              ))}
            </div>
          )}

          {!skipped && notReached.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <button disabled={busy} onClick={resend} className="text-xs px-3 py-1.5 rounded-lg bg-[#C5A059]/15 text-[#e2c58a] border border-[#C5A059]/30 hover:bg-[#C5A059]/25 disabled:opacity-50">
                🔁 أعد الإرسال لمن انفتحت نافذته
              </button>
              <button onClick={copyPhones} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/50 text-gray-200 border border-gray-600/40 hover:bg-gray-700">
                📋 انسخ أرقام من لم تصلهم ({notReached.length})
              </button>
              <span className="text-[11px] text-gray-500">البوت لا يبدأ محادثة — من لم يراسلنا خلال ٢٤ ساعة يُكلَّم من هاتفك (زرّ 💬 بجانبه)</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-700/50">
                  <th className="text-right py-2 px-2 font-medium">الاسم</th>
                  <th className="text-right py-2 px-2 font-medium">الرقم</th>
                  <th className="text-right py-2 px-2 font-medium">النوع</th>
                  <th className="text-right py-2 px-2 font-medium">النتيجة</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r: any) => {
                  const o = OUTCOME[r.outcome] || { label: r.outcome, cls: 'bg-gray-500/15 text-gray-300 border-gray-500/25' };
                  return (
                    <tr key={`${r.phone}-${r.name}`} className="border-b border-gray-800/60">
                      <td className="py-2 px-2 text-gray-100">{r.name || '—'}{r.people > 1 && <span className="text-gray-500 text-xs"> · {r.people} أشخاص</span>}</td>
                      <td className="py-2 px-2 text-gray-300 tabular-nums" dir="ltr">{r.phone}</td>
                      <td className="py-2 px-2 text-gray-400 text-xs">{SOURCE[r.source] || r.source}</td>
                      <td className="py-2 px-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${o.cls}`} title={r.error || ''}>{o.label}</span>
                        {r.outcome === 'sent' && r.delivery && <span className="text-[11px] text-gray-400 mr-2">{DELIVERY[r.delivery] || r.delivery}</span>}
                        {r.optedOut && <span className="text-[10px] text-gray-500 mr-2" title="اعتذر عن الإعلانات — أُرسلت لأنّها تخصّ حجزه">· معتذرٌ عن الإعلانات</span>}
                      </td>
                      <td className="py-2 px-2 text-left">
                        {NOT_REACHED.has(r.outcome) && activity && (
                          <a href={waLink(r.phone, render(notice.text, r.name, activity))} target="_blank" rel="noreferrer"
                             className="text-xs px-2 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 whitespace-nowrap">
                            💬 من هاتفي
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
