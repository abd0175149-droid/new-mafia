'use client';
// ══════════════════════════════════════════════════════
// 🎛️ «اللعبة» — كلُّ إعدادات اللعبة في صفحةٍ واحدة (الخطوة ٢ من ٤)
//
// الفرق، والأدوار المضافة ومعاملاتها، وأدوار المدينة، والوقت والعقوبات، وطريقة الليل والممرّضة
// تُحسم هنا مرّةً — فلا تُسأل في الليل. ما يُلمس نادراً مطويٌّ في «إعدادات أخرى».
// القيم الافتراضيّة لحساب الليدر: «↺ قيمي» يعيدها و«💾 اجعلها قيمي» يحفظ الحاليّة.
// ══════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react';
import { Role, ROLE_NAMES } from '@/lib/constants';
import { Section, Hint, Seg, Stepper, SetRow, Switch } from '../kit';
import { autoMafia, composeRoles, extrasAllowed, samePlan, type SetupPlan } from '../setupPlan';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// وجوهُ الكروت من دليل الأدوار العامّ (مخبّأة للجلسة)
let _faces: Record<string, string> | null = null;
export function useRoleFaces(): Record<string, string> {
  const [f, setF] = useState<Record<string, string>>(_faces || {});
  useEffect(() => {
    if (_faces) return;
    fetch(`${API_URL}/api/game-config/roles-guide`).then((r) => r.json()).then((d) => {
      const m: Record<string, string> = {};
      for (const x of Array.isArray(d?.data) ? d.data : []) {
        const u = x?.face?.thumbUrl || x?.face?.url;
        if (x?.id && u) m[x.id] = `${API_URL}${u}`;
      }
      _faces = m; setF(m);
    }).catch(() => {});
  }, []);
  return f;
}

// ══════════ شريط الخطوات ══════════
const STEPS = ['المقاعد', 'اللعبة', 'الكروت', 'التوزيع'];
export function StepRail({ step, onStep }: { step: 1 | 2 | 3 | 4; onStep?: (s: number) => void }) {
  return (
    <nav aria-label="خطوات التجهيز" className="grid grid-cols-4 gap-1.5">
      {STEPS.map((t, i) => {
        const k = i + 1;
        const on = k === step, done = k < step;
        const can = !!onStep && k < step;
        return (
          <button key={t} type="button" disabled={!can} onClick={() => can && onStep!(k)} aria-current={on ? 'step' : undefined}
            className="flex flex-col gap-1 text-right disabled:cursor-default">
            <i className={`block h-1 rounded ${on ? 'bg-[#C5A059]' : done ? 'bg-[#C5A059]/55' : 'bg-[#2a241c]'}`} />
            <span className={`text-[12.5px] font-bold whitespace-nowrap ${on ? 'text-[#C5A059]' : 'text-[#9a8f7e]'}`}>{k} {t}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ══════════ شريط الفرق ══════════
export function TeamBar({ roles }: { roles: Role[] }) {
  const M = roles.filter((r) => ['GODFATHER', 'SILENCER', 'CHAMELEON', 'WITCH', 'OLDER_BROTHER', 'MAFIA_REGULAR'].includes(r)).length;
  const N = roles.filter((r) => r === Role.JESTER || r === Role.ASSASSIN).length;
  const C = roles.length - M - N;
  return (
    <div className="flex h-[34px] overflow-hidden rounded-[10px] border border-[#2a241c] text-[13.5px] font-extrabold" aria-label={`${M} مافيا · ${C} مدينة · ${N} محايد`}>
      <div className="flex items-center justify-center whitespace-nowrap bg-[#d0474c]/30 text-[#f2a6a9]" style={{ flexGrow: Math.max(M, 1.6) }}>{M} مافيا</div>
      <div className="flex items-center justify-center whitespace-nowrap bg-[#63afd9]/20 text-[#a9d4ee]" style={{ flexGrow: Math.max(C, 1.6) }}>{C} مدينة</div>
      {N > 0 && <div className="flex items-center justify-center whitespace-nowrap bg-[#d9a23a]/25 text-[#f0c879]" style={{ flexGrow: Math.max(N, 1.4) }}>{N}</div>}
    </div>
  );
}

function Tile({ on, disabled, face, title, sub, onClick, tone }: { on: boolean; disabled?: boolean; face?: string; title: string; sub: ReactNode; onClick: () => void; tone: 'n' | 'm' }) {
  const onCls = tone === 'm' ? 'border-[#d0474c] bg-[#d0474c]/10' : 'border-[#d9a23a] bg-[#d9a23a]/10';
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className={`flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-[13px] border px-1 py-2 disabled:opacity-35 ${on && !disabled ? onCls : 'border-[#2a241c] bg-[#16130f]'}`}>
      {face ? <img src={face} alt="" className={`h-[54px] w-[39px] rounded-[5px] object-cover ${on && !disabled ? '' : 'opacity-40 grayscale'}`} /> : <span className="h-[54px]" />}
      <b className="text-[13.5px]">{title}</b>
      <small className={`text-[12px] leading-tight ${on && !disabled ? 'text-[#efe8da]' : 'text-[#9a8f7e]'}`}>{disabled ? 'من ١٠ لاعبين' : on ? sub : 'مطفأ'}</small>
    </button>
  );
}

const ar = (n: number) => n.toLocaleString('ar-EG');

// ══════════ الصفحة ══════════
export function SetupForm({ plan, onChange, n, timerLocked, saved, accountDefaults, onSaveDefaults }: {
  plan: SetupPlan;
  onChange: (p: SetupPlan) => void;
  /** الحاضرون الذين سيلعبون */
  n: number;
  /** المؤقّت يُضبط في اللوبي وحده — أثناء التجهيز يُعرض للقراءة */
  timerLocked?: boolean;
  /** القيم المحفوظة في الحساب (null = لم تُحفظ بعد) */
  saved: SetupPlan | null;
  accountDefaults: SetupPlan;
  onSaveDefaults: () => void;
}) {
  const faces = useRoleFaces();
  const set = <K extends keyof SetupPlan>(k: K, v: SetupPlan[K]) => onChange({ ...plan, [k]: v });
  const roles = composeRoles(plan, n);
  const has = (r: Role) => roles.includes(r);
  const ex = extrasAllowed(n);
  const mAuto = autoMafia(n);
  const mafiaMax = Math.max(1, n - 2);
  const mafiaV = Math.min(plan.mafia ?? mAuto, mafiaMax);
  const isDefault = samePlan({ ...plan, mafia: null }, { ...accountDefaults, mafia: null }) && plan.mafia == null;
  const savedSame = saved ? samePlan({ ...plan, mafia: null }, saved) : false;

  return (
    <>
      <Section title={`${n} لاعباً`} aside={isDefault ? 'قيمك الافتراضيّة' : (
        <span className="flex items-center gap-3">
          <button type="button" className="min-h-[40px] text-[13px] font-bold text-[#C5A059] underline" onClick={() => onChange({ ...accountDefaults, mafia: null })}>↺ قيمي</button>
          {!savedSame && <button type="button" className="min-h-[40px] text-[13px] font-bold text-[#C5A059] underline" onClick={onSaveDefaults}>💾 اجعلها قيمي</button>}
        </span>
      )}>
        <TeamBar roles={roles} />
        <SetRow title={<b className="text-[14.5px]">المافيا الكلّيّ {plan.mafia == null && <span className="ms-1 rounded-md border border-[#43b27f]/50 px-1.5 text-[11.5px] text-[#99dcba]">تلقائيّ</span>}</b>}
          sub={plan.mafia == null ? `ربع اللاعبين = ${ar(mAuto)}، وأقصى التلقائيّ ٧` : <>يدويّ بلا سقف (التلقائيّ {ar(mAuto)}) · <button type="button" className="font-bold text-[#C5A059] underline" onClick={() => set('mafia', null)}>عُد للتلقائيّ</button></>}>
          <Stepper value={mafiaV} min={1} max={mafiaMax} onChange={(v) => set('mafia', v)} />
        </SetRow>
      </Section>

      <Section title="أدوار تُضاف" aside="المس للتفعيل">
        <div className="grid grid-cols-3 gap-[7px]">
          <Tile tone="n" on={plan.jester} face={faces.JESTER} title="المهرّج" sub={`من الجولة ${ar(plan.jesterRound)}`} onClick={() => set('jester', !plan.jester)} />
          <Tile tone="n" on={plan.assassin} disabled={!ex} face={faces.ASSASSIN} title="السفّاح" sub={`${ar(plan.contracts)} عقود${plan.assassinN > 1 ? ' · ×٢' : ''}`} onClick={() => set('assassin', !plan.assassin)} />
          <Tile tone="m" on={plan.twins} disabled={!ex} face={faces.OLDER_BROTHER} title="الأخوان" sub="أكبر مافيا · أصغر مدينة" onClick={() => set('twins', !plan.twins)} />
        </div>
        {plan.jester && (
          <SetRow title={<b className="text-[14px]">🤡 يفوز المهرّج إن أُقصي ابتداءً من الجولة</b>}
            sub={plan.jesterRound <= 1 ? 'في أيّ جولة' : `${ar(plan.jesterRound)} = يفوز إن أقصته المدينة بعد الجولة ${ar(plan.jesterRound - 1)}`}>
            <Stepper value={plan.jesterRound} min={1} max={5} onChange={(v) => set('jesterRound', v)} />
          </SetRow>
        )}
        {plan.assassin && ex && (
          <>
            <SetRow title={<b className="text-[14px]">🔪 عقود السفّاح</b>} sub="يقتل كلّ ليلة عدا الأولى">
              <Stepper value={plan.contracts} min={2} max={6} onChange={(v) => set('contracts', v)} />
            </SetRow>
            <SetRow title={<b className="text-[14px]">كم سفّاحاً</b>} sub={plan.assassinN > 1 ? 'كرتٌ مكرّر' : 'نسخة واحدة'}>
              <Stepper value={plan.assassinN} min={1} max={2} onChange={(v) => set('assassinN', v)} />
            </SetRow>
            {plan.assassinN > 1 && (
              <Seg value={plan.assassinMode} onChange={(v) => set('assassinMode', v)} options={[
                { v: 'RIVALS', l: '⚔️ متنافسون', sub: 'أوّل من يُكمل يفوز وحده' },
                { v: 'PARTNERS', l: '🤝 شركاء', sub: 'عقودٌ مشتركة' },
              ]} />
            )}
          </>
        )}
      </Section>

      <Section title="أدوار المدينة" aside="ما دام الكرت في اللعبة">
        <SetRow title={<b className="text-[14px]">🎯 كم قنّاصاً</b>} sub={plan.sniperN > 1 ? 'كرتٌ مكرّر' : 'نسخة واحدة'}>
          <Stepper value={plan.sniperN} min={1} max={2} onChange={(v) => set('sniperN', v)} />
        </SetRow>
        {has(Role.MAYOR) && (
          <SetRow title={<b className="text-[14px]">🎩 أصوات العمدة</b>} sub="وزن صوته بعد أن يكشف نفسه">
            <Stepper value={plan.mayor} min={2} max={4} onChange={(v) => set('mayor', v)} />
          </SetRow>
        )}
        {has(Role.PHOENIX) && (
          <SetRow title={<b className="text-[14px]">🔥 مرّات بعث العنقاء</b>} sub="من مدّ يده إليها ليلاً احترق ونهضت">
            <Stepper value={plan.phoenix} min={1} max={3} onChange={(v) => set('phoenix', v)} />
          </SetRow>
        )}
        {has(Role.NURSE) && (
          <>
            <Hint><b className="text-[#efe8da]">🏥 حين يخرج الطبيب</b> — يُحسم الآن، فلا يُسأل في الليل</Hint>
            <Seg value={plan.nurseAuto ? 'auto' : 'off'} onChange={(v) => set('nurseAuto', v === 'auto')} options={[
              { v: 'auto', l: 'الممرّضة تحمي بدله' },
              { v: 'off', l: 'بلا حماية' },
            ]} />
          </>
        )}
      </Section>

      <Section title="اللعبة">
        <Hint><b className="text-[#efe8da]">⏱️ مدّة اللعبة</b>{timerLocked ? ' — تُضبط في اللوبي، وأثناء اللعب من شريط المؤقّت' : ''}</Hint>
        {timerLocked
          ? <Hint>{plan.minutes ? `${ar(plan.minutes)} دقيقة` : 'بلا مؤقّت'}</Hint>
          : <Seg value={plan.minutes} onChange={(v) => set('minutes', v)} options={[30, 40, 50, 60, 0].map((m) => ({ v: m, l: m ? ar(m) : 'بلا' }))} />}
        <SetRow title={<b className="text-[14px]">⚖️ العقوبات المسموحة</b>} sub="عند بلوغها يخرج اللاعب">
          <Stepper value={plan.penalties} min={1} max={10} onChange={(v) => set('penalties', v)} />
        </SetRow>
        <Hint><b className="text-[#efe8da]">🌙 نظام الليل</b> — يُحسم مرّةً للّعبة كلّها، ولا يُسأل كلّ ليلة</Hint>
        <Seg value={plan.nightKind} onChange={(v) => set('nightKind', v)} options={[
          { v: 'one', l: 'آليّ — الليلة الواحدة', sub: 'اللاعبون يرسلون من هواتفهم' },
          { v: 'queue', l: 'يدويّ — الطابور', sub: 'تمرّ على الأدوار بنفسك' },
        ]} />
        {plan.nightKind === 'one' && (
          <SetRow title={<b className="text-[14px]">مهلة الليلة</b>} sub="بعدها تُفتح المراجعة تلقائيّاً">
            <Stepper value={plan.nightSecs} min={30} max={180} step={15} unit="ث" onChange={(v) => set('nightSecs', v)} />
          </SetRow>
        )}
      </Section>

      <details className="group rounded-2xl border border-[#2a241c] bg-[#0e0c0a]">
        <summary className="flex min-h-[50px] cursor-pointer list-none items-center gap-2 px-3 font-bold [&::-webkit-details-marker]:hidden">
          إعدادات أخرى
          <span className="ms-auto text-[12.5px] font-medium text-[#9a8f7e]">{plan.bomb && plan.chat && plan.conf && plan.reveal ? 'كلّها مفعّلة' : 'فيها مطفأ'} ▾</span>
        </summary>
        <div className="border-t border-[#2a241c] px-3 pb-2">
          <SetRow title="💣 قنبلة شيخ المافيا"><Switch label="قنبلة شيخ المافيا" checked={plan.bomb} onChange={(v) => set('bomb', v)} /></SetRow>
          <SetRow title="💬 غرفة تشاور المافيا" sub="داخل مفكّرة التحرّي"><Switch label="غرفة تشاور المافيا" checked={plan.chat} onChange={(v) => set('chat', v)} /></SetRow>
          <SetRow title="⚔️ مواجهة النهار"><Switch label="مواجهة النهار" checked={plan.conf} onChange={(v) => set('conf', v)} /></SetRow>
          <SetRow title="👁️ تعارف المافيا" sub="يرى المافيا بعضهم عند كشف الكروت"><Switch label="تعارف المافيا" checked={plan.reveal} onChange={(v) => set('reveal', v)} /></SetRow>
          <SetRow title="♟️ أقصى مافيا متتالية للّاعب" sub="لا يأخذها عشوائيّاً بعد هذا العدد · ٠ = بلا حدّ">
            <Stepper value={plan.consec} min={0} max={5} onChange={(v) => set('consec', v)} />
          </SetRow>
          <SetRow title="عدد التبريرات"><Stepper value={plan.just} min={1} max={5} onChange={(v) => set('just', v)} /></SetRow>
        </div>
      </details>
    </>
  );
}

export const roleAr = (r: string) => ROLE_NAMES[r as Role] || r;
