// Tests the bandobast deployment logic: ASI/HC selection ratios, rank groups, DOB parsing and
// the lenient roster duty parser. Run from web/:  node scripts/test-deployment.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-test-'));

// Transpile the pure TypeScript modules into a temp folder (no path aliases in these files).
function load(relative, name) {
  const source = fs.readFileSync(path.join(web, relative), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, resolveJsonModule: true },
  });
  const file = path.join(out, name);
  fs.writeFileSync(file, outputText.replace("from './bandobast-points.json'", "from './bandobast-points.json' with { type: 'json' }")
    .replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'"));
  return file;
}
fs.copyFileSync(path.join(web, 'src/core/domain/bandobast-points.json'), path.join(out, 'bandobast-points.json'));
const selection = await import(pathToFileURL(load('src/modules/deployment/selection.ts', 'selection.mjs')));
const ranks = await import(pathToFileURL(load('src/core/domain/ranks.ts', 'ranks.mjs')));
const age = await import(pathToFileURL(load('src/lib/officer-age.ts', 'officer-age.mjs')));
const zones = await import(pathToFileURL(load('src/core/domain/police-zones.ts', 'police-zones.mjs')));
const req = await import(pathToFileURL(load('src/core/domain/scheme-requirements.ts', 'scheme-requirements.mjs')));
const sheet = await import(pathToFileURL(load('src/core/domain/deployment-sheet.ts', 'deployment-sheet.mjs')));
load('src/core/domain/police-print-scope.ts', 'police-print-scope.mjs');
const instr = await import(pathToFileURL(load('src/core/domain/duty-instructions.ts', 'duty-instructions.mjs')));

let seed = 7;
const random = max => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log('ok -', name); };

test('ASI/HC targets for 200 follow 20/5/70/5 and 40:60 old:young', () => {
  const t = Object.fromEntries(selection.asiHcTargets(200).map(b => [`${b.rank}|${b.band}`, b.target]));
  assert.deepEqual(t, {
    'ASI|OLD': 16, 'ASI|YOUNG': 24, 'WASI|OLD': 4, 'WASI|YOUNG': 6,
    'HC|OLD': 56, 'HC|YOUNG': 84, 'WHC|OLD': 4, 'WHC|YOUNG': 6,
  });
  for (const n of [1, 7, 33, 199, 201, 1000]) {
    assert.equal(selection.asiHcTargets(n).reduce((s, b) => s + b.target, 0), n);
  }
});

function pool(spec) {
  const list = [];
  for (const [rank, old, young, unknown = 0] of spec) {
    for (let i = 0; i < old; i++) list.push({ id: `${rank}-o${i}`, rank, age: 50 });
    for (let i = 0; i < young; i++) list.push({ id: `${rank}-y${i}`, rank, age: 30 });
    for (let i = 0; i < unknown; i++) list.push({ id: `${rank}-u${i}`, rank, age: null });
  }
  return list;
}

test('ample pool → exact composition, no duplicates', () => {
  const p = pool([['ASI', 100, 100], ['WASI', 50, 50], ['HC', 300, 300], ['WHC', 50, 50]]);
  const r = selection.selectOfficers(p, 'ASI/HC', 200, 45, random);
  assert.equal(r.selectedIds.length, 200);
  assert.equal(new Set(r.selectedIds).size, 200);
  assert.equal(r.shortfall, 0);
  const comp = selection.compositionOf(p.filter(c => r.selectedIds.includes(c.id)), 45);
  assert.deepEqual(comp.ASI, { OLD: 16, YOUNG: 24, UNKNOWN: 0 });
  assert.deepEqual(comp.HC, { OLD: 56, YOUNG: 84, UNKNOWN: 0 });
  assert.deepEqual(comp.WASI, { OLD: 4, YOUNG: 6, UNKNOWN: 0 });
  assert.deepEqual(comp.WHC, { OLD: 4, YOUNG: 6, UNKNOWN: 0 });
});

test('shortfall fills from other age band, unknown age, then other ASI/HC ranks', () => {
  const p = pool([['ASI', 2, 100], ['WASI', 0, 0, 3], ['HC', 300, 300], ['WHC', 50, 50]]);
  const r = selection.selectOfficers(p, 'ASI/HC', 200, 45, random);
  assert.equal(r.selectedIds.length, 200);
  assert.equal(new Set(r.selectedIds).size, 200);
  assert.ok(r.notes.length > 0);
  const comp = selection.compositionOf(p.filter(c => r.selectedIds.includes(c.id)), 45);
  assert.equal(comp.ASI.OLD, 2);
  assert.equal(comp.WASI.UNKNOWN, 3);
});

test('small pool reports shortfall', () => {
  const r = selection.selectOfficers(pool([['HC', 5, 5]]), 'ASI/HC', 50, 45, random);
  assert.equal(r.selectedIds.length, 10);
  assert.equal(r.shortfall, 40);
});

test('other rank groups are a plain random pick', () => {
  const p = pool([['PC', 0, 500]]);
  const r = selection.selectOfficers(p, 'PC', 200, 45, random);
  assert.equal(r.selectedIds.length, 200);
  assert.equal(new Set(r.selectedIds).size, 200);
  assert.deepEqual(r.buckets, [{ rank: 'PC', band: 'ANY', target: 200, actual: 200 }]);
});

test('ranks: aliases, ASI/HC display, AR ranks', () => {
  assert.equal(ranks.normalizeRank('W.ASI'), 'WASI');
  assert.equal(ranks.normalizeRank('Woman HC'), 'WHC');
  assert.equal(ranks.normalizeRank('Head Constable'), 'HC');
  assert.equal(ranks.normalizeRank('A.R.S.I'), 'ARSI');
  assert.equal(ranks.normalizeRank('AR HC'), 'ARHC');
  assert.equal(ranks.normalizeRank('R.I.'), 'RI');
  assert.equal(ranks.normalizeRank('Additional SP'), 'Addl. SP');
  assert.equal(ranks.normalizeRank('ASP'), 'Addl. SP');
  assert.equal(ranks.normalizeRank('A.S.P'), 'Addl. SP');
  for (const r of ['ASI', 'WASI', 'HC', 'WHC']) assert.equal(ranks.displayRank(r), 'ASI/HC');
  assert.equal(ranks.displayRank('ARHC'), 'ARHC');
  assert.deepEqual(ranks.ranksInGroup('ASI/HC'), ['ASI', 'WASI', 'HC', 'WHC']);
  assert.ok(ranks.isArRank('RSI'));
});

test('DOB and age parsing', () => {
  assert.equal(age.parseDateOfBirth('15-06-1978'), '1978-06-15');
  assert.equal(age.parseDateOfBirth('15/06/1978'), '1978-06-15');
  assert.equal(age.parseDateOfBirth('1978-06-15'), '1978-06-15');
  assert.equal(age.parseDateOfBirth(28656), '1978-06-15');
  assert.equal(age.parseDateOfBirth('31-02-1980'), '');
  assert.equal(age.parseDateOfBirth(''), '');
  assert.equal(age.officerAge({ date_of_birth: '1981-11-26' }, '2026-11-25'), 44);
  assert.equal(age.officerAge({ date_of_birth: '1981-11-25' }, '2026-11-25'), 45);
  assert.equal(age.officerAge({ age_years: 50 }), 50);
  assert.equal(age.parseAgeYears('101'), null);
});

test('duty parser: blank row has no duty and no warning', () => {
  const r = zones.parsePoliceDutyAssignment('', '', '');
  assert.equal(r.police_zone, '');
  assert.equal(r.dutyWarning, '');
});

test('duty parser: zone only', () => {
  const r = zones.parsePoliceDutyAssignment('Zone 2', '', '');
  assert.equal(r.police_zone, 'Venues');
  assert.equal(r.police_sector_number, '');
  assert.equal(r.dutyWarning, '');
});

test('duty parser: zone + roman sector', () => {
  const r = zones.parsePoliceDutyAssignment('2', 'Sector-I', '');
  assert.equal(r.police_sector_number, 'Sector 1');
  assert.equal(r.police_sector_name, 'IISER and its surroundings');
});

test('duty parser: zone + sector + sub-sector code + point name', () => {
  const r = zones.parsePoliceDutyAssignment('Zone 2', 'Sector 1', '', '1(A)', 'IISER main gate (west gate)');
  assert.equal(r.police_sector_name, '1(A) IISER main gate and inside');
  assert.equal(r.police_point_name, 'IISER main gate (west gate)');
  assert.match(r.police_point_code, /^Z2-S1-A-01$/);
  assert.equal(r.dutyWarning, '');
});

test('duty parser: "Sector 1(A)" in the sector cell', () => {
  const r = zones.parsePoliceDutyAssignment('2', 'Sector 1(A)', '');
  assert.equal(r.police_sector_name, '1(A) IISER main gate and inside');
});

test('duty parser: unknown sector keeps zone with a warning (does not block)', () => {
  const r = zones.parsePoliceDutyAssignment('Zone 2', 'Sector 9', '');
  assert.equal(r.police_zone, 'Venues');
  assert.equal(r.police_sector_number, '');
  assert.ok(r.dutyWarning);
});

test('duty parser: unknown zone imports without duty, with a warning', () => {
  const r = zones.parsePoliceDutyAssignment('Zone 42', 'Sector 1', '');
  assert.equal(r.police_zone, '');
  assert.ok(r.dutyWarning);
});

test('seeded points: codes are unique and every entry maps to a scheme sector', () => {
  const points = zones.allDutyPoints();
  assert.ok(points.length > 1000, `expected 1000+ points, got ${points.length}`);
  assert.equal(new Set(points.map(p => p.code)).size, points.length);
  const json = JSON.parse(fs.readFileSync(path.join(web, 'src/core/domain/bandobast-points.json'), 'utf8'));
  assert.equal(points.length, json.points.reduce((s, e) => s + e.points.length, 0));
  for (const entry of json.points) {
    if (entry.subSector) {
      const zone = zones.POLICE_BANDOBUSHT_ZONES.find(z => z.id === entry.zone);
      const sector = zone.sectors.find(s => s.number === entry.sector);
      assert.ok(sector.subSectors.includes(entry.subSector), `${entry.zone} ${entry.sector} missing sub-sector ${entry.subSector}`);
    }
  }
});

test('scheme requirements match the PDF zone and grand totals', () => {
  const zoneTotal = id => Object.entries(req.SCHEME_REQUIREMENTS)
    .filter(([key]) => key.startsWith(id + '|') && key.split('|').length === 2)
    .reduce((sum, [, r]) => sum + req.requirementTotal(r), 0);
  const expected = { 'ZONE-1': 178, 'ZONE-2': 731, 'ZONE-3': 882, 'ZONE-4': 435, 'ZONE-5': 432, 'ZONE-6': 571, 'ZONE-7': 487, 'ZONE-8': 1567 };
  for (const [id, total] of Object.entries(expected)) assert.equal(zoneTotal(id), total, id);
  // Column totals from the PDF summary (zones 1–7) and the zone 8 abstract.
  const column = (col, ids) => Object.entries(req.SCHEME_REQUIREMENTS)
    .filter(([key]) => ids.includes(key.split('|')[0]) && key.split('|').length === 2)
    .reduce((sum, [, r]) => sum + (r[col] ?? 0), 0);
  const z17 = ['ZONE-1', 'ZONE-2', 'ZONE-3', 'ZONE-4', 'ZONE-5', 'ZONE-6', 'ZONE-7'];
  assert.deepEqual(['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI/HC', 'PC', 'WPC', 'HG'].map(c => column(c, z17)),
    [7, 17, 62, 207, 414, 710, 2201, 54, 44]);
  // Sub-sectors add up to their sector.
  for (const prefix of ['ZONE-2|Sector 1', 'ZONE-3|Sector 1']) {
    const subs = Object.entries(req.SCHEME_REQUIREMENTS).filter(([key]) => key.startsWith(prefix + '|'));
    assert.equal(subs.reduce((sum, [, r]) => sum + req.requirementTotal(r), 0), req.requirementTotal(req.SCHEME_REQUIREMENTS[prefix]), prefix);
  }
  // Every key points at a real zone / sector / sub-sector.
  for (const key of Object.keys(req.SCHEME_REQUIREMENTS)) {
    const [id, sectorNumber, sub] = key.split('|');
    const sector = zones.POLICE_BANDOBUSHT_ZONES.find(z => z.id === id)?.sectors.find(s => s.number === sectorNumber);
    assert.ok(sector, key);
    if (sub) assert.ok(sector.subSectors?.includes(sub), key);
  }
  assert.equal(req.schemeRequirement('International Airport, Renigunta', 'Sector 1').DSP, 4);
  assert.equal(req.schemeColumnOf('WHC'), 'ASI/HC');
  assert.equal(req.schemeColumnOf('ARPC'), null);
});

test('force category: explicit values and rank-derived defaults', () => {
  assert.equal(ranks.normalizeForce('Civil ', 'SI'), 'CIVIL');
  assert.equal(ranks.normalizeForce('L&O', 'PC'), 'CIVIL');
  assert.equal(ranks.normalizeForce('Armed Reserve', 'PC'), 'AR');
  assert.equal(ranks.normalizeForce('stf', 'HC'), 'STF');
  assert.equal(ranks.normalizeForce('Special Task Force', 'HC'), 'STF');
  assert.equal(ranks.normalizeForce('APSP', 'PC'), 'OTHERS');
  assert.equal(ranks.normalizeForce('', 'ARPC'), 'AR');
  assert.equal(ranks.normalizeForce('', 'Reserve Inspector'), 'AR');
  assert.equal(ranks.normalizeForce('', 'HC'), 'CIVIL');
});

test('gender: explicit values and W-rank default', () => {
  assert.equal(ranks.normalizeGender('Male ', 'WPC'), 'MALE');
  assert.equal(ranks.normalizeGender('F', 'PC'), 'FEMALE');
  assert.equal(ranks.normalizeGender('Transgender', 'PC'), 'OTHER');
  for (const rank of ['WPC', 'WHC', 'WASI', 'WSI', 'Woman Constable']) assert.equal(ranks.normalizeGender('', rank), 'FEMALE', rank);
  for (const rank of ['PC', 'SI', 'ARHC', '']) assert.equal(ranks.normalizeGender('', rank), 'MALE', rank);
});

test('rank seniority orders senior ranks first, unknown last', () => {
  const order = ['PC', 'HG', 'DSP', 'ASI', 'SP', 'XYZ', 'Addl. SP', 'HC', 'CI', 'SI'].sort((a, b) => ranks.rankSeniority(a) - ranks.rankSeniority(b));
  assert.deepEqual(order, ['SP', 'Addl. SP', 'DSP', 'CI', 'SI', 'ASI', 'HC', 'PC', 'HG', 'XYZ']);
  assert.equal(ranks.rankSeniority('ASP'), ranks.rankSeniority('Addl. SP'));
});

test('sector-wise blocks: scheme order, zone / sector / sub-sector headings (no points), serial reset', () => {
  const zone1 = zones.POLICE_BANDOBUSHT_ZONES.find(z => z.id === 'ZONE-1');
  const zone2 = zones.POLICE_BANDOBUSHT_ZONES.find(z => z.id === 'ZONE-2');
  const sector2 = zone2.sectors.find(s => s.subSectors?.length);
  const sub = sector2.subSectors[0];
  const subPoints = zones.dutyPointsFor(zone2.name, sector2.number, sub);
  const z1Point = zones.dutyPointsFor(zone1.name, zone1.sectors[0].number, null)[0];
  assert.ok(subPoints.length >= 2 && z1Point);
  const base = { police_id_number: '1', police_station: 'PS', mobile_number: '9000000000', district: 'Tirupati', police_custom_sector: null };
  const at = (zone, sector, sectorName, point) => ({
    police_zone: zone.name, police_sector_number: sector.number, police_sector_name: sectorName,
    police_point_code: point?.code ?? null, police_point_name: point?.name ?? null,
  });
  const officers = [
    { ...base, full_name: 'Z PC', rank: 'PC', ...at(zone2, sector2, sub, subPoints[1]) },
    { ...base, full_name: 'A SI', rank: 'SI', ...at(zone2, sector2, sub, subPoints[1]) },
    { ...base, full_name: 'B HC', rank: 'HC', ...at(zone2, sector2, sub, null) },
    { ...base, full_name: 'E HC', rank: 'HC', ...at(zone2, sector2, sector2.name, null) },
    { ...base, full_name: 'C PC', rank: 'PC', police_zone: null, police_sector_number: null, police_sector_name: null, police_point_code: null, police_point_name: null },
    { ...base, full_name: 'D DSP', rank: 'DSP', ...at(zone1, zone1.sectors[0], zone1.sectors[0].name, z1Point) },
  ];
  const blocks = sheet.buildSectorWiseBlocks(officers);
  // Officers on a point and without one share the sub-sector block; no point lines.
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks[0].heading, [`Zone ${zone1.number}: ${zone1.name} | ${zone1.sectors[0].number}: ${zone1.sectors[0].name}`]);
  assert.deepEqual(blocks[1].heading, [`Zone ${zone2.number}: ${zone2.name} | ${sector2.number}: ${sector2.name}`]);
  assert.deepEqual(blocks[1].rows.map(r => [r[0], r[3]]), [['1', 'E HC']]);
  assert.deepEqual(blocks[2].heading, [`Zone ${zone2.number}: ${zone2.name} | ${sector2.number}: ${sector2.name}`, `Sub-sector: ${sub}`]);
  assert.deepEqual(blocks[2].rows.map(r => [r[0], r[1], r[3]]), [['1', 'SI', 'A SI'], ['2', 'HC', 'B HC'], ['3', 'PC', 'Z PC']]);
  assert.deepEqual(blocks[3].heading, [sheet.NOT_ALLOTTED]);
  assert.ok(blocks.every(block => block.heading.every(line => !line.startsWith('Point'))));
  assert.equal(blocks[0].rows[0].length, sheet.SECTOR_WISE_COLUMNS.length);
  assert.deepEqual(blocks[0].rows[0].slice(4), ['PS', '9000000000', 'Tirupati']);
});

test('duty instruction validation: cleans rows, checks dates, times and targets', () => {
  const zone2 = zones.POLICE_BANDOBUSHT_ZONES.find(z => z.id === 'ZONE-2');
  const ok = instr.validateInstruction({
    title: '  Phase-I  ', heading: instr.DEFAULT_HEADING, closing: instr.DEFAULT_CLOSING,
    entries: [
      { entity: 'Accommodation', date: '', time: '', place: '' },
      { entity: 'Briefing', date: '2026-07-18', time: '16:00', place: 'Police Complex, Tirumala' },
      { entity: '', date: '', time: '', place: '' },
    ],
    targets: [{ zone: zone2.name, sector: 'Sector 1' }],
  });
  assert.ok('value' in ok, JSON.stringify(ok));
  assert.equal(ok.value.title, 'Phase-I');
  assert.equal(ok.value.entries.length, 2);
  assert.deepEqual(instr.instructionRows(ok.value.entries), [
    ['1', 'Accommodation', '-', '-', '-'],
    ['2', 'Briefing', '18-07-2026', '16:00', 'Police Complex, Tirumala'],
  ]);
  assert.equal(instr.formatEntryCell('place', { entity: 'x', date: '', time: '', place: 'NaN' }), '-');
  const base = { title: 'T', entries: [{ entity: 'Briefing', date: '', time: '', place: '' }], targets: [{ zone: zone2.name, sector: null }] };
  assert.ok('error' in instr.validateInstruction({ ...base, title: ' ' }));
  assert.ok('error' in instr.validateInstruction({ ...base, entries: [] }));
  assert.ok('error' in instr.validateInstruction({ ...base, entries: [{ entity: 'B', date: '2026-02-30', time: '', place: '' }] }));
  assert.ok('error' in instr.validateInstruction({ ...base, entries: [{ entity: 'B', date: '', time: '24:00', place: '' }] }));
  assert.ok('error' in instr.validateInstruction({ ...base, entries: [{ entity: '', date: '', time: '', place: 'Gate' }] }));
  assert.ok('error' in instr.validateInstruction({ ...base, targets: [] }));
  assert.ok('error' in instr.validateInstruction({ ...base, targets: [{ zone: 'Nowhere', sector: null }] }));
  assert.ok('error' in instr.validateInstruction({ ...base, targets: [{ zone: zone2.name, sector: 'Sector 99' }] }));
  assert.ok('error' in instr.validateInstruction({ ...base, entries: Array.from({ length: 31 }, () => ({ entity: 'x', date: '', time: '', place: '' })) }));
  assert.equal(instr.validateInstruction({ ...base, entries: [{ entity: 'x'.repeat(500), date: '', time: '', place: '' }] }).value.entries[0].entity.length, 300);
});

test('duty instruction visibility follows zone / sector scope', () => {
  const [a, b] = zones.POLICE_BANDOBUSHT_ZONES;
  const whole = [{ zone: a.name, sector: null }];
  const sector1 = [{ zone: a.name, sector: a.sectors[0].number }];
  assert.equal(instr.instructionVisibleTo(whole, [{ zone: a.name, sector: 'Sector 7' }]), true);
  assert.equal(instr.instructionVisibleTo(sector1, [{ zone: a.name, sector: null }]), true);
  assert.equal(instr.instructionVisibleTo(sector1, [{ zone: a.name, sector: a.sectors[0].number }]), true);
  assert.equal(instr.instructionVisibleTo(sector1, [{ zone: a.name, sector: 'Other sector' }]), false);
  assert.equal(instr.instructionVisibleTo(whole, [{ zone: b.name, sector: null }]), false);
  assert.equal(instr.instructionVisibleTo(whole, []), false);
});

fs.rmSync(out, { recursive: true, force: true });
console.log(`\n${passed} tests passed`);
