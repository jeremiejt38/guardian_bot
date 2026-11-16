// Per-key exponential backoff, global breakers and resilient timers for
// periodic jobs (Steam polling, server monitoring, scheduled tasks).
const logger = require('../logs/logger');

function isSqliteFull(error) {
  return /SQLITE_FULL|database or disk is full/i.test(String(error?.message || error));
}

function createBackoff({ baseDelayMs = 60_000, maxDelayMs = 6 * 60 * 60 * 1000, jitterRatio = 0.3 } = {}) {
  const states = new Map();

  function canRun(key, now = Date.now()) {
    const state = states.get(key);
    return !state || now >= state.nextAttemptAt;
  }

  function recordSuccess(key) {
    const state = states.get(key);
    states.delete(key);
    return state?.failures || 0;
  }

  function recordFailure(key, now = Date.now()) {
    const state = states.get(key) || { failures: 0 };
    state.failures += 1;
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (state.failures - 1));
    state.nextAttemptAt = now + exp + exp * jitterRatio * Math.random();
    states.set(key, state);
    return state;
  }

  function failures(key) {
    return states.get(key)?.failures || 0;
  }

  return { canRun, recordSuccess, recordFailure, failures };
}

// Global breaker for unrecoverable local faults (SQLITE_FULL...): trips once,
// logs once, stays open until reset. onTrip fires exactly once per trip.
function createGlobalBreaker(name, { onTrip } = {}) {
  let open = false;
  return {
    isOpen: () => open,
    trip(error) {
      if (open) return false;
      open = true;
      logger.error(`Global breaker "${name}" tripped`, { error: String(error?.message || error) });
      try {
        if (onTrip) onTrip(error);
      } catch (handlerError) {
        logger.error('Global breaker onTrip handler failed', { error: String(handlerError) });
      }
      return true;
    },
    reset() {
      open = false;
    }
  };
}

// Chained setTimeout interval: non-reentrant, catches per-tick errors,
// jittered first tick, unref'd so it never holds the process open.
function resilientInterval(fn, { intervalMs, jitterStart = true } = {}) {
  let stopped = false;
  let timer = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await fn();
    } catch (error) {
      logger.error('resilientInterval tick failed', { error: String(error?.message || error) });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
      if (timer.unref) timer.unref();
    }
  };

  timer = setTimeout(tick, jitterStart ? Math.floor(Math.random() * intervalMs) : intervalMs);
  if (timer.unref) timer.unref();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}

module.exports = { isSqliteFull, createBackoff, createGlobalBreaker, resilientInterval };
