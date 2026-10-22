# Use case 03/v1

## 03.1 Purpose

No reviewer asked for a `Host` or `Origin` check. Read in patch v1: "A
request that reaches the port with a foreign Host still gets an answer." This
use case measures what the `Host` check of the SDK,
`@modelcontextprotocol/sdk`, adds to a bind to `127.0.0.1`. Its option
`allowedHosts` is a `Host` allowlist: the list of `Host` values that the
server answers. Read in `@modelcontextprotocol/sdk` 1.17.2,
`dist/cjs/server/streamableHttp.js`, lines 79 to 99: the list applies only
with `enableDnsRebindingProtection: true`.

With the list, the transport answers a foreign `Host` with `HTTP 403`. The
shipped transport answers the same request with `HTTP 200`.

## 03.2 Setup

Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>:
the server builds the transport with `{ sessionIdGenerator: undefined }`.
Read in the history of `src/lm/MCPServer.ts` up to commit `c869f2a`: none of
its 44 revisions sets `enableDnsRebindingProtection`, `allowedHosts` or
`allowedOrigins`.

This use case runs a reproduction of the server, with the port `0`. Read in
`lib/v1/server.mjs`: it keeps `express.json()` and the routes of commit
`c869f2a`. It leaves out the tools and resources of the server and the
rewrite of the `mcp-protocol-version` header. It keeps the text of the 405
answers and changes the text of the 500 answer. It runs in plain Node 20 and
22, on Linux and Windows, with `express` 5.1.0 and `@modelcontextprotocol/sdk`
1.17.2. Read in `package-lock.json` at commit `c869f2a`: the extension locks
the same versions.

Read in `measure.mjs`: the server binds `127.0.0.1`. The transport keeps
`sessionIdGenerator: undefined` and adds three options, where `<port>` is the
port of the bind:

- `enableDnsRebindingProtection: true`
- `allowedHosts: ["127.0.0.1:<port>", "localhost:<port>"]`
- `allowedOrigins: []`

Each request is a `POST` of `initialize` to `/mcp`. The first goes to
`<bridge-ip>`, a non-loopback address of the machine. The next three go to
`127.0.0.1` and set the `Host` by hand. Only one of them sends an `Origin`:
the foreign `http://attacker.example`, with the allowed `Host`
`127.0.0.1:<port>`. The foreign `Host` is `attacker.example`.

The last request goes to a second server. It binds `127.0.0.1` too, and keeps
the shipped transport, `{ sessionIdGenerator: undefined }`. The request sends
a foreign `Host` and no `Origin`.

Read in `runners/v1/docker-node.sh` and `lib/v1/measure.mjs`: on Linux,
`<bridge-ip>` is the address of the container on its own internal Docker
network. On Windows, it is the first non-loopback IPv4 address of the
machine. The request goes from the machine to its own address. So the row
shows which addresses the socket accepts, not what a firewall lets in.

## 03.3 Results

| # | Step | Result |
|---|------|--------|
| 03 | `app.listen(port, "127.0.0.1")` binds | `127.0.0.1` |
| 03 | a request to `<bridge-ip>`, from the same machine | `ECONNREFUSED` |
| 03 | a request to `127.0.0.1`, foreign `Host`, no `Origin` | `HTTP 403` |
| 03 | a request to `127.0.0.1`, allowed `Host`, foreign `Origin` | `HTTP 200` |
| 03 | a request to `127.0.0.1`, `Host` `localhost:<port>` | `HTTP 200` |
| 03 | with the shipped transport, foreign `Host`, no `Origin` | `HTTP 200` |

The rows of a foreign `Host` and of `localhost:<port>` both send no `Origin`.
So the `HTTP 403` comes from the `Host`. With the shipped transport, the same
foreign `Host` gets `HTTP 200`. So the `HTTP 403` comes from the three options
that this use case adds.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 03.4 Becomes a test and needs a code fix

Needs a code fix: no. No reviewer asked for a `Host` or `Origin` check, so
this pull request adds none. The row of a foreign `Host` gets `HTTP 403`.
Read in `@modelcontextprotocol/sdk` 1.17.2,
`dist/cjs/server/streamableHttp.js`, lines 79 to 99: the list refuses a
`Host` that is not in it. Read in the same file, lines 106 to 115: the
refusal gives `HTTP 403`. Read in RFC 9110, section 7.2: a client sends the
host and port of the URL in `Host`,
<https://www.rfc-editor.org/rfc/rfc9110#section-7.2>. With the bind to
`127.0.0.1`, a client that dials an address outside loopback gets
`ECONNREFUSED`. The row of `<bridge-ip>` shows it, from the same machine.
With a bind outside loopback and this list, such a client would get
`HTTP 403`. That is deduced from the reads above, and no row measures it.
This would matter in the case of the reviewer, a client on another machine:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285603003>.

Becomes a test: no. No reviewer asked for a `Host` or `Origin` check, so there
is no request to fence. Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
lines 242 to 244: the options of the transport are
`{ sessionIdGenerator: undefined }`. Read in patch v1: no hunk touches those
lines. So patch v1 changes no row of this use case.

The row of a foreign `Origin` with an allowed `Host` gets `HTTP 200`. Read in
`@modelcontextprotocol/sdk` 1.17.2, `dist/cjs/server/streamableHttp.js`,
line 92: an empty `allowedOrigins` checks no `Origin`. The row of
`<bridge-ip>` comes from the loopback bind, not from the list. Read in patch
v1, in `tests/suite/lm/mcpServer.test.ts`: the test
`The HTTP server binds loopback` fences a loopback bind. It checks that the
server binds `127.0.0.1` or `::1` by default. It is not a test of the
allowlist. These rows need no new test and no code fix here.

## 03.5 Not measured

A request from a second machine, and a bind outside loopback with the list.
No row sends the server a `Host` with an address outside loopback.

A `Host` of `[::1]:<port>`. Read in patch v1: a bind to `::1` is advertised as
`[::1]`. The list of this use case does not hold that `Host`.

A front end of the port: a tunnel, a reverse proxy, or a port forward with
`ssh -L`. The `Host` that reaches the server depends on the front end and on
the URL that the client dials.

A non-empty `allowedOrigins`. Read in `@modelcontextprotocol/sdk` 1.17.2,
`dist/cjs/server/streamableHttp.js`, lines 79 to 99: such a list refuses an
`Origin` that is not in it. It also refuses a request with no `Origin`.

A browser, and DNS rebinding: no browser ran, so the requests set `Host` and
`Origin` by hand.

The extension host, and macOS: the runs use plain Node 20 and 22, on Linux
and Windows.
