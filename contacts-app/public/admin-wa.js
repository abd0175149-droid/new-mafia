// واتساب في لوحة الإدارة: فحص الأرقام يدوياً، وقوالب الرسائل، والإرسال المتتالي عبر تطبيق واتساب، والسجل.
// لا يُرسل شيء آلياً: كل رسالة تُفتح في واتساب جاهزة، ويضغط الأدمن "إرسال" بنفسه ثم يسجّل النتيجة هنا.

import { fileColumns, recipientValues, renderMessage, templateTokens, waLink, waFormat, BUILTINS } from './template.js';

let ctx; // { el, api, post, toast, when, badge }
export function initWa(c) { ctx = c; }

const WA = {
  yes: ['له واتساب', 'ok'],
  no: ['ليس عليه واتساب', 'bad'],
};
const MSG = {
  sent: ['أُرسلت', 'ok'],
  skipped: ['تُخطّيت', 'muted'],
  no_whatsapp: ['ليس على واتساب', 'bad'],
};

let templatesCache = null;
async function getTemplates(force) {
  if (!templatesCache || force) templatesCache = await ctx.api('/api/admin/wa/templates');
  return templatesCache;
}

function local(e164 = '') {
  return e164.startsWith('+962') ? `0${e164.slice(4, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : e164;
}

// ───────────── تبويب "واتساب" في صفحة الملف ─────────────

let tab = null; // حالة التبويب المفتوح
let keyHandler = null, focusHandler = null;

function detach() {
  if (keyHandler) removeEventListener('keydown', keyHandler);
  if (focusHandler) { removeEventListener('focus', focusHandler); document.removeEventListener('visibilitychange', focusHandler); }
  keyHandler = focusHandler = null;
}

export async function renderWaTab(body, detail) {
  const { el } = ctx;
  detach();
  if (!detail.contacts) {
    body.replaceChildren(el('div', { class: 'empty-state' }, 'لا توجد جهات محفوظة لهذا الملف بعد.'));
    return;
  }
  body.replaceChildren(el('div', { class: 'muted', style: 'padding:24px' }, 'جارٍ التحميل…'));
  const [state, templates] = await Promise.all([ctx.api(`/api/admin/uploads/${encodeURIComponent(detail.id)}/wa`), getTemplates()]);
  const columns = fileColumns(detail);
  const recipients = detail.contacts.filter((c) => c.status !== 'excluded' && c.phones?.length).map((c) => ({
    c, values: recipientValues(detail, c, columns), phoneIdx: 0,
  }));
  let savedPrefs = {};
  try { savedPrefs = JSON.parse(localStorage.getItem('wa-tab') || '{}'); } catch { /* ignore */ }
  tab = {
    detail, recipients, numbers: state.numbers, messages: state.messages, templates,
    mode: savedPrefs.mode || 'check', templateId: savedPrefs.templateId && templates.some((t) => t.id === savedPrefs.templateId) ? savedPrefs.templateId : templates[0]?.id || null,
    filter: 'todo', active: null, opened: null, body,
  };
  for (const r of recipients) {
    // إن لم يكن الرقم الأول على واتساب والثاني موجود، يُستهدف الثاني.
    if (tab.numbers[r.c.phones[0]]?.status === 'no' && r.c.phones[1]) r.phoneIdx = 1;
  }
  keyHandler = onKey;
  focusHandler = () => { if (!document.hidden && tab?.opened) drawPending(); };
  addEventListener('keydown', keyHandler);
  addEventListener('focus', focusHandler);
  document.addEventListener('visibilitychange', focusHandler);
  draw();
}

const phoneOf = (r) => r.c.phones[r.phoneIdx] || r.c.phones[0];
const template = () => tab.templates.find((t) => t.id === tab.templateId) || null;
const message = (r) => renderMessage(template()?.body || '', r.values);
const lastMsg = (r) => tab.messages.find((m) => m.phone === phoneOf(r) && (!tab.templateId || m.template_id === tab.templateId));
function isDone(r) {
  const n = tab.numbers[phoneOf(r)];
  if (tab.mode === 'check') return !!n;
  return n?.status === 'no' || !!lastMsg(r);
}

const FILTERS = {
  todo: ['لم يُنجز', (r) => !isDone(r)],
  all: ['الكل', () => true],
  yes: ['له واتساب', (r) => tab.numbers[phoneOf(r)]?.status === 'yes'],
  no: ['ليس عليه', (r) => tab.numbers[phoneOf(r)]?.status === 'no'],
  sent: ['أُرسلت', (r) => lastMsg(r)?.status === 'sent'],
};

function savePrefs() {
  try { localStorage.setItem('wa-tab', JSON.stringify({ mode: tab.mode, templateId: tab.templateId })); } catch { /* ignore */ }
}

function draw() {
  const { el, badge } = ctx;
  const t = tab;
  const counts = { yes: 0, no: 0, unknown: 0 };
  for (const r of t.recipients) counts[t.numbers[phoneOf(r)]?.status || 'unknown']++;
  const sentCount = t.recipients.filter((r) => lastMsg(r)?.status === 'sent').length;
  const done = t.recipients.filter(isDone).length;
  const pct = t.recipients.length ? Math.round((done / t.recipients.length) * 100) : 0;

  // ملخص
  const summary = el('div', { class: 'wa-summary' },
    el('div', { class: 'wa-progress' }, el('div', { class: 'wa-progress-bar' }, el('span', { style: `width:${pct}%` })),
      el('span', {}, `${done} من ${t.recipients.length} ${t.mode === 'check' ? 'فُحص' : 'أُنجز'}`)),
    el('div', { class: 'badges' }, badge('ok', `${counts.yes} له واتساب`), badge('bad', `${counts.no} ليس عليه`),
      badge('muted', `${counts.unknown} لم يُفحص`), t.mode === 'send' ? badge('ok', `${sentCount} رسالة أُرسلت`) : null));

  // الوضع والقالب
  const modeChips = el('div', { class: 'chips' },
    el('button', { type: 'button', class: t.mode === 'check' ? 'on' : '', onclick: () => { t.mode = 'check'; savePrefs(); draw(); } }, 'فحص الأرقام فقط'),
    el('button', { type: 'button', class: t.mode === 'send' ? 'on' : '', onclick: () => { t.mode = 'send'; savePrefs(); draw(); } }, 'إرسال رسالة'));
  let tplBox = null;
  if (t.mode === 'send') {
    if (!t.templates.length) {
      tplBox = el('div', { class: 'note' }, 'لا توجد قوالب بعد. ', el('a', { href: '#/whatsapp', class: 'link' }, 'أنشئ قالباً'), ' ثم ارجع هنا.');
    } else {
      const sel = el('select', { 'aria-label': 'القالب' }, t.templates.map((x) => el('option', { value: x.id, selected: x.id === t.templateId }, x.name)));
      sel.onchange = () => { t.templateId = sel.value; savePrefs(); draw(); };
      const tokens = templateTokens(template()?.body);
      const known = new Set([...BUILTINS, ...fileColumns(t.detail).map((c) => c.key)]);
      const unknown = tokens.filter((k) => !known.has(k));
      const emptyRows = t.recipients.filter((r) => message(r).empty.length).length;
      tplBox = el('div', { class: 'wa-template' },
        el('label', { class: 'field' }, el('span', {}, 'القالب'), sel),
        el('a', { href: `#/whatsapp?t=${encodeURIComponent(t.templateId || '')}&f=${encodeURIComponent(t.detail.id)}`, class: 'link' }, 'تحرير القوالب ←'),
        unknown.length ? el('div', { class: 'note bad' }, `متغيرات غير موجودة في هذا الملف وستبقى كما هي في الرسالة: ${unknown.map((k) => `{${k}}`).join('، ')}`) : null,
        emptyRows ? el('div', { class: 'note' }, `${emptyRows} رسالة فيها متغير فارغ لهذا الطالب. راجعها في المعاينة أو أضف بديلاً: {اسم العمود|بديل}`) : null);
    }
  }

  const filterChips = el('div', { class: 'chips' }, Object.entries(FILTERS).map(([k, [label]]) =>
    el('button', { type: 'button', class: t.filter === k ? 'on' : '', onclick: () => { t.filter = k; draw(); } }, label)));
  const next = t.recipients.find((r) => !isDone(r));
  const start = el('button', { type: 'button', class: 'btn primary small', disabled: !next || (t.mode === 'send' && !template()),
    onclick: () => { if (next) openRecipient(next); } }, next ? (t.mode === 'check' ? 'ابدأ الفحص المتتالي' : 'ابدأ الإرسال المتتالي') : 'اكتمل الملف ✓');
  const help = el('p', { class: 'muted small' }, t.mode === 'check'
    ? 'يفتح كل رقم في واتساب: إن فُتحت المحادثة فالرقم عليه واتساب، وإن ظهرت رسالة أن الرقم غير صالح فليس عليه. ارجع هنا وسجّل النتيجة. اختصارات: Enter فتح · Y نعم · N لا · S تخطٍّ'
    : 'يفتح كل طالب في واتساب والرسالة مكتوبة جاهزة؛ اضغط إرسال في واتساب ثم ارجع هنا وسجّل. اختصارات: Enter فتح · Y أُرسلت · N ليس على واتساب · S تخطٍّ');

  const list = t.recipients.filter(FILTERS[t.filter][1]);
  const rows = el('div', { class: 'wa-list' }, list.length ? list.map(row) : el('div', { class: 'empty-state' }, 'لا شيء هنا.'));

  t.body.replaceChildren(summary, el('div', { class: 'wa-controls' }, modeChips, tplBox, el('div', { class: 'wa-actions' }, start, filterChips)), help, rows,
    el('div', { id: 'waPending' }));
  if (t.opened) drawPending();
}

function row(r) {
  const { el, badge, when } = ctx;
  const t = tab;
  const phone = phoneOf(r);
  const n = t.numbers[phone];
  const m = lastMsg(r);
  const msg = t.mode === 'send' && template() ? message(r) : null;
  const isActive = t.active === r;
  const actions = t.mode === 'check'
    ? [el('button', { type: 'button', class: 'btn ghost small', onclick: () => openRecipient(r) }, 'افتح في واتساب'),
      el('button', { type: 'button', class: 'btn restore small', title: 'له واتساب (Y)', onclick: () => mark(r, 'yes') }, '✓ له'),
      el('button', { type: 'button', class: 'btn danger small', title: 'ليس عليه (N)', onclick: () => mark(r, 'no') }, '✗ ليس عليه')]
    : [el('button', { type: 'button', class: 'btn primary small', disabled: !template(), onclick: () => openRecipient(r) }, m?.status === 'sent' ? 'إرسال مرة أخرى' : 'افتح وأرسل'),
      el('button', { type: 'button', class: 'btn ghost small', title: 'نسخ الرسالة', onclick: () => copy(msg?.text || '') }, 'نسخ')];
  const node = el('div', { class: `wa-row${isActive ? ' active' : ''}${isDone(r) ? ' done' : ''}`, 'data-phone': phone },
    el('div', { class: 'wa-who' },
      el('div', { class: 'wa-name', dir: 'auto' }, r.values['الاسم الكامل'] || r.c.name),
      el('div', { class: 'wa-phone' }, local(phone), r.c.phones[1] ? el('button', { type: 'button', class: 'link-btn', onclick: () => { r.phoneIdx = r.phoneIdx ? 0 : 1; draw(); } },
        `الرقم ${r.phoneIdx ? 'الأول' : 'الثاني'}`) : null)),
    el('div', { class: 'badges' },
      n ? badge(WA[n.status][1], WA[n.status][0], `${when(n.checked_at)}${n.method === 'sent' ? ' · ثبت بالإرسال' : ''}`) : badge('muted', 'لم يُفحص'),
      m ? badge(MSG[m.status][1], `${MSG[m.status][0]}${m.template_name && !t.templateId ? ` · ${m.template_name}` : ''}`, when(m.created_at)) : null),
    el('div', { class: 'wa-row-actions' }, actions),
    msg ? el('details', { class: 'wa-preview' }, el('summary', {}, msg.empty.length ? `معاينة الرسالة · فارغ: ${msg.empty.join('، ')}` : 'معاينة الرسالة'),
      el('div', { class: 'wa-bubble', dir: 'auto' }, waFormat(msg.text))) : null);
  return node;
}

function openRecipient(r) {
  const t = tab;
  const text = t.mode === 'send' ? message(r).text : '';
  t.active = r;
  t.opened = { r, at: Date.now(), text };
  window.open(waLink(phoneOf(r), text), '_blank', 'noopener');
  draw();
  document.querySelector(`.wa-row[data-phone="${CSS.escape(phoneOf(r))}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function drawPending() {
  const { el } = ctx;
  const box = document.getElementById('waPending');
  const t = tab;
  if (!box || !t?.opened) { box?.replaceChildren(); return; }
  const r = t.opened.r;
  const name = r.values['الاسم الكامل'] || r.c.name;
  box.replaceChildren(el('div', { class: 'wa-pending' },
    el('div', {}, el('b', {}, t.mode === 'check' ? 'هل الرقم على واتساب؟ ' : 'هل أرسلت الرسالة؟ '), el('span', { dir: 'auto' }, name), ` · ${local(phoneOf(r))}`),
    el('div', { class: 'wa-pending-actions' },
      t.mode === 'check'
        ? [el('button', { type: 'button', class: 'btn restore small', onclick: () => mark(r, 'yes') }, 'نعم (Y)'),
          el('button', { type: 'button', class: 'btn danger small', onclick: () => mark(r, 'no') }, 'لا (N)')]
        : [el('button', { type: 'button', class: 'btn restore small', onclick: () => logMessage(r, 'sent') }, 'أُرسلت (Y)'),
          el('button', { type: 'button', class: 'btn danger small', onclick: () => logMessage(r, 'no_whatsapp') }, 'ليس على واتساب (N)')],
      el('button', { type: 'button', class: 'btn ghost small', onclick: () => (t.mode === 'check' ? skip() : logMessage(r, 'skipped')) }, 'تخطٍّ (S)'),
      el('button', { type: 'button', class: 'btn ghost small', onclick: () => openRecipient(r) }, 'افتح مرة أخرى'))));
}

function advance(r) {
  const t = tab;
  const i = t.recipients.indexOf(r);
  const next = [...t.recipients.slice(i + 1), ...t.recipients.slice(0, i)].find((x) => !isDone(x));
  t.opened = null;
  t.active = next || null;
  draw();
  if (next) document.querySelector(`.wa-row[data-phone="${CSS.escape(phoneOf(next))}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function skip() { if (tab.opened) advance(tab.opened.r); }

async function mark(r, status) {
  const phone = phoneOf(r);
  const res = await ctx.post('/api/admin/wa/check', { phone, status, upload_id: tab.detail.id });
  tab.numbers[phone] = { phone, status, method: 'manual', checked_at: res.checked_at };
  if (status === 'no' && r.phoneIdx === 0 && r.c.phones[1] && !tab.numbers[r.c.phones[1]]) {
    r.phoneIdx = 1;
    ctx.toast('الرقم الأول ليس على واتساب؛ انتقلنا إلى الرقم الثاني لهذا الطالب.');
    tab.opened = null; tab.active = r; draw();
    return;
  }
  advance(r);
}

async function logMessage(r, status) {
  const t = tab;
  const phone = phoneOf(r);
  const tpl = template();
  const body = t.opened?.r === r ? t.opened.text : message(r).text;
  const res = await ctx.post('/api/admin/wa/messages', {
    upload_id: t.detail.id, phone, name: r.values['الاسم الكامل'] || r.c.name, template_id: tpl?.id, template_name: tpl?.name, body, status,
  });
  t.messages.unshift({ id: res.id, phone, status, template_id: tpl?.id, template_name: tpl?.name, body, created_at: res.created_at });
  if (status !== 'skipped') t.numbers[phone] = { phone, status: status === 'sent' ? 'yes' : 'no', method: status === 'sent' ? 'sent' : 'manual', checked_at: res.created_at };
  if (status === 'no_whatsapp' && r.phoneIdx === 0 && r.c.phones[1] && !t.numbers[r.c.phones[1]]) {
    r.phoneIdx = 1;
    ctx.toast('الرقم الأول ليس على واتساب؛ جرّب الرقم الثاني لهذا الطالب.');
    t.opened = null; t.active = r; draw();
    return;
  }
  advance(r);
}

function onKey(e) {
  if (!tab || document.getElementById('detailView')?.hidden || !document.querySelector('.wa-list')) return;
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const r = tab.opened?.r || tab.active || tab.recipients.find((x) => !isDone(x));
  if (!r) return;
  if (k === 'enter') { e.preventDefault(); openRecipient(r); return; }
  if (!tab.opened) return;
  if (k === 'y' || k === 'غ') { e.preventDefault(); tab.mode === 'check' ? mark(r, 'yes') : logMessage(r, 'sent'); }
  else if (k === 'n' || k === 'ى') { e.preventDefault(); tab.mode === 'check' ? mark(r, 'no') : logMessage(r, 'no_whatsapp'); }
  else if (k === 's' || k === 'س') { e.preventDefault(); tab.mode === 'check' ? skip() : logMessage(r, 'skipped'); }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); ctx.toast('نُسخت الرسالة.'); } catch { ctx.toast('تعذّر النسخ.'); }
}

export function leaveWaTab() { detach(); tab = null; }

// ───────────── صفحة "واتساب": القوالب والسجل ─────────────

let page = { sub: 'templates', editing: null, sample: null, sampleIdx: 0 };

export async function loadWaPage(container, params) {
  detach();
  const { el } = ctx;
  if (params.get('t')) { page.sub = 'templates'; page.editing = params.get('t'); }
  if (params.get('f')) page.sampleFile = params.get('f');
  const subTabs = el('div', { class: 'tabs-line' },
    el('button', { type: 'button', class: page.sub === 'templates' ? 'on' : '', onclick: () => { page.sub = 'templates'; loadWaPage(container, new URLSearchParams()); } }, 'قوالب الرسائل'),
    el('button', { type: 'button', class: page.sub === 'log' ? 'on' : '', onclick: () => { page.sub = 'log'; loadWaPage(container, new URLSearchParams()); } }, 'سجل الإرسال'));
  const holder = el('div');
  container.replaceChildren(el('div', { class: 'page-head' }, el('h1', {}, 'واتساب')), subTabs, holder);
  if (page.sub === 'log') return drawLog(holder);
  return drawTemplates(holder);
}

async function drawTemplates(holder) {
  const { el, api, post, toast } = ctx;
  const [templates, uploads] = await Promise.all([getTemplates(true), api('/api/admin/uploads')]);
  const files = uploads.filter((u) => u.saved_at && !u.excluded_at);
  if (!page.sampleFile || !files.some((f) => f.id === page.sampleFile)) page.sampleFile = files[0]?.id || null;
  if (page.sampleFile && page.sample?.id !== page.sampleFile) {
    page.sample = await api(`/api/admin/uploads/${encodeURIComponent(page.sampleFile)}`);
    page.sampleIdx = 0;
  }
  const current = templates.find((x) => x.id === page.editing) || null;
  if (!page.draft || page.draft.forId !== (current?.id || null)) {
    page.draft = { forId: current?.id || null, id: current?.id || null, name: current?.name || '', body: current?.body ?? 'السلام عليكم {الاسم الأول}،\n\n' };
  }
  const draft = page.draft;

  const list = el('div', { class: 'tpl-list' },
    el('button', { type: 'button', class: `tpl-item${!current ? ' on' : ''}`, onclick: () => { page.editing = null; page.draft = null; drawTemplates(holder); } }, '＋ قالب جديد'),
    templates.map((x) => el('button', { type: 'button', class: `tpl-item${x.id === page.editing ? ' on' : ''}`, onclick: () => { page.editing = x.id; page.draft = null; drawTemplates(holder); } },
      el('b', {}, x.name), el('span', { class: 'muted small' }, x.body.slice(0, 60)))));

  const name = el('input', { type: 'text', value: draft.name, placeholder: 'اسم القالب، مثل: ترحيب بالشعبة', maxlength: 120 });
  const body = el('textarea', { rows: 10, dir: 'auto', maxlength: 4000 });
  body.value = draft.body;
  const insert = (token) => {
    const s = body.selectionStart ?? body.value.length, e = body.selectionEnd ?? s;
    body.value = body.value.slice(0, s) + token + body.value.slice(e);
    body.focus(); body.selectionStart = body.selectionEnd = s + token.length;
    draft.body = body.value;
    preview();
  };
  const columns = page.sample ? fileColumns(page.sample) : [];
  const chips = el('div', { class: 'tpl-tokens' },
    el('div', { class: 'muted small' }, 'حقول جاهزة'),
    el('div', { class: 'chips' }, BUILTINS.map((k) => el('button', { type: 'button', onclick: () => insert(`{${k}}`) }, k))),
    el('div', { class: 'muted small', style: 'margin-top:8px' }, page.sample ? `أعمدة ملف المعاينة (${page.sample.file_name})` : 'لا يوجد ملف للمعاينة'),
    el('div', { class: 'chips' }, columns.map((c) => el('button', { type: 'button', title: `العمود ${c.col}`, onclick: () => insert(`{${c.key}}`) }, c.key))));

  const fileSel = el('select', { 'aria-label': 'ملف المعاينة' }, files.map((f) => el('option', { value: f.id, selected: f.id === page.sampleFile }, `${f.file_name} · ${f.prefix || ''}`)));
  fileSel.onchange = () => { page.sampleFile = fileSel.value; drawTemplates(holder); };
  const people = (page.sample?.contacts || []).filter((c) => c.status !== 'excluded' && c.phones?.length);
  const who = el('span', { class: 'muted small' });
  const bubble = el('div', { class: 'wa-bubble', dir: 'auto' });
  const warn = el('div');
  const nav = (d) => { page.sampleIdx = (page.sampleIdx + d + people.length) % people.length; preview(); };

  function preview() {
    const p = people[page.sampleIdx];
    if (!p) { bubble.replaceChildren('لا يوجد طالب للمعاينة.'); return; }
    const r = renderMessage(body.value, recipientValues(page.sample, p, columns));
    who.textContent = `${page.sampleIdx + 1} من ${people.length}: ${p.full || p.name}`;
    bubble.replaceChildren(waFormat(r.text || ' '));
    warn.replaceChildren(
      r.missing.length ? el('div', { class: 'note bad' }, `غير موجود في هذا الملف: ${r.missing.map((k) => `{${k}}`).join('، ')}`) : '',
      r.empty.length ? el('div', { class: 'note' }, `فارغ لهذا الطالب: ${r.empty.map((k) => `{${k}}`).join('، ')} — أضف بديلاً هكذا: {${r.empty[0]}|بديل}`) : '');
  }
  body.addEventListener('input', () => { draft.body = body.value; preview(); });
  name.addEventListener('input', () => { draft.name = name.value; });

  const saveBtn = el('button', { type: 'button', class: 'btn primary small', onclick: async () => {
    if (!name.value.trim() || !body.value.trim()) { toast('اكتب اسم القالب ونصّه.'); return; }
    const saved = await post('/api/admin/wa/templates', { id: draft.id, name: name.value, body: body.value });
    page.editing = saved.id;
    page.draft = null;
    templatesCache = null;
    toast('حُفظ القالب.');
    drawTemplates(holder);
  } }, 'حفظ القالب');
  const delBtn = current ? el('button', { type: 'button', class: 'btn danger small', onclick: async () => {
    if (!confirm(`حذف القالب "${current.name}"؟ السجل السابق يبقى كما هو.`)) return;
    await api(`/api/admin/wa/templates/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
    page.editing = null; page.draft = null; templatesCache = null;
    toast('حُذف القالب.');
    drawTemplates(holder);
  } }, 'حذف') : null;

  holder.replaceChildren(el('div', { class: 'tpl-layout' },
    el('aside', { class: 'panel tpl-side' }, el('div', { class: 'panel-head' }, el('h2', {}, 'القوالب')), list),
    el('section', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('h2', {}, current ? 'تحرير القالب' : 'قالب جديد')),
      el('label', { class: 'field' }, el('span', {}, 'اسم القالب'), name),
      el('label', { class: 'field' }, el('span', {}, 'نص الرسالة'), body),
      el('p', { class: 'muted small' }, 'اضغط على أي حقل لإدراجه مكان المؤشر. للتنسيق في واتساب: *عريض* _مائل_ ~مشطوب~. وللقيمة البديلة إن كانت الخلية فارغة: {اسم العمود|بديل}'),
      chips,
      el('div', { class: 'tpl-buttons' }, saveBtn, delBtn)),
    el('section', { class: 'panel tpl-preview' },
      el('div', { class: 'panel-head' }, el('h2', {}, 'المعاينة')),
      files.length ? el('label', { class: 'field' }, el('span', {}, 'ملف المعاينة'), fileSel) : el('p', { class: 'muted' }, 'لا يوجد ملف محفوظ للمعاينة بعد.'),
      el('div', { class: 'tpl-nav' }, el('button', { type: 'button', class: 'icon-btn', onclick: () => nav(1), 'aria-label': 'التالي' }, '›'), who,
        el('button', { type: 'button', class: 'icon-btn', onclick: () => nav(-1), 'aria-label': 'السابق' }, '‹')),
      el('div', { class: 'wa-chat' }, bubble), warn)));
  preview();
}

async function drawLog(holder) {
  const { el, api, when, badge } = ctx;
  const rows = await api('/api/admin/wa/messages');
  let filter = 'all', q = '';
  const tbody = el('tbody');
  const count = el('span', { class: 'count' });
  const draw = () => {
    const list = rows.filter((m) => (filter === 'all' || m.status === filter)
      && (!q || `${m.name} ${m.phone} ${m.body} ${m.file_name} ${m.template_name}`.includes(q)));
    count.textContent = `${list.length} سجل`;
    tbody.replaceChildren(...(list.length ? list.map((m) => el('tr', {},
      el('td', { class: 'num' }, when(m.created_at)),
      el('td', { dir: 'auto' }, m.name || ''), el('td', { class: 'num' }, local(m.phone)),
      el('td', {}, badge(MSG[m.status]?.[1] || 'muted', MSG[m.status]?.[0] || m.status)),
      el('td', {}, m.template_name || '—'),
      el('td', { class: 'wrap' }, m.upload_id ? el('a', { class: 'link', href: `#/u/${m.upload_id}` }, m.file_name || m.upload_id) : '—'),
      el('td', { class: 'wrap' }, m.body ? el('details', { class: 'wa-preview' }, el('summary', {}, m.body.split('\n')[0].slice(0, 50)),
        el('div', { class: 'wa-bubble', dir: 'auto' }, waFormat(m.body))) : '—')))
      : [el('tr', {}, el('td', { colspan: 7, class: 'muted', style: 'text-align:center;padding:32px' }, 'لا يوجد سجل بعد.'))]));
  };
  const search = el('input', { class: 'search', type: 'search', placeholder: 'بحث بالاسم أو الرقم أو النص' });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); draw(); }, 200); });
  const chips = el('div', { class: 'chips' }, [['all', 'الكل'], ['sent', 'أُرسلت'], ['no_whatsapp', 'ليس على واتساب'], ['skipped', 'تُخطّيت']].map(([k, label]) =>
    el('button', { type: 'button', class: k === filter ? 'on' : '', onclick: (e) => {
      filter = k; e.target.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target)); draw();
    } }, label)));
  holder.replaceChildren(
    el('p', { class: 'muted small' }, 'كل رسالة سجّلتها من تبويب واتساب في صفحات الملفات: متى، ولمن، وبأي قالب، والنص النهائي كما فُتح في واتساب.'),
    el('div', { class: 'toolbar' }, search, chips, count),
    el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['الوقت', 'المستلم', 'الرقم', 'الحالة', 'القالب', 'الملف', 'الرسالة'].map((h) => el('th', {}, h)))), tbody)));
  draw();
}
