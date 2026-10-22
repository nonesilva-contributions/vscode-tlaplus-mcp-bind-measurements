#!/usr/bin/env bash
# Runs one version of one use case where it runs. A run writes only the results/ of that version.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
runners_version="$(basename "$here")"
config="$root/measurements.gitconfig"

# Where a use case can run, in one place: the runs-on value, the kind of code it runs, its
# runner, the variable the runner needs, and a line of help.
places='linux-container|node|docker-node.sh||a Docker container on this computer, no route out
vscode-extension-host|vscode|vscode.sh|VSCODE_CLONE|VS Code in a Docker container
windows-vm|node|windows.sh|WINDOWS_COMMAND|a Windows VM, no route out
ubuntu-vm|node|ubuntu.sh|UBUNTU_COMMAND|an Ubuntu VM, no route out'

field() { awk -F'|' -v p="$1" -v f="$2" '$1 == p { print $f }' <<< "$places"; }

usage() {
  echo "usage: $0 <use case>[/<version>] [<runs-on> ...]"
  echo "  <use case> is a folder of use-cases/, such as 01 or 08d, and <version>"
  echo "  one of its versions, such as v1; the last version by default."
  echo "  With no runs-on value, the use case runs everywhere its section in"
  echo "  measurements.gitconfig says, and skips a place whose variable is not"
  echo "  set. A run writes only the results/ of that version, and only when it"
  echo "  ends with done."
  echo "runs-on:"
  awk -F'|' '{ printf "  %-22s %s%s\n", $1, $5, ($4 ? "; needs " $4 : "") }' <<< "$places"
  echo "VSCODE_CLONE is a clone of tlaplus/vscode-tlaplus at commit c869f2a."
  echo "WINDOWS_COMMAND and UBUNTU_COMMAND are the commands that INSTALL.md"
  echo "describes."
  exit "${1:-2}"
}

[ $# -ge 1 ] || usage
case "$1" in -h|--help|help) usage 0 ;; esac
id="${1%%/*}"; version=""
[[ "$1" != */* ]] || version="${1#*/}"
shift
[[ "$id" =~ ^[0-9]{2}[a-z]?$ ]] && [ -d "$root/use-cases/$id" ] || { echo "unknown use case: $id" >&2; usage; }
[ -n "$version" ] || version="$(cd "$root/use-cases/$id" && ls -d v[0-9]* 2>/dev/null | sort -V | tail -n 1)" || true
case_dir="$root/use-cases/$id/$version"
[[ "$version" =~ ^v[0-9]+$ ]] && [ -d "$case_dir" ] || { echo "unknown version: $id/$version" >&2; usage; }
section="$id/$version"

# The kind of code comes from the file the version holds.
if [ -f "$case_dir/measure.mjs" ]; then
  kind=node
elif [ -f "$case_dir/probe.test.ts" ]; then
  kind=vscode
else
  echo "use case $section holds neither measure.mjs nor probe.test.ts" >&2; exit 2
fi

# The values of a key in one section: "<use case>/<version>" holds what a version runs with,
# and "<use case>" the loopback the use case measures. No other section gives a value.
values() { git config --file "$config" --get-all "use-case.$1.$2" || true; }

# A key that holds one value. Two values are a mistake, so the run stops instead of choosing one.
one() {
  local found
  found="$(values "$1" "$2")"
  case "$found" in
    "") echo "measurements.gitconfig gives $1 no $2" >&2; exit 2 ;;
    *$'\n'*) echo "measurements.gitconfig gives $1 more than one $2" >&2; exit 2 ;;
  esac
  echo "$found"
}

runners="$(one "$section" runners)"
[[ "$runners" =~ ^v[0-9]+$ ]] && [ -x "$root/runners/$runners/run.sh" ] ||
  { echo "the runners $runners that $section names do not exist" >&2; exit 2; }
# A version runs with the runners it names, so an older version keeps its own runners.
[ "$runners" = "$runners_version" ] || exec "$root/runners/$runners/run.sh" "$section" "$@"

# A measure.mjs runs with a lib and the loopback of its use case, and a probe.test.ts with a patch.
loopback="$(values "$id" loopback)"
if [ "$kind" = node ]; then
  [ -z "$(values "$section" patch)" ] || { echo "$section holds a measure.mjs, which runs with no patch" >&2; exit 2; }
  lib="$(one "$section" lib)"
  [[ "$lib" =~ ^v[0-9]+$ ]] && [ -d "$root/lib/$lib" ] || { echo "the lib $lib that $section names does not exist" >&2; exit 2; }
  input="$root/lib/$lib"
  case "$loopback" in
    "") loopback=none ;;
    *$'\n'*) echo "measurements.gitconfig gives $id more than one loopback" >&2; exit 2 ;;
  esac
else
  [ -z "$(values "$section" lib)" ] || { echo "$section holds a probe.test.ts, which runs with no lib" >&2; exit 2; }
  [ -z "$loopback" ] || { echo "use case $id holds a probe.test.ts, which runs with no loopback" >&2; exit 2; }
  patch_version="$(one "$section" patch)"
  [[ "$patch_version" =~ ^v[0-9]+$ ]] || { echo "the patch $patch_version that $section names is not a version, such as v1" >&2; exit 2; }
  patches=("$root/patches/$patch_version"-0001-*.patch)
  [ ${#patches[@]} -eq 1 ] && [ -f "${patches[0]}" ] || { echo "the patch $patch_version does not exist" >&2; exit 2; }
  input="${patches[0]}"
fi

runs_on="$(values "$section" runs-on)"
[ -n "$runs_on" ] || { echo "measurements.gitconfig gives $section no runs-on" >&2; exit 2; }
mapfile -t declared <<< "$runs_on"
# Each place writes its own folder of results/, so a place listed twice would run twice.
[ -z "$(printf '%s\n' "${declared[@]}" | sort | uniq -d)" ] || { echo "measurements.gitconfig gives $section one runs-on twice" >&2; exit 2; }
for p in "${declared[@]}"; do
  [ -n "$(field "$p" 1)" ] || { echo "measurements.gitconfig runs $section on $p, which these runners do not know" >&2; exit 2; }
  [ "$(field "$p" 2)" = "$kind" ] || { echo "measurements.gitconfig runs $section on $p, which does not run a $kind use case" >&2; exit 2; }
done
places_given=("$@")
for p in "${places_given[@]}"; do
  printf '%s\n' "${declared[@]}" | grep -qxF -- "$p" || { echo "use case $section does not run on $p" >&2; usage; }
  need="$(field "$p" 4)"
  [ -z "$need" ] || [ -n "${!need:-}" ] || { echo "$p needs $need" >&2; usage; }
done
[ ${#places_given[@]} -gt 0 ] || places_given=("${declared[@]}")

rc=0
for p in "${places_given[@]}"; do
  need="$(field "$p" 4)"
  if [ -n "$need" ] && [ -z "${!need:-}" ]; then
    echo ">> use case $section on $p: skipped, $need is not set"
    continue
  fi
  echo ">> use case $section on $p"
  if [ "$kind" = node ]; then
    "$here/$(field "$p" 3)" "$case_dir" "$input" "$loopback" || rc=1
  else
    "$here/$(field "$p" 3)" "$case_dir" "$input" || rc=1
  fi
done
exit "$rc"
