#!/usr/bin/env bash
# The stranger's walk, on Linux, inside a container that has never heard of Kablan.
#
# Run as the container's entrypoint. Everything it touches lives under this HOME, so the only
# thing that survives is the log on stdout. Nothing here is allowed to fall back to a local
# build: no repo on the PATH, no dist/, no KABLAN_LOCAL.
set -u

VERSION="${KABLAN_VERSION:-0.11.6}"
step() { printf '\n==== %s\n' "$*"; }
ok() { printf 'PASS %s\n' "$*"; }
bad() { printf 'FAIL %s\n' "$*"; }

step "environment"
( . /etc/os-release 2>/dev/null && echo "distro=$PRETTY_NAME" ) || echo "distro=unknown"
echo "arch=$(uname -m)  kernel=$(uname -r)"
echo "libc=$(ldd --version 2>&1 | head -1)"
echo "node=$(node --version 2>/dev/null || echo MISSING)  npm=$(npm --version 2>/dev/null || echo MISSING)"
echo "git=$(git --version 2>/dev/null || echo MISSING)"
echo "HOME=$HOME  whoami=$(whoami)"
echo "kablan on PATH: $(command -v kablan || echo no)"
echo "~/.kablan exists: $([ -e "$HOME/.kablan" ] && echo YES || echo no)"
env | grep -i '^KABLAN' || echo "no KABLAN_* env vars"

step "install + launch: npx kablan@$VERSION"
# The wrapper opens a browser and then serves forever, so it is backgrounded and the log is
# read instead. Time to first byte on the port is the number that matters to a newcomer.
START=$(date +%s)
( npx --yes "kablan@$VERSION" > "$HOME/kablan.log" 2>&1 ; echo "EXIT=$?" >> "$HOME/kablan.log" ) &
NPX_PID=$!

PORT=""
for _ in $(seq 1 180); do
  sleep 1
  # The wrapper prints the URL it is serving on; take the port from there rather than guessing.
  PORT=$(grep -oE 'https?://(127\.0\.0\.1|localhost|0\.0\.0\.0):[0-9]+' "$HOME/kablan.log" 2>/dev/null \
    | head -1 | grep -oE '[0-9]+$')
  [ -n "$PORT" ] && break
  kill -0 "$NPX_PID" 2>/dev/null || break
done
ELAPSED=$(( $(date +%s) - START ))

step "wrapper output (verbatim)"
cat "$HOME/kablan.log"

step "result"
echo "seconds_to_url=$ELAPSED"
if [ -z "$PORT" ]; then
  bad "no URL was ever printed; nothing to connect to"
  echo "cache: $(ls -la "$HOME/.kablan/bin" 2>/dev/null || echo 'no ~/.kablan/bin')"
  exit 1
fi
ok "server URL printed on port $PORT after ${ELAPSED}s"

step "does it actually answer?"
for _ in $(seq 1 30); do
  CODE=$(curl -s -o "$HOME/index.html" -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null)
  [ "$CODE" = "200" ] && break
  sleep 1
done
echo "GET / -> $CODE  ($(wc -c < "$HOME/index.html" 2>/dev/null || echo 0) bytes)"
[ "$CODE" = "200" ] && ok "frontend served" || bad "frontend did not serve"

step "what the binary is"
BIN=$(find "$HOME/.kablan/bin" -type f -name 'kablan*' 2>/dev/null | head -2)
echo "$BIN"
for b in $BIN; do file "$b" 2>/dev/null || true; done

step "API reachable (the UI talks to this)"
for p in /api/config /api/projects /api/health; do
  printf '%s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p")"
done

step "first-run config written on a machine that has never run Kablan"
find "$HOME/.local/share/kablan" "$HOME/.config/kablan" "$HOME/.kablan" -maxdepth 2 -name '*.json' 2>/dev/null | head
CFG=$(find "$HOME/.local/share/kablan" "$HOME/.config/kablan" "$HOME/.kablan" -maxdepth 2 -name 'config.json' 2>/dev/null | head -1)
[ -n "$CFG" ] && cat "$CFG"

step "teardown"
kill "$NPX_PID" 2>/dev/null
pkill -f 'kablan' 2>/dev/null
wait "$NPX_PID" 2>/dev/null
echo "done"
