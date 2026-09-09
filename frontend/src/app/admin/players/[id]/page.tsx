'use client';

// ══════════════════════════════════════════════════════
// 🪪 بطاقةُ اللاعب — «بابٌ بمفتاح»
//
// 🔴 بطاقةُ قرارٍ لليلةٍ جارية، لا ملفٌّ شخصيّ. تجيب بالترتيب عن ثلاثة
//    أسئلةٍ لا رابعَ لها: أيدخل؟ ثمّ أيدفع؟ ثمّ كيف أصله؟
//
// 🔴 والقاعدةُ الحاكمة: **لا يُعرض سببُ منعٍ إلّا ومعه زرُّ علاجه**، وما
//    تعذّر زرُّه لا يُعرض أصلاً. صفحةٌ تخبر الموظّفَ بما لا يستطيع إصلاحه
//    تكسب سمعةَ «جدارٍ» ويكفّ عن فتحها.
//
// 🔴 ولا رتبةَ ولا مستوىً ولا شريطَ خبرةٍ ولا نقاطَ تصنيفٍ ولا نسبةَ فوز —
//    قرارٌ مقفل. السببُ مقيس: ٧٦٢ من ٧٧٣ رتبتُهم «مُخبر» و٩٠٫٨٪ في المستوى
//    الأوّل، أي حقلٌ يفرز أحدَ عشرَ إنساناً من سبعِ مئة. ورقمٌ لا يفرز ولا
//    يقود إلى فعلٍ يُحذف ولو كان صادقاً.
// ══════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { swalConfirm } from '@/lib/swal';
import { trailColor, trailSize, groupStays, ago, dist, dur, haversineM } from '@/lib/trail';
import CityBadge from '@/components/admin/CityBadge';
import { rankName, rankBadge, rankColor } from '@/lib/ranks';

// 🔴 الخريطةُ تُحمَّل عند الطلب لا مع الصفحة: مكتبتُها ثقيلة، وتبويبُ الموقع
//    يُفتح أحياناً بينما البطاقةُ تُفتح كلَّ مرّة.
const VenueMap = dynamic(() => import('@/components/VenueMap'), {
  ssr: false,
  loading: () => <div className="h-[320px] rounded-xl bg-gray-800/40 animate-pulse" />,
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const ROLE_LABELS: Record<string, string> = {
  GODFATHER: 'شيخ المافيا', SILENCER: 'قص المافيا', CHAMELEON: 'حرباية المافيا', WITCH: 'الساحرة',
  OLDER_BROTHER: 'الأخ الأكبر', MAFIA_REGULAR: 'مافيا عادي', SHERIFF: 'الشريف', DOCTOR: 'الطبيب',
  SNIPER: 'القناص', POLICEWOMAN: 'الشرطية', NURSE: 'الممرضة', MAYOR: 'العمدة', CITIZEN: 'مواطن صالح',
  YOUNGER_BROTHER: 'الأخ الأصغر', JESTER: 'المهرج', ASSASSIN: 'السفّاح', PHOENIX: 'العنقاء',
};

/** أسبابُ القفل — قائمةٌ مغلقة (قرارُ المالك) */
const LOCK_REASONS = ['احتيال', 'إساءة', 'حسابٌ وهميّ', 'طلبُ صاحبه', 'أخرى'];

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `خطأ ${res.status}`);
  return body;
}

// 🔴 والفاصلةُ العربيّة ٫ مع الأرقام الهنديّة: «١٥.٠٠» بنقطةٍ لاتينيّةٍ بين
//    رقمين هنديّين خليطٌ يقرؤه العينُ متعثّراً — والفاصلةُ العربيّة U+066B
//    هي نظيرُ النقطة العشريّة في هذا النظام العدديّ.
const ar = (n: number | string) =>
  String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]).replace(/(?<=[٠-٩])\.(?=[٠-٩])/g, '٫');
const fmtShort = (d: any) => d ? new Date(d).toLocaleDateString('ar-JO', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/** نصُّ فشلِ الموقع بلغةٍ تقود إلى الفعل الصحيح */
const GEO_TEXT: Record<string, string> = {
  LOCATION_REQUIRED: 'جهازُه لا يُعطي قراءةَ موقع',
  LOCATION_STALE: 'قراءةُ موقعه قديمة',
  LOCATION_INACCURATE: 'قراءةُ موقعه غيرُ دقيقة',
  LOCATION_MOCKED: 'قراءةُ موقعه مُصطنعة',
  TOO_FAR: 'كان بعيداً عن المكان',
  NO_VENUE_POINT: 'المكانُ بلا إحداثيّاتٍ مسجَّلة',
};

export default function PlayerCardPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = parseInt(params.id as string);

  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [zoom, setZoom] = useState(false);
  // 🔴 القسمُ يُطلب حين يُفتح لسانُه ويُخزَّن: إعادةُ الطلب في كلّ تبديلٍ
  //    تُبطئ التنقّلَ بلا فائدة، والبياناتُ لا تتغيّر في أثناء القراءة.
  const [tab, setTab] = useState<string | null>(null);
  const [sections, setSections] = useState<Record<string, any>>({});
  const [tabBusy, setTabBusy] = useState(false);

  const say = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    try {
      setCard(await api(`/api/staff/player/${playerId}/card`));
      setError('');
    } catch (e: any) {
      setError(e.message === 'ليس لديك صلاحية لهذا الإجراء' ? 'لا صلاحيةَ لك على ملفّات اللاعبين' : 'تعذّر جلبُ البطاقة');
    } finally { setLoading(false); }
  }, [playerId]);

  useEffect(() => { if (playerId) load(); }, [playerId, load]);

  // 🔴 Escape يُغلق العارض: النقرُ وحدَه يترك من يتصفّح بلوحة المفاتيح محبوساً.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const openTab = useCallback(async (key: string | null) => {
    setTab(key);
    if (!key || sections[key]) return;
    setTabBusy(true);
    try {
      const data = await api(`/api/staff/player/${playerId}/section/${key}`);
      setSections(prev => ({ ...prev, [key]: data }));
    } catch (e: any) {
      say(e.message, false);
      setTab(null);
    } finally { setTabBusy(false); }
  }, [playerId, sections]);

  // ── الأفعال: كلُّها أدمن (قرارُ المالك) ──
  const act = async (key: string, fn: () => Promise<any>, okMsg: string) => {
    setBusy(key);
    try { await fn(); await load(); say(okMsg); }
    catch (e: any) { say(e.message, false); }
    finally { setBusy(''); }
  };

  const toggleLock = async () => {
    if (!card) return;
    if (card.lock.isLocked) {
      if (!(await swalConfirm('فكُّ قفل الحساب؟ سيُسجَّل الفكُّ باسمك ولن يُمحى سببُ القفل.'))) return;
      return act('lock', () => api(`/api/player/${playerId}/toggle-lock`, { method: 'POST', body: JSON.stringify({}) }), 'فُكّ القفل');
    }
    // 🔴 السببُ إلزاميٌّ من قائمةٍ مغلقة: ١٣ قفلاً من ٢٢ على الإنتاج بلا سببٍ
    //    مكتوب، والمكتوبُ في الباقي «11» و«12» و«حر» — نصٌّ حرٌّ لا يُقرأ.
    const reason = window.prompt(`سببُ القفل (إلزاميّ):\n${LOCK_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nاكتب الرقم:`);
    const idx = Number(reason) - 1;
    if (!(idx >= 0 && idx < LOCK_REASONS.length)) return;
    await act('lock', () => api(`/api/player/${playerId}/toggle-lock`, {
      method: 'POST', body: JSON.stringify({ reason: LOCK_REASONS[idx] }),
    }), 'قُفل الحساب');
  };

  const exemptGeo = async () => {
    const reason = window.prompt('سببُ إعفائه من السياج (إلزاميّ):');
    if (!reason?.trim()) return;
    await act('geo', () => api(`/api/player/${playerId}/toggle-geofence-exempt`, {
      method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
    }), 'أُعفي من السياج');
  };

  if (loading) return <Center>جارٍ التحميل…</Center>;
  if (error) return (
    <Center>
      <p className="text-rose-400 mb-3">{error}</p>
      <button onClick={() => router.back()} className="text-amber-400 text-sm hover:underline">← رجوع</button>
    </Center>
  );
  if (!card) return null;

  const { identity: id, lock, geo, money, reach, seat, rhythm, lastMatches, verdict, viewerRole, notes = [], booking = null, feedback = null } = card;
  const isAdmin = viewerRole === 'admin';

  // ── شريطُ الحكم: ترتيبٌ ثابتٌ متنافٍ، ولكلِّ حالةٍ مفتاحُها ──
  const gate = verdict === 'LOCKED'
    ? { tone: 'rose', text: lock.lockedAt ? `مقفول منذ ${ar(Math.round((Date.now() - +new Date(lock.lockedAt)) / 86400000))} يوماً` : 'الحساب مقفول',
        btn: isAdmin ? 'فكّ القفل' : null, onClick: toggleLock }
    : verdict === 'GEO'
      ? { tone: 'amber', text: `${GEO_TEXT[geo.dominant] || 'تعذّر التحقّق من موقعه'} (${ar(geo.recentFailures.length)} محاولات)`,
          // 🔴 «بعيد» مفتاحُه ليس الإعفاء: الإعفاءُ يعالج عجزَ الجهاز، ومن كان
          //    بعيداً فعلاً يُدخَل يدويّاً. إعفاؤه يعالج العَرَضَ الخطأ.
          btn: isAdmin && geo.dominant !== 'TOO_FAR' ? 'أعفِه من السياج' : null, onClick: exemptGeo }
      : { tone: 'emerald', text: 'يدخل — لا مانع', btn: null, onClick: undefined };

  const tone = { rose: 'bg-rose-600', amber: 'bg-amber-600', emerald: 'bg-emerald-700' }[gate.tone]!;

  // 🔴 الألسنةُ تُصفّى بالدور في الواجهة **وفي الخادم**: هذا لتجنّب لسانٍ
  //    يفتح على ٤٠٣، والحمايةُ الحقيقيّةُ هناك.
  const visibleTabs = SECTIONS.filter(s => s.roles.includes(viewerRole));

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28" dir="rtl">
      <button onClick={() => tab ? openTab(null) : router.back()}
        className="text-gray-500 hover:text-white text-sm transition">
        {tab ? '← البطاقة' : '← رجوع للقائمة'}
      </button>

      {/* ═══ الأقسامُ العميقة ═══ */}
      {tab && (
        <div className="space-y-3">
          <h2 className="text-lg font-black text-white">
            {SECTIONS.find(s => s.key === tab)?.icon} {SECTIONS.find(s => s.key === tab)?.label}
            <span className="text-gray-600 text-[13px] font-normal mr-2">{id.name}</span>
          </h2>
          {tabBusy && !sections[tab]
            ? <div className="py-16 text-center text-gray-600 text-sm">جارٍ التحميل…</div>
            : <SectionView data={sections[tab]} isAdmin={isAdmin} playerId={playerId} />}
        </div>
      )}

      {/* ═══ البطاقة ═══ */}
      {!tab && (<>

      {/* ═══ ① شريطُ الحكم — أيدخل أم لا ═══ */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className={`${tone} rounded-2xl px-4 py-3 flex items-center gap-3 text-white shadow-lg`}>
        <span className="font-bold text-[15px] flex-1 leading-snug">{gate.text}</span>
        {gate.btn && (
          <button onClick={gate.onClick} disabled={!!busy}
            className="shrink-0 bg-white/20 border border-white/40 rounded-lg px-3 py-2 text-[12px] font-bold hover:bg-white/30 transition disabled:opacity-50">
            {busy ? '…' : gate.btn}
          </button>
        )}
      </motion.div>

      {/* سببُ القفل ومن أصدره — للأدمن، ويُقال الفراغُ صراحةً */}
      {lock.isLocked && isAdmin && (
        <div className="text-[12px] text-gray-400 bg-gray-800/40 border border-gray-700/40 rounded-xl px-4 py-2.5">
          السبب: <b className="text-white">{lock.reason || 'بلا سببٍ مكتوب'}</b>
          {lock.byUsername && <> · أصدره <b className="text-white">{lock.byUsername}</b></>}
          {lock.attemptsWithCorrectPassword > 0 && (
            <span className="block mt-1 text-amber-400">
              حاول الدخولَ {ar(lock.attemptsWithCorrectPassword)} مرّةً بكلمةِ سرٍّ صحيحة — صاحبُ الحساب يستنجد.
            </span>
          )}
        </div>
      )}

      {/* ═══ ② الهويّة ═══ */}
      <div className="bg-gray-800/50 border border-gray-700/40 rounded-2xl p-4 flex items-center gap-3.5">
        {/* 🔴 الصورةُ تُفتح بالحجم الكامل: الموظّفُ يتحقّق من وجهِ من أمامه،
            و٥٦ بكسلاً لا تكفي للتعرّف. تُفتح بالنقر وبلوحة المفاتيح معاً. */}
        <button
          type="button"
          onClick={() => id.avatarUrl && setZoom(true)}
          disabled={!id.avatarUrl}
          aria-label={id.avatarUrl ? 'تكبيرُ صورة اللاعب' : 'لا صورة'}
          className={`w-14 h-14 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-xl font-black overflow-hidden shrink-0 ${id.avatarUrl ? 'cursor-zoom-in hover:ring-2 hover:ring-amber-500/50 transition' : ''}`}
        >
          {id.avatarUrl ? <Image src={`${API_URL}${id.avatarUrl}`} alt="" width={56} height={56} className="w-full h-full object-cover" /> : (id.name?.[0] || '؟')}
        </button>
        <div className="min-w-0 flex-1">
          {/* 🔴 الاسمُ لا يُعرض وحدَه أبداً: ٤٤ اسماً مكرَّرٌ بين حسابين فأكثر */}
          <h1 className="text-lg font-black text-white truncate">{id.name}</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5" dir="ltr">
            #{ar(id.id)} · {isAdmin ? id.phone : `…${id.phoneTail}`} · {id.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}
            {id.age != null && ` · ${ar(id.age)} سنة`}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {id.isMinor && <Badge tone="rose">قاصر</Badge>}
            {id.isFreeAccount && <Badge tone="amber">مجّانيّ</Badge>}
            {id.isTestAccount && <Badge tone="gray">اختبار</Badge>}
            {id.mustChangePassword && <Badge tone="amber">كلمةُ السرّ ١٢٣٤ الآن</Badge>}
            {id.linkedStaffId && <Badge tone="rose">يفتح لوحةَ الإدارة</Badge>}
            {geo.exempt && <Badge tone="gray">معفىً من السياج</Badge>}
          </div>
        </div>
      </div>

      {/* ═══ ③ التواصل — ثلاثةُ أزرارٍ متساوية ═══ */}
      {isAdmin && id.phone && (
        <div className="grid grid-cols-3 gap-2">
          {/* 🔴 api.whatsapp.com لا wa.me: الأخيرُ يُتلف كلَّ محرفٍ فوق بايتين */}
          <Act href={`https://api.whatsapp.com/send?phone=962${String(id.phone).replace(/^0/, '')}`}>واتساب</Act>
          <Act href={`tel:${id.phone}`}>اتّصال</Act>
          <Act onClick={() => { navigator.clipboard?.writeText(id.phone); say('نُسخ الرقم'); }}>نسخُ الرقم</Act>
        </div>
      )}

      {/* ═══ ④ ثلاثُ بلاطاتِ الليلة ═══ */}
      <div className="grid grid-cols-3 gap-2">
        <Tile icon="💵"
          value={money.amount > 0 ? `${ar(money.amount.toFixed(2))} د.أ` : id.isFreeAccount ? 'مجّانيّ' : 'لا شيء'}
          label={money.bookings > 0 ? `${ar(money.bookings)} حجزٍ غيرِ مدفوع` : 'مالُ الليلة'}
          tone={money.amount > 0 ? 'amber' : 'gray'} />
        <Tile icon="🔔"
          value={reach.hasPush ? 'يصله إشعار' : 'لا يصله'}
          label={reach.hasPush ? (reach.platform || '') : 'اتّصل به'}
          tone={reach.hasPush ? 'emerald' : 'amber'} />
        {/* 🔴 الحجزُ مكانَ المقعد فوق الطيّة: هذا هو السؤالُ الأوّل عند الباب —
            أهو محجوزٌ أصلاً؟ — والمقعدُ يخصّ لحظةَ الإجلاس لا لحظةَ الدخول،
            فنُقل إلى قسم الإجلاس تحت الطيّة. */}
        <Tile icon="🎟️"
          value={booking ? (booking.checkedIn ? 'حضر' : booking.isPaid || booking.isFree ? 'محجوز' : 'محجوز — لم يدفع') : 'لا حجز'}
          label={booking ? `${booking.name || ''} · ${fmtShort(booking.date)}` : 'لا فعاليّةَ قادمة'}
          tone={!booking ? 'gray' : booking.checkedIn ? 'emerald' : booking.isPaid || booking.isFree ? 'emerald' : 'amber'} />
      </div>

      {/* رصيدُ التشبس — عملةٌ داخليّةٌ تُسمّى صراحةً كي لا تُخلط بالدينار */}
      {id.chipsBalance > 0 && (
        <p className="text-[12px] text-gray-500 px-1">
          🪙 <b className="text-amber-400">{ar(id.chipsBalance)}</b> رقاقة <span className="text-gray-600">(عملةٌ داخليّة — ليست ديناراً)</span>
        </p>
      )}

      {/* ═══ ⑤ سطرُ النبض ═══ */}
      <p className="text-[12px] text-gray-500 px-1 leading-relaxed">
        {rhythm.lastNight
          ? <>آخرُ ليلة: {fmtDate(rhythm.lastNight)} {rhythm.daysSince != null && `(قبل ${ar(rhythm.daysSince)} يوماً)`}
              {rhythm.rhythmDays && <> · يأتي كلَّ {ar(rhythm.rhythmDays)} أيّامٍ تقريباً</>}
              {' · '}منذ البداية {ar(id.lifetimeMatches)} مباراة</>
          : <>لم يحضر ليلةً بعدُ — أُنشئ حسابُه {fmtDate(id.createdAt)}</>}
      </p>

      {/* 🔴 إنذارُ الصمت نسبيٌّ لا تقويميّ: يظهر عند ٣× إيقاعه، فالزائرُ
          الشهريُّ لا يُنذَر عنه كذباً والوفيُّ لا يُنذَر عنه بعد فوات الأوان */}
      {rhythm.rhythmDays && rhythm.daysSince != null && rhythm.daysSince >= rhythm.rhythmDays * 3 && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 text-[13px] text-amber-300">
          صمتَ {ar(rhythm.daysSince)} يوماً — {ar(Math.round(rhythm.daysSince / rhythm.rhythmDays))}× إيقاعِه المعتاد.
        </div>
      )}

      <Fold />

      {/* ═══ الإجلاسُ والرفقة ═══ */}
      {(seat.blocked.length > 0 || seat.pinned) && (
        <Section title="الإجلاس">
          {seat.pinned && (
            <div className="flex items-center gap-2 py-1.5 text-[13px] border-b border-gray-700/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-white">مقعد {ar(seat.pinned)}</span>
              <span className="text-gray-500 text-[11.5px]">مثبَّتٌ له</span>
            </div>
          )}
          {seat.blocked.map((b: any) => (
            <div key={b.id} className="flex items-center gap-2 py-1.5 text-[13px] border-b border-gray-700/25 last:border-0">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span className="text-white">{b.name}</span>
              <span className="text-gray-500 text-[11.5px]">#{ar(b.id)}</span>
              {b.reason && <span className="text-gray-500 text-[11.5px] mr-auto">{b.reason}</span>}
            </div>
          ))}
        </Section>
      )}

      {/* ═══ آخرُ تقييمٍ كتبه ═══ */}
      {/* 🔴 ٤٤٤ من ٧٧٣ كتبوا تقييماً وكان بلا قارئ. وبعد رفع الحجب صار
          الاستبيانُ دعوةً — فقراءتُه ما يجعلها تستحقّ الإرسال. */}
      {feedback && (
        <Section title="آخرُ تقييمٍ كتبه">
          <div className="flex items-center gap-2 text-[13px]">
            {feedback.overall != null && (
              <span className="text-amber-400 font-bold">{ar(feedback.overall)}<span className="text-gray-600">/٥</span></span>
            )}
            <span className="text-gray-600 text-[11.5px]">{fmtDate(feedback.at)}</span>
          </div>
          {feedback.notes && (
            <p className="text-[12.5px] text-gray-300 mt-2 leading-relaxed whitespace-pre-wrap">«{feedback.notes}»</p>
          )}
        </Section>
      )}

      {/* ═══ لمحةُ لعب: ثلاثةُ صفوفٍ لا خمسون ═══ */}
      {lastMatches.length > 0 && (
        <Section title="آخرُ ثلاث مباريات">
          {lastMatches.map((m: any, i: number) => (
            <div key={i} className="flex items-center gap-2.5 py-2 text-[13px] border-b border-gray-700/25 last:border-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.won ? 'bg-emerald-500' : 'bg-gray-600'}`} />
              <span className="text-white font-medium">{ROLE_LABELS[m.role] || m.role}</span>
              <span className={m.won ? 'text-emerald-400' : 'text-gray-500'}>{m.won ? 'فاز' : 'خسر'}</span>
              {m.survived && <span className="text-gray-500 text-[11.5px]">نجا</span>}
              <span className="text-gray-600 text-[11.5px] mr-auto">{fmtDate(m.at)}</span>
            </div>
          ))}
          {/* 🔴 عدّادان مسمّيان صراحةً: `total_matches` منحرفٌ عن الواقع لـ٤٧٥
              لاعباً، فعرضُه وحدَه بلا تسميةٍ كذبٌ بحسن نيّة. */}
          <p className="text-[11px] text-gray-600 pt-2">
            {ar(id.lifetimeMatches)} منذ البداية · {ar(id.seasonMatches)} هذا الموسم
          </p>
        </Section>
      )}

      {/* ═══ ملاحظاتُ الموظّفين — نصٌّ حرّ، أدمن ═══ */}
      {isAdmin && (
        <Section title="ملاحظات">
          {notes.map((n: any) => (
            <div key={n.id} className="py-2 text-[13px] border-b border-gray-700/25 last:border-0">
              <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{n.text}</p>
              <p className="text-[10.5px] text-gray-600 mt-1">{n.staffUsername || '—'} · {fmtDate(n.createdAt)}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-[12px] text-gray-600 pb-1">لا ملاحظاتٍ بعد.</p>}
          <div className="flex gap-2 pt-2">
            <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
              placeholder="اكتب ملاحظةً…" maxLength={2000}
              className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-[13px] text-white outline-none focus:border-amber-500/50" />
            {/* 🔴 تُضاف ولا تُستبدَل: سجلٌّ لا حقل، فلا يمحو أحدٌ ما كتبه غيرُه */}
            <Btn onClick={() => noteDraft.trim() && act('note',
              () => api(`/api/player/${playerId}/notes`, { method: 'POST', body: JSON.stringify({ text: noteDraft.trim() }) })
                     .then(() => setNoteDraft('')), 'حُفظت الملاحظة')} busy={busy === 'note'}>
              أضِف
            </Btn>
          </div>
        </Section>
      )}

      {/* ═══ أفعالُ الأدمن ═══ */}
      {isAdmin && (
        <Section title="إجراءات">
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn onClick={toggleLock} busy={busy === 'lock'} tone={lock.isLocked ? 'emerald' : 'rose'}>
              {lock.isLocked ? 'فكّ القفل' : 'اقفل الحساب'}
            </Btn>
            <Btn onClick={() => act('pwd', () => api(`/api/player/${playerId}/reset-password`, { method: 'POST' }), 'أُعيدت كلمةُ السرّ')} busy={busy === 'pwd'}>
              أعِد كلمةَ السرّ
            </Btn>
            <Btn onClick={() => act('free', () => api(`/api/player/${playerId}/toggle-free`, { method: 'POST' }), 'بُدّلت حالةُ المجّانيّ')} busy={busy === 'free'}>
              {id.isFreeAccount ? 'ألغِ المجّانيّ' : 'اجعله مجّانيّاً'}
            </Btn>
            <Btn onClick={exemptGeo} busy={busy === 'geo'}>
              {geo.exempt ? 'ألغِ إعفاءَ السياج' : 'أعفِه من السياج'}
            </Btn>
          </div>
        </Section>
      )}

      </>)}

      {/* ═══ شريطُ الأقسام — ثابتٌ أسفل الشاشة ═══ */}
      {/* 🔴 ثابتٌ لا في أعلى الصفحة: الموظّفُ يقرأ بيدٍ واحدةٍ على هاتف،
          وأعلى الشاشة أبعدُ ما يكون عن إبهامه. */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-gray-950/95 backdrop-blur border-t border-gray-800">
        <div className="max-w-3xl mx-auto grid" style={{ gridTemplateColumns: `repeat(${visibleTabs.length + 1}, 1fr)` }}>
          <TabBtn on={!tab} icon="🪪" label="البطاقة" onClick={() => openTab(null)} />
          {visibleTabs.map(sc => (
            <TabBtn key={sc.key} on={tab === sc.key} icon={sc.icon} label={sc.label}
              onClick={() => openTab(sc.key)} />
          ))}
        </div>
      </div>

      {/* ═══ عارضُ الصورة ═══ */}
      {zoom && id.avatarUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
          role="dialog" aria-modal="true" aria-label="صورةُ اللاعب"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_URL}${id.avatarUrl}`}
            alt={`صورةُ ${id.name}`}
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
          />
          <button
            onClick={() => setZoom(false)}
            aria-label="إغلاق"
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/15 text-white text-xl leading-none hover:bg-white/25 transition"
          >
            ×
          </button>
          <p className="absolute bottom-6 text-white/70 text-[12px]">اضغط في أيّ مكانٍ للإغلاق</p>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-1/2 translate-x-1/2 px-5 py-3 rounded-xl text-[13px] font-bold z-50 shadow-xl ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── عناصرُ مساعدة ──
const Center = ({ children }: any) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center text-gray-500 text-sm" dir="rtl">{children}</div>
);
const Badge = ({ tone, children }: any) => {
  const c = { rose: 'bg-rose-500/15 text-rose-300', amber: 'bg-amber-500/15 text-amber-300', gray: 'bg-gray-600/25 text-gray-400' }[tone as string];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c}`}>{children}</span>;
};
const Tile = ({ icon, value, label, tone }: any) => {
  const c = { amber: 'text-amber-400', emerald: 'text-emerald-400', rose: 'text-rose-400', gray: 'text-gray-300' }[tone as string];
  return (
    <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl py-3 px-2 text-center">
      <div className="text-base leading-none">{icon}</div>
      <div className={`text-[12.5px] font-bold mt-1.5 leading-tight ${c}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
};
const Act = ({ href, onClick, children }: any) => {
  const cls = 'bg-gray-800/60 border border-gray-700/40 rounded-xl py-2.5 text-[12.5px] font-bold text-gray-300 hover:bg-gray-700/60 transition text-center';
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>
    : <button onClick={onClick} className={cls}>{children}</button>;
};
const Fold = () => (
  <div className="flex items-center gap-3 py-1 text-[10px] text-gray-700">
    <span className="flex-1 h-px bg-gray-800" />حدُّ الطيّة<span className="flex-1 h-px bg-gray-800" />
  </div>
);
const Section = ({ title, children }: any) => (
  <div className="bg-gray-800/40 border border-gray-700/40 rounded-2xl p-4">
    <p className="text-[10.5px] tracking-wider text-amber-500/80 font-bold mb-2">{title}</p>
    {children}
  </div>
);
const Btn = ({ onClick, busy, tone, children }: any) => {
  const c = tone === 'rose' ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
    : tone === 'emerald' ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
    : 'border-gray-600/40 text-gray-300 hover:bg-gray-700/40';
  return (
    <button onClick={onClick} disabled={busy}
      className={`text-[12px] px-3.5 py-2 rounded-lg border transition disabled:opacity-50 ${c}`}>
      {busy ? '…' : children}
    </button>
  );
};

// ══════════════════════════════════════════════════════
// 🗂️ الأقسامُ العميقة
//
// 🔴 تُطلب حين يُفتح لسانُها لا مع البطاقة: البطاقةُ تُفتح كلَّ مرّة والأقسامُ
//    أحياناً، وضمُّها إليها يعيد عطبَ المنفذ القديم — ٩٣٪ ممّا يُنقل لا يُرى.
//
// 🔴 والحراسةُ في الخادم: ما لا يملكه الدورُ لا يُرسَل ولا يظهر لسانُه.
// ══════════════════════════════════════════════════════

const SECTIONS: { key: string; label: string; icon: string; roles: string[] }[] = [
  { key: 'money',   label: 'المال',    icon: '💵', roles: ['admin', 'manager'] },
  { key: 'play',    label: 'اللعب',    icon: '🎭', roles: ['admin', 'manager', 'accountant'] },
  { key: 'account', label: 'الحساب',   icon: '🪪', roles: ['admin', 'manager', 'accountant'] },
  { key: 'seating', label: 'الإجلاس',  icon: '💺', roles: ['admin', 'manager'] },
  { key: 'geo',     label: 'الموقع',   icon: '📍', roles: ['admin', 'manager'] },
];

const GEO_RESULT: Record<string, string> = {
  LOCATION_REQUIRED: 'تعذّرت قراءةُ موقعه',
  LOCATION_STALE: 'قراءةٌ قديمة',
  LOCATION_INACCURATE: 'قراءةٌ غيرُ دقيقة',
  LOCATION_MOCKED: 'موقعٌ مُصطنع',
  TOO_FAR: 'كان بعيداً عن المكان',
  NO_VENUE_POINT: 'المكانُ بلا إحداثيّات',
};

const ACTIVE_SRC: Record<string, string> = {
  request: 'مقيس — فتحَ التطبيق',
  socket: 'مقيس — دخلَ غرفة',
  socket_end: 'مقيس — نهايةُ جلسة',
  backfill: 'مستنتَج — لا يدلّ على فتحِ التطبيق',
  legacy_login: 'مستنتَج — كتابةٌ قديمة',
};

/** يحوّل عمراً بالمللي إلى جملةٍ عربيّةٍ مفهومة */
function since(d: any): string {
  if (!d) return '—';
  const ms = Date.now() - +new Date(d);
  const m = Math.round(ms / 60000);
  if (m < 60) return `قبل ${ar(m)} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${ar(h)} ساعة`;
  return `قبل ${ar(Math.round(h / 24))} يوماً`;
}

// ══ 🏙️ رتبُ اللاعب بمدنه — من ملفّه (`standings[]`)؛ يُخفى بصمتٍ حين لا يتوفّر ══
function CityStandings({ playerId, initial }: { playerId?: string | number; initial?: any[] }) {
  const [rows, setRows] = useState<any[] | null>(Array.isArray(initial) ? initial : null);
  useEffect(() => {
    if (Array.isArray(initial) || !playerId) return;
    let alive = true;
    api(`/api/player/${playerId}/profile`)
      .then(d => { if (alive) setRows(Array.isArray(d?.standings) ? d.standings : []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [playerId, initial]);
  if (!rows || rows.length === 0) return null;
  return (
    <Section title="رتبتُه بمدنه — لكلّ مدينةٍ ترتيبُها">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((s: any) => {
          const req = Number(s.rrRequired) || 0;
          const rr = Number(s.rankRR) || 0;
          const pct = req > 0 ? Math.min(100, Math.round((rr / req) * 100)) : 100;
          const color = rankColor(s.rankTier);
          return (
            <div key={s.cityId} className="rounded-xl bg-gray-900/50 border border-gray-700/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <CityBadge cityId={s.cityId} cityName={s.cityName} size="sm" />
                <span className="text-[12px] font-bold" style={{ color }}>{rankBadge(s.rankTier)} {rankName(s.rankTier)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden" title={req > 0 ? `${rr} / ${req} RR` : `${rr} RR`}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
                <span>{ar(rr)}{req > 0 ? ` / ${ar(req)}` : ''} RR</span>
                <span>Lv.{ar(s.level || 1)} · {ar(s.totalMatches || 0)} مباراة</span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SectionView({ data, isAdmin, playerId }: { data: any; isAdmin: boolean; playerId?: string | number }) {
  if (!data) return <div className="py-16 text-center text-gray-600 text-sm">جارٍ التحميل…</div>;

  switch (data.key) {

    // ═══ 💵 المال ═══
    case 'money': {
      const d = data.debt, p = data.paid;
      return (
        <>
          {d.live > 0 ? (
            <Section title="معلَّقٌ منذ ١ أيلول">
              <Big value={`${ar(d.live.toFixed(2))} د.أ`} label={`${ar(d.liveN)} حجزٍ غيرِ مدفوع`} tone="warn" />
              {/* 🔴 لا زرَّ دفعٍ هنا (قرارُ المالك): التسجيلُ حيث يُقبض المال */}
              <p className="text-[11.5px] text-gray-600 mt-2 leading-relaxed">
                تسجيلُ الدفع في شاشة الفعاليّة حيث يُقبض المال — لا هنا.
              </p>
            </Section>
          ) : (
            <Section title="معلَّقٌ منذ ١ أيلول"><Empty>لا شيءَ عليه</Empty></Section>
          )}

          {/* 🔴 أرشيفٌ بوسمٍ بلا زرِّ تحصيل (قرارُ المالك): ما قبل ١/٩ وقع في
              نظامٍ لم يكن يُعلَّم فيه الدفعُ أصلاً، فالمطالبةُ به ظلم. */}
          {d.archive > 0 && (
            <div className="bg-gray-900/40 border border-dashed border-gray-700/50 rounded-xl px-4 py-3 text-[12px] text-gray-500 leading-relaxed">
              🗄️ أرشيف · <b className="text-gray-400">{ar(d.archive.toFixed(2))} د.أ</b> على {ar(d.archiveN)} حجزاً قبل ١ أيلول
              <span className="block mt-1">نظامٌ لم يكن يُعلَّم فيه الدفع — لا تُطالَب.</span>
            </div>
          )}

          <Section title="ما دفعه — بالدينار">
            <Row k="على البوّابة" v={`${ar(p.gate.toFixed(2))} د.أ`} />
            <Row k="على المنيو" v={`${ar(p.menu.toFixed(2))} د.أ`} />
            <Row k="المجموع" v={`${ar(p.total.toFixed(2))} د.أ`} tone="brass" />
          </Section>

          {data.orders.n > 0 && (
            <Section title="المنيو">
              <Row k="الطلبات" v={`${ar(data.orders.n)} طلباً · ${ar(data.orders.sum.toFixed(2))} د.أ`} />
              {data.orders.top.length > 0 && (
                <Row k="الأكثرُ طلباً"
                  v={data.orders.top.map((t: any) => `${t.name} ×${ar(t.n)}`).join(' · ')}
                  sub="الماءُ تلقائيٌّ — لا يُحتسب تفضيلاً" />
              )}
            </Section>
          )}

          <Section title="التشبس — العملةُ الثانية">
            {/* 🔴 يُسمّى صراحةً كي لا يُخلط بالدينار */}
            <Row k="الرصيد" v={`${ar(data.chips)} رقاقة`} sub="عملةٌ داخليّة — ليست ديناراً" tone="brass" />
            {(data.free.account || data.free.nights > 0) && (
              <Row k="المجّانيّ"
                v={data.free.account ? 'حسابٌ مجّانيّ' : `${ar(data.free.nights)} ليلةً مجّانيّة`}
                sub="معفىً من رسم اللعبة لا من فاتورة الطعام" />
            )}
          </Section>
        </>
      );
    }

    // ═══ 🎭 اللعب ═══
    case 'play': {
      const w = data.weight;
      return (
        <>
          {data.mafiaBan && (
            <Alert tone="warn">⚑ آخرُ ثلاثةِ أدواره مافيا — المحرّكُ يستبعده من المافيا في التوزيع القادم</Alert>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Tile icon="🎲" value={ar(w.lifetime)} label="منذ البداية" tone="brass" />
            <Tile icon="🌙" value={ar(w.nights)} label="ليلةً حضرها" tone="gray" />
            <Tile icon="🏵️" value={ar(w.season)} label="هذا الموسم" tone="gray" />
          </div>
          {w.firstNight && (
            <p className="text-[11.5px] text-gray-600 px-1">أوّلُ ليلةٍ له: {fmtDate(w.firstNight)}</p>
          )}

          {/* 🏙️ بطاقةٌ لكلّ مدينةٍ لعب فيها */}
          <CityStandings playerId={playerId} initial={data.standings} />

          {data.nights.length > 0 ? (
            <Section title="آخرُ ثلاثِ ليالٍ">
              {data.nights.map((n: any, i: number) => (
                <div key={i} className="py-2.5 border-b border-gray-700/25 last:border-0">
                  <p className="text-[12px] text-gray-500">{fmtDate(n.date)} · {ar(n.matches.length)} مباراة</p>
                  {n.matches.map((m: any, j: number) => (
                    <div key={j} className="flex items-center gap-2 mt-1.5 text-[13px]">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.won ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                      <span className="text-white font-medium">{ROLE_LABELS[m.role] || m.role}</span>
                      <span className={m.won ? 'text-emerald-400' : 'text-gray-500'}>{m.won ? 'فاز' : 'خسر'}</span>
                      {/* الفوزُ رباعيّ — يُقال مَن فاز حين يخسر */}
                      {!m.won && m.winner && (
                        <span className="text-gray-600 text-[11px]">فاز {WINNER_AR[m.winner] || m.winner}</span>
                      )}
                      {m.survived && <span className="text-gray-600 text-[11px]">نجا</span>}
                      {m.penalty && <span className="text-amber-400 text-[11px] mr-auto">⚑ عقوبة</span>}
                    </div>
                  ))}
                </div>
              ))}
            </Section>
          ) : <Section title="سجلُّ اللعب"><Empty>لم يلعب مباراةً محسومةً بعد</Empty></Section>}

          {data.deals.n > 0 && (
            <Section title="الصفقات">
              <Row k="بدأ صفقة" v={`${ar(data.deals.n)} مباراة`} sub={`نجح في ${ar(data.deals.ok)}`} />
            </Section>
          )}

          {/* 🔴 العقوبةُ معدّلاً لا رقماً: «عقوبتان» تعني شيئاً لمن لعب ٥
              وشيئاً آخرَ تماماً لمن لعب ٢٠٠. */}
          {data.penalties.n > 0 && (
            <Section title="الانضباط">
              <Row k="المعدّل"
                v={data.penalties.perMatches
                  ? `عقوبةٌ كلَّ ${ar(data.penalties.perMatches)} مباراة`
                  : `${ar(data.penalties.n)} عقوبة`}
                sub={`${ar(data.penalties.n)} عقوبةً في ${ar(w.lifetime)} مباراة`} tone="warn" />
              {data.penalties.last && (
                <Row k="آخرُ عقوبة" v={fmtDate(data.penalties.last.date)}
                  sub={ROLE_LABELS[data.penalties.last.role] || data.penalties.last.role} />
              )}
            </Section>
          )}
        </>
      );
    }

    // ═══ 🪪 الحساب ═══
    case 'account': {
      const a = data.account;
      return (
        <>
          <Section title="الجهازُ والوصول">
            {data.device.n > 0 ? (
              <>
                <Row k="الأجهزة" v={`${ar(data.device.n)} جهاز`} sub={data.device.platform || ''} tone="ok" />
                <Row k="آخرُ إنعاشٍ للتوكن" v={since(data.device.seen)} sub="التطبيقُ ما زال مثبَّتاً" />
              </>
            ) : <Empty>لا يصله إشعار — الاتّصالُ قناتُه الوحيدة</Empty>}
            {/* 🔴 آخرُ ظهورٍ **بوسمِ مصدره**: المستنتَجُ لا يدلّ على فتح التطبيق */}
            {a.lastActive && (
              <Row k="آخرُ ظهور" v={since(a.lastActive)}
                sub={ACTIVE_SRC[a.lastActiveSource] || a.lastActiveSource || ''} />
            )}
          </Section>

          <Section title="الحساب">
            <Row k="انضمّ" v={fmtDate(a.joined)} sub={since(a.joined)} />
            {a.mustChangePassword && (
              <Row k="كلمةُ السرّ" v="١٢٣٤ — لم تُغيَّر" sub="مَن يعرف رقمَه يدخل باسمه" tone="warn" />
            )}
            {a.isTestAccount && <Row k="حسابُ اختبار" v="يرى الفعاليّاتِ الاختباريّة" />}
            {a.genderConstraint && a.genderConstraint !== 'NONE' && (
              <Row k="قيدُ جلوس" v="لا يُجلَس بجانب الجنسِ الآخر" />
            )}
            {isAdmin && a.dob && <Row k="تاريخُ الميلاد" v={a.dob} />}
          </Section>

          {data.linkedStaff && (
            <Alert tone="crit">
              هذا الحسابُ يفتح لوحةَ الإدارة — مرتبطٌ بالموظّف <b>{data.linkedStaff.username}</b> بدور {data.linkedStaff.role}.
              دخولُه كلاعبٍ يُصدر توكنَ موظّفٍ كاملاً.
            </Alert>
          )}

          <Section title="سندُ المعالجة">
            {data.consent ? (
              <>
                <Row k="الحالة"
                  v={data.consent.action === 'granted' ? 'مسجَّل' : 'سُحبت الموافقة'}
                  sub={`${data.consent.kind} ${data.consent.version} · ${fmtDate(data.consent.at)}`}
                  tone={data.consent.action === 'granted' ? 'ok' : 'warn'} />
                {data.consent.hasGuardian && <Row k="وليُّ الأمر" v="مسجَّل" tone="ok" />}
              </>
            ) : (
              // 🔴 «لم يُسأل» لا «رفض»: ٥٣٩ لاعباً لعبوا بلا صفِّ موافقةٍ لأنّ
              //    البوّابةَ لم تكن مركَّبة — وعرضُهم رافضين افتراء.
              <Empty>غيرُ مسجَّل — لم يُسأل بعد</Empty>
            )}
          </Section>

          {/* 🔴 التوأمُ الهاتفيّ: سبعُ مجموعاتٍ في القاعدة، وواحدةٌ منها **شخصان
              مختلفان** يتشاركان هاتفاً — فلا دمجَ تلقائيٌّ بحال. */}
          {data.twin && (
            <Section title="رقمٌ في حسابين">
              <Row k="الحسابُ الآخر" v={`${data.twin.name} · ‏#${ar(data.twin.id)}`}
                sub={`${ar(data.twin.matches)} مباراة · أُنشئ ${fmtDate(data.twin.at)}`} tone="warn" />
              <p className="text-[11.5px] text-gray-600 mt-2 leading-relaxed">
                رقمٌ واحدٌ لا يعني إنساناً واحداً — قد يكون أخوين يتشاركان هاتفاً. راجِعِ الاسمَ والمباريات قبل أيّ دمج.
              </p>
            </Section>
          )}
        </>
      );
    }

    // ═══ 💺 الإجلاس ═══
    case 'seating': {
      return (
        <>
          {data.blocked.length > 0 && (
            <Section title="🚫 لا يجلس بجانب">
              {data.blocked.map((b: any) => (
                <div key={b.id} className="flex items-center gap-2 py-1.5 text-[13px] border-b border-gray-700/25 last:border-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-white">{b.name}</span>
                  <span className="text-gray-500 text-[11.5px]">#{ar(b.id)}</span>
                  {b.reason && <span className="text-gray-500 text-[11.5px] mr-auto">{b.reason}</span>}
                </div>
              ))}
            </Section>
          )}

          <Section title="يأتي مع">
            {data.companions.length > 0 ? data.companions.map((c: any) => (
              <Row key={c.id} k={c.name}
                v={`${ar(c.shared)} ليلةً من ${ar(c.of)}`}
                sub={`أكثرُ بـ${ar(c.lift)}× ممّا تتوقّعه الصدفة`} />
            )) : (
              // 🔴 صدقٌ لا فراغ: أكثرُ اللاعبين لا رفيقَ لهم يتجاوز الصدفة،
              //    وقولُ ذلك أصدقُ من اسمٍ واثقٍ من عدم.
              <Empty>لا رفيقَ يتجاوز الصدفة — يحضر مع من حضر</Empty>
            )}
            <Row k="المتابعات" v={`يتابع ${ar(data.follows.out)} · يتابعه ${ar(data.follows.in)}`}
              sub="يقرؤها محرّكُ المقاعد" />
          </Section>

          {data.feedback.length > 0 && (
            <Section title="بصوته هو">
              {data.feedback.map((f: any, i: number) => (
                <div key={i} className="py-2 border-b border-gray-700/25 last:border-0">
                  <p className="text-[12.5px] text-gray-300 leading-relaxed">«{f.notes}»</p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {f.overall != null && <>{ar(f.overall)}/٥ · </>}{fmtDate(f.at)}
                  </p>
                </div>
              ))}
            </Section>
          )}
        </>
      );
    }

    // ═══ 📍 الموقع ═══
    case 'geo': {
      const r = data.reliability, f = data.lastFix;
      // 🔴 عمرُ القراءة يقرّر معناها: التطبيقُ لا يُبلّغ في الخلفيّة، فنقطةُ
      //    من أغلقه تتجمّد حيث كان. أقلُّ من ١٠ دقائق «الآن»، وما فوق يومٍ تاريخ.
      const fresh = f?.capturedAt ? (Date.now() - +new Date(f.capturedAt)) < 10 * 60000 : false;
      return (
        <>
          {/* 🔴 الحالةُ الرابعة صريحةً (قرارُ المالك): ٨٩ فعاليّةً من ١٠١ بسياجٍ
              مُطفأ — وطيُّ القسم يترك الموظّفَ يظنّ العطبَ في اللاعب. */}
          {data.tonight && (
            <Alert tone={data.tonight.geofenceEnabled ? 'ok' : 'dead'}>
              {data.tonight.geofenceEnabled
                ? `سياجُ الليلة مُشغَّل — ${data.tonight.name}`
                : `سياجُ الليلة مُطفأ — لا يُفحص موقعُ أحد (${data.tonight.name})`}
            </Alert>
          )}

          {f ? (
            <Section title="آخرُ موقعٍ مسجَّل">
              <Row k="متى قُرئ" v={since(f.capturedAt)}
                sub={fresh ? 'حديثةٌ — تدلّ على مكانه الآن' : 'قديمة — لا تدلّ على مكانه الآن'}
                tone={fresh ? 'ok' : 'warn'} />
              {f.accuracyM != null && (
                <Row k="دقّةُ القراءة" v={`${ar(Math.round(f.accuracyM))} م`}
                  sub={f.accuracyM > 1000 ? 'هذه مدينةٌ لا موقع' : ''}
                  tone={f.accuracyM > 1000 ? 'crit' : 'plain'} />
              )}
              {f.isMocked && <Row k="⚠️ تنبيه" v="الجهازُ يبلّغ موقعاً مُصطنعاً" tone="crit" />}
              {isAdmin && f.lat != null && (
                <a href="/admin/players/map" className="block mt-2 text-[12px] text-blue-400 hover:underline">
                  ↗ افتحه في خريطة اللاعبين
                </a>
              )}
            </Section>
          ) : <Section title="آخرُ موقعٍ مسجَّل"><Empty>لا موقعَ مسجَّلٌ لهذا اللاعب</Empty></Section>}

          {/* 🔴 الموثوقيّةُ بالليالي لا بالمحاولات: ليلةٌ فيها ٣٥ محاولةً ليلةٌ
              واحدةٌ متعثّرة، وعدُّها ٣٥ فشلاً يجعل لاعباً واحداً يبدو كارثة. */}
          {r.nights > 0 && (
            <Section title="موثوقيّةُ سياجه">
              <Row k="الخلاصة"
                v={r.badNights === 0 ? `مرّ في ${ar(r.nights)} ليالٍ بلا تعثّر`
                  : `تعثّر في ${ar(r.badNights)} من ${ar(r.nights)} ليالٍ`}
                tone={r.badNights === 0 ? 'ok' : 'warn'} />
              {data.worstStorm && data.worstStorm.checks > 5 && (
                <Row k="أسوأُ ليلة" v={`${ar(data.worstStorm.checks)} محاولةً قبل أن يدخل`}
                  sub={fmtDate(data.worstStorm.at)} />
              )}
              {data.lastFail && (
                <Row k="آخرُ تعثّر"
                  v={GEO_RESULT[data.lastFail.result] || data.lastFail.result}
                  sub={`${fmtDate(data.lastFail.at)}${data.lastFail.distanceM != null ? ` · ${ar(Math.round(data.lastFail.distanceM))} م` : ''}`}
                  tone="warn" />
              )}
            </Section>
          )}

          {/* ═══ 🗺️ مسارُ مواقعه ═══ */}
          {isAdmin && data.fixes && data.fixes.length > 0 && (
            <GeoTrail fixes={data.fixes} venues={data.venues || []}
              total={data.trailPoints} from={data.trailFrom} to={data.trailTo} />
          )}

          {data.exempt && (
            <Section title="إعفاءٌ من السياج">
              <Row k="السبب" v={data.exempt.reason || 'بلا سببٍ مكتوب'} tone="brass" />
              <Row k="مَن ومتى" v={`${data.exempt.by || '—'} · ${fmtDate(data.exempt.at)}`} />
            </Section>
          )}
        </>
      );
    }

    default: return null;
  }
}

const WINNER_AR: Record<string, string> = {
  MAFIA: 'المافيا', CITIZEN: 'المواطنون', JESTER: 'المهرّج', ASSASSIN: 'السفّاح',
};

const Row = ({ k, v, sub, tone }: any) => {
  const c = { crit: 'text-rose-400', warn: 'text-amber-400', ok: 'text-emerald-400',
    brass: 'text-amber-300', plain: 'text-white' }[tone as string] || 'text-white';
  return (
    <div className="flex gap-3 py-2 text-[13px] border-b border-gray-700/25 last:border-0 items-start">
      <span className="text-gray-500 shrink-0 min-w-[84px]">{k}</span>
      <span className="flex-1">
        <span className={`font-bold ${c}`}>{v}</span>
        {sub && <span className="block text-[11px] text-gray-600 mt-0.5 leading-relaxed">{sub}</span>}
      </span>
    </div>
  );
};
const Big = ({ value, label, tone }: any) => {
  const c = { warn: 'text-amber-400', ok: 'text-emerald-400', brass: 'text-amber-300' }[tone as string] || 'text-white';
  return (
    <div className="text-center py-2">
      <div className={`text-3xl font-black ${c}`}>{value}</div>
      <div className="text-[11.5px] text-gray-500 mt-1">{label}</div>
    </div>
  );
};
const Empty = ({ children }: any) => (
  <p className="text-[12.5px] text-gray-600 py-1 leading-relaxed">{children}</p>
);
const Alert = ({ tone, children }: any) => {
  const c = { crit: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
    warn: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
    ok: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
    dead: 'bg-gray-700/20 border-gray-700/40 text-gray-400' }[tone as string];
  return <div className={`border rounded-xl px-4 py-3 text-[12.5px] leading-relaxed ${c}`}>{children}</div>;
};

const TabBtn = ({ on, icon, label, onClick }: any) => (
  <button onClick={onClick}
    className={`py-2 pb-2.5 flex flex-col items-center gap-0.5 text-[10px] transition ${on ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'}`}>
    <span className="text-[15px] leading-none">{icon}</span>{label}
  </button>
);

// ══════════════════════════════════════════════════════
// 🗺️ مسارُ مواقع اللاعب — خريطةٌ وسجلُّ مكوث
//
// 🔴 نقاطٌ لا زياراتٌ في القاعدة: التطبيقُ يبلّغ كلَّ بضع دقائق، فلاعبٌ جلس
//    ثلاثَ ساعاتٍ يُنتج أربعين نقطةً فوق بعضها — تُقرأ أربعين زيارةً وهي واحدة.
//    فالنقاطُ تُرسم على الخريطة، والسجلُّ تحتَها يُقرأ **مكوثاً**.
//
// 🔴 والألوانُ والأقطارُ من `lib/trail` نفسِها التي تستعملها خريطةُ اللاعبين:
//    نسختان تعنيان تدرّجاً يختلف بين شاشتين تعرضان الشيءَ نفسَه.
// ══════════════════════════════════════════════════════
// 🔴 «web» ليست معلومةً للموظّف: المصدرُ يُترجَم أو لا يُعرض.
//    و٩٥٪ من القراءات مصدرُها المتصفّح — فالتمييزُ يهمّ حين يختلف.
const SRC: Record<string, string> = { web: 'متصفّح', app: 'تطبيق', leader: 'شاشةُ القائد' };

/** «٨ أيلول · ٨:٥٤ م» — المكوثُ داخلَ اليوم، فالساعةُ جزءٌ منه لا زينة */
const fmtDT = (t: number) => new Date(t).toLocaleString('ar-JO',
  { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function GeoTrail({ fixes, venues, total, from, to }: any) {
  const [sel, setSel] = useState<number | null>(null);
  const [focus, setFocus] = useState<any>(null);
  const now = Date.now();

  const dots = fixes.map((p: any, i: number) => {
    const t = fixes.length === 1 ? 0 : i / (fixes.length - 1);
    return {
      id: `t${i}`, lat: p.lat, lng: p.lng,
      color: trailColor(t), sizePx: trailSize(t),
      haloColor: sel === i ? '#f59e0b' : 'rgba(255,255,255,.9)',
      label: `${i === 0 ? '● الأحدث · ' : ''}${ar(ago(p.at, now))}${p.isMocked ? ' · ⚠️ مُصطنع' : ''}`,
      onClick: () => setSel(i === sel ? null : i),
    };
  });

  // 🔴 الخطُّ بالترتيب الزمنيّ الصاعد: نقاطٌ بلا خطٍّ لا تُقرأ كتتابع.
  const path = fixes.length > 1
    ? [...fixes].reverse().map((p: any) => ({ lat: p.lat, lng: p.lng }))
    : undefined;

  const stays = groupStays(fixes, venues);
  const s = sel != null ? fixes[sel] : null;
  const nearV = s && venues.length
    ? venues.map((v: any) => ({ v, d: haversineM(s.lat, s.lng, v.lat, v.lng) }))
        .sort((a: any, b: any) => a.d - b.d)[0]
    : null;

  return (
    <Section title={`مسارُ مواقعه — ${ar(fixes.length)} من ${ar(total)} نقطة`}>
      <p className="text-[11.5px] text-gray-600 mb-2 leading-relaxed">
        {from && to && <>من {fmtDate(from)} إلى {fmtDate(to)} · </>}
        الأغمقُ والأكبرُ أحدث. اضغط نقطةً لتفصيلها.
      </p>

      <div className="rounded-xl overflow-hidden border border-gray-700/40">
        <VenueMap
          center={{ lat: fixes[0].lat, lng: fixes[0].lng }}
          dots={dots} path={path} pathColor="#0d9488" height={320}
          fitTo={fixes.map((p: any) => ({ lat: p.lat, lng: p.lng }))} focus={focus}
        />
      </div>

      {/* تفصيلُ النقطة المختارة */}
      {s && (
        <div className="mt-2 bg-gray-900/60 border border-amber-500/30 rounded-xl px-4 py-3 text-[12.5px]">
          <div className="flex items-baseline gap-2 flex-wrap">
            <b className="text-amber-400">{ar(ago(s.at, now))}</b>
            <span className="text-gray-500">{new Date(s.at).toLocaleString('ar-JO')}</span>
          </div>
          <div className="text-gray-400 mt-1.5 leading-relaxed">
            {nearV && <>أقربُ مكان: <b className="text-gray-200">{nearV.v.name}</b> — {ar(dist(nearV.d))}<br /></>}
            {/* 🔴 الدقّةُ داخل الجملة لا رقماً مستقلّاً: «٥ كم» ليست موقعاً بل مدينة */}
            {s.accuracyM != null && (
              <span className={s.accuracyM > 1000 ? 'text-rose-400' : ''}>
                دقّةُ القراءة {ar(Math.round(s.accuracyM))} م
                {s.accuracyM > 1000 && ' — هذه مدينةٌ لا موقع'}<br />
              </span>
            )}
            {s.source && <>المصدر: {SRC[s.source] || s.source}<br /></>}
            {s.isMocked && <span className="text-rose-400">⚠️ الجهازُ يبلّغ موقعاً مُصطنعاً</span>}
          </div>
        </div>
      )}

      {/* سجلُّ المكوث */}
      {stays.length > 0 && (
        <div className="mt-3">
          <p className="text-[10.5px] tracking-wider text-amber-500/80 font-bold mb-1.5">
            أينَ مكث — {ar(stays.length)} مكوثاً
          </p>
          {stays.slice(0, 8).map((st: any, i: number) => (
            <button key={i} type="button"
              onClick={() => setFocus({ lat: st.lat, lng: st.lng, zoom: 17, nonce: Date.now() })}
              className="w-full text-right flex gap-3 py-2 text-[12.5px] border-b border-gray-700/25 last:border-0 items-start hover:bg-gray-800/40 rounded px-1 -mx-1 transition">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                style={{ background: trailColor(i / Math.max(1, stays.length - 1)) }} />
              <span className="flex-1">
                <b className="text-white">{st.venue || 'مكانٌ غيرُ معروف'}</b>
                {st.distM != null && !st.venue && (
                  <span className="text-gray-600"> · {ar(dist(st.distM))} عن أقرب مكان</span>
                )}
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  {fmtDT(st.from)}
                  {/* المكوثُ يُقاس بفارق أوّل نقطةٍ وآخرها — نقطةٌ واحدةٌ ليست مكوثاً */}
                  {st.to > st.from && <> · مكث {ar(dur(st.to - st.from))}</>}
                  {' · '}{ar(st.n)} قراءة
                  {st.mocked && <span className="text-rose-400"> · ⚠️ مُصطنع</span>}
                  {st.worstAccuracy != null && st.worstAccuracy > 1000 &&
                    <span className="text-amber-500"> · دقّةٌ ضعيفة</span>}
                </span>
              </span>
            </button>
          ))}
          {stays.length > 8 && (
            <p className="text-[11px] text-gray-600 pt-2">
              و{ar(stays.length - 8)} مكوثاً أقدم — تظهر على الخريطة أعلاه.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
