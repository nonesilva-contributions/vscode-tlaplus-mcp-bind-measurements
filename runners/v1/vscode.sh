#!/usr/bin/env bash
# Runs one use case, its probe.test.ts, in the real VS Code extension host in Docker, with the
# patch given. The output goes to results/vscode/<patch version>.txt of the use case.
# Usage: runners/v1/vscode.sh <version folder of a use case> <patch>, with VSCODE_CLONE set.
# run.sh passes the two, read from measurements.gitconfig.
set -euo pipefail

usage() {
  echo "usage: $0 <version folder of a use case> <patch>" >&2
  echo "  VSCODE_CLONE is a clone of tlaplus/vscode-tlaplus at commit c869f2a." >&2
  exit 2
}
[ $# -eq 2 ] || usage
[ -f "$1/probe.test.ts" ] && [ -f "$2" ] || usage
case_dir="$(cd "$1" && pwd)" patch="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
root="$(cd "$(dirname "$0")/../.." && pwd)"
[ -n "${VSCODE_CLONE:-}" ] && [ -e "$VSCODE_CLONE/.git" ] || usage
clone="$(cd "$VSCODE_CLONE" && pwd)"
patch_version="$(basename "$patch")"; patch_version="${patch_version%%-*}"
[[ "$patch_version" =~ ^v[0-9]+$ ]] || { echo "the patch $patch does not start with its version, such as v1-" >&2; exit 2; }

# The same pinned image as Node 22 in runners/v1/docker-node.sh.
IMG="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"
BAR="============================================================"
. "$root/docker.sh" "$root/runners/v1/vscode.sh"

outdir="$case_dir/results/vscode"
out="$outdir/$patch_version.txt"
mkdir -p "$outdir"
name="$(basename "$(dirname "$case_dir")")-$(basename "$case_dir")"
container=""; log=""; tmp=""; image=""
cleanup() {
  [ -z "$log" ] || rm -f "$log"
  [ -z "$tmp" ] || rm -f "$tmp"
  [ -z "$image" ] || docker image rm "$image" >/dev/null 2>&1 || true
}
# On Ctrl-C the runner stops the running container, and --rm removes it.
stop() { [ -z "$container" ] || docker kill "$container" >/dev/null 2>&1 || true; cleanup; exit 130; }
trap cleanup EXIT
trap stop INT TERM

# The steps in the container. Each step prints its name, and the first error stops the run.
script="$(cat <<'EOF'
set -euo pipefail
step="start"
trap 'echo ">> failed: $step, exit $?"' ERR

step="copy the clone to /build"; echo ">> $step"
cp -r /w/. /build
cd /build

step="check the commit of the clone"; echo ">> $step"
base=c869f2a64289d748d7a063bccc8d3e4945b141e9
head="$(git rev-parse HEAD)"
if [ "$head" != "$base" ]; then
  echo ">> The clone is at $head, not at $base."
  echo ">> Check out $base in the clone, then run again. The runner never moves the clone."
  exit 3
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo ">> The clone has changes in tracked files. The measurement needs a clean $base."
  exit 3
fi
git checkout -q "$base"

step="apply the patch $PATCH_VERSION"; echo ">> $step"
git apply /patch

step="copy the probe into tests/suite/lm"; echo ">> $step"
cp /case-src/probe.test.ts tests/suite/lm/mcpBindProbe.test.ts

if [ -d /case-src/folder ]; then
  step="open the folder of the use case"; echo ">> $step"
  # runTest.ts opens no folder, and a use case that has folder/ needs the settings of an opened folder.
  folder=/build/opened-folder
  cp -r /case-src/folder "$folder"
  sed -i "s|launchArgs: \['--disable-extensions']|launchArgs: ['$folder', '--disable-extensions']|" tests/runTest.ts
  grep -qF "launchArgs: ['$folder', '--disable-extensions']" tests/runTest.ts
fi

step="npm ci"; echo ">> $step"
# The probe uses no browser, so Playwright does not download Chromium.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund

step="npm run pretest"; echo ">> $step"
npm run pretest

step="run the probe in the extension host, patch version $PATCH_VERSION"; echo ">> $step"
# PATCH_VERSION reaches the extension host through the environment, as MOCHA_GREP does.
MOCHA_GREP="MCP bind probe in the extension host" xvfb-run --auto-servernum node ./out/tests/runTest.js

# The limits of docker run must hold these peaks.
echo ">> peak memory $(cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo unknown) bytes, peak tasks $(cat /sys/fs/cgroup/pids.peak 2>/dev/null || echo unknown)"
EOF
)"

echo ">> building the image with the system packages of the VS Code runs"
# The system packages are installed when the image is built, so no container of the measurement runs as root.
# Each use case version gets its own tag and removes only that tag, so a run never takes the image of another.
build_image "vscode-$name" --build-arg BASE="$IMG" -f "$root/runners/v1/vscode.Dockerfile" "$root/runners/v1" >/dev/null
image="$(image_tag "vscode-$name")"

echo ">> running use case $name with ${patch#"$root"/}; it downloads npm packages and VS Code, so it takes some minutes"
log="$(mktemp)"
role="use-case-$name-vscode-$patch_version"
container="$(container_name "$role")"
set +e
# /build keeps the paths the probe prints, and exec lets VS Code and the npm scripts run from the two tmpfs.
network_mode=bridge user="$(id -u):$(id -g)" tmpfs=/tmp:exec mem_limit=4g cpus=2 pids_limit=512 \
  run_temporary "$role" --tmpfs "/build:exec,uid=$(id -u),gid=$(id -g)" \
  -e PATCH_VERSION="$patch_version" \
  -v "$clone:/w:ro" -v "$case_dir:/case-src:ro" -v "$patch:/patch:ro" "$image" bash -lc "$script" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
set -e
container=""

# Keeps only the probe block: from its first bar line to "done" or "MISMATCH".
tmp="$(mktemp "$outdir/.$patch_version.XXXXXX")"
esc="$(printf '\033')"
sed -e "s/${esc}\[[0-9;?]*[A-Za-z]//g" -e 's/\r$//' "$log" | awk -v bar="$BAR" '
  !on && $0 == bar { on = 1 }
  on && !off { print }
  on && ($0 == "done" || $0 == "MISMATCH") { off = 1 }
' > "$tmp"

# The output changes only when the run passes.
if [ "$code" -eq 0 ] && [ -s "$tmp" ] && [ "$(tail -n 1 "$tmp")" = "done" ]; then
  chmod 644 "$tmp" && mv -f "$tmp" "$out"
  tmp=""
  echo ">> saved to $out"
else
  cat "$tmp"
  echo ">> run stopped: exit $code, and the probe did not end with done. $out is unchanged."
  exit 1
fi
