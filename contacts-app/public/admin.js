import { initWa, renderWaTab, loadWaPage, leaveWaTab } from './admin-wa.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k);
  return e;
}

const p2 = (n) => String(n).padStart(2, '0');
const when = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};
const ago = (ms) => {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.round(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.round(s / 3600)} س`;
  return `قبل ${Math.round(s / 86400)} يوم`;
};
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const STATUS = { ready: ['جاهز', 'ok'], warn: ['تنبيه', 'warn'], excluded: ['مستبعد', 'bad'] };
const badge = (cls, text, title) => el('span', { class: `badge-s ${cls}`, title }, text);

export function describeUA(ua = '') {
  let os = 'غير معروف', model = '';
  let m;
  if ((m = ua.match(/iPhone OS (\d+)[_.](\d+)/))) os = `iPhone · iOS ${m[1]}.${m[2]}`;
  else if ((m = ua.match(/iPad.*OS (\d+)[_.](\d+)/))) os = `iPad · iPadOS ${m[1]}.${m[2]}`;
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) {
    os = `Android ${m[1]}`;
    const mm = ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\sBuild|\)|;)/);
    if (mm && mm[1] !== 'K' && !/^wv$/.test(mm[1])) model = mm[1].trim();
  } else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /EdgA?\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, model, browser].filter(Boolean).join(' · ');
}

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  if (r.status === 401) { showLogin(); throw new Error('auth'); }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ───────────── التنقل ─────────────

const VIEWS = ['overview', 'files', 'contacts', 'whatsapp', 'detail'];
function showView(v) {
  $('loginView').hidden = true;
  $('app').hidden = false;
  for (const x of VIEWS) $(`${x}View`).hidden = x !== v;
  const navKey = v === 'detail' ? 'files' : v;
  $('nav').querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.v === navKey));
  document.querySelector('.menu')?.removeAttribute('open');
}
function showLogin() {
  $('app').hidden = true;
  $('loginView').hidden = false;
  $('password').focus();
}

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').hidden = true;
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }) });
  if (r.ok) { $('password').value = ''; route(); return; }
  $('loginError').textContent = r.status === 429 ? 'محاولات كثيرة. انتظر قليلاً.' : 'كلمة المرور غير صحيحة.';
  $('loginError').hidden = false;
};
$('logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); };

// ───────────── إعادة بناء الجهات الموحّدة (بعد الاستثناء أو المراجعة) ─────────────

let rebuilding = false;
async function rebuild(label) {
  if (rebuilding) return null;
  rebuilding = true;
  const box = $('progress'), fill = $('progressFill'), text = $('progressText');
  box.hidden = false; fill.style.width = '0';
  let merged = 0;
  try {
    const { ids } = await post('/api/admin/maintenance/start');
    for (let i = 0; i < ids.length; i++) {
      text.textContent = `${label}… ${i + 1} من ${ids.length}`;
      fill.style.width = `${Math.round(((i + 1) / ids.length) * 100)}%`;
      const r = await post(`/api/admin/maintenance/process/${encodeURIComponent(ids[i])}`);
      if (r.merged) merged++;
    }
    return { total: ids.length, merged };
  } catch (e) {
    toast('توقفت العملية بسبب خطأ. أعد المحاولة من القائمة ⋯ ← مراجعة البيانات؛ تشغيلها مرة أخرى آمن.');
    return null;
  } finally {
    box.hidden = true;
    rebuilding = false;
  }
}

$('dedupe').onclick = async () => {
  document.querySelector('.menu').removeAttribute('open');
  if (!confirm('مراجعة كل البيانات: الملفات ذات المحتوى المطابق تُدمج في الأقدم وتُحذف نسخها، ويُعاد بناء جهات الاتصال الموحّدة. متابعة؟')) return;
  const r = await rebuild('جارٍ مراجعة البيانات');
  if (r) toast(`تمت المراجعة: ${r.total} ملف، دُمج منها ${r.merged} مكرر.`);
  route();
};

// ───────────── الاستثناء ─────────────

function askExcludeReason() {
  const dlg = $('excludeDialog');
  $('excludeReason').value = '';
  $('reasonChips').onclick = (e) => {
    const b = e.target.closest('button');
    if (b) $('excludeReason').value = b.textContent;
  };
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? $('excludeReason').value.trim() : null);
    dlg.returnValue = '';
    dlg.showModal();
  });
}

async function setExcluded(id, exclude) {
  if (exclude) {
    const reason = await askExcludeReason();
    if (reason === null) return false;
    await post(`/api/admin/uploads/${encodeURIComponent(id)}/exclude`, { reason });
  } else {
    if (!confirm('إرجاع هذا الملف؟ ستعود جهاته إلى جهات الاتصال الموحّدة.')) return false;
    await post(`/api/admin/uploads/${encodeURIComponent(id)}/include`);
  }
  const r = await rebuild(exclude ? 'جارٍ إزالة جهات الملف' : 'جارٍ إرجاع جهات الملف');
  toast(exclude ? 'استُثني الملف وأُزيلت جهاته من القائمة الموحّدة.' : 'أُرجع الملف وأُضيفت جهاته.');
  return !!r;
}

// ───────────── بطاقة ملف في القوائم ─────────────

function fileBadges(r) {
  return [
    r.excluded_at ? badge('bad', 'مستثنى', r.exclude_reason || '') : null,
    r.saved_at ? badge('ok', r.save_count > 1 ? `حُفظ ×${r.save_count}` : 'حُفظ في الهاتف', when(r.saved_at)) : badge('muted', 'رُفع فقط'),
    r.repeat_count ? badge('warn', `أُعيد رفعه ×${r.repeat_count}`, `آخر مرة ${when(r.last_repeat_at)}`) : null,
  ];
}

function fileRow(r, onChange) {
  const ext = ((r.file_name || '').match(/\.([a-z0-9]+)$/i)?.[1] || 'FILE').toUpperCase().slice(0, 4);
  const action = r.excluded_at
    ? el('button', { type: 'button', class: 'btn restore small', onclick: async (e) => { e.stopPropagation(); if (await setExcluded(r.id, false)) onChange(); } }, 'إرجاع')
    : el('button', { type: 'button', class: 'btn danger small', onclick: async (e) => { e.stopPropagation(); if (await setExcluded(r.id, true)) onChange(); } }, 'استثناء');
  const row = el('div', { class: `file-row${r.excluded_at ? ' is-excluded' : ''}`, role: 'link', tabindex: '0' },
    el('div', { class: 'file-icon' }, ext),
    el('div', { class: 'file-main' },
      el('div', { class: 'file-name', title: r.file_name }, r.file_name || '—'),
      el('div', { class: 'file-meta', title: when(r.created_at) }, `${ago(r.created_at)} · ${describeUA(r.user_agent)} · ${r.ip || ''}`)),
    el('div', { class: 'col-hide' }, el('div', { dir: 'auto', style: 'font-weight:700' }, r.prefix || '—'), el('div', { class: 'file-meta' }, r.sheet_name || '')),
    el('div', { class: 'file-counts col-hide' }, el('b', {}, r.count_total), ' جهة',
      el('div', { class: 'file-meta' }, `${r.count_ready} جاهز · ${r.count_warn} تنبيه · ${r.count_excluded} مستبعد`)),
    el('div', { class: 'badges col-hide' }, fileBadges(r)),
    el('div', { class: 'file-actions' }, action));
  const open = () => { location.hash = `#/u/${r.id}`; };
  row.onclick = open;
  row.onkeydown = (e) => { if (e.key === 'Enter') open(); };
  return row;
}

// ───────────── نظرة عامة ─────────────

const tz = new Date().getTimezoneOffset();

async function loadOverview() {
  const [st, ups] = await Promise.all([api(`/api/admin/stats?tz=${tz}`), api('/api/admin/uploads')]);
  const kpi = (label, value, sub, href) => el(href ? 'a' : 'div', { class: `kpi${href ? ' link-card' : ''}`, href },
    el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), sub ? el('div', { class: 'sub' }, sub) : null);
  $('kpis').replaceChildren(
    kpi('ملفات نشطة', st.uploads, `${st.saved} منها حُفظت في الهواتف`, '#/files'),
    kpi('جهات اتصال فريدة', st.contacts, `${st.shared} منها في أكثر من ملف`, '#/contacts'),
    kpi('رفع مكرر مُنع', st.repeats, 'لم يُسجَّل مرة ثانية'),
    kpi('ملفات مستثناة', st.excluded, 'خارج القائمة والتصدير', '#/files?f=excluded'),
    kpi('ملفات جديدة اليوم', st.today, null),
  );

  const active = ups.filter((u) => !u.excluded_at);
  const warnFiles = active.filter((u) => u.count_warn > 0 || u.count_excluded > 0).length;
  const items = [
    [st.unsaved, st.unsaved ? 'warn' : 'ok', 'ملف رُفع ولم يُحفظ في الهاتف', '#/files?f=unsaved'],
    [warnFiles, warnFiles ? 'warn' : 'ok', 'ملف فيه صفوف تحتاج مراجعة (تنبيه أو مستبعد)', '#/files'],
    [st.excluded, st.excluded ? 'bad' : 'ok', 'ملف مستثنى', '#/files?f=excluded'],
    [st.repeats, st.repeats ? 'warn' : 'ok', 'محاولة رفع مكرر', '#/files?f=repeated'],
  ];
  $('attention').replaceChildren(...items.map(([n, cls, text, href]) => el('li', {},
    el('span', { class: `n ${cls}` }, n), el('span', {}, text), el('a', { class: 'link', href }, 'عرض'))));
  const recent = ups.slice(0, 5);
  $('recent').replaceChildren(recent.length
    ? el('div', { class: 'files' }, recent.map((r) => fileRow(r, loadOverview)))
    : el('div', { class: 'empty-state' }, 'لم يُرفع أي ملف بعد.'));
  showView('overview');
  drawChart($('chart'), st.days);
}

/** أعمدة رفيعة لسلسلة واحدة: الملفات يومياً. التلميح عند المرور بدل رقم على كل عمود. */
function drawChart(box, days) {
  box.replaceChildren();
  if (!days?.length) return;
  const W = Math.max(280, box.clientWidth || 600), H = 200, padT = 12, padB = 26, padS = 30;
  const max = Math.max(1, ...days.map((d) => d.uploads));
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const slot = (W - padS) / days.length;
  const bw = Math.min(26, slot * 0.56);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `الملفات المرفوعة يومياً: ${days.map((d) => d.uploads).join('، ')}`, direction: 'ltr' });
  const grid = svg('g', { class: 'grid' }), axis = svg('g', { class: 'axis' });
  for (let v = 0; v <= top; v += step) {
    grid.append(svg('line', { x1: padS, x2: W, y1: y(v), y2: y(v) }));
    axis.append(svg('text', { x: padS - 8, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
  }
  root.append(grid, axis);
  const tip = el('div', { class: 'tip', hidden: true });
  days.forEach((d, i) => {
    const date = new Date(d.start);
    const cx = padS + slot * i + slot / 2;
    const label = `${date.getDate()}/${date.getMonth() + 1}`;
    if (i % 2 === (days.length - 1) % 2) axis.append(svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, label));
    const h = y(0) - y(d.uploads);
    const hit = svg('rect', { class: 'hit', x: cx - slot / 2, y: padT, width: slot, height: H - padT - padB });
    let bar = null;
    if (d.uploads > 0) {
      const r = Math.min(4, bw / 2, h);
      const x0 = cx - bw / 2, x1 = cx + bw / 2, yb = y(0), yt = y(d.uploads);
      bar = svg('path', { class: 'bar', d: `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x1 - r} Q${x1},${yt} ${x1},${yt + r} V${yb} Z` });
    }
    hit.addEventListener('mouseenter', () => {
      bar?.classList.add('hover');
      tip.textContent = `${label}: ${d.uploads} ${d.uploads === 1 ? 'ملف' : 'ملفات'}`;
      tip.style.left = `${(cx / W) * 100}%`; tip.style.top = `${(y(d.uploads) / H) * 100}%`;
      tip.style.transform = 'translate(-50%, calc(-100% - 6px))';
      tip.hidden = false;
    });
    hit.addEventListener('mouseleave', () => { bar?.classList.remove('hover'); tip.hidden = true; });
    root.append(hit);
    if (bar) root.append(bar);
  });
  box.append(root, tip);
  if (days.every((d) => !d.uploads)) box.append(el('div', { class: 'empty' }, 'لا رفع في آخر 14 يوماً.'));
}

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$('overviewView').hidden) loadOverview().catch(() => {}); }, 300);
});

// ───────────── الملفات ─────────────

let filesFilter = 'active', filesTimer;
const FILE_FILTERS = {
  active: (r) => !r.excluded_at,
  all: () => true,
  excluded: (r) => !!r.excluded_at,
  repeated: (r) => r.repeat_count > 0,
  unsaved: (r) => !r.saved_at && !r.excluded_at,
};
$('filesQ').addEventListener('input', () => { clearTimeout(filesTimer); filesTimer = setTimeout(loadFiles, 250); });
$('filesFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  filesFilter = b.dataset.f;
  loadFiles();
});

async function loadFiles() {
  $('filesFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.f === filesFilter));
  const rows = (await api(`/api/admin/uploads?q=${encodeURIComponent($('filesQ').value.trim())}`)).filter(FILE_FILTERS[filesFilter]);
  $('filesCount').textContent = `${rows.length} ملف`;
  $('filesList').replaceChildren(rows.length
    ? el('div', { class: 'files' }, rows.map((r) => fileRow(r, loadFiles)))
    : el('div', { class: 'empty-state' }, 'لا توجد ملفات هنا.'));
  showView('files');
}

// ───────────── جهات الاتصال الموحّدة ─────────────

let contactsFilter = 'all', contactsRows = [], contactsShown = 200, contactsTimer;
$('contactsQ').addEventListener('input', () => { clearTimeout(contactsTimer); contactsTimer = setTimeout(loadContacts, 250); });
$('contactsFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  contactsFilter = b.dataset.f;
  $('contactsFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  contactsShown = 200;
  renderContacts();
});
$('contactsMore').onclick = () => { contactsShown += 200; renderContacts(); };

async function loadContacts() {
  contactsRows = await api(`/api/admin/contacts?q=${encodeURIComponent($('contactsQ').value.trim())}`);
  contactsShown = 200;
  renderContacts();
  showView('contacts');
}

function renderContacts() {
  const rows = contactsFilter === 'shared' ? contactsRows.filter((c) => c.seen_count > 1) : contactsRows;
  $('contactsCount').textContent = `${rows.length} جهة`;
  const shown = rows.slice(0, contactsShown);
  $('contactsTable').tBodies[0].replaceChildren(...shown.map((c) => {
    const tr = el('tr', { class: 'click' },
      el('td', { dir: 'auto' }, c.name, c.full && c.full !== c.name ? el('div', { class: 'sub' }, c.full) : null),
      el('td', { class: 'num' }, c.phone, c.phone2 ? el('div', { class: 'sub' }, c.phone2) : null),
      el('td', { class: 'ltr' }, c.email || ''), el('td', {}, c.org || ''), el('td', {}, c.title || ''), el('td', {}, c.region || ''),
      el('td', {}, c.wa_status === 'yes' ? badge('ok', 'له') : c.wa_status === 'no' ? badge('bad', 'ليس عليه') : badge('muted', 'لم يُفحص')),
      el('td', { class: 'num', title: when(c.first_seen) }, when(c.first_seen).slice(0, 10)),
      el('td', {}, c.seen_count > 1 ? badge('warn', `${c.seen_count} ملفات`) : '1'),
      el('td', { class: 'wrap' }, c.first_file || c.first_upload_id || ''));
    tr.onclick = () => { if (c.first_upload_id) location.hash = `#/u/${c.first_upload_id}`; };
    return tr;
  }));
  if (!shown.length) $('contactsTable').tBodies[0].append(el('tr', {}, el('td', { colspan: 10, class: 'muted', style: 'text-align:center;padding:32px' }, 'لا توجد جهات.')));
  $('contactsMore').hidden = rows.length <= shown.length;
}

// ───────────── تفاصيل ملف ─────────────

let current = null;
$('dTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('dTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  renderTab(b.dataset.t);
});

async function loadDetail(id) {
  const d = await api(`/api/admin/uploads/${encodeURIComponent(id)}`);
  current = d;
  $('dTitle').textContent = d.file_name || d.id;
  $('dBadges').replaceChildren(...[...fileBadges(d), d.prefix ? badge('muted', `البادئة ${d.prefix}`) : null].filter(Boolean));
  const base = `/api/admin/uploads/${encodeURIComponent(d.id)}`;
  const reload = () => loadDetail(d.id);
  $('dActions').replaceChildren(
    d.excluded_at
      ? el('button', { class: 'btn restore small', type: 'button', onclick: async () => { if (await setExcluded(d.id, false)) reload(); } }, 'إرجاع الملف')
      : el('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (await setExcluded(d.id, true)) reload(); } }, 'استثناء الملف'),
    d.has_file ? el('a', { class: 'btn ghost small', href: `${base}/file` }, 'الملف الأصلي') : null,
    el('a', { class: 'btn ghost small', href: `${base}/sheet.csv` }, 'الشيت CSV'),
    d.contacts ? el('a', { class: 'btn ghost small', href: `${base}/contacts.csv` }, 'الجهات CSV') : null,
    d.vcf ? el('a', { class: 'btn ghost small', href: `${base}/vcf` }, 'vCard') : null,
    el('button', { class: 'btn danger small', type: 'button', onclick: async () => {
      if (!confirm('حذف هذا الملف وكل بياناته نهائياً؟ لا يمكن التراجع. (للإخفاء المؤقت استخدم "استثناء")')) return;
      await api(base, { method: 'DELETE' });
      toast('حُذف الملف.');
      location.hash = '#/files';
    } }, 'حذف'),
  );
  $('dBanner').replaceChildren(d.excluded_at ? el('div', { class: 'banner bad' },
    el('span', {}, el('b', {}, 'ملف مستثنى'), ` منذ ${when(d.excluded_at)}`, d.exclude_reason ? ` — ${d.exclude_reason}` : ''),
    el('span', { class: 'muted small' }, 'جهاته لا تظهر في القائمة الموحّدة ولا في التصدير.')) : '');
  const a = d.analysis || {};
  const geo = d.device?.geo || {};
  const info = [
    ['وقت الرفع', when(d.created_at)], ['الحفظ في الهاتف', d.saved_at ? `${when(d.saved_at)}${d.save_count > 1 ? ` (×${d.save_count})` : ''}` : 'لم يُحفظ'],
    ['الجهات', `${d.count_total} — ${d.count_ready} جاهز · ${d.count_warn} تنبيه · ${d.count_excluded} مستبعد`],
    ['الورقة / سطر العناوين', `${d.sheet_name || '—'} / ${a.headerRow || '—'}`],
    ['الملف', `${size(d.file_size || 0)}`], ['الجهاز', describeUA(d.user_agent)],
    ['IP / الموقع', [d.ip, geo.city, geo.country].filter(Boolean).join(' · ') || '—'],
    ['أُعيد رفعه', d.repeat_count ? `${d.repeat_count} مرة — آخرها ${when(d.last_repeat_at)}` : 'لا'],
  ];
  $('dInfo').replaceChildren(...info.map(([k, v]) => el('div', {}, el('span', {}, k), v)));
  $('dTabs').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0));
  renderTab('contacts');
  showView('detail');
  scrollTo(0, 0);
}

function renderTab(t) {
  const d = current;
  const body = $('dBody');
  if (t === 'wa') { renderWaTab(body, d).catch((e) => { console.error(e); toast('تعذّر تحميل تبويب واتساب.'); }); return; }
  leaveWaTab();
  if (t === 'contacts') {
    if (!d.contacts) {
      body.replaceChildren(el('div', { class: 'empty-state' }, 'رُفع الملف لكن المستخدم لم يضغط "حفظ" بعد. البيانات الكاملة في تبويب "الشيت الأصلي".'));
      return;
    }
    const dups = d.contacts.filter((c) => c.dupOf || c.dupInFile).length;
    const note = dups ? el('div', { class: 'note' }, `${dups} من هذه الجهات موجودة مسبقاً، فلم تُسجَّل مرة ثانية في جهات الاتصال الموحّدة.`) : null;
    const head = ['السطر', 'م', 'الاسم في الهاتف', 'الرقم 1', 'الرقم 2', 'أرقام غير صالحة', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'الحالة', 'التنبيهات والملاحظات'];
    body.replaceChildren(note || '', el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))),
      el('tbody', {}, d.contacts.map((c) => {
        const [label, cls] = STATUS[c.status] || [c.status, ''];
        return el('tr', { class: `st-${c.status}` },
          el('td', { class: 'num' }, c.rowNum), el('td', { class: 'num' }, c.serial),
          el('td', { dir: 'auto' }, c.name, c.edited ? el('span', { class: 'tag', style: 'margin-inline-start:6px' }, 'معدّل') : null,
            c.full && c.full !== c.name ? el('div', { class: 'sub' }, c.full) : null),
          el('td', { class: 'num' }, c.phones?.[0] || ''), el('td', { class: 'num' }, c.phones?.[1] || ''),
          el('td', { class: 'num err' }, (c.invalidPhones || []).join(' / ')),
          el('td', { class: 'ltr' }, c.email || ''), el('td', {}, c.org || ''), el('td', {}, c.title || ''), el('td', {}, c.region || ''),
          el('td', {}, el('span', { class: `tag ${cls}` }, label),
            c.dupOf ? el('div', {}, el('a', { class: 'tag warn', href: `#/u/${c.dupOf}` }, 'موجود من ملف سابق')) : null,
            c.dupInFile ? el('div', {}, el('span', { class: 'tag warn' }, 'مكرر داخل الملف')) : null),
          el('td', { class: 'wrap' }, [...(c.warnings || []), ...(c.notes || [])].join(' · ')));
      })))));
    return;
  }
  if (t === 'sheet') {
    const sheets = d.sheets || [];
    let idx = Math.max(0, sheets.findIndex((s) => s.name === d.sheet_name));
    const holder = el('div');
    const tabs = el('div', { class: 'sheet-tabs chips' });
    const draw = () => {
      tabs.replaceChildren(...(sheets.length > 1 ? sheets.map((s, i) => el('button', { type: 'button', class: i === idx ? 'on' : '', onclick: () => { idx = i; draw(); } }, s.name)) : []));
      const grid = sheets[idx]?.grid || [];
      const width = Math.max(0, ...grid.map((r) => r.length));
      const hr = sheets[idx]?.name === d.sheet_name ? (d.analysis?.headerRow || 0) : 0;
      const letters = Array.from({ length: width }, (_, i) => colName(i));
      holder.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', { class: 'rn' }, '#'), letters.map((l) => el('th', { class: 'col' }, l)))),
        el('tbody', {}, grid.map((row, r) => el('tr', { class: r + 1 === hr ? 'hdr' : '' },
          el('td', { class: 'rn' }, r + 1),
          Array.from({ length: width }, (_, c) => {
            const v = row[c] ?? '';
            return el('td', { class: /^#/.test(v) ? 'err' : '', dir: 'auto' }, v);
          })))))));
    };
    draw();
    body.replaceChildren(tabs, holder);
    return;
  }
  if (t === 'repeats') {
    const rows = [{ at: d.created_at, ip: d.ip, ua: d.user_agent, fileName: d.file_name, first: true, country: d.device?.geo?.country }, ...(d.repeats || [])];
    body.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['', 'الوقت', 'اسم الملف', 'الجهاز', 'IP', 'الدولة'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r, i) => el('tr', {},
        el('td', {}, r.first ? badge('ok', 'الأصل') : badge('warn', `تكرار ${i}`)),
        el('td', { class: 'num' }, when(r.at)), el('td', { class: 'wrap' }, r.fileName || ''), el('td', { class: 'wrap' }, describeUA(r.ua)),
        el('td', { class: 'num' }, r.ip || ''), el('td', {}, r.country || '')))))));
    return;
  }
  if (t === 'analysis') {
    const a = d.analysis || {};
    const mapRows = Object.entries(a.mapping || {}).map(([role, cols]) => [role, [].concat(cols).map((c) => {
      const h = (a.headers || []).find((x) => x.col === c);
      return `${h?.label || ''} (${c})`;
    }).join('، ')]);
    body.replaceChildren(
      kvTable([['سطر العناوين', a.headerRow], ['البادئة المقترحة', a.prefixSuggestion], ['البادئة المستخدمة', d.prefix],
        ...((a.meta?.pairs || []).map((p) => [`ترويسة: ${p.key}`, p.value])), ...mapRows.map(([r, v]) => [`عمود: ${r}`, v])]),
      el('h2', { style: 'margin:18px 0 8px;font-size:1rem' }, 'خيارات الحفظ'),
      el('pre', { class: 'json' }, JSON.stringify(d.options, null, 2) || 'لم يُحفظ بعد'));
    return;
  }
  if (t === 'device') {
    const dev = d.device || {};
    body.replaceChildren(kvTable([['User-Agent (الخادم)', d.user_agent], ['IP', d.ip], ...Object.entries(dev).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])]));
  }
}

function kvTable(rows) {
  return el('div', { class: 'table-wrap' }, el('table', { class: 'tbl kv' }, el('tbody', {}, rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', { dir: 'auto' }, v == null ? '—' : String(v)))))));
}

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ───────────── التوجيه ─────────────

async function route() {
  leaveWaTab();
  try {
    const me = await (await fetch('/api/admin/me')).json();
    if (!me.admin) { showLogin(); return; }
    const h = location.hash;
    const m = h.match(/^#\/u\/([\w-]+)$/);
    if (m) return await loadDetail(m[1]);
    if (h.startsWith('#/files')) {
      const f = new URLSearchParams(h.split('?')[1] || '').get('f');
      if (f && FILE_FILTERS[f]) filesFilter = f;
      return await loadFiles();
    }
    if (h.startsWith('#/contacts')) return await loadContacts();
    if (h.startsWith('#/whatsapp')) {
      showView('whatsapp');
      return await loadWaPage($('whatsappView'), new URLSearchParams(h.split('?')[1] || ''));
    }
    return await loadOverview();
  } catch (e) {
    if (e.message !== 'auth') { console.error(e); toast('تعذّر تحميل البيانات. أعد المحاولة.'); }
  }
}
initWa({ el, api, post, toast, when, badge });
addEventListener('hashchange', route);
route();
