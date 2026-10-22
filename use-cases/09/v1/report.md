# Use case 09/v1

## 09.1 Purpose

The reviewer asked about the URL of a bind to `::`, the unspecified address.
The request is this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309190249>,
"Better to map `::` to `::1` for v6 only hosts?" It comments on line 66 of
`src/lm/MCPServer.ts` at commit `6d1dcfc`.

Read in patch v1: the server writes its URL in a log line. It also registers
the URL with VS Code and Cursor. A client dials that URL, so the URL must reach
the server.

The request limits the mapping to "v6 only hosts". This use case measures one
part of the side that the request leaves out. That part is a loopback with IPv4
and no IPv6. The use case checks which loopback address reaches a bind to `::`
there, `::1` or `127.0.0.1`. If `::1` fails there, the URL of a bind to `::`
must not name `[::1]`. Then the mapping must keep that limit.

## 09.2 Setup

Read in `src/lm/MCPServer.ts` at commit `6d1dcfc`: `advertisedHost` gives the
host of the URL. On line 66, which the request comments on, and on line 67, it
returns `127.0.0.1` for `0.0.0.0` and `::`. Read in patch v1: a value `::` of
the setting `tlaplus.mcp.host` reaches `app.listen` unchanged.

This use case runs a reproduction of the server, with the port `0`. It runs in
plain Node 20 and 22, on Linux. Read in `lib/v1/server.mjs`: it keeps the
options of the transport, `express.json()` and the routes of commit `c869f2a`.
It leaves out the tools and resources of the server and the rewrite of the
`mcp-protocol-version` header. It keeps the text of the 405 answers and changes
the text of the 500 answer. The runs use neither the shipped code nor patch v1.

First the reproduction binds `::` with an explicit host,
`app.listen(port, "::")`. A client dials `::1`, the host that the request
proposes. Then a client dials `127.0.0.1`, the host that `advertisedHost` gives
a bind to `::`. Each client sends the MCP `initialize` request in a `POST` to
`/mcp`.

Then the reproduction binds with `app.listen(port)`, with no host. A client
dials the name `localhost` there. Read in `src/lm/MCPServer.ts` at commit
`c869f2a`: on line 312, the shipped code binds with no host too. Its URL names
`localhost`.

The runs take place in a Docker container. Read in `measurements.gitconfig`:
this use case has `loopback = no-ipv6`. Read in `runners/v1/docker-node.sh`:
for that value, the container gets `net.ipv6.conf.all.disable_ipv6=1` and
`net.ipv6.conf.lo.disable_ipv6=1`. The container runs on an internal Docker
network of its own, with no route out.

Read in `measure.mjs`: the use case refuses to run outside a container. It
also checks that loopback lists no IPv6 address. It takes as loopback the
addresses that `os.networkInterfaces()` marks `internal`. It refuses to run
when that list is empty or has an IPv6 address.

## 09.3 Results

Node 20 and Node 22 give the same rows. Both runs note "loopback lists no IPv6
address".

| # | Step | Result |
|---|------|--------|
| 09 | the loopback lists | `127.0.0.1` |
| 09 | `app.listen(port, "::")` binds | `::` |
| 09 | a client dials `::1`, the host the request proposes | `EADDRNOTAVAIL` |
| 09 | a client dials `127.0.0.1`, the host for a bind to `::` | `HTTP 200` |
| 09 | `app.listen(port)`, with no host, binds | `::` |
| 09 | with that bind, a client dials the name `localhost` | `HTTP 200` |

On this loopback, a client reaches the bind to `::` through `127.0.0.1`, not
through `::1`.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)

## 09.4 Becomes a test and needs a code fix

Needs a code fix: no. Here a client that dials `::1` gets `EADDRNOTAVAIL`. A
client that dials `127.0.0.1` gets `HTTP 200`. So on this loopback, the URL of
a bind to `::` must not name `[::1]`. The request asks for `::1` only "for v6
only hosts". This loopback has IPv4: it lists `127.0.0.1`.

Read in `src/lm/MCPServer.ts` at commit `6d1dcfc`, the version that the request
comments on: `advertisedHost` returns `127.0.0.1` for `::`. Read in patch v1:
`advertisedHost` still returns `127.0.0.1` for `::` when loopback has IPv4. For
`::`, it returns `[::1]` only when `hasIPv4Loopback` finds no IPv4 on loopback.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken, even when the code already did it. If `::` became `[::1]` on
every host, the URL would fail here, as the row of `::1` shows. Read in patch
v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The advertised URL names the bound address, or loopback for a wildcard bind`
  calls `advertisedHost` only. It checks six binds, `::` among them. When the
  second argument says that loopback has IPv4, `advertisedHost` must return
  `127.0.0.1` for `::`. It fences "for v6 only hosts": a loopback with IPv4
  keeps `127.0.0.1`.
- `The URL of a bind to :: names 127.0.0.1 where loopback has IPv4` skips
  where loopback has no IPv4. The server binds `127.0.0.1`, and the code that
  builds the URL is told that the bound address is `::`. The test checks that
  the URL registered with VS Code names `127.0.0.1` and that a `GET` to it gets
  `405`. It fences "for v6 only hosts" where the URL is built. A call that
  advertised `::` as `[::1]` on every machine fails it.
- `Only the loopback decides whether it has IPv4` checks `hasIPv4Loopback` with
  injected interface lists. Among them, a loopback with `127.0.0.1` alone must
  have IPv4: `hasIPv4Loopback(() => ({ lo: [ipv4Loopback] }))` is `true`. The
  loopback of this run lists `127.0.0.1` alone too. The test fences "v6 only
  hosts": such a loopback does not count as one.

The last two rows show no problem with the URL of the shipped code on this
loopback. With no host, Node binds `::` here. A client that dials the name
`localhost` gets `HTTP 200`. So a Node client that dials `localhost`, the name
of the shipped URL, reaches a bind like the shipped one. These rows need no
test of their own.

## 09.5 Not measured

The default of patch v1, a bind to `localhost`, on a loopback with no IPv6.
Read in patch v1: `bindHost` keeps `localhost` when loopback has IPv4, as here.
That bind did not run here.

The log line. Read in patch v1: it ends with `Bound to <address>.`, after the
URL. No reviewer asked for it, and no run and no test reads it. On a loopback
with IPv4, the URL of a bind to `::` names `127.0.0.1`. The log line shows that
the bind is `::`, the unspecified address, and the URL does not.

A loopback with no IPv4, the "v6 only hosts" of the request.

The extension host: the runs use plain Node 20 and 22. VS Code runs the
extension in its own Node. The MCP clients of VS Code and Cursor. Read in
`lib/v1/measure.mjs`: the runs dial with `http.request` of Node.

A machine outside a container. Read in `measurements.gitconfig`: this use case
runs only in a Linux container, so it has no Windows run.
