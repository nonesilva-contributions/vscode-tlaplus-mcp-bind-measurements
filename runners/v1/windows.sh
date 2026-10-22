#!/usr/bin/env bash
# Runs one use case in a Windows machine with no route out, once for each pinned Node version.
# Usage: runners/v1/windows.sh <version folder of a use case> <lib folder> none, with
# WINDOWS_COMMAND set. run.sh passes the three, read from measurements.gitconfig; the last is
# the loopback of the use case, which a Windows machine leaves as it is.
set -euo pipefail
usage() {
  echo "usage: $0 <version folder of a use case> <lib folder> <loopback: none>" >&2
  echo "  WINDOWS_COMMAND DIR ARGS... copies DIR into a Windows machine with no route out," >&2
  echo "  runs DIR\\windows.ps1 ARGS... there, prints its stdout and exits with its code." >&2
  exit 2
}
[ $# -eq 3 ] && [ "$3" = none ] || usage
[ -f "$1/measure.mjs" ] && [ -f "$2/Dockerfile" ] || usage
case_dir="$(cd "$1" && pwd)" lib="$(cd "$2" && pwd)"
lib_version="$(basename "$lib")"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
[ -n "${WINDOWS_COMMAND:-}" ] && command -v "$WINDOWS_COMMAND" >/dev/null || usage
copy_and_run="$(command -v "$WINDOWS_COMMAND")"
case "$copy_and_run" in */*) copy_and_run="$(cd "$(dirname "$copy_and_run")" && pwd)/$(basename "$copy_and_run")" ;; esac
. "$root/docker.sh" "$root/runners/v1/windows.sh"

# The same pinned image as Node 22 in runners/v1/docker-node.sh.
IMG="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"
# The Node versions of the pinned images in runners/v1/docker-node.sh.
nodes=(v20.20.2 v22.23.3)
name="$(basename "$(dirname "$case_dir")")-$(basename "$case_dir")"
work="$(mktemp -d)"; rc=0
cleanup() { rm -rf "$work"; }
stop() { cleanup; exit 130; }
trap cleanup EXIT
trap stop INT TERM

# A native file built on Linux does not load on Windows.
check="$(cat <<'EOF'
const fs = require("node:fs"), path = require("node:path");
const magic = ["7f454c46", "4d5a", "cffaedfe", "cefaedfe", "feedfacf", "feedface", "cafebabe"];
const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const head = Buffer.alloc(4);
    if (e.isFile()) { const fd = fs.openSync(p, "r"); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd); }
    if (!e.isFile() || /\.(node|dll|exe|so|dylib)$|^binding\.gyp$/.test(e.name) ||
        magic.some((m) => head.toString("hex").startsWith(m))) found.push(p);
  }
};
walk("node_modules");
if (found.length) { console.error("not plain JavaScript:\n" + found.join("\n")); process.exitCode = 1; }
EOF
)"

echo ">> ${nodes[*]} for Windows from nodejs.org, downloaded once and then taken from the build cache..."
dist="$(build_image node-dist-runners-v1-win-x64 --build-arg BASE="$IMG" --build-arg ARCHIVE=win-x64.zip \
  --build-arg VERSIONS="${nodes[*]}" -f "$here/node-dist.Dockerfile" "$here")"
mkdir "$work/node"
# /out is written: it gets the Node builds that Windows receives.
user="$(id -u):$(id -g)" run_temporary "use-case-$name-windows-node" -v "$work/node:/out" "$dist" sh -c 'cp -r /dist/. /out/'
echo ">> the base of lib $lib_version on node:22-slim, built once and then taken from the build cache..."
base="$(build_image "lib-$lib_version-node-22" --build-arg BASE="$IMG" "$lib")"
echo ">> lib/ and node_modules/ out of the base, for the folder that Windows gets..."
mkdir -p "$work/mcp/case"
cp "$case_dir/measure.mjs" "$work/mcp/case/"
cp "$here/windows.ps1" "$work/mcp/"
# /out is written: it gets what Windows receives.
user="$(id -u):$(id -g)" run_temporary "use-case-$name-windows-bundle" -v "$work/mcp:/out" "$base" \
  sh -c 'cp -r /work/lib /work/node_modules /out/ && cd /out && node -e "$1"' sh "$check"

# Windows has no network for npm, so each folder holds node_modules and one checked zip.
run_one() {
  local v=$1 major=$2 dir="$work/win-$1" log="$work/out-$1.txt" code system out tmp
  cp -r "$work/mcp" "$dir"
  cp "$work/node/$v/SHASUMS256.txt" "$work/node/$v/node-$v-win-x64.zip" "$dir/"
  set +e
  "$copy_and_run" "$dir" -Version "$v" | sed 's/\r$//' | tee "$log"
  code=${PIPESTATUS[0]}
  set -e
  # The folder is named after the guest's own first line, such as windows-11-24h2.
  system="$(sed -n '1s/^guest: Microsoft Windows \([0-9][0-9]*\) .* \([0-9][0-9][Hh][0-9]\), build .*/windows-\1-\2/p' "$log" | tr 'A-Z' 'a-z')"
  if [ "$code" -eq 0 ] && [ -n "$system" ] && [ "$(tail -n 1 "$log")" = "done" ]; then
    mkdir -p "$case_dir/results/$system"
    out="$case_dir/results/$system/node-$major.txt"
    tmp="$(mktemp "$case_dir/results/$system/.node-$major.XXXXXX")"
    cp "$log" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$out"
    echo ">> saved to $out"
  else
    rc=1
    echo ">> run stopped: exit $code, the guest line gave '${system:-no system}', or the output did not end with done."
    echo ">> node-$major.txt left unchanged in $case_dir/results/windows-*/."
  fi
  rm -rf "$dir"
}

for v in "${nodes[@]}"; do
  echo
  echo ">> Node $v on Windows..."
  major="${v#v}"; major="${major%%.*}"
  run_one "$v" "$major"
done

exit "$rc"
