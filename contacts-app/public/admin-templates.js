// "الرسائل الجاهزة" (قوالب واتساب) — مصمَّمة للهاتف أولاً:
//   القائمة:  #/whatsapp/templates
//   المحرّر:  #/whatsapp/templates?t=<id>  أو  ?t=new   (و&f=<ملف> لمعاينة طلابه)

import { fileColumns, recipientValues, renderMessage, waFormat, BUILTINS } from './template.js';

let ctx; // { el, api, post, toast, when, badge }
export function initTemplates(c) { ctx = c; }

const DEFAULT_BODY = 'السلام عليكم {اللقب} {الاسم الأول}،\n\n';
const QUICK = ['اللقب', 'الاسم الأول', 'الشعبة'];
const GENDER_WORD = '{ذ/أ: عزيزي|عزيزتي}';

let sample = { fileId: null, detail: null, idx: 0 };
let draft = null; // { forId, name, body } يبقى عند التنقل بين الكتابة والمعاينة

export async function drawTemplatesPage(holder, params) {
  const t = params.get('t');
  if (params.get('f')) sample.fileId = params.get('f');
  if (t) return drawEditor(holder, t === 'new' ? null : t);
  draft = null;
  return drawList(holder);
}

const go = (tid, fileId) => {
  location.hash = `#/whatsapp/templates?t=${encodeURIComponent(tid)}${fileId ? `&f=${encodeURIComponent(fileId)}` : ''}`;
};

// ───────────── القائمة ─────────────

async function drawList(holder) {
  const { el, api, when } = ctx;
  const templates = await api('/api/admin/wa/templates');
  holder.replaceChildren(
    el('a', { class: 'btn primary tpl-new', href: '#/whatsapp/templates?t=new' }, '＋ رسالة جديدة'),
    templates.length
      ? el('div', { class: 'cards' }, templates.map((x) => el('a', { class: 'card-item click tpl-card', href: `#/whatsapp/templates?t=${encodeURIComponent(x.id)}` },
        el('div', { class: 'ci-head' }, el('div', { class: 'ci-title' }, x.name), el('span', { class: 'srow-chev' }, '‹')),
        el('div', { class: 'tpl-snippet', dir: 'auto' }, x.body.replace(/\s*\n+\s*/g, ' ')),
        el('div', { class: 'ci-foot' }, `آخر تعديل ${when(x.updated_at).slice(0, 16)}`))))
      : el('div', { class: 'empty-state' },
        el('p', {}, 'لا توجد رسائل جاهزة بعد.'),
        el('p', { class: 'muted small' }, 'اكتب رسالة مرة واحدة، وتُملأ تلقائياً باسم كل طالب وبياناته عند الإرسال.')));
}

// ───────────── المحرّر ─────────────

async function drawEditor(holder, id) {
  const { el, api, post, toast, when } = ctx;
  const [templates, uploads] = await Promise.all([api('/api/admin/wa/templates'), api('/api/admin/uploads')]);
  const current = id ? templates.find((x) => x.id === id) : null;
  if (id && !current) { location.hash = '#/whatsapp/templates'; return; }
  const files = uploads.filter((u) => u.saved_at && !u.excluded_at);
  if (!files.some((f) => f.id === sample.fileId)) sample.fileId = files[0]?.id || null;
  if (sample.fileId && sample.detail?.id !== sample.fileId) {
    sample.detail = await api(`/api/admin/uploads/${encodeURIComponent(sample.fileId)}`);
    sample.idx = 0;
  }
  const columns = sample.detail ? fileColumns(sample.detail) : [];
  const people = (sample.detail?.contacts || []).filter((c) => c.status !== 'excluded' && c.phones?.length);

  if (!draft || draft.forId !== (current?.id || null)) draft = { forId: current?.id || null, name: current?.name || '', body: current?.body ?? DEFAULT_BODY };
  const isDirty = () => (current ? draft.name.trim() !== current.name.trim() || draft.body !== current.body : !!draft.name.trim() || draft.body !== DEFAULT_BODY);
  let mode = 'write';

  // ── الشريط العلوي: رجوع + الحالة + حفظ
  const state = el('span', { class: 'ed-state' });
  const saveBtn = el('button', { type: 'button', class: 'btn primary small' }, 'حفظ');
  const back = el('a', { class: 'ed-back', href: '#/whatsapp/templates' }, '→ الرسائل');
  back.onclick = (e) => { if (isDirty() && !confirm('في تعديلات غير محفوظة. تخرج بدون حفظ؟')) e.preventDefault(); else draft = null; };
  const top = el('div', { class: 'ed-top' }, back, state, saveBtn);

  // ── الاسم
  const name = el('input', { type: 'text', class: 'ed-name', value: draft.name, placeholder: 'اسم الرسالة (مثل: ترحيب بالشعبة)', maxlength: 120, 'aria-label': 'اسم الرسالة' });

  // ── كتابة | معاينة
  const seg = el('div', { class: 'seg', role: 'tablist' });
  const writePane = el('div', { class: 'ed-pane' });
  const previewPane = el('div', { class: 'ed-pane' });

  // الكتابة
  const body = el('textarea', { class: 'ed-body', dir: 'auto', maxlength: 4000, placeholder: 'اكتب نص الرسالة هنا…', 'aria-label': 'نص الرسالة' });
  body.value = draft.body;
  let caret = body.value.length;
  const keepCaret = () => { caret = body.selectionStart ?? caret; };
  ['keyup', 'click', 'select', 'input', 'blur'].forEach((ev) => body.addEventListener(ev, keepCaret));
  const grow = () => { body.style.height = 'auto'; body.style.height = `${Math.max(180, body.scrollHeight + 2)}px`; };
  const insert = (text) => {
    const v = body.value;
    const at = Math.min(caret, v.length);
    const pad = at > 0 && !/[\s\n]$/.test(v.slice(0, at)) && !text.startsWith(' ') ? ' ' : '';
    body.value = v.slice(0, at) + pad + text + v.slice(at);
    caret = at + pad.length + text.length;
    body.focus();
    body.setSelectionRange(caret, caret);
    changed();
  };
  const wrap = (mark) => {
    const s = body.selectionStart ?? caret, e = body.selectionEnd ?? caret;
    const v = body.value;
    if (e > s) { body.value = v.slice(0, s) + mark + v.slice(s, e) + mark + v.slice(e); caret = e + 2; }
    else { body.value = v.slice(0, s) + mark + mark + v.slice(s); caret = s + 1; }
    body.focus(); body.setSelectionRange(caret, caret);
    changed();
  };
  const toolbar = el('div', { class: 'ed-toolbar' },
    el('button', { type: 'button', class: 'ed-insert', onclick: () => openFieldPicker(columns, insert) }, '＋ إدراج حقل'),
    QUICK.map((k) => el('button', { type: 'button', class: 'ed-chip', onclick: () => insert(`{${k}}`) }, k)),
    el('button', { type: 'button', class: 'ed-chip', title: 'كلمة حسب الجنس', onclick: () => insert(GENDER_WORD) }, 'ذ/أ'),
    el('span', { class: 'ed-sep' }),
    el('button', { type: 'button', class: 'ed-fmt', title: 'عريض', onclick: () => wrap('*') }, el('b', {}, 'B')),
    el('button', { type: 'button', class: 'ed-fmt', title: 'مائل', onclick: () => wrap('_') }, el('i', {}, 'I')));
  const help = el('details', { class: 'how' }, el('summary', {}, 'كيف تعمل الحقول؟'),
    el('ul', {},
      el('li', {}, '«＋ إدراج حقل» يضع مكان المؤشر قيمة من بيانات الطالب، مثل اسمه أو تخصصه أو رقمه الوزاري.'),
      el('li', {}, '{اللقب} يصير «الأستاذ» أو «الأستاذة» حسب الجنس، و{ذ/أ: عزيزي|عزيزتي} يختار الكلمة المناسبة.'),
      el('li', {}, 'إن كانت الخلية فارغة عند طالب: {اسم الحقل|بديل} يضع البديل.'),
      el('li', {}, '*نص* يصير عريضاً و_نص_ مائلاً في واتساب.')));
  writePane.append(body, toolbar, help);

  // المعاينة
  const fileSel = el('select', { 'aria-label': 'معاينة على طلاب ملف' }, files.map((f) => el('option', { value: f.id, selected: f.id === sample.fileId }, `${f.prefix || f.file_name}`)));
  fileSel.onchange = async () => { draft.name = name.value; draft.body = body.value; sample.fileId = fileSel.value; await drawEditor(holder, id); holder.querySelector('.seg button:last-child')?.click(); };
  const who = el('span', { class: 'pv-who' });
  const bubble = el('div', { class: 'wa-bubble', dir: 'auto' });
  const warn = el('div');
  const nav = (d) => { if (!people.length) return; sample.idx = (sample.idx + d + people.length) % people.length; preview(); };
  previewPane.append(
    files.length ? el('div', { class: 'pv-bar' },
      fileSel,
      el('div', { class: 'pv-nav' },
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'السابق', onclick: () => nav(-1) }, '›'),
        who,
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'التالي', onclick: () => nav(1) }, '‹')))
      : el('p', { class: 'muted' }, 'لا يوجد ملف محفوظ للمعاينة بعد.'),
    el('div', { class: 'wa-chat pv-chat' }, bubble), warn);

  function preview() {
    const p = people[sample.idx];
    if (!p) { bubble.replaceChildren('لا يوجد طالب للمعاينة.'); who.textContent = ''; return; }
    const r = renderMessage(body.value, recipientValues(sample.detail, p, columns));
    who.textContent = `${p.full || p.name} (${sample.idx + 1}/${people.length})`;
    bubble.replaceChildren(waFormat(r.text || ' '));
    warn.replaceChildren(
      r.missing.length ? el('div', { class: 'note bad' }, `غير موجود في هذا الملف: ${r.missing.map((k) => `{${k}}`).join('، ')}`) : '',
      r.empty.length ? el('div', { class: 'note' }, `فارغ عند هذا الطالب: ${r.empty.join('، ')}`) : '');
  }

  const tabs = [['write', 'كتابة'], ['preview', 'معاينة']];
  const setMode = (m) => {
    mode = m;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    writePane.hidden = m !== 'write';
    previewPane.hidden = m !== 'preview';
    if (m === 'preview') preview(); else grow();
  };
  tabs.forEach(([m, label]) => seg.append(el('button', { type: 'button', 'data-m': m, onclick: () => setMode(m) }, label)));

  // ── أسفل: إرسال/حذف
  const sendBtn = el('button', { type: 'button', class: 'btn ghost', onclick: () => chooseFile(current, files) }, 'إرسال بهذه الرسالة ←');
  const delBtn = current ? el('button', { type: 'button', class: 'btn danger-link', onclick: async () => {
    if (!confirm(`حذف «${current.name}»؟ سجل الرسائل المرسلة سابقاً يبقى.`)) return;
    try {
      await api(`/api/admin/wa/templates/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
      draft = null; toast('حُذفت الرسالة.');
      location.hash = '#/whatsapp/templates';
    } catch { toast('تعذّر الحذف.'); }
  } }, 'حذف هذه الرسالة') : null;
  const footer = el('div', { class: 'ed-footer' }, current ? sendBtn : null, delBtn);

  function refresh(error) {
    const dirty = isDirty();
    saveBtn.disabled = !dirty && !!current;
    saveBtn.textContent = 'حفظ';
    sendBtn.disabled = dirty;
    if (error) { state.className = 'ed-state bad'; state.textContent = `✗ ${error}`; }
    else if (dirty) { state.className = 'ed-state warn'; state.textContent = current ? '● غير محفوظ' : '● جديدة'; }
    else if (current) { state.className = 'ed-state ok'; state.textContent = `✓ محفوظة ${when(current.updated_at).slice(11, 16)}`; }
    else { state.className = 'ed-state'; state.textContent = ''; }
  }
  function changed() { draft.name = name.value; draft.body = body.value; grow(); refresh(); }
  name.addEventListener('input', changed);
  body.addEventListener('input', changed);

  saveBtn.onclick = async () => {
    if (!name.value.trim()) { refresh('اكتب اسماً للرسالة'); name.focus(); return; }
    if (!body.value.trim()) { refresh('النص فارغ'); setMode('write'); body.focus(); return; }
    saveBtn.disabled = true; saveBtn.textContent = '…';
    try {
      const saved = await post('/api/admin/wa/templates', { id: current?.id, name: name.value, body: body.value });
      draft = null;
      toast(`✓ حُفظت «${saved.name}»`);
      if (!current) go(saved.id, sample.fileId);
      else await drawEditor(holder, saved.id);
    } catch (e) {
      refresh(e.message === 'auth' ? 'انتهت الجلسة، سجّل الدخول' : 'لم تُحفظ — تحقق من الاتصال');
    }
  };

  holder.replaceChildren(el('div', { class: 'editor' }, top, name, seg, writePane, previewPane, footer));
  setMode(mode);
  refresh();
  requestAnimationFrame(grow);
}

/** قائمة الحقول (ورقة سفلية مع بحث). */
function openFieldPicker(columns, insert) {
  const { el } = ctx;
  const dlg = el('dialog', { class: 'dialog field-sheet' });
  const groups = [
    ['حقول جاهزة', BUILTINS.map((k) => [k, `{${k}}`])],
    ['حسب الجنس', [['عزيزي / عزيزتي', GENDER_WORD], ['مدعوّ / مدعوّة', '{ذ/أ: مدعوّ|مدعوّة}']]],
    ['من أعمدة الملف', columns.map((c) => [c.key, `{${c.key}}`])],
  ];
  const q = el('input', { type: 'search', class: 'search', placeholder: 'ابحث عن حقل…', 'aria-label': 'بحث' });
  const list = el('div', { class: 'field-list' });
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    list.replaceChildren(...groups.map(([title, items]) => {
      const shown = items.filter(([label]) => !s || label.toLowerCase().includes(s));
      return shown.length ? el('section', {}, el('h3', {}, title),
        el('div', { class: 'field-grid' }, shown.map(([label, token]) => el('button', { type: 'button', onclick: () => { dlg.close(); insert(token); } }, label)))) : '';
    }));
  };
  q.addEventListener('input', draw);
  dlg.append(el('div', { class: 'sheet-head' }, el('h2', {}, 'إدراج حقل'),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => dlg.close() }, '✕')), q, list);
  dlg.onclose = () => dlg.remove();
  document.body.append(dlg);
  draw();
  dlg.showModal();
}

/** اختيار الملف ثم فتح شاشة الإرسال بهذه الرسالة. */
function chooseFile(tpl, files) {
  const { el } = ctx;
  if (!tpl) return;
  const dlg = el('dialog', { class: 'dialog' });
  dlg.append(el('div', { class: 'sheet-head' }, el('h2', {}, 'لمن ترسل؟'),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => dlg.close() }, '✕')),
  files.length ? el('div', { class: 'pick-list' }, files.map((f) => el('a', {
    class: 'pick-item', href: `#/whatsapp/send?f=${encodeURIComponent(f.id)}&t=${encodeURIComponent(tpl.id)}`, onclick: () => dlg.close(),
  }, el('b', {}, f.prefix || f.file_name), el('span', { class: 'muted small' }, `${f.count_ready + f.count_warn} طالب · ${f.file_name}`))))
    : el('p', {}, 'لا يوجد ملف محفوظ بعد.'));
  dlg.onclose = () => dlg.remove();
  document.body.append(dlg);
  dlg.showModal();
}
