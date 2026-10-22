# Use case 06/v1

## 06.1 Purpose

Read in patch v1: a comment above `bindHost` says that a setting can hold any
JSON value. When the value is not a host, the server must stay on loopback. No
reviewer asked for this. The review
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>
asked for the setting: "Please make configurable via preference and change to
`localhost`." It did not ask for a check of the type of the value.

This use case is about two kinds of values that are not a host. They are a
value that is not a string, and the empty string `''`. It checks what Node
binds with `8080`, a number, as the host, and with `''`. It also checks what
each bind answers.

## 06.2 Setup

This use case runs a reproduction with two hosts that are not a non-empty
string, and the port `0`. It calls `app.listen(port, 8080)`, then
`app.listen(port, '')`. Read in `lib/v1/server.mjs`: it keeps the options of
the transport, `express.json()` and the routes of commit `c869f2a`. It leaves
out the tools and resources of the server and the rewrite of the
`mcp-protocol-version` header. It keeps the text of the 405 answers and
changes the text of the 500 answer. It runs in plain Node 20 and 22, on Linux
and Windows.

Read in `lib/v1/server.mjs`: its `listen()` calls `app.listen` with no host
when the host is falsy, such as `''`. Read in `measure.mjs`: for `''`, it
calls `app.listen(0, '')` itself, not that `listen()`.

Read in `src/lm/MCPServer.ts` at five versions: no version has the call
`app.listen(port, 8080)` in its source. The five are commits `c869f2a`,
`1668ddc`, `1d29675` and `6d1dcfc`, and patch v1. Read in `src/main.ts` at
commit `1d29675`, the second version of the pull request: line 280 reads the
host setting. It sets `mcpHost` to
`get<string>('tlaplus.mcp.host') || 'localhost'`, and line 281 gives `mcpHost`
to `new MCPServer`. Read in `src/lm/MCPServer.ts` at the same commit: line 328
calls `app.listen(port, host, ...)` with that host. `||` replaces `''` with
`'localhost'`, but it keeps `8080`. So at that commit, a number in the setting,
such as `8080`, would reach `app.listen(port, host)`.

Each request goes to a non-loopback IPv4 address of the machine,
`<bridge-ip>`. `<bridge-ip>` stands for that address. On Linux, it is the
address of the container on its own internal Docker network. On Windows, it is
the first non-loopback IPv4 address of the guest. Each request goes from the
machine to its own address. So the rows show which addresses each socket
accepts, not what a firewall lets in.

## 06.3 Results

With `8080`, a number, as the host, Node binds the unspecified address `::`.
With the empty string `''` as the host, Node binds `::` too. The rows try one
non-loopback IPv4 address, `<bridge-ip>`, and each socket answers there:

| # | Step | Result |
|---|------|--------|
| 06 | `app.listen(port, 8080)`, with `8080`, a number, as the host, binds | `::` |
| 06 | a request to `<bridge-ip>`, from the same machine | `HTTP 200` |
| 06 | `app.listen(port, '')`, with the empty string as the host, binds | `::` |
| 06 | a request to `<bridge-ip>`, from the same machine | `HTTP 200` |

So `8080`, a number, as the host does not keep the server on loopback. The
empty string `''` does not either.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 06.4 Becomes a test and needs a code fix

Needs a code fix: yes. With `8080`, a number, as the host, Node binds `::`, and
that bind answers a request to `<bridge-ip>`. The rows show the same for `''`.
So with `8080` or `''` in the setting and no check, the server would not stay
on loopback. No reviewer asked for a check of the value of the setting. It is
the author's own, and it stays because the setting is new in this pull
request. Read in `package.json` at commit `c869f2a`: the extension has no host
setting. Read in patch v1: `package.json` adds the setting `tlaplus.mcp.host`,
a new input of `app.listen`.

Read in patch v1, in `src/lm/MCPServer.ts`:

- The constructor of `MCPServer` reads the setting itself, when it gets no
  host. It gives the value to `bindHost`, and the result goes to
  `app.listen(port, host, ...)`.
- `bindHost` takes only a non-empty string as the host. It gives `localhost`
  for any other value, or `::1` when loopback has no IPv4.

Becomes a test: yes. The rows show what two values do with no check: `8080`, a
number, and `''` each bind `::`. So a test must fail when the check goes. Read
in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `A host that is not a non-empty string binds loopback` writes five values in
  the user settings. They are `8080`, `true`, `{ a: 1 }`, `['127.0.0.1']` and
  `''`. For each value, it first checks that the setting holds the value. The
  default binds loopback too, so without that check, a write that missed the
  setting would still pass. Then it calls `new MCPServer(0)`. A spy on
  `listen` checks that the host that reaches the bind is the default host,
  `bindHost(undefined)`. Last, it checks that the bound address is loopback,
  `127.0.0.1` or `::1`. It fences that a value that is not a host keeps the
  server on loopback.

Read in patch v1: `bindHost` treats every value that is not a string the same
way as a number. A guard that checked only numbers and empty values would fail
this test on `true`, an object or an array. The rows show that `''` as the
host binds `::` too. That bind answers a request to `<bridge-ip>`. So the test
writes `''` as well.

## 06.5 Not measured

That a setting can hold any JSON value, such as a number. The runs give `8080`
and `''` to `app.listen` directly, with no setting.

Other numbers, and the other values that are not a string: `true`, `null`, an
object and an array. The runs give only `8080` and `''`.

A request to the loopback addresses, `127.0.0.1` and `::1`. A request from a
second machine, and what a firewall lets in.

A machine with no IPv6. The extension host of VS Code: the runs use plain Node
20 and 22. macOS.

Observed, not in the results files: on Windows with Node 20, one run got
`Error: no answer in 800 ms`. It was for the request to `<bridge-ip>` on the
bind with `8080`. The next run gave `HTTP 200` for every request, and the
results files hold that run. The cause of the error is not known.
