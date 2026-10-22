#!/usr/bin/env bash
# Builds each version from the clone on top of each base commit that measurements.gitconfig lists it under, then writes one ast-diff per pair.
# Usage: ast-diff/src/v1/run.sh <clone> [<version>]; with no version, every pair.
set -euo pipefail

usage="usage: $0 <clone of tlaplus/vscode-tlaplus with the base commits of measurements.gitconfig> [<version>], such as v1"
{ [ $# -eq 1 ] || [ $# -eq 2 ]; } && [ -e "$1/.git" ] || { echo "$usage" >&2; exit 2; }
clone="$(cd "$1" && pwd)"
src="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$src/../../.." && pwd)"
results="$repo/ast-diff/results"
# The same pinned image as Node 22 in the runners of the versions; TypeScript is the version the extension locks.
IMG="node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392"
TS=5.8.3
files=(src/main.ts src/lm/MCPServer.ts)

# Each line of git config is base-commit.<base commit>.patch <version>; each pair becomes "<base commit> <version>".
pairs="$(git config --file "$repo/measurements.gitconfig" --get-regexp '^base-commit\..*\.patch$' "^${2:-.*}\$" | sed 's/^base-commit\.\(.*\)\.patch /\1 /')" \
  || { echo "no base commit lists ${2:-any version} in measurements.gitconfig" >&2; exit 2; }
if [ $# -eq 1 ]; then
  for patch in "$repo"/patches/v[0-9]*-0001-*.patch; do
    v="$(basename "$patch")"; v="${v%%-*}"
    grep -q " $v\$" <<< "$pairs" || { echo "no base commit lists $v in measurements.gitconfig" >&2; exit 2; }
  done
fi

work="$(mktemp -d)"
tmp=""
trap 'rm -rf "$work"; [ -z "$tmp" ] || rm -f "$tmp"' EXIT

# The base folder carries the full id and the version folder its name, which the header of each diff prints.
while read -r base v; do
  [[ $base =~ ^[0-9a-f]{40}$ ]] || { echo "base $base of $v is not a full commit id" >&2; exit 2; }
  patch=("$repo/patches/$v"-0001-*.patch)
  [ ${#patch[@]} -eq 1 ] && [ -f "${patch[0]}" ] || { echo "no patch $v in patches/" >&2; exit 2; }
  if [ ! -d "$work/$base" ]; then
    mkdir -p "$work/$base/src/lm"
    for f in "${files[@]}"; do git -C "$clone" show "$base:$f" > "$work/$base/$f"; done
  fi
  mkdir -p "$work/on/$base"
  cp -r "$work/$base" "$work/on/$base/$v"
  (cd "$work/on/$base/$v" && git apply --include=src/main.ts --include=src/lm/MCPServer.ts "${patch[0]}")
done <<< "$pairs"

mkdir -p "$results"
cp "$src/ast-diff.mjs" "$work/"
. "$repo/docker.sh" "$src/run.sh"
# /w is written: the diffs go there.
network_mode=bridge user="$(id -u):$(id -g)" run_temporary ast-diff -v "$work:/w" -w /w "$IMG" sh -c "
  set -e
  npm install --silent --no-audit --no-fund --prefix /tmp/ts typescript@$TS >/dev/null
  cp /w/ast-diff.mjs /tmp/ts/
  set -- $(tr '\n' ' ' <<< "$pairs")
  while [ \$# -gt 0 ]; do node /tmp/ts/ast-diff.mjs \"/w/\$1\" \"/w/on/\$1/\$2\" > \"/w/\$2-\$1.tmp\" && mv \"/w/\$2-\$1.tmp\" \"/w/\$2-\$1.diff\"; shift 2; done
"
while read -r base v; do
  out="$v-$base.diff"
  # The file name starts with the version and ends with its base, by the short id; the header inside keeps the full one.
  name="$v-${base:0:7}.diff"
  if [ -s "$work/$out" ]; then
    # A copy in the folder of the results, then a rename, so that a run stopped halfway leaves the old file whole.
    tmp="$(mktemp "$results/.$name.XXXXXX")"
    cp "$work/$out" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$results/$name" || { rm -f "$tmp"; exit 1; }
    echo ">> wrote ${results#"$repo"/}/$name"
  else
    echo ">> $name was not written; left unchanged" >&2
    exit 1
  fi
done <<< "$pairs"
