# Guardian — Testing

This document is the canonical KSP validation guide for Guardian.

## Local validation

Guardian requires Node.js 22 for its built-in SQLite support and uses the native `node:test` runner.

```bash
cd guardian
npm ci
npm test
```

All tests must pass before opening or merging a pull request. Tests use isolated or in-memory data and must never access the production database.

## Targeted tests

Run a specific suite while iterating:

```bash
cd guardian
node --test tests/richPresence.test.js
```

Add or update automated coverage for every new module, critical behavior, and regression where practical. Do not remove or weaken existing assertions without an explicit reason.

## CI

`.github/workflows/e2e.yml` installs dependencies with Node.js 22 and runs the complete `npm test` suite on pushes to `main` and manual dispatches. Its live Discord E2E phase is skipped when staging secrets are unavailable.

Required pull-request validation:

1. `npm ci`
2. `npm test`
3. For Discord-facing changes, verify command deployment and behavior in a test guild when credentials are available.
4. For release changes, validate JSON syntax and confirm that Release Please resolves the package under `guardian/package.json`.

## Rich Presence

Rich Presence tests cover consent, revocation and data deletion, session tracking, user statistics, and leaderboard aggregation in `guardian/tests/richPresence.test.js`. Runtime validation also requires the Discord `Guild Presences` intent.

The lowercase `docs/testing.md` file is retained as historical detailed test-suite documentation; this file is the canonical validation source.
