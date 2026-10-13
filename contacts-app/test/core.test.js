import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone, parsePhoneCell, cleanCell, detectHeaderRow, analyzeGrid, buildContacts, buildVCard,
  renderTemplate, splitFullName, suggestEmailFix, colLetter, colIndex, vcfFileName, prefixFromFileName,
  templateFromOptions, DEFAULT_OPTIONS, detectDevice,
} from '../public/core.js';

import { buildFixture } from './fixture.js';

test('normalizePhone handles every format in the sheet', () => {
  assert.equal(normalizePhone(781234567).e164, '+962781234567');
  assert.equal(normalizePhone(962781234567).e164, '+962781234567');
  assert.equal(normalizePhone('9620781234567').e164, '+962781234567');
  assert.equal(normalizePhone('0781234567').e164, '+962781234567');
  assert.equal(normalizePhone('00962 78 123 4567').e164, '+962781234567');
  assert.equal(normalizePhone('+962-78-123-4567').e164, '+962781234567');
  assert.equal(normalizePhone('٠٧٨١٢٣٤٥٦٧').e164, '+962781234567');
  assert.equal(normalizePhone(781234567).display, '078 123 4567');
  assert.equal(normalizePhone(781234).kind, 'invalid');
  assert.equal(normalizePhone('065123456').kind, 'landline');
  assert.equal(normalizePhone('065123456').e164, '+96265123456');
  assert.equal(normalizePhone('0761234567').kind, 'invalid');
  assert.equal(normalizePhone(9.62781234567e11).e164, '+962781234567');
});

test('parsePhoneCell splits several numbers in one cell', () => {
  const ps = parsePhoneCell('0791234567 / 0781234567، 0771234567');
  assert.deepEqual(ps.map((p) => p.e164), ['+962791234567', '+962781234567', '+962771234567']);
});

test('cleanCell drops excel errors, invisible chars and tatweel', () => {
  for (const e of ['#N/A', '#VALUE!', '#SPILL!', '########', '#REF!']) assert.equal(cleanCell(e), '');
  assert.equal(cleanCell('  سـارة‏  العلي '), 'سارة العلي');
  assert.equal(cleanCell(962781234567), '962781234567');
});

test('detects the header row and columns by meaning, not by position', () => {
  const grid = buildFixture();
  assert.equal(detectHeaderRow(grid), 4);
  const a = analyzeGrid(grid, { fileName: 'كشف.xlsx' });
  const L = (i) => colLetter(i);
  assert.equal(a.rows.length, 45);
  assert.equal(L(a.mapping.first), 'E');
  assert.equal(L(a.mapping.father), 'F');
  assert.equal(L(a.mapping.grand), 'G');
  assert.equal(L(a.mapping.last), 'H');
  assert.equal(L(a.mapping.full), 'D');
  assert.deepEqual(a.mapping.phone.map(L), ['V', 'U']);
  assert.equal(L(a.mapping.email), 'AD');
  assert.equal(L(a.mapping.org), 'AB');
  assert.equal(L(a.mapping.title), 'Q');
  assert.equal(L(a.mapping.specialty), 'AA');
  assert.deepEqual(a.mapping.region.map(L), ['S', 'T']);
  assert.equal(L(a.mapping.group), 'AG');
  assert.deepEqual(a.mapping.nid.map(L), ['B']);
  assert.deepEqual(a.mapping.ministry.map(L), ['O']);
  assert.deepEqual(a.mapping.dob.map(L), ['W']);
  assert.equal(L(a.mapping.serial), 'A');
  assert.equal(a.prefixSuggestion, 'G119');
  assert.equal(a.meta.count, 45);
  assert.equal(a.meta.group, 'G119');
});

test('builds the expected 43 ready / 2 warn / 0 excluded', () => {
  const a = analyzeGrid(buildFixture());
  const res = buildContacts(a, { prefix: a.prefixSuggestion });
  assert.deepEqual({ ...res.counts }, { total: 45, ready: 43, warn: 2, excluded: 0, exported: 45 });
  const warn = res.contacts.filter((c) => c.status === 'warn').map((c) => c.serial);
  assert.deepEqual(warn, ['12', '34']);
  const c12 = res.contacts.find((c) => c.serial === '12');
  assert.equal(c12.phones.length, 2);
  const c34 = res.contacts.find((c) => c.serial === '34');
  assert.equal(c34.emailSuggestion, 'user34@gmail.com');
  const c5 = res.contacts.find((c) => c.serial === '5');
  assert.equal(c5.status, 'ready');
  assert.equal(c5.phones.length, 1);
  assert.equal(c5.notes.length, 1);
  const c16 = res.contacts.find((c) => c.serial === '16');
  assert.ok(c16.name.startsWith('G119 ضيف الله '));
  const c4 = res.contacts.find((c) => c.serial === '4');
  assert.equal(c4.name, 'G119 هبة أبو زيد4');
  const c9 = res.contacts.find((c) => c.serial === '9');
  assert.equal(c9.title, 'علوم');
  const c1 = res.contacts.find((c) => c.serial === '1');
  assert.equal(c1.title, 'معلم مساعد - علوم');
  assert.equal(c1.phones[0].e164, '+962790001007');
  assert.equal(new Set(res.contacts.map((c) => c.name)).size, 45);
});

test('vCard 3.0 output', () => {
  const a = analyzeGrid(buildFixture());
  const res = buildContacts(a, { prefix: 'G119' });
  const vcf = buildVCard(res);
  assert.equal((vcf.match(/BEGIN:VCARD/g) || []).length, 45);
  assert.ok(vcf.includes('\r\n'));
  assert.ok(!vcf.startsWith('﻿'));
  const card = vcf.split('END:VCARD')[0];
  assert.match(card, /FN:G119 محمد العلي\r\n/);
  assert.match(card, /N:;G119 محمد العلي;;;\r\n/);
  assert.match(card, /TEL;TYPE=CELL,PREF:\+962790001007\r\n/);
  assert.match(card, /EMAIL;TYPE=INTERNET:user1@gmail\.com/);
  assert.match(card, /TITLE:معلم مساعد - علوم/);
  assert.match(card, /CATEGORIES:G119/);
  assert.match(card, /UID:G119-962790001007/);
  assert.doesNotMatch(vcf, /9900000001/); // الرقم الوطني لا يُصدَّر افتراضياً
  assert.doesNotMatch(vcf, /gmail-com/);
  const withNid = buildVCard(buildContacts(a, { prefix: 'G119', fields: { nid: true } }));
  assert.match(withNid, /الرقم الوطني: 9900000001/);
});

test('excluded rows are not exported; manual edits win', () => {
  const a = analyzeGrid(buildFixture());
  const res = buildContacts(a, { prefix: 'G119' }, { excluded: { 6: true }, names: { 7: 'اسم يدوي' } });
  assert.equal(res.counts.excluded, 1);
  assert.equal(res.contacts[0].status, 'excluded');
  assert.equal(res.contacts[1].name, 'اسم يدوي');
  assert.equal((buildVCard(res).match(/BEGIN:VCARD/g) || []).length, 44);
});

test('rows without a valid phone are excluded and duplicates are flagged', () => {
  const grid = [
    ['الاسم', 'الجوال'],
    ['سارة أحمد العلي', '0791111111'],
    ['ليلى أحمد العلي', '0791111111'],
    ['خالد', '1234'],
    ['', '0782222222'],
  ];
  const res = buildContacts(analyzeGrid(grid), { prefix: 'A1' });
  assert.deepEqual(res.contacts.map((c) => c.status), ['warn', 'warn', 'excluded', 'warn']);
  assert.equal(res.contacts[3].name, 'A1 بدون اسم 4');
});

test('identical names get the father name, then a counter', () => {
  const grid = [
    ['الاسم الاول', 'اسم الاب', 'اسم العائلة', 'هاتف'],
    ['سارة', 'أحمد', 'العلي', '0791111111'],
    ['سارة', 'محمد', 'العلي', '0792222222'],
    ['سارة', 'محمد', 'العلي', '0793333333'],
  ];
  const res = buildContacts(analyzeGrid(grid), { prefix: 'G1' });
  assert.deepEqual(res.contacts.map((c) => c.name), ['G1 سارة أحمد العلي', 'G1 سارة محمد العلي', 'G1 سارة محمد العلي (2)']);
});

test('template rendering removes empty tokens with their separator', () => {
  assert.equal(renderTemplate('{prefix} {first} {last}', { prefix: '', first: 'سارة', last: 'العلي' }), 'سارة العلي');
  assert.equal(renderTemplate('{first} {father} {last}', { first: 'سارة', father: '', last: 'العلي' }), 'سارة العلي');
  assert.equal(renderTemplate('{prefix}-{n} {first}', { prefix: 'G119', n: '07', first: 'سارة' }), 'G119-07 سارة');
  assert.equal(renderTemplate('{first} {last} | {prefix}', { first: 'سارة', last: 'العلي', prefix: '' }), 'سارة العلي');
  assert.equal(templateFromOptions({ ...DEFAULT_OPTIONS, position: 'after', sep: ' - ' }), '{first} {last} - {prefix}');
});

test('splitFullName keeps compounds together', () => {
  assert.deepEqual(splitFullName('عبد الرحمن محمد أبو زيد'), { first: 'عبد الرحمن', father: 'محمد', grand: '', last: 'أبو زيد' });
  assert.deepEqual(splitFullName('سارة ضيف الله نور الدين العلي'), { first: 'سارة', father: 'ضيف الله', grand: 'نور الدين', last: 'العلي' });
});

test('helpers', () => {
  assert.equal(suggestEmailFix('a@gmial.com'), 'a@gmail.com');
  assert.equal(suggestEmailFix('a@hotmial.com'), 'a@hotmail.com');
  assert.equal(colLetter(29), 'AD');
  assert.equal(colIndex('AD'), 29);
  assert.equal(vcfFileName('G119', new Date(2026, 9, 13)), 'G119_contacts_2026-10-13.vcf');
  assert.equal(vcfFileName('شعبة', new Date(2026, 9, 13)), 'contacts_2026-10-13.vcf');
  assert.equal(prefixFromFileName('كشف_G119-2026.xlsx'), 'G119');
  assert.equal(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios');
  assert.equal(detectDevice('Mozilla/5.0 (Linux; Android 14)'), 'android');
});
