# Use case 13/v1

## 13.1 Purpose

No reviewer asked for a limit on the input.

A client must not make the server hold a large body. This use case checks the
limits on the input, and what the server answers above them. It also checks
what the page of a `413` shows, and counts the calls to `console.error` during
the requests.

## 13.2 Setup

Read in `src/lm/MCPServer.ts` at commit `c869f2a`,
<https://github.com/tlaplus/vscode-tlaplus/blob/c869f2a/src/lm/MCPServer.ts>:
the server calls `express.json()` with no options, on line 229. It gives the
transport only `{ sessionIdGenerator: undefined }`, on lines 242 to 244. It
calls `app.listen(port)` on line 312, and sets no option of the `http` server.
Read in `@modelcontextprotocol/sdk` 1.17.2,
`dist/cjs/server/streamableHttp.js`, line 11: `MAXIMUM_MESSAGE_SIZE = "4mb"`.
On line 302, the transport reads the body with that limit. So the limits on
the input are those of `express.json()`, of the Node `http` server and of the
SDK, `@modelcontextprotocol/sdk`.

Read in `package-lock.json` at the same commit: the extension locks `express`
5.1.0, `body-parser` 2.2.0 and `@modelcontextprotocol/sdk` 1.17.2. Read in
`lib/v1/package-lock.json`: `express` 5.1.0 asks for `body-parser` `^2.2.0`.
The overrides in `lib/v1/package.json` pin 2.2.0. The runs print `express`
5.1.0 and `@modelcontextprotocol/sdk` 1.17.2.

This use case sends each request below to a reproduction of that server. Read
in `lib/v1/server.mjs`: the reproduction keeps `express.json()`, the routes,
and the options of the transport. Its request handler is shorter than the one
of the extension. It connects the transport to an `McpServer` with no tools or
resources. It does not rewrite the `mcp-protocol-version` header, and it has no
limit of its own. It passes the request to the transport, and it answers `500`
on an error. It keeps the text of the `405` answers, and changes the text of
the `500` answer.

Read in `measure.mjs` and `lib/v1/server.mjs`: the server binds `127.0.0.1`
with the port `0`. The extension calls `app.listen(port)` with no host, as
read above. The client runs in the same Node process, and it sends one request
at a time. The runs use plain Node 20 and 22, on Linux and Windows.

Read in `measure.mjs`, on the requests and the checks:

- A JSON body is the `initialize` message, padded with spaces to its length.
- A compressed body is 64 MiB of zero bytes, compressed with `gzip`,
  `deflate`, or `br` at quality 4.
- Before and after each compressed request, it reads `maxRSS`, the peak memory
  of the process. It records `below 8 MiB` when the growth stays under that
  bound.
- For the page of a `413`, it sends the JSON body of 102401 bytes again. It
  reads the whole answer.
- The page names the class of the error if it holds `PayloadTooLargeError`.
  The page holds a stack frame in `node_modules` if its text has
  `node_modules/` or `node_modules\`.
- While the requests run, it replaces `console.error` and counts the calls. So
  the calls write nothing to stderr, and the output does not hold their text.
- The header section of 16383 bytes counts every byte, from the request line
  to the blank line. The value of 16385 bytes is the value of one header.

Read in `measure.mjs`, `runners/v1/`, `docker.sh` and `lib/v1/Dockerfile`:
none of them sets `NODE_ENV`.

Read in `measure.mjs`: it cites the documentation of the limits, for
`body-parser` 2.2.0 and Node 22.23.3:

- <https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#limit>
- <https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#request-entity-too-large>
- <https://github.com/expressjs/body-parser/blob/v2.2.0/README.md#unsupported-content-encoding-bogus>
- <https://nodejs.org/docs/v22.23.3/api/http.html#httpmaxheadersize>
- <https://nodejs.org/docs/v22.23.3/api/http.html#event-clienterror>
- <https://nodejs.org/docs/v22.23.3/api/http.html#class-httpserver>

## 13.3 Results

The values are the same on Linux and Windows, in Node 20 and 22:

| # | Step | Result |
|---|------|--------|
| 13 | a JSON body of 102400 bytes, the limit of `express.json()` | `HTTP 200` |
| 13 | a JSON body of 102401 bytes, one byte over | `HTTP 413` |
| 13 | the page of a `413` for that body names the class of the error | `yes` |
| 13 | the page holds a stack frame in `node_modules` | `yes` |
| 13 | `gzip`, 65250 bytes on the wire, 64 MiB inflated | `HTTP 413` |
| 13 | `deflate`, 65238 bytes on the wire, 64 MiB inflated | `HTTP 413` |
| 13 | `br`, 102 bytes on the wire, 64 MiB inflated | `HTTP 413` |
| 13 | the growth of `maxRSS` across each compressed request | `below 8 MiB` |
| 13 | `Content-Encoding: compress` | `HTTP 415` |
| 13 | `application/json-patch+json`, 4194304 bytes | `HTTP 200` |
| 13 | `application/json-patch+json`, 4194305 bytes | `HTTP 400` |
| 13 | `http.maxHeaderSize`, read from Node | `16384` |
| 13 | a header section of 16383 bytes | `HTTP 200` |
| 13 | one header value of 16385 bytes | `HTTP 431` |
| 13 | `process.env.NODE_ENV` | `undefined` |
| 13 | calls to `console.error` during the requests, kept off stderr | `6` |

- The compressed bodies are under 102400 bytes on the wire, and each one gets
  `413`. So the limit counts the inflated bytes. For each compressed body,
  `maxRSS` grew by less than 8 MiB.
- `express.json()` skips a body of the type `application/json-patch+json`, so
  its limit does not apply: 4194304 bytes get `200`. So the largest body
  measured that gets `200` is 4194304 bytes, 4 MiB. One byte more gets `400`,
  not `413`. The handler has no limit and answers `500` on an error, as read
  above. Read in `@modelcontextprotocol/sdk` 1.17.2,
  `dist/cjs/server/streamableHttp.js`, line 302: the transport reads the body
  with the limit `4mb` of line 11. Lines 409 to 415 hold a catch that answers
  `400` with "Parse error". So this `400` comes from the transport of the SDK.
- In every run, `NODE_ENV` is unset. The page of a `413` holds
  `PayloadTooLargeError` and a stack frame in `node_modules`.
- The runs count 6 calls to `console.error` during the requests, and keep them
  off stderr. The runs got `413` five times, with the request for the page, and
  `415` once. Read in `express` 5.1.0, `lib/application.js`, lines 615 to 617:
  `logerror` calls `console.error(err.stack || err.toString())` unless the env
  is `test`. Line 156 gives it as `onerror` of the final handler.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 13.4 Becomes a test and needs a code fix

Needs a code fix: no. No reviewer asked for a limit on the input. The rows of
the reproduction show these limits. A JSON body of 102401 bytes gets `413`. A
compressed body that inflates to 64 MiB gets `413` too. For each compressed
body, the `maxRSS` of the process grew by less than 8 MiB. The encoding
`compress` gets `415`. A header value of 16385 bytes gets `431`.

An `application/json-patch+json` body gets `200` at 4194304 bytes, 4 MiB, and
`400` one byte over. Read in `@modelcontextprotocol/sdk` 1.17.2, as above: the
transport reads up to `4mb`, on lines 11 and 302. So this body has a limit
too. The memory that it holds is not measured, as 13.5 says.

The page of a `413` names the class of the error, as the rows show. It also
holds a stack frame in `node_modules`. The page goes only to a client that
reaches the port. Read in patch v1: the default of the new setting
`tlaplus.mcp.host` is `localhost`. So the port stays on loopback by default.
Patch v1 adds no error handler to the Express app. So this pull request leaves
the page as it is. Read in `express` 5.1.0, as above: `logerror` calls
`console.error` as the `onerror` of the final handler. So this pull request
leaves these calls as they are too.

Becomes a test: no. No reviewer asked for it. Read in patch v1: it keeps
`express.json()` and the options of the transport. It sets no option of the
`http` server. So patch v1 changes no row of this use case.

## 13.5 Not measured

Many requests at once: the runs send one request at a time.

The memory that the `application/json-patch+json` body of 4 MiB holds: the
runs record `maxRSS` only for the compressed bodies.

The timeouts, because two of them take minutes. The runs read them from the
server, and do not test them. They are `requestTimeout` 300000 ms,
`headersTimeout` 60000 ms and `keepAliveTimeout` 5000 ms. The runs also read
`maxRequestsPerSocket` 0, which means no limit.

The page of the `415` answer.

The text of the `400` answer: the runs record only its status.

Whether the paths in the page of a `413` are absolute: the check only looks
for `node_modules/` or `node_modules\`.

The text of the calls to `console.error`: the runs only count them.

The extension host, where VS Code runs the extensions: the runs use plain Node
20 and 22. So the page of a `413` there is not measured. `NODE_ENV` there at
run time is not measured either. Read in `esbuild.js` at commit `c869f2a`: the
Node build of the extension has no `define`. So the build does not set
`NODE_ENV`.

What the reproduction leaves out: the tools and resources of the server, and
the rewrite of the `mcp-protocol-version` header. Read in `src/lm/MCPServer.ts`
at commit `c869f2a`, line 265: the handler of the extension also calls
`console.error` when it catches an error. The handler of the reproduction does
not, so the count holds only other calls.

macOS: the runs use Linux and Windows only.
