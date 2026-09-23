# Guardian — Project workflow

This document is the canonical KSP (Kit Standards Projet) workflow for Guardian.

## Branches and pull requests

- `main` is the stable branch and must remain releasable.
- Start work from an up-to-date `main` on a short-lived `feature/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*`, or `test/*` branch.
- Use atomic Conventional Commits in English.
- Validate the branch according to `docs/TESTING.md`.
- Open a pull request using `.github/PULL_REQUEST_TEMPLATE.md`; do not push directly to `main`.
- Delete merged short-lived branches after verification.

The former long-lived `dev` and `beta` promotion flow is retired. Historical details remain in `docs/workflow.md` until that legacy release tooling is removed.

## Versions and releases

Release Please is the only version source-of-truth mechanism:

1. Conventional Commits merged into `main` update the pending Release PR.
2. Merging the Release PR updates `.release-please-manifest.json`, `guardian/package.json`, and `CHANGELOG.md`.
3. Release Please creates the GitHub release and bare `vX.Y.Z` tag.

Do not manually edit versions, create or move release tags, or run legacy release scripts unless the maintainer explicitly approves a documented exception.

Configuration:

- `release-please-config.json` targets the repository root and explicitly updates `guardian/package.json` through `extra-files`.
- `package-name` is `guardian-discord-bot`.
- `include-component-in-tag: false` keeps tags in the `vX.Y.Z` format.
- `.release-please-manifest.json` stores the current released version.

The GitHub-hosted Release Please workflow may remain queued when private-repository runner minutes are unavailable. In that case, use the documented local Release Please procedure rather than manually changing versions or tags.

## Deployment

Production deployment instructions are maintained in `docs/deploy-hetzner.md`. Deployment is separate from version creation and must use a released, validated revision.

Rich Presence additionally requires the privileged Discord `Guild Presences` intent to be enabled for the application.

## Documentation and Atlas

Before considering a change complete:

- keep README features, prerequisites, and version references accurate;
- keep tests and `docs/TESTING.md` aligned;
- keep deployment and release documentation consistent with actual automation;
- update Atlas `projects/guardian_bot.md` and `journal.md` for meaningful changes.
