# Use case 15/v1

## 15.1 Purpose

This use case answers this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4284406427>.

> I'd also suggest using `localhost` rather than `127.0.0.1` as the default,
> since `localhost` can resolve to either the IPv4 (`127.0.0.1`) or IPv6
> (`::1`) loopback address, improving portability across IPv4 and IPv6
> environments.

This use case checks which address the default `localhost` binds with the
resolver order `ipv4first`. It compares that bind with `127.0.0.1`, the
default that the request replaces.

The resolver order is the order of the addresses that a lookup of a name
returns.

## 15.2 Setup

Read in `src/lm/MCPServer.ts` at commit `1668ddc`: the server calls
`app.listen(port, '127.0.0.1', ...)` on line 312. That commit is the first
version of the pull request. The request is a comment on that line. Read in
patch v1: `package.json` adds the setting `tlaplus.mcp.host`, with the default
`localhost`.

This use case runs a reproduction of the server, `lib/v1/server.mjs`, with the
port `0`. Read in `lib/v1/server.mjs`: it keeps the options of the transport,
`express.json()` and the routes of commit `c869f2a`. It keeps the text of the
`405` answers and changes the text of the `500` answer. It leaves out the
tools and resources of the server, and the rewrite of the
`mcp-protocol-version` header. The reproduction binds `localhost`, the default
host of patch v1, with `app.listen(port, "localhost")`. No code of patch v1
runs. The reproduction runs in plain Node 20 and 22, in a Docker container on
Linux.

Read in `src/lm/MCPServer.ts` at commit `c869f2a`: the shipped server calls
`app.listen(port)` with no host. The last two rows bind the same way.

Read in `measure.mjs`, the script of this use case: it sets the resolver order
with `dns.setDefaultResultOrder('ipv4first')`. It does this before it resolves
or binds a name. The results note
`resolver order ipv4first, set by this script`, and the first row records the
order. Read in the documentation of Node: the order `ipv4first` puts IPv4
addresses before IPv6 addresses,
<https://nodejs.org/docs/v22.23.3/api/dns.html#dnslookuphostname-options-callback>.

Read in `lib/v1/measure.mjs`: a client in the same Node process sends each
request. It is a `POST` to `/mcp` with the MCP request `initialize`. Read in
`measure.mjs`: the other server answers every request with `418`. So a `418`
would show that it took a request.

Read in `runners/v1/docker-node.sh`: the container is on an internal Docker
network of its own, created without `--ipv6`. In every run, loopback has
`127.0.0.1` and `::1`: the rows bind both.

## 15.3 Results

| # | Step | Result |
|---|------|--------|
| 15 | the resolver order of Node | `ipv4first` |
| 15 | `localhost` resolves to | `127.0.0.1, ::1` |
| 15 | `app.listen(port, "localhost")` binds | `127.0.0.1` |
| 15 | the family of the bind | `IPv4` |
| 15 | a request to `::1` | `ECONNREFUSED` |
| 15 | a request to `127.0.0.1` | `HTTP 200` |
| 15 | a request to the name `localhost` | `HTTP 200` |
| 15 | another server binds `::1` on the same port | `listening` |
| 15 | with that server, a request to the name `localhost` | `HTTP 200`, the MCP server |
| 15 | with that server, a request to the bound address `127.0.0.1` | `HTTP 200` |
| 15 | `app.listen(port)`, with no host, binds | `::` |
| 15 | with that bind, another server binds `::1` on the same port | `EADDRINUSE` |

Node 20 and Node 22 give the same rows. With the order `ipv4first`,
`localhost` binds `127.0.0.1` alone. A request to that address or to the name
reaches it. Another server can then bind `::1` on the same port. With that
server, the name and the bound address still get `HTTP 200`, not `418`. The
shipped bind to `::` holds the port on `::1` too.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)

## 15.4 Becomes a test and needs a code fix

Needs a code fix: no. With the order `ipv4first`, `localhost` binds
`127.0.0.1`. A request to `127.0.0.1` or to the name `localhost` reaches it.
So here the request changes nothing in the bind: the server binds the address
that the request replaces.

The other family stays free: another server binds `::1` on the same port.
With the shipped bind to `::`, another server gets `EADDRINUSE` there. With
the other server on `::1`, the name and the bound address still reach the MCP
server. Read in patch v1, in `src/lm/MCPServer.ts`: the URL that the server
advertises names the bound address. The log line and the registrations with
VS Code and Cursor use that URL. So where `localhost` binds `127.0.0.1`, as in
the rows, the URL would name `127.0.0.1`. The row of the bound address shows
that this address reaches the MCP server.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken, even when the code already did it. With this order,
`localhost` binds `127.0.0.1`, the address that the request replaces. So the
bound address alone cannot show whether the name reached the bind. Read in
patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The HTTP server binds the name localhost by default` puts a spy on
  `net.Server.prototype.listen`. Then it calls `new MCPServer(0)`, with no
  host. The spy records the host that the server passes to the bind. The test
  checks that this host is the name `localhost`, not an address of one
  family. A default of `127.0.0.1` would fail it. It fences "`localhost`
  rather than `127.0.0.1`" in the default of the constructor. It skips on a
  machine whose loopback has no IPv4.
- `The host setting defaults to localhost` checks that `package.json` gives
  `tlaplus.mcp.host` the default `localhost`. It fences "as the default".
- `The URL registered with VS Code reaches the server` checks that the
  registered URL names the bound address. It also checks that a `GET` of the
  URL gets `405`, so the URL reaches the server. It fences the URL of the
  bound address. The rows show why: another server can take the port on
  `::1`. Alone, it does not fence "can resolve to either": with a default of
  `127.0.0.1`, it would still pass.

## 15.5 Not measured

A loopback with one family only. Read in patch v1, in `src/lm/MCPServer.ts`:
with no IPv4 on loopback, `bindHost` turns `localhost` into `::1`. It keeps an
explicit `127.0.0.1`.

The extension host itself, the Node process of VS Code that runs the
extension. The runs use plain Node 20 and 22. Its resolver order is not
measured or read here.

The shipped code itself, and the code of patch v1. The last two rows run only
the call `app.listen(port)` of commit `c869f2a`, and no request goes to that
bind.

The call in `activate`, the entry point of the extension. Read in
`src/main.ts` at commit `c869f2a`, which patch v1 keeps: it calls
`new MCPServer(mcpPort)` with no host. Read in patch v1, in
`src/lm/MCPServer.ts`: the constructor reads `tlaplus.mcp.host` only as the
default of its parameter `host`. So a caller that gives its own host to
`new MCPServer`, as `src/main.ts` could, skips the setting. Read in the tests
of patch v1: no test calls `activate`.

A client in another process, or with another resolver order. The only client
here runs in the same Node process as the server, with the order `ipv4first`.

Which address the client tries first when it dials the name: the runs do not
record its lookup. Read in the manual page of `getaddrinfo`: a lookup can take
the flag `AI_ADDRCONFIG`,
<https://man7.org/linux/man-pages/man3/getaddrinfo.3.html>. With that flag, it
returns IPv6 addresses only when the machine has an IPv6 address outside
loopback. Whether the client of Node sets that flag is not read here. The order
`ipv4first` and that flag could each explain the rows of the name.

Windows and macOS: this use case runs only in a Docker container on Linux.
