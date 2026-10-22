# Install and run

These runners run the use case versions whose section in
`measurements.gitconfig` says `runners = v1`. They run from the root of the
repository.

## Install

You need:

- Docker and git; the runs download Node, the npm packages and VS Code into
  containers, and no use case runs on your own computer;
- for the use cases that run on Windows, a Windows 10 or 11 machine with no
  route out, and a command that runs a folder there, as described below;
- for the use cases that run on Ubuntu, an Ubuntu machine with no route out
  where the user has sudo, and a command that runs a folder there, as
  described below.

```text
git clone https://github.com/nonesilva-contributions/vscode-tlaplus-mcp-bind-measurements
git clone https://github.com/tlaplus/vscode-tlaplus
git -C vscode-tlaplus checkout c869f2a64289d748d7a063bccc8d3e4945b141e9
cd vscode-tlaplus-mcp-bind-measurements
```

## Usage

```text
runners/v1/run.sh --help
runners/v1/run.sh 01 linux-container
```

`run.sh` runs one use case, its last version or the one given, such as
`01/v1`, everywhere its `runs-on` values say, or only on the values given.
With no value given, it skips a place whose variable is not set. A run writes
only the `results/` of that version, and only when it ends with `done`.

`measurements.gitconfig` gives each use case version a section of its own,
such as `[use-case "09/v1"]`, with its runners, its lib or its patch, and the
places it runs on. A section of a use case, such as `[use-case "09"]`, holds
only the loopback that the use case measures. No section gives a value to
another one. A new version gets a new section, and a written section does not
change.

The run stops with exit status 2, and says why, on a wrong command line, such
as a use case with no version folder, or a place given whose variable is not
set. It also stops so when the section of the use case gives two loopback
values, and when the version:

- has no section, or its section lacks a key, or gives two values to a key
  that holds one;
- names runners, a lib or a patch that does not exist;
- holds a `measure.mjs` with a patch, or a `probe.test.ts` with a lib or a
  loopback;
- holds neither a `measure.mjs` nor a `probe.test.ts`;
- runs on a place twice, on a place these runners do not know, or on a place
  that does not run its kind of code.

Run the runners as a user other than root. Some containers run with your user
id, and a container that would run as root is refused, so the run fails.

```text
runners/v1/run-all.sh ../vscode-tlaplus
```

`run-all.sh` runs the last version of every use case, one after the other,
each with the runners that `measurements.gitconfig` gives it. A use case that
fails does not stop the others, and a `runs-on` value whose variable is not
set is skipped.

| `runs-on` | Where it runs | Output in `results/` of the version |
|-----------|---------------|-------------------------------------|
| `linux-container` | a Docker container of its own, on an internal network with no route out; with `loopback = no-ipv6`, with no IPv6 on loopback | `docker-debian-12/` |
| `vscode-extension-host` | the VS Code extension host, in a Docker container, with the patch of the version; needs `VSCODE_CLONE` | `vscode/` |
| `windows-vm` | a Windows VM; needs `WINDOWS_COMMAND` | `windows-<version>/` |
| `ubuntu-vm` | an Ubuntu VM, only with `loopback = no-ipv4`, in a network namespace whose loopback has no IPv4; needs `UBUNTU_COMMAND` | `ubuntu-<release>/` |

The `linux-container`, `windows-vm` and `ubuntu-vm` runs take the pinned Node
packages from the base image of the lib that the use case version names. The
base is built once, from `lib/<version>/Dockerfile`, and later runs take it
from the build cache, so a `linux-container` run needs no internet after the
first one. The `windows-vm` and `ubuntu-vm` runs take the Node builds of the VM
from an image that `runners/v1/node-dist.Dockerfile` builds once, from
`nodejs.org`, checked against the `SHASUMS256.txt` of each release.

`VSCODE_CLONE` is the clone of the extension at commit `c869f2a`, such as
`../vscode-tlaplus`.

`WINDOWS_COMMAND DIR -Version <version>` copies the folder `DIR` to the
Windows machine, runs `DIR\windows.ps1 -Version <version>` there, prints its
output and exits with its exit code. With ssh, it is a short script around
`scp -r` and `ssh`. The output goes to a folder named after the Windows build
the machine reports, such as `windows-11-24h2/`.

`UBUNTU_COMMAND DIR <version>` copies the folder `DIR` to the Ubuntu machine,
runs `DIR/ubuntu-guest.sh <version>` there as a user with sudo, prints its
output and exits with its exit code. The script removes 127.0.0.1 only in a
network namespace of its own, not on the machine. The output goes to a folder
named after the release the machine reports, such as `ubuntu-24.04/`.

## Tests

Every use case states its expected values. A run that passes ends with the
line `done`. A value that differs prints `MISMATCH`, the run exits with status
1, and the output file stays as it was.

## Update

```text
git pull
runners/v1/run-all.sh ../vscode-tlaplus
git diff use-cases/
```

Two `linux-container` runs on the same images give the same files, so the
diff shows only real changes. A `vscode-extension-host` run takes the stable
release of VS Code of that day, and a VM run takes the system of the VM as it
is, so their files also change with a new release of VS Code or of the system.

## Uninstall

The base images of the lib versions and the images of the Node builds stay
between runs. Each base adds about 14 MB to its Node image, and the Node builds
take about 66 MB for Windows and 57 MB for Ubuntu. Every image, container and
network of the runs
carries the label `maintenance.repository-id`, with the id GitHub gives the
repository, so this removes only those, and then the Node images:

```text
id=$(git config --file measurements.gitconfig --get repository.id)
docker ps -aq --filter label=maintenance.repository-id=$id | xargs -r docker rm -f
docker network ls -q --filter label=maintenance.repository-id=$id | xargs -r docker network rm
docker images -q --filter label=maintenance.repository-id=$id | xargs -r docker image rm
docker image rm node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
```

The `vscode-extension-host` runs remove their image, but the build leaves about
430 MB in the build cache of Docker. `docker buildx du --verbose` lists the
record of the `apt-get install` step of `runners/v1/vscode.Dockerfile`, and of
the `npm ci` step of `lib/<version>/Dockerfile`, and
`docker buildx prune --filter id=<id>` removes each one.

Then delete the two clones.
