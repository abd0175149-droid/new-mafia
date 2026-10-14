// شاشة "الإرسال والمتابعة": اختر الملف والقالب، ثم أرسل لطلابه واحداً واحداً عبر واتساب، وسجّل من ردّ.
// الموقع لا يرسل شيئاً آلياً: كل رسالة تُفتح في واتساب جاهزة، والأدمن يضغط الإرسال بنفسه.

import { fileColumns, recipientValues, renderMessage, templateTokens, waLink, waFormat, BUILTINS } from './template.js';
import { OUTCOME, PROBLEM, local } from './wa-shared.js';

let ctx; // { el, api, post, toast, when, badge }
export function initSend(c) { ctx = c; }

let S = null;          // حالة الشاشة
let keyHandler = null;

const CHECK = '';      // قيمة "بدون رسالة: فحص الأرقام فقط" في قائمة القوالب

// الحالة الموحّدة لكل طالب (في وضع الإرسال: بالنسبة للقالب المختار)
const STATES = {
  pending: ['لم يُرسل', 'muted'],
  awaiting: ['بانتظار الرد', 'warn'],
  replied: ['تم الرد', 'ok'],
  no_reply: ['لم يرد', 'warn'],
  problem: ['مشكلة', 'bad'],
  skipped: ['تُخطّي', 'muted'],
  // وضع الفحص
  unchecked: ['لم يُفحص', 'muted'],
  has_wa: ['له واتساب', 'ok'],
  no_wa: ['لا واتساب', 'bad'],
};

const SEND_FILTERS = [
  ['all', 'الكل'], ['pending', 'لم يُرسل'], ['awaiting', 'بانتظار الرد'], ['replied', 'تم الرد'],
  ['no_reply', 'لم يرد'], ['problem', 'مشكلة'], ['skipped', 'تُخطّي'],
];
const CHECK_FILTERS = [['all', 'الكل'], ['unchecked', 'لم يُفحص'], ['has_wa', 'له واتساب'], ['no_wa', 'لا واتساب']];

function prefs(update) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('send-prefs') || '{}'); } catch { /* ignore */ }
  if (update) { p = { ...p, ...update }; try { localStorage.setItem('send-prefs', JSON.stringify(p)); } catch { /* ignore */ } }
  return p;
}

export function leaveSend() {
  if (keyHandler) removeEventListener('keydown', keyHandler);
  keyHandler = null;
  S = null;
}

// ───────────── التحميل ─────────────

export async function loadSendView(container, params) {
  const { el, api } = ctx;
  leaveSend();
  container.replaceChildren(el('div', { class: 'muted', style: 'padding:24px' }, 'جارٍ التحميل…'));
  const [uploads, templates] = await Promise.all([api('/api/admin/uploads'), api('/api/admin/wa/templates')]);
  const files = uploads.filter((u) => u.saved_at && !u.excluded_at);
  if (!files.length) {
    container.replaceChildren(el('div', { class: 'empty-state' }, 'لا يوجد ملف محفوظ بعد. ارفع شيت الطلاب واحفظه من صفحة الرفع أولاً.'));
    return;
  }
  const p = prefs();
  const fileId = [params.get('f'), p.f, files[0].id].find((id) => id && files.some((f) => f.id === id));
  const tParam = params.has('t') ? params.get('t') : p.t;
  const templateId = tParam === CHECK ? CHECK : [tParam, templates[0]?.id].find((id) => id && templates.some((t) => t.id === id)) ?? CHECK;
  prefs({ f: fileId, t: templateId });

  const [detail, wa] = await Promise.all([api(`/api/admin/uploads/${encodeURIComponent(fileId)}`), api(`/api/admin/uploads/${encodeURIComponent(fileId)}/wa`)]);
  const columns = fileColumns(detail);
  const recipients = (detail.contacts || []).filter((c) => c.status !== 'excluded' && c.phones?.length).map((c) => {
    const values = recipientValues(detail, c, columns);
    const r = { c, values, phoneIdx: 0 };
    r.hay = [...Object.values(values), ...c.phones, ...c.phones.map(local)].join(' ').toLowerCase();
    return r;
  });
  S = {
    container, files, templates, detail, columns, recipients, numbers: wa.numbers, messages: wa.messages,
    fileId, templateId, filter: 'all', q: '', opened: null, shown: 60,
  };
  for (const r of recipients) if (S.numbers[r.c.phones[0]]?.status === 'no' && r.c.phones[1]) r.phoneIdx = 1;
  keyHandler = onKey;
  addEventListener('keydown', keyHandler);
  render();
}

// ───────────── المنطق ─────────────

const isCheck = () => S.templateId === CHECK;
const template = () => S.templates.find((t) => t.id === S.templateId) || null;
const phoneOf = (r) => r.c.phones[r.phoneIdx] || r.c.phones[0];
const nameOf = (r) => [r.values['اللقب'], r.values['الاسم الكامل'] || r.c.name].filter(Boolean).join(' ');
const message = (r) => renderMessage(template()?.body || '', r.values);
const msgsOf = (r) => S.messages.filter((m) => m.phone === phoneOf(r));
const sentMsg = (r) => msgsOf(r).find((m) => m.status === 'sent' && m.template_id === S.templateId);

function stateOf(r) {
  const n = S.numbers[phoneOf(r)];
  if (isCheck()) return n ? (n.status === 'yes' ? 'has_wa' : 'no_wa') : 'unchecked';
  const sent = sentMsg(r);
  if (sent) {
    if (!sent.outcome) return 'awaiting';
    if (sent.outcome === 'replied') return 'replied';
    if (sent.outcome === 'no_reply') return 'no_reply';
    return PROBLEM.has(sent.outcome) ? 'problem' : 'awaiting';
  }
  const mine = msgsOf(r).filter((m) => m.template_id === S.templateId);
  if (n?.status === 'no' || mine.some((m) => m.status === 'no_whatsapp')) return 'problem';
  if (mine.some((m) => m.status === 'skipped')) return 'skipped';
  return 'pending';
}
const isTodo = (r) => (isCheck() ? stateOf(r) === 'unchecked' : stateOf(r) === 'pending');
const nextTodo = (after) => {
  const list = S.recipients;
  const i = after ? list.indexOf(after) : -1;
  return [...list.slice(i + 1), ...list.slice(0, i + 1)].find(isTodo) || null;
};

function visible() {
  const q = S.q.trim().toLowerCase();
  return S.recipients.filter((r) => (S.filter === 'all' || stateOf(r) === S.filter) && (!q || r.hay.includes(q)));
}

// ───────────── العرض ─────────────

function render() {
  const { el } = ctx;
  if (!S) return;
  const tpl = template();
  const counts = {};
  for (const r of S.recipients) { const st = stateOf(r); counts[st] = (counts[st] || 0) + 1; }
  const total = S.recipients.length;

  // 1) الإعداد: الملف والرسالة
  const fileSel = el('select', { 'aria-label': 'الملف' }, S.files.map((f) => el('option', { value: f.id, selected: f.id === S.fileId },
    `${f.prefix || f.file_name} · ${f.count_ready + f.count_warn} طالب`)));
  fileSel.onchange = () => { location.hash = `#/whatsapp/send?f=${encodeURIComponent(fileSel.value)}&t=${encodeURIComponent(S.templateId)}`; };
  const tplSel = el('select', { 'aria-label': 'الرسالة' },
    S.templates.map((t) => el('option', { value: t.id, selected: t.id === S.templateId }, t.name)),
    el('option', { value: CHECK, selected: isCheck() }, 'بدون رسالة — فحص الأرقام فقط'));
  tplSel.onchange = () => { location.hash = `#/whatsapp/send?f=${encodeURIComponent(S.fileId)}&t=${encodeURIComponent(tplSel.value)}`; };
  let warn = null;
  if (tpl) {
    const known = new Set([...BUILTINS, ...S.columns.map((c) => c.key)]);
    const unknown = templateTokens(tpl.body).filter((k) => !known.has(k));
    const emptyFor = S.recipients.filter((r) => message(r).empty.length).length;
    if (unknown.length) warn = el('div', { class: 'send-warn bad' }, `⚠ غير موجود في هذا الملف: ${unknown.map((k) => `{${k}}`).join('، ')}`);
    else if (emptyFor) warn = el('div', { class: 'send-warn' }, `⚠ ${emptyFor} رسالة فيها حقل فارغ (اضغط على الطالب لمعاينة رسالته)`);
  }
  const setup = el('section', { class: 'send-setup' },
    el('label', { class: 'field' }, el('span', {}, 'الملف'), fileSel),
    el('label', { class: 'field' }, el('span', {}, 'الرسالة'), tplSel),
    el('div', { class: 'send-links' },
      tpl ? el('a', { class: 'link', href: `#/whatsapp/templates?t=${encodeURIComponent(tpl.id)}&f=${encodeURIComponent(S.fileId)}` }, 'تعديل الرسالة') : null,
      el('a', { class: 'link', href: `#/whatsapp/templates?t=new&f=${encodeURIComponent(S.fileId)}` }, '＋ رسالة جديدة')),
    warn);

  // 2) التقدّم
  const done = isCheck() ? total - (counts.unchecked || 0) : total - (counts.pending || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const progress = el('div', { class: 'send-progress' },
    el('div', { class: 'send-progress-text' },
      el('b', {}, isCheck() ? `فُحص ${done} من ${total}` : `أُرسل ${done} من ${total}`),
      isCheck() ? null : el('span', {}, `ردّ ${counts.replied || 0} · بانتظار ${counts.awaiting || 0}`)),
    el('div', { class: 'wa-progress-bar' }, el('span', { style: `width:${pct}%` })));

  // 3) البحث والفلترة
  const search = el('input', { class: 'search', type: 'search', value: S.q, placeholder: 'ابحث بالاسم أو الرقم أو التخصص أو المدرسة…', 'aria-label': 'بحث' });
  search.addEventListener('input', () => { S.q = search.value; S.shown = 60; drawList(); });
  const chips = el('div', { class: 'chips' }, (isCheck() ? CHECK_FILTERS : SEND_FILTERS).map(([k, label]) =>
    el('button', { type: 'button', class: S.filter === k ? 'on' : '', onclick: () => { S.filter = k; S.shown = 60; render(); } },
      label, el('span', { class: 'chip-n' }, k === 'all' ? total : counts[k] || 0))));

  const list = el('div', { class: 'send-list', id: 'sendList' });
  S.container.replaceChildren(setup, progress, el('div', { class: 'send-tools' }, search, chips), list, el('div', { id: 'sendBar' }));
  drawList();
  drawBar();
}

function drawList() {
  const { el, badge } = ctx;
  const box = document.getElementById('sendList');
  if (!box) return;
  const rows = visible();
  const shown = rows.slice(0, S.shown);
  box.replaceChildren(...(shown.length ? shown.map((r) => {
    const st = stateOf(r);
    const [label, cls] = STATES[st];
    let action = null;
    if (isCheck() && st === 'unchecked') action = ['افحص', () => openWa(r)];
    else if (!isCheck() && (st === 'pending' || st === 'skipped')) action = ['أرسل', () => openWa(r)];
    else if (!isCheck() && st === 'awaiting') action = ['سجّل الرد', () => openSheet(r, true)];
    const sub = [local(phoneOf(r)), r.values.specialty || r.values['التخصص'] || ''].filter(Boolean).join(' · ');
    const row = el('div', { class: `srow${S.opened?.r === r ? ' active' : ''}`, role: 'button', tabindex: '0' },
      el('div', { class: 'srow-main' }, el('div', { class: 'srow-name', dir: 'auto' }, nameOf(r)), el('div', { class: 'srow-sub' }, sub)),
      // إما فعل مطلوب (الحالة مفهومة منه) أو شارة الحالة النهائية — لا الاثنان معاً
      action ? el('button', { type: 'button', class: `btn small ${action[0] === 'سجّل الرد' ? 'ghost' : 'primary'}`, onclick: (e) => { e.stopPropagation(); action[1](); } }, action[0])
        : badge(cls, label));
    row.onclick = () => openSheet(r);
    row.onkeydown = (e) => { if (e.key === 'Enter' && e.target === row) openSheet(r); };
    return row;
  }) : [el('div', { class: 'empty-state' }, S.q ? 'لا نتائج لهذا البحث.' : 'لا أحد في هذه الفئة.')]),
  rows.length > shown.length ? el('button', { type: 'button', class: 'btn ghost', onclick: () => { S.shown += 60; drawList(); } }, `عرض المزيد (${rows.length - shown.length})`) : '');
}

/** الشريط السفلي: إما سؤال "هل أرسلت؟" بعد فتح واتساب، أو زر "أرسل للتالي". */
function drawBar() {
  const { el } = ctx;
  const bar = document.getElementById('sendBar');
  if (!bar) return;
  if (S.opened) {
    const r = S.opened.r;
    bar.replaceChildren(el('div', { class: 'send-bar ask' },
      el('div', { class: 'send-bar-q' }, isCheck() ? 'هل الرقم على واتساب؟' : 'هل أرسلت الرسالة؟', el('b', { dir: 'auto' }, nameOf(r))),
      el('div', { class: 'send-bar-actions' },
        el('button', { type: 'button', class: 'btn restore', onclick: () => record(r, isCheck() ? 'yes' : 'sent') }, isCheck() ? '✓ نعم' : '✓ أُرسلت'),
        el('button', { type: 'button', class: 'btn danger', onclick: () => record(r, 'no_whatsapp') }, 'لا واتساب'),
        el('button', { type: 'button', class: 'btn ghost', onclick: () => record(r, 'skipped') }, 'تخطٍّ'),
        el('button', { type: 'button', class: 'btn ghost icon-only', title: 'افتح مرة أخرى', onclick: () => openWa(r) }, '↻'))));
    return;
  }
  const next = nextTodo();
  if (!next || (!isCheck() && !template())) { bar.replaceChildren(); return; }
  bar.replaceChildren(el('div', { class: 'send-bar' },
    el('div', { class: 'send-bar-q' }, 'التالي', el('b', { dir: 'auto' }, nameOf(next))),
    el('button', { type: 'button', class: 'btn primary', onclick: () => openWa(next) }, isCheck() ? 'افحص في واتساب ➤' : 'أرسل في واتساب ➤')));
}

// ───────────── الأفعال ─────────────

function openWa(r) {
  const text = isCheck() ? '' : message(r).text;
  S.opened = { r, text };
  window.open(waLink(phoneOf(r), text), '_blank', 'noopener');
  drawList();
  drawBar();
}

/** تسجيل نتيجة الطالب المفتوح ثم الانتقال تلقائياً للتالي. status: sent | yes | no_whatsapp | skipped */
async function record(r, status) {
  const { post, toast } = ctx;
  const phone = phoneOf(r);
  try {
    if (isCheck()) {
      if (status === 'skipped') { S.opened = null; drawList(); drawBar(); return; }
      const res = await post('/api/admin/wa/check', { phone, status: status === 'yes' ? 'yes' : 'no', upload_id: S.fileId });
      S.numbers[phone] = { phone, status: status === 'yes' ? 'yes' : 'no', method: 'manual', checked_at: res.checked_at };
    } else {
      const tpl = template();
      const body = S.opened?.r === r ? S.opened.text : message(r).text;
      const res = await post('/api/admin/wa/messages', { upload_id: S.fileId, phone, name: nameOf(r), template_id: tpl?.id, template_name: tpl?.name, body, status });
      S.messages.unshift({ id: res.id, upload_id: S.fileId, phone, name: nameOf(r), template_id: tpl?.id, template_name: tpl?.name, body, status, created_at: res.created_at });
      if (status !== 'skipped') S.numbers[phone] = { phone, status: status === 'sent' ? 'yes' : 'no', method: status === 'sent' ? 'sent' : 'manual', checked_at: res.created_at };
    }
  } catch {
    toast('تعذّر الحفظ. تحقق من الاتصال وأعد المحاولة.');
    return;
  }
  S.opened = null;
  // الرقم الأول ليس على واتساب ويوجد رقم ثانٍ لم يُجرَّب: يُعرض الثاني لنفس الطالب
  if (status === 'no_whatsapp' && r.phoneIdx === 0 && r.c.phones[1] && !S.numbers[r.c.phones[1]]) {
    r.phoneIdx = 1;
    toast('الرقم الأول ليس على واتساب؛ جرّب رقمه الثاني.');
  }
  render();
}

function onKey(e) {
  if (!S?.opened || e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'y' || k === 'غ') { e.preventDefault(); record(S.opened.r, isCheck() ? 'yes' : 'sent'); }
  else if (k === 'n' || k === 'ى') { e.preventDefault(); record(S.opened.r, 'no_whatsapp'); }
  else if (k === 's' || k === 'س') { e.preventDefault(); record(S.opened.r, 'skipped'); }
}

// ───────────── بطاقة الطالب: الرسالة والمتابعة والسجل ─────────────

function openSheet(r, focusFollowUp) {
  const { el, post, toast, when, badge } = ctx;
  const dlg = el('dialog', { class: 'dialog send-sheet' });
  const st = stateOf(r);
  const sent = isCheck() ? null : sentMsg(r);
  const msg = !isCheck() && template() ? message(r) : null;
  const n = S.numbers[phoneOf(r)];

  // المتابعة (للرسالة المرسلة بهذا القالب)
  let follow = null;
  if (sent) {
    let choice = sent.outcome || '';
    const note = el('textarea', { rows: 2, maxlength: 2000, placeholder: 'ملاحظة (اختياري)' });
    note.value = sent.outcome_note || '';
    const opts = el('div', { class: 'chips wrap' }, Object.entries(OUTCOME).map(([k, [label]]) =>
      el('button', { type: 'button', class: choice === k ? 'on' : '', onclick: (e) => {
        choice = choice === k ? '' : k;
        opts.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget && !!choice));
      } }, label)));
    const save = el('button', { type: 'button', class: 'btn primary small', onclick: async () => {
      try {
        const res = await post(`/api/admin/wa/messages/${encodeURIComponent(sent.id)}/outcome`, { outcome: choice, note: note.value.trim() });
        Object.assign(sent, { outcome: res.outcome, outcome_note: res.outcome_note, outcome_at: res.outcome_at });
        if (res.outcome === 'replied') S.numbers[sent.phone] = { phone: sent.phone, status: 'yes', method: 'manual', checked_at: res.outcome_at };
        if (res.outcome === 'no_whatsapp') S.numbers[sent.phone] = { phone: sent.phone, status: 'no', method: 'manual', checked_at: res.outcome_at };
        toast('✓ حُفظت المتابعة');
        dlg.close();
        render();
      } catch { toast('تعذّر حفظ المتابعة.'); }
    } }, 'حفظ المتابعة');
    follow = el('section', { class: 'sheet-section', id: 'followUp' },
      el('h3', {}, 'هل ردّ؟'), opts, note,
      el('div', { class: 'sheet-row' }, el('span', { class: 'muted small' }, `أُرسلت ${when(sent.created_at)}`), save));
  }

  const history = msgsOf(r);
  dlg.append(el('div', { class: 'sheet-head' },
    el('div', {}, el('h2', { dir: 'auto' }, nameOf(r)),
      el('div', { class: 'sheet-phones' }, r.c.phones.map((p, i) => el('a', { class: `ltr phone-link${i === r.phoneIdx ? ' on' : ''}`, href: `tel:${p}` }, local(p))))),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => dlg.close() }, '✕')),
  el('div', { class: 'badges' }, badge(...STATES[st].slice().reverse()), n ? badge(n.status === 'yes' ? 'ok' : 'bad', n.status === 'yes' ? 'له واتساب' : 'لا واتساب') : null),
  // نص الرسالة مطوي: سطر مختصر، ويُفتح كاملاً عند الضغط
  msg ? el('details', { class: 'sheet-section msg-fold' },
    el('summary', {}, el('span', { class: 'msg-fold-title' }, template().name), el('span', { class: 'msg-fold-snippet', dir: 'auto' }, msg.text.replace(/\s*\n+\s*/g, ' '))),
    el('div', { class: 'wa-chat' }, el('div', { class: 'wa-bubble', dir: 'auto' }, waFormat(msg.text)))) : null,
  msg?.empty.length ? el('div', { class: 'note' }, `فارغ: ${msg.empty.join('، ')}`) : null,
  el('div', { class: 'sheet-actions' },
    el('button', { type: 'button', class: 'btn primary', onclick: () => { dlg.close(); openWa(r); } },
      isCheck() ? 'افحص في واتساب' : sent ? 'إرسال مرة أخرى' : 'أرسل في واتساب'),
    msg ? el('button', { type: 'button', class: 'btn ghost', onclick: async () => {
      try { await navigator.clipboard.writeText(msg.text); toast('نُسخت الرسالة.'); } catch { toast('تعذّر النسخ.'); }
    } }, 'نسخ الرسالة') : null),
  follow,
  history.length ? el('section', { class: 'sheet-section' }, el('h3', {}, 'السجل'),
    el('ul', { class: 'sheet-history' }, history.map((m) => el('li', {},
      el('span', { class: 'ltr muted small' }, when(m.created_at)), ' ',
      el('b', {}, m.template_name || '—'), ' · ',
      { sent: 'أُرسلت', skipped: 'تُخطّيت', no_whatsapp: 'لا واتساب' }[m.status] || m.status,
      m.outcome ? ` · ${OUTCOME[m.outcome]?.[0] || m.outcome}` : '',
      m.outcome_note ? el('div', { class: 'muted small' }, `📝 ${m.outcome_note}`) : null)))) : null);
  dlg.onclose = () => dlg.remove();
  document.body.append(dlg);
  dlg.showModal();
  if (focusFollowUp) dlg.querySelector('#followUp')?.scrollIntoView({ block: 'start' });
}
