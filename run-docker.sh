#!/usr/bin/env bash
# Runs mcp_bind.mjs in a digest-pinned node image on Docker's default bridge: its
# own netns, no host firewall, a non-loopback address to connect from. The
# container is removed on exit, even on Ctrl-C. Usage: ./run-docker.sh 20 22
set -euo pipefail
cd "$(dirname "$0")"

IMG20="node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0"
IMG22="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"

versions=("$@"); [ ${#versions[@]} -gt 0 ] || versions=(20 22)
mkdir -p results
name=""; tmp=""
cleanup() {
  [ -n "$name" ] && docker rm -f "$name" >/dev/null 2>&1 || true
  [ -n "$tmp" ] && rm -f "$tmp" || true
}
trap cleanup EXIT INT TERM

echo "Running the measurement in Docker. Each Node version takes about a minute,"
echo "and the output appears in bursts, not line by line."

for V in "${versions[@]}"; do
  case "$V" in
    20) IMG="$IMG20" ;;
    22) IMG="$IMG22" ;;
    *) echo "unknown node version: $V (pinned versions: 20, 22)"; exit 2 ;;
  esac
  out="results/node$V-docker-bridge.txt"
  tmp="$(mktemp)"
  name="mcp-bind-$V-$$"
  echo
  echo ">> node:$V-slim: fetching the image if needed, then running (quiet, ~1 min)..."
  docker pull -q "$IMG" >/dev/null
  set +e
  docker run --rm --name "$name" -v "$PWD:/m:ro" "$IMG" \
    sh -c 'mkdir -p /work && cp /m/mcp_bind.mjs /m/package.json /work/ && cd /work && npm install --omit=dev --silent --no-audit --no-fund && node mcp_bind.mjs' \
    2>&1 | tee "$tmp"
  code=${PIPESTATUS[0]}
  set -e
  if [ "$code" -eq 0 ]; then
    printf '\n== DONE: measurement complete ==\n' | tee -a "$tmp"
    cp "$tmp" "$out"
    echo ">> saved to $out"
  else
    echo ">> run stopped (exit $code); $out left unchanged."
  fi
  rm -f "$tmp"; tmp=""
done
