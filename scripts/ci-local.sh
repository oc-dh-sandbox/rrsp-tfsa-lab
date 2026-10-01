#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Refusing release CI: commit all intended changes and use a clean tree.' >&2
  exit 1
fi
sha=$(git rev-parse HEAD)
context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT
git archive "$sha" | tar -x -C "$context"
image="long-view-ci:${sha}"
docker build --label "org.opencontainers.image.revision=$sha" -t "$image" "$context"
mkdir -p .artifacts
docker run --rm --ipc=host -v "$(pwd)/.artifacts:/app/.artifacts" "$image"
printf '%s\n' "$sha" > .artifacts/verified-commit.txt
printf 'Full exact-commit container CI PASS: %s\n' "$sha"
