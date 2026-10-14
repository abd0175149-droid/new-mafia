import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGrid, buildContacts, colLetter, cleanCell } from '../public/core.js';
import { fileColumns, recipientValues, renderMessage, templateTokens, waLink } from '../public/template.js';
import { buildFixture } from './fixture.js';

// تفاصيل ملف كما يعيدها الخادم للأدمن
function fixtureDetail() {
  const grid = buildFixture();
  const a = analyzeGrid(grid);
  const res = buildContacts(a, { prefix: 'G119' });
  const mapping = {};
  for (const [r, v] of Object.entries(a.mapping)) mapping[r] = Array.isArray(v) ? v.map(colLetter) : colLetter(v);
  return {
    sheet_name: 'G119', prefix: 'G119',
    sheets: [{ name: 'G119', grid: grid.map((r) => r.map((v) => (typeof v === 'number' ? String(v) : v))) }],
    analysis: { headerRow: a.headerRow + 1, headers: a.headers.map((h) => ({ col: h.col, label: h.label })), mapping },
    contacts: res.contacts.map((c) => ({ rowNum: c.rowNum, name: c.name, full: c.parts.full, phones: c.phones.map((p) => p.e164) })),
  };
}

test('template variables come from the sheet row of each student', () => {
  const d = fixtureDetail();
  const cols = fileColumns(d);
  assert.ok(cols.find((c) => c.key === 'Ministry Number'));
  // العنوان المكرر بحروف مختلفة يأخذ حرف العمود
  assert.ok(cols.find((c) => c.key === 'Job title (P)'));
  assert.ok(cols.find((c) => c.key === 'Job Title (Q)'));
  const v = recipientValues(d, d.contacts[0], cols);
  assert.equal(v['الاسم الأول'], 'محمد');
  assert.equal(v['اسم العائلة'], 'العلي');
  assert.equal(v['Ministry Number'], '1001');
  assert.equal(v.specialty, 'علوم');
  assert.equal(v['الرقم'], '0790001007');
  assert.equal(v['الشعبة'], 'G119');
  const c16 = d.contacts.find((c) => c.rowNum === 21);
  assert.equal(recipientValues(d, c16, cols)['الاسم الأول'], 'ضيف الله');
});

test('renderMessage fills values, fallbacks, and reports problems', () => {
  const r = renderMessage('مرحباً {الاسم الأول}،\nرقمك الوزاري: *{Ministry Number}*\n{مجهول} {فارغ|—} {فارغ2}', {
    'الاسم الأول': 'سارة', 'Ministry Number': '1001', 'فارغ': '', 'فارغ2': '',
  });
  assert.equal(r.text, 'مرحباً سارة،\nرقمك الوزاري: *1001*\n{مجهول} —');
  assert.deepEqual(r.missing, ['مجهول']);
  assert.deepEqual(r.empty, ['فارغ2']);
  assert.deepEqual(templateTokens('{a} {b|x} {a}'), ['a', 'b']);
});

test('waLink encodes the message', () => {
  assert.equal(waLink('+962790001007', 'مرحبا & أهلاً'), 'https://wa.me/962790001007?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20%26%20%D8%A3%D9%87%D9%84%D8%A7%D9%8B');
  assert.equal(waLink('+962790001007'), 'https://wa.me/962790001007');
});
