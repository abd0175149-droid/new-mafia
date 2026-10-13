const $ = (id) => document.getElementById(id);

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

const p2 = (n) => String(n).padStart(2, '0');
const when = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const STATUS = { ready: ['جاهز', 'ok'], warn: ['تنبيه', 'warn'], excluded: ['مستبعد', 'bad'] };

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
  if (r.status === 401) { show('login'); throw new Error('auth'); }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function show(view) {
  $('loginView').hidden = view !== 'login';
  $('listView').hidden = view !== 'list';
  $('detailView').hidden = view !== 'detail';
}

// ───────────── الدخول ─────────────

$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  $('loginError').hidden = true;
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('password').value }) });
  if (r.ok) { $('password').value = ''; route(); return; }
  $('loginError').textContent = r.status === 429 ? 'محاولات كثيرة. انتظر قليلاً.' : 'كلمة المرور غير صحيحة.';
  $('loginError').hidden = false;
};
$('logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST' }); show('login'); };

// ───────────── القائمة ─────────────

let searchTimer, listMode = 'uploads';
$('q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadList, 250); });
$('listTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  listMode = b.dataset.v;
  $('listTabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  loadList();
});

async function loadStats() {
  const st = await api('/api/admin/stats');
  $('stats').replaceChildren(
    el('div', { class: 'stat' }, el('b', {}, st.uploads), el('span', {}, 'ملف فريد')),
    el('div', { class: 'stat' }, el('b', {}, st.repeats), el('span', {}, 'رفع مكرر لم يُسجَّل')),
    el('div', { class: 'stat' }, el('b', {}, st.contacts), el('span', {}, 'جهة اتصال فريدة')),
    el('div', { class: 'stat' }, el('b', {}, st.shared), el('span', {}, 'جهة في أكثر من ملف')),
    el('div', { class: 'stat' }, el('b', {}, st.today), el('span', {}, 'ملف جديد اليوم')),
  );
}

async function loadList() {
  const q = $('q').value.trim();
  $('uploadsWrap').hidden = listMode !== 'uploads';
  $('contactsWrap').hidden = listMode !== 'contacts';
  if (listMode === 'contacts') {
    const [rows] = await Promise.all([api(`/api/admin/contacts?q=${encodeURIComponent(q)}`), loadStats()]);
    $('contacts').tBodies[0].replaceChildren(...rows.map((c) => {
      const tr = el('tr', { class: 'click' },
        el('td', { dir: 'auto' }, c.name), el('td', {}, c.full || ''), el('td', { class: 'num' }, c.phone), el('td', { class: 'num' }, c.phone2 || ''),
        el('td', { class: 'ltr' }, c.email || ''), el('td', {}, c.org || ''), el('td', {}, c.title || ''), el('td', {}, c.region || ''),
        el('td', { class: 'num' }, when(c.first_seen)), el('td', { class: 'num' }, when(c.last_seen)),
        el('td', {}, c.seen_count > 1 ? el('span', { class: 'tag warn' }, `${c.seen_count} ملفات`) : '1'),
        el('td', { class: 'wrap' }, c.first_file || c.first_upload_id || ''));
      tr.onclick = () => { if (c.first_upload_id) location.hash = `#/u/${c.first_upload_id}`; };
      return tr;
    }));
    $('empty').hidden = rows.length > 0;
    show('list');
    return;
  }
  const [rows] = await Promise.all([api(`/api/admin/uploads?q=${encodeURIComponent(q)}`), loadStats()]);
  $('uploads').tBodies[0].replaceChildren(...rows.map((r) => {
    const dev = JSON.parse(r.device_json || '{}');
    const tr = el('tr', { class: 'click' },
      el('td', { class: 'num', title: new Date(r.created_at).toISOString() }, when(r.created_at)),
      el('td', { class: 'wrap' }, r.file_name || '—', el('div', { class: 'muted small' }, `${r.sheet_name || ''} · ${size(r.file_size || 0)}`)),
      el('td', { dir: 'auto' }, r.prefix || '—'),
      el('td', {}, `${r.count_total}`, el('div', { class: 'muted small' }, `${r.count_ready} جاهز · ${r.count_warn} تنبيه · ${r.count_excluded} مستبعد`)),
      el('td', {}, r.saved_at ? el('span', { class: 'tag ok', title: when(r.saved_at) }, r.save_count > 1 ? `حُفظ ×${r.save_count}` : 'حُفظ') : el('span', { class: 'tag no' }, 'رُفع فقط'),
        r.repeat_count ? el('div', {}, el('span', { class: 'tag warn', title: `آخر مرة ${when(r.last_repeat_at)}` }, `أُعيد رفعه ×${r.repeat_count}`)) : null),
      el('td', { class: 'wrap' }, describeUA(r.user_agent), dev.screen ? el('div', { class: 'muted small ltr' }, dev.screen) : null),
      el('td', { class: 'num' }, r.ip || '—'));
    tr.onclick = () => { location.hash = `#/u/${r.id}`; };
    return tr;
  }));
  $('empty').hidden = rows.length > 0;
  show('list');
}

$('dedupe').onclick = async () => {
  if (!confirm('مراجعة كل البيانات: الملفات ذات المحتوى المطابق تُدمج في الأقدم وتُحذف نسخها، ويُعاد بناء جدول الجهات الموحّد. متابعة؟')) return;
  const btn = $('dedupe'), status = $('dedupeStatus');
  btn.disabled = true; status.hidden = false;
  try {
    const { ids } = await api('/api/admin/maintenance/start', { method: 'POST' });
    let merged = 0;
    for (let i = 0; i < ids.length; i++) {
      status.textContent = `جارٍ المراجعة… ${i + 1} من ${ids.length}`;
      const r = await api(`/api/admin/maintenance/process/${encodeURIComponent(ids[i])}`, { method: 'POST' });
      if (r.merged) merged++;
    }
    status.textContent = `تمت المراجعة: ${ids.length} ملف، دُمج منها ${merged} مكرر. الجهات الموحّدة أُعيد بناؤها.`;
  } catch (e) {
    status.textContent = 'توقفت المراجعة بسبب خطأ. أعد المحاولة؛ يمكن تشغيلها أكثر من مرة بأمان.';
  } finally {
    btn.disabled = false;
    loadList();
  }
};

// ───────────── التفاصيل ─────────────

let current = null;
$('back').onclick = () => { location.hash = ''; };
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
  const base = `/api/admin/uploads/${encodeURIComponent(d.id)}`;
  $('dActions').replaceChildren(
    d.has_file ? el('a', { class: 'btn ghost small', href: `${base}/file` }, 'الملف الأصلي') : null,
    el('a', { class: 'btn ghost small', href: `${base}/sheet.csv` }, 'الشيت CSV'),
    d.contacts ? el('a', { class: 'btn ghost small', href: `${base}/contacts.csv` }, 'الجهات CSV') : null,
    d.vcf ? el('a', { class: 'btn ghost small', href: `${base}/vcf` }, 'ملف vCard') : null,
    el('button', { class: 'btn danger small', type: 'button', onclick: async () => {
      if (!confirm('حذف هذا الملف وكل بياناته نهائياً؟')) return;
      await api(base, { method: 'DELETE' });
      location.hash = '';
    } }, 'حذف'),
  );
  const a = d.analysis || {};
  const info = [
    ['وقت الرفع', when(d.created_at)], ['وقت الحفظ في الهاتف', d.saved_at ? `${when(d.saved_at)}${d.save_count > 1 ? ` (×${d.save_count})` : ''}` : 'لم يُحفظ'],
    ['البادئة', d.prefix || '—'], ['الورقة / سطر العناوين', `${d.sheet_name || '—'} / ${a.headerRow || '—'}`],
    ['الجهات', `${d.count_total} — ${d.count_ready} جاهز · ${d.count_warn} تنبيه · ${d.count_excluded} مستبعد`],
    ['الملف', `${d.file_name || '—'} · ${size(d.file_size || 0)}`], ['الجهاز', describeUA(d.user_agent)], ['IP', d.ip || '—'],
    ['أُعيد رفعه', d.repeat_count ? `${d.repeat_count} مرة (لم تُسجَّل) · آخرها ${when(d.last_repeat_at)}` : 'لا'],
  ];
  $('dInfo').replaceChildren(...info.map(([k, v]) => el('div', {}, el('span', {}, k), v)));
  $('dTabs').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0));
  renderTab('contacts');
  show('detail');
  scrollTo(0, 0);
}

function renderTab(t) {
  const d = current;
  const body = $('dBody');
  if (t === 'contacts') {
    if (!d.contacts) {
      body.replaceChildren(el('p', { class: 'muted' }, 'رُفع الملف لكن المستخدم لم يضغط "حفظ" بعد. البيانات الكاملة في تبويب "الشيت الأصلي".'));
      return;
    }
    const dups = d.contacts.filter((c) => c.dupOf || c.dupInFile).length;
    const note = dups ? el('p', { class: 'muted small' }, `${dups} من هذه الجهات موجودة مسبقاً فلم تُسجَّل مرة ثانية في الجهات الموحّدة.`) : null;
    const head = ['السطر', 'م', 'الاسم في الهاتف', 'الاسم الكامل', 'الرقم 1', 'الرقم 2', 'أرقام غير صالحة', 'البريد', 'جهة العمل', 'المسمى', 'المنطقة', 'الحالة', 'التنبيهات والملاحظات'];
    body.replaceChildren(note || '', el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))),
      el('tbody', {}, d.contacts.map((c) => {
        const [label, cls] = STATUS[c.status] || [c.status, ''];
        return el('tr', { class: `st-${c.status}` },
          el('td', { class: 'num' }, c.rowNum), el('td', { class: 'num' }, c.serial),
          el('td', { dir: 'auto' }, c.name, c.edited ? el('span', { class: 'tag', style: 'margin-inline-start:6px' }, 'معدّل') : null),
          el('td', {}, c.full || ''), el('td', { class: 'num' }, c.phones?.[0] || ''), el('td', { class: 'num' }, c.phones?.[1] || ''),
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
    const tabs = el('div', { class: 'sheet-tabs' });
    const draw = () => {
      tabs.replaceChildren(...(sheets.length > 1 ? sheets.map((s, i) => el('button', { type: 'button', class: `toggle${i === idx ? ' on' : ''}`, onclick: () => { idx = i; draw(); } }, s.name)) : []));
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
    const rows = [{ at: d.created_at, ip: d.ip, ua: d.user_agent, fileName: d.file_name, first: true }, ...(d.repeats || [])];
    body.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['', 'الوقت', 'اسم الملف', 'الجهاز', 'IP', 'الدولة'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r, i) => el('tr', {},
        el('td', {}, r.first ? el('span', { class: 'tag ok' }, 'الأصل') : el('span', { class: 'tag warn' }, `مكرر ${i}`)),
        el('td', { class: 'num' }, when(r.at)), el('td', { class: 'wrap' }, r.fileName || ''), el('td', { class: 'wrap' }, describeUA(r.ua)),
        el('td', { class: 'num' }, r.ip || ''), el('td', {}, r.country || (r.first ? d.device?.geo?.country || '' : ''))))))));
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
      el('h2', { style: 'margin-top:16px' }, 'خيارات الحفظ'),
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
  try {
    const me = await (await fetch('/api/admin/me')).json();
    if (!me.admin) { show('login'); $('password').focus(); return; }
    const m = location.hash.match(/^#\/u\/([\w-]+)$/);
    if (m) await loadDetail(m[1]); else await loadList();
  } catch (e) {
    if (e.message !== 'auth') console.error(e);
  }
}
addEventListener('hashchange', route);
route();
