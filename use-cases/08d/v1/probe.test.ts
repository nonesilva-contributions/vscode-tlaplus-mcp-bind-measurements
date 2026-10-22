// This probe runs inside the real VS Code extension host, with folder/ of this use case open.
// runners/v1/vscode.sh applies the patch that measurements.gitconfig gives this use case
// version, copies this file into tests/suite/lm/ and runs it with PATCH_VERSION set to the
// version of that patch, such as v1.

import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { MCPServer } from '../../../src/lm/MCPServer';

const SETTING = 'tlaplus.mcp.host';
// The control, a second key in the same settings file. The run opens no editor, so the tab size
// changes nothing. inspect returns it from the folder only if VS Code read the settings of the folder.
const CONTROL = 'editor.tabSize';
const BAR = '============================================================';

// patch v1 declares tlaplus.mcp.host with scope machine, so the folder settings cannot set it.
const EXPECTED: Record<string, Record<string, string | string[]>> = {
    v1: {
        'use case 08d vscode.workspace.isTrusted': 'true',
        'use case 08d settings file of the opened folder holds': 'string "0.0.0.0"',
        // A single-folder window takes the settings of its folder as the workspace settings too.
        'use case 08d inspect editor.tabSize workspaceValue, workspaceFolderValue': 'number 3, number 3',
        // tlaplus.mcp.port has the scope window, so the settings of the folder can set it.
        'use case 08d inspect tlaplus.mcp.port workspaceValue, workspaceFolderValue': 'number -1, number -1',
        'use case 08d inspect defaultValue': 'string "localhost"',
        'use case 08d inspect globalValue': 'undefined',
        'use case 08d inspect workspaceValue': 'undefined',
        'use case 08d inspect workspaceFolderValue': 'undefined',
        'use case 08d get with no scope': 'string "localhost"',
        'use case 08d new MCPServer(0) binds': '127.0.0.1',
        'use case 08d update to "0.0.0.0" at Workspace': 'rejects',
        'use case 08d the update rejects with': 'Unable to write tlaplus.mcp.host to Workspace Settings. ' +
            'This setting can be written only into User settings.',
    },
};

interface Check {
    label: string;
    got: string;
    expected: string[];
}

function listening(server: http.Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once('listening', () => resolve());
        server.once('error', reject);
    });
}

function closed(server: http.Server): Promise<void> {
    return new Promise((resolve) => {
        server.once('close', () => resolve());
    });
}

function show(value: unknown): string {
    return value === undefined ? 'undefined' : `${typeof value} ${JSON.stringify(value)}`;
}

function version(pkg: string): string {
    const extension = vscode.extensions.getExtension('tlaplus.vscode-ide');
    assert.ok(extension, 'The extension under test should be loaded');
    const file = path.join(extension.extensionPath, 'node_modules', pkg, 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).version;
}

suite('MCP bind probe in the extension host', () => {
    test('use case 08d rows match the expected values', async function() {
        // A bound for the whole use case, not a wait.
        this.timeout(30000);
        const lines: string[] = [];
        const checks: Check[] = [];
        const out = (s: string) => {
            lines.push(s);
        };
        let expectedRows: Record<string, string | string[]> | undefined;
        const row = (label: string, got: string) => {
            const expected = expectedRows?.[label];
            if (expected === undefined) {
                throw new Error(`EXPECTED has no value for the row "${label}"`);
            }
            checks.push({ label, got, expected: Array.isArray(expected) ? expected : [expected] });
            out(`  -> ${label} -> ${got}\n`);
        };
        const ok = (c: Check) => c.expected.includes(c.got);
        let stage = 'the header';
        let reason = '';
        let finished = false;
        try {
            out(`${BAR}\n`);
            out(' TLA+ extension MCP server -- use case 08d, in the VS Code extension host\n');
            out(`${BAR}\n`);

            stage = 'the expected values';
            const patchVersion = process.env.PATCH_VERSION ?? '';
            expectedRows = EXPECTED[patchVersion];
            if (!expectedRows) {
                throw new Error(`PATCH_VERSION is "${patchVersion}", and EXPECTED has values only for ` +
                    `${Object.keys(EXPECTED).join(', ')}`);
            }

            stage = 'the environment';
            out('environment\n');
            out(`  VS Code ${vscode.version}, Electron ${process.versions.electron}, Node ${process.version}\n`);
            out(`  express ${version('express')}, @modelcontextprotocol/sdk ${version('@modelcontextprotocol/sdk')}\n`);

            out('\n## a host in the settings of an opened folder\n');

            stage = 'the opened folder';
            const folder = vscode.workspace.workspaceFolders?.[0];
            assert.ok(folder, 'runners/v1/vscode.sh should open folder/ of this use case');
            out(`  -> use case 08d opened folder -> ${folder.uri.fsPath}\n`);
            row('use case 08d vscode.workspace.isTrusted', String(vscode.workspace.isTrusted));
            const settingsFile = path.join(folder.uri.fsPath, '.vscode', 'settings.json');
            row('use case 08d settings file of the opened folder holds',
                show(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))[SETTING]));

            stage = 'the settings';
            const control = vscode.workspace.getConfiguration(undefined, folder.uri).inspect(CONTROL);
            row('use case 08d inspect editor.tabSize workspaceValue, workspaceFolderValue',
                `${show(control?.workspaceValue)}, ${show(control?.workspaceFolderValue)}`);
            const port = vscode.workspace.getConfiguration(undefined, folder.uri).inspect('tlaplus.mcp.port');
            row('use case 08d inspect tlaplus.mcp.port workspaceValue, workspaceFolderValue',
                `${show(port?.workspaceValue)}, ${show(port?.workspaceFolderValue)}`);
            // Scoped to the folder, so that workspaceFolderValue is read from the folder settings too.
            const inspected = vscode.workspace.getConfiguration(undefined, folder.uri).inspect(SETTING);
            row('use case 08d inspect defaultValue', show(inspected?.defaultValue));
            row('use case 08d inspect globalValue', show(inspected?.globalValue));
            row('use case 08d inspect workspaceValue', show(inspected?.workspaceValue));
            row('use case 08d inspect workspaceFolderValue', show(inspected?.workspaceFolderValue));
            // The constructor of MCPServer in patch v1 reads the setting this way.
            const configured = vscode.workspace.getConfiguration().get(SETTING);
            row('use case 08d get with no scope', show(configured));

            stage = 'the bind of MCPServer';
            // No host is given, so the server reads the setting, as it does when the extension starts.
            const mcp = new MCPServer(0);
            const httpServer = (mcp as unknown as { mcpServer?: http.Server }).mcpServer;
            try {
                assert.ok(httpServer, 'MCPServer should create its HTTP server');
                await listening(httpServer);
                row('use case 08d new MCPServer(0) binds', (httpServer.address() as AddressInfo).address);
            } finally {
                const closing = httpServer ? closed(httpServer) : Promise.resolve();
                mcp.dispose();
                await closing;
            }

            stage = 'the update at the workspace level';
            let update = 'writes';
            let rejection = 'no error';
            try {
                await vscode.workspace.getConfiguration()
                    .update(SETTING, '0.0.0.0', vscode.ConfigurationTarget.Workspace);
            } catch (error) {
                update = 'rejects';
                rejection = error instanceof Error ? error.message : String(error);
            }
            row('use case 08d update to "0.0.0.0" at Workspace', update);
            row('use case 08d the update rejects with', rejection);
            finished = true;
        } catch (error) {
            reason = error instanceof Error ? error.message : String(error);
            throw error;
        } finally {
            out(`\n${BAR}\n`);
            out(' SUMMARY, one line per row above\n');
            for (const c of checks) {
                const wanted = ok(c) ? '' : `, expected ${c.expected.join(' or ')}`;
                out(` ${ok(c) ? 'as expected' : 'MISMATCH   '}  ${c.label}: ${c.got}${wanted}\n`);
            }
            out(`${BAR}\n`);
            if (!finished) {
                out(`\nthe run stopped in ${stage}: ${reason}\nMISMATCH\n`);
            } else if (!checks.every(ok)) {
                out('\nMISMATCH\n');
            } else {
                out('\ndone\n');
            }
            // One write keeps the other logs of the host out of the block.
            process.stdout.write(lines.join(''));
        }
        assert.ok(checks.every(ok), 'At least one row of use case 08d does not match its expected value');
    });
});
