# Use case 08/v1

## 08.1 Purpose

The review
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>
asked for a preference: "Please make configurable via preference and change to
`localhost`." It asked for the preference, not for a check of the value. This
use case measures what the preference gives the code.

Read in patch v1: a comment above `bindHost` says that a setting can hold any
JSON value. The run measures five of them: `8080`, `true`, `{"a":1}`,
`["127.0.0.1"]` and `""`. Patch v1 checks the value in `bindHost`. The check is
the author's own. It keeps the default of the review for any value that is not
a non-empty string.

This use case checks which value `get` returns for the setting
`tlaplus.mcp.host` of patch v1. Then it checks what the server binds when the
setting holds `8080`. It also checks what `localhost` binds in the extension
host, the process of VS Code that runs the extensions.

## 08.2 Setup

This use case measures VS Code and the code of patch v1, not the shipped code.
Read in `package.json` at commit `c869f2a`: the extension has no host setting.

`runners/v1/vscode.sh` applies patch v1 to commit `c869f2a`, and copies
`probe.test.ts` into `tests/suite/lm/`. Then it runs the probe as a test of the
extension, in a Docker container on Linux. Read in `tests/runTest.ts` at commit
`c869f2a`: the tests run in the extension host, through `runTests` of
`@vscode/test-electron`. The call names no version of VS Code. Read in
`runners/v1/INSTALL.md`: a `vscode-extension-host` run takes the stable release
of VS Code of that day. The header of the results names VS Code 1.143.0,
Electron 43.7.7 and Node v24.21.0.

The probe writes each value of the first table in the setting
`tlaplus.mcp.host`, in the user settings, with `update`. It waits for the event
`onDidChangeConfiguration` of the setting, and then reads the value with
`get<string>`. Each result gives the type of the value, as `typeof` names it,
and then the value in JSON.

Next, the probe reads `process.execArgv` and the resolver order of the
extension host. It resolves `localhost`, and calls
`app.listen(0, "localhost")`. Last, it writes `8080` in the setting and waits
for the event. Then it calls `new MCPServer(0)`, with the port `0` and no host.

## 08.3 Results

VS Code returns the raw JSON value of the setting `tlaplus.mcp.host`:

| # | Step | Result |
|---|------|--------|
| 08 | `get` after `update` to `8080` | `number 8080` |
| 08 | `get` after `update` to `true` | `boolean true` |
| 08 | `get` after `update` to `{"a":1}` | `object {"a":1}` |
| 08 | `get` after `update` to `["127.0.0.1"]` | `object ["127.0.0.1"]` |
| 08 | `get` after `update` to `""` | `string ""` |

So `get<string>` still returns a number when the setting `tlaplus.mcp.host`
holds one. For an array, `typeof` gives `object`.

In this run, the extension host runs with `--dns-result-order=ipv4first`, and
its resolver order is `ipv4first`. A bind to `localhost` takes `127.0.0.1`.
With `8080` in the setting, the server of patch v1 binds `127.0.0.1` too:

| # | Step | Result |
|---|------|--------|
| 08 | `process.execArgv` of the extension host | `["--dns-result-order=ipv4first","--experimental-network-inspection","--expose-gc"]` |
| 08 | `dns.getDefaultResultOrder()` | `ipv4first` |
| 08 | `localhost` resolves to | `127.0.0.1, ::1` |
| 08 | `app.listen(0, "localhost")` binds | `127.0.0.1` |
| 08 | with `8080` in the setting, `new MCPServer(0)` binds | `127.0.0.1` |

Result details:

- [`results/vscode/v1.txt`](results/vscode/v1.txt)

## 08.4 Becomes a test and needs a code fix

Needs a code fix: yes. Read in patch v1: `package.json` declares
`tlaplus.mcp.host` as a string. Still, the `get` rows show that `get` returns
the raw JSON value of the setting. So the host can be a number, a boolean, an
object, an array or `""`. None of these values is a string that names a host.
The review asked for the preference, not for a check of the value. The check in
`bindHost` is the author's own. It keeps the default of the review for any
value that is not a non-empty string.

Read in patch v1: the constructor of `MCPServer` reads the setting itself, with
the same `get` as the probe. The patch does not change `src/main.ts`.
`bindHost` takes only a non-empty string. It gives `localhost` for any other
value, or `::1` when loopback has no IPv4. Its comment says that Node binds
every interface for a host that is not a string, or is empty. In this run, with
`8080` in the setting, `new MCPServer(0)` binds `127.0.0.1`, which is loopback.

Read in `src/main.ts` at commit `c869f2a`: the shipped code checks the type of
`tlaplus.mcp.port` the same way. It starts the server only when the port is a
number: `0`, or from `1024` to `65535`.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `A host that is not a non-empty string binds loopback` must catch the five
  `get` rows. It writes each value of the first table in the user settings,
  and checks that the setting holds it. Then it calls `new MCPServer(0)`, and
  records the host that reaches `listen`. That host must be the default host,
  `bindHost(undefined)`. The bound address must be loopback, `127.0.0.1` or
  `::1`. If the value never reached the setting, the default would give the
  same host. So without the check of the setting, the test would still pass.
  It fences "change to `localhost`" for a value that is not a host. A fallback
  to `127.0.0.1` fails it.
- `The HTTP server binds the host of the setting` writes `::1` in the user
  settings. The server must then bind `::1`. So this test shows that the server
  reads the setting. The test above cannot show it, because the default gives
  the same host.

The rows of the resolver and of `localhost` need no code fix. In this run, the
default `localhost` binds `127.0.0.1`, which is loopback. They need no test of
their own. They explain why `The HTTP server binds the host of the setting`
writes `::1`. The default binds `127.0.0.1` here, so `::1` tells the setting
from the default.

## 08.5 Not measured

The extension host on macOS and on Windows: the run uses a Linux container.

What the extension host binds for a value that names no host, such as
`app.listen(0, 8080)`. The probe binds no such value, since the container of
the run has a route out.

`null` as a value of the setting. Read in patch v1: `bindHost` gives
`localhost` for `null` too, or `::1` when loopback has no IPv4.

A caller that gives its own host to `new MCPServer`, as `src/main.ts` could.
Read in patch v1: the constructor reads the setting only when it gets no host.
So such a caller skips the setting. Read in `src/main.ts` at commit `c869f2a`,
which patch v1 keeps: `activate` calls `new MCPServer(mcpPort)` with no host.
Read in the tests of patch v1: no test calls `activate`.

A value typed in `settings.json` or in the Settings editor: the run writes each
value with `update`.

The shipped code at commit `c869f2a`, which has no host setting.
