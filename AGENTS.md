# Guardian — Development Guidelines

Guardian follows the KSP (Kit Standards Projet) workflow.

## Required sources of truth

Before changing the repository, read:

- `README.md`
- `docs/PROJECT_WORKFLOW.md`
- `docs/TESTING.md`
- `release-please-config.json`
- `.release-please-manifest.json`
- `CHANGELOG.md`

## Workflow

- Keep `main` stable and use a short-lived `feature/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*`, or `test/*` branch.
- Use atomic Conventional Commits written in English.
- Open pull requests with `.github/PULL_REQUEST_TEMPLATE.md` and complete the documented validation.
- Do not manually bump versions or create release tags. Release Please owns the manifest, changelog, package version, release PR, and `vX.Y.Z` tag.
- Keep implementation, tests, README, deployment documentation, release configuration, and Atlas mutually consistent.
- Never commit tokens, environment files, databases, logs, or generated release bundles.

## Validation

Run the commands in `docs/TESTING.md`. New behavior and bug fixes require appropriate automated coverage where practical.

## Atlas

Guardian is tracked in Atlas at `projects/guardian_bot.md`. Update that project sheet and `journal.md` after meaningful releases, deployments, incidents, or architectural changes while preserving unrelated Atlas work.
