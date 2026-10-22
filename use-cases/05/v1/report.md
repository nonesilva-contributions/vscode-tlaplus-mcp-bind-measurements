# Use case 05/v1

## 05.1 Purpose

The user must see the error when the server cannot listen. The reviewer asked
to guard the address after a failed bind, and to add a test:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4304417980>,
"Express 5 also invokes the `app.listen` callback on startup errors. If the
port is occupied or the configured host cannot resolve or bind, `address()`
returns null. Passing it to `advertisedHost()` throws a TypeError before the
existing error listener can report the startup failure. Guard the returned
address before constructing the URL, and add a regression test for a failed
bind."

This use case checks what Express 5.1.0 passes to the callback of a failed
listen. It also checks what runs after that callback. Last, it checks which
port the shipped callback puts in the URL when another server holds the port.

## 05.2 Setup

The request is a comment on line 332 of `src/lm/MCPServer.ts` at commit
`1d29675`, a version of the pull request. Read in `src/lm/MCPServer.ts` at
that commit: the callback of `app.listen` on line 328 takes no argument. Lines
332-333 pass `address()` to `advertisedHost()`, which reads `bound.address` on
line 60. The `'error'` handler on line 391, added after `app.listen` returns,
shows the error with `vscode.window.showErrorMessage`.

Read in `src/lm/MCPServer.ts` at commit `c869f2a`, the shipped code: line 312
calls `app.listen` with no host. Its callback takes no argument either. Line
314 takes the port of the URL with
`(this.mcpServer?.address() as { port: number })?.port || port`.
When `address()` is `null`, this gives the port of the call. The `'error'`
handler is the same, on line 374. Read in `package-lock.json` at the same
commit: `express` is 5.1.0.

The callbacks are written in `measure.mjs`. They run with plain Express 5.1.0,
in plain Node 20 and 22, on Linux and Windows. Read in `lib/v1/server.mjs`:
`makeApp()` builds each app, with `express.json()` and the routes of commit
`c869f2a`. It leaves out the tools and resources of the server and the rewrite
of the `mcp-protocol-version` header. It keeps the text of the 405 answers and
changes the text of the 500 answer.

The first three blocks call `app.listen(port, "192.0.2.1", callback)` with
the port `0`. Read in RFC 5737: the block `192.0.2.0/24` is for documentation,
<https://www.rfc-editor.org/rfc/rfc5737>. On every run, the listen on
`192.0.2.1` fails with `EADDRNOTAVAIL`.

- The first block records the error that its callback gets, and `address()`
  inside the callback. It registers no error handler.
- In the second block, the callback takes no argument and reads
  `address().address`. It stands for lines 332-333 at commit `1d29675`. The
  block records what runs. A listener for the `'uncaughtException'` event of
  `process` records the throw.
- In the third block, the callback returns when it gets an error, or when
  `address()` is `null`. Read in patch v1: the callback in
  `src/lm/MCPServer.ts` returns on
  `if (error || !bound || typeof bound === 'string')`. The block records what
  runs, and the error that the handler gets.
- In the fourth block, the callback keeps line 314 of commit `c869f2a`.
  First, another server takes a free port with no host. Then the block listens
  on that port with no host. It records the errors that the callback and the
  handler get, `address()`, and which port the URL gets.

The last three blocks add their error handler after `app.listen` returns.

## 05.3 Results

The listen on `192.0.2.1` fails with `EADDRNOTAVAIL`, the error for an address
that the machine does not have. Express 5.1.0 calls the callback with that
error, and `address()` is `null` inside the callback. Node 20 and 22, on Linux
and Windows, give the same values:

| # | Step | Result |
|---|------|--------|
| 05 | `app.listen(port, "192.0.2.1", callback)` calls the callback with the error | `EADDRNOTAVAIL` |
| 05 | `address()` inside the callback | `null` |
| 05 | a callback that reads `address().address` throws | `TypeError` |
| 05 | the message of that `TypeError` | `Cannot read properties of null (reading 'address')` |
| 05 | what runs when that callback throws | `callback` |
| 05 | with the guard, the error handler runs | `callback, error handler: EADDRNOTAVAIL` |
| 05 | the callback of `c869f2a` on a held port | `callback gets EADDRINUSE, address() null, builds the URL of the held port, error handler gets EADDRINUSE` |

The callback runs before the error handler. When the callback throws, the
error handler does not run. With the guard, the callback returns, and the
error handler gets the error. On the held port, the error is `EADDRINUSE`, the
error for a port in use. The callback of `c869f2a` does not throw there. It
builds the URL of the held port, and then the error handler runs.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 05.4 Becomes a test and needs a code fix

Needs a code fix: yes. The rows of the `TypeError` come from a callback that
stands for lines 332-333 at commit `1d29675`. On the failed listen on
`192.0.2.1`, it throws, and the error handler does not run. The callback of
`c869f2a` does not throw, but it builds the URL of the held port. That port
belongs to the other server. Read in `src/lm/MCPServer.ts` at commit
`c869f2a`: the callback logs that the server listens at that URL. It also
registers the URL with VS Code, and with Cursor when it runs in Cursor.

Read in patch v1: the callback returns on
`if (error || !bound || typeof bound === 'string')`. So it builds no URL and
registers none, and the error handler reports the failure. The row of the
guard shows this order: the callback returns, then the error handler gets the
error.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. The rows show two ways to break this request: a throw, and
the URL of the held port. Read in patch v1, in
`tests/suite/lm/mcpServer.test.ts`:

- `A failed bind reports the error` fences "add a regression test for a failed
  bind". It runs two failures. In the first, another server, the holder, takes
  a port on the address that the default gives, `bindHost(undefined)`. The MCP
  server then binds the same port and address, which gives `EADDRINUSE`. In
  the second, the MCP server binds `192.0.2.1`, an address for documentation
  that the machine does not have. That bind gives `EADDRNOTAVAIL`. The test
  checks that each failure is reported once, with its code. It also checks
  that no URL is registered with VS Code.

The rows of `EADDRNOTAVAIL` have the second failure as their test. A guard
that returned only for `EADDRINUSE` would fail it. With `EADDRNOTAVAIL`, the
callback would go on with the `null` of `address()`. The rows show that such a
callback throws, and the error handler does not run.

## 05.5 Not measured

A host that cannot resolve, which the request also names, and the other errors
of a listen. The runs measure only `EADDRNOTAVAIL` and `EADDRINUSE`. They
measure the throw and the guard only with `EADDRNOTAVAIL`.

The extension host: the runs use plain Node 20 and 22. VS Code runs the
extension in its own Node. What the extension host does with a `TypeError`
that no code catches. macOS.

How Express 5.1.0 puts the callback before the error handler: the runs record
only the order.

The log line and the registration in the callback of `c869f2a`: the fourth
callback leaves them out. What a client gets from the URL of the held port: no
request goes to it.
