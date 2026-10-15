# vscode-tlaplus-mcp-bind-measurements

Measurements behind a proposed change to
[tlaplus/vscode-tlaplus](https://github.com/tlaplus/vscode-tlaplus): bind the
TLA+ extension's MCP server to loopback.

## The problem

`src/lm/MCPServer.ts` calls `app.listen(port)` with no host. Node then binds the
unspecified address `::`, which serves IPv4 and IPv6. The socket answers on
every interface of the machine, not only on loopback.

`POST /mcp` has no authentication. The transport is built with
`{ sessionIdGenerator: undefined }` and nothing else, so there is no `Host` or
`Origin` check either. An `initialize` that reaches the port is answered.

So a machine on the same network can talk to the server with no credential, as
long as the firewall of the host allows it. The port is open by default:
`tlaplus.mcp.port` is `0`, and `src/main.ts` reads `0` as "take a free port".
Only a value outside `0` and `1024`-`65535`, such as `-1`, keeps the server
from starting. Source at commit `c869f2a`:
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>.

## Affected versions

Read from the history of the file. All 44 revisions of `src/lm/MCPServer.ts`
were fetched and checked.

- The MCP server arrived in commit `9013319`, authored 2025-05-21. It called
  `app.listen(port, ...)` with no host in its first revision. The feature had
  this from the start, so it is not a regression.
- No revision ever passed a host. No revision ever set
  `enableDnsRebindingProtection`, `allowedHosts` or `allowedOrigins`.
- In VS Code the server was off at first. `tlaplus.mcp.port` defaulted to `-1`
  until commit `249065f` of 2025-12-02 changed the default to `0`. From there on
  the server starts with the extension.
- In Cursor it started earlier. Commit `46a6b48` of 2025-06-25 made the
  extension rewrite `tlaplus.mcp.port` from `-1` to `0` in the global settings
  of the user. From that build the server ran in Cursor even for a user who had
  set `-1`. Commit `249065f` removed that rewrite.

Versions are hard to name here. The project has 40 tags, and the newest is
`v2024.8.151650` of 2024-08-15. The GitHub API lists no releases. Since then it
publishes on every push to master. `release.yml` builds the version from the
timestamp of a commit the workflow makes itself, in the form `YYYY.M.DHHMM`. The
`1.7.0` in `package.json` is static, no release carries it, and `release.yml`
writes it into the artifact name.

So the code is affected from the build of 2025-05-22 to the current master,
`c869f2a` of 2026-10-15. It is on by default from the build of 2025-12-02, and
in Cursor from the build of 2025-06-25.

This repository holds three things. A small Node module reproduces the listen
call and the transport options before and after the change. A runner executes it
in Docker's bridge network, where no host firewall applies. The captured output
of each Node version is in `results/`. Same class as
[elixir-ls-mcp-bind-measurements](https://github.com/nonesilva-contributions/elixir-ls-mcp-bind-measurements).

## What the loopback bind does not break

Read in the extension at the same commit:

- The extension advertises its URL in five places, and this change rewrites all
  of them to `127.0.0.1`: the log line, the output channel, the Cursor
  registration and the VS Code `McpHttpServerDefinition`. Nothing it registers
  points anywhere else.
- Remote development keeps working. The extension declares no `extensionKind`.
  Under Remote-SSH, a dev container, WSL and Codespaces the extension host and
  the MCP server run on the same machine.
- The tests of the project already connect over `127.0.0.1`, and its Playwright
  helper binds `127.0.0.1` explicitly.
- A tunnel in front of the port still works. The tunnel client dials loopback on
  the same host.
- No document of the project advertises remote use. Its README never mentions
  MCP, and the setting only promises a port.

What it does change:

- A client on another machine, over a LAN address, stops working.
- A container that publishes this port with `docker run -p` stops working. The
  published port forwards to the address of the container, not to its loopback.
  A client in a second container on the same network stops working too.
- IPv6 loopback stops answering. Row 1 answers `HTTP 200` on `::1` and row 2
  refuses it. A client that resolves `localhost` to IPv6 and does not fall back
  would need `127.0.0.1`.
- On a host with no IPv4 loopback the listen call fails, and
  `src/lm/MCPServer.ts` then shows an error message on activation. Today the
  wildcard bind succeeds there. This is the one case where the change turns a
  working setup into a visible error.

## Run it

Requirements: Docker. Nothing runs on the host, and the module refuses to start
outside a container, because case 1 binds every interface.

```text
./run-docker.sh 20 22
```

Each run starts an official `node:<version>-slim` container on the default
bridge network. That network gives the container its own namespace, where the
firewall rules of the host do not apply, and a non-loopback address to connect
from. The runner installs the dependencies with `npm ci` from the committed
`package-lock.json`, so the whole tree is pinned. The printed header names the
resolved versions. The socket is read with `server.address()`, and reachability
is measured with the `http` client of Node, not with `ss`, `curl` or `ip`.

The images are pinned by digest. The ephemeral port and the address of the
container print as `<port-N>` and `<bridge-ip>`, so two runs produce the same
file. No verdict depends on those values. The run ends with `done` from the
module itself, and the runner copies the output only when that line is there.

## Cases and results

Identical on Node 20.20.2 and 22.23.3. Outputs are in [`results/`](results/).

| # | Setup | Result |
|---|-------|--------|
| 1 | shipped: transport `{ sessionIdGenerator: undefined }`, `app.listen(port)` with no host | bind `:::<port-1>`; from the non-loopback address `HTTP 200`; foreign `Host` and `Origin` `HTTP 200`; `::1` `HTTP 200`; browser preflight `HTTP 200` with no `Access-Control-Allow-Origin` |
| 2 | this pull request: `app.listen(port, '127.0.0.1')`, transport unchanged | bind `127.0.0.1:<port-2>`; from the non-loopback address `ECONNREFUSED`; foreign `Host` and `Origin` `HTTP 200`; `::1` `ECONNREFUSED` |
| 3 | follow-up, not in this pull request: the same bind plus `{ enableDnsRebindingProtection: true, allowedHosts, allowedOrigins: [] }` | bind `127.0.0.1:<port-3>`; from the non-loopback address `ECONNREFUSED`; foreign `Host` with no `Origin` `HTTP 403`; allowed `Host` with foreign `Origin` `HTTP 200`; `Host localhost` `HTTP 200` |

What the rows establish:

- Row 1: the server binds `::`, so it answers over IPv4 and IPv6 from any
  interface. It answers an unauthenticated `initialize` from a non-loopback
  address. It also answers a request with a foreign `Host` and `Origin`.
- Row 1, the browser: the preflight answers `HTTP 200` with no
  `Access-Control-Allow-Origin`, so a page in a browser is blocked by the
  browser itself. What reaches the port is any client outside a browser.
- Row 2: the loopback bind refuses the non-loopback address. It does not stop a
  request that reaches the port locally with a foreign `Host`. That is the limit
  of this change.
- Row 3: the `Host` allowlist answers `403` to the foreign `Host`, and the
  request still passes with the name the extension advertises. The `Origin` of
  that request is foreign and is not checked, because `allowedOrigins` is empty.
  The two headers were sent apart, so the `403` is attributed to the `Host`.

Every row carries an expected value. The module compares each one and prints a
summary line per row. If one row differs, it prints `MISMATCH`, writes no
conclusion and exits with 1.

## The patch

`mcp-bind-loopback.patch` is the change this pull request proposes, against
commit `c869f2a`. It touches two files:

- `src/lm/MCPServer.ts`: `app.listen(port, '127.0.0.1', ...)`, and the five
  advertised URLs move from `localhost` to `127.0.0.1`.
- `tests/suite/lm/mcpServer.test.ts`: one test reads `address()` of the running
  server and requires `127.0.0.1`.

Measured in the test suite of the project, inside a container, with their own
commands `npm run lint`, `npm run pretest` and the suite filtered to
`HTTP endpoint routing`:

```text
with the shipped bind:   2 passing, 1 failing, exit 1
with this change:        3 passing, exit 0
```

Case 3, the DNS-rebinding protection, is left out of the patch. The SDK matches
the `Host` header against the allowlist as an exact string. A request that
arrives through a tunnel or a reverse proxy carries the hostname of that front
end and is refused. `CONTRIBUTING.md` of the project documents running
`npx localtunnel` in front of a local port, so that shape is in use there. That
half needs a setting of its own and belongs in its own change.

## Read in the code, not reproduced here

- The server starts on activation. `tlaplus.mcp.port` defaults to `0`, and
  `src/main.ts` creates the server for `0` or for `1024`-`65535`.
- The filesystem tools `read_file`, `write_file` and `list_directory` are off
  unless `tlaplus.mcp.enableFilesystemTools` is set. The knowledge base tools
  are off unless `tlaplus.mcp.enableKnowledgeBaseTools` is set. The SANY and TLC
  tools are always on, and they act on files of the open workspace.
- `@modelcontextprotocol/sdk` is locked at `1.17.2` in `package-lock.json` of
  the extension, and `express` at `5.1.0`. The module installs the same two.
- The extension also starts the TLC debugger, and the JVM opens that port. The
  class `tlc2.debug.AttachingDebugger` in `tla2tools.jar` has no host parameter,
  so a loopback bind for it cannot come from this repository.

## Not measured, and why

- The real request handler. It builds the tool and resource set on every POST,
  and the module omits that. The omission changes the response body and its
  time, not the bind address.
- Windows and macOS. Linux containers only. WSL in its default NAT mode is one more case.
  There a client inside the distribution reaches the extension on the Windows
  host over a non-loopback address.
- A second physical host. The non-loopback address used is the bridge address of
  the container. What the rows establish is which destination addresses the
  listening socket accepts.

License: MIT.
