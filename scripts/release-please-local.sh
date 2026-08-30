#!/usr/bin/env bash
set -euo pipefail

# Run Release Please locally when GitHub-hosted runners are unavailable
# (e.g. account quota exhausted). This script creates/updates the release PR.
# After the PR is merged, run this script with --release to create the tag and
# GitHub release.

REPO_URL="https://github.com/jeremiejt38/guardian_bot"
TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: No GitHub token found. Set GITHUB_TOKEN or log in with 'gh auth login'." >&2
  exit 1
fi

case "${1:-pr}" in
  pr)
    exec npx release-please release-pr \
      --repo-url="$REPO_URL" \
      --token="$TOKEN" \
      --target-branch=main
    ;;
  release)
    exec npx release-please github-release \
      --repo-url="$REPO_URL" \
      --token="$TOKEN" \
      --target-branch=main
    ;;
  *)
    echo "Usage: $0 [pr|release]" >&2
    exit 1
    ;;
esac
