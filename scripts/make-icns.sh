#!/usr/bin/env bash
# Builds the macOS icon that `npx kablan --install` puts in the app bundle.
#
# Kept out of generate-icons.js because it needs iconutil, which only exists on macOS. The
# result is committed, so nobody has to be on a Mac to publish a release.
#
#   ./scripts/make-icns.sh
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/icon-source.svg"
OUT="npx-cli/assets/Kablan.icns"
SET="$(mktemp -d)/Kablan.iconset"

command -v rsvg-convert >/dev/null || { echo "need rsvg-convert (brew install librsvg)"; exit 1; }
command -v iconutil >/dev/null || { echo "need iconutil (macOS only)"; exit 1; }

mkdir -p "$SET" "$(dirname "$OUT")"

# The sizes iconutil expects, by the names it expects.
for spec in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" \
            "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" "512 icon_256x256@2x" \
            "512 icon_512x512" "1024 icon_512x512@2x"; do
  set -- $spec
  rsvg-convert -w "$1" -h "$1" "$SRC" -o "$SET/$2.png"
done

iconutil -c icns "$SET" -o "$OUT"
rm -rf "$(dirname "$SET")"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
