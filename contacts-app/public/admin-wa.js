// واتساب في لوحة الإدارة: فحص الأرقام يدوياً، وقوالب الرسائل، والإرسال المتتالي عبر تطبيق واتساب، والسجل.
// لا يُرسل شيء آلياً: كل رسالة تُفتح في واتساب جاهزة، ويضغط الأدمن "إرسال" بنفسه ثم يسجّل النتيجة هنا.

import { waFormat } from './template.js';
import { drawTemplatesPage } from './admin-templates.js';
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
    m.body ? el('details', { class: 'msg-fold' },
      el('summary', {}, el('span', { class: 'msg-fold-title' }, 'نص الرسالة'), el('span', { class: 'msg-fold-snippet', dir: 'auto' }, m.body.replace(/\s*\n+\s*/g, ' '))),
      el('div', { class: 'wa-chat' }, el('div', { class: 'wa-bubble', dir: 'auto' }, waFormat(m.body)))) : null,
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

const SUBS = [['send', 'الإرسال والمتابعة'], ['templates', 'الرسائل الجاهزة'], ['log', 'السجل الكامل']];

/** صفحة واتساب: sub = send | templates | log */
export async function loadWaPage(container, sub, params) {
  const { el } = ctx;
  leaveSend();
  if (!SUBS.some(([k]) => k === sub)) sub = 'send';
  const subTabs = el('div', { class: 'tabs-line' }, SUBS.map(([k, label]) => el('a', { href: `#/whatsapp/${k}`, class: k === sub ? 'on' : '' }, label)));
  const holder = el('div');
  // محرّر الرسالة شاشة كاملة بلا تبويبات فوقه
  const editing = sub === 'templates' && params.get('t');
  container.replaceChildren(...(editing ? [holder] : [subTabs, holder]));
  if (sub === 'send') return loadSendView(holder, params);
  if (sub === 'log') return drawLog(holder);
  return drawTemplatesPage(holder, params);
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
