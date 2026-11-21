// ══════════════════════════════════════════════════════
// 🔢 محاكاة الأزرار والقوائم على رقم الأعمال
// ══════════════════════════════════════════════════════
// whatsapp-web.js لا يعرض أزرار ميتا ولا قوائمها. فيُرسم كلّ interactive نصّاً مرقّماً،
// وتُحفظ خريطة الأرقام في الخادم، ثمّ يُترجم ردّ العميل («1» أو «١» أو «1️⃣» أو العنوان)
// إلى interactive.button_reply/list_reply **كأنّ ميتا أرسلته** — فيبقى كلّ معالجٍ في البوت
// (lastInboundButtonId، فرض res_confirm، أدوات الأدمن، استعلامات الجودة) كما هو حرفيّاً.
//
// الأمان: المعرّف يأتي من حالة الخادم لا من العميل (لا يستطيع أن «يخترع» res_confirm:…)،
// والقائمة الأحدث تلغي الأقدم، وكلّ خيارٍ يُستهلك مرّة، والمعرّفات الحسّاسة تنتهي بعد ١٠ دقائق.

import { normalizeAnyPhone } from '../../utils/phone.util.js';

export interface MenuItem { n: number; id: string; title: string; description?: string }
/** labels: نصوص خيارات الاستفتاء بالترتيب (حين أُرسلت القائمة استفتاءً) — الصوت يعود بنصّ الخيار */
export interface MenuState { kind: 'button' | 'list'; items: MenuItem[]; msgId: string | null; at: number; labels?: string[] }

const MENU_TTL_MS = 24 * 3600e3;                 // القائمة العاديّة تبقى يوماً (مثل aux)
const SENSITIVE_TTL_MS = 10 * 60e3;              // عمر خبيئة الأدمن adm-* نفسه
const SENSITIVE = /^(res_confirm|pwd_confirm|reg_ok|cancelc|adm|grp_ok|wl_take|admin)/;

const KEYCAPS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const num = (n: number) => (n <= 10 ? KEYCAPS[n] : `${n}.`);

/** مفتاح المحادثة الموحَّد (07… أو lid:…) — الإرسال يعرف الرقم المحلّيّ والوارد يعرف الدوليّ */
export function menuKey(phoneOrKey: string): string {
  const s = String(phoneOrKey || '');
  if (s.startsWith('lid:')) return s;
  return normalizeAnyPhone(s)?.local || s;
}

/** يرسم كائن interactive (أزرار أو قائمة) نصّاً مرقّماً، ويعيد خريطة الأرقام */
export function renderInteractive(interactive: any): { text: string; menu: Omit<MenuState, 'msgId' | 'at'> | null } {
  const i = interactive || {};
  const lines: string[] = [];
  const header = i.header?.text ? String(i.header.text).trim() : '';
  const body = adaptForTextMenus(String(i.body?.text || '').trim());
  const footer = String(i.footer?.text || '').trim();
  if (header) lines.push(`*${header}*`);
  if (body) lines.push(body);
  const items: MenuItem[] = [];
  let kind: 'button' | 'list' = 'button';

  if (i.type === 'button' && Array.isArray(i.action?.buttons)) {
    const opts: string[] = [];
    for (const b of i.action.buttons) {
      const r = b?.reply || b;
      if (!r?.id) continue;
      const n = items.length + 1;
      items.push({ n, id: String(r.id), title: String(r.title || '') });
      opts.push(`${num(n)} ${r.title || ''}`);
    }
    if (opts.length) lines.push('', ...opts);
  } else if (i.type === 'list' && Array.isArray(i.action?.sections)) {
    kind = 'list';
    const multi = i.action.sections.length > 1;
    for (const sec of i.action.sections) {
      const rows = Array.isArray(sec?.rows) ? sec.rows : [];
      if (!rows.length) continue;
      lines.push('');
      if (sec.title && (multi || !body)) lines.push(`▫️ *${String(sec.title).trim()}*`);
      for (const r of rows) {
        if (!r?.id) continue;
        const n = items.length + 1;
        items.push({ n, id: String(r.id), title: String(r.title || ''), ...(r.description ? { description: String(r.description) } : {}) });
        lines.push(`${num(n)} ${r.title || ''}${r.description ? `\n      ${r.description}` : ''}`);
      }
    }
  }
  if (items.length) lines.push('', '↩️ اكتب رقم اختيارك');
  if (footer) lines.push('', `_${footer}_`);
  return { text: lines.join('\n').trim(), menu: items.length ? { kind, items } : null };
}

// ══════════════════════════════════════════════════════
// 📊 الاستفتاء بدل القائمة المرقّمة (خطّة التوحيد م١ج، معتمد 2026-11-21)
// ══════════════════════════════════════════════════════
// رقم الأعمال لا يعرض أزرار ميتا، فكلّ رسالة خياراتٍ (حتّى ١٢ خياراً) تصل استفتاءً يضغطه
// العميل. الصوت يعود من البوّابة حدثاً (poll.vote) فيُترجم إلى button_reply/list_reply من
// الخريطة نفسها المحفوظة على الخادم — فلا يتغيّر معالجٌ في البوت. كلّ خيارٍ يبدأ برقمه،
// فالردّ بكتابة الرقم يبقى يعمل كما اليوم.
export const POLL_MAX_OPTIONS = 12;
const POLL_NAME_MAX = 255;
const POLL_OPTION_MAX = 100;

export interface PollPlan {
  /** نصٌّ يُرسل قبل الاستفتاء حين لا يتّسع له سؤاله */
  pre: string | null;
  name: string;
  options: string[];
  multi: boolean;
  menu: Omit<MenuState, 'msgId' | 'at'>;
  /** النصّ المرقّم نفسه — للعرض في الوارد وللرجوع إليه إن رفضت البوّابة الاستفتاء */
  fallbackText: string;
}

/** يحوّل interactive إلى خطّة استفتاء، أو null إن لم يصلح (أقلّ من خيارين أو أكثر من ١٢) */
export function renderPoll(interactive: any): PollPlan | null {
  const base = renderInteractive(interactive);
  const items = base.menu?.items || [];
  if (items.length < 2 || items.length > POLL_MAX_OPTIONS) return null;
  const i = interactive || {};
  const header = i.header?.text ? String(i.header.text).trim() : '';
  const body = adaptForTextMenus(String(i.body?.text || '').trim(), 'poll');
  const full = [header ? `*${header}*` : '', body].filter(Boolean).join('\n');
  let pre: string | null = null;
  let name = full;
  if (!full || full.length > POLL_NAME_MAX) {
    // السؤال آخر فقرةٍ قصيرة («أثبّت؟»)، والباقي رسالةٌ قبله
    const k = full.lastIndexOf('\n\n');
    const tail = k >= 0 ? full.slice(k + 2).trim() : '';
    if (tail && tail.length <= 120 && !tail.includes('\n')) { pre = full.slice(0, k).trim(); name = tail; }
    else { pre = full || null; name = String(i.action?.button || '').trim() || 'اختار:'; }
  }
  const seen = new Set<string>();
  const options = items.map((it) => {
    let lab = `${num(it.n)} ${it.title}`.trim();
    if (it.description && lab.length + it.description.length + 3 <= POLL_OPTION_MAX) lab += ` · ${it.description}`;
    lab = lab.slice(0, POLL_OPTION_MAX);
    while (seen.has(lab)) lab = (lab + '\u200E').slice(0, POLL_OPTION_MAX + 1);   // لا يتكرّر نصّان
    seen.add(lab);
    return lab;
  });
  return {
    pre, name: name.slice(0, POLL_NAME_MAX), options, multi: false,
    menu: { kind: base.menu!.kind, items, labels: options },
    fallbackText: base.text,
  };
}

const stripKeycap = (s: string) => String(s || '').replace(/^\s*(?:[0-9]️?⃣|🔟|\d+\.)+\s*/u, '');

export type PollVoteOutcome =
  | { status: 'apply'; msg: any }
  | { status: 'first'; title: string }
  | { status: 'old' }
  | { status: 'ignore' };

/**
 * 🗳️ صوتٌ على استفتاء: يُترجم إلى ضغطة زرّ إن كان على القائمة الحيّة، وإلّا:
 *   • استفتاءٌ أُجيب عنه (بصوتٍ أو برقم) ⟵ «اعتمدنا اختيارك الأوّل» مرّةً واحدة
 *   • استفتاءٌ أقدم من آخر قائمة ⟵ «خيارات قديمة» مرّةً واحدة
 *   • سحب الصوت (بلا خيار) ⟵ لا أثر
 */
export async function applyPollVote(phoneOrKey: string, pollMessageId: string, selected: string[], base: { id: string; from: string; timestamp: string }): Promise<PollVoteOutcome> {
  const sel = (selected || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!sel.length || !pollMessageId) return { status: 'ignore' };
  const { getAux, setAux, deleteAux } = await import('../../config/redis.js');
  const key = `wamenu:${menuKey(phoneOrKey)}`;
  const st: MenuState | null = await getAux(key);
  if (st && Array.isArray(st.items) && st.msgId && st.msgId === pollMessageId && Date.now() - st.at <= MENU_TTL_MS) {
    const labels = Array.isArray(st.labels) ? st.labels : [];
    const pick = sel[0];
    let idx = labels.indexOf(pick);
    if (idx < 0) { const t = normTitle(stripKeycap(pick)); idx = st.items.findIndex((x) => normTitle(x.title) === t || normTitle(stripKeycap(labels[st.items.indexOf(x)] || '')) === t); }
    const item = idx >= 0 ? st.items[idx] : undefined;
    if (!item) return { status: 'ignore' };
    await deleteAux(key);
    await setAux(`wapoll:${pollMessageId}`, { title: item.title, at: Date.now() });
    if (SENSITIVE.test(item.id) && Date.now() - st.at > SENSITIVE_TTL_MS) {
      return { status: 'apply', msg: { ...base, type: 'text', text: { body: pick }, _emulated: { expired: true, raw: pick, id: item.id, poll: true } } };
    }
    const replyKey = st.kind === 'list' ? 'list_reply' : 'button_reply';
    return {
      status: 'apply',
      msg: { ...base, type: 'interactive', interactive: { type: replyKey, [replyKey]: { id: item.id, title: item.title, ...(item.description ? { description: item.description } : {}) } },
        _emulated: { raw: pick, n: item.n, poll: true, menuMsgId: st.msgId } },
    };
  }
  const rec = await getAux(`wapoll:${pollMessageId}`);
  if (rec) {
    if (rec.noted) return { status: 'ignore' };
    await setAux(`wapoll:${pollMessageId}`, { ...rec, noted: true });
    return { status: 'first', title: String(rec.title || '') };
  }
  if (await getAux(`wapoll-old:${pollMessageId}`)) return { status: 'ignore' };
  await setAux(`wapoll-old:${pollMessageId}`, 1);
  return { status: 'old' };
}

/**
 * 🧹 صياغةٌ تفترض أزراراً ⟵ صياغةٌ لقائمةٍ مرقّمة (رقم الأعمال فقط). حتميّ، يُطبَّق على نصوص البوت والنظام
 * وعلى نصّ رسائل الخيارات قبل رسمها. شبكةُ أمانٍ خلف تعليمة القناة في موجّه الدون.
 */
export function adaptForTextMenus(text: string, mode: 'numbers' | 'poll' = 'numbers'): string {
  if (!text) return text;
  // 📊 الخيارات تصل استفتاءً يُضغط: «اختار من الاستفتاء» بدل «اكتب رقم الخيار»
  if (mode === 'poll') return String(text)
    .replace(/(?:من|ب|عبر)\s*(?:ال)?(?:أزرار|ازرار|زرار|الأزرار|الازرار)\s*(?:اللي\s*|التي\s*)?(?:تحت|بالأسفل|أدناه|ادناه|تحتها|تحته)?/g, 'من الاستفتاء تحت')
    .replace(/اضغط(?:ي|وا)?\s+(?:على\s+)?(?:ال)?زرّ?(?:ار)?\s*/g, 'اختر ')
    .replace(/(?:بكتابة|اكتب)\s+رقم\s+(?:الخيار|اختيارك)/g, 'من الاستفتاء')
    .replace(/(?:ردّ|رد)\s+برقم\s+الخيار/g, 'اختار من الاستفتاء')
    .replace(/من القائمة\s*(فوق|أعلاه|اعلاه|بالأعلى|تحت)/g, 'من الاستفتاء')
    .replace(/من الاستفتاء تحت\s+من الاستفتاء/g, 'من الاستفتاء');
  return String(text)
    // «من الأزرار تحت» · «بالأزرار اللي تحت» · «عبر الأزرار أدناه»
    .replace(/(?:من|ب|عبر)\s*(?:ال)?(?:أزرار|ازرار|زرار|الأزرار|الازرار)\s*(?:اللي\s*|التي\s*)?(?:تحت|بالأسفل|أدناه|ادناه|تحتها|تحته)?/g, 'بكتابة رقم الخيار')
    // «اضغط زرّ «تأكيد الحجز»» · «اضغط على الزر» ⟵ «اكتب رقم «تأكيد الحجز»»
    .replace(/اضغط(?:ي|وا)?\s+(?:على\s+)?(?:ال)?زرّ?(?:ار)?\s*/g, 'اكتب رقم ')
    // «اضغط تراجع» · «اضغطي تأكيد» ⟵ «اختر تراجع»
    .replace(/اضغط(?:ي|وا)?\s+/g, 'اختر ')
    // «من القائمة فوق» ⟵ «بكتابة رقمها من القائمة فوق»
    .replace(/(?<!بكتابة رقمها )من القائمة\s*(فوق|أعلاه|اعلاه|بالأعلى)/g, 'بكتابة رقمها من القائمة $1')
    .replace(/بكتابة رقم الخيار\s+بكتابة رقم الخيار/g, 'بكتابة رقم الخيار');
}

export async function saveMenu(phoneOrKey: string, menu: Omit<MenuState, 'msgId' | 'at'>, msgId: string | null): Promise<void> {
  const { setAux } = await import('../../config/redis.js');
  await setAux(`wamenu:${menuKey(phoneOrKey)}`, { ...menu, msgId, at: Date.now() } satisfies MenuState);
}

// ── المطابقة ──────────────────────────────────────────
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function latin(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, ch => String(Math.max(AR_DIGITS.indexOf(ch), FA_DIGITS.indexOf(ch))));
}
/** «1» · «١» · «1️⃣» · «رقم ١» · «1.» · «الخيار 2» ⟵ رقم، أو null */
export function parseChoiceNumber(text: string): number | null {
  // 🔴 علامات الاتّجاه الخفيّة (RLM/LRM/ALM وعزل الاتّجاه) تضعها لوحات المفاتيح العربيّة قبل الرقم،
  //    و trim لا يحذفها: «‏١» كان لا يُقرأ رقماً (٧ ردود ضاعت في ٣٠ يوماً — خطّة التوحيد م١ج)
  let t = latin(String(text || '').replace(/[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g, '').trim())
    .replace(/[️⃣]/g, '')        // 1️⃣ ⟵ 1
    .replace(/🔟/g, '10')
    .replace(/^(رقم|الرقم|خيار|الخيار|اختيار|option|no\.?)\s*/i, '')
    .replace(/[.)\-–—:،,\s]+$/g, '')
    .trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n > 0 ? n : null;
}
/** تطبيع العنوان للمطابقة: بلا إيموجي ولا تشكيل ولا علامات، وتوحيد ة/ه وأ/إ/آ/ا وى/ي */
export function normTitle(s: string): string {
  return String(s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[\p{Extended_Pictographic}️‍✓✔]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().toLowerCase();
}

/**
 * ✅ كلمةُ موافقةٍ صريحة بدل الرقم — «تأكيد»، «أكّد»، «نعم»، «تمام»… رانيا #686 (2026-11-14) كتبت
 * «تأكيد» بعد بطاقة الحجز فلم تُحسب ضغطةً، وضاع الحجز. تُقبل فقط لبطاقة تأكيد الحجز وضمن عمرها.
 */
const CONFIRM_WORDS = new Set([
  'تاكيد', 'تاكيد الحجز', 'اكد', 'اكد الحجز', 'اكدلي', 'اكيد', 'نعم', 'اه', 'ايوه', 'ايوا', 'تمام', 'تم',
  'ثبت', 'ثبته', 'ثبتلي', 'ثبت الحجز', 'موافق', 'اوك', 'اوكي', 'ok', 'okay', 'yes', 'confirm',
]);
export function isConfirmWord(text: string): boolean {
  return CONFIRM_WORDS.has(normTitle(text.replace(/[\u200E\u200F\u061C]/g, '')));
}
/** «لا» وأخواتها — تُقبل على قائمةٍ من خيارين: نعم/لا (خطّة التوحيد م١ج) */
const NO_WORDS = new Set(['لا', 'لأ', 'لاء', 'لا شكرا', 'لا شكرًا', 'لا شكراً', 'مش هلق', 'مش هلأ', 'بلاش', 'الغاء', 'لا بدي', 'no']);
export function isNoWord(text: string): boolean { return NO_WORDS.has(normTitle(text.replace(/[\u200E\u200F\u061C]/g, ''))); }
const YES_TITLE = /^(نعم|اه|ايوه|تمام|ثبت|اكد|تاكيد|موافق|اكيد|ذكرني|احجز|بدي|اقبل)/;
const NO_TITLE = /^(لا|الغاء|مش|بلاش|شكرا|رجوع)/;

/**
 * إن كانت الرسالة ردّاً على آخر قائمة: تُعاد بشكل interactive كأنّ ميتا أرسلته، ويُحذف السجلّ (استعمالٌ واحد).
 * وإلّا تُعاد كما هي وتبقى القائمة حيّة (قد يسأل العميل سؤالاً ثمّ يختار).
 */
export async function applyMenuReply(phoneOrKey: string, msg: any): Promise<any> {
  if (msg?.type !== 'text') return msg;
  const { getAux, deleteAux } = await import('../../config/redis.js');
  const key = `wamenu:${menuKey(phoneOrKey)}`;
  const st: MenuState | null = await getAux(key);
  if (!st || !Array.isArray(st.items) || !st.items.length) return msg;
  if (Date.now() - st.at > MENU_TTL_MS) { await deleteAux(key); return msg; }

  const raw = String(msg.text?.body || '');
  const quotedMenu = !!(st.msgId && msg.context?.id && msg.context.id === st.msgId);
  const n = parseChoiceNumber(raw);
  let item: MenuItem | undefined = n ? st.items.find(x => x.n === n) : undefined;
  if (!item) {
    const t = normTitle(raw);
    if (t) item = st.items.find(x => normTitle(x.title) === t);
  }
  // ✅ «تأكيد» / «نعم» على بطاقة تأكيد الحجز = خيارها الأوّل (العمر يفحصه شرط الحسّاس أدناه)
  if (!item && isConfirmWord(raw)) item = st.items.find(x => /^res_confirm:/.test(x.id));
  // ✅/✖ «اه» و«لا» على أيّ قائمةٍ من خيارين نعم/لا (التذكير، عرض المقعد…) — لا على بطاقة الحجز وحدها
  if (!item && st.items.length === 2) {
    if (isConfirmWord(raw)) item = st.items.find(x => YES_TITLE.test(normTitle(x.title)));
    else if (isNoWord(raw)) item = st.items.find(x => NO_TITLE.test(normTitle(x.title)));
  }
  if (!item) return msg;
  // المعرّفات الحسّاسة (حجز، كلمة سرّ، أدوات أدمن) لا تُقبل من قائمةٍ قديمة
  if (SENSITIVE.test(item.id) && Date.now() - st.at > SENSITIVE_TTL_MS) {
    await deleteAux(key);
    return { ...msg, _emulated: { expired: true, raw, id: item.id } };
  }
  await deleteAux(key);
  // 📊 أُجيب عن استفتاءٍ بكتابة الرقم ⟵ صوتٌ لاحقٌ عليه يُقال له «اعتمدنا اختيارك الأوّل»
  if (Array.isArray(st.labels) && st.msgId) {
    const { setAux } = await import('../../config/redis.js');
    await setAux(`wapoll:${st.msgId}`, { title: item.title, at: Date.now() });
  }
  const replyKey = st.kind === 'list' ? 'list_reply' : 'button_reply';
  const { text: _t, ...rest } = msg;
  void _t;
  return {
    ...rest,
    type: 'interactive',
    interactive: { type: replyKey, [replyKey]: { id: item.id, title: item.title, ...(item.description ? { description: item.description } : {}) } },
    _emulated: { raw, n: item.n, quoted: quotedMenu, menuMsgId: st.msgId },
  };
}
