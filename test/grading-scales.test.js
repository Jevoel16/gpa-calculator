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
