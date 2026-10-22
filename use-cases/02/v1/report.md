# Use case 02/v1

## 02.1 Purpose

The reviewer asked for the bind address in a VS Code setting, instead of a
fixed `127.0.0.1`. Then a user can bind the address of one interface, or
`0.0.0.0`:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4283168306>.
This use case checks what the fixed bind to `127.0.0.1` refuses, and what it
still answers.

## 02.2 Setup

Read in `src/lm/MCPServer.ts` at commit `1668ddc`, the first version of the
pull request: the server calls `app.listen(port, '127.0.0.1', ...)` on line
312. The request is a comment on that line. The shipped code at commit
`c869f2a` calls `app.listen(port)` with no host.

This use case runs a reproduction with that call and the port `0`. Read in
`lib/v1/server.mjs`: it keeps the options of the transport, `express.json()`
and the routes of commit `c869f2a`, and it leaves out the tools and resources
of the server. It runs in plain Node 20 and 22, on Linux and Windows.

The requests go to a non-loopback address of the machine, `<bridge-ip>`, to
`::1`, or to `127.0.0.1` with a foreign `Host` and `Origin`,
`attacker.example`. One non-loopback IPv4 address is tried. In every run,
loopback has `::1`.

`<bridge-ip>` stands for that non-loopback address. On Linux, it is the
address of the container on its own internal Docker network. On Windows, it is
the first non-loopback IPv4 address of the guest. The request goes from the
machine to its own address, so the rows show which addresses the socket
accepts, not what a firewall lets in.

## 02.3 Results

| # | Step | Result |
|---|------|--------|
| 02 | `app.listen(port, "127.0.0.1")` binds | `127.0.0.1` |
| 02 | a request to `<bridge-ip>`, from the same machine | `ECONNREFUSED` |
| 02 | a request to `::1` | `ECONNREFUSED` |
| 02 | a request to `127.0.0.1` with a foreign `Host` and `Origin` | `HTTP 200` |

The fixed bind refuses the other addresses that were tried, and it still
answers a foreign `Host` on `127.0.0.1`.

Result details:

- [`results/docker-debian-12/node-20.txt`](results/docker-debian-12/node-20.txt)
- [`results/docker-debian-12/node-22.txt`](results/docker-debian-12/node-22.txt)
- [`results/windows-11-24h2/node-20.txt`](results/windows-11-24h2/node-20.txt)
- [`results/windows-11-24h2/node-22.txt`](results/windows-11-24h2/node-22.txt)

## 02.4 Becomes a test and needs a code fix

Needs a code fix: yes. The fixed bind refuses a request to `<bridge-ip>`, and a
client on another machine has to dial such an address. So the host must come
from a setting, as the request asks. The case of the reviewer is a remote
machine that runs the server and TLC:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4285603003>.
Read in patch v1: `package.json` adds the setting `tlaplus.mcp.host`. The
server reads it when it starts, and binds it. A value outside loopback, such as
`0.0.0.0`, reaches `app.listen` unchanged.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The HTTP server binds the host of the setting` writes `::1` in the user
  settings and checks that the server binds it. It fences "configurable
  through a VS Code setting". It skips where loopback has no `::1`.
- `A host outside loopback is kept` checks that `bindHost` keeps `0.0.0.0` and
  the address of one interface. It fences "bind to a specific network interface
  or to `0.0.0.0`". It opens no port, so the test does not put a server on the
  network.

The row of `::1` comes from the fixed IPv4 bind. With the setting, the default
`localhost` binds one family, and the advertised URL names it. It needs no test
here.

The row of a foreign `Host` and `Origin` needs no test and no code fix in this
pull request: no reviewer asked for a `Host` or `Origin` check.

## 02.5 Not measured

A request from a second machine, and a bind to `0.0.0.0` or to the address of
one interface: the values that the reviewer named. Read in patch v1: such a
value reaches `app.listen` unchanged.

Remote development, where the extension host of a VS Code window runs on
another machine or in a container: Remote-SSH, a dev container, WSL and
Codespaces. Where the MCP clients of VS Code and Cursor connect from there. A
loopback bind answers a client only from the machine of the extension host.
Read in the code at commit `c869f2a`:

- `src/main.ts` starts the MCP server in the extension host, so the server
  runs on the machine of the extension host. `package.json` declares no
  `extensionKind`, the field that tells VS Code where to run an extension in a
  remote window: on the local machine, `ui`, or on the remote machine,
  `workspace`.
- No document of the project advertises remote use. `README.md` never
  mentions MCP, and the description of `tlaplus.mcp.port` in `package.json`
  only promised a port.
- A comment in `src/lm/MCPServer.ts` does consider a client on another host:
  the filesystem tools exist because a client that runs on another host could
  not create files on the host where SANY, the parser of the TLA+ tools, and
  TLC, the model checker, run.

WSL 2 in its default network mode, NAT, short for network address translation:
the Linux distribution has its own address on a virtual network behind the
Windows host. There a client inside the distribution reaches the extension on
the Windows host over a non-loopback address.

A tunnel in front of the port, a service that forwards connections from a
public address to the port: whether its client, which runs on the machine of
the server, reaches a loopback bind.

A container that publishes this port with `docker run -p`: whether the
published port reaches a loopback bind inside the container.

The port of the TLC debugger, which the JVM opens when TLC gets `-debugger`.
Read in the code at commit `c869f2a`: the extension passes `-debugger` only
from its debug commands, `tlaplus.debugger.run`, `tlaplus.debugger.customRun`,
`tlaplus.debugger.smoke` and `tlaplus.debugger.loadTrace`, which `src/main.ts`
registers and `src/debugger/debugging.ts` runs. The options of the setting
`tlaplus.tlc.modelChecker.options`, and the `extraOpts` that a client gives
the TLC tools of the MCP server, also reach TLC in `src/tla2tools.ts`, so they
can add `-debugger` too. The class `tlc2.debug.AttachingDebugger` in
`tla2tools.jar` has no host parameter, so the extension cannot bind it to
loopback.
