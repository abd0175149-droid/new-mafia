'use client';

// ══════════════════════════════════════════════════════
// مفاتيح النظام — المفاتيح الستّة التي كانت على رأس لوحة التحكّم (نُقلت 2026-11)
// كلّ مفتاح يحتفظ بمساره ومنطقه ونصّه كما كان:
//   القراءة GET (من يرفضه الخادم 401/403 لا يرى السطر) · التبديل PUT {enabled} للأدمن فقط.
// غير الأدمن يراها للقراءة: المفتاح معطَّل بدل خطأ بعد الضغط.
// ══════════════════════════════════════════════════════

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, Lock } from 'lucide-react';
import { Badge, Banner, Card, Setting, Skel, Toggle } from '../whatsapp/wa-ui';
import '../whatsapp/wa.css';
import '../dash.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const auth = () => ({ Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') : ''}` });
const N = ({ children }: { children: ReactNode }) => <span className="ltr">{children}</span>;

interface SwitchDef {
  key: string;
  getPath: string;
  putPath: string;
  title: string;
  /** يُعاد الجلب كلّ هذه المدّة (فواتير واتساب كانت تُحدَّث كلّ دقيقة) */
  pollMs?: number;
  hint: (s: any) => ReactNode;
  extra?: (s: any) => ReactNode;
}

function SwitchRow({ def, isAdmin, onState }: { def: SwitchDef; isAdmin: boolean; onState: (key: string, st: 'ok' | 'hidden') => void }) {
  const [s, setS] = useState<any>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}${def.getPath}`, { headers: auth() });
      if (r.status === 401 || r.status === 403) { setHidden(true); onState(def.key, 'hidden'); return; }
      const d = await r.json();
      if (d.success) { setS(d); onState(def.key, 'ok'); }
    } catch { /* يبقى السطر بآخر حالة */ }
  }, [def.getPath, def.key, onState]);

  useEffect(() => {
    load();
    if (!def.pollMs) return;
    const iv = setInterval(load, def.pollMs);
    return () => clearInterval(iv);
  }, [load, def.pollMs]);

  const toggle = async () => {
    if (!s || busy || !isAdmin) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_URL}${def.putPath}`, {
        method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setErr(d.error || (r.status === 403 ? 'التبديل للأدمن فقط' : 'تعذّر التبديل'));
      else setS(d);
    } catch { setErr('خطأ في الاتصال'); }
    setBusy(false);
  };

  if (hidden) return null;
  if (!s) return <Setting title={def.title} hint={<Skel h={14} w="70%" />} />;

  return (
    <Setting
      title={def.title}
      hint={<>
        {def.hint(s)}
        {def.extra?.(s)}
        {err && <span className="dash-sw-err" role="alert">{err}</span>}
      </>}
    >
      <div className="dash-sw-ctl">
        <Toggle on={!!s.enabled} onChange={toggle} label={def.title} disabled={busy || !isAdmin} />
        <small>{s.enabled ? 'يعمل' : 'مطفأ'}</small>
      </div>
    </Setting>
  );
}

/** بوّابة الواتساب: قائمة من سيُطلب منهم تغيير الرقم — تُفتح بالطلب */
function WaGateNeeds({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  const list: any[] = Array.isArray(s.needs) ? s.needs : [];
  const needs = (Number(s.none) || 0) + (Number(s.invalid) || 0);
  const recent = list.filter(n => n.lastActive && Date.now() - new Date(n.lastActive).getTime() < 90 * 86400e3).length;
  if (needs <= 0) return null;
  return (
    <>
      <button type="button" className="dash-sw-link" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {open ? <ChevronDown className="s" aria-hidden="true" /> : <ChevronLeft className="s" aria-hidden="true" />}
        <span>سيُطلب تغيير الرقم من <b><N>{needs}</N></b> لاعباً — منهم <b><N>{recent}</N></b> نشطون آخر <N>90</N> يوماً</span>
      </button>
      {open && (
        <span className="dash-sw-list">
          {list.slice(0, 200).map(n => (
            <Link key={n.id} href={`/admin/players/${n.id}`}>
              <span className="grow trunc">{n.name}</span>
              <N>{n.phone}</N>
              <Badge tone={n.reason === 'invalid' ? 'warn' : 'danger'}>{n.reason === 'invalid' ? 'غير صالح' : 'بلا واتساب'}</Badge>
            </Link>
          ))}
        </span>
      )}
    </>
  );
}

const SWITCHES: SwitchDef[] = [
  {
    key: 'invoice-wa', getPath: '/api/admin/invoice-wa', putPath: '/api/admin/invoice-wa', pollMs: 60_000,
    title: 'إرسال الفواتير عبر واتساب',
    hint: s => <>
      {s.enabled ? 'يعمل في كلّ الأماكن — فاتورة عند كلّ توصيل، وختم بعد التحصيل' : 'مطفأ في الأماكن الحقيقيّة — والبوت يجيب عن الحساب نصّاً'}
      <span className="dash-sw-more">موقع الاختبار يعمل دائماً، ويصل حسابات الموظّفين فقط — للتجربة قبل التشغيل.{s.by ? ` · آخر تبديل: ${s.by}` : ''}</span>
    </>,
    extra: s => {
      const t = s.tonight || {};
      const ch = s.channels || {};
      return <>
        <span className="dash-sw-meta">
          <Badge tone={ch.web ? 'ok' : 'danger'}>رقم الأعمال {ch.web ? 'متّصل' : 'غير متّصل'}</Badge>
          <Badge tone={ch.cloud ? 'ok' : undefined}>ميتا {ch.cloud ? 'متاحة' : 'غير مهيّأة'}</Badge>
          <Badge>آخر <N>14</N> ساعة: <N>{t.invoices ?? 0}</N> فاتورة · <N>{t.stamps ?? 0}</N> ختم · <N>{t.transfers ?? 0}</N> حوالة</Badge>
          {(t.failed ?? 0) > 0 && <Badge tone="danger"><N>{t.failed}</N> لم تُرسل</Badge>}
        </span>
        {s.enabled && !ch.web && !ch.cloud && (
          <span className="dash-sw-err">لا قناة متّصلة الآن — الفواتير تنتظر وتظهر في كونسول المكان «لم تُرسل».</span>
        )}
      </>;
    },
  },
  {
    key: 'wa-gate', getPath: '/api/admin/wa-gate', putPath: '/api/admin/wa-gate',
    title: 'بوّابة رقم الواتساب',
    hint: s => (s.enabled ? 'تعمل — من رقمه بلا واتساب لا يدخل التطبيق حتّى يربط رقماً عليه واتساب' : 'مطفأة — راجع الأرقام ثمّ شغّلها'),
    extra: s => <>
      <span className="dash-sw-meta">
        <Badge tone="ok">عليه واتساب <N>{s.active ?? 0}</N></Badge>
        <Badge tone="danger">بلا واتساب <N>{s.none ?? 0}</N></Badge>
        <Badge tone="warn">رقم غير صالح <N>{s.invalid ?? 0}</N></Badge>
        <Badge>لم يُفحص <N>{s.unknown ?? 0}</N></Badge>
      </span>
      <WaGateNeeds s={s} />
    </>,
  },
  {
    key: 'res-confirm', getPath: '/api/admin/res-confirm', putPath: '/api/admin/res-confirm',
    title: 'رسالة تثبيت الحجز',
    hint: s => (s.enabled
      ? 'تعمل — كلّ حجزٍ يُثبَّت تصله رسالة القالب من رقم الأعمال، مرّةً واحدة'
      : 'مطفأة — الإرسال يدويّ من «متابعة الحجوزات». موقع الاختبار يعمل لحسابات الموظّفين'),
    extra: s => {
      const t = s.last24h || {};
      return <>
        <span className="dash-sw-meta">
          <Badge tone="ok">أُرسلت <N>{t.sent ?? 0}</N></Badge>
          <Badge tone="info">مجدولة <N>{t.pending ?? 0}</N></Badge>
          <Badge tone="danger">تعذّرت <N>{t.failed ?? 0}</N></Badge>
          <Badge>تُخطّيت <N>{t.skipped ?? 0}</N></Badge>
          <span>آخر <N>24</N> ساعة</span>
        </span>
        <Link className="dash-sw-link" href="/admin/reservations">
          القالب يُعدَّل من «متابعة الحجوزات ← المزيد ← قالب رسالة التأكيد»{s.templateIsDefault ? '' : ' (معدَّل)'}
        </Link>
      </>;
    },
  },
  {
    key: 'photo-zone', getPath: '/api/admin/photo-zone', putPath: '/api/admin/photo-zone',
    title: 'زاوية بلا تصوير',
    hint: s => (s.enabled
      ? 'تعمل — كلّ لاعب يُسأل عند دخول الغرفة، والرافضون يجلسون متجاورين ليستثنيهم المصوّر'
      : 'مطفأة — لا سؤال، والتوزيع كما كان'),
    extra: s => {
      const a = s.answers || {};
      return <>
        <span className="dash-sw-meta">
          <Badge tone="ok">يقبلون <N>{a.yes ?? 0}</N></Badge>
          <Badge tone="warn">لا يقبلون <N>{a.no ?? 0}</N></Badge>
          <Badge>لم يُسألوا بعد <N>{a.unanswered ?? 0}</N></Badge>
        </span>
        <span className="dash-sw-more">من لم يُجب يُعامل «بلا تصوير» حتى يجيب، ومن هو تحت <N>18</N> سنة بلا تصوير دائماً. مرساة الزاوية من «قوالب المقاعد».</span>
      </>;
    },
  },
  {
    key: 'leader-ui', getPath: '/api/leader-ui', putPath: '/api/leader-ui',
    title: 'قمرة الليدر',
    hint: s => (s.enabled ? 'تعمل — كلّ ليدر في كلّ الغرف يدير اللعبة بالواجهة الجديدة للهاتف' : 'مطفأة — الليدر على الواجهة القديمة'),
    extra: () => <span className="dash-sw-more">يسري على صفحات الليدر خلال دقيقة دون إعادة فتحها. إن تعذّر عرض القمرة على جهازٍ ما تعود تلقائيّاً للواجهة القديمة.</span>,
  },
  {
    key: 'player-ui', getPath: '/api/player-ui/admin', putPath: '/api/player-ui',
    title: 'شاشة اللاعب الجديدة',
    hint: s => (s.enabled ? 'تعمل — هواتف اللاعبين داخل الغرفة على الواجهة الجديدة' : 'مطفأة — اللاعبون على الواجهة الحاليّة'),
    extra: () => <span className="dash-sw-more">يسري على هواتف اللاعبين خلال دقيقة. الأفضل تبديله بين الألعاب لا أثناءها. إن تعذّر عرض الواجهة الجديدة على هاتفٍ ما يعود تلقائيّاً للحاليّة.</span>,
  },
];

export default function SystemSwitchesPage() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    try { setRole(JSON.parse(localStorage.getItem('user') || '{}')?.role || ''); } catch { setRole(''); }
  }, []);
  const isAdmin = role === 'admin';

  // إن رفض الخادم المفاتيح كلّها لهذا الدور تُقال صراحةً بدل بطاقة فارغة
  const [states, setStates] = useState<Record<string, 'ok' | 'hidden'>>({});
  const onState = useCallback((key: string, st: 'ok' | 'hidden') => {
    setStates(prev => (prev[key] === st ? prev : { ...prev, [key]: st }));
  }, []);
  const allHidden = SWITCHES.every(d => states[d.key] === 'hidden');

  return (
    <div className="wa dash dash-sw" dir="rtl" style={{ background: 'transparent' }}>
      <header className="dash-h"><div><h1>مفاتيح النظام</h1><p>تشغيل وإيقاف ميزات تسري على النادي كلّه فور تبديلها.</p></div></header>
      {role !== null && !isAdmin && !allHidden && (
        <Banner tone="info" icon={<Lock aria-hidden="true" />}>للقراءة فقط — التبديل للأدمن.</Banner>
      )}
      {role === null ? (
        <Card><div className="stack"><Skel h={48} /><Skel h={48} /><Skel h={48} /></div></Card>
      ) : allHidden ? (
        <Banner tone="info" icon={<Lock aria-hidden="true" />}>لا مفاتيح متاحة لحسابك.</Banner>
      ) : (
        <Card>
          {SWITCHES.map(def => <SwitchRow key={def.key} def={def} isAdmin={isAdmin} onState={onState} />)}
        </Card>
      )}
    </div>
  );
}
