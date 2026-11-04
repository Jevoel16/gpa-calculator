// The shared grading-scale module: lookups, grade normalisation, GPA math and standings
const test = require('node:test');
const assert = require('node:assert/strict');
const Scales = require('../public/grading-scales');

const msu = Scales.getScale('msu-iit');

test('the default scale exists and unknown ids return null', () => {
  assert.equal(Scales.getScale(Scales.DEFAULT_SCALE_ID), msu);
  assert.equal(Scales.getScale('nope'), null);
  assert.equal(Scales.getScale('constructor'), null);
  assert.ok(Scales.listScales().some(s => s.id === 'msu-iit'));
});

test('grades normalise to their canonical value', () => {
  assert.equal(Scales.normalizeGrade(msu, '1'), '1.00');
  assert.equal(Scales.normalizeGrade(msu, ' 1.5 '), '1.50');
  assert.equal(Scales.normalizeGrade(msu, '5'), '5.00');
  assert.equal(Scales.normalizeGrade(msu, 'drp'), 'DROP');
  assert.equal(Scales.normalizeGrade(msu, 'p'), 'P');
  assert.equal(Scales.normalizeGrade(msu, '4.00'), null);
  assert.equal(Scales.normalizeGrade(msu, 'A'), null);
  assert.equal(Scales.normalizeGrade(msu, ''), null);
});

test('GPA is units-weighted and credit-only grades only add credited units', () => {
  const courses = [
    { name: 'Calculus', units: 5, grade: '1.75' },
    { name: 'Programming', units: 3, grade: '1.25' },
    { name: 'PE', units: 2, grade: 'P' },
    { name: 'Ethics', units: 3, grade: 'INC' }
  ];
  assert.equal(Scales.computeGpa(courses, msu), 1.5625);
  assert.deepEqual(Scales.sumCourses(courses, msu), { gradePointsTotal: 12.5, units: 8, creditedUnits: 10 });
});

test('standings and tones follow the scale direction', () => {
  assert.equal(Scales.standing(msu, 1.25), 'Excellent standing');
  assert.equal(Scales.standing(msu, 3.0), 'Passing');
  assert.equal(Scales.standing(msu, 3.5), 'Below passing');
  assert.equal(Scales.standing(msu, 0), '');
  assert.equal(Scales.tone(msu, 1.75), 'success');
  assert.equal(Scales.tone(msu, 5), 'danger');
  assert.equal(Scales.formatGpa(msu, 1.5), '1.50000');
});

test('every built-in scale is well formed', () => {
  for (const { id } of Scales.listScales()) {
    const scale = Scales.getScale(id);
    assert.ok(['lower', 'higher'].includes(scale.better), id);
    assert.equal(scale.standings.at(-1).limit, null, `${id} standings end with a catch-all`);
    assert.equal(scale.tones.at(-1).limit, null, `${id} tones end with a catch-all`);
    assert.equal(new Set(scale.grades.map(g => g.value)).size, scale.grades.length, `${id} has unique grades`);
    for (const target of Object.values(scale.aliases || {})) {
      assert.ok(scale.grades.some(g => g.value === target), `${id} alias points at a real grade`);
    }
    if (scale.input === 'number') assert.ok(scale.range.min < scale.range.max, id);
  }
});

test('PH 1.00–5.00: 4.00 conditional is not counted until resolved', () => {
  const s = Scales.getScale('ph-1to5');
  assert.equal(Scales.computeGpa([{ units: 3, grade: '1.00' }, { units: 3, grade: '4.00' }], s), 1);
  assert.equal(Scales.sumCourses([{ units: 3, grade: '4' }], s).creditedUnits, 0);
  assert.equal(Scales.normalizeGrade(s, 'drop'), 'DRP');
  assert.equal(Scales.standing(s, 1.25), 'Excellent standing');
});

test('PH percentage: any number in range counts at its own value; higher is better', () => {
  const s = Scales.getScale('ph-percent');
  assert.equal(Scales.normalizeGrade(s, '92.456'), '92.46');
  assert.equal(Scales.normalizeGrade(s, '100'), '100');
  assert.equal(Scales.normalizeGrade(s, '100.5'), null);
  assert.equal(Scales.normalizeGrade(s, '-1'), null);
  assert.equal(Scales.normalizeGrade(s, 'inc'), 'INC');
  const courses = [{ units: 3, grade: '90' }, { units: 3, grade: '80' }, { units: 2, grade: 'P' }];
  assert.equal(Scales.computeGpa(courses, s), 85);
  assert.equal(Scales.sumCourses(courses, s).creditedUnits, 8);
  assert.equal(Scales.standing(s, 85), 'Good standing');
  assert.equal(Scales.standing(s, 74.99), 'Below passing');
  assert.equal(Scales.tone(s, 95), 'success');
  assert.equal(Scales.formatGpa(s, 85), '85.00');
});

test('PH 4.0: numeric grades match by value and DROP maps to W', () => {
  const s = Scales.getScale('ph-4pt');
  assert.equal(Scales.normalizeGrade(s, '4'), '4.0');
  assert.equal(Scales.normalizeGrade(s, '3.50'), '3.5');
  assert.equal(Scales.normalizeGrade(s, '3.25'), null);
  assert.equal(Scales.normalizeGrade(s, 'drop'), 'W');
  assert.equal(Scales.computeGpa([{ units: 3, grade: '4.0' }, { units: 3, grade: '0.0' }], s), 2);
  assert.equal(Scales.standing(s, 3.6), 'Excellent standing');
  assert.equal(Scales.tone(s, 0.5), 'danger');
});

test('US letter grades: +/- points, NP and I not counted', () => {
  const s = Scales.getScale('us-4pt');
  assert.equal(Scales.normalizeGrade(s, 'b+'), 'B+');
  assert.equal(Scales.normalizeGrade(s, 'inc'), 'I');
  assert.equal(Scales.normalizeGrade(s, 'E'), null);
  const courses = [{ units: 3, grade: 'A' }, { units: 3, grade: 'B-' }, { units: 3, grade: 'NP' }, { units: 1, grade: 'P' }];
  assert.equal(Scales.computeGpa(courses, s), 3.35);
  assert.equal(Scales.sumCourses(courses, s).creditedUnits, 7);
  assert.equal(Scales.standing(s, 3.35), 'Very good standing');
});

test('switching scales keeps only grades that mean the same on both', () => {
  const [msu, ph15, pct, ph4, us] = ['msu-iit', 'ph-1to5', 'ph-percent', 'ph-4pt', 'us-4pt'].map(Scales.getScale);
  assert.equal(Scales.carryGrade(msu, ph15, '1.50'), '1.50');
  assert.equal(Scales.carryGrade(msu, pct, '1.50'), null, 'not 1.5%');
  assert.equal(Scales.carryGrade(msu, ph4, '1.50'), null, 'not a 4.0-scale 1.5');
  assert.equal(Scales.carryGrade(pct, msu, '1'), null);
  assert.equal(Scales.carryGrade(msu, pct, 'P'), 'P');
  assert.equal(Scales.carryGrade(msu, pct, 'INC'), 'INC');
  assert.equal(Scales.carryGrade(msu, us, 'INC'), null, 'US uses I, not INC');
  assert.equal(Scales.carryGrade(msu, msu, 'nonsense'), null);
});
