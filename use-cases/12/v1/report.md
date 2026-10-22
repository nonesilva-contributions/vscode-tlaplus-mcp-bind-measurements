# Use case 12/v1

## 12.1 Purpose

No reviewer asked to keep another server off the port of the MCP server.
Read in patch v1: the server binds the name `localhost` by default. Loopback
can have an address of each family: `127.0.0.1` for IPv4 and `::1` for IPv6.
This use case checks whether another server can take the same port on the
other family. It also checks which server a client then reaches.

## 12.2 Setup

Read in patch v1, in `package.json` and `src/lm/MCPServer.ts`: the server
binds the host of the setting `tlaplus.mcp.host`. With the default
`localhost`, `app.listen` gets that name, unless loopback has no IPv4. Read in
`src/lm/MCPServer.ts` at commit `c869f2a`,
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>:
the shipped server calls `app.listen(port)` with no host.

This use case runs a reproduction of the server, with the port `0`. Read in
`lib/v1/server.mjs`: it keeps the options of the transport, `express.json()`
and the routes of commit `c869f2a`. It leaves out the tools and resources of
the server and the rewrite of the `mcp-protocol-version` header. It keeps the
text of the 405 answers and changes the text of the 500 answer. It runs in
plain Node 20 and 22, on Linux and Windows.

Read in `measure.mjs`: the reproduction first binds `localhost`, with
`app.listen(port, "localhost")`. Then another server binds `127.0.0.1` on the
same port. It is a plain `http` server that answers every request with
`HTTP 418`. While it listens, a Node client sends a `POST` with an
`initialize` request three times. The requests go to the name `localhost`, to
the bound address, and then to `127.0.0.1`. Both servers then close. Next,
the reproduction binds with `app.listen(port)`, as the shipped server does.
Another server tries to bind `127.0.0.1` on that port. No request goes to
these two servers.

The resolver order is the order of the addresses that a lookup of a name
returns. Read in `measure.mjs`: it records the resolver order, but does not
set it. Read in the documentation of both versions of Node: the order
`verbatim` does not reorder the addresses of a lookup:

- <https://nodejs.org/docs/v20.20.2/api/dns.html#dnslookuphostname-options-callback>
- <https://nodejs.org/docs/v22.23.3/api/dns.html#dnslookuphostname-options-callback>

Read in `runners/v1/docker-node.sh`: on Linux each run is a container on an
internal Docker network of its own. The script creates that network with no
`--ipv6`.

## 12.3 Results

`HTTP 418` comes from the other server, and `HTTP 200` from the MCP server.

| # | Step | Result |
|---|------|--------|
| 12 | the resolver order of Node, `dns.getDefaultResultOrder()` | `verbatim` |
| 12 | `app.listen(port, "localhost")` binds | `::1` |
| 12 | another server binds `127.0.0.1` on the same port | `listening` |
| 12 | a request to the name `localhost`, on Linux | `HTTP 418` |
| 12 | a request to the name `localhost`, on Windows | `HTTP 200` |
| 12 | a request to the bound address `::1` | `HTTP 200` |
| 12 | a request to `127.0.0.1` | `HTTP 418` |
| 12 | the shipped bind, `app.listen(port)` with no host, binds | `::` |
| 12 | another server binds `127.0.0.1` on that port, on Linux | `EADDRINUSE` |
| 12 | another server binds `127.0.0.1` on that port, on Windows | `listening` |

So another server took `127.0.0.1` on the port of the `::1` bind, on Linux and
on Windows. The shipped bind kept it off `127.0.0.1` on Linux only.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 12.4 Becomes a test and needs a code fix

Needs a code fix: no. The row of the bound address got `HTTP 200` from the MCP
server. The other server listened on `127.0.0.1` during that request. So the
Node client that dialed `::1`, the bound address, reached the MCP server. Read
in patch v1, in `src/lm/MCPServer.ts`: the URL names that address. For a bind
to `::1`, its host is `[::1]`. The log line and the registrations with VS Code
and Cursor use that URL.

Two rows got `HTTP 418` from the other server: the name on Linux, and
`127.0.0.1`. For those requests to reach the MCP server, it would need a bind
on both families. A set of names could give that bind. The review thread kept
a set of names out of this pull request. The default `localhost` comes from
this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>.
A reviewer wrote "An alternative could be to accept a set of names":
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285615540>.
The author answered: "The gain would be serving more than one address at a
time, for example both loopbacks." The answer also says: "Every use named so
far fits in a single value":
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285762293>.

What changes on Linux: the shipped bind to `::` refused the other server with
`EADDRINUSE`. The bind to one family, `::1`, lets the other server take
`127.0.0.1`. On Windows, the shipped bind let it take `127.0.0.1` too.

Becomes a test: no. The URL relies on the row of the bound address. A test
already checks that row: `The URL registered with VS Code reaches the server`.
Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`: it checks that the
URL names the bound address. It also checks that a GET to that URL gets `405`.
Read in the same file: no test binds another server on the other family. The
test `A failed bind reports the error` binds one on the same address.

## 12.5 Not measured

The other order, where the other server binds first. Read in `measure.mjs`:
the MCP server always binds first.

A fixed `tlaplus.mcp.port`. The runs use the port `0`, and the other server
binds the port that the MCP server got. Read in `package.json` at commit
`c869f2a`: with `0`, the server listens on "a non-deterministically assigned
available port". A reviewer wrote that TLAiBench passes settings through the
workspace `.vscode/settings.json`, "(as it does for `tlaplus.mcp.port`)":
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309260075>.

A second user on the machine, and whether Node sets `SO_EXCLUSIVEADDRUSE` on
the socket of the shipped bind. Read in `measure.mjs`: one Node process makes
all the binds. Read in the documentation of Windows:
<https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse>.
Take a first bind to the wildcard address `::`. Then take a second bind with no
options to a specific address of that port. For the same user, the second bind
works, unless the first one sets `SO_EXCLUSIVEADDRUSE`. For a different user,
it fails with `WSAEACCES`. With no `SO_EXCLUSIVEADDRUSE`, this would explain
the Windows row of the shipped bind. The runs do not record the options of the
socket.

With the shipped bind and the other server on Windows, which server a request
reaches.

Which addresses the lookup of `localhost` returns, and in which order the
client tries them. The runs do not record the lookup. So they do not show why
the rows of the name differ on Linux and Windows.

The addresses of the machines: the runs do not list them. A Linux machine with
an IPv6 address outside loopback.

The extension host of VS Code, the Node process that runs the extension, and
its resolver order. Read in the same pages of Node: the order `ipv4first` puts
IPv4 addresses before IPv6 addresses. Whether another server can take `::1` on
the same port with that order.

The MCP clients of VS Code and Cursor: the runs use a Node client. macOS.
