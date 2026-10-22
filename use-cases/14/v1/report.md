# Use case 14/v1

## 14.1 Purpose

This use case checks a loopback with no IPv4. Its code fix answers a review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309190249>,
"Better to map `::` to `::1` for v6 only hosts?"

The rows of the bind to `::` answer the request. The rows of `localhost` show
whether the default `localhost` still works on this loopback.

That default comes from another review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427>.
It gives as the gain of `localhost` "improving portability across IPv4 and
IPv6 environments". Here a bind to the default `localhost` fails with
`EADDRNOTAVAIL`. Read in patch v1: `bindHost` turns `localhost` into `::1`
when loopback has no IPv4. No reviewer asked for that change, but it keeps
that default working on this loopback.

## 14.2 Setup

Read in `src/lm/MCPServer.ts` at commit `6d1dcfc`, the reviewed commit: the
server calls `app.listen(port, host, ...)`. Its default host is `localhost`.
The server puts its URL in a log line, and registers it with VS Code and
Cursor. On line 66, `advertisedHost` checks for a bind to `0.0.0.0` or `::`.
For both, the URL gets the host `127.0.0.1`. The request is a comment on that
line.

This use case runs a reproduction of that bind, with the port `0`. Read in
`lib/v1/server.mjs`: it keeps the options of the transport, `express.json()`
and the routes of commit `c869f2a`. It leaves out the tools and resources of
the server, and the rewrite of the `mcp-protocol-version` header. It keeps the
text of the 405 answers, and changes the text of the 500 answer. It runs in
plain Node 20 and 22, on an Ubuntu 24.04 VM.

It binds `localhost`, `127.0.0.1`, `::1` and `::`, in this order. A bind gives
the address that the server bound, or the code of its error. A client in the
same Node process sends an MCP `initialize` request, a `POST` to `/mcp`. Each
request gives the HTTP status, or the code of its error. On the bind to `::1`,
the client dials `[::1]`. On the bind to `::`, it dials `127.0.0.1`, the host
that `6d1dcfc` advertises. Then it dials `[::1]`, the host that the review
asks for.

The measure resolves and binds `localhost` with two resolver orders of Node,
`verbatim` and `ipv4first`. Read in `measure.mjs`: it sets each order with
`dns.setDefaultResultOrder`. It also lists the lines of `/etc/hosts` that name
`localhost`, and leaves out the comment lines.

The measure runs where loopback has no IPv4. Read in `measurements.gitconfig`:
the use case has `loopback = no-ipv4`, and it runs on `ubuntu-vm`. Read in
`runners/v1/ubuntu-guest.sh`: the measure runs in a new network namespace,
made with `unshare --net`. The namespace holds only a loopback. The script
brings the loopback up and deletes `127.0.0.1/8` from it, so only `::1` is
left. Then the measure runs as the user of the script again, not as `root`.
Read in `runners/v1/INSTALL.md`: the script deletes `127.0.0.1` only in that
namespace, not on the machine.

Read in `measure.mjs`: the measure lists the interfaces with
`os.networkInterfaces()`. It refuses to run unless every listed address is an
IPv6 address of a loopback interface. Each output file notes it: "every listed
address is an IPv6 loopback address".

## 14.3 Results

On this loopback, the binds to `localhost` and `127.0.0.1` fail. The binds to
`::1` and `::` work, and both answer a client that dials `[::1]`:

| # | Step | Result |
|---|------|--------|
| 14 | the lines of `/etc/hosts` that name `localhost` | `127.0.0.1 localhost` |
| 14 | `localhost` resolves to, with the order `verbatim` | `127.0.0.1` |
| 14 | a bind to `localhost`, with the order `verbatim` | `EADDRNOTAVAIL` |
| 14 | `localhost` resolves to, with the order `ipv4first` | `127.0.0.1` |
| 14 | a bind to `localhost`, with the order `ipv4first` | `EADDRNOTAVAIL` |
| 14 | a bind to `127.0.0.1` | `EADDRNOTAVAIL` |
| 14 | a bind to `::1` | `::1` |
| 14 | a client that dials `[::1]` on the bind to `::1` | `HTTP 200` |
| 14 | a bind to `::` | `::` |
| 14 | a client that dials `127.0.0.1` on the bind to `::` | `ENETUNREACH` |
| 14 | a client that dials `[::1]` on the bind to `::` | `HTTP 200` |

`/etc/hosts` names `localhost` on `127.0.0.1` only.

Result details:

- [`results/ubuntu-24.04/node-20.txt`](results/ubuntu-24.04/node-20.txt)
- [`results/ubuntu-24.04/node-22.txt`](results/ubuntu-24.04/node-22.txt)

## 14.4 Becomes a test and needs a code fix

Needs a code fix: yes. On this loopback, a client that dials `127.0.0.1` on the
bind to `::` gets `ENETUNREACH`. Read in `src/lm/MCPServer.ts` at commit
`6d1dcfc`: the server advertises this bind as `127.0.0.1`. A client that dials
`[::1]` on the same bind gets `HTTP 200`. So the URL must name `[::1]` here, as
the review asks.

Read in patch v1: `advertisedHost` returns `[::1]` for a bind to `::` when
loopback has no IPv4. For that bind, it returns `127.0.0.1` when loopback has
IPv4. `hasIPv4Loopback` reads the loopback from `os.networkInterfaces()`. It
takes the addresses marked `internal`, and looks for an IPv4 one that starts
with `127.`. So patch v1 reads "v6 only hosts" as "loopback has no IPv4". A
bind to `0.0.0.0` is advertised as `127.0.0.1` in every case. The runs do not
bind `0.0.0.0`, so its URL is not measured here.

Becomes a test: yes. Of the two hosts tried, only `[::1]` reaches the bind to
`::`. Each reviewer request gets a test that fails when the request is broken.
Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `A bind to :: is advertised as [::1] when loopback has no IPv4` gives
  `advertisedHost` a bind to `::`. The test passes a value that says loopback
  has no IPv4. It checks the host `[::1]`. It fences "map `::` to `::1`".
- `The URL of a bind to :: names [::1] where loopback has no IPv4` makes
  `os.networkInterfaces()` list `::1` alone. The server binds `::1`, and the
  code that builds the URL is told that the bound address is `::`. The test
  checks that the registered URL names `[::1]`, and that a `GET` of it gets
  `405`. It changes only the list, not the loopback of the machine. It skips
  where loopback has no `::1`. It fences "map `::` to `::1`" where the URL is
  built. If that code gave `127.0.0.1` for `::` here, the test would fail.
- `The advertised URL names the bound address, or loopback for a wildcard bind`
  checks six binds. The test passes a value that says loopback has IPv4. There
  a bind to `::` keeps `127.0.0.1`. It fences "for v6 only hosts": other hosts
  keep `127.0.0.1`.
- `Only the loopback decides whether it has IPv4` gives `hasIPv4Loopback` seven
  interface lists. It must return `true` for a loopback with `127.0.0.1`, and
  `false` for one with `::1` alone. Each answer is checked under the name `lo`
  and under `lo0`. It must still return `false` when an IPv4 address outside
  loopback is listed beside `::1`. For a list with no loopback, it must return
  `true`, so `localhost` is kept. It must also return `true` for a list with
  only an IPv4 address outside loopback. If `hasIPv4Loopback` read every
  interface, this last check alone would fail. It fences "for v6 only hosts":
  only the loopback decides.
- `An interface list that cannot be read keeps localhost` covers a failed read.
  Then `hasIPv4Loopback` says that loopback has IPv4, and `bindHost` keeps
  `localhost`. It fences "for v6 only hosts": a machine whose list cannot be
  read does not count as one.

Read in patch v1: no test binds `::`, so no test puts a server on the network.

The rows of `localhost` need a code fix too. Here the default `localhost` gets
`EADDRNOTAVAIL` with both orders. So the default would not start the server on
such a loopback. That default comes from a review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427>.
It gives as the gain of `localhost` "improving portability across IPv4 and
IPv6 environments".

Read in `src/lm/MCPServer.ts` at commit `6d1dcfc`, the reviewed version, lines
59-61: `bindHost` has no step that turns `localhost` into `::1`. Read in patch
v1: `bindHost` turns `localhost` into `::1` when loopback has no IPv4. So the
change came after the review. The rows of the bind to `::1` show that this
host works here. No reviewer asked for the change, but it keeps that default
working on this loopback.

The change becomes a test. Read in patch v1:
`localhost becomes ::1 when loopback has no IPv4` fences it. It checks that
`bindHost` gives `::1` for `localhost`, for `LocalHost.` and for no host. It
also checks that an explicit `127.0.0.1` is kept, and that no host gives
`localhost` when loopback has IPv4.

`With no IPv4 on loopback, the server binds ::1 and registers [::1]` fences
the change in the running server. It makes `os.networkInterfaces()` list `::1`
alone. Then it starts the server with the default host. It checks the bind
`::1`, and the URL that the server registers with VS Code,
`http://[::1]:<port>/mcp`. A `GET` of that URL must get `405`. The test
changes only the list, not the loopback of the machine. It skips where
loopback has no `::1`. The test binds the default host, so its `[::1]` comes
from a bind to `::1`. So it fences the change of `localhost`, not the URL of a
bind to `::`.

The row of `127.0.0.1` needs no code fix of its own. Here loopback has no
`127.0.0.1`, so an explicit bind to it fails with `EADDRNOTAVAIL`. Read in
patch v1: `bindHost` keeps an explicit `127.0.0.1`. When the bind fails, the
listen callback returns, so no URL is registered. The error handler shows
`Failed to start TLA+ MCP server` with the error.

This row needs no test of its own. Read in patch v1:
`A failed bind reports the error` fences such a failure. It tries a bind to
`192.0.2.1`, an address the machine does not have. It checks that the error is
shown once, with `Failed to start TLA+ MCP server` and `EADDRNOTAVAIL`. It
also checks that no URL is registered.

## 14.5 Not measured

A bind to `0.0.0.0` on this loopback. Read in patch v1: its URL names
`127.0.0.1` in every case. The runs do not show whether that URL fails here.

A network with IPv6 only, where loopback keeps `127.0.0.1`. Read in patch v1:
there a bind to `::` is still advertised as `127.0.0.1`.

A machine with IPv4 outside loopback, but none on it. Read in patch v1:
`Only the loopback decides whether it has IPv4` checks it with an injected list.

The MCP clients of VS Code and Cursor. The only client here is a Node client in
the same process as the server.

Another `/etc/hosts`, such as one that also names `localhost` on `::1`. The
rows come from the `/etc/hosts` of this VM. So the runs do not show whether
this file is why `localhost` resolves to `127.0.0.1` alone.

The resolver order `ipv6first`.

The shipped code. Read in `src/lm/MCPServer.ts` at commit `c869f2a`: the server
calls `app.listen(port)` with no host. It advertises
`http://localhost:<port>/mcp`. No run here makes that call or dials that URL.

The code of patch v1, and the extension host. The runs use the reproduction in
plain Node 20 and 22.

Windows and macOS: this use case runs only on Ubuntu.
