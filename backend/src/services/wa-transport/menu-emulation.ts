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
export interface MenuState { kind: 'button' | 'list'; items: MenuItem[]; msgId: string | null; at: number }

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
  const body = String(i.body?.text || '').trim();
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
  let t = latin(String(text || '').trim())
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
  if (!item) return msg;
  // المعرّفات الحسّاسة (حجز، كلمة سرّ، أدوات أدمن) لا تُقبل من قائمةٍ قديمة
  if (SENSITIVE.test(item.id) && Date.now() - st.at > SENSITIVE_TTL_MS) {
    await deleteAux(key);
    return { ...msg, _emulated: { expired: true, raw, id: item.id } };
  }
  await deleteAux(key);
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
