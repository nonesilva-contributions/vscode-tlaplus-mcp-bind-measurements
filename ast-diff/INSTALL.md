# Install and run

`src/run.sh` builds each version in `versions/` on top of each base commit that
lists it in `measurements.gitconfig`, at the root, then compares the version with
that base by their syntax trees. It reads `src/main.ts` and `src/lm/MCPServer.ts`,
and for each function on the path of the host setting it lists the conditions,
the calls and the returns.

You need Docker and git. The comparison runs in a container, with the
TypeScript version that the extension locks.

```text
git clone https://github.com/nonesilva-contributions/vscode-tlaplus-mcp-bind-measurements
git clone https://github.com/tlaplus/vscode-tlaplus
cd vscode-tlaplus-mcp-bind-measurements
ast-diff/src/run.sh ../vscode-tlaplus
```

Each output is a unified diff, `results/v<N>-<base-commit>.diff`, so GitHub and
editors color it. Its first line holds the full id of the base commit. To run one
version only, such as a new one, name it:

```text
ast-diff/src/run.sh ../vscode-tlaplus v3
```

To remove what the run pulled:

```text
docker image rm node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
```

A run that is stopped halfway can leave its container behind. Every container
of this repository carries the label `maintenance.repository-id`, with the id
GitHub gives the repository, so this removes only those:

```text
id=$(git config --file measurements.gitconfig --get repository.id)
docker ps -aq --filter label=maintenance.repository-id=$id | xargs -r docker rm -f
```
