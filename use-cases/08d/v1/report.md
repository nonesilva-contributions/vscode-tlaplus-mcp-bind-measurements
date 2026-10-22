# Use case 08d/v1

## 08d.1 Purpose

This use case measures what VS Code does with a host in the settings of a
folder. Its code fix answers this review:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#discussion_r4309260075>,
"Could the setting description say where the value has to go?" Read in
`package.json` at commit `6d1dcfc`: line 614 is the description of
`tlaplus.mcp.host`. The review is a comment on that line. It gives the reason:
"Because `tlaplus.mcp.host` has `machine` scope, VS Code drops it from
workspace settings while parsing them." It adds: "A value in
`.vscode/settings.json` is silently ignored, and `inspect()` doesn't report it
either."

The case of the review is TLAiBench. The review says that its workflow passes
settings through the `.vscode/settings.json` of the workspace, as it does for
`tlaplus.mcp.port`:
<https://github.com/tlaplus/TLAiBench/blob/main/.github/workflows/main.yml>.
So a host set there "would leave the server on `localhost` with no hint as to
why".

The goal has two parts. First, a value in the settings of a folder must not
change the bind address. Second, the description must say where the value has
to go.

The scope `machine` is the choice of the author, not of a review. Read in
`package.json` at commit `1d29675`: the setting has the scope `machine`. Read
in the message of that commit: the author chose it, so that "opening a
workspace cannot open the port". That commit cites one review, which asks for a
preference and for `localhost`, not for a scope:
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>.

## 08d.2 Setup

Read in `package.json` at commit `c869f2a`: the shipped code has no host
setting. So this use case runs patch v1, applied on commit `c869f2a`.
`runners/v1/vscode.sh` runs `probe.test.ts` as a test in the extension host of
VS Code, in a Docker container on Linux. The header of the output gives VS Code
`1.143.0`, Electron `43.7.7` and Node `v24.21.0`, the Node of the extension
host. Read in `runners/v1/INSTALL.md`: the run takes the stable release of VS
Code on the day of the run.

Read in `runners/v1/vscode.sh`: the run opens a copy of `folder/` as the only
folder of the window. It opens no workspace file. The only file of the folder
is `.vscode/settings.json`:

```json
{
    "tlaplus.mcp.host": "0.0.0.0",
    "tlaplus.mcp.port": -1,
    "editor.tabSize": 3
}
```

The two other keys are controls: they show whether VS Code read the file.
`editor.tabSize` is a setting of VS Code. The probe opens no file in an editor,
so the tab size changes nothing. `tlaplus.mcp.port` is a setting of the
extension. Read in `package.json` at commit `c869f2a`, kept by patch v1: it has
the scope `window`. Read in patch v1: `tlaplus.mcp.host` has the scope
`machine`.

The folder has no `.tla` file. Read in `package.json` at commit `c869f2a`: the
extension lists one activation event, `workspaceContains:**/*.tla`. So the
folder does not start the extension. The folder also sets `tlaplus.mcp.port` to
`-1`. Read in `src/main.ts` at commit `c869f2a`, lines 278-282, kept by patch
v1: for `-1`, the extension starts no server. It starts a server only for the
port `0`, or a port from `1024` to `65535`. For these two reasons, the only
server of the run is the one of the probe.

The probe reads the file of the folder as JSON, before the `update`. It calls
`inspect` with the folder as the scope, so it gets `workspaceFolderValue` too.
It calls `get` with no scope. Then it calls `new MCPServer(0)`, with the port
`0` and no host. So the port of the folder does not reach this server. Read in
patch v1, in `src/lm/MCPServer.ts`: with no host, the constructor reads the
setting itself, with
`vscode.workspace.getConfiguration().get('tlaplus.mcp.host')`. Read in
`src/main.ts` at commit `c869f2a`, which patch v1 keeps: the extension also
calls `new MCPServer(mcpPort)` with no host. Last, the probe calls `update` to
write `"0.0.0.0"` at the workspace level, `ConfigurationTarget.Workspace`.

## 08d.3 Results

| # | Step | Result |
|---|------|--------|
| 08d | `vscode.workspace.isTrusted` | `true` |
| 08d | `tlaplus.mcp.host` in the file of the folder, read before the `update` | `string "0.0.0.0"` |
| 08d | `inspect` of the control `editor.tabSize`: `workspaceValue`, `workspaceFolderValue` | `number 3, number 3` |
| 08d | `inspect` of the control `tlaplus.mcp.port`: `workspaceValue`, `workspaceFolderValue` | `number -1, number -1` |
| 08d | `inspect` of `tlaplus.mcp.host`: `defaultValue` | `string "localhost"` |
| 08d | `inspect` of `tlaplus.mcp.host`: `globalValue` | `undefined` |
| 08d | `inspect` of `tlaplus.mcp.host`: `workspaceValue` | `undefined` |
| 08d | `inspect` of `tlaplus.mcp.host`: `workspaceFolderValue` | `undefined` |
| 08d | `get` of `tlaplus.mcp.host`, with no scope | `string "localhost"` |
| 08d | `new MCPServer(0)` binds | `127.0.0.1` |
| 08d | `update` of `tlaplus.mcp.host` to `"0.0.0.0"` at the workspace level | `rejects` |
| 08d | the error of the `update` | `Unable to write tlaplus.mcp.host to Workspace Settings. This setting can be written only into User settings.` |

VS Code read the file of the folder: `inspect` gives both controls from it.
The window has one folder and no workspace file. So the workspace level and the
folder level read that one file, and each control shows its value twice. Only
`tlaplus.mcp.host` did not apply. `inspect` gives it no value at the user,
workspace or folder level. `get` gives the default, `"localhost"`, and the
server binds `127.0.0.1`, on loopback.

`inspect` and `get` do not report the value of the file, and they give no
error. Only the `update` through the API fails, with an error.

Result details:

- [`results/vscode/v1.txt`](results/vscode/v1.txt)

## 08d.4 Becomes a test and needs a code fix

Needs a code fix: yes. The host in the file of the folder did not apply. This
is the case of the review: the server stays on `localhost`, with no hint from
`inspect` or `get`. Read in patch v1, in `src/lm/MCPServer.ts`: the log line
says which address the server bound. `inspect` and `get` do not report the
value of the file. A warning would have to read `.vscode/settings.json` itself,
and patch v1 does not. So the description says where the value has to go.

Read in `package.json` at commit `6d1dcfc`: the description said "Only user or
remote settings can change this value." It did not name
`.vscode/settings.json`. Read in patch v1: the new `markdownDescription` of
`tlaplus.mcp.host` names two places. One is "the user settings of a local
window", and the other is "the remote settings of a remote window". It also
says: "VS Code ignores a value in the settings of a workspace or folder, such
as `.vscode/settings.json`". Patch v1 keeps the scope `machine`. With it, the
folder of this run did not change the bind address.

Becomes a test: yes. Each reviewer request gets a test that fails when the
request is broken. The settings API gives no sign that the host did not apply.
So if the description lost this text, the settings API would not show it. Read
in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `Only user or remote settings can set the host` checks the scope `machine`.
  It also checks that the `markdownDescription` holds this whole sentence:
  "Set it in the user settings of a local window, or in the remote settings of
  a remote window: VS Code ignores a value in the settings of a workspace or
  folder, such as `.vscode/settings.json`." So a description that said "Do not
  set it in the user settings" would fail it. It fences "say where the value
  has to go".

Read in `tests/suite/lm/mcpServer.test.ts` at commit `6d1dcfc`: the test of the
same name checked only the scope and the default. So no test checked the
description.

The check of the scope fences the first part of the goal: a folder must not
change the bind address. The review gives the cause: "Because
`tlaplus.mcp.host` has `machine` scope, VS Code drops it from workspace
settings while parsing them." The rows agree: `inspect` gives the folder value
of the port, of scope `window`, and no folder value of the host.

The rows of `defaultValue`, `get` and the bind show that the default applies.
They need no test here. Two tests fence "change to `localhost`" of
<https://github.com/tlaplus/vscode-tlaplus/pull/544#pullrequestreview-5550237271>.
Read in patch v1, in `tests/suite/lm/mcpServer.test.ts`:

- `The host setting defaults to localhost` checks only the default in
  `package.json`.
- `The HTTP server binds the name localhost by default` checks the bind.
  Where loopback has IPv4, the bind must get the name `localhost`, not
  `127.0.0.1`.

The row of the file and the control rows need no test and no code fix. They
show only that the file holds the host and that VS Code read the file. A folder
can set the port, but not the host, so it cannot move the bind off loopback.
The review says that TLAiBench sets the port this way. No review asks to change
the port. Read in patch v1: the port setting does not change.

The rows of `isTrusted` and of the `update` need no test and no code fix.
`isTrusted` only records the state of the window. VS Code refuses the `update`
by itself, with an error.

## 08d.5 Not measured

A host in the user settings: the run writes none there, and `globalValue` is
`undefined`.

Whether the editor of `.vscode/settings.json` marks the value of the host: the
probe opens no file in an editor.

Workspace Trust: the row of `isTrusted` gives `true`, but the run did not
record whether trust was on. So Restricted Mode, the mode of a folder that is
not trusted, is not measured.

The workflow of TLAiBench, `main.yml`, was not read: what it does comes from
the review.

Whether VS Code started the extension for another reason: the run did not
record it.

The extension host on macOS and on Windows: the run uses a Linux container.

A workspace of several folders, opened from a `.code-workspace` file, with the
host in that file or in a folder. The run opens one folder.

A remote window, such as over Remote-SSH, with the host in its remote settings
or in its folder. The run opens a local window, so the remote settings that the
description gives are not measured.
