// Wraps an async function so overlapping invocations are skipped.
// For interval tasks whose work may outlive the period (network pings,
// API fetches, DB scans): without this, ticks stack up.
function guardAsync(fn) {
  let inFlight = false;
  return async function guarded(...args) {
    if (inFlight) return;
    inFlight = true;
    try {
      await fn(...args);
    } finally {
      inFlight = false;
    }
  };
}

module.exports = { guardAsync };
