<!--
The work, in this order. A step reads only what the steps above it give.
The use cases that answer a reviewer request come first, the others after.

a) For each use case:
1. the reviewer request that it answers
2. measure.mjs and the result files: run the measurement of the shipped code
3. decide from the measurement, in the section "Becomes a test and needs a code fix" of the report
4. the code fix and the test that the decision asks for. Each reviewer request gets a test that fails when the request is broken, even when the code already did it

b) Once, for all use cases:
5. the patch
6. the ast-diff, the suite result, and the measurements that run the patch

c) For each use case:
7. the report, with each value from the runs, and its row of the table, whose columns sum up the decision

d) Once:
8. the draft of the pull request

e) For each use case:
9. the owner checks the work and sets "Owner check" to done
-->
# vscode-tlaplus-mcp-bind-measurements

> A `*-measurements` repository measures how open source software behaves, to
choose what to test. Only the behaviors that matter become tests in the pull
request, so the project's repository does not get a lot of unnecessary tests.

This repository supports the pull request
https://github.com/tlaplus/vscode-tlaplus/pull/544.

## How a reviewer reads this repository

For each request that you made in the review:

1. find its row in the [table below](#what-becomes-a-test-or-needs-a-code-fix),
   in the column "Reviewer request"
2. read the decision, "Becomes a test" and "Needs a code fix", a summary of the
   report
3. read the report of the row: click "see report"
4. see what the patch changes in the code, in
   [`ast-diff/results/`](ast-diff/results/)
5. check the tests in [`patches/`](patches/), and their results in
   [`suite/results/`](suite/results/): a partial run, not all the tests of the
   extension

Each use case stands alone. A "-" in "Reviewer request" marks a case that
the author found.

## What becomes a test or needs a code fix

| # | Reviewer request | Use case | Use case version | Becomes a test | Needs a code fix | Report | Owner check |
|---|------------------|----------|------------------|----------------|------------------|--------|-------------|
| 01 | [make it a preference, default localhost](https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271) | the shipped bind answers outside loopback | v1 | y | y | [see report](use-cases/01/v1/report.md) | done |
| 02 | [bind address as a VS Code setting](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4283168306) | a bind fixed to `127.0.0.1` refuses `<bridge-ip>` and `::1` | v1 | y | y | [see report](use-cases/02/v1/report.md) | done |
| 03 | - | a `Host` allowlist answers a foreign `Host` with `403` | v1 | - | - | [see report](use-cases/03/v1/report.md) | done |
| 04 | [localhost rather than 127.0.0.1](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427) | `localhost` binds one family | v1 | y | y | [see report](use-cases/04/v1/report.md) | done |
| 05 | [guard the address of a failed bind](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4304417980) | Express calls the listen callback with the error | v1 | y | y | [see report](use-cases/05/v1/report.md) | done |
| 06 | - | a number as the host binds the unspecified address | v1 | y | y | [see report](use-cases/06/v1/report.md) | done |
| 07 | [localhost rather than 127.0.0.1](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427) | a client that dials `localhost` can miss a `::1` bind | v1 | y | y | [see report](use-cases/07/v1/report.md) | done |
| 08 | [make it a preference, default localhost](https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271) | VS Code returns the raw JSON value of `tlaplus.mcp.host` | v1 | y | y | [see report](use-cases/08/v1/report.md) | done |
| 08d | [say where the value has to go](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309260075) | the host in the settings of a folder is not applied | v1 | y | y | [see report](use-cases/08d/v1/report.md) | done |
| 09 | [map :: to ::1 on IPv6-only hosts](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309190249) | `[::1]` fails when loopback has no IPv6 | v1 | y | - | [see report](use-cases/09/v1/report.md) | done |
| 12 | - | another server can take the port on the other family | v1 | - | - | [see report](use-cases/12/v1/report.md) | done |
| 13 | - | Express, Node and the SDK limit the input | v1 | - | - | [see report](use-cases/13/v1/report.md) | done |
| 14 | [map :: to ::1 on IPv6-only hosts](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309190249) | with no IPv4 on loopback, `localhost` and the URL of a bind to `::` fail | v1 | y | y | [see report](use-cases/14/v1/report.md) | done |
| 15 | [localhost rather than 127.0.0.1](https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427) | with the order `ipv4first`, `localhost` binds `127.0.0.1` | v1 | y | - | [see report](use-cases/15/v1/report.md) | done |

## Structure

```text
.
├── ast-diff/INSTALL.md                  # how to run the diff of each patch
├── ast-diff/src/v<N>/                   # the code of the diff, by version
├── ast-diff/results/v<N>-<base>.diff    # what patch v<N> changes in the code
│
├── lib/v<N>/                            # the parts the use cases share, by version
│
├── patches/v<N>-<NNNN>-*.patch          # the patch of the pull request in round v<N>
│
├── runners/v<N>/                        # the runners, by version
├── runners/v<N>/INSTALL.md              # how to install and run them
│
├── suite/INSTALL.md                     # how to run the checks of the extension
├── suite/src/v<N>/                      # the code of the checks, by version
├── suite/results/v<N>-<base>.txt        # lint, builds, MCP and grammar tests with patch v<N>
│
├── use-cases/<id>/v<N>/                 # one version of a use case, new when it changes
├── use-cases/<id>/v<N>/report.md        # its purpose, setup, results, test and fix
├── use-cases/<id>/v<N>/results/         # the outputs of its runs
│
├── docker.sh                            # the Docker standard of docker-kit
└── measurements.gitconfig               # the repository, and what each version runs with
```
