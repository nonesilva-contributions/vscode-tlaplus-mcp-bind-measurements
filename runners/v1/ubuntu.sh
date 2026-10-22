#!/usr/bin/env bash
# Runs one use case in an Ubuntu machine with no route out, once for each pinned Node version.
# Usage: runners/v1/ubuntu.sh <version folder of a use case> <lib folder> no-ipv4, with
# UBUNTU_COMMAND set. run.sh passes the three, read from measurements.gitconfig; the last is
# the loopback of the use case, which ubuntu-guest.sh sets up in a network namespace.
set -euo pipefail
usage() {
  echo "usage: $0 <version folder of a use case> <lib folder> <loopback: no-ipv4>" >&2
  echo "  UBUNTU_COMMAND DIR ARGS... copies DIR into an Ubuntu machine with no route out," >&2
  echo "  runs DIR/ubuntu-guest.sh ARGS... there as a user with sudo, prints its stdout" >&2
  echo "  and exits with its code." >&2
  exit 2
}
[ $# -eq 3 ] && [ "$3" = no-ipv4 ] || usage
[ -f "$1/measure.mjs" ] && [ -f "$2/Dockerfile" ] || usage
case_dir="$(cd "$1" && pwd)" lib="$(cd "$2" && pwd)"
lib_version="$(basename "$lib")"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
[ -n "${UBUNTU_COMMAND:-}" ] && command -v "$UBUNTU_COMMAND" >/dev/null || usage
copy_and_run="$(command -v "$UBUNTU_COMMAND")"
case "$copy_and_run" in */*) copy_and_run="$(cd "$(dirname "$copy_and_run")" && pwd)/$(basename "$copy_and_run")" ;; esac
. "$root/docker.sh" "$root/runners/v1/ubuntu.sh"

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

echo ">> ${nodes[*]} for Linux from nodejs.org, downloaded once and then taken from the build cache..."
dist="$(build_image node-dist-runners-v1-linux-x64 --build-arg BASE="$IMG" --build-arg ARCHIVE=linux-x64.tar.xz \
  --build-arg VERSIONS="${nodes[*]}" -f "$here/node-dist.Dockerfile" "$here")"
mkdir "$work/node"
# /out is written: it gets the Node builds that the machine receives.
user="$(id -u):$(id -g)" run_temporary "use-case-$name-ubuntu-node" -v "$work/node:/out" "$dist" sh -c 'cp -r /dist/. /out/'
echo ">> the base of lib $lib_version on node:22-slim, built once and then taken from the build cache..."
base="$(build_image "lib-$lib_version-node-22" --build-arg BASE="$IMG" "$lib")"
echo ">> lib/ and node_modules/ out of the base, for the folder that the machine gets..."
mkdir -p "$work/mcp/case"
cp "$case_dir/measure.mjs" "$work/mcp/case/"
# /out is written: it gets what the machine receives.
user="$(id -u):$(id -g)" run_temporary "use-case-$name-ubuntu-bundle" -v "$work/mcp:/out" "$base" \
  sh -c 'cp -r /work/lib /work/node_modules /out/'

# The machine has no network for npm, so each folder holds one checked Node and node_modules in one archive.
run_one() {
  local v=$1 major=$2 dir="$work/linux-$1" log="$work/out-$1.txt" code system out tmp
  mkdir "$dir"
  tar -cf "$dir/mcp.tar" -C "$work/mcp" .
  cp "$here/ubuntu-guest.sh" "$work/node/$v/node-$v-linux-x64.tar.xz" "$dir/"
  set +e
  "$copy_and_run" "$dir" "$v" | tee "$log"
  code=${PIPESTATUS[0]}
  set -e
  # The folder is named after the guest's own first line, such as ubuntu-24.04.
  system="$(sed -n '1s/^guest: Ubuntu \([0-9][0-9]\.[0-9][0-9]\).*/ubuntu-\1/p' "$log")"
  if [ "$code" -eq 0 ] && [ -n "$system" ] && [ "$(tail -n 1 "$log")" = "done" ]; then
    mkdir -p "$case_dir/results/$system"
    out="$case_dir/results/$system/node-$major.txt"
    tmp="$(mktemp "$case_dir/results/$system/.node-$major.XXXXXX")"
    cp "$log" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$out"
    echo ">> saved to $out"
  else
    rc=1
    echo ">> run stopped: exit $code, the guest line gave '${system:-no system}', or the output did not end with done."
    echo ">> node-$major.txt left unchanged in $case_dir/results/ubuntu-*/."
  fi
  rm -rf "$dir"
}

for v in "${nodes[@]}"; do
  echo
  echo ">> Node $v on Ubuntu, with no IPv4 on loopback..."
  major="${v#v}"; major="${major%%.*}"
  run_one "$v" "$major"
done

exit "$rc"
