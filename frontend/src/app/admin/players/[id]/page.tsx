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
import { swalConfirm } from '@/lib/swal';

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

const ar = (n: number | string) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
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

  const { identity: id, lock, geo, money, reach, seat, rhythm, lastMatches, verdict, viewerRole, notes = [] } = card;
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

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16" dir="rtl">
      <button onClick={() => router.back()} className="text-gray-500 hover:text-white text-sm transition">← رجوع للقائمة</button>

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
        <Tile icon="💺"
          value={seat.pinned ? `مقعد ${ar(seat.pinned)}` : seat.blocked.length ? `يُمنع بجوار ${ar(seat.blocked.length)}` : '—'}
          label={seat.pinned ? 'مثبَّت' : 'الإجلاس'}
          tone={seat.blocked.length ? 'rose' : 'gray'} />
      </div>

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
      {seat.blocked.length > 0 && (
        <Section title="من يُمنع بجواره">
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
