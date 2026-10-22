# Use case 01/v1

## 01.1 Purpose

The server has no authentication, so a bind that answers outside loopback lets
other machines use it. This use case measures the shipped bind, the reason for
the pull request. Its code fix answers this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>,
"Please make configurable via preference and change to `localhost`."

This use case checks which addresses the shipped bind answers, and what it
answers to the `Host` and `Origin` headers and to the headers of a browser.

## 01.2 Setup

Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>:
the server calls `app.listen(port)` with no host. It builds the transport
without the options that turn on the `Host` and `Origin` check of the SDK.
Read in `package.json` at the same commit: the extension has no host setting.
Read in `src/main.ts` and `package.json`: the server starts with the extension.
`tlaplus.mcp.port` is `0` by default, and `src/main.ts` lets `0` through its
range check, so `app.listen` gets `0` and Node picks a free port. A value that
is not a number, or a number outside `0` and `1024`-`65535`, such as `-1`,
keeps the server from starting.

Read in the history of the extension: the server arrived in commit `9013319` of
2025-05-21 with no host in `app.listen`, and none of the 44 revisions of
`src/lm/MCPServer.ts` ever passed one. `tlaplus.mcp.port` defaulted to `-1`
until commit `249065f` of 2025-12-02 changed it to `0`, so from then on the
server starts with the extension. In Cursor it started earlier: from commit
`46a6b48` of 2025-06-25, the extension wrote `0` over a port of `-1` in the user
settings, until `249065f` removed that write.

This use case runs a reproduction of the shipped server, with the port `0`.
Read in `lib/v1/server.mjs`: it keeps the call `app.listen(port)`, the options
of the transport, `express.json()` and the routes. It leaves out the tools and
resources of the server, the rewrite of the `mcp-protocol-version` header and
the text of the errors. It runs in plain Node 20 and 22, on Linux and Windows.

The requests go to a non-loopback address of the machine, `<bridge-ip>`, to
`::1`, or to `127.0.0.1`. Those to `127.0.0.1` carry a foreign `Host` and
`Origin`, `attacker.example`, or are an `OPTIONS` with the headers of a browser
preflight and a foreign `Origin`. A browser preflight is the `OPTIONS` request
that a browser sends before a JSON `POST` from a page of another origin. Read
in `src/lm/MCPServer.ts`: the server has no `OPTIONS` route, so Express answers
it.

The last request is a `POST` with the headers that need no preflight: its
`Content-Type` is `text/plain; x=application/json`, with
`Accept: application/json, text/event-stream` and a foreign `Origin`. Read in
the Fetch standard: a `Content-Type` whose essence is `text/plain` and an
`Accept` with no unsafe byte need no preflight,
<https://fetch.spec.whatwg.org/#cors-safelisted-request-header>. Read in
`@modelcontextprotocol/sdk` 1.17.2, `dist/cjs/server/streamableHttp.js`: the
transport first checks that the `Content-Type` contains `application/json`.

`<bridge-ip>` stands for that non-loopback address. On Linux, it is the
address of the container on its own internal Docker network. On Windows, it is
the first non-loopback IPv4 address of the guest. The request goes from the
machine to its own address, so the rows show which addresses the socket
accepts, not what a firewall lets in.

## 01.3 Results

Node binds the unspecified address `::`, which serves IPv4 and IPv6. The rows
try one non-loopback IPv4 address, `<bridge-ip>`, and the loopback addresses
`127.0.0.1` and `::1`. The socket answers on all three:

| # | Step | Result |
|---|------|--------|
| 01 | `app.listen(port)`, with no host, binds | `::` |
| 01 | a request to `<bridge-ip>`, from the same machine | `HTTP 200` |
| 01 | a request to `::1` | `HTTP 200` |
| 01 | a request to `127.0.0.1` with a foreign `Host` and `Origin` | `HTTP 200` |
| 01 | an `OPTIONS` to `127.0.0.1` with the headers of a preflight and a foreign `Origin` | `HTTP 200`, no `Access-Control-Allow-Origin` |
| 01 | a `POST` to `127.0.0.1` with the headers that need no preflight | `HTTP 400` |
os 
Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 01.4 Becomes a test and needs a code fix

Needs a code fix: yes. The shipped bind is `::`, and it answers a request to
`<bridge-ip>` with no authentication. So the default must stay on loopback.
The review asks for a preference with the default `localhost`. Read in patch
v1: `package.json` adds the setting `tlaplus.mcp.host`, with the default
`localhost`, and the server reads it and binds it.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The HTTP server binds the host of the setting` writes the host in the user
  settings and checks the bind. It fences "configurable via preference".
- `The host setting defaults to localhost` checks the default. It fences
  "change to `localhost`".
- `The HTTP server binds loopback` checks that the server binds loopback when
  it gets no host.

Read in `tests/suite/lm/mcpServer.test.ts` at commit `c869f2a`: the tests dial
`127.0.0.1`, and a bind to `::` answers there too. So they do not see the
exposure.

The rows to `127.0.0.1` and `::1` show that the shipped bind answers on both
families of loopback. Read in patch v1: `localhost` binds one family, and the
advertised URL names the address that the server bound. This row needs no test
of its own.

The row of a foreign `Host` and `Origin` needs a code fix, but not in this
pull request: no reviewer asked for it, and a `Host` or `Origin` check needs a
setting for the names that a front end sends. The rows of the preflight and of
the `POST` with the headers that need no preflight need no code fix: the
preflight gets no `Access-Control-Allow-Origin`, and the `POST` gets `400`.

## 01.5 Not measured

A request from a second machine, and what a firewall lets in.

A non-loopback IPv6 address, and a machine with no IPv6. Read in the
documentation of Node: with no host, the server binds `0.0.0.0` when IPv6 is
not available,
<https://nodejs.org/docs/v22.23.3/api/net.html#serverlistenport-host-backlog-callback>.

The extension host: the runs use plain Node 20 and 22, and VS Code runs the
extension in its own Node. macOS.

What the reproduction leaves out: the tools and resources of the server, the
rewrite of the `mcp-protocol-version` header and the text of the errors.

A browser: no browser ran, so the rows send the headers that the Fetch standard
gives. Why the server answers `400` to the `POST` with the headers that need no
preflight: the runs record only the status. Other values of `Content-Type` with
no preflight.

What a client can call. Read in `src/lm/MCPServer.ts` at commit `c869f2a`:

- The tools of SANY, the parser of the TLA+ tools, and of TLC, the model
  checker, are always on. So are the knowledge base resources: the server
  registers each article of `resources/knowledgebase` with `server.resource`.
- The tools that take a file path check that it is in the first folder of the
  open workspace, except a `jarfile:` path, a module inside a `.jar` file, in
  `tlaplus_mcp_sany_symbol`.
- `tlaplus_mcp_sany_modules` takes no path. It lists the `.tla` files of the
  module search paths, the folders and `.jar` files where SANY looks for
  modules. It reads a folder with `fs.promises.readdir`, with no workspace
  check.
- The TLC tools pass the `extraOpts` and `extraJavaOpts` of the client to
  `runTlc` in `src/tla2tools.ts`, which adds them to the options of TLC and of
  the JVM.
- Only the knowledge base tools and the filesystem tools are off, unless the
  settings `tlaplus.mcp.enableKnowledgeBaseTools` and
  `tlaplus.mcp.enableFilesystemTools` are set.
