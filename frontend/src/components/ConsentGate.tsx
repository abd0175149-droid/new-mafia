'use client';

// ══════════════════════════════════════════════════════
// 🔐 بوّابة الموافقة — حاجبةٌ قبل كلّ شاشة
//
// 🔴 حاجبةٌ عمداً: القانون لا يُجيز معالجةَ البيانات قبل الموافقة، فشاشةٌ خلفها
//    تعمل تعني أنّنا نعالج قبل أن نُؤذَن.
//
// 🔴 الحالةُ من الخادم لا من ذاكرة الجهاز، ولها نسخةٌ محلّيّة:
//    انقطاعُ الشبكة **لا يمنح موافقةً** (أوّلُ فتحةٍ تُحجب مع زرّ إعادة)،
//    ولا **يحبس** لاعباً وافق أمس (النسخةُ المحلّيّة تمرّره).
//    والحارسُ الحقيقيّ على الخادم — هذه راحةُ مستخدمٍ لا أمن.
//
// 🔴 وسحبُ الموافقة يُحوَّل إلى حذف: حسابٌ معلَّق لا يُحذف ولا يعمل يترك
//    بياناتٍ تُعالَج بلا سند، وهو ما يمنعه القانون.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';
import { PolicyBody, usePolicyDoc } from '@/components/PolicyDoc';

const CACHE_KEY = 'mafia_consent_ok';
const platform = () =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent) ? 'android'
    : typeof navigator !== 'undefined' && /iphone|ipad/i.test(navigator.userAgent) ? 'ios'
    : 'web';

interface Missing { kind: 'privacy' | 'terms'; version: string; title: string; changeSummary: string; isUpdate: boolean }
interface Status {
  required: boolean; isMinor: boolean; needsGuardian: boolean;
  missing: Missing[]; current: { kind: string; version: string }[]; age?: number | null;
}

type View = 'gate' | 'read' | 'refuse' | 'scheduled';

export default function ConsentGate({ children }: { children: React.ReactNode }) {
  const { player } = usePlayer();
  const token = player?.token;

  const [status, setStatus] = useState<Status | null>(null);
  const [deletion, setDeletion] = useState<{ scheduled: boolean; dueAt: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<View>('gate');
  const [readKind, setReadKind] = useState<'privacy' | 'terms'>('privacy');
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [guardian, setGuardian] = useState({ name: '', phone: '', relation: 'وليّ أمر' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [ackBalance, setAckBalance] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/privacy/consent/status', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!d?.success) throw new Error(d?.error || 'x');
      setStatus(d.status);
      setDeletion(d.deletion);
      setOffline(false);
      if (!d.status.required && !d.deletion) {
        try { localStorage.setItem(CACHE_KEY, '1'); } catch { /* وضعُ التصفّح الخاصّ */ }
      } else {
        try { localStorage.removeItem(CACHE_KEY); } catch { /* لا شيء */ }
      }
    } catch {
      // شبكةٌ ساقطة: نمرّر مَن وافق سابقاً، ونحجب مَن لا نعرف عنه شيئاً
      setOffline(true);
      let cached = false;
      try { cached = localStorage.getItem(CACHE_KEY) === '1'; } catch { /* لا شيء */ }
      setStatus(cached ? { required: false, isMinor: false, needsGuardian: false, missing: [], current: [] } : null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) load(); else setLoading(false); }, [token, load]);

  const accept = async () => {
    if (!status || !token) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accept: status.missing.map(m => ({ kind: m.kind, version: m.version })),
          platform: platform(),
          guardian: status.isMinor ? guardian : undefined,
        }),
      });
      const d = await r.json();
      if (!d?.success) { setErr(d?.error || 'تعذّر التسجيل'); return; }
      await load();
    } catch { setErr('تعذّر الاتّصال — أعد المحاولة'); }
    finally { setBusy(false); }
  };

  const openRefuse = async () => {
    setView('refuse'); setErr(''); setAckBalance(false);
    try {
      const r = await fetch('/api/privacy/deletion/preview', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d?.success) setPreview(d.preview);
    } catch { /* المعاينة رفاهيّة */ }
  };

  const confirmDelete = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/privacy/deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: 'refused_consent', platform: platform(), acknowledgeBalance: ackBalance }),
      });
      const d = await r.json();
      if (!d?.success) { setErr(d?.error || 'تعذّر الحذف'); return; }
      await load(); setView('gate');
    } catch { setErr('تعذّر الاتّصال'); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/privacy/deletion/restore', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!d?.success) { setErr(d?.error || 'تعذّرت الاستعادة'); return; }
      await load();
    } catch { setErr('تعذّر الاتّصال'); }
    finally { setBusy(false); }
  };

  // لا لاعب ⇒ لا بوّابة (صفحات الدخول تُدار في التخطيط)
  if (!token) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  // شبكةٌ ساقطة وأوّلُ فتحة: نحجب ولا نمنح موافقةً بالصمت
  if (offline && !status) {
    return (
      <Shell>
        <H>تعذّر التحقّق</H>
        <P>لم نستطع الوصول إلى الخادم للتحقّق من موافقتك. تأكّد من اتّصالك ثمّ أعد المحاولة.</P>
        <Btn kind="ok" onClick={() => { setLoading(true); load(); }}>إعادة المحاولة</Btn>
      </Shell>
    );
  }

  // حسابٌ مجدولٌ للحذف — شاشةُ الاستعادة تسبق كلّ شيء
  if (deletion?.scheduled) {
    const days = Math.max(0, Math.ceil((new Date(deletion.dueAt).getTime() - Date.now()) / 86400_000));
    return (
      <Shell>
        <H>حسابُك مجدولٌ للحذف</H>
        <div className="rounded-2xl p-4 my-1" style={{ border: '1px solid rgba(217,58,63,.3)', background: 'rgba(217,58,63,.05)' }}>
          <p className="text-[11px] text-gray-500 mb-1">يُمحى نهائيّاً بعد</p>
          <p className="text-[30px] font-bold text-center" style={{ color: '#D93A3F' }}>
            {ar(days)} {days === 1 ? 'يوم' : 'يوماً'}
          </p>
          <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
            حسابُك معطّلٌ الآن ولا يظهر لأحد. بياناتُك محفوظةٌ مقفلةً حتّى انتهاء المهلة.
          </p>
        </div>
        {err && <Err>{err}</Err>}
        <Btn kind="blue" onClick={restore} busy={busy}>استعِد حسابي الآن</Btn>
        <p className="text-[11px] text-gray-600 leading-relaxed text-center">
          بعد انتهاء المهلة تُمحى بياناتُك الشخصيّة ولا يمكن استعادة الحساب.
        </p>
      </Shell>
    );
  }

  if (!status?.required) return <>{children}</>;

  // ── قراءةُ الوثيقة ──
  if (view === 'read') {
    return <Reader kind={readKind} onBack={() => setView('gate')} />;
  }

  // ── الرفض ──
  if (view === 'refuse') {
    const chips = Number(preview?.chipsBalance ?? 0);
    return (
      <Shell>
        <H>ما الذي ستفقده</H>
        <P>معالجةُ بياناتك ليست خياراً إضافيّاً — هي ما يجعل الحساب واللعب ممكنَين. لذلك يتحوّل الرفضُ إلى إغلاقٍ وحذف.</P>
        <div className="rounded-2xl p-3.5" style={{ border: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.028)' }}>
          {[
            ['🪙', `رصيدُ رقائقك: ${ar(chips)}`, chips > 0 ? 'اشتُري بمالٍ حقيقيّ — يُسوّى قبل الحذف' : 'لا رصيد'],
            ['🏆', `رتبتُك${preview?.level ? ` · المستوى ${ar(preview.level)}` : ''}`, 'تُفقد بالكامل'],
            ['📊', `سجلُّ ${ar(preview?.matches ?? 0)} مباراة`, 'يبقى بلا اسمك في تاريخ خصومك'],
            ['🎟️', `${ar(preview?.upcomingBookings ?? 0)} حجزٌ قادم`, 'يُلغى تلقائيّاً'],
          ].map(([i, t, s], k) => (
            <div key={k} className="flex items-center gap-2.5 py-2"
              style={{ borderBottom: k < 3 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
              <span className="w-6 text-center">{i}</span>
              <span className="flex-1 min-w-0">
                <b className="block text-[13px] text-white font-bold">{t}</b>
                <span className="block text-[11px] text-gray-500">{s}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-3.5" style={{ border: '1px solid rgba(197,160,89,.28)', background: 'rgba(197,160,89,.05)' }}>
          <p className="text-[13px] text-gray-300 leading-relaxed">
            لديك <b className="text-white">٣٠ يوماً</b> لتغيير رأيك. خلالها يختفي حسابُك من كلّ الشاشات، وتكفي عودتُك لتستعيده.
          </p>
        </div>
        {chips > 0 && (
          <Tick on={ackBalance} onClick={() => setAckBalance(v => !v)}>
            أقرّ بأنّ لديّ رصيداً قائماً ({ar(chips)} رقاقة) وأتنازل عنه، أو سأتواصل مع النادي لتسويته.
          </Tick>
        )}
        {err && <Err>{err}</Err>}
        <Btn kind="no" onClick={confirmDelete} busy={busy} disabled={chips > 0 && !ackBalance}>احذف حسابي</Btn>
        <Btn kind="ghost" onClick={() => { setView('gate'); setErr(''); }}>تراجع</Btn>
      </Shell>
    );
  }

  // ── البوّابة ──
  const isUpdate = status.missing.some(m => m.isUpdate);
  const allTicked = status.missing.every(m => ticks[m.kind]);
  const guardianOk = !status.isMinor
    || (guardian.name.trim().length >= 3 && /^0?7[789]\d{7}$/.test(guardian.phone.replace(/\s|-/g, '')));

  return (
    <Shell>
      <H>{isUpdate ? 'تحدّثت السياسة' : 'قبل أن نبدأ'}</H>
      <P>
        {isUpdate
          ? 'صدرت نسخةٌ جديدة. اقرأ ما تغيّر ثمّ قرّر — موافقتُك السابقة تبقى سارية حتّى تختار.'
          : 'لتشغيل حسابك نعالج بياناتٍ تخصّك. اقرأ ما نجمعه ولماذا، ثمّ قرّر.'}
      </P>

      {status.isMinor && (
        <div className="rounded-2xl p-3.5" style={{ border: '1px solid rgba(197,160,89,.3)', background: 'rgba(197,160,89,.06)' }}>
          <p className="text-[13px] font-bold text-white mb-1">موافقة وليّ الأمر</p>
          <p className="text-[12px] text-gray-400 leading-relaxed mb-2.5">
            عمرُك دون الثامنة عشرة، ويلزم تأكيدُ وليّ أمرك. تُسجَّل الموافقةُ باسمه.
          </p>
          <input
            value={guardian.name} onChange={e => setGuardian(g => ({ ...g, name: e.target.value }))}
            placeholder="اسمُ وليّ الأمر" dir="rtl"
            className="w-full mb-2 px-3 py-2 rounded-xl text-[14px] text-white outline-none"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }} />
          <input
            value={guardian.phone} onChange={e => setGuardian(g => ({ ...g, phone: e.target.value }))}
            placeholder="07XXXXXXXX" inputMode="tel" dir="ltr"
            className="w-full px-3 py-2 rounded-xl text-[14px] text-white outline-none"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }} />
        </div>
      )}

      {status.missing.map(m => (
        <div key={m.kind} className="space-y-2">
          {m.isUpdate && m.changeSummary && (
            <p className="text-[12px] leading-relaxed px-1" style={{ color: '#C5A059' }}>ما تغيّر: {m.changeSummary}</p>
          )}
          <Btn kind="ghost" onClick={() => { setReadKind(m.kind); setView('read'); }}>
            اقرأ {m.title} كاملةً ←
          </Btn>
          <Tick on={!!ticks[m.kind]} onClick={() => setTicks(t => ({ ...t, [m.kind]: !t[m.kind] }))}>
            {m.kind === 'privacy'
              ? 'قرأتُ سياسة الخصوصيّة وأوافق على معالجة بياناتي للأغراض المبيّنة.'
              : 'أوافق على شروط الاستخدام وقواعد اللعب.'}
          </Tick>
        </div>
      ))}

      {err && <Err>{err}</Err>}
      <Btn kind="ok" onClick={accept} busy={busy} disabled={!allTicked || !guardianOk}>
        {status.isMinor ? 'تأكيد الموافقة' : 'موافق · متابعة'}
      </Btn>
      <Btn kind="no" onClick={openRefuse}>لا أوافق</Btn>
      <p className="text-[11px] text-gray-600 leading-relaxed text-center">
        تُسجَّل موافقتُك بنسختها ووقتها. ولك سحبُها لاحقاً من الإعدادات ← مركز الخصوصيّة.
      </p>
    </Shell>
  );
}

// ══════════ قطعٌ صغيرة ══════════
const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ar = (v: any) => String(v ?? 0).replace(/[0-9]/g, d => AR[+d]);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#050505] flex items-start justify-center px-4 py-8" dir="rtl">
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md space-y-3">{children}</motion.div>
  </div>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h1 className="text-[26px] font-bold text-white leading-tight" style={{ fontFamily: 'Amiri, serif' }}>{children}</h1>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[14px] text-gray-400 leading-[1.9]">{children}</p>
);
const Err = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] leading-relaxed px-3 py-2 rounded-xl"
    style={{ color: '#F0A9A4', background: 'rgba(217,58,63,.1)', border: '1px solid rgba(217,58,63,.3)' }}>
    {children}
  </p>
);

function Btn({ kind, children, onClick, busy, disabled }: {
  kind: 'ok' | 'no' | 'ghost' | 'blue'; children: React.ReactNode;
  onClick: () => void; busy?: boolean; disabled?: boolean;
}) {
  const style: Record<string, React.CSSProperties> = {
    ok: { background: 'linear-gradient(135deg,#D8B36A,#C5A059)', color: '#100D08' },
    no: { background: 'rgba(217,58,63,.1)', border: '1px solid rgba(217,58,63,.45)', color: '#F0A9A4' },
    blue: { background: 'rgba(42,143,212,.12)', border: '1px solid rgba(42,143,212,.45)', color: '#7FC0EE' },
    ghost: { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#9C958A' },
  };
  const off = disabled || busy;
  return (
    <button onClick={onClick} disabled={off}
      className="w-full rounded-2xl py-3 text-[15px] font-extrabold transition-opacity"
      style={{ ...style[kind], opacity: off ? 0.45 : 1, cursor: off ? 'not-allowed' : 'pointer' }}>
      {busy ? '…' : children}
    </button>
  );
}

function Tick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="w-full flex gap-2.5 items-start text-right rounded-2xl px-3 py-2.5"
      style={{ background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}>
      <span className="w-[19px] h-[19px] rounded-md flex items-center justify-center text-[12px] shrink-0 mt-0.5"
        style={{
          border: `1.5px solid ${on ? '#C5A059' : '#474139'}`,
          background: on ? '#C5A059' : 'transparent', color: '#100D08',
        }}>
        {on ? '✓' : ''}
      </span>
      <span className="text-[13px] text-gray-300 leading-[1.7]">{children}</span>
    </button>
  );
}

function Reader({ kind, onBack }: { kind: 'privacy' | 'terms'; onBack: () => void }) {
  const { doc, loading, error } = usePolicyDoc(kind);
  return (
    <div className="min-h-screen bg-[#050505] px-4 py-6" dir="rtl">
      <div className="max-w-md mx-auto">
        <button onClick={onBack}
          className="text-[13px] mb-4 px-3 py-1.5 rounded-xl"
          style={{ color: '#C5A059', border: '1px solid rgba(197,160,89,.3)' }}>
          → رجوع
        </button>
        {loading && (
          <div className="flex justify-center py-14">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {doc && (
          <>
            <h1 className="text-[24px] font-bold text-white" style={{ fontFamily: 'Amiri, serif' }}>{doc.title}</h1>
            <p className="text-[11px] text-gray-600 mb-3">النسخة {doc.version}</p>
            <PolicyBody body={doc.body} />
          </>
        )}
      </div>
    </div>
  );
}
