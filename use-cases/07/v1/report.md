# Use case 07/v1

## 07.1 Purpose

This use case answers this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427>.
It asks: "I'd also suggest using `localhost` rather than `127.0.0.1` as the
default". Its reason: "since `localhost` can resolve to either the IPv4
(`127.0.0.1`) or IPv6 (`::1`) loopback address". The gain it names:
"improving portability across IPv4 and IPv6 environments."

This use case measures what the default `localhost` costs. A client that dials
the name can miss a bind to `::1`.

No reviewer asked for an advertised URL that names the bound address. It is
the author's own change. The author first promised it in a reply to that
review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285406791>,
"build the advertised URLs from the real `server.address()`". Commit `1d29675`
took it back, with this comment:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#issuecomment-6228767179>.
Read in `src/lm/MCPServer.ts` at commit `1d29675`: the URL keeps the host name
of the setting, such as `localhost`. Commit `6d1dcfc` put the change back.
Read in `src/lm/MCPServer.ts` at commit `6d1dcfc`: the URL names the bound
address.

## 07.2 Setup

Read in `src/lm/MCPServer.ts` at commit `1668ddc`: the server calls
`app.listen(port, '127.0.0.1', ...)` on line 312. This is the first version of
the pull request, and the review is a comment on that line.

Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>:
the shipped server calls `app.listen(port)` with no host. It advertises the URL
`http://localhost:<port>/mcp`. It writes this URL in its log, and it registers
it with VS Code and Cursor.

This use case runs a reproduction with the port `0`. Read in
`lib/v1/server.mjs`: it keeps the options of the transport, `express.json()`
and the routes of commit `c869f2a`. It leaves out the tools and resources of
the server and the rewrite of the `mcp-protocol-version` header. It keeps the
text of the 405 answers and changes the text of the 500 answer. One server
binds with `app.listen(0, "localhost")`. A second server binds with
`app.listen(0)`, with no host, as the shipped code does.

The reproduction is not the shipped code and not patch v1. The functions
`bindHost` and `advertisedHost` of patch v1 do not run, so no URL is built. It
runs in plain Node 20 and 22, `v20.20.2` and `v22.23.3`, with `express` 5.1.0
and `@modelcontextprotocol/sdk` 1.17.2. It does not run in the extension host,
the Node process of VS Code that runs the extension.

The runs keep the default resolver order of Node. Read in the documentation of
Node: with `verbatim`, a lookup keeps the order of the addresses that the
system gives. With `ipv4first`, it puts the IPv4 addresses first:

- <https://nodejs.org/docs/v20.20.2/api/dns.html#dnslookuphostname-options-callback>
- <https://nodejs.org/docs/v22.23.3/api/dns.html#dnslookuphostname-options-callback>

The runs use a Linux container (`docker-debian-12`) and the Windows 11 VM
(`windows-11-24h2`), build `26100.1742`. Read in `runners/v1/docker-node.sh`:
the container runs on an internal Docker network, created with no `--ipv6`.

Read in `lib/v1/measure.mjs`: each request is a `POST` of an MCP `initialize`
to `/mcp`, sent with `http.request` of Node.

Read in `measure.mjs`, next to this report: the client dials the name
`localhost`, then the bound address `::1`. On the shipped bind, it dials the
name `localhost` again.

Before the binds, the runs record four values. Read in `measure.mjs`:

- whether an IPv6 address is outside loopback, from `os.networkInterfaces()`
- the resolver order of Node, from `dns.getDefaultResultOrder()`
- `net.getDefaultAutoSelectFamily()`, the default of the option
  `autoSelectFamily` of a Node client
- a lookup of `localhost` with `all: true` and the flag `dns.ADDRCONFIG`, or
  with no flag on Windows

The comment of `measure.mjs` says that the client of Node uses these flags.
Read in the documentation of Node: `ADDRCONFIG` keeps only the families that
the machine has outside loopback,
<https://nodejs.org/docs/v22.23.3/api/dns.html#supported-getaddrinfo-flags>.

## 07.3 Results

Node 20 and 22 give the same rows. The bind to `localhost` gives `::1` on both
machines. The lookup of the name differs, and so does the answer to a client
that dials the name:

| # | Step | Result |
|---|------|--------|
| 07 | an IPv6 address outside loopback | `no` on Linux, `yes` on Windows |
| 07 | the resolver order of Node | `verbatim` |
| 07 | `autoSelectFamily` of Node | `true` |
| 07 | the lookup of `localhost` with the flags of the client | `127.0.0.1, 127.0.0.1` on Linux, `::1, 127.0.0.1` on Windows |
| 07 | `app.listen(port, "localhost")` binds | `::1` |
| 07 | a client that dials the name `localhost` | `ECONNREFUSED` on Linux, `HTTP 200` on Windows |
| 07 | a client that dials the bound address `::1` | `HTTP 200` |
| 07 | `app.listen(port)`, with no host, binds | `::` |
| 07 | with that bind, a client that dials the name `localhost` | `HTTP 200` |

On Linux, the lookup with the flags of the client gives `127.0.0.1` twice and
no `::1`. There a client that dials the name gets `ECONNREFUSED`, while the
server listens on `::1`. On Windows, the lookup gives `::1` first, and a client
that dials the name gets `HTTP 200`. On both machines, a client that dials the
bound address gets `HTTP 200`. The shipped bind `::` answers a client that
dials the name, on both machines.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 07.4 Becomes a test and needs a code fix

Needs a code fix: yes. On Linux, the bind to `localhost` gives `::1`, and a
client that dials the name gets `ECONNREFUSED`. A client that dials the bound
address `::1` gets `HTTP 200`. So a URL with the name can miss the server, and
a URL with the bound address reaches it.

The comment that took the change back says: "with `localhost` the client
resolves the name like the server does". The Linux rows show otherwise. The
bind gave `::1`, but the lookup with the flags of the client gave no `::1`.

Read in patch v1: the server binds `::1` when the setting `tlaplus.mcp.host` is
`::1`. It also binds `::1` for `localhost` when loopback has no IPv4.

Read in patch v1, in `src/lm/MCPServer.ts`: the advertised URL names the bound
address, or loopback for a wildcard bind. The function `advertisedHost` gives
its host. An IPv6 address goes in brackets, so a bind to `::1` gives `[::1]`.
One URL serves the log line and the Cursor and VS Code registrations. The log
line also shows the bound address. So a client reaches that socket whatever its
resolver prefers. The row of the bound address gives `HTTP 200` on both
machines.

Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:
`The HTTP server binds the host of the setting` fences this fix. It writes
`::1` in the user settings and checks the bind `::1`. It also checks that the
URL registered with VS Code names `[::1]`, and that a `GET` gets `405`. That is
the case of the Linux rows: a bind to `::1` that a client of the name missed.
If the URL named `localhost` for this bind, the test would fail.
It skips where loopback has no `::1`.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. In these runs in plain Node, the same bind `::1` answered a
client of the name on Windows. On Linux, a client of the name got
`ECONNREFUSED`. So the tests also check that the URL names the bound address,
as the test above does for `::1`. The shipped bind `::` answers the name on
both machines, so it hides the miss. Read in
`tests/suite/lm/mcpServer.test.ts` at commit `c869f2a`: no test reads the URL
that the server registers.

Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The HTTP server binds the name localhost by default` records the host that
  the `listen` call of the server gets. It checks that this host is the name
  `localhost`. It skips where loopback has no IPv4. It fences "using
  `localhost` rather than `127.0.0.1` as the default".
- `The URL registered with VS Code reaches the server` takes the URL that the
  server registers with VS Code. It checks that the URL names the bound
  address, and that a `GET` to it gets `405`. It fences "`localhost` can
  resolve to either the IPv4 (`127.0.0.1`) or IPv6 (`::1`) loopback address".
- `With no IPv4 on loopback, the server binds ::1 and registers [::1]` makes
  the interface list show `::1` alone on loopback. Then it checks the bind
  `::1`, the URL `[::1]` and a `GET` with `405`. It skips where loopback has
  no `::1`. It fences "improving portability across IPv4 and IPv6
  environments".
- `The advertised URL names the bound address, or loopback for a wildcard bind`
  calls `advertisedHost` only. It builds no URL. It tells `advertisedHost`
  that loopback has IPv4. A bind to `::1` gives `[::1]`. It fences "or IPv6
  (`::1`)".

The rows of the interfaces, the order, `autoSelectFamily` and the lookup show
the machines of the runs. They need no test of their own. The row of the
shipped bind needs no test here. Read in patch v1: the server no longer binds
with no host.

## 07.5 Not measured

The extension host, where the shipped code and patch v1 run, and its resolver
order.

The binds of patch v1 that give `::1`: the setting `::1`, and `localhost` on a
loopback with no IPv4. The runs bind only `localhost`, and no host for the
shipped bind.

The URL of patch v1. The runs dial the bound address `::1`, not a URL with the
host that `advertisedHost` gives.

The MCP clients of VS Code and Cursor, and other MCP clients. Which address
they dial for a name, with which flags and in which order.

The lookup inside the client of Node. The row of the lookup is a lookup of its
own, with the flags read in `measure.mjs`.

Why the lookup on Linux gives `127.0.0.1` twice. Which addresses the client
tries, and in which order: the runs record only the default of
`autoSelectFamily`.

The interfaces of the machines: the runs record only whether an IPv6 address
is outside loopback. macOS.

What the reproduction leaves out: the tools and resources of the server and
the rewrite of the `mcp-protocol-version` header. It also changes the text of
the 500 answer.
