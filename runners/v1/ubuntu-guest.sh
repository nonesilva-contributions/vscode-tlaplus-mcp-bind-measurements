#!/usr/bin/env bash
# Runs case/measure.mjs in a new network namespace of this machine, whose loopback has no IPv4.
# Usage: ubuntu-guest.sh <Node version, such as v22.23.3>, as a user with sudo.
set -euo pipefail
cd "$(dirname "$0")"
. /etc/os-release
echo "guest: $PRETTY_NAME, kernel $(uname -r)"
tar -xJf "node-$1-linux-x64.tar.xz"
tar -xf mcp.tar
# A new network namespace holds only a loopback. Deleting 127.0.0.1 leaves it ::1, and the measurement runs as this user again.
sudo unshare --net -- sh -c 'ip link set lo up && ip addr del 127.0.0.1/8 dev lo && exec setpriv --reuid "$1" --regid "$2" --init-groups "$3" case/measure.mjs' \
  sh "$(id -u)" "$(id -g)" "$PWD/node-$1-linux-x64/bin/node"
