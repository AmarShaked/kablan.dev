#!/usr/bin/env bash
#
# Sets the release version everywhere a release reads it from.
#
#   ./scripts/set-version.sh 0.11.7
#   git commit -am "chore(release): 0.11.7"
#   git tag v0.11.7 && git push origin v0.11.7
#
# There are three of these and they are easy to get out of step, because only one of them is on
# the obvious path. Releasing 0.11.6 meant bumping npx-cli/package.json and tagging; the crates
# were last touched at 0.1.8, so the published app reported 0.1.8 as its version while npm, the
# wrapper banner and Info.plist all said 0.11.6 — a version string no release has ever had.
#
#   npx-cli/package.json      the npm version, and the release tag the wrapper downloads from
#   crates/utils/Cargo.toml   APP_VERSION, which is what the running server reports
#   crates/server/Cargo.toml  the server binary's own version
#
# The verify job in .github/workflows/release.yml fails a tag whose crates disagree with it, so
# forgetting this script stops a release rather than publishing a mislabelled one.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>   e.g. $0 0.11.7" >&2
  exit 2
fi

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "error: '$VERSION' is not a semver version, and the tag is derived from it" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# `npm version` rather than editing the JSON: it keeps the file's formatting, and refuses a
# version it would not publish.
( cd npx-cli && npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null )
echo "npx-cli/package.json      $VERSION"

# Only the version in [package], which is the first one in each of these files. A dependency's
# version further down is a different thing and must not move.
for crate in utils server; do
  file="crates/$crate/Cargo.toml"
  awk -v v="$VERSION" '
    !done && /^version = "/ { sub(/"[^"]*"/, "\"" v "\""); done = 1 }
    { print }
  ' "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
  echo "$(printf '%-25s' "$file") $VERSION"
done

# Cargo.lock pins the workspace crates by version too, and a stale lock fails the build on CI
# with a message about nothing in particular.
if ! command -v cargo >/dev/null 2>&1; then
  echo "warning: cargo not found; run \`cargo update --workspace\` before committing" >&2
elif cargo update --workspace --offline >/dev/null 2>&1 ||
  cargo update --workspace >/dev/null 2>&1; then
  echo "Cargo.lock                $VERSION"
else
  echo "warning: could not update Cargo.lock; run \`cargo update --workspace\` yourself" >&2
fi

echo
echo "Next:"
echo "  git diff"
echo "  git commit -am \"chore(release): $VERSION\""
echo "  git tag v$VERSION && git push origin v$VERSION"
