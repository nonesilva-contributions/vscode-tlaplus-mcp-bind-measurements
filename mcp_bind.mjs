// Reproduces the listen call and the transport options of the startServer
// method of src/lm/MCPServer.ts at commit c869f2a. The tool and resource
// registration of the real getServer is left out; see README.md.

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const INIT = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'measure', version: '0' } }
});

const checks = [];

function record(label, got, expected) {
    checks.push({ label, got, expected, ok: got === expected });
    return got;
}

function nonLoopbackIPv4() {
    for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
            if (a.family === 'IPv4' && !a.internal) {
                return a.address;
            }
        }
    }
    return null;
}

function version(pkg) {
    const path = new URL(`./node_modules/${pkg}/package.json`, import.meta.url);
    return JSON.parse(fs.readFileSync(path, 'utf8')).version;
}

// MCPServer.ts routes: POST /mcp with no auth and no Host or Origin check
// beyond the transport options, GET and DELETE answering 405.
// transportOptions is late-bound for the allowed hosts of case 3.
function makeApp(transportOptions) {
    const app = express();
    app.use(express.json());
    const methodNotAllowed = (req, res) => res.status(405).json({
        jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null
    });
    app.post('/mcp', async (req, res) => {
        try {
            const server = new McpServer(
                { name: 'TLA+ MCP Tools', version: '1.0.0' },
                { capabilities: { resources: {}, logging: {} } }
            );
            const transport = new StreamableHTTPServerTransport(transportOptions());
            res.on('close', () => { transport.close(); server.close().catch(() => {}); });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            if (!res.headersSent) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null });
            }
        }
    });
    app.get('/mcp', methodNotAllowed);
    app.delete('/mcp', methodNotAllowed);
    return app;
}

// Sends one request and resolves on the response headers or the socket error.
// The 800 ms timeout is a bound, not a wait.
function send(host, port, { method = 'POST', hostHeader, origin, preflight } = {}) {
    return new Promise((resolve) => {
        const headers = { Accept: 'application/json, text/event-stream' };
        if (method === 'POST') {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(INIT);
        }
        if (hostHeader) {
            headers.Host = hostHeader;
        }
        if (origin) {
            headers.Origin = origin;
        }
        if (preflight) {
            headers['Access-Control-Request-Method'] = 'POST';
            headers['Access-Control-Request-Headers'] = 'content-type';
        }
        const req = http.request({ host, port, path: '/mcp', method, headers }, (res) => {
            resolve({ status: res.statusCode, allowOrigin: res.headers['access-control-allow-origin'] });
            res.destroy();
        });
        req.on('error', (e) => resolve({ error: e.code || String(e) }));
        req.setTimeout(800, () => req.destroy(new Error('no answer in 800 ms')));
        if (method === 'POST') {
            req.end(INIT);
        } else {
            req.end();
        }
    });
}

function show(r) {
    if (r.error) {
        return r.error;
    }
    return `HTTP ${r.status}`;
}

async function probe(label, expected, host, port, opts) {
    const answer = await send(host, port, opts);
    record(label, show(answer), expected);
    return answer;
}

function listen(app, host) {
    return new Promise((resolve) => {
        const srv = host ? app.listen(0, host, () => resolve(srv)) : app.listen(0, () => resolve(srv));
    });
}

const out = (s) => process.stdout.write(s);

async function main() {
    if (!fs.existsSync('/.dockerenv')) {
        process.stderr.write('refusing to run outside a container: case 1 binds every interface\n');
        process.exitCode = 2;
        return;
    }
    const eth = nonLoopbackIPv4();
    if (!eth || eth.startsWith('127.')) {
        process.stderr.write('no non-loopback IPv4 address found; run this on the bridge network\n');
        process.exitCode = 2;
        return;
    }
    out('============================================================\n');
    out(' TLA+ extension MCP server -- bind and DNS-rebinding exposure\n');
    out('============================================================\n');
    out('environment\n');
    out(`  Node ${process.version}\n`);
    out(`  express ${version('express')}, @modelcontextprotocol/sdk ${version('@modelcontextprotocol/sdk')}\n`);
    out('  non-loopback IPv4: <bridge-ip>\n');

    out('\n## 1. shipped: transport {sessionIdGenerator: undefined}, app.listen(port) with no host\n');
    let app = makeApp(() => ({ sessionIdGenerator: undefined }));
    let srv = await listen(app, undefined);
    let { address, port, family } = srv.address();
    record('case 1 binds the unspecified address', address, '::');
    out(`  -> bind ${address}:<port-1> (${family})\n`);
    let answer = await probe('case 1 answers a request from the network', 'HTTP 200', eth, port);
    out(`  -> POST initialize from non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('case 1 answers a foreign Host and Origin', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: 'attacker.example', origin: 'http://attacker.example' });
    out(`  -> POST initialize Host and Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('case 1 answers on IPv6 loopback', 'HTTP 200', '::1', port);
    out(`  -> POST initialize to IPv6 loopback ::1 -> ${show(answer)}\n`);
    answer = await probe('case 1 answers the browser preflight', 'HTTP 200', '127.0.0.1', port,
        { method: 'OPTIONS', origin: 'http://attacker.example', preflight: true });
    record('case 1 sends no Access-Control-Allow-Origin', answer.allowOrigin ?? 'absent', 'absent');
    out(`  -> OPTIONS preflight with Origin attacker.example -> ${show(answer)}, `);
    out(`Access-Control-Allow-Origin: ${answer.allowOrigin ?? 'absent'}\n`);
    await new Promise((r) => srv.close(r));

    out('\n## 2. this PR: app.listen(port, "127.0.0.1"), transport unchanged\n');
    app = makeApp(() => ({ sessionIdGenerator: undefined }));
    srv = await listen(app, '127.0.0.1');
    ({ address, port, family } = srv.address());
    record('case 2 binds IPv4 loopback', address, '127.0.0.1');
    out(`  -> bind ${address}:<port-2> (${family})\n`);
    answer = await probe('case 2 refuses a request from the network', 'ECONNREFUSED', eth, port);
    out(`  -> POST initialize from non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('case 2 still answers a foreign Host from loopback', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: 'attacker.example', origin: 'http://attacker.example' });
    out(`  -> POST initialize Host and Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('case 2 refuses IPv6 loopback', 'ECONNREFUSED', '::1', port);
    out(`  -> POST initialize to IPv6 loopback ::1 -> ${show(answer)}\n`);
    await new Promise((r) => srv.close(r));

    out('\n## 3. follow-up, not in this PR: the same bind plus {enableDnsRebindingProtection: true, allowedHosts, allowedOrigins: []}\n');
    let boundPort = 0;
    app = makeApp(() => {
        if (!boundPort) {
            throw new Error('allowed hosts built before listen');
        }
        return {
            sessionIdGenerator: undefined,
            enableDnsRebindingProtection: true,
            allowedHosts: [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`],
            allowedOrigins: []
        };
    });
    srv = await listen(app, '127.0.0.1');
    ({ address, port, family } = srv.address());
    boundPort = port;
    out(`  -> bind ${address}:<port-3> (${family})\n`);
    answer = await probe('case 3 refuses a request from the network', 'ECONNREFUSED', eth, port);
    out(`  -> POST initialize from non-loopback <bridge-ip> -> ${show(answer)}\n`);
    answer = await probe('case 3 refuses a foreign Host with no Origin', 'HTTP 403', '127.0.0.1', port,
        { hostHeader: 'attacker.example' });
    out(`  -> POST initialize Host attacker.example, no Origin -> ${show(answer)}\n`);
    answer = await probe('case 3 ignores Origin when the allowlist is empty', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: `127.0.0.1:${port}`, origin: 'http://attacker.example' });
    out(`  -> POST initialize Host 127.0.0.1:<port-3>, Origin attacker.example -> ${show(answer)}\n`);
    answer = await probe('case 3 serves the name the extension advertises', 'HTTP 200', '127.0.0.1', port,
        { hostHeader: `localhost:${port}` });
    out(`  -> POST initialize Host localhost:<port-3> -> ${show(answer)}\n`);
    await new Promise((r) => srv.close(r));

    out('\n============================================================\n');
    out(' SUMMARY, one line per row above\n');
    for (const c of checks) {
        out(` ${c.ok ? 'as expected' : 'MISMATCH   '}  ${c.label}: ${c.got}\n`);
    }
    out('============================================================\n');
    if (checks.some((c) => !c.ok)) {
        process.exitCode = 1;
        out('\nat least one row did not match what the README states\n');
        return;
    }
    out('\ndone\n');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
