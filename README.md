# vscode-tlaplus-mcp-bind-measurements

Measurements behind a proposed change to
[tlaplus/vscode-tlaplus](https://github.com/tlaplus/vscode-tlaplus): bind the
TLA+ extension's MCP server to loopback and enable DNS-rebinding protection.

`src/lm/MCPServer.ts` builds an Express app whose `POST /mcp` has no
authentication and no `Host`/`Origin` check, constructs the Streamable HTTP
transport with `{ sessionIdGenerator: undefined }` and nothing else, and calls
`app.listen(port)` with no host, so Node binds the unspecified address `::`
(dual-stack). While the server runs it is reachable from the network without
authentication. `tlaplus.mcp.port` defaults to `0`, which `src/main.ts` treats
as "listen on a free port", so the server starts on activation unless the port
is set to `-1`. Source at commit `6026007`:
<https://github.com/tlaplus/vscode-tlaplus/blob/60260075203e463a6cf55fad7fa3051d4c320f9d/src/lm/MCPServer.ts>.

This repository holds a small Node module that reproduces the listen and
transport options before and after the change and checks reachability from
inside the Node runtime, a runner that executes it in Docker's bridge network
so that no host firewall is involved, and the captured outputs per Node version.
Same class as
[elixir-ls-mcp-bind-measurements](https://github.com/nonesilva-contributions/elixir-ls-mcp-bind-measurements).

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
| 1 | shipped (`MCPServer.ts:228-312`): transport `{ sessionIdGenerator: undefined }`, `app.listen(port)` with no host | bind `:::P` (`::`, dual-stack); `initialize` from the non-loopback address: `HTTP 200`; with `Host`/`Origin` `attacker.example`: `HTTP 200` |
| 2 | the change: `app.listen(port, "127.0.0.1")` plus transport `{ enableDnsRebindingProtection: true, allowedHosts, allowedOrigins: [] }` | bind `127.0.0.1:P`; from the non-loopback address: `ECONNREFUSED`; `Host`/`Origin` `attacker.example`: `HTTP 403`; `Host` `127.0.0.1`: `HTTP 200` |

What the rows establish:

- Row 1: the server as shipped binds `::`, so it is reachable over IPv4 and IPv6
  from any interface; it answers an unauthenticated `initialize` from a
  non-loopback address; and it accepts a request carrying a foreign `Host` and
  `Origin`. It is reachable from the network without authentication and without
  DNS-rebinding protection.
- Row 2: binding to loopback refuses the non-loopback address; DNS-rebinding
  protection answers the foreign `Host`/`Origin` with `403`; and the legitimate
  local client (`Host: 127.0.0.1`) still gets `200`. Every observation in row 1
  flips, so the measurement separates the defect from its fix.

## Read in the code, not reproduced here

- The server starts on activation: `tlaplus.mcp.port` defaults to `0`, and
  `src/main.ts` creates the server for `0` or `1024`-`65535`. `-1` disables it.
- The filesystem tools (`read_file`, `write_file`, `list_directory`) are off
  unless `tlaplus.mcp.enableFilesystemTools` is set; the SANY and TLC tools are
  always on and act on files of the open workspace.
- `@modelcontextprotocol/sdk` is pinned to `1.17.2` (package-lock.json).

## Not measured, and why

- The extension running inside VS Code, and a real MCP `tools/call`: these need
  the compiled extension and a JVM for `tla2tools.jar`. Asserting the listening
  socket's bind address through the extension's own activation (red as shipped,
  green with the change) belongs in the extension's test suite.
- Windows and macOS. Linux containers only.
- A second physical host. The non-loopback address used is the container's own
  bridge address, which takes the same path a remote host would.

License: MIT.
