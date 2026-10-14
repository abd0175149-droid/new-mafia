// قوالب رسائل واتساب: متغيرات من أعمدة شيت الإكسل نفسه لكل طالب.
//   {اسم العمود}         قيمة العمود في صف الطالب (بعنوانه كما في الشيت)
//   {اسم العمود|بديل}    البديل إن كانت الخلية فارغة
// وحقول جاهزة: {الاسم الأول} {اسم العائلة} {الاسم الكامل} {الاسم في الهاتف} {الرقم} {الشعبة}

import { splitFullName, cleanName, cleanCell, colIndex, normalizeText } from './core.js';

export const BUILTINS = ['الاسم الأول', 'اسم العائلة', 'الاسم الكامل', 'الاسم في الهاتف', 'الرقم', 'الشعبة'];

const TOKEN_RE = /\{([^{}\n]{1,80})\}/g;

/** أعمدة الملف كمتغيرات: المفتاح عنوان العمود، ويُلحق به حرفه إن تكرر العنوان. */
export function fileColumns(detail) {
  const headers = (detail.analysis?.headers || []).filter((h) => cleanCell(h.label));
  const seen = {};
  for (const h of headers) { const k = normalizeText(h.label); seen[k] = (seen[k] || 0) + 1; }
  return headers.map((h) => {
    const label = cleanCell(h.label);
    return { col: h.col, label, key: seen[normalizeText(label)] > 1 ? `${label} (${h.col})` : label };
  });
}

function sheetRow(detail, rowNum) {
  const sheet = (detail.sheets || []).find((s) => s.name === detail.sheet_name) || (detail.sheets || [])[0];
  return sheet?.grid?.[rowNum - 1] || [];
}

function localPhone(e164 = '') {
  return e164.startsWith('+962') ? '0' + e164.slice(4) : e164;
}

/** كل قيم المتغيرات لطالب واحد (جهة اتصال من الملف). */
export function recipientValues(detail, contact, columns = fileColumns(detail)) {
  const row = sheetRow(detail, contact.rowNum);
  const values = {};
  for (const c of columns) values[c.key] = cleanCell(row[colIndex(c.col)] ?? '');
  const m = detail.analysis?.mapping || {};
  const cell = (letter) => (letter && !Array.isArray(letter) ? cleanName(row[colIndex(letter)] ?? '') : '');
  const split = splitFullName(contact.full || '');
  values['الاسم الكامل'] = contact.full || contact.name || '';
  values['الاسم الأول'] = cell(m.first) || split.first;
  values['اسم العائلة'] = cell(m.last) || split.last;
  values['الاسم في الهاتف'] = contact.name || '';
  values['الرقم'] = localPhone(contact.phones?.[0]);
  values['الشعبة'] = detail.prefix || '';
  return values;
}

/** يملأ القالب. missing: متغيرات غير معروفة في هذا الملف، empty: متغيرات قيمتها فارغة بلا بديل. */
export function renderMessage(body, values) {
  const missing = new Set(), empty = new Set();
  const text = String(body || '').replace(TOKEN_RE, (whole, inner) => {
    const [rawKey, ...rest] = inner.split('|');
    const key = rawKey.trim();
    const fallback = rest.length ? rest.join('|').trim() : null;
    if (!(key in values)) { missing.add(key); return whole; }
    const v = String(values[key] ?? '').trim();
    if (v) return v;
    if (fallback !== null) return fallback;
    empty.add(key);
    return '';
  });
  return { text: text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim(), missing: [...missing], empty: [...empty] };
}

/** المتغيرات المستخدمة في القالب (لعرض التحذيرات قبل البدء). */
export function templateTokens(body) {
  return [...new Set([...String(body || '').matchAll(TOKEN_RE)].map((m) => m[1].split('|')[0].trim()))];
}

export function waLink(e164, text) {
  const digits = String(e164 || '').replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** تنسيق واتساب للمعاينة: *عريض* _مائل_ ~مشطوب~ — يعيد عُقد DOM لا HTML. */
export function waFormat(text, doc = globalThis.document) {
  const frag = doc.createDocumentFragment();
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  for (const line of String(text).split('\n').flatMap((l, i, a) => (i < a.length - 1 ? [l, '\n'] : [l]))) {
    if (line === '\n') { frag.append(doc.createElement('br')); continue; }
    let last = 0;
    for (const m of line.matchAll(re)) {
      if (m.index > last) frag.append(line.slice(last, m.index));
      const tag = { '*': 'b', _: 'i', '~': 's' }[m[0][0]];
      const e = doc.createElement(tag);
      e.textContent = m[0].slice(1, -1);
      frag.append(e);
      last = m.index + m[0].length;
    }
    if (last < line.length) frag.append(line.slice(last));
  }
  return frag;
}
