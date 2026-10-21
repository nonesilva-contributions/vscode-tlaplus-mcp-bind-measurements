#!/usr/bin/env bash
# Runs mcp_bind.mjs in a digest-pinned node image on Docker's default bridge: its
# own netns, no host firewall, a non-loopback address to connect from. The
# container is removed on exit, even on Ctrl-C. Usage: ./run-docker.sh 20 22
set -euo pipefail
cd "$(dirname "$0")"

IMG20="node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0"
IMG22="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"

. ../../../docker.sh "$PWD/run-docker.sh"

versions=("$@"); [ ${#versions[@]} -gt 0 ] || versions=(20 22)
mkdir -p results
name=""; tmp=""; rc=0
cleanup() {
  [ -n "$name" ] && docker rm -f "$name" >/dev/null 2>&1 || true
  [ -n "$tmp" ] && rm -f "$tmp" || true
}
stop() { cleanup; exit 130; }
trap cleanup EXIT
trap stop INT TERM

echo "Running the measurement in Docker. Each Node version takes about a minute,"
echo "and the output appears in bursts, not line by line."

for V in "${versions[@]}"; do
  case "$V" in
    20) IMG="$IMG20" ;;
    22) IMG="$IMG22" ;;
    *) echo "unknown node version: $V, pinned versions are 20 and 22"; exit 2 ;;
  esac
  out="results/node$V-docker-bridge.txt"
  tmp="$(mktemp)"
  name="$(container_name "v2-node-$V")"
  echo
  echo ">> node:$V-slim: fetching the image if needed, then running (quiet, ~1 min)..."
  docker pull -q "$IMG" >/dev/null
  set +e
  network_mode=bridge run_temporary "v2-node-$V" -v "$PWD:/m:ro" "$IMG" \
    sh -c 'mkdir -p /tmp/work && cp /m/mcp_bind.mjs /m/package.json /m/package-lock.json /tmp/work/ && cd /tmp/work && npm ci --omit=dev --silent --no-audit --no-fund && node mcp_bind.mjs' \
    2>&1 | tee "$tmp"
  code=${PIPESTATUS[0]}
  set -e
  if [ "$code" -eq 0 ] && grep -qx 'done' "$tmp"; then
    printf '\n== DONE: measurement complete ==\n' | tee -a "$tmp"
    cp "$tmp" "$out"
    echo ">> saved to $out"
  else
    rc=1
    echo ">> run stopped: exit $code, and the measurement did not print its own terminator."
    echo ">> $out left unchanged."
  fi
  rm -f "$tmp"; tmp=""
done

exit "$rc"
