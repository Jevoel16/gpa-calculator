const test = require('node:test');
const assert = require('node:assert');
const { THEMES, parseTheme } = require('../public/darkmode.js');

test('parseTheme keeps light and dark', () => {
  assert.strictEqual(parseTheme('light'), 'light');
  assert.strictEqual(parseTheme('dark'), 'dark');
});

test('parseTheme treats anything else as system', () => {
  for (const value of [null, undefined, '', 'system', 'Dark', 'blue', '{"theme":"dark"}']) {
    assert.strictEqual(parseTheme(value), 'system', String(value));
  }
});

test('THEMES lists system, light and dark in picker order', () => {
  assert.deepStrictEqual(
    THEMES.map(t => t.id),
    ['system', 'light', 'dark']
  );
});
