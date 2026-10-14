// منطق المعالجة كاملاً: يعمل في المتصفح وفي Node (للاختبارات) بلا أي اعتماديات.
// المدخل شبكة خلايا (مصفوفة صفوف) بقيم خام: نص أو عدد أو Date أو ''.

// ───────────── أدوات عامة ─────────────

export function colLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;
const EXCEL_ERRORS = new Set(['#N/A', '#VALUE!', '#REF!', '#SPILL!', '#NAME?', '#DIV/0!', '#NUM!', '#NULL!', '#CALC!', '#GETTING_DATA']);

export function numToStr(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return BigInt(v).toString();
  return String(v);
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** تنظيف خلية واحدة إلى نص: مسافات، محارف خفية، تطويل، وقيم أخطاء إكسل. */
export function cleanCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? numToStr(v) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return isNaN(v) ? '' : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  let s = String(v).replace(/\u00A0/g, ' ').replace(INVISIBLE, '').replace(/\u0640/g, '');
  s = s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  if (EXCEL_ERRORS.has(s.toUpperCase()) || /^#+$/.test(s)) return '';
  return s;
}

/** توحيد نص العنوان للمقارنة: بلا تشكيل، أ/إ/آ←ا، ة←ه، ى←ي، لاتيني صغير. */
export function normalizeText(s) {
  return cleanCell(s)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[-_:./\\()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;

// ───────────── الأرقام ─────────────

const DIGIT_MAP = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

export function toLatinDigits(s) {
  return String(s).replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d]);
}

/** توحيد رقم أردني واحد. kind: mobile | landline | invalid */
export function normalizePhone(raw) {
  const rawStr = typeof raw === 'number' ? numToStr(raw) : cleanCell(raw);
  let d = toLatinDigits(rawStr).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('962')) d = d.slice(3).replace(/^0+/, '');
  else d = d.replace(/^0/, '');
  if (/^7[789]\d{7}$/.test(d)) {
    return { kind: 'mobile', e164: '+962' + d, display: `0${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`, raw: rawStr };
  }
  if (/^[2356]\d{7}$/.test(d)) {
    return { kind: 'landline', e164: '+962' + d, display: `0${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`, raw: rawStr };
  }
  return { kind: 'invalid', e164: '', display: '', raw: rawStr };
}

/** خلية قد تحوي أكثر من رقم. */
export function parsePhoneCell(v) {
  const s = typeof v === 'number' ? numToStr(v) : cleanCell(v);
  if (!s) return [];
  return toLatinDigits(s).split(/[\/,،;|\n]+/).map((p) => p.trim()).filter(Boolean).map(normalizePhone);
}

// ───────────── البريد ─────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
export function isEmail(s) { return EMAIL_RE.test(s); }

export function suggestEmailFix(s) {
  let t = s.trim().toLowerCase().replace(/\s+/g, '');
  t = t.replace(/[-,]com$/, '.com').replace(/\.con$/, '.com').replace(/\.cmo$/, '.com').replace(/\.co$/, '.com');
  t = t.replace(/@(gmial|gamil|gmai|gmal|gnail)\./, '@gmail.').replace(/@(hotmial|hotmal|hotmai|homail)\./, '@hotmail.')
    .replace(/@(yaho|yahooo)\./, '@yahoo.').replace(/@(outlok|outloo)\./, '@outlook.');
  if (!t.includes('@')) t = t.replace(/(gmail|hotmail|yahoo|outlook)\.com$/, '@$1.com');
  return isEmail(t) && t !== s ? t : '';
}

// ───────────── اكتشاف الأعمدة ─────────────

const SYNONYMS = {
  first: ['first name', 'first', 'الاسم الاول', 'الاول'],
  father: ['second', 'second name', 'father', 'father name', 'اسم الاب', 'الاب'],
  grand: ['third', 'third name', 'grandfather', 'اسم الجد', 'الجد'],
  last: ['last name', 'last', 'family', 'family name', 'surname', 'اسم العائله', 'العائله', 'الكنيه'],
  full: ['name ar', 'arabic name', 'name', 'full name', 'الاسم', 'الاسم الكامل', 'الاسم الرباعي', 'الاسم الثلاثي', 'اسم الطالب', 'اسم المعلم', 'اسم المعلم الطالب'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'whatsapp', 'cell', 'هاتف', 'الهاتف', 'جوال', 'الجوال', 'موبايل', 'خلوي', 'واتس', 'واتساب'],
  email: ['email', 'e mail', 'mail', 'البريد', 'البريد الالكتروني', 'الايميل', 'ايميل'],
  org: ['school', 'organization', 'company', 'المدرسه', 'جهه العمل'],
  title: ['job title', 'title', 'position', 'المسمي', 'المسمي الوظيفي', 'الوظيفه'],
  specialty: ['specialty', 'speciality', 'major', 'subject', 'التخصص', 'المبحث'],
  region: ['governorate', 'gov', 'city', 'directorate', 'المحافظه', 'اللواء', 'المديريه', 'المدينه'],
  group: ['group', 'group number', 'section', 'class', 'الشعبه', 'رقم الشعبه', 'الصف'],
  nid: ['national id', 'nationalid', 'national number', 'الرقم الوطني'],
  ministry: ['ministry number', 'ministry', 'الرقم الوزاري'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'تاريخ الميلاد', 'الميلاد'],
  gender: ['gender', 'sex', 'الجنس', 'النوع الاجتماعي'],
  // رقم المدرسة الوزاري ليس الرقم الوزاري للمعلم: تطابق تام يسبق "ministry number".
  school_id: ['school ministry number', 'school number', 'school id', 'الرقم الوزاري للمدرسه', 'رقم المدرسه'],
};
const EXACT_ONLY = { serial: ['م', 'ت', '#', 'no', 'sn', 'تسلسل', 'الرقم التسلسلي', 'رقم'] };
const NAME_ROLES = ['first', 'father', 'grand', 'last', 'full'];
const MULTI_ROLES = new Set(['phone', 'region', 'nid', 'ministry', 'dob']);
export const SENSITIVE_ROLES = ['nid', 'ministry', 'dob'];

export const ROLE_LABELS = {
  first: 'الاسم الأول', father: 'اسم الأب', grand: 'اسم الجد', last: 'اسم العائلة', full: 'الاسم الكامل',
  en_first: 'الاسم الأول (إنجليزي)', en_last: 'العائلة (إنجليزي)', en_full: 'الاسم (إنجليزي)', en_other: 'جزء اسم إنجليزي',
  phone: 'هاتف', email: 'البريد', org: 'جهة العمل', title: 'المسمى', specialty: 'التخصص', region: 'المنطقة',
  group: 'الشعبة', gender: 'الجنس', school_id: 'رقم المدرسة', serial: 'الرقم المتسلسل (م)', nid: 'الرقم الوطني (حساس)', ministry: 'الرقم الوزاري (حساس)', dob: 'تاريخ الميلاد (حساس)',
};

const NORM_SYN = Object.fromEntries(Object.entries(SYNONYMS).map(([r, l]) => [r, l.map(normalizeText)]));
const NORM_EXACT = Object.fromEntries(Object.entries(EXACT_ONLY).map(([r, l]) => [r, l.map(normalizeText)]));

function isEnglishHeader(h) { return /(^| )(en|eng|english)( |$)/.test(h) || h.includes('انجليزي'); }

/** أفضل دور لعنوان عمود واحد. */
export function matchRole(label) {
  const h = normalizeText(label);
  if (!h) return null;
  let best = null;
  const consider = (role, score) => { if (!best || score > best.score) best = { role, score }; };
  for (const [role, syns] of Object.entries(NORM_EXACT)) if (syns.includes(h)) consider(role, 3);
  for (const [role, syns] of Object.entries(NORM_SYN)) {
    for (const s of syns) {
      if (h === s) consider(role, 3);
      else if ((' ' + h + ' ').includes(' ' + s + ' ')) consider(role, 1 + s.length / 100);
    }
  }
  if (best && NAME_ROLES.includes(best.role) && isEnglishHeader(h)) {
    best = { role: { first: 'en_first', last: 'en_last', full: 'en_full' }[best.role] || 'en_other', score: best.score };
  }
  return best;
}

function rowScore(row) {
  let score = 0; const roles = new Set();
  for (const cell of row) {
    const m = matchRole(cell);
    if (m) { score += m.score >= 3 ? 2 : 1; roles.add(m.role); }
  }
  const hasName = [...roles].some((r) => NAME_ROLES.includes(r) || r.startsWith('en_'));
  return { score, ok: hasName && roles.has('phone') };
}

/** يعيد فهرس صف العناوين (0-based) أو -1. */
export function detectHeaderRow(grid) {
  let best = -1, bestScore = 0;
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const { score, ok } = rowScore(grid[r] || []);
    if (ok && score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/** أزواج "مفتاح: قيمة" فوق الجدول. */
export function readMeta(grid, headerRow) {
  const pairs = [];
  for (let r = 0; r < headerRow; r++) {
    const row = (grid[r] || []).map(cleanCell);
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const colon = cell.match(/^([^:：]{2,40})[:：]\s*(.+)$/);
      if (colon) { pairs.push({ key: colon[1].trim(), value: colon[2].trim() }); continue; }
      if (/\d/.test(cell) && !ARABIC.test(cell) && !LATIN.test(cell)) continue;
      let v = c + 1;
      while (v < row.length && !row[v]) v++;
      if (v < row.length && v - c <= 4) {
        pairs.push({ key: cell, value: row[v] });
        c = v;
      }
    }
  }
  let group = '', count = null;
  for (const { key, value } of pairs) {
    const k = normalizeText(key);
    if (!group && (k.includes('الشعبه') || /(^| )(group|section)( |$)/.test(k))) group = value;
    if (count === null && k.includes('عدد')) { const n = parseInt(toLatinDigits(value), 10); if (!isNaN(n)) count = n; }
  }
  return { pairs, group, count };
}

export function prefixFromFileName(name = '') {
  const base = name.replace(/\.[^.]+$/, '');
  for (const part of base.split(/[-_\s]+/)) if (/^[A-Za-z]{1,3}\d{2,4}$/.test(part)) return part.toUpperCase();
  return '';
}

function columnValues(rows, idx) { return rows.map((r) => cleanCell(r.cells[idx])).filter((v) => v && v !== '0'); }

function phoneStats(rows, idx) {
  let filled = 0, mobile = 0, valid = 0;
  for (const r of rows) {
    const phones = parsePhoneCell(r.cells[idx]);
    if (!phones.length) continue;
    filled++;
    if (phones.some((p) => p.kind === 'mobile')) mobile++;
    if (phones.some((p) => p.kind !== 'invalid')) valid++;
  }
  return { filled, mobile, valid, ratio: filled ? valid / filled : 0, total: rows.length };
}

/** تحليل الشبكة: صف العناوين، الصفوف، الربط، والبادئة المقترحة. */
export function analyzeGrid(grid, { fileName = '', headerRow } = {}) {
  const hr = headerRow ?? detectHeaderRow(grid);
  if (hr < 0) return { headerRow: -1, error: 'no-header' };
  const width = Math.max(...grid.slice(hr).map((r) => (r ? r.length : 0)), 0);
  const headerCells = grid[hr] || [];
  const headers = Array.from({ length: width }, (_, i) => ({ col: colLetter(i), idx: i, label: cleanCell(headerCells[i]) }));
  const headerNorm = headers.map((h) => normalizeText(h.label));

  const rows = [];
  for (let r = hr + 1; r < grid.length; r++) {
    const cells = grid[r] || [];
    const cleaned = Array.from({ length: width }, (_, i) => cleanCell(cells[i]));
    const nonEmpty = cleaned.filter(Boolean);
    if (!nonEmpty.length) continue;
    const same = cleaned.filter((c, i) => c && normalizeText(c) === headerNorm[i]).length;
    if (same >= Math.max(2, nonEmpty.length / 2)) continue;
    rows.push({ rowNum: r + 1, cells: Array.from({ length: width }, (_, i) => cells[i] ?? '') });
  }

  const mapping = mapColumns(headers, rows);
  const meta = readMeta(grid, hr);

  let prefix = '';
  if (mapping.group != null) {
    const vals = new Set(columnValues(rows, mapping.group));
    if (vals.size === 1) prefix = [...vals][0];
  }
  if (!prefix && meta.group) prefix = meta.group;
  if (!prefix) prefix = prefixFromFileName(fileName);

  return { headerRow: hr, headers, rows, mapping, meta, prefixSuggestion: prefix.slice(0, 20) };
}

/** mapping: الدور ← فهرس العمود (أو مصفوفة فهارس للأدوار المتعددة). */
export function mapColumns(headers, rows) {
  const candidates = {};
  const roleOf = {};
  for (const h of headers) {
    const m = matchRole(h.label);
    if (!m) continue;
    let role = m.role;
    const vals = columnValues(rows, h.idx);
    // شكل القيم يحسم: عمود اسم قيمه لاتينية ليس اسماً عربياً.
    if (NAME_ROLES.includes(role) && vals.length) {
      const arabic = vals.filter((v) => ARABIC.test(v)).length;
      if (arabic / vals.length < 0.5) role = { first: 'en_first', last: 'en_last', full: 'en_full' }[role] || 'en_other';
    }
    if (role === 'phone') {
      const st = phoneStats(rows, h.idx);
      if (st.filled && st.ratio < 0.6) continue;
    }
    if (role === 'email' && vals.length && vals.filter(isEmail).length / vals.length < 0.6) continue;
    (candidates[role] ||= []).push({ idx: h.idx, score: m.score, filled: vals.length });
    roleOf[h.idx] = role;
  }

  const mapping = {};
  for (const [role, list] of Object.entries(candidates)) {
    if (role === 'phone') {
      mapping.phone = list.map((c) => ({ ...c, st: phoneStats(rows, c.idx) }))
        .sort((a, b) => b.st.valid - a.st.valid || b.st.mobile - a.st.mobile || a.idx - b.idx).map((c) => c.idx);
    } else if (MULTI_ROLES.has(role)) {
      mapping[role] = list.map((c) => c.idx).sort((a, b) => a - b);
    } else {
      // عند التعادل: العمود الأغنى بالقيم المختلفة أدق (Job Title "معلم مساعد" أدق من Job title "معلم" للجميع).
      for (const c of list) c.distinct = new Set(columnValues(rows, c.idx)).size;
      list.sort((a, b) => b.score - a.score || b.distinct - a.distinct || b.filled - a.filled || a.idx - b.idx);
      mapping[role] = list[0].idx;
    }
  }

  // عمود بلا عنوان معروف لكن أغلب قيمه أرقام جوال صالحة.
  const used = new Set(Object.keys(roleOf).map(Number));
  for (const h of headers) {
    if (used.has(h.idx)) continue;
    const st = phoneStats(rows, h.idx);
    if (st.filled >= Math.max(1, rows.length * 0.5) && st.mobile / st.filled >= 0.6) (mapping.phone ||= []).push(h.idx);
    else {
      const vals = columnValues(rows, h.idx);
      if (mapping.email == null && vals.length >= rows.length * 0.5 && vals.filter(isEmail).length / vals.length >= 0.6) mapping.email = h.idx;
    }
  }
  return mapping;
}

/** يحوّل mapping إلى "عمود ← دور" لعرض القوائم المنسدلة. */
export function mappingByColumn(mapping) {
  const out = {};
  for (const [role, v] of Object.entries(mapping)) for (const idx of [].concat(v)) out[idx] = role;
  return out;
}

export function mappingFromColumns(byCol, rows) {
  const m = {};
  for (const [idx, role] of Object.entries(byCol)) {
    if (!role) continue;
    const i = Number(idx);
    if (role === 'phone' || MULTI_ROLES.has(role)) (m[role] ||= []).push(i);
    else if (m[role] == null) m[role] = i;
  }
  if (m.phone && rows) m.phone.sort((a, b) => phoneStats(rows, b).valid - phoneStats(rows, a).valid || a - b);
  for (const r of Object.keys(m)) if (MULTI_ROLES.has(r) && r !== 'phone') m[r].sort((a, b) => a - b);
  return m;
}

/** 'm' | 'f' | '' من قيم مثل "Male ذكر" و"Female أنثى" و"M" و"أنثى". */
export function parseGender(v) {
  const s = normalizeText(v);
  if (!s) return '';
  if (/(^| )(female|f|انثي|انثى|مونث|مؤنث|ا|أ)( |$)/.test(s) || s.includes('female') || s.includes('انثي')) return 'f';
  if (/(^| )(male|m|ذكر|مذكر|ذ)( |$)/.test(s)) return 'm';
  return '';
}

// ───────────── الأسماء ─────────────

export function cleanName(s) {
  return cleanCell(s).replace(/\*/g, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

/** تقسيم الاسم الكامل مع إبقاء المركّبات (عبد، أبو، ال، الله، الدين) معاً. */
export function splitFullName(full) {
  const raw = cleanName(full).split(' ').filter(Boolean);
  const tokens = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    const nw = normalizeText(w);
    if ((nw === 'الله' || nw === 'الدين') && tokens.length) { tokens[tokens.length - 1] += ' ' + w; continue; }
    if ((nw === 'عبد' || nw === 'ابو' || nw === 'ال' || nw === 'بن' || nw === 'بني') && i + 1 < raw.length) {
      raw[i + 1] = w + (nw === 'ال' ? '' : ' ') + raw[i + 1];
      continue;
    }
    tokens.push(w);
  }
  const p = { first: tokens[0] || '', father: '', grand: '', last: '' };
  if (tokens.length === 2) p.last = tokens[1];
  else if (tokens.length === 3) { p.father = tokens[1]; p.last = tokens[2]; }
  else if (tokens.length >= 4) { p.father = tokens[1]; p.grand = tokens[2]; p.last = tokens.slice(3).join(' '); }
  return p;
}

function getVal(row, idx) { return idx == null ? '' : cleanCell(row.cells[idx]); }
function getText(row, idx) { const v = getVal(row, idx); return v === '0' ? '' : v; }

function nameParts(row, m) {
  let p = { first: cleanName(getVal(row, m.first)), father: cleanName(getVal(row, m.father)),
    grand: cleanName(getVal(row, m.grand)), last: cleanName(getVal(row, m.last)) };
  let full = cleanName(getVal(row, m.full));
  if (!p.first && !p.last && full) p = splitFullName(full);
  if (!p.first && !p.last && !full) {
    const enFull = cleanName(getVal(row, m.en_full));
    p = { first: cleanName(getVal(row, m.en_first)), father: '', grand: '', last: cleanName(getVal(row, m.en_last)) };
    if (!p.first && !p.last && enFull) p = splitFullName(enFull);
    full = enFull;
  }
  if (!full) full = [p.first, p.father, p.grand, p.last].filter(Boolean).join(' ');
  return { ...p, full };
}

const TOKEN_RE = /\{(prefix|n|first|father|grand|last|full|col:[A-Z]{1,3})\}/g;
const SEP_ONLY = /^[\s\-|_.,:،]*$/;

/** يملأ القالب؛ الرمز الفارغ يُحذف مع الفاصل الملاصق له. */
export function renderTemplate(template, values) {
  const items = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    if (m.index > last) items.push({ lit: template.slice(last, m.index) });
    items.push({ tok: m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) items.push({ lit: template.slice(last) });

  let out = '', pending = '', kept = false, skipLit = false;
  for (const it of items) {
    if (it.lit != null) {
      if (skipLit) { skipLit = false; if (SEP_ONLY.test(it.lit)) continue; }
      pending += it.lit;
      continue;
    }
    const val = String(values[it.tok] ?? '').trim();
    if (val) {
      if (kept || !SEP_ONLY.test(pending)) out += pending;
      out += val; kept = true; pending = '';
    } else {
      skipLit = true;
    }
  }
  if (!SEP_ONLY.test(pending)) out += pending;
  return out.replace(/\s+/g, ' ').trim();
}

export const NAME_FORMATS = {
  first_last: '{first} {last}',
  first_father_last: '{first} {father} {last}',
  full: '{full}',
};

export function templateFromOptions(o) {
  if (o.customTemplate) return o.customTemplate;
  const name = NAME_FORMATS[o.nameFormat] || NAME_FORMATS.first_last;
  const pre = o.numbering ? '{prefix}-{n}' : '{prefix}';
  return o.position === 'after' ? `${name}${o.sep}${pre}` : `${pre}${o.sep}${name}`;
}

function widenTemplate(t, step) {
  if (step >= 1 && !t.includes('{father}') && !t.includes('{full}')) t = t.replace('{last}', '{father} {last}');
  if (step >= 2 && !t.includes('{grand}') && !t.includes('{full}')) t = t.replace('{last}', '{grand} {last}');
  return t;
}

// ───────────── بناء جهات الاتصال ─────────────

export const DEFAULT_OPTIONS = {
  prefix: '', sep: ' ', position: 'before', numbering: false, nameFormat: 'first_last', customTemplate: '',
  secondPhone: true, vcardVersion: '3.0',
  fields: { email: true, org: true, title: true, note: true, nid: false, ministry: false, dob: false },
};

/**
 * overrides: { names: {rowNum: name}, excluded: {rowNum: true}, emails: {rowNum: email}, included: {rowNum:true} }
 */
export function buildContacts(analysis, options = {}, overrides = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options, fields: { ...DEFAULT_OPTIONS.fields, ...(options.fields || {}) } };
  const m = analysis.mapping;
  const rows = analysis.rows;
  const names = overrides.names || {}, excludedManual = overrides.excluded || {}, emails = overrides.emails || {};
  const width = String(rows.length).length;
  const template = templateFromOptions(o);

  const contacts = rows.map((row, i) => {
    const serialRaw = getVal(row, m.serial);
    const serial = /^\d+$/.test(toLatinDigits(serialRaw)) ? toLatinDigits(serialRaw) : String(i + 1);
    const c = { rowNum: row.rowNum, serial, n: serial.padStart(width, '0'), warnings: [], notes: [], phones: [], invalidPhones: [] };
    c.parts = nameParts(row, m);

    // الأرقام: العمود الأساسي أولاً، دون تكرار.
    const seen = new Set();
    (m.phone || []).forEach((idx) => {
      for (const p of parsePhoneCell(row.cells[idx])) {
        if (p.kind === 'invalid') { c.invalidPhones.push({ col: colLetter(idx), raw: p.raw }); continue; }
        if (seen.has(p.e164)) continue;
        seen.add(p.e164); c.phones.push({ ...p, col: colLetter(idx) });
      }
    });
    if (!o.secondPhone && c.phones.length > 1) c.phones = c.phones.slice(0, 1);
    if (c.phones.length > 1) c.warnings.push(`رقمان صالحان مختلفان (${c.phones.map((p) => p.display).join(' و ')})`);
    if (c.phones.some((p) => p.kind === 'landline')) c.warnings.push('رقم أرضي');
    if (c.phones.length && c.invalidPhones.length) c.notes.push(`رقم غير صالح أُهمل: ${c.invalidPhones.map((p) => `${p.raw} (${p.col})`).join('، ')}`);

    // البريد
    const emailRaw = emails[row.rowNum] ?? getText(row, m.email);
    c.email = ''; c.emailInvalid = ''; c.emailSuggestion = '';
    if (emailRaw) {
      if (isEmail(emailRaw)) c.email = emailRaw;
      else { c.emailInvalid = emailRaw; c.emailSuggestion = suggestEmailFix(emailRaw); c.warnings.push(`بريد غير صالح: ${emailRaw}`); }
    }

    c.org = getText(row, m.org);
    c.gender = parseGender(getVal(row, m.gender));
    c.title = [getText(row, m.title), getText(row, m.specialty)].filter(Boolean).join(' - ');
    c.group = getText(row, m.group);
    c.region = (m.region || []).map((idx) => getText(row, idx)).filter(Boolean).join(' - ');
    c.sensitive = {};
    for (const r of SENSITIVE_ROLES) c.sensitive[r] = (m[r] || []).map((idx) => getVal(row, idx)).filter(Boolean).join(' / ');
    c.values = { prefix: o.prefix.trim(), n: c.n, ...c.parts };
    for (const h of analysis.headers) c.values['col:' + h.col] = getText(row, h.idx);

    c.manualName = names[row.rowNum] ? String(names[row.rowNum]).trim() : '';
    c.manualExcluded = !!excludedManual[row.rowNum];
    if (!c.parts.first && !c.parts.last && !c.parts.full) c.noName = true;
    return c;
  });

  // الأسماء مع ضمان التفرّد.
  const render = (c, step) => c.manualName || (c.noName
    ? renderTemplate('{prefix} بدون اسم {n}', c.values)
    : renderTemplate(widenTemplate(template, step), c.values));
  contacts.forEach((c) => { c.name = render(c, 0); });
  for (let step = 1; step <= 3; step++) {
    const groups = {};
    contacts.forEach((c) => { if (!c.manualName) (groups[c.name] ||= []).push(c); });
    const dups = Object.values(groups).filter((g) => g.length > 1);
    if (!dups.length) break;
    for (const g of dups) {
      if (step < 3) g.forEach((c) => { c.name = render(c, step); });
      else g.forEach((c, k) => { if (k > 0) c.name = `${c.name} (${k + 1})`; });
    }
  }
  contacts.forEach((c) => { if (c.noName) c.warnings.push('لا يوجد اسم'); });

  // الحالة
  contacts.forEach((c) => {
    if (c.manualExcluded) c.status = 'excluded';
    else if (!c.phones.length) {
      c.status = 'excluded';
      c.warnings.unshift(c.invalidPhones.length ? `لا رقم صالح: ${c.invalidPhones.map((p) => p.raw).join('، ')}` : 'لا يوجد رقم');
    }
  });

  // نفس الرقم عند أكثر من شخص
  const byPhone = {};
  contacts.forEach((c) => { if (c.status !== 'excluded') c.phones.forEach((p) => (byPhone[p.e164] ||= []).push(c)); });
  for (const list of Object.values(byPhone)) {
    if (list.length < 2) continue;
    list.forEach((c) => c.warnings.push(`الرقم مكرر مع: ${list.filter((x) => x !== c).map((x) => x.name).join('، ')}`));
  }

  contacts.forEach((c) => { if (!c.status) c.status = c.warnings.length ? 'warn' : 'ready'; });

  const counts = { total: contacts.length, ready: 0, warn: 0, excluded: 0 };
  contacts.forEach((c) => { counts[c.status]++; });
  counts.exported = counts.ready + counts.warn;
  return { contacts, counts, template, options: o };
}

// ───────────── vCard ─────────────

export function escapeVCard(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function uidFor(prefix, c) {
  const p = (prefix || 'c').replace(/[^A-Za-z0-9\u0600-\u06FF-]/g, '') || 'c';
  return `${p}-${c.phones[0].e164.replace('+', '')}`;
}

export function contactNoteLines(c, o) {
  const lines = [];
  if (c.parts.full && c.parts.full !== c.name) lines.push(c.parts.full);
  const group = c.group || o.prefix;
  if (group) lines.push(`الشعبة: ${group}`);
  if (c.region) lines.push(`المنطقة: ${c.region}`);
  if (o.fields.nid && c.sensitive.nid) lines.push(`الرقم الوطني: ${c.sensitive.nid}`);
  if (o.fields.ministry && c.sensitive.ministry) lines.push(`الرقم الوزاري: ${c.sensitive.ministry}`);
  if (o.fields.dob && c.sensitive.dob) lines.push(`تاريخ الميلاد: ${c.sensitive.dob}`);
  return lines;
}

export function buildVCard(result) {
  const { contacts, options: o } = result;
  const v21 = o.vcardVersion === '2.1';
  const cs = v21 ? ';CHARSET=UTF-8' : '';
  const out = [];
  for (const c of contacts) {
    if (c.status === 'excluded') continue;
    const lines = ['BEGIN:VCARD', `VERSION:${v21 ? '2.1' : '3.0'}`];
    lines.push(`FN${cs}:${escapeVCard(c.name)}`);
    lines.push(`N${cs}:;${escapeVCard(c.name)};;;`);
    c.phones.forEach((p, i) => {
      const type = p.kind === 'landline' ? 'VOICE' : 'CELL';
      lines.push(v21 ? `TEL;${type}${i === 0 ? ';PREF' : ''}:${p.e164}` : `TEL;TYPE=${type}${i === 0 ? ',PREF' : ''}:${p.e164}`);
    });
    if (o.fields.email && c.email) lines.push(v21 ? `EMAIL;INTERNET:${c.email}` : `EMAIL;TYPE=INTERNET:${escapeVCard(c.email)}`);
    if (o.fields.org && c.org) lines.push(`ORG${cs}:${escapeVCard(c.org)}`);
    if (o.fields.title && c.title) lines.push(`TITLE${cs}:${escapeVCard(c.title)}`);
    if (o.fields.note) {
      const note = contactNoteLines(c, o);
      if (note.length) lines.push(`NOTE${cs}:${escapeVCard(note.join('\n'))}`);
    }
    if (o.prefix.trim()) lines.push(`CATEGORIES${cs}:${escapeVCard(o.prefix.trim())}`);
    lines.push(`UID:${uidFor(o.prefix, c)}`);
    lines.push('END:VCARD');
    out.push(lines.join('\r\n'));
  }
  return out.length ? out.join('\r\n') + '\r\n' : '';
}

export function vcfFileName(prefix, date = new Date()) {
  const d = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const p = (prefix || '').trim();
  return /^[A-Za-z0-9-]+$/.test(p) ? `${p}_contacts_${d}.vcf` : `contacts_${d}.vcf`;
}

// ───────────── الجهاز ─────────────

export function detectDevice(ua = '', maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
