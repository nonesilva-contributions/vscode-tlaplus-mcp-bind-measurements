#!/usr/bin/env bash
# Runs the last version of every use case, one after the other. run.sh hands a use case to the
# runners it names. A use case that fails does not stop the others.
# Usage: runners/v1/run-all.sh [<clone of tlaplus/vscode-tlaplus at commit c869f2a>]
set -euo pipefail
[ $# -le 1 ] || { echo "usage: $0 [<clone of tlaplus/vscode-tlaplus at commit c869f2a>]" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
if [ $# -eq 1 ]; then
  VSCODE_CLONE="$(cd "$1" && pwd)"
  export VSCODE_CLONE
fi
rc=0
for dir in "$root"/use-cases/*/; do
  "$here/run.sh" "$(basename "$dir")" || rc=1
done
exit "$rc"
