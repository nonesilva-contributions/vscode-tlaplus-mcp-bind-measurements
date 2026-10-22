#!/usr/bin/env bash
# Runs one use case in its own container, from the base image of the lib version it uses, on an
# internal Docker network of its own: a non-loopback address to connect from, and no route out.
# Each Node version gets its own container and network, removed on exit, even on Ctrl-C.
# Usage: runners/v1/docker-node.sh <version folder of a use case> <lib folder> <none | no-ipv6>
# run.sh passes the three, read from measurements.gitconfig; the last is the loopback of the use case.
set -euo pipefail
usage() {
  echo "usage: $0 <version folder of a use case> <lib folder> <loopback: none | no-ipv6>" >&2
  exit 2
}
[ $# -eq 3 ] || usage
[ -f "$1/measure.mjs" ] && [ -f "$2/Dockerfile" ] || usage
case_dir="$(cd "$1" && pwd)" lib="$(cd "$2" && pwd)" loopback=$3
lib_version="$(basename "$lib")"
root="$(cd "$(dirname "$0")/../.." && pwd)"

IMG20="node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0"
IMG22="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"

case "$loopback" in
  none) sysctls=() ;;
  no-ipv6) sysctls=(--sysctl net.ipv6.conf.all.disable_ipv6=1 --sysctl net.ipv6.conf.lo.disable_ipv6=1) ;;
  *) usage ;;
esac

. "$root/docker.sh" "$root/runners/v1/docker-node.sh"

outdir="$case_dir/results/docker-debian-12"
mkdir -p "$outdir"
name="$(basename "$(dirname "$case_dir")")-$(basename "$case_dir")"
tmp=""; net=""; rc=0
cleanup() {
  [ -z "$tmp" ] || rm -f "$tmp"
  [ -z "$net" ] || docker network rm "$net" >/dev/null 2>&1 || true
}
stop() { cleanup; exit 130; }
trap cleanup EXIT
trap stop INT TERM

for V in 20 22; do
  case "$V" in
    20) IMG="$IMG20" ;;
    22) IMG="$IMG22" ;;
  esac
  out="$outdir/node-$V.txt"
  role="use-case-$name-linux-container-node-$V"
  echo ">> the base of lib $lib_version on node:$V-slim, built once and then taken from the build cache..."
  base="$(build_image "lib-$lib_version-node-$V" --build-arg BASE="$IMG" "$lib")"
  net="$(container_name "$role")"
  docker network create --internal "${docker_labels[@]}" --label maintenance.lifetime=temporary \
    --label "maintenance.created-by=$docker_created_by" "$net" >/dev/null
  echo ">> $role, in its own container, on an internal network with no route out..."
  # The run writes next to the output and replaces it only when it ends with done.
  tmp="$(mktemp "$outdir/.node-$V.XXXXXX")"
  set +e
  network_mode="$net" run_temporary "$role" "${sysctls[@]}" -v "$case_dir/measure.mjs:/work/case/measure.mjs:ro" \
    "$base" node case/measure.mjs 2>&1 | tee "$tmp"
  code=${PIPESTATUS[0]}
  set -e
  docker network rm "$net" >/dev/null
  net=""
  if [ "$code" -eq 0 ] && [ "$(tail -n 1 "$tmp")" = "done" ]; then
    chmod 644 "$tmp" && mv -f "$tmp" "$out"
    tmp=""
    echo ">> saved to $out"
  else
    rc=1
    rm -f "$tmp"; tmp=""
    echo ">> run stopped: exit $code, and the output did not end with done. $out is unchanged."
  fi
done

exit "$rc"
