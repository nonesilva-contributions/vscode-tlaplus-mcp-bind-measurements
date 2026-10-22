# Install and run

`src/v1/run.sh` applies each patch of `patches/` on top of each base commit
that lists it in `measurements.gitconfig`, at the root, then runs the checks of
the extension there: `npm run lint`, `npm run vscode:prepublish`, which builds
the extension as it ships, `npm run pretest`, which compiles the extension and
its tests with `tsc`, the tests of the suites `MCP Server regressions` and
`MCP Server Knowledge Base`, the two that build the MCP server, in the real VS
Code extension host, and `npm run test:tlaplus-grammar`.

The other tests of the extension are left out. Some of them start Java, and the
image of the VS Code runs has no Java.

You need Docker and git. The checks run in a container, in the image of the VS
Code runs of `runners/v1/`, and the run downloads the npm packages and VS Code.

```text
git clone https://github.com/nonesilva-contributions/vscode-tlaplus-mcp-bind-measurements
git clone https://github.com/tlaplus/vscode-tlaplus
cd vscode-tlaplus-mcp-bind-measurements
suite/src/v1/run.sh ../vscode-tlaplus
```

Each output is `results/v<N>-<base>.txt`, with the base commit by its short id.
A run that passes ends with the line `done`; a failed step prints
`>> failed:` with its name, and the output file stays as it was. A run in which
no test passed is not written either. To run one version only, name it:

```text
suite/src/v1/run.sh ../vscode-tlaplus v1
```

Of the run of the tests, the output keeps only the report of mocha and the
version of VS Code, without the time of each test, and npm does not look for a
new npm. So two runs on the same images give the same file, except when a new
stable release of VS Code comes out, or when the npm registry marks another
package of the lock file as deprecated.

Run it as a user other than root. The container runs with your user id, and a
container that would run as root is refused, so the run fails.

To remove what the run pulled:

```text
docker image rm node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
```

The run removes the image it builds, but the build leaves its layers in the
build cache of Docker. `runners/v1/INSTALL.md` says how to find and remove
them.

A run that is stopped halfway can leave its container behind. Every container
of this repository carries the label `maintenance.repository-id`, with the id
GitHub gives the repository, so this removes only those:

```text
id=$(git config --file measurements.gitconfig --get repository.id)
docker ps -aq --filter label=maintenance.repository-id=$id | xargs -r docker rm -f
```
