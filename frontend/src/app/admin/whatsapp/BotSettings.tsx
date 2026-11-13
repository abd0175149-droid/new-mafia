'use client';

import { Fragment, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Banknote, Bell, BellOff, BookOpen, Bot, Check, ChevronDown, ChevronUp, Clock, Drama, Eye, EyeOff,
  FlaskConical, Gamepad2, HelpCircle, KeyRound, ListChecks, Lock, MapPin, MessageSquare, Search, Send, Settings,
  ShieldAlert, Sparkles, Ticket, Trash2, User, Wrench, X,
} from 'lucide-react';
import { swalConfirm, swalAlert, swalToast } from '@/lib/swal';
import { apiFetch } from './wa-lib';
import { Badge, Banner, Card, Chip, Empty, Field, PageHead, Seg, Setting, Skel, Toggle } from './wa-ui';

// ══════════════════════════════════════════════════════
// 🤖 تبويب البوت — الإعدادات + ساحة الاختبار + النبض
// ══════════════════════════════════════════════════════

export const MODEL_FALLBACK = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

// ══════════════════════════════════════════════════════
// 🧰 تصنيف الأدوات
// ══════════════════════════════════════════════════════
// أربعٌ وثلاثون أداةً في شبكةٍ واحدة لا تُقرأ ولا يُعرف ما ينقصها. التصنيف
// بالمعنى لا بالترتيب الأبجديّ: الموظّف يبحث عن «شيءٍ يخصّ الحجز» لا عن
// اسم مفتاح. والترتيب هنا هو ترتيب العرض.
export const TOOL_CATS: Array<{ key: string; label: string; tools: string[] }> = [
  { key: 'booking', label: 'الحجز والفعاليّات',
    tools: ['activities', 'reservation', 'myBookings', 'cancellation', 'changePeople', 'schedule', 'locations'] },
  { key: 'player', label: 'اللاعب وحسابه',
    tools: ['playerStats', 'accountLink', 'register', 'passwordReset', 'loyalty', 'chips', 'leaderboard'] },
  { key: 'game', label: 'اللعبة',
    tools: ['liveGame', 'matchHistory', 'roleGuide'] },
  { key: 'money', label: 'المال والمكان',
    tools: ['invoice', 'social'] },
  { key: 'conv', label: 'إدارة المحادثة',
    tools: ['notes', 'handoff', 'quickOptions', 'voice', 'survey'] },
  { key: 'admin', label: 'أدوات الأدمن',
    tools: ['adminFinance', 'adminGame', 'adminPassword', 'adminBookings', 'adminLoyalty', 'adminTonight',
            'adminChips', 'adminActivities', 'adminReports', 'adminPlayers', 'adminSeating', 'adminKb'] },
];

// أيقونة كلّ مجموعة — بالمفتاح لا بالنصّ، فالتسمية تبقى نصّاً خالصاً يُبحث فيه
const CAT_ICONS: Record<string, ReactNode> = {
  booking: <Ticket />, player: <User />, game: <Gamepad2 />, money: <Banknote />,
  conv: <MessageSquare />, admin: <Lock />, rest: <HelpCircle />,
};

// الأدوات المبنيّة للأدمن أصلاً (كانت تسميتها تبدأ بقفل) — يُرسم لها قفلٌ صغير قبل الاسم
const isAdminTool = (k: string) => k.startsWith('admin');

export const TOOL_LABELS: Record<string, string> = {
  activities: 'عرض الفعاليات (قائمة تفاعلية)',
  reservation: 'إنشاء حجز مؤكد (بأزرار تأكيد) + مجموعات عروض الحجز',
  myBookings: '«شو حجوزاتي؟»',
  notes: 'الملاحظات الدائمة (الذاكرة)',
  handoff: 'التحويل للإدارة',
  playerStats: '«شو رتبتي؟» (إحصائيات اللاعب)',
  passwordReset: 'إعادة تعيين كلمة السر (لرقم المحادثة فقط)',
  leaderboard: 'ترتيب أفضل 10 لاعبين',
  locations: 'الأماكن وروابط الخرائط',
  social: 'صفحات التواصل (إنستجرام/الموقع)',
  accountLink: 'ربط الحساب برمز تحقق (للأرقام الجديدة)',
  cancellation: 'إلغاء الحجوزات (قاعدة 3 ساعات)',
  quickOptions: 'أزرار خيارات سريعة في الردود (مهمة لحملات التعريف)',
  liveGame: 'اللعبة الحية (حالة/وقت/مُقصَون/دوري)',
  matchHistory: 'سجل المباريات (ملخص + تفصيل نقاط)',
  adminFinance: 'تقارير ماليّة + تحويل مجانيّ + تسجيل دفع (أدمن فقط)',
  adminGame: 'حالة اللعبة بالأدوار + إعادة توجيه حدث ليل (أدمن فقط)',
  adminPassword: 'إعادة تعيين كلمة سرّ لاعب عبر رقمه (أدمن فقط)',
  adminBookings: 'إضافة حجز للاعب + نقل حجز بين فعاليّتين (أدمن فقط)',
  loyalty: 'بطاقة الولاء للاعب (أختامه، زياراته، مكافآته)',
  adminLoyalty: 'بطاقة الولاء للإدارة: نظرة الشهر، بطاقة لاعب، ختم يدويّ، إلغاء مكافأة (أدمن فقط)',
  voice: 'فهم الرسائل الصوتيّة (تُفرَّغ نصّاً قبل الردّ)',
  invoice: '«شو فاتورتي؟» — فاتورة اللاعب في فعاليّته',
  chips: 'رصيد التشبس وحركاته',
  changePeople: 'تعديل عدد الأشخاص في حجز قائم (بزرّ تأكيد)',
  schedule: 'جدول الليلة المكتوب',
  roleGuide: 'دليل الأدوار الحيّ من النظام',
  register: 'تسجيل حساب لاعب من الواتساب (الموافقة على الشروط عند أوّل دخول للتطبيق)',
  adminTonight: 'لوحة الليلة بسؤال واحد (أدمن فقط)',
  adminChips: 'شحن تشبس بباقة معتمدة — موثَّق باسم الأدمن ومصدره واتساب (أدمن فقط)',
  adminActivities: 'إنشاء فعاليّة بنسخ إعدادات آخر فعاليّة في المكان (أدمن فقط)',
  adminReports: 'تقارير سريعة: اليوم / الأسبوع / الشهر (أدمن فقط)',
  adminPlayers: 'قفل/فكّ حساب، إعفاء سياج الموقع، ملاحظة على لاعب (أدمن فقط)',
  survey: 'استبيان ما بعد الأمسية بأزرار (يُرسل فقط لمن نافذته مفتوحة)',
  menu: 'منيو المكان: الأصناف والأسعار وعروض الكافيه والحدّ الأدنى — كما يراها اللاعب في التطبيق',
  adminSeating: 'الإجلاس عبر المحرّك: عرض، تعيين مقعد، منع تجاور، إعادة توزيع في اللوبي (أدمن فقط)',
  adminKb: 'تعديل قاعدة المعرفة من الواتساب: قراءة · إضافة معلومة · تصحيح نصّ — بمعاينة وزرّ تأكيد ولقطةٍ للتراجع (أدمن فقط)',
};

// ── أدوات عرضٍ محلّيّة صغيرة ──
const NOTE = { margin: 0, font: '400 13px/20px var(--font-sans)' } as const;
const SMALL = { font: '500 12px/16px var(--font-sans)' } as const;
const COL = { gap: 'var(--space-5)' } as const;
const STRONG = { color: 'var(--ink-2)' } as const;
/** يُخفى على الهاتف ما ليس تبويبَه النشط؛ الحاسوب يُبقي كلّ شيءٍ ظاهراً */
const only = (active: boolean) => (active ? undefined : 'wa-only-desk');

/** حقل رقم داخل `Setting` — القيمة الفارغة أو غير الرقميّة تعود إلى الحدّ الأدنى */
function Num({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  return (
    <input
      type="number" value={value} min={min} max={max} dir="ltr" aria-label={label}
      onChange={e => onChange(parseInt(e.target.value) || min)}
      className="wa-input num"
    />
  );
}

// ══════════════════════════════════════════════════════
// ⏱️ متابعة المحادثات الصامتة — من راسلنا ولم يُثبّت حجزاً
// ══════════════════════════════════════════════════════
export const FU_DEFAULT = {
  enabled: false, firstAfterMinutes: 10, secondAfterHours: 12, maxSilenceHours: 6,
  quietFromHour: 23, quietToHour: 9, maxPerDay: 60, audience: 'unbooked',
  instructionFirst: '', instructionSecond: '',
};

export function FollowupCard({ s, patch }: { s: any; patch: (k: string, v: any) => void }) {
  const f = { ...FU_DEFAULT, ...(s.followup || {}) };
  const set = (k: string, v: any) => patch('followup', { ...f, [k]: v });
  const [stats, setStats] = useState<any>(null);
  const [showTexts, setShowTexts] = useState(false);

  useEffect(() => {
    apiFetch('/api/whatsapp/bot/followup-stats').then(r => setStats(r.stats)).catch(() => {});
  }, []);

  return (
    <Card title={<><Clock />متابعة من راسلنا ولم يحجز</>}>
      <Setting title="تشغيل المتابعة الآليّة">
        <Toggle on={!!f.enabled} onChange={() => set('enabled', !f.enabled)} label="تشغيل المتابعة الآليّة" />
      </Setting>
      <p className="muted" style={{ ...NOTE, paddingBlock: 'var(--space-3)', borderBottom: '1px solid var(--line)' }}>
        حين تسكت محادثةٌ ولم يُثبّت صاحبها حجزاً، يُكمل الدون من حيث توقّفتما — بتعليمةٍ داخليّة
        <b style={STRONG}> لا يراها العميل ولا تدخل سجلّ المحادثة</b>، فيختار هو ما يقوله بحسب ما جرى بينكما.
        متابعتان على الأكثر ثمّ صمتٌ نهائيّ، ومن يقول «مش مهتمّ» يُستثنى فوراً.
      </p>

      <Setting title="المتابعة الأولى بعد (دقيقة)">
        <Num label="المتابعة الأولى بعد (دقيقة)" value={f.firstAfterMinutes} onChange={v => set('firstAfterMinutes', v)} min={1} max={1440} />
      </Setting>
      <Setting title="المتابعة الثانية بعد (ساعة) — ٠ = واحدة فقط">
        <Num label="المتابعة الثانية بعد (ساعة)" value={f.secondAfterHours} onChange={v => set('secondAfterHours', v)} min={0} max={23} />
      </Setting>
      <Setting title="لا تُتابع صمتاً أقدم من (ساعة)">
        <Num label="لا تُتابع صمتاً أقدم من (ساعة)" value={f.maxSilenceHours} onChange={v => set('maxSilenceHours', v)} min={1} max={24} />
      </Setting>
      {/* 🔴 حقلان متجاوران في سياق RTL: الأوّل يُرسم يميناً، فيقرؤه المستخدم «إلى» ويكتب
          فيه «من» — وقد وقع هذا فعلاً فصارت ساعات الهدوء تغطّي النهار كلّه والميزة صامتة
          بلا خطأ ولا سجلّ. العلاج ثلاثيّ: dir=ltr يثبّت الترتيب · وسمٌ فوق كلّ حقل ·
          وجملةٌ تقول المعنى لا الأرقام. */}
      <Setting title="ساعات الهدوء — لا متابعة فيها">
        <div className="flex items-end gap-2" dir="ltr">
          <div style={{ textAlign: 'center' }}>
            <div className="muted" style={{ ...SMALL, fontWeight: 700, marginBottom: 2 }}>من الساعة</div>
            <Num label="ساعات الهدوء: من الساعة" value={f.quietFromHour} onChange={v => set('quietFromHour', v)} min={0} max={23} />
          </div>
          <span className="muted" style={{ paddingBottom: 10 }} aria-hidden="true">→</span>
          <div style={{ textAlign: 'center' }}>
            <div className="muted" style={{ ...SMALL, fontWeight: 700, marginBottom: 2 }}>إلى الساعة</div>
            <Num label="ساعات الهدوء: إلى الساعة" value={f.quietToHour} onChange={v => set('quietToHour', v)} min={0} max={23} />
          </div>
        </div>
      </Setting>
      {(() => {
        const from = Number(f.quietFromHour), to = Number(f.quietToHour);
        const span = from === to ? 0 : (from < to ? to - from : 24 - from + to);
        const h12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? ' صباحاً' : ' مساءً'}`;
        return (
          <div style={{ paddingBlock: 'var(--space-3)', borderBottom: '1px solid var(--line)' }}>
            <Banner tone={span >= 12 ? 'warn' : undefined} icon={span === 0 ? <Bell /> : span >= 12 ? <AlertTriangle /> : <BellOff />}>
              {span === 0
                ? 'لا ساعات هدوء — المتابعة تعمل على مدار اليوم.'
                : `لا متابعة بين ${h12(from)} و${h12(to)} — أي ${span} ساعة صمت يوميّاً، والمتابعة تعمل في الـ${24 - span} ساعة الباقية.`}
              {span >= 12 && ' هذه فترة هدوءٍ طويلة — تأكّد أنّ الحقلين ليسا معكوسين.'}
            </Banner>
          </div>
        );
      })()}
      <Setting title="سقف المتابعات اليوميّ">
        <Num label="سقف المتابعات اليوميّ" value={f.maxPerDay} onChange={v => set('maxPerDay', v)} min={0} max={1000} />
      </Setting>
      <Setting title="مَن يُتابَع">
        <select value={f.audience} onChange={e => set('audience', e.target.value)}
          aria-label="مَن يُتابَع" className="wa-select" style={{ width: 200, flex: 'none' }}>
          <option value="unbooked">كلّ من لم يُثبّت حجزاً</option>
          <option value="new_only">الجدد بلا حساب فقط</option>
        </select>
      </Setting>

      {stats && (
        <div className="flex flex-wrap items-center gap-2" style={{ paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)', borderTop: '1px solid var(--line)' }}>
          <span className="muted" style={SMALL}>آخر <span className="ltr">{stats.days}</span> أيّام:</span>
          <Badge>أولى <span className="ltr">{stats.first_sent ?? 0}</span></Badge>
          <Badge>ثانية <span className="ltr">{stats.second_sent ?? 0}</span></Badge>
          <Badge tone="ok">ردّوا <span className="ltr">{stats.replied ?? 0}</span></Badge>
          <Badge tone="ok">حجزوا بعدها <span className="ltr">{stats.booked ?? 0}</span></Badge>
          <Badge tone="warn">أوقفوها <span className="ltr">{stats.stopped_by_customer ?? 0}</span></Badge>
          <span className="muted" style={SMALL}>اليوم <span className="ltr">{stats.today ?? 0}</span></span>
        </div>
      )}

      <button type="button" onClick={() => setShowTexts(v => !v)} aria-expanded={showTexts} className="wa-btn ghost" style={{ marginTop: 'var(--space-2)', paddingInline: 0 }}>
        {showTexts ? <ChevronUp /> : <ChevronDown />}
        {showTexts ? 'إخفاء نصّ التعليمة' : 'تعديل نصّ التعليمة الداخليّة'}
      </button>
      {showTexts && (
        <div className="stack" style={{ marginTop: 'var(--space-2)' }}>
          <Field label="تعليمة المتابعة الأولى" htmlFor="fu-first">
            <textarea id="fu-first" value={f.instructionFirst} onChange={e => set('instructionFirst', e.target.value)} rows={5}
              placeholder="اتركه فارغاً للنصّ الافتراضيّ"
              className="wa-textarea" />
          </Field>
          <Field label="تعليمة المتابعة الثانية" htmlFor="fu-second">
            <textarea id="fu-second" value={f.instructionSecond} onChange={e => set('instructionSecond', e.target.value)} rows={4}
              placeholder="اتركه فارغاً للنصّ الافتراضيّ"
              className="wa-textarea" />
          </Field>
          <p className="muted" style={{ ...SMALL, margin: 0 }}>التعليمة تخاطب الدون لا العميل — اكتبها كأمرٍ له: «أرسل متابعةً واحدة قصيرة…».</p>
        </div>
      )}
    </Card>
  );
}

// `section` يقسم البطاقات على أقسام شريط الإدارة بلا فقدِ الحالة بينها:
// المكوّن يبقى مركّباً والأقسام تُخفي ما ليس لها، فالتعديلُ غير المحفوظ لا يضيع.
export type BotSection = 'all' | 'don' | 'know' | 'perf';
// ══════════════════════════════════════════════════════
// ✨ إعدادات صياغة ردود الموظّفين
// ══════════════════════════════════════════════════════
export function RestyleCard({ s, patch }: { s: any; patch: (k: string, v: any) => void }) {
  const r = s.restyle || {};
  const set = (k: string, v: any) => patch('restyle', { ...r, [k]: v });
  const on = r.enabled === true;
  const sign = r.signature !== false;
  return (
    <Card title={<><Sparkles />صياغة ردود الموظّفين — ثبات الأسلوب أمام العميل</>}>
      <Setting title="إعادة الصياغة مفعّلة">
        <Toggle on={on} onChange={() => set('enabled', !on)} label="إعادة الصياغة مفعّلة" />
      </Setting>
      {on && (<>
        <Setting title="لا تُصَغ الردود الأقصر من (كلمة)">
          <Num label="لا تُصَغ الردود الأقصر من (كلمة)" value={r.minWords ?? 4} onChange={n => set('minWords', n)} min={0} max={20} />
        </Setting>
        <Setting title="مهلة الصياغة (ثانية) ثمّ يُرسل نصّك">
          <Num label="مهلة الصياغة (ثانية)" value={Math.round((r.timeoutMs ?? 4000) / 1000)} onChange={n => set('timeoutMs', n * 1000)} min={2} max={15} />
        </Setting>
        <Setting title="حين يمسك الحارس رقماً تغيّر">
          <select
            value={r.onGuardFail || 'review'}
            onChange={e => set('onGuardFail', e.target.value)}
            aria-label="حين يمسك الحارس رقماً تغيّر"
            className="wa-select" style={{ width: 200, flex: 'none' }}
          >
            <option value="review">اعرضها عليّ لأحكم (موصى)</option>
            <option value="send_mine">أرسل نصّي كما هو</option>
            <option value="send_styled">أرسل الصياغة رغم ذلك</option>
          </select>
        </Setting>
        <p className="muted" style={{ ...NOTE, paddingBlock: 'var(--space-3)', borderBottom: '1px solid var(--line)' }}>
          الصياغة نداءٌ منفصل: <b style={STRONG}>بلا أدوات وبلا قاعدة معرفة وبلا سجلّ المحادثة</b> — الشخصيّة والنصّ فقط.
          ولهذا لا يمكنها أن تحجز شيئاً أو تخترع معلومة، وكلفتها جزءٌ يسير من كلفة ردٍّ عاديّ.
          والحارس يوقف الرسالة إن سقط رقمٌ أو رابطٌ من نصّك أو ظهر جديدٌ لم تكتبه.
        </p>
        <Setting title="توقيع أوّل ردٍّ بشريّ في الجلسة">
          <Toggle on={sign} onChange={() => set('signature', !sign)} label="توقيع أوّل ردٍّ بشريّ في الجلسة" />
        </Setting>
        {sign && (<>
          <Setting title="صيغة التوقيع">
            <input
              value={r.signatureText ?? '— {name} من الإدارة'}
              onChange={e => set('signatureText', e.target.value)}
              placeholder="— {name} من الإدارة"
              aria-label="صيغة التوقيع"
              className="wa-input" style={{ width: 220, flex: 'none' }}
            />
          </Setting>
          <Setting title="يعود التوقيع بعد صمتٍ (دقيقة)">
            <Num label="يعود التوقيع بعد صمتٍ (دقيقة)" value={r.resignAfterMin ?? 30} onChange={n => set('resignAfterMin', n)} min={0} max={1440} />
          </Setting>
          <p className="muted" style={{ ...NOTE, paddingTop: 'var(--space-3)' }}>
            توقيعٌ في كلّ رسالة يكشف أنّ «الدون» عدّة أشخاص، وبلا توقيعٍ إطلاقاً لا يعرف العميل أنّ إنساناً استلم أمره.
            فمرّةً عند انتقال الجلسة من البوت إلى إنسان — ويعود إن تولّاها موظّفٌ آخر أو طال الصمت.
            <b style={STRONG}> <span className="ltr">{'{name}'}</span> إلزاميّة</b> وإلّا رُدّت الصيغة للافتراضيّة.
          </p>
        </>)}
      </>)}
    </Card>
  );
}

// ══════════════════════════════════════════════════════
// 🧰 بطاقة الأدوات — مصنَّفةٌ وقابلةٌ للبحث
// ══════════════════════════════════════════════════════
// كلّ أداةٍ مفعّلة تزيد طول التعليمات المُرسلة مع **كلّ** ردّ، وتزيد احتمال
// أن يختار النموذج أداةً في غير موضعها. فالعدّادُ أعلى كلّ مجموعة ليس زينةً:
// هو ما يجعل «كم أداةً شغّالة؟» سؤالاً له جواب.
export function ToolsCard({ s, patchTool, patchAdminOnly }: {
  s: any; patchTool: (k: string, v: boolean) => void; patchAdminOnly: (k: string, v: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ booking: true });
  const cfg = s.toolsConfig || {};
  const isOn = (k: string) => cfg[k] !== false;
  const admin: string[] = Array.isArray(s.adminOnlyTools) ? s.adminOnlyTools : [];

  // أداةٌ في TOOL_LABELS ولم تُذكر في أيّ مجموعة تسقط من الشاشة صامتةً —
  // فتُجمع هنا تحت «غير مصنّفة» بدل أن تختفي.
  const known = new Set(TOOL_CATS.flatMap(c => c.tools));
  const rest = Object.keys(TOOL_LABELS).filter(k => !known.has(k));
  const cats = rest.length ? [...TOOL_CATS, { key: 'rest', label: 'غير مصنّفة', tools: rest }] : TOOL_CATS;

  const term = q.trim();
  const hit = (k: string) => !term || TOOL_LABELS[k]?.includes(term) || k.toLowerCase().includes(term.toLowerCase());
  const shown = cats
    .map(c => ({ ...c, list: c.tools.filter(k => TOOL_LABELS[k] && hit(k)) }))
    .filter(c => c.list.length > 0);

  const total = Object.keys(TOOL_LABELS).length;
  const onCount = Object.keys(TOOL_LABELS).filter(isOn).length;

  return (
    <Card
      title={<><Wrench />الأدوات</>}
      aside={<><span className="ltr">{onCount}</span> مفعّلة من <span className="ltr">{total}</span></>}
    >
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <div className="flex items-center gap-2">
          <div className="wa-search grow">
            <Search />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ابحث عن أداة…"
              aria-label="ابحث عن أداة"
              className="wa-input"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(Object.fromEntries(cats.map(c => [c.key, true])))}
            className="wa-btn"
          >افتح الكلّ</button>
        </div>
        <p className="muted" style={NOTE}>
          «أدمن فقط» = الأداة تظهر للأرقام المربوطة بحساب أدمن وتُحجب عن غيرهم.
          وكلّ أداةٍ مفعّلة تُطيل تعليمات كلّ ردّ — فما لا يُستعمل يُطفأ.
        </p>

        {shown.length === 0 && <Empty icon={<Search />} title="لا أداة بهذا الاسم" />}

        {shown.map(c => {
          const isOpen = !!term || !!open[c.key];   // البحث يفتح الكلّ مؤقّتاً
          const on = c.list.filter(isOn).length;
          return (
            <Fragment key={c.key}>
              <button
                type="button"
                onClick={() => setOpen(o => ({ ...o, [c.key]: !isOpen }))}
                aria-expanded={isOpen}
                className="wa-acc"
              >
                {CAT_ICONS[c.key]}
                {c.label}
                <span className="end">
                  {on}/{c.list.length}
                  <ChevronDown style={isOpen ? { transform: 'rotate(180deg)' } : undefined} />
                </span>
              </button>
              {isOpen && (
                <div style={{ paddingInline: 'var(--space-3)' }}>
                  {c.list.map(k => {
                    const tOn = isOn(k);
                    const tAdmin = admin.includes(k);
                    return (
                      <Setting
                        key={k}
                        title={<>
                          {isAdminTool(k) && <Lock className="s" style={{ display: 'inline', verticalAlign: '-1px', marginInlineEnd: 6, color: 'var(--gold)' }} aria-hidden="true" />}
                          {TOOL_LABELS[k]}
                        </>}
                        hint={tOn ? (
                          <button
                            type="button"
                            onClick={() => patchAdminOnly(k, !tAdmin)}
                            title="إتاحة هذه الأداة للأرقام المربوطة بحساب أدمن فقط"
                            aria-pressed={tAdmin}
                            className="wa-pill"
                            style={{ minHeight: 'var(--hit)', marginTop: 'var(--space-1)' }}
                          ><Lock className="s" />أدمن فقط</button>
                        ) : undefined}
                      >
                        <Toggle on={tOn} onChange={() => patchTool(k, cfg[k] === false)} label={TOOL_LABELS[k]} />
                      </Setting>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </Card>
  );
}

type DonGroup = 'tools' | 'run' | 'restyle' | 'followup' | 'places';
type KnowGroup = 'persona' | 'kb' | 'try';

export function BotSettingsView({ onOpenConv, section = 'all', tryOpen = false, onTryClose }: { onOpenConv?: (id: number) => void; section?: BotSection; tryOpen?: boolean; onTryClose?: () => void }) {
  const show = (k: BotSection) => section === 'all' || section === k;
  const [s, setS] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>(MODEL_FALLBACK);
  const [testingKey, setTestingKey] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [pg, setPg] = useState<Array<{ role: 'user' | 'model'; text: string; trace?: any[]; interactives?: any[] }>>([]);
  const [pgInput, setPgInput] = useState('');
  const [pgLoading, setPgLoading] = useState(false);
  const [locs, setLocs] = useState<any[]>([]);
  const pgRef = useRef<HTMLDivElement>(null);
  // لقطة آخر ما حُمّل/حُفظ — يُشتقّ منها «هل من تعديلٍ غير محفوظ؟» ليظهر شريط الحفظ
  const [savedSnap, setSavedSnap] = useState('');
  // عرضٌ فقط: تبويب الهاتف النشط في كلّ قسم (الحاسوب يُظهر الكلّ)
  const [donGrp, setDonGrp] = useState<DonGroup>('tools');
  const [knowGrp, setKnowGrp] = useState<KnowGroup>('persona');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [a, b, c] = await Promise.all([
        apiFetch('/api/whatsapp/bot/settings'),
        apiFetch('/api/whatsapp/bot/stats').catch(() => null),
        apiFetch('/api/whatsapp/bot/locations').catch(() => null),
      ]);
      setS(a.settings);
      setSavedSnap(JSON.stringify(a.settings));
      if (b?.stats) setStats(b.stats);
      if (c?.locations) setLocs(c.locations);
      if (a.settings?.model && !MODEL_FALLBACK.includes(a.settings.model)) {
        setModels(prev => (prev.includes(a.settings.model) ? prev : [a.settings.model, ...prev]));
      }
    } catch (e: any) {
      swalAlert('تعذر جلب إعدادات البوت: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (k: string, v: any) => setS((prev: any) => ({ ...prev, [k]: v }));
  const patchTool = (k: string, v: boolean) => setS((prev: any) => ({ ...prev, toolsConfig: { ...(prev.toolsConfig || {}), [k]: v } }));
  const patchAdminOnly = (k: string, v: boolean) => setS((prev: any) => {
    const cur: string[] = Array.isArray(prev.adminOnlyTools) ? prev.adminOnlyTools : [];
    return { ...prev, adminOnlyTools: v ? Array.from(new Set([...cur, k])) : cur.filter((x) => x !== k) };
  });

  const save = async (extra: Record<string, any> = {}) => {
    if (!s) return;
    setSaving(true);
    try {
      const body: any = {
        enabled: s.enabled, model: s.model, systemPrompt: s.systemPrompt, knowledgeBase: s.knowledgeBase,
        contextMessages: s.contextMessages, pauseMinutes: s.pauseMinutes, maxToolLoops: s.maxToolLoops,
        failMessage: s.failMessage, failHandoff: s.failHandoff, toolsConfig: s.toolsConfig,
        adminOnlyTools: s.adminOnlyTools || [],
        // ⏱️ إعدادات المتابعة — غيابُها من هذا الجسم كان يعني أنّ كلّ ضبطٍ لها يُرسل
        //    ناقصاً، فيعود الخادم بالقيمة القديمة ويبدو كأنّ الصفحة «رجعت لحالها».
        ...(s.followup !== undefined ? { followup: s.followup } : {}),
        // ✨ وكذلك الصياغة — غيابُها من الجسم يعني عودةَ الإعدادات كما كانت
        ...(s.restyle !== undefined ? { restyle: s.restyle } : {}),
        ...extra,
      };
      if (s.priceInputPer1M !== undefined) body.priceInputPer1M = s.priceInputPer1M;
      if (s.priceOutputPer1M !== undefined) body.priceOutputPer1M = s.priceOutputPer1M;
      if (keyInput.trim()) body.geminiApiKey = keyInput.trim();
      const res = await apiFetch('/api/whatsapp/bot/settings', { method: 'PUT', body: JSON.stringify(body) });
      setS(res.settings);
      setSavedSnap(JSON.stringify(res.settings));
      setKeyInput('');
      swalToast('حُفظت الإعدادات — تسري على الرسالة التالية فوراً ✅', 'success');
    } catch (e: any) {
      swalAlert('فشل الحفظ: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (!s) return;
    const enabling = !s.enabled;
    if (enabling && !s.hasKey && !keyInput.trim()) {
      swalAlert('أدخل مفتاح Gemini واحفظه قبل تفعيل البوت', 'warning');
      return;
    }
    const ok = await swalConfirm(
      enabling
        ? 'سيبدأ البوت بالرد تلقائياً على كل رسائل العملاء الواردة (في المحادثات غير الموقوفة).'
        : 'سيتوقف البوت عن الرد في كل المحادثات فوراً.',
      { title: enabling ? 'تفعيل البوت للجميع؟' : 'إيقاف البوت العام؟', danger: !enabling, confirmText: enabling ? 'تفعيل' : 'إيقاف' },
    );
    if (!ok) return;
    patch('enabled', enabling);
    await save({ enabled: enabling });
  };

  const testKey = async () => {
    setTestingKey(true);
    try {
      const res = await apiFetch('/api/whatsapp/bot/test-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey: keyInput.trim() || undefined }),
      });
      if (res.models?.length) {
        setModels(res.models);
        if (s && !res.models.includes(s.model)) patch('model', res.models[0]);
      }
      swalToast(`المفتاح صالح ✅ — ${res.models?.length || 0} نموذج متاح`, 'success');
    } catch (e: any) {
      swalAlert('فشل اختبار المفتاح: ' + e.message, 'error');
    } finally {
      setTestingKey(false);
    }
  };

  const pgSend = async () => {
    const text = pgInput.trim();
    if (!text || pgLoading) return;
    const next = [...pg, { role: 'user' as const, text }];
    setPg(next);
    setPgInput('');
    setPgLoading(true);
    try {
      const res = await apiFetch('/api/whatsapp/bot/playground', {
        method: 'POST',
        body: JSON.stringify({
          history: next.map(m => ({ role: m.role, text: m.text })),
        }),
      });
      setPg(prev => [...prev, { role: 'model', text: res.text || '(بلا نص — أرسل رسالة تفاعلية)', trace: res.toolTrace, interactives: res.interactives }]);
    } catch (e: any) {
      setPg(prev => [...prev, { role: 'model', text: '⚠️ خطأ: ' + e.message }]);
    } finally {
      setPgLoading(false);
      requestAnimationFrame(() => { if (pgRef.current) pgRef.current.scrollTop = pgRef.current.scrollHeight; });
    }
  };

  if (loading || !s) {
    return (
      <div className="stack" aria-busy="true">
        <span className="muted">جارٍ تحميل إعدادات البوت…</span>
        <Skel h={72} />
        <Skel h={240} />
      </div>
    );
  }

  // المفتاح المكتوب ولم يُحفظ تعديلٌ أيضاً: يُرسل مع الحفظ ولا يسكن في `s`
  const dirty = JSON.stringify(s) !== savedSnap || !!keyInput.trim();

  return (
    // 🔴 بلا تمريرٍ خاصّ وبلا غلاف: العناصر أبناءٌ مباشرون لعمود المحتوى الممرِّر،
    //    فشريط الحفظ اللاصق يلتصق بأسفل ذلك العمود نفسه لا بجذرٍ آخر. تمريرٌ داخل
    //    تمريرٍ يُنتج شريطَي تمرير متداخلين ويجعل اللاصق يلتصق بالجذر الخطأ.
    <>
      

      {/* حالة البوت */}
      <Card className="flex items-center flex-wrap gap-4">
        <Toggle on={!!s.enabled} onChange={() => { toggleEnabled(); }} label="تشغيل البوت للجميع" />
        <div className="grow" style={{ minWidth: 180 }}>
          <div className="row" style={{ font: '700 16px/24px var(--font-sans)', color: s.enabled ? 'var(--ok)' : 'var(--ink-2)' }}>
            <i className={`wa-dot${s.enabled ? ' ok' : ''}`} aria-hidden="true" />
            {s.enabled ? 'البوت يعمل — يرد على العملاء' : 'البوت مطفأ'}
          </div>
          <div className="muted" style={{ font: '400 13px/18px var(--font-sans)' }}>التفعيل يشمل كل المحادثات (عدا الموقوفة يدوياً)</div>
        </div>
        {stats && (
          <div className="flex items-center flex-wrap gap-2">
            <Badge>ردود اليوم: <span className="ltr">{stats.replies24h}</span></Badge>
            <Badge>الأسبوع: <span className="ltr">{stats.replies7d}</span></Badge>
            <Badge tone="ok">حجوزات البوت: <span className="ltr">{stats.reservations7d}</span></Badge>
            <Badge tone="danger">بحاجة تدخل: <span className="ltr">{stats.attentionNow}</span></Badge>
          </div>
        )}
      </Card>

      {show('don') && (<>
        {/* الهاتف: تبويبٌ واحد ظاهر في كلّ مرّة — الكلّ يبقى مركّباً فلا تضيع حالة */}
        <div className="wa-only-phone">
          <div className="wa-chips" role="group" aria-label="أقسام السلوك والأدوات">
            {([['tools', 'الأدوات'], ['run', 'التشغيل'], ['restyle', 'الصياغة'], ['followup', 'المتابعة'], ['places', 'الأماكن']] as const).map(([k, l]) => (
              <Chip key={k} on={donGrp === k} onClick={() => setDonGrp(k)}>{l}</Chip>
            ))}
          </div>
        </div>

        <div className="wa-grid2">
          <div className={`stack ${only(donGrp === 'tools' || donGrp === 'places') || ''}`} style={COL}>
            {/* الأدوات */}
            <div className={only(donGrp === 'tools')}>
              <ToolsCard s={s} patchTool={patchTool} patchAdminOnly={patchAdminOnly} />
            </div>

            {/* الأماكن الفعالة */}
            <div className={only(donGrp === 'places')}>
              <Card title={<><MapPin />الأماكن — البوت يجيب عن الفعالة فقط (بروابط خرائطها)</>}>
                {locs.length === 0 ? (
                  <Empty icon={<MapPin />} title="لا أماكن" />
                ) : locs.map(l => (
                  <Setting
                    key={l.id}
                    title={l.name}
                    hint={l.mapUrl ? undefined : (
                      <em style={{ fontStyle: 'normal', color: 'var(--warn)' }}>
                        <AlertTriangle className="s" style={{ display: 'inline', verticalAlign: '-1px', marginInlineEnd: 4 }} aria-hidden="true" />
                        بلا رابط خريطة
                      </em>
                    )}
                  >
                    <Toggle
                      on={!!l.isActive}
                      label={l.name}
                      onChange={async () => {
                        try {
                          const res = await apiFetch(`/api/whatsapp/bot/locations/${l.id}/toggle`, {
                            method: 'POST', body: JSON.stringify({ isActive: !l.isActive }),
                          });
                          setLocs(prev => prev.map(x => (x.id === l.id ? { ...x, isActive: res.location.isActive } : x)));
                        } catch (e: any) { swalAlert(e.message, 'error'); }
                      }}
                    />
                  </Setting>
                ))}
                <div className="muted" style={{ ...SMALL, marginTop: 'var(--space-2)' }}>رابط الخريطة يُدار من صفحة المواقع — التفعيل هنا يسري على إجابات البوت فوراً</div>
              </Card>
            </div>
          </div>

          <div className={`stack ${only(donGrp === 'run' || donGrp === 'restyle' || donGrp === 'followup') || ''}`} style={COL}>
            <div className={`stack ${only(donGrp === 'run') || ''}`} style={COL}>
              {/* المفتاح والنموذج */}
              <Card title={<><KeyRound />الاتصال بالنموذج</>}>
                <div className="stack">
                  <Field label={<span className="ltr">Gemini API Key</span>} htmlFor="bot-key">
                    <div className="flex items-center gap-1">
                      <input
                        id="bot-key"
                        type={showKey ? 'text' : 'password'}
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        placeholder={s.hasKey ? s.geminiApiKey : 'AIza…'}
                        className="wa-input grow"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        dir="ltr"
                      />
                      <button type="button" onClick={() => setShowKey(v => !v)} className="wa-iconbtn" style={{ flex: 'none' }}
                        aria-label={showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'} aria-pressed={showKey}>
                        {showKey ? <EyeOff /> : <Eye />}
                      </button>
                    </div>
                  </Field>
                  <Field label="النموذج" htmlFor="bot-model">
                    <select
                      id="bot-model"
                      value={s.model}
                      onChange={e => patch('model', e.target.value)}
                      className="wa-select"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      dir="ltr"
                    >
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <button type="button" onClick={testKey} disabled={testingKey} className="wa-btn block">
                    <Search />
                    {testingKey ? 'جارٍ الاختبار…' : 'اختبار المفتاح وجلب النماذج'}
                  </button>
                  <div className="muted" style={SMALL}>المفتاح من <span className="ltr">aistudio.google.com/apikey</span> — يُخزن بالسيرفر ولا يظهر كاملاً بعد الحفظ</div>
                </div>
              </Card>

              {/* سلوك التشغيل */}
              <Card title={<><Settings />سلوك التشغيل</>}>
                <Setting title="عدد رسائل السياق (ذاكرة المحادثة)"><Num label="عدد رسائل السياق" value={s.contextMessages} onChange={n => patch('contextMessages', n)} min={4} max={60} /></Setting>
                <Setting title="إيقاف البوت بعد رد بشري (دقائق)"><Num label="إيقاف البوت بعد رد بشري (دقائق)" value={s.pauseMinutes} onChange={n => patch('pauseMinutes', n)} min={1} max={1440} /></Setting>
                <Setting title="أقصى دورات أدوات بالرد الواحد"><Num label="أقصى دورات أدوات بالرد الواحد" value={s.maxToolLoops} onChange={n => patch('maxToolLoops', n)} min={1} max={8} /></Setting>
                <Setting title="تحويل للإدارة تلقائياً عند خلل تقني"><Toggle on={!!s.failHandoff} onChange={() => patch('failHandoff', !s.failHandoff)} label="تحويل للإدارة تلقائياً عند خلل تقني" /></Setting>
              </Card>

              {/* رسالة الفشل */}
              <Card title={<><ShieldAlert />رسالة الخلل التقني (تُرسل للعميل عند فشل البوت)</>}>
                <textarea
                  value={s.failMessage}
                  onChange={e => patch('failMessage', e.target.value)}
                  rows={5}
                  aria-label="رسالة الخلل التقني"
                  className="wa-textarea"
                />
              </Card>
            </div>

            {/* ✨ صياغة ردود الموظّفين */}
            <div className={only(donGrp === 'restyle')}>
              <RestyleCard s={s} patch={patch} />
            </div>
            {/* ⏱️ متابعة المحادثات الصامتة */}
            <div className={only(donGrp === 'followup')}>
              <FollowupCard s={s} patch={patch} />
            </div>
          </div>
        </div>
      </>)}

      {show('know') && (<>
        <div className="wa-only-phone">
          <Seg<KnowGroup>
            block
            label="أقسام المعرفة والتجربة"
            value={knowGrp}
            onChange={setKnowGrp}
            options={[['persona', 'الشخصيّة'], ['kb', 'المعرفة']]}
          />
        </div>

        <div>
          <div className="stack" style={COL}>
            {/* الشخصية */}
            <div className={only(knowGrp === 'persona')}>
              <Card
                title={<><Drama /><span>شخصية البوت (System Prompt)</span></>}
                aside={<><span className="ltr">{(s.systemPrompt || '').length}</span> حرف</>}
              >
                <textarea
                  value={s.systemPrompt}
                  onChange={e => patch('systemPrompt', e.target.value)}
                  rows={10}
                  aria-label="شخصية البوت"
                  className="wa-textarea"
                />
              </Card>
            </div>

            {/* قاعدة المعرفة */}
            <div className={only(knowGrp === 'kb')}>
              <Card
                title={<><BookOpen /><span>قاعدة المعرفة (Markdown — كل ما يعرفه البوت عن النادي)</span></>}
                aside={<><span className="ltr">{(s.knowledgeBase || '').length}</span> حرف</>}
              >
                <textarea
                  value={s.knowledgeBase}
                  onChange={e => patch('knowledgeBase', e.target.value)}
                  rows={18}
                  dir="rtl"
                  aria-label="قاعدة المعرفة"
                  className="wa-textarea"
                />
                <div className="muted" style={{ ...SMALL, marginTop: 6 }}>التعديل يسري على الرسالة التالية فوراً بعد الحفظ</div>
              </Card>
            </div>
          </div>

        </div>
      </>)}

      {/* ساحة الاختبار — لوح جانبيّ يُفتح فوق أيّ إعداد: غيّر وجرّب في مكانك */}
      {tryOpen && (
        <aside className="wa-drawer" aria-label="ساحة الاختبار">

            <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 0, border: 0, overflow: 'hidden' }}>
              <div className="wa-appbar" style={{ paddingInline: 'var(--space-4)', background: 'transparent', flex: 'none' }}>
                <FlaskConical style={{ color: 'var(--info)' }} />
                <div className="grow" style={{ paddingBlock: 'var(--space-2)' }}>
                  <div className="ttl">ساحة الاختبار — جرّب البوت هنا</div>
                  <div className="sub">لا يرسل شيئاً لواتساب ولا يسجل حجوزات حقيقية</div>
                </div>
                <button type="button" onClick={() => onTryClose?.()} className="wa-iconbtn" aria-label="إغلاق ساحة الاختبار"><X /></button>
                <button type="button" onClick={() => setPg([])} className="wa-iconbtn" aria-label="محادثة جديدة" title="محادثة جديدة"><Trash2 /></button>
              </div>
              <div ref={pgRef} className="wa-thread wa-scroll">
                {pg.length === 0 && (
                  <div style={{ margin: 'auto' }}>
                    <Empty icon={<FlaskConical />} title={<>يستخدم الإعدادات المحفوظة — احفظ أولاً ثم جرّب</>}>
                      مثلاً: «شو الفعاليات القادمة؟» أو «بدي أحجز»
                    </Empty>
                  </div>
                )}
                {pg.map((m, i) => (
                  <Fragment key={i}>
                    {m.trace && m.trace.length > 0 && m.trace.map((t: any, j: number) => (
                      <div key={j} className="wa-banner info" style={{ alignSelf: 'stretch', fontSize: 12, overflowWrap: 'anywhere' }}>
                        <Wrench />
                        <span>
                          <span className="ltr" style={{ fontSize: 12 }}>{t.name}({JSON.stringify(t.args)})</span>
                          {t.result?.dryRun ? ' · تجريبي' : <Check className="s" style={{ display: 'inline', verticalAlign: '-2px', marginInlineStart: 6 }} aria-label="نُفّذت" />}
                        </span>
                      </div>
                    ))}
                    <div className={`wa-msg${m.role === 'user' ? '' : ' out'}`}>
                      {m.role !== 'user' && <div className="who bot"><Bot />الدون</div>}
                      <p>{m.text}</p>
                      {m.interactives && m.interactives.length > 0 && (
                        <div className="xs">
                          <ListChecks className="s" style={{ display: 'inline', verticalAlign: '-2px', marginInlineEnd: 6, color: 'var(--violet)' }} aria-hidden="true" />
                          {m.interactives.map((x: any) => x.kind === 'list' ? `قائمة (${x.preview?.length} خيار)` : 'أزرار تأكيد').join(' + ')} — ستُرسل للعميل فعلياً بالوضع الحي
                        </div>
                      )}
                    </div>
                  </Fragment>
                ))}
                {pgLoading && (
                  <div className="wa-msg out pending">
                    <div className="who"><Bot />يفكر…</div>
                    <Skel h={14} w={180} />
                  </div>
                )}
              </div>
              <div className="wa-composer" style={{ flex: 'none' }}>
                <div className="line">
                  <textarea
                    rows={1}
                    value={pgInput}
                    onChange={e => setPgInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pgSend(); } }}
                    placeholder="اكتب رسالة كأنك عميل…"
                    aria-label="رسالة تجريبيّة"
                    disabled={pgLoading}
                  />
                  <button
                    type="button"
                    onClick={pgSend}
                    disabled={pgLoading || !pgInput.trim()}
                    className="sendbtn"
                    aria-label="إرسال"
                    style={pgLoading || !pgInput.trim() ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                  ><Send /></button>
                </div>
              </div>
            </Card>
        </aside>
      )}

      {/* شريط الحفظ — يظهر فقط حين يوجد ما لم يُحفظ، ويبقى عبر القسمين */}
      {(dirty || saving) && (
        <div className="wa-actionbar wa-savebar" role="region" aria-label="حفظ الإعدادات">
          <div className="sum">
            <b>تعديلات غير محفوظة</b>
            <span>تسري على الرسالة التالية فور الحفظ.</span>
          </div>
          <button type="button" onClick={() => save()} disabled={saving} className="wa-btn primary">
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════
// 🚫 أُزيل من هنا: البثّ الجماعيّ والحملات ومعالج إطلاقها ومراقبتها
// ════════════════════════════════════════════════════
// معها الواجهة التي كانت ترفع ملفّ إكسل فيصير قائمة إرسال.
// الخلفيّة حُذفت أولاً؛ وترك الأزرار تُشير إلى مسارات مُزالة عطلٌ لا سياسة.


// ════════════════════════════════════════════════════
// 🚫 أُزيل من هنا: بطاقةُ الاستهلاك والتكلفة ورسومُها
// ════════════════════════════════════════════════════
// انتقل محتواها إلى `PerformanceTab.tsx` مع تبويب الجودة: «هل يؤدّي الدون
// عمله؟» و«بكم؟» نصفا سؤالٍ واحد، وكانا شاشتين لكلٍّ مدّتُها وتمريرُها.
