# vscode-tlaplus-mcp-bind-measurements

Measurements behind a proposed change to
[tlaplus/vscode-tlaplus](https://github.com/tlaplus/vscode-tlaplus): bind the
TLA+ extension's MCP server to loopback.

## The problem

`src/lm/MCPServer.ts` builds an Express app whose `POST /mcp` has no
authentication and no `Host`/`Origin` check, constructs the Streamable HTTP
transport with `{ sessionIdGenerator: undefined }` and nothing else, and calls
`app.listen(port)` with no host, so Node binds the unspecified address `::`
(dual-stack). While the server runs it accepts connections on every
interface, and the endpoint has no authentication. Whether a given machine can
actually reach it then depends on the firewall in front of it. `tlaplus.mcp.port` defaults to `0`, which `src/main.ts` treats
as "listen on a free port", so the server starts on activation unless the port
is set to `-1`. Source at commit `6026007`:
<https://github.com/tlaplus/vscode-tlaplus/blob/60260075203e463a6cf55fad7fa3051d4c320f9d/src/lm/MCPServer.ts>.

## Affected versions

Read from the file's own history: all 44 revisions of `src/lm/MCPServer.ts` were
fetched and checked.

- The MCP server arrived in commit `9013319` (2025-05-22) and called
  `app.listen(port, ...)` with no host from its first revision, so this is
  original to the feature, not a regression.
- No revision ever passed a host, and none ever set
  `enableDnsRebindingProtection`, `allowedHosts` or `allowedOrigins`. The pinned
  SDK declares all three; they are simply not used.
- In VS Code the server was off by default at first: `tlaplus.mcp.port` defaulted
  to `-1` until commit `249065f` (2025-12-02) changed that default to `0`. From
  there on the server starts with the extension.
- In Cursor it started earlier. Commit `46a6b48` (2025-06-25) made the extension
  rewrite `tlaplus.mcp.port` from `-1` to `0` in the user's global settings at
  activation, so from that build the server ran in Cursor even for a user who had
  set `-1`. Commit `249065f` removed that rewrite.

The project has 40 tags, but they stop in August 2024, before the MCP server
existed, and there are no GitHub releases at all. It publishes a rolling release
on each push to master, with a CalVer version of the form `YYYY.M.DHHMM`; the
`1.7.0` in `package.json` is static and marks nothing. So the code is affected from the release built on 2025-05-22
through the latest, built 2026-10-13 from master `6026007`, and it is on by
default from the release built on 2025-12-02, and in Cursor from the one built on
2025-06-25. Setting `tlaplus.mcp.port` to `-1` keeps the server from starting,
except in Cursor between those two dates, where the extension wrote that setting
back to `0`.

This repository holds a small Node module that reproduces the listen and
transport options before and after the change and checks reachability from
inside the Node runtime, a runner that executes it in Docker's bridge network
so that no host firewall is involved, and the captured outputs per Node version.
Same class as
[elixir-ls-mcp-bind-measurements](https://github.com/nonesilva-contributions/elixir-ls-mcp-bind-measurements).

## What the loopback bind does not break

Read in the extension at the same commit:

- Every endpoint the extension advertises is `localhost`: the logged URL, the
  Cursor registration and the VS Code `McpHttpServerDefinition`. Nothing it
  registers points anywhere else.
- Remote development keeps working. The extension declares no `extensionKind`,
  so under Remote-SSH, a dev container, WSL or Codespaces the extension host and
  the MCP server run on the same machine. And every URL the extension registers
  is already `localhost`, so any setup whose client sat on another machine is
  broken today, before this change.
- The repository's own tests already connect over `127.0.0.1`, and its Playwright
  helper binds `127.0.0.1` explicitly.
- A tunnel in front of the port still works, because the tunnel client dials
  localhost on the same host.

What it does change: a client on another machine, reaching the port over a LAN
address, stops working, and so does a container that publishes this port with
`docker run -p`, because the published port forwards to the container's own
address rather than to its loopback. Nothing in the repository advertises that
use, and no setting exposes the server on purpose; `tlaplus.mcp.port` only picks
the port. The IPv6 loopback is the measured cost: row 1 answers `HTTP 200` on
`::1` and row 2 refuses it, so a client that resolves `localhost` to IPv6 without
falling back to IPv4 would have to use `127.0.0.1`.

## Run it

Requirements: Docker. Nothing runs on the host.

```text
./run-docker.sh 20 22
```

Each run starts an official `node:<version>-slim` container on the default
bridge network (its own network namespace, where the host's firewall rules do
not apply, and a non-loopback address `172.17.0.x` to connect from), installs
the extension's own `express` 5.1.0 and `@modelcontextprotocol/sdk` 1.17.2, and
runs `mcp_bind.mjs`. The socket is read with `server.address()` and reachability
is measured with Node's `http` client, not with `ss`, `curl` or `ip`. The images
are pinned by digest, and the ephemeral port and the container address print as
`<ephemeral>` and `<bridge-ip>`, so two runs produce an identical file; no
verdict depends on those values.

## Cases and results

Identical on Node 20.20.2 and 22.23.3. Outputs are in [`results/`](results/).

| # | Setup | Result |
|---|-------|--------|
| 1 | shipped (`MCPServer.ts:228-312`): transport `{ sessionIdGenerator: undefined }`, `app.listen(port)` with no host | bind `:::P`, dual-stack; `initialize` from the non-loopback address: `HTTP 200`; with `Host`/`Origin` `attacker.example`: `HTTP 200`; to `::1`: `HTTP 200` |
| 2 | this pull request: `app.listen(port, '127.0.0.1')`, transport unchanged | bind `127.0.0.1:P`; from the non-loopback address: `ECONNREFUSED`; `Host`/`Origin` `attacker.example`: `HTTP 200`; to `::1`: `ECONNREFUSED` |
| 3 | follow-up, not in this pull request: the same bind plus transport `{ enableDnsRebindingProtection: true, allowedHosts }` | bind `127.0.0.1:P`; from the non-loopback address: `ECONNREFUSED`; foreign `Host` `attacker.example`: `HTTP 403`; `Host` `127.0.0.1`: `HTTP 200` |

What the rows establish:

- Row 1: as shipped the server binds `::`, so it is reachable over IPv4 and IPv6
  from any interface; it answers an unauthenticated `initialize` from a
  non-loopback address; and it accepts a request carrying a foreign `Host` and
  `Origin`.
- Row 2: binding to loopback refuses the non-loopback address. It does not stop
  a request that reaches the port locally with a foreign `Host`, and that is the
  honest limit of this change.
- Row 3: the `Host` allowlist closes that remaining case and still serves the
  legitimate local client. It is left out of this pull request for the reason
  given under "The patch".

## The patch

`mcp-bind-loopback.patch` is one line on `src/lm/MCPServer.ts` at commit
`6026007`: `app.listen(port, '127.0.0.1', ...)` instead of
`app.listen(port, ...)`. It applies cleanly to that commit.

Case 3, the DNS-rebinding protection, is deliberately left out of the patch. The
SDK matches the `Host` header against the allowlist as an exact string, so a
request that arrives through a tunnel or a reverse proxy carries that hostname
and is refused. The project's own TLAiBench puts a Cloudflare tunnel in front of
this port, so an unconditional allowlist would break it. That half needs a
setting of its own and belongs in its own change.

## Read in the code, not reproduced here

- The server starts on activation: `tlaplus.mcp.port` defaults to `0`, and
  `src/main.ts` creates the server for `0` or `1024`-`65535`. `-1` disables it.
- The filesystem tools (`read_file`, `write_file`, `list_directory`) are off
  unless `tlaplus.mcp.enableFilesystemTools` is set; the SANY and TLC tools are
  always on and act on files of the open workspace.
- `@modelcontextprotocol/sdk` is locked at `1.17.2` (package-lock.json).

## Not measured, and why

- The extension running inside VS Code, and a real MCP `tools/call`: these need
  the compiled extension and a JVM for `tla2tools.jar`. Asserting the listening
  socket's bind address through the extension's own activation (red as shipped,
  green with the change) belongs in the extension's test suite.
- Windows and macOS. Linux containers only.
- A second physical host. The non-loopback address used is the container's own
  bridge address, and what the rows establish is which destination addresses the listening socket accepts.

License: MIT.
