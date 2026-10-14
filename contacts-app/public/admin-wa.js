// واتساب في لوحة الإدارة: فحص الأرقام يدوياً، وقوالب الرسائل، والإرسال المتتالي عبر تطبيق واتساب، والسجل.
// لا يُرسل شيء آلياً: كل رسالة تُفتح في واتساب جاهزة، ويضغط الأدمن "إرسال" بنفسه ثم يسجّل النتيجة هنا.

import { fileColumns, recipientValues, renderMessage, waFormat, BUILTINS } from './template.js';
import { MSG, OUTCOME, PROBLEM, local } from './wa-shared.js';
import { loadSendView, leaveSend } from './admin-send.js';

let ctx; // { el, api, post, toast, when, badge }
export function initWa(c) { ctx = c; }

let outcomeDlg = null;
/** نافذة متابعة رسالة واحدة: الرسالة كما أُرسلت + الحالة + الملاحظات. تعيد الرسالة بعد الحفظ أو null. */
export function openOutcome(m) {
  const { el, post, when, toast } = ctx;
  if (!outcomeDlg) {
    outcomeDlg = el('dialog', { class: 'dialog outcome-dialog' });
    document.body.append(outcomeDlg);
  }
  const sel = el('select', { 'aria-label': 'حالة الاستجابة' },
    el('option', { value: '' }, '— لم تُحدد بعد —'),
    Object.entries(OUTCOME).map(([k, [label]]) => el('option', { value: k, selected: m.outcome === k }, label)));
  const note = el('textarea', { rows: 3, maxlength: 2000, placeholder: 'مثلاً: ردّ وأكّد الحضور، أو طلب التواصل مساءً…' });
  note.value = m.outcome_note || '';
  const quick = el('div', { class: 'chips' }, Object.entries(OUTCOME).map(([k, [label]]) =>
    el('button', { type: 'button', class: m.outcome === k ? 'on' : '', onclick: (e) => {
      sel.value = k;
      quick.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    } }, label)));
  sel.onchange = () => quick.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', Object.keys(OUTCOME)[i] === sel.value));
  const save = el('button', { type: 'submit', class: 'btn primary small', value: 'ok' }, 'حفظ');
  outcomeDlg.replaceChildren(el('form', { method: 'dialog' },
    el('h2', {}, 'متابعة الرسالة'),
    el('div', { class: 'outcome-meta' },
      el('div', {}, el('span', {}, 'المستلم'), el('b', { dir: 'auto' }, m.name || '—')),
      el('div', {}, el('span', {}, 'الرقم'), el('b', { class: 'ltr' }, local(m.phone))),
      el('div', {}, el('span', {}, 'أُرسلت'), when(m.created_at)),
      el('div', {}, el('span', {}, 'القالب'), m.template_name || '—')),
    m.body ? el('div', { class: 'wa-chat' }, el('div', { class: 'wa-bubble', dir: 'auto' }, waFormat(m.body))) : null,
    el('label', { class: 'field', style: 'margin-top:14px' }, el('span', {}, 'حالة الاستجابة'), sel),
    quick,
    el('label', { class: 'field' }, el('span', {}, 'ملاحظات'), note),
    m.outcome_at ? el('p', { class: 'muted small' }, `آخر تحديث: ${when(m.outcome_at)}`) : null,
    el('div', { class: 'dialog-actions' }, el('button', { type: 'submit', class: 'btn ghost small', value: 'cancel' }, 'إلغاء'), save)));
  return new Promise((resolve) => {
    outcomeDlg.onclose = async () => {
      if (outcomeDlg.returnValue !== 'ok') return resolve(null);
      try {
        const r = await post(`/api/admin/wa/messages/${encodeURIComponent(m.id)}/outcome`, { outcome: sel.value, note: note.value.trim() });
        Object.assign(m, { outcome: r.outcome, outcome_note: r.outcome_note, outcome_at: r.outcome_at });
        toast('حُفظت المتابعة.');
        resolve(m);
      } catch { toast('تعذّر حفظ المتابعة.'); resolve(null); }
    };
    outcomeDlg.returnValue = '';
    outcomeDlg.showModal();
    sel.focus();
  });
}

let templatesCache = null;
async function getTemplates(force) {
  if (!templatesCache || force) templatesCache = await ctx.api('/api/admin/wa/templates');
  return templatesCache;
}


// ───────────── صفحة "واتساب": القوالب والسجل ─────────────

let page = { editing: null, sample: null, sampleIdx: 0 };

const SUBS = [['send', 'الإرسال والمتابعة'], ['templates', 'الرسائل الجاهزة'], ['log', 'السجل الكامل']];

/** صفحة واتساب: sub = send | templates | log */
export async function loadWaPage(container, sub, params) {
  const { el } = ctx;
  leaveSend();
  if (!SUBS.some(([k]) => k === sub)) sub = 'send';
  if (sub === 'templates') {
    if (params.has('t')) page.editing = params.get('t') || null;
    if (params.get('f')) page.sampleFile = params.get('f');
  }
  const subTabs = el('div', { class: 'tabs-line' }, SUBS.map(([k, label]) => el('a', { href: `#/whatsapp/${k}`, class: k === sub ? 'on' : '' }, label)));
  const holder = el('div');
  container.replaceChildren(subTabs, holder);
  if (sub === 'send') return loadSendView(holder, params);
  if (sub === 'log') return drawLog(holder);
  return drawTemplates(holder);
}

const DEFAULT_BODY = 'السلام عليكم {اللقب} {الاسم الأول}،\n\n';

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
    page.draft = { forId: current?.id || null, id: current?.id || null, name: current?.name || '', body: current?.body ?? DEFAULT_BODY };
  }
  const draft = page.draft;
  const isDirty = () => (current
    ? draft.name.trim() !== current.name.trim() || draft.body !== current.body
    : !!draft.name.trim() || draft.body !== DEFAULT_BODY);
  const leaveDraft = () => !isDirty() || confirm('في تغييرات غير محفوظة على القالب. تتجاهلها؟');
  const select = (id) => { if (!leaveDraft()) return; page.editing = id; page.draft = null; page.justSaved = null; drawTemplates(holder); };

  const list = el('div', { class: 'tpl-list' },
    el('button', { type: 'button', class: `tpl-item${!current ? ' on' : ''}`, onclick: () => select(null) }, '＋ قالب جديد'),
    templates.map((x) => el('button', { type: 'button', class: `tpl-item${x.id === page.editing ? ' on' : ''}`, onclick: () => select(x.id) },
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
    el('div', { class: 'chips' }, BUILTINS.map((k) => el('button', { type: 'button', onclick: () => insert(`{${k}}`) }, k)),
      el('button', { type: 'button', title: 'كلمة حسب الجنس: الأولى للذكر والثانية للأنثى', onclick: () => insert('{ذ/أ: عزيزي|عزيزتي}') }, 'كلمة حسب الجنس')),
    el('div', { class: 'muted small', style: 'margin-top:8px' }, page.sample ? `أعمدة ملف المعاينة (${page.sample.file_name})` : 'لا يوجد ملف للمعاينة'),
    el('div', { class: 'chips' }, columns.map((c) => el('button', { type: 'button', title: `العمود ${c.col}`, onclick: () => insert(`{${c.key}}`) }, c.key))));

  const fileSel = el('select', { 'aria-label': 'ملف المعاينة' }, files.map((f) => el('option', { value: f.id, selected: f.id === page.sampleFile }, `${f.file_name} · ${f.prefix || ''}`)));
  fileSel.onchange = () => { page.sampleFile = fileSel.value; drawTemplates(holder); };
  const people = (page.sample?.contacts || []).filter((c) => c.status !== 'excluded' && c.phones?.length);
  const who = el('span', { class: 'muted small' });
  const bubble = el('div', { class: 'wa-bubble', dir: 'auto' });
  const warn = el('div');
  const nav = (d) => { if (!people.length) return; page.sampleIdx = (page.sampleIdx + d + people.length) % people.length; preview(); };

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
  // حالة الحفظ ظاهرة دائماً بجانب الأزرار، لا رسالة عابرة فقط.
  const state = el('div', { class: 'save-state', role: 'status', 'aria-live': 'polite' });
  const sendBtn = el('button', { type: 'button', class: 'btn ghost small', onclick: () => chooseFileAndSend(current, files) }, 'إرسال بهذا القالب ←');
  function refreshState(error) {
    const dirty = isDirty();
    saveBtn.disabled = false;
    saveBtn.textContent = current ? 'حفظ التعديلات' : 'حفظ القالب';
    sendBtn.hidden = !current;
    sendBtn.disabled = dirty;
    if (error) state.replaceChildren(el('span', { class: 'bad' }, `✗ لم يُحفظ: ${error}`));
    else if (dirty) state.replaceChildren(el('span', { class: 'warn' }, current ? '● تعديلات غير محفوظة' : '● قالب جديد لم يُحفظ بعد'));
    else if (current) state.replaceChildren(el('span', { class: 'ok' }, `✓ محفوظ · آخر تعديل ${ctx.when(current.updated_at)}`));
    else state.replaceChildren(el('span', { class: 'muted' }, 'اكتب اسماً ونصاً ثم احفظ.'));
  }
  body.addEventListener('input', () => { draft.body = body.value; preview(); refreshState(); });
  name.addEventListener('input', () => { draft.name = name.value; refreshState(); });

  const saveBtn = el('button', { type: 'button', class: 'btn primary small', onclick: async () => {
    if (!name.value.trim()) { refreshState('اكتب اسم القالب'); name.focus(); return; }
    if (!body.value.trim()) { refreshState('نص الرسالة فارغ'); body.focus(); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'جارٍ الحفظ…';
    try {
      const saved = await post('/api/admin/wa/templates', { id: draft.id, name: name.value, body: body.value });
      page.editing = saved.id;
      page.draft = null;
      page.justSaved = saved.id;
      templatesCache = null;
      toast(`✓ حُفظ القالب "${saved.name}"`);
      await drawTemplates(holder);
      holder.querySelector('.saved-next')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      refreshState(e.message === 'auth' ? 'انتهت الجلسة، سجّل الدخول ثم أعد الحفظ' : 'تعذّر الاتصال بالخادم، أعد المحاولة');
    }
  } }, current ? 'حفظ التعديلات' : 'حفظ القالب');
  const delBtn = current ? el('button', { type: 'button', class: 'btn danger small', onclick: async () => {
    if (!confirm(`حذف القالب "${current.name}"؟ السجل السابق يبقى كما هو.`)) return;
    try {
      await api(`/api/admin/wa/templates/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
      page.editing = null; page.draft = null; page.justSaved = null; templatesCache = null;
      toast('حُذف القالب.');
      drawTemplates(holder);
    } catch { toast('تعذّر حذف القالب.'); }
  } }, 'حذف') : null;

  // بعد الحفظ مباشرة: ماذا بعد؟
  const next = current && page.justSaved === current.id ? el('div', { class: 'saved-next' },
    el('b', {}, `✓ حُفظ القالب "${current.name}"`),
    el('p', {}, 'الخطوة التالية: اختر الملف الذي تريد مراسلة طلابه. ستُفتح قائمة الطلاب وكل رسالة جاهزة ببيانات صاحبها، ترسلها من واتساب ثم تسجّل "أُرسلت".'),
    files.length
      ? el('div', { class: 'saved-files' }, files.slice(0, 6).map((f) => el('a', { class: 'btn primary small', href: `#/whatsapp/send?f=${encodeURIComponent(f.id)}&t=${encodeURIComponent(current.id)}` }, `إرسال لطلاب ${f.prefix || f.file_name} (${f.count_ready + f.count_warn})`)))
      : el('p', { class: 'muted' }, 'لا يوجد ملف محفوظ بعد.')) : null;

  holder.replaceChildren(el('div', { class: 'tpl-layout' },
    el('aside', { class: 'panel tpl-side' }, el('div', { class: 'panel-head' }, el('h2', {}, 'القوالب')), list),
    el('section', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('h2', {}, current ? 'تحرير القالب' : 'قالب جديد')),
      el('label', { class: 'field' }, el('span', {}, 'اسم القالب'), name),
      el('label', { class: 'field' }, el('span', {}, 'نص الرسالة'), body),
      el('p', { class: 'muted small' }, 'اضغط على أي حقل لإدراجه مكان المؤشر. للتنسيق في واتساب: *عريض* _مائل_ ~مشطوب~. وللقيمة البديلة إن كانت الخلية فارغة: {اسم العمود|بديل}. {اللقب} يصير الأستاذ أو الأستاذة حسب عمود الجنس، و{ذ/أ: عزيزي|عزيزتي} يختار الكلمة حسب الجنس.'),
      chips,
      el('div', { class: 'tpl-buttons' }, saveBtn, sendBtn, delBtn),
      state,
      next),
    el('section', { class: 'panel tpl-preview' },
      el('div', { class: 'panel-head' }, el('h2', {}, 'المعاينة')),
      files.length ? el('label', { class: 'field' }, el('span', {}, 'ملف المعاينة'), fileSel) : el('p', { class: 'muted' }, 'لا يوجد ملف محفوظ للمعاينة بعد.'),
      el('div', { class: 'tpl-nav' }, el('button', { type: 'button', class: 'icon-btn', onclick: () => nav(1), 'aria-label': 'التالي' }, '›'), who,
        el('button', { type: 'button', class: 'icon-btn', onclick: () => nav(-1), 'aria-label': 'السابق' }, '‹')),
      el('div', { class: 'wa-chat' }, bubble), warn)));
  preview();
  refreshState();
}

/** نافذة اختيار الملف للإرسال بقالب محفوظ، ثم الانتقال لتبويب واتساب في ذلك الملف (وضع الإرسال). */
function chooseFileAndSend(tpl, files) {
  const { el } = ctx;
  if (!tpl) return;
  const dlg = el('dialog', { class: 'dialog' });
  dlg.append(el('form', { method: 'dialog' },
    el('h2', {}, 'إرسال بالقالب'),
    el('p', { class: 'muted small' }, `"${tpl.name}" — اختر الملف:`),
    files.length ? el('div', { class: 'pick-list' }, files.map((f) => el('a', { class: 'pick-item', href: `#/whatsapp/send?f=${encodeURIComponent(f.id)}&t=${encodeURIComponent(tpl.id)}`, onclick: () => dlg.close() },
      el('b', {}, f.prefix || f.file_name), el('span', { class: 'muted small' }, `${f.file_name} · ${f.count_ready + f.count_warn} طالب`))))
      : el('p', {}, 'لا يوجد ملف محفوظ بعد.'),
    el('div', { class: 'dialog-actions' }, el('button', { class: 'btn ghost small', value: 'cancel' }, 'إلغاء'))));
  dlg.onclose = () => dlg.remove();
  document.body.append(dlg);
  dlg.showModal();
}

async function drawLog(holder) {
  const { el, api, when, badge } = ctx;
  const rows = await api('/api/admin/wa/messages');
  let filter = 'awaiting', q = '';
  const FILTERS_LOG = {
    awaiting: ['بانتظار المتابعة', (m) => m.status === 'sent' && !m.outcome],
    replied: ['تم الرد', (m) => m.outcome === 'replied'],
    no_reply: ['لم يرد', (m) => m.outcome === 'no_reply'],
    problem: ['مشكلة في الرقم أو الوصول', (m) => PROBLEM.has(m.outcome) || m.status === 'no_whatsapp'],
    sent: ['كل المُرسلة', (m) => m.status === 'sent'],
    all: ['الكل', () => true],
  };
  const listBox = el('div', { class: 'cards' });
  const count = el('span', { class: 'count' });
  const chips = el('div', { class: 'chips' });
  const summary = el('div', { class: 'kpis' });
  const drawSummary = () => {
    const sent = rows.filter((m) => m.status === 'sent');
    const n = (f) => sent.filter(f).length;
    const pct = (x) => (sent.length ? `${Math.round((x / sent.length) * 100)}%` : '—');
    const replied = n((m) => m.outcome === 'replied');
    const kpi = (label, value, sub, f) => el('button', { type: 'button', class: `kpi link-card${filter === f ? ' on' : ''}`, onclick: () => { filter = f; draw(); } },
      el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), sub ? el('div', { class: 'sub' }, sub) : null);
    summary.replaceChildren(
      kpi('رسائل مُرسلة', sent.length, null, 'sent'),
      kpi('بانتظار المتابعة', n((m) => !m.outcome), 'لم تُسجَّل استجابتها', 'awaiting'),
      kpi('تم الرد', replied, `نسبة الرد ${pct(replied)}`, 'replied'),
      kpi('لم يرد', n((m) => m.outcome === 'no_reply'), null, 'no_reply'),
      kpi('مشكلة في الرقم أو الوصول', n((m) => PROBLEM.has(m.outcome)), 'لا واتساب · رقم خاطئ · لم تصل', 'problem'));
  };
  const draw = () => {
    drawSummary();
    chips.replaceChildren(...Object.entries(FILTERS_LOG).map(([k, [label]]) =>
      el('button', { type: 'button', class: k === filter ? 'on' : '', onclick: () => { filter = k; draw(); } }, label)));
    const list = rows.filter((m) => FILTERS_LOG[filter][1](m)
      && (!q || `${m.name} ${m.phone} ${m.body} ${m.file_name} ${m.template_name} ${m.outcome_note || ''}`.includes(q)));
    count.textContent = `${list.length} سجل`;
    listBox.replaceChildren(...(list.length ? list.map((m) => {
      const sel = m.status === 'sent' ? el('select', { class: 'outcome-select', 'aria-label': 'الاستجابة', onclick: (e) => e.stopPropagation() },
        el('option', { value: '' }, 'بانتظار المتابعة'),
        Object.entries(OUTCOME).map(([k, [label]]) => el('option', { value: k, selected: m.outcome === k }, label))) : null;
      if (sel) {
        sel.dataset.state = m.outcome ? OUTCOME[m.outcome][1] : 'muted';
        sel.onchange = async () => {
          try {
            const r = await ctx.post(`/api/admin/wa/messages/${encodeURIComponent(m.id)}/outcome`, { outcome: sel.value });
            Object.assign(m, { outcome: r.outcome, outcome_note: r.outcome_note, outcome_at: r.outcome_at });
            ctx.toast('حُفظت المتابعة.');
            draw();
          } catch { ctx.toast('تعذّر الحفظ.'); }
        };
      }
      const card = el('div', { class: `card-item${m.status === 'sent' ? ' click' : ''}`, role: m.status === 'sent' ? 'button' : null, tabindex: m.status === 'sent' ? '0' : null },
        el('div', { class: 'ci-head' }, el('div', { class: 'ci-title', dir: 'auto' }, m.name || local(m.phone)), badge(MSG[m.status]?.[1] || 'muted', MSG[m.status]?.[0] || m.status)),
        el('div', { class: 'ci-sub' }, el('span', { class: 'ltr' }, local(m.phone)), ` · ${when(m.created_at)}`),
        sel ? el('div', { class: 'ci-outcome' }, sel) : null,
        m.outcome_note ? el('div', { class: 'wa-note' }, '📝 ', m.outcome_note) : null,
        el('div', { class: 'ci-meta' }, [m.template_name, m.file_name].filter(Boolean).join(' · ')),
        m.body ? el('div', { class: 'ci-quote', dir: 'auto' }, m.body.split('\n').filter(Boolean).slice(0, 2).join(' · ')) : null);
      if (m.status === 'sent') {
        const open = async () => { if (await openOutcome(m)) draw(); };
        card.onclick = open;
        card.onkeydown = (e) => { if (e.key === 'Enter' && e.target === card) open(); };
      }
      return card;
    }) : [el('div', { class: 'empty-state' }, 'لا شيء هنا.')]));
  };
  const search = el('input', { class: 'search', type: 'search', placeholder: 'بحث بالاسم أو الرقم أو النص أو الملاحظات' });
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { q = search.value.trim(); draw(); }, 200); });
  holder.replaceChildren(
    el('p', { class: 'muted small' }, 'اضغط على أي رسالة مُرسلة لتسجيل استجابة المستلم مع ملاحظات، أو غيّر الحالة مباشرة من القائمة.'),
    summary,
    el('div', { class: 'toolbar' }, search, chips, count),
    listBox);
  draw();
}
