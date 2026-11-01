// GPA rules: which grades count, which only credit units, and what input is rejected
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/env');
const { sanitizeCourses, computeGpa, sumCourses } = require('../routes/gpa').helpers;

test('computes a units-weighted GPA', () => {
  const gpa = computeGpa([
    { name: 'Calculus', units: 5, grade: '1.75' },
    { name: 'Programming', units: 3, grade: '1.25' }
  ]);
  // (5 * 1.75 + 3 * 1.25) / 8
  assert.equal(gpa, 1.5625);
});

test('P credits units without affecting the GPA', () => {
  const courses = [
    { name: 'Math', units: 3, grade: '2.00' },
    { name: 'PE', units: 2, grade: 'P' }
  ];
  assert.equal(computeGpa(courses), 2);
  assert.deepEqual(sumCourses(courses), { gradePointsTotal: 6, units: 3, creditedUnits: 5 });
});

test('INC and DROP are neither counted nor credited', () => {
  const courses = [
    { name: 'Math', units: 3, grade: '1.00' },
    { name: 'Ethics', units: 3, grade: 'INC' },
    { name: 'Art', units: 3, grade: 'drop' }
  ];
  assert.equal(computeGpa(courses), 1);
  assert.equal(sumCourses(courses).creditedUnits, 3);
});

test('a failing grade counts as 5.00', () => {
  assert.equal(computeGpa([{ name: 'A', units: 3, grade: '1.00' }, { name: 'B', units: 3, grade: '5.00' }]), 3);
});

test('returns 0 when nothing counts toward the GPA', () => {
  assert.equal(computeGpa([{ name: 'PE', units: 2, grade: 'P' }]), 0);
  assert.equal(computeGpa([]), 0);
});

test('sanitizeCourses trims names and keeps valid courses', () => {
  assert.deepEqual(
    sanitizeCourses([{ name: '  Physics  ', units: '4', grade: ' 2.50 ' }]),
    [{ name: 'Physics', units: 4, grade: '2.50' }]
  );
});

test('sanitizeCourses rejects malformed input', () => {
  const valid = { name: 'Math', units: 3, grade: '1.00' };
  assert.equal(sanitizeCourses([]), null, 'empty list');
  assert.equal(sanitizeCourses('nope'), null, 'not an array');
  assert.equal(sanitizeCourses([{ ...valid, grade: '4.00' }]), null, 'grade not on the scale');
  assert.equal(sanitizeCourses([{ ...valid, units: 0 }]), null, 'zero units');
  assert.equal(sanitizeCourses([{ ...valid, units: 31 }]), null, 'too many units');
  assert.equal(sanitizeCourses([{ ...valid, name: '' }]), null, 'empty name');
  assert.equal(sanitizeCourses([{ ...valid, name: 'x'.repeat(101) }]), null, 'name too long');
  assert.equal(sanitizeCourses(Array(101).fill(valid)), null, 'too many courses');
  assert.equal(sanitizeCourses([{ ...valid, grade: 'toString' }]), null, 'prototype key as grade');
});
