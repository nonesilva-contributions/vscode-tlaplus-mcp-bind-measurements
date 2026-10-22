# Use case 04/v1

## 04.1 Purpose

The reviewer asked for `localhost` as the default:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427>,
"I'd also suggest using `localhost` rather than `127.0.0.1` as the default,
since `localhost` can resolve to either the IPv4 (`127.0.0.1`) or IPv6 (`::1`)
loopback address, improving portability across IPv4 and IPv6 environments."

This use case checks "can resolve to either" for a bind. It records which
addresses a lookup of `localhost` gives, which one the bind takes, and which
loopback address answers.

## 04.2 Setup

Read in `src/lm/MCPServer.ts` at commit `1668ddc`, the first version of the
pull request: line 312 calls `app.listen(port, '127.0.0.1', ...)`. The request
is a comment on that line. Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
the shipped code: it calls `app.listen(port)` with no host.

Read in patch v1: `package.json` gives the new setting `tlaplus.mcp.host` the
default `localhost`. Where loopback has an IPv4 address, `bindHost` keeps that
name. So by default the server calls `app.listen(port, host, ...)` with
`localhost`. Read in `package.json` at commit `c869f2a`: `tlaplus.mcp.port` is
`0` by default.

This use case runs a reproduction of that default call, with the port `0`.
Read in `measure.mjs` and `lib/v1/server.mjs`: the bind is
`app.listen(0, 'localhost', ...)`. The reproduction keeps the options of the
transport, `express.json()` and the routes of commit `c869f2a`. It keeps the
text of the 405 answers and changes the text of the 500 answer. It leaves out
the tools and resources of the server and the rewrite of the
`mcp-protocol-version` header. It is neither the shipped code nor the
extension host. It runs in plain Node 20 and 22, on Linux and Windows.

Read in `lib/v1/measure.mjs`: each request is a `POST` of `initialize` to
`/mcp`. Read in `measure.mjs`: a request goes to `127.0.0.1` or to `::1`, never
to the name `localhost`. The script sets no resolver order.

Read in `runners/v1/docker-node.sh`: on Linux, the use case runs in a Docker
container. Its image is built on the pinned `node:20-slim` or `node:22-slim`.
The container is on an internal Docker network of its own, created with no
`--ipv6`. The runner adds no line to `/etc/hosts`. So the container keeps the
`/etc/hosts` that the Docker engine writes. Node runs `measure.mjs` with no
option for the resolver order. Read in `measurements.gitconfig`: this use case
sets no loopback. So `runners/v1/run.sh` passes `none`, and `docker-node.sh`
leaves loopback as it is.

On Windows, the use case runs in a Windows 11 VM. The guest reports
`Microsoft Windows 11 Enterprise LTSC Evaluation 24H2, build 26100.1742`.
Read in `runners/v1/windows.ps1`: Node runs `measure.mjs` there with no option
for the resolver order either.

## 04.3 Results

The four runs, Node `v20.20.2` and `v22.23.3` on Linux and Windows, give the
same values:

| # | Step | Result |
|---|------|--------|
| 04 | the resolver order of Node | `verbatim` |
| 04 | a lookup of `localhost` with `all: true` and no hints | `::1, 127.0.0.1` |
| 04 | `app.listen(port, "localhost")` binds | `::1` |
| 04 | the family of the bind | `IPv6` |
| 04 | a request to `127.0.0.1` | `ECONNREFUSED` |
| 04 | a request to `::1` | `HTTP 200` |

With the order `verbatim`, the lookup gives both loopback addresses, `::1`
first. In these runs, the bind took `::1`, the first address of the lookup.
So the name can resolve to either family, but the server answered on one
family only.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 04.4 Becomes a test and needs a code fix

Needs a code fix: yes. In these runs, the default `localhost` kept the server
on loopback, on `::1`. A client that dials `127.0.0.1` gets `ECONNREFUSED`. A
client that dials `::1`, the bound address, gets `HTTP 200`. So a URL that
names one fixed address, such as `127.0.0.1`, can miss the server. Read in
`src/lm/MCPServer.ts` at commit `1668ddc`, line 316: that version advertised
`http://127.0.0.1:${actualPort}/mcp`, the URL that these rows refuse. Read in
patch v1: `advertisedHost` builds the host of `serverUrl` from the bound
address. The log line and the registrations with VS Code and Cursor use
`serverUrl`. For a bind to `::1`, the URL names `[::1]`.

Becomes a test: yes. In these runs, the bind took `::1`, the first address of
the lookup. So the resolver chooses the family only when the name reaches the
bind. Each reviewer request gets a test that fails when the request is broken.
Read in patch v1: the tests build `MCPServer` themselves, and no test calls
`activate`. Read in `src/main.ts` at commit `c869f2a`, which patch v1 keeps:
line 280 calls `new MCPServer(mcpPort)` with no host. Read in patch v1, in
`tests/suite/lm/mcpServer.test.ts`:

- `The HTTP server binds the name localhost by default` wraps
  `net.Server.prototype.listen` in a spy. It checks that the name `localhost`,
  not an address of one family, reaches the bind. It fences "`localhost`
  rather than `127.0.0.1`". It skips where loopback has no IPv4, since there
  the server binds `::1`.
- `The host setting defaults to localhost` checks the default of
  `tlaplus.mcp.host` in `package.json`. It fences "as the default".
- `The URL registered with VS Code reaches the server` checks that the
  registered URL names the bound address. It also checks that a `GET` to that
  URL gets `405`. It binds the default, which binds `127.0.0.1` where the
  resolver gives IPv4 first.
- `With no IPv4 on loopback, the server binds ::1 and registers [::1]` and
  `The HTTP server binds the host of the setting` fence the URL of a bind to
  `::1`. The first makes the interface list show `::1` alone on loopback. The
  second sets `tlaplus.mcp.host` to `::1`. Both check that the server binds
  `::1` and that the URL registered with VS Code names `[::1]`. Both also
  check that a `GET` to that URL gets `405`. Both skip where loopback has no
  `::1`. With the test above, they fence "can resolve to either": the URL
  follows the address that the bind took.
- `The advertised URL names the bound address, or loopback for a wildcard bind`
  checks the host that `advertisedHost` returns for six binds. The address
  `127.0.0.1` gives the host `127.0.0.1`, and `::1` gives `[::1]`. It fences
  "either the IPv4 (`127.0.0.1`) or IPv6 (`::1`)".

Read in `tests/suite/lm/mcpServer.test.ts` at commit `c869f2a`: two tests
dial `127.0.0.1`, at lines 228 and 284:

- `GET /mcp returns 405 without invoking the MCP handler`
- `Each POST /mcp request uses a fresh MCP server instance`

Where `localhost` binds `::1`, they would get `ECONNREFUSED`. Read in patch
v1: they now dial the address that the server bound.

The reviewer also named another way:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285615540>,
"An alternative could be to accept a set of names." The answer kept one value
for this pull request:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285762293>,
"Every use named so far fits in a single value". It also says: "The gain
would be serving more than one address at a time, for example both
loopbacks."

## 04.5 Not measured

The extension host: the runs use plain Node, and VS Code runs the extension in
its own Node. Its resolver order is not measured or read here.

A Linux machine outside a container, and macOS. The hosts file of another
machine: the Linux runs use the `/etc/hosts` that the Docker engine writes.

The lookup of a client that dials the name `localhost`. The runs dial the
addresses `127.0.0.1` and `::1`, not the name. Read in `src/lm/MCPServer.ts` at
commit `c869f2a`: the URL names `localhost`, so a client makes its own lookup.

How `listen` looks up the name. It is not read here. `measure.mjs` makes its
own lookup, with `all: true`, and compares the bind with its first address.
In every run, that address is `::1`, so no run has a lookup with IPv4 first.

The start of the server in `activate`, and any other caller of `MCPServer`.
Read in patch v1: a caller that gives its own host to `new MCPServer` skips
the setting `tlaplus.mcp.host`.

Cursor. Read in patch v1: the server also registers `serverUrl` with Cursor.
No test of patch v1 checks that registration.

A loopback with one family only. Read in patch v1: where loopback has no IPv4,
`bindHost` gives `::1` in place of `localhost`.

A resolver that maps `localhost` outside loopback, such as a hosts file with
another address for the name. Read in patch v1: the server does not check that
the bound address is on loopback.

A set of names, the other way that the reviewer named: no run binds more than
one address.
