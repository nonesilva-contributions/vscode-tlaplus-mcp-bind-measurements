# Install and run

The code in `src/` is the code of this round. It runs from its own folder.

## Install

You need Docker and git. Nothing runs on the host, and the module refuses to
start outside a container, because case 1 binds every interface.

```text
git clone https://github.com/nonesilva-contributions/vscode-tlaplus-mcp-bind-measurements
cd vscode-tlaplus-mcp-bind-measurements/versions/v2/src
```

## Usage

```text
./run-docker.sh 20 22
```

The runner writes its outputs to `src/results/`, so a new run does not change
the outputs of the round in `results/`.

## Tests

Every case states its expected values. A run that passes prints the line
`done`, and the runner adds `== DONE: measurement complete ==` at the end of its
output. A value that differs prints `MISMATCH`, the run exits with status 1, and
the output file stays as it was.

## Update

```text
git pull
./run-docker.sh 20 22
diff -r results ../results
```

Two runs on the same images give the same files, so the diff shows only real
changes.

## Uninstall

```text
docker image rm node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
```

A run that is stopped halfway can leave its container behind. Every container
of this repository carries the label `maintenance.repository-id`, with the id
GitHub gives the repository, so this removes only those:

```text
id=$(git config --file ../../../measurements.gitconfig --get repository.id)
docker ps -aq --filter label=maintenance.repository-id=$id | xargs -r docker rm -f
```

Then delete the clone.
