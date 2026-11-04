// Parsing grades copied from the MyIIT portal into the New Term form
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMyiitGrades, normalizeGrade } = require('../public/myiit-paste');

const SAMPLE = [
  'SY: 2023-2024 SEM: 1 (BSIT:BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY)',
  'CCC100\tFundamentals of Computing\t1.00 ',
  'CCC101\tComputer Programming 1\t1.25 ',
  'GEC101\tUnderstanding the Self\t1.00 ',
  'GEC102\tPurposive Communication\t1.50 ',
  'GEC104\tMathematics in the Modern World\t1.00 ',
  'MAT104\tDiscrete Structure\t1.50 ',
  'NST001\tNational Service Training Program 1\t1.00 ',
  'PED011\tMovement Competency Training or MCT\t1.00'
].join('\r\n');

test('reads the term name and every course from a MyIIT copy', () => {
  const { termName, courses, moreTerms } = parseMyiitGrades(SAMPLE);
  assert.equal(termName, 'SY: 2023-2024 SEM: 1 (BSIT:BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY)');
  assert.equal(courses.length, 8);
  assert.equal(moreTerms, false);
  assert.deepEqual(courses[0], { code: 'CCC100', name: 'Fundamentals of Computing', units: '', grade: '1.00' });
  assert.deepEqual(courses[1], { code: 'CCC101', name: 'Computer Programming 1', units: '', grade: '1.25' });
  assert.deepEqual(courses[7], { code: 'PED011', name: 'Movement Competency Training or MCT', units: '', grade: '1.00' });
});

test('handles space-separated copies without mistaking a trailing number for units', () => {
  const { courses } = parseMyiitGrades('CCC101  Computer Programming 1  1.25\nGEC101 Understanding the Self 1');
  assert.deepEqual(courses, [
    { code: 'CCC101', name: 'Computer Programming 1', units: '', grade: '1.25' },
    { code: 'GEC101', name: 'Understanding the Self', units: '', grade: '1.00' }
  ]);
});

test('reads a units column when the copy has one', () => {
  const { courses } = parseMyiitGrades('MAT104\tDiscrete Structure\t3\t1.50');
  assert.deepEqual(courses, [{ code: 'MAT104', name: 'Discrete Structure', units: '3', grade: '1.50' }]);
});

test('normalizes grades and leaves unknown ones blank', () => {
  assert.equal(normalizeGrade('5'), '5.00');
  assert.equal(normalizeGrade('5.0'), '5.00');
  assert.equal(normalizeGrade('drp'), 'DROP');
  assert.equal(normalizeGrade('inc'), 'INC');
  assert.equal(normalizeGrade('P'), 'P');
  assert.equal(normalizeGrade('4.00'), '');
  assert.equal(normalizeGrade('NG'), '');
  const { courses } = parseMyiitGrades('ENG101\tWriting\tNG');
  assert.deepEqual(courses, [{ code: 'ENG101', name: 'Writing', units: '', grade: '' }]);
});

test('stops at a second term header', () => {
  const result = parseMyiitGrades(`${SAMPLE}\nSY: 2023-2024 SEM: 2 (BSIT)\nCCC102\tProgramming 2\t1.00`);
  assert.equal(result.courses.length, 8);
  assert.equal(result.moreTerms, true);
});

test('ignores ordinary text', () => {
  assert.deepEqual(parseMyiitGrades('Calculus I').courses, []);
  assert.deepEqual(parseMyiitGrades('hello world\nsecond line').courses, []);
  assert.equal(parseMyiitGrades('').termName, '');
});
