---
description: Build and publish the free public release of Guardian from main
---

# `/release-free` — Publish the free public release

Build the free version of Guardian from the `main` branch and publish it to the `Guardian_Discord_Bot_Free` repository with a GitHub Release.

## When to use

Only run this workflow from `main` when the premium version is stable and ready to be stripped into the public free build.

## Branch strategy

```
feature/xxx  → développement d'une feature (créée depuis dev, mergée dans dev)
dev          → intégration continue (local + serveur test Discord vide)
beta         → early access premium (serveur Discord perso)
main         → stable premium pour abonnés payants (Hetzner)
Guardian_Discord_Bot_Free  → public free build published from main
```

## Prerequisites

- Be on `main` with a clean working tree.
- A version tag already exists (created with `/tag`).
- `GITHUB_TOKEN` must be set in `guardian/.env`
  - Generate at: https://github.com/settings/tokens → Fine-grained → repo Contents: write + Metadata: read
- `GITHUB_FREE_RELEASE_TOKEN` set in `guardian/.env` to publish to the free repo
  - Fine-grained token, Contents: write on `Guardian_Discord_Bot_Free` only

## Steps

1. Run the tests to make sure nothing is broken
```bash
cd /home/jerem/workspaces/Guardian_Discord_Bot/guardian && npm test
```

2. Run the free release script
```bash
cd /home/jerem/workspaces/Guardian_Discord_Bot && node scripts/release-free.js
```

The script reads the current version from `guardian/package.json` (which must already be tagged with `/tag`).

## What the script does

**Guardian-fou :**
- ❌ Blocks if the current branch is not `main`
- ❌ Blocks if the working tree is dirty
- ❌ Blocks if no tag matches the current `package.json` version

**Build free bundle:**
- Strips `// @premium-start/end` blocks via `scripts/build-free.js`
- Excludes `modules/initialisation/discordSettings.js` entirely
- Excludes files listed in `.freeignore`
- Copies public docs into the bundle
- Verifies no premium leak is present

**Publish free repo:**
- Generates a zip excluding `tests/`, `e2e/`, `node_modules/`, `data/`
- Clones `Guardian_Discord_Bot_Free`
- Overwrites its content with the free bundle
- Commits with a body listing the applied patches
- Pushes to `main` of the free repo

**GitHub Release:**
- Creates a GitHub Release on `Guardian_Discord_Bot_Free`
- Attaches the zip as a downloadable asset

## After release

- The public free release appears at `https://github.com/jeremiejt38/guardian_bot_Free/releases`
- The premium repo release remains on `https://github.com/jeremiejt38/guardian_bot/releases` (created during `/tag` if configured)
