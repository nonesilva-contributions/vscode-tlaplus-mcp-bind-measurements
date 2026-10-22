// This probe runs inside the real VS Code extension host. runners/v1/vscode.sh applies
// the patch that measurements.gitconfig gives this use case version, copies this file into
// tests/suite/lm/ and runs it with PATCH_VERSION set to the version of that patch, such as v1.

import * as assert from 'assert';
import * as dns from 'dns';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import express from 'express';
import * as vscode from 'vscode';
import { MCPServer } from '../../../src/lm/MCPServer';

const SETTING = 'tlaplus.mcp.host';
const BAR = '============================================================';

// Runs with VS Code 1.142.0 and 1.143.0 measured these values. They are the expected values now.
// A later VS Code build can change them, and the row then says MISMATCH.
const EXPECTED: Record<string, Record<string, string | string[]>> = {
    v1: {
        'use case 08 get after update to 8080': 'number 8080',
        'use case 08 get after update to true': 'boolean true',
        'use case 08 get after update to {"a":1}': 'object {"a":1}',
        'use case 08 get after update to ["127.0.0.1"]': 'object ["127.0.0.1"]',
        'use case 08 get after update to ""': 'string ""',
        'use case 08 process.execArgv': '["--dns-result-order=ipv4first","--experimental-network-inspection","--expose-gc"]',
        'use case 08 dns.getDefaultResultOrder()': 'ipv4first',
        'use case 08 localhost resolves to': '127.0.0.1, ::1',
        'use case 08 app.listen(0, "localhost") binds': '127.0.0.1',
        // patch v1 reads the setting and takes a value that is not a non-empty string as localhost.
        'use case 08 with 8080 in the setting, new MCPServer(0) binds': '127.0.0.1',
    },
};

interface Check {
    label: string;
    got: string;
    expected: string[];
}

// Resolves on the first event that passes the test, then stops listening.
function nextEvent<T>(event: vscode.Event<T>, test: (e: T) => boolean): Promise<void> {
    return new Promise((resolve) => {
        const listener = event((e) => {
            if (test(e)) {
                listener.dispose();
                resolve();
            }
        });
    });
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

function version(pkg: string): string {
    const extension = vscode.extensions.getExtension('tlaplus.vscode-ide');
    assert.ok(extension, 'The extension under test should be loaded');
    const file = path.join(extension.extensionPath, 'node_modules', pkg, 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).version;
}

suite('MCP bind probe in the extension host', () => {
    test('use case 08 rows match the expected values', async function() {
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
            out(' TLA+ extension MCP server -- use case 08, in the VS Code extension host\n');
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

            out('\n## the real VS Code extension host: what get returns, what localhost binds, what the server binds with 8080 in the setting\n');

            stage = 'the values of the setting';
            // The setting is declared as a string. These values are not strings, except the last one.
            const values: unknown[] = [8080, true, { a: 1 }, ['127.0.0.1'], ''];
            try {
                for (const value of values) {
                    const label = `use case 08 get after update to ${JSON.stringify(value)}`;
                    // The change event tells that the extension host has the new value.
                    const changed = nextEvent(vscode.workspace.onDidChangeConfiguration,
                        (e) => e.affectsConfiguration(SETTING));
                    try {
                        await vscode.workspace.getConfiguration()
                            .update(SETTING, value, vscode.ConfigurationTarget.Global);
                    } catch (error) {
                        row(label, `update failed: ${error instanceof Error ? error.message : String(error)}`);
                        continue;
                    }
                    await changed;
                    const got = vscode.workspace.getConfiguration().get<string>(SETTING);
                    row(label, `${typeof got} ${JSON.stringify(got)}`);
                }
            } finally {
                await vscode.workspace.getConfiguration()
                    .update(SETTING, undefined, vscode.ConfigurationTarget.Global);
            }

            stage = 'the DNS order';
            row('use case 08 process.execArgv', JSON.stringify(process.execArgv));
            row('use case 08 dns.getDefaultResultOrder()', dns.getDefaultResultOrder());
            const names = await dns.promises.lookup('localhost', { all: true });
            row('use case 08 localhost resolves to', names.map((n) => n.address).join(', '));
            const app = express();
            const plain = await new Promise<http.Server>((resolve, reject) => {
                const s = app.listen(0, 'localhost', (error?: Error) => (error ? reject(error) : resolve(s)));
            });
            row('use case 08 app.listen(0, "localhost") binds', (plain.address() as AddressInfo).address);
            await new Promise<void>((resolve) => plain.close(() => resolve()));

            stage = 'the bind of MCPServer';
            // No host is given, so the server reads the setting, as it does when the extension starts.
            const written = nextEvent(vscode.workspace.onDidChangeConfiguration, (e) => e.affectsConfiguration(SETTING));
            await vscode.workspace.getConfiguration().update(SETTING, 8080, vscode.ConfigurationTarget.Global);
            await written;
            const mcp = new MCPServer(0);
            const httpServer = (mcp as unknown as { mcpServer?: http.Server }).mcpServer;
            try {
                assert.ok(httpServer, 'MCPServer should create its HTTP server');
                await listening(httpServer);
                row('use case 08 with 8080 in the setting, new MCPServer(0) binds',
                    (httpServer.address() as AddressInfo).address);
            } finally {
                const closing = httpServer ? closed(httpServer) : Promise.resolve();
                mcp.dispose();
                await closing;
                await vscode.workspace.getConfiguration().update(SETTING, undefined, vscode.ConfigurationTarget.Global);
            }
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
        assert.ok(checks.every(ok), 'At least one row of use case 08 does not match its expected value');
    });
});
