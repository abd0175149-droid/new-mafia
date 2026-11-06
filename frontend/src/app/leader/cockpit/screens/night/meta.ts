// ══════════════════════════════════════════════════════
// 🌙 معاني الليل والصباح — منقولة من LeaderNightView كما هي (العرض والسرّيّة)
// ══════════════════════════════════════════════════════
import { useCallback, useRef, useState } from 'react';
import { roleName } from '../../kit';

/** أيقونة كلّ خطوة ليل — بالدور القديم أو بمعرّف القدرة في المحرّك الديناميكيّ */
export const ACTION_ICON: Record<string, string> = {
  GODFATHER: '🔪', SILENCER: '🤐', SHERIFF: '🔍', DOCTOR: '💉', SNIPER: '🎯', NURSE: '⚕️',
  KILL: '🔪', SILENCE: '🤐', INVESTIGATE: '🔍', PROTECT: '💉', SNIPE: '🎯',
  ASSASSINATE: '🗡️', ASSASSIN: '🗡️', DISABLE_ABILITY: '🔮', WITCH: '🔮', DISABLE: '🔮',
};

export type EvTone = 'm' | 'ok' | 'g' | 'n' | 'c';
/**
 * أحداث الصباح. `displayable: false` = للموجّه وحده (لا يُبثّ للقاعة).
 * 🔴 العنقاء النهضة للموجّه وحده: عرضُها يكشف مقعد العنقاء. والاحتراقُ خروجٌ حقيقيّ يُعرض.
 */
export const EVENT_META: Record<string, { icon: string; title: string; tone: EvTone; displayable: boolean }> = {
  ASSASSINATION:         { icon: '🩸', title: 'اغتيال ناجح',          tone: 'm',  displayable: true },
  ASSASSINATION_BLOCKED: { icon: '🛡️', title: 'حماية ناجحة',          tone: 'ok', displayable: true },
  PROTECTION_FAILED:     { icon: '💔', title: 'حماية فاشلة',          tone: 'n',  displayable: false },
  SILENCED:              { icon: '🤐', title: 'إسكات لاعب',           tone: 'c',  displayable: false },
  SNIPE_MAFIA:           { icon: '🎯', title: 'القنّاص نجح',           tone: 'g',  displayable: true },
  SNIPE_CITIZEN:         { icon: '💀', title: 'القنّاص فشل',           tone: 'm',  displayable: true },
  SHERIFF_RESULT:        { icon: '🔍', title: 'نتيجة التحقيق',        tone: 'g',  displayable: false },
  SHERIFF_REVENGE:       { icon: '🕵️', title: 'ثأر الشريف',           tone: 'g',  displayable: true },
  ASSASSIN_KILL:         { icon: '🔪', title: 'السفّاح اغتال',         tone: 'm',  displayable: true },
  ASSASSIN_BLOCKED:      { icon: '🛡️', title: 'حماية ضدّ السفّاح',     tone: 'ok', displayable: true },
  ABILITY_DISABLED:      { icon: '🔮', title: 'تعطيل قدرة',           tone: 'c',  displayable: true },
  TWIN_SUICIDE:          { icon: '🩸', title: 'انتحار التوأم',         tone: 'm',  displayable: true },
  TWIN_TRANSFORM:        { icon: '🌑', title: 'الصحوة المظلمة',        tone: 'm',  displayable: true },
  PHOENIX_REBIRTH:       { icon: '🔥', title: 'العنقاء نهض من رماده', tone: 'n',  displayable: false },
  PHOENIX_BURN:          { icon: '🔥', title: 'احترق بنار العنقاء',   tone: 'n',  displayable: true },
  PHOENIX_ASH:           { icon: '🜂', title: 'لعنة الرماد',          tone: 'n',  displayable: true },
};
export const eventMeta = (type: string) => EVENT_META[type] || { icon: '❓', title: type, tone: 'g' as EvTone, displayable: true };
/** كما في القديم: النوع المجهول يُعدّ قابلاً للعرض */
export const isDisplayable = (e: any) => EVENT_META[e?.type]?.displayable !== false;

const who = (id: any, name: any) => (id ? `${id} ${name || ''}`.trim() : '');

/** سطر التفاصيل تحت عنوان الحدث (للموجّه) */
export function eventDetail(e: any): string {
  const x = e?.extra || {};
  const t = who(e?.targetPhysicalId, e?.targetName);
  const role = x.targetRole ? ` (${roleName(x.targetRole)})` : '';
  const parts: string[] = [];
  switch (e?.type) {
    case 'ASSASSINATION': parts.push(`${t}${role}`); break;
    case 'ASSASSINATION_BLOCKED':
      parts.push(`${t} — أُنقذ`);
      if (x.assassinName) parts.push(`المغتال ${who(x.assassinId, x.assassinName)}${x.wasAssassinRandom ? ' 🎲' : ''}`);
      break;
    case 'PROTECTION_FAILED': parts.push(`حُمي ${t} والاغتيال على غيره`); break;
    case 'SILENCED': parts.push(`${t} — لا يتكلّم اليوم`); break;
    case 'SNIPE_MAFIA': parts.push(`${t}${role}`); break;
    case 'SNIPE_CITIZEN':
      parts.push(t);
      if (x.sniperName) parts.push(`خرج معه القنّاص ${who(x.sniperPhysicalId, x.sniperName)}`);
      break;
    case 'SHERIFF_RESULT': parts.push(`${t} — ${x.result === 'MAFIA' ? 'مافيا' : 'مواطن'}`); break;
    case 'ASSASSIN_KILL':
      parts.push(`${t}${role}`);
      parts.push(x.contractCompleted ? `✅ عقدٌ مُنجَز${x.contractId ? ` #${x.contractId}` : ''}` : 'لا عقد مطابق لدوره');
      if (x.sharedTarget) {
        const by = [x.alsoKilledByMafia && 'اغتيال المافيا', x.alsoSniped && 'القنص'].filter(Boolean).join(' و');
        parts.push(`هدفٌ مشترك${by ? ` مع ${by}` : ''} — الأولويّة للسفّاح`);
      }
      parts.push(x.assassinWon ? '🎉 أنجز كلّ العقود' : 'مهمّته مستمرّة');
      break;
    case 'ASSASSIN_BLOCKED': parts.push(`${t} — أُنقذ من السفّاح`); break;
    case 'ABILITY_DISABLED': parts.push(`${t} — قدرته معطّلة`); break;
    case 'TWIN_SUICIDE': parts.push(`${t} — بعد موت أخيه الأصغر`); break;
    case 'TWIN_TRANSFORM': parts.push(`${t} — صار مافيا${x.newRoleName ? ` (${x.newRoleName})` : ''}`); break;
    default: if (t) parts.push(`${t}${role}`);
  }
  if (e?.performerPhysicalId) parts.push(`من ${who(e.performerPhysicalId, e.performerName)}`);
  if (e?.wasRandom) parts.push('🎲 تلقائيّ');
  return parts.filter(Boolean).join(' · ');
}

export const WINNER: Record<string, { icon: string; text: string }> = {
  MAFIA: { icon: '🩸', text: 'المافيا انتصرت' },
  ASSASSIN: { icon: '🔪', text: 'انتصار السفّاح' },
  JESTER: { icon: '🤡', text: 'فوز المهرّج' },
  CITIZEN: { icon: '⚖️', text: 'المدينة انتصرت' },
};
export const winnerOf = (w: string) => WINNER[w] || WINNER.CITIZEN;

/** يمنع الضغط المزدوج على فعلٍ يرسل للخادم */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const ref = useRef(false);
  const wrap = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (ref.current) return undefined;
    ref.current = true; setBusy(true);
    try { return await fn(); } finally { ref.current = false; setBusy(false); }
  }, []);
  return { busy, wrap };
}
