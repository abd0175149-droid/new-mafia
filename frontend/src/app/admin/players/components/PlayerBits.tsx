'use client';

// ══════════════════════════════════════════════════════
// صفحة اللاعبين — القطع الصغيرة: الصورة، الشارات، زرّا واتساب والاتّصال،
// وملخّص اللاعب مع إجراءاته (يُرسم في اللوح الجانبيّ وفي نافذة «⋯» معاً)
// ══════════════════════════════════════════════════════

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  ChevronLeft, CircleCheck, History, KeyRound, Lock, LockOpen, MessageCircle, Phone, Trash2,
} from 'lucide-react';
import { useWaDirect } from '@/hooks/useWaDirect';
import { rankName } from '@/lib/ranks';
import { Badge, Banner, Setting, Tile, Toggle } from '../../whatsapp/wa-ui';
import {
  API_URL, cityStanding, fmtDate, lastActiveCell, playerFlags, readRole, toWaNumber, winRate,
  type PlayerActions,
} from './shared';

export function Avatar({ p, size }: { p: any; size?: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 56 : size === 'sm' ? 36 : 44;
  return (
    <span className={`wa-avatar pl-av${size ? ` ${size}` : ''}`} aria-hidden="true">
      {p.avatarUrl
        ? <Image src={`${API_URL}${p.avatarUrl}`} alt="" width={px} height={px} />
        : (String(p.name || '').trim()[0] || '؟')}
    </span>
  );
}

/** شارات الحالة — `max` يحدّ العدد (بطاقة الهاتف تعرض اثنتين والباقي رقماً) */
export function StatusBadges({ p, max }: { p: any; max?: number }) {
  const all = playerFlags(p);
  if (!all.length) return <span className="muted">—</span>;
  const shown = max ? all.slice(0, max) : all;
  const rest = all.length - shown.length;
  return (
    <span className="pl-badges">
      {shown.map(f => {
        const Icon = f.icon;
        const title = f.key === 'isLocked' ? (p.lockedReason || undefined)
          : f.key === 'geofenceExempt' ? (p.geofenceExemptReason || 'معفى من فحص الموقع')
          : undefined;
        return <Badge key={f.key} tone={f.tone} title={title}><Icon />{f.label}</Badge>;
      })}
      {rest > 0 && <Badge title={all.slice(shown.length).map(f => f.label).join(' · ')}><span className="ltr">+{rest}</span></Badge>}
    </span>
  );
}

/**
 * زرّ واتساب — السلوكُ نفسُه في components/WhatsAppButton.tsx حرفيّاً:
 * للأدمن حين يكون رقمُ الأعمال مفعّلاً يفتح المحادثة داخل مركز واتساب، وإلّا الرابطُ الخارجيّ.
 * لا يظهر إن كان الرقم غير صالح.
 */
export function WaLink({ phone, name }: { phone?: string | null; name?: string }) {
  const wa = toWaNumber(phone);
  const directOn = useWaDirect();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(readRole() === 'admin'); }, []);
  const direct = directOn && isAdmin;
  if (!wa) return <span className="pl-nobtn" aria-hidden="true" />;
  return (
    <a
      className="wa-iconbtn pl-wa"
      href={direct ? `/admin/whatsapp?phone=${wa}` : `https://wa.me/${wa}`}
      target={direct ? undefined : '_blank'}
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={direct ? 'فتح المحادثة في مركز واتساب' : 'فتح محادثة واتساب'}
      aria-label={`محادثة واتساب${name ? ` مع ${name}` : ''}`}
    >
      <MessageCircle />
    </a>
  );
}

export function CallLink({ phone, name }: { phone?: string | null; name?: string }) {
  if (!phone) return <span className="pl-nobtn" aria-hidden="true" />;
  return (
    <a className="wa-iconbtn pl-call" href={`tel:${String(phone).replace(/[^\d+]/g, '')}`}
      onClick={e => e.stopPropagation()} title="اتّصال" aria-label={`اتّصال${name ? ` بـ${name}` : ''}`}>
      <Phone />
    </a>
  );
}

/** السطر الصغير تحت الاسم: الرتبة · المدينة · #المعرّف — أو «لم يلعب في X» */
export function RankLine({ p, cityFilter, cityFilterName }: { p: any; cityFilter: number | null; cityFilterName: string | null }) {
  const s = cityStanding(p, cityFilter, cityFilterName);
  return (
    <span className="pl-sub">
      {s.notPlayedHere
        ? <>لم يلعب في {cityFilterName || 'هذه المدينة'}</>
        : <>{rankName(p.rankTier)}{s.shownCityName ? ` · ${s.shownCityName}` : ''}</>}
      {' · '}<span className="ltr">#{p.id}</span>
    </span>
  );
}

/** حكمٌ من سطرٍ واحد — ممّا في القائمة وحده */
function Verdict({ p }: { p: any }) {
  if (p.isLocked) {
    return (
      <Banner tone="danger" icon={<Lock />}>
        <b>الحساب مقفول — لا يستطيع الدخول.</b>
        {p.lockedReason ? ` السبب: ${p.lockedReason}` : ''}
        {p.lockedAt ? <> · منذ <span className="ltr">{fmtDate(p.lockedAt)}</span></> : null}
      </Banner>
    );
  }
  if (p.mustChangePassword) {
    return <Banner tone="warn" icon={<KeyRound />}><b>ما زال على كلمة السرّ الافتراضيّة.</b> سيُطلب منه تغييرُها عند الدخول.</Banner>;
  }
  return <Banner tone="ok" icon={<CircleCheck />}><b>لا مانع على الحساب.</b></Banner>;
}

/**
 * ملخّص اللاعب وإجراءاته.
 * `canAct=false` (غير الأدمن) يُخفي الإجراءات — الخادم يرفضها أصلاً (adminOnly).
 */
export function PlayerPanel({ p, cityFilter, cityFilterName, actions, canAct, compact }: {
  p: any;
  cityFilter: number | null;
  cityFilterName: string | null;
  actions: PlayerActions;
  canAct: boolean;
  /** داخل النافذة: بلا رأس الهويّة الكبير (عنوان النافذة يحمل الاسم) */
  compact?: boolean;
}) {
  const s = cityStanding(p, cityFilter, cityFilterName);
  const act = lastActiveCell(p);
  const flags = playerFlags(p);
  const busy = (k: string) => actions.busy === `${p.id}:${k}`;

  return (
    <div className="pl-panel">
      <div className="row" style={{ gap: 12 }}>
        <Avatar p={p} size={compact ? undefined : 'lg'} />
        <div className="grow">
          {!compact && <b className="pl-panel-name trunc">{p.name}</b>}
          <div className="pl-sub">
            {p.gender === 'FEMALE' ? 'أنثى' : 'ذكر'} · <span className="ltr">#{p.id}</span>
            {p.createdAt ? <> · منذ <span className="ltr">{fmtDate(p.createdAt)}</span></> : null}
          </div>
          {p.phone && <div className="pl-sub"><span className="ltr">{p.phone}</span></div>}
        </div>
        <span className="pl-acts">
          <WaLink phone={p.phone} name={p.name} />
          <CallLink phone={p.phone} name={p.name} />
        </span>
      </div>

      <Verdict p={p} />

      {flags.filter(f => f.key !== 'isLocked' && f.key !== 'mustChangePassword').length > 0 && (
        <span className="pl-badges">
          {flags.filter(f => f.key !== 'isLocked' && f.key !== 'mustChangePassword').map(f => {
            const Icon = f.icon;
            return <Badge key={f.key} tone={f.tone}><Icon />{f.label}</Badge>;
          })}
        </span>
      )}

      <div className="wa-grid3 pl-tiles">
        <Tile k="مباريات" v={p.totalMatches || 0} />
        <Tile k="فوز" v={p.totalMatches > 0 ? `${winRate(p)}%` : '—'} h={<><span className="ltr">{p.totalWins || 0}</span> مرّة</>} tone="ok" />
        <Tile k="نجا" v={p.totalSurvived || 0} />
      </div>

      <div className="pl-kvs">
        <div className="wa-kv">
          <span>الرتبة{s.shownCityName ? ` في ${s.shownCityName}` : ''}</span>
          {s.notPlayedHere
            ? <b className="muted">لم يلعب في {cityFilterName || 'هذه المدينة'}</b>
            : <b>{rankName(p.rankTier)}</b>}
        </div>
        {!s.notPlayedHere && (
          <div className="wa-kv"><span>المستوى · نقاط الرتبة</span><b className="ltr">Lv.{p.level || 1} · {p.rankRR || 0} RR</b></div>
        )}
        {s.others.map((o: any) => (
          <div className="wa-kv" key={o.cityId} title={`${o.totalMatches || 0} مباراة`}>
            <span>{o.cityName || `مدينة #${o.cityId}`}</span>
            <b>{rankName(o.rankTier)} · <span className="ltr">Lv.{o.level || 1} · {o.rankRR || 0} RR</span></b>
          </div>
        ))}
        <div className="wa-kv" title={act.title}>
          <span>آخر نشاط</span>
          <b>{act.main}{act.sub ? ` · ${act.sub}` : ''}</b>
        </div>
        {p.lastMatchAt && (
          <div className="wa-kv"><span>آخر فعاليّة منتهية حجز فيها</span><b className="ltr">{fmtDate(p.lastMatchAt)}</b></div>
        )}
        {p.geofenceExempt && p.geofenceExemptReason && (
          <div className="wa-kv"><span>سبب إعفاء السياج</span><b>{p.geofenceExemptReason}</b></div>
        )}
      </div>

      {canAct && (
        <>
          <div className="wa-menu pl-menu">
            <button type="button" disabled={busy('pwd')} onClick={() => actions.resetPassword(p)}>
              <KeyRound />أعِد كلمة السرّ إلى الافتراضيّة<span className="end"><ChevronLeft /></span>
            </button>
            <button type="button" disabled={busy('lock')} onClick={() => actions.toggleLock(p)}>
              {p.isLocked ? <LockOpen /> : <Lock />}{p.isLocked ? 'فكّ قفل الحساب' : 'اقفل الحساب'}<span className="end"><ChevronLeft /></span>
            </button>
            {p.isLocked && (
              <button type="button" onClick={() => actions.showAttempts(p)}>
                <History />محاولات الدخول منذ القفل<span className="end"><ChevronLeft /></span>
              </button>
            )}
          </div>

          <div className="pl-settings">
            <Setting title="حساب مجّانيّ" hint="تسقط عنه دخوليّة المافيا وحدها">
              <Toggle on={!!p.isFreeAccount} disabled={busy('free')} label="حساب مجّانيّ" onChange={() => actions.toggleFree(p)} />
            </Setting>
            <Setting title="حساب اختبار">
              <Toggle on={!!p.isTestAccount} disabled={busy('test')} label="حساب اختبار" onChange={() => actions.toggleTest(p)} />
            </Setting>
            <Setting title="مضيف أونلاين" hint="يستطيع إنشاء الغرف أونلاين">
              <Toggle on={!!p.canHostRemote} disabled={busy('host')} label="مضيف أونلاين" onChange={() => actions.toggleHost(p)} />
            </Setting>
            <Setting title="إعفاء من سياج الموقع" hint="يدخل الغرف بلا فحص موقع">
              <Toggle on={!!p.geofenceExempt} disabled={busy('geo')} label="إعفاء من سياج الموقع" onChange={() => actions.toggleGeofence(p)} />
            </Setting>
          </div>
        </>
      )}

      <Link className="wa-btn primary block pl-open" href={`/admin/players/${p.id}`}>افتح الملفّ الكامل</Link>

      {canAct && (
        <button type="button" className="wa-btn ghost block pl-del" disabled={busy('del')} onClick={() => actions.remove(p)}>
          <Trash2 />احذف الحساب نهائيّاً
        </button>
      )}
    </div>
  );
}
