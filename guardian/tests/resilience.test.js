const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSqliteFull, createBackoff, createGlobalBreaker, resilientInterval } = require('../modules/utils/resilience');

test('isSqliteFull detects SQLITE_FULL variants', () => {
  assert.equal(isSqliteFull(new Error('database or disk is full')), true);
  assert.equal(isSqliteFull(new Error('SQLITE_FULL: disk')), true);
  assert.equal(isSqliteFull(new Error('fetch failed')), false);
  assert.equal(isSqliteFull(null), false);
});

test('backoff blocks retry until delay, resets on success', () => {
  const b = createBackoff({ baseDelayMs: 1000, maxDelayMs: 10_000, jitterRatio: 0 });
  const now = 1_000_000;
  assert.equal(b.canRun('g1', now), true);
  const s1 = b.recordFailure('g1', now);
  assert.equal(s1.failures, 1);
  assert.equal(b.canRun('g1', now + 500), false);
  assert.equal(b.canRun('g1', now + 1001), true);
  const s2 = b.recordFailure('g1', now + 1001);
  assert.equal(s2.failures, 2);
  // exponential: delay is now ~2000
  assert.equal(b.canRun('g1', now + 2000), false);
  assert.equal(b.canRun('g1', now + 3002), true);
  assert.equal(b.recordSuccess('g1'), 2);
  assert.equal(b.canRun('g1', now), true);
});

test('backoff caps at maxDelayMs', () => {
  const b = createBackoff({ baseDelayMs: 1000, maxDelayMs: 4000, jitterRatio: 0 });
  const now = 0;
  for (let i = 0; i < 10; i++) b.recordFailure('g', now);
  assert.equal(b.canRun('g', now + 3999), false);
  assert.equal(b.canRun('g', now + 4001), true);
});

test('global breaker trips once and fires onTrip once', () => {
  let calls = 0;
  const br = createGlobalBreaker('test', { onTrip: () => { calls += 1; } });
  assert.equal(br.isOpen(), false);
  assert.equal(br.trip(new Error('x')), true);
  assert.equal(br.isOpen(), true);
  assert.equal(br.trip(new Error('x')), false);
  assert.equal(calls, 1);
  br.reset();
  assert.equal(br.isOpen(), false);
  assert.equal(br.trip(new Error('x')), true);
  assert.equal(calls, 2);
});

test('resilientInterval runs fn repeatedly without overlap and stops', async () => {
  const { mock } = require('node:test');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let runs = 0;
    const handle = resilientInterval(async () => { runs += 1; }, { intervalMs: 1000, jitterStart: false });
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(runs, 1);
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(runs, 2);
    handle.stop();
    mock.timers.tick(5000);
    await new Promise((r) => setImmediate(r));
    assert.equal(runs, 2);
  } finally {
    mock.timers.reset();
  }
});

test('resilientInterval catches errors inside fn and continues', async () => {
  const { mock } = require('node:test');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let runs = 0;
    resilientInterval(async () => { runs += 1; throw new Error('boom'); }, { intervalMs: 1000, jitterStart: false });
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(runs, 2);
  } finally {
    mock.timers.reset();
  }
});
