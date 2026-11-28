// Tests the SMS (DLT) message template helpers. Run from web/:  node scripts/test-messaging.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-test-'));
const source = fs.readFileSync(path.join(web, 'src/modules/messaging/template.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const file = path.join(out, 'template.mjs');
fs.writeFileSync(file, outputText);
const t = await import(pathToFileURL(file));

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

test('each placeholder becomes {#var#} and the order keeps every occurrence', () => {
  const { text, order } = t.toDltTemplate('Hi {name}, zone {zone}. {name} report at {briefing_time}. {unknown} stays.');
  assert.equal(text, 'Hi {#var#}, zone {#var#}. {#var#} report at {#var#}. {unknown} stays.');
  assert.deepEqual(order, ['name', 'zone', 'name', 'briefing_time']);
});

test('default template is short, plain text and has no unknown placeholders', () => {
  assert.deepEqual(t.unknownPlaceholders(t.DEFAULT_TEMPLATE_BODY), []);
  const { order } = t.toDltTemplate(t.DEFAULT_TEMPLATE_BODY);
  assert.ok(order.length >= 6);
  const longest = Object.fromEntries(order.map(key => [key, 'X'.repeat(t.DLT_VAR_MAX)]));
  const seg = t.smsSegments(t.render(t.DEFAULT_TEMPLATE_BODY, longest));
  assert.equal(seg.unicode, false);
  assert.ok(seg.parts <= 3, `worst case ${seg.parts} parts`);
  assert.ok(t.smsSegments(t.render(t.DEFAULT_TEMPLATE_BODY, t.SAMPLE_VALUES)).parts <= 2);
});

test('unknown placeholders are reported', () => {
  assert.deepEqual(t.unknownPlaceholders('Hi {nmae} in {zone} {sectr}'), ['nmae', 'sectr']);
});

test('variables follow template order, blanks become "To be informed", text is cleaned', () => {
  const vars = t.buildVariables(['name', 'point', 'zone'], { name: 'K. RAMESH', point: '  ', zone: 'Zone 2:\nVenues\t   x' });
  assert.equal(vars, 'K. RAMESH|To be informed|Zone 2: Venues x');
});

test('a "|" in a value cannot shift the variables', () => {
  const vars = t.buildVariables(['name', 'zone'], { name: 'A | B', zone: 'Z' });
  assert.equal(vars.split('|').length, 2);
  assert.equal(vars, 'A / B|Z');
});

test('values longer than 30 characters are cut and reported', () => {
  const long = 'Sri Venkateswara University Main Gate (North)';
  assert.equal(t.variableValue({ point: long }, 'point').length <= t.DLT_VAR_MAX, true);
  assert.equal(t.variableValue({ point: long }, 'point'), long.slice(0, 30).trimEnd());
  assert.deepEqual(t.truncatedFields(['name', 'point', 'point'], { name: 'A', point: long }), ['point']);
  assert.ok(t.render('At {point}', { point: long }).length <= 3 + t.DLT_VAR_MAX);
});

test('typographic characters are made plain so the SMS stays at 160 characters a part', () => {
  assert.equal(t.toSmsText('Zone 2 – Venues “gate” it’s…'), 'Zone 2 - Venues "gate" it\'s...');
  assert.equal(t.smsSegments(t.render('{zone}', { zone: 'Zone 2 – Venues' })).unicode, false);
});

test('SMS part counting', () => {
  assert.deepEqual(t.smsSegments(''), { characters: 0, parts: 0, unicode: false });
  assert.equal(t.smsSegments('a'.repeat(160)).parts, 1);
  assert.equal(t.smsSegments('a'.repeat(161)).parts, 2);
  assert.equal(t.smsSegments('a'.repeat(306)).parts, 2);
  assert.equal(t.smsSegments('a'.repeat(307)).parts, 3);
  assert.equal(t.smsSegments('[]').characters, 4, 'extended characters count twice');
  const telugu = t.smsSegments('నమస్కారం');
  assert.equal(telugu.unicode, true);
  assert.equal(t.smsSegments('అ'.repeat(70)).parts, 1);
  assert.equal(t.smsSegments('అ'.repeat(71)).parts, 2);
});

test('render fills values and keeps unknown placeholders as typed', () => {
  assert.equal(t.render('Dear {name} ({rank}) {foo} {point}', { name: 'A', rank: 'PC' }), 'Dear A (PC) {foo} To be informed');
});

test('Indian mobile normalisation', () => {
  assert.equal(t.normalizeIndianMobile('9000000000'), '919000000000');
  assert.equal(t.normalizeIndianMobile('+91 90000 00000'), '919000000000');
  assert.equal(t.normalizeIndianMobile('919000000000'), '919000000000');
  assert.equal(t.normalizeIndianMobile('09000000000'), '919000000000');
  assert.equal(t.normalizeIndianMobile('5000000000'), null, 'must start 6-9');
  assert.equal(t.normalizeIndianMobile('900000000'), null, 'too short');
  assert.equal(t.normalizeIndianMobile(''), null);
  assert.equal(t.normalizeIndianMobile(null), null);
});

test('briefing: sector override wins over the zone briefing', () => {
  const briefings = [
    { zone: 'Venues', sector: null, briefing_date: '2026-11-27', briefing_time: '16:00', venue: 'IISER Auditorium' },
    { zone: 'Venues', sector: 'Sector 2', briefing_date: '2026-11-27', briefing_time: '10:30', venue: 'IIT Hall' },
  ];
  assert.equal(t.briefingFor(briefings, 'Venues', 'Sector 2').venue, 'IIT Hall');
  assert.equal(t.briefingFor(briefings, 'Venues', 'Sector 1').venue, 'IISER Auditorium');
  assert.equal(t.briefingFor(briefings, 'Routes', 'Sector 1'), undefined);
  assert.equal(t.briefingFor(briefings, null, null), undefined);
});

test('briefing date and time formatting', () => {
  assert.equal(t.formatBriefingDate('2026-11-27'), '27 Nov 2026');
  assert.equal(t.formatBriefingTime('16:00'), '4:00 PM');
  assert.equal(t.formatBriefingTime('09:05'), '9:05 AM');
  assert.equal(t.formatBriefingTime('00:30'), '12:30 AM');
  assert.equal(t.formatBriefingTime('12:00'), '12:00 PM');
  assert.equal(t.formatBriefingDate(null), '');
});

fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} tests passed`);
