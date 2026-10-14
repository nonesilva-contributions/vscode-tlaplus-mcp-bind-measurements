// Reproduces src/lm/MCPServer.ts startServer, lines 228-312 at commit 6026007.
// Case 1 is as shipped, case 2 the loopback bind this PR proposes, case 3 the
// follow-up that adds DNS-rebinding protection. See README.md.

import os from 'node:os';
import http from 'node:http';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const INIT = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'measure', version: '0' } }
});

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

// MCPServer.ts POST /mcp handler: no auth, no Host/Origin check beyond the
// transport options. transportOptions() is late-bound for case 3's allowedHosts.
function makeApp(transportOptions) {
    const app = express();
    app.use(express.json());
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
    return app;
}

// POST /mcp initialize; resolves on response headers or the socket error. The
// 800 ms timeout is a bound, not a wait.
function post(host, port, { hostHeader, origin } = {}) {
    return new Promise((resolve) => {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Content-Length': Buffer.byteLength(INIT)
        };
        if (hostHeader) {
            headers['Host'] = hostHeader;
        }
        if (origin) {
            headers['Origin'] = origin;
        }
        const req = http.request({ host, port, path: '/mcp', method: 'POST', headers }, (res) => {
            resolve({ status: res.statusCode });
            res.destroy();
        });
        req.on('error', (e) => resolve({ error: e.code || String(e) }));
        req.setTimeout(800, () => req.destroy(new Error('ETIMEDOUT')));
        req.end(INIT);
    });
}

function listen(app, host) {
    return new Promise((resolve) => {
        const srv = host ? app.listen(0, host, () => resolve(srv)) : app.listen(0, () => resolve(srv));
    });
}

function show(r) {
    return r.error ? r.error : `HTTP ${r.status}`;
}

async function main() {
    const eth = nonLoopbackIPv4();
    if (!eth || eth.startsWith('127.')) {
        process.stderr.write('no non-loopback IPv4 address found; run this in a container on the bridge network\n');
        process.exit(2);
    }
    process.stdout.write('============================================================\n');
    process.stdout.write(' TLA+ extension MCP server -- bind and DNS-rebinding exposure\n');
    process.stdout.write('============================================================\n');
    process.stdout.write(`environment\n  Node ${process.version}\n  non-loopback IPv4: <bridge-ip>\n`);

    process.stdout.write('\n## 1. shipped (MCPServer.ts:228-312): transport {sessionIdGenerator: undefined}, app.listen(port) with no host\n');
    let app = makeApp(() => ({ sessionIdGenerator: undefined }));
    let srv = await listen(app, undefined);
    let { address, port, family } = srv.address();
    process.stdout.write(`  -> bind ${address}:<ephemeral> (${family})\n`);
    process.stdout.write(`  -> POST initialize from non-loopback <bridge-ip> -> ${show(await post(eth, port))}\n`);
    process.stdout.write(`  -> POST initialize Host/Origin attacker.example -> ${show(await post('127.0.0.1', port, { hostHeader: 'attacker.example', origin: 'http://attacker.example' }))}\n`);
    process.stdout.write(`  -> POST initialize to IPv6 loopback ::1 -> ${show(await post('::1', port))}\n`);
    await new Promise((r) => srv.close(r));

    process.stdout.write('\n## 2. this PR: app.listen(port, "127.0.0.1"), transport unchanged\n');
    app = makeApp(() => ({ sessionIdGenerator: undefined }));
    srv = await listen(app, '127.0.0.1');
    ({ address, port, family } = srv.address());
    process.stdout.write(`  -> bind ${address}:<ephemeral> (${family})\n`);
    process.stdout.write(`  -> connect from non-loopback <bridge-ip> -> ${show(await post(eth, port))}\n`);
    process.stdout.write(`  -> POST initialize Host/Origin attacker.example -> ${show(await post('127.0.0.1', port, { hostHeader: 'attacker.example', origin: 'http://attacker.example' }))}\n`);
    process.stdout.write(`  -> POST initialize to IPv6 loopback ::1 -> ${show(await post('::1', port))}\n`);
    await new Promise((r) => srv.close(r));

    process.stdout.write('\n## 3. follow-up, not in this PR: the same bind plus transport {enableDnsRebindingProtection: true, allowedHosts}\n');
    let boundPort = 0;
    app = makeApp(() => ({
        sessionIdGenerator: undefined,
        enableDnsRebindingProtection: true,
        allowedHosts: [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`],
        allowedOrigins: []
    }));
    srv = await listen(app, '127.0.0.1');
    ({ address, port, family } = srv.address());
    boundPort = port;
    process.stdout.write(`  -> bind ${address}:<ephemeral> (${family})\n`);
    process.stdout.write(`  -> connect from non-loopback <bridge-ip> -> ${show(await post(eth, port))}\n`);
    process.stdout.write(`  -> POST initialize Host/Origin attacker.example -> ${show(await post('127.0.0.1', port, { hostHeader: 'attacker.example', origin: 'http://attacker.example' }))}\n`);
    process.stdout.write(`  -> POST initialize Host 127.0.0.1:<ephemeral> -> ${show(await post('127.0.0.1', port, { hostHeader: `127.0.0.1:${port}` }))}\n`);
    process.stdout.write('  -> the 403 is the Host check; allowedOrigins is empty, so Origin is never checked\n');
    await new Promise((r) => srv.close(r));

    process.stdout.write('\n============================================================\n');
    process.stdout.write(' SUMMARY\n');
    process.stdout.write(' 1 SHIPPED:   binds every interface; an unauthenticated initialize\n');
    process.stdout.write('              from a non-loopback address answers 200, and so does\n');
    process.stdout.write('              a request carrying a foreign Host and Origin.\n');
    process.stdout.write(' 2 THIS PR:   binds loopback; the non-loopback address is refused,\n');
    process.stdout.write('              and so is IPv6 loopback, which answers today. A foreign\n');
    process.stdout.write('              Host/Origin from localhost still answers 200.\n');
    process.stdout.write(' 3 FOLLOW-UP: adding DNS-rebinding protection answers 403 to the\n');
    process.stdout.write('              foreign Host and 200 to the local client. Left out of\n');
    process.stdout.write('              this PR: a Host allowlist breaks tunnel and proxy use.\n');
    process.stdout.write('============================================================\n');
    process.stdout.write('\ndone\n');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
