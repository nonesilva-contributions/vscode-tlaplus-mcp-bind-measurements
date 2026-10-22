#!/usr/bin/env bash
# Runs the lint, the two builds, the MCP server tests in the VS Code extension host and the grammar tests of
# the extension, with each patch on each base commit that measurements.gitconfig lists it under, then writes
# one output per pair.
# Usage: suite/src/v1/run.sh <clone> [<version>]; with no version, every pair.
set -euo pipefail

usage="usage: $0 <clone of tlaplus/vscode-tlaplus with the base commits of measurements.gitconfig> [<version>], such as v1"
{ [ $# -eq 1 ] || [ $# -eq 2 ]; } && [ -e "$1/.git" ] || { echo "$usage" >&2; exit 2; }
clone="$(cd "$1" && pwd)"
src="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$src/../../.." && pwd)"
results="$repo/suite/results"
# The same pinned image as Node 22 in the runners of the use cases.
IMG="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"

# Each line of git config is base-commit.<base commit>.patch <version>; each pair becomes "<base commit> <version>".
pairs="$(git config --file "$repo/measurements.gitconfig" --get-regexp '^base-commit\..*\.patch$' "^${2:-.*}\$" | sed 's/^base-commit\.\(.*\)\.patch /\1 /')" \
  || { echo "no base commit lists ${2:-any version} in measurements.gitconfig" >&2; exit 2; }

. "$repo/docker.sh" "$src/run.sh"
# The image of the VS Code runs: the system packages that VS Code needs, from a pinned apt snapshot.
build_image suite --build-arg BASE="$IMG" -f "$repo/runners/v1/vscode.Dockerfile" "$repo/runners/v1" >/dev/null
image="$(image_tag suite)"
log=""
tmp=""
cleanup() {
  [ -z "$log" ] || rm -f "$log"
  [ -z "$tmp" ] || rm -f "$tmp"
  docker image rm "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The steps in the container. Each step prints its name, and the first error stops the run.
script="$(cat <<'EOF'
set -euo pipefail
step="start"
trap 'echo ">> failed: $step, exit $?"' ERR

step="clone the base commit"; echo ">> $step"
git clone -q --no-checkout /w /build/ext
cd /build/ext
git -c advice.detachedHead=false checkout -q "$BASE"

step="apply the patch $PATCH_VERSION"; echo ">> $step"
git apply /patch

step="npm ci"; echo ">> $step"
# No test of these steps uses a browser, so Playwright does not download Chromium.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund >/dev/null

step="npm run lint"; echo ">> $step"
npm run lint --silent

step="npm run vscode:prepublish"; echo ">> $step"
npm run vscode:prepublish --silent

step="npm run pretest"; echo ">> $step"
npm run pretest --silent

step="the MCP server tests in the extension host"; echo ">> $step"
# The suites MCP Server regressions and MCP Server Knowledge Base, the two that build the MCP server.
MOCHA_GREP="MCP Server" xvfb-run --auto-servernum node ./out/tests/runTest.js

step="npm run test:tlaplus-grammar"; echo ">> $step"
npm run test:tlaplus-grammar --silent

echo done
EOF
)"

mkdir -p "$results"
rc=0
while read -r base v; do
  [[ $base =~ ^[0-9a-f]{40}$ ]] || { echo "base $base of $v is not a full commit id" >&2; exit 2; }
  patch=("$repo/patches/$v"-0001-*.patch)
  [ ${#patch[@]} -eq 1 ] && [ -f "${patch[0]}" ] || { echo "no patch $v in patches/" >&2; exit 2; }
  name="$v-${base:0:7}.txt"
  echo ">> $name: the lint, the build and the tests of the extension at $base with patch $v; it downloads npm packages and VS Code"
  log="$(mktemp)"
  set +e
  # npm checks for a new npm on each run, and its notice would change the output from one day to the next.
  network_mode=bridge user="$(id -u):$(id -g)" tmpfs=/tmp:exec mem_limit=4g cpus=2 pids_limit=512 \
    run_temporary "suite-$v" --tmpfs "/build:exec,uid=$(id -u),gid=$(id -g)" -e npm_config_update_notifier=false \
    -e BASE="$base" -e PATCH_VERSION="$v" -v "$clone:/w:ro" -v "${patch[0]}:/patch:ro" "$image" bash -lc "$script" 2>&1 | tee "$log"
  code=${PIPESTATUS[0]}
  set -e
  # Of the run of the tests, only the report of mocha and the version of VS Code are kept, without the time of
  # each test: VS Code and the extension print their own logs there, with ports and ids that change on each run.
  # A grep of mocha that matches no test passes with 0 tests, so a run that passes no test is not written.
  tmp="$(mktemp "$results/.$name.XXXXXX")"
  if [ "$code" -eq 0 ] && [ "$(tail -n 1 "$log")" = "done" ] &&
    sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' "$log" | awk '
      /^>> the MCP server tests in the extension host$/ { print; tests = 1; next }
      /^>> / { tests = 0 }
      tests && /^✔ Validated version: / { print; next }
      tests && !/^  / { next }
      { sub(/ \([0-9]+(ms|s|m)\)$/, ""); print }' > "$tmp" &&
    grep -Eq '^  [1-9][0-9]* passing$' "$tmp"; then
    chmod 644 "$tmp" && mv -f "$tmp" "$results/$name"
    echo ">> wrote suite/results/$name"
  else
    rc=1
    echo ">> $name was not written: exit $code, the output did not end with done, or no test passed; left unchanged" >&2
  fi
  rm -f "$log" "$tmp"; log=""; tmp=""
done <<< "$pairs"

exit "$rc"
