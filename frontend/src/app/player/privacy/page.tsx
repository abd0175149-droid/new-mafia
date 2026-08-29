'use client';

// ══════════════════════════════════════════════════════
// 🔐 مركز الخصوصيّة — حقوق صاحب البيانات في مكانٍ واحد
//
// 🔴 مجتمعةٌ عمداً: تفريقُ الحقوق في شاشاتٍ متفرّقة يجعلها موجودةً على الورق
//    مفقودةً في الاستعمال. القانون يشترط أن تُمارَس، لا أن تكون ممكنةً نظريّاً.
//
// 🔴 وبلا مقابلٍ ولا شرط: المادّة الرابعة تمنع أن يترتّب على ممارسة الحقّ ضررٌ
//    ماليٌّ أو تعاقديّ.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePlayer } from '@/context/PlayerContext';

const AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const ar = (v: any) => String(v ?? 0).replace(/[0-9]/g, d => AR[+d]);

export default function PrivacyCentre() {
  const { player } = usePlayer();
  const token = player?.token;

  const [status, setStatus] = useState<any>(null);
  const [deletion, setDeletion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/privacy/consent/status', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d?.success) { setStatus(d.status); setDeletion(d.deletion); }
    } catch { /* الشاشةُ تعرض ما تعرف */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const exportData = async () => {
    setBusy('export'); setErr(''); setMsg('');
    try {
      const r = await fetch('/api/privacy/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `mafia-club-data.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setMsg('نُزّلت نسخةٌ من بياناتك.');
    } catch { setErr('تعذّر التنزيل — أعد المحاولة'); }
    finally { setBusy(''); }
  };

  const restore = async () => {
    setBusy('restore'); setErr('');
    try {
      const r = await fetch('/api/privacy/deletion/restore', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!d?.success) { setErr(d?.error || 'تعذّرت الاستعادة'); return; }
      setMsg('عاد حسابُك.'); await load();
    } catch { setErr('تعذّر الاتّصال'); }
    finally { setBusy(''); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const days = deletion?.dueAt
    ? Math.max(0, Math.ceil((new Date(deletion.dueAt).getTime() - Date.now()) / 86400_000))
    : 0;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-lg font-bold">🔐 مركز الخصوصيّة</h1>
        <Link href="/player/profile" className="text-[12px] text-gray-500">← حسابي</Link>
      </div>

      {msg && <Note tone="ok">{msg}</Note>}
      {err && <Note tone="no">{err}</Note>}

      {deletion?.scheduled && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl p-4 mb-3"
          style={{ border: '1px solid rgba(217,58,63,.35)', background: 'rgba(217,58,63,.06)' }}>
          <p className="text-[14px] font-bold text-white">حسابُك مجدولٌ للحذف</p>
          <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
            يُمحى نهائيّاً بعد <b className="text-white">{ar(days)} {days === 1 ? 'يوم' : 'يوماً'}</b>. يمكنك التراجع الآن.
          </p>
          <button onClick={restore} disabled={busy === 'restore'}
            className="mt-3 w-full rounded-xl py-2.5 text-[14px] font-bold"
            style={{ background: 'rgba(42,143,212,.14)', border: '1px solid rgba(42,143,212,.45)', color: '#7FC0EE' }}>
            {busy === 'restore' ? '…' : 'استعِد حسابي'}
          </button>
        </motion.div>
      )}

      {/* موافقاتك */}
      <Card label="موافقاتك">
        {status?.current?.length ? status.current.map((c: any) => (
          <Row key={c.kind} icon="✅"
            title={c.kind === 'privacy' ? 'سياسة الخصوصيّة' : 'شروط الاستخدام'}
            sub={`النسخة ${ar(c.version)}${c.grantedAt ? ` · ${new Date(c.grantedAt).toLocaleDateString('ar-JO', { dateStyle: 'medium' })}` : ''}`} />
        )) : <p className="text-[13px] text-gray-500 py-2">لا موافقاتٍ مسجّلة بعد.</p>}
        {status?.isMinor && (
          <p className="text-[11px] mt-2 leading-relaxed" style={{ color: '#C5A059' }}>
            حسابُك مسجَّلٌ بموافقة وليّ الأمر — عمرُك {ar(status.age ?? '')} سنة.
          </p>
        )}
      </Card>

      {/* الحقوق */}
      <Card label="حقوقك — بلا مقابلٍ ولا شرط">
        <LinkRow href="/privacy" icon="📄" title="سياسة الخصوصيّة" sub="ما نجمعه ولماذا ومَن يستقبله" />
        <LinkRow href="/terms" icon="📋" title="شروط الاستخدام" sub="قواعد اللعب والحساب" />
        <button onClick={exportData} disabled={busy === 'export'} className="w-full text-right">
          <Row icon="📦" title="نزّل نسخةً من بياناتي"
            sub={busy === 'export' ? 'يُجهَّز…' : 'ملفٌّ واحد بكلّ ما يخصّك'} go />
        </button>
        <LinkRow href="/player/profile" icon="✏️" title="صحّح بياناتي" sub="الاسم · الهاتف · الميلاد" />
      </Card>

      {/* الحذف */}
      {!deletion?.scheduled && (
        <Card label="إنهاء الحساب">
          <p className="text-[12.5px] text-gray-400 leading-[1.9] mb-3">
            سحبُ موافقتك عن معالجةٍ لا تقوم الخدمةُ بدونها يعني انتهاءَ الخدمة. لذلك يتحوّل السحبُ
            إلى إغلاقٍ وحذف — مع مهلةِ تراجعٍ <b className="text-white">ثلاثين يوماً</b>.
          </p>
          <Link href="/player/privacy/delete"
            className="block w-full text-center rounded-xl py-2.5 text-[14px] font-bold"
            style={{ background: 'rgba(217,58,63,.1)', border: '1px solid rgba(217,58,63,.45)', color: '#F0A9A4' }}>
            احذف حسابي
          </Link>
        </Card>
      )}

      <p className="text-[11px] text-gray-600 leading-relaxed text-center mt-5">
        لأيّ سؤالٍ عن بياناتك:{' '}
        <a href="mailto:privacy@club-mafia.grade.sbs" className="text-amber-500/80" dir="ltr">privacy@club-mafia.grade.sbs</a>
        <br />
        ولك الشكوى إلى وحدة حماية البيانات الشخصيّة في وزارة الاقتصاد الرقميّ والريادة.
      </p>
    </div>
  );
}

// ══════════ قطع ══════════
const Card = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-2xl p-4 mb-3"
    style={{ background: 'rgba(255,255,255,.028)', border: '1px solid rgba(255,255,255,.06)' }}>
    <p className="text-[11px] text-gray-500 mb-2.5">{label}</p>
    {children}
  </div>
);

const Row = ({ icon, title, sub, go }: { icon: string; title: string; sub?: string; go?: boolean }) => (
  <div className="flex items-center gap-2.5 py-2.5"
    style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
    <span className="w-6 text-center shrink-0">{icon}</span>
    <span className="flex-1 min-w-0">
      <b className="block text-[13.5px] text-white font-bold">{title}</b>
      {sub && <span className="block text-[11px] text-gray-500 leading-relaxed">{sub}</span>}
    </span>
    {go && <span className="text-[12px] shrink-0" style={{ color: '#C5A059' }}>←</span>}
  </div>
);

const LinkRow = (p: { href: string; icon: string; title: string; sub?: string }) => (
  <Link href={p.href}><Row icon={p.icon} title={p.title} sub={p.sub} go /></Link>
);

const Note = ({ tone, children }: { tone: 'ok' | 'no'; children: React.ReactNode }) => (
  <p className="text-[13px] leading-relaxed px-3 py-2 rounded-xl mb-3"
    style={tone === 'ok'
      ? { color: '#7FC0EE', background: 'rgba(42,143,212,.1)', border: '1px solid rgba(42,143,212,.3)' }
      : { color: '#F0A9A4', background: 'rgba(217,58,63,.1)', border: '1px solid rgba(217,58,63,.3)' }}>
    {children}
  </p>
);
