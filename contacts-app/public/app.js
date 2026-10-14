import { canInstall, install, onInstallChange } from './pwa.js';
import {
  analyzeGrid, buildContacts, buildVCard, vcfFileName, detectDevice, cleanCell, numToStr, colLetter, normalizePhone,
  mappingByColumn, mappingFromColumns, ROLE_LABELS, DEFAULT_OPTIONS,
} from './core.js';

const $ = (id) => document.getElementById(id);
const XLSX = window.XLSX;
const MAX_ROWS = 20000, MAX_COLS = 300, PAGE = 150;

const device = detectDevice(navigator.userAgent, navigator.maxTouchPoints || 0);
const state = {
  file: null, sheets: [], sheetIdx: 0, analysis: null,
  options: loadSettings(), overrides: { names: {}, excluded: {}, emails: {} },
  result: null, upload: null, filter: 'all', shown: PAGE,
};

// ───────────── الإعدادات (إعدادات فقط، لا بيانات من الشيت) ─────────────

function loadSettings() {
  const o = structuredClone(DEFAULT_OPTIONS);
  try {
    const s = JSON.parse(localStorage.getItem('settings') || '{}');
    for (const k of ['sep', 'position', 'numbering', 'nameFormat', 'customTemplate', 'secondPhone', 'vcardVersion', 'lastPrefix']) if (k in s) o[k] = s[k];
  } catch { /* التخزين غير متاح */ }
  return o;
}
function storeSettings() {
  const o = state.options;
  try {
    localStorage.setItem('settings', JSON.stringify({ sep: o.sep, position: o.position, numbering: o.numbering, nameFormat: o.nameFormat,
      customTemplate: o.customTemplate, secondPhone: o.secondPhone, vcardVersion: o.vcardVersion, lastPrefix: o.prefix }));
  } catch { /* ignore */ }
}

// ───────────── قراءة الملف ─────────────

function sheetToGrids(ws) {
  const empty = { grid: [], display: [] };
  if (!ws || !ws['!ref']) return empty;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rEnd = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
  const cEnd = Math.min(range.e.c, MAX_COLS - 1);
  const grid = [], display = [];
  for (let r = 0; r <= rEnd; r++) {
    const g = [], d = [];
    for (let c = 0; c <= cEnd; c++) {
      const cell = r >= range.s.r && c >= range.s.c ? ws[XLSX.utils.encode_cell({ r, c })] : null;
      if (!cell) { g.push(''); d.push(''); continue; }
      if (cell.t === 'e') { g.push(''); d.push(cell.w || '#ERR'); continue; }
      if (cell.t === 'n') {
        const isDate = cell.z && XLSX.SSF.is_date(cell.z);
        g.push(isDate ? (cell.w || cell.v) : cell.v);
        d.push(isDate ? (cell.w || String(cell.v)) : numToStr(cell.v));
        continue;
      }
      if (cell.t === 'd') { g.push(cell.v); d.push(cell.w || cleanCell(cell.v)); continue; }
      const v = cell.v == null ? '' : String(cell.v);
      g.push(v); d.push(v);
    }
    // قص الخلايا الفارغة من نهاية السطر لتصغير الحمولة
    while (d.length && d[d.length - 1] === '') { d.pop(); g.pop(); }
    grid.push(g); display.push(d);
  }
  while (display.length && !display[display.length - 1].length) { display.pop(); grid.pop(); }
  return { grid, display };
}

function countMobiles(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v !== '' && normalizePhone(v).kind === 'mobile') n++;
  return n;
}

async function onFile(file) {
  if (!file) return;
  showError('');
  $('drop').classList.add('busy');
  $('dropTitle').textContent = 'جارٍ القراءة…';
  try {
    if (!XLSX) throw new Error('lib');
    const buf = await file.arrayBuffer();
    let wb;
    try {
      wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: true, dense: false });
    } catch (e) {
      throw new Error(/password|encrypt/i.test(String(e)) ? 'protected' : 'read');
    }
    const sheets = wb.SheetNames.map((name) => ({ name, ...sheetToGrids(wb.Sheets[name]) }));
    if (!sheets.some((s) => s.grid.length)) throw new Error('empty');
    state.file = file;
    state.sheets = sheets;
    state.sheetIdx = sheets.length > 1
      ? sheets.map((s, i) => [countMobiles(s.grid), i]).sort((a, b) => b[0] - a[0])[0][1] : 0;
    state.overrides = { names: {}, excluded: {}, emails: {} };
    state.upload = null;
    $('saved').hidden = true;
    analyze();
  } catch (e) {
    const msg = {
      protected: 'الملف محمي بكلمة سر. افتحه في Excel واحفظه بدون كلمة سر ثم أعد المحاولة.',
      empty: 'الملف فارغ.',
      lib: 'تعذّر تحميل قارئ الإكسل. تحقق من الاتصال وأعد تحميل الصفحة.',
    }[e.message] || 'تعذّرت قراءة الملف. الصيغ المقبولة: xlsx أو xls أو csv.';
    showError(msg);
    resetDrop();
  } finally {
    $('drop').classList.remove('busy');
  }
}

function analyze(headerRow) {
  const sheet = state.sheets[state.sheetIdx];
  const a = analyzeGrid(sheet.grid, { fileName: state.file.name, headerRow });
  if (a.headerRow < 0) {
    state.analysis = null;
    $('result').hidden = true;
    showHeaderPicker(sheet.grid);
    setDropDone();
    return;
  }
  $('pickHeader').hidden = true;
  state.analysis = a;
  const stored = state.options.lastPrefix || '';
  state.options.prefix = a.prefixSuggestion || stored || '';
  $('prefix').value = state.options.prefix;
  setDropDone();
  fillOptionsUI();
  recompute();
  $('result').hidden = false;
  startUpload();
}

function showHeaderPicker(grid) {
  const box = $('headerRows');
  box.replaceChildren();
  grid.slice(0, 10).forEach((row, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${i + 1}: ${row.map(cleanCell).filter(Boolean).join(' · ') || '(فارغ)'}`;
    b.onclick = () => analyze(i);
    box.append(b);
  });
  $('pickHeader').hidden = false;
}

// ───────────── الحساب والعرض ─────────────

function recompute() {
  state.result = buildContacts(state.analysis, state.options, state.overrides);
  renderSummary();
  renderPreview();
  renderList();
  const n = state.result.counts.exported;
  $('save').textContent = n ? `حفظ ${n} جهة في جهات الاتصال` : 'لا توجد جهات صالحة للحفظ';
  $('save').disabled = !n;
}

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

function renderSummary() {
  const { counts } = state.result;
  const sheet = state.sheets[state.sheetIdx];
  const meta = state.analysis.meta;
  const parts = [
    el('div', { class: 'file' }, `${state.file.name}${state.sheets.length > 1 ? ` · ورقة ${sheet.name}` : ''}`),
    el('span', { class: 'pill ready' }, el('span', { class: 'dot' }), `${counts.ready} جاهز`),
    el('span', { class: 'pill warn' }, el('span', { class: 'dot' }), `${counts.warn} تنبيه`),
    el('span', { class: 'pill excluded' }, el('span', { class: 'dot' }), `${counts.excluded} مستبعد`),
  ];
  if (meta.count != null && meta.count !== counts.total) {
    parts.push(el('div', { class: 'muted small', style: 'width:100%' }, `الترويسة تذكر ${meta.count}، والصفوف الفعلية ${counts.total}.`));
  }
  $('summary').replaceChildren(...parts);
  const pending = counts.warn + counts.excluded;
  $('reviewBadge').textContent = pending ? `${pending} تحتاج نظرة` : '';
}

function renderPreview() {
  const list = state.result.contacts.filter((c) => c.status !== 'excluded').slice(0, 3);
  $('preview').replaceChildren(...list.map((c) => el('div', { class: 'row' },
    el('span', { class: 'avatar' }, [...(c.parts.first || c.name)][0] || '؟'),
    el('div', {}, el('div', { class: 'nm', dir: 'auto' }, c.name), el('div', { class: 'ph' }, c.phones.map((p) => p.display).join(' · '))))));
}

function renderList() {
  const q = $('search').value.trim();
  const qDigits = q.replace(/\D/g, '');
  let items = state.result.contacts;
  if (state.filter !== 'all') items = items.filter((c) => c.status === state.filter);
  if (q) items = items.filter((c) => c.name.includes(q) || c.parts.full.includes(q)
    || (qDigits.length >= 3 && c.phones.some((p) => p.e164.includes(qDigits) || p.display.replace(/\D/g, '').includes(qDigits))));
  const shown = items.slice(0, state.shown);
  $('list').replaceChildren(...shown.map(renderItem));
  $('more').hidden = items.length <= shown.length;
  if (!items.length) $('list').append(el('li', { class: 'muted small', style: 'padding:12px 0' }, 'لا شيء هنا.'));
}

function renderItem(c) {
  const nameInput = el('input', { class: 'nm', type: 'text', dir: 'auto', value: c.name, 'aria-label': 'الاسم في الهاتف' });
  nameInput.onchange = () => {
    const v = nameInput.value.trim();
    if (v) state.overrides.names[c.rowNum] = v; else delete state.overrides.names[c.rowNum];
    recompute();
  };
  const warns = c.warnings.length ? el('ul', { class: 'warns' }, c.warnings.map((w) => el('li', {}, w))) : null;
  const fix = c.emailSuggestion ? el('button', { type: 'button', class: 'btn ghost small', onclick: () => {
    state.overrides.emails[c.rowNum] = c.emailSuggestion; recompute();
  } }, `تصحيح البريد إلى ${c.emailSuggestion}`) : null;
  const toggle = el('button', { type: 'button', class: 'toggle', onclick: () => {
    if (c.manualExcluded) delete state.overrides.excluded[c.rowNum]; else state.overrides.excluded[c.rowNum] = true;
    recompute();
  } }, c.manualExcluded ? 'إعادة' : 'استبعاد');
  const canToggle = c.manualExcluded || c.phones.length;
  return el('li', { class: `item ${c.status}` },
    el('div', { class: 'side' }, el('span', { class: 'status' }, el('span', { class: 'dot', style: 'display:block' })), canToggle ? toggle : null),
    el('div', { class: 'body' },
      nameInput,
      el('div', {}, c.phones.map((p) => el('span', { class: 'ph' }, p.display + ' '))),
      el('div', { class: 'meta' }, `م ${c.serial} · سطر ${c.rowNum}${c.email ? ' · ' + c.email : ''}`),
      warns, fix,
      c.notes.length ? el('div', { class: 'notes' }, c.notes.join(' · ')) : null));
}

// ───────────── الخيارات ─────────────

function fillOptionsUI() {
  const o = state.options;
  $('nameFormat').value = o.nameFormat;
  $('sep').value = o.sep;
  $('position').value = o.position;
  $('numbering').checked = o.numbering;
  $('secondPhone').checked = o.secondPhone;
  $('template').value = o.customTemplate || '';
  $('v21').checked = o.vcardVersion === '2.1';
  document.querySelectorAll('[data-field]').forEach((cb) => { cb.checked = !!o.fields[cb.dataset.field]; });

  $('sheetField').hidden = state.sheets.length < 2;
  $('sheet').replaceChildren(...state.sheets.map((s, i) => el('option', { value: i, selected: i === state.sheetIdx }, s.name)));
  const grid = state.sheets[state.sheetIdx].grid;
  $('headerRow').replaceChildren(...grid.slice(0, 20).map((row, i) =>
    el('option', { value: i, selected: i === state.analysis.headerRow }, `${i + 1}: ${row.map(cleanCell).filter(Boolean).slice(0, 4).join(' · ').slice(0, 60)}`)));
  renderMapping();
  renderTokens();
}

function renderMapping() {
  const byCol = mappingByColumn(state.analysis.mapping);
  const roles = Object.keys(ROLE_LABELS);
  const rows = state.analysis.headers.filter((h) => h.label || byCol[h.idx]).map((h) => {
    const sel = el('select', { 'aria-label': `دور العمود ${h.col}` },
      el('option', { value: '' }, '— لا يُستخدم —'),
      roles.map((r) => el('option', { value: r, selected: byCol[h.idx] === r }, ROLE_LABELS[r])));
    sel.onchange = () => {
      const next = { ...mappingByColumn(state.analysis.mapping), [h.idx]: sel.value };
      state.analysis.mapping = mappingFromColumns(next, state.analysis.rows);
      recompute();
    };
    return el('div', { class: 'mrow' }, el('div', { class: 'lbl' }, `${h.label || '(بلا عنوان)'} `, el('b', {}, `(${h.col})`)), sel);
  });
  $('mapping').replaceChildren(...rows);
}

function renderTokens() {
  const tokens = [['{prefix}', 'البادئة'], ['{n}', 'رقم م'], ['{first}', 'الأول'], ['{father}', 'الأب'], ['{grand}', 'الجد'], ['{last}', 'العائلة'], ['{full}', 'الكامل']];
  const sp = state.analysis.mapping.specialty;
  if (sp != null) tokens.push([`{col:${colLetter(sp)}}`, 'التخصص']);
  $('tokens').replaceChildren(...tokens.map(([t, label]) => el('button', { type: 'button', onclick: () => {
    const inp = $('template');
    const base = inp.value || '';
    const pos = inp.selectionStart ?? base.length;
    inp.value = base.slice(0, pos) + t + base.slice(inp.selectionEnd ?? pos);
    inp.dispatchEvent(new Event('input'));
    inp.focus();
  } }, label)));
}

function bindOptions() {
  const set = (k, v) => { state.options[k] = v; storeSettings(); if (state.analysis) recompute(); };
  let t;
  $('prefix').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => set('prefix', $('prefix').value.trim().slice(0, 20)), 120);
  });
  $('nameFormat').onchange = (e) => set('nameFormat', e.target.value);
  $('sep').onchange = (e) => set('sep', e.target.value);
  $('position').onchange = (e) => set('position', e.target.value);
  $('numbering').onchange = (e) => set('numbering', e.target.checked);
  $('secondPhone').onchange = (e) => set('secondPhone', e.target.checked);
  $('v21').onchange = (e) => set('vcardVersion', e.target.checked ? '2.1' : '3.0');
  $('template').addEventListener('input', (e) => set('customTemplate', e.target.value.trim()));
  document.querySelectorAll('[data-field]').forEach((cb) => {
    cb.onchange = () => { state.options.fields = { ...state.options.fields, [cb.dataset.field]: cb.checked }; recompute(); };
  });
  $('sheet').onchange = (e) => { state.sheetIdx = Number(e.target.value); state.overrides = { names: {}, excluded: {}, emails: {} }; analyze(); };
  $('headerRow').onchange = (e) => analyze(Number(e.target.value));
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.filter = b.dataset.f; state.shown = PAGE;
    $('tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  });
  $('search').addEventListener('input', () => { state.shown = PAGE; renderList(); });
  $('more').onclick = () => { state.shown += PAGE; renderList(); };
  $('file').addEventListener('change', (e) => onFile(e.target.files[0]));
  $('save').onclick = onSave;
  $('share').onclick = onShare;
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); });
  drop.addEventListener('drop', (e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); });
}

// ───────────── الرفع إلى الخادم ─────────────

function deviceInfo() {
  return {
    type: device, userAgent: navigator.userAgent, platform: navigator.userAgentData?.platform || navigator.platform || '',
    mobile: navigator.userAgentData?.mobile ?? null, language: navigator.language, languages: navigator.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    viewport: `${innerWidth}x${innerHeight}`, touch: navigator.maxTouchPoints || 0, standalone: matchMedia('(display-mode: standalone)').matches,
    clientTime: new Date().toString(),
  };
}

function analysisSummary() {
  const a = state.analysis, r = state.result;
  const letters = {};
  for (const [role, v] of Object.entries(a.mapping)) letters[role] = Array.isArray(v) ? v.map(colLetter) : colLetter(v);
  return {
    sheetName: state.sheets[state.sheetIdx].name, headerRow: a.headerRow + 1, headers: a.headers.map((h) => ({ col: h.col, label: h.label })),
    mapping: letters, meta: a.meta, prefix: state.options.prefix, prefixSuggestion: a.prefixSuggestion, counts: r.counts,
  };
}

function startUpload() {
  const fd = new FormData();
  fd.append('fileName', state.file.name);
  fd.append('analysis', JSON.stringify(analysisSummary()));
  fd.append('device', JSON.stringify(deviceInfo()));
  fd.append('sheets', JSON.stringify(state.sheets.map((s) => ({ name: s.name, grid: s.display }))));
  fd.append('file', state.file, state.file.name);
  const p = fetch('/api/uploads', { method: 'POST', body: fd })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  state.upload = { promise: p };
  p.then((u) => { if (state.upload?.promise === p) Object.assign(state.upload, u || {}); });
}

function compactContacts() {
  return state.result.contacts.map((c) => ({
    rowNum: c.rowNum, serial: c.serial, name: c.name, full: c.parts.full, phones: c.phones.map((p) => p.e164),
    invalidPhones: c.invalidPhones.map((p) => p.raw), email: c.email || c.emailInvalid, org: c.org, title: c.title,
    region: c.region, gender: c.gender, status: c.status, warnings: c.warnings, notes: c.notes, edited: !!c.manualName,
  }));
}

async function sendSave(vcf, vcfName) {
  if (!state.upload) return null;
  const timeout = new Promise((res) => setTimeout(() => res(null), 6000));
  const u = await Promise.race([state.upload.promise, timeout]);
  if (!u?.id) return null;
  const r = await fetch(`/api/uploads/${encodeURIComponent(u.id)}/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Upload-Token': u.token },
    body: JSON.stringify({ prefix: state.options.prefix, options: state.options, counts: state.result.counts, contacts: compactContacts(), vcf, vcfName }),
  }).catch(() => null);
  return r?.ok ? u : null;
}

// ───────────── الحفظ على الهاتف ─────────────

function currentVCard() {
  const vcf = buildVCard(state.result);
  return { vcf, name: vcfFileName(state.options.prefix) };
}

function downloadBlob(text, name) {
  const blob = new Blob([text], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function onSave() {
  const btn = $('save');
  const { vcf, name } = currentVCard();
  if (!vcf) return;
  storeSettings();
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'جارٍ التجهيز…';
  try {
    const u = await sendSave(vcf, name);
    if (device === 'ios' && u) {
      // Safari على iPhone يفتح vCard من الخادم مباشرة في جهات الاتصال مع "إضافة الكل".
      location.href = `/api/uploads/${encodeURIComponent(u.id)}/contacts.vcf?t=${encodeURIComponent(u.token)}`;
    } else {
      downloadBlob(vcf, name);
    }
    const n = state.result.counts.exported;
    const msg = $('saved');
    msg.textContent = device === 'ios'
      ? `تم تجهيز ${n} جهة. اضغط "إضافة كل جهات الاتصال (${n})" في الشاشة التي فُتحت.`
      : device === 'android'
        ? `تم تنزيل الملف (${n} جهة). افتحه من الإشعار ثم اختر الحساب ليُستورد.`
        : `تم تنزيل ${name} (${n} جهة). استورده في Google Contacts أو iCloud.`;
    msg.hidden = false;
    $('howto').open = true;
    setTimeout(reloadIfIdle, 8000);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

async function onShare() {
  const { vcf, name } = currentVCard();
  const file = new File([vcf], name, { type: 'text/vcard' });
  sendSave(vcf, name);
  try { await navigator.share({ files: [file], title: name }); } catch { /* أُلغيت المشاركة */ }
}

// ───────────── واجهة عامة ─────────────

function showError(msg) { $('error').textContent = msg; $('error').hidden = !msg; }
function resetDrop() {
  $('drop').classList.remove('compact');
  $('dropTitle').textContent = 'اختر ملف الإكسل';
  $('dropSub').textContent = 'xlsx أو xls أو csv';
}
function setDropDone() {
  $('drop').classList.add('compact');
  $('dropTitle').textContent = 'تغيير الملف';
  $('dropSub').textContent = '';
  $('file').value = '';
}

const STEPS = {
  ios: ['اضغط زر الحفظ أعلاه.', 'تُفتح شاشة جهات الاتصال: اضغط "إضافة كل جهات الاتصال".', 'إن لم تُفتح: تطبيق الملفات ← التنزيلات ← افتح الملف ← إضافة الكل.'],
  android: ['اضغط زر الحفظ أعلاه فيُنزَّل الملف.', 'افتحه من الإشعار أو من تطبيق الملفات، واختر الحساب (Google) ليُستورد.', 'إن لم يُفتح: تطبيق جهات الاتصال ← الإعدادات ← استيراد ← ملف vcf'],
  desktop: ['اضغط زر الحفظ أعلاه فيُنزَّل الملف.', 'افتح contacts.google.com ← استيراد ← اختر الملف (يُزامَن مع Android).', 'أو icloud.com/contacts ← ⚙︎ ← استيراد vCard (يُزامَن مع iPhone).'],
};

// ───────────── التحديث التلقائي ─────────────
// عند كل نشر يتغيّر version.json؛ الصفحة المفتوحة تعيد تحميل نفسها حين تعود للواجهة.
// لا تقاطع المستخدم وسط ملف لم يحفظه: تنتظر حتى ينتهي الحفظ أو يُغلق.

let loadedVersion = null, updatePending = false;
async function fetchVersion() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    return r.ok ? (await r.json()).v : null;
  } catch { return null; }
}
function reloadIfIdle() {
  if (updatePending && (!state.analysis || !$('saved').hidden)) location.reload();
}
async function checkForUpdate() {
  const v = await fetchVersion();
  if (!v) return;
  if (loadedVersion === null) { loadedVersion = v; return; }
  if (v !== loadedVersion) { updatePending = true; reloadIfIdle(); }
}
function watchForUpdates() {
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  addEventListener('pageshow', (e) => { if (e.persisted) checkForUpdate(); });
  setInterval(checkForUpdate, 5 * 60 * 1000);
}

function setupInstall() {
  const btn = $('installBtn');
  const refresh = () => { btn.hidden = !canInstall(); };
  onInstallChange(refresh);
  refresh();
  btn.onclick = async () => {
    const r = await install();
    if (r === 'ios') alert('لتثبيت التطبيق على iPhone: اضغط زر المشاركة ⬆︎ في Safari، ثم "إضافة إلى الشاشة الرئيسية".');
    refresh();
  };
}

function init() {
  setupInstall();
  $('deviceName').textContent = { ios: 'iPhone', android: 'Android', desktop: 'الكمبيوتر' }[device];
  $('steps').replaceChildren(...STEPS[device].map((s) => el('li', {}, s)));
  if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.vcf', { type: 'text/vcard' })] })) $('share').hidden = false;
  bindOptions();
  watchForUpdates();
}

init();
