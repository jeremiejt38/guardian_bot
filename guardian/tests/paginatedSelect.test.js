const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPaginatedSelect, parsePaginatedCustomId, PAGE_SIZE } = require('../modules/utils/paginatedSelect');

test('buildPaginatedSelect returns one row when options fit in one page', () => {
  const options = Array.from({ length: 10 }, (_, i) => ({ label: `Item ${i}`, value: String(i) }));
  const { rows, page, totalPages } = buildPaginatedSelect(options, 'base', 'placeholder', 0, { minValues: 1, maxValues: 1 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(page, 0);
  assert.strictEqual(totalPages, 1);
});

test('buildPaginatedSelect adds navigation row when options exceed PAGE_SIZE', () => {
  const options = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ label: `Item ${i}`, value: String(i) }));
  const { rows, totalPages } = buildPaginatedSelect(options, 'base', 'placeholder', 0, { minValues: 1, maxValues: 1 });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(totalPages, 2);
  assert.strictEqual(rows[0].components[0].options.length, PAGE_SIZE);
});

test('buildPaginatedSelect never puts more than PAGE_SIZE options in a menu', () => {
  const options = Array.from({ length: 60 }, (_, i) => ({ label: `Item ${i}`, value: String(i) }));
  const { rows, totalPages } = buildPaginatedSelect(options, 'base', 'placeholder', 1, { minValues: 1, maxValues: 1 });
  assert.strictEqual(totalPages, 3);
  assert.strictEqual(rows[0].components[0].options.length, PAGE_SIZE);
});

test('parsePaginatedCustomId parses a select menu custom id', () => {
  const parsed = parsePaginatedCustomId('base:5');
  assert.strictEqual(parsed.base, 'base');
  assert.strictEqual(parsed.page, 5);
  assert.strictEqual(parsed.isPageButton, false);
  assert.strictEqual(parsed.targetPage, null);
});

test('parsePaginatedCustomId parses a page button custom id', () => {
  const parsed = parsePaginatedCustomId('base:page:3');
  assert.strictEqual(parsed.base, 'base');
  assert.strictEqual(parsed.page, 3);
  assert.strictEqual(parsed.isPageButton, true);
  assert.strictEqual(parsed.targetPage, 3);
});

test('parsePaginatedCustomId parses nested base custom ids', () => {
  const parsed = parsePaginatedCustomId('games:select:2');
  assert.strictEqual(parsed.base, 'games:select');
  assert.strictEqual(parsed.page, 2);
});

test('parsePaginatedCustomId parses nested base page button custom ids', () => {
  const parsed = parsePaginatedCustomId('games:select:page:4');
  assert.strictEqual(parsed.base, 'games:select');
  assert.strictEqual(parsed.targetPage, 4);
});
