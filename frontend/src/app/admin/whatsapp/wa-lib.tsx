'use client';

// مساعدات مشتركة لصفحة واتساب — الجلب، الصيغ، ثوابت العرض

import { Check, CheckCheck, Clock, Bot, User, Settings, ClipboardList, Megaphone, Send, Sparkles } from 'lucide-react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const MUTE_KEY = 'wa_inbox_muted';
/** حدّ تعليق الصورة في واتساب — الخادم يقصّ عنده، فنُظهره قبل أن يقصّ */
export const WA_CAPTION_MAX = 1024;

export function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }
export function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

export async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  // رفع الملفات: يجب ترك المتصفح يضبط Content-Type بنفسه (يحمل boundary الـ multipart)
  const isForm = typeof FormData !== 'undefined' && opts?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e: any = new Error(err.error || `API error ${res.status}`);
    e.code = err.code; e.status = res.status;
    e.body = err;   // بعض الأخطاء تحمل بيانات (نصّا المراجعة مثلاً) لا رسالةً فقط
    throw e;
  }
  return res.json();
}

// ── ثوابت العرض ──
export const RANK_AR: Record<string, string> = {
  INFORMANT: 'مُخبر', SOLDIER: 'جندي', CAPO: 'كابو', UNDERBOSS: 'ساعد الزعيم', GODFATHER: 'العرّاب',
};
export const ROLE_AR: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'الحرباية', WITCH: 'الساحرة',
  OLDER_BROTHER: 'الأخ الأكبر', MAFIA_REGULAR: 'مافيا', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', YOUNGER_BROTHER: 'الأخ الأصغر',
  CITIZEN: 'مواطن', JESTER: 'المهرج', ASSASSIN: 'السفّاح', MAYOR: 'العمدة',
};
export const FILTERS = [
  { key: 'all', label: 'الكلّ' },
  { key: 'unread', label: 'غير مقروء' },
  { key: 'open', label: 'نافذة مفتوحة' },
  { key: 'attn', label: 'تحتاج تدخّلاً' },
  { key: 'bot', label: 'مع الدون' },
  { key: 'human', label: 'مع موظّف' },
] as const;

// ── الترتيب ──
// النافذة أهمّ حقيقةٍ زمنيّة في واتساب، ولم يكن في الصفحة ما يرتّب الناس بها.
// كلّه في الخادم: الترتيب في المتصفّح يرتّب الصفحة المحمَّلة فيبدو صحيحاً وهو كاذب.
export const SORTS = [
  { key: 'recent', label: 'الأحدث رسالةً' },
  { key: 'closing', label: 'النافذة تُغلق أوّلاً' },
  { key: 'fresh', label: 'النافذة تُغلق أخيراً' },
  { key: 'waiting', label: 'الأطول انتظاراً للردّ' },
] as const;
export const WIN_SORTS = ['closing', 'fresh'];

/** ما بقي من النافذة نصّاً قصيراً: «٢س ١٠د» */
export function fmtLeft(h: number): string {
  const m = Math.round(h * 60);
  return m >= 60 ? `${Math.floor(m / 60)} س ${m % 60} د` : `${m} د`;
}
export type WinTone = 'closed' | 'danger' | 'warn' | 'ok';
/** نغمة النافذة وعنوان مجموعتها — عتبتان: ساعة، ثمّ أربع ساعات */
export function winTone(h: number): { tone: WinTone; group: string } {
  if (h <= 0) return { tone: 'closed', group: 'مغلقة' };
  if (h <= 1) return { tone: 'danger', group: 'تنتهي خلال ساعة' };
  if (h <= 4) return { tone: 'warn', group: 'تنتهي اليوم' };
  return { tone: 'ok', group: 'متّسعة' };
}

export function fmtTime(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' });
}
export function fmtWhen(d: any) {
  if (!d) return '';
  const dt = new Date(d);
  const today = new Date();
  if (dt.toDateString() === today.toDateString()) return fmtTime(dt);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (dt.toDateString() === yest.toDateString()) return 'أمس';
  return dt.toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' });
}
export function fmtDay(d: any) {
  const dt = new Date(d);
  const today = new Date();
  if (dt.toDateString() === today.toDateString()) return 'اليوم';
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (dt.toDateString() === yest.toDateString()) return 'أمس';
  return dt.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function intlPhone(local: string) { return local ? '+962 ' + local.slice(1) : ''; }
// ══════════════════════════════════════════════════════
// 🔀 العروض الثلاثة (كلا الرقمين · ميتا · رقم الأعمال) — قواعدُ واحدة لكلّ مسار
// ══════════════════════════════════════════════════════
// الخيط: رسائل الرقم المعروض وحده، مرتّبةً بالزمن. القائمة: معاينةُ ووقتُ آخر رسالةٍ على ذلك الرقم.
// غير المقروء: unread_web جزءٌ من unreadCount (ميتا = الفرق) — فعرضُ رقمٍ لا يقرأ رسائل الآخر.
export type InboxCh = 'all' | 'cloud' | 'web';
// 📄 الصفحات: القائمة ٢٠ محادثة والخيط ٣٠ رسالة — والأقدم يُحمَّل بالتمرير (بترتيب العرض المختار)
export const CONV_PAGE = 20;
export const MSG_PAGE = 30;
/** ⏳ في طابور رقم الأعمال ولم يخرج بعد — لا يدخل الخيط ولا يغيّر ترتيب القائمة */
export const isPendingMsg = (m: any) => ['queued', 'sending'].includes(String(m?.status || ''));
export const chOf = (m: any): 'cloud' | 'web' => (m?.channel === 'web' ? 'web' : 'cloud');
export const CH_AR: Record<'cloud' | 'web', string> = { cloud: 'رقم ميتا', web: 'رقم الأعمال' };
export const inView = (m: any, ch: InboxCh) => ch === 'all' || chOf(m) === ch;
export const viewUnread = (c: any, ch: InboxCh): number =>
  ch === 'web' ? Number(c?.unreadWeb || 0)
    : ch === 'cloud' ? Math.max(0, Number(c?.unreadCount || 0) - Number(c?.unreadWeb || 0))
      : Number(c?.unreadCount || 0);
/** أثر «قُرئت» في العرض الحاليّ — مرآة POST /read?channel= في الخادم */
export const readInView = (c: any, ch: InboxCh) =>
  ch === 'web' ? { unreadCount: Math.max(0, Number(c?.unreadCount || 0) - Number(c?.unreadWeb || 0)), unreadWeb: 0 }
    : ch === 'cloud' ? { unreadCount: Number(c?.unreadWeb || 0) }
      : { unreadCount: 0, unreadWeb: 0 };
/** صفّ المحادثة الخام من المقبس يحمل معاينة آخر رسالةٍ على أيّ رقم — في عرض رقمٍ واحد لا تُطبَّق */
export const withoutPreview = (c: any) => { const r = { ...(c || {}) }; delete r.lastMessageAt; delete r.lastMessagePreview; return r; };
/** إدراجٌ بالترتيب الزمنيّ (والحيّ في آخره عادةً) */
export const insertByTime = (prev: any[], m: any) => {
  if (prev.some(x => x.id === m.id)) return prev;
  const t = new Date(m.createdAt).getTime();
  let i = prev.length;
  while (i > 0 && new Date(prev[i - 1].createdAt).getTime() > t) i--;
  return [...prev.slice(0, i), m, ...prev.slice(i)];
};
export function windowHoursLeft(lastInboundAt: any): number {
  if (!lastInboundAt) return 0;
  const left = 24 * 3600e3 - (Date.now() - new Date(lastInboundAt).getTime());
  return Math.max(0, left / 3600e3);
}

// صوت تنبيه خفيف (WebAudio — بلا ملفات خارجية)
export let audioCtx: AudioContext | null = null;
export function playPing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    o.start(); o.stop(audioCtx.currentTime + 0.36);
    o.frequency.setValueAtTime(1174, audioCtx.currentTime + 0.12);
  } catch { /* الصوت ليس حرجاً */ }
}

// ── صحّات التسليم ──
export function Ticks({ status }: { status: string }) {
  // رقم الأعمال: الرسالة في الطابور (الجماعيّ متباعد، وقد يكمل غداً)
  if (status === 'queued' || status === 'sending') return <span title={status === 'sending' ? 'تُرسل الآن' : 'في طابور رقم الأعمال'}><Clock aria-label="في الطابور" /></span>;
  if (status === 'failed') return <span className="fail">فشلت</span>;
  if (status === 'read') return <span className="read" title="قُرئت"><CheckCheck aria-label="قُرئت" /></span>;
  if (status === 'delivered') return <span title="وصلت"><CheckCheck aria-label="وصلت" /></span>;
  if (status === 'sent') return <span title="أُرسلت"><Check aria-label="أُرسلت" /></span>;
  return null;
}
/** من كتب الرسالة الصادرة — سطر أعلى الفقاعة */
export function SourceTag({ m }: { m: any }) {
  if (m.source === 'bot') return <div className="who bot"><Bot />الدون</div>;
  // اسم الموظّف كان يُمرَّر للخادم ولا يُخزَّن، فكانت كلّ ردود البشر «موظف»
  if (m.source === 'staff') return <div className="who staff"><User />{m.payload?.by || 'موظّف'}{m.payload?.styled && <span title="أعاد الدون صياغتها — النصّ الأصليّ في «معلومات الرسالة»" style={{ color: 'var(--violet)', display: 'inline-flex', alignItems: 'center', gap: 2 }}> · <Sparkles />صيغت</span>}</div>;
  if (m.source === 'system') return <div className="who sys"><Settings />النظام</div>;
  if (m.source === 'template') return <div className="who sys"><ClipboardList />قالب</div>;
  if (m.source === 'broadcast') return <div className="who cast"><Megaphone />بثّ</div>;
  if (m.source === 'outreach') return <div className="who cast"><Send />{OUTREACH_AR[m.payload?.origin] || 'من النظام'}{m.payload?.staffName ? ` · ${m.payload.staffName}` : ''}</div>;
  return null;
}

export const STATUS_AR: Record<string, string> = { sent: 'أُرسلت', delivered: 'وصلت', read: 'قُرئت', failed: 'فشلت', received: 'استُلمت', queued: 'في الطابور', sending: 'تُرسل' };
export const OUTREACH_AR: Record<string, string> = { reservations: 'من الحجوزات', analytics: 'من التحليلات', explorer: 'من المستكشف' };
export const SOURCE_AR: Record<string, string> = { customer: 'العميل', bot: 'البوت 🤖', staff: 'موظف 👤', system: 'النظام ⚙️', template: 'قالب 📋', broadcast: 'بث جماعي 📢', injected: 'بلسان العميل 🎭', outreach: 'إرسال من صفحات النظام 📤' };

// «معلومات الرسالة»: النوع والمصدر والحالة بسجلها الزمني والتفاعل
export function messageInfoText(m: any): string {
  const lines: string[] = [];
  lines.push(`الاتجاه: ${m.direction === 'in'
    ? (m.source === 'injected' ? `مُدخلة بلسان العميل من ${m.payload?.by || 'الإدارة'} — لم تصل العميل` : 'واردة من العميل')
    : 'صادرة'}`);
  lines.push(`المصدر: ${SOURCE_AR[m.source] || m.source}`);
  lines.push(`القناة: ${m.channel === 'web' ? 'رقم الأعمال 📱' : 'ميتا ☁️'}${m.payload?.failover ? ' (بديلاً عن القناة الأخرى)' : ''}`);
  if (m.payload?.fromPhone) lines.push('كُتبت من هاتف رقم الأعمال مباشرة');
  if (m.payload?._emulated?.raw) lines.push(`ردّ على قائمة مرقّمة بكتابة: «${m.payload._emulated.raw}»`);
  if (m.payload?.imported) lines.push('مستوردة من سجلّ رقم الأعمال');
  lines.push(`النوع: ${m.msgType}`);
  lines.push(`التوقيت: ${fmtWhen(m.createdAt)}`);
  if (m.direction === 'out') lines.push(`الحالة: ${STATUS_AR[m.status] || m.status || '—'}`);
  const hist = m.payload?.statusHistory;
  if (Array.isArray(hist) && hist.length) {
    lines.push('سجل الحالة:');
    for (const h of hist) lines.push(`  • ${STATUS_AR[h.status] || h.status} — ${fmtTime(h.at)}`);
  }
  if (m.payload?.by) lines.push(`كتبها: ${m.payload.by}`);
  if (m.payload?.styled && m.payload?.original) {
    lines.push('');
    lines.push('نصّ الموظّف قبل صياغة الدون:');
    lines.push(m.payload.original);
    lines.push('');
  } else if (m.payload?.styleSkipped) {
    const WHY: Record<string, string> = {
      off: 'الصياغة مطفأة', 'no-key': 'لا مفتاح للنموذج', 'no-letters': 'نصٌّ بلا حروف (رابط أو رمز)',
      'too-short': 'أقصر من الحدّ', timeout: 'تجاوزت الصياغة مهلتها — أُرسل نصّك',
      empty: 'عادت الصياغة فارغة', bypass: 'عطّلها الموظّف لهذه الرسالة',
      'approved-mine': 'الحارس اعترض واختار الموظّف نصّه', 'approved-styled': 'الحارس اعترض واختار الموظّف الصياغة',
    };
    const k = String(m.payload.styleSkipped);
    lines.push(`الصياغة: ${WHY[k] || (k.startsWith('guard:') ? `أوقفها الحارس (${k.slice(6)})` : k.startsWith('error:') ? `تعذّرت (${k.slice(6)})` : k)}`);
  }
  if (m.payload?.signed) lines.push('تحمل توقيع التحويل (أوّل ردٍّ بشريّ في الجلسة)');
  if (m.payload?._rendered && m.msgType === 'interactive') { lines.push(''); lines.push('كما وصلت العميل (رقم الأعمال لا يعرض الأزرار):'); lines.push(m.payload._rendered); lines.push(''); }
  if (m.payload?.customerReaction?.emoji) lines.push(`تفاعل العميل: ${m.payload.customerReaction.emoji} (${fmtTime(m.payload.customerReaction.at)})`);
  if (m.errorMessage) lines.push(`الخطأ: ${m.errorMessage}`);
  if (m.deletedAt) lines.push(`محذوفة من السجل: بواسطة ${m.deletedBy || 'أدمن'} — ${fmtWhen(m.deletedAt)}`);
  if (m.wamid) lines.push(`WAMID: ${m.wamid}`);
  return lines.join('\n');
}
